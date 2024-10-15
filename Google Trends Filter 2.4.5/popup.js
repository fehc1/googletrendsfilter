let currentKeyword = '';
let currentTheme = '';
let isFiltering = false;
let currentLanguage = 'fr';
let newsCache = {};
let lastKeyword = '';
let currentCountry = 'FR';

const GNEWS_API_KEY = 'API';

document.addEventListener('DOMContentLoaded', function() {
    // Charger la langue sauvegardée
    chrome.storage.sync.get(['language'], function(result) {
        if (result.language) {
            currentLanguage = result.language;
            document.getElementById('languageSelect').value = currentLanguage;
        }
        updateUILanguage();
    });

    document.getElementById('goToTrends').addEventListener('click', function() {
        chrome.tabs.create({ url: 'https://trends.google.com/trending' });
    });

    document.getElementById('filterMenuItem').addEventListener('click', () => switchMainMenu('filter'));
    document.getElementById('trendsMenuItem').addEventListener('click', () => switchMainMenu('trends'));

    document.getElementById('allButton').addEventListener('click', () => switchFilterSubMenu('all'));
    document.getElementById('favoritesButton').addEventListener('click', () => switchFilterSubMenu('favorites'));
    document.getElementById('newsButton').addEventListener('click', () => switchFilterSubMenu('news'));

    document.getElementById('searchIcon').addEventListener('click', applyFilter);
    document.getElementById('filterInput').addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
            applyFilter();
        }
    });

    document.getElementById('favoriteIcon').addEventListener('click', toggleFavorite);
    document.getElementById('clearButton').addEventListener('click', clearFilter);
    document.getElementById('settingsIcon').addEventListener('click', toggleSettingsDropdown);
    document.getElementById('languageSelect').addEventListener('change', changeLanguage);
    document.getElementById('countrySelect').addEventListener('change', changeCountry);
    
    document.addEventListener('click', function(event) {
        const settingsDropdown = document.getElementById('settingsDropdown');
        const settingsIcon = document.getElementById('settingsIcon');
        
        if (!settingsIcon.contains(event.target) && !settingsDropdown.contains(event.target)) {
            settingsDropdown.style.display = 'none';
        }
    });
    
    displayHistoryAndFavorites();
    updateFavoriteIcon();
    fetchTrends().catch(error => {
        console.error('Erreur lors de la récupération des tendances:', error);
    });
});

function switchMainMenu(menu) {
    document.querySelectorAll('.main-menu-item').forEach(item => item.classList.remove('active'));
    document.getElementById(`${menu}MenuItem`).classList.add('active');

    document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
    document.getElementById(`${menu}Section`).classList.add('active');

    document.getElementById('goToTrendsContainer').style.display = menu === 'filter' ? 'block' : 'none';

    if (menu === 'filter') {
        document.getElementById('filterSubMenu').style.display = 'flex';
    } else {
        document.getElementById('filterSubMenu').style.display = 'none';
    }

    if (menu === 'trends') {
        fetchTrends().catch(error => {
            console.error('Erreur lors de la récupération des tendances:', error);
        });
    }
}

function switchFilterSubMenu(subMenu) {
    document.querySelectorAll('.sub-menu-item').forEach(item => item.classList.remove('active'));
    document.getElementById(`${subMenu}Button`).classList.add('active');

    if (subMenu === 'news') {
        generateNewsSummary();
        document.getElementById('newsSection').style.display = 'block';
        document.getElementById('historyFavorites').style.display = 'none';
        document.getElementById('resultContainer').style.display = 'none';
    } else {
        document.getElementById('newsSection').style.display = 'none';
        document.getElementById('historyFavorites').style.display = 'block';
        document.getElementById('resultContainer').style.display = 'block';
        displayHistoryAndFavorites(subMenu);
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
    resultText.innerHTML = '<i class="material-icons" style="color: #4285f4;">hourglass_empty</i> Chargement des éléments...';
    resultContainer.classList.add('show');

    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (!tabs[0]) {
            console.error("Aucun onglet actif trouvé");
            resultText.innerHTML = '<i class="material-icons" style="color: red;">error</i> Erreur : Aucun onglet actif trouvé.';
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
                console.error("Erreur de communication:", chrome.runtime.lastError);
                resultText.innerHTML = '<i class="material-icons" style="color: red;">error</i> Erreur de communication avec la page. Veuillez recharger la page et réessayer.';
            } else if (response && response.success) {
                resultText.innerHTML = `<i class="material-icons" style="color: green;">check_circle</i> Filtrage appliqué. ${response.count} résultat(s) trouvé(s) sur ${response.totalExplored} éléments explorés.`;
            } else {
                resultText.innerHTML = '<i class="material-icons" style="color: red;">error</i> Erreur inconnue lors de l\'application du filtre.';
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
        alert('Veuillez entrer un mot-clé avant d\'ajouter aux favoris.');
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
            console.log('Favoris mis à jour');
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

            let itemsToDisplay = [];
            if (view === 'all') {
                itemsToDisplay = [...favorites.map(f => ({keyword: f, isFavorite: true})), ...history.map(h => ({keyword: h, isFavorite: false}))];
            } else {
                itemsToDisplay = favorites.map(f => ({keyword: f, isFavorite: true}));
            }

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
                let favorites = data.favorites;
                favorites = favorites.filter(fav => fav !== item.keyword);
                chrome.storage.sync.set({favorites: favorites}, function() {
                    displayHistoryAndFavorites(view);
                });
            });
        } else {
            chrome.storage.local.get({searchHistory: []}, function(data) {
                let history = data.searchHistory;
                history = history.filter(h => h !== item.keyword);
                chrome.storage.local.set({searchHistory: history}, function() {
                    displayHistoryAndFavorites(view);
                });
            });
        }
    }, 300);
}

