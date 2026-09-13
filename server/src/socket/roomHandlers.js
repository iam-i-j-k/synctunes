const Room = require('../models/Room');
const User = require('../models/User');
const { createNotification } = require('../controllers/notificationController');

const MAX_MEMBERS = 20;

// Grace period (ms) before treating a disconnect as a leave
const DISCONNECT_GRACE_MS = 5000;

// Track pending disconnect timers: socketId → timer
const disconnectTimers = new Map();

function registerRoomHandlers(io, socket, roomCache) {
  const userId = socket.data.user.userId;

  // clock:sync — NTP-style, must respond immediately with no async gap
  socket.on('clock:sync', ({ t0 }) => {
    socket.emit('clock:syncResponse', { t0, t1: Date.now(), t2: Date.now() });
  });

  // room:join
  socket.on('room:join', async ({ roomId }) => {
    try {
      let room = await Room.findById(roomId).populate('memberIds', 'username').populate('hostId', 'username');
      if (!room) {
        return socket.emit('room:joinError', { reason: 'NOT_FOUND' });
      }

      const isMember = room.memberIds.some((m) => m._id.toString() === userId);
      if (!isMember) {
        if (room.memberIds.length >= MAX_MEMBERS) {
          return socket.emit('room:joinError', { reason: 'ROOM_FULL' });
        }
        // Atomic add — avoids VersionError from concurrent saves
        room = await Room.findByIdAndUpdate(
          roomId,
          { $addToSet: { memberIds: userId } },
          { new: true }
        ).populate('memberIds', 'username').populate('hostId', 'username');

        // Notify the host that someone joined
        const joiningUser = await User.findById(userId).select('username');
        if (joiningUser && room.hostId._id.toString() !== userId) {
          createNotification(
            io,
            room.hostId._id.toString(),
            'ROOM_JOIN',
            'New member joined',
            `${joiningUser.username} joined your room "${room.name}"`,
            { roomId: room._id, fromUserId: userId, fromUsername: joiningUser.username }
          );
        }
      }

      // Join the socket.io room channel
      socket.join(`room:${roomId}`);
      // Also join personal channel for direct messages (e.g. kick)
      socket.join(`user:${userId}`);

      // Populate or create cache entry
      if (!roomCache.has(roomId)) {
        roomCache.set(roomId, {
          playbackState: { ...room.playbackState.toObject() },
          actionSequence: room.actionSequence,
          currentTrackId: room.currentTrackId ? room.currentTrackId.toString() : null,
        });
      }

      const state = roomCache.get(roomId);
      const sockets = await io.in(`room:${roomId}`).fetchSockets();
      const onlineIds = new Set(sockets.map((s) => s.data?.user?.userId));
      onlineIds.add(userId); // the joining user is obviously online
      const members = room.memberIds.map((m) => ({
        userId: m._id.toString(),
        username: m.username,
        isOnline: onlineIds.has(m._id.toString()),
      }));

      // Send full state to the joining socket
      socket.emit('room:state', {
        room: {
          _id: room._id,
          name: room.name,
          hostId: room.hostId,
          isPrivate: room.isPrivate,
          joinCode: room.joinCode,
          currentTrackId: state.currentTrackId,
          playbackState: state.playbackState,
          actionSequence: state.actionSequence,
          playbackMode: state.playbackMode,
        },
        members,
        actionSequence: state.actionSequence,
      });

      // Broadcast updated member list to everyone in room
      io.to(`room:${roomId}`).emit('room:memberUpdate', { members });
    } catch (err) {
      console.error('room:join error:', err);
      socket.emit('room:joinError', { reason: 'SERVER_ERROR' });
    }
  });

  // room:leave
  socket.on('room:leave', ({ roomId }) => {
    handleLeave(io, socket, roomId, userId, roomCache);
  });

  // room:reorderTracks
  socket.on('room:reorderTracks', async ({ roomId, trackIds }) => {
    try {
      let room = await Room.findById(roomId);
      if (!room) return;
      
      const isMember = 
        room.hostId.toString() === userId ||
        room.memberIds.some((id) => id.toString() === userId);
        
      if (!isMember) return;
      
      if (Array.isArray(trackIds)) {
        room.trackIds = trackIds;
        await room.save();
        io.to(`room:${roomId}`).emit('room:trackOrderChanged', { trackIds });
      }
    } catch (err) {
      console.error('room:reorderTracks error:', err);
    }
  });

  // Handle disconnecting — with grace period to avoid flicker on quick reconnects
  socket.on('disconnecting', async () => {
    // Find all room channels this socket was in
    const rooms = [...socket.rooms].filter((r) => r.startsWith('room:'));
    for (const roomChannel of rooms) {
      const roomId = roomChannel.replace('room:', '');
      
      // Update online status immediately
      broadcastMemberStatus(io, roomId);

      const timer = setTimeout(async () => {
        disconnectTimers.delete(socket.id);
        try {
          // Check if this user still has another active socket in the room
          const activeSockets = await io.in(`room:${roomId}`).fetchSockets();
          const userStillInRoom = activeSockets.some((s) => s.data?.user?.userId === userId);
          if (!userStillInRoom) {
            await handleLeave(io, socket, roomId, userId, roomCache);
          }
        } catch (err) {
          console.error('Grace period leave error:', err);
        }
      }, DISCONNECT_GRACE_MS);
      disconnectTimers.set(socket.id, timer);
    }
  });
}

