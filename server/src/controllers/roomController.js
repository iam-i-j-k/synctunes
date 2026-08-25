const Room = require('../models/Room');
const Track = require('../models/Track');
const MediaAsset = require('../models/MediaAsset');
const getCloudinary = require('../config/cloudinary');
const { generateJoinCode } = require('../utils/joinCode');

const MAX_MEMBERS = 20;

async function createRoom(req, res) {
  try {
    const { name, isPrivate } = req.body;
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: 'Room name is required' });
    }
    if (name.trim().length > 50) {
      return res.status(400).json({ message: 'Room name must be 50 characters or fewer' });
    }

    // Ensure unique join code (retry on collision)
    let joinCode;
    let attempts = 0;
    while (attempts < 5) {
      joinCode = generateJoinCode();
      const exists = await Room.findOne({ joinCode });
      if (!exists) break;
      attempts++;
    }

    const room = await Room.create({
      name: name.trim(),
      hostId: req.user.userId,
      isPrivate: Boolean(isPrivate),
      joinCode,
      memberIds: [req.user.userId],
    });

    return res.status(201).json({ room });
  } catch (err) {
    console.error('createRoom error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function listRooms(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const query = {
      $or: [
        { isPrivate: false },
        { isPrivate: true, memberIds: req.user.userId },
        { isPrivate: true, hostId: req.user.userId }
      ]
    };

    const [rooms, total] = await Promise.all([
      Room.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('hostId', 'username')
        .populate('trackIds', 'albumArtUrl'),
      Room.countDocuments(query),
    ]);

    return res.json({ rooms, total, page, limit });
  } catch (err) {
    console.error('listRooms error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function getRoom(req, res) {
  try {
    const room = await Room.findById(req.params.id).populate('hostId', 'username').populate('memberIds', 'username');
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const isMember = room.memberIds.some((m) => m._id.toString() === req.user.userId);
    if (room.isPrivate && !isMember) {
      return res.status(403).json({ message: 'This room is private' });
    }

    return res.json({ room });
  } catch (err) {
    console.error('getRoom error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function updateRoom(req, res) {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Room not found' });
    if (room.hostId.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Only the host can modify the room' });
    }

    const { name, isPrivate } = req.body;
    let modified = false;

    if (name !== undefined) {
      if (!name || name.trim().length === 0 || name.trim().length > 50) {
        return res.status(400).json({ message: 'Invalid room name' });
      }
      room.name = name.trim();
      modified = true;
    }

    if (isPrivate !== undefined) {
      room.isPrivate = Boolean(isPrivate);
      modified = true;
    }

    if (modified) {
      await room.save();
      // Notify via socket if io is accessible (injected via app.locals)
      const io = req.app.locals.io;
      if (io) {
        io.to(`room:${room._id}`).emit('room:updated', { name: room.name, isPrivate: room.isPrivate });
      }
    }

    const populated = await Room.findById(room._id).populate('hostId', 'username').populate('memberIds', 'username');
    return res.json({ room: populated });
  } catch (err) {
    console.error('updateRoom error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function deleteRoom(req, res) {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Room not found' });
    if (room.hostId.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Only the host can delete the room' });
    }

    // Cascade delete: decrement MediaAsset refCounts, destroy Cloudinary files only when orphaned
    const tracks = await Track.find({ roomId: room._id });
    const cloudinary = getCloudinary();

    for (const track of tracks) {
      if (track.mediaAssetId) {
        const asset = await MediaAsset.findByIdAndUpdate(
          track.mediaAssetId,
          { $inc: { refCount: -1 } },
          { new: true }
        );

        if (asset && asset.refCount <= 0) {
          try {
            await cloudinary.uploader.destroy(asset.cloudinaryPublicId, { resource_type: 'video' });
          } catch (cloudErr) {
            console.warn(
              `Cloudinary destroy failed for publicId ${asset.cloudinaryPublicId}:`,
              cloudErr
            );
          }
          await MediaAsset.findByIdAndDelete(asset._id);
        }
      }
    }

    await Track.deleteMany({ roomId: room._id });
    await Room.findByIdAndDelete(room._id);

    // Notify members via socket
    const io = req.app.locals.io;
    if (io) {
      io.to(`room:${room._id}`).emit('room:deleted', { roomId: room._id });
    }

    return res.json({ message: 'Room deleted' });
  } catch (err) {
    console.error('deleteRoom error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function joinRoom(req, res) {
  try {
    const { joinCode } = req.body;
    if (!joinCode) return res.status(400).json({ message: 'joinCode is required' });

    const room = await Room.findOne({ joinCode: joinCode.toUpperCase() });
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const alreadyMember = room.memberIds.some((id) => id.toString() === req.user.userId);
    if (alreadyMember) return res.json({ room });

    if (room.memberIds.length >= MAX_MEMBERS) {
      return res.status(409).json({ message: 'Room is full (max 20 members)', reason: 'ROOM_FULL' });
    }

    room.memberIds.push(req.user.userId);
    await room.save();

    return res.json({ room });
  } catch (err) {
    console.error('joinRoom error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function kickMember(req, res) {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Room not found' });
    if (room.hostId.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Only the host can kick members' });
    }

    const { memberId } = req.body;
    if (!memberId) return res.status(400).json({ message: 'memberId is required' });
    if (memberId === req.user.userId) {
      return res.status(400).json({ message: 'Host cannot kick themselves' });
    }

    room.memberIds = room.memberIds.filter((id) => id.toString() !== memberId);
    await room.save();

    // Disconnect kicked member's socket and notify everyone
    const io = req.app.locals.io;
    if (io) {
      io.to(`room:${room._id}`).emit('room:memberUpdate', {
        members: await getMemberList(room),
      });
      // Emit to the specific user's socket — use userId room trick
      io.to(`user:${memberId}`).emit('room:kicked', { roomId: room._id });
    }

    return res.json({ message: 'Member kicked' });
  } catch (err) {
    console.error('kickMember error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

// Helper: build member list from populated memberIds
async function getMemberList(room) {
  const populated = await Room.findById(room._id).populate('memberIds', 'username');
  return (populated?.memberIds || []).map((m) => ({
    userId: m._id.toString(),
    username: m.username,
  }));
}

module.exports = { createRoom, listRooms, getRoom, updateRoom, deleteRoom, joinRoom, kickMember };
