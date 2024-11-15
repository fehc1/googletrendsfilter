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

const GNEWS_API_KEY = 'API';

// ==========================================
// Event Listeners et Initialisation
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
    initializeExtension();
    setupEventListeners();
    displayHistoryAndFavorites();
    updateFavoriteIcon();
    
    // Get the stored settings
    chrome.storage.local.get([
        'selectedCountry', 
        'searchSelectedCountry',
        'activeMainMenu', 
        'activeSubMenu'
    ], function(result) {
        if (result.selectedCountry) {
            currentCountry = result.selectedCountry;
            document.getElementById('countrySelect').value = currentCountry;
        }

        if (result.searchSelectedCountry) {
            searchCountry = result.searchSelectedCountry;
            document.getElementById('searchCountrySelect').value = searchCountry;
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
    document.getElementById('goToTrends').addEventListener('click', () => chrome.tabs.create({ url: 'https://trends.google.com/trending' }));
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

function handleOutsideClick(event) {
    const settingsDropdown = document.getElementById('settingsDropdown');
    const settingsIcon = document.getElementById('settingsIcon');
    
    if (!settingsIcon.contains(event.target) && !settingsDropdown.contains(event.target)) {
        settingsDropdown.style.display = 'none';
    }
}

// ==========================================
// Fonctions de Navigation et Menu
// ==========================================
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

    // Masquer le bouton "View all information" lors du changement de menu
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

    // Masquer le lien quand l'input est vidé
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
                'FR': 'France',
                'US': 'États-Unis',
                'GB': 'Royaume-Uni',
                'DE': 'Allemagne',
                'JP': 'Japon',
                'separator': '──────────',
                'AR': 'Argentine',
                'BE': 'Belgique',
                'BR': 'Brésil',
                'IE': 'Irlande',
                'IN': 'Inde',
                'ID': 'Indonésie',
                'NG': 'Nigeria',
                'PK': 'Pakistan',
                'ZA': 'Afrique du Sud',
                'ES': 'Espagne',
                'TW': 'Taiwan',
                'TR': 'Turquie'
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
                'FR': 'France',
                'US': 'United States',
                'GB': 'United Kingdom',
                'DE': 'Germany',
                'JP': 'Japan',
                'separator': '──────────',
                'AR': 'Argentina',
                'BE': 'Belgium',
                'BR': 'Brazil',
                'IE': 'Ireland',
                'IN': 'India',
                'ID': 'Indonesia',
                'NG': 'Nigeria',
                'PK': 'Pakistan',
                'ZA': 'South Africa',
                'ES': 'Spain',
                'TW': 'Taiwan',
                'TR': 'Turkey'
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

    // Mises à jour existantes
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

    // Mises à jour pour la section recherche
    document.getElementById('trendSearchInput').placeholder = t['searchPlaceholder'];
    document.getElementById('trendTimeRange').title = t['timeRangeLabel'];
    document.getElementById('fullInfoLink').textContent = t['fullInfoButton'];

    // Mise à jour des titres des graphiques
    document.querySelectorAll('.trends-title').forEach((title, index) => {
        switch(index) {
            case 0: title.textContent = t['timeEvolution']; break;
            case 1: title.textContent = t['geoDistribution']; break;
            case 2: title.textContent = t['relatedTopics']; break;
            case 3: title.textContent = t['relatedQueries']; break;
        }
    });

    // Mise à jour des options du sélecteur de temps
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

    // Mise à jour des sélecteurs de pays
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
// Event Listeners pour les messages Chrome
// ==========================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "filterStats") {
        const resultText = document.getElementById('resultText');
        resultText.innerHTML = `<i class="material-icons" style="color: green;">check_circle</i> Filter applied. ${request.count} result(s) found out of ${request.totalExplored} items explored.`;
        document.getElementById('resultContainer').classList.add('show');
    }
});

document.getElementById('filterInput').addEventListener('input', updateFavoriteIcon);