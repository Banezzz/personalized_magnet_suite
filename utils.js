import { LIMITS, STORAGE_KEYS } from './constants.js';
import {
  clearHistoryEntries,
  createHistoryEntry,
  loadHistoryEntries,
  saveCompletedHistory,
  TASK_STATUS,
  updateHistoryEntry
} from './history-store.js';

export { TASK_STATUS };

export function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

export function applyTheme(isDark) {
  document.documentElement.classList.toggle('dark', !!isDark);
}

export function initThemeToggle() {
  const toggle = document.getElementById('themeToggle');
  if (!toggle) return;
  chrome.storage.sync.get([STORAGE_KEYS.isDarkTheme], (data) => {
    const isDark = data[STORAGE_KEYS.isDarkTheme] ?? false;
    toggle.checked = isDark;
    applyTheme(isDark);
  });

  toggle.addEventListener('change', () => {
    const isDark = toggle.checked;
    applyTheme(isDark);
    chrome.storage.sync.set({ [STORAGE_KEYS.isDarkTheme]: isDark });
  });
}

export function showTabCount() {
  const countEl = document.getElementById('tabCount');
  if (!countEl) return;
  chrome.tabs.query({ currentWindow: true }, (tabs) => {
    countEl.textContent = `当前窗口标签数: ${tabs.length}`;
  });
}

let logs = [];
let saveLogsTimer = null;

export function loadLogs() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.persistentLogs], (data) => {
      logs = data[STORAGE_KEYS.persistentLogs] || [];
      updateLogDisplay();
      resolve(logs);
    });
  });
}

function saveLogs() {
  if (saveLogsTimer) clearTimeout(saveLogsTimer);
  saveLogsTimer = setTimeout(() => {
    chrome.storage.local.set({ [STORAGE_KEYS.persistentLogs]: logs });
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
  if (logs.length > LIMITS.maxLogs) {
    logs = logs.slice(0, LIMITS.maxLogs);
  }
  saveLogs();

  const container = document.getElementById('logContainer');
  if (!container) return;
  container.insertBefore(createLogEntryElement(logEntry), container.firstChild);
  while (container.children.length > LIMITS.maxLogs) {
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
  container.replaceChildren(fragment);
}

export function clearLogs() {
  logs = [];
  saveLogs();
  updateLogDisplay();
  showToast('日志已清空');
}

export async function createHistory(entry) {
  const { id, history } = await createHistoryEntry(entry);
  displayHistory(history);
  return id;
}

export function updateHistory(id, updates) {
  updateHistoryEntry(id, updates).then(({ history }) => {
    if (history) displayHistory(history);
  });
}

export function saveHistory(entry) {
  saveCompletedHistory(entry).then(({ history }) => {
    displayHistory(history);
  });
}

export function loadHistory() {
  loadHistoryEntries().then(displayHistory);
}

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
  container.replaceChildren();

  if (!history || history.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-result';
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

export async function clearHistory() {
  await clearHistoryEntries();
  displayHistory([]);
  showToast('历史记录已清空');
}

export function initCollapsibles() {
  function setupToggle(toggleEl, onExpand) {
    if (!toggleEl) return;
    const handler = () => {
      const section = toggleEl.closest('.collapsible');
      const isExpanded = section.classList.toggle('expanded');
      toggleEl.setAttribute('aria-expanded', isExpanded);
      if (isExpanded && onExpand) onExpand();
    };
    toggleEl.addEventListener('click', handler);
    toggleEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handler();
      }
    });
  }

  setupToggle(document.getElementById('historyToggle'), loadHistory);
  setupToggle(document.getElementById('logToggle'));

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

export function initNetworkStatus() {
  const statusEl = document.getElementById('networkStatus');
  if (!statusEl) return;

  const updateStatus = () => {
    const isOnline = navigator.onLine;
    const text = statusEl.querySelector('.status-text');
    statusEl.classList.toggle('offline', !isOnline);
    statusEl.classList.toggle('online', isOnline);
    text.textContent = isOnline ? '网络正常' : '网络离线';
  };

  updateStatus();
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
