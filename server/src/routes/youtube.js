const express = require('express');
const { protect } = require('../middleware/auth');
const { searchYouTube, streamYouTube, addYouTubeTrack } = require('../controllers/youtubeController');

const router = express.Router();

// The stream endpoint is public (or can be token-protected via query param)
// Using public for now so HTML5 audio can easily fetch it via src url
router.get('/stream/:videoId', streamYouTube);

router.use(protect);

router.get('/search', searchYouTube);
router.post('/add', addYouTubeTrack);

module.exports = router;
