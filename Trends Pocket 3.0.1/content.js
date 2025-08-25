console.log("Content script starting to load");

// ==========================================
// Variables globales et initialisation
// ==========================================
let isReady = false;

// Variables pour la popup Google Search
let trendingPanel = null;
let trendTab = null;
let isUpdatingPanel = false;
let lastProcessedQuery = '';
let autoHideTimeout = null;
let shouldHideTime = 0;
let mouseOverPanel = false;
let googleSearchSettings = {
    enabled: false,
    country: 'US',
    timeRange: 'now 7-d'
};

// Nouvelle variable pour suivre l'état de la page
let isFirstPage = true;

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

    // Ajouter les événements pour la souris
    trendingPanel.addEventListener('mouseenter', () => {
        mouseOverPanel = true;
    });

    trendingPanel.addEventListener('mouseleave', () => {
        mouseOverPanel = false;
        if (Date.now() >= shouldHideTime) {
            hideTrendingPanel();
        }
    });

    header.querySelector('.close-panel').addEventListener('click', () => {
        hideTrendingPanel();
    });

    // Ajouter l'événement de clic en dehors
    document.addEventListener('click', (event) => {
        if (trendingPanel && !trendingPanel.contains(event.target) && 
            trendTab && !trendTab.contains(event.target)) {
            hideTrendingPanel();
        }
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
        right: ${isFirstPage ? '-40px' : '0'};
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
    if (autoHideTimeout) {
        clearTimeout(autoHideTimeout);
    }

    if (trendingPanel) {
        if (removeCompletely) {
            trendingPanel.remove();
            trendingPanel = null;
            if (trendTab) {
                trendTab.remove();
                trendTab = null;
            }
            isUpdatingPanel = false;
            lastProcessedQuery = '';
            mouseOverPanel = false;
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
        // Annuler tout timeout précédent s'il existe
        if (autoHideTimeout) {
            clearTimeout(autoHideTimeout);
        }

        trendingPanel.style.right = '20px';
        if (trendTab) {
            trendTab.style.right = '-40px';
        }

        shouldHideTime = Date.now() + 4500;

        // Configurer le nouveau timer d'auto-hide
        autoHideTimeout = setTimeout(() => {
            if (!mouseOverPanel) {
                trendingPanel.style.right = '-320px';
                setTimeout(() => {
                    if (trendTab) {
                        trendTab.style.right = '0';
                    }
                }, 300);
            }
        }, 4500);
    }
}

// Fonction ajoutée pour vérifier si on est sur la première page
function isFirstSearchPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const start = urlParams.get('start') || '0';
    return start === '0';
}

function detectGoogleSearch() {
    if (!googleSearchSettings.enabled || isUpdatingPanel) return;

    const urlParams = new URLSearchParams(window.location.search);
    const searchQuery = urlParams.get('q');
    const currentUrl = window.location.href.toLowerCase();
    
    // Mise à jour de l'état de la première page
    isFirstPage = isFirstSearchPage();
    
    // Si c'est la même requête qu'avant, on vérifie si on doit montrer le panneau
    if (searchQuery === lastProcessedQuery) {
        if (!isFirstPage) {
            // Sur les pages suivantes, on s'assure que le panneau est caché mais que l'onglet est visible
            hideTrendingPanel();
            if (trendTab) {
                trendTab.style.right = '0';
            }
        }
        return;
    }
    
    // Vérifier qu'on est sur Google Search et pas sur Google Trends
    const isGoogleSearch = currentUrl.includes('google.com/search') || 
                          currentUrl.includes('google.fr/search') ||
                          (currentUrl.includes('google.') && currentUrl.includes('/search'));
    const isGoogleTrends = currentUrl.includes('trends.google.');
    
    if (searchQuery && isGoogleSearch && !isGoogleTrends) {
        isUpdatingPanel = true;
        lastProcessedQuery = searchQuery;
        
        // S'assurer que le panneau précédent est complètement supprimé
        if (trendingPanel) {
            trendingPanel.style.right = '-320px';
            setTimeout(() => {
                hideTrendingPanel(true);
                updateTrendingPanel(searchQuery);
            }, 300);
        } else {
            updateTrendingPanel(searchQuery);
        }
    }
}

function updateTrendingPanel(keyword) {
    if (!googleSearchSettings.enabled) return;

    // Annuler tout timeout précédent s'il existe
    if (autoHideTimeout) {
        clearTimeout(autoHideTimeout);
    }

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

    // Attendre que l'iframe soit chargée avant d'afficher le panneau
    iframe.onload = () => {
        setTimeout(() => {
            // N'afficher automatiquement que sur la première page
            if (isFirstPage) {
                panel.style.right = '20px';
                if (trendTab) {
                    trendTab.style.right = '-40px';
                }
                
                shouldHideTime = Date.now() + 4500;
                // Configurer l'auto-hide après 4.5 secondes seulement sur la première page
                autoHideTimeout = setTimeout(() => {
                    if (!mouseOverPanel) {
                        if (panel) {
                            panel.style.right = '-320px';
                            setTimeout(() => {
                                if (trendTab) {
                                    trendTab.style.right = '0';
                                }
                            }, 300);
                        }
                    }
                }, 4500);
            } else {
                // Sur les autres pages, garder le panneau caché mais montrer l'onglet
                panel.style.right = '-320px';
                if (trendTab) {
                    trendTab.style.right = '0';
                }
            }
            
            isUpdatingPanel = false;
        }, 100);
    };
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