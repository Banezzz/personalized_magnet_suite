/**
 * Magnet-link validation, size parsing, and deduplication. No Chrome APIs.
 */

import {
  LTX_MAGNET_TAGS,
  SUBTITLE_MAGNET_PHRASES,
  SUBTITLE_MAGNET_TAGS,
  UNCENSORED_MAGNET_PHRASES,
  UNCENSORED_MAGNET_TAGS
} from './constants.js';

export const MAGNET_PREFIX_RE = /^magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}/i;
export const BTIH_RE = /btih:([a-zA-Z0-9]{32,40})/i;
export const SIZE_RE = /(\d+(?:\.\d+)?)\s*(tib|tb|gib|gb|mib|mb|kib|kb|b)\b/i;

const SIZE_MULTIPLIERS = {
  b: 1,
  kb: 1e3,
  kib: 1024,
  mb: 1e6,
  mib: 1024 ** 2,
  gb: 1e9,
  gib: 1024 ** 3,
  tb: 1e12,
  tib: 1024 ** 4
};

export function isValidMagnetLink(link) {
  if (!link || typeof link !== 'string') return false;
  return MAGNET_PREFIX_RE.test(link.trim());
}

export function extractBtih(link) {
  const match = String(link || '').match(BTIH_RE);
  return match ? match[1].toLowerCase() : null;
}

export function parseSizeToBytes(text) {
  if (!text) return 0;
  const match = String(text).match(SIZE_RE);
  if (!match) return 0;
  const amount = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  return amount * (SIZE_MULTIPLIERS[unit] || 0);
}

export function decodeMagnetName(href) {
  if (!href || typeof href !== 'string') return '';
  const queryIndex = href.indexOf('?');
  if (queryIndex === -1) return '';
  try {
    const params = new URLSearchParams(href.slice(queryIndex + 1));
    return decodeURIComponent(params.get('dn') || '');
  } catch {
    return '';
  }
}

export function candidateLabelText(item) {
  const href = item?.href || '';
  return [item?.sizeText || '', href, decodeMagnetName(href)].join('\n');
}

function hasStandaloneTag(text, tag) {
  // Digit boundaries matter: a hex info hash often contains a lone "c".
  const pattern = new RegExp(`(?<![A-Za-z0-9])${tag}(?![A-Za-z0-9])`, 'i');
  return pattern.test(text);
}

/**
 * True when the magnet is marked as having Chinese subtitles:
 * C, UC, 中文字幕, 中英字幕, or 中英文件.
 * U and 无码破解 mean uncensored without subtitles, so they do not match.
 */
export function hasChineseSubtitleLabel(text) {
  const source = String(text || '');
  if (!source) return false;
  const lower = source.toLowerCase();
  for (const phrase of SUBTITLE_MAGNET_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) return true;
  }
  for (const tag of SUBTITLE_MAGNET_TAGS) {
    if (hasStandaloneTag(source, tag)) return true;
  }
  return false;
}

export function hasUncensoredLabel(text) {
  return uncensoredTier(text) > 0;
}

/**
 * 0 = not uncensored, 1 = restored / 无码 / uncensored / U / UC, 2 = LTX.
 * LTX stays in its own tier so it sorts ahead of the other uncensored markers.
 */
export function uncensoredTier(text) {
  const source = String(text || '');
  if (!source) return 0;
  for (const tag of LTX_MAGNET_TAGS) {
    if (hasStandaloneTag(source, tag)) return 2;
  }
  const lower = source.toLowerCase();
  for (const phrase of UNCENSORED_MAGNET_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) return 1;
  }
  for (const tag of UNCENSORED_MAGNET_TAGS) {
    if (hasStandaloneTag(source, tag)) return 1;
  }
  return 0;
}

function preferenceParts(item, { preferSubtitles = false, preferUncensored = false } = {}) {
  const label = candidateLabelText(item);
  const subtitle = preferSubtitles && hasChineseSubtitleLabel(label) ? 1 : 0;
  const tier = preferUncensored ? uncensoredTier(label) : 0;
  return {
    score: subtitle + (tier > 0 ? 1 : 0),
    ltx: tier === 2 ? 1 : 0
  };
}

