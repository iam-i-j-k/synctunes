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
    const user = await User.findById(req.user.userId).populate('likedTracks');
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    return res.json({ tracks: user.likedTracks });
  } catch (err) {
    console.error('getLikedTracks error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { toggleLikeTrack, getLikedTracks };
