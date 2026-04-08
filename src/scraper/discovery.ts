/**
 * Auto-discover GraphQL queryIds (doc_ids) from X's JS bundles.
 *
 * X rotates these every 1-3 weeks. We parse them from the main JS bundle,
 * cache for 24h, and fallback to a remote JSON if bundle parsing fails.
 */

import type { DocIdCache } from "../types";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_KEY = "xloader_doc_ids";

/** Known operation names we need queryIds for */
const OPERATIONS = {
  UserByScreenName: "UserByScreenName",
  UserMedia: "UserMedia",
} as const;

type OperationName = keyof typeof OPERATIONS;

interface DocIdMap {
  UserByScreenName: string;
  UserMedia: string;
}

/** Check chrome.storage.local cache first */
async function getCachedDocIds(): Promise<DocIdMap | null> {
  try {
    const result = await chrome.storage.local.get(CACHE_KEY);
    const cached = result[CACHE_KEY] as
      | Record<string, DocIdCache>
      | undefined;
    if (!cached) return null;

    const now = Date.now();
    const userById = cached.UserByScreenName;
    const userMedia = cached.UserMedia;

    if (
      userById &&
      userMedia &&
      now - userById.timestamp < CACHE_TTL_MS &&
      now - userMedia.timestamp < CACHE_TTL_MS
    ) {
      return {
        UserByScreenName: userById.queryId,
        UserMedia: userMedia.queryId,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function setCachedDocIds(docIds: DocIdMap): Promise<void> {
  const now = Date.now();
  await chrome.storage.local.set({
    [CACHE_KEY]: {
      UserByScreenName: { queryId: docIds.UserByScreenName, timestamp: now },
      UserMedia: { queryId: docIds.UserMedia, timestamp: now },
    },
  });
}

/**
 * Parse X's main JS bundle to extract queryIds.
 *
 * X's webpack bundles contain patterns like:
 *   queryId:"abc123",operationName:"UserMedia"
 */
async function parseFromBundle(): Promise<DocIdMap | null> {
  try {
    // Fetch the main page to find JS bundle URLs
    const pageResp = await fetch("https://x.com", {
      credentials: "include",
    });
    const html = await pageResp.text();

    // Find main JS bundle URLs from script tags
    const scriptUrls: string[] = [];
    const scriptPattern =
      /src="(https:\/\/abs\.twimg\.com\/responsive-web\/client-web[^"]+\.js)"/g;
    let m;
    while ((m = scriptPattern.exec(html)) !== null) {
      scriptUrls.push(m[1]);
    }

    // Also check for newer bundle patterns
    const altPattern =
      /src="(https:\/\/abs\.twimg\.com\/responsive-web\/client-web-legacy[^"]+\.js)"/g;
    while ((m = altPattern.exec(html)) !== null) {
      scriptUrls.push(m[1]);
    }

    const result: Partial<DocIdMap> = {};

    for (const url of scriptUrls) {
      if (result.UserByScreenName && result.UserMedia) break;

      const resp = await fetch(url);
      const js = await resp.text();

      for (const op of Object.keys(OPERATIONS) as OperationName[]) {
        if (result[op]) continue;

        // Pattern: queryId:"abc123",operationName:"UserMedia"
        const queryIdPattern = new RegExp(
          `queryId:"([^"]+)",operationName:"${op}"`,
        );
        const qm = js.match(queryIdPattern);
        if (qm) {
          result[op] = qm[1];
        }
      }
    }

    if (result.UserByScreenName && result.UserMedia) {
      return result as DocIdMap;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fallback: fetch known-good queryIds from a remote JSON.
 * This is a community-maintained file on GitHub.
 */
async function fetchRemoteDocIds(): Promise<DocIdMap | null> {
  try {
    const resp = await fetch(
      "https://raw.githubusercontent.com/moven0831/xloader/main/doc_ids.json",
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as Record<string, string>;
    if (data.UserByScreenName && data.UserMedia) {
      return {
        UserByScreenName: data.UserByScreenName,
        UserMedia: data.UserMedia,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Discover GraphQL queryIds. Priority:
 * 1. chrome.storage cache (24h TTL)
 * 2. Parse from X's JS bundles
 * 3. Remote fallback JSON on GitHub
 */
export async function discoverDocIds(): Promise<DocIdMap> {
  // 1. Cache
  const cached = await getCachedDocIds();
  if (cached) return cached;

  // 2. Bundle parsing
  const fromBundle = await parseFromBundle();
  if (fromBundle) {
    await setCachedDocIds(fromBundle);
    return fromBundle;
  }

  // 3. Remote fallback
  const remote = await fetchRemoteDocIds();
  if (remote) {
    await setCachedDocIds(remote);
    return remote;
  }

  throw new Error(
    "Could not discover X API endpoints. X may have changed their API. Check for an xloader update.",
  );
}

/** Force re-discovery (called after 400/403 errors) */
export async function invalidateDocIds(): Promise<void> {
  await chrome.storage.local.remove(CACHE_KEY);
}
