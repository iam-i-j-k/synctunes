const mongoose = require('mongoose');

const mediaAssetSchema = new mongoose.Schema(
  {
    contentHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    source: {
      type: String,
      enum: ['CLOUDINARY', 'YOUTUBE'],
      default: 'CLOUDINARY',
    },
    youtubeId: {
      type: String,
      index: true,
    },
    cloudinaryUrl: {
      type: String,
      required: function() { return this.source === 'CLOUDINARY'; },
    },
    cloudinaryPublicId: {
      type: String,
      required: function() { return this.source === 'CLOUDINARY'; },
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
