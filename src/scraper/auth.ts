/**
 * X API authentication helpers.
 *
 * Uses the user's ct0 CSRF cookie (via chrome.cookies) and X's public
 * app bearer token (hardcoded constant, same for all users).
 */

const BEARER_TOKEN =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

export function getBearerToken(): string {
  return BEARER_TOKEN;
}

export async function getCsrfToken(): Promise<string | undefined> {
  try {
    const cookie = await chrome.cookies.get({
      url: "https://x.com",
      name: "ct0",
    });
    return cookie?.value;
  } catch {
    return undefined;
  }
}

export async function buildHeaders(): Promise<Record<string, string>> {
  const csrf = await getCsrfToken();
  if (!csrf) {
    throw new Error("Not logged in to X. Please log in and try again.");
  }
  return {
    Authorization: `Bearer ${getBearerToken()}`,
    "Content-Type": "application/json",
    "X-Csrf-Token": csrf,
    "X-Twitter-Active-User": "yes",
    "X-Twitter-Auth-Type": "OAuth2Session",
  };
}
