import { showToast, addLog, createHistory, updateHistory, TASK_STATUS } from './utils.js';

// 当前任务的历史记录 ID
let currentRefreshHistoryId = null;

export function initTabReloader() {
  const startBtn = document.getElementById('startRefreshing');
  const stopBtn = document.getElementById('stopRefreshing');
  const excludePinnedCheckbox = document.getElementById('excludePinned');

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      const interval = parseFloat(document.getElementById('refreshInterval').value) * 1000;
      if (isNaN(interval) || interval < 100) {
        showToast('请输入有效的刷新间隔（至少 0.1 秒）');
        return;
      }

      const excludePinned = excludePinnedCheckbox ? excludePinnedCheckbox.checked : false;

      // 创建历史记录（任务启动时立即显示）
      currentRefreshHistoryId = createHistory({
        action: '标签页刷新',
        result: `正在刷新，间隔 ${interval / 1000} 秒${excludePinned ? '（排除固定标签）' : ''}`
      });

      chrome.runtime.sendMessage({
        action: 'startRefreshing',
        interval,
        excludePinned
      });

      showToast('标签页刷新已开始');
      addLog(`开始刷新标签页，间隔 ${interval / 1000} 秒${excludePinned ? '（排除固定标签）' : ''}`, 'info');
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'stopRefreshing' });
      showToast('标签页刷新已停止');
      addLog('停止刷新标签页', 'warning');
      // 更新历史记录为取消状态
      if (currentRefreshHistoryId) {
        updateHistory(currentRefreshHistoryId, {
          status: TASK_STATUS.CANCELLED,
          result: '用户手动停止'
        });
        currentRefreshHistoryId = null;
      }
    });
  }

  // 监听后台消息显示进度
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'refreshProgress') {
      const progressEl = document.getElementById('refreshProgress');
      if (progressEl) {
        progressEl.textContent = `刷新进度: ${message.current} / ${message.total}`;
      }
    } else if (message.action === 'refreshComplete') {
      const progressEl = document.getElementById('refreshProgress');
      if (progressEl) progressEl.textContent = '刷新完成';
      showToast('所有标签刷新完毕');
      addLog('所有标签刷新完毕', 'success');
      // 更新历史记录为完成状态
      if (currentRefreshHistoryId) {
        updateHistory(currentRefreshHistoryId, {
          status: TASK_STATUS.COMPLETED,
          result: `刷新了 ${message.total || '全部'} 个标签页`
        });
        currentRefreshHistoryId = null;
      }
    }
  });
}
