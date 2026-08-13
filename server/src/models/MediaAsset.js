const mongoose = require('mongoose');

const mediaAssetSchema = new mongoose.Schema(
  {
    contentHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    cloudinaryUrl: {
      type: String,
      required: true,
    },
    cloudinaryPublicId: {
      type: String,
      required: true,
    },
    durationMs: {
      type: Number,
      required: true,
      min: 0,
    },
    refCount: {
      type: Number,
      default: 1,
      min: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MediaAsset', mediaAssetSchema);
