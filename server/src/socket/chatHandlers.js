const Room = require('../models/Room');
const User = require('../models/User');

function setupChatHandlers(io, socket) {
  socket.on('chat:send', async (data) => {
    const { roomId, text } = data;
    if (!roomId || !text || text.trim() === '') return;
    
    try {
      const room = await Room.findById(roomId);
      if (!room) return;

      const senderId = socket.userId;
      const sender = await User.findById(senderId);
      if (!sender) return;

      // Verify membership
      const isMember = 
        room.hostId.toString() === senderId || 
        room.memberIds.some(id => id.toString() === senderId);
        
      if (!isMember) return;

      const message = {
        senderId: sender._id,
        senderName: sender.username,
        text: text.trim(),
        timestamp: new Date()
      };

      // Add to room and keep only last 50 messages
      room.messages.push(message);
      if (room.messages.length > 50) {
        room.messages = room.messages.slice(room.messages.length - 50);
      }
      
      await room.save();

      // Emit to everyone in the room
      io.to(`room:${roomId}`).emit('chat:newMessage', { message });
    } catch (err) {
      console.error('Chat send error:', err);
    }
  });
}

module.exports = { setupChatHandlers };
