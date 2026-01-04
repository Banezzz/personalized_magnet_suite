# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome extension (Manifest v3) that provides comprehensive utilities:
1. **Movie Link Opener** - Batch opens movie detail pages with multi-site support
2. **Tab Reloader** - Sequential tab refresh with pinned tab exclusion
3. **Magnet Link Extractor** - Extracts, deduplicates, validates, and exports magnet links
4. **History & Logging** - Task history tracking and real-time operation logs
5. **Network Status** - Real-time network connectivity monitoring

## Architecture

### Module Structure

The extension uses ES6 modules with a clear separation of concerns:

- **popup.js** - Entry point that initializes all modules and UI components
- **movie-links.js** - Movie link opener with site presets and custom selectors
- **tab-reloader.js** - Tab refresh with pinned tab exclusion option
- **magnet-extractor.js** - Magnet extraction with deduplication, validation, and export
- **utils.js** - Shared utilities:
  - Theme toggle (dark/light mode)
  - Toast notifications
  - Tab count display
  - **Logging system** (addLog, clearLogs)
  - **History management** (saveHistory, loadHistory, clearHistory)
  - **Collapsible panels** (initCollapsibles)
  - **Network status detection** (initNetworkStatus)
  - **Task queue management** (addToQueue, processQueue, clearQueue)
- **background.js** - Service worker handling long-running tasks

### Message Passing Architecture

**Movie Link Opener:**
- popup.js sends `openMovieLinks` message with config (url, batchSize, delaySeconds, isTopMode, **selector**, **baseUrl**)
- background.js runs task in background, sends progress updates via `movieProgress`, `movieComplete`, `movieError`, `movieTaskCancelled`
- Tasks continue running even after popup closes
- Supports `cancelMovieTask` message to abort running tasks

**Tab Reloader:**
- popup.js sends `startRefreshing` / `stopRefreshing` to background.js
- Includes `excludePinned` option to skip pinned tabs
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
   - Automatic duplicate link filtering
4. **Multi-Site Support**: Configurable CSS selectors for different websites (JavDB, JavBus, JavLibrary, custom)
5. **Sequential Tab Refresh**: background.js maintains state (`isRefreshing`, `refreshTimeoutId`) and recursively processes tabs
6. **Theme Persistence**: Dark/light mode stored in `chrome.storage.sync` and applied via CSS class on document root
7. **Promise-based Extraction**: magnet-extractor.js uses Promise.all to execute scripts across all tabs concurrently
8. **Magnet Link Validation**: Validates `magnet:?xt=urn:btih:` format and deduplicates by btih hash
9. **Collapsible UI Panels**: History and log sections use expandable/collapsible pattern
10. **Network Status Monitoring**: Uses `navigator.onLine` and `online`/`offline` events

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

### Site Presets (movie-links.js & background.js)

```javascript
const SITE_PRESETS = {
  javdb: {
    selector: '.movie-list.h.cols-4 a.box',
    baseUrl: 'https://javdb.com'
  },
  javbus: {
    selector: '.movie-box',
    baseUrl: ''  // Inferred from page URL
  },
  javlibrary: {
    selector: '.video a[href*="/v="]',
    baseUrl: ''
  },
  'generic-list': {
    selector: 'a[href]',
    baseUrl: ''
  },
  custom: {
    selector: '',  // User-provided
    baseUrl: ''
  }
};
```

### Link Extraction Process
1. Creates temporary background tab with target URL
2. Waits for page load (`status === 'complete'`)
3. Injects script with **configurable selector** via `chrome.scripting.executeScript`
4. Handles relative URLs by combining with baseUrl or inferring from page origin
5. Closes temporary tab immediately after extraction
6. 10-second timeout protection to prevent hanging

### Magnet Link Validation
- Validates format: `/^magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}/i`
- Deduplicates by extracting and comparing btih hash
- Reports statistics: valid, duplicate, invalid counts

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

### Storage Usage
- `chrome.storage.sync`: Theme preference (`isDarkTheme`)
- `chrome.storage.local`: Task history (`taskHistory`, max 50 entries)

## Common Patterns

### Adding a New Feature Module

1. Create `feature-name.js` with `export function initFeatureName()`
2. Import and call in popup.js `DOMContentLoaded` handler
3. Add UI section to popup.html
4. Use utilities from utils.js:
   - `showToast(message)` for user feedback
   - `addLog(message, level)` for logging (levels: info, success, warning, error)
   - `saveHistory({ action, result })` for history tracking

### Adding a New Site Preset

1. Add preset to `SITE_PRESETS` in movie-links.js
2. Add corresponding option to `<select id="sitePreset">` in popup.html
3. Preset will automatically work with background.js (it receives selector via message)

### Chrome Extension Permissions

Current permissions in manifest.json:
- `tabs`, `scripting`, `activeTab` - for tab manipulation and content script injection
- `storage` - for theme and history persistence
- `host_permissions` - broad HTTPS/HTTP access for fetch operations

## UI Components

### Collapsible Sections
```html
<div class="section collapsible">
  <h2 class="section-header" id="toggleId">
    <span>Title</span>
    <span class="toggle-icon">▼</span>
  </h2>
  <div id="contentId" class="collapsible-content" style="display:none;">
    <!-- Content -->
  </div>
</div>
```

### Button Variants
- Primary: Default button style
- Secondary: `.secondary-btn` class for less prominent actions
- Cancel: `.cancel-btn` class for destructive/cancel actions

### Network Status
```html
<div id="networkStatus" class="network-status online">
  <span class="status-dot"></span>
  <span class="status-text">网络正常</span>
</div>
```
