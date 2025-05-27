// ==========================================
// Variables globales et constantes
// ==========================================
let currentLanguage = 'en'; 
let currentCountry = 'US';
let compareCountry = 'US';
let currentSortColumn = 'start';
let currentSortOrder = 'desc';
const API_KEY = ''; // Remplacez par votre clé API Perplexity (laissez vide si vous n'en avez pas)
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes en millisecondes

// Variables pour la comparaison
let compareKeywords = [''];
let maxKeywords = 5;

// Paramètres pour la popup Google Search
let googleSearchSettings = {
    enabled: false,
    country: 'US',
    timeRange: 'now 7-d'
};

// ==========================================
// Fonctions d'initialisation
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing...');
    initializeExtension();
    setupEventListeners();
    setupGoogleSearchOptions();
    setupComparisonFeature();
    setupTrendModalListeners();
    
    // Charger les paramètres sauvegardés
    chrome.storage.local.get([
        'selectedCountry', 
        'compareSelectedCountry',
        'activeMainMenu',
        'googleSearchSettings'
    ], function(result) {
        console.log('Loaded settings:', result);
        
        if (result.selectedCountry) {
            currentCountry = result.selectedCountry;
            const countrySelect = document.getElementById('countrySelect');
            if (countrySelect) countrySelect.value = currentCountry;
        }

        if (result.compareSelectedCountry) {
            compareCountry = result.compareSelectedCountry;
            const compareCountrySelect = document.getElementById('compareCountrySelect');
            if (compareCountrySelect) compareCountrySelect.value = compareCountry;
        }

        // Charger les paramètres Google Search
        if (result.googleSearchSettings) {
            googleSearchSettings = result.googleSearchSettings;
            updateGoogleSearchUI();
        }

        // Restaurer l'état du menu principal
        if (result.activeMainMenu) {
            switchMainMenu(result.activeMainMenu, false);
        } else {
            switchMainMenu('trends', false);
        }

        // Charger les tendances par défaut
        setTimeout(() => {
            fetchTrends().catch(error => {
                console.error('Error while retrieving trends:', error);
            });
        }, 500);
    });
});

// Sauvegarder l'état de navigation à la fermeture
window.addEventListener('beforeunload', function() {
    const activeMainMenu = document.querySelector('.main-menu-item.active')?.id.replace('MenuItem', '') || 'trends';
    
    chrome.storage.local.set({ 
        'selectedCountry': currentCountry,
        'compareSelectedCountry': compareCountry,
        'activeMainMenu': activeMainMenu
    });
});

function initializeExtension() {
    console.log('Initializing extension...');
    
    chrome.storage.sync.get(['language'], function(result) {
        if (result.language) {
            currentLanguage = result.language;
            const languageSelect = document.getElementById('languageSelect');
            if (languageSelect) languageSelect.value = currentLanguage;
        }
        updateUILanguage();
    });
}

function setupEventListeners() {
    console.log('Setting up event listeners...');
    
    // Menu principal
    const searchMenuItem = document.getElementById('searchMenuItem');
    const trendsMenuItem = document.getElementById('trendsMenuItem');
    
    if (searchMenuItem) {
        searchMenuItem.addEventListener('click', () => switchMainMenu('search'));
    }
    if (trendsMenuItem) {
        trendsMenuItem.addEventListener('click', () => switchMainMenu('trends'));
    }
    
    // Paramètres
    const settingsIcon = document.getElementById('settingsIcon');
    const languageSelect = document.getElementById('languageSelect');
    const countrySelect = document.getElementById('countrySelect');
    
    if (settingsIcon) {
        settingsIcon.addEventListener('click', toggleSettingsDropdown);
    }
    if (languageSelect) {
        languageSelect.addEventListener('change', changeLanguage);
    }
    if (countrySelect) {
        countrySelect.addEventListener('change', changeCountry);
    }
    
    // Tri des tendances
    const sortTrend = document.getElementById('sortTrend');
    const sortVolume = document.getElementById('sortVolume');
    const sortStart = document.getElementById('sortStart');
    
    if (sortTrend) sortTrend.addEventListener('click', () => sortTrends('trend'));
    if (sortVolume) sortVolume.addEventListener('click', () => sortTrends('volume'));
    if (sortStart) sortStart.addEventListener('click', () => sortTrends('start'));

    // Clic en dehors pour fermer les dropdowns
    document.addEventListener('click', handleOutsideClick);
}

function handleOutsideClick(event) {
    const settingsDropdown = document.getElementById('settingsDropdown');
    const settingsIcon = document.getElementById('settingsIcon');
    
    if (settingsDropdown && settingsIcon && 
        !settingsIcon.contains(event.target) && 
        !settingsDropdown.contains(event.target)) {
        settingsDropdown.style.display = 'none';
    }
}

function toggleSettingsDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('settingsDropdown');
    if (dropdown) {
        dropdown.style.display = dropdown.style.display === 'none' || dropdown.style.display === '' ? 'block' : 'none';
    }
}

// ==========================================
// Fonctions pour la comparaison de tendances
// ==========================================
function setupComparisonFeature() {
    console.log('Setting up comparison feature...');
    
    const addBtn = document.getElementById('addKeywordBtn');
    const countrySelect = document.getElementById('compareCountrySelect');
    const timeRangeSelect = document.getElementById('compareTimeRange');
    
    if (addBtn) addBtn.addEventListener('click', addKeywordInput);
    if (countrySelect) countrySelect.addEventListener('change', updateComparison);
    if (timeRangeSelect) timeRangeSelect.addEventListener('change', updateComparison);
    
    // Setup initial keyword input
    const firstInput = document.querySelector('.keyword-input');
    if (firstInput) {
        firstInput.addEventListener('input', handleKeywordInput);
        firstInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') updateComparison();
        });
    }
    
    const firstRemoveBtn = document.querySelector('.remove-keyword');
    if (firstRemoveBtn) {
        firstRemoveBtn.addEventListener('click', removeKeywordInput);
    }
}

function addKeywordInput() {
    if (compareKeywords.length >= maxKeywords) return;
    
    const keywordsList = document.getElementById('keywordsList');
    if (!keywordsList) return;
    
    const index = compareKeywords.length;
    const colorClass = `color-${index + 1}`;
    
    const keywordItem = document.createElement('div');
    keywordItem.className = `keyword-item ${colorClass}`;
    
    const translations = getTranslations();
    const placeholder = translations[currentLanguage]['keywordPlaceholder'] || 'Enter keyword...';
    
    keywordItem.innerHTML = `
        <input type="text" placeholder="${placeholder}" class="keyword-input" data-index="${index}">
        <span class="remove-keyword material-icons" data-index="${index}">close</span>
    `;
    
    keywordsList.appendChild(keywordItem);
    compareKeywords.push('');
    
    // Add event listeners
    const input = keywordItem.querySelector('.keyword-input');
    const removeBtn = keywordItem.querySelector('.remove-keyword');
    
    if (input) {
        input.addEventListener('input', handleKeywordInput);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') updateComparison();
        });
        input.focus();
    }
    
    if (removeBtn) {
        removeBtn.addEventListener('click', removeKeywordInput);
    }
    
    // Update add button state
    updateAddButtonState();
}

