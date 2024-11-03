let currentKeyword = '';
let currentTheme = '';
let isFiltering = false;
let currentLanguage = 'en'; 
let newsCache = {};
let lastKeyword = '';
let currentCountry = 'US';
let currentSortColumn = 'start';
let currentSortOrder = 'desc';

const GNEWS_API_KEY = 'API';

document.addEventListener('DOMContentLoaded', function() {
    initializeExtension();
    setupEventListeners();
    displayHistoryAndFavorites();
    updateFavoriteIcon();
    
    // Get the stored country and navigation state
    chrome.storage.local.get(['selectedCountry', 'activeMainMenu', 'activeSubMenu'], function(result) {
        if (result.selectedCountry) {
            currentCountry = result.selectedCountry;
            document.getElementById('countrySelect').value = currentCountry;
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
});

// Save navigation state when window is closed
window.addEventListener('unload', function() {
    const activeMainMenu = document.querySelector('.main-menu-item.active').id.replace('MenuItem', '');
    const activeSubMenu = document.querySelector('.sub-menu-item.active')?.id.replace('Button', '');
    
    chrome.storage.local.set({ 
        'selectedCountry': currentCountry,
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
}

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
}

function changeCountry() {
    currentCountry = document.getElementById('countrySelect').value;
    // Save the country selection to chrome.storage.local
    chrome.storage.local.set({ 'selectedCountry': currentCountry });
    fetchTrends().catch(error => {
        console.error('Error retrieving trends:', error);
    });
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

    // Initial sort by publication date (most recent first)
    trendsData.sort((a, b) => b.pubDate - a.pubDate);

    let trendsHTML = '';
    trendsData.forEach(trend => {
        const trendUrl = constructTrendExploreUrl(trend.title);
        trendsHTML += `
            <tr><td class="trend-title">
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

function displayErrorMessage(message) {
    const summaryElement = document.getElementById('newsSummary');
    summaryElement.innerHTML = `<p class="error-message">${message}</p>`;
}

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
            }
        },
        'en': {
            'languageLabel': 'Language',
            'filterInput': 'Enter a keyword',
            'allButton': 'All',
            'favoritesButton': 'Favorites',
            'newsButton': 'News',
            'trendsMenuItem': 'Trends',
            'filterMenuItem': 'Filter',
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
            }
        }
    };
}

function updateUILanguage() {
    const translations = getTranslations();
    document.getElementById('languageLabel').textContent = translations[currentLanguage]['languageLabel'];
    document.getElementById('filterInput').placeholder = translations[currentLanguage]['filterInput'];
    document.getElementById('allButton').textContent = translations[currentLanguage]['allButton'];
    document.getElementById('favoritesButton').textContent = translations[currentLanguage]['favoritesButton'];
    document.getElementById('newsButton').textContent = translations[currentLanguage]['newsButton'];
    document.getElementById('trendsMenuItem').textContent = translations[currentLanguage]['trendsMenuItem'];
    document.getElementById('filterMenuItem').textContent = translations[currentLanguage]['filterMenuItem'];
    document.getElementById('goToTrends').textContent = translations[currentLanguage]['goToTrends'];
    document.querySelector('#trendsSection h3').textContent = translations[currentLanguage]['emergingTrends'];

    document.getElementById('sortTrend').textContent = translations[currentLanguage]['trendColumn'];
    document.getElementById('sortVolume').textContent = translations[currentLanguage]['volumeColumn'];
    document.getElementById('sortStart').textContent = translations[currentLanguage]['startColumn'];

    const countrySelect = document.getElementById('countrySelect');
    countrySelect.innerHTML = '';
    Object.entries(translations[currentLanguage]['countries']).forEach(([value, text]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        if (value === 'separator') {
            option.disabled = true;
        }
        countrySelect.appendChild(option);
    });
    countrySelect.value = currentCountry;

    updateNewsSectionText();
    updateTrendsSectionText();
}

function updateNewsSectionText() {
    const translations = getTranslations();
    document.querySelector('#newsSection h3').textContent = translations[currentLanguage]['newsTitle'];
    
    const summaryElement = document.getElementById('newsSummary');
    if (summaryElement.textContent.includes('Loading news...') || 
        summaryElement.textContent.includes('Loading news...')) {
        summaryElement.textContent = translations[currentLanguage]['loadingNews'];
    } else if (summaryElement.textContent.includes('Please enter a keyword') || 
               summaryElement.textContent.includes('Please enter a keyword')) {
        summaryElement.textContent = translations[currentLanguage]['enterKeyword'];
    }

    document.querySelectorAll('.news-item a').forEach(link => {
        link.textContent = translations[currentLanguage]['readMore'];
    });
}

function updateTrendsSectionText() {
    const translations = getTranslations();
    const trendsList = document.getElementById('trendsTableBody');
    
    if (trendsList.textContent.includes('Loading trends...') || 
        trendsList.textContent.includes('Loading trends...')) {
        trendsList.innerHTML = `<tr><td colspan="4">${translations[currentLanguage]['loadingTrends']}</td></tr>`;
    } else if (trendsList.textContent.includes('Unable to fetch trends') || 
               trendsList.textContent.includes('Unable to fetch trends')) {
        trendsList.innerHTML = `<tr><td colspan="4">${translations[currentLanguage]['errorFetchingTrends']}</td></tr>`;
    } else {
        updateExistingTrendsTranslation();
    }
}

function updateExistingTrendsTranslation() {
    const translations = getTranslations();

    document.querySelectorAll('.trend-volume').forEach(element => {
        const [number, _] = element.textContent.split(' ');
        element.textContent = `${number} ${translations[currentLanguage]['searches']}`;
    });

    document.querySelectorAll('.trend-start').forEach(element => {
        const dateText = element.textContent;
        const number = parseInt(dateText.match(/\d+/)[0]);
        let unit;
        if (dateText.includes('minute')) {
            unit = number === 1 ? 'minute' : 'minutes';
        } else if (dateText.includes('hour')) {
            unit = number === 1 ? 'hour' : 'hours';
        } else if (dateText.includes('day')) {
            unit = number === 1 ? 'day' : 'days';
        }
        const now = new Date();
        const date = new Date(now - number * (unit.includes('minute') ? 60000 : unit.includes('hour') ? 3600000 : 86400000));
        element.textContent = formatDate(date, translations[currentLanguage]['timeAgo']);
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "filterStats") {
        const resultText = document.getElementById('resultText');
        resultText.innerHTML = `<i class="material-icons" style="color: green;">check_circle</i> Filter applied. ${request.count} result(s) found out of ${request.totalExplored} items explored.`;
        document.getElementById('resultContainer').classList.add('show');
    }
});

document.getElementById('filterInput').addEventListener('input', updateFavoriteIcon);