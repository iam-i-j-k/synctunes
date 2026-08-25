const User = require('../models/User');
const Track = require('../models/Track');
const Room = require('../models/Room');
const Playlist = require('../models/Playlist');

async function toggleLikeTrack(req, res) {
  try {
    const { trackId } = req.params;
    const userId = req.user.userId;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const trackIndex = user.likedTracks.indexOf(trackId);
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
    
    // Transform tracks so cloudinaryUrl/durationMs appear at top level
    const tracks = (user.likedTracks || []).map(track => {
      const trackObj = typeof track.toObject === 'function' ? track.toObject() : { ...track };
      if (trackObj.mediaAssetId && typeof trackObj.mediaAssetId === 'object') {
        trackObj.cloudinaryUrl = trackObj.mediaAssetId.cloudinaryUrl;
        trackObj.cloudinaryPublicId = trackObj.mediaAssetId.cloudinaryPublicId;
        trackObj.durationMs = trackObj.mediaAssetId.durationMs;
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
    // Find rooms user is a member of, get their recent tracks
    const rooms = await Room.find({ memberIds: userId })
      .select('trackIds currentTrackId name')
      .populate({
        path: 'trackIds',
        populate: { path: 'mediaAssetId' },
        options: { sort: { updatedAt: -1 } },
      })
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean();

    // Collect unique tracks across rooms, most recent first
    const seen = new Set();
    const recentTracks = [];
    for (const room of rooms) {
      for (const track of (room.trackIds || []).reverse()) {
        if (!track || seen.has(track._id.toString())) continue;
        seen.add(track._id.toString());
        // Flatten mediaAsset
        if (track.mediaAssetId && typeof track.mediaAssetId === 'object') {
          track.cloudinaryUrl = track.mediaAssetId.cloudinaryUrl;
          track.cloudinaryPublicId = track.mediaAssetId.cloudinaryPublicId;
          track.durationMs = track.mediaAssetId.durationMs;
        }
        track.fromRoom = { _id: room._id, name: room.name };
        recentTracks.push(track);
        if (recentTracks.length >= 20) break;
      }
      if (recentTracks.length >= 20) break;
    }

    return res.json({ tracks: recentTracks });
  } catch (err) {
    console.error('getRecentlyPlayed error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { toggleLikeTrack, getLikedTracks, getProfile, getRecentlyPlayed };

