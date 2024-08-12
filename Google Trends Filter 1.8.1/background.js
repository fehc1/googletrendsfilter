let isExtensionReady = false;

chrome.runtime.onInstalled.addListener(() => {
  isExtensionReady = true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url.includes('trends.google.fr') && isExtensionReady) {
    chrome.tabs.sendMessage(tabId, { action: "initializeExtension" }, (response) => {
      if (chrome.runtime.lastError) {
        console.log("Content script not yet ready");
        // Retry after a short delay
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, { action: "initializeExtension" });
        }, 1000);
      } else {
        console.log("Extension initialized on the page");
      }
    });

    // Nettoyer les données de l'extension
    chrome.storage.local.remove(['lastResult', 'lastKeyword']);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "download") {
    chrome.downloads.download({
      url: request.url,
      filename: request.filename,
      saveAs: true
    });
  }
});