console.log("Content script starting to load");

// ==========================================
// Variables globales et initialisation
// ==========================================
let isReady = false;

// Variables pour la popup Google Search
let trendingPanel = null;
let trendTab = null;
let googleSearchSettings = {
    enabled: false,
    country: 'US',
    timeRange: 'now 7-d'
};

// Charger les paramètres initiaux
chrome.storage.local.get(['googleSearchSettings'], function(result) {
    if (result.googleSearchSettings) {
        googleSearchSettings = result.googleSearchSettings;
        if (googleSearchSettings.enabled) {
            detectGoogleSearch();
        }
    }
});

// ==========================================
// Fonctions de base et d'initialisation
// ==========================================
function initializeExtension() {
    console.log("Initializing extension");
    chrome.runtime.sendMessage({action: "contentScriptReady"}, function(response) {
        console.log("Response from background script:", response);
    });
}

// ==========================================
// Fonctions pour la popup Google Search
// ==========================================
function createTrendingPanel() {
    if (trendingPanel) {
        trendingPanel.remove();
    }

    trendingPanel = document.createElement('div');
    trendingPanel.id = 'google-trends-panel';
    trendingPanel.style.cssText = `
        position: fixed;
        right: -320px;
        top: 120px;
        width: 300px;
        height: 400px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        transition: right 0.3s ease-in-out;
        z-index: 9999;
        padding: 15px;
        overflow: hidden;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
        font-size: 14px;
        font-weight: 500;
        color: #202124;
        margin-bottom: 10px;
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    header.innerHTML = `
        <span>Trending Evolution</span>
        <span class="close-panel" style="cursor: pointer; color: #5f6368;">×</span>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = `
        width: 100%;
        height: calc(100% - 30px);
        border: none;
        border-radius: 4px;
        background: white;
    `;

    trendingPanel.appendChild(header);
    trendingPanel.appendChild(iframe);
    document.body.appendChild(trendingPanel);

    header.querySelector('.close-panel').addEventListener('click', () => {
        hideTrendingPanel();
    });

    createTrendTab();

    return { panel: trendingPanel, iframe };
}
function createTrendTab() {
  if (trendTab) {
      trendTab.remove();
  }

  trendTab = document.createElement('div');
  trendTab.id = 'trend-tab';
  trendTab.style.cssText = `
      position: fixed;
      right: -40px;
      top: 50%;
      width: 40px;
      height: 120px;
      background: #4285f4;
      border-radius: 8px 0 0 8px;
      cursor: pointer;
      transition: right 0.3s ease-in-out;
      z-index: 9998;
      writing-mode: vertical-rl;
      text-orientation: mixed;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 500;
      box-shadow: -2px 0 5px rgba(0,0,0,0.1);
  `;
  trendTab.textContent = 'Trends';
  document.body.appendChild(trendTab);

  trendTab.addEventListener('click', () => {
      showTrendingPanel();
  });
}

function hideTrendingPanel(removeCompletely = false) {
  if (trendingPanel) {
      if (removeCompletely) {
          trendingPanel.remove();
          trendingPanel = null;
          if (trendTab) {
              trendTab.remove();
              trendTab = null;
          }
      } else {
          trendingPanel.style.right = '-320px';
          setTimeout(() => {
              if (trendTab) {
                  trendTab.style.right = '0';
              }
          }, 300);
      }
  }
}

function showTrendingPanel() {
  if (trendingPanel && googleSearchSettings.enabled) {
      trendingPanel.style.right = '20px';
      if (trendTab) {
          trendTab.style.right = '-40px';
      }
  }
}

function updateTrendingPanel(keyword) {
  if (!googleSearchSettings.enabled) return;

  const { panel, iframe } = createTrendingPanel();
  
  const encodeParams = encodeURIComponent(JSON.stringify({
      comparisonItem: [{
          keyword: keyword,
          geo: googleSearchSettings.country,
          time: googleSearchSettings.timeRange
      }],
      category: 0,
      property: ""
  }));

  iframe.src = `https://trends.google.com/trends/embed/explore/TIMESERIES?req=${encodeParams}&tz=-120`;

  setTimeout(() => {
      panel.style.right = '20px';
      setTimeout(() => {
          hideTrendingPanel();
      }, 2000);
  }, 100);
}

// Fonction modifiée pour vérifier l'URL
function detectGoogleSearch() {
  if (!googleSearchSettings.enabled) return;

  const urlParams = new URLSearchParams(window.location.search);
  const searchQuery = urlParams.get('q');
  const currentUrl = window.location.href.toLowerCase();
  
  // Vérifier qu'on est sur Google Search et pas sur Google Trends
  const isGoogleSearch = currentUrl.includes('google.com/search') || 
                        currentUrl.includes('google.fr/search') ||
                        (currentUrl.includes('google.') && currentUrl.includes('/search'));
  const isGoogleTrends = currentUrl.includes('trends.google.');
  
  if (searchQuery && isGoogleSearch && !isGoogleTrends) {
      updateTrendingPanel(searchQuery);
  }
}

