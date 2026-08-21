/**
 * Service worker: sequential tab refresh and movie-link batch opening.
 * Task state is persisted to chrome.storage.local so MV3 restarts can recover.
 */

import {
  ACTIONS,
  ALARM_KEEP_ALIVE,
  DEFAULTS,
  SITE_PRESETS,
  STORAGE_KEYS
} from './constants.js';
import { delay, randomBetween, sleep } from './delay-utils.js';
import { createHistoryEntry, TASK_STATUS, updateHistoryEntry } from './history-store.js';
import {
  describeExtractionFailure,
  filterDuplicateLinks,
  isHttpUrl,
  normalizeUrl,
  resolveRelativeUrl
} from './url-utils.js';

let refreshTimeoutId = null;
let isRefreshing = false;
let movieTaskRunning = false;
let movieTaskCancelled = false;
let movieHistoryId = null;
let refreshHistoryId = null;
let movieGroupId = null;

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

function storageRemove(keys) {
  return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
}

function safeSendMessage(msg) {
  chrome.runtime.sendMessage(msg, () => {
    if (chrome.runtime.lastError) {
      // Popup may be closed; storage remains the source of truth.
    }
  });
}

function startKeepAlive() {
  chrome.alarms.create(ALARM_KEEP_ALIVE, { delayInMinutes: DEFAULTS.keepAliveMinutes });
}

function stopKeepAliveIfIdle() {
  if (!movieTaskRunning && !isRefreshing) {
    chrome.alarms.clear(ALARM_KEEP_ALIVE);
  }
}

function createTab(options) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create(options, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        reject(new Error(chrome.runtime.lastError?.message || 'Failed to create tab'));
        return;
      }
      resolve(tab);
    });
  });
}

function removeTab(tabId) {
  return new Promise((resolve) => {
    if (!tabId) {
      resolve();
      return;
    }
    chrome.tabs.remove(tabId, () => {
      resolve();
    });
  });
}

function queryTabs(queryInfo) {
  return new Promise((resolve) => {
    chrome.tabs.query(queryInfo, (tabs) => resolve(tabs || []));
  });
}

async function getOpenedTabUrls() {
  const tabs = await queryTabs({});
  return new Set(tabs.map((tab) => normalizeUrl(tab.url)).filter(Boolean));
}

async function persistMovieProgress(progress) {
  await storageSet({ [STORAGE_KEYS.movieTaskProgress]: progress });
}

async function clearMovieProgress() {
  await storageRemove(STORAGE_KEYS.movieTaskProgress);
}

async function persistRefreshProgress(progress) {
  await storageSet({ [STORAGE_KEYS.refreshTaskProgress]: progress });
}

async function clearRefreshProgress() {
  await storageRemove(STORAGE_KEYS.refreshTaskProgress);
}

function collectPageLinks(selector) {
  const title = document.title || '';
  const snippet = document.documentElement?.innerHTML
    ? document.documentElement.innerHTML.slice(0, 25000)
    : '';
  const blocked = /just a moment/i.test(title)
    || /cf-browser-verification|challenge-platform|cf-challenge/i.test(snippet)
    || !!document.querySelector('#cf-wrapper, .cf-browser-verification, #challenge-form');
  const bodyText = (document.body?.innerText || '').slice(0, 3000);
  const login = /\/login/i.test(location.pathname)
    || (!!document.querySelector('form input[type="password"]')
      && /(javdb|sign in|登录|登入)/i.test(`${bodyText}${title}`));
  const nodes = [...document.querySelectorAll(selector)];
  return {
    title,
    hrefs: nodes.map((node) => node.getAttribute('href')).filter(Boolean),
    selectorMatches: nodes.length,
    blocked,
    login,
    hasMovieList: !!document.querySelector('.movie-list')
  };
}

function executeCollect(tabId, selector) {
  return new Promise((resolve) => {
    chrome.scripting.executeScript({
      target: { tabId },
      func: collectPageLinks,
      args: [selector]
    }, (results) => {
      if (chrome.runtime.lastError) {
        resolve({ error: 'script_failed', message: chrome.runtime.lastError.message });
        return;
      }
      resolve(results?.[0]?.result || { hrefs: [], error: 'script_failed' });
    });
  });
}

