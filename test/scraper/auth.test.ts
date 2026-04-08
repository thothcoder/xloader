import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock chrome.cookies API
const mockCookiesGet = vi.fn();
vi.stubGlobal("chrome", {
  cookies: {
    get: mockCookiesGet,
  },
});

// Import after mocking
import { getBearerToken, getCsrfToken, buildHeaders } from "../../src/scraper/auth";

describe("auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getBearerToken", () => {
    it("returns the hardcoded public bearer token", () => {
      const token = getBearerToken();
      expect(token).toMatch(/^AAAAAAAAAAAAAAAAAAA/);
      expect(token.length).toBeGreaterThan(50);
    });
  });

  describe("getCsrfToken", () => {
    it("returns ct0 cookie value when logged in", async () => {
      mockCookiesGet.mockResolvedValue({ value: "abc123csrf" });

      const token = await getCsrfToken();
      expect(token).toBe("abc123csrf");
      expect(mockCookiesGet).toHaveBeenCalledWith({
        url: "https://x.com",
        name: "ct0",
      });
    });

    it("returns undefined when not logged in", async () => {
      mockCookiesGet.mockResolvedValue(null);

      const token = await getCsrfToken();
      expect(token).toBeUndefined();
    });

    it("returns undefined when chrome.cookies throws", async () => {
      mockCookiesGet.mockRejectedValue(new Error("No permission"));

      const token = await getCsrfToken();
      expect(token).toBeUndefined();
    });
  });

  describe("buildHeaders", () => {
    it("returns correct headers when logged in", async () => {
      mockCookiesGet.mockResolvedValue({ value: "test_csrf_token" });

      const headers = await buildHeaders();
      expect(headers["Authorization"]).toMatch(/^Bearer AAAAAAAAAAAAAAAAAAA/);
      expect(headers["X-Csrf-Token"]).toBe("test_csrf_token");
      expect(headers["X-Twitter-Auth-Type"]).toBe("OAuth2Session");
      expect(headers["Content-Type"]).toBe("application/json");
    });

    it("throws when not logged in", async () => {
      mockCookiesGet.mockResolvedValue(null);

      await expect(buildHeaders()).rejects.toThrow("Not logged in");
    });
  });
});
