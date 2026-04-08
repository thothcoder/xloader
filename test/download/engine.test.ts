import { describe, it, expect } from "vitest";
import { generateFilename } from "../../src/download/engine";
import type { MediaItem } from "../../src/types";

function makeItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    tweetId: "1234567890",
    mediaUrl: "https://pbs.twimg.com/media/test.jpg?format=jpg&name=orig",
    thumbnailUrl: "https://pbs.twimg.com/media/test.jpg?format=jpg&name=small",
    type: "photo",
    width: 1920,
    height: 1080,
    createdAt: "Wed Mar 15 12:00:00 +0000 2026",
    index: 0,
    ...overrides,
  };
}

describe("generateFilename", () => {
  it("generates correct format for photos", () => {
    const item = makeItem();
    const name = generateFilename(item, "waneella_");
    expect(name).toBe("waneella__20260315_1234567890_0.jpg");
  });

  it("generates correct format for videos", () => {
    const item = makeItem({ type: "video", index: 0 });
    const name = generateFilename(item, "testuser");
    expect(name).toBe("testuser_20260315_1234567890_0.mp4");
  });

  it("generates correct format for GIFs", () => {
    const item = makeItem({ type: "animated_gif", index: 0 });
    const name = generateFilename(item, "testuser");
    expect(name).toBe("testuser_20260315_1234567890_0.mp4");
  });

  it("handles multi-index items", () => {
    const item = makeItem({ index: 2 });
    const name = generateFilename(item, "user");
    expect(name).toBe("user_20260315_1234567890_2.jpg");
  });

  it("handles invalid date gracefully", () => {
    const item = makeItem({ createdAt: "not a date" });
    const name = generateFilename(item, "user");
    expect(name).toBe("user_unknown_1234567890_0.jpg");
  });
});
