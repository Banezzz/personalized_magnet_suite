import { showToast } from './utils.js';

export function initMovieLinks() {
  const openBtn = document.getElementById('openMovieLinks');
  if (!openBtn) return;

  // 监听来自 background 的进度消息
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'movieProgress') {
      if (message.message) {
        updateProgress(message.message);
      } else if (message.current && message.total) {
        updateProgress(`进度: ${message.current}/${message.total} 链接已打开`);
      }
    } else if (message.action === 'movieComplete') {
      updateProgress(message.message || '完成！');
      showToast(message.message || '所有链接已打开');
    } else if (message.action === 'movieError') {
      updateProgress('');
      showToast(message.message || '处理失败');
    } else if (message.action === 'movieTaskCancelled') {
      updateProgress('任务已取消');
      showToast('任务已取消');
    }
  });

  openBtn.addEventListener('click', () => {
    const urlInput = document.getElementById('movieUrl').value.trim();
    const isTopChecked = document.getElementById('topOption').checked;
    const batchSize = parseInt(document.getElementById('batchSize').value) || 2;
    const delaySeconds = parseFloat(document.getElementById('delaySeconds').value) || 3;

    if (!urlInput) {
      showToast('请输入有效的电影链接 URL');
      return;
    }

    // 发送消息给 background.js 处理
    chrome.runtime.sendMessage({
      action: 'openMovieLinks',
      url: urlInput,
      isTopMode: isTopChecked,
      batchSize,
      delaySeconds
    }, (response) => {
      if (response && response.success) {
        showToast(isTopChecked ? '开始处理多页链接...' : '开始打开链接...');
        updateProgress('任务已启动，可以关闭此窗口');
      } else {
        showToast(response?.message || '任务启动失败');
      }
    });
  });
}

function updateProgress(message) {
  const progressEl = document.getElementById('movieProgress');
  if (progressEl) {
    progressEl.textContent = message;
  }
} 