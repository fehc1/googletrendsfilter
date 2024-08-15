let currentKeyword = '';

let isFiltering = false;

let isClearingFilter = false;



function applyFilter() {

  if (isFiltering) return;

  isFiltering = true;

  isClearingFilter = false;

  

  currentKeyword = document.getElementById('filterInput').value;

  const explorationDepth = document.getElementById('explorationDepth').value;

  addToHistory(currentKeyword);

  const resultsElement = document.getElementById('results');

  resultsElement.innerHTML = '<i class="material-icons" style="color: #4285f4;">hourglass_empty</i> Chargement des éléments... Cela peut prendre jusqu\'à une minute.';

  

  let dots = '';

  const loadingInterval = setInterval(() => {

    if (!isFiltering) {

      clearInterval(loadingInterval);

      return;

    }

    dots = dots.length < 3 ? dots + '.' : '';

    resultsElement.innerHTML = `<i class="material-icons" style="color: #4285f4;">hourglass_empty</i> Chargement des éléments${dots} Cela peut prendre jusqu'à une minute.`;

  }, 500);



  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {

    chrome.tabs.sendMessage(tabs[0].id, {

      action: "filter",

      keyword: currentKeyword,

      explorationDepth: explorationDepth

    }).then(response => {

      clearInterval(loadingInterval);

      isFiltering = false;

      console.log("Réponse reçue:", response);

      if (response.success) {

        const resultText = `<i class="material-icons" style="color: green;">check_circle</i> Filtrage appliqué pour "${currentKeyword}". ${response.count} résultat(s) trouvé(s) sur ${response.totalExplored} éléments explorés.`;

        resultsElement.innerHTML = resultText;

        chrome.storage.local.set({lastResult: resultText, lastKeyword: currentKeyword});

      } else if (!isClearingFilter) {

        resultsElement.innerHTML = '<i class="material-icons" style="color: red;">error</i> Erreur lors de l\'application du filtre.';

      }

    }).catch(error => {

      clearInterval(loadingInterval);

      isFiltering = false;

      console.error('Erreur:', error);

      if (!isClearingFilter) {

        resultsElement.innerHTML = '<i class="material-icons" style="color: red;">error</i> Erreur : Impossible d\'appliquer le filtre.';

      }

    });

  });

}



function clearFilter() {

  isClearingFilter = true;

  isFiltering = false;

  document.getElementById('filterInput').value = '';

  document.getElementById('results').innerHTML = '';

  chrome.storage.local.remove(['lastResult', 'lastKeyword']);

  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {

    chrome.tabs.sendMessage(tabs[0].id, {action: "clearFilter"});

  });

}



function addFavorite() {

  const keyword = document.getElementById('filterInput').value;

  if (keyword.trim() === '') {

    alert('Veuillez entrer un mot-clé avant d\'ajouter aux favoris.');

    return;

  }

  chrome.storage.sync.get({favorites: []}, function(data) {

    const favorites = data.favorites;

    if (!favorites.includes(keyword)) {

      favorites.push(keyword);

      chrome.storage.sync.set({favorites: favorites}, function() {

        console.log('Favori ajouté');

        displayFavorites();

      });

    } else {

      alert('Ce mot-clé est déjà dans vos favoris.');

    }

  });

}



function removeFavorite(keyword) {

  chrome.storage.sync.get({favorites: []}, function(data) {

    const favorites = data.favorites;

    const index = favorites.indexOf(keyword);

    if (index > -1) {

      favorites.splice(index, 1);

      chrome.storage.sync.set({favorites: favorites}, function() {

        console.log('Favori supprimé');

        displayFavorites();

      });

    }

  });

}



function displayFavorites() {

  const favoritesElement = document.getElementById('favorites');

  chrome.storage.sync.get({favorites: []}, function(data) {

    const favorites = data.favorites;

    favoritesElement.innerHTML = '';

    favorites.forEach((favorite) => {

      if (typeof favorite === 'string') {

        const favoriteElement = document.createElement('div');

        favoriteElement.className = 'favorite';

        favoriteElement.innerHTML = `

          <span>${favorite}</span>

          <button class="removeFavorite"><i class="material-icons">delete</i></button>

        `;

        favoriteElement.querySelector('.removeFavorite').addEventListener('click', (e) => {

          e.stopPropagation();

          removeFavorite(favorite);

        });

        favoriteElement.addEventListener('click', () => {

          document.getElementById('filterInput').value = favorite;

          applyFilter();

        });

        favoritesElement.appendChild(favoriteElement);

      }

    });

  });

}



