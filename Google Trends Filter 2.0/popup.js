let currentKeyword = '';
let currentTheme = '';
let isFiltering = false;
let currentLanguage = 'fr';
let newsCache = {};

document.addEventListener('DOMContentLoaded', function() {
    // Gestion des boutons de toggle
    document.getElementById('allButton').addEventListener('click', () => toggleView('all'));
    document.getElementById('favoritesButton').addEventListener('click', () => toggleView('favorites'));
    document.getElementById('newsButton').addEventListener('click', () => toggleView('news'));

    // Événements pour la recherche et le filtrage
    document.getElementById('searchIcon').addEventListener('click', applyFilter);
    document.getElementById('filterInput').addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
            applyFilter();
        }
    });

    // Gestion des favoris
    document.getElementById('favoriteIcon').addEventListener('click', toggleFavorite);

    // Bouton de nettoyage
    document.getElementById('clearButton').addEventListener('click', clearFilter);

    // Boutons d'exportation
    document.getElementById('exportDataButton').addEventListener('click', () => exportData('requetes'));
    document.getElementById('exportNgramsButton').addEventListener('click', () => exportData('ngrams'));

    // Gestion des paramètres de langue
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
    }, 300); // Ce délai doit correspondre à la durée de la transition CSS
}

function addToHistory(keyword) {
    chrome.storage.local.get({searchHistory: []}, function(data) {
        let history = data.searchHistory;
        history = history.filter(item => item !== keyword);
        history.unshift(keyword);
        history = history.slice(0, 10); // Garde seulement les 10 dernières recherches
        chrome.storage.local.set({searchHistory: history}, function() {
            displayHistoryAndFavorites();
        });
    });
}

function exportData(type) {
    const keyword = document.getElementById('filterInput').value;
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {
            action: "exportData", 
            exportType: type, 
            keyword: keyword
        }, function(response) {
            if (chrome.runtime.lastError) {
                console.error("Erreur lors de l'export:", chrome.runtime.lastError);
                alert("Erreur lors de l'export des données. Veuillez réessayer.");
            } else if (response && response.success) {
                console.log(`Données ${type} exportées avec succès`);
                alert(`Données ${type} exportées avec succès`);
            } else {
                console.error(`Erreur lors de l'export des données ${type}`);
                alert("Erreur lors de l'export des données. Veuillez réessayer.");
            }
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
            'newsButton': 'Actualités',
            'exportDataButton': 'Requêtes',
            'exportNgramsButton': 'N-Grams'
        },
        'en': {
            'languageLabel': 'Language',
            'filterInput': 'Enter a keyword',
            'allButton': 'All',
            'favoritesButton': 'Favorites',
            'newsButton': 'News',
            'exportDataButton': 'Queries',
            'exportNgramsButton': 'N-Grams'
        }
    };

    document.getElementById('languageLabel').textContent = translations[currentLanguage]['languageLabel'];
    document.getElementById('filterInput').placeholder = translations[currentLanguage]['filterInput'];
    document.getElementById('allButton').textContent = translations[currentLanguage]['allButton'];
    document.getElementById('favoritesButton').textContent = translations[currentLanguage]['favoritesButton'];
    document.getElementById('newsButton').textContent = translations[currentLanguage]['newsButton'];
    document.getElementById('exportDataButton').textContent = translations[currentLanguage]['exportDataButton'];
    document.getElementById('exportNgramsButton').textContent = translations[currentLanguage]['exportNgramsButton'];
}

// Listener pour les messages venant du content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "filterStats") {
        const resultText = document.getElementById('resultText');
        resultText.innerHTML = `<i class="material-icons" style="color: green;">check_circle</i> Filtrage appliqué. ${request.count} résultat(s) trouvé(s) sur ${request.totalExplored} éléments explorés.`;
        document.getElementById('resultContainer').classList.add('show');
    }
});

// Ajoutez ces écouteurs d'événements pour mettre à jour l'icône de favori
document.getElementById('filterInput').addEventListener('input', updateFavoriteIcon);

