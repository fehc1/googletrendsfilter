let isFiltering = false;

const stopWords = new Set([
  // Articles
  "le", "la", "les", "l'", "un", "une", "des", "du", "de", "la", "de l'",
  // Pronoms personnels
  "je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles",
  "me", "te", "se", "nous", "vous", "leur", "lui", "en", "y",
  // Pronoms démonstratifs
  "ce", "ceci", "cela", "ça", "celui", "celle", "ceux", "celles",
  // Pronoms relatifs
  "qui", "que", "quoi", "dont", "où", "lequel", "laquelle", "lesquels", "lesquelles",
  // Pronoms possessifs
  "mien", "tien", "sien", "nôtre", "vôtre", "leur",
  "mienne", "tienne", "sienne", "nôtres", "vôtres", "leurs",
  // Pronoms indéfinis
  "aucun", "autre", "certain", "chacun", "même", "nul", "plusieurs", "quelque", "tel", "tout",
  // Conjonctions de coordination
  "et", "ou", "mais", "donc", "or", "ni", "car",
  // Conjonctions de subordination
  "si", "que", "quand", "lorsque", "puisque", "comme", "quoique", "bien que", "afin que", "pour que",
  "avant que", "après que", "tandis que", "alors que", "dès que", "depuis que", "parce que", "même si",
  // Prépositions
  "à", "dans", "par", "pour", "en", "vers", "avec", "de", "sans", "sous", "sur", "chez", "entre", "parmi",
  "contre", "dès", "depuis", "pendant", "malgré", "outre", "selon", "suivant", "devant", "derrière",
  "au-dessus", "au-dessous", "auprès", "autour", "avant", "après", "jusque", "sauf",
  // Adverbes
  "ne", "pas", "plus", "moins", "très", "trop", "bien", "peu", "assez", "aussi", "encore", "déjà",
  "souvent", "jamais", "toujours", "peut-être", "certainement", "probablement", "là", "ici", "là-bas",
  "partout", "ailleurs", "ensemble", "surtout", "davantage", "en fait", "en effet", "cependant",
  "néanmoins", "pourtant", "alors", "ainsi", "donc", "ensuite", "puis", "enfin", "après", "avant",
  "aujourd'hui", "hier", "demain", "maintenant", "autrefois", "jadis", "bientôt", "tard", "tôt",
  // Déterminants
  "ce", "cet", "cette", "ces", "mon", "ton", "son", "notre", "votre", "leur", "mes", "tes", "ses", "nos", "vos", "leurs",
  // Interjections
  "ah", "oh", "eh", "hé", "hein", "hélas", "ouf", "voilà", "tiens", "zut", "mince", "fi", "ouais",
  // Articles contractés
  "au", "aux", "du", "des",
  // Locutions conjonctives, adverbiales et prépositives
  "bien que", "quoique", "afin que", "pour que", "parce que", "tant que", "alors que", "tandis que",
  "dès que", "aussitôt que", "après que", "avant que", "à peine", "à peine que", "à présent",
  "au fur et à mesure", "d'abord", "de nouveau", "de suite", "dès lors", "du coup", "en fait",
  "en même temps", "en réalité", "par conséquent", "pour autant", "pour ainsi dire", "tout à fait",
  "à cause de", "à l'insu de", "à partir de", "au-delà de", "au lieu de", "au milieu de", "autour de",
  "près de", "loin de", "grâce à", "en dépit de", "en face de", "au bout de", "au sujet de"
]);

window.addEventListener('load', () => {
  chrome.storage.local.set({pageRefreshed: true});
});

