// ==========================================
// Variables globales et constantes
// ==========================================
let currentKeyword = '';
let currentTheme = '';
let isFiltering = false;
let currentLanguage = 'en'; 
let newsCache = {};
let lastKeyword = '';
let currentCountry = 'US';
let searchCountry = 'US';
let currentSortColumn = 'start';
let currentSortOrder = 'desc';

/* NOUVEAU - Paramètres pour la popup Google Search */
let googleSearchSettings = {
    enabled: false,
    country: 'US',
    timeRange: 'now 7-d'
};

const GNEWS_API_KEY = 'API';

// ==========================================
// Event Listeners et Initialisation
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
    initializeExtension();
    setupEventListeners();
    setupGoogleSearchOptions(); // NOUVEAU
    displayHistoryAndFavorites();
    updateFavoriteIcon();
    
    // Get the stored settings
    chrome.storage.local.get([
        'selectedCountry', 
        'searchSelectedCountry',
        'activeMainMenu', 
        'activeSubMenu',
        'googleSearchSettings' // NOUVEAU
    ], function(result) {
        if (result.selectedCountry) {
            currentCountry = result.selectedCountry;
            document.getElementById('countrySelect').value = currentCountry;
        }

        if (result.searchSelectedCountry) {
            searchCountry = result.searchSelectedCountry;
            document.getElementById('searchCountrySelect').value = searchCountry;
        }

        // NOUVEAU - Charger les paramètres Google Search
        if (result.googleSearchSettings) {
            googleSearchSettings = result.googleSearchSettings;
            updateGoogleSearchUI();
        }

        // Restore main menu state
        if (result.activeMainMenu) {
            switchMainMenu(result.activeMainMenu, false);
        }

        // Restore sub menu state if we're in filter section
        if (result.activeSubMenu && result.activeMainMenu === 'filter') {
            switchFilterSubMenu(result.activeSubMenu, false);
        }

        fetchTrends().catch(error => {
            console.error('Error while retrieving trends:', error);
        });
    });

    // S'assurer que le bouton est masqué au chargement
    document.getElementById('fullInfoLink').style.display = 'none';
});

// Save navigation state when window is closed
window.addEventListener('unload', function() {
    const activeMainMenu = document.querySelector('.main-menu-item.active').id.replace('MenuItem', '');
    const activeSubMenu = document.querySelector('.sub-menu-item.active')?.id.replace('Button', '');
    
    chrome.storage.local.set({ 
        'selectedCountry': currentCountry,
        'searchSelectedCountry': searchCountry,
        'activeMainMenu': activeMainMenu,
        'activeSubMenu': activeSubMenu
    });
});
// ==========================================
// NOUVEAU - Fonctions pour Google Search Popup
// ==========================================
function setupGoogleSearchOptions() {
    const checkbox = document.getElementById('googleSearchPopupCheck');
    const countrySelect = document.getElementById('googleSearchCountry');
    const timeRangeSelect = document.getElementById('googleSearchTimeRange');
    const optionsContainer = document.getElementById('googleSearchOptions');

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

    checkbox.checked = googleSearchSettings.enabled;
    countrySelect.value = googleSearchSettings.country;
    timeRangeSelect.value = googleSearchSettings.timeRange;
    optionsContainer.classList.toggle('visible', googleSearchSettings.enabled);
}

function saveGoogleSearchSettings() {
    chrome.storage.local.set({ 'googleSearchSettings': googleSearchSettings }, function() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: "updateGoogleSearchSettings",
                    settings: googleSearchSettings
                });
            }
        });
    });
}

// ==========================================
// Fonctions d'initialisation existantes
// ==========================================
function initializeExtension() {
    chrome.storage.sync.get(['language'], function(result) {
        if (result.language) {
            currentLanguage = result.language;
            document.getElementById('languageSelect').value = currentLanguage;
        }
        updateUILanguage();
    });
}

function setupEventListeners() {
    document.getElementById('filterMenuItem').addEventListener('click', () => switchMainMenu('filter'));
    document.getElementById('searchMenuItem').addEventListener('click', () => switchMainMenu('search'));
    document.getElementById('trendsMenuItem').addEventListener('click', () => switchMainMenu('trends'));
    document.getElementById('allButton').addEventListener('click', () => switchFilterSubMenu('all'));
    document.getElementById('favoritesButton').addEventListener('click', () => switchFilterSubMenu('favorites'));
    document.getElementById('newsButton').addEventListener('click', () => switchFilterSubMenu('news'));
    document.getElementById('searchIcon').addEventListener('click', applyFilter);
    document.getElementById('filterInput').addEventListener('keypress', event => { if (event.key === 'Enter') applyFilter(); });
    document.getElementById('favoriteIcon').addEventListener('click', toggleFavorite);
    document.getElementById('clearButton').addEventListener('click', clearFilter);
    document.getElementById('settingsIcon').addEventListener('click', toggleSettingsDropdown);
    document.getElementById('languageSelect').addEventListener('change', changeLanguage);
    document.getElementById('countrySelect').addEventListener('change', changeCountry);
    document.addEventListener('click', handleOutsideClick);
    document.getElementById('sortTrend').addEventListener('click', () => sortTrends('trend'));
    document.getElementById('sortVolume').addEventListener('click', () => sortTrends('volume'));
    document.getElementById('sortStart').addEventListener('click', () => sortTrends('start'));
    document.getElementById('filterInput').addEventListener('input', updateCurrentKeyword);

    // Event listeners pour la recherche de tendances
    setupTrendSearch();
}
// ==========================================
// Fonctions de Navigation et Menu
// ==========================================
function handleOutsideClick(event) {
    const settingsDropdown = document.getElementById('settingsDropdown');
    const settingsIcon = document.getElementById('settingsIcon');
    
    if (!settingsIcon.contains(event.target) && !settingsDropdown.contains(event.target)) {
        settingsDropdown.style.display = 'none';
    }
}

