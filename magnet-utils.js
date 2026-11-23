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
export const ED2K_PREFIX_RE = /^ed2k:\/\/\|file\|[^|]+\|\d+\|[a-fA-F0-9]{32}\|\/$/i;
export const BTIH_RE = /btih:([a-zA-Z0-9]{32,40})/i;
const ED2K_HASH_RE = /ed2k:\/\/\|file\|[^|]*\|\d+\|([a-fA-F0-9]{32})\|\//i;
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

export function isValidEd2kLink(link) {
  if (!link || typeof link !== 'string') return false;
  return ED2K_PREFIX_RE.test(link.trim());
}

/** Magnet or ed2k. Review comments on JavDB use both. */
export function isSelectableLink(link) {
  return isValidMagnetLink(link) || isValidEd2kLink(link);
}

export function extractBtih(link) {
  const match = String(link || '').match(BTIH_RE);
  return match ? match[1].toLowerCase() : null;
}

/** Dedup key. Magnets stay keyed by btih; ed2k uses its own hash. */
export function extractLinkId(link) {
  const btih = extractBtih(link);
  if (btih) return btih;
  const ed2k = String(link || '').match(ED2K_HASH_RE);
  return ed2k ? `ed2k:${ed2k[1].toLowerCase()}` : null;
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
  const valid = (candidates || []).filter((item) => item && isSelectableLink(item.href));
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
  const valid = candidates.filter((item) => item && isSelectableLink(item.href));
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
    if (!isSelectableLink(href)) {
      invalidCount += 1;
      continue;
    }
    const hash = extractLinkId(href);
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

const REVIEW_LINK_RE = /magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}(?:&[^<\s"'`]*)?|ed2k:\/\/\|file\|[^|]+\|\d+\|[a-fA-F0-9]{32}\|\//gi;

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function tidyMagnetHref(value) {
  return decodeHtmlEntities(value)
    .replace(/&amp;/g, '&')
    .replace(/[)\].,;。，、）]+$/g, '');
}

/**
 * Magnet and ed2k links pasted into review HTML or text. The nearby text is
 * kept so LTX and subtitle words in the same comment still score.
 */
export function extractMagnetMentions(text) {
  const source = String(text || '');
  const found = [];
  REVIEW_LINK_RE.lastIndex = 0;
  let match = REVIEW_LINK_RE.exec(source);
  while (match) {
    const href = tidyMagnetHref(match[0]);
    if (isSelectableLink(href)) {
      const start = Math.max(0, match.index - 120);
      const end = Math.min(source.length, match.index + match[0].length + 120);
      const sizeText = decodeHtmlEntities(source.slice(start, end))
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      found.push({ href, sizeText });
    }
    match = REVIEW_LINK_RE.exec(source);
  }
  return found;
}

export function nextReviewPageUrl(html, baseUrl) {
  const source = String(html || '');
  const patterns = [
    /<a[^>]*class="[^"]*pagination-next[^"]*"[^>]*href="([^"]+)"/i,
    /<a[^>]*href="([^"]+)"[^>]*class="[^"]*pagination-next[^"]*"/i,
    /<a[^>]*rel="next"[^>]*href="([^"]+)"/i,
    /<a[^>]*href="([^"]+)"[^>]*>\s*下一[頁页]/i
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match) continue;
    try {
      const url = new URL(decodeHtmlEntities(match[1]), baseUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      return url.href;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Injectable page function: no imports, no closures.
 * Collects magnet hrefs from anchors and clipboard text. When asked, also
 * reads magnet and ed2k links from the JavDB reviews tab for the logged-in
 * session. Reviews are injected into #reviews and are absent from view-source.
 */
export async function collectMagnetsFromPage(includeReviews = false) {
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
  if (!includeReviews) return items;

  const mentionPattern = /magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}(?:&[^<\s"'`]*)?|ed2k:\/\/\|file\|[^|]+\|\d+\|[a-fA-F0-9]{32}\|\//gi;
  const decode = (value) => String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  const addMentions = (text) => {
    const source = String(text || '');
    mentionPattern.lastIndex = 0;
    let match = mentionPattern.exec(source);
    while (match) {
      const href = decode(match[0]).replace(/[)\].,;。，、）]+$/g, '');
      const lower = href.toLowerCase();
      if (lower.startsWith('magnet:') || lower.startsWith('ed2k://|file|')) {
        const start = Math.max(0, match.index - 120);
        const end = Math.min(source.length, match.index + match[0].length + 120);
        const sizeText = decode(source.slice(start, end)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        items.push({ href, sizeText });
      }
      match = mentionPattern.exec(source);
    }
  };
  const nextPage = (html, baseUrl) => {
    const patterns = [
      /<a[^>]*class="[^"]*pagination-next[^"]*"[^>]*href="([^"]+)"/i,
      /<a[^>]*href="([^"]+)"[^>]*class="[^"]*pagination-next[^"]*"/i,
      /<a[^>]*rel="next"[^>]*href="([^"]+)"/i,
      /<a[^>]*href="([^"]+)"[^>]*>\s*下一[頁页]/i
    ];
    for (const pattern of patterns) {
      const match = String(html || '').match(pattern);
      if (!match) continue;
      try {
        const url = new URL(decode(match[1]), baseUrl);
        if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
      } catch {
        return null;
      }
    }
    return null;
  };

  const reviews = document.querySelector('#reviews');
  if (reviews) addMentions(reviews.innerHTML || '');

  const reviewLink = document.querySelector('a.review-tab[data-url]');
  const reviewUrl = reviewLink ? reviewLink.getAttribute('data-url') : '';
  if (!reviewUrl) return items;

  try {
    let next = new URL(reviewUrl, location.origin).href;
    const seen = new Set();
    for (let page = 0; page < 5 && next && !seen.has(next); page += 1) {
      seen.add(next);
      const response = await fetch(next, {
        credentials: 'include',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'text/html'
        }
      });
      if (!response.ok) break;
      const html = await response.text();
      if (!html || html.includes('openAuthModal')) break;
      addMentions(html);
      next = nextPage(html, location.origin);
    }
  } catch {
    // Review magnets are optional. Links already on the page still return.
  }
  return items;
}
