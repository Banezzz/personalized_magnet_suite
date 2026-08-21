/**
 * Magnet-link validation, size parsing, and deduplication. No Chrome APIs.
 */

import {
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
  const pattern = new RegExp(`(?<![A-Za-z])${tag}(?![A-Za-z])`, 'i');
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
  const source = String(text || '');
  if (!source) return false;
  const lower = source.toLowerCase();
  for (const phrase of UNCENSORED_MAGNET_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) return true;
  }
  for (const tag of UNCENSORED_MAGNET_TAGS) {
    if (hasStandaloneTag(source, tag)) return true;
  }
  return false;
}

export function magnetPriorityScore(item, { preferSubtitles = false, preferUncensored = false } = {}) {
  const label = candidateLabelText(item);
  let score = 0;
  if (preferSubtitles && hasChineseSubtitleLabel(label)) score += 1;
  if (preferUncensored && hasUncensoredLabel(label)) score += 1;
  return score;
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
  let bestScore = magnetPriorityScore(best, options);
  for (let i = 1; i < valid.length; i++) {
    const score = magnetPriorityScore(valid[i], options);
    if (score > bestScore) {
      best = valid[i];
      bestScore = score;
    }
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
    .sort((left, right) => magnetPriorityScore(right, options) - magnetPriorityScore(left, options))
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
