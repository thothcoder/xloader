/**
 * Background service worker.
 *
 * Routes messages between the popup, content script, and offscreen document.
 * Handles media scraping and delegates downloads to the offscreen doc.
 */

import { cancelPagination, paginateMedia, resolveUser, getRateLimitState } from "../src/scraper/api";
import type { MediaItem, DownloadMessage, BackgroundMessage } from "../src/types";
import { restoreSession, getSession, updateSession, clearSession } from "../src/session";

export default defineBackground(() => {
  let offscreenCreated = false;

  // Recover session state if service worker restarted
  restoreSession();

  async function ensureOffscreen() {
    if (offscreenCreated) return;
    try {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: [chrome.offscreen.Reason.BLOBS],
        justification: "Assembling zip file for media download",
      });
      offscreenCreated = true;
    } catch {
      // Already exists
      offscreenCreated = true;
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const msg = message as BackgroundMessage | DownloadMessage | { type: string };

    // --- Session management ---

    if (msg.type === "GET_SESSION") {
      sendResponse(getSession());
      return false;
    }

    if (msg.type === "UPDATE_SESSION") {
      const { patch } = msg as BackgroundMessage & { type: "UPDATE_SESSION" };
      updateSession(patch);
      sendResponse({ ok: true });
      return false;
    }

    if (msg.type === "CLEAR_SESSION") {
      clearSession();
      sendResponse({ ok: true });
      return false;
    }

    // --- User resolution ---

    if (msg.type === "RESOLVE_USER") {
      const { screenName } = msg as BackgroundMessage & { type: "RESOLVE_USER" };
      resolveUser(screenName).then(sendResponse);
      return true; // async response
    }

    // --- Media loading ---

    if (msg.type === "LOAD_MEDIA") {
      const { restId } = msg as BackgroundMessage & { type: "LOAD_MEDIA" };
      const allItems: MediaItem[] = [];

      paginateMedia(restId, (newItems, total) => {
        allItems.push(...newItems);
        // Persist to session so items survive popup close
        updateSession({ items: allItems, loadingCount: total, state: "loading" });
        // Send progress to popup (may fail if popup closed, that's OK)
        chrome.runtime.sendMessage({
          type: "MEDIA_PROGRESS",
          items: newItems,
          total,
        }).catch(() => {});
      }).then((items) => {
        updateSession({ items, state: "gallery" });
        try {
          sendResponse({ items, rateLimitState: getRateLimitState() });
        } catch {
          // Popup closed before response — items are safe in session
        }
      });
      return true;
    }

    if (msg.type === "CANCEL_LOAD") {
      cancelPagination();
      // Keep items found so far; revert to gallery if we have items
      const s = getSession();
      updateSession({ state: s.items.length > 0 ? "gallery" : "search" });
      sendResponse({ ok: true });
      return false;
    }

    // --- Download management ---

    if (msg.type === "START_DOWNLOAD") {
      updateSession({ state: "downloading", downloadProgress: null });
      ensureOffscreen().then(() => {
        chrome.runtime.sendMessage(msg);
      });
      return false;
    }

    if (msg.type === "CANCEL_DOWNLOAD") {
      updateSession({ state: "gallery", downloadProgress: null });
      chrome.runtime.sendMessage(msg);
      return false;
    }

    // --- Download events from offscreen ---

    if (msg.type === "DOWNLOAD_PROGRESS") {
      updateSession({ downloadProgress: message });
      return false;
    }

    if (msg.type === "DOWNLOAD_COMPLETE") {
      updateSession({ state: "gallery", downloadProgress: null });
      return false;
    }

    if (msg.type === "DOWNLOAD_ERROR") {
      updateSession({ state: "error", error: (message as { message: string }).message });
      return false;
    }

    if (msg.type === "GET_RATE_LIMIT") {
      sendResponse(getRateLimitState());
      return false;
    }

    return false;
  });
});