function switchMainMenu(menu, saveState = true) {
    document.querySelectorAll('.main-menu-item').forEach(item => item.classList.remove('active'));
    document.getElementById(`${menu}MenuItem`).classList.add('active');

    document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
    document.getElementById(`${menu}Section`).classList.add('active');

    document.getElementById('goToTrendsContainer').style.display = menu === 'filter' ? 'block' : 'none';
    document.getElementById('filterSubMenu').style.display = menu === 'filter' ? 'flex' : 'none';

    if (menu === 'trends') {
        fetchTrends().catch(error => {
            console.error('Error while retrieving trends:', error);
        });
    }

    document.getElementById('fullInfoLink').style.display = 'none';

    if (saveState) {
        chrome.storage.local.set({ 'activeMainMenu': menu });
    }
}

function switchFilterSubMenu(subMenu, saveState = true) {
    document.querySelectorAll('.sub-menu-item').forEach(item => item.classList.remove('active'));
    document.getElementById(`${subMenu}Button`).classList.add('active');

    const newsSection = document.getElementById('newsSection');
    const historyFavorites = document.getElementById('historyFavorites');
    const resultContainer = document.getElementById('resultContainer');

    if (subMenu === 'news') {
        generateNewsSummary();
        newsSection.style.display = 'block';
        historyFavorites.style.display = 'none';
        resultContainer.style.display = 'none';
    } else {
        newsSection.style.display = 'none';
        historyFavorites.style.display = 'block';
        resultContainer.style.display = 'block';
        displayHistoryAndFavorites(subMenu);
    }

    if (saveState) {
        chrome.storage.local.set({ 'activeSubMenu': subMenu });
    }
}

// ==========================================
// Fonctions de Filtrage
// ==========================================
function applyFilter() {
    if (isFiltering) return;
    isFiltering = true;
    
    currentKeyword = document.getElementById('filterInput').value;
    
    if (currentKeyword) {
        addToHistory(currentKeyword);
        generateNewsSummary();
    }

    const resultContainer = document.getElementById('resultContainer');
    const resultText = document.getElementById('resultText');
    resultText.innerHTML = '<i class="material-icons" style="color: #4285f4;">hourglass_empty</i> Loading items...';
    resultContainer.classList.add('show');

    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (!tabs[0]) {
            console.error("No active tab found");
            resultText.innerHTML = '<i class="material-icons" style="color: red;">error</i> Error: No active tab found.';
            isFiltering = false;
            return;
        }

        chrome.tabs.sendMessage(tabs[0].id, {
            action: "filter",
            keyword: currentKeyword,
            theme: currentTheme
        }, function(response) {
            isFiltering = false;
            if (chrome.runtime.lastError) {
                console.error("Communication error:", chrome.runtime.lastError);
                resultText.innerHTML = '<i class="material-icons" style="color: red;">error</i> Communication error with the page. Please reload the page and try again.';
            } else if (response && response.success) {
                resultText.innerHTML = `<i class="material-icons" style="color: green;">check_circle</i> Filter applied. ${response.count} result(s) found out of ${response.totalExplored} items explored.`;
            } else {
                resultText.innerHTML = '<i class="material-icons" style="color: red;">error</i> Unknown error while applying filter.';
            }
        });
    });
}

function clearFilter() {
    isFiltering = false;
    document.getElementById('filterInput').value = '';
    document.getElementById('resultContainer').classList.remove('show');
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {action: "clearFilter"});
    });
    updateFavoriteIcon();
}
// ==========================================
// Fonctions de Favoris et Historique
// ==========================================
function toggleFavorite() {
    const keyword = document.getElementById('filterInput').value;
    if (keyword.trim() === '') {
        alert('Please enter a keyword before adding to favorites.');
        return;
    }
    chrome.storage.sync.get({favorites: []}, function(data) {
        let favorites = data.favorites;
        const index = favorites.findIndex(fav => fav === keyword);
        if (index === -1) {
            favorites.push(keyword);
            document.getElementById('favoriteIcon').textContent = 'star';
        } else {
            favorites.splice(index, 1);
            document.getElementById('favoriteIcon').textContent = 'star_border';
        }
        chrome.storage.sync.set({favorites: favorites}, function() {
            console.log('Favorites updated');
            displayHistoryAndFavorites();
        });
    });
}

function displayHistoryAndFavorites(view = 'all') {
    const container = document.getElementById('historyFavorites');
    container.innerHTML = '';

    chrome.storage.sync.get({favorites: []}, function(dataFav) {
        chrome.storage.local.get({searchHistory: []}, function(dataHist) {
            const favorites = dataFav.favorites;
            const history = dataHist.searchHistory;

            let itemsToDisplay = view === 'all' 
                ? [...favorites.map(f => ({keyword: f, isFavorite: true})), ...history.map(h => ({keyword: h, isFavorite: false}))]
                : favorites.map(f => ({keyword: f, isFavorite: true}));

            itemsToDisplay.forEach(item => {
                const itemElement = document.createElement('div');
                itemElement.className = 'item';
                itemElement.innerHTML = `
                    <span>${item.keyword}</span>
                    <i class="material-icons delete-icon">delete</i>
                `;
                itemElement.querySelector('.delete-icon').addEventListener('click', (e) => {
                    e.stopPropagation();
                    removeItem(item, view, e.target.closest('.item'));
                });
                itemElement.addEventListener('click', () => {
                    document.getElementById('filterInput').value = item.keyword;
                    applyFilter();
                });
                container.appendChild(itemElement);
            });
        });
    });
}

