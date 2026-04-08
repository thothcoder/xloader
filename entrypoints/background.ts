/**
 * Background service worker.
 *
 * Routes messages between the popup, content script, and offscreen document.
 * Handles media scraping and delegates downloads to the offscreen doc.
 */

import { cancelPagination, paginateMedia, resolveUser, getRateLimitState } from "../src/scraper/api";
import type { MediaItem, DownloadMessage, BackgroundMessage } from "../src/types";

export default defineBackground(() => {
  let offscreenCreated = false;

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

    if (msg.type === "RESOLVE_USER") {
      const { screenName } = msg as BackgroundMessage & { type: "RESOLVE_USER" };
      resolveUser(screenName).then(sendResponse);
      return true; // async response
    }

    if (msg.type === "LOAD_MEDIA") {
      const { restId } = msg as BackgroundMessage & { type: "LOAD_MEDIA" };
      const allItems: MediaItem[] = [];

      paginateMedia(restId, (newItems, total) => {
        allItems.push(...newItems);
        // Send progress to popup (may fail if popup closed, that's OK)
        chrome.runtime.sendMessage({
          type: "MEDIA_PROGRESS",
          items: newItems,
          total,
        }).catch(() => {});
      }).then((items) => {
        try {
          sendResponse({ items, rateLimitState: getRateLimitState() });
        } catch {
          // Popup closed before response, pagination results are lost
        }
      });
      return true;
    }

    if (msg.type === "CANCEL_LOAD") {
      cancelPagination();
      sendResponse({ ok: true });
      return false;
    }

    if (msg.type === "START_DOWNLOAD") {
      ensureOffscreen().then(() => {
        // Forward to offscreen document
        chrome.runtime.sendMessage(msg);
      });
      return false;
    }

    if (msg.type === "CANCEL_DOWNLOAD") {
      chrome.runtime.sendMessage(msg);
      return false;
    }

    if (msg.type === "GET_RATE_LIMIT") {
      sendResponse(getRateLimitState());
      return false;
    }

    return false;
  });
});
