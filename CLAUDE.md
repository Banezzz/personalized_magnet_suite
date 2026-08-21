# CLAUDE.md

Guidance for working in this Manifest v3 Chrome extension.

## Project Overview

Utilities for a JavDB-centered workflow:

1. **Movie Link Opener** — batch-open movie detail pages with site presets
2. **Tab Reloader** — sequential refresh with optional pinned-tab exclusion
3. **Magnet Link Extractor** — extract, prefer, dedupe, validate, and export magnets
4. **History & Logging** — task history and persistent operation logs
5. **Network Status** — `navigator.onLine` indicator

## Architecture

ES modules throughout, including the service worker (`background.type = module`).

- `popup.js` — boots UI modules
- `movie-links.js` — opener UI, settings persistence, progress restore
- `tab-reloader.js` — refresh UI and button states
- `magnet-extractor.js` — in-popup script injection and export
- `background.js` — long-running opener and refresh tasks
- `constants.js` — `SITE_PRESETS`, message actions, storage keys, defaults
- `url-utils.js` — normalize / resolve / dedup / empty-result messages
- `magnet-utils.js` — validation, btih dedup, preferred-magnet selection
- `history-store.js` — DOM-free history writes used by popup and background
- `utils.js` — toast, theme, logs, history display, collapsibles, network
- `permissions.js` — optional host permission requests
- `delay-utils.js` — jittered delay helpers

## Message Passing

Movie opener: `openMovieLinks`, `cancelMovieTask`, `getMovieTaskStatus`, plus `movieProgress` / `movieComplete` / `movieError` / `movieTaskCancelled`.

Tab reloader: `startRefreshing`, `stopRefreshing`, `getRefreshTaskStatus`, `refreshProgress`, `refreshComplete`.

Progress is also persisted under `movieTaskProgress` / `refreshTaskProgress`. The popup listens to `chrome.storage.onChanged` so restore still works if a message was missed.

History completion is written by `background.js` so a closed popup does not leave `RUNNING` entries.

## Task Persistence

In-memory flags are mirrored to `chrome.storage.local`. On service-worker start, `recoverInterruptedTasks()` resumes an in-flight movie task from the last page and marks an in-flight refresh as failed (tab snapshot would be stale).

`chrome.alarms` (`taskKeepAlive`, ~24s) is rescheduled while a movie or refresh task is running.

## Site Presets

Single source: `SITE_PRESETS` in `constants.js`.

```javascript
{
  javdb: { selector: '.movie-list.h.cols-4 a.box', baseUrl: 'https://javdb.com' },
  javbus: { selector: '.movie-box', baseUrl: '' },
  javlibrary: { selector: '.video a[href*="/v="]', baseUrl: '' },
  'generic-list': { selector: 'a[href]', baseUrl: '' },
  custom: { selector: '', baseUrl: '' }
}
```

## Link Extraction

1. Create a temporary background tab
2. Wait for `complete`, then poll the selector until links appear, the page is blocked, or the wait expires
3. Detect Cloudflare / login / timeout and surface a specific message
4. Resolve relative URLs via `resolveRelativeUrl`
5. Close the temp tab (single-settle guard on timeout vs success)

## Anti-firewall defaults

- Batch size 2, delay 3s ±30%
- TOP inter-page delay 5–7s random
- Stop after 2 consecutive empty pages
- Open detail tabs with `active: false`
- Optional tab group named `Movie Links`

## Magnet Validation

- Format: `/^magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}/i`
- Dedup by lowercase btih
- Independent priorities: **优先字幕** and **优先无码** can be combined. Score 0–2 per magnet (subtitle +1, uncensored +1). First-only picks the highest score, then page order; if nothing matches, take the first magnet on the page. Extract-all sorts by score and keeps every link.
- Also reads `data-clipboard-text`

## Storage

- `chrome.storage.sync`: `isDarkTheme`
- `chrome.storage.local`: `taskHistory` (50), `persistentLogs` (200), `movieTaskProgress`, `refreshTaskProgress`, `movieSettings`, `magnetSettings` (`preferSubtitles`, `preferUncensored`)

## Permissions

- Always: `tabs`, `tabGroups`, `scripting`, `storage`, `alarms`, `*://javdb.com/*`, `*://*.javdb.com/*`
- Optional: `http(s)://*/*` requested when the user opens a non-JavDB origin or extracts from other tabs

## Adding a Feature Module

1. Create `feature-name.js` with `export function initFeatureName()`
2. Import and call it from `popup.js`
3. Add UI to `popup.html`
4. Use `showToast`, `addLog`, and `createHistory` / `updateHistory` from `utils.js`
5. Keep comments and identifiers in English; user-facing popup copy may stay Chinese

## Adding a Site Preset

Add the preset to `SITE_PRESETS` in `constants.js` and an `<option>` in `#sitePreset`.

## Tests

```bash
node --test tests/
```

Pure helpers in `url-utils.js` and `magnet-utils.js` are the preferred unit-test targets.
