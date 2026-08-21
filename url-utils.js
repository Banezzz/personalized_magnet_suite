/**
 * URL helpers shared by popup and background. No Chrome APIs.
 */

import { JAVDB_STRIP_QUERY_PARAMS } from './constants.js';

export function isHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isRestrictedTabUrl(url) {
  if (!url || typeof url !== 'string') return true;
  return /^(chrome|chrome-extension|edge|about|devtools|view-source|moz-extension):/i.test(url);
}

export function normalizeUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  try {
    const url = new URL(raw);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }

    const isJavdbVideo = url.hostname.endsWith('javdb.com') && /\/v\/[^/]+$/.test(url.pathname);
    if (isJavdbVideo) {
      url.search = '';
    } else {
      for (const param of JAVDB_STRIP_QUERY_PARAMS) {
        url.searchParams.delete(param);
      }
    }
    return url.toString();
  } catch {
    return raw.trim();
  }
}

export function resolveRelativeUrl(href, baseUrl, pageUrl) {
  if (!href || typeof href !== 'string') return null;
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (/^(javascript|data|magnet|blob):/i.test(trimmed)) return null;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  if (trimmed.startsWith('//')) {
    try {
      const protocol = pageUrl ? new URL(pageUrl).protocol : 'https:';
      return `${protocol}${trimmed}`;
    } catch {
      return `https:${trimmed}`;
    }
  }

  const base = baseUrl || (pageUrl ? new URL(pageUrl).origin : '');
  if (!base) return null;
  try {
    return new URL(trimmed, base.endsWith('/') ? base : `${base}/`).toString();
  } catch {
    return null;
  }
}

export function filterDuplicateLinks(links, openedUrls) {
  const normalizedOpened = new Set(
    [...openedUrls].map((url) => normalizeUrl(url)).filter(Boolean)
  );
  const newLinks = [];
  const skippedLinks = [];
  const seen = new Set();

  for (const link of links) {
    const key = normalizeUrl(link);
    if (!key || normalizedOpened.has(key) || seen.has(key)) {
      skippedLinks.push(link);
      continue;
    }
    seen.add(key);
    newLinks.push(link);
  }

  return { newLinks, skippedLinks };
}

export function describeExtractionFailure(diagnostic) {
  if (!diagnostic) return '未找到任何链接，请检查选择器或页面类型';
  if (diagnostic.blocked) return '可能被 Cloudflare 拦截，请手动通过验证后重试';
  if (diagnostic.login) return '页面可能需要登录后再试';
  if (diagnostic.error === 'timeout') return '页面加载超时，未找到链接';
  if (diagnostic.error === 'tab_create_failed') return '无法打开临时标签页';
  if (diagnostic.error === 'script_failed') return '页面脚本执行失败，可能缺少访问权限';
  return '未找到任何链接，请检查选择器或页面类型';
}
