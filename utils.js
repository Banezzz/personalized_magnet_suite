export function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  // 2 秒后隐藏
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

export function applyTheme(isDark) {
  const root = document.documentElement;
  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function initThemeToggle() {
  const toggle = document.getElementById('themeToggle');
  if (!toggle) return;
  // 读取保存的设置
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

export function showTabCount() {
  const countEl = document.getElementById('tabCount');
  if (!countEl) return;
  chrome.tabs.query({ currentWindow: true }, (tabs) => {
    countEl.textContent = `当前窗口标签数: ${tabs.length}`;
  });
} 