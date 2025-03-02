chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startRefreshing') {
      chrome.tabs.query({}, tabs => {
        let index = 0;
  
        function refreshNextTab() {
          if (index < tabs.length) {
            chrome.tabs.reload(tabs[index].id, () => {
              index++;
              setTimeout(refreshNextTab, request.interval);
            });
          }
        }
  
        refreshNextTab();
      });
    }
  });