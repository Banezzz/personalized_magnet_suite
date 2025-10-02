/**
 * Service worker：负责按顺序刷新当前窗口中的标签页，
 * 以及处理电影链接的批量打开任务。
 */
let refreshTimeoutId = null;
let isRefreshing = false;

// 电影链接打开任务状态
let movieTaskRunning = false;
let movieTaskCancelled = false;

// 安全发送消息，忽略无监听者导致的 lastError
function safeSendMessage(msg) {
  chrome.runtime.sendMessage(msg, () => {
    if (chrome.runtime.lastError) {
      // 可在开发时查看，但正式忽略
      // console.debug('safeSendMessage error:', chrome.runtime.lastError.message);
    }
  });
}

// 延迟函数（带随机抖动）
function delay(ms) {
  const jitter = (Math.random() - 0.5) * 0.6; // ±30%
  const actualDelay = ms * (1 + jitter);
  return new Promise(resolve => setTimeout(resolve, actualDelay));
}

// 获取页面链接 - 使用临时标签页方式
async function fetchLinksFromUrl(url) {
  return new Promise((resolve) => {
    // 创建临时标签页
    chrome.tabs.create({ url, active: false }, (tab) => {
      const tabId = tab.id;

      // 监听标签页加载完成
      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          // 执行脚本提取链接
          chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
              const links = [...document.querySelectorAll('.movie-list.h.cols-4 a.box')];
              return links.map(link => link.getAttribute('href'));
            }
          }, (results) => {
            chrome.tabs.onUpdated.removeListener(listener);

            if (results && results[0] && results[0].result) {
              const hrefs = results[0].result;
              const fullUrls = hrefs.map(href => `https://javdb.com${href}`);

              // 关闭临时标签页
              chrome.tabs.remove(tabId, () => {
                resolve(fullUrls);
              });
            } else {
              chrome.tabs.remove(tabId, () => {
                resolve([]);
              });
            }
          });
        }
      };

      chrome.tabs.onUpdated.addListener(listener);

      // 超时保护（10秒）
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        chrome.tabs.remove(tabId, () => {
          resolve([]);
        });
      }, 10000);
    });
  });
}

// 分批打开链接
async function openLinksInBatches(urls, batchSize, delayMs, stats) {
  for (let i = 0; i < urls.length; i += batchSize) {
    if (movieTaskCancelled) {
      safeSendMessage({ action: 'movieTaskCancelled' });
      return;
    }

    const batch = urls.slice(i, i + batchSize);
    batch.forEach(url => {
      chrome.tabs.create({ url, active: false });
      stats.openedTabs++; // 统计已打开的标签页
    });

    const progress = Math.min(i + batchSize, urls.length);
    safeSendMessage({
      action: 'movieProgress',
      current: progress,
      total: urls.length
    });

    if (i + batchSize < urls.length) {
      await delay(delayMs);
    }
  }
}

// 处理电影链接打开任务
async function handleMovieLinksTask(request) {
  movieTaskRunning = true;
  movieTaskCancelled = false;

  const { url, isTopMode, batchSize, delaySeconds } = request;
  const delayMs = delaySeconds * 1000;

  // 统计数据
  const stats = {
    totalLinks: 0,
    openedTabs: 0
  };

  try {
    if (isTopMode) {
      // TOP 模式：处理 8 页
      for (let page = 1; page <= 8; page++) {
        if (movieTaskCancelled) break;

        safeSendMessage({
          action: 'movieProgress',
          message: `正在处理第 ${page}/8 页...`
        });

        const pageUrl = new URL(url);
        pageUrl.searchParams.set('page', page);
        const links = await fetchLinksFromUrl(pageUrl.toString());

        if (links.length > 0) {
          stats.totalLinks += links.length;
          await openLinksInBatches(links, batchSize, delayMs, stats);
        }

        // 页面间额外延迟
        if (page < 8 && !movieTaskCancelled) {
          await delay(5000);
        }
      }

      if (!movieTaskCancelled) {
        safeSendMessage({
          action: 'movieComplete',
          message: `✓ 所有页面处理完毕！总共发现 ${stats.totalLinks} 个链接，已打开 ${stats.openedTabs} 个标签页`
        });
      }
    } else {
      // 单页模式
      const links = await fetchLinksFromUrl(url);
      if (links.length > 0) {
        stats.totalLinks = links.length;
        await openLinksInBatches(links, batchSize, delayMs, stats);
        safeSendMessage({
          action: 'movieComplete',
          message: `✓ 完成！总共发现 ${stats.totalLinks} 个链接，已打开 ${stats.openedTabs} 个标签页`
        });
      } else {
        safeSendMessage({
          action: 'movieComplete',
          message: '未找到任何链接'
        });
      }
    }
  } catch (error) {
    console.error('处理电影链接失败:', error);
    safeSendMessage({
      action: 'movieError',
      message: '处理失败，请检查 URL'
    });
  } finally {
    movieTaskRunning = false;
    movieTaskCancelled = false;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startRefreshing') {
    // 若已在刷新则先停止旧任务
    if (isRefreshing && refreshTimeoutId) {
      clearTimeout(refreshTimeoutId);
    }
    isRefreshing = true;

    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      let index = 0;
      const total = tabs.length;

      const refreshNextTab = () => {
        if (!isRefreshing) return; // 若已停止则结束
        if (index < tabs.length) {
          chrome.tabs.reload(tabs[index].id, () => {
            safeSendMessage({ action: 'refreshProgress', current: index + 1, total });
            index++;
            refreshTimeoutId = setTimeout(refreshNextTab, request.interval);
          });
        } else {
          safeSendMessage({ action: 'refreshComplete' });
          // 所有标签刷新完毕，自动停止
          isRefreshing = false;
          refreshTimeoutId = null;
        }
      };

      refreshNextTab();
    });
  } else if (request.action === 'stopRefreshing') {
    isRefreshing = false;
    if (refreshTimeoutId) {
      clearTimeout(refreshTimeoutId);
      refreshTimeoutId = null;
    }
  } else if (request.action === 'openMovieLinks') {
    // 处理电影链接打开任务
    if (!movieTaskRunning) {
      handleMovieLinksTask(request);
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, message: '任务正在进行中' });
    }
    return true; // 保持消息通道打开
  } else if (request.action === 'cancelMovieTask') {
    movieTaskCancelled = true;
    sendResponse({ success: true });
  }
});