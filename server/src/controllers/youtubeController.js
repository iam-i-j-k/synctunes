const yts = require('yt-search');
const ytdl = require('@distube/ytdl-core');
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

    const r = await yts(q.trim());
    // Only return the top 15 videos
    const videos = r.videos.slice(0, 15).map(v => ({
      id: v.videoId,
      title: v.title,
      artist: v.author.name,
      thumbnail: v.thumbnail,
      durationMs: v.duration.seconds * 1000,
    }));

    return res.json({ videos });
  } catch (err) {
    console.error('youtube search error:', err);
    return res.status(500).json({ message: 'Server error during YouTube search' });
  }
}

async function streamYouTube(req, res) {
  try {
    let { videoId } = req.params;
    if (videoId && videoId.endsWith('.webm')) {
      videoId = videoId.replace('.webm', '');
    }
    
    if (!videoId) {
      return res.status(400).json({ message: 'Video ID is required' });
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Configure response headers for audio stream
    res.setHeader('Content-Type', 'audio/webm');

    const stream = ytdl(videoUrl, { filter: 'audioonly', quality: 'highestaudio' });
    
    stream.on('error', (err) => {
      console.error('ytdl stream error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Failed to stream audio' });
      }
    });

    stream.pipe(res);
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

    return res.status(201).json({ track: formattedTrack });
  } catch (err) {
    console.error('youtube addTrack error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { searchYouTube, streamYouTube, addYouTubeTrack };
