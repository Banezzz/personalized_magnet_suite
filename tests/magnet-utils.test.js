import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeMagnetName,
  deduplicateAndValidate,
  extractBtih,
  describeMagnetTags,
  extractMagnetMentions,
  flattenMagnetCandidates,
  hasChineseSubtitleLabel,
  hasUncensoredLabel,
  isValidMagnetLink,
  magnetHref,
  magnetPriorityScore,
  nextReviewPageUrl,
  parseSizeToBytes,
  selectPreferredMagnet
} from '../magnet-utils.js';

const HASH_A = 'a'.repeat(40);
const HASH_B = 'b'.repeat(40);
const HASH_C = 'c'.repeat(40);
const HASH_D = 'd'.repeat(40);
const HASH_E = 'e'.repeat(40);
const HASH_F = 'f'.repeat(40);
const HASH_G = '1'.repeat(40);
const MAGNET_A = `magnet:?xt=urn:btih:${HASH_A}`;
const MAGNET_B = `magnet:?xt=urn:btih:${HASH_B}&dn=title`;
const MAGNET_UC = `magnet:?xt=urn:btih:${HASH_C}&dn=SSIS-001-UC`;
const MAGNET_C = `magnet:?xt=urn:btih:${HASH_D}&dn=SSIS-001-C`;
const MAGNET_U = `magnet:?xt=urn:btih:${HASH_E}&dn=SSIS-001-U`;
const MAGNET_RESTORED = `magnet:?xt=urn:btih:${HASH_F}&dn=SNOS-380_restored_wm.mp4`;
const MAGNET_LTX = `magnet:?xt=urn:btih:${HASH_G}&dn=MIDA-861-LTX`;

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

  it('does not treat U, LTX, or 无码破解 as subtitles', () => {
    assert.equal(hasChineseSubtitleLabel('PRED-123-U 2.1GB'), false);
    assert.equal(hasChineseSubtitleLabel('SSIS-001-LTX'), false);
    assert.equal(hasChineseSubtitleLabel('无码破解 4.2GB'), false);
    assert.equal(hasChineseSubtitleLabel('Uncensored leak'), false);
  });

  it('does not match C or U inside longer words or info hashes', () => {
    assert.equal(hasChineseSubtitleLabel('BLUE-RAY 1080p'), false);
    assert.equal(hasChineseSubtitleLabel('UHD extras'), false);
    assert.equal(hasChineseSubtitleLabel('DISC 2'), false);
    assert.equal(
      hasChineseSubtitleLabel('magnet:?xt=urn:btih:5b0de8b27acf3273b89b0e363c1cd5b6225c531e&dn=MIDA-861'),
      false
    );
  });
});