async function broadcastMemberStatus(io, roomId) {
  try {
    const room = await Room.findById(roomId).populate('memberIds', 'username');
    if (!room) return;
    const sockets = await io.in(`room:${roomId}`).fetchSockets();
    const onlineIds = new Set(sockets.map((s) => s.data?.user?.userId));
    const members = room.memberIds.map((m) => ({
      userId: m._id.toString(),
      username: m.username,
      isOnline: onlineIds.has(m._id.toString()),
    }));
    io.to(`room:${roomId}`).emit('room:memberUpdate', { members });
  } catch (err) {
    console.error('broadcastMemberStatus error:', err);
  }
}

async function handleLeave(io, socket, roomId, userId, roomCache) {
  try {
    socket.leave(`room:${roomId}`);

    let room = await Room.findById(roomId).populate('memberIds', 'username');
    if (!room) return;

    const isHost = room.hostId.toString() === userId;

    // Use atomic pull to remove the user from memberIds
    room = await Room.findByIdAndUpdate(
      roomId,
      { $pull: { memberIds: userId } },
      { new: true }
    ).populate('memberIds', 'username');

    if (!room) return;

    // If the departing user is the host, transfer host to the next member
    if (isHost) {
      if (room.memberIds.length > 0) {
        room.hostId = room.memberIds[0]._id;
        await room.save();
        io.to(`room:${roomId}`).emit('room:updated', { hostId: room.hostId });
      } else {
        // No members remain, pause playback
        if (roomCache && roomCache.has(roomId)) {
          const state = roomCache.get(roomId);
          if (state.playbackState && state.playbackState.isPlaying) {
            const elapsed = (Date.now() - state.playbackState.serverStartTime) / 1000;
            state.playbackState.startPosition = (state.playbackState.startPosition || 0) + elapsed;
            state.playbackState.isPlaying = false;
            state.actionSequence += 1;
            Room.findByIdAndUpdate(roomId, {
              'playbackState.isPlaying': false,
              'playbackState.startPosition': state.playbackState.startPosition,
              actionSequence: state.actionSequence,
            }).catch(() => {});
          }
        }
      }
    }

    const sockets = await io.in(`room:${roomId}`).fetchSockets();
    const onlineIds = new Set(sockets.map((s) => s.data?.user?.userId));
    const members = room.memberIds.map((m) => ({
      userId: m._id.toString(),
      username: m.username,
      isOnline: onlineIds.has(m._id.toString()),
    }));

    io.to(`room:${roomId}`).emit('room:memberUpdate', { members });
  } catch (err) {
    console.error('handleLeave error:', err);
  }
}

module.exports = { registerRoomHandlers };
