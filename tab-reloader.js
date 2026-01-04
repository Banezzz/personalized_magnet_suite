import { showToast, addLog, saveHistory } from './utils.js';

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
      saveHistory({
        action: '标签页刷新',
        result: `刷新了 ${message.total || '全部'} 个标签页`
      });
    }
  });
}
