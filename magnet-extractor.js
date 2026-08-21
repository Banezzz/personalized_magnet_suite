import { STORAGE_KEYS } from './constants.js';
import { showToast, addLog, saveHistory, createHistory, updateHistory, TASK_STATUS } from './utils.js';
import { deduplicateAndValidate, flattenMagnetCandidates, magnetHref } from './magnet-utils.js';
import { ensureOriginsForTabs } from './permissions.js';
import { isRestrictedTabUrl } from './url-utils.js';

let currentExtractHistoryId = null;

export function initMagnetExtractor() {
  const extractBtn = document.getElementById('extractMagnetLinks');
  const copyBtn = document.getElementById('copyMagnetLinks');
  const exportBtn = document.getElementById('exportMagnetLinks');
  const exportJsonBtn = document.getElementById('exportMagnetJson');

  restoreMagnetSettings();
  document.getElementById('preferSubtitles')?.addEventListener('change', saveMagnetSettings);
  document.getElementById('preferUncensored')?.addEventListener('change', saveMagnetSettings);
  document.getElementById('extractModeFirst')?.addEventListener('change', saveMagnetSettings);
  document.getElementById('extractModeAll')?.addEventListener('change', saveMagnetSettings);

  if (extractBtn) {
    extractBtn.addEventListener('click', () => extractLinks({ firstOnly: isFirstOnlyMode() }));
  }
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const links = getExtractedLinks();
      if (links.length === 0) {
        showToast('没有可复制的链接');
        return;
      }
      navigator.clipboard.writeText(links.join('\n')).then(() => {
        showToast(`已复制 ${links.length} 条磁力链接`);
        addLog(`复制了 ${links.length} 条磁力链接`, 'success');
      }).catch(() => {
        showToast('复制失败，请重试');
        addLog('复制磁力链接失败', 'error');
      });
    });
  }
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const links = getExtractedLinks();
      if (links.length === 0) {
        showToast('没有可导出的链接');
        return;
      }
      exportToFile(links.join('\n'), 'txt', 'text/plain');
    });
  }
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener('click', () => {
      const payload = window.__lastMagnetExport;
      if (!payload || payload.links.length === 0) {
        showToast('没有可导出的链接');
        return;
      }
      exportToFile(JSON.stringify(payload, null, 2), 'json', 'application/json');
    });
  }
}

function isFirstOnlyMode() {
  return document.getElementById('extractModeAll')?.checked !== true;
}

function preferenceOptions() {
  return {
    preferSubtitles: !!document.getElementById('preferSubtitles')?.checked,
    preferUncensored: !!document.getElementById('preferUncensored')?.checked,
    firstOnly: isFirstOnlyMode()
  };
}

function preferenceLogLabel({ preferSubtitles, preferUncensored }) {
  if (preferSubtitles && preferUncensored) return '，优先字幕+无码';
  if (preferSubtitles) return '，优先字幕';
  if (preferUncensored) return '，优先无码';
  return '';
}

async function saveMagnetSettings() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.magnetSettings]: preferenceOptions()
  });
}

async function restoreMagnetSettings() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.magnetSettings]);
  const settings = data[STORAGE_KEYS.magnetSettings] || {};
  const subtitleBox = document.getElementById('preferSubtitles');
  const uncensoredBox = document.getElementById('preferUncensored');
  if (subtitleBox && typeof settings.preferSubtitles === 'boolean') {
    subtitleBox.checked = settings.preferSubtitles;
  }
  if (uncensoredBox && typeof settings.preferUncensored === 'boolean') {
    uncensoredBox.checked = settings.preferUncensored;
  }
  const firstRadio = document.getElementById('extractModeFirst');
  const allRadio = document.getElementById('extractModeAll');
  if (firstRadio && allRadio && typeof settings.firstOnly === 'boolean') {
    firstRadio.checked = settings.firstOnly;
    allRadio.checked = !settings.firstOnly;
  }
}

