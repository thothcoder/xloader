/**
 * X GraphQL API client.
 *
 * Handles UserByScreenName resolution and UserMedia pagination
 * with rate limit detection and doc_id re-discovery on 400/403.
 */

import type { MediaItem, PaginationResult, UserProfile, UserResult } from "../types";
import { buildHeaders } from "./auth";
import { discoverDocIds, invalidateDocIds } from "./discovery";
import { parseTimelineResponse, parseUserResponse } from "./parser";

const GRAPHQL_BASE = "https://x.com/i/api/graphql";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

/** Rate limit state exposed to UI */
export interface RateLimitInfo {
  limited: boolean;
  retryAfterMs: number;
  remaining: number;
}

let rateLimitState: RateLimitInfo = {
  limited: false,
  retryAfterMs: 0,
  remaining: Infinity,
};

let abortController: AbortController | null = null;

export function getRateLimitState(): RateLimitInfo {
  return { ...rateLimitState };
}

function updateRateLimit(headers: Headers): void {
  const remaining = headers.get("x-rate-limit-remaining");
  const reset = headers.get("x-rate-limit-reset");

  if (remaining !== null) {
    rateLimitState.remaining = parseInt(remaining, 10);
  }
  if (reset !== null) {
    const resetMs = parseInt(reset, 10) * 1000;
    rateLimitState.retryAfterMs = Math.max(0, resetMs - Date.now());
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function graphqlFetch(
  queryId: string,
  operationName: string,
  variables: Record<string, unknown>,
  features: Record<string, boolean>,
  signal?: AbortSignal,
): Promise<Response> {
  const headers = await buildHeaders();
  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(features),
  });

  const url = `${GRAPHQL_BASE}/${queryId}/${operationName}?${params}`;
  return fetch(url, { headers, signal, credentials: "include" });
}

/** Standard features object for GraphQL calls */
const FEATURES = {
  rweb_tipjar_consumption_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  rweb_video_timestamps_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_enhance_cards_enabled: false,
};

/**
 * Resolve a screen name to a UserProfile via UserByScreenName.
 */
export async function resolveUser(screenName: string): Promise<UserResult> {
  const docIds = await discoverDocIds();
  const variables = {
    screen_name: screenName,
    withSafetyModeUserFields: true,
  };

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const resp = await graphqlFetch(
        docIds.UserByScreenName,
        "UserByScreenName",
        variables,
        FEATURES,
      );

      if (resp.status === 429) {
        updateRateLimit(resp.headers);
        rateLimitState.limited = true;
        const waitMs = Math.min(30000 * 2 ** attempt, 120000);
        await sleep(waitMs);
        continue;
      }

      if (resp.status === 400 || resp.status === 403) {
        // doc_id may have rotated
        await invalidateDocIds();
        const newDocIds = await discoverDocIds();
        const retryResp = await graphqlFetch(
          newDocIds.UserByScreenName,
          "UserByScreenName",
          variables,
          FEATURES,
        );
        if (!retryResp.ok) {
          return { ok: false, error: "not_found" };
        }
        const retryData = await retryResp.json();
        const retryUser = parseUserResponse(retryData);
        if (!retryUser) return { ok: false, error: "not_found" };
        return { ok: true, user: retryUser };
      }

      if (!resp.ok) {
        return { ok: false, error: "network" };
      }

      const data = await resp.json();

      // Check for suspension/unavailable
      const userResult = data?.data?.user?.result;
      if (userResult?.__typename === "UserUnavailable") {
        const reason = userResult.reason ?? "";
        if (reason.toLowerCase().includes("suspend")) {
          return { ok: false, error: "suspended" };
        }
        return { ok: false, error: "not_found" };
      }

      const user = parseUserResponse(data);
      if (!user) return { ok: false, error: "not_found" };

      if (user.isProtected) {
        return { ok: false, error: "protected" };
      }

      return { ok: true, user };
    } catch (e) {
      if (attempt === MAX_RETRIES - 1) {
        return { ok: false, error: "network" };
      }
      await sleep(RETRY_DELAY_MS);
    }
  }

  return { ok: false, error: "network" };
}

/** Callback for progress updates during pagination */
export type PaginationCallback = (items: MediaItem[], total: number) => void;

/**
 * Paginate through a user's media timeline.
 * Calls onPage with each batch of items as they arrive.
 */
export async function paginateMedia(
  restId: string,
  onPage: PaginationCallback,
): Promise<MediaItem[]> {
  const docIds = await discoverDocIds();
  const allItems: MediaItem[] = [];
  const seenIds = new Set<string>();
  let cursor: string | null = null;

  abortController = new AbortController();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (abortController.signal.aborted) break;

    const variables: Record<string, unknown> = {
      userId: restId,
      count: 20,
      includePromotedContent: false,
      withClientEventToken: false,
      withBirdwatchNotes: false,
      withVoice: true,
      withV2Timeline: true,
    };
    if (cursor) {
      variables.cursor = cursor;
    }

    let result: PaginationResult | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const resp = await graphqlFetch(
          docIds.UserMedia,
          "UserMedia",
          variables,
          FEATURES,
          abortController.signal,
        );

        updateRateLimit(resp.headers);

        if (resp.status === 429) {
          rateLimitState.limited = true;
          const waitMs = Math.min(30000 * 2 ** attempt, 120000);
          await sleep(waitMs);
          rateLimitState.limited = false;
          continue;
        }

        if (resp.status === 400 || resp.status === 403) {
          await invalidateDocIds();
          const newDocIds = await discoverDocIds();
          const retryResp = await graphqlFetch(
            newDocIds.UserMedia,
            "UserMedia",
            variables,
            FEATURES,
            abortController.signal,
          );
          if (retryResp.ok) {
            const retryData = await retryResp.json();
            result = parseTimelineResponse(retryData);
          }
          break;
        }

        if (!resp.ok) break;

        const data = await resp.json();
        result = parseTimelineResponse(data);
        break;
      } catch (e) {
        if ((e as Error).name === "AbortError") return allItems;
        if (attempt === MAX_RETRIES - 1) break;
        await sleep(RETRY_DELAY_MS);
      }
    }

    if (!result || result.items.length === 0) break;

    // Deduplicate: overlapping pages can return the same tweet
    const newItems = result.items.filter((item) => {
      const key = `${item.tweetId}_${item.index}`;
      if (seenIds.has(key)) return false;
      seenIds.add(key);
      return true;
    });

    if (newItems.length === 0) break;

    allItems.push(...newItems);
    onPage(newItems, allItems.length);

    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }

  abortController = null;
  return allItems;
}

/** Cancel any in-progress pagination */
export function cancelPagination(): void {
  abortController?.abort();
  abortController = null;
}