export function magnetPriorityScore(item, options = {}) {
  return preferenceParts(item, options).score;
}

/**
 * Higher score first. LTX breaks ties with other uncensored magnets and with
 * subtitle-only magnets. Equal keys stay in page order via a stable sort.
 * Returns negative when left should come first.
 */
function compareMagnetPreference(left, right, options) {
  const a = preferenceParts(left, options);
  const b = preferenceParts(right, options);
  if (a.score !== b.score) return b.score - a.score;
  return b.ltx - a.ltx;
}

export function magnetHref(value) {
  if (!value) return '';
  return typeof value === 'string' ? value : (value.href || '');
}

export function describeMagnetTags(item) {
  const label = typeof item === 'string' ? item : candidateLabelText(item);
  const tags = [];
  if (hasChineseSubtitleLabel(label)) tags.push('字幕');
  if (hasUncensoredLabel(label)) tags.push('无码');
  return tags;
}

export function toMagnetResult(item, { firstOnly = false, ...options } = {}) {
  const prefsOn = !!(options.preferSubtitles || options.preferUncensored);
  const score = magnetPriorityScore(item, options);
  return {
    href: item.href,
    tags: describeMagnetTags(item),
    score,
    usedFallback: firstOnly && prefsOn && score === 0
  };
}

export function selectPreferredMagnetItem(candidates, options = {}) {
  const valid = (candidates || []).filter((item) => item && isValidMagnetLink(item.href));
  if (valid.length === 0) return null;

  let best = valid[0];
  for (let i = 1; i < valid.length; i++) {
    if (compareMagnetPreference(valid[i], best, options) < 0) best = valid[i];
  }
  return best;
}

export function selectPreferredMagnet(candidates, options = {}) {
  const best = selectPreferredMagnetItem(candidates, options);
  return best ? best.href : null;
}

export function flattenMagnetCandidates(candidates, { firstOnly = false, ...options } = {}) {
  if (!candidates || candidates.length === 0) return [];
  const valid = candidates.filter((item) => item && isValidMagnetLink(item.href));
  if (valid.length === 0) return [];
  const resultOptions = { firstOnly, ...options };
  if (firstOnly) {
    const preferred = selectPreferredMagnetItem(valid, options);
    return preferred ? [toMagnetResult(preferred, resultOptions)] : [];
  }
  return [...valid]
    .sort((left, right) => compareMagnetPreference(left, right, options))
    .map((item) => toMagnetResult(item, resultOptions));
}

export function deduplicateAndValidate(links) {
  const seen = new Set();
  const validLinks = [];
  let invalidCount = 0;
  let duplicateCount = 0;

  for (const link of links) {
    const href = magnetHref(link);
    if (!isValidMagnetLink(href)) {
      invalidCount += 1;
      continue;
    }
    const hash = extractBtih(href);
    if (!hash) {
      invalidCount += 1;
      continue;
    }
    if (seen.has(hash)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(hash);
    validLinks.push(link);
  }

  return { validLinks, invalidCount, duplicateCount };
}

/**
 * Injectable page function: no imports, no closures.
 * Collects magnet hrefs from anchors and clipboard-text attributes.
 */
export function collectMagnetsFromPage() {
  const items = [];
  const push = (href, sizeText) => {
    if (!href || typeof href !== 'string') return;
    const trimmed = href.trim();
    if (!trimmed.toLowerCase().startsWith('magnet:')) return;
    items.push({ href: trimmed, sizeText: sizeText || '' });
  };

  document.querySelectorAll('a[href^="magnet:"]').forEach((anchor) => {
    const row = anchor.closest('tr, li, .item, .magnet-name, .column');
    push(anchor.href, row ? row.innerText : anchor.textContent);
  });
  document.querySelectorAll('[data-clipboard-text]').forEach((el) => {
    push(el.getAttribute('data-clipboard-text'), (el.closest('tr, li, .item') || el).innerText);
  });
  return items;
}
