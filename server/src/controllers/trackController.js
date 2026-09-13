const crypto = require('crypto');
const getCloudinary = require('../config/cloudinary');
const Track = require('../models/Track');
const MediaAsset = require('../models/MediaAsset');
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

/**
 * Flatten a populated Track doc so `cloudinaryUrl`, `cloudinaryPublicId`,
 * and `durationMs` appear at the top level — keeping the API response
 * shape identical for the client.
 */
function formatTrack(track) {
  if (!track) return track;
  const obj = typeof track.toObject === 'function' ? track.toObject() : { ...track };
  if (obj.mediaAssetId && typeof obj.mediaAssetId === 'object') {
    obj.cloudinaryUrl = obj.mediaAssetId.cloudinaryUrl;
    obj.cloudinaryPublicId = obj.mediaAssetId.cloudinaryPublicId;
    obj.durationMs = obj.mediaAssetId.durationMs;
    obj.source = obj.mediaAssetId.source;
    obj.youtubeId = obj.mediaAssetId.youtubeId;
  }
  return obj;
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

      // ── Deduplication: compute SHA-256 hash of the audio buffer ──
      const contentHash = crypto.createHash('sha256').update(file.buffer).digest('hex');

      let mediaAsset = await MediaAsset.findOne({ contentHash });

      if (mediaAsset) {
        // Check if the exact same song is already in this room
        const existingTrack = await Track.findOne({ roomId, mediaAssetId: mediaAsset._id });
        if (existingTrack) {
          // It's already in the room. Just return the existing track silently.
          createdTracks.push(formatTrack(await existingTrack.populate('mediaAssetId')));
          continue; // Skip creating a new Track and don't increment refCount
        }
        
        // Dedup hit — reuse existing Cloudinary file, bump refCount
        await MediaAsset.updateOne({ _id: mediaAsset._id }, { $inc: { refCount: 1 } });
      } else {
        // New file — upload to Cloudinary
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

        mediaAsset = await MediaAsset.create({
          contentHash,
          cloudinaryUrl: uploadResult.secure_url,
          cloudinaryPublicId: uploadResult.public_id,
          durationMs,
          refCount: 1,
        });
      }

      const track = await Track.create({
        roomId,
        title: title.trim(),
        artist,
        albumArtUrl,
        mediaAssetId: mediaAsset._id,
        uploadedBy: req.user.userId,
      });

      createdTracks.push(formatTrack(
        await Track.findById(track._id).populate('mediaAssetId')
      ));
      room.trackIds.push(track._id);

      const io = req.app.locals.io;
      if (io) {
        io.to(`room:${roomId}`).emit('room:trackAdded', { track: createdTracks[createdTracks.length - 1] });
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
    }).populate('mediaAssetId');

    const trackMap = new Map();
    tracks.forEach(t => trackMap.set(t._id.toString(), t));

    const sortedTracks = [];
    const trackIdsStrings = (room.trackIds || []).map(id => id.toString());

    // Add tracks in the order of room.trackIds (source of truth for playback queue)
    trackIdsStrings.forEach(id => {
      if (trackMap.has(id)) {
        sortedTracks.push(trackMap.get(id));
        trackMap.delete(id);
      }
    });

    // Append any remaining tracks not in trackIds (e.g. legacy/orphaned uploads)
    const remainingTracks = Array.from(trackMap.values()).sort((a, b) => a.createdAt - b.createdAt);
    sortedTracks.push(...remainingTracks);

    return res.json({ tracks: sortedTracks.map(formatTrack) });
  } catch (err) {
    console.error('listTracks error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function deleteTrack(req, res) {
  try {
    const targetRoomId = req.query.roomId;
    if (!targetRoomId) {
      return res.status(400).json({ message: 'roomId query parameter is required' });
    }

    const track = await Track.findById(req.params.id).populate('mediaAssetId');
    if (!track) return res.status(404).json({ message: 'Track not found' });

    const room = await Room.findById(targetRoomId);
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const isUploader = track.uploadedBy.toString() === req.user.userId;
    const isHost = room.hostId.toString() === req.user.userId;

    if (!isUploader && !isHost) {
      return res.status(403).json({ message: 'Not authorized to remove this track from the room' });
    }

    // 1. Remove from the target room's trackIds array
    room.trackIds = room.trackIds.filter(id => id.toString() !== track._id.toString());

    // Check if the deleted track is currently playing in this room
    let currentTrackChanged = false;
    if (room.currentTrackId && room.currentTrackId.toString() === track._id.toString()) {
      currentTrackChanged = true;
      if (room.trackIds.length > 0) {
        room.currentTrackId = room.trackIds[0];
        room.playbackState = { isPlaying: false, serverStartTime: 0, startPosition: 0 };
      } else {
        room.currentTrackId = null;
        room.playbackState = { isPlaying: false, serverStartTime: 0, startPosition: 0 };
      }
      room.actionSequence = (room.actionSequence || 0) + 1;
    }
    await room.save();

    // 2. Broadcast removal to the room
    const io = req.app.locals.io;
    if (io) {
      io.to(`room:${targetRoomId}`).emit('room:trackRemoved', { trackId: track._id });
      if (currentTrackChanged) {
        try {
          const { roomCache } = require('../socket');
          if (roomCache && roomCache.has(targetRoomId)) {
            const cached = roomCache.get(targetRoomId);
            cached.currentTrackId = room.currentTrackId ? room.currentTrackId.toString() : null;
            cached.playbackState = { ...room.playbackState };
            cached.actionSequence = room.actionSequence;
          }
        } catch (e) {}
        io.to(`room:${targetRoomId}`).emit('playback:update', {
          playbackState: room.playbackState,
          actionSequence: room.actionSequence,
          currentTrackId: room.currentTrackId ? room.currentTrackId.toString() : null,
          playbackMode: room.playbackMode || 'NORMAL',
        });
      }
    }

    // 3. Check if the track is still referenced in ANY room
    const isTrackUsedElsewhere = await Room.exists({ trackIds: track._id });
    
    let cloudinaryWarning = null;
    
    // 4. Garbage collect if no longer used
    if (!isTrackUsedElsewhere) {
      if (track.mediaAssetId) {
        const assetId = typeof track.mediaAssetId === 'object' ? track.mediaAssetId._id : track.mediaAssetId;
        const asset = await MediaAsset.findByIdAndUpdate(
          assetId,
          { $inc: { refCount: -1 } },
          { new: true }
        );

        if (asset && asset.refCount <= 0) {
          if (asset.source !== 'YOUTUBE' && asset.cloudinaryPublicId) {
            const cloudinary = getCloudinary();
            try {
              await cloudinary.uploader.destroy(asset.cloudinaryPublicId, { resource_type: 'video' });
            } catch (cloudErr) {
              console.warn(`Cloudinary destroy failed for ${asset.cloudinaryPublicId}:`, cloudErr);
              cloudinaryWarning = `Cloudinary delete failed for publicId ${asset.cloudinaryPublicId}. File may need manual cleanup.`;
            }
          }
          await MediaAsset.findByIdAndDelete(asset._id);
        }
      }
      await Track.findByIdAndDelete(track._id);
    }

    if (cloudinaryWarning) {
      return res.status(207).json({ message: 'Track removed with warning', warning: cloudinaryWarning });
    }
    return res.json({ message: 'Track removed from room' });
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

    const track = await Track.findById(trackId).populate('mediaAssetId');
    if (!track) return res.status(404).json({ message: 'Track not found' });

    const isAlreadyInRoom = room.trackIds.some(id => id && id.toString() === track._id.toString());
    if (!isAlreadyInRoom) {
      room.trackIds.push(track._id);
      await room.save();
      
      // Increment MediaAsset refCount so the asset is protected across rooms
      if (track.mediaAssetId) {
        const assetId = typeof track.mediaAssetId === 'object' ? track.mediaAssetId._id : track.mediaAssetId;
        await MediaAsset.findByIdAndUpdate(assetId, { $inc: { refCount: 1 } });
      }

      const io = req.app.locals.io;
      if (io) {
        io.to(`room:${roomId}`).emit('room:trackAdded', { track: formatTrack(track) });
      }
    }

    return res.json({ track: formatTrack(track) });
  } catch (err) {
    console.error('addExistingTrack error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { uploadTrack, listTracks, deleteTrack, addExistingTrack };
