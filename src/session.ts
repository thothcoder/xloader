/**
 * Session store — holds popup state in the background service worker.
 *
 * In-memory for fast reads, mirrored to chrome.storage.session so state
 * survives service worker restarts (but not browser restarts).
 */

import type { Session } from "./types";

const SESSION_KEY = "xloader_session";
const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

const DEFAULT_SESSION: Session = {
  state: "search",
  username: "",
  user: null,
  items: [],
  selectedIds: [],
  downloadProgress: null,
  error: "",
  loadingCount: 0,
  updatedAt: Date.now(),
};

let session: Session = { ...DEFAULT_SESSION };

export function getSession(): Session {
  if (Date.now() - session.updatedAt > TTL_MS) {
    session = { ...DEFAULT_SESSION, updatedAt: Date.now() };
  }
  return session;
}

export function updateSession(patch: Partial<Session>): Session {
  session = { ...session, ...patch, updatedAt: Date.now() };
  chrome.storage.session.set({ [SESSION_KEY]: session }).catch(() => {});
  return session;
}

export function clearSession(): Session {
  session = { ...DEFAULT_SESSION, updatedAt: Date.now() };
  chrome.storage.session.remove(SESSION_KEY).catch(() => {});
  return session;
}

/** Call once on service worker startup to recover from restart. */
export async function restoreSession(): Promise<void> {
  try {
    const result = await chrome.storage.session.get(SESSION_KEY);
    const stored = result[SESSION_KEY] as Session | undefined;
    if (stored && Date.now() - stored.updatedAt < TTL_MS) {
      session = stored;
      // Loading/downloading can't survive a SW restart — degrade gracefully
      if (session.state === "loading" || session.state === "downloading") {
        session.state = session.items.length > 0 ? "gallery" : "search";
        session.downloadProgress = null;
      }
    }
  } catch {
    // Fresh session on failure
  }
}
