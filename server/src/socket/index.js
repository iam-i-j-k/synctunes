const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { registerRoomHandlers } = require('./roomHandlers');
const { registerPlaybackHandlers } = require('./playbackHandlers');

// In-memory room state cache: roomId (string) → { playbackState, actionSequence, currentTrackId }
const roomCache = new Map();

function initSocket(httpServer, app) {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow any origin for ease of deployment, or you can restrict this to a specific list
        callback(null, true);
      },
      credentials: true,
    },
  });

  // Expose io on app.locals so controllers can emit events
  app.locals.io = io;

  // JWT auth middleware for socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication error: no token'));
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.data.user = decoded;
      next();
    } catch (err) {
      next(new Error('Authentication error: invalid token'));
    }
  });

  io.on('connection', (socket) => {
    // Join a personal channel so the server can unicast to a specific user
    socket.join(`user:${socket.data.user.userId}`);

    registerRoomHandlers(io, socket, roomCache);
    registerPlaybackHandlers(io, socket, roomCache);
  });

  return io;
}

module.exports = { initSocket, roomCache };
