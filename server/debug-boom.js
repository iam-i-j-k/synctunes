const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
require('dotenv').config();
const mongoose = require('mongoose');
const MediaAsset = require('./src/models/MediaAsset');
const Track = require('./src/models/Track');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const boomTracks = await Track.find({ title: /Boom/i }).lean();
    console.log('Boom Tracks:', JSON.stringify(boomTracks, null, 2));
    
    if (boomTracks.length > 0) {
      const boomAssets = await MediaAsset.find({ _id: { $in: boomTracks.map(t => t.mediaAssetId) } }).lean();
      console.log('Boom MediaAssets:', JSON.stringify(boomAssets, null, 2));
    }
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