function removeKeywordInput(event) {
    const index = parseInt(event.target.dataset.index);
    const keywordItem = event.target.closest('.keyword-item');
    
    // Don't remove if it's the last remaining input
    if (compareKeywords.length <= 1) return;
    
    if (keywordItem) keywordItem.remove();
    compareKeywords.splice(index, 1);
    
    // Update indices for remaining items
    updateKeywordIndices();
    updateAddButtonState();
    updateComparison();
}

function handleKeywordInput(event) {
    const index = parseInt(event.target.dataset.index);
    compareKeywords[index] = event.target.value.trim();
    
    // Auto-update comparison when typing stops
    clearTimeout(window.comparisonTimeout);
    window.comparisonTimeout = setTimeout(updateComparison, 500);
}

function updateKeywordIndices() {
    const items = document.querySelectorAll('.keyword-item');
    items.forEach((item, index) => {
        const input = item.querySelector('.keyword-input');
        const removeBtn = item.querySelector('.remove-keyword');
        
        if (input) input.dataset.index = index;
        if (removeBtn) removeBtn.dataset.index = index;
        
        // Update color class
        item.className = `keyword-item color-${index + 1}`;
    });
}

function updateAddButtonState() {
    const addBtn = document.getElementById('addKeywordBtn');
    const addKeywordText = document.getElementById('addKeywordText'); // Assuming you have an element with this ID for the text
    const canAdd = compareKeywords.length < maxKeywords;
    
    if (addBtn) {
        addBtn.style.display = canAdd ? 'flex' : 'none';
        // If the text is inside the button, you might update it here too
        // For example, if the button's text node is the first child:
        const translations = getTranslations();
        const btnText = translations[currentLanguage]['addKeywordBtn'] || `Add keyword to compare ({current}/{max})`;
        // Check if the button has a text node to update or a specific span like addKeywordText
        const textNode = Array.from(addBtn.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '' && !node.parentElement.classList.contains('material-icons'));
        if (textNode) {
             textNode.textContent = ` ${btnText.replace('{current}', compareKeywords.length).replace('{max}', maxKeywords)}`;
        } else if (addKeywordText) { // Fallback to a specific span if it exists
             addKeywordText.textContent = btnText.replace('{current}', compareKeywords.length).replace('{max}', maxKeywords);
        }
    }
}

function updateComparison() {
    const validKeywords = compareKeywords.filter(k => k.trim().length > 0);
    
    if (validKeywords.length === 0) {
        showEmptyState();
        return;
    }
    
    hideEmptyState();
    updateComparisonFrames(validKeywords);
    updateFullCompareInfoLink(validKeywords);
}

function showEmptyState() {
    const compareResults = document.getElementById('compareResults');
    const compareEmptyState = document.getElementById('compareEmptyState');
    const fullCompareInfoLink = document.getElementById('fullCompareInfoLink');
    
    if (compareResults) compareResults.style.display = 'none';
    if (compareEmptyState) compareEmptyState.style.display = 'block';
    if (fullCompareInfoLink) fullCompareInfoLink.style.display = 'none';
}

function hideEmptyState() {
    const compareResults = document.getElementById('compareResults');
    const compareEmptyState = document.getElementById('compareEmptyState');
    const fullCompareInfoLink = document.getElementById('fullCompareInfoLink');
    
    if (compareResults) compareResults.style.display = 'block';
    if (compareEmptyState) compareEmptyState.style.display = 'none';
    if (fullCompareInfoLink) fullCompareInfoLink.style.display = 'inline-block';
}

function updateComparisonFrames(keywords) {
    const timeRangeSelect = document.getElementById('compareTimeRange');
    const countrySelect = document.getElementById('compareCountrySelect');
    
    if (!timeRangeSelect || !countrySelect) return;
    
    const time = timeRangeSelect.value;
    const geo = countrySelect.value;
    
    const comparisonItems = keywords.map(keyword => ({
        keyword: keyword,
        geo: geo,
        time: time
    }));
    
    const req = {
        comparisonItem: comparisonItems,
        category: 0,
        property: ""
    };
    
    const reqString = encodeURIComponent(JSON.stringify(req));
    const baseParams = `req=${reqString}&tz=-60&hl=${currentLanguage}`;
    
    const frames = {
        timeseries: {
            id: 'compareTimeseriesFrame',
            type: 'TIMESERIES'
        },
        geo: {
            id: 'compareGeoFrame',
            type: 'GEO_MAP'
        },
        topics: {
            id: 'compareTopicsFrame',
            type: 'RELATED_TOPICS'
        },
        queries: {
            id: 'compareQueriesFrame',
            type: 'RELATED_QUERIES'
        }
    };
    
    Object.values(frames).forEach(frame => {
        const iframe = document.getElementById(frame.id);
        if (iframe) {
            const url = `https://trends.google.com/trends/embed/explore/${frame.type}?${baseParams}`;
            iframe.src = url;
        }
    });
}

function updateFullCompareInfoLink(keywords) {
    const timeRangeSelect = document.getElementById('compareTimeRange');
    const countrySelect = document.getElementById('compareCountrySelect');
    const link = document.getElementById('fullCompareInfoLink');
    
    if (!timeRangeSelect || !countrySelect || !link) return;
    
    const time = timeRangeSelect.value;
    const geo = countrySelect.value;
    const keywordsParam = keywords.map(k => encodeURIComponent(k)).join(',');
    
    const url = `https://trends.google.com/trends/explore?date=${encodeURIComponent(time)}&geo=${geo}&q=${keywordsParam}&hl=${currentLanguage}`;
    link.href = url;
}

// ==========================================
// Fonctions de navigation et menu
// ==========================================
function switchMainMenu(menu, saveState = true) {
    console.log('Switching to menu:', menu);
    
    // Remove active class from all menu items
    document.querySelectorAll('.main-menu-item').forEach(item => item.classList.remove('active'));
    const menuItem = document.getElementById(`${menu}MenuItem`);
    if (menuItem) menuItem.classList.add('active');

    // Hide all sections and show selected one
    document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
    const section = document.getElementById(`${menu}Section`);
    if (section) section.classList.add('active');

    if (menu === 'trends') {
        fetchTrends().catch(error => {
            console.error('Error while retrieving trends:', error);
        });
    }

    if (saveState) {
        chrome.storage.local.set({ 'activeMainMenu': menu });
    }
}

// ==========================================
// Fonctions Google Search Settings
// ==========================================
function setupGoogleSearchOptions() {
    const checkbox = document.getElementById('googleSearchPopupCheck');
    const countrySelect = document.getElementById('googleSearchCountry');
    const timeRangeSelect = document.getElementById('googleSearchTimeRange');
    const optionsContainer = document.getElementById('googleSearchOptions');

    if (!checkbox || !countrySelect || !timeRangeSelect || !optionsContainer) return;

    // Initialiser l'état de l'interface
    checkbox.checked = googleSearchSettings.enabled;
    countrySelect.value = googleSearchSettings.country;
    timeRangeSelect.value = googleSearchSettings.timeRange;
    optionsContainer.classList.toggle('visible', googleSearchSettings.enabled);

    // Event listeners
    checkbox.addEventListener('change', function() {
        googleSearchSettings.enabled = this.checked;
        optionsContainer.classList.toggle('visible', this.checked);
        saveGoogleSearchSettings();
    });

    countrySelect.addEventListener('change', function() {
        googleSearchSettings.country = this.value;
        saveGoogleSearchSettings();
    });

    timeRangeSelect.addEventListener('change', function() {
        googleSearchSettings.timeRange = this.value;
        saveGoogleSearchSettings();
    });
}