describe('hasUncensoredLabel', () => {
  it('matches U, UC, LTX, restored, 无码, and uncensored', () => {
    assert.equal(hasUncensoredLabel('PRED-123-U 2.1GB'), true);
    assert.equal(hasUncensoredLabel('SSIS-001-UC'), true);
    assert.equal(hasUncensoredLabel('SSIS-001-LTX'), true);
    assert.equal(hasUncensoredLabel('ssis-001-ltx 1080p'), true);
    assert.equal(hasUncensoredLabel('SSIS-001-LTX-C'), true);
    assert.equal(hasChineseSubtitleLabel('SSIS-001-LTX-C'), true);
    assert.equal(hasUncensoredLabel('SNOS-380_restored_wm.mp4'), true);
    assert.equal(hasUncensoredLabel('SNOS-380_RESTORED_WM.mp4'), true);
    assert.equal(hasChineseSubtitleLabel('SNOS-380_restored_wm.mp4'), false);
    assert.equal(hasUncensoredLabel('unrestored copy'), false);
    assert.equal(hasUncensoredLabel('无码破解 4.2GB'), true);
    assert.equal(hasUncensoredLabel('Uncensored leak'), true);
    assert.equal(hasUncensoredLabel('中文字幕 700MB'), false);
    assert.equal(hasUncensoredLabel('UHD extras'), false);
    assert.equal(hasUncensoredLabel('VOLTX 1080p'), false);
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

  it('ranks LTX above restored and other uncensored magnets', () => {
    const candidates = [
      { href: MAGNET_RESTORED, sizeText: 'SNOS-380_restored_wm.mp4' },
      { href: MAGNET_U, sizeText: 'SNOS-380-U' },
      { href: MAGNET_A, sizeText: 'SNOS-380' },
      { href: MAGNET_LTX, sizeText: 'MIDA-861-LTX' }
    ];
    assert.equal(
      selectPreferredMagnet(candidates, { preferSubtitles: false, preferUncensored: true }),
      MAGNET_LTX
    );
    const all = flattenMagnetCandidates(candidates, {
      firstOnly: false,
      preferSubtitles: false,
      preferUncensored: true
    });
    assert.deepEqual(all.map(magnetHref), [MAGNET_LTX, MAGNET_RESTORED, MAGNET_U, MAGNET_A]);
    assert.deepEqual(all[1].tags, ['无码']);
  });

  it('keeps subtitle plus uncensored ahead of LTX alone when both preferences are on', () => {
    assert.equal(
      selectPreferredMagnet([
        { href: MAGNET_LTX, sizeText: 'MIDA-861-LTX' },
        { href: MAGNET_UC, sizeText: 'UC 中文字幕' }
      ], { preferSubtitles: true, preferUncensored: true }),
      MAGNET_UC
    );
  });

  it('lets LTX outrank a subtitle-only magnet when both preferences are on', () => {
    assert.equal(
      selectPreferredMagnet([
        { href: MAGNET_C, sizeText: 'SNOS-380-C' },
        { href: MAGNET_LTX, sizeText: 'MIDA-861-LTX' }
      ], { preferSubtitles: true, preferUncensored: true }),
      MAGNET_LTX
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
    assert.deepEqual(describeMagnetTags({ href: MAGNET_A, sizeText: 'SNOS-380_restored_wm.mp4' }), ['无码']);
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

describe('extractMagnetMentions', () => {
  it('reads a magnet pasted in review html and keeps nearby LTX text', () => {
    const html = `评论 LTX破解 <div>magnet:?xt=urn:btih:${HASH_G}&amp;dn=PRWF-017-LTX</div>`;
    const found = extractMagnetMentions(html);
    assert.equal(found.length, 1);
    assert.equal(found[0].href, `magnet:?xt=urn:btih:${HASH_G}&dn=PRWF-017-LTX`);
    assert.equal(hasUncensoredLabel(`${found[0].sizeText}\n${found[0].href}`), true);
  });

  it('ignores short or broken magnet text', () => {
    assert.deepEqual(extractMagnetMentions('magnet:?xt=urn:btih:short 普通链接'), []);
  });

  it('lets a review LTX magnet outrank an earlier plain magnet', () => {
    const review = extractMagnetMentions(`LTX magnet:?xt=urn:btih:${HASH_G}&dn=PRWF-017-LTX`);
    const preferred = selectPreferredMagnet([
      { href: MAGNET_A, sizeText: 'PRWF-017' },
      ...review
    ], { preferSubtitles: false, preferUncensored: true });
    assert.equal(preferred, review[0].href);
  });
});

describe('nextReviewPageUrl', () => {
  it('resolves the next reviews page', () => {
    const html = '<a class="pagination-next" href="/v/WwWEVQ/reviews/lastest?page=2">下一頁</a>';
    assert.equal(
      nextReviewPageUrl(html, 'https://javdb.com/v/WwWEVQ/reviews/lastest'),
      'https://javdb.com/v/WwWEVQ/reviews/lastest?page=2'
    );
  });

  it('returns null when there is no next page', () => {
    assert.equal(nextReviewPageUrl('<div>没有了</div>', 'https://javdb.com/'), null);
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
