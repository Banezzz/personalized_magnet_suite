import { ACTIONS, DEFAULTS, SITE_PRESETS, STORAGE_KEYS } from './constants.js';
import { ensureOriginPermission } from './permissions.js';
import { showToast, addLog, createHistory, updateHistory, TASK_STATUS } from './utils.js';

let currentTaskHistoryId = null;
let lastLoggedPage = null;

function getEl(id) {
  return document.getElementById(id);
}

export function updateProgress(message, current, total) {
  const progressEl = getEl('movieProgress');
  if (progressEl) {
    progressEl.textContent = message || '';
    progressEl.classList.toggle('is-empty', !message);
  }

  const barWrap = getEl('movieProgressBar');
  if (!barWrap) return;
  const barFill = barWrap.querySelector('.progress-bar-fill');

  if (!message) {
    barWrap.style.display = 'none';
    barFill.style.width = '0%';
    barFill.classList.remove('indeterminate');
    return;
  }

  barWrap.style.display = 'block';
  if (Number.isFinite(current) && Number.isFinite(total) && total > 0) {
    barFill.classList.remove('indeterminate');
    barFill.style.width = `${Math.round((current / total) * 100)}%`;
  } else {
    barFill.classList.add('indeterminate');
    barFill.style.width = '';
  }
}

function setMoviePhase(phase) {
  const openBtn = getEl('openMovieLinks');
  const cancelBtn = getEl('cancelMovieTask');
  const preview = getEl('moviePreview');
  if (openBtn) openBtn.disabled = phase !== 'idle';
  if (cancelBtn) cancelBtn.classList.toggle('is-hidden', phase !== 'busy');
  if (preview) preview.classList.toggle('is-hidden', phase !== 'preview');
}

function showMoviePreview(message) {
  const text = getEl('moviePreviewText');
  if (text) text.textContent = message || '';
  updateProgress(message || '');
  setMoviePhase('preview');
}

function applyProgress(progress) {
  if (!progress || !progress.running) return;
  if (progress.historyId) currentTaskHistoryId = progress.historyId;
  if (progress.phase === 'preview') {
    showMoviePreview(progress.message || '将打开详情，等待确认');
    return;
  }
  updateProgress(progress.message || '任务进行中...', progress.current, progress.total);
  setMoviePhase('busy');
}

async function saveMovieSettings() {
  const settings = {
    url: getEl('movieUrl')?.value || '',
    isTopMode: !!getEl('topOption')?.checked,
    batchSize: getEl('batchSize')?.value || String(DEFAULTS.batchSize),
    delaySeconds: getEl('delaySeconds')?.value || String(DEFAULTS.delaySeconds),
    sitePreset: getEl('sitePreset')?.value || 'javdb',
    customSelector: getEl('customSelector')?.value || '',
    topPages: getEl('topPages')?.value || String(DEFAULTS.topPages),
    openInGroup: getEl('openInGroup') ? getEl('openInGroup').checked : true
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.movieSettings]: settings });
}

async function restoreMovieSettings() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.movieSettings]);
  const settings = data[STORAGE_KEYS.movieSettings];
  if (!settings) return;

  if (settings.url && getEl('movieUrl')) getEl('movieUrl').value = settings.url;
  if (getEl('topOption')) getEl('topOption').checked = !!settings.isTopMode;
  if (settings.batchSize && getEl('batchSize')) getEl('batchSize').value = settings.batchSize;
  if (settings.delaySeconds && getEl('delaySeconds')) getEl('delaySeconds').value = settings.delaySeconds;
  if (settings.sitePreset && getEl('sitePreset')) getEl('sitePreset').value = settings.sitePreset;
  if (settings.customSelector && getEl('customSelector')) getEl('customSelector').value = settings.customSelector;
  if (settings.topPages && getEl('topPages')) getEl('topPages').value = settings.topPages;
  if (getEl('openInGroup') && typeof settings.openInGroup === 'boolean') {
    getEl('openInGroup').checked = settings.openInGroup;
  }
  updateCustomSelectorVisibility();
  updateTopPagesVisibility();
}

