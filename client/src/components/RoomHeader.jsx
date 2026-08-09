import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Edit2, Copy, Trash2, LogOut, Check } from 'lucide-react';
import api from '../api/axios';
import socket from '../socket/socket';
import useAuthStore from '../stores/authStore';
import useRoomStore from '../stores/roomStore';
import { toast } from 'react-hot-toast';

export default function RoomHeader() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { currentRoom, setRoom } = useRoomStore();

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

  return (
    <div className="flex flex-wrap items-center justify-between p-6 bg-zinc-950/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-10 gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {renaming ? (
          <form onSubmit={handleRename} className="flex flex-wrap items-center gap-3">
            <input
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setRenameError(''); }}
              className="min-w-[180px] px-3 py-1.5 bg-black/20 border border-white/10 rounded-lg text-white focus:outline-none focus:border-primary/50"
              autoFocus
            />
            <button type="submit" className="px-3 py-1.5 bg-gradient-to-br from-primary to-green-600 hover:from-primary-hover hover:to-green-500 text-white font-semibold rounded-lg text-sm transition-all shadow-lg shadow-primary/20">
              Save
            </button>
            <button type="button" className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-lg text-sm transition-all" onClick={() => setRenaming(false)}>
              Cancel
            </button>
            {renameError && <span className="text-red-500 text-sm">{renameError}</span>}
          </form>
        ) : (
          <>
            <h2 className="text-xl font-bold">{currentRoom.name}</h2>
            {isHost && (
              <button
                className="p-1.5 text-gray-400 hover:text-white bg-white/0 hover:bg-white/10 rounded-md transition-colors"
                onClick={() => { setNewName(currentRoom.name); setRenaming(true); }}
                title="Rename room"
              >
                <Edit2 size={16} />
              </button>
            )}
          </>
        )}

        <button
          className="flex items-center gap-1.5 px-2.5 py-1.5 font-mono text-sm bg-white/5 hover:bg-white/10 rounded-md transition-colors border border-white/5"
          onClick={copyCode}
          title="Copy join code"
        >
          {copied ? <Check size={16} className="text-primary" /> : <Copy size={16} className="text-gray-400" />}
          {copied ? <span className="text-primary">Copied</span> : <span className="text-gray-300">{currentRoom.joinCode}</span>}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {isHost && !confirmDelete && (
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-sm font-semibold transition-colors border border-red-500/20" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={16} /> Delete Room
          </button>
        )}
        {confirmDelete && (
          <>
            <span className="text-sm text-gray-400">
              Delete this room?
            </span>
            <button className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-semibold transition-colors" onClick={handleDelete}>
              Confirm
            </button>
            <button className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded-lg text-sm font-semibold transition-colors" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </>
        )}
        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded-lg text-sm font-semibold transition-colors" onClick={handleLeave}>
          <LogOut size={16} /> Leave
        </button>
      </div>
    </div>
  );
}
