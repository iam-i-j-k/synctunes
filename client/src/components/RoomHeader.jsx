import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Edit2, Copy, Trash2, LogOut, Check, Lock, Globe } from 'lucide-react';
import api from '../api/axios';
import socket from '../socket/socket';
import useAuthStore from '../stores/authStore';
import useRoomStore from '../stores/roomStore';
import { toast } from 'react-hot-toast';

function formatDurationMs(ms) {
  if (!ms) return '0 min';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  
  if (hours > 0) return `${hours} hr ${mins} min`;
  if (mins > 0) return `${mins} min ${secs} sec`;
  return `${secs} sec`;
}

function stringToGradient(str = '') {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash % 360);
  const h2 = Math.abs((hash * 2) % 360);
  return {
    iconBg: `linear-gradient(135deg, hsl(${h1}, 70%, 50%), hsl(${h2}, 70%, 30%))`,
    headerBg: `linear-gradient(to bottom, hsl(${h1}, 40%, 25%), #09090b)`
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

  async function togglePrivacy() {
    try {
      const { data } = await api.patch(`/rooms/${currentRoom._id}`, { isPrivate: !currentRoom.isPrivate });
      setRoom(data.room);
      toast.success(`Room is now ${data.room.isPrivate ? 'Private' : 'Public'}`);
    } catch (err) {
      toast.error('Failed to update room privacy');
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

  // Extract unique album art URLs to avoid duplicate images in the collage
  const uniqueCovers = Array.from(new Set(tracks?.map(t => t.albumArtUrl).filter(Boolean)));
  const covers = uniqueCovers.slice(0, 4);

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
      className="relative w-full flex-shrink-0 transition-colors duration-1000"
      style={{ background: colors.headerBg }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent opacity-90" />
      <div className="absolute inset-0 bg-black/10" />

      <div className="relative flex flex-col md:flex-row items-center md:items-end gap-6 p-6 md:p-8">
        <div className="w-48 h-48 md:w-56 md:h-56 shadow-2xl rounded-xl overflow-hidden flex-shrink-0 ring-1 ring-white/10 group"
          style={covers.length === 0 ? { background: colors.iconBg } : { backgroundColor: '#27272a' }}
        >
           {coverContent}
        </div>
        
        <div className="flex flex-col items-center md:items-start gap-1 flex-1 w-full text-center md:text-left">
          <span className="text-xs font-bold uppercase tracking-widest text-white/80">Room Session</span>
          
          {renaming ? (
            <form onSubmit={handleRename} className="mb-4">
              <input
                type="text"
                className="bg-white/10 backdrop-blur-md border border-white/20 text-4xl md:text-6xl font-black tracking-tighter text-white px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-primary/50 w-full"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                autoFocus
              />
              {renameError && <p className="text-red-400 text-sm mt-1">{renameError}</p>}
              <div className="flex gap-2 mt-2">
                <button type="submit" className="px-4 py-1.5 bg-primary text-black font-semibold rounded-full hover:scale-105 transition-transform text-sm">Save</button>
                <button type="button" onClick={() => setRenaming(false)} className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-full transition-colors text-sm">Cancel</button>
              </div>
            </form>
          ) : (
            <div className="flex items-center gap-4 group/title mb-4">
              <h1 className="text-4xl md:text-7xl font-black tracking-tighter text-white line-clamp-2 drop-shadow-md">
                {currentRoom.name}
              </h1>
              {isHost && (
                <button 
                  onClick={() => {
                    setNewName(currentRoom.name);
                    setRenaming(true);
                    setRenameError('');
                  }}
                  className="p-2.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors opacity-0 group-hover/title:opacity-100"
                  title="Rename Room"
                >
                  <Edit2 size={24} />
                </button>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
            <div className="flex items-center text-sm font-medium text-gray-300">
               Host: {isHost ? 'You' : (currentRoom.hostId?.username || 'Unknown')}
            </div>
            <span className="text-white/20">•</span>
            <div className="flex items-center text-sm font-medium text-gray-300">
               {tracks?.length || 0} track{(tracks?.length === 1) ? '' : 's'}
            </div>
            {tracks?.length > 0 && (
              <>
                <span className="text-white/20">•</span>
                <div className="flex items-center text-sm font-medium text-gray-300">
                   {formatDurationMs(tracks.reduce((acc, t) => acc + (t.durationMs || 0), 0))}
                </div>
              </>
            )}
          </div>          <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mt-4">
            <div className="flex items-center gap-3 text-sm font-medium">
              <button 
                onClick={copyCode}
                className="flex items-center gap-2 text-gray-300 hover:text-white bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full transition-colors group/copy border border-white/5"
                title="Copy Join Code"
              >
                <span className="text-gray-400 group-hover/copy:text-gray-300 transition-colors">ID:</span>
                <span className="font-mono font-bold tracking-wider">{currentRoom.joinCode}</span>
                {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} className="opacity-70 group-hover/copy:opacity-100 transition-opacity" />}
              </button>

              {isHost && (
                <button
                  onClick={togglePrivacy}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-md transition-colors border border-white/5 ${
                    currentRoom.isPrivate 
                      ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30' 
                      : 'bg-primary/20 text-primary hover:bg-primary/30'
                  }`}
                  title={currentRoom.isPrivate ? 'Make Public' : 'Make Private'}
                >
                  {currentRoom.isPrivate ? <Lock size={14} /> : <Globe size={14} />}
                  {currentRoom.isPrivate ? 'PRIVATE' : 'PUBLIC'}
                </button>
              )}

              {!isHost && (
                <div
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/5 backdrop-blur-md ${
                    currentRoom.isPrivate 
                      ? 'bg-red-500/10 text-red-300/80' 
                      : 'bg-primary/10 text-primary/80'
                  }`}
                >
                  {currentRoom.isPrivate ? <Lock size={14} /> : <Globe size={14} />}
                  {currentRoom.isPrivate ? 'PRIVATE' : 'PUBLIC'}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 ml-0 md:ml-2 border-l-0 md:border-l md:border-white/10 pl-0 md:pl-6">
              {isHost && !confirmDelete && (
                <button 
                  className="p-2 text-white/50 hover:text-red-500 hover:bg-white/5 rounded-full transition-colors" 
                  onClick={() => setConfirmDelete(true)}
                  title="Delete Room"
                >
                  <Trash2 size={18} />
                </button>
              )}
              {confirmDelete && (
                <div className="flex items-center gap-2 bg-red-500/10 rounded-full py-1 px-2 border border-red-500/30 absolute md:static z-20 left-1/2 -translate-x-1/2 md:translate-x-0 mt-12 md:mt-0 shadow-xl backdrop-blur-md">
                  <span className="text-xs text-red-400 px-2 font-bold whitespace-nowrap">Delete room?</span>
                  <button className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-full text-xs font-bold transition-colors" onClick={handleDelete}>
                    Yes
                  </button>
                  <button className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-full text-xs font-bold transition-colors" onClick={() => setConfirmDelete(false)}>
                    No
                  </button>
                </div>
              )}
              <button 
                className="p-2 text-white/50 hover:text-white hover:bg-white/5 rounded-full transition-colors" 
                onClick={handleLeave}
                title="Leave Room"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