function updateGoogleSearchUI() {
    const checkbox = document.getElementById('googleSearchPopupCheck');
    const countrySelect = document.getElementById('googleSearchCountry');
    const timeRangeSelect = document.getElementById('googleSearchTimeRange');
    const optionsContainer = document.getElementById('googleSearchOptions');

    if (checkbox) checkbox.checked = googleSearchSettings.enabled;
    if (countrySelect) countrySelect.value = googleSearchSettings.country;
    if (timeRangeSelect) timeRangeSelect.value = googleSearchSettings.timeRange;
    if (optionsContainer) optionsContainer.classList.toggle('visible', googleSearchSettings.enabled);
}

function saveGoogleSearchSettings() {
    chrome.storage.local.set({ 'googleSearchSettings': googleSearchSettings }, function() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs[0] && tabs[0].id) { // Add null check for tabs[0].id
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: "updateGoogleSearchSettings",
                    settings: googleSearchSettings
                });
            }
        });
    });
}

// ==========================================
// Fonctions pour les tendances
// ==========================================
async function fetchTrends() {
    console.log('Fetching trends for country:', currentCountry);
    
    const trendsList = document.getElementById('trendsTableBody');
    if (!trendsList) return;
    
    const translations = getTranslations();
    trendsList.innerHTML = `<tr><td colspan="4">${translations[currentLanguage]['loadingTrends']}</td></tr>`;

    try {
        const url = `https://trends.google.com/trending/rss?geo=${currentCountry}`;
        console.log('Fetching from URL:', url);
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const text = await response.text();
        console.log('RSS response received, length:', text.length);
        
        displayEmergingTrends(text);
    } catch (error) {
        console.error('Error retrieving trends:', error);
        const errorMsg = translations[currentLanguage]['errorFetchingTrends'];
        trendsList.innerHTML = `<tr><td colspan="4">${errorMsg}</td></tr>`;
    }
}

function displayEmergingTrends(text) {
    console.log('Displaying emerging trends...');
    
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, "text/xml");
    
    const items = xmlDoc.getElementsByTagName('item');
    console.log('Found', items.length, 'trend items');
    
    if (items.length === 0) {
        const trendsList = document.getElementById('trendsTableBody');
        if (trendsList) {
            const translations = getTranslations(); // Ensure translations are available
            trendsList.innerHTML = `<tr><td colspan="4">${translations[currentLanguage]?.['noTrendsFound'] || 'No trends found'}</td></tr>`;
        }
        return;
    }
    
    const trendsData = [];
    const translations = getTranslations();

    for (let i = 0; i < items.length; i++) {
        const titleElement = items[i].getElementsByTagName('title')[0];
        const trafficElement = items[i].getElementsByTagName('ht:approx_traffic')[0];
        const pubDateElement = items[i].getElementsByTagName('pubDate')[0];
        
        if (!titleElement || !trafficElement || !pubDateElement) continue;
        
        const title = titleElement.textContent;
        const traffic = trafficElement.textContent;
        const formattedTraffic = formatSearchVolume(traffic);
        const pubDate = new Date(pubDateElement.textContent);
        
        trendsData.push({
            title: title,
            traffic: formattedTraffic,
            pubDate: pubDate,
            formattedDate: formatDate(pubDate, translations[currentLanguage]['timeAgo'])
        });
    }

    trendsData.sort((a, b) => b.pubDate - a.pubDate);

    let trendsHTML = '';
    trendsData.forEach(trend => {
        const trendUrl = constructTrendExploreUrl(trend.title);
        trendsHTML += `
            <tr>
                <td class="trend-title">
                    <a href="${trendUrl}" 
                       target="_blank" 
                       class="trend-link"
                       data-trend="${trend.title.replace(/"/g, '"')}">${trend.title}</a>
                </td>
                <td class="trend-volume">${trend.traffic}</td>
                <td class="trend-start">${trend.formattedDate}</td>
                <td><i class="material-icons search-trend" data-keyword="${trend.title.replace(/"/g, '"')}">search</i></td>
            </tr>
        `;
    });

    const trendsList = document.getElementById('trendsTableBody');
    if (trendsList) {
        trendsList.innerHTML = trendsHTML;
    }

    // Attacher les événements de hover pour la modal
    document.querySelectorAll('.trend-link').forEach(link => {
        link.addEventListener('mouseenter', (e) => {
            const trend = e.target.dataset.trend;
            showTrendModal(e, trend);
        });
        
        link.addEventListener('mouseleave', (e) => {
            const modal = document.getElementById('trendModal');
            if (modal) {
                const modalRect = modal.getBoundingClientRect();
                // Check if the mouse is NOT over the modal itself
                if (!(e.clientX >= modalRect.left && e.clientX <= modalRect.right && 
                      e.clientY >= modalRect.top && e.clientY <= modalRect.bottom)) {
                    hideTrendModal();
                }
            }
        });
    });

    // Attacher les événements pour la recherche Google
    document.querySelectorAll('.search-trend').forEach(button => {
        button.addEventListener('click', function() {
            const keyword = this.getAttribute('data-keyword');
            chrome.tabs.create({ url: `https://www.google.com/search?q=${encodeURIComponent(keyword)}` });
        });
    });
}

function formatSearchVolume(traffic) {
    const number = parseInt(traffic.replace(/[^0-9]/g, ''));
    if (isNaN(number)) return traffic; // Return original if parsing fails
    if (number >= 1000000) {
        return (number / 1000000).toFixed(1).replace('.0', '') + 'M+';
    } else if (number >= 1000) {
        return (number / 1000).toFixed(1).replace('.0', '') + 'K+';
    }
    return traffic;
}

function constructTrendExploreUrl(keyword) {
    const baseUrl = 'https://trends.google.com/trends/explore';
    const params = new URLSearchParams({
        q: keyword,
        date: 'now 1-d', // Default to "Past day"
        geo: currentCountry,
        hl: currentLanguage
    });
    return `${baseUrl}?${params.toString()}`;
}

function changeCountry() {
    const countrySelect = document.getElementById('countrySelect');
    if (countrySelect) {
        currentCountry = countrySelect.value;
        chrome.storage.local.set({ 'selectedCountry': currentCountry });
        fetchTrends().catch(error => {
            console.error('Error retrieving trends:', error);
        });
    }
}

