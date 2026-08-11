const https = require('https');

function searchItunes(query, entity = 'song') {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&limit=1&entity=${entity}`;
  console.log('Fetching:', url);
  https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      const parsed = JSON.parse(data);
      if (parsed.results && parsed.results.length > 0) {
        console.log(`[${entity}] Result for`, query, ':', parsed.results[0].collectionName, '|', parsed.results[0].artworkUrl100);
      } else {
        console.log(`[${entity}] No results for`, query);
      }
    });
  });
}

searchItunes('Oo Antava Mawa Pushpa', 'song');
searchItunes('Naatu Naatu RRR', 'song');
searchItunes('Arabic Kuthu Beast', 'song');
searchItunes('Oo Antava Mawa Pushpa', 'album');