function getExtractedLinks() {
  const container = document.getElementById('resultContainer');
  return Array.from(container.querySelectorAll('.magnet-item')).map((item) => item.dataset.href);
}

function exportToFile(content, extension, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `magnet_links_${timestamp}.${extension}`;
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  showToast(`已导出到 ${filename}`);
  addLog(`导出了文件 ${filename}`, 'success');
  saveHistory({
    action: '磁力链接导出',
    result: `导出 ${filename}`
  });
}

function collectMagnetsFromPage() {
  const items = [];
  const push = (href, sizeText) => {
    if (!href || typeof href !== 'string') return;
    const trimmed = href.trim();
    if (!trimmed.toLowerCase().startsWith('magnet:')) return;
    items.push({ href: trimmed, sizeText: sizeText || '' });
  };

  document.querySelectorAll('a[href^="magnet:"]').forEach((anchor) => {
    const row = anchor.closest('tr, li, .item, .magnet-name, .column');
    push(anchor.href, row ? row.innerText : anchor.textContent);
  });
  document.querySelectorAll('[data-clipboard-text]').forEach((el) => {
    push(el.getAttribute('data-clipboard-text'), (el.closest('tr, li, .item') || el).innerText);
  });
  return items;
}

function executeOnTab(tabId) {
  return new Promise((resolve) => {
    chrome.scripting.executeScript({
      target: { tabId },
      func: collectMagnetsFromPage
    }, (results) => {
      if (chrome.runtime.lastError) {
        resolve({ error: chrome.runtime.lastError.message, items: [] });
        return;
      }
      resolve({ error: null, items: results?.[0]?.result || [] });
    });
  });
}

function setExtractBusy(isBusy) {
  const extractBtn = document.getElementById('extractMagnetLinks');
  if (extractBtn) extractBtn.disabled = isBusy;
}

function setExportVisible(visible) {
  document.getElementById('magnetExportRow')?.classList.toggle('is-hidden', !visible);
}

async function extractLinks({ firstOnly }) {
  setExtractBusy(true);
  const prefs = preferenceOptions();
    const modeLabel = firstOnly ? '每页一条' : '全部';
  const filterLabel = preferenceLogLabel(prefs);
  addLog(`开始提取磁力链接 (${modeLabel}${filterLabel})`, 'info');

  currentExtractHistoryId = await createHistory({
    action: '磁力链接提取',
    result: `正在提取 (${modeLabel}${filterLabel})...`
  });

  chrome.tabs.query({ currentWindow: true }, async (tabs) => {
    const scannable = tabs.filter((tab) => !isRestrictedTabUrl(tab.url));
    await ensureOriginsForTabs(scannable);

    const perTab = [];
    const rawLinks = [];
    let tabsWithMagnets = 0;
    let tabsEmpty = 0;
    let tabsFailed = 0;

    await Promise.all(scannable.map(async (tab) => {
      const result = await executeOnTab(tab.id);
      if (result.error) {
        tabsFailed += 1;
        perTab.push({ tabUrl: tab.url, magnets: [], error: result.error });
        return;
      }
      const magnets = flattenMagnetCandidates(result.items, prefs);
      if (magnets.length === 0) {
        tabsEmpty += 1;
      } else {
        tabsWithMagnets += 1;
        rawLinks.push(...magnets);
      }
      perTab.push({ tabUrl: tab.url, magnets, error: null });
    }));

    setExtractBusy(false);

    const { validLinks, invalidCount, duplicateCount } = deduplicateAndValidate(rawLinks);
    const stats = {
      totalTabs: tabs.length,
      scannedTabs: scannable.length,
      tabsWithMagnets,
      tabsEmpty,
      tabsFailed,
      rawCount: rawLinks.length,
      validCount: validLinks.length,
      invalidCount,
      duplicateCount
    };
    displayResults(validLinks, stats);
    setExportVisible(validLinks.length > 0);

    window.__lastMagnetExport = {
      generatedAt: new Date().toISOString(),
      firstOnly,
      preferSubtitles: prefs.preferSubtitles,
      preferUncensored: prefs.preferUncensored,
      stats,
      links: validLinks.map(magnetHref),
      results: validLinks,
      tabs: perTab
    };

    addLog(
      `提取完成: ${validLinks.length} 条有效，${tabsWithMagnets} 页有链接，${tabsEmpty} 页为空，${tabsFailed} 页失败`,
      'success'
    );

    if (currentExtractHistoryId) {
      updateHistory(currentExtractHistoryId, {
        status: TASK_STATUS.COMPLETED,
        result: `${validLinks.length} 条有效，${tabsWithMagnets} 页有链接，${tabsFailed} 页失败`
      });
      currentExtractHistoryId = null;
    }
  });
}

