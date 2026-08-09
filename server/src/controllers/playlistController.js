const Playlist = require('../models/Playlist');

async function createPlaylist(req, res) {
  try {
    const { name } = req.body;
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: 'Playlist name is required' });
    }

    const playlist = await Playlist.create({
      name: name.trim(),
      userId: req.user.userId,
      trackIds: [],
    });

    return res.status(201).json({ playlist });
  } catch (err) {
    console.error('createPlaylist error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function getPlaylists(req, res) {
  try {
    const playlists = await Playlist.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    return res.json({ playlists });
  } catch (err) {
    console.error('getPlaylists error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function getPlaylist(req, res) {
  try {
    const playlist = await Playlist.findOne({ _id: req.params.id, userId: req.user.userId }).populate('trackIds');
    if (!playlist) return res.status(404).json({ message: 'Playlist not found' });
    return res.json({ playlist });
  } catch (err) {
    console.error('getPlaylist error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function updatePlaylist(req, res) {
  try {
    const { name } = req.body;
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: 'Playlist name is required' });
    }

    const playlist = await Playlist.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      { name: name.trim() },
      { new: true }
    );

    if (!playlist) return res.status(404).json({ message: 'Playlist not found' });
    return res.json({ playlist });
  } catch (err) {
    console.error('updatePlaylist error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function deletePlaylist(req, res) {
  try {
    const playlist = await Playlist.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    if (!playlist) return res.status(404).json({ message: 'Playlist not found' });
    return res.json({ message: 'Playlist deleted' });
  } catch (err) {
    console.error('deletePlaylist error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function addTrackToPlaylist(req, res) {
  try {
    const { trackId } = req.body;
    if (!trackId) return res.status(400).json({ message: 'trackId is required' });

    const playlist = await Playlist.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!playlist) return res.status(404).json({ message: 'Playlist not found' });

    if (!playlist.trackIds.includes(trackId)) {
      playlist.trackIds.push(trackId);
      await playlist.save();
    }

    return res.json({ playlist });
  } catch (err) {
    console.error('addTrackToPlaylist error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function removeTrackFromPlaylist(req, res) {
  try {
    const { trackId } = req.params;
    const playlist = await Playlist.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!playlist) return res.status(404).json({ message: 'Playlist not found' });

    playlist.trackIds = playlist.trackIds.filter(id => id.toString() !== trackId);
    await playlist.save();

    return res.json({ playlist });
  } catch (err) {
    console.error('removeTrackFromPlaylist error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = {
  createPlaylist,
  getPlaylists,
  getPlaylist,
  updatePlaylist,
  deletePlaylist,
  addTrackToPlaylist,
  removeTrackFromPlaylist
};
