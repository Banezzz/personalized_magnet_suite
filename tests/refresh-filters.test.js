import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TAB_GROUP_ID_NONE,
  applyRefreshScopeFilters,
  describeRefreshFilters,
  isTabInGroup,
  selectRefreshTargets
} from '../refresh-filters.js';

function tab(id, { pinned = false, groupId = TAB_GROUP_ID_NONE, url = 'https://javdb.com/v/abc' } = {}) {
  return { id, pinned, groupId, url };
}

const grouped = tab(1, { groupId: 12 });
const groupedPinned = tab(2, { groupId: 12, pinned: true });
const ungrouped = tab(3);
const ungroupedPinned = tab(4, { pinned: true });
const chromePage = tab(5, { groupId: 12, url: 'chrome://extensions' });
const groupedNoMagnet = tab(6, { groupId: 8, url: 'https://javdb.com/v/empty' });

describe('isTabInGroup', () => {
  it('is true only when groupId is a real group', () => {
    assert.equal(isTabInGroup(grouped), true);
    assert.equal(isTabInGroup(ungrouped), false);
    assert.equal(isTabInGroup({ id: 9 }), false);
    assert.equal(isTabInGroup(null), false);
  });
});

describe('applyRefreshScopeFilters', () => {
  const tabs = [grouped, groupedPinned, ungrouped, ungroupedPinned];

  it('returns every tab when no filters are on', () => {
    assert.deepEqual(applyRefreshScopeFilters(tabs, {}), tabs);
  });

  it('drops pinned tabs when excludePinned is on', () => {
    assert.deepEqual(
      applyRefreshScopeFilters(tabs, { excludePinned: true }).map((item) => item.id),
      [1, 3]
    );
  });

  it('keeps only grouped tabs when onlyInGroup is on', () => {
    assert.deepEqual(
      applyRefreshScopeFilters(tabs, { onlyInGroup: true }).map((item) => item.id),
      [1, 2]
    );
  });

  it('ANDs excludePinned with onlyInGroup', () => {
    assert.deepEqual(
      applyRefreshScopeFilters(tabs, { excludePinned: true, onlyInGroup: true }).map((item) => item.id),
      [1]
    );
  });
});

describe('selectRefreshTargets', () => {
  const tabs = [grouped, groupedPinned, ungrouped, ungroupedPinned, chromePage, groupedNoMagnet];
  const magnetPresenceById = {
    1: true,
    2: false,
    3: false,
    4: true,
    6: false
  };

  it('returns scoped tabs when magnet filter is off', () => {
    assert.deepEqual(
      selectRefreshTargets(tabs, { onlyInGroup: true }, magnetPresenceById).map((item) => item.id),
      [1, 2, 5, 6]
    );
  });

  it('keeps tabs that have no extractable magnet', () => {
    assert.deepEqual(
      selectRefreshTargets(tabs, { onlyNoMagnet: true }, magnetPresenceById).map((item) => item.id),
      [2, 3, 6]
    );
  });

  it('ANDs onlyInGroup with onlyNoMagnet', () => {
    assert.deepEqual(
      selectRefreshTargets(tabs, { onlyInGroup: true, onlyNoMagnet: true }, magnetPresenceById).map((item) => item.id),
      [2, 6]
    );
  });

  it('ANDs all three filters', () => {
    assert.deepEqual(
      selectRefreshTargets(
        tabs,
        { excludePinned: true, onlyInGroup: true, onlyNoMagnet: true },
        magnetPresenceById
      ).map((item) => item.id),
      [6]
    );
  });

  it('never treats restricted pages as missing magnets', () => {
    assert.deepEqual(
      selectRefreshTargets([chromePage], { onlyNoMagnet: true }, {}).map((item) => item.id),
      []
    );
  });
});

describe('describeRefreshFilters', () => {
  it('joins active filters as a compound label', () => {
    assert.equal(describeRefreshFilters({}), '');
    assert.equal(describeRefreshFilters({ excludePinned: true }), '（排除固定标签）');
    assert.equal(
      describeRefreshFilters({ onlyInGroup: true, onlyNoMagnet: true }),
      '（仅标签组 + 仅无磁力）'
    );
    assert.equal(
      describeRefreshFilters({ excludePinned: true, onlyInGroup: true, onlyNoMagnet: true }),
      '（排除固定标签 + 仅标签组 + 仅无磁力）'
    );
  });
});
