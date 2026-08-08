const getCloudinary = require('../config/cloudinary');
const Track = require('../models/Track');
const Room = require('../models/Room');

function getTrackMeta(body, file, index) {
  const titleValues = Array.isArray(body.title) ? body.title : body.title ? [body.title] : [];
  const artistValues = Array.isArray(body.artist) ? body.artist : body.artist ? [body.artist] : [];

  const fallbackTitle = file.originalname
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]/g, ' ')
    .trim();

  const title = (titleValues[index] || titleValues[0] || fallbackTitle || 'Untitled').trim();
  const artist = (artistValues[index] || artistValues[0] || 'Unknown Artist').trim();

  return { title, artist };
}

// Upload one or more audio files to Cloudinary and save Track docs
async function uploadTrack(req, res) {
  try {
    const { roomId } = req.params;
    const files = Array.isArray(req.files) ? req.files : req.file ? [req.file] : [];

    if (files.length === 0) {
      return res.status(400).json({ message: 'No audio file provided' });
    }

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Room not found' });
    const isMember =
      room.hostId.toString() === req.user.userId ||
      room.memberIds.some((id) => id.toString() === req.user.userId);
    if (!isMember) return res.status(403).json({ message: 'You are not a member of this room' });

    const cloudinary = getCloudinary();

    const cfg = cloudinary.config();
    if (!cfg.cloud_name || !cfg.api_key || !cfg.api_secret) {
      console.error('Cloudinary env vars missing:', {
        cloud_name: cfg.cloud_name,
        api_key: cfg.api_key ? '[set]' : '[missing]',
        api_secret: cfg.api_secret ? '[set]' : '[missing]',
      });
      return res.status(500).json({ message: 'Cloudinary is not configured on the server' });
    }

    const createdTracks = [];
    for (const [index, file] of files.entries()) {
      const { title, artist } = getTrackMeta(req.body, file, index);

      if (!title || !artist) {
        return res.status(400).json({ message: 'title and artist are required for every upload' });
      }

      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: 'video', folder: 'synctunes/tracks' },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        );
        stream.end(file.buffer);
      });

      const durationMs = Math.round((uploadResult.duration || 0) * 1000);

      const track = await Track.create({
        roomId,
        title: title.trim(),
        artist: artist.trim(),
        cloudinaryUrl: uploadResult.secure_url,
        cloudinaryPublicId: uploadResult.public_id,
        durationMs,
        uploadedBy: req.user.userId,
      });

      createdTracks.push(track);

      const io = req.app.locals.io;
      if (io) {
        io.to(`room:${roomId}`).emit('room:trackAdded', { track });
      }
    }

    return res.status(201).json({
      tracks: createdTracks,
      track: createdTracks[0] || null,
    });
  } catch (err) {
    console.error('uploadTrack error:', err);
    return res.status(500).json({ message: 'Server error during upload', detail: err.message });
  }
}

async function listTracks(req, res) {
  try {
    const { roomId } = req.params;

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Room not found' });
    const isMember =
      room.hostId.toString() === req.user.userId ||
      room.memberIds.some((id) => id.toString() === req.user.userId);
    if (!isMember) return res.status(403).json({ message: 'You are not a member of this room' });

    const tracks = await Track.find({ roomId }).sort({ createdAt: 1 });
    return res.json({ tracks });
  } catch (err) {
    console.error('listTracks error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function deleteTrack(req, res) {
  try {
    const track = await Track.findById(req.params.id);
    if (!track) return res.status(404).json({ message: 'Track not found' });

    const room = await Room.findById(track.roomId);
    const isUploader = track.uploadedBy.toString() === req.user.userId;
    const isHost = room && room.hostId.toString() === req.user.userId;

    if (!isUploader && !isHost) {
      return res.status(403).json({ message: 'Not authorized to delete this track' });
    }

    const cloudinary = getCloudinary();
    let cloudinaryWarning = null;
    try {
      await cloudinary.uploader.destroy(track.cloudinaryPublicId, { resource_type: 'video' });
    } catch (cloudErr) {
      console.warn(`Cloudinary destroy failed for ${track.cloudinaryPublicId}:`, cloudErr);
      cloudinaryWarning = `Cloudinary delete failed for publicId ${track.cloudinaryPublicId}. File may need manual cleanup.`;
    }

    await Track.findByIdAndDelete(track._id);

    // Broadcast deletion to room
    const io = req.app.locals.io;
    if (io) {
      io.to(`room:${track.roomId}`).emit('room:trackRemoved', { trackId: track._id });
    }

    if (cloudinaryWarning) {
      return res.status(207).json({ message: 'Track deleted with warning', warning: cloudinaryWarning });
    }
    return res.json({ message: 'Track deleted' });
  } catch (err) {
    console.error('deleteTrack error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { uploadTrack, listTracks, deleteTrack };
