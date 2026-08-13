const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
require('dotenv').config();
const mongoose = require('mongoose');
const MediaAsset = require('./src/models/MediaAsset');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const count = await MediaAsset.countDocuments({ contentHash: /^legacy_/ });
    console.log(`Legacy MediaAssets: ${count}`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
