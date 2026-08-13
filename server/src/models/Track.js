const mongoose = require('mongoose');

const trackSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: false,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    artist: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    albumArtUrl: {
      type: String,
    },
    mediaAssetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MediaAsset',
      required: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Track', trackSchema);
