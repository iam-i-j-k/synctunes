import { useState, useEffect } from 'react';
import { X, Loader2, Home, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';

export default function AddToRoomModal({ isOpen, onClose, video }) {
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [addingTo, setAddingTo] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetchRooms();
    }
  }, [isOpen]);

  const fetchRooms = async () => {
    setLoadingRooms(true);
    try {
      const { data } = await api.get('/rooms');
      setRooms(data.rooms || []);
    } catch (err) {
      console.error('Failed to fetch rooms', err);
      toast.error('Failed to load your rooms');
    } finally {
      setLoadingRooms(false);
    }
  };

  const handleAddToRoom = async (room) => {
    if (!video) return;
    setAddingTo(room._id);
    
    try {
      await api.post('/youtube/add', {
        roomId: room._id,
        videoId: video.id,
        title: video.title,
        artist: video.artist,
        thumbnail: video.thumbnail,
        durationMs: video.durationMs,
      });
      toast.success(`Added "${video.title}" to ${room.name}`);
      onClose();
    } catch (err) {
      console.error('Failed to add track to room', err);
      toast.error(err.response?.data?.message || 'Failed to add track');
    } finally {
      setAddingTo(null);
    }
  };

  if (!isOpen || !video) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      <div className="relative bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="p-5 flex items-start justify-between border-b border-white/5 bg-zinc-900/50">
          <div className="flex gap-4">
            <div className="w-16 h-12 rounded bg-zinc-800 overflow-hidden flex-shrink-0">
              <img src={video.thumbnail} alt="" className="w-full h-full object-cover" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm line-clamp-1">{video.title}</h3>
              <p className="text-xs text-gray-400 mt-0.5">Add to a room</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-2 max-h-[60vh] overflow-y-auto no-scrollbar">
          {loadingRooms ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400">
              <Loader2 size={24} className="animate-spin text-primary mb-2" />
              <span className="text-sm">Loading rooms...</span>
            </div>
          ) : rooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-500 text-sm">
              <p>You haven't joined any rooms yet.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {rooms.map((room) => (
                <button
                  key={room._id}
                  onClick={() => handleAddToRoom(room)}
                  disabled={addingTo !== null}
                  className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors text-left disabled:opacity-50 group"
                >
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                    {addingTo === room._id ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Home size={18} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{room.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5 truncate flex items-center gap-1">
                      {room.isPrivate ? 'Private' : 'Public'} • {room.memberIds?.length || 0} members
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
