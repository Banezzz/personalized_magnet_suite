import { ACTIONS, STORAGE_KEYS } from './constants.js';
import { ensureOriginsForTabs } from './permissions.js';
import { describeRefreshFilters, isTabInGroup } from './refresh-filters.js';
import { isRestrictedTabUrl } from './url-utils.js';
import { showToast, addLog, createHistory } from './utils.js';

let currentRefreshHistoryId = null;
let refreshRunning = false;

function getToggleBtn() {
  return document.getElementById('toggleRefreshing');
}

function readRefreshOptions() {
  const intervalSeconds = parseFloat(document.getElementById('refreshInterval')?.value);
  return {
    intervalSeconds,
    excludePinned: !!document.getElementById('excludePinned')?.checked,
    onlyNoMagnet: !!document.getElementById('onlyNoMagnet')?.checked,
    onlyInGroup: !!document.getElementById('onlyInGroup')?.checked
  };
}

async function saveRefreshSettings() {
  const { intervalSeconds, excludePinned, onlyNoMagnet, onlyInGroup } = readRefreshOptions();
  await chrome.storage.local.set({
    [STORAGE_KEYS.refreshSettings]: {
      interval: Number.isFinite(intervalSeconds) ? String(intervalSeconds) : '1',
      excludePinned,
      onlyNoMagnet,
      onlyInGroup
    }
  });
}

async function restoreRefreshSettings() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.refreshSettings]);
  const settings = data[STORAGE_KEYS.refreshSettings] || {};
  const intervalEl = document.getElementById('refreshInterval');
  if (intervalEl && settings.interval) intervalEl.value = settings.interval;
  const excludePinned = document.getElementById('excludePinned');
  const onlyNoMagnet = document.getElementById('onlyNoMagnet');
  const onlyInGroup = document.getElementById('onlyInGroup');
  if (excludePinned && typeof settings.excludePinned === 'boolean') {
    excludePinned.checked = settings.excludePinned;
  }
  if (onlyNoMagnet && typeof settings.onlyNoMagnet === 'boolean') {
    onlyNoMagnet.checked = settings.onlyNoMagnet;
  }
  if (onlyInGroup && typeof settings.onlyInGroup === 'boolean') {
    onlyInGroup.checked = settings.onlyInGroup;
  }
}

function setRefreshBusy(isBusy) {
  refreshRunning = isBusy;
  const toggleBtn = getToggleBtn();
  if (!toggleBtn) return;
  toggleBtn.textContent = isBusy ? '停止刷新' : '开始刷新';
  toggleBtn.classList.toggle('cancel-btn', isBusy);
}

function updateRefreshProgress(current, total, message) {
  const progressEl = document.getElementById('refreshProgress');
  if (progressEl) {
    const text = message || (Number.isFinite(current) ? `刷新进度: ${current} / ${total}` : '');
    progressEl.textContent = text;
    progressEl.classList.toggle('is-empty', !text);
  }
  const barWrap = document.getElementById('refreshProgressBar');
  if (!barWrap) return;
  const fill = barWrap.querySelector('.progress-bar-fill');
  if (!Number.isFinite(current) || !total) {
    if (!message) barWrap.style.display = 'none';
    return;
  }
  barWrap.style.display = 'block';
  fill.classList.remove('indeterminate');
  fill.style.width = `${Math.round((current / total) * 100)}%`;
}

function restoreRefreshProgress() {
  chrome.runtime.sendMessage({ action: ACTIONS.getRefreshTaskStatus }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response?.running) {
      setRefreshBusy(true);
      const progress = response.progress;
      if (progress) {
        updateRefreshProgress(progress.current, progress.total, progress.message);
        currentRefreshHistoryId = progress.historyId || null;
      }
    } else {
      setRefreshBusy(false);
    }
  });
}

async function requestOriginsForMagnetFilter({ excludePinned, onlyInGroup }) {
  const query = { currentWindow: true };
  if (excludePinned) query.pinned = false;
  const tabs = await chrome.tabs.query(query);
  const candidates = tabs.filter((tab) => {
    if (onlyInGroup && !isTabInGroup(tab)) return false;
    return !isRestrictedTabUrl(tab.url);
  });
  await ensureOriginsForTabs(candidates);
}

async function startRefreshing() {
  const { intervalSeconds, excludePinned, onlyNoMagnet, onlyInGroup } = readRefreshOptions();
  const interval = intervalSeconds * 1000;
  if (Number.isNaN(interval) || interval < 100) {
    showToast('请输入有效的刷新间隔（至少 0.1 秒）');
    return;
  }

  await saveRefreshSettings();
  if (onlyNoMagnet) {
    await requestOriginsForMagnetFilter({ excludePinned, onlyInGroup });
  }

  const filterLabel = describeRefreshFilters({ excludePinned, onlyNoMagnet, onlyInGroup });
  currentRefreshHistoryId = await createHistory({
    action: '标签页刷新',
    result: `正在刷新，间隔 ${interval / 1000} 秒${filterLabel}`
  });

  chrome.runtime.sendMessage({
    action: ACTIONS.startRefreshing,
    interval,
    excludePinned,
    onlyNoMagnet,
    onlyInGroup,
    historyId: currentRefreshHistoryId
  }, (response) => {
    if (chrome.runtime.lastError || !response?.success) {
      showToast('无法开始刷新');
      addLog(chrome.runtime.lastError?.message || '刷新启动失败', 'error');
      setRefreshBusy(false);
      return;
    }
    setRefreshBusy(true);
    showToast('标签页刷新已开始');
    addLog(`开始刷新标签页，间隔 ${interval / 1000} 秒${filterLabel}`, 'info');
  });
}

function stopRefreshing() {
  chrome.runtime.sendMessage({ action: ACTIONS.stopRefreshing }, () => {
    if (chrome.runtime.lastError) return;
    showToast('标签页刷新已停止');
    addLog('停止刷新标签页', 'warning');
    setRefreshBusy(false);
    currentRefreshHistoryId = null;
  });
}

export function initTabReloader() {
  const toggleBtn = getToggleBtn();

  restoreRefreshSettings();
  restoreRefreshProgress();
  setRefreshBusy(false);

  ['refreshInterval', 'excludePinned', 'onlyNoMagnet', 'onlyInGroup'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', saveRefreshSettings);
  });

  if (toggleBtn) {
    toggleBtn.addEventListener('click', async () => {
      if (refreshRunning) {
        stopRefreshing();
        return;
      }
      await startRefreshing();
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === ACTIONS.refreshProgress) {
      updateRefreshProgress(message.current, message.total, message.message);
      setRefreshBusy(true);
    } else if (message.action === ACTIONS.refreshComplete) {
      if (!message.total) {
        updateRefreshProgress(0, 0, message.message || '没有符合条件的标签页');
        showToast(message.message || '没有符合条件的标签页');
        addLog(message.message || '没有符合条件的标签页', 'warning');
        setRefreshBusy(false);
        currentRefreshHistoryId = null;
        return;
      }
      updateRefreshProgress(message.total, message.total, '刷新完成');
      const barWrap = document.getElementById('refreshProgressBar');
      if (barWrap) {
        const fill = barWrap.querySelector('.progress-bar-fill');
        fill.style.width = '100%';
        setTimeout(() => {
          barWrap.style.display = 'none';
          fill.style.width = '0%';
        }, 2000);
      }
      showToast('所有标签刷新完毕');
      addLog('所有标签刷新完毕', 'success');
      setRefreshBusy(false);
      currentRefreshHistoryId = null;
    }
  });
}
