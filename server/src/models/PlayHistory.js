const mongoose = require('mongoose');

const playHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    trackId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Track',
      required: true,
      index: true,
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      // Optional, since we might want to track playback that happens outside a room in the future
    },
    playedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PlayHistory', playHistorySchema);
