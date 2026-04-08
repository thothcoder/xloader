/**
 * Content script. Injected on x.com pages.
 *
 * Extracts the current profile's screen_name from the URL
 * so the popup can auto-populate it.
 */

export default defineContentScript({
  matches: ["https://x.com/*"],

  main() {
    // Listen for the popup asking for the current username
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === "GET_USERNAME") {
        const username = extractUsername();
        sendResponse({ username });
      }
      return false;
    });
  },
});

function extractUsername(): string | null {
  const path = window.location.pathname;
  // Match /@username or /username (not /home, /search, /settings, etc.)
  const reserved = new Set([
    "home",
    "explore",
    "search",
    "notifications",
    "messages",
    "settings",
    "i",
    "compose",
    "lists",
    "bookmarks",
    "communities",
  ]);

  const match = path.match(/^\/(@?[\w]+)/);
  if (!match) return null;

  const name = match[1].replace(/^@/, "");
  if (reserved.has(name.toLowerCase())) return null;

  return name;
}