function updateCustomSelectorVisibility() {
  const sitePreset = getEl('sitePreset');
  const customSelector = getEl('customSelector');
  if (!sitePreset || !customSelector) return;
  customSelector.style.display = sitePreset.value === 'custom' ? 'block' : 'none';
}

function updateTopPagesVisibility() {
  const topPagesWrap = getEl('topPagesWrap');
  const topOption = getEl('topOption');
  if (!topPagesWrap || !topOption) return;
  topPagesWrap.hidden = !topOption.checked;
}

async function fillCurrentTabUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    showToast('无法读取当前标签页 URL');
    return;
  }
  getEl('movieUrl').value = tab.url;
  await saveMovieSettings();
  showToast('已填入当前标签页 URL');
}

function restoreTaskProgress() {
  chrome.runtime.sendMessage({ action: ACTIONS.getMovieTaskStatus }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response?.progress) {
      applyProgress(response.progress);
      if (response.running) {
        addLog('检测到正在运行的任务，已恢复显示进度', 'info');
      }
    } else if (response?.running) {
      updateProgress('任务进行中...');
      setMoviePhase('busy');
    }
  });
}

function getSelectorConfig() {
  const sitePreset = getEl('sitePreset');
  const customSelector = getEl('customSelector');
  const presetValue = sitePreset ? sitePreset.value : 'javdb';

  if (presetValue === 'custom') {
    const selector = customSelector.value.trim();
    return { selector, baseUrl: '', presetValue };
  }
  const preset = SITE_PRESETS[presetValue] || SITE_PRESETS.javdb;
  return { selector: preset.selector, baseUrl: preset.baseUrl, presetValue };
}

