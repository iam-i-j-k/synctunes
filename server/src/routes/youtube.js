const express = require('express');
const { protect } = require('../middleware/auth');
const { searchYouTube, addYouTubeTrack } = require('../controllers/youtubeController');

const router = express.Router();

router.use(protect);

router.get('/search', searchYouTube);
router.post('/add', addYouTubeTrack);

module.exports = router;