function removeItem(item, view, itemElement) {
    itemElement.classList.add('removing');
    
    setTimeout(() => {
        if (item.isFavorite) {
            chrome.storage.sync.get({favorites: []}, function(data) {
                let favorites = data.favorites.filter(fav => fav !== item.keyword);
                chrome.storage.sync.set({favorites: favorites}, function() {
                    displayHistoryAndFavorites(view);
                });
            });
        } else {
            chrome.storage.local.get({searchHistory: []}, function(data) {
                let history = data.searchHistory.filter(h => h !== item.keyword);
                chrome.storage.local.set({searchHistory: history}, function() {
                    displayHistoryAndFavorites(view);
                });
            });
        }
    }, 300);
}

function addToHistory(keyword) {
    chrome.storage.local.get({searchHistory: []}, function(data) {
        let history = data.searchHistory.filter(item => item !== keyword);
        history.unshift(keyword);
        history = history.slice(0, 10);
        chrome.storage.local.set({searchHistory: history}, function() {
            displayHistoryAndFavorites();
        });
    });
}

function updateFavoriteIcon() {
    const keyword = document.getElementById('filterInput').value;
    chrome.storage.sync.get({favorites: []}, function(data) {
        const favorites = data.favorites;
        document.getElementById('favoriteIcon').textContent = favorites.includes(keyword) ? 'star' : 'star_border';
    });
}

// ==========================================
// Fonctions de gestion des paramètres
// ==========================================
function toggleSettingsDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('settingsDropdown');
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
}

function changeLanguage() {
    currentLanguage = document.getElementById('languageSelect').value;
    chrome.storage.sync.set({language: currentLanguage}, function() {
        console.log('Language saved:', currentLanguage);
    });
    updateUILanguage();
    updateExistingTrendsTranslation();
    updateTrendUrls();
    updateFullInfoLink();
}

function changeCountry() {
    currentCountry = document.getElementById('countrySelect').value;
    chrome.storage.local.set({ 'selectedCountry': currentCountry });
    fetchTrends().catch(error => {
        console.error('Error retrieving trends:', error);
    });
}
// ==========================================
// Fonctions pour la section recherche de tendances
// ==========================================
function setupTrendSearch() {
    const searchInput = document.getElementById('trendSearchInput');
    const searchIcon = document.getElementById('trendSearchIcon');
    const timeRange = document.getElementById('trendTimeRange');
    const clearButton = document.getElementById('trendClearButton');
    const countrySelect = document.getElementById('searchCountrySelect');

    searchIcon.addEventListener('click', performTrendSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performTrendSearch();
    });
    
    timeRange.addEventListener('change', () => {
        if (searchInput.value.trim()) {
            performTrendSearch();
            updateFullInfoLink();
        }
    });

    countrySelect.addEventListener('change', (e) => {
        changeSearchCountry(e);
        if (searchInput.value.trim()) {
            updateFullInfoLink();
        }
    });

    searchInput.addEventListener('input', () => {
        if (!searchInput.value.trim()) {
            document.getElementById('fullInfoLink').style.display = 'none';
        }
    });

    clearButton.addEventListener('click', () => {
        searchInput.value = '';
        clearTrendIframes();
        document.getElementById('fullInfoLink').style.display = 'none';
    });
}

function updateFullInfoLink() {
    const keyword = document.getElementById('trendSearchInput').value.trim();
    const timeRange = document.getElementById('trendTimeRange').value;
    const geo = document.getElementById('searchCountrySelect').value;
    
    const link = document.getElementById('fullInfoLink');
    if (keyword) {
        const url = `https://trends.google.com/trends/explore?date=${encodeURIComponent(timeRange)}&geo=${geo}&q=${encodeURIComponent(keyword)}&hl=${currentLanguage}`;
        link.href = url;
        link.style.display = 'inline-block';
    } else {
        link.href = '#';
        link.style.display = 'none';
    }
}

function changeSearchCountry(event) {
    searchCountry = event.target.value;
    chrome.storage.local.set({ 'searchSelectedCountry': searchCountry });
    if (document.getElementById('trendSearchInput').value) {
        performTrendSearch();
    }
}

function clearTrendIframes() {
    ['timeseriesFrame', 'geoFrame', 'topicsFrame', 'queriesFrame'].forEach(frameId => {
        document.getElementById(frameId).src = '';
    });
    document.getElementById('fullInfoLink').style.display = 'none';
}

function performTrendSearch() {
    const keyword = document.getElementById('trendSearchInput').value.trim();
    if (!keyword) return;

    const time = document.getElementById('trendTimeRange').value;
    updateTrendFrames(keyword, time);
    updateFullInfoLink();
}

function updateTrendFrames(keyword, time) {
    const req = {comparisonItem: [{
            keyword: keyword,
            geo: searchCountry,
            time: time
        }],
        category: 0,
        property: ""
    };

    const reqString = encodeURIComponent(JSON.stringify(req));
    const baseParams = `req=${reqString}&tz=-60&hl=${currentLanguage}`;

    const frames = {
        timeseries: {
            id: 'timeseriesFrame',
            type: 'TIMESERIES'
        },
        geo: {
            id: 'geoFrame',
            type: 'GEO_MAP'
        },
        topics: {
            id: 'topicsFrame',
            type: 'RELATED_TOPICS'
        },
        queries: {
            id: 'queriesFrame',
            type: 'RELATED_QUERIES'
        }
    };

    Object.values(frames).forEach(frame => {
        const url = `https://trends.google.com/trends/embed/explore/${frame.type}?${baseParams}`;
        document.getElementById(frame.id).src = url;
    });
}
// ==========================================
// Fonctions pour les tendances
// ==========================================
function formatSearchVolume(traffic) {
    const number = parseInt(traffic.replace(/[^0-9]/g, ''));
    if (number >= 1000000) {
        return (number / 1000000).toFixed(1).replace('.0', '') + 'M+';
    } else if (number >= 1000) {
        return (number / 1000).toFixed(1).replace('.0', '') + 'K+';
    }
    return traffic;
}