function sortTrends(column) {
    if (currentSortColumn === column) {
        currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = column;
        // Default sort order for 'start' is desc, for others asc
        currentSortOrder = column === 'start' ? 'desc' : 'asc'; 
    }

    const trendsList = document.getElementById('trendsTableBody');
    if (!trendsList) return;
    
    const rows = Array.from(trendsList.querySelectorAll('tr'));

    rows.sort((a, b) => {
        let aValue, bValue;
        if (column === 'trend') {
            const aTitleEl = a.querySelector('.trend-title a'); // Target the <a> tag for text
            const bTitleEl = b.querySelector('.trend-title a');
            aValue = aTitleEl ? aTitleEl.textContent.toLowerCase() : '';
            bValue = bTitleEl ? bTitleEl.textContent.toLowerCase() : '';
        } else if (column === 'volume') {
            const aVolumeEl = a.querySelector('.trend-volume');
            const bVolumeEl = b.querySelector('.trend-volume');
            // Convert K/M to numbers for proper sorting
            const parseVolume = (volStr) => {
                if (!volStr) return 0;
                let num = parseFloat(volStr.replace('+', ''));
                if (volStr.toUpperCase().includes('K')) num *= 1000;
                if (volStr.toUpperCase().includes('M')) num *= 1000000;
                return num;
            };
            aValue = aVolumeEl ? parseVolume(aVolumeEl.textContent) : 0;
            bValue = bVolumeEl ? parseVolume(bVolumeEl.textContent) : 0;
        } else if (column === 'start') {
            // Sorting by 'start' should use the original pubDate if available, 
            // or parse from 'time ago' string as a fallback.
            // This requires trendsData to be accessible or to store original dates in rows.
            // For simplicity, we'll stick to getMinutesFromTimeAgo if original dates aren't easily accessible here.
            const aStartEl = a.querySelector('.trend-start');
            const bStartEl = b.querySelector('.trend-start');
            aValue = aStartEl ? getMinutesFromTimeAgo(aStartEl.textContent) : 0; // Lower value means more recent
            bValue = bStartEl ? getMinutesFromTimeAgo(bStartEl.textContent) : 0;
        }

        if (aValue < bValue) return currentSortOrder === 'asc' ? -1 : 1;
        if (aValue > bValue) return currentSortOrder === 'asc' ? 1 : -1;
        return 0;
    });

    trendsList.innerHTML = '';
    rows.forEach(row => trendsList.appendChild(row));
}

function getMinutesFromTimeAgo(timeAgo) {
    const translations = getTranslations()[currentLanguage]['timeAgo'];
    const now = Date.now();
    let minutesAgo = 0;

    for (const key in translations) {
        const pattern = translations[key].replace('{n}', '(\\d+)');
        const regex = new RegExp(pattern, 'i');
        const match = timeAgo.match(regex);
        if (match) {
            const number = parseInt(match[1]);
            if (key.includes('minute')) {
                minutesAgo = number;
            } else if (key.includes('hour')) {
                minutesAgo = number * 60;
            } else if (key.includes('day')) {
                minutesAgo = number * 24 * 60;
            }
            break;
        }
    }
    // This function should return a value that represents "how long ago"
    // For sorting: more recent (smaller 'ago' value) should come first if descending 'start time'
    // So, a smaller number of minutes ago is "later" or "more recent".
    return minutesAgo; 
}


// ==========================================
// Fonctions pour les explications de tendances
// ==========================================
let hideTimeout;

async function getPerplexityExplanation(trend) {
    const cacheKey = `trend_explanation_${currentLanguage}_${trend}`;
    const result = await chrome.storage.local.get(cacheKey);
    const cachedData = result[cacheKey];

    if (cachedData && (Date.now() - cachedData.timestamp < CACHE_DURATION)) {
        return cachedData.explanation;
    }

    if (!API_KEY) {
        return currentLanguage === 'fr' 
            ? "La clé API Perplexity n'est pas configurée."
            : "Perplexity API key is not configured.";
    }
    
    try {
        // La première déclaration redondante de systemPrompt a été enlevée.
        const systemPrompt = currentLanguage === 'fr' 
            ? "Tu es un assistant spécialisé dans l'actualité. Tu dois fournir des résumés très courts en 1-2 phrases maximum. Réponds en français. Ne mets pas les sources."
            : "You are a news specialist assistant. You must provide very short summaries in 1-2 sentences maximum. Answer in English. Don't put sources.";
        
        const userPrompt = currentLanguage === 'fr'
            ? `Explique très brièvement pourquoi "${trend}" est une tendance actuellement ? Donne que les informations très récentes. Donne uniquement l'information essentielle en 1-2 phrases.`
            : `Briefly explain why "${trend}" is trending right now? Give only very recent information. Give only the essential information in 1-2 sentences.`;

        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: "sonar", // ou un autre modèle approprié si disponible et souhaité
                messages: [
                    {
                        "role": "system",
                        "content": systemPrompt
                    },
                    {
                        "role": "user",
                        "content": userPrompt
                    }
                ]
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Failed to parse error response' }));
            console.error('Perplexity API Error:', response.status, errorData);
            throw new Error(`Erreur API Perplexity: ${response.status} - ${errorData.detail || response.statusText}`);
        }

        const data = await response.json();
        if (!data.choices || data.choices.length === 0 || !data.choices[0].message || !data.choices[0].message.content) {
            throw new Error("Réponse invalide de l'API Perplexity");
        }
        const explanation = data.choices[0].message.content;

        await chrome.storage.local.set({
            [cacheKey]: {
                explanation,
                timestamp: Date.now()
            }
        });

        return explanation;

    } catch (error) {
        console.error('Error in getPerplexityExplanation:', error);
        return currentLanguage === 'fr'
            ? `Impossible de charger l'explication pour "${trend}". Erreur: ${error.message}`
            : `Unable to load explanation for "${trend}". Error: ${error.message}`;
    }
}

function showTrendModal(event, trend) {
    clearTimeout(hideTimeout);
    
    const modal = document.getElementById('trendModal');
    const modalTitle = document.getElementById('trendModalTitle');
    const modalText = document.getElementById('trendModalText');
    const modalLoader = document.getElementById('trendModalLoader');

    if (!modal || !modalTitle || !modalText || !modalLoader) return;

    // Position modal
    let x = event.clientX + 10; // Position to the right of the cursor
    let y = event.clientY - 10; // Position slightly above the cursor
    
    // Keep modal within viewport
    const modalWidth = modal.offsetWidth || 280; // Use actual width or default
    const modalHeight = modal.offsetHeight || 150; // Use actual height or default
    
    // Adjust X position if modal goes off-screen to the right
    if (x + modalWidth > window.innerWidth) {
        x = event.clientX - modalWidth - 10; // Position to the left
    }
    // Adjust X position if modal goes off-screen to the left (e.g., if positioned left initially)
    if (x < 0) {
        x = 10; // Add a small margin from the left edge
    }
    
    // Adjust Y position if modal goes off-screen to the bottom
    if (y + modalHeight > window.innerHeight) {
        y = window.innerHeight - modalHeight - 10; // Align to bottom with margin
    }
    // Adjust Y position if modal goes off-screen to the top
    if (y < 0) {
        y = 10; // Add a small margin from the top edge
    }
    
    modal.style.left = `${x}px`;
    modal.style.top = `${y}px`;

    modalTitle.textContent = trend;
    modalText.style.display = 'none';
    modalLoader.style.display = 'flex'; // Show loader
    
    modal.classList.remove('hiding'); // Ensure hiding class is removed if present
    modal.classList.add('visible');

    getPerplexityExplanation(trend).then(explanation => {
        modalLoader.style.display = 'none'; // Hide loader
        modalText.textContent = explanation;
        modalText.style.display = 'block';
    }).catch(error => { // This catch is for promise rejection from getPerplexityExplanation itself
        modalLoader.style.display = 'none';
        modalText.textContent = currentLanguage === 'fr'
            ? "Erreur lors du chargement de l'explication."
            : "Error loading explanation.";
        modalText.style.display = 'block';
        console.error('Error displaying trend explanation in modal:', error);
    });
}

