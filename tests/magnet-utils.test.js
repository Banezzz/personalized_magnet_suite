import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeMagnetName,
  deduplicateAndValidate,
  extractBtih,
  flattenMagnetCandidates,
  hasChineseSubtitleLabel,
  isValidMagnetLink,
  parseSizeToBytes,
  selectPreferredMagnet
} from '../magnet-utils.js';

const HASH_A = 'a'.repeat(40);
const HASH_B = 'b'.repeat(40);
const HASH_C = 'c'.repeat(40);
const HASH_D = 'd'.repeat(40);
const MAGNET_A = `magnet:?xt=urn:btih:${HASH_A}`;
const MAGNET_B = `magnet:?xt=urn:btih:${HASH_B}&dn=title`;
const MAGNET_UC = `magnet:?xt=urn:btih:${HASH_C}&dn=SSIS-001-UC`;
const MAGNET_C = `magnet:?xt=urn:btih:${HASH_D}&dn=SSIS-001-C`;

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

describe('decodeMagnetName', () => {
  it('reads the dn query parameter', () => {
    assert.equal(decodeMagnetName(MAGNET_UC), 'SSIS-001-UC');
  });
});

describe('selectPreferredMagnet', () => {
  it('uses the largest size when subtitle preference is off', () => {
    const preferred = selectPreferredMagnet([
      { href: MAGNET_C, sizeText: 'C 700MB' },
      { href: MAGNET_A, sizeText: '4.2GB HD' }
    ], { preferSubtitles: false });
    assert.equal(preferred, MAGNET_A);
  });

  it('prefers the first subtitle magnet when the option is on', () => {
    const preferred = selectPreferredMagnet([
      { href: MAGNET_A, sizeText: '无码破解 8GB' },
      { href: MAGNET_C, sizeText: 'C 700MB' },
      { href: MAGNET_UC, sizeText: 'UC 1GB' }
    ], { preferSubtitles: true });
    assert.equal(preferred, MAGNET_C);
  });

  it('skips U-only magnets when preferring subtitles', () => {
    const preferred = selectPreferredMagnet([
      { href: MAGNET_A, sizeText: 'U 6GB' },
      { href: MAGNET_UC, sizeText: 'UC 1GB' }
    ], { preferSubtitles: true });
    assert.equal(preferred, MAGNET_UC);
  });

  it('falls back to the largest size when no subtitle label matches', () => {
    const preferred = selectPreferredMagnet([
      { href: MAGNET_A, sizeText: '无码破解 700MB' },
      { href: MAGNET_B, sizeText: 'U 4.2GB' }
    ], { preferSubtitles: true });
    assert.equal(preferred, MAGNET_B);
  });
});

describe('flattenMagnetCandidates', () => {
  it('returns only the preferred magnet in first-only mode', () => {
    const result = flattenMagnetCandidates([
      { href: MAGNET_A, sizeText: '1GB' },
      { href: MAGNET_B, sizeText: '8GB' }
    ], { firstOnly: true, preferSubtitles: false });
    assert.deepEqual(result, [MAGNET_B]);
  });

  it('keeps page order when subtitle preference is off', () => {
    const result = flattenMagnetCandidates([
      { href: MAGNET_A, sizeText: '8GB' },
      { href: MAGNET_UC, sizeText: 'UC 1GB' },
      { href: MAGNET_B, sizeText: '2GB' }
    ], { firstOnly: false, preferSubtitles: false });
    assert.deepEqual(result, [MAGNET_A, MAGNET_UC, MAGNET_B]);
  });

  it('lists subtitle magnets first when the option is on', () => {
    const result = flattenMagnetCandidates([
      { href: MAGNET_A, sizeText: '无码破解 8GB' },
      { href: MAGNET_UC, sizeText: 'UC 1GB' },
      { href: MAGNET_B, sizeText: '2GB' }
    ], { firstOnly: false, preferSubtitles: true });
    assert.deepEqual(result, [MAGNET_UC, MAGNET_A, MAGNET_B]);
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