function addToHistory(keyword) {

  chrome.storage.local.get({searchHistory: []}, function(data) {

    let history = data.searchHistory;

    history = history.filter(item => item !== keyword);

    history.unshift(keyword);

    history = history.slice(0, 10);

    chrome.storage.local.set({searchHistory: history});

    displayHistory();

  });

}



function removeFromHistory(keyword) {

  chrome.storage.local.get({searchHistory: []}, function(data) {

    let history = data.searchHistory;

    history = history.filter(item => item !== keyword);

    chrome.storage.local.set({searchHistory: history});

    displayHistory();

  });

}



function displayHistory() {

  const historyElement = document.getElementById('searchHistory');

  chrome.storage.local.get({searchHistory: []}, function(data) {

    const history = data.searchHistory;

    historyElement.innerHTML = '';

    if (history.length === 0) {

      historyElement.innerHTML = '<p>Aucune recherche récente</p>';

    } else {

      const ul = document.createElement('ul');

      history.forEach(keyword => {

        const li = document.createElement('li');

        li.innerHTML = `

          <span>${keyword}</span>

          <button class="removeHistory"><i class="material-icons">delete</i></button>

        `;

        li.querySelector('.removeHistory').addEventListener('click', (e) => {

          e.stopPropagation();

          removeFromHistory(keyword);

        });

        li.addEventListener('click', () => {

          document.getElementById('filterInput').value = keyword;

          applyFilter();

        });

        ul.appendChild(li);

      });

      historyElement.appendChild(ul);

    }

  });

}



function exportData(type) {

  const keyword = document.getElementById('filterInput').value;

  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {

    chrome.tabs.sendMessage(tabs[0].id, {action: "exportData", exportType: type, keyword: keyword}, function(response) {

      if (chrome.runtime.lastError) {

        console.error(chrome.runtime.lastError);

        return;

      }

      if (response && response.success) {

        console.log(`Données ${type} exportées avec succès`);

        chrome.downloads.download({

          url: response.url,

          filename: response.filename,

          saveAs: true

        }, function(downloadId) {

          if (chrome.runtime.lastError) {

            console.error("Erreur lors du téléchargement:", chrome.runtime.lastError);

          } else {

            console.log(`Téléchargement de ${response.filename} démarré, ID:`, downloadId);

          }

        });

      } else {

        console.error(`Erreur lors de l'export des données ${type}`);

      }

    });

  });

}



document.addEventListener('DOMContentLoaded', function() {

  document.getElementById('filterButton').addEventListener('click', applyFilter);

  document.getElementById('addFavoriteButton').addEventListener('click', addFavorite);

  document.getElementById('clearButton').addEventListener('click', () => {

    clearFilter();

    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {

      chrome.tabs.sendMessage(tabs[0].id, {action: "stopFiltering"});

    });

  });

  document.getElementById('exportDataButton').addEventListener('click', () => exportData('requetes'));

  document.getElementById('exportNgramsButton').addEventListener('click', () => exportData('ngrams'));



  document.getElementById('filterInput').addEventListener('keypress', function(event) {

    if (event.key === 'Enter') {

      event.preventDefault();

      applyFilter();

    }

  });



  displayFavorites();

  displayHistory();



  chrome.storage.local.get(['lastKeyword', 'lastResult', 'pageRefreshed'], function(data) {

    if (data.pageRefreshed) {

      // La page a été rafraîchie, on efface les données

      chrome.storage.local.remove(['lastKeyword', 'lastResult', 'pageRefreshed']);

    } else {

      // La page n'a pas été rafraîchie, on restaure les données

      if (data.lastKeyword) {

        document.getElementById('filterInput').value = data.lastKeyword;

      }

      if (data.lastResult) {

        document.getElementById('results').innerHTML = data.lastResult;

      }

    }

  });

});