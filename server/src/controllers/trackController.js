const getCloudinary = require('../config/cloudinary');
const Track = require('../models/Track');
const Room = require('../models/Room');

function getTrackMeta(body, file, index) {
  const titleValues = Array.isArray(body.title) ? body.title : body.title ? [body.title] : [];

  const fallbackTitle = file.originalname
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]/g, ' ')
    .trim();

  let title = (titleValues[index] || titleValues[0] || fallbackTitle || 'Untitled').trim();
  
  // Clean up common junk from downloaded mp3 file names
  title = title.replace(/[-_]?\s*\[?\(?(NaaSongs|PagalWorld|SenSongs|Masstamilan|DJMaza|Wapking|MyMp3Song|Webmusic|PagalFree)[^\]\)]*\]?\)?/gi, '');
  title = title.replace(/_+/g, ' ');
  title = title.replace(/-+/g, ' ');
  title = title.replace(/\s+/g, ' ').trim();

  return { title };
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
    
    let mm;
    try {
      mm = await import('music-metadata');
    } catch(e) {
      console.error("Failed to import music-metadata", e);
    }

    for (const [index, file] of files.entries()) {
      let { title } = getTrackMeta(req.body, file, index);
      let artist = '';
      let albumArtUrl = null;

      let embeddedPicture = null;
      if (mm) {
        try {
          const metadata = await mm.parseBuffer(file.buffer, file.mimetype);
          
          // Use ID3 title only if the user didn't explicitly provide one in the body
          // The body title might just be the fallback title, let's check if it matches fallback
          const titleValues = Array.isArray(req.body.title) ? req.body.title : req.body.title ? [req.body.title] : [];
          const userProvidedTitle = titleValues[index] || titleValues[0];
          
          if (!userProvidedTitle && metadata.common.title) {
            title = metadata.common.title.trim();
          }
          if (metadata.common.artist) {
            artist = metadata.common.artist.trim();
          }

          if (metadata.common.picture && metadata.common.picture.length > 0) {
            embeddedPicture = metadata.common.picture[0];
          }
        } catch(err) {
          console.warn('music-metadata parsing failed for', file.originalname, err.message);
        }
      }

      if (title) {
        try {
          const fetchObj = typeof fetch !== 'undefined' ? fetch : (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
          
          const searchParams = [
            { term: `${title} ${artist}`.trim(), entity: 'song' },
            { term: title.trim(), entity: 'song' },
            { term: title.trim(), entity: 'album' }
          ];

          let found = false;
          for (const params of searchParams) {
            if (!params.term || found) continue;
            
            const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(params.term)}&entity=${params.entity}&limit=1`;
            const response = await fetchObj(itunesUrl);
            
            if (response.ok) {
              const data = await response.json();
              if (data.results && data.results.length > 0) {
                if (data.results[0].artworkUrl100) {
                  albumArtUrl = data.results[0].artworkUrl100.replace('100x100bb', '600x600bb');
                }
                if (!artist && data.results[0].artistName) {
                  artist = data.results[0].artistName;
                }
                found = true;
                break;
              }
            }
          }
        } catch (err) {
          console.warn('iTunes API fetch failed:', err.message);
        }
      }

      if (!albumArtUrl && embeddedPicture) {
        try {
          const imgUploadResult = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              { resource_type: 'image', folder: 'synctunes/album-art' },
              (error, result) => {
                if (error) return reject(error);
                resolve(result);
              }
            );
            stream.end(embeddedPicture.data);
          });
          albumArtUrl = imgUploadResult.secure_url;
        } catch (err) {
          console.warn('Failed to upload embedded picture to cloudinary', err.message);
        }
      }

      if (!title) {
        return res.status(400).json({ message: 'title is required for every upload' });
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
        artist,
        albumArtUrl,
        cloudinaryUrl: uploadResult.secure_url,
        cloudinaryPublicId: uploadResult.public_id,
        durationMs,
        uploadedBy: req.user.userId,
      });

      createdTracks.push(track);
      room.trackIds.push(track._id);

      const io = req.app.locals.io;
      if (io) {
        io.to(`room:${roomId}`).emit('room:trackAdded', { track });
      }
    }

    await room.save();

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

    const tracks = await Track.find({
      $or: [{ roomId }, { _id: { $in: room.trackIds || [] } }],
    }).sort({ createdAt: 1 });
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

async function addExistingTrack(req, res) {
  try {
    const { roomId } = req.params;
    const { trackId } = req.body;

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Room not found' });
    const isMember =
      room.hostId.toString() === req.user.userId ||
      room.memberIds.some((id) => id.toString() === req.user.userId);
    if (!isMember) return res.status(403).json({ message: 'You are not a member of this room' });

    const track = await Track.findById(trackId);
    if (!track) return res.status(404).json({ message: 'Track not found' });

    if (!room.trackIds.includes(track._id)) {
      room.trackIds.push(track._id);
      await room.save();
      
      const io = req.app.locals.io;
      if (io) {
        io.to(`room:${roomId}`).emit('room:trackAdded', { track });
      }
    }

    return res.json({ track });
  } catch (err) {
    console.error('addExistingTrack error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { uploadTrack, listTracks, deleteTrack, addExistingTrack };