function hideTrendModal() {
    const modal = document.getElementById('trendModal');
    if (modal && modal.classList.contains('visible')) { // Only hide if visible
        modal.classList.add('hiding'); // Add class for fade-out animation
        
        // Use a timeout that matches the CSS transition duration
        hideTimeout = setTimeout(() => {
            modal.classList.remove('visible', 'hiding');
            // Optional: Clear content if needed when hiding
            // const modalTitle = document.getElementById('trendModalTitle');
            // const modalText = document.getElementById('trendModalText');
            // if(modalTitle) modalTitle.textContent = '';
            // if(modalText) modalText.textContent = '';
        }, 300); // Match CSS transition duration
    }
}

function setupTrendModalListeners() {
    const modal = document.getElementById('trendModal');
    
    if (modal) {
        // When mouse enters the modal itself, clear the hide timeout
        // This allows the user to move their mouse into the modal to read/interact
        modal.addEventListener('mouseenter', () => {
            clearTimeout(hideTimeout);
        });
        
        // When mouse leaves the modal, start the hide process
        modal.addEventListener('mouseleave', () => {
            hideTrendModal();
        });
    }
}

// ==========================================
// Fonctions de formatage et utilitaires
// ==========================================
function formatDate(date, timeAgoTranslations) { // Renamed from formatTimeAgo to avoid confusion
    const now = new Date();
    const diffTime = Math.abs(now - date); // Difference in milliseconds
    const diffMinutes = Math.ceil(diffTime / (1000 * 60));

    if (diffMinutes < 1) return timeAgoTranslations['justNow'] || 'Just now'; // Handle "just now" case
    if (diffMinutes < 60) {
        return timeAgoTranslations[diffMinutes === 1 ? 'minute' : 'minutes'].replace('{n}', diffMinutes);
    } 
    
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
        return timeAgoTranslations[diffHours === 1 ? 'hour' : 'hours'].replace('{n}', diffHours);
    } 
    
    const diffDays = Math.floor(diffHours / 24);
    return timeAgoTranslations[diffDays === 1 ? 'day' : 'days'].replace('{n}', diffDays);
}

// ==========================================
// Fonctions de langues et traductions
// ==========================================
function changeLanguage() {
    const languageSelect = document.getElementById('languageSelect');
    if (languageSelect) {
        currentLanguage = languageSelect.value;
        chrome.storage.sync.set({language: currentLanguage}, function() {
            console.log('Language saved:', currentLanguage);
        });
        updateUILanguage();
        // Trends will be re-fetched with new language in updateUILanguage (via updateExistingTrendsTranslation)
        // If comparison is active, update its display elements
        const validKeywords = compareKeywords.filter(k => k.trim().length > 0);
        if (validKeywords.length > 0) {
            updateFullCompareInfoLink(validKeywords);
            updateComparisonFrames(validKeywords); // To update iframe hl parameter
        }
        updateAddButtonState(); 
        updateKeywordPlaceholders();
    }
}

function updateKeywordPlaceholders() {
    const translations = getTranslations();
    const t = translations[currentLanguage];
    const inputs = document.querySelectorAll('.keyword-input');
    
    inputs.forEach((input, index) => {
        const placeholderText = (index === 0 && t['firstKeywordPlaceholder']) ? 
                                t['firstKeywordPlaceholder'] : 
                                (t['keywordPlaceholder'] || 'Enter keyword...');
        input.placeholder = placeholderText;
    });
}

