require('dotenv').config();
const mongoose = require('mongoose');
const Track = require('./models/Track');

// Need to use dynamic import for node-fetch
const fetchObj = typeof fetch !== 'undefined' ? fetch : (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function updateAllTracks() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected.');

    const tracks = await Track.find({});
    console.log(`Found ${tracks.length} tracks. Starting update...`);

    let updatedCount = 0;

    for (const track of tracks) {
      let { title, artist } = track;
      if (!title) continue;

      // Clean the title just like during upload
      title = title.replace(/[-_]?\s*\[?\(?(NaaSongs|PagalWorld|SenSongs|Masstamilan|DJMaza|Wapking|MyMp3Song|Webmusic|PagalFree)[^\]\)]*\]?\)?/gi, '');
      title = title.replace(/_+/g, ' ');
      title = title.replace(/-+/g, ' ');
      title = title.replace(/\s+/g, ' ').trim();
      
      const searchParams = [
        { term: `${title} ${artist || ''}`.trim(), entity: 'song' },
        { term: title.trim(), entity: 'song' },
        { term: title.trim(), entity: 'album' }
      ];

      let foundUrl = null;
      let foundArtist = null;

      for (const params of searchParams) {
        if (!params.term || foundUrl) continue;
        
        const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(params.term)}&entity=${params.entity}&limit=1`;
        const response = await fetchObj(itunesUrl);
        
        if (response.ok) {
          const data = await response.json();
          if (data.results && data.results.length > 0) {
            if (data.results[0].artworkUrl100) {
              foundUrl = data.results[0].artworkUrl100.replace('100x100bb', '600x600bb');
            }
            if (!artist && data.results[0].artistName) {
              foundArtist = data.results[0].artistName;
            }
            break;
          }
        }
      }

      if (foundUrl && track.albumArtUrl !== foundUrl) {
        console.log(`[UPDATE] ${track.title}`);
        console.log(`   Old: ${track.albumArtUrl}`);
        console.log(`   New: ${foundUrl}`);
        
        track.albumArtUrl = foundUrl;
        if (foundArtist && !track.artist) {
          track.artist = foundArtist;
        }
        await track.save();
        updatedCount++;
      } else {
        console.log(`[SKIP] ${track.title} (No better art found or already up-to-date)`);
      }
      
      // Delay to avoid hitting iTunes API rate limit
      await new Promise(res => setTimeout(res, 500));
    }

    console.log(`Finished processing. Updated ${updatedCount} tracks.`);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

updateAllTracks();
