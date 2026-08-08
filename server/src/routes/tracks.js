const express = require('express');
const { protect } = require('../middleware/auth');
const { uploadAudio } = require('../middleware/upload');
const { uploadTrack, listTracks, deleteTrack } = require('../controllers/trackController');

const router = express.Router();

router.use(protect);

// Scoped under rooms (mounted at /api)
router.get('/rooms/:roomId/tracks', listTracks);
router.post('/rooms/:roomId/tracks', uploadAudio, uploadTrack);
router.delete('/tracks/:id', deleteTrack);

module.exports = router;
