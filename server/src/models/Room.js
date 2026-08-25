const mongoose = require('mongoose');

const playbackStateSchema = new mongoose.Schema(
  {
    isPlaying: { type: Boolean, default: false },
    startedAtServerTime: { type: Number, default: 0 }, // epoch ms
    pausedAtOffsetMs: { type: Number, default: 0 },    // ms into track
  },
  { _id: false }
);

const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 50,
    },
    hostId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    isPersonalLibrary: {
      type: Boolean,
      default: false,
    },
    joinCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      length: 6,
    },
    memberIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    trackIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Track',
      },
    ],
    currentTrackId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Track',
      default: null,
    },
    playbackMode: {
      type: String,
      enum: ['NORMAL', 'REPEAT_ALL', 'REPEAT_ONE', 'SHUFFLE'],
      default: 'NORMAL',
    },
    playbackState: {
      type: playbackStateSchema,
      default: () => ({ isPlaying: false, startedAtServerTime: 0, pausedAtOffsetMs: 0 }),
    },
    actionSequence: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Room', roomSchema);