function addToHistory(keyword) {
    chrome.storage.local.get({searchHistory: []}, function(data) {
        let history = data.searchHistory;
        history = history.filter(item => item !== keyword);
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
        const isFavorite = favorites.includes(keyword);
        document.getElementById('favoriteIcon').textContent = isFavorite ? 'star' : 'star_border';
    });
}

function toggleSettingsDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('settingsDropdown');
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
}

function changeLanguage() {
    currentLanguage = document.getElementById('languageSelect').value;
    // Sauvegarder la langue choisie
    chrome.storage.sync.set({language: currentLanguage}, function() {
        console.log('Langue sauvegardée:', currentLanguage);
    });
    updateUILanguage();
}

function updateUILanguage() {
    const translations = {
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
                'JP': 'Japon'
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
                'JP': 'Japan'
            }
        }
    };

    document.getElementById('languageLabel').textContent = translations[currentLanguage]['languageLabel'];
    document.getElementById('filterInput').placeholder = translations[currentLanguage]['filterInput'];
    document.getElementById('allButton').textContent = translations[currentLanguage]['allButton'];
    document.getElementById('favoritesButton').textContent = translations[currentLanguage]['favoritesButton'];
    document.getElementById('newsButton').textContent = translations[currentLanguage]['newsButton'];
    document.getElementById('trendsMenuItem').textContent = translations[currentLanguage]['trendsMenuItem'];
    document.getElementById('filterMenuItem').textContent = translations[currentLanguage]['filterMenuItem'];
    document.getElementById('goToTrends').textContent = translations[currentLanguage]['goToTrends'];
    document.querySelector('#trendsSection h3').textContent = translations[currentLanguage]['emergingTrends'];

    const countrySelect = document.getElementById('countrySelect');
    countrySelect.innerHTML = '';
    Object.entries(translations[currentLanguage]['countries']).forEach(([value, text]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        countrySelect.appendChild(option);
    });
    countrySelect.value = currentCountry;

    updateNewsSectionText();
    updateTrendsSectionText();
}

function updateNewsSectionText() {
    const translations = {
        'fr': {
            'newsTitle': 'Actualités',
            'loadingNews': 'Chargement des actualités...',
            'enterKeyword': 'Veuillez entrer un mot-clé pour voir les actualités associées.',
            'errorFetchingNews': 'Impossible de récupérer les actualités. Veuillez réessayer ultérieurement.',
            'newsFor': 'Actualités pour',
            'readMore': 'Lire plus'
        },
        'en': {
            'newsTitle': 'News',
            'loadingNews': 'Loading news...',
            'enterKeyword': 'Please enter a keyword to see associated news.',
            'errorFetchingNews': 'Unable to fetch news. Please try again later.',
            'newsFor': 'News for',
            'readMore': 'Read more'
        }
    };

    document.querySelector('#newsSection h3').textContent = translations[currentLanguage]['newsTitle'];
    
    const summaryElement = document.getElementById('newsSummary');
    if (summaryElement.textContent.includes('Chargement des actualités...') || 
        summaryElement.textContent.includes('Loading news...')) {
        summaryElement.textContent = translations[currentLanguage]['loadingNews'];
    } else if (summaryElement.textContent.includes('Veuillez entrer un mot-clé') || 
               summaryElement.textContent.includes('Please enter a keyword')) {
        summaryElement.textContent = translations[currentLanguage]['enterKeyword'];
    }

    document.querySelectorAll('.news-item a').forEach(link => {
        link.textContent = translations[currentLanguage]['readMore'];
    });
}

function updateTrendsSectionText() {
    const translations = {
        'fr': {
            'loadingTrends': 'Chargement des tendances...',
            'errorFetchingTrends': 'Impossible de récupérer les tendances. Veuillez réessayer ultérieurement.',
            'searches': 'recherches'
        },
        'en': {
            'loadingTrends': 'Loading trends...',
            'errorFetchingTrends': 'Unable to fetch trends. Please try again later.',
            'searches': 'searches'
        }
    };

    const trendsList = document.getElementById('emergingTrendsList');
    if (trendsList.textContent.includes('Chargement des tendances...') || 
        trendsList.textContent.includes('Loading trends...')) {
        trendsList.textContent = translations[currentLanguage]['loadingTrends'];
    } else if (trendsList.textContent.includes('Impossible de récupérer les tendances') || 
               trendsList.textContent.includes('Unable to fetch trends')) {
        trendsList.textContent = translations[currentLanguage]['errorFetchingTrends'];
    }

    document.querySelectorAll('.trend-item .trend-traffic').forEach(trendTraffic => {
        trendTraffic.textContent = trendTraffic.textContent.replace('recherches', translations[currentLanguage]['searches'])
                                                          .replace('searches', translations[currentLanguage]['searches']);
    });
}

