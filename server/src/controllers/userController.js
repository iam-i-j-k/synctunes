const User = require('../models/User');
const Track = require('../models/Track');

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

module.exports = { toggleLikeTrack, getLikedTracks };
