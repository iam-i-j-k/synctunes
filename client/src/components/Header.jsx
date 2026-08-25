import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Bell, User, LogOut, Music, Home as HomeIcon, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import useRoomStore from '../stores/roomStore';
import usePlayerStore from '../stores/playerStore';
import { disconnectSocket } from '../socket/socket';
import socket from '../socket/socket';
import api from '../api/axios';

function stringToGradient(str = '') {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash % 360);
  const h2 = Math.abs((hash * 2) % 360);
  return `linear-gradient(135deg, hsl(${h1}, 70%, 50%), hsl(${h2}, 70%, 30%))`;
}

export default function Header() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { currentRoom, addTrack: addTrackToStore } = useRoomStore();
  const { actionSequence } = usePlayerStore();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ tracks: [], rooms: [] });
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);

  const searchRef = useRef(null);
  const notifRef = useRef(null);
  const debounceRef = useRef(null);

  // Debounced search
  const handleSearch = useCallback((q) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setResults({ tracks: [], rooms: [] });
      setShowDropdown(false);
      return;
    }
    setSearching(true);
    setShowDropdown(true);
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

  // Click outside to close search
  useEffect(() => {
    function handleClickOutside(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch notifications
  useEffect(() => {
    async function fetchNotifications() {
      try {
        const { data } = await api.get('/notifications');
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      } catch (err) {
        console.error('Failed to fetch notifications:', err);
      }
    }
    fetchNotifications();

    // Listen for real-time notifications
    function handleNewNotif(notif) {
      setNotifications((prev) => [notif, ...prev].slice(0, 50));
      setUnreadCount((prev) => prev + 1);
    }
    socket.on('notification:new', handleNewNotif);
    return () => socket.off('notification:new', handleNewNotif);
  }, []);

  async function markAllRead() {
    try {
      await api.patch('/notifications/all/read');
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      console.error('Failed to mark notifications as read:', err);
    }
  }

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
      setShowDropdown(false);
      setQuery('');
    } catch (err) {
      console.error('Play track failed:', err);
    }
  }

  function handleLogout() {
    disconnectSocket();
    logout();
    navigate('/login');
  }

  function formatTimeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  const hasResults = results.tracks.length > 0 || results.rooms.length > 0;

  return (
    <header className="h-16 flex items-center justify-between px-3 md:px-6 bg-zinc-950/50 backdrop-blur-md border-b border-white/5 z-10 sticky top-0">
      {/* Search Bar */}
      <div ref={searchRef} className="hidden md:block relative w-full max-w-sm">
        <div className="flex items-center bg-white/5 rounded-full px-4 py-2 w-full border border-white/5 focus-within:border-primary/50 focus-within:bg-white/10 transition-colors">
          <Search size={18} className="text-gray-400 mr-2 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search for rooms or tracks..."
            className="bg-transparent border-none text-white text-sm w-full outline-none placeholder:text-gray-500"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => { if (query.trim()) setShowDropdown(true); }}
          />
          {query && (
            <button onClick={() => { setQuery(''); setShowDropdown(false); }} className="text-gray-400 hover:text-white ml-1">
              <X size={16} />
            </button>
          )}
        </div>

        {/* Search Dropdown */}
        {showDropdown && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 max-h-[70vh] overflow-y-auto animate-in fade-in slide-in-from-top-2">
            {searching && !hasResults && (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-white/20 border-t-primary rounded-full animate-spin" />
              </div>
            )}

            {!searching && !hasResults && query.trim() && (
              <div className="py-8 text-center text-gray-400">
                <Search size={32} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm font-medium">No results for &quot;{query}&quot;</p>
              </div>
            )}

            {/* Track Results */}
            {results.tracks.length > 0 && (
              <div>
                <div className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 bg-black/20 border-b border-white/5">
                  🎵 Tracks
                </div>
                {results.tracks.map((track) => (
                  <button
                    key={track._id}
                    className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-white/5 transition-colors text-left group"
                    onClick={() => playTrack(track)}
                  >
                    <div className="w-10 h-10 rounded-lg bg-zinc-800 flex-shrink-0 overflow-hidden shadow-md">
                      {track.albumArtUrl ? (
                        <img src={track.albumArtUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music size={16} className="text-gray-500" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate group-hover:text-primary transition-colors">
                        {track.title}
                      </div>
                      {track.artist && (
                        <div className="text-xs text-gray-400 truncate">{track.artist}</div>
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
                <div className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 bg-black/20 border-b border-white/5">
                  🏠 Rooms
                </div>
                {results.rooms.map((room) => {
                  const covers = Array.from(new Set((room.trackIds || []).map(t => t?.albumArtUrl).filter(Boolean))).slice(0, 1);
                  return (
                    <button
                      key={room._id}
                      className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-white/5 transition-colors text-left group"
                      onClick={() => { navigate(`/room/${room._id}`); setShowDropdown(false); setQuery(''); }}
                    >
                      <div className="w-10 h-10 rounded-lg bg-zinc-800 flex-shrink-0 overflow-hidden shadow-md">
                        {covers.length > 0 ? (
                          <img src={covers[0]} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center" style={{ background: stringToGradient(room._id) }}>
                            <span className="text-sm font-bold text-white/90">{room.name.substring(0, 2).toUpperCase()}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white truncate group-hover:text-primary transition-colors">
                          {room.name}
                        </div>
                        <div className="text-xs text-gray-400">
                          {room.hostId?.username || 'Unknown'} · {room.memberIds?.length || 0} members
                        </div>
                      </div>
                      <HomeIcon size={14} className="text-gray-500 flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right side controls */}
      <div className="flex items-center gap-2 md:gap-4 ml-auto">
        {/* Notification Bell */}
        <div ref={notifRef} className="relative">
          <button
            className="flex items-center justify-center w-10 h-10 rounded-full bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors relative"
            title="Notifications"
            onClick={() => {
              setShowNotifications(!showNotifications);
              if (!showNotifications && unreadCount > 0) markAllRead();
            }}
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center shadow-lg animate-bounce">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notification Dropdown */}
          {showNotifications && (
            <div className="absolute top-full right-0 mt-2 w-80 bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 max-h-[60vh] overflow-y-auto">
              <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                <span className="text-sm font-bold text-white">Notifications</span>
                {notifications.length > 0 && (
                  <button
                    className="text-xs text-primary hover:text-primary-hover font-medium"
                    onClick={markAllRead}
                  >
                    Mark all read
                  </button>
                )}
              </div>
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-gray-400">
                  <Bell size={28} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No notifications yet</p>
                </div>
              ) : (
                notifications.map((notif) => (
                  <div
                    key={notif._id}
                    className={`px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer ${
                      !notif.read ? 'bg-primary/5' : ''
                    }`}
                    onClick={() => {
                      if (notif.metadata?.roomId) {
                        navigate(`/room/${notif.metadata.roomId}`);
                        setShowNotifications(false);
                      }
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${!notif.read ? 'bg-primary' : 'bg-transparent'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">{notif.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{notif.message}</p>
                        <p className="text-[10px] text-gray-500 mt-1">{formatTimeAgo(notif.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* User Profile */}
        <div
          className="flex items-center gap-3 bg-white/5 rounded-full p-1 pr-4 border border-white/5 cursor-pointer hover:bg-white/10 transition-colors"
          onClick={() => navigate('/profile')}
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-green-700 flex items-center justify-center text-white shadow-inner flex-shrink-0">
            <User size={18} />
          </div>
          <span className="hidden sm:block text-sm font-semibold text-white truncate max-w-[100px]">{user?.username}</span>
          <button className="text-gray-400 hover:text-red-500 transition-colors ml-1 md:ml-2" onClick={(e) => { e.stopPropagation(); handleLogout(); }} title="Sign Out">
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