async function extractWithRetry(tabId, selector, pageUrl, baseUrl) {
  const deadline = Date.now() + DEFAULTS.extractMaxWaitMs;
  let last = { hrefs: [] };

  while (Date.now() < deadline) {
    last = await executeCollect(tabId, selector);
    if (last.error || last.blocked || last.login || (last.hrefs && last.hrefs.length > 0)) {
      break;
    }
    await sleep(DEFAULTS.extractPollMs);
  }

  const hrefs = (last.hrefs || [])
    .map((href) => resolveRelativeUrl(href, baseUrl, pageUrl))
    .filter((url) => url && isHttpUrl(url));

  return { hrefs, diagnostic: last };
}

async function fetchLinksFromUrl(url, selector, baseUrl) {
  let settled = false;
  let timeoutId = null;
  let tabId = null;
  let listener = null;

  const finish = async (result) => {
    if (settled) return result;
    settled = true;
    if (timeoutId) clearTimeout(timeoutId);
    if (listener) chrome.tabs.onUpdated.removeListener(listener);
    await removeTab(tabId);
    return result;
  };

  return new Promise((resolve) => {
    chrome.tabs.create({ url, active: false }, async (tab) => {
      if (chrome.runtime.lastError || !tab) {
        resolve(await finish({
          hrefs: [],
          diagnostic: {
            error: 'tab_create_failed',
            message: chrome.runtime.lastError?.message || 'tab create failed'
          }
        }));
        return;
      }

      tabId = tab.id;
      let extractStarted = false;

      const runExtract = async () => {
        if (settled || extractStarted) return;
        extractStarted = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (listener) {
          chrome.tabs.onUpdated.removeListener(listener);
          listener = null;
        }
        const extracted = await extractWithRetry(tabId, selector, url, baseUrl);
        resolve(await finish(extracted));
      };

      listener = (updatedTabId, changeInfo) => {
        if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
        runExtract();
      };
      chrome.tabs.onUpdated.addListener(listener);

      chrome.tabs.get(tabId, (fresh) => {
        if (!settled && fresh?.status === 'complete') {
          runExtract();
        }
      });

      timeoutId = setTimeout(async () => {
        resolve(await finish({ hrefs: [], diagnostic: { error: 'timeout' } }));
      }, DEFAULTS.extractTimeoutMs + DEFAULTS.extractMaxWaitMs);
    });
  });
}

async function addTabsToGroup(tabIds) {
  if (!tabIds.length) return;
  try {
    if (movieGroupId == null) {
      movieGroupId = await chrome.tabs.group({ tabIds });
      await chrome.tabGroups.update(movieGroupId, { title: 'Movie Links', color: 'blue' });
    } else {
      await chrome.tabs.group({ tabIds, groupId: movieGroupId });
    }
  } catch (error) {
    console.warn('Failed to group tabs:', error);
    movieGroupId = null;
  }
}

async function openLinksInBatches(urls, batchSize, delayMs, stats, openedUrls, openInGroup, persistFn) {
  for (let i = 0; i < urls.length; i += batchSize) {
    if (movieTaskCancelled) return { cancelled: true };

    const batch = urls.slice(i, i + batchSize).filter(isHttpUrl);
    const createdIds = [];
    await Promise.all(batch.map(async (url) => {
      try {
        const tab = await createTab({ url, active: false });
        createdIds.push(tab.id);
        stats.openedTabs += 1;
        openedUrls.add(normalizeUrl(url));
      } catch (error) {
        stats.failedTabs += 1;
        console.warn('Failed to open tab:', url, error);
      }
    }));

    if (openInGroup) {
      await addTabsToGroup(createdIds);
    }

    const progress = Math.min(i + batchSize, urls.length);
    const message = `进度: ${progress}/${urls.length} 链接已打开`;
    safeSendMessage({
      action: ACTIONS.movieProgress,
      current: progress,
      total: urls.length,
      message
    });
    await persistFn({
      message,
      current: progress,
      total: urls.length,
      stats: { ...stats }
    });

    if (i + batchSize < urls.length) {
      await delay(delayMs);
    }
  }
  return { cancelled: false };
}

