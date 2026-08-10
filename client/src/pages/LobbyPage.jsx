import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import useAuthStore from '../stores/authStore';
import { disconnectSocket } from '../socket/socket';

function stringToGradient(str = '') {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash % 360);
  const h2 = Math.abs((hash * 2) % 360);
  return `linear-gradient(135deg, hsl(${h1}, 70%, 50%), hsl(${h2}, 70%, 30%))`;
}

function RoomCover({ room }) {
  const tracks = room.trackIds || [];
  const uniqueCovers = Array.from(new Set(tracks.map(t => t?.albumArtUrl).filter(Boolean)));
  const covers = uniqueCovers.slice(0, 4);

  if (covers.length >= 4) {
    return (
      <div className="w-full h-full grid grid-cols-2 grid-rows-2">
        {covers.map((url, i) => (
          <div key={i} className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url(${url})` }} />
        ))}
      </div>
    );
  } else if (covers.length > 0) {
    return (
      <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url(${covers[0]})` }} />
    );
  } else {
    return (
      <div 
        className="w-full h-full flex items-center justify-center"
        style={{ background: stringToGradient(room._id) }}
      >
        <span className="text-4xl md:text-5xl font-extrabold text-white/90 drop-shadow-md">
          {room.name.substring(0, 2).toUpperCase()}
        </span>
      </div>
    );
  }
}

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

  const publicRooms = rooms.filter(r => !r.isPrivate);
  const privateRooms = rooms.filter(r => r.isPrivate);

  return (
    <div className="p-4 md:p-8 flex-1 overflow-y-auto h-full w-full">
      <div className="mb-8">
        <h1 className="text-4xl font-extrabold mb-2 tracking-tight">Welcome back.</h1>
        <p className="text-base text-gray-400">
          Pick a room, invite your friends, and listen together.
        </p>
      </div>

      <div className="flex flex-wrap gap-4 mb-8">
        <button className="px-5 py-2.5 bg-gradient-to-br from-primary to-green-600 hover:from-primary-hover hover:to-green-500 text-white font-semibold rounded-xl shadow-[0_4px_15px_rgba(30,215,96,0.3)] transform hover:-translate-y-0.5 transition-all" onClick={() => setShowCreate(true)}>
          + Create Room
        </button>

        <form onSubmit={handleJoin} className="flex flex-wrap gap-3 flex-1 min-w-[240px]">
          <input
            placeholder="Join by code (e.g. AB12CD)"
            value={joinCode}
            onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setJoinError(''); }}
            className="flex-1 min-w-[220px] px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all uppercase"
            maxLength={6}
          />
          <button type="submit" className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-xl transition-all" disabled={joining}>
            {joining ? 'Joining…' : 'Join'}
          </button>
        </form>
        {joinError && <span className="text-red-500 self-center text-sm">{joinError}</span>}
      </div>

      {privateRooms.length > 0 && (
        <>
          <h2 className="mb-4 text-base font-semibold text-gray-400 uppercase tracking-wider">
            My Private Rooms
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3 md:gap-5 mb-8">
            {privateRooms.map((room) => (
              <div
                key={room._id}
                className="p-3 md:p-4 bg-white/[0.03] border border-white/5 rounded-2xl cursor-pointer hover:bg-white/[0.06] hover:border-white/10 hover:-translate-y-1 hover:scale-[1.02] transform transition-all duration-300 shadow-[0_4px_15px_rgba(0,0,0,0.2)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.3),_0_0_15px_rgba(30,215,96,0.15)] group relative overflow-hidden flex flex-col"
                onClick={() => navigate(`/room/${room._id}`)}
              >
                <div className="absolute top-2 right-2 bg-primary text-black text-[9px] font-bold px-2 py-1 rounded-full uppercase tracking-wider z-10 shadow-lg">Private</div>
                
                <div className="w-full aspect-square bg-zinc-800 rounded-lg mb-3 flex items-center justify-center overflow-hidden shadow-lg relative flex-shrink-0">
                  <RoomCover room={room} />
                </div>
                
                <div className="font-bold text-base mb-1 group-hover:text-primary transition-colors truncate">{room.name}</div>
                <div className="text-xs text-gray-400 truncate">
                  Host: <span className="text-gray-300">{room.hostId?.username || 'Unknown'}</span>
                </div>
                <div className="mt-2 text-[10px] text-gray-500 font-mono bg-black/30 self-start px-2 py-0.5 rounded">
                  Code: {room.joinCode}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="mb-4 text-base font-semibold text-gray-400 uppercase tracking-wider">
        Public Rooms
      </h2>

      {loading && (
        <div className="flex flex-col items-center justify-center min-h-[200px]">
          <div className="w-10 h-10 border-4 border-white/10 border-t-primary rounded-full animate-spin mb-4"></div>
          <p className="text-gray-400 animate-pulse font-medium">Loading rooms...</p>
        </div>
      )}
      {error && <p className="text-red-500">{error}</p>}
      {!loading && publicRooms.length === 0 && (
        <p className="text-gray-400">No public rooms yet. Create one!</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3 md:gap-5 pb-8">
        {publicRooms.map((room) => (
          <div
            key={room._id}
            className="p-3 md:p-4 bg-white/[0.03] border border-white/5 rounded-2xl cursor-pointer hover:bg-white/[0.06] hover:border-white/10 hover:-translate-y-1 hover:scale-[1.02] transform transition-all duration-300 shadow-[0_4px_15px_rgba(0,0,0,0.2)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.3),_0_0_15px_rgba(30,215,96,0.15)] group flex flex-col"
            onClick={() => navigate(`/room/${room._id}`)}
          >
            <div className="w-full aspect-square bg-zinc-800 rounded-lg mb-3 flex items-center justify-center overflow-hidden shadow-lg relative flex-shrink-0">
              <RoomCover room={room} />
            </div>
            
            <div className="font-bold text-base mb-1 group-hover:text-primary transition-colors truncate">{room.name}</div>
            <div className="text-xs text-gray-400 truncate">
              Host: <span className="text-gray-300">{room.hostId?.username || 'Unknown'}</span>
            </div>
            <div className="mt-2 text-[10px] text-gray-500 font-mono bg-black/30 self-start px-2 py-0.5 rounded">
              Code: {room.joinCode}
            </div>
          </div>
        ))}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl p-8 shadow-2xl">
            <h2 className="mb-6 text-xl font-bold">Create a Room</h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label htmlFor="room-name" className="text-sm font-medium text-gray-300">Room Name</label>
                <input
                  id="room-name"
                  maxLength={50}
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  autoFocus
                  className="w-full px-4 py-2.5 bg-black/20 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                />
              </div>
              <div className="flex items-center gap-3 mb-2">
                <input
                  id="is-private"
                  type="checkbox"
                  className="w-4 h-4 rounded text-primary focus:ring-primary border-gray-300 bg-gray-100"
                  checked={createForm.isPrivate}
                  onChange={(e) => setCreateForm((f) => ({ ...f, isPrivate: e.target.checked }))}
                />
                <label htmlFor="is-private" className="text-sm text-gray-300 cursor-pointer select-none">
                  Private room
                </label>
              </div>
              {createError && <p className="text-red-500 text-sm">{createError}</p>}
              <div className="flex gap-3 mt-2">
                <button type="submit" className="flex-1 py-2.5 bg-gradient-to-br from-primary to-green-600 hover:from-primary-hover hover:to-green-500 text-white font-semibold rounded-xl shadow-lg transition-all" disabled={creating}>
                  {creating ? 'Creating…' : 'Create'}
                </button>
                <button type="button" className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-xl transition-all" onClick={() => setShowCreate(false)}>
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