function changeCountry() {
    currentCountry = document.getElementById('countrySelect').value;
    fetchTrends().catch(error => {
        console.error('Erreur lors de la récupération des tendances:', error);
    });
}

async function fetchTrends() {
    const trendsList = document.getElementById('emergingTrendsList');
    trendsList.innerHTML = 'Chargement des tendances...';

    try {
        const url = `https://trends.google.com/trending/rss?geo=${currentCountry}`;
        const response = await fetch(url);
        const text = await response.text();
        displayEmergingTrends(text);
    } catch (error) {
        console.error('Erreur lors de la récupération des tendances:', error);
        trendsList.innerHTML = 'Impossible de récupérer les tendances. Veuillez réessayer ultérieurement.';
    }
}

function displayEmergingTrends(text) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, "text/xml");
    
    const items = xmlDoc.getElementsByTagName('item');
    let trendsHTML = '';

    const translations = {
        'fr': {
            'searches': 'recherches',
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
            'searches': 'searches',
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

    for (let i = 0; i < items.length; i++) {
        const title = items[i].getElementsByTagName('title')[0].textContent;
        const traffic = items[i].getElementsByTagName('ht:approx_traffic')[0].textContent;
        const pubDate = new Date(items[i].getElementsByTagName('pubDate')[0].textContent);
        
        trendsHTML += `
            <div class="trend-item">
                <div>
                    <h4>${title}</h4>
                    <p><span class="trend-traffic">${traffic} ${translations[currentLanguage]['searches']}</span></p>
                    <p class="trend-date">${formatDate(pubDate, translations[currentLanguage]['timeAgo'])}</p>
                </div>
                <i class="material-icons search-trend" data-keyword="${title}">search</i>
            </div>
        `;
    }

    document.getElementById('emergingTrendsList').innerHTML = trendsHTML;

    // Ajout des écouteurs d'événements pour les boutons de recherche
    document.querySelectorAll('.search-trend').forEach(button => {
        button.addEventListener('click', function() {
            const keyword = this.getAttribute('data-keyword');
            chrome.tabs.create({ url: `https://www.google.com/search?q=${encodeURIComponent(keyword)}` });
        });
    });
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

function updateCurrentKeyword() {
    currentKeyword = document.getElementById('filterInput').value;
    if (document.getElementById('newsButton').classList.contains('active')) {
        generateNewsSummary();
    }
}

document.getElementById('filterInput').addEventListener('input', updateCurrentKeyword);

function generateNewsSummary() {
    const summaryElement = document.getElementById('newsSummary');
    summaryElement.innerHTML = 'Chargement des actualités...';

    if (!currentKeyword) {
        summaryElement.innerHTML = 'Veuillez entrer un mot-clé pour voir les actualités associées.';
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
        console.error('Erreur GNews:', error);
        displayErrorMessage("Impossible de récupérer les actualités. Veuillez réessayer ultérieurement.");
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
    const translations = {
        'fr': {
            'newsFor': 'Actualités pour',
            'readMore': 'Lire plus'
        },
        'en': {
            'newsFor': 'News for',
            'readMore': 'Read more'
        }
    };

    let summaryHTML = `<h4>${translations[currentLanguage]['newsFor']} "${currentKeyword}":</h4>`;
    articles.forEach(article => {
        const publishedAt = new Date(article.publishedAt);
        const now = new Date();
        const diffTime = Math.abs(now - publishedAt);
        const diffMinutes = Math.ceil(diffTime / (1000 * 60));
        let timeAgo;
        if (currentLanguage === 'fr') {
            if (diffMinutes < 60) {
                timeAgo = `Il y a ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
            } else if (diffMinutes < 1440) {
                const diffHours = Math.floor(diffMinutes / 60);
                timeAgo = `Il y a ${diffHours} heure${diffHours > 1 ? 's' : ''}`;
            } else {
                const diffDays = Math.floor(diffMinutes / 1440);
                timeAgo = `Il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
            }
        } else {
            if (diffMinutes < 60) {
                timeAgo = `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
            } else if (diffMinutes < 1440) {
                const diffHours = Math.floor(diffMinutes / 60);
                timeAgo = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
            } else {
                const diffDays = Math.floor(diffMinutes / 1440);
                timeAgo = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
            }
        }
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "filterStats") {
        const resultText = document.getElementById('resultText');
        resultText.innerHTML = `<i class="material-icons" style="color: green;">check_circle</i> Filtrage appliqué. ${request.count} résultat(s) trouvé(s) sur ${request.totalExplored} éléments explorés.`;
        document.getElementById('resultContainer').classList.add('show');
    }
});

document.getElementById('filterInput').addEventListener('input', updateFavoriteIcon);