/**
 * Parse X's GraphQL timeline responses into MediaItem arrays.
 *
 * X's responses are deeply nested:
 *   data.user.result.timeline_v2.timeline.instructions[]
 *     -> TimelineAddEntries -> entries[]
 *       -> content.itemContent.tweet_results.result
 *         -> (possibly TweetWithVisibilityResults wrapper)
 *           -> legacy.extended_entities.media[]
 *
 * Reference: gallery-dl's _extract_timeline_tweet
 */

import type { MediaItem, MediaType, PaginationResult } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/** Extract the best video variant (highest bitrate MP4) */
function extractBestVideoUrl(
  variants: Any[],
): { url: string; bitrate: number } | null {
  const mp4s = variants.filter(
    (v: Any) => v.content_type === "video/mp4" && v.url,
  );
  if (mp4s.length === 0) return null;

  mp4s.sort((a: Any, b: Any) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
  return { url: mp4s[0].url, bitrate: mp4s[0].bitrate ?? 0 };
}

/** Build thumbnail URL from media_url_https */
function thumbnailUrl(mediaUrl: string): string {
  // X CDN format: append ?format=jpg&name=small for thumbnails
  if (mediaUrl.includes("?")) return mediaUrl;
  return `${mediaUrl}?format=jpg&name=small`;
}

/** Build orig-quality URL */
function origUrl(mediaUrl: string): string {
  if (mediaUrl.includes("?")) return mediaUrl;
  return `${mediaUrl}?format=jpg&name=orig`;
}

/** Unwrap TweetWithVisibilityResults and similar wrappers */
function unwrapTweet(tweetResult: Any): Any | null {
  if (!tweetResult) return null;

  // Direct tweet result
  if (tweetResult.__typename === "Tweet") return tweetResult;

  // TweetWithVisibilityResults wrapper
  if (tweetResult.__typename === "TweetWithVisibilityResults") {
    return tweetResult.tweet ?? null;
  }

  // Sometimes result is nested under .result
  if (tweetResult.result) {
    return unwrapTweet(tweetResult.result);
  }

  // Fallback: if it has legacy field, it's probably a tweet
  if (tweetResult.legacy) return tweetResult;

  return null;
}

/** Extract media items from a single tweet */
function extractMediaFromTweet(
  tweet: Any,
): MediaItem[] {
  if (!tweet?.legacy) return [];

  const tweetId: string = tweet.rest_id ?? tweet.legacy.id_str ?? "";
  const createdAt: string = tweet.legacy.created_at ?? "";
  const media: Any[] =
    tweet.legacy.extended_entities?.media ?? tweet.legacy.entities?.media ?? [];

  const items: MediaItem[] = [];

  for (let i = 0; i < media.length; i++) {
    const m = media[i];
    const type: MediaType =
      m.type === "video"
        ? "video"
        : m.type === "animated_gif"
          ? "animated_gif"
          : "photo";

    let mediaUrl: string;
    let bitrate: number | undefined;
    let durationMs: number | undefined;

    if (type === "video" || type === "animated_gif") {
      const best = extractBestVideoUrl(
        m.video_info?.variants ?? [],
      );
      if (!best) continue; // skip if no MP4 variant
      mediaUrl = best.url;
      bitrate = best.bitrate;
      durationMs = m.video_info?.duration_millis;
    } else {
      mediaUrl = origUrl(m.media_url_https ?? "");
    }

    items.push({
      tweetId,
      mediaUrl,
      thumbnailUrl: thumbnailUrl(m.media_url_https ?? ""),
      type,
      width: m.original_info?.width ?? m.sizes?.large?.w ?? 0,
      height: m.original_info?.height ?? m.sizes?.large?.h ?? 0,
      durationMs,
      bitrate,
      createdAt,
      index: i,
    });
  }

  return items;
}

/**
 * Parse a full UserMedia timeline response.
 * Returns extracted media items and the cursor for the next page.
 */
export function parseTimelineResponse(data: Any): PaginationResult {
  const items: MediaItem[] = [];
  let nextCursor: string | null = null;

  // Navigate to timeline instructions
  const timeline =
    data?.data?.user?.result?.timeline_v2?.timeline ??
    data?.data?.user?.result?.timeline?.timeline;

  if (!timeline) {
    return { items: [], nextCursor: null, total: 0 };
  }

  const instructions: Any[] = timeline.instructions ?? [];

  for (const instruction of instructions) {
    // TimelineAddEntries contains the actual tweets
    if (
      instruction.type === "TimelineAddEntries" ||
      instruction.__typename === "TimelineAddEntries"
    ) {
      const entries: Any[] = instruction.entries ?? [];

      for (const entry of entries) {
        const entryId: string = entry.entryId ?? "";

        // Cursor entries for pagination
        if (entryId.startsWith("cursor-bottom-")) {
          nextCursor = entry.content?.value ?? null;
          continue;
        }
        if (entryId.startsWith("cursor-top-")) {
          continue;
        }

        // Tweet entries
        const itemContent = entry.content?.itemContent;
        if (!itemContent) continue;

        const tweetResults = itemContent.tweet_results;
        if (!tweetResults) continue;

        const tweet = unwrapTweet(tweetResults.result);
        if (!tweet) continue;

        items.push(...extractMediaFromTweet(tweet));
      }
    }

    // TimelineAddToModule (sometimes used for media tabs)
    if (
      instruction.type === "TimelineAddToModule" ||
      instruction.__typename === "TimelineAddToModule"
    ) {
      const moduleItems: Any[] = instruction.moduleItems ?? [];
      for (const moduleItem of moduleItems) {
        const itemContent = moduleItem.item?.itemContent;
        if (!itemContent?.tweet_results) continue;

        const tweet = unwrapTweet(itemContent.tweet_results.result);
        if (!tweet) continue;

        items.push(...extractMediaFromTweet(tweet));
      }
    }
  }

  return { items, nextCursor, total: items.length };
}

/**
 * Parse UserByScreenName response to extract user profile.
 */
export function parseUserResponse(data: Any): {
  restId: string;
  name: string;
  screenName: string;
  profileImageUrl: string;
  isProtected: boolean;
} | null {
  const result = data?.data?.user?.result;
  if (!result) return null;

  // Handle UserUnavailable
  if (result.__typename === "UserUnavailable") return null;

  const legacy = result.legacy;
  if (!legacy) return null;

  return {
    restId: result.rest_id ?? "",
    name: legacy.name ?? "",
    screenName: legacy.screen_name ?? "",
    profileImageUrl: (legacy.profile_image_url_https ?? "").replace(
      "_normal",
      "_200x200",
    ),
    isProtected: legacy.protected ?? false,
  };
}
