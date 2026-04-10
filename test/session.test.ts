import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock chrome.storage.session API
const mockSessionGet = vi.fn();
const mockSessionSet = vi.fn();
const mockSessionRemove = vi.fn();

vi.stubGlobal("chrome", {
  storage: {
    session: {
      get: mockSessionGet,
      set: mockSessionSet,
      remove: mockSessionRemove,
    },
  },
});

import { getSession, updateSession, clearSession, restoreSession } from "../src/session";
import type { Session } from "../src/types";

describe("session store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionSet.mockResolvedValue(undefined);
    mockSessionRemove.mockResolvedValue(undefined);
    // Reset to clean state between tests
    clearSession();
  });

  describe("getSession", () => {
    it("returns default session initially", () => {
      const session = getSession();
      expect(session.state).toBe("search");
      expect(session.items).toEqual([]);
      expect(session.selectedIds).toEqual([]);
      expect(session.username).toBe("");
      expect(session.user).toBeNull();
    });

    it("resets session when TTL expired", () => {
      vi.useFakeTimers();
      updateSession({ username: "test", state: "gallery" });

      // Advance time past the 2-hour TTL
      vi.advanceTimersByTime(2 * 60 * 60 * 1000 + 1);

      const session = getSession();
      expect(session.state).toBe("search");
      expect(session.username).toBe("");
      vi.useRealTimers();
    });
  });

  describe("updateSession", () => {
    it("merges patch into current session", () => {
      updateSession({ username: "alice", state: "loading" });
      const session = getSession();
      expect(session.username).toBe("alice");
      expect(session.state).toBe("loading");
    });

    it("preserves unpatched fields", () => {
      updateSession({ username: "alice" });
      updateSession({ state: "gallery" });
      const session = getSession();
      expect(session.username).toBe("alice");
      expect(session.state).toBe("gallery");
    });

    it("updates the timestamp", () => {
      const before = Date.now();
      updateSession({ username: "bob" });
      const session = getSession();
      expect(session.updatedAt).toBeGreaterThanOrEqual(before);
    });

    it("writes to chrome.storage.session", () => {
      updateSession({ username: "charlie" });
      expect(mockSessionSet).toHaveBeenCalledWith(
        expect.objectContaining({
          xloader_session: expect.objectContaining({ username: "charlie" }),
        }),
      );
    });
  });

  describe("clearSession", () => {
    it("resets all fields to defaults", () => {
      updateSession({ username: "alice", state: "gallery", items: [{ tweetId: "1" } as any] });
      clearSession();
      const session = getSession();
      expect(session.state).toBe("search");
      expect(session.username).toBe("");
      expect(session.items).toEqual([]);
    });

    it("removes from chrome.storage.session", () => {
      clearSession();
      expect(mockSessionRemove).toHaveBeenCalledWith("xloader_session");
    });
  });

  describe("restoreSession", () => {
    it("restores valid session from storage", async () => {
      const stored: Session = {
        state: "gallery",
        username: "alice",
        user: null,
        items: [{ tweetId: "1", mediaUrl: "", thumbnailUrl: "", type: "photo", width: 100, height: 100, createdAt: "", index: 0 }],
        selectedIds: ["1_0"],
        downloadProgress: null,
        error: "",
        loadingCount: 1,
        updatedAt: Date.now(),
      };
      mockSessionGet.mockResolvedValue({ xloader_session: stored });

      await restoreSession();
      const session = getSession();
      expect(session.state).toBe("gallery");
      expect(session.username).toBe("alice");
      expect(session.items).toHaveLength(1);
    });

    it("ignores expired session in storage", async () => {
      const stored: Session = {
        state: "gallery",
        username: "alice",
        user: null,
        items: [],
        selectedIds: [],
        downloadProgress: null,
        error: "",
        loadingCount: 0,
        updatedAt: Date.now() - 3 * 60 * 60 * 1000, // 3 hours ago
      };
      mockSessionGet.mockResolvedValue({ xloader_session: stored });

      await restoreSession();
      const session = getSession();
      expect(session.state).toBe("search");
      expect(session.username).toBe("");
    });

    it("degrades 'loading' to 'gallery' when items exist", async () => {
      const stored: Session = {
        state: "loading",
        username: "alice",
        user: null,
        items: [{ tweetId: "1", mediaUrl: "", thumbnailUrl: "", type: "photo", width: 100, height: 100, createdAt: "", index: 0 }],
        selectedIds: [],
        downloadProgress: null,
        error: "",
        loadingCount: 1,
        updatedAt: Date.now(),
      };
      mockSessionGet.mockResolvedValue({ xloader_session: stored });

      await restoreSession();
      const session = getSession();
      expect(session.state).toBe("gallery");
    });

    it("degrades 'loading' to 'search' when no items", async () => {
      const stored: Session = {
        state: "loading",
        username: "alice",
        user: null,
        items: [],
        selectedIds: [],
        downloadProgress: null,
        error: "",
        loadingCount: 0,
        updatedAt: Date.now(),
      };
      mockSessionGet.mockResolvedValue({ xloader_session: stored });

      await restoreSession();
      const session = getSession();
      expect(session.state).toBe("search");
    });

    it("degrades 'downloading' to 'gallery' and clears progress", async () => {
      const stored: Session = {
        state: "downloading",
        username: "alice",
        user: null,
        items: [{ tweetId: "1", mediaUrl: "", thumbnailUrl: "", type: "photo", width: 100, height: 100, createdAt: "", index: 0 }],
        selectedIds: [],
        downloadProgress: { type: "DOWNLOAD_PROGRESS", completed: 5, total: 10, currentFile: "test.jpg", bytesLoaded: 0, bytesTotal: 0 },
        error: "",
        loadingCount: 1,
        updatedAt: Date.now(),
      };
      mockSessionGet.mockResolvedValue({ xloader_session: stored });

      await restoreSession();
      const session = getSession();
      expect(session.state).toBe("gallery");
      expect(session.downloadProgress).toBeNull();
    });

    it("handles storage read failure gracefully", async () => {
      mockSessionGet.mockRejectedValue(new Error("storage error"));

      await restoreSession();
      const session = getSession();
      expect(session.state).toBe("search"); // stays at default
    });
  });
});
