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
    }).catch((err) => console.error('persistState error:', err));
  }

  // Helper: reject stale action — send corrected state back to the requesting socket
  function rejectStale(socket, state) {
    socket.emit('room:staleAction', {
      currentState: {
        playbackState: state.playbackState,
        currentTrackId: state.currentTrackId,
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

    state.playbackState.startedAtServerTime = Date.now();
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
    state.playbackState = { isPlaying: false, startedAtServerTime: 0, pausedAtOffsetMs: 0 };
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
}

module.exports = { registerPlaybackHandlers };
