function renderTrendsWidgets(keyword, country) {
    // Nettoyer les conteneurs existants
    document.getElementById('relatedTopics').innerHTML = '';
    document.getElementById('relatedQueries').innerHTML = '';
  
    // Créer et rendre le widget des sujets associés
    trends.embed.renderExploreWidget("RELATED_TOPICS", {
      comparisonItem: [{ keyword: keyword, geo: country, time: "now 1-d" }],
      category: 0,
      property: ""
    }, {
      exploreQuery: `q=${keyword}&date=now%201-d&geo=${country}&hl=fr`,
      guestPath: "https://trends.google.fr:443/trends/embed/",
      container: document.getElementById('relatedTopics')
    });
  
    // Créer et rendre le widget des requêtes associées
    trends.embed.renderExploreWidget("RELATED_QUERIES", {
      comparisonItem: [{ keyword: keyword, geo: country, time: "now 1-d" }],
      category: 0,
      property: ""
    }, {
      exploreQuery: `q=${keyword}&date=now%201-d&geo=${country}&hl=fr`,
      guestPath: "https://trends.google.fr:443/trends/embed/",
      container: document.getElementById('relatedQueries')
    });
  }