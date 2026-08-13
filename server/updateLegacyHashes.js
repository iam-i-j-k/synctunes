const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const MediaAsset = require('./src/models/MediaAsset');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    const legacyAssets = await MediaAsset.find({ contentHash: /^legacy_/ });
    console.log(`Found ${legacyAssets.length} legacy MediaAssets to update.`);
    
    let successCount = 0;
    
    for (let i = 0; i < legacyAssets.length; i++) {
      const asset = legacyAssets[i];
      try {
        console.log(`[${i+1}/${legacyAssets.length}] Fetching ${asset.cloudinaryUrl}...`);
        const response = await fetch(asset.cloudinaryUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        const newHash = crypto.createHash('sha256').update(buffer).digest('hex');
        
        asset.contentHash = newHash;
        await asset.save();
        
        console.log(`  -> Updated hash to: ${newHash}`);
        successCount++;
      } catch (err) {
        console.error(`  -> Error updating asset ${asset._id}:`, err.message);
      }
    }
    
    console.log(`\nMigration complete. Updated ${successCount}/${legacyAssets.length} assets.`);
    process.exit(0);
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
})();
