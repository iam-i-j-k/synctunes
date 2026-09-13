require('dotenv').config();
if (process.env.ENABLE_CUSTOM_DNS === 'true') {
  const dns = require('dns');
  dns.setServers(['1.1.1.1', '8.8.8.8']);
}
const http = require('http');
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const { initSocket } = require('./socket');

// Route imports
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const trackRoutes = require('./routes/tracks');
const userRoutes = require('./routes/users');
const playlistRoutes = require('./routes/playlists');
const searchRoutes = require('./routes/search');
const notificationRoutes = require('./routes/notifications');
const youtubeRoutes = require('./routes/youtube');

const app = express();
const server = http.createServer(app);

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: "*",
  })
);
app.use(express.json());

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/youtube', youtubeRoutes); // MUST BE BEFORE /api (trackRoutes)
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api', trackRoutes);
app.use('/api/users', userRoutes);
app.use('/api/playlists', playlistRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

// ── Socket.io ────────────────────────────────────────────────────────────────
initSocket(server, app);

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`SyncTunes server running on port ${PORT}`);
  });
});
