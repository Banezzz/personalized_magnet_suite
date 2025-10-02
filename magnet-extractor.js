import { showToast } from './utils.js';

export function initMagnetExtractor() {
  const extractFirstBtn = document.getElementById('extractMagnetLinks');
  const extractAllBtn = document.getElementById('extractAllMagnetLinks');
  const copyBtn = document.getElementById('copyMagnetLinks');

  if (extractAllBtn) {
    extractAllBtn.addEventListener('click', () => extractLinks({ firstOnly: false, copyBtn }));
  }

  if (extractFirstBtn) {
    extractFirstBtn.addEventListener('click', () => extractLinks({ firstOnly: true, copyBtn }));
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const container = document.getElementById('resultContainer');
      const links = Array.from(container.querySelectorAll('div')).slice(1);
      const text = links.map(div => div.textContent).join('\n');
      navigator.clipboard.writeText(text).then(() => {
        showToast('磁力链接已复制到剪贴板');
      }).catch(() => {
        showToast('复制失败，请重试');
      });
    });
  }
}

function extractLinks({ firstOnly, copyBtn }) {
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
      displayResults(results, tabs.length);
      copyBtn.style.display = 'block';
    });
  });
}

function displayResults(results, totalTabs) {
  const container = document.getElementById('resultContainer');
  container.innerHTML = '';

  const summary = document.createElement('div');
  summary.textContent = `总标签数: ${totalTabs}, 找到磁力链接: ${results.length}`;
  container.appendChild(summary);

  if (results.length > 0) {
    results.forEach(link => {
      const div = document.createElement('div');
      div.textContent = link;
      container.appendChild(div);
    });
  } else {
    container.textContent += ' 未找到磁力链接。';
  }
} 