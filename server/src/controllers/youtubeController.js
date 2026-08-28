const youtubedl = require('youtube-dl-exec');
const crypto = require('crypto');
const Track = require('../models/Track');
const MediaAsset = require('../models/MediaAsset');
const Room = require('../models/Room');

async function searchYouTube(req, res) {
  try {
    const { q } = req.query;
    if (!q || q.trim().length === 0) {
      return res.json({ videos: [] });
    }

    const output = await youtubedl(`ytsearch15:${q.trim()}`, {
      dumpSingleJson: true,
      noWarnings: true,
      flatPlaylist: true,
      noCallHome: true,
      noCheckCertificate: true
    });

    if (!output || !output.entries) {
      return res.json({ videos: [] });
    }

    const videos = output.entries.map(v => {
      let thumbnail = '';
      if (v.thumbnails && v.thumbnails.length > 0) {
        thumbnail = v.thumbnails[v.thumbnails.length - 1].url;
      }
      return {
        id: v.id,
        title: v.title,
        artist: v.uploader || 'YouTube',
        thumbnail: thumbnail,
        durationMs: (v.duration || 0) * 1000,
      };
    });

    return res.json({ videos });
  } catch (err) {
    console.error('youtube search error:', err);
    return res.status(500).json({ message: 'Server error during YouTube search' });
  }
}

const path = require('path');
const fs = require('fs');

const CACHE_DIR = path.join(__dirname, '../../cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Keep track of downloads in progress so we don't download the same file twice simultaneously
const downloadPromises = new Map();

async function downloadToCache(videoId) {
  const filePath = path.join(CACHE_DIR, `${videoId}.m4a`);
  
  if (fs.existsSync(filePath)) {
    return filePath; // Already cached
  }

  if (downloadPromises.has(videoId)) {
    return downloadPromises.get(videoId);
  }

  const promise = new Promise(async (resolve, reject) => {
    try {
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      await youtubedl(videoUrl, {
        format: 'bestaudio[ext=m4a]/bestaudio',
        output: filePath,
        noWarnings: true,
        noCallHome: true,
        noCheckCertificate: true,
      });
      resolve(filePath);
    } catch (err) {
      console.error('yt-dlp download error:', err.message);
      reject(err);
    } finally {
      downloadPromises.delete(videoId);
    }
  });

  downloadPromises.set(videoId, promise);
  return promise;
}

async function streamYouTube(req, res) {
  try {
    let { videoId } = req.params;
    if (videoId) {
      videoId = videoId.replace('.webm', '').replace('.m4a', '');
    }
    
    if (!videoId) {
      return res.status(400).json({ message: 'Video ID is required' });
    }

    try {
      const filePath = await downloadToCache(videoId);
      // Let Express handle the streaming, Range requests, and chunking perfectly!
      return res.sendFile(filePath);
    } catch (err) {
      return res.status(500).json({ message: 'Failed to download and stream track' });
    }
  } catch (err) {
    console.error('youtube stream wrapper error:', err);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server error' });
    }
  }
}

async function addYouTubeTrack(req, res) {
  try {
    const { roomId, videoId, title, artist, thumbnail, durationMs } = req.body;

    if (!roomId || !videoId || !title) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Room not found' });
    const isMember =
      room.hostId.toString() === req.user.userId ||
      room.memberIds.some((id) => id.toString() === req.user.userId);
    if (!isMember) return res.status(403).json({ message: 'You are not a member of this room' });

    // Deterministic hash based on YouTube Video ID
    const contentHash = crypto.createHash('sha256').update(`youtube:${videoId}`).digest('hex');

    let mediaAsset = await MediaAsset.findOne({ contentHash });

    if (mediaAsset) {
      // Check if it's already in the room
      const existingTrack = await Track.findOne({ roomId, mediaAssetId: mediaAsset._id });
      if (existingTrack) {
        return res.status(400).json({ message: 'Track already exists in this room' });
      }
      await MediaAsset.updateOne({ _id: mediaAsset._id }, { $inc: { refCount: 1 } });
    } else {
      mediaAsset = await MediaAsset.create({
        contentHash,
        source: 'YOUTUBE',
        youtubeId: videoId,
        durationMs: durationMs || 0,
        refCount: 1,
      });
    }

    const track = await Track.create({
      roomId,
      title,
      artist: artist || 'YouTube',
      albumArtUrl: thumbnail,
      mediaAssetId: mediaAsset._id,
      uploadedBy: req.user.userId,
    });

    const populatedTrack = await Track.findById(track._id).populate('mediaAssetId');
    
    // Format track to match the frontend shape (flattened mediaAsset properties)
    const formattedTrack = populatedTrack.toObject();
    formattedTrack.youtubeId = mediaAsset.youtubeId;
    formattedTrack.source = mediaAsset.source;
    formattedTrack.durationMs = mediaAsset.durationMs;

    room.trackIds.push(track._id);
    await room.save();

    const io = req.app.locals.io;
    if (io) {
      io.to(`room:${roomId}`).emit('room:trackAdded', { track: formattedTrack });
    }

    // Pre-cache the stream URL in the background
    setTimeout(async () => {
      try {
        await downloadToCache(videoId);
      } catch (err) {
        console.error('Background precache failed:', err.message);
      }
    }, 0);

    return res.status(201).json({ track: formattedTrack });
  } catch (err) {
    console.error('youtube addTrack error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function ensurePrecached(videoId) {
  if (!videoId) return;
  try {
    await downloadToCache(videoId);
  } catch (err) {
    console.error('ensurePrecached failed:', err.message);
  }
}

module.exports = { searchYouTube, streamYouTube, addYouTubeTrack, ensurePrecached };
