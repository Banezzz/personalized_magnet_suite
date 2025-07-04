/**
 * Service worker：负责按顺序刷新当前窗口中的标签页，
 * 支持 startRefreshing / stopRefreshing 消息。
 */
let refreshTimeoutId = null;
let isRefreshing = false;

// 安全发送消息，忽略无监听者导致的 lastError
function safeSendMessage(msg) {
  chrome.runtime.sendMessage(msg, () => {
    if (chrome.runtime.lastError) {
      // 可在开发时查看，但正式忽略
      // console.debug('safeSendMessage error:', chrome.runtime.lastError.message);
    }
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startRefreshing') {
    // 若已在刷新则先停止旧任务
    if (isRefreshing && refreshTimeoutId) {
      clearTimeout(refreshTimeoutId);
    }
    isRefreshing = true;

    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      let index = 0;
      const total = tabs.length;

      const refreshNextTab = () => {
        if (!isRefreshing) return; // 若已停止则结束
        if (index < tabs.length) {
          chrome.tabs.reload(tabs[index].id, () => {
            safeSendMessage({ action: 'refreshProgress', current: index + 1, total });
            index++;
            refreshTimeoutId = setTimeout(refreshNextTab, request.interval);
          });
        } else {
          safeSendMessage({ action: 'refreshComplete' });
          // 所有标签刷新完毕，自动停止
          isRefreshing = false;
          refreshTimeoutId = null;
        }
      };

      refreshNextTab();
    });
  } else if (request.action === 'stopRefreshing') {
    isRefreshing = false;
    if (refreshTimeoutId) {
      clearTimeout(refreshTimeoutId);
      refreshTimeoutId = null;
    }
  }
});