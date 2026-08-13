/**
 * One-time migration: Move cloudinaryUrl, cloudinaryPublicId, and durationMs
 * from Track documents into new MediaAsset documents.
 *
 * Run with:  node src/migrateToMediaAssets.js
 *
 * Safe to re-run — it skips tracks that already have a mediaAssetId.
 */
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);

require('dotenv').config();
const mongoose = require('mongoose');

// We need the OLD Track schema (with cloudinaryUrl etc.) to read existing docs,
// so we define a temporary raw model here instead of using the updated Track model.
const RawTrack = mongoose.model(
  'Track_Migration',
  new mongoose.Schema({}, { strict: false, collection: 'tracks' })
);

const MediaAsset = require('./models/MediaAsset');

async function migrate() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected.\n');

    const tracks = await RawTrack.find({}).lean();
    console.log(`Found ${tracks.length} track(s) total.\n`);

    let migratedCount = 0;
    let skippedCount = 0;

    // Group tracks by cloudinaryPublicId so tracks that share
    // the same Cloudinary file get the same MediaAsset.
    const assetCache = new Map(); // cloudinaryPublicId → MediaAsset doc

    for (const track of tracks) {
      // Skip if already migrated
      if (track.mediaAssetId) {
        skippedCount++;
        console.log(`[SKIP] "${track.title}" — already has mediaAssetId`);
        continue;
      }

      if (!track.cloudinaryUrl || !track.cloudinaryPublicId) {
        skippedCount++;
        console.log(`[SKIP] "${track.title}" — missing cloudinary fields`);
        continue;
      }

      let mediaAsset;

      // Check if we already created a MediaAsset for this Cloudinary file
      if (assetCache.has(track.cloudinaryPublicId)) {
        mediaAsset = assetCache.get(track.cloudinaryPublicId);
        // Increment refCount for this additional reference
        await MediaAsset.updateOne({ _id: mediaAsset._id }, { $inc: { refCount: 1 } });
        mediaAsset.refCount += 1;
      } else {
        // Check DB in case a previous run created this asset
        mediaAsset = await MediaAsset.findOne({ cloudinaryPublicId: track.cloudinaryPublicId });

        if (mediaAsset) {
          await MediaAsset.updateOne({ _id: mediaAsset._id }, { $inc: { refCount: 1 } });
          mediaAsset.refCount += 1;
        } else {
          // Create a new MediaAsset. Since we don't have the original file buffer,
          // use the cloudinaryPublicId as a deterministic stand-in for contentHash.
          // Future uploads of the same file will produce a real SHA-256 hash.
          const syntheticHash = `legacy_${track.cloudinaryPublicId}`;

          mediaAsset = await MediaAsset.create({
            contentHash: syntheticHash,
            cloudinaryUrl: track.cloudinaryUrl,
            cloudinaryPublicId: track.cloudinaryPublicId,
            durationMs: track.durationMs || 0,
            refCount: 1,
          });
        }

        assetCache.set(track.cloudinaryPublicId, mediaAsset);
      }

      // Update the Track doc: set mediaAssetId, unset old fields
      await RawTrack.updateOne(
        { _id: track._id },
        {
          $set: { mediaAssetId: mediaAsset._id },
          $unset: { cloudinaryUrl: '', cloudinaryPublicId: '', durationMs: '' },
        }
      );

      migratedCount++;
      console.log(`[MIGRATED] "${track.title}" → MediaAsset ${mediaAsset._id}`);
    }

    console.log(`\n──────────────────────────────────`);
    console.log(`Migration complete.`);
    console.log(`  Migrated: ${migratedCount}`);
    console.log(`  Skipped:  ${skippedCount}`);
    console.log(`  Total MediaAssets: ${await MediaAsset.countDocuments()}`);
    console.log(`──────────────────────────────────`);

    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}

migrate();
