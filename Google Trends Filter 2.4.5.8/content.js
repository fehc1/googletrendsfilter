console.log("Content script starting to load");

let isReady = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "initContentScript") {
    console.log("Content script initialized");
    isReady = true;
    chrome.runtime.sendMessage({action: "contentScriptReady"});
  } else if (request.action === "isReady") {
    sendResponse({ ready: isReady });
  }
});

document.addEventListener('DOMContentLoaded', (event) => {
  console.log("DOM fully loaded and parsed");
});

window.addEventListener('load', (event) => {
  console.log("All resources finished loading!");
  isReady = true;
  initializeExtension();
});

function initializeExtension() {
  console.log("Initializing extension");
  chrome.runtime.sendMessage({action: "contentScriptReady"}, function(response) {
    console.log("Response from background script:", response);
  });
}

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

  console.log("Data export completed.");
  return { success: true };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Message received in content script:", request);

  if (request.action === "filter") {
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
  }
});

function clearFilter() {
  const trendElements = document.querySelectorAll('[data-row-id], .mZ3RIc[jsname="oKdM2c"]');
  trendElements.forEach(element => {
    element.style.display = '';
    element.style.border = 'none';
  });
}

console.log("Content script fully loaded");
chrome.runtime.sendMessage({action: "contentScriptReady"});