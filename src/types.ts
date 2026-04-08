/** Media types from X's API */
export type MediaType = "photo" | "video" | "animated_gif";

/** A single media item extracted from X's timeline response */
export interface MediaItem {
  tweetId: string;
  mediaUrl: string;
  thumbnailUrl: string;
  type: MediaType;
  width: number;
  height: number;
  /** Video duration in seconds, only for video/animated_gif */
  durationMs?: number;
  /** Bitrate in bps for video variants */
  bitrate?: number;
  /** ISO timestamp of the tweet */
  createdAt: string;
  /** Index within the tweet (for multi-image tweets) */
  index: number;
}

/** User profile from UserByScreenName */
export interface UserProfile {
  restId: string;
  name: string;
  screenName: string;
  profileImageUrl: string;
  isProtected: boolean;
}

/** Result of resolving a username */
export type UserResult =
  | { ok: true; user: UserProfile }
  | { ok: false; error: "not_found" | "suspended" | "protected" | "network" };

/** Pagination state */
export interface PaginationResult {
  items: MediaItem[];
  nextCursor: string | null;
  total: number;
}

/** Messages between popup and background */
export type BackgroundMessage =
  | { type: "RESOLVE_USER"; screenName: string }
  | { type: "LOAD_MEDIA"; restId: string; cursor?: string }
  | { type: "CANCEL_LOAD" };

/** Messages between popup/background and offscreen */
export type DownloadMessage =
  | {
      type: "START_DOWNLOAD";
      items: MediaItem[];
      screenName: string;
    }
  | { type: "CANCEL_DOWNLOAD" };

/** Progress updates from offscreen to popup */
export interface DownloadProgress {
  type: "DOWNLOAD_PROGRESS";
  completed: number;
  total: number;
  currentFile: string;
  bytesLoaded: number;
  bytesTotal: number;
}

export interface DownloadComplete {
  type: "DOWNLOAD_COMPLETE";
}

export interface DownloadError {
  type: "DOWNLOAD_ERROR";
  message: string;
}

export type DownloadEvent = DownloadProgress | DownloadComplete | DownloadError;

/** Stored doc_id cache entry */
export interface DocIdCache {
  queryId: string;
  timestamp: number;
}