function displayEmergingTrends(text) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, "text/xml");
    
    const items = xmlDoc.getElementsByTagName('item');
    const trendsData = [];

    const translations = getTranslations();

    for (let i = 0; i < items.length; i++) {
        const title = items[i].getElementsByTagName('title')[0].textContent;
        const traffic = items[i].getElementsByTagName('ht:approx_traffic')[0].textContent;
        const formattedTraffic = formatSearchVolume(traffic);
        const pubDate = new Date(items[i].getElementsByTagName('pubDate')[0].textContent);
        
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
                    <a href="${trendUrl}" target="_blank" style="text-decoration: none; color: inherit;">${trend.title}</a>
                </td>
                <td class="trend-volume">${trend.traffic} ${translations[currentLanguage]['searches']}</td>
                <td class="trend-start">${trend.formattedDate}</td>
                <td><i class="material-icons search-trend" data-keyword="${trend.title}">search</i></td>
            </tr>
        `;
    });

    document.getElementById('trendsTableBody').innerHTML = trendsHTML;

    document.querySelectorAll('.search-trend').forEach(button => {
        button.addEventListener('click', function() {
            const keyword = this.getAttribute('data-keyword');
            chrome.tabs.create({ url: `https://www.google.com/search?q=${encodeURIComponent(keyword)}` });
        });
    });

    updateSortIndicators();
}

async function fetchTrends() {
    const trendsList = document.getElementById('trendsTableBody');
    trendsList.innerHTML = '<tr><td colspan="4">Loading trends...</td></tr>';

    try {
        const url = `https://trends.google.com/trending/rss?geo=${currentCountry}`;
        const response = await fetch(url);
        const text = await response.text();
        displayEmergingTrends(text);
    } catch (error) {
        console.error('Error retrieving trends:', error);
        trendsList.innerHTML = '<tr><td colspan="4">Unable to fetch trends. Please try again later.</td></tr>';
    }
}

function updateTrendUrls() {
    document.querySelectorAll('.trend-title a').forEach(link => {
        const keyword = link.textContent;
        link.href = constructTrendExploreUrl(keyword);
    });
}

function constructTrendExploreUrl(keyword) {
    const baseUrl = 'https://trends.google.com/trends/explore';
    const params = new URLSearchParams({
        q: keyword,
        date: 'now 1-d',
        geo: currentCountry,
        hl: currentLanguage
    });
    return `${baseUrl}?${params.toString()}`;
}
// ==========================================
// Fonctions pour les news
// ==========================================
function updateCurrentKeyword() {
    currentKeyword = document.getElementById('filterInput').value;
    if (document.getElementById('newsButton').classList.contains('active')) {
        generateNewsSummary();
    }
}

function generateNewsSummary() {
    const summaryElement = document.getElementById('newsSummary');
    summaryElement.innerHTML = 'Loading news...';

    if (!currentKeyword) {
        summaryElement.innerHTML = 'Please enter a keyword to see associated news.';
        return;
    }

    const cacheKey = `${currentKeyword}_${currentLanguage}`;
    const cachedData = newsCache[cacheKey];

    if (cachedData && (Date.now() - cachedData.timestamp < 5 * 60 * 1000)) {
        displayNewsSummary(cachedData.articles);
    } else {
        fetchNewsSummary();
    }
}

async function fetchNewsSummary() {
    try {
        const articles = await fetchFromGNews();
        const cacheKey = `${currentKeyword}_${currentLanguage}`;
        newsCache[cacheKey] = {
            articles: articles,
            timestamp: Date.now()
        };
        displayNewsSummary(articles);
    } catch (error) {
        console.error('GNews Error:', error);
        displayErrorMessage("Unable to fetch news. Please try again later.");
    }
}

