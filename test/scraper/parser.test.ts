import { describe, it, expect } from "vitest";
import { parseTimelineResponse, parseUserResponse } from "../../src/scraper/parser";
import singleImage from "../fixtures/single-image-tweet.json";
import multiImage from "../fixtures/multi-image-tweet.json";
import videoTweet from "../fixtures/video-tweet.json";
import gifTweet from "../fixtures/gif-tweet.json";
import visibilityResults from "../fixtures/visibility-results-tweet.json";
import noMedia from "../fixtures/no-media-tweet.json";
import moduleTimeline from "../fixtures/module-timeline.json";
import userResponse from "../fixtures/user-response.json";

describe("parseTimelineResponse", () => {
  it("parses single-image tweet", () => {
    const result = parseTimelineResponse(singleImage);
    expect(result.items).toHaveLength(1);

    const item = result.items[0];
    expect(item.tweetId).toBe("1234567890");
    expect(item.type).toBe("photo");
    expect(item.width).toBe(1920);
    expect(item.height).toBe(1080);
    expect(item.mediaUrl).toContain("name=orig");
    expect(item.thumbnailUrl).toContain("name=small");
    expect(item.index).toBe(0);
  });

  it("extracts pagination cursor", () => {
    const result = parseTimelineResponse(singleImage);
    expect(result.nextCursor).toBe("cursor_next_page_abc123");
  });

  it("parses multi-image tweet", () => {
    const result = parseTimelineResponse(multiImage);
    expect(result.items).toHaveLength(3);

    expect(result.items[0].index).toBe(0);
    expect(result.items[1].index).toBe(1);
    expect(result.items[2].index).toBe(2);

    // All same tweet
    expect(result.items[0].tweetId).toBe("9876543210");
    expect(result.items[1].tweetId).toBe("9876543210");
    expect(result.items[2].tweetId).toBe("9876543210");

    // Different dimensions
    expect(result.items[0].width).toBe(1200);
    expect(result.items[1].width).toBe(800);
    expect(result.items[2].width).toBe(600);
  });

  it("parses video tweet with highest bitrate MP4", () => {
    const result = parseTimelineResponse(videoTweet);
    expect(result.items).toHaveLength(1);

    const item = result.items[0];
    expect(item.type).toBe("video");
    expect(item.mediaUrl).toContain("1280x720/high.mp4");
    expect(item.bitrate).toBe(2176000);
    expect(item.durationMs).toBe(30000);
    expect(item.width).toBe(1280);
    expect(item.height).toBe(720);
  });

  it("parses animated GIF tweet", () => {
    const result = parseTimelineResponse(gifTweet);
    expect(result.items).toHaveLength(1);

    const item = result.items[0];
    expect(item.type).toBe("animated_gif");
    expect(item.mediaUrl).toContain("gif_file.mp4");
    expect(item.width).toBe(480);
    expect(item.height).toBe(270);
  });

  it("handles TweetWithVisibilityResults wrapper", () => {
    const result = parseTimelineResponse(visibilityResults);
    expect(result.items).toHaveLength(1);

    const item = result.items[0];
    expect(item.tweetId).toBe("3333333333");
    expect(item.type).toBe("photo");
    expect(item.width).toBe(2048);
  });

  it("returns empty array for tweet with no media", () => {
    const result = parseTimelineResponse(noMedia);
    expect(result.items).toHaveLength(0);
  });

  it("handles null/undefined input gracefully", () => {
    expect(parseTimelineResponse(null).items).toHaveLength(0);
    expect(parseTimelineResponse(undefined).items).toHaveLength(0);
    expect(parseTimelineResponse({}).items).toHaveLength(0);
    expect(parseTimelineResponse({ data: {} }).items).toHaveLength(0);
  });

  it("parses TimelineTimelineModule entries (UserMedia grid)", () => {
    const result = parseTimelineResponse(moduleTimeline);
    expect(result.items).toHaveLength(2);

    const photo = result.items[0];
    expect(photo.tweetId).toBe("1111111111");
    expect(photo.type).toBe("photo");
    expect(photo.width).toBe(1600);
    expect(photo.mediaUrl).toContain("name=orig");

    const video = result.items[1];
    expect(video.tweetId).toBe("2222222222");
    expect(video.type).toBe("video");
    expect(video.bitrate).toBe(2176000);
    expect(video.durationMs).toBe(15000);
    expect(video.mediaUrl).toContain("1280x720/high.mp4");

    expect(result.nextCursor).toBe("cursor_next_module_page");
  });

  it("handles malformed entries gracefully", () => {
    const malformed = {
      data: {
        user: {
          result: {
            timeline_v2: {
              timeline: {
                instructions: [
                  {
                    type: "TimelineAddEntries",
                    entries: [
                      { entryId: "tweet-bad", content: {} },
                      { entryId: "tweet-bad2", content: { itemContent: {} } },
                      {
                        entryId: "tweet-bad3",
                        content: {
                          itemContent: {
                            tweet_results: { result: null },
                          },
                        },
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    };
    const result = parseTimelineResponse(malformed);
    expect(result.items).toHaveLength(0);
  });
});

describe("parseUserResponse", () => {
  it("parses user profile", () => {
    const user = parseUserResponse(userResponse);
    expect(user).not.toBeNull();
    expect(user!.restId).toBe("123456789");
    expect(user!.name).toBe("waneella");
    expect(user!.screenName).toBe("waneella_");
    expect(user!.isProtected).toBe(false);
    // Profile image should be upgraded from _normal to _200x200
    expect(user!.profileImageUrl).toContain("_200x200");
    expect(user!.profileImageUrl).not.toContain("_normal");
  });

  it("returns null for UserUnavailable", () => {
    const data = {
      data: {
        user: {
          result: {
            __typename: "UserUnavailable",
            reason: "Suspended",
          },
        },
      },
    };
    expect(parseUserResponse(data)).toBeNull();
  });

  it("returns null for missing data", () => {
    expect(parseUserResponse(null)).toBeNull();
    expect(parseUserResponse({})).toBeNull();
    expect(parseUserResponse({ data: {} })).toBeNull();
  });
});
