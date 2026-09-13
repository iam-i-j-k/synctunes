import { useState, useRef, useEffect } from 'react';
import useRoomStore from '../stores/roomStore';
import useAuthStore from '../stores/authStore';
import socket from '../socket/socket';
import { Send, MessageSquare } from 'lucide-react';

export default function RoomChat() {
  const { currentRoom, messages } = useRoomStore();
  const userId = useAuthStore(s => s.user?._id);
  const [text, setText] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim() || !currentRoom) return;

    socket.emit('chat:send', {
      roomId: currentRoom._id,
      text: text.trim()
    });
    
    setText('');
  };

  return (
    <div className="flex flex-col flex-1 min-h-[300px] border-t border-white/5 bg-zinc-950/30">
      <div className="p-3 border-b border-white/5 flex items-center gap-2">
        <MessageSquare size={16} className="text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-200">Room Chat</h3>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 text-sm">
            <MessageSquare size={24} className="mb-2 opacity-50" />
            <p>No messages yet.</p>
            <p>Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.senderId === userId;
            const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            return (
              <div key={idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-xs font-medium text-gray-400">
                    {isMe ? 'You' : msg.senderName}
                  </span>
                  <span className="text-[10px] text-gray-600">{time}</span>
                </div>
                <div 
                  className={`px-3 py-2 rounded-2xl max-w-[85%] text-sm break-words shadow-sm ${
                    isMe 
                      ? 'bg-primary text-black rounded-tr-sm' 
                      : 'bg-zinc-800 text-gray-100 rounded-tl-sm border border-white/5'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 bg-zinc-950/80 border-t border-white/5">
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message..."
            className="w-full bg-zinc-900 border border-white/10 rounded-full py-2.5 pl-4 pr-12 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="absolute right-1.5 p-1.5 text-primary disabled:text-gray-600 hover:bg-white/5 rounded-full transition-colors flex items-center justify-center"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
