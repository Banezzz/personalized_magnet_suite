document.getElementById('openMovieLinks').addEventListener('click', function() {
    const urlInput = document.getElementById('movieUrl').value.trim();
    const isTopChecked = document.getElementById('topOption').checked;
  
    // 检查用户是否输入了URL
    if (!urlInput) {
      alert('请输入有效的电影链接 URL');
      return;
    }
  
    if (isTopChecked) {
      // 勾选了“TOP?”，生成并处理 page=1 到 page=8 的URL
      const baseUrl = new URL(urlInput);
      const pages = Array.from({ length: 8 }, (_, i) => i + 1);
  
      pages.forEach(page => {
        const pageUrl = new URL(baseUrl);
        pageUrl.searchParams.set('page', page);
        fetchAndOpenLinks(pageUrl.toString());
      });
    } else {
      // 未勾选“TOP?”，按原有逻辑处理单个URL
      fetchAndOpenLinks(urlInput);
    }
  });
  
  // 提取并打开指定超链接的函数
  function fetchAndOpenLinks(url) {
    fetch(url)
      .then(response => response.text())
      .then(data => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(data, 'text/html');
        const links = doc.querySelectorAll('.movie-list.h.cols-4 a.box');
        links.forEach(link => {
          const href = link.getAttribute('href');
          const fullUrl = `https://javdb.com${href}`;
          chrome.tabs.create({ url: fullUrl });
        });
      })
      .catch(error => {
        console.error('获取 URL 失败:', error);
        alert('获取链接时出错，请检查 URL');
      });
  }
  
  // Tab Reloader 功能
  document.getElementById('startRefreshing').addEventListener('click', () => {
    const interval = parseFloat(document.getElementById('refreshInterval').value) * 1000;
    if (isNaN(interval) || interval < 100) {
      alert('请输入有效的刷新间隔（至少 0.1 秒）');
      return;
    }
    chrome.runtime.sendMessage({ action: 'startRefreshing', interval });
    alert('标签页刷新已开始');
  });
  
  // Magnet Link Extractor 功能
  document.getElementById('fetchAndOpenLinks').addEventListener('click', () => {
    const url = document.getElementById('magnetUrl').value.trim();
    if (!url) {
      alert('请输入有效的 URL 用于链接提取');
      return;
    }
  
    chrome.tabs.create({ url }, (tab) => {
      chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
              const links = [...document.querySelectorAll('body > section > div > div.movie-list.h.cols-4 .item a.box')];
              return links.map(link => link.href);
            }
          }, (executeResults) => {
            const results = executeResults[0]?.result || [];
            results.forEach(link => {
              chrome.tabs.create({ url: link });
            });
          });
          chrome.tabs.onUpdated.removeListener(listener);
        }
      });
    });
  });
  
  document.getElementById('extractMagnetLinks').addEventListener('click', () => {
    chrome.tabs.query({}, (tabs) => {
      const results = [];
      const promises = [];
      const totalTabs = tabs.length;
  
      tabs.forEach((tab) => {
        if (!tab.url.startsWith("chrome://")) {
          const promise = new Promise((resolve) => {
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: () => {
                const links = [...document.querySelectorAll('a[href^="magnet:"]')];
                return links.length > 0 ? links[0].href : null;
              }
            }, (executeResults) => {
              if (executeResults && executeResults[0]) {
                const link = executeResults[0].result;
                if (link) {
                  results.push(link);
                }
              }
              resolve();
            });
          });
          promises.push(promise);
        }
      });
  
      Promise.all(promises).then(() => {
        displayResults(results, totalTabs);
        document.getElementById('copyMagnetLinks').style.display = 'block';
      });
    });
  });
  
  // 显示磁力链接提取结果
  function displayResults(results, totalTabs) {
    const resultContainer = document.getElementById('resultContainer');
    resultContainer.innerHTML = '';
  
    const summary = document.createElement('div');
    summary.textContent = `总标签数: ${totalTabs}, 找到磁力链接: ${results.length}`;
    resultContainer.appendChild(summary);
  
    if (results.length > 0) {
      results.forEach(link => {
        const linkElement = document.createElement('div');
        linkElement.textContent = link;
        resultContainer.appendChild(linkElement);
      });
    } else {
      resultContainer.textContent += ' 未找到磁力链接。';
    }
  }
  
  // 复制磁力链接
  document.getElementById('copyMagnetLinks').addEventListener('click', () => {
    const resultContainer = document.getElementById('resultContainer');
    const links = Array.from(resultContainer.querySelectorAll('div')).slice(1);
    const linksText = links.map(link => link.textContent).join('\n');
    navigator.clipboard.writeText(linksText).then(() => {
      alert('磁力链接已复制到剪贴板');
    }).catch(err => {
      console.error('复制失败: ', err);
      alert('复制失败，请重试');
    });
  });