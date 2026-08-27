const { Innertube, UniversalCache } = require('youtubei.js');

async function test() {
  try {
    const yt = await Innertube.create({ 
      cache: new UniversalCache(false),
      generate_session_locally: true,
      clientType: 'ANDROID'
    });
    const videoId = 'zWEOx7TSM6I'; // the user's video ID
    const stream = await yt.download(videoId, {
      type: 'audio',
      quality: 'best'
    });
    console.log('Stream object:', typeof stream, stream.constructor.name);
    
    if (stream.getReader) {
      console.log('It is a Web ReadableStream');
    }
    
    try {
      let count = 0;
      for await (const chunk of stream) {
        console.log('Chunk size:', chunk.length);
        count++;
        if (count > 2) break;
      }
      console.log('Async iteration works');
    } catch (e) {
      console.error('Async iteration failed:', e.message);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}
test();