export function initMovieLinks() {
  const openBtn = getEl('openMovieLinks');
  const cancelBtn = getEl('cancelMovieTask');
  const sitePreset = getEl('sitePreset');
  const useCurrentBtn = getEl('useCurrentTab');
  const topOption = getEl('topOption');

  if (!openBtn) return;

  restoreMovieSettings();
  restoreTaskProgress();

  if (sitePreset) {
    sitePreset.addEventListener('change', () => {
      updateCustomSelectorVisibility();
      saveMovieSettings();
    });
  }
  if (topOption) {
    topOption.addEventListener('change', () => {
      updateTopPagesVisibility();
      saveMovieSettings();
    });
  }
  ['movieUrl', 'batchSize', 'delaySeconds', 'customSelector', 'topPages', 'openInGroup'].forEach((id) => {
    getEl(id)?.addEventListener('change', saveMovieSettings);
  });

  if (useCurrentBtn) {
    useCurrentBtn.addEventListener('click', fillCurrentTabUrl);
  }

  const requestCancel = () => {
    chrome.runtime.sendMessage({ action: ACTIONS.cancelMovieTask }, (response) => {
      if (response?.success) {
        showToast('正在取消任务...');
        addLog('用户请求取消任务', 'warning');
      }
    });
  };

  if (cancelBtn) {
    cancelBtn.addEventListener('click', requestCancel);
  }
  getEl('cancelMoviePreview')?.addEventListener('click', requestCancel);
  getEl('confirmMovieOpen')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: ACTIONS.confirmMovieOpen }, (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        showToast(response?.message || '无法开始打开');
        return;
      }
      setMoviePhase('busy');
      updateProgress('开始打开...');
    });
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === ACTIONS.movieProgress) {
      updateProgress(message.message, message.current, message.total);
      if (Number.isFinite(message.currentPage) && message.currentPage !== lastLoggedPage) {
        lastLoggedPage = message.currentPage;
        addLog(message.message || `第 ${message.currentPage} 页`, 'info');
      }
      setMoviePhase('busy');
    } else if (message.action === ACTIONS.moviePreview) {
      showMoviePreview(message.message);
      showToast(message.message);
      addLog(message.message || '已解析链接，等待确认', 'info');
    } else if (message.action === ACTIONS.movieComplete) {
      updateProgress(message.message || '完成！', 1, 1);
      showToast(message.message || '所有链接已打开');
      addLog(message.message || '任务完成', 'success');
      setMoviePhase('idle');
      currentTaskHistoryId = null;
      lastLoggedPage = null;
      setTimeout(() => updateProgress(''), 2000);
    } else if (message.action === ACTIONS.movieError) {
      updateProgress(message.message || '处理失败');
      showToast(message.message || '处理失败');
      addLog(message.message || '处理失败', 'error');
      setMoviePhase('idle');
      currentTaskHistoryId = null;
    } else if (message.action === ACTIONS.movieTaskCancelled) {
      updateProgress('');
      showToast('任务已取消');
      addLog('任务已取消', 'warning');
      setMoviePhase('idle');
      currentTaskHistoryId = null;
      lastLoggedPage = null;
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[STORAGE_KEYS.movieTaskProgress]) return;
    const progress = changes[STORAGE_KEYS.movieTaskProgress].newValue;
    if (progress?.running) applyProgress(progress);
  });

  openBtn.addEventListener('click', async () => {
    const urlInput = getEl('movieUrl').value.trim();
    const isTopChecked = getEl('topOption').checked;
    const batchSize = parseInt(getEl('batchSize').value, 10) || DEFAULTS.batchSize;
    const delaySeconds = parseFloat(getEl('delaySeconds').value) || DEFAULTS.delaySeconds;
    const topPages = parseInt(getEl('topPages')?.value, 10) || DEFAULTS.topPages;
    const openInGroup = getEl('openInGroup') ? getEl('openInGroup').checked : true;
    const { selector, baseUrl } = getSelectorConfig();

    if (getEl('sitePreset')?.value === 'custom' && !selector) {
      showToast('请输入自定义CSS选择器');
      return;
    }
    if (!urlInput) {
      showToast('请输入有效的电影链接 URL');
      return;
    }

    const allowed = await ensureOriginPermission(urlInput);
    if (!allowed) {
      showToast('需要该网站的访问权限才能提取链接');
      addLog('用户拒绝了网站访问权限', 'error');
      return;
    }

    await saveMovieSettings();
    addLog(`开始任务: ${urlInput}`, 'info');
    lastLoggedPage = null;

    currentTaskHistoryId = await createHistory({
      action: '电影链接打开',
      result: `正在处理: ${urlInput.substring(0, 50)}${urlInput.length > 50 ? '...' : ''}`
    });

    chrome.runtime.sendMessage({
      action: ACTIONS.openMovieLinks,
      url: urlInput,
      isTopMode: isTopChecked,
      batchSize,
      delaySeconds,
      selector,
      baseUrl,
      topPages,
      openInGroup,
      historyId: currentTaskHistoryId
    }, (response) => {
      if (chrome.runtime.lastError) {
        showToast('后台未响应，请重试');
        addLog(chrome.runtime.lastError.message, 'error');
        setMoviePhase('idle');
        if (currentTaskHistoryId) {
          updateHistory(currentTaskHistoryId, {
            status: TASK_STATUS.FAILED,
            result: chrome.runtime.lastError.message
          });
        }
        currentTaskHistoryId = null;
        return;
      }
      if (response?.success) {
        showToast(isTopChecked ? '开始解析多页链接...' : '开始解析链接...');
        updateProgress('正在解析，稍后确认打开数量');
        setMoviePhase('busy');
      } else {
        showToast(response?.message || '任务启动失败');
        addLog(response?.message || '任务启动失败', 'error');
        setMoviePhase('idle');
        if (currentTaskHistoryId) {
          updateHistory(currentTaskHistoryId, {
            status: TASK_STATUS.FAILED,
            result: response?.message || '任务启动失败'
          });
        }
        currentTaskHistoryId = null;
      }
    });
  });
}