// ==========================================
// Fonctions utilitaires
// ==========================================
function normalizeText(str) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function encodeSpecialCharacters(str) {
  return str
      .replace(/[&<>"]/g, function(m) {
          return {
              '&': '&amp;',
              '<': '&lt;',
              '>': '&gt;',
              '"': '&quot;'
          }[m];
      })
      .replace(/[éèêë]/g, "e")
      .replace(/[àâä]/g, "a")
      .replace(/[îï]/g, "i")
      .replace(/[ôö]/g, "o")
      .replace(/[ùûü]/g, "u")
      .replace(/ç/g, "c")
      .replace(/œ/g, "oe")
      .replace(/æ/g, "ae")
      .replace(/[^\w\s'-]/g, '');
}
// ==========================================
// Fonctions de filtrage et export
// ==========================================
async function filterAndDisplayResults(keyword) {
  console.log(`Starting filtering. Keyword: "${keyword}"`);
  
  const trendElements = document.querySelectorAll('[data-row-id], .mZ3RIc[jsname="oKdM2c"]');
  console.log(`Number of trend elements found: ${trendElements.length}`);

  if (trendElements.length === 0) {
      console.error("No trend elements found. CSS selectors might be outdated.");
      return { success: false, count: 0, totalExplored: 0, error: "No elements found" };
  }

  const normalizedKeyword = normalizeText(keyword);
  let matchCount = 0;

  for (const element of trendElements) {
      const trendText = normalizeText(element.textContent);
      const matchesKeyword = !keyword || trendText.includes(normalizedKeyword);

      console.log(`Element: "${trendText.substring(0, 50)}..."`);
      console.log(`  Matches keyword: ${matchesKeyword}`);

      if (matchesKeyword) {
          element.style.display = '';
          element.style.border = '2px solid green';
          matchCount++;
      } else {
          element.style.display = 'none';
      }
  }

  console.log(`Filtering completed. ${matchCount} matches found out of ${trendElements.length} elements.`);
  return { success: true, count: matchCount, totalExplored: trendElements.length };
}

function createCSV(data) {
  return data.map(row => 
      row.map(cell => {
          if (cell === null || cell === undefined) {
              return '""';
          }
          if (typeof cell === 'string') {
              return `"${cell.replace(/"/g, '""')}"`;
          }
          return `"${String(cell).replace(/"/g, '""')}"`;
      }).join(',')
  ).join('\n');
}

async function getAssociatedQueries(trendRow) {
  const subjects = trendRow.querySelector('[data-row-id]').textContent.trim();
  const queries = Array.from(trendRow.querySelectorAll('a[data-row-id]'))
      .map(a => encodeSpecialCharacters(a.textContent.trim()));

  return { subjects, queries };
}

async function exportData(type, keyword) {
  console.log("Starting data export for:", type, keyword);
  
  const trendElements = document.querySelectorAll('[data-row-id], .mZ3RIc[jsname="oKdM2c"]');
  const normalizedKeyword = normalizeText(keyword);
  const filteredData = [];

  for (let trendElement of trendElements) {
      const trendText = normalizeText(trendElement.textContent);
      const matchesKeyword = !keyword || trendText.includes(normalizedKeyword);

      if (matchesKeyword) {
          const { subjects, queries } = await getAssociatedQueries(trendElement);
          filteredData.push([subjects, queries.join('; ')]);
      }
  }

  let csvData;
  if (type === 'queries') {
      csvData = createCSV([['Subject', 'Associated Queries'], ...filteredData]);
  } else if (type === 'ngrams') {
      csvData = 'N-grams data not implemented yet';
  }

  const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const currentDate = new Date();
  const dateString = `${String(currentDate.getDate()).padStart(2, '0')}${String(currentDate.getMonth() + 1).padStart(2, '0')}${String(currentDate.getFullYear()).slice(-2)}`;
  const filename = `${type}_data_${keyword}_${dateString}.csv`;

  chrome.runtime.sendMessage({
      action: "download",
      url: url,
      filename: filename
  });

  return { success: true };
}

function clearFilter() {
  const trendElements = document.querySelectorAll('[data-row-id], .mZ3RIc[jsname="oKdM2c"]');
  trendElements.forEach(element => {
      element.style.display = '';
      element.style.border = 'none';
  });
}
// ==========================================
// Event Listeners et Message Handlers
// ==========================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Message received in content script:", request);

  if (request.action === "initContentScript") {
      console.log("Content script initialized");
      isReady = true;
      chrome.runtime.sendMessage({action: "contentScriptReady"});
  } else if (request.action === "isReady") {
      sendResponse({ ready: isReady });
  } else if (request.action === "filter") {
      filterAndDisplayResults(request.keyword)
          .then(result => {
              sendResponse(result);
              chrome.runtime.sendMessage({
                  action: "filterStats",
                  count: result.count,
                  totalExplored: result.totalExplored
              });
          })
          .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
  } else if (request.action === "exportData") {
      exportData(request.exportType, request.keyword)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
  } else if (request.action === "clearFilter") {
      clearFilter();
      sendResponse({success: true});
  } else if (request.action === "updateGoogleSearchSettings") {
      // Mise à jour des paramètres Google Search
      googleSearchSettings = request.settings;
      if (googleSearchSettings.enabled) {
          detectGoogleSearch();
      } else {
          hideTrendingPanel(true);
      }
  }
});

// ==========================================
// Event Listeners pour le chargement
// ==========================================
document.addEventListener('DOMContentLoaded', (event) => {
  console.log("DOM fully loaded and parsed");
});

window.addEventListener('load', (event) => {
  console.log("All resources finished loading!");
  isReady = true;
  initializeExtension();
});

// ==========================================
// Observers et détection de changement d'URL
// ==========================================
let lastUrl = location.href;
new MutationObserver(() => {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      detectGoogleSearch();
  }
}).observe(document, { subtree: true, childList: true });

// Détection initiale lors du chargement
window.addEventListener('load', detectGoogleSearch);

// Message initial de chargement du script
console.log("Content script fully loaded");
chrome.runtime.sendMessage({action: "contentScriptReady"});