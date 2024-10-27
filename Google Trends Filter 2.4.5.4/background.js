let isContentScriptReady = false;

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed");
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "contentScriptReady") {
    console.log("Content script signalé comme prêt");
    isContentScriptReady = true;
    sendResponse({status: "acknowledged"});
  } else if (request.action === "isContentScriptReady") {
    console.log("Vérification de l'état du content script:", isContentScriptReady);
    sendResponse({ready: isContentScriptReady});
  } else if (request.action === "download") {
    chrome.downloads.download({
      url: request.url,
      filename: request.filename,
      saveAs: true
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error("Erreur lors du téléchargement:", chrome.runtime.lastError);
        sendResponse({success: false, error: chrome.runtime.lastError.message});
      } else {
        console.log(`Téléchargement de ${request.filename} démarré, ID:`, downloadId);
        sendResponse({success: true, downloadId: downloadId});
      }
    });
    return true; // Indique que la réponse sera envoyée de manière asynchrone
  } else if (request.action === "filterStats") {
    // Transmettre les statistiques de filtrage à la popup si nécessaire
    chrome.runtime.sendMessage(request);
  } else if (request.action === "fetchRSS") {
    fetch(request.url)
      .then(response => response.text())
      .then(data => {
        sendResponse({success: true, data: data});
      })
      .catch(error => {
        console.error("Erreur lors de la récupération du flux RSS:", error);
        sendResponse({success: false, error: error.message});
      });
    return true; // Indique que la réponse sera envoyée de manière asynchrone
  } else if (request.action === "openAnalyzeTab") {
    chrome.tabs.create({ url: 'analyze.html' });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.match(/^https:\/\/trends\.google\.(com|[a-z]{2}|[a-z]{2}\.[a-z]{2})\/trending/)) {
    console.log("Page Google Trends chargée, réinitialisation du content script");
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
      title: 'Extension non prête',
      message: 'Veuillez patienter quelques instants et réessayer.'
    });
  }
});