function updateUILanguage() {
    const translations = getTranslations();
    const t = translations[currentLanguage];

    if (!t) {
        console.error(`Translations not found for language: ${currentLanguage}`);
        return;
    }

    const updateElementText = (id, translationKey, fallbackText = '') => {
        const element = document.getElementById(id);
        if (element) element.textContent = t[translationKey] || fallbackText;
    };

    const updateElementPlaceholder = (id, translationKey, fallbackText = '') => {
        const element = document.getElementById(id);
        if (element) element.placeholder = t[translationKey] || fallbackText;
    };
    
    const updateOptionText = (selectId, optionValue, translationKey) => {
        const select = document.getElementById(selectId);
        if (select) {
            const option = select.querySelector(`option[value="${optionValue}"]`);
            if (option) option.textContent = t[translationKey] || option.textContent;
        }
    };

    // Header & Menu
    // document.querySelector('.header h1').textContent = t['appTitle'] || 'Trends Pocket';
    // document.querySelector('.header p').textContent = t['appSubtitle'] || 'Analyze Google Trends in real-time';
    updateElementText('trendsMenuItem', 'trendsMenuItem', 'Trends');
    updateElementText('searchMenuItem', 'searchMenuItem', 'Search');
    updateElementText('filterMenuItem', 'filterMenuItem', 'Filter'); // Assuming ID exists


    // Section Titles (assuming these IDs exist from your HTML structure)
    // For <div class="section-title">Emerging Trends</div>, we need IDs or a more complex selector
    // Let's assume they have IDs like 'emergingTrendsSectionTitle', 'compareTrendsSectionTitle', 'settingsSectionTitle'
    const emergingTrendsSection = document.getElementById('trendsSection');
    if(emergingTrendsSection) {
        const titleEl = emergingTrendsSection.querySelector('.section-title');
        if(titleEl) titleEl.textContent = t['emergingTrends'] || 'Emerging Trends';
    }

    const compareSection = document.getElementById('searchSection');
    if(compareSection) {
        const titleEl = compareSection.querySelector('.section-title');
        if(titleEl) titleEl.textContent = t['compareTrends'] || 'Compare Trends';
    }
    
    const filterSection = document.getElementById('filterSection');
    if(filterSection) { // Assuming filterSection exists
        const settingsTitleEl = filterSection.querySelector('.settings-container .section-title');
        if(settingsTitleEl) settingsTitleEl.textContent = t['settingsTitle'] || 'Settings'; // Adding translation for Settings title
    }


    // Trends Section
    updateElementPlaceholder('countrySelect', 'countryPlaceholder', 'Select Country'); // if it was a placeholder
    updateElementText('sortTrend', 'trendColumn', 'Trends');
    updateElementText('sortVolume', 'volumeColumn', 'Volume');
    updateElementText('sortStart', 'startColumn', 'Started');

    // Search/Compare Section
    updateKeywordPlaceholders(); // Updates keyword input placeholders
    updateAddButtonState(); // Updates add keyword button text
    
    const compareEmptyStateH3 = document.querySelector('#compareEmptyState h3');
    if (compareEmptyStateH3) compareEmptyStateH3.textContent = t['compareKeywordsTitle'] || 'Compare Keywords';
    const compareEmptyStateP = document.querySelector('#compareEmptyState p');
    if (compareEmptyStateP) compareEmptyStateP.textContent = t['compareKeywordsDescription'] || 'Enter keywords...';

    updateElementText('fullCompareInfoLink', 'viewFullComparisonText', 'View full comparison on Google Trends');
    
    // Iframe titles (assuming IDs like 'compareTimeseriesFrameTitle')
    // The current HTML uses <div class="iframe-title">, so we need to be more specific or add IDs
    const updateIframeTitle = (iframeId, translationKey, fallbackText) => {
        const iframe = document.getElementById(iframeId);
        if (iframe && iframe.previousElementSibling && iframe.previousElementSibling.classList.contains('iframe-title')) {
            iframe.previousElementSibling.textContent = t[translationKey] || fallbackText;
        }
    };
    updateIframeTitle('compareTimeseriesFrame', 'timeEvolutionTitle', 'Time evolution comparison');
    updateIframeTitle('compareGeoFrame', 'geoDistributionTitle', 'Geographic distribution');
    updateIframeTitle('compareTopicsFrame', 'relatedTopicsTitle', 'Related topics');
    updateIframeTitle('compareQueriesFrame', 'relatedQueriesTitle', 'Related queries');


    // Filter Section
    updateElementPlaceholder('filterInput', 'filterKeywordPlaceholder', 'Enter a keyword');
    
    const goToGoogleTrendsLink = document.querySelector('#filterSection a[href="https://trends.google.com/trending"]');
    if(goToGoogleTrendsLink) goToGoogleTrendsLink.textContent = t['goToGoogleTrends'] || 'Go to Google Trends';

    updateElementText('allButton', 'allButton', 'All');
    updateElementText('favoritesButton', 'favoritesButton', 'Favorites');
    updateElementText('newsButton', 'newsButton', 'News');


    // Settings in Filter Section
    updateElementText('languageLabel', 'languageLabel', 'Language');
    const googleSearchPopupCheckboxSpan = document.querySelector('#googleSearchPopupCheck + .checkbox-icon + span');
    if(googleSearchPopupCheckboxSpan) googleSearchPopupCheckboxSpan.textContent = t['googleSearchPopupLabel'] || 'Google Search Popup';
    
    const googleSearchCountryLabel = document.querySelector('#googleSearchOptions .sub-option label[for="googleSearchCountry"]');
    if(googleSearchCountryLabel) googleSearchCountryLabel.textContent = t['countryLabel'] || 'Country';
    
    const googleSearchTimeRangeLabel = document.querySelector('#googleSearchOptions .sub-option label[for="googleSearchTimeRange"]');
    if(googleSearchTimeRangeLabel) googleSearchTimeRangeLabel.textContent = t['trendsPeriodsLabel'] || 'Trends period';

    // Update time range options for all selects
    ['compareTimeRange', 'googleSearchTimeRange'].forEach(selectId => {
        updateOptionText(selectId, 'now 1-H', 'pastHour');
        updateOptionText(selectId, 'now 4-H', 'past4Hours');
        updateOptionText(selectId, 'now 1-d', 'pastDay');
        updateOptionText(selectId, 'now 7-d', 'past7Days');
        updateOptionText(selectId, 'today 1-m', 'past30Days');
        updateOptionText(selectId, 'today 3-m', 'past90Days');
        updateOptionText(selectId, 'today 12-m', 'past12Months');
        updateOptionText(selectId, 'today 5-y', 'past5Years');
        updateOptionText(selectId, 'all', 'since2004');
    });
    
    updateCountrySelects(t); // This updates all country select dropdowns
    updateExistingTrendsTranslation(); // This will re-fetch and re-render trends with new date formats
}

function updateExistingTrendsTranslation() {
    // Re-fetch trends, which will then use the new currentLanguage for date formatting and URLs
    if (document.getElementById('trendsSection').classList.contains('active')) {
        fetchTrends().catch(error => {
            console.error('Error re-fetching trends for translation:', error);
        });
    }
}

function updateCountrySelects(translationsObj) { // Parameter changed to avoid conflict with global 'translations'
    const selects = [
        document.getElementById('countrySelect'), 
        document.getElementById('compareCountrySelect'),
        document.getElementById('googleSearchCountry')
    ];
    
    const countries = translationsObj['countries'] || getTranslations()['en']['countries']; // Fallback to English countries

    selects.forEach(select => {
        if (!select) return;
        
        const currentValue = select.value; // Preserve current selection
        select.innerHTML = ''; // Clear existing options
        
        Object.entries(countries).forEach(([value, text]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = text;
            if (value === 'separator') {
                option.disabled = true;
            }
            select.appendChild(option);
        });
        
        // Try to restore previous selection, if still valid
        if (Array.from(select.options).some(opt => opt.value === currentValue)) {
            select.value = currentValue;
        } else if (select.options.length > 0) {
            // If previous value is no longer valid (e.g. due to language change affecting values)
            // default to the first non-disabled option or a common default like 'US'
            const defaultCountry = currentLanguage === 'fr' ? 'FR' : 'US';
            if (Array.from(select.options).some(opt => opt.value === defaultCountry)) {
                 select.value = defaultCountry;
            } else if (!select.options[0].disabled) {
                 select.value = select.options[0].value;
            }
        }
    });
}

