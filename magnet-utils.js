/**
 * Magnet-link validation, size parsing, and deduplication. No Chrome APIs.
 */

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

export function selectPreferredMagnet(candidates) {
  const valid = (candidates || []).filter((item) => item && isValidMagnetLink(item.href));
  if (valid.length === 0) return null;

  let best = valid[0];
  let bestSize = parseSizeToBytes(best.sizeText);
  for (let i = 1; i < valid.length; i++) {
    const size = parseSizeToBytes(valid[i].sizeText);
    if (size > bestSize) {
      best = valid[i];
      bestSize = size;
    }
  }
  return best.href;
}

export function flattenMagnetCandidates(candidates, firstOnly) {
  if (!candidates || candidates.length === 0) return [];
  if (firstOnly) {
    const preferred = selectPreferredMagnet(candidates);
    return preferred ? [preferred] : [];
  }
  return candidates.map((item) => item.href).filter((href) => isValidMagnetLink(href));
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
