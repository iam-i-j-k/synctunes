const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['ROOM_JOIN', 'TRACK_LIKED', 'ROOM_INVITE', 'TRACK_ADDED', 'SYSTEM'],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    metadata: {
      roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
      trackId: { type: mongoose.Schema.Types.ObjectId, ref: 'Track' },
      fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      fromUsername: { type: String },
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);