function removeAccents(str) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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
    .replace(/[^\w\s'-]/g, ''); // Conserve les apostrophes et les traits d'union
}

function loadAllElements(targetCount) {
  return new Promise((resolve, reject) => {
    let previousElementCount = 0;
    let stableCount = 0;
    const maxStableCount = 5;

    const clickLoadMore = () => {
      if (!isFiltering) {
        reject(new Error("Filtering stopped"));
        return;
      }

      const loadMoreButton = document.querySelector('.feed-load-more-button');
      const currentElementCount = document.querySelectorAll('.feed-item').length;

      if (currentElementCount >= targetCount) {
        console.log(`Atteint ${currentElementCount} éléments, objectif de ${targetCount} atteint.`);
        resolve(currentElementCount);
        return;
      }

      if (loadMoreButton && loadMoreButton.offsetParent !== null) {
        loadMoreButton.click();
        stableCount = 0;
        setTimeout(clickLoadMore, 1000);
      } else if (currentElementCount > previousElementCount) {
        previousElementCount = currentElementCount;
        stableCount = 0;
        setTimeout(clickLoadMore, 1000);
      } else {
        stableCount++;
        if (stableCount >= maxStableCount) {
          console.log(`Tous les éléments sont chargés (${currentElementCount})`);
          resolve(currentElementCount);
        } else {
          setTimeout(clickLoadMore, 1000);
        }
      }
    };

    clickLoadMore();
  });
}

function normalizeText(text) {
  return removeAccents(text.toLowerCase().trim());
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

function processAssociatedQueries(queries) {
  const ngramsMap = new Map();
  let maxNGramLength = 0;

  queries.forEach(query => {
    const words = query.toLowerCase().split(/\s+/);
    maxNGramLength = Math.max(maxNGramLength, words.length);

    // Générer tous les n-grams possibles pour cette requête
    for (let n = 1; n <= words.length; n++) {
      for (let i = 0; i <= words.length - n; i++) {
        const ngram = words.slice(i, i + n).join(' ');
        if (n === 1 && stopWords.has(ngram)) continue; // Ignorer les stopwords pour les unigrams
        ngramsMap.set(ngram, (ngramsMap.get(ngram) || 0) + 1);
      }
    }
  });

  // Trier les n-grams par longueur puis par fréquence
  const sortedNGrams = Array.from(ngramsMap.entries())
    .sort((a, b) => {
      const lengthDiff = b[0].split(' ').length - a[0].split(' ').length;
      return lengthDiff !== 0 ? lengthDiff : b[1] - a[1];
    });

  // Regrouper les n-grams par longueur
  const groupedNGrams = {};
  for (let i = 1; i <= maxNGramLength; i++) {
    groupedNGrams[`${i}-gram`] = sortedNGrams.filter(item => item[0].split(' ').length === i);
  }

  return groupedNGrams;
}

async function expandFeedItem(feedItem) {
  return new Promise((resolve) => {
    const arrowWrapper = feedItem.querySelector('.arrow-icon-wrapper');
    if (arrowWrapper && arrowWrapper.classList.contains('rotate-down')) {
      arrowWrapper.click();
      setTimeout(() => {
        resolve();
      }, 1000);
    } else {
      resolve();
    }
  });
}

async function getAssociatedQueries(feedItem) {
  try {
    await expandFeedItem(feedItem);
    
    const titleElement = feedItem.querySelector('.title');
    const subjects = titleElement ? Array.from(titleElement.querySelectorAll('a'))
      .map(a => encodeSpecialCharacters(a.textContent.trim()))
      .join(' • ') : '';

    const queryList = feedItem.querySelector('.list');
    const queries = queryList ? Array.from(queryList.querySelectorAll('a.chip'))
      .map(a => encodeSpecialCharacters(a.textContent.trim())) : [];

    console.log("Sujets extraits:", subjects);
    console.log("Requêtes extraites:", queries);

    return { subjects, queries };
  } catch (error) {
    console.error("Erreur dans getAssociatedQueries:", error);
    return { subjects: '', queries: [] };
  }
}
  
function clearAllData() {
  const trends = document.querySelectorAll('.feed-item');
  trends.forEach(trend => {
    trend.style.display = '';
    trend.style.border = '';
  });
  chrome.storage.local.set({pageRefreshed: true});
}
  
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Message reçu dans content script:", request);
  
  if (request.action === "initializeExtension") {
    console.log("Extension initialized on Google Trends page");
    sendResponse({status: "initialized"});
    return true;
  }
  
  if (request.action === "filter") {
    isFiltering = true;
    loadAllElements(request.explorationDepth).then((totalCount) => {
      if (!isFiltering) {
        sendResponse({success: false, error: "Filtering stopped"});
        return;
      }

      const keyword = normalizeText(request.keyword);
      console.log("Filtrage pour le mot-clé:", keyword);

      const trends = document.querySelectorAll('.feed-item');
      let matchCount = 0;

      trends.forEach(trend => {
        const titleElement = trend.querySelector('.title');
        if (titleElement) {
          const title = normalizeText(titleElement.textContent);
          const words = title.split(/\s+/);
          if (words.includes(keyword)) {
            trend.style.display = 'block';
            trend.style.border = '2px solid green';
            matchCount++;
          } else {
            trend.style.display = 'none';
          }
        }
      });

      console.log("Nombre de correspondances trouvées:", matchCount);
      sendResponse({success: true, count: matchCount, totalCount: totalCount});
    }).catch(error => {
      console.error("Erreur lors du chargement ou du filtrage:", error);
      sendResponse({success: false, error: error.message});
    });
    return true;
  } else if (request.action === "clearFilter") {
    clearAllData();
    sendResponse({success: true});
  } else if (request.action === "stopFiltering") {
    isFiltering = false;
  } else if (request.action === "exportData") {
    console.log("Début de l'exportation des données");
    const trends = document.querySelectorAll('.feed-item');
    const trendData = [];
    const allQueries = [];

    (async () => {
      try {
        console.log("Nombre total d'éléments à traiter :", trends.length);
        for (let trend of trends) {
          if (trend.style.display !== 'none') {
            const { subjects, queries } = await getAssociatedQueries(trend);
            console.log("Données extraites pour un trend:", { subjects, queries });
            trendData.push([subjects, queries.join('; ')]);
            allQueries.push(...queries);
          }
        }

        console.log("Données collectées:", trendData);
        console.log("Toutes les requêtes:", allQueries);

        const currentDate = new Date();
        const dateString = `${String(currentDate.getDate()).padStart(2, '0')}${String(currentDate.getMonth() + 1).padStart(2, '0')}${String(currentDate.getFullYear()).slice(-2)}`;

        if (request.exportType === 'requetes') {
          console.log("Création du fichier CSV des requêtes");
          const csvData = createCSV([['Sujet', 'Requêtes associées'], ...trendData]);
          const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          sendResponse({
            success: true,
            url: url,
            filename: `trends_data_${request.keyword}_${dateString}.csv`
          });
        } else if (request.exportType === 'ngrams') {
          console.log("Création du fichier CSV des n-grams");
          const processedQueries = processAssociatedQueries(allQueries);
          const ngramsData = [['Type', 'N-gram', 'Occurrences']];
          
          Object.entries(processedQueries).forEach(([type, ngrams]) => {
            ngrams.forEach(([term, count]) => {
              ngramsData.push([type, term, count]);
            });
          });

          const csvData = createCSV(ngramsData);
          const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          sendResponse({
            success: true,
            url: url,
            filename: `ngrams_analysis_${request.keyword}_${dateString}.csv`
          });
        }
      } catch (error) {
        console.error("Erreur lors de l'exportation :", error);
        sendResponse({success: false, error: error.message});
      }
    })();

    return true; // Indique que la réponse sera envoyée de manière asynchrone
  }

  return true;
});

// Réinitialiser pageRefreshed lorsque l'utilisateur navigue sur la page
chrome.storage.local.set({pageRefreshed: false});