import { showToast, addLog, createHistory, updateHistory, TASK_STATUS } from './utils.js';

// 网站选择器预设
const SITE_PRESETS = {
  javdb: {
    selector: '.movie-list.h.cols-4 a.box',
    baseUrl: 'https://javdb.com'
  },
  javbus: {
    selector: '.movie-box',
    baseUrl: ''  // 使用页面URL推断
  },
  javlibrary: {
    selector: '.video a[href*="/v="]',
    baseUrl: ''
  },
  'generic-list': {
    selector: 'a[href]',
    baseUrl: ''
  },
  custom: {
    selector: '',
    baseUrl: ''
  }
};

// 当前任务的历史记录 ID
let currentTaskHistoryId = null;

export function initMovieLinks() {
  const openBtn = document.getElementById('openMovieLinks');
  const cancelBtn = document.getElementById('cancelMovieTask');
  const sitePreset = document.getElementById('sitePreset');
  const customSelector = document.getElementById('customSelector');

  if (!openBtn) return;

  // 恢复持久化的任务进度（popup 重新打开时）
  restoreTaskProgress(cancelBtn);

  // 选择器预设切换
  if (sitePreset) {
    sitePreset.addEventListener('change', () => {
      if (sitePreset.value === 'custom') {
        customSelector.style.display = 'block';
      } else {
        customSelector.style.display = 'none';
      }
    });
  }

  // 取消按钮事件
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'cancelMovieTask' }, (response) => {
        if (response && response.success) {
          showToast('正在取消任务...');
          addLog('用户请求取消任务', 'warning');
        }
      });
    });
  }

  // 监听来自 background 的进度消息
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'movieProgress') {
      if (message.message) {
        updateProgress(message.message);
        addLog(message.message, 'info');
      } else if (message.current && message.total) {
        const progressMsg = `进度: ${message.current}/${message.total} 链接已打开`;
        updateProgress(progressMsg);
      }
      // 显示取消按钮
      if (cancelBtn) cancelBtn.style.display = 'block';
    } else if (message.action === 'movieComplete') {
      updateProgress(message.message || '完成！');
      showToast(message.message || '所有链接已打开');
      addLog(message.message || '任务完成', 'success');
      // 隐藏取消按钮
      if (cancelBtn) cancelBtn.style.display = 'none';
      // 更新历史记录为完成状态
      if (currentTaskHistoryId) {
        updateHistory(currentTaskHistoryId, {
          status: TASK_STATUS.COMPLETED,
          result: message.message || '完成'
        });
        currentTaskHistoryId = null;
      }
    } else if (message.action === 'movieError') {
      updateProgress('');
      showToast(message.message || '处理失败');
      addLog(message.message || '处理失败', 'error');
      if (cancelBtn) cancelBtn.style.display = 'none';
      // 更新历史记录为失败状态
      if (currentTaskHistoryId) {
        updateHistory(currentTaskHistoryId, {
          status: TASK_STATUS.FAILED,
          result: message.message || '处理失败'
        });
        currentTaskHistoryId = null;
      }
    } else if (message.action === 'movieTaskCancelled') {
      updateProgress('任务已取消');
      showToast('任务已取消');
      addLog('任务已取消', 'warning');
      if (cancelBtn) cancelBtn.style.display = 'none';
      // 更新历史记录为取消状态
      if (currentTaskHistoryId) {
        updateHistory(currentTaskHistoryId, {
          status: TASK_STATUS.CANCELLED,
          result: '用户取消任务'
        });
        currentTaskHistoryId = null;
      }
    }
  });

  openBtn.addEventListener('click', () => {
    const urlInput = document.getElementById('movieUrl').value.trim();
    const isTopChecked = document.getElementById('topOption').checked;
    const batchSize = parseInt(document.getElementById('batchSize').value) || 2;
    const delaySeconds = parseFloat(document.getElementById('delaySeconds').value) || 3;

    // 获取选择器配置
    const presetValue = sitePreset ? sitePreset.value : 'javdb';
    let selector, baseUrl;

    if (presetValue === 'custom') {
      selector = customSelector.value.trim();
      baseUrl = ''; // 自定义模式使用完整URL
      if (!selector) {
        showToast('请输入自定义CSS选择器');
        return;
      }
    } else {
      const preset = SITE_PRESETS[presetValue];
      selector = preset.selector;
      baseUrl = preset.baseUrl;
    }

    if (!urlInput) {
      showToast('请输入有效的电影链接 URL');
      return;
    }

    addLog(`开始任务: ${urlInput}`, 'info');

    // 创建历史记录（任务启动时立即显示）
    currentTaskHistoryId = createHistory({
      action: '电影链接打开',
      result: `正在处理: ${urlInput.substring(0, 50)}${urlInput.length > 50 ? '...' : ''}`
    });

    // 发送消息给 background.js 处理
    chrome.runtime.sendMessage({
      action: 'openMovieLinks',
      url: urlInput,
      isTopMode: isTopChecked,
      batchSize,
      delaySeconds,
      selector,
      baseUrl
    }, (response) => {
      if (response && response.success) {
        showToast(isTopChecked ? '开始处理多页链接...' : '开始打开链接...');
        updateProgress('任务已启动，可以关闭此窗口');
        if (cancelBtn) cancelBtn.style.display = 'block';
      } else {
        showToast(response?.message || '任务启动失败');
        addLog(response?.message || '任务启动失败', 'error');
        // 任务启动失败，更新历史记录
        if (currentTaskHistoryId) {
          updateHistory(currentTaskHistoryId, {
            status: TASK_STATUS.FAILED,
            result: response?.message || '任务启动失败'
          });
          currentTaskHistoryId = null;
        }
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

// 恢复持久化的任务进度
function restoreTaskProgress(cancelBtn) {
  // 先检查 background 是否有正在运行的任务
  chrome.runtime.sendMessage({ action: 'getMovieTaskStatus' }, (response) => {
    if (response && response.running) {
      // 有任务正在运行，从存储中读取进度
      chrome.storage.local.get(['movieTaskProgress'], (data) => {
        const progress = data.movieTaskProgress;
        if (progress && progress.running) {
          // 恢复显示进度
          updateProgress(progress.message || '任务进行中...');
          // 显示取消按钮
          if (cancelBtn) cancelBtn.style.display = 'block';
          addLog('检测到正在运行的任务，已恢复显示进度', 'info');
        }
      });
    }
  });
}
