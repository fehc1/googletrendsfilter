let isContentScriptReady = false;

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed");
  
  // Configurer le side panel pour toutes les pages
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));
});

// Gérer l'ouverture du side panel
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (error) {
    console.error('Error opening side panel:', error);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Message received:", request.action);
  
  if (request.action === "contentScriptReady") {
    console.log("Content script reported as ready");
    isContentScriptReady = true;
    sendResponse({status: "acknowledged"});
  } else if (request.action === "isContentScriptReady") {
    console.log("Checking content script status:", isContentScriptReady);
    sendResponse({ready: isContentScriptReady});
  } else if (request.action === "download") {
    chrome.downloads.download({
      url: request.url,
      filename: request.filename,
      saveAs: true
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error("Download error:", chrome.runtime.lastError);
        sendResponse({success: false, error: chrome.runtime.lastError.message});
      } else {
        console.log(`Download of ${request.filename} started, ID:`, downloadId);
        sendResponse({success: true, downloadId: downloadId});
      }
    });
    return true; // Indicates that the response will be sent asynchronously
  } else if (request.action === "filterStats") {
    // Forward filtering statistics to side panel if needed
    chrome.runtime.sendMessage(request);
  } else if (request.action === "fetchRSS") {
    fetch(request.url)
      .then(response => response.text())
      .then(data => {
        sendResponse({success: true, data: data});
      })
      .catch(error => {
        console.error("Error fetching RSS feed:", error);
        sendResponse({success: false, error: error.message});
      });
    return true; // Indicates that the response will be sent asynchronously
  } else if (request.action === "openAnalyzeTab") {
    chrome.tabs.create({ url: 'analyze.html' });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.match(/^https:\/\/trends\.google\.(com|[a-z]{2}|[a-z]{2}\.[a-z]{2})\/trending/)) {
    console.log("Google Trends page loaded, resetting content script");
    isContentScriptReady = false;
    chrome.tabs.sendMessage(tabId, {action: "initContentScript"});
  }
});