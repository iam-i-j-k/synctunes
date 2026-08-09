require('dotenv').config();
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
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
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api', trackRoutes);
app.use('/api/users', userRoutes);
app.use('/api/playlists', playlistRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// ── Socket.io ────────────────────────────────────────────────────────────────
initSocket(server, app);

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`SyncTunes server running on port ${PORT}`);
  });
});
