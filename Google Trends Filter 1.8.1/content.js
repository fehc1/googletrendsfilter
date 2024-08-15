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

    .replace(/[^\w\s'-]/g, '');

}



async function loadTrends(limit) {

  let allTrends = [];

  let hasMorePages = true;

  let pageCount = 0;



  while (hasMorePages && (limit === Infinity || allTrends.length < limit)) {

    await new Promise(resolve => setTimeout(resolve, 1000));

    

    const currentTrends = Array.from(document.querySelectorAll('[data-row-id]'));

    const newTrends = currentTrends.filter(trend => !allTrends.includes(trend));

    allTrends = allTrends.concat(newTrends);



    if (allTrends.length >= limit && limit !== Infinity) {

      allTrends = allTrends.slice(0, limit);

      break;

    }



    const nextButton = document.evaluate(

      '//*[@id="trend-table"]/div[2]/div/div[2]/span[3]/button',

      document,

      null,

      XPathResult.FIRST_ORDERED_NODE_TYPE,

      null

    ).singleNodeValue;



    if (nextButton && !nextButton.disabled) {

      nextButton.click();

      await new Promise(resolve => setTimeout(resolve, 2000));

      pageCount++;

    } else {

      hasMorePages = false;

    }



    if (pageCount > 20) {

      console.log("Limite de pages atteinte");

      break;

    }

  }



  console.log(`Nombre total de tendances chargées : ${allTrends.length}`);

  return allTrends;

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



async function getAssociatedQueries(trendRow) {

  const subjects = trendRow.querySelector('[data-row-id]').textContent.trim();

  const queries = Array.from(trendRow.querySelectorAll('a[data-row-id]'))

    .map(a => encodeSpecialCharacters(a.textContent.trim()));



  return { subjects, queries };

}



function processAssociatedQueries(queries) {

  const ngramsMap = new Map();

  let maxNGramLength = 0;



  queries.forEach(query => {

    const words = query.toLowerCase().split(/\s+/);

    maxNGramLength = Math.max(maxNGramLength, words.length);



    for (let n = 1; n <= words.length; n++) {

      for (let i = 0; i <= words.length - n; i++) {

        const ngram = words.slice(i, i + n).join(' ');

        if (n === 1 && stopWords.has(ngram)) continue;

        ngramsMap.set(ngram, (ngramsMap.get(ngram) || 0) + 1);

      }

    }

  });



  const sortedNGrams = Array.from(ngramsMap.entries())

    .sort((a, b) => {

      const lengthDiff = b[0].split(' ').length - a[0].split(' ').length;

      return lengthDiff !== 0 ? lengthDiff : b[1] - a[1];

    });



  const groupedNGrams = {};

  for (let i = 1; i <= maxNGramLength; i++) {

    groupedNGrams[`${i}-gram`] = sortedNGrams.filter(item => item[0].split(' ').length === i);

  }



  return groupedNGrams;

}



async function applyFilter(keyword, limit) {

  if (!isFiltering) return;



  const allTrends = await loadTrends(limit);

  const normalizedKeyword = normalizeText(keyword);

  let matchCount = 0;



  allTrends.forEach(trendRow => {

    const trendText = normalizeText(trendRow.textContent);

    if (trendText.includes(normalizedKeyword)) {

      trendRow.style.display = '';

      trendRow.style.border = '2px solid green';

      matchCount++;

    } else {

      trendRow.style.display = 'none';

    }

  });



  // Forcer un rafraîchissement de l'affichage

  document.body.style.display = 'none';

  document.body.offsetHeight; // Force a reflow

  document.body.style.display = '';



  // Vérification supplémentaire

  setTimeout(() => {

    const visibleMatches = document.querySelectorAll('[data-row-id]:not([style*="display: none"])').length;

    console.log(`Correspondances visibles après vérification : ${visibleMatches}`);

    if (visibleMatches !== matchCount) {

      console.warn(`Discordance détectée : ${matchCount} correspondances trouvées, mais ${visibleMatches} visibles.`);

    }

  }, 1000);



  console.log(`Filtrage appliqué. Correspondances trouvées : ${matchCount}`);

  return { matchCount, totalExplored: allTrends.length };

}



function clearAllData() {

  const trends = document.querySelectorAll('[data-row-id]');

  trends.forEach(trend => {

    trend.style.display = '';

    trend.style.border = '';

  });

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

    const limit = request.explorationDepth === 'all' ? Infinity : parseInt(request.explorationDepth);

    applyFilter(request.keyword, limit).then(result => {

      sendResponse({

        success: true,

        count: result.matchCount,

        totalExplored: result.totalExplored

      });

    }).catch(error => {

      console.error("Erreur lors du filtrage:", error);

      sendResponse({success: false, error: error.message});

    });

    return true;

  } else if (request.action === "clearFilter") {

    clearAllData();

    sendResponse({success: true});

  } else if (request.action === "stopFiltering") {

    isFiltering = false;

  } else if (request.action === "exportData") {

    (async () => {

      try {

        const allTrends = await loadTrends(Infinity); // Charger toutes les tendances pour l'export

        const trendData = [];

        const allQueries = [];



        for (let trendRow of allTrends) {

          if (trendRow.style.display !== 'none') {

            const { subjects, queries } = await getAssociatedQueries(trendRow);

            trendData.push([subjects, queries.join('; ')]);

            allQueries.push(...queries);

          }

        }



        const currentDate = new Date();

        const dateString = `${String(currentDate.getDate()).padStart(2, '0')}${String(currentDate.getMonth() + 1).padStart(2, '0')}${String(currentDate.getFullYear()).slice(-2)}`;



        if (request.exportType === 'requetes') {

          const csvData = createCSV([['Sujet', 'Requêtes associées'], ...trendData]);

          const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });

          const url = URL.createObjectURL(blob);

          sendResponse({

            success: true,

            url: url,

            filename: `trends_data_${request.keyword}_${dateString}.csv`

          });

        } else if (request.exportType === 'ngrams') {

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

    return true;

  }



  return true;

});