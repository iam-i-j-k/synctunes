function cleanTitle(filename) {
  let title = filename.replace(/\.[^.]+$/, ''); // remove extension
  
  // Remove common Indian music site tags (case-insensitive)
  title = title.replace(/[-_]?\s*\[?\(?(NaaSongs|PagalWorld|SenSongs|Masstamilan|DJMaza|Wapking)[^\]\)]*\]?\)?/gi, '');
  
  // Replace underscores and multiple hyphens
  title = title.replace(/_+/g, ' ');
  title = title.replace(/-+/g, ' ');
  
  // Remove extra spaces
  title = title.replace(/\s+/g, ' ').trim();
  
  return title;
}

console.log(cleanTitle('Oo Antava Oo Oo Antava - Pushpa (NaaSongs.com).mp3'));
console.log(cleanTitle('Naatu Naatu - RRR - NaaSongs.com.mp3'));
console.log(cleanTitle('Arabic_Kuthu_-_Beast_[Masstamilan.in].mp3'));
console.log(cleanTitle('01 - Jai Ho - Slumdog Millionaire.mp3'));
