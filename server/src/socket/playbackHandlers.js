const Room = require('../models/Room');
const Track = require('../models/Track');
const MediaAsset = require('../models/MediaAsset');
const yts = require('yt-search');
const crypto = require('crypto');

function registerPlaybackHandlers(io, socket, roomCache) {
  // Helper: get room state from in-memory cache; load from DB if missing
  async function getState(roomId) {
    if (roomCache.has(roomId)) return roomCache.get(roomId);

    const room = await Room.findById(roomId);
    if (!room) return null;

    const state = {
      playbackState: {
        isPlaying: room.playbackState.isPlaying,
        serverStartTime: room.playbackState.serverStartTime,
        startPosition: room.playbackState.startPosition,
      },
      actionSequence: room.actionSequence,
      currentTrackId: room.currentTrackId ? room.currentTrackId.toString() : null,
      playbackMode: room.playbackMode || 'NORMAL',
    };
    roomCache.set(roomId, state);
    return state;
  }

  // Helper: persist cache state to DB asynchronously (fire-and-forget from hot path)
  function persistState(roomId, state) {
    Room.findByIdAndUpdate(roomId, {
      'playbackState.isPlaying': state.playbackState.isPlaying,
      'playbackState.serverStartTime': state.playbackState.serverStartTime,
      'playbackState.startPosition': state.playbackState.startPosition,
      actionSequence: state.actionSequence,
      currentTrackId: state.currentTrackId,
      playbackMode: state.playbackMode,
    }).catch((err) => console.error('persistState error:', err));
  }

  // Helper: reject stale action — send corrected state back to the requesting socket
  function rejectStale(socket, state) {
    socket.emit('room:staleAction', {
      currentState: {
        playbackState: state.playbackState,
        currentTrackId: state.currentTrackId,
        playbackMode: state.playbackMode,
      },
      actionSequence: state.actionSequence,
    });
  }

  // Helper: broadcast playback update to all room members
  function broadcast(roomId, state) {
    io.to(`room:${roomId}`).emit('playback:update', {
      playbackState: state.playbackState,
      actionSequence: state.actionSequence,
      currentTrackId: state.currentTrackId,
      playbackMode: state.playbackMode,
    });
  }

  // ── playback:play ──────────────────────────────────────────────────────────
  socket.on('playback:play', async ({ roomId, actionSequence }) => {
    const state = await getState(roomId);
    if (!state) return;

    // Synchronous check — no await between read and write
    if (actionSequence !== state.actionSequence) {
      return rejectStale(socket, state);
    }

    if (!state.playbackState.isPlaying) {
      state.playbackState.serverStartTime = Date.now();
      state.playbackState.isPlaying = true;
      state.actionSequence += 1;
    }

    persistState(roomId, state);
    broadcast(roomId, state);
  });

  // ── playback:pause ─────────────────────────────────────────────────────────
  socket.on('playback:pause', async ({ roomId, actionSequence }) => {
    const state = await getState(roomId);
    if (!state) return;

    if (actionSequence !== state.actionSequence) {
      return rejectStale(socket, state);
    }

    state.playbackState.startPosition =
      (Date.now() - state.playbackState.serverStartTime) / 1000;
    state.playbackState.isPlaying = false;
    state.actionSequence += 1;

    persistState(roomId, state);
    broadcast(roomId, state);
  });

  // ── playback:seek ──────────────────────────────────────────────────────────
  socket.on('playback:seek', async ({ roomId, actionSequence, positionMs }) => {
    const state = await getState(roomId);
    if (!state) return;

    if (actionSequence !== state.actionSequence) {
      return rejectStale(socket, state);
    }

    if (state.playbackState.isPlaying) {
      state.playbackState.serverStartTime = Date.now();
      state.playbackState.startPosition = positionMs / 1000;
    } else {
      state.playbackState.startPosition = positionMs / 1000;
    }
    state.actionSequence += 1;

    persistState(roomId, state);
    broadcast(roomId, state);
  });

  // ── playback:trackChange ───────────────────────────────────────────────────
  socket.on('playback:trackChange', async ({ roomId, trackId, actionSequence }) => {
    const state = await getState(roomId);
    if (!state) return;

    if (actionSequence !== state.actionSequence) {
      return rejectStale(socket, state);
    }

    // Step 1: Update the UI immediately to show the new track, but PAUSED
    state.currentTrackId = trackId;
    state.playbackState = { isPlaying: false, serverStartTime: 0, startPosition: 0 };
    state.actionSequence += 1;
    persistState(roomId, state);
    broadcast(roomId, state);

    // Step 2: Precache the track URL in the background (takes ~8s for YouTube)
    const track = await Track.findById(trackId).populate('mediaAssetId');
    if (track && track.mediaAssetId && track.mediaAssetId.source === 'YOUTUBE') {
      const { ensurePrecached } = require('../controllers/youtubeController');
      await ensurePrecached(track.mediaAssetId.youtubeId);
    }

    // Step 3: Refresh state and start playing if they didn't skip to another track!
    const newState = await getState(roomId);
    if (newState.currentTrackId === trackId && !newState.playbackState.isPlaying) {
      newState.playbackState = { isPlaying: true, serverStartTime: Date.now(), startPosition: 0 };
      newState.actionSequence += 1;
      persistState(roomId, newState);
      broadcast(roomId, newState);
    }
  });

  // ── playback:heartbeat ─────────────────────────────────────────────────────
  // Unicast to requesting socket only — no state mutation
  socket.on('playback:heartbeat', async ({ roomId }) => {
    const state = await getState(roomId);
    if (!state) return;

    socket.emit('playback:heartbeatResponse', {
      playbackState: state.playbackState,
      actionSequence: state.actionSequence,
      serverTime: Date.now(),
    });
  });

  // ── playback:mode ──────────────────────────────────────────────────────────
  socket.on('playback:mode', async ({ roomId, mode, actionSequence }) => {
    const state = await getState(roomId);
    if (!state) return;

    if (actionSequence !== state.actionSequence) {
      return rejectStale(socket, state);
    }

    state.playbackMode = mode;
    state.actionSequence += 1;
    persistState(roomId, state);
    broadcast(roomId, state);
  });

  // ── playback:next ──────────────────────────────────────────────────────────
  socket.on('playback:next', async ({ roomId, actionSequence }) => {
    const state = await getState(roomId);
    if (!state) return;

    if (actionSequence !== state.actionSequence) {
      return rejectStale(socket, state);
    }

    const room = await Room.findById(roomId);
    if (!room || room.trackIds.length === 0) return;

    const trackIds = room.trackIds.map((id) => id.toString());
    const currentIndex = trackIds.indexOf(state.currentTrackId);
    let nextIndex = 0;

    if (state.playbackMode === 'REPEAT_ONE') {
      nextIndex = currentIndex !== -1 ? currentIndex : 0;
    } else if (state.playbackMode === 'SHUFFLE') {
      nextIndex = Math.floor(Math.random() * trackIds.length);
    } else {
      nextIndex = currentIndex + 1;
      if (nextIndex >= trackIds.length) {
        nextIndex = 0;
        if (state.playbackMode !== 'REPEAT_ALL') {
          // AUTOPLAY LOGIC
          const currentTrack = await Track.findById(state.currentTrackId).populate('mediaAssetId');
          if (currentTrack && currentTrack.mediaAssetId.source === 'YOUTUBE') {
            const titleParts = currentTrack.title.split(/\||-|:/);
            let query = '';
            
            const artistLower = (currentTrack.artist || '').toLowerCase();
            const isLabel = ['t-series', 'aditya music', 'sony', 'zee', 'saregama', 'vevo', 'music', 'records', 'tips'].some(label => artistLower.includes(label));
            
            if (!isLabel && currentTrack.artist) {
              // It's a real artist channel! e.g. "Ed Sheeran"
              query = `${currentTrack.artist} top songs`;
            } else if (titleParts.length > 1) {
              // Usually the second part is the movie, album, or main artist
              query = `${titleParts[1].trim()} songs`;
            } else {
              // Fallback
              query = `${currentTrack.title} audio`;
            }

            try {
              const r = await yts(query);
              const allTracksInRoom = await Track.find({ _id: { $in: room.trackIds } }).populate('mediaAssetId');
              const existingYoutubeIds = allTracksInRoom.map(t => t.mediaAssetId?.youtubeId).filter(Boolean);

              // Filter out videos already in the room
              let validVideos = r.videos.filter(v => !existingYoutubeIds.includes(v.videoId));

              // Filter out videos that are just different versions of the EXACT same song
              // by finding the most prominent word in the current song title
              const firstPartWords = titleParts[0].toLowerCase().split(/\W+/).filter(w => w.length > 3);
              const signatureWord = firstPartWords[0];
              
              if (signatureWord) {
                let nonSimilarVideos = validVideos.filter(v => !v.title.toLowerCase().includes(signatureWord));
                if (nonSimilarVideos.length > 0) {
                  validVideos = nonSimilarVideos;
                }
              }

              // Pick a random video from the top 5 choices to ensure variety
              const maxChoice = Math.min(5, validVideos.length);
              const related = maxChoice > 0 ? validVideos[Math.floor(Math.random() * maxChoice)] : null;

              if (related) {
                // Find or create MediaAsset
                let asset = await MediaAsset.findOne({ youtubeId: related.videoId });
                if (!asset) {
                  const contentHash = crypto.createHash('sha256').update(`yt_${related.videoId}`).digest('hex');
                  asset = new MediaAsset({
                    contentHash,
                    source: 'YOUTUBE',
                    youtubeId: related.videoId,
                    durationMs: related.duration.seconds * 1000,
                  });
                  await asset.save();
                } else {
                  asset.refCount += 1;
                  await asset.save();
                }

                // Create new Track
                const newTrack = new Track({
                  roomId: room._id,
                  title: related.title,
                  artist: related.author.name,
                  albumArtUrl: related.thumbnail,
                  mediaAssetId: asset._id,
                  uploadedBy: currentTrack.uploadedBy,
                });
                await newTrack.save();

                room.trackIds.push(newTrack._id);
                await room.save();

                // Append to trackIds array in memory so it selects it immediately
                trackIds.push(newTrack._id.toString());
                nextIndex = trackIds.length - 1;

                // Broadcast track added to all users in room
                const populatedTrack = await Track.findById(newTrack._id).populate('mediaAssetId').populate('uploadedBy', 'username');
                
                // Format track for client
                const formattedTrack = {
                  _id: populatedTrack._id,
                  title: populatedTrack.title,
                  artist: populatedTrack.artist,
                  albumArtUrl: populatedTrack.albumArtUrl,
                  source: populatedTrack.mediaAssetId.source,
                  youtubeId: populatedTrack.mediaAssetId.youtubeId,
                  cloudinaryUrl: populatedTrack.mediaAssetId.cloudinaryUrl,
                  durationMs: populatedTrack.mediaAssetId.durationMs,
                  uploadedBy: populatedTrack.uploadedBy,
                };

                io.to(`room:${roomId}`).emit('room:trackAdded', { track: formattedTrack });
              }
            } catch (err) {
              console.error('Autoplay search error:', err);
            }
          }

          if (nextIndex === 0) {
            // NORMAL: Wrap back to the first track but pause playback if autoplay failed/wasn't youtube
            state.currentTrackId = trackIds[nextIndex];
            state.playbackState = { isPlaying: false, serverStartTime: 0, startPosition: 0 };
            state.actionSequence += 1;
            persistState(roomId, state);
            return broadcast(roomId, state);
          }
        }
      }
    }

    // Step 1: Update UI to new track, paused
    state.currentTrackId = trackIds[nextIndex];
    state.playbackState = { isPlaying: false, serverStartTime: 0, startPosition: 0 };
    state.actionSequence += 1;
    persistState(roomId, state);
    broadcast(roomId, state);

    // Step 2: Precache
    const track = await Track.findById(state.currentTrackId).populate('mediaAssetId');
    if (track && track.mediaAssetId && track.mediaAssetId.source === 'YOUTUBE') {
      const { ensurePrecached } = require('../controllers/youtubeController');
      await ensurePrecached(track.mediaAssetId.youtubeId);
    }

    // Step 3: Play if still on this track
    const newState = await getState(roomId);
    if (newState.currentTrackId === trackIds[nextIndex] && !newState.playbackState.isPlaying) {
      newState.playbackState = { isPlaying: true, serverStartTime: Date.now(), startPosition: 0 };
      newState.actionSequence += 1;
      persistState(roomId, newState);
      broadcast(roomId, newState);
    }
  });

  // ── playback:prev ──────────────────────────────────────────────────────────
  socket.on('playback:prev', async ({ roomId, actionSequence }) => {
    const state = await getState(roomId);
    if (!state) return;

    if (actionSequence !== state.actionSequence) {
      return rejectStale(socket, state);
    }

    const room = await Room.findById(roomId);
    if (!room || room.trackIds.length === 0) return;

    // If playing for more than 3 seconds, restart the current track
    const currentPosition = state.playbackState.isPlaying 
      ? (Date.now() - state.playbackState.serverStartTime) / 1000 
      : state.playbackState.startPosition;
      
    if (currentPosition > 3) {
      if (state.playbackState.isPlaying) {
        state.playbackState.serverStartTime = Date.now();
        state.playbackState.startPosition = 0;
      }
      state.actionSequence += 1;
      persistState(roomId, state);
      return broadcast(roomId, state);
    }

    const trackIds = room.trackIds.map((id) => id.toString());
    const currentIndex = trackIds.indexOf(state.currentTrackId);
    let prevIndex = 0;

    if (state.playbackMode === 'SHUFFLE') {
      prevIndex = Math.floor(Math.random() * trackIds.length);
    } else {
      prevIndex = currentIndex - 1;
      if (prevIndex < 0) {
        if (state.playbackMode === 'REPEAT_ALL') {
          prevIndex = trackIds.length - 1;
        } else {
          prevIndex = 0;
        }
      }
    }

    // Step 1: Update UI to new track, paused
    state.currentTrackId = trackIds[prevIndex];
    state.playbackState = { isPlaying: false, serverStartTime: 0, startPosition: 0 };
    state.actionSequence += 1;
    persistState(roomId, state);
    broadcast(roomId, state);

    // Step 2: Precache
    const track = await Track.findById(state.currentTrackId).populate('mediaAssetId');
    if (track && track.mediaAssetId && track.mediaAssetId.source === 'YOUTUBE') {
      const { ensurePrecached } = require('../controllers/youtubeController');
      await ensurePrecached(track.mediaAssetId.youtubeId);
    }

    // Step 3: Play if still on this track
    const newState = await getState(roomId);
    if (newState.currentTrackId === trackIds[prevIndex] && !newState.playbackState.isPlaying) {
      newState.playbackState = { isPlaying: true, serverStartTime: Date.now(), startPosition: 0 };
      newState.actionSequence += 1;
      persistState(roomId, newState);
      broadcast(roomId, newState);
    }
  });
}

module.exports = { registerPlaybackHandlers };
