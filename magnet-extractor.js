import { STORAGE_KEYS } from './constants.js';
import { showToast, addLog, saveHistory, createHistory, updateHistory, TASK_STATUS } from './utils.js';
import { deduplicateAndValidate, flattenMagnetCandidates } from './magnet-utils.js';
import { ensureOriginsForTabs } from './permissions.js';
import { isRestrictedTabUrl } from './url-utils.js';

let currentExtractHistoryId = null;

export function initMagnetExtractor() {
  const extractFirstBtn = document.getElementById('extractMagnetLinks');
  const extractAllBtn = document.getElementById('extractAllMagnetLinks');
  const copyBtn = document.getElementById('copyMagnetLinks');
  const exportBtn = document.getElementById('exportMagnetLinks');
  const exportJsonBtn = document.getElementById('exportMagnetJson');

  restoreMagnetSettings();
  document.getElementById('preferSubtitles')?.addEventListener('change', saveMagnetSettings);

  if (extractAllBtn) {
    extractAllBtn.addEventListener('click', () => extractLinks({ firstOnly: false }));
  }
  if (extractFirstBtn) {
    extractFirstBtn.addEventListener('click', () => extractLinks({ firstOnly: true }));
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

function preferSubtitlesEnabled() {
  return !!document.getElementById('preferSubtitles')?.checked;
}

async function saveMagnetSettings() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.magnetSettings]: { preferSubtitles: preferSubtitlesEnabled() }
  });
}

async function restoreMagnetSettings() {
  const checkbox = document.getElementById('preferSubtitles');
  if (!checkbox) return;
  const data = await chrome.storage.local.get([STORAGE_KEYS.magnetSettings]);
  const settings = data[STORAGE_KEYS.magnetSettings];
  if (typeof settings?.preferSubtitles === 'boolean') {
    checkbox.checked = settings.preferSubtitles;
  }
}

function getExtractedLinks() {
  const container = document.getElementById('resultContainer');
  return Array.from(container.querySelectorAll('.magnet-link')).map((div) => div.textContent);
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
  const extractFirstBtn = document.getElementById('extractMagnetLinks');
  const extractAllBtn = document.getElementById('extractAllMagnetLinks');
  if (extractFirstBtn) extractFirstBtn.disabled = isBusy;
  if (extractAllBtn) extractAllBtn.disabled = isBusy;
}

function setExportVisible(visible) {
  ['copyMagnetLinks', 'exportMagnetLinks', 'exportMagnetJson'].forEach((id) => {
    const button = document.getElementById(id);
    if (button) button.style.display = visible ? 'block' : 'none';
  });
}

async function extractLinks({ firstOnly }) {
  setExtractBusy(true);
  const preferSubtitles = preferSubtitlesEnabled();
  const modeLabel = firstOnly ? '每页首选' : '全部';
  const filterLabel = preferSubtitles ? '，优先字幕/无码' : '';
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
      const magnets = flattenMagnetCandidates(result.items, { firstOnly, preferSubtitles });
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
      preferSubtitles,
      stats,
      links: validLinks,
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
  container.replaceChildren();

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
    validLinks.forEach((link, index) => {
      const div = document.createElement('div');
      div.className = 'magnet-link';
      div.textContent = link;
      div.title = `${index + 1}. 点击复制`;
      fragment.appendChild(div);
    });
    linkList.appendChild(fragment);
    linkList.addEventListener('click', (event) => {
      const magnetDiv = event.target.closest('.magnet-link');
      if (!magnetDiv) return;
      navigator.clipboard.writeText(magnetDiv.textContent).then(() => {
        showToast('链接已复制');
        magnetDiv.classList.add('copied');
        setTimeout(() => magnetDiv.classList.remove('copied'), 600);
      });
    });
    container.appendChild(linkList);
    return;
  }

  const noResult = document.createElement('div');
  noResult.textContent = '未找到有效的磁力链接';
  noResult.className = 'empty-result';
  container.appendChild(noResult);
}
