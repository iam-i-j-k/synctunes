const Notification = require('../models/Notification');

async function getNotifications(req, res) {
  try {
    const notifications = await Notification.find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const unreadCount = await Notification.countDocuments({
      userId: req.user.userId,
      read: false,
    });

    return res.json({ notifications, unreadCount });
  } catch (err) {
    console.error('getNotifications error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function markAsRead(req, res) {
  try {
    const { id } = req.params;
    if (id === 'all') {
      await Notification.updateMany(
        { userId: req.user.userId, read: false },
        { read: true }
      );
    } else {
      await Notification.findOneAndUpdate(
        { _id: id, userId: req.user.userId },
        { read: true }
      );
    }
    return res.json({ message: 'Marked as read' });
  } catch (err) {
    console.error('markAsRead error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

// Helper: create a notification and push it via socket
async function createNotification(io, userId, type, title, message, metadata = {}) {
  try {
    const notification = await Notification.create({
      userId,
      type,
      title,
      message,
      metadata,
    });
    if (io) {
      io.to(`user:${userId}`).emit('notification:new', notification.toObject());
    }
    return notification;
  } catch (err) {
    console.error('createNotification error:', err);
  }
}

module.exports = { getNotifications, markAsRead, createNotification };
