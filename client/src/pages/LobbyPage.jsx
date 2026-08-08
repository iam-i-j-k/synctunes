import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import useAuthStore from '../stores/authStore';
import { disconnectSocket } from '../socket/socket';

export default function LobbyPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create room modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', isPrivate: false });
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  // Join by code
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);

  async function fetchRooms() {
    try {
      setLoading(true);
      const { data } = await api.get('/rooms');
      setRooms(data.rooms);
    } catch {
      setError('Failed to load rooms');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRooms();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!createForm.name.trim()) {
      setCreateError('Room name is required');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      const { data } = await api.post('/rooms', createForm);
      navigate(`/room/${data.room._id}`);
    } catch (err) {
      setCreateError(err.response?.data?.message || 'Failed to create room');
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin(e) {
    e.preventDefault();
    if (!joinCode.trim()) {
      setJoinError('Enter a join code');
      return;
    }
    setJoining(true);
    setJoinError('');
    try {
      const { data } = await api.post('/rooms/join', { joinCode: joinCode.toUpperCase() });
      navigate(`/room/${data.room._id}`);
    } catch (err) {
      setJoinError(err.response?.data?.message || 'Failed to join room');
    } finally {
      setJoining(false);
    }
  }

  function handleLogout() {
    disconnectSocket();
    logout();
    navigate('/login');
  }

  return (
    <div className="lobby-shell">
      <div className="lobby-header">
        <div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '0.35rem' }}>🎵 SyncTunes</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.95rem' }}>
            Pick a room, invite your friends, and listen together.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.95rem' }}>{user?.username}</span>
          <button className="btn-ghost btn-small" onClick={handleLogout}>Sign Out</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          + Create Room
        </button>

        <form onSubmit={handleJoin} style={{ display: 'flex', gap: '0.75rem', flex: 1, minWidth: 240, flexWrap: 'wrap' }}>
          <input
            placeholder="Join by code (e.g. AB12CD)"
            value={joinCode}
            onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setJoinError(''); }}
            style={{ flex: '1 1 220px', minWidth: 220 }}
            maxLength={6}
          />
          <button type="submit" className="btn-ghost btn-small" disabled={joining}>
            {joining ? 'Joining…' : 'Join'}
          </button>
        </form>
        {joinError && <span className="error-text" style={{ alignSelf: 'center' }}>{joinError}</span>}
      </div>

      <h2 style={{ marginBottom: '1rem', fontSize: '1rem', color: 'var(--color-text-muted)' }}>
        Public Rooms
      </h2>

      {loading && <p style={{ color: 'var(--color-text-muted)' }}>Loading rooms…</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && rooms.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)' }}>No public rooms yet. Create one!</p>
      )}

      <div className="card-grid">
        {rooms.map((room) => (
          <div
            key={room._id}
            className="room-card"
            onClick={() => navigate(`/room/${room._id}`)}
          >
            <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>{room.name}</div>
            <div style={{ fontSize: '0.88rem', color: 'var(--color-text-muted)' }}>
              Host: {room.hostId?.username || 'Unknown'} · {room.memberIds?.length || 0}/20 members
            </div>
            <div style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
              Code: {room.joinCode}
            </div>
          </div>
        ))}
      </div>

      {showCreate && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div className="modal-card" style={{ width: '100%', maxWidth: 420 }}>
            <h2 style={{ marginBottom: '1.25rem', fontSize: '1.1rem' }}>Create a Room</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label htmlFor="room-name">Room Name</label>
                <input
                  id="room-name"
                  maxLength={50}
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <input
                  id="is-private"
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={createForm.isPrivate}
                  onChange={(e) => setCreateForm((f) => ({ ...f, isPrivate: e.target.checked }))}
                />
                <label htmlFor="is-private" style={{ color: 'var(--color-text)', fontSize: '0.9rem', cursor: 'pointer' }}>
                  Private room
                </label>
              </div>
              {createError && <p className="error-text" style={{ marginBottom: '0.75rem' }}>{createError}</p>}
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button type="submit" className="btn-primary" disabled={creating}>
                  {creating ? 'Creating…' : 'Create'}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
