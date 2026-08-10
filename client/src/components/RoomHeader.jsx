import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Edit2, Copy, Trash2, LogOut, Check } from 'lucide-react';
import api from '../api/axios';
import socket from '../socket/socket';
import useAuthStore from '../stores/authStore';
import useRoomStore from '../stores/roomStore';
import { toast } from 'react-hot-toast';

function stringToGradient(str = '') {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash % 360);
  const h2 = Math.abs((hash * 2) % 360);
  return {
    iconBg: `linear-gradient(135deg, hsl(${h1}, 70%, 50%), hsl(${h2}, 70%, 30%))`,
    headerBg: `linear-gradient(to bottom, hsl(${h1}, 50%, 15%), #09090b)`
  };
}

export default function RoomHeader() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { currentRoom, setRoom, tracks } = useRoomStore();

  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [renameError, setRenameError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!currentRoom) return null;

  const isHost = currentRoom.hostId?.toString() === user?.id ||
                 currentRoom.hostId?._id?.toString() === user?.id;

  async function handleRename(e) {
    e.preventDefault();
    if (!newName.trim()) { setRenameError('Name cannot be empty'); return; }
    try {
      const { data } = await api.patch(`/rooms/${currentRoom._id}`, { name: newName.trim() });
      setRoom(data.room);
      setRenaming(false);
      toast.success('Room renamed');
    } catch (err) {
      setRenameError(err.response?.data?.message || 'Rename failed');
      toast.error('Failed to rename room');
    }
  }

  async function handleDelete() {
    try {
      await api.delete(`/rooms/${currentRoom._id}`);
      navigate('/');
      toast.success('Room deleted');
    } catch (err) {
      console.error('Delete room failed:', err);
      toast.error('Failed to delete room');
    }
  }

  function handleLeave() {
    socket.emit('room:leave', { roomId: currentRoom._id });
    navigate('/');
  }

  function copyCode() {
    navigator.clipboard.writeText(currentRoom.joinCode).then(() => {
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const colors = stringToGradient(currentRoom._id);

  const tracksWithArt = tracks?.filter(t => t.albumArtUrl) || [];
  const covers = tracksWithArt.slice(0, 4).map(t => t.albumArtUrl);

  let coverContent;
  if (covers.length >= 4) {
    coverContent = (
      <div className="w-full h-full grid grid-cols-2 grid-rows-2">
        {covers.map((url, i) => (
          <div key={i} className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url(${url})` }} />
        ))}
      </div>
    );
  } else if (covers.length > 0) {
    coverContent = (
      <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url(${covers[0]})` }} />
    );
  } else {
    coverContent = (
      <span className="text-5xl md:text-7xl font-extrabold text-white/90 drop-shadow-md">
        {currentRoom.name.substring(0, 2).toUpperCase()}
      </span>
    );
  }

  return (
    <div 
      className="flex flex-col md:flex-row items-center md:items-end gap-6 p-6 md:p-8 border-b border-white/5 relative z-10 transition-colors duration-700"
      style={{ background: colors.headerBg }}
    >
      <div 
        className="w-32 h-32 md:w-48 md:h-48 rounded-xl shadow-2xl flex items-center justify-center flex-shrink-0 overflow-hidden"
        style={covers.length === 0 ? { background: colors.iconBg } : { backgroundColor: '#27272a' }}
      >
         {coverContent}
      </div>
      
      <div className="flex flex-col items-center md:items-start gap-2 flex-1 w-full text-center md:text-left">
        <span className="text-xs font-bold uppercase tracking-widest text-white/80">Room Session</span>
        
        {renaming ? (
          <form onSubmit={handleRename} className="flex flex-wrap items-center gap-3 justify-center md:justify-start">
            <input
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setRenameError(''); }}
              className="px-4 py-2 bg-black/20 border border-white/20 rounded-lg text-white font-bold text-xl md:text-3xl focus:outline-none focus:border-primary/50"
              autoFocus
            />
            <button type="submit" className="px-4 py-2 bg-primary text-black font-bold rounded-lg text-sm transition-all hover:scale-105">
              Save
            </button>
            <button type="button" className="px-4 py-2 bg-white/10 text-white font-bold rounded-lg text-sm transition-all hover:bg-white/20" onClick={() => setRenaming(false)}>
              Cancel
            </button>
            {renameError && <span className="text-red-500 text-sm font-medium w-full mt-2">{renameError}</span>}
          </form>
        ) : (
          <div className="flex items-center gap-2 group">
            <h1 className="text-4xl md:text-7xl font-extrabold text-white tracking-tighter truncate max-w-[250px] md:max-w-[600px]">{currentRoom.name}</h1>
            {isHost && (
              <button
                className="p-2 text-white/30 hover:text-white transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100"
                onClick={() => { setNewName(currentRoom.name); setRenaming(true); }}
                title="Rename room"
              >
                <Edit2 size={24} />
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center text-sm font-medium text-gray-300">
             Host: {isHost ? 'You' : 'Member'}
          </div>
          <span className="text-white/20">•</span>
          <button
            className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-full text-xs font-bold text-white transition-colors"
            onClick={copyCode}
            title="Copy join code"
          >
            {copied ? <Check size={14} className="text-primary" /> : <Copy size={14} />}
            {copied ? 'COPIED!' : `ID: ${currentRoom.joinCode}`}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 w-full md:w-auto justify-center md:justify-end mt-4 md:mt-0">
        {isHost && !confirmDelete && (
          <button 
            className="p-3 text-white/50 hover:text-red-500 hover:bg-white/5 rounded-full transition-colors" 
            onClick={() => setConfirmDelete(true)}
            title="Delete Room"
          >
            <Trash2 size={22} />
          </button>
        )}
        {confirmDelete && (
          <div className="flex items-center gap-2 bg-black/40 rounded-full py-1 px-2 border border-red-500/30">
            <span className="text-sm text-gray-300 px-2 font-medium">Delete?</span>
            <button className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full text-xs font-bold transition-colors" onClick={handleDelete}>
              Yes
            </button>
            <button className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-full text-xs font-bold transition-colors" onClick={() => setConfirmDelete(false)}>
              No
            </button>
          </div>
        )}
        <button 
          className="p-3 text-white/50 hover:text-white hover:bg-white/5 rounded-full transition-colors" 
          onClick={handleLeave}
          title="Leave Room"
        >
          <LogOut size={22} />
        </button>
      </div>
    </div>
  );
}
