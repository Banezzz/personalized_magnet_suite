import { ACTIONS } from './constants.js';
import { showToast, addLog, createHistory } from './utils.js';

let currentRefreshHistoryId = null;
let refreshRunning = false;

function getToggleBtn() {
  return document.getElementById('toggleRefreshing');
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

async function startRefreshing() {
  const interval = parseFloat(document.getElementById('refreshInterval').value) * 1000;
  if (Number.isNaN(interval) || interval < 100) {
    showToast('请输入有效的刷新间隔（至少 0.1 秒）');
    return;
  }

  const excludePinned = !!document.getElementById('excludePinned')?.checked;
  currentRefreshHistoryId = await createHistory({
    action: '标签页刷新',
    result: `正在刷新，间隔 ${interval / 1000} 秒${excludePinned ? '（排除固定标签）' : ''}`
  });

  chrome.runtime.sendMessage({
    action: ACTIONS.startRefreshing,
    interval,
    excludePinned,
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
    addLog(`开始刷新标签页，间隔 ${interval / 1000} 秒${excludePinned ? '（排除固定标签）' : ''}`, 'info');
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

  restoreRefreshProgress();
  setRefreshBusy(false);

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
      updateRefreshProgress(message.current, message.total);
      setRefreshBusy(true);
    } else if (message.action === ACTIONS.refreshComplete) {
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
