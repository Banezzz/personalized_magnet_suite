/**
 * Magnet-link validation, size parsing, and deduplication. No Chrome APIs.
 */

import { SUBTITLE_MAGNET_PHRASES, SUBTITLE_MAGNET_TAGS } from './constants.js';

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

function selectLargestMagnet(candidates) {
  let best = candidates[0];
  let bestSize = parseSizeToBytes(best.sizeText);
  for (let i = 1; i < candidates.length; i++) {
    const size = parseSizeToBytes(candidates[i].sizeText);
    if (size > bestSize) {
      best = candidates[i];
      bestSize = size;
    }
  }
  return best.href;
}

export function selectPreferredMagnet(candidates, { preferSubtitles = false } = {}) {
  const valid = (candidates || []).filter((item) => item && isValidMagnetLink(item.href));
  if (valid.length === 0) return null;

  if (preferSubtitles) {
    const withSubs = valid.filter((item) => hasChineseSubtitleLabel(candidateLabelText(item)));
    if (withSubs.length > 0) return withSubs[0].href;
  }
  return selectLargestMagnet(valid);
}

export function flattenMagnetCandidates(candidates, { firstOnly = false, preferSubtitles = false } = {}) {
  if (!candidates || candidates.length === 0) return [];
  const valid = candidates.filter((item) => item && isValidMagnetLink(item.href));
  if (valid.length === 0) return [];
  if (firstOnly) {
    const preferred = selectPreferredMagnet(valid, { preferSubtitles });
    return preferred ? [preferred] : [];
  }
  if (!preferSubtitles) {
    return valid.map((item) => item.href);
  }
  const withSubs = valid.filter((item) => hasChineseSubtitleLabel(candidateLabelText(item)));
  const others = valid.filter((item) => !hasChineseSubtitleLabel(candidateLabelText(item)));
  return [...withSubs, ...others].map((item) => item.href);
}

export function deduplicateAndValidate(links) {
  const seen = new Set();
  const validLinks = [];
  let invalidCount = 0;
  let duplicateCount = 0;

  for (const link of links) {
    if (!isValidMagnetLink(link)) {
      invalidCount += 1;
      continue;
    }
    const hash = extractBtih(link);
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
