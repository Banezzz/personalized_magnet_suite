# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome extension (Manifest v3) that provides three main utilities:
1. **Movie Link Opener** - Batch opens movie detail pages from a given URL
2. **Tab Reloader** - Sequential tab refresh with progress tracking
3. **Magnet Link Extractor** - Extracts and copies magnet links from tabs

## Architecture

### Module Structure

The extension uses ES6 modules with a clear separation of concerns:

- **popup.js** - Entry point that initializes all three modules
- **movie-links.js** - Sends movie link tasks to background, receives progress updates
- **tab-reloader.js** - Frontend for tab refresh functionality
- **magnet-extractor.js** - Magnet link extraction and clipboard operations
- **utils.js** - Shared utilities (theme toggle, toast notifications, tab count)
- **background.js** - Service worker handling long-running tasks (movie links, tab refresh)

### Message Passing Architecture

**Movie Link Opener:**
- popup.js sends `openMovieLinks` message to background.js with config (url, batchSize, delaySeconds, isTopMode)
- background.js runs task in background, sends progress updates via `movieProgress`, `movieComplete`, `movieError`
- Tasks continue running even after popup closes

**Tab Reloader:**
- popup.js sends `startRefreshing` / `stopRefreshing` to background.js
- background.js sends `refreshProgress` / `refreshComplete` back to popup
- Uses `safeSendMessage()` helper to suppress "no listener" errors when popup closes

### Key Design Patterns

1. **Background Task Persistence**: Movie link opening runs entirely in background.js service worker, survives popup closure
2. **CSP Compliance**: Uses `chrome.scripting.executeScript` instead of `fetch` + `DOMParser` to extract links from temporary tabs
3. **Anti-Firewall Strategy**:
   - Batched tab opening with configurable size (1-10 tabs per batch)
   - Random jitter (±30%) on delays to mimic human behavior
   - Temporary tab creation for link extraction, immediately closed after use
   - 5-7 second delays between TOP mode pages
4. **Sequential Tab Refresh**: background.js maintains state (`isRefreshing`, `refreshTimeoutId`) and recursively processes tabs
5. **Theme Persistence**: Dark/light mode stored in `chrome.storage.sync` and applied via CSS class on document root
6. **Promise-based Extraction**: magnet-extractor.js uses Promise.all to execute scripts across all tabs concurrently

## Development Commands

### Testing the Extension

```bash
# Load extension in Chrome
# 1. Navigate to chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked" and select project root directory
# 4. After code changes, click "Refresh" on the extension card
```

### File Watching

No build process required - direct hot reload via Chrome's extension refresh.

## Domain-Specific Logic

- **Movie URLs**: Hardcoded to javdb.com with specific selectors (`.movie-list.h.cols-4 a.box`)
- **TOP Option**: Fetches pages 1-8 by appending `?page=N` query parameters
- **Link Extraction Process**:
  1. Creates temporary background tab with target URL
  2. Waits for page load (`status === 'complete'`)
  3. Injects script to extract links via `chrome.scripting.executeScript`
  4. Closes temporary tab immediately after extraction
  5. 10-second timeout protection to prevent hanging
- **Magnet Extraction**: Searches for `<a href="magnet:">` elements across all non-chrome:// tabs
  - "First only" mode: extracts first magnet link per tab
  - "All links" mode: extracts every magnet link from every tab

## Important Implementation Details

### Why use temporary tabs for link extraction?
- Chrome extension CSP policy blocks `fetch()` + `DOMParser` in service workers
- Solution: Create temporary tab → inject script → extract data → close tab
- Ensures compliance while maintaining functionality

### Anti-firewall mechanism defaults
- Default batch size: 2 tabs
- Default delay: 3 seconds with ±30% random jitter
- TOP mode adds extra 5-7 second delay between pages
- All tabs open with `active: false` to reduce browser load

## Common Patterns

### Adding a New Feature Module

1. Create `feature-name.js` with `export function initFeatureName()`
2. Import and call in popup.js `DOMContentLoaded` handler
3. Add UI section to popup.html
4. Use `showToast()` from utils.js for user feedback

### Chrome Extension Permissions

Current permissions in manifest.json:
- `tabs`, `scripting`, `activeTab` - for tab manipulation and content script injection
- `storage` - for theme persistence
- `host_permissions` - broad HTTPS/HTTP access for fetch operations
