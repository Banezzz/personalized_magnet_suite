import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeMagnetName,
  deduplicateAndValidate,
  extractBtih,
  describeMagnetTags,
  flattenMagnetCandidates,
  hasChineseSubtitleLabel,
  hasUncensoredLabel,
  isValidMagnetLink,
  magnetHref,
  magnetPriorityScore,
  parseSizeToBytes,
  selectPreferredMagnet
} from '../magnet-utils.js';

const HASH_A = 'a'.repeat(40);
const HASH_B = 'b'.repeat(40);
const HASH_C = 'c'.repeat(40);
const HASH_D = 'd'.repeat(40);
const HASH_E = 'e'.repeat(40);
const MAGNET_A = `magnet:?xt=urn:btih:${HASH_A}`;
const MAGNET_B = `magnet:?xt=urn:btih:${HASH_B}&dn=title`;
const MAGNET_UC = `magnet:?xt=urn:btih:${HASH_C}&dn=SSIS-001-UC`;
const MAGNET_C = `magnet:?xt=urn:btih:${HASH_D}&dn=SSIS-001-C`;
const MAGNET_U = `magnet:?xt=urn:btih:${HASH_E}&dn=SSIS-001-U`;

describe('isValidMagnetLink', () => {
  it('accepts standard btih magnets', () => {
    assert.equal(isValidMagnetLink(MAGNET_A), true);
    assert.equal(isValidMagnetLink(MAGNET_B), true);
  });

  it('rejects invalid values', () => {
    assert.equal(isValidMagnetLink(''), false);
    assert.equal(isValidMagnetLink('https://example.com'), false);
    assert.equal(isValidMagnetLink('magnet:?xt=urn:btih:short'), false);
  });
});

describe('extractBtih', () => {
  it('returns a lowercase hash', () => {
    assert.equal(extractBtih(`magnet:?xt=urn:btih:${HASH_A.toUpperCase()}`), HASH_A);
  });
});

describe('parseSizeToBytes', () => {
  it('parses common size labels', () => {
    assert.equal(parseSizeToBytes('1.5GB'), 1.5e9);
    assert.equal(parseSizeToBytes('700 MB'), 700e6);
    assert.equal(parseSizeToBytes('no size here'), 0);
  });
});

describe('hasChineseSubtitleLabel', () => {
  it('matches C, UC, and subtitle phrases', () => {
    assert.equal(hasChineseSubtitleLabel('SSIS-001-C'), true);
    assert.equal(hasChineseSubtitleLabel('SSIS-001-UC'), true);
    assert.equal(hasChineseSubtitleLabel('中文字幕 2.1GB'), true);
    assert.equal(hasChineseSubtitleLabel('中英文件'), true);
  });

  it('does not treat U or 无码破解 as subtitles', () => {
    assert.equal(hasChineseSubtitleLabel('PRED-123-U 2.1GB'), false);
    assert.equal(hasChineseSubtitleLabel('无码破解 4.2GB'), false);
    assert.equal(hasChineseSubtitleLabel('Uncensored leak'), false);
  });

  it('does not match C or U inside longer words', () => {
    assert.equal(hasChineseSubtitleLabel('BLUE-RAY 1080p'), false);
    assert.equal(hasChineseSubtitleLabel('UHD extras'), false);
    assert.equal(hasChineseSubtitleLabel('DISC 2'), false);
  });
});

describe('hasUncensoredLabel', () => {
  it('matches U, UC, 无码, and uncensored', () => {
    assert.equal(hasUncensoredLabel('PRED-123-U 2.1GB'), true);
    assert.equal(hasUncensoredLabel('SSIS-001-UC'), true);
    assert.equal(hasUncensoredLabel('无码破解 4.2GB'), true);
    assert.equal(hasUncensoredLabel('Uncensored leak'), true);
    assert.equal(hasUncensoredLabel('中文字幕 700MB'), false);
    assert.equal(hasUncensoredLabel('UHD extras'), false);
  });
});

describe('decodeMagnetName', () => {
  it('reads the dn query parameter', () => {
    assert.equal(decodeMagnetName(MAGNET_UC), 'SSIS-001-UC');
  });
});

describe('magnetPriorityScore', () => {
  const both = { preferSubtitles: true, preferUncensored: true };
  const none = { href: MAGNET_A, sizeText: '普通 8GB' };
  const subtitle = { href: MAGNET_C, sizeText: 'C 700MB' };
  const uncensored = { href: MAGNET_U, sizeText: 'U 无码' };
  const bothLabels = { href: MAGNET_UC, sizeText: 'UC 无码破解 中文字幕' };

  it('adds one point per enabled matching preference', () => {
    assert.equal(magnetPriorityScore(none, both), 0);
    assert.equal(magnetPriorityScore(subtitle, both), 1);
    assert.equal(magnetPriorityScore(uncensored, both), 1);
    assert.equal(magnetPriorityScore(bothLabels, both), 2);
  });

  it('ignores a dimension when that preference is off', () => {
    assert.equal(magnetPriorityScore(uncensored, { preferSubtitles: true, preferUncensored: false }), 0);
    assert.equal(magnetPriorityScore(subtitle, { preferSubtitles: false, preferUncensored: true }), 0);
    assert.equal(magnetPriorityScore(bothLabels, { preferSubtitles: false, preferUncensored: false }), 0);
  });
});

