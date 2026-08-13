const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
require('dotenv').config();
const mongoose = require('mongoose');
const MediaAsset = require('./src/models/MediaAsset');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    await MediaAsset.updateOne(
      { _id: '6a7d557ab78df65292b2434e' },
      { $set: { contentHash: '03624cd2c4a5d2378006bc3c48273d724fcf043d9ebc123e4fc8eda94a00d088' } }
    );
    console.log('Fixed last legacy track');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
