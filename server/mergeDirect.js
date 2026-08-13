const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
require('dotenv').config();
const mongoose = require('mongoose');
const MediaAsset = require('./src/models/MediaAsset');
const Track = require('./src/models/Track');

const map = {
  '6a7d5577b78df65292b2431e': '6494e3b0ac598d3096c6fa00f18a7795439882e1c075cfceab1f9ac2240d7de1',
  '6a7d557ab78df65292b2435e': 'f9ebadcd062d636acaf7a77789ca2d9330d57971b23d576dc79642d5f1c2b9ad',
  '6a7d557ab78df65292b2434e': '03624cd2c4a5d2378006bc3c48273d724fcf043d9ebc123e4fc8eda94a00d088'
};

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    for (const [legacyId, trueHash] of Object.entries(map)) {
      const asset = await MediaAsset.findById(legacyId);
      if (!asset) continue;

      const existingAsset = await MediaAsset.findOne({ contentHash: trueHash });
      if (existingAsset) {
        console.log(`Merging ${legacyId} into ${existingAsset._id}`);
        
        await Track.updateMany(
          { mediaAssetId: asset._id },
          { $set: { mediaAssetId: existingAsset._id } }
        );
        
        await MediaAsset.updateOne(
          { _id: existingAsset._id },
          { $inc: { refCount: asset.refCount } }
        );
        
        await MediaAsset.deleteOne({ _id: asset._id });
        console.log(`Successfully merged ${legacyId}`);
      }
    }
    
    console.log(`Cleanup complete.`);
    process.exit(0);
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
})();
