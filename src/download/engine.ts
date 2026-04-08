/**
 * Download engine. Runs in the offscreen document.
 *
 * Fetches media at orig quality, streams into a zip via client-zip,
 * and triggers download via blob URL.
 */

import { downloadZip } from "client-zip";
import type { MediaItem } from "../types";

const CONCURRENT_FETCHES = 3;

interface DownloadOptions {
  items: MediaItem[];
  screenName: string;
  onProgress: (completed: number, total: number, currentFile: string) => void;
  signal?: AbortSignal;
}

/** Sanitize a string for safe use in filenames */
function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** Generate filename: @username_YYYYMMDD_tweetid_index.ext */
export function generateFilename(item: MediaItem, screenName: string): string {
  let date = "";
  try {
    const d = new Date(item.createdAt);
    date = d.toISOString().slice(0, 10).replace(/-/g, "");
  } catch {
    date = "unknown";
  }

  const ext =
    item.type === "photo"
      ? "jpg"
      : "mp4";

  return `${sanitize(screenName)}_${date}_${item.tweetId}_${item.index}.${ext}`;
}

/**
 * Fetch a single media item with retry.
 */
async function fetchMedia(
  item: MediaItem,
  signal?: AbortSignal,
): Promise<Response> {
  const maxRetries = 3;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const resp = await fetch(item.mediaUrl, { signal });
      if (resp.ok) return resp;
      if (i < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      if (i === maxRetries - 1) throw e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error(`Failed to fetch ${item.mediaUrl}`);
}

/**
 * Download selected media items as a zip.
 *
 * Uses client-zip for streaming zip assembly. Fetches are done with
 * a concurrency limit of 3.
 */
export async function downloadSelected(
  options: DownloadOptions,
): Promise<void> {
  const { items, screenName, onProgress, signal } = options;
  let completed = 0;

  // Create an async generator that yields file entries for client-zip
  async function* fileEntries() {
    // Process items in batches of CONCURRENT_FETCHES
    for (let i = 0; i < items.length; i += CONCURRENT_FETCHES) {
      if (signal?.aborted) return;

      const batch = items.slice(i, i + CONCURRENT_FETCHES);
      const results = await Promise.allSettled(
        batch.map(async (item) => {
          const filename = generateFilename(item, screenName);
          try {
            const resp = await fetchMedia(item, signal);
            return { name: filename, input: resp };
          } catch {
            // Skip failed items, continue with others
            return null;
          }
        }),
      );

      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          completed++;
          onProgress(completed, items.length, result.value.name);
          yield result.value;
        } else {
          completed++;
          onProgress(completed, items.length, "(skipped)");
        }
      }
    }
  }

  // Stream zip assembly
  const zipResponse = downloadZip(fileEntries());
  const blob = await zipResponse.blob();

  if (signal?.aborted) return;

  // Trigger download
  const url = URL.createObjectURL(blob);
  const filename = `${screenName}_media.zip`;

  // Use chrome.downloads API if available (offscreen context)
  if (typeof chrome !== "undefined" && chrome.downloads) {
    await chrome.downloads.download({ url, filename });
  } else {
    // Fallback for popup context
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  }

  // Clean up blob URL after a delay
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
