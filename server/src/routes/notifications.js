const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getNotifications, markAsRead } = require('../controllers/notificationController');

router.get('/', protect, getNotifications);
router.patch('/:id/read', protect, markAsRead);

module.exports = router;
