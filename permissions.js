/**
 * Optional-host permission helpers for non-JavDB origins.
 */

export async function ensureOriginPermission(url) {
  try {
    const origin = `${new URL(url).origin}/*`;
    const already = await chrome.permissions.contains({ origins: [origin] });
    if (already) return true;
    return await chrome.permissions.request({ origins: [origin] });
  } catch {
    return false;
  }
}

export async function ensureOriginsForTabs(tabs) {
  const origins = [];
  for (const tab of tabs) {
    if (!tab?.url) continue;
    try {
      origins.push(`${new URL(tab.url).origin}/*`);
    } catch {
      // Ignore unparseable tab URLs.
    }
  }
  const unique = [...new Set(origins)];
  if (unique.length === 0) return true;
  try {
    const already = await chrome.permissions.contains({ origins: unique });
    if (already) return true;
    return await chrome.permissions.request({ origins: unique });
  } catch {
    return false;
  }
}