function displayResults(validLinks, stats) {
  const container = document.getElementById('resultContainer');
  container.classList.remove('is-hidden');
  container.replaceChildren();

  const preferredCount = validLinks.filter((item) => (item.score || 0) > 0).length;
  const fallbackCount = validLinks.filter((item) => item.usedFallback).length;

  const summary = document.createElement('div');
  summary.className = 'result-summary';
  const lines = [
    `总标签数: ${stats.totalTabs}`,
    `已扫描: ${stats.scannedTabs}`,
    `有磁力: ${stats.tabsWithMagnets}`,
    `无磁力: ${stats.tabsEmpty}`,
    `失败: ${stats.tabsFailed}`,
    `原始链接: ${stats.rawCount}`,
    `有效链接: ${stats.validCount}`
  ];
  if (preferredCount > 0) lines.push(`命中优先: ${preferredCount}`);
  if (fallbackCount > 0) lines.push(`未命中已回退: ${fallbackCount}`);
  if (stats.duplicateCount > 0) lines.push(`去除重复: ${stats.duplicateCount}`);
  if (stats.invalidCount > 0) lines.push(`无效格式: ${stats.invalidCount}`);

  lines.forEach((line, index) => {
    const row = document.createElement('div');
    if (index === lines.length - 1 || line.startsWith('有效链接')) {
      const strong = document.createElement('strong');
      strong.textContent = line;
      row.appendChild(strong);
    } else {
      row.textContent = line;
    }
    summary.appendChild(row);
  });
  container.appendChild(summary);

  if (validLinks.length > 0) {
    const linkList = document.createElement('div');
    linkList.className = 'link-list';
    const fragment = document.createDocumentFragment();
    validLinks.forEach((item, index) => {
      const href = magnetHref(item);
      const card = document.createElement('div');
      card.className = 'magnet-item';
      card.dataset.href = href;
      card.title = `${index + 1}. 点击复制`;

      const meta = document.createElement('div');
      meta.className = 'magnet-meta';
      (item.tags || []).forEach((tag) => {
        const badge = document.createElement('span');
        badge.className = tag === '无码' ? 'magnet-tag uncensored' : 'magnet-tag';
        badge.textContent = tag;
        meta.appendChild(badge);
      });
      if (item.usedFallback) {
        const fallback = document.createElement('span');
        fallback.className = 'magnet-fallback';
        fallback.textContent = '未命中优先，已取第一条';
        meta.appendChild(fallback);
      }
      if (meta.childNodes.length > 0) {
        card.appendChild(meta);
      }

      const link = document.createElement('div');
      link.className = 'magnet-link';
      link.textContent = href;
      card.appendChild(link);
      fragment.appendChild(card);
    });
    linkList.appendChild(fragment);
    linkList.addEventListener('click', (event) => {
      const card = event.target.closest('.magnet-item');
      if (!card?.dataset.href) return;
      navigator.clipboard.writeText(card.dataset.href).then(() => {
        showToast('链接已复制');
        card.classList.add('copied');
        setTimeout(() => card.classList.remove('copied'), 600);
      });
    });
    container.appendChild(linkList);
    return;
  }

  const noResult = document.createElement('div');
  noResult.textContent = '未找到有效的磁力链接。请先打开影片详情页再提取。';
  noResult.className = 'empty-result';
  container.appendChild(noResult);
}
