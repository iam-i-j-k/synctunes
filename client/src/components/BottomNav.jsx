import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Heart, ListMusic, Search, Music, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import useRoomStore from '../stores/roomStore';
import usePlayerStore from '../stores/playerStore';
import socket from '../socket/socket';

export default function BottomNav() {
  const navigate = useNavigate();
  const activeLinkClass = "text-primary";
  const inactiveLinkClass = "text-gray-400 hover:text-white";
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ tracks: [], rooms: [] });
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  const { currentRoom, addTrack: addTrackToStore } = useRoomStore();
  const { actionSequence } = usePlayerStore();

  const handleSearch = useCallback((q) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setResults({ tracks: [], rooms: [] });
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/search?q=${encodeURIComponent(q.trim())}`);
        setResults(data);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  useEffect(() => {
    handleSearch(query);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, handleSearch]);

  async function playTrack(track) {
    try {
      addTrackToStore(track);
      if (currentRoom) {
        api.post(`/rooms/${currentRoom._id}/tracks/add-existing`, { trackId: track._id }).catch(console.error);
        socket.emit('playback:trackChange', { roomId: currentRoom._id, trackId: track._id, actionSequence });
      } else {
        const { data: { room } } = await api.post('/rooms', { name: 'My Library', isPrivate: true });
        api.post(`/rooms/${room._id}/tracks/add-existing`, { trackId: track._id }).catch(console.error);
        socket.emit('room:join', { roomId: room._id });
        setTimeout(() => {
          socket.emit('playback:trackChange', { roomId: room._id, trackId: track._id, actionSequence: 0 });
        }, 50);
      }
      setShowSearch(false);
      setQuery('');
    } catch (err) {
      console.error('Play track failed:', err);
    }
  }

  const hasResults = results.tracks.length > 0 || results.rooms.length > 0;

  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-zinc-950 border-t border-white/5 flex items-center justify-around z-40 pb-safe">
        <NavLink to="/" className={({ isActive }) => `flex flex-col items-center justify-center w-full h-full gap-1 ${isActive ? activeLinkClass : inactiveLinkClass}`} end>
          <Home size={24} />
          <span className="text-[10px] font-medium">Home</span>
        </NavLink>

        <button
          className={`flex flex-col items-center justify-center w-full h-full gap-1 ${showSearch ? activeLinkClass : inactiveLinkClass}`}
          onClick={() => setShowSearch(true)}
        >
          <Search size={24} />
          <span className="text-[10px] font-medium">Search</span>
        </button>

        <NavLink to="/library/likes" className={({ isActive }) => `flex flex-col items-center justify-center w-full h-full gap-1 ${isActive ? activeLinkClass : inactiveLinkClass}`}>
          <Heart size={24} />
          <span className="text-[10px] font-medium">Likes</span>
        </NavLink>

        <NavLink to="/library/playlists" className={({ isActive }) => `flex flex-col items-center justify-center w-full h-full gap-1 ${isActive ? activeLinkClass : inactiveLinkClass}`}>
          <ListMusic size={24} />
          <span className="text-[10px] font-medium">Playlists</span>
        </NavLink>
      </nav>

      {/* Mobile Search Overlay */}
      {showSearch && (
        <div className="md:hidden fixed inset-0 z-[200] bg-zinc-950 flex flex-col">
          {/* Search Header */}
          <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-white/5">
            <div className="flex-1 flex items-center bg-white/5 rounded-full px-4 py-2.5 border border-white/5 focus-within:border-primary/50 transition-colors">
              <Search size={18} className="text-gray-400 mr-2 flex-shrink-0" />
              <input
                type="text"
                placeholder="Search tracks or rooms..."
                className="bg-transparent border-none text-white text-sm w-full outline-none placeholder:text-gray-500"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
              {query && (
                <button onClick={() => setQuery('')} className="text-gray-400 hover:text-white ml-1">
                  <X size={16} />
                </button>
              )}
            </div>
            <button
              className="text-gray-400 hover:text-white text-sm font-semibold"
              onClick={() => { setShowSearch(false); setQuery(''); }}
            >
              Cancel
            </button>
          </div>

          {/* Search Results */}
          <div className="flex-1 overflow-y-auto pb-20">
            {searching && !hasResults && (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-white/20 border-t-primary rounded-full animate-spin" />
              </div>
            )}

            {!searching && !hasResults && query.trim() && (
              <div className="py-16 text-center text-gray-400">
                <Search size={40} className="mx-auto mb-4 opacity-30" />
                <p className="text-base font-medium">No results for &quot;{query}&quot;</p>
                <p className="text-sm mt-1">Try a different search</p>
              </div>
            )}

            {!query.trim() && (
              <div className="py-16 text-center text-gray-400">
                <Search size={40} className="mx-auto mb-4 opacity-20" />
                <p className="text-base font-medium">Search for tracks or rooms</p>
                <p className="text-sm mt-1 text-gray-500">Find music across the platform</p>
              </div>
            )}

            {/* Track Results */}
            {results.tracks.length > 0 && (
              <div>
                <div className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 bg-black/20 border-b border-white/5 sticky top-0">
                  🎵 Tracks
                </div>
                {results.tracks.map((track) => (
                  <button
                    key={track._id}
                    className="flex items-center gap-3 w-full px-4 py-3 hover:bg-white/5 transition-colors text-left active:bg-white/10"
                    onClick={() => playTrack(track)}
                  >
                    <div className="w-12 h-12 rounded-lg bg-zinc-800 flex-shrink-0 overflow-hidden shadow-md">
                      {track.albumArtUrl ? (
                        <img src={track.albumArtUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music size={18} className="text-gray-500" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{track.title}</div>
                      {track.artist && (
                        <div className="text-xs text-gray-400 truncate mt-0.5">{track.artist}</div>
                      )}
                    </div>
                    {track.durationMs && (
                      <div className="text-xs text-gray-500 flex-shrink-0">
                        {Math.floor(track.durationMs / 60000)}:{String(Math.floor((track.durationMs % 60000) / 1000)).padStart(2, '0')}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Room Results */}
            {results.rooms.length > 0 && (
              <div>
                <div className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 bg-black/20 border-b border-white/5 sticky top-0">
                  🏠 Rooms
                </div>
                {results.rooms.map((room) => (
                  <button
                    key={room._id}
                    className="flex items-center gap-3 w-full px-4 py-3 hover:bg-white/5 transition-colors text-left active:bg-white/10"
                    onClick={() => { navigate(`/room/${room._id}`); setShowSearch(false); setQuery(''); }}
                  >
                    <div className="w-12 h-12 rounded-lg bg-zinc-800 flex-shrink-0 overflow-hidden shadow-md flex items-center justify-center">
                      <Home size={18} className="text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{room.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {room.hostId?.username || 'Unknown'} · {room.memberIds?.length || 0} members
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
