const User = require('../models/User');
const Track = require('../models/Track');
const Room = require('../models/Room');
const Playlist = require('../models/Playlist');
const PlayHistory = require('../models/PlayHistory');

async function toggleLikeTrack(req, res) {
  try {
    const { trackId } = req.params;
    const userId = req.user.userId;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const trackIndex = user.likedTracks.findIndex(
      (id) => (id ? id.toString() : '') === trackId.toString()
    );
    let liked = false;

    if (trackIndex === -1) {
      user.likedTracks.push(trackId);
      liked = true;
    } else {
      user.likedTracks.splice(trackIndex, 1);
    }

    await user.save();
    return res.json({ message: 'Success', liked, likedTracks: user.likedTracks });
  } catch (err) {
    console.error('toggleLikeTrack error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function getLikedTracks(req, res) {
  try {
    const user = await User.findById(req.user.userId).populate({
      path: 'likedTracks',
      populate: { path: 'mediaAssetId' }
    });
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    // Filter out any dangling deleted track references and transform
    const tracks = (user.likedTracks || [])
      .filter((track) => track && track._id)
      .map((track) => {
        const trackObj = typeof track.toObject === 'function' ? track.toObject() : { ...track };
        if (trackObj.mediaAssetId && typeof trackObj.mediaAssetId === 'object') {
          trackObj.cloudinaryUrl = trackObj.mediaAssetId.cloudinaryUrl;
          trackObj.cloudinaryPublicId = trackObj.mediaAssetId.cloudinaryPublicId;
          trackObj.durationMs = trackObj.mediaAssetId.durationMs;
          trackObj.source = trackObj.mediaAssetId.source;
          trackObj.youtubeId = trackObj.mediaAssetId.youtubeId;
        }
        return trackObj;
      });

    return res.json({ tracks });
  } catch (err) {
    console.error('getLikedTracks error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function getProfile(req, res) {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const [roomsJoined, tracksUploaded, playlistCount] = await Promise.all([
      Room.countDocuments({ memberIds: userId }),
      Track.countDocuments({ uploadedBy: userId }),
      Playlist.countDocuments({ userId }),
    ]);

    return res.json({
      profile: {
        _id: user._id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
        likedCount: user.likedTracks?.length || 0,
        roomsJoined,
        tracksUploaded,
        playlistCount,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error('getProfile error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function getRecentlyPlayed(req, res) {
  try {
    const userId = req.user.userId;

    // Fetch the 50 most recent play history records for the user
    const historyRecords = await PlayHistory.find({ userId })
      .sort({ playedAt: -1 })
      .limit(50)
      .populate({
        path: 'trackId',
        populate: { path: 'mediaAssetId' },
      })
      .populate('roomId', 'name')
      .lean();

    // Deduplicate tracks, keeping only the most recent play for each track
    const seenTracks = new Set();
    const recentTracks = [];

    for (const record of historyRecords) {
      const track = record.trackId;
      if (!track || seenTracks.has(track._id.toString())) continue;
      
      seenTracks.add(track._id.toString());
      
      // Flatten mediaAsset
      if (track.mediaAssetId && typeof track.mediaAssetId === 'object') {
        track.cloudinaryUrl = track.mediaAssetId.cloudinaryUrl;
        track.cloudinaryPublicId = track.mediaAssetId.cloudinaryPublicId;
        track.durationMs = track.mediaAssetId.durationMs;
      }
      
      // Attach the room info from the history record
      if (record.roomId) {
        track.fromRoom = record.roomId;
      }
      
      recentTracks.push(track);
      if (recentTracks.length >= 20) break; // Limit to 20 unique tracks
    }

    return res.json({ tracks: recentTracks });
  } catch (err) {
    console.error('getRecentlyPlayed error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function recordPlayHistory(req, res) {
  try {
    const userId = req.user.userId;
    const { trackId, roomId } = req.body;

    if (!trackId) {
      return res.status(400).json({ message: 'trackId is required' });
    }

    await PlayHistory.create({
      userId,
      trackId,
      roomId: roomId || undefined,
    });

    return res.json({ message: 'Play recorded' });
  } catch (err) {
    console.error('recordPlayHistory error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { toggleLikeTrack, getLikedTracks, getProfile, getRecentlyPlayed, recordPlayHistory };

