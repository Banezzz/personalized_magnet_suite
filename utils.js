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
let saveLogsTimer = null;

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

// 保存日志到存储（防抖，500ms内合并多次写入）
function saveLogs() {
  if (saveLogsTimer) clearTimeout(saveLogsTimer);
  saveLogsTimer = setTimeout(() => {
    chrome.storage.local.set({ persistentLogs: logs });
    saveLogsTimer = null;
  }, 500);
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

  // 持久化保存（防抖）
  saveLogs();

  // 增量更新UI（只插入新条目，不重建整个列表）
  const container = document.getElementById('logContainer');
  if (!container) return;
  const entryEl = createLogEntryElement(logEntry);
  container.insertBefore(entryEl, container.firstChild);

  // 移除超出最大数量的旧条目
  while (container.children.length > MAX_LOGS) {
    container.removeChild(container.lastChild);
  }
}

function createLogEntryElement(log) {
  const div = document.createElement('div');
  div.className = 'log-entry';
  const time = document.createElement('span');
  time.className = 'log-time';
  time.textContent = `[${log.date} ${log.timestamp}]`;
  const msg = document.createElement('span');
  msg.className = `log-message log-${log.level}`;
  msg.textContent = log.message;
  div.appendChild(time);
  div.appendChild(msg);
  return div;
}

function updateLogDisplay() {
  const container = document.getElementById('logContainer');
  if (!container) return;

  const fragment = document.createDocumentFragment();
  for (const log of logs) {
    fragment.appendChild(createLogEntryElement(log));
  }
  container.innerHTML = '';
  container.appendChild(fragment);
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

    if (history.length > MAX_HISTORY) {
      history = history.slice(0, MAX_HISTORY);
    }

    chrome.storage.local.set({ taskHistory: history }, () => {
      // 直接传递已有数据，避免重复读取 storage
      displayHistory(history);
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

      if (history[index].startTime) {
        const duration = Math.round((history[index].endTime - history[index].startTime) / 1000);
        history[index].duration = duration;
      }

      chrome.storage.local.set({ taskHistory: history }, () => {
        displayHistory(history);
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

    if (history.length > MAX_HISTORY) {
      history = history.slice(0, MAX_HISTORY);
    }

    chrome.storage.local.set({ taskHistory: history }, () => {
      displayHistory(history);
    });
  });
}

export function loadHistory() {
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

  container.innerHTML = '';

  if (history.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color: var(--text-secondary); font-size: 11px;';
    empty.textContent = '暂无历史记录';
    container.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of history) {
    const statusDisplay = getStatusDisplay(item.status);
    const durationText = item.duration ? ` (${item.duration}秒)` : '';

    const div = document.createElement('div');
    div.className = `history-item history-${item.status || 'completed'}`;

    const info = document.createElement('div');
    info.className = 'history-info';

    const action = document.createElement('div');
    action.className = 'history-action';
    const icon = document.createElement('span');
    icon.className = 'history-status-icon';
    icon.style.color = statusDisplay.color;
    icon.textContent = statusDisplay.icon;
    action.appendChild(icon);
    action.append(` ${item.action}`);

    const result = document.createElement('div');
    result.className = 'history-result';
    result.textContent = `${item.result}${durationText}`;

    info.appendChild(action);
    info.appendChild(result);

    const time = document.createElement('div');
    time.className = 'history-time';
    time.textContent = item.timestamp;

    div.appendChild(info);
    div.appendChild(time);
    fragment.appendChild(div);
  }
  container.appendChild(fragment);
}

export function clearHistory() {
  chrome.storage.local.set({ taskHistory: [] }, () => {
    updateHistoryDisplay();
    showToast('历史记录已清空');
  });
}

// ==================== 可折叠区域 ====================

export function initCollapsibles() {
  // 通用折叠切换处理
  function setupToggle(toggleEl, onExpand) {
    if (!toggleEl) return;
    const handler = () => {
      const section = toggleEl.closest('.collapsible');
      const isExpanded = section.classList.toggle('expanded');
      toggleEl.setAttribute('aria-expanded', isExpanded);
      if (isExpanded && onExpand) onExpand();
    };
    toggleEl.addEventListener('click', handler);
    toggleEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler();
      }
    });
  }

  setupToggle(document.getElementById('historyToggle'), loadHistory);
  setupToggle(document.getElementById('logToggle'));

  // 清空按钮（带确认）
  const clearHistoryBtn = document.getElementById('clearHistory');
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', () => {
      if (confirm('确定要清空所有历史记录吗？')) clearHistory();
    });
  }

  const clearLogsBtn = document.getElementById('clearLogs');
  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', () => {
      if (confirm('确定要清空所有日志吗？')) clearLogs();
    });
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