async function fetchFromGNews() {
    const today = new Date();
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fromDate = sevenDaysAgo.toISOString().split('T')[0];

    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(currentKeyword)}&lang=${currentLanguage}&country=any&from=${fromDate}&to=${today.toISOString().split('T')[0]}&max=10&apikey=${GNEWS_API_KEY}`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`GNews API error: ${response.status}`);
    }
    const data = await response.json();
    if (!data.articles || data.articles.length === 0) {
        throw new Error('No articles found from GNews');
    }
    return data.articles.slice(0, 5);
}

function displayNewsSummary(articles) {
    const summaryElement = document.getElementById('newsSummary');
    const translations = getTranslations();

    let summaryHTML = `<h4>${translations[currentLanguage]['newsFor']} "${currentKeyword}":</h4>`;
    articles.forEach(article => {
        const publishedAt = new Date(article.publishedAt);
        const timeAgo = formatTimeAgo(publishedAt);
        summaryHTML += `
            <div class="news-item">
                <h5>${article.title}</h5>
                <p class="news-date">${timeAgo}</p>
                <p>${article.description}</p>
                <a href="${article.url}" target="_blank">${translations[currentLanguage]['readMore']}</a>
            </div>
        `;
    });
    summaryElement.innerHTML = summaryHTML;
}

function displayErrorMessage(message) {
    const summaryElement = document.getElementById('newsSummary');
    summaryElement.innerHTML = `<p class="error-message">${message}</p>`;
}
// ==========================================
// Fonctions de tri et format
// ==========================================
function updateSortIndicators() {
    document.querySelectorAll('.trends-table th').forEach(th => {
        th.classList.remove('sort-indicator', 'asc', 'desc');
    });
    const sortedHeader = document.getElementById(`sort${currentSortColumn.charAt(0).toUpperCase() + currentSortColumn.slice(1)}`);
    sortedHeader.classList.add('sort-indicator', currentSortOrder);
}

function sortTrends(column) {
    if (currentSortColumn === column) {
        currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = column;
        currentSortOrder = column === 'start' ? 'desc' : 'asc';
    }

    const trendsList = document.getElementById('trendsTableBody');
    const rows = Array.from(trendsList.querySelectorAll('tr'));

    rows.sort((a, b) => {
        let aValue, bValue;
        if (column === 'trend') {
            aValue = a.querySelector('.trend-title').textContent;
            bValue = b.querySelector('.trend-title').textContent;
        } else if (column === 'volume') {
            aValue = parseFloat(a.querySelector('.trend-volume').textContent.replace(/[^0-9.KM+]/g, '').replace('K', '000').replace('M', '000000'));
            bValue = parseFloat(b.querySelector('.trend-volume').textContent.replace(/[^0-9.KM+]/g, '').replace('K', '000').replace('M', '000000'));
        } else if (column === 'start') {
            aValue = getMinutesFromTimeAgo(a.querySelector('.trend-start').textContent);
            bValue = getMinutesFromTimeAgo(b.querySelector('.trend-start').textContent);
        }

        if (aValue < bValue) return currentSortOrder === 'asc' ? -1 : 1;
        if (aValue > bValue) return currentSortOrder === 'asc' ? 1 : -1;
        return 0;
    });

    trendsList.innerHTML = '';
    rows.forEach(row => trendsList.appendChild(row));

    updateSortIndicators();
}

function getMinutesFromTimeAgo(timeAgo) {
    const number = parseInt(timeAgo.match(/\d+/)[0]);
    if (timeAgo.includes('minute')) {
        return number;
    } else if (timeAgo.includes('hour')) {
        return number * 60;
    } else if (timeAgo.includes('day')) {
        return number * 24 * 60;
    }
    return 0;
}

function formatTimeAgo(date) {
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffMinutes = Math.ceil(diffTime / (1000 * 60));
    const translations = getTranslations()[currentLanguage]['timeAgo'];

    if (diffMinutes < 60) {
        return translations[diffMinutes === 1 ? 'minute' : 'minutes'].replace('{n}', diffMinutes);
    } else if (diffMinutes < 1440) {
        const diffHours = Math.floor(diffMinutes / 60);
        return translations[diffHours === 1 ? 'hour' : 'hours'].replace('{n}', diffHours);
    } else {
        const diffDays = Math.floor(diffMinutes / 1440);
        return translations[diffDays === 1 ? 'day' : 'days'].replace('{n}', diffDays);
    }
}

function formatDate(date, timeAgoTranslations) {
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffMinutes = Math.ceil(diffTime / (1000 * 60));

    if (diffMinutes < 60) {
        return timeAgoTranslations[diffMinutes === 1 ? 'minute' : 'minutes'].replace('{n}', diffMinutes);
    } else if (diffMinutes < 1440) {
        const diffHours = Math.floor(diffMinutes / 60);
        return timeAgoTranslations[diffHours === 1 ? 'hour' : 'hours'].replace('{n}', diffHours);
    } else {
        const diffDays = Math.floor(diffMinutes / 1440);
        return timeAgoTranslations[diffDays === 1 ? 'day' : 'days'].replace('{n}', diffDays);
    }
}
// ==========================================
// Traductions
// ==========================================
function getTranslations() {
    return {
        'fr': {
            'languageLabel': 'Langue',
            'filterInput': 'Entrez un mot clé',
            'allButton': 'Tous',
            'favoritesButton': 'Favoris',
            'newsButton': 'Actualités',
            'trendsMenuItem': 'Tendances',
            'filterMenuItem': 'Filtre',
            'searchMenuItem': 'Recherche',
            'goToTrends': 'Aller sur Trends',
            'emergingTrends': 'Tendances émergentes',
            'newsTitle': 'Actualités',
            'loadingNews': 'Chargement des actualités...',
            'enterKeyword': 'Veuillez entrer un mot-clé pour voir les actualités associées.',
            'errorFetchingNews': 'Impossible de récupérer les actualités. Veuillez réessayer ultérieurement.',
            'newsFor': 'Actualités pour',
            'readMore': 'Lire plus',
            'loadingTrends': 'Chargement des tendances...',
            'errorFetchingTrends': 'Impossible de récupérer les tendances. Veuillez réessayer ultérieurement.',
            'searches': 'recherches',
            'countries': {
                'US': 'États-Unis',
                'GB': 'Royaume-Uni',
                'DE': 'Allemagne',
                'FR': 'France',
                'JP': 'Japon',
                'separator': '──────────',
                'AF': 'Afghanistan',
                'ZA': 'Afrique du Sud',
                'AL': 'Albanie',
                'DZ': 'Algérie',
                'AD': 'Andorre',
                'AO': 'Angola',
                'AG': 'Antigua-et-Barbuda',
                'SA': 'Arabie saoudite',
                'AR': 'Argentine',
                'AM': 'Arménie',
                'AU': 'Australie',
                'AT': 'Autriche',
                'AZ': 'Azerbaïdjan',
                'BS': 'Bahamas',
                'BH': 'Bahreïn',
                'BD': 'Bangladesh',
                'BE': 'Belgique',
                'BZ': 'Belize',
                'BJ': 'Bénin',
                'BT': 'Bhoutan',
                'BY': 'Biélorussie',
                'BO': 'Bolivie',
                'BW': 'Botswana',
                'BR': 'Brésil',
                'BN': 'Brunei',
                'BF': 'Burkina Faso',
                'BI': 'Burundi',
                'KH': 'Cambodge',
                'CA': 'Canada',
                'CV': 'Cap-Vert',
                'CL': 'Chili',
                'CN': 'Chine',
                'CO': 'Colombie',
                'CR': 'Costa Rica',
                'HR': 'Croatie',
                'CU': 'Cuba',
                'CD': 'République démocratique du Congo',
                'CG': 'République du Congo',
                'CF': 'République centrafricaine',
                'DK': 'Danemark',
                'DJ': 'Djibouti',
                'DM': 'Dominique',
                'EG': 'Égypte',
                'EC': 'Équateur',
                'ET': 'Éthiopie',
                'ES': 'Espagne',
                'EE': 'Estonie',
                'FJ': 'Fidji',
                'FI': 'Finlande',
                'GA': 'Gabon',
                'GE': 'Géorgie',
                'GH': 'Ghana',
                'GI': 'Gibraltar',
                'GL': 'Groenland',
                'GT': 'Guatemala',
                'GY': 'Guyane',
                'HT': 'Haïti',
                'HN': 'Honduras',
                'HU': 'Hongrie',
                'HK': 'Hong Kong',
                'IM': 'Île de Man',
                'CK': 'Îles Cook',
                'PN': 'Îles Pitcairn',
                'SB': 'Îles Salomon',
                'VI': 'Îles Vierges américaines',
                'VG': 'Îles Vierges britanniques',
                'IN': 'Inde',
                'ID': 'Indonésie',
                'IQ': 'Irak',
                'IE': 'Irlande',
                'IS': 'Islande',
                'IL': 'Israël',
                'IT': 'Italie',
                'JM': 'Jamaïque',
                'JO': 'Jordanie',
                'KE': 'Kenya',
                'KG': 'Kirghizistan',
                'KI': 'Kiribati',
                'KW': 'Koweït',
                'KZ': 'Kazakhstan',
                'LA': 'Laos',
                'LS': 'Lesotho',
                'LV': 'Lettonie',
                'LT': 'Lituanie',
                'LU': 'Luxembourg',
                'LB': 'Liban',
                'LY': 'Libye',
                'MG': 'Madagascar',
                'MK': 'Macédoine du Nord',
                'MY': 'Malaisie',
                'MW': 'Malawi',
                'MT': 'Malte',
                'MV': 'Maldives',
                'ML': 'Mali',
                'MX': 'Mexique',
                'MD': 'Moldavie',
                'MN': 'Mongolie',
                'ME': 'Monténégro',
                'MS': 'Montserrat',
                'MM': 'Myanmar',
                'NA': 'Namibie',
                'NI': 'Nicaragua',
                'NE': 'Niger',
                'NG': 'Nigeria',
                'NO': 'Norvège',
                'NZ': 'Nouvelle-Zélande',
                'OM': 'Oman',
                'UG': 'Ouganda',
                'UZ': 'Ouzbékistan',
                'PK': 'Pakistan',
                'PA': 'Panama',
                'PY': 'Paraguay',
                'PE': 'Pérou',
                'PH': 'Philippines',
                'PL': 'Pologne',
                'PR': 'Porto Rico',
                'PT': 'Portugal',
                'QA': 'Qatar',
                'CZ': 'République tchèque',
                'RO': 'Roumanie',
                'RU': 'Russie',
                'RW': 'Rwanda',
                'SM': 'Saint-Marin',
                'VC': 'Saint-Vincent-et-les-Grenadines',
                'WS': 'Samoa',
                'AS': 'Samoa américaines',
                'ST': 'Sao Tomé-et-Principe',
                'SN': 'Sénégal',
                'SC': 'Seychelles',
                'SL': 'Sierra Leone',
                'SG': 'Singapour',
                'SK': 'Slovaquie',
                'SI': 'Slovénie',
                'SO': 'Somalie',
                'SR': 'Suriname',
                'SE': 'Suède',
                'CH': 'Suisse',
                'TJ': 'Tadjikistan',
                'TZ': 'Tanzanie',
                'TD': 'Tchad',
                'TG': 'Togo',
                'TL': 'Timor oriental',
                'TO': 'Tonga',
                'TT': 'Trinité-et-Tobago',
                'TM': 'Turkménistan',
                'TR': 'Turquie',
                'UA': 'Ukraine',
                'UY': 'Uruguay',
                'VU': 'Vanuatu',
                'VE': 'Venezuela',
                'VN': 'Vietnam',
                'ZM': 'Zambie',
                'ZW': 'Zimbabwe',
                'CAT': 'Catalogne'
            },
            'trendColumn': 'Tendances',
            'volumeColumn': 'Volume de recherche',
            'startColumn': 'Démarrée',
            'timeAgo': {
                'minute': 'Il y a {n} minute',
                'minutes': 'Il y a {n} minutes',
                'hour': 'Il y a {n} heure',
                'hours': 'Il y a {n} heures',
                'day': 'Il y a {n} jour',
                'days': 'Il y a {n} jours'
            },
            'searchPlaceholder': 'Entrez un mot-clé',
            'timeRangeLabel': 'Période',
            'lastHour': 'Dernière heure',
            'last4Hours': '4 dernières heures',
            'lastDay': 'Dernier jour',
            'last7Days': '7 derniers jours',
            'last30Days': '30 derniers jours',
            'last90Days': '90 derniers jours',
            'last12Months': '12 derniers mois',
            'last5Years': '5 dernières années',
            'since2004': 'Depuis 2004',
            'timeEvolution': 'Évolution dans le temps',
            'geoDistribution': 'Répartition géographique',
            'relatedTopics': 'Sujets associés',
            'relatedQueries': 'Requêtes associées',
            'searchCountrySelect': 'Pays',
            'fullInfoButton': 'Toutes les informations'
        },
        'en': {
            'languageLabel': 'Language',
            'filterInput': 'Enter a keyword',
            'allButton': 'All',
            'favoritesButton': 'Favorites',
            'newsButton': 'News',
            'trendsMenuItem': 'Trends',
            'filterMenuItem': 'Filter',
            'searchMenuItem': 'Search',
            'goToTrends': 'Go to Trends',
            'emergingTrends': 'Emerging Trends',
            'newsTitle': 'News',
            'loadingNews': 'Loading news...',
            'enterKeyword': 'Please enter a keyword to see associated news.',
            'errorFetchingNews': 'Unable to fetch news. Please try again later.',
            'newsFor': 'News for',
            'readMore': 'Read more',
            'loadingTrends': 'Loading trends...',
            'errorFetchingTrends': 'Unable to fetch trends. Please try again later.',
            'searches': 'searches',
            'countries': {
                'US': 'United States',
                'GB': 'United Kingdom',
                'DE': 'Germany',
                'FR': 'France',
                'JP': 'Japan',
                'separator': '──────────',
                'AF': 'Afghanistan',
                'ZA': 'South Africa',
                'AL': 'Albania',
                'DZ': 'Algeria',
                'AD': 'Andorra',
                'AO': 'Angola',
                'AG': 'Antigua and Barbuda',
                'SA': 'Saudi Arabia',
                'AR': 'Argentina',
                'AM': 'Armenia',
                'AU': 'Australia',
                'AT': 'Austria',
                'AZ': 'Azerbaijan',
                'BS': 'Bahamas',
                'BH': 'Bahrain',
                'BD': 'Bangladesh',
                'BE': 'Belgium',
                'BZ': 'Belize',
                'BJ': 'Benin',
                'BT': 'Bhutan',
                'BY': 'Belarus',
                'BO': 'Bolivia',
                'BW': 'Botswana',
                'BR': 'Brazil',
                'BN': 'Brunei',
                'BF': 'Burkina Faso',
                'BI': 'Burundi',
                'KH': 'Cambodia',
                'CA': 'Canada',
                'CV': 'Cape Verde',
                'CL': 'Chile',
                'CN': 'China',
                'CO': 'Colombia',
                'CR': 'Costa Rica',
                'HR': 'Croatia',
                'CU': 'Cuba',
                'CD': 'DR Congo',
                'CG': 'Congo',
                'CF': 'Central African Republic',
                'DK': 'Denmark',
                'DJ': 'Djibouti',
                'DM': 'Dominica',
                'EG': 'Egypt',
                'EC': 'Ecuador',
                'ET': 'Ethiopia',
                'ES': 'Spain',
                'EE': 'Estonia',
                'FJ': 'Fiji',
                'FI': 'Finland',
                'GA': 'Gabon',
                'GE': 'Georgia',
                'GH': 'Ghana',
                'GI': 'Gibraltar',
                'GL': 'Greenland',
                'GT': 'Guatemala',
                'GY': 'Guyana',
                'HT': 'Haiti',
                'HN': 'Honduras',
                'HU': 'Hungary',
                'HK': 'Hong Kong',
                'IM': 'Isle of Man',
                'CK': 'Cook Islands',
                'PN': 'Pitcairn Islands',
                'SB': 'Solomon Islands',
                'VI': 'U.S. Virgin Islands',
                'VG': 'British Virgin Islands',
                'IN': 'India',
                'ID': 'Indonesia',
                'IQ': 'Iraq',
                'IE': 'Ireland',
                'IS': 'Iceland',
                'IL': 'Israel',
                'IT': 'Italy',
                'JM': 'Jamaica',
                'JO': 'Jordan',
                'KE': 'Kenya',
                'KG': 'Kyrgyzstan',
                'KI': 'Kiribati',
                'KW': 'Kuwait',
                'KZ': 'Kazakhstan',
                'LA': 'Laos',
                'LS': 'Lesotho',
                'LV': 'Latvia',
                'LT': 'Lithuania',
                'LU': 'Luxembourg',
                'LB': 'Lebanon',
                'LY': 'Libya',
                'MG': 'Madagascar',
                'MK': 'North Macedonia',
                'MY': 'Malaysia',
                'MW': 'Malawi',
                'MT': 'Malta',
                'MV': 'Maldives',
                'ML': 'Mali',
                'MX': 'Mexico',
                'MD': 'Moldova',
                'MN': 'Mongolia',
                'ME': 'Montenegro',
                'MS': 'Montserrat',
                'MM': 'Myanmar',
                'NA': 'Namibia',
                'NI': 'Nicaragua',
                'NE': 'Niger',
                'NG': 'Nigeria',
                'NO': 'Norway',
                'NZ': 'New Zealand',
                'OM': 'Oman',
                'UG': 'Uganda',
                'UZ': 'Uzbekistan',
                'PK': 'Pakistan',
                'PA': 'Panama',
                'PY': 'Paraguay',
                'PE': 'Peru',
                'PH': 'Philippines',
                'PL': 'Poland',
                'PR': 'Puerto Rico',
                'PT': 'Portugal',
                'QA': 'Qatar',
                'CZ': 'Czech Republic',
                'RO': 'Romania',
                'RU': 'Russia',
                'RW': 'Rwanda',
                'SM': 'San Marino',
                'VC': 'Saint Vincent and the Grenadines',
                'WS': 'Samoa',
                'AS': 'American Samoa',
                'ST': 'São Tomé and Príncipe',
                'SN': 'Senegal',
                'SC': 'Seychelles',
                'SL': 'Sierra Leone',
                'SG': 'Singapore',
                'SK': 'Slovakia',
                'SI': 'Slovenia',
                'SO': 'Somalia',
                'SR': 'Suriname',
                'SE': 'Sweden',
                'CH': 'Switzerland',
                'TJ': 'Tajikistan',
                'TZ': 'Tanzania',
                'TD': 'Chad',
                'TG': 'Togo',
                'TL': 'East Timor',
                'TO': 'Tonga',
                'TT': 'Trinidad and Tobago',
                'TM': 'Turkmenistan',
                'TR': 'Turkey',
                'UA': 'Ukraine',
                'UY': 'Uruguay',
                'VU': 'Vanuatu',
                'VE': 'Venezuela',
                'VN': 'Vietnam',
                'ZM': 'Zambia',
                'ZW': 'Zimbabwe',
                'CAT': 'Catalonia'
            },
            'trendColumn': 'Trends',
            'volumeColumn': 'Search Volume',
            'startColumn': 'Started',
            'timeAgo': {
                'minute': '{n} minute ago',
                'minutes': '{n} minutes ago',
                'hour': '{n} hour ago',
                'hours': '{n} hours ago',
                'day': '{n} day ago',
                'days': '{n} days ago'
            },
            'searchPlaceholder': 'Enter a keyword',
            'timeRangeLabel': 'Time range',
            'lastHour': 'Past hour',
            'last4Hours': 'Past 4 hours',
            'lastDay': 'Past day',
            'last7Days': 'Past 7 days',
            'last30Days': 'Past 30 days',
            'last90Days': 'Past 90 days',
            'last12Months': 'Past 12 months',
            'last5Years': 'Past 5 years',
            'since2004': 'Since 2004',
            'timeEvolution': 'Time evolution',
            'geoDistribution': 'Geographic distribution',
            'relatedTopics': 'Related topics',
            'relatedQueries': 'Related queries',
            'searchCountrySelect': 'Country',
            'fullInfoButton': 'View all information'
        }
    };
}

function updateUILanguage() {
    const translations = getTranslations();
    const t = translations[currentLanguage];

    document.getElementById('languageLabel').textContent = t['languageLabel'];
    document.getElementById('filterInput').placeholder = t['filterInput'];
    document.getElementById('allButton').textContent = t['allButton'];
    document.getElementById('favoritesButton').textContent = t['favoritesButton'];
    document.getElementById('newsButton').textContent = t['newsButton'];
    document.getElementById('trendsMenuItem').textContent = t['trendsMenuItem'];
    document.getElementById('filterMenuItem').textContent = t['filterMenuItem'];
    document.getElementById('searchMenuItem').textContent = t['searchMenuItem'];
    document.getElementById('goToTrends').textContent = t['goToTrends'];
    document.querySelector('#trendsSection h3').textContent = t['emergingTrends'];

    document.getElementById('sortTrend').textContent = t['trendColumn'];
    document.getElementById('sortVolume').textContent = t['volumeColumn'];
    document.getElementById('sortStart').textContent = t['startColumn'];

    document.getElementById('trendSearchInput').placeholder = t['searchPlaceholder'];
    document.getElementById('trendTimeRange').title = t['timeRangeLabel'];
    document.getElementById('fullInfoLink').textContent = t['fullInfoButton'];

    document.querySelectorAll('.trends-title').forEach((title, index) => {
        switch(index) {
            case 0: title.textContent = t['timeEvolution']; break;
            case 1: title.textContent = t['geoDistribution']; break;
            case 2: title.textContent = t['relatedTopics']; break;
            case 3: title.textContent = t['relatedQueries']; break;
        }
    });

    const timeRangeSelect = document.getElementById('trendTimeRange');
    timeRangeSelect.options[0].text = t['lastHour'];
    timeRangeSelect.options[1].text = t['last4Hours'];
    timeRangeSelect.options[2].text = t['lastDay'];
    timeRangeSelect.options[3].text = t['last7Days'];
    timeRangeSelect.options[4].text = t['last30Days'];
    timeRangeSelect.options[5].text = t['last90Days'];
    timeRangeSelect.options[6].text = t['last12Months'];
    timeRangeSelect.options[7].text = t['last5Years'];
    timeRangeSelect.options[8].text = t['since2004'];

    updateCountrySelects(t);
}

function updateCountrySelects(translations) {
    [document.getElementById('countrySelect'), document.getElementById('searchCountrySelect')].forEach(select => {
        const currentValue = select.value;
        select.innerHTML = '';
        
        Object.entries(translations['countries']).forEach(([value, text]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = text;
            if (value === 'separator') {
                option.disabled = true;
            }
            select.appendChild(option);
        });
        
        select.value = currentValue;
    });
}

// ==========================================
// Event Listeners
// ==========================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "filterStats") {
        const resultText = document.getElementById('resultText');
        resultText.innerHTML = `<i class="material-icons" style="color: green;">check_circle</i> Filter applied. ${request.count} result(s) found out of ${request.totalExplored} items explored.`;
        document.getElementById('resultContainer').classList.add('show');
    }
});

document.getElementById('filterInput').addEventListener('input', updateFavoriteIcon);