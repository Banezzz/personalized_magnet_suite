// Toast 通知
export function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

// 主题应用
export function applyTheme(isDark) {
  const root = document.documentElement;
  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

// 主题切换初始化
export function initThemeToggle() {
  const toggle = document.getElementById('themeToggle');
  if (!toggle) return;
  chrome.storage.sync.get(['isDarkTheme'], (data) => {
    const isDark = data.isDarkTheme ?? false;
    toggle.checked = isDark;
    applyTheme(isDark);
  });

  toggle.addEventListener('change', () => {
    const isDark = toggle.checked;
    applyTheme(isDark);
    chrome.storage.sync.set({ isDarkTheme: isDark });
  });
}

// 显示标签计数
export function showTabCount() {
  const countEl = document.getElementById('tabCount');
  if (!countEl) return;
  chrome.tabs.query({ currentWindow: true }, (tabs) => {
    countEl.textContent = `当前窗口标签数: ${tabs.length}`;
  });
}

// ==================== 日志功能（持久化存储） ====================

const MAX_LOGS = 200;
let logs = [];

// 加载持久化日志
export function loadLogs() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['persistentLogs'], (data) => {
      logs = data.persistentLogs || [];
      updateLogDisplay();
      resolve(logs);
    });
  });
}

// 保存日志到存储
function saveLogs() {
  chrome.storage.local.set({ persistentLogs: logs });
}

export function addLog(message, level = 'info') {
  const timestamp = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const date = new Date().toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit'
  });

  const logEntry = { date, timestamp, message, level };
  logs.unshift(logEntry);

  // 限制日志数量
  if (logs.length > MAX_LOGS) {
    logs = logs.slice(0, MAX_LOGS);
  }

  // 持久化保存
  saveLogs();

  // 更新UI
  updateLogDisplay();
}

function updateLogDisplay() {
  const container = document.getElementById('logContainer');
  if (!container) return;

  container.innerHTML = logs.map(log => `
    <div class="log-entry">
      <span class="log-time">[${log.date} ${log.timestamp}]</span>
      <span class="log-message log-${log.level}">${log.message}</span>
    </div>
  `).join('');
}

export function clearLogs() {
  logs = [];
  saveLogs();
  updateLogDisplay();
  showToast('日志已清空');
}

// ==================== 历史记录功能（支持任务状态） ====================

const MAX_HISTORY = 50;

