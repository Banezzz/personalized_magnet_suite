import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deduplicateAndValidate,
  extractBtih,
  flattenMagnetCandidates,
  isValidMagnetLink,
  parseSizeToBytes,
  selectPreferredMagnet
} from '../magnet-utils.js';

const HASH_A = 'a'.repeat(40);
const HASH_B = 'b'.repeat(40);
const MAGNET_A = `magnet:?xt=urn:btih:${HASH_A}`;
const MAGNET_B = `magnet:?xt=urn:btih:${HASH_B}&dn=title`;

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

describe('selectPreferredMagnet', () => {
  it('prefers the largest listed size', () => {
    const preferred = selectPreferredMagnet([
      { href: MAGNET_A, sizeText: '700MB' },
      { href: MAGNET_B, sizeText: '4.2GB HD' }
    ]);
    assert.equal(preferred, MAGNET_B);
  });

  it('falls back to the first valid magnet when sizes are missing', () => {
    assert.equal(
      selectPreferredMagnet([{ href: MAGNET_A, sizeText: '' }, { href: MAGNET_B, sizeText: '' }]),
      MAGNET_A
    );
  });
});

describe('flattenMagnetCandidates', () => {
  it('returns only the preferred magnet in first-only mode', () => {
    const result = flattenMagnetCandidates([
      { href: MAGNET_A, sizeText: '1GB' },
      { href: MAGNET_B, sizeText: '8GB' }
    ], true);
    assert.deepEqual(result, [MAGNET_B]);
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