function skippedSuffix(stats) {
  return stats.skippedLinks > 0 ? `，跳过 ${stats.skippedLinks} 个已打开的链接` : '';
}

async function finalizeMovieTask(kind, message, historyId) {
  movieTaskRunning = false;
  movieTaskCancelled = false;
  movieGroupId = null;
  await clearMovieProgress();
  stopKeepAliveIfIdle();

  if (kind === 'cancelled') {
    await updateHistoryEntry(historyId, {
      status: TASK_STATUS.CANCELLED,
      result: '用户取消任务'
    });
    safeSendMessage({ action: ACTIONS.movieTaskCancelled });
    return;
  }

  if (kind === 'error') {
    await updateHistoryEntry(historyId, {
      status: TASK_STATUS.FAILED,
      result: message
    });
    safeSendMessage({ action: ACTIONS.movieError, message });
    return;
  }

  await updateHistoryEntry(historyId, {
    status: TASK_STATUS.COMPLETED,
    result: message
  });
  safeSendMessage({ action: ACTIONS.movieComplete, message });
}

async function handleMovieLinksTask(request, { resumed = false } = {}) {
  if (movieTaskRunning) {
    return;
  }

  movieTaskRunning = true;
  movieTaskCancelled = false;
  movieGroupId = request.resumeState?.groupId ?? null;
  startKeepAlive();

  const {
    url,
    isTopMode,
    batchSize,
    delaySeconds,
    selector,
    baseUrl,
    topPages,
    openInGroup
  } = request;

  const delayMs = (delaySeconds || DEFAULTS.delaySeconds) * 1000;
  const pageCount = Math.min(
    Math.max(parseInt(topPages, 10) || DEFAULTS.topPages, 1),
    DEFAULTS.maxTopPages
  );
  const linkSelector = selector || SITE_PRESETS.javdb.selector;
  const linkBaseUrl = baseUrl || SITE_PRESETS.javdb.baseUrl;
  const openedUrls = await getOpenedTabUrls();
  if (Array.isArray(request.resumeState?.openedUrls)) {
    for (const opened of request.resumeState.openedUrls) {
      openedUrls.add(normalizeUrl(opened));
    }
  }

  const stats = request.resumeState?.stats || {
    totalLinks: 0,
    openedTabs: 0,
    skippedLinks: 0,
    failedTabs: 0
  };

  if (request.historyId) {
    movieHistoryId = request.historyId;
  } else if (request.resumeState?.historyId) {
    movieHistoryId = request.resumeState.historyId;
  } else {
    const created = await createHistoryEntry({
      action: '电影链接打开',
      result: `正在处理: ${String(url).slice(0, 50)}`
    });
    movieHistoryId = created.id;
  }

  const persist = async (extra = {}) => {
    await persistMovieProgress({
      running: true,
      type: 'movie',
      url,
      isTopMode,
      historyId: movieHistoryId,
      config: {
        url,
        isTopMode,
        batchSize,
        delaySeconds,
        selector: linkSelector,
        baseUrl: linkBaseUrl,
        topPages: pageCount,
        openInGroup,
        historyId: movieHistoryId
      },
      openedUrls: [...openedUrls],
      groupId: movieGroupId,
      startTime: request.resumeState?.startTime || Date.now(),
      stats: { ...stats },
      ...extra
    });
  };

  await persist({ message: resumed ? '任务已恢复' : '任务已启动，可以关闭此窗口' });

  try {
    if (isTopMode) {
      const startPage = request.resumeState?.currentPage || 1;
      let consecutiveEmpty = request.resumeState?.consecutiveEmpty || 0;

      for (let page = startPage; page <= pageCount; page += 1) {
        if (movieTaskCancelled) {
          await finalizeMovieTask('cancelled', '', movieHistoryId);
          return;
        }

        const progressMsg = `正在处理第 ${page}/${pageCount} 页...`;
        safeSendMessage({
          action: ACTIONS.movieProgress,
          message: progressMsg,
          currentPage: page,
          totalPages: pageCount
        });
        await persist({
          message: progressMsg,
          currentPage: page,
          totalPages: pageCount,
          consecutiveEmpty
        });

        const pageUrl = new URL(url);
        pageUrl.searchParams.set('page', page);
        const { hrefs, diagnostic } = await fetchLinksFromUrl(
          pageUrl.toString(),
          linkSelector,
          linkBaseUrl
        );

        if (movieTaskCancelled) {
          await finalizeMovieTask('cancelled', '', movieHistoryId);
          return;
        }

        if (hrefs.length === 0) {
          consecutiveEmpty += 1;
          const reason = describeExtractionFailure(diagnostic);
          safeSendMessage({
            action: ACTIONS.movieProgress,
            message: `第 ${page} 页: ${reason}`
          });
          if (diagnostic?.blocked || diagnostic?.login) {
            await finalizeMovieTask('error', reason, movieHistoryId);
            return;
          }
          if (consecutiveEmpty >= DEFAULTS.emptyPagesToStop) {
            break;
          }
        } else {
          consecutiveEmpty = 0;
          stats.totalLinks += hrefs.length;
          const { newLinks, skippedLinks } = filterDuplicateLinks(hrefs, openedUrls);
          stats.skippedLinks += skippedLinks.length;
          if (newLinks.length > 0) {
            const result = await openLinksInBatches(
              newLinks,
              batchSize,
              delayMs,
              stats,
              openedUrls,
              openInGroup,
              persist
            );
            if (result.cancelled || movieTaskCancelled) {
              await finalizeMovieTask('cancelled', '', movieHistoryId);
              return;
            }
          }
        }

        if (page < pageCount && !movieTaskCancelled) {
          await delay(randomBetween(DEFAULTS.topPageDelayMinMs, DEFAULTS.topPageDelayMaxMs), { jitterRatio: 0 });
        }
      }

      if (movieTaskCancelled) {
        await finalizeMovieTask('cancelled', '', movieHistoryId);
        return;
      }

      const message = `✓ 所有页面处理完毕！总共发现 ${stats.totalLinks} 个链接，已打开 ${stats.openedTabs} 个标签页${skippedSuffix(stats)}`;
      await finalizeMovieTask('complete', message, movieHistoryId);
      return;
    }

    const { hrefs, diagnostic } = await fetchLinksFromUrl(url, linkSelector, linkBaseUrl);
    if (movieTaskCancelled) {
      await finalizeMovieTask('cancelled', '', movieHistoryId);
      return;
    }

    if (hrefs.length === 0) {
      await finalizeMovieTask('complete', describeExtractionFailure(diagnostic), movieHistoryId);
      return;
    }

    stats.totalLinks = hrefs.length;
    const { newLinks, skippedLinks } = filterDuplicateLinks(hrefs, openedUrls);
    stats.skippedLinks = skippedLinks.length;
    if (newLinks.length > 0) {
      const result = await openLinksInBatches(
        newLinks,
        batchSize,
        delayMs,
        stats,
        openedUrls,
        openInGroup,
        persist
      );
      if (result.cancelled || movieTaskCancelled) {
        await finalizeMovieTask('cancelled', '', movieHistoryId);
        return;
      }
    }

    const message = `✓ 完成！总共发现 ${stats.totalLinks} 个链接，已打开 ${stats.openedTabs} 个标签页${skippedSuffix(stats)}`;
    await finalizeMovieTask('complete', message, movieHistoryId);
  } catch (error) {
    console.error('Movie link task failed:', error);
    await finalizeMovieTask('error', '处理失败，请检查 URL', movieHistoryId);
  }
}

