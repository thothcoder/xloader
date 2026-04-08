# Changelog

All notable changes to xloader will be documented in this file.

## [0.1.0.1] - 2026-04-08

### Changed
- Switch package manager from npm to bun for faster installs and script execution
- Exclude npm/yarn lockfiles from git to prevent accidental lockfile conflicts

## [0.1.0.0] - 2026-04-08

### Added
- Browse all media (images, videos, GIFs) from any public X account in a gallery popup
- Auto-populate username from the current X profile page
- Filter media by type (All, Images, Videos, GIFs) with counts
- Select individual items, shift-click range selection, and Select All
- Download selected media as a zip file via offscreen document
- GraphQL scraping engine with cursor-based pagination (~3200 tweet cap)
- doc_id auto-discovery from X's JS bundles with 24h cache and remote fallback
- Rate limit detection with exponential backoff (30s, 60s, 120s)
- Error handling for not-found, suspended, and private accounts
- 28 tests covering parser, auth, discovery, and download engine
