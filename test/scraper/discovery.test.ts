import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock chrome.storage API
const mockStorageGet = vi.fn();
const mockStorageSet = vi.fn();
const mockStorageRemove = vi.fn();

vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: mockStorageGet,
      set: mockStorageSet,
      remove: mockStorageRemove,
    },
  },
});

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { discoverDocIds, invalidateDocIds } from "../../src/scraper/discovery";

describe("discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("discoverDocIds", () => {
    it("returns cached doc_ids when cache is fresh", async () => {
      const now = Date.now();
      mockStorageGet.mockResolvedValue({
        xloader_doc_ids: {
          UserByScreenName: { queryId: "cached_usn_id", timestamp: now - 1000 },
          UserMedia: { queryId: "cached_um_id", timestamp: now - 1000 },
        },
      });

      const result = await discoverDocIds();
      expect(result.UserByScreenName).toBe("cached_usn_id");
      expect(result.UserMedia).toBe("cached_um_id");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("skips stale cache and tries bundle parsing", async () => {
      const staleTime = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      mockStorageGet.mockResolvedValue({
        xloader_doc_ids: {
          UserByScreenName: { queryId: "old_id", timestamp: staleTime },
          UserMedia: { queryId: "old_id", timestamp: staleTime },
        },
      });

      // Bundle fetch returns page with script tags
      mockFetch.mockImplementation((url: string) => {
        if (url === "https://x.com") {
          return Promise.resolve({
            text: () =>
              Promise.resolve(
                '<script src="https://abs.twimg.com/responsive-web/client-web/main.abc123.js"></script>',
              ),
          });
        }
        if (url.includes("abs.twimg.com")) {
          return Promise.resolve({
            text: () =>
              Promise.resolve(
                'queryId:"newUSN123",operationName:"UserByScreenName" queryId:"newUM456",operationName:"UserMedia"',
              ),
          });
        }
        return Promise.reject(new Error("unexpected fetch"));
      });

      mockStorageSet.mockResolvedValue(undefined);

      const result = await discoverDocIds();
      expect(result.UserByScreenName).toBe("newUSN123");
      expect(result.UserMedia).toBe("newUM456");
      expect(mockStorageSet).toHaveBeenCalled();
    });

    it("falls back to remote JSON when bundle parsing fails", async () => {
      mockStorageGet.mockResolvedValue({});

      // Bundle fetch fails
      mockFetch.mockImplementation((url: string) => {
        if (url === "https://x.com") {
          return Promise.reject(new Error("network error"));
        }
        if (url.includes("raw.githubusercontent.com")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                UserByScreenName: "remote_usn",
                UserMedia: "remote_um",
              }),
          });
        }
        return Promise.reject(new Error("unexpected"));
      });

      mockStorageSet.mockResolvedValue(undefined);

      const result = await discoverDocIds();
      expect(result.UserByScreenName).toBe("remote_usn");
      expect(result.UserMedia).toBe("remote_um");
    });

    it("throws when all fallbacks fail", async () => {
      mockStorageGet.mockResolvedValue({});
      mockFetch.mockRejectedValue(new Error("network error"));

      await expect(discoverDocIds()).rejects.toThrow(
        "Could not discover X API endpoints",
      );
    });
  });

  describe("invalidateDocIds", () => {
    it("removes cached doc_ids from storage", async () => {
      mockStorageRemove.mockResolvedValue(undefined);

      await invalidateDocIds();
      expect(mockStorageRemove).toHaveBeenCalledWith("xloader_doc_ids");
    });
  });
});
