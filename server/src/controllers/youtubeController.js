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

const urlCache = new Map();

async function streamYouTube(req, res) {
  try {
    let { videoId } = req.params;
    if (videoId) {
      videoId = videoId.replace('.webm', '').replace('.m4a', '');
    }
    
    if (!videoId) {
      return res.status(400).json({ message: 'Video ID is required' });
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    let cachedData = urlCache.get(videoId);

    if (!cachedData) {
      try {
        const output = await youtubedl(videoUrl, {
          dumpJson: true,
          format: 'bestaudio[ext=m4a]/bestaudio',
          noWarnings: true,
          noCallHome: true,
          noCheckCertificate: true
        });
        if (output && output.url) {
          cachedData = { url: output.url, headers: output.http_headers || {} };
          urlCache.set(videoId, cachedData);
          // Keep cache for 3 hours
          setTimeout(() => urlCache.delete(videoId), 3 * 60 * 60 * 1000);
        }
      } catch (err) {
        console.error('yt-dlp extract error:', err.message);
        return res.status(500).json({ message: 'Failed to extract stream URL' });
      }
    }

    if (!cachedData || !cachedData.url) {
      return res.status(500).json({ message: 'Stream URL not found' });
    }

    // Proxy the stream using https to forward the Range header properly
    const https = require('https');
    const options = { headers: { ...cachedData.headers } };
    
    // Ensure User-Agent is present
    if (!options.headers['User-Agent']) {
      options.headers['User-Agent'] = req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }
    
    if (req.headers.range) {
      options.headers['Range'] = req.headers.range;
    }

    const proxyReq = https.get(cachedData.url, options, (proxyRes) => {
      // Forward all relevant headers from the proxy response (includes 206 Partial Content, Content-Length, Content-Range)
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('Stream proxy error:', err.message);
      if (!res.headersSent) {
        res.status(500).end();
      }
    });

    req.on('close', () => {
      proxyReq.destroy();
    });

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

    // Pre-cache the stream URL in the background to eliminate the 10-second delay when the user clicks play
    setTimeout(async () => {
      try {
        if (!urlCache.has(videoId)) {
          const output = await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
            dumpJson: true,
            format: 'bestaudio[ext=m4a]/bestaudio',
            noWarnings: true,
            noCallHome: true,
            noCheckCertificate: true
          });
          if (output && output.url) {
            urlCache.set(videoId, { url: output.url, headers: output.http_headers || {} });
            setTimeout(() => urlCache.delete(videoId), 3 * 60 * 60 * 1000);
          }
        }
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
  if (!videoId || urlCache.has(videoId)) return;
  try {
    const output = await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
      dumpJson: true,
      format: 'bestaudio[ext=m4a]/bestaudio',
      noWarnings: true,
      noCallHome: true,
      noCheckCertificate: true
    });
    if (output && output.url) {
      urlCache.set(videoId, { url: output.url, headers: output.http_headers || {} });
      setTimeout(() => urlCache.delete(videoId), 3 * 60 * 60 * 1000);
    }
  } catch (err) {
    console.error('ensurePrecached failed:', err.message);
  }
}

module.exports = { searchYouTube, streamYouTube, addYouTubeTrack, ensurePrecached };
