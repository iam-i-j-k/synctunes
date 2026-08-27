const play = require('play-dl');

async function test() {
  try {
    const videoId = 'zWEOx7TSM6I';
    console.log(`Testing play-dl stream for ${videoId}...`);
    const stream = await play.stream(`https://www.youtube.com/watch?v=${videoId}`, {
      discordPlayerCompatibility: false
    });
    console.log('Stream object keys:', Object.keys(stream));
    console.log('Stream type:', stream.type);
    
    // In discordPlayerCompatibility: false, stream might just be the direct object or stream.stream
    if (stream.stream) {
      console.log('Found stream.stream');
      stream.stream.on('error', err => console.error('stream.stream error:', err));
    }
    
    // Check if stream itself is a readable stream
    if (typeof stream.on === 'function') {
      console.log('stream itself is readable');
    }
  } catch (err) {
    console.error('Test failed with error:', err.message || err);
  }
}
test();
