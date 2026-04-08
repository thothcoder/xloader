# xloader

Browse and download media (images, videos, GIFs) from any public X account. Chrome extension, no server, no login beyond your existing X session.

## Install

### From Source (Load Unpacked)

1. Clone and build:

```bash
git clone https://github.com/thothcoder/xloader.git
cd xloader
npm install
npm run build
```

2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked** and select the `.output/chrome-mv3/` folder

### Development

```bash
npm run dev
```

This starts WXT in dev mode with hot reload. The extension auto-reloads on file changes.

## Usage

1. **Log in to X** in your browser (the extension uses your existing session)
2. **Navigate to any X profile** (e.g., `x.com/waneella_`)
3. **Click the xloader icon** in your Chrome toolbar. The username auto-populates from the current page.
4. **Click "Load Media"**. The extension scans the account's media timeline and loads thumbnails into a gallery grid. You'll see a live counter as media loads.
5. **Filter by type** using the pills: All, Images, Videos, GIFs. Each shows a count.
6. **Select items** by clicking thumbnails. Use **Shift+click** for range selection, or **Select All** for everything visible.
7. **Click "Download ZIP"**. A zip file downloads containing all selected media at original quality.

### What you get

- Images: original resolution JPGs
- Videos: highest bitrate MP4
- GIFs: MP4 format (how X stores them internally)
- Filename format: `username_YYYYMMDD_tweetid_index.ext`

### Limits

- X's API caps timeline enumeration at ~3,200 tweets. For accounts with more media, you'll get the most recent ~3,200.
- Rate limiting: if X throttles requests, the extension pauses and shows a countdown timer, then auto-resumes.
- The extension only works while you're logged in to X.

## Tech Stack

- **WXT** — Manifest V3 extension framework
- **Preact** — UI framework (3KB gzipped)
- **client-zip** — streaming zip assembly (2.6KB)
- **TypeScript** + **Vitest** for type safety and testing

Total extension size: ~70KB.

## Architecture

```
Extension Popup (Preact, 400x600px)
    │
    ├── Search → Gallery → Download progress
    └── Sends commands via chrome.runtime
            │
Background Service Worker
    ├── Token acquisition (ct0 cookie + public bearer)
    ├── doc_id auto-discovery (parses X's JS bundles)
    ├── UserByScreenName → resolve @username to rest_id
    ├── UserMedia GraphQL pagination (cursor-based)
    └── Rate limit detection + exponential backoff
            │
Offscreen Document
    ├── Fetches media (3 concurrent, orig quality)
    ├── Streams to zip via client-zip
    └── Survives popup close
```

## Testing

```bash
npm test          # run once
npm run test:watch # watch mode
```

28 tests covering parser, auth, discovery, and download engine.

## Project Structure

```
entrypoints/
├── background.ts          — service worker (message routing, scraping)
├── content.ts             — content script (username extraction from URL)
├── popup/                 — Preact popup UI
│   ├── App.tsx
│   └── components/        — SearchState, GalleryState, DownloadState
└── offscreen/             — download engine (zip assembly)

src/
├── scraper/
│   ├── auth.ts            — ct0 cookie + bearer token
│   ├── discovery.ts       — doc_id auto-discovery from X's JS bundles
│   ├── api.ts             — UserByScreenName + UserMedia pagination
│   └── parser.ts          — timeline response parsing
├── download/
│   └── engine.ts          — client-zip streaming + filename generation
└── types.ts               — shared TypeScript types

test/
├── fixtures/              — real X API response shapes (JSON)
├── scraper/               — parser, auth, discovery tests
└── download/              — filename generation tests
```

## License

MIT
