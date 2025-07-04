import { showToast } from './utils.js';

export function initTabReloader() {
  const startBtn = document.getElementById('startRefreshing');
  const stopBtn = document.getElementById('stopRefreshing');

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      const interval = parseFloat(document.getElementById('refreshInterval').value) * 1000;
      if (isNaN(interval) || interval < 100) {
        showToast('请输入有效的刷新间隔（至少 0.1 秒）');
        return;
      }
      chrome.runtime.sendMessage({ action: 'startRefreshing', interval });
      showToast('标签页刷新已开始');
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'stopRefreshing' });
      showToast('标签页刷新已停止');
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
    }
  });
} 