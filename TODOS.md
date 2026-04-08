# TODOS

## Testing

- **Integration tests for api.ts (resolveUser, paginateMedia)**
  **Priority:** P1
  Requires fetch + chrome.cookies mocking with pagination simulation.
  Deferred from plan: ~/.claude/plans/cozy-waddling-lagoon.md

- **Report skipped files in download progress**
  **Priority:** P1
  Currently failed downloads are silently skipped. User should see which files were dropped.

## Scraping

- **Date-slicing for large accounts (>3200 tweets)**
  **Priority:** P2
  X's UserMedia endpoint caps at ~3200 tweets. Date-slicing issues multiple
  queries with `until:` and `since:` date ranges to enumerate beyond this cap.
  Target: v1.1

## Platform

- **Firefox support**
  **Priority:** P3
  WXT makes this easy but deferred until Chrome is solid. Use webextension-polyfill.
  Target: v1.1

- **Side panel mode**
  **Priority:** P3
  Side panel stays open (full-height sidebar) vs popup (400x600, closes on click outside).
  Target: v1.1

## Completed
