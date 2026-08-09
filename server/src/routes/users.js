const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const userController = require('../controllers/userController');

router.post('/likes/:trackId', protect, userController.toggleLikeTrack);
router.get('/likes', protect, userController.getLikedTracks);

module.exports = router;
