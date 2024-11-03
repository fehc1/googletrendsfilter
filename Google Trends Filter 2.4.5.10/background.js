let isContentScriptReady = false;

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed");
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
    // Forward filtering statistics to popup if needed
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

chrome.action.onClicked.addListener((tab) => {
  if (isContentScriptReady) {
    console.log("Extension is ready, performing action");
    chrome.tabs.sendMessage(tab.id, {action: "performAction"});
  } else {
    console.log("Extension not ready yet");
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Extension Not Ready',
      message: 'Please wait a moment and try again.'
    });
  }
});