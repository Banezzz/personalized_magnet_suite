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
- **movie-links.js** - Handles movie link fetching and tab opening
- **tab-reloader.js** - Frontend for tab refresh functionality
- **magnet-extractor.js** - Magnet link extraction and clipboard operations
- **utils.js** - Shared utilities (theme toggle, toast notifications, tab count)
- **background.js** - Service worker handling sequential tab refresh logic

### Message Passing Architecture

The tab reloader uses Chrome's message passing between popup and service worker:
- Popup sends `startRefreshing` / `stopRefreshing` to background.js
- Background.js sends `refreshProgress` / `refreshComplete` back to popup
- Uses `safeSendMessage()` helper to suppress "no listener" errors when popup closes

### Key Design Patterns

1. **Sequential Tab Refresh**: background.js maintains state (`isRefreshing`, `refreshTimeoutId`) and recursively processes tabs with configurable intervals
2. **Theme Persistence**: Dark/light mode stored in `chrome.storage.sync` and applied via CSS class on document root
3. **Promise-based Extraction**: magnet-extractor.js uses Promise.all to execute scripts across all tabs concurrently before displaying results

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
- **Magnet Extraction**: Searches for `<a href="magnet:">` elements across all non-chrome:// tabs
  - "First only" mode: extracts first magnet link per tab
  - "All links" mode: extracts every magnet link from every tab

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