// Fonction améliorée pour résumer le texte
function summarizeText(text, sentenceCount = 3) {
    // Diviser le texte en phrases
    const sentences = text.match(/[^\.!\?]+[\.!\?]+/g);
    if (!sentences || sentences.length <= sentenceCount) {
        return text;
    }

    // Calculer la fréquence des mots
    const wordFrequency = {};
    const stopWords = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'et', 'ou', 'mais', 'donc', 'car', 'si', 'que', 'qui', 'quoi', 'dont', 'où']);
    
    sentences.forEach(sentence => {
        sentence.toLowerCase().split(/\s+/).forEach(word => {
            if (word.length > 3 && !stopWords.has(word)) {
                wordFrequency[word] = (wordFrequency[word] || 0) + 1;
            }
        });
    });

    // Calculer le score TF-IDF de chaque phrase
    const sentenceScores = sentences.map(sentence => {
        const words = sentence.toLowerCase().split(/\s+/).filter(word => !stopWords.has(word));
        const tfIdfScore = words.reduce((score, word) => {
            const tf = wordFrequency[word] / words.length;
            const idf = Math.log(sentences.length / (sentences.filter(s => s.toLowerCase().includes(word)).length || 1));
            return score + (tf * idf);
        }, 0);
        return tfIdfScore / words.length;
    });

    // Sélectionner les phrases avec les scores les plus élevés
    const topSentences = sentenceScores
        .map((score, index) => ({ score, index }))
        .sort((a, b) => b.score - a.score)
        .slice(0, sentenceCount)
        .sort((a, b) => a.index - b.index)
        .map(item => sentences[item.index]);

    return topSentences.join(' ');
}

function generateNewsSummary() {
    const summaryElement = document.getElementById('newsSummary');
    summaryElement.innerHTML = 'Chargement des actualités...';

    if (!currentKeyword) {
        summaryElement.innerHTML = 'Veuillez entrer un mot-clé pour voir les actualités associées.';
        return;
    }

    const cacheKey = `${currentKeyword}_${currentLanguage}`;
    const cachedData = newsCache[cacheKey];

    if (cachedData && (Date.now() - cachedData.timestamp < 5 * 60 * 1000)) { // Cache valide pendant 5 minutes
        displayNewsSummary(cachedData.articles);
    } else {
        fetchNewsSummary();
    }
}

function fetchNewsSummary() {
    const apiKey = 'API';
    const today = new Date();
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fromDate = sevenDaysAgo.toISOString().split('T')[0];

    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(currentKeyword)}&language=${currentLanguage}&from=${fromDate}&sortBy=publishedAt&apiKey=${apiKey}`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'ok') {
                const articles = data.articles.slice(0, 5);
                const cacheKey = `${currentKeyword}_${currentLanguage}`;
                newsCache[cacheKey] = {
                    articles: articles,
                    timestamp: Date.now()
                };
                displayNewsSummary(articles);
            } else {
                document.getElementById('newsSummary').innerHTML = 'Erreur lors de la récupération des actualités.';
            }
        })
        .catch(error => {
            console.error('Erreur:', error);
            document.getElementById('newsSummary').innerHTML = 'Erreur lors de la récupération des actualités.';
        });
}

function displayNewsSummary(articles) {
    const summaryElement = document.getElementById('newsSummary');
    let summaryHTML = `<h4>Actualités pour "${currentKeyword}":</h4>`;
    articles.forEach(article => {
        const summary = summarizeText(article.content || article.description, 2);
        const publishedAt = new Date(article.publishedAt);
        const now = new Date();
        const diffTime = Math.abs(now - publishedAt);
        const diffMinutes = Math.ceil(diffTime / (1000 * 60));
        let timeAgo;
        if (diffMinutes < 60) {
            timeAgo = `Il y a ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
        } else if (diffMinutes < 1440) { // moins de 24 heures
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
                <p>${summary}</p>
                <a href="${article.url}" target="_blank">Lire plus</a>
            </div>
        `;
    });
    summaryElement.innerHTML = summaryHTML;
}

// Fonction pour mettre à jour le mot-clé actuel et rafraîchir les actualités
function updateCurrentKeyword() {
    currentKeyword = document.getElementById('filterInput').value;
    if (document.getElementById('newsButton').classList.contains('active')) {
        generateNewsSummary();
    }
}

// Ajoutez cet écouteur d'événements pour mettre à jour les actualités lorsque le mot-clé change
document.getElementById('filterInput').addEventListener('input', updateCurrentKeyword);