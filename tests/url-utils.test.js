import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeExtractionFailure,
  describeMoviePreview,
  filterDuplicateLinks,
  isHttpUrl,
  isRestrictedTabUrl,
  normalizeUrl,
  resolveRelativeUrl
} from '../url-utils.js';

describe('isHttpUrl', () => {
  it('accepts http and https', () => {
    assert.equal(isHttpUrl('https://javdb.com/v/abc'), true);
    assert.equal(isHttpUrl('http://example.com'), true);
  });

  it('rejects non-http schemes and invalid values', () => {
    assert.equal(isHttpUrl('javascript:alert(1)'), false);
    assert.equal(isHttpUrl('data:text/html,hi'), false);
    assert.equal(isHttpUrl('magnet:?xt=urn:btih:abc'), false);
    assert.equal(isHttpUrl('not a url'), false);
  });
});

describe('isRestrictedTabUrl', () => {
  it('treats missing and browser pages as restricted', () => {
    assert.equal(isRestrictedTabUrl(undefined), true);
    assert.equal(isRestrictedTabUrl('chrome://extensions'), true);
    assert.equal(isRestrictedTabUrl('chrome-extension://abc/popup.html'), true);
    assert.equal(isRestrictedTabUrl('https://javdb.com'), false);
  });
});

describe('normalizeUrl', () => {
  it('strips hash, trailing slash, and javdb video query params', () => {
    assert.equal(
      normalizeUrl('https://JavDB.com/v/ABC/?lang=zh#top'),
      'https://javdb.com/v/ABC'
    );
  });

  it('keeps non-video query strings except tracking params', () => {
    const normalized = normalizeUrl('https://javdb.com/rankings/movies?f=1&page=2&lang=zh');
    assert.match(normalized, /page=2/);
    assert.doesNotMatch(normalized, /lang=/);
    assert.doesNotMatch(normalized, /[?&]f=/);
  });
});

describe('resolveRelativeUrl', () => {
  it('keeps absolute http urls', () => {
    assert.equal(
      resolveRelativeUrl('https://javdb.com/v/abc', 'https://javdb.com'),
      'https://javdb.com/v/abc'
    );
  });

  it('resolves site-relative paths with baseUrl', () => {
    assert.equal(
      resolveRelativeUrl('/v/abc', 'https://javdb.com'),
      'https://javdb.com/v/abc'
    );
  });

  it('resolves protocol-relative urls from the page protocol', () => {
    assert.equal(
      resolveRelativeUrl('//cdn.example.com/a', '', 'https://javdb.com/list'),
      'https://cdn.example.com/a'
    );
  });

  it('ignores javascript and magnet hrefs', () => {
    assert.equal(resolveRelativeUrl('javascript:void(0)', 'https://javdb.com'), null);
    assert.equal(resolveRelativeUrl('magnet:?xt=urn:btih:abc', 'https://javdb.com'), null);
  });
});

describe('filterDuplicateLinks', () => {
  it('deduplicates by normalized javdb video urls', () => {
    const opened = new Set(['https://javdb.com/v/abc?lang=zh']);
    const { newLinks, skippedLinks } = filterDuplicateLinks([
      'https://javdb.com/v/abc',
      'https://javdb.com/v/abc/',
      'https://javdb.com/v/def'
    ], opened);
    assert.deepEqual(newLinks, ['https://javdb.com/v/def']);
    assert.equal(skippedLinks.length, 2);
  });
});

describe('describeExtractionFailure', () => {
  it('explains cloudflare, login, timeout, and generic empty pages', () => {
    assert.match(describeExtractionFailure({ blocked: true }), /Cloudflare/);
    assert.match(describeExtractionFailure({ login: true }), /登录/);
    assert.match(describeExtractionFailure({ error: 'timeout' }), /超时/);
    assert.match(describeExtractionFailure({}), /选择器/);
  });
});

describe('describeMoviePreview', () => {
  it('names how many new detail tabs will open', () => {
    assert.equal(describeMoviePreview(24), '将打开 24 个详情');
    assert.equal(describeMoviePreview(24, 3), '将打开 24 个详情，跳过 3 个已打开');
  });

  it('explains when every link is already open', () => {
    assert.equal(describeMoviePreview(0, 5), '没有新的详情可打开，跳过 5 个已打开');
    assert.equal(describeMoviePreview(0), '没有新的详情可打开');
  });
});
