const Track = require('../models/Track');
const Room = require('../models/Room');

async function search(req, res) {
  try {
    const { q } = req.query;
    if (!q || q.trim().length === 0) {
      return res.json({ tracks: [], rooms: [] });
    }

    const query = q.trim();
    // Escape special regex characters for safety
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');

    // Search tracks by title or artist, populate media asset for cloudinaryUrl/durationMs
    const tracks = await Track.find({
      $or: [{ title: regex }, { artist: regex }],
    })
      .populate('mediaAssetId')
      .limit(15)
      .lean();

    // Flatten mediaAssetId fields to top level
    const formattedTracks = tracks.map((track) => {
      if (track.mediaAssetId && typeof track.mediaAssetId === 'object') {
        track.cloudinaryUrl = track.mediaAssetId.cloudinaryUrl;
        track.cloudinaryPublicId = track.mediaAssetId.cloudinaryPublicId;
        track.durationMs = track.mediaAssetId.durationMs;
      }
      return track;
    });

    // Search public rooms by name
    const rooms = await Room.find({
      name: regex,
      isPrivate: false,
    })
      .populate('hostId', 'username')
      .populate('trackIds', 'albumArtUrl')
      .limit(10)
      .lean();

    return res.json({ tracks: formattedTracks, rooms });
  } catch (err) {
    console.error('search error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { search };