function getTranslations() {
    // Ensure all keys used in updateUILanguage are present here for both languages
    return {
        'fr': {
            'appTitle': 'Trends Pocket',
            'appSubtitle': 'Analysez Google Trends en temps réel',
            'languageLabel': 'Langue',
            'trendsMenuItem': 'Tendances',
            'searchMenuItem': 'Recherche',
            'filterMenuItem': 'Filtre',
            'googleSearchPopupLabel': 'Popup Google Search',
            'countryLabel': 'Pays',
            'trendsPeriodsLabel': 'Période des tendances',
            'emergingTrends': 'Tendances Émergentes',
            'compareTrends': 'Comparer les Tendances',
            'settingsTitle': 'Paramètres',
            'trendColumn': 'Tendances',
            'volumeColumn': 'Volume',
            'startColumn': 'Début',
            'countryPlaceholder': 'Sélectionner un pays',
            'filterKeywordPlaceholder': 'Entrer un mot-clé',
            'goToGoogleTrends': 'Aller sur Google Trends',
            'allButton': 'Tout',
            'favoritesButton': 'Favoris',
            'newsButton': 'Actualités',
            'compareKeywordsTitle': 'Comparer les Mots-clés',
            'compareKeywordsDescription': 'Entrez des mots-clés ci-dessus pour comparer leurs tendances de recherche.',
            'viewFullComparisonText': 'Voir la comparaison complète sur Google Trends',
            'timeEvolutionTitle': 'Évolution temporelle',
            'geoDistributionTitle': 'Distribution géographique',
            'relatedTopicsTitle': 'Sujets associés',
            'relatedQueriesTitle': 'Requêtes associées',
            'firstKeywordPlaceholder': 'Entrez le premier mot-clé...',
            'keywordPlaceholder': 'Entrez un mot-clé...',
            'addKeywordBtn': 'Ajouter un mot-clé ({current}/{max})',
            'loadingTrends': 'Chargement des tendances...',
            'errorFetchingTrends': 'Impossible de récupérer les tendances.',
            'noTrendsFound': 'Aucune tendance trouvée.',
            'pastHour': 'Dernière heure',
            'past4Hours': '4 dernières heures',
            'pastDay': 'Dernier jour',
            'past7Days': '7 derniers jours',
            'past30Days': '30 derniers jours',
            'past90Days': '90 derniers jours',
            'past12Months': '12 derniers mois',
            'past5Years': '5 dernières années',
            'since2004': 'Depuis 2004',
            'countries': { // Noms des pays en Français
                'US': 'États-Unis', 'GB': 'Royaume-Uni', 'DE': 'Allemagne', 'FR': 'France', 'JP': 'Japon',
                'separator': '──────────',
                'AF': 'Afghanistan', 'ZA': 'Afrique du Sud', 'AL': 'Albanie', 'DZ': 'Algérie', 'AD': 'Andorre', 'AO': 'Angola', 'AG': 'Antigua-et-Barbuda', 'SA': 'Arabie Saoudite', 'AR': 'Argentine', 'AM': 'Arménie', 'AU': 'Australie', 'AT': 'Autriche', 'AZ': 'Azerbaïdjan', 'BS': 'Bahamas', 'BH': 'Bahreïn', 'BD': 'Bangladesh', 'BE': 'Belgique', 'BZ': 'Belize', 'BJ': 'Bénin', 'BT': 'Bhoutan', 'BY': 'Biélorussie', 'BO': 'Bolivie', 'BW': 'Botswana', 'BR': 'Brésil', 'BN': 'Brunéi Darussalam', 'BF': 'Burkina Faso', 'BI': 'Burundi', 'KH': 'Cambodge', 'CA': 'Canada', 'CV': 'Cap-Vert', 'CL': 'Chili', 'CN': 'Chine', 'CO': 'Colombie', 'CR': 'Costa Rica', 'HR': 'Croatie', 'CU': 'Cuba', 'CD': 'RD Congo', 'CG': 'Congo', 'CF': 'République Centrafricaine', 'DK': 'Danemark', 'DJ': 'Djibouti', 'DM': 'Dominique', 'EG': 'Égypte', 'EC': 'Équateur', 'ET': 'Éthiopie', 'ES': 'Espagne', 'EE': 'Estonie', 'FJ': 'Fidji', 'FI': 'Finlande', 'GA': 'Gabon', 'GE': 'Géorgie', 'GH': 'Ghana', 'GI': 'Gibraltar', 'GL': 'Groenland', 'GT': 'Guatemala', 'GY': 'Guyana', 'HT': 'Haïti', 'HN': 'Honduras', 'HU': 'Hongrie', 'HK': 'Hong Kong', 'IM': 'Île de Man', 'CK': 'Îles Cook', 'PN': 'Îles Pitcairn', 'SB': 'Îles Salomon', 'VI': 'Îles Vierges américaines', 'VG': 'Îles Vierges britanniques', 'IN': 'Inde', 'ID': 'Indonésie', 'IQ': 'Irak', 'IE': 'Irlande', 'IS': 'Islande', 'IL': 'Israël', 'IT': 'Italie', 'JM': 'Jamaïque', 'JO': 'Jordanie', 'KE': 'Kenya', 'KG': 'Kirghizistan', 'KI': 'Kiribati', 'KW': 'Koweït', 'KZ': 'Kazakhstan', 'LA': 'Laos', 'LS': 'Lesotho', 'LV': 'Lettonie', 'LT': 'Lituanie', 'LU': 'Luxembourg', 'LB': 'Liban', 'LY': 'Libye', 'MG': 'Madagascar', 'MK': 'Macédoine du Nord', 'MY': 'Malaisie', 'MW': 'Malawi', 'MT': 'Malte', 'MV': 'Maldives', 'ML': 'Mali', 'MX': 'Mexique', 'MD': 'Moldavie', 'MN': 'Mongolie', 'ME': 'Monténégro', 'MS': 'Montserrat', 'MM': 'Myanmar (Birmanie)', 'NA': 'Namibie', 'NI': 'Nicaragua', 'NE': 'Niger', 'NG': 'Nigéria', 'NO': 'Norvège', 'NZ': 'Nouvelle-Zélande', 'OM': 'Oman', 'UG': 'Ouganda', 'UZ': 'Ouzbékistan', 'PK': 'Pakistan', 'PA': 'Panama', 'PY': 'Paraguay', 'PE': 'Pérou', 'PH': 'Philippines', 'PL': 'Pologne', 'PR': 'Porto Rico', 'PT': 'Portugal', 'QA': 'Qatar', 'CZ': 'Tchéquie', 'RO': 'Roumanie', 'RU': 'Russie', 'RW': 'Rwanda', 'SM': 'Saint-Marin', 'VC': 'Saint-Vincent-et-les Grenadines', 'WS': 'Samoa', 'AS': 'Samoa américaines', 'ST': 'Sao Tomé-et-Principe', 'SN': 'Sénégal', 'SC': 'Seychelles', 'SL': 'Sierra Leone', 'SG': 'Singapour', 'SK': 'Slovaquie', 'SI': 'Slovénie', 'SO': 'Somalie', 'SR': 'Suriname', 'SE': 'Suède', 'CH': 'Suisse', 'TJ': 'Tadjikistan', 'TZ': 'Tanzanie', 'TD': 'Tchad', 'TG': 'Togo', 'TL': 'Timor-Leste', 'TO': 'Tonga', 'TT': 'Trinité-et-Tobago', 'TM': 'Turkménistan', 'TR': 'Turquie', 'UA': 'Ukraine', 'UY': 'Uruguay', 'VU': 'Vanuatu', 'VE': 'Venezuela', 'VN': 'Vietnam', 'ZM': 'Zambie', 'ZW': 'Zimbabwe', 'CAT': 'Catalogne'
            },
            'timeAgo': {
                'justNow': 'À l\'instant',
                'minute': 'Il y a {n} minute',
                'minutes': 'Il y a {n} minutes',
                'hour': 'Il y a {n} heure',
                'hours': 'Il y a {n} heures',
                'day': 'Il y a {n} jour',
                'days': 'Il y a {n} jours'
            }
        },
        'en': { // English translations
            'appTitle': 'Trends Pocket',
            'appSubtitle': 'Analyze Google Trends in real-time',
            'languageLabel': 'Language',
            'trendsMenuItem': 'Trends',
            'searchMenuItem': 'Search',
            'filterMenuItem': 'Filter',
            'googleSearchPopupLabel': 'Google Search Popup',
            'countryLabel': 'Country',
            'trendsPeriodsLabel': 'Trends period',
            'emergingTrends': 'Emerging Trends',
            'compareTrends': 'Compare Trends',
            'settingsTitle': 'Settings',
            'trendColumn': 'Trends',
            'volumeColumn': 'Volume',
            'startColumn': 'Started',
            'countryPlaceholder': 'Select Country',
            'filterKeywordPlaceholder': 'Enter a keyword',
            'goToGoogleTrends': 'Go to Google Trends',
            'allButton': 'All',
            'favoritesButton': 'Favorites',
            'newsButton': 'News',
            'compareKeywordsTitle': 'Compare Keywords',
            'compareKeywordsDescription': 'Enter keywords above to compare their search trends over time and see how they perform relative to each other.',
            'viewFullComparisonText': 'View full comparison on Google Trends',
            'timeEvolutionTitle': 'Time evolution comparison',
            'geoDistributionTitle': 'Geographic distribution',
            'relatedTopicsTitle': 'Related topics',
            'relatedQueriesTitle': 'Related queries',
            'firstKeywordPlaceholder': 'Enter first keyword...',
            'keywordPlaceholder': 'Enter keyword...',
            'addKeywordBtn': 'Add keyword to compare ({current}/{max})',
            'loadingTrends': 'Loading trends...',
            'errorFetchingTrends': 'Unable to fetch trends. Please try again later.',
            'noTrendsFound': 'No trends found.',
            'pastHour': 'Past hour',
            'past4Hours': 'Past 4 hours',
            'pastDay': 'Past day',
            'past7Days': 'Past 7 days',
            'past30Days': 'Past 30 days',
            'past90Days': 'Past 90 days',
            'past12Months': 'Past 12 months',
            'past5Years': 'Past 5 years',
            'since2004': 'Since 2004',
            'countries': { // Country names in English
                'US': 'United States', 'GB': 'United Kingdom', 'DE': 'Germany', 'FR': 'France', 'JP': 'Japan',
                'separator': '──────────',
                'AF': 'Afghanistan', 'ZA': 'South Africa', 'AL': 'Albania', 'DZ': 'Algeria', 'AD': 'Andorra', 'AO': 'Angola', 'AG': 'Antigua and Barbuda', 'SA': 'Saudi Arabia', 'AR': 'Argentina', 'AM': 'Armenia', 'AU': 'Australia', 'AT': 'Austria', 'AZ': 'Azerbaijan', 'BS': 'Bahamas', 'BH': 'Bahrain', 'BD': 'Bangladesh', 'BE': 'Belgium', 'BZ': 'Belize', 'BJ': 'Benin', 'BT': 'Bhutan', 'BY': 'Belarus', 'BO': 'Bolivia', 'BW': 'Botswana', 'BR': 'Brazil', 'BN': 'Brunei Darussalam', 'BF': 'Burkina Faso', 'BI': 'Burundi', 'KH': 'Cambodia', 'CA': 'Canada', 'CV': 'Cape Verde', 'CL': 'Chile', 'CN': 'China', 'CO': 'Colombia', 'CR': 'Costa Rica', 'HR': 'Croatia', 'CU': 'Cuba', 'CD': 'DR Congo', 'CG': 'Congo', 'CF': 'Central African Republic', 'DK': 'Denmark', 'DJ': 'Djibouti', 'DM': 'Dominica', 'EG': 'Egypt', 'EC': 'Ecuador', 'ET': 'Ethiopia', 'ES': 'Spain', 'EE': 'Estonia', 'FJ': 'Fiji', 'FI': 'Finland', 'GA': 'Gabon', 'GE': 'Georgia', 'GH': 'Ghana', 'GI': 'Gibraltar', 'GL': 'Greenland', 'GT': 'Guatemala', 'GY': 'Guyana', 'HT': 'Haiti', 'HN': 'Honduras', 'HU': 'Hungary', 'HK': 'Hong Kong', 'IM': 'Isle of Man', 'CK': 'Cook Islands', 'PN': 'Pitcairn Islands', 'SB': 'Solomon Islands', 'VI': 'U.S. Virgin Islands', 'VG': 'British Virgin Islands', 'IN': 'India', 'ID': 'Indonesia', 'IQ': 'Iraq', 'IE': 'Ireland', 'IS': 'Iceland', 'IL': 'Israel', 'IT': 'Italy', 'JM': 'Jamaica', 'JO': 'Jordan', 'KE': 'Kenya', 'KG': 'Kyrgyzstan', 'KI': 'Kiribati', 'KW': 'Kuwait', 'KZ': 'Kazakhstan', 'LA': 'Laos', 'LS': 'Lesotho', 'LV': 'Latvia', 'LT': 'Lithuania', 'LU': 'Luxembourg', 'LB': 'Lebanon', 'LY': 'Libya', 'MG': 'Madagascar', 'MK': 'North Macedonia', 'MY': 'Malaysia', 'MW': 'Malawi', 'MT': 'Malta', 'MV': 'Maldives', 'ML': 'Mali', 'MX': 'Mexico', 'MD': 'Moldova', 'MN': 'Mongolia', 'ME': 'Montenegro', 'MS': 'Montserrat', 'MM': 'Myanmar (Burma)', 'NA': 'Namibia', 'NI': 'Nicaragua', 'NE': 'Niger', 'NG': 'Nigeria', 'NO': 'Norway', 'NZ': 'New Zealand', 'OM': 'Oman', 'UG': 'Uganda', 'UZ': 'Uzbekistan', 'PK': 'Pakistan', 'PA': 'Panama', 'PY': 'Paraguay', 'PE': 'Peru', 'PH': 'Philippines', 'PL': 'Poland', 'PR': 'Puerto Rico', 'PT': 'Portugal', 'QA': 'Qatar', 'CZ': 'Czech Republic', 'RO': 'Romania', 'RU': 'Russia', 'RW': 'Rwanda', 'SM': 'San Marino', 'VC': 'Saint Vincent and the Grenadines', 'WS': 'Samoa', 'AS': 'American Samoa', 'ST': 'São Tomé and Príncipe', 'SN': 'Senegal', 'SC': 'Seychelles', 'SL': 'Sierra Leone', 'SG': 'Singapore', 'SK': 'Slovakia', 'SI': 'Slovenia', 'SO': 'Somalia', 'SR': 'Suriname', 'SE': 'Sweden', 'CH': 'Switzerland', 'TJ': 'Tajikistan', 'TZ': 'Tanzania', 'TD': 'Chad', 'TG': 'Togo', 'TL': 'Timor-Leste', 'TO': 'Tonga', 'TT': 'Trinidad and Tobago', 'TM': 'Turkmenistan', 'TR': 'Turkey', 'UA': 'Ukraine', 'UY': 'Uruguay', 'VU': 'Vanuatu', 'VE': 'Venezuela', 'VN': 'Vietnam', 'ZM': 'Zambia', 'ZW': 'Zimbabwe', 'CAT': 'Catalonia'
            },
            'timeAgo': { // Time ago in English
                'justNow': 'Just now',
                'minute': '{n} minute ago',
                'minutes': '{n} minutes ago',
                'hour': '{n} hour ago',
                'hours': '{n} hours ago',
                'day': '{n} day ago',
                'days': '{n} days ago'
            }
        }
    };
}

// ==========================================
// Event Listeners pour messages Chrome
// ==========================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Message received in sidepanel:', request.action, request); // Log the whole request
    
    if (request.action === "filterStats") {
        // Handle filter stats if needed
        console.log('Filter stats received (sidepanel):', request.data);
        // Potentially update some UI elements in the sidepanel based on these stats
    }
    // To make it asynchronous if sendResponse will be called later.
    // return true; 
});