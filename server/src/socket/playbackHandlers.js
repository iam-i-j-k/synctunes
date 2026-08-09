const Room = require('../models/Room');

function registerPlaybackHandlers(io, socket, roomCache) {
  // Helper: get room state from in-memory cache; load from DB if missing
  async function getState(roomId) {
    if (roomCache.has(roomId)) return roomCache.get(roomId);

    const room = await Room.findById(roomId);
    if (!room) return null;

    const state = {
      playbackState: {
        isPlaying: room.playbackState.isPlaying,
        startedAtServerTime: room.playbackState.startedAtServerTime,
        pausedAtOffsetMs: room.playbackState.pausedAtOffsetMs,
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
      'playbackState.startedAtServerTime': state.playbackState.startedAtServerTime,
      'playbackState.pausedAtOffsetMs': state.playbackState.pausedAtOffsetMs,
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

    const offset = state.playbackState.pausedAtOffsetMs || 0;
    state.playbackState.startedAtServerTime = Date.now() - offset;
    state.playbackState.isPlaying = true;
    state.actionSequence += 1;

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

    state.playbackState.pausedAtOffsetMs =
      Date.now() - state.playbackState.startedAtServerTime;
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
      // Re-anchor start time so that currentPosition = positionMs right now
      state.playbackState.startedAtServerTime = Date.now() - positionMs;
    } else {
      state.playbackState.pausedAtOffsetMs = positionMs;
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

    state.currentTrackId = trackId;
    state.playbackState = { isPlaying: true, startedAtServerTime: Date.now(), pausedAtOffsetMs: 0 };
    state.actionSequence += 1;

    persistState(roomId, state);
    broadcast(roomId, state);
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
        if (state.playbackMode === 'REPEAT_ALL') {
          nextIndex = 0;
        } else {
          // NORMAL: Stop playback if at end
          state.playbackState = { isPlaying: false, startedAtServerTime: 0, pausedAtOffsetMs: 0 };
          state.actionSequence += 1;
          persistState(roomId, state);
          return broadcast(roomId, state);
        }
      }
    }

    state.currentTrackId = trackIds[nextIndex];
    state.playbackState = { isPlaying: true, startedAtServerTime: Date.now(), pausedAtOffsetMs: 0 };
    state.actionSequence += 1;

    persistState(roomId, state);
    broadcast(roomId, state);
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
      ? Date.now() - state.playbackState.startedAtServerTime 
      : state.playbackState.pausedAtOffsetMs;
      
    if (currentPosition > 3000) {
      if (state.playbackState.isPlaying) {
        state.playbackState.startedAtServerTime = Date.now();
      } else {
        state.playbackState.pausedAtOffsetMs = 0;
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

    state.currentTrackId = trackIds[prevIndex];
    state.playbackState = { isPlaying: true, startedAtServerTime: Date.now(), pausedAtOffsetMs: 0 };
    state.actionSequence += 1;

    persistState(roomId, state);
    broadcast(roomId, state);
  });
}

module.exports = { registerPlaybackHandlers };
