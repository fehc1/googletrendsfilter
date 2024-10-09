let currentKeyword = '';
let currentTheme = '';
let isFiltering = false;
let currentLanguage = 'fr';
let newsCache = {};
let lastKeyword = '';

const GNEWS_API_KEY = 'API';
const NEWSAPI_API_KEY = 'API';

function isGoogleTrendsUrl(url) {
    return url.includes("https://trends.google.");
}

document.addEventListener('DOMContentLoaded', function() {
    // Vérification de l'URL et affichage de la modal si nécessaire
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0] && !isGoogleTrendsUrl(tabs[0].url)) {
            document.getElementById('warningModal').style.display = "block";
            document.body.style.pointerEvents = "none";
            document.getElementById('warningModal').style.pointerEvents = "auto";
        }
    });

    // Gestion de la fermeture de la modal
    document.getElementById('closeModal').addEventListener('click', function() {
        document.getElementById('warningModal').style.display = "none";
        document.body.style.pointerEvents = "auto";
    });

    document.getElementById('allButton').addEventListener('click', () => toggleView('all'));
    document.getElementById('favoritesButton').addEventListener('click', () => toggleView('favorites'));
    document.getElementById('newsButton').addEventListener('click', () => toggleView('news'));

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

    displayHistoryAndFavorites();
    updateFavoriteIcon();
    updateUILanguage();
});

function toggleView(view) {
    document.getElementById('allButton').classList.toggle('active', view === 'all');
    document.getElementById('favoritesButton').classList.toggle('active', view === 'favorites');
    document.getElementById('newsButton').classList.toggle('active', view === 'news');
    
    document.getElementById('historyFavorites').style.display = view === 'all' || view === 'favorites' ? 'block' : 'none';
    document.getElementById('newsSection').style.display = view === 'news' ? 'block' : 'none';
    document.getElementById('resultContainer').style.display = view === 'all' ? 'block' : 'none';
    
    if (view === 'news') {
        generateNewsSummary();
    } else {
        displayHistoryAndFavorites(view);
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

function toggleSettingsDropdown() {
    const dropdown = document.getElementById('settingsDropdown');
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
}

function changeLanguage() {
    currentLanguage = document.getElementById('languageSelect').value;
    updateUILanguage();
}

function updateUILanguage() {
    const translations = {
        'fr': {
            'languageLabel': 'Langue',
            'filterInput': 'Entrez un mot clé',
            'allButton': 'Tous',
            'favoritesButton': 'Favoris',
            'newsButton': 'Actualités'
        },
        'en': {
            'languageLabel': 'Language',
            'filterInput': 'Enter a keyword',
            'allButton': 'All',
            'favoritesButton': 'Favorites',
            'newsButton': 'News'
        }
    };

    document.getElementById('languageLabel').textContent = translations[currentLanguage]['languageLabel'];
    document.getElementById('filterInput').placeholder = translations[currentLanguage]['filterInput'];
    document.getElementById('allButton').textContent = translations[currentLanguage]['allButton'];
    document.getElementById('favoritesButton').textContent = translations[currentLanguage]['favoritesButton'];
    document.getElementById('newsButton').textContent = translations[currentLanguage]['newsButton'];
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "filterStats") {
        const resultText = document.getElementById('resultText');
        resultText.innerHTML = `<i class="material-icons" style="color: green;">check_circle</i> Filtrage appliqué. ${request.count} résultat(s) trouvé(s) sur ${request.totalExplored} éléments explorés.`;
        document.getElementById('resultContainer').classList.add('show');
    }
});

document.getElementById('filterInput').addEventListener('input', updateFavoriteIcon);

function generateNewsSummary() {
    const summaryElement = document.getElementById('newsSummary');
    const newsSection = document.getElementById('newsSection');
    
    if (newsSection.style.display === 'none') {
        return;
    }

    summaryElement.innerHTML = 'Chargement des actualités...';

    if (!currentKeyword) {
        summaryElement.innerHTML = 'Veuillez entrer un mot-clé pour voir les actualités associées.';
        return;
    }

    if (currentKeyword !== lastKeyword) {
        newsCache = {};
        lastKeyword = currentKeyword;
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
        try {
            const articles = await fetchFromNewsAPI();
            const cacheKey = `${currentKeyword}_${currentLanguage}`;
            newsCache[cacheKey] = {
                articles: articles,
                timestamp: Date.now()
            };
            displayNewsSummary(articles);
        } catch (newsApiError) {
            console.error('Erreur NewsAPI:', newsApiError);
            displayErrorMessage("Impossible de récupérer les actualités. Veuillez réessayer ultérieurement.");
        }
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

async function fetchFromNewsAPI() {
    const today = new Date();
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fromDate = sevenDaysAgo.toISOString().split('T')[0];

    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(currentKeyword)}&language=${currentLanguage}&from=${fromDate}&to=${today.toISOString()}&sortBy=publishedAt&apiKey=${NEWSAPI_API_KEY}`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`NewsAPI error: ${response.status}`);
    }
    const data = await response.json();
    if (!data.articles || data.articles.length === 0) {
        throw new Error('No articles found from NewsAPI');
    }
    return data.articles.slice(0, 5).map(article => ({
        title: article.title,
        description: article.description,
        content: article.content,
        url: article.url,
        image: article.urlToImage,
        publishedAt: article.publishedAt,
        source: {
            name: article.source.name,
            url: ''  // NewsAPI doesn't provide source URL
        }
    }));
}

function displayNewsSummary(articles) {
    const summaryElement = document.getElementById('newsSummary');
    let summaryHTML = `<h4>Actualités pour "${currentKeyword}":</h4>`;
    articles.forEach(article => {
        const publishedAt = new Date(article.publishedAt);
        const now = new Date();
        const diffTime = Math.abs(now - publishedAt);
        const diffMinutes = Math.ceil(diffTime / (1000 * 60));
        let timeAgo;
        if (diffMinutes < 60) {
            timeAgo = `Il y a ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
        } else if (diffMinutes < 1440) {
            const diffHours = Math.floor(diffMinutes / 60);
            timeAgo = `Il y a ${diffHours} heure${diffHours > 1 ? 's' : ''}`;
        } else {
            const diffDays = Math.floor(diffMinutes / 1440);
            timeAgo = `Il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
        }
        summaryHTML += `
            <div class="news-item">
                <h5>${article.title}</h5>
                <p class="news-date">${timeAgo}</p>
                <p>${article.description}</p>
                <a href="${article.url}" target="_blank">Lire plus</a>
            </div>
        `;
    });
    summaryElement.innerHTML = summaryHTML;
}

function displayErrorMessage(message) {
    const summaryElement = document.getElementById('newsSummary');
    summaryElement.innerHTML = `<p class="error-message">${message}</p>`;
}

function updateCurrentKeyword() {
    currentKeyword = document.getElementById('filterInput').value;
    generateNewsSummary();
}

document.getElementById('filterInput').addEventListener('input', updateCurrentKeyword);