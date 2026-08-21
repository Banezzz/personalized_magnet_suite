# Super Link & Tab Manager

Chrome extension (Manifest v3) for batch-opening movie detail pages, refreshing tabs, and extracting magnet links. The daily workflow is optimized for [JavDB](https://javdb.com). The popup title is **链接与磁力**.

## Features

### 1. Movie Link Opener
Parses a list page and opens detail tabs in the background.

- Single-page or TOP (multi-page) mode
- Configurable page count with early stop on consecutive empty pages
- Batch size (1-10) and delay (1-30s) with ±30% jitter
- Randomized 5-7s delay between TOP pages
- Parses first, then asks to confirm with **将打开 N 个详情** before opening tabs
- Background opening continues after the popup closes; a closed popup during preview keeps the confirm until you reopen
- Cancel, progress restore, and history finalization from the service worker
- Site presets: JavDB, JavBus, JavLibrary, generic list, custom CSS selector
- “Use current tab” plus remembered last URL / settings
- Normalized URL dedup (JavDB `/v/...` ignores `lang` and similar params)
- Optional Chrome tab group for opened detail pages
- Actionable empty-result reasons (Cloudflare, login, timeout, selector)

### 2. Tab Reloader
Sequentially reloads tabs in the current window.

- Collapsed by default so the daily open → extract path stays short
- One start/stop toggle and a visible interval label
- Optional pinned-tab exclusion and progress restore

### 3. Magnet Link Extractor
Scans the current window for magnet links.

- Choose **优先字幕** / **优先无码** first, then **每页一条** or **全部**, then extract
- Results stay hidden until a run finishes and show 字幕 / 无码 tags plus a fallback note when the first magnet was used
- First-only picks the highest score, then page order; if nothing matches, it still takes the first magnet on the page. Extract-all keeps every link and only sorts by score.
- Reads `a[href^="magnet:"]` and `data-clipboard-text`
- Dedup by btih hash and format validation
- Per-tab stats: has magnets / empty / failed
- Copy, export TXT, export JSON

### 4. History & Logs
- Collapsible panels
- Last 50 history entries with running / completed / failed / cancelled
- Last 200 persistent logs
- Background writes the final history status so closing the popup does not leave tasks stuck on “running”

### 5. Network status and theme
- Online/offline indicator
- Dark / light theme stored in `chrome.storage.sync`

## Install

1. Clone this repository
2. Open `chrome://extensions`
3. Enable Developer mode
4. Click **Load unpacked** and select the project root

## Recommended opener settings

| Mode | Batch | Delay |
|------|-------|-------|
| Conservative (default) | 2 | 3s |
| Faster | 3 | 2s |
| Extra safe | 1 | 5s |

JavDB host access is granted by default. Other sites prompt for optional host permission when you start a task.

## Architecture

- `background.js` is an ES module service worker
- Shared modules: `constants.js`, `url-utils.js`, `magnet-utils.js`, `history-store.js`
- Task state lives in `chrome.storage.local`; `chrome.alarms` keeps the worker alive during long runs
- Popup UI stays in Chinese; code comments and identifiers are English

```
.
├── manifest.json
├── popup.html / popup.js / popup.css
├── background.js
├── movie-links.js
├── tab-reloader.js
├── magnet-extractor.js
├── utils.js
├── constants.js
├── url-utils.js
├── magnet-utils.js
├── history-store.js
├── delay-utils.js
├── permissions.js
├── icon.png
├── tests/
└── README.md
```

## Development

No build step. After editing files, click **Refresh** on the extension card.

```bash
node --test tests/
```

## License

MIT
