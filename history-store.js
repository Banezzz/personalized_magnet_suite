/**
 * Task history persistence. Safe to import from popup and background.
 * Does not touch the DOM.
 */

import { LIMITS, STORAGE_KEYS } from './constants.js';

export const TASK_STATUS = {
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

export function formatTimestamp(date = new Date()) {
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

export async function createHistoryEntry(entry) {
  const id = entry.id || generateId();
  const historyEntry = {
    id,
    action: entry.action,
    result: entry.result || '进行中...',
    status: TASK_STATUS.RUNNING,
    timestamp: formatTimestamp(),
    startTime: Date.now()
  };

  const data = await storageGet([STORAGE_KEYS.taskHistory]);
  let history = data[STORAGE_KEYS.taskHistory] || [];
  history.unshift(historyEntry);
  if (history.length > LIMITS.maxHistory) {
    history = history.slice(0, LIMITS.maxHistory);
  }
  await storageSet({ [STORAGE_KEYS.taskHistory]: history });
  return { id, history };
}

export async function updateHistoryEntry(id, updates) {
  if (!id) return { history: null, updated: false };
  const data = await storageGet([STORAGE_KEYS.taskHistory]);
  let history = data[STORAGE_KEYS.taskHistory] || [];
  const index = history.findIndex((item) => item.id === id);
  if (index === -1) return { history, updated: false };

  history[index] = {
    ...history[index],
    ...updates,
    endTime: Date.now()
  };
  if (history[index].startTime) {
    history[index].duration = Math.round((history[index].endTime - history[index].startTime) / 1000);
  }
  await storageSet({ [STORAGE_KEYS.taskHistory]: history });
  return { history, updated: true };
}

export async function saveCompletedHistory(entry) {
  const historyEntry = {
    id: generateId(),
    ...entry,
    status: TASK_STATUS.COMPLETED,
    timestamp: formatTimestamp()
  };
  const data = await storageGet([STORAGE_KEYS.taskHistory]);
  let history = data[STORAGE_KEYS.taskHistory] || [];
  history.unshift(historyEntry);
  if (history.length > LIMITS.maxHistory) {
    history = history.slice(0, LIMITS.maxHistory);
  }
  await storageSet({ [STORAGE_KEYS.taskHistory]: history });
  return { id: historyEntry.id, history };
}

export async function clearHistoryEntries() {
  await storageSet({ [STORAGE_KEYS.taskHistory]: [] });
}

export async function loadHistoryEntries() {
  const data = await storageGet([STORAGE_KEYS.taskHistory]);
  return data[STORAGE_KEYS.taskHistory] || [];
}
