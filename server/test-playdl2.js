const play = require('play-dl');

async function test() {
  const url = 'https://www.youtube.com/watch?v=zWEOx7TSM6I';
  const type = await play.validate(url);
  console.log('Valid type:', type);
  
  if (type) {
    try {
      const stream = await play.stream(url, { discordPlayerCompatibility: false });
      console.log('Stream retrieved');
    } catch (e) {
      console.error('Error getting stream:', e);
    }
  }
}
test();
