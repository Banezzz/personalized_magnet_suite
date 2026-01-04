import { showToast, addLog, saveHistory, createHistory, updateHistory, TASK_STATUS } from './utils.js';

// 当前任务的历史记录 ID
let currentExtractHistoryId = null;

export function initMagnetExtractor() {
  const extractFirstBtn = document.getElementById('extractMagnetLinks');
  const extractAllBtn = document.getElementById('extractAllMagnetLinks');
  const copyBtn = document.getElementById('copyMagnetLinks');
  const exportBtn = document.getElementById('exportMagnetLinks');

  if (extractAllBtn) {
    extractAllBtn.addEventListener('click', () => extractLinks({ firstOnly: false, copyBtn, exportBtn }));
  }

  if (extractFirstBtn) {
    extractFirstBtn.addEventListener('click', () => extractLinks({ firstOnly: true, copyBtn, exportBtn }));
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
      exportToFile(links);
    });
  }
}

// 获取已提取的链接
function getExtractedLinks() {
  const container = document.getElementById('resultContainer');
  const linkDivs = Array.from(container.querySelectorAll('.magnet-link'));
  return linkDivs.map(div => div.textContent);
}

// 导出为TXT文件
function exportToFile(links) {
  const content = links.join('\n');
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `magnet_links_${timestamp}.txt`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`已导出 ${links.length} 条链接到 ${filename}`);
  addLog(`导出了 ${links.length} 条链接到文件`, 'success');
  saveHistory({
    action: '磁力链接导出',
    result: `导出 ${links.length} 条链接`
  });
}

// 验证磁力链接格式
function isValidMagnetLink(link) {
  if (!link || typeof link !== 'string') return false;
  // 验证基本格式：magnet:?xt=urn:btih:
  return /^magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}/i.test(link);
}

// 去重和验证
function deduplicateAndValidate(links) {
  const seen = new Set();
  const validLinks = [];
  let invalidCount = 0;
  let duplicateCount = 0;

  for (const link of links) {
    if (!isValidMagnetLink(link)) {
      invalidCount++;
      continue;
    }

    // 提取 btih hash 进行去重（忽略后续参数）
    const hashMatch = link.match(/btih:([a-zA-Z0-9]{32,40})/i);
    if (hashMatch) {
      const hash = hashMatch[1].toLowerCase();
      if (seen.has(hash)) {
        duplicateCount++;
        continue;
      }
      seen.add(hash);
      validLinks.push(link);
    }
  }

  return { validLinks, invalidCount, duplicateCount };
}

function extractLinks({ firstOnly, copyBtn, exportBtn }) {
  addLog(`开始提取磁力链接 (${firstOnly ? '每页第一条' : '全部'})`, 'info');

  // 创建历史记录（任务启动时立即显示）
  currentExtractHistoryId = createHistory({
    action: '磁力链接提取',
    result: `正在提取 (${firstOnly ? '每页第一条' : '全部'})...`
  });

  chrome.tabs.query({ currentWindow: true }, (tabs) => {
    const results = [];
    const promises = [];

    tabs.forEach((tab) => {
      if (!tab.url.startsWith('chrome://')) {
        const promise = new Promise((resolve) => {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (first) => {
              const links = [...document.querySelectorAll('a[href^="magnet:"]')];
              if (first) {
                return links.length > 0 ? links[0].href : null;
              }
              return links.map(l => l.href);
            },
            args: [firstOnly]
          }, (executeResults) => {
            if (executeResults && executeResults[0]) {
              const data = executeResults[0].result;
              if (data) {
                Array.isArray(data) ? results.push(...data) : results.push(data);
              }
            }
            resolve();
          });
        });
        promises.push(promise);
      }
    });

    Promise.all(promises).then(() => {
      // 去重和验证
      const { validLinks, invalidCount, duplicateCount } = deduplicateAndValidate(results);
      displayResults(validLinks, tabs.length, results.length, invalidCount, duplicateCount);

      // 显示复制和导出按钮
      if (validLinks.length > 0) {
        copyBtn.style.display = 'block';
        exportBtn.style.display = 'block';
      }

      // 记录日志
      addLog(`提取完成: ${validLinks.length} 条有效链接`, 'success');

      // 更新历史记录为完成状态
      if (currentExtractHistoryId) {
        updateHistory(currentExtractHistoryId, {
          status: TASK_STATUS.COMPLETED,
          result: `${validLinks.length} 条有效，${duplicateCount} 条重复，${invalidCount} 条无效`
        });
        currentExtractHistoryId = null;
      }
    });
  });
}

function displayResults(validLinks, totalTabs, rawCount, invalidCount, duplicateCount) {
  const container = document.getElementById('resultContainer');
  container.innerHTML = '';

  // 统计信息
  const summary = document.createElement('div');
  summary.className = 'result-summary';
  summary.innerHTML = `
    <div>总标签数: ${totalTabs}</div>
    <div>原始链接: ${rawCount}</div>
    <div>有效链接: <strong>${validLinks.length}</strong></div>
    ${duplicateCount > 0 ? `<div>去除重复: ${duplicateCount}</div>` : ''}
    ${invalidCount > 0 ? `<div>无效格式: ${invalidCount}</div>` : ''}
  `;
  container.appendChild(summary);

  if (validLinks.length > 0) {
    const linkList = document.createElement('div');
    linkList.className = 'link-list';
    validLinks.forEach((link, index) => {
      const div = document.createElement('div');
      div.className = 'magnet-link';
      div.textContent = link;
      div.title = `${index + 1}. 点击复制`;
      div.addEventListener('click', () => {
        navigator.clipboard.writeText(link).then(() => {
          showToast('链接已复制');
        });
      });
      linkList.appendChild(div);
    });
    container.appendChild(linkList);
  } else {
    const noResult = document.createElement('div');
    noResult.textContent = '未找到有效的磁力链接';
    noResult.style.color = 'var(--text-secondary)';
    container.appendChild(noResult);
  }
}