async function startRefreshing(request) {
  if (isRefreshing && refreshTimeoutId) {
    clearTimeout(refreshTimeoutId);
  }
  isRefreshing = true;
  startKeepAlive();

  refreshHistoryId = request.historyId || null;
  if (!refreshHistoryId) {
    const created = await createHistoryEntry({
      action: '标签页刷新',
      result: `正在刷新，间隔 ${request.interval / 1000} 秒`
    });
    refreshHistoryId = created.id;
  }

  const queryOptions = { currentWindow: true };
  if (request.excludePinned) {
    queryOptions.pinned = false;
  }

  const tabs = await queryTabs(queryOptions);
  let index = 0;
  const total = tabs.length;

  await persistRefreshProgress({
    running: true,
    type: 'refresh',
    historyId: refreshHistoryId,
    interval: request.interval,
    excludePinned: !!request.excludePinned,
    current: 0,
    total,
    message: '刷新已开始'
  });

  const refreshNextTab = async () => {
    if (!isRefreshing) return;
    if (index < tabs.length) {
      chrome.tabs.reload(tabs[index].id, async () => {
        if (!isRefreshing) return;
        safeSendMessage({ action: ACTIONS.refreshProgress, current: index + 1, total });
        await persistRefreshProgress({
          running: true,
          type: 'refresh',
          historyId: refreshHistoryId,
          current: index + 1,
          total,
          message: `刷新进度: ${index + 1} / ${total}`
        });
        index += 1;
        refreshTimeoutId = setTimeout(refreshNextTab, request.interval);
      });
      return;
    }

    isRefreshing = false;
    refreshTimeoutId = null;
    await clearRefreshProgress();
    stopKeepAliveIfIdle();
    await updateHistoryEntry(refreshHistoryId, {
      status: TASK_STATUS.COMPLETED,
      result: `刷新了 ${total} 个标签页`
    });
    refreshHistoryId = null;
    safeSendMessage({ action: ACTIONS.refreshComplete, total });
  };

  refreshNextTab();
}

