/**
 * Offscreen document for download engine.
 *
 * Receives download commands from the background SW,
 * fetches media, assembles zip, and reports progress back.
 */

import { downloadSelected } from "../../src/download/engine";
import type { DownloadMessage } from "../../src/types";

let abortController: AbortController | null = null;

chrome.runtime.onMessage.addListener((message: DownloadMessage) => {
  if (message.type === "START_DOWNLOAD") {
    abortController = new AbortController();

    downloadSelected({
      items: message.items,
      screenName: message.screenName,
      signal: abortController.signal,
      onProgress(completed, total, currentFile) {
        chrome.runtime.sendMessage({
          type: "DOWNLOAD_PROGRESS",
          completed,
          total,
          currentFile,
          bytesLoaded: 0,
          bytesTotal: 0,
        });
      },
    })
      .then(() => {
        chrome.runtime.sendMessage({ type: "DOWNLOAD_COMPLETE" });
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") {
          chrome.runtime.sendMessage({
            type: "DOWNLOAD_ERROR",
            message: (err as Error).message,
          });
        }
      })
      .finally(() => {
        abortController = null;
      });
  }

  if (message.type === "CANCEL_DOWNLOAD") {
    abortController?.abort();
    abortController = null;
  }
});
