/**
 * Compound filters for the tab reloader. No Chrome APIs.
 */

import { isRestrictedTabUrl } from './url-utils.js';

/** Chrome uses -1 for tabs that are not in a group. */
export const TAB_GROUP_ID_NONE = -1;

export function isTabInGroup(tab, groupIdNone = TAB_GROUP_ID_NONE) {
  return Number.isInteger(tab?.groupId) && tab.groupId !== groupIdNone;
}

export function applyRefreshScopeFilters(tabs, { excludePinned = false, onlyInGroup = false } = {}) {
  return (tabs || []).filter((tab) => {
    if (excludePinned && tab.pinned) return false;
    if (onlyInGroup && !isTabInGroup(tab)) return false;
    return true;
  });
}

/**
 * Apply compound AND filters. When onlyNoMagnet is on, tabs whose
 * magnetPresenceById[id] is true are skipped. Restricted URLs cannot be
 * scanned and are never treated as "missing magnets".
 */
export function selectRefreshTargets(tabs, options = {}, magnetPresenceById = {}) {
  const scoped = applyRefreshScopeFilters(tabs, options);
  if (!options.onlyNoMagnet) return scoped;
  return scoped.filter((tab) => {
    if (isRestrictedTabUrl(tab.url)) return false;
    return magnetPresenceById[tab.id] !== true;
  });
}

export function describeRefreshFilters({ excludePinned = false, onlyInGroup = false, onlyNoMagnet = false } = {}) {
  const parts = [];
  if (excludePinned) parts.push('排除固定标签');
  if (onlyInGroup) parts.push('仅标签组');
  if (onlyNoMagnet) parts.push('仅无磁力');
  return parts.length ? `（${parts.join(' + ')}）` : '';
}