// 任务状态常量
export const TASK_STATUS = {
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

// 生成唯一ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// 创建历史记录（任务启动时调用，返回 ID 供后续更新）
export function createHistory(entry) {
  const id = generateId();
  const timestamp = new Date().toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const historyEntry = {
    id,
    action: entry.action,
    result: entry.result || '进行中...',
    status: TASK_STATUS.RUNNING,
    timestamp,
    startTime: Date.now()
  };

  chrome.storage.local.get(['taskHistory'], (data) => {
    let history = data.taskHistory || [];
    history.unshift(historyEntry);

    // 限制历史数量
    if (history.length > MAX_HISTORY) {
      history = history.slice(0, MAX_HISTORY);
    }

    chrome.storage.local.set({ taskHistory: history }, () => {
      updateHistoryDisplay();
    });
  });

  return id;
}

// 更新历史记录（任务完成/失败时调用）
export function updateHistory(id, updates) {
  chrome.storage.local.get(['taskHistory'], (data) => {
    let history = data.taskHistory || [];
    const index = history.findIndex(item => item.id === id);

    if (index !== -1) {
      history[index] = {
        ...history[index],
        ...updates,
        endTime: Date.now()
      };

      // 计算耗时
      if (history[index].startTime) {
        const duration = Math.round((history[index].endTime - history[index].startTime) / 1000);
        history[index].duration = duration;
      }

      chrome.storage.local.set({ taskHistory: history }, () => {
        updateHistoryDisplay();
      });
    }
  });
}

// 保留旧的 saveHistory 接口以兼容简单场景
export function saveHistory(entry) {
  const timestamp = new Date().toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  const historyEntry = {
    id: generateId(),
    ...entry,
    status: TASK_STATUS.COMPLETED,
    timestamp
  };

  chrome.storage.local.get(['taskHistory'], (data) => {
    let history = data.taskHistory || [];
    history.unshift(historyEntry);

    // 限制历史数量
    if (history.length > MAX_HISTORY) {
      history = history.slice(0, MAX_HISTORY);
    }

    chrome.storage.local.set({ taskHistory: history }, () => {
      updateHistoryDisplay();
    });
  });
}

export function loadHistory() {
  chrome.storage.local.get(['taskHistory'], (data) => {
    const history = data.taskHistory || [];
    displayHistory(history);
  });
}

function updateHistoryDisplay() {
  chrome.storage.local.get(['taskHistory'], (data) => {
    const history = data.taskHistory || [];
    displayHistory(history);
  });
}

// 状态图标和颜色映射
function getStatusDisplay(status) {
  switch (status) {
    case TASK_STATUS.RUNNING:
      return { icon: '⏳', color: 'var(--accent)', text: '进行中' };
    case TASK_STATUS.COMPLETED:
      return { icon: '✓', color: 'var(--success)', text: '已完成' };
    case TASK_STATUS.FAILED:
      return { icon: '✗', color: '#ef4444', text: '失败' };
    case TASK_STATUS.CANCELLED:
      return { icon: '⊘', color: '#f59e0b', text: '已取消' };
    default:
      return { icon: '✓', color: 'var(--success)', text: '已完成' };
  }
}

function displayHistory(history) {
  const container = document.getElementById('historyList');
  if (!container) return;

  if (history.length === 0) {
    container.innerHTML = '<div style="color: var(--text-secondary); font-size: 11px;">暂无历史记录</div>';
    return;
  }

  container.innerHTML = history.map(item => {
    const statusDisplay = getStatusDisplay(item.status);
    const durationText = item.duration ? ` (${item.duration}秒)` : '';
    return `
    <div class="history-item history-${item.status || 'completed'}">
      <div class="history-info">
        <div class="history-action">
          <span class="history-status-icon" style="color: ${statusDisplay.color}">${statusDisplay.icon}</span>
          ${item.action}
        </div>
        <div class="history-result">${item.result}${durationText}</div>
      </div>
      <div class="history-time">${item.timestamp}</div>
    </div>
  `}).join('');
}

export function clearHistory() {
  chrome.storage.local.set({ taskHistory: [] }, () => {
    updateHistoryDisplay();
    showToast('历史记录已清空');
  });
}

// ==================== 可折叠区域 ====================

export function initCollapsibles() {
  // 历史记录折叠
  const historyToggle = document.getElementById('historyToggle');
  const historyContent = document.getElementById('historyContent');
  if (historyToggle && historyContent) {
    historyToggle.addEventListener('click', () => {
      const section = historyToggle.closest('.collapsible');
      const isExpanded = section.classList.toggle('expanded');
      historyContent.style.display = isExpanded ? 'block' : 'none';
      if (isExpanded) loadHistory();
    });
  }

  // 日志折叠
  const logToggle = document.getElementById('logToggle');
  const logContent = document.getElementById('logContent');
  if (logToggle && logContent) {
    logToggle.addEventListener('click', () => {
      const section = logToggle.closest('.collapsible');
      const isExpanded = section.classList.toggle('expanded');
      logContent.style.display = isExpanded ? 'block' : 'none';
    });
  }

  // 清空按钮
  const clearHistoryBtn = document.getElementById('clearHistory');
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', clearHistory);
  }

  const clearLogsBtn = document.getElementById('clearLogs');
  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', clearLogs);
  }
}

// ==================== 网络状态检测 ====================

export function initNetworkStatus() {
  const statusEl = document.getElementById('networkStatus');
  if (!statusEl) return;

  const updateStatus = () => {
    const isOnline = navigator.onLine;
    const dot = statusEl.querySelector('.status-dot');
    const text = statusEl.querySelector('.status-text');

    if (isOnline) {
      statusEl.classList.remove('offline');
      statusEl.classList.add('online');
      text.textContent = '网络正常';
    } else {
      statusEl.classList.remove('online');
      statusEl.classList.add('offline');
      text.textContent = '网络离线';
    }
  };

  // 初始状态
  updateStatus();

  // 监听网络变化
  window.addEventListener('online', () => {
    updateStatus();
    showToast('网络已恢复');
    addLog('网络已恢复', 'success');
  });

  window.addEventListener('offline', () => {
    updateStatus();
    showToast('网络已断开');
    addLog('网络已断开', 'error');
  });
}

// ==================== 任务队列 ====================

let taskQueue = [];
let isProcessingQueue = false;

export function addToQueue(task) {
  taskQueue.push(task);
  addLog(`任务已添加到队列: ${task.name}`, 'info');
  showToast(`任务已加入队列 (${taskQueue.length})`);

  if (!isProcessingQueue) {
    processQueue();
  }
}

async function processQueue() {
  if (taskQueue.length === 0) {
    isProcessingQueue = false;
    return;
  }

  isProcessingQueue = true;
  const task = taskQueue.shift();

  addLog(`开始处理队列任务: ${task.name}`, 'info');

  try {
    await task.execute();
    addLog(`队列任务完成: ${task.name}`, 'success');
  } catch (error) {
    addLog(`队列任务失败: ${task.name} - ${error.message}`, 'error');
  }

  // 继续处理下一个任务
  processQueue();
}

export function getQueueLength() {
  return taskQueue.length;
}

export function clearQueue() {
  taskQueue = [];
  isProcessingQueue = false;
  showToast('任务队列已清空');
  addLog('任务队列已清空', 'warning');
}