describe('selectPreferredMagnet', () => {
  const mixed = [
    { href: MAGNET_A, sizeText: '普通 8GB' },
    { href: MAGNET_C, sizeText: 'C 700MB' },
    { href: MAGNET_U, sizeText: 'U 无码' },
    { href: MAGNET_UC, sizeText: 'UC 1GB' }
  ];

  it('keeps page order when both preferences are off', () => {
    assert.equal(
      selectPreferredMagnet(mixed, { preferSubtitles: false, preferUncensored: false }),
      MAGNET_A
    );
  });

  it('prefers a subtitle magnet when only preferSubtitles is on', () => {
    assert.equal(
      selectPreferredMagnet(mixed, { preferSubtitles: true, preferUncensored: false }),
      MAGNET_C
    );
  });

  it('prefers an uncensored magnet when only preferUncensored is on', () => {
    assert.equal(
      selectPreferredMagnet(mixed, { preferSubtitles: false, preferUncensored: true }),
      MAGNET_U
    );
  });

  it('scores UC highest when both preferences are on', () => {
    assert.equal(
      selectPreferredMagnet(mixed, { preferSubtitles: true, preferUncensored: true }),
      MAGNET_UC
    );
  });

  it('falls back to the first listed magnet when nothing matches', () => {
    const preferred = selectPreferredMagnet([
      { href: MAGNET_A, sizeText: '普通 700MB' },
      { href: MAGNET_B, sizeText: '普通 4.2GB' }
    ], { preferSubtitles: true, preferUncensored: true });
    assert.equal(preferred, MAGNET_A);
  });
});

describe('describeMagnetTags', () => {
  it('labels subtitle and uncensored magnets', () => {
    assert.deepEqual(describeMagnetTags({ href: MAGNET_C, sizeText: 'C 700MB' }), ['字幕']);
    assert.deepEqual(describeMagnetTags({ href: MAGNET_U, sizeText: 'U 无码' }), ['无码']);
    assert.deepEqual(describeMagnetTags({ href: MAGNET_UC, sizeText: 'UC 1GB' }), ['字幕', '无码']);
    assert.deepEqual(describeMagnetTags({ href: MAGNET_A, sizeText: '普通' }), []);
  });
});

describe('flattenMagnetCandidates', () => {
  it('returns the first listed magnet in first-only mode when both preferences are off', () => {
    const result = flattenMagnetCandidates([
      { href: MAGNET_A, sizeText: '1GB' },
      { href: MAGNET_B, sizeText: '8GB' }
    ], { firstOnly: true, preferSubtitles: false, preferUncensored: false });
    assert.deepEqual(result.map(magnetHref), [MAGNET_A]);
    assert.equal(result[0].usedFallback, false);
  });

  it('still returns one magnet when no priority label matches', () => {
    const result = flattenMagnetCandidates([
      { href: MAGNET_A, sizeText: '普通 1GB' },
      { href: MAGNET_B, sizeText: '普通 8GB' }
    ], { firstOnly: true, preferSubtitles: true, preferUncensored: true });
    assert.deepEqual(result.map(magnetHref), [MAGNET_A]);
    assert.equal(result[0].usedFallback, true);
  });

  it('keeps page order when both preferences are off', () => {
    const result = flattenMagnetCandidates([
      { href: MAGNET_A, sizeText: '8GB' },
      { href: MAGNET_UC, sizeText: 'UC 1GB' },
      { href: MAGNET_B, sizeText: '2GB' }
    ], { firstOnly: false, preferSubtitles: false, preferUncensored: false });
    assert.deepEqual(result.map(magnetHref), [MAGNET_A, MAGNET_UC, MAGNET_B]);
  });

  it('sorts extract-all by combined score then page order', () => {
    const result = flattenMagnetCandidates([
      { href: MAGNET_A, sizeText: '普通 8GB' },
      { href: MAGNET_C, sizeText: 'C 700MB' },
      { href: MAGNET_U, sizeText: 'U 无码' },
      { href: MAGNET_UC, sizeText: 'UC 1GB' }
    ], { firstOnly: false, preferSubtitles: true, preferUncensored: true });
    assert.deepEqual(result.map(magnetHref), [MAGNET_UC, MAGNET_C, MAGNET_U, MAGNET_A]);
    assert.deepEqual(result[0].tags, ['字幕', '无码']);
    assert.equal(result[0].usedFallback, false);
  });
});

describe('deduplicateAndValidate', () => {
  it('counts invalid and duplicate hashes', () => {
    const { validLinks, invalidCount, duplicateCount } = deduplicateAndValidate([
      MAGNET_A,
      `${MAGNET_A}&dn=copy`,
      'not-a-magnet',
      MAGNET_B
    ]);
    assert.deepEqual(validLinks, [MAGNET_A, MAGNET_B]);
    assert.equal(duplicateCount, 1);
    assert.equal(invalidCount, 1);
  });
});
