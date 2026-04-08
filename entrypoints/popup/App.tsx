import { useState, useEffect, useCallback } from "preact/hooks";
import type { MediaItem, UserProfile, DownloadProgress } from "../../src/types";
import { SearchState } from "./components/SearchState";
import { GalleryState } from "./components/GalleryState";
import { DownloadState } from "./components/DownloadState";

type AppState = "search" | "loading" | "gallery" | "downloading" | "error";

export function App() {
  const [state, setState] = useState<AppState>("search");
  const [username, setUsername] = useState("");
  const [user, setUser] = useState<UserProfile | null>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [loadingCount, setLoadingCount] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);

  // Auto-populate username from current tab
  useEffect(() => {
    chrome.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          { type: "GET_USERNAME" },
          (response) => {
            if (chrome.runtime.lastError) return;
            if (response?.username) {
              setUsername(response.username);
            }
          },
        );
      }
    });
  }, []);

  // Listen for progress updates from background
  useEffect(() => {
    const listener = (message: { type: string; [key: string]: unknown }) => {
      if (message.type === "MEDIA_PROGRESS") {
        const newItems = message.items as MediaItem[];
        const total = message.total as number;
        setItems((prev) => [...prev, ...newItems]);
        setLoadingCount(total);
      }
      if (message.type === "DOWNLOAD_PROGRESS") {
        setDownloadProgress(message as unknown as DownloadProgress);
      }
      if (message.type === "DOWNLOAD_COMPLETE") {
        setState("gallery");
        setDownloadProgress(null);
      }
      if (message.type === "DOWNLOAD_ERROR") {
        setError((message as { message: string }).message);
        setState("error");
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const handleSearch = useCallback(async () => {
    const name = username.replace(/^@/, "").trim();
    if (!name) return;

    setState("loading");
    setItems([]);
    setSelectedIds(new Set());
    setLoadingCount(0);

    // Resolve user
    const userResult = await chrome.runtime.sendMessage({
      type: "RESOLVE_USER",
      screenName: name,
    });

    if (!userResult.ok) {
      const messages: Record<string, string> = {
        not_found: `Account @${name} not found. Check the username.`,
        suspended: `Account @${name} is suspended.`,
        protected: `Account @${name} is private and you don't follow them.`,
        network: "Network error. Check your connection and try again.",
      };
      setError(messages[userResult.error] ?? "Something went wrong.");
      setState("error");
      return;
    }

    setUser(userResult.user);

    // Load media
    const result = await chrome.runtime.sendMessage({
      type: "LOAD_MEDIA",
      restId: userResult.user.restId,
    });

    if (result?.items) {
      setItems(result.items);
    }
    setState("gallery");
  }, [username]);

  const handleDownload = useCallback(() => {
    const selected = items.filter((item) =>
      selectedIds.has(`${item.tweetId}_${item.index}`),
    );
    if (selected.length === 0) return;

    setState("downloading");
    chrome.runtime.sendMessage({
      type: "START_DOWNLOAD",
      items: selected,
      screenName: user?.screenName ?? username,
    });
  }, [items, selectedIds, user, username]);

  const handleCancel = useCallback(() => {
    if (state === "loading") {
      chrome.runtime.sendMessage({ type: "CANCEL_LOAD" });
      setState("search");
    } else if (state === "downloading") {
      chrome.runtime.sendMessage({ type: "CANCEL_DOWNLOAD" });
      setState("gallery");
    }
  }, [state]);

  const handleBack = useCallback(() => {
    if (state === "loading") {
      chrome.runtime.sendMessage({ type: "CANCEL_LOAD" });
    }
    setState("search");
    setItems([]);
    setUser(null);
    setSelectedIds(new Set());
  }, [state]);

  return (
    <div class="state">
      <div class="header">
        <div class="logo">X</div>
        <h1>xloader</h1>
      </div>

      {state === "search" && (
        <SearchState
          username={username}
          onUsernameChange={setUsername}
          onSearch={handleSearch}
        />
      )}

      {state === "loading" && (
        <div class="loading-area">
          <div class="spinner" />
          <div style={{ fontSize: "15px", fontWeight: 600 }}>
            Scanning @{username.replace(/^@/, "")}...
          </div>
          <div class="progress-text">
            Found {loadingCount} media so far
          </div>
          <button class="cancel-btn" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      )}

      {state === "gallery" && user && (
        <GalleryState
          user={user}
          items={items}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onDownload={handleDownload}
          onBack={handleBack}
        />
      )}

      {state === "downloading" && (
        <DownloadState
          user={user}
          progress={downloadProgress}
          onCancel={handleCancel}
        />
      )}

      {state === "error" && (
        <div class="error-area">
          <div class="error-message">{error}</div>
          <button class="btn-primary" onClick={handleBack} style={{ maxWidth: "200px" }}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
