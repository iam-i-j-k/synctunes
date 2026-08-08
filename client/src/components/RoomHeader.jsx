import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import socket from '../socket/socket';
import useAuthStore from '../stores/authStore';
import useRoomStore from '../stores/roomStore';

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
    } catch (err) {
      setRenameError(err.response?.data?.message || 'Rename failed');
    }
  }

  async function handleDelete() {
    try {
      await api.delete(`/rooms/${currentRoom._id}`);
      navigate('/');
    } catch (err) {
      console.error('Delete room failed:', err);
    }
  }

  function handleLeave() {
    socket.emit('room:leave', { roomId: currentRoom._id });
    navigate('/');
  }

  function copyCode() {
    navigator.clipboard.writeText(currentRoom.joinCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="room-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        {renaming ? (
          <form onSubmit={handleRename} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setRenameError(''); }}
              style={{ minWidth: 180 }}
              autoFocus
            />
            <button type="submit" className="btn-primary btn-small">
              Save
            </button>
            <button type="button" className="btn-ghost btn-small" onClick={() => setRenaming(false)}>
              Cancel
            </button>
            {renameError && <span className="error-text">{renameError}</span>}
          </form>
        ) : (
          <>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{currentRoom.name}</h2>
            {isHost && (
              <button
                className="btn-ghost btn-small"
                onClick={() => { setNewName(currentRoom.name); setRenaming(true); }}
              >
                Rename
              </button>
            )}
          </>
        )}

        <button
          className="btn-ghost btn-small"
          style={{ fontFamily: 'monospace' }}
          onClick={copyCode}
          title="Copy join code"
        >
          {copied ? '✓ Copied' : currentRoom.joinCode}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {isHost && !confirmDelete && (
          <button className="btn-danger btn-small" onClick={() => setConfirmDelete(true)}>
            Delete Room
          </button>
        )}
        {confirmDelete && (
          <>
            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              Delete this room?
            </span>
            <button className="btn-danger btn-small" onClick={handleDelete}>
              Confirm
            </button>
            <button className="btn-ghost btn-small" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </>
        )}
        <button className="btn-ghost btn-small" onClick={handleLeave}>
          Leave
        </button>
      </div>
    </div>
  );
}