async function stopRefreshing({ cancelledByUser = true } = {}) {
  isRefreshing = false;
  if (refreshTimeoutId) {
    clearTimeout(refreshTimeoutId);
    refreshTimeoutId = null;
  }
  await clearRefreshProgress();
  stopKeepAliveIfIdle();
  if (refreshHistoryId && cancelledByUser) {
    await updateHistoryEntry(refreshHistoryId, {
      status: TASK_STATUS.CANCELLED,
      result: '用户手动停止'
    });
  }
  refreshHistoryId = null;
}

async function recoverInterruptedTasks() {
  const data = await storageGet([
    STORAGE_KEYS.movieTaskProgress,
    STORAGE_KEYS.refreshTaskProgress
  ]);

  const movie = data[STORAGE_KEYS.movieTaskProgress];
  if (movie?.running && movie.config) {
    handleMovieLinksTask({
      ...movie.config,
      historyId: movie.historyId || movie.config.historyId,
      resumeState: movie
    }, { resumed: true });
  }

  const refresh = data[STORAGE_KEYS.refreshTaskProgress];
  if (refresh?.running) {
    await updateHistoryEntry(refresh.historyId, {
      status: TASK_STATUS.FAILED,
      result: '后台重启，刷新任务已中断'
    });
    await clearRefreshProgress();
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_KEEP_ALIVE) return;
  if (movieTaskRunning || isRefreshing) {
    startKeepAlive();
  }
});

recoverInterruptedTasks();

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === ACTIONS.startRefreshing) {
    startRefreshing(request);
    sendResponse({ success: true });
    return true;
  }

  if (request.action === ACTIONS.stopRefreshing) {
    stopRefreshing({ cancelledByUser: true }).then(() => sendResponse({ success: true }));
    return true;
  }

  if (request.action === ACTIONS.openMovieLinks) {
    if (movieTaskRunning) {
      sendResponse({ success: false, message: '任务正在进行中' });
      return true;
    }
    handleMovieLinksTask(request);
    sendResponse({ success: true });
    return true;
  }

  if (request.action === ACTIONS.cancelMovieTask) {
    movieTaskCancelled = true;
    sendResponse({ success: true });
    return true;
  }

  if (request.action === ACTIONS.getMovieTaskStatus) {
    storageGet([STORAGE_KEYS.movieTaskProgress]).then((data) => {
      const progress = data[STORAGE_KEYS.movieTaskProgress] || null;
      sendResponse({
        running: movieTaskRunning || !!(progress && progress.running),
        progress
      });
    });
    return true;
  }

  if (request.action === ACTIONS.getRefreshTaskStatus) {
    storageGet([STORAGE_KEYS.refreshTaskProgress]).then((data) => {
      const progress = data[STORAGE_KEYS.refreshTaskProgress] || null;
      sendResponse({
        running: isRefreshing || !!(progress && progress.running),
        progress
      });
    });
    return true;
  }

  return false;
});
