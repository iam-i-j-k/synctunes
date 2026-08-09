const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const playlistController = require('../controllers/playlistController');

router.post('/', protect, playlistController.createPlaylist);
router.get('/', protect, playlistController.getPlaylists);
router.get('/:id', protect, playlistController.getPlaylist);
router.put('/:id', protect, playlistController.updatePlaylist);
router.delete('/:id', protect, playlistController.deletePlaylist);
router.post('/:id/tracks', protect, playlistController.addTrackToPlaylist);
router.delete('/:id/tracks/:trackId', protect, playlistController.removeTrackFromPlaylist);
router.put('/:id/reorder', protect, playlistController.reorderPlaylist);

module.exports = router;
