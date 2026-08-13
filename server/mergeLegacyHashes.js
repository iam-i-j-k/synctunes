const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const MediaAsset = require('./src/models/MediaAsset');
const Track = require('./src/models/Track');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    const legacyAssets = await MediaAsset.find({ contentHash: /^legacy_/ });
    console.log(`Found ${legacyAssets.length} remaining legacy MediaAssets that need merging.`);
    
    for (const asset of legacyAssets) {
      try {
        console.log(`Processing legacy asset: ${asset._id} (${asset.contentHash})`);
        const response = await fetch(asset.cloudinaryUrl);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const trueHash = crypto.createHash('sha256').update(buffer).digest('hex');
        
        const existingAsset = await MediaAsset.findOne({ contentHash: trueHash });
        if (existingAsset) {
          console.log(`  -> Found existing true hash asset: ${existingAsset._id}`);
          
          // Move all tracks pointing to the old legacy asset to the existing true one
          const updateRes = await Track.updateMany(
            { mediaAssetId: asset._id },
            { $set: { mediaAssetId: existingAsset._id } }
          );
          console.log(`  -> Updated ${updateRes.modifiedCount} tracks to point to existing asset.`);
          
          // Increment the refCount of the existing asset
          await MediaAsset.updateOne(
            { _id: existingAsset._id },
            { $inc: { refCount: asset.refCount } }
          );
          
          // Delete the old legacy asset
          await MediaAsset.deleteOne({ _id: asset._id });
          console.log(`  -> Deleted legacy asset ${asset._id}`);
        } else {
          console.log(`  -> WEIRD: True hash ${trueHash} not found for ${asset._id} despite E11000 earlier?`);
        }
      } catch (err) {
        console.error(`  -> Error merging asset ${asset._id}:`, err.message);
      }
    }
    
    console.log(`\nCleanup complete.`);
    process.exit(0);
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
})();
