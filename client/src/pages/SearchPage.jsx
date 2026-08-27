import { useState, useRef, useEffect, useCallback } from 'react';
import { Search as SearchIcon, Loader2, PlaySquare, Plus, Library, Home, Music } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';
import socket from '../socket/socket';
import useRoomStore from '../stores/roomStore';
import useplaybackStore from '../stores/playbackStore';
import AddToRoomModal from '../components/AddToRoomModal';

function stringToGradient(str = '') {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash % 360);
  const h2 = Math.abs((hash * 2) % 360);
  return `linear-gradient(135deg, hsl(${h1}, 70%, 50%), hsl(${h2}, 70%, 30%))`;
}

export default function SearchPage() {
  const navigate = useNavigate();
  const { currentRoom } = useRoomStore();

  const [activeTab, setActiveTab] = useState('youtube'); // 'youtube' or 'local'
  const [query, setQuery] = useState('');
  
  // YouTube Search State
  const [youtubeResults, setYoutubeResults] = useState([]);
  const [isSearchingYoutube, setIsSearchingYoutube] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Local Search State
  const [localResults, setLocalResults] = useState({ tracks: [], rooms: [] });
  const [isSearchingLocal, setIsSearchingLocal] = useState(false);

  const debounceRef = useRef(null);

  const searchYouTube = async (q) => {
    setIsSearchingYoutube(true);
    try {
      const { data } = await api.get(`/youtube/search?q=${encodeURIComponent(q.trim())}`);
      setYoutubeResults(data.videos || []);
    } catch (err) {
      console.error('YouTube search failed:', err);
    } finally {
      setIsSearchingYoutube(false);
    }
  };

  const searchLocal = async (q) => {
    setIsSearchingLocal(true);
    try {
      const { data } = await api.get(`/search?q=${encodeURIComponent(q.trim())}`);
      setLocalResults(data);
    } catch (err) {
      console.error('Local search failed:', err);
    } finally {
      setIsSearchingLocal(false);
    }
  };

  const executeSearch = useCallback((q, tab) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      if (tab === 'youtube') setYoutubeResults([]);
      if (tab === 'local') setLocalResults({ tracks: [], rooms: [] });
      return;
    }
    
    debounceRef.current = setTimeout(() => {
      if (tab === 'youtube') searchYouTube(q);
      if (tab === 'local') searchLocal(q);
    }, 400);
  }, []);

  useEffect(() => {
    executeSearch(query, activeTab);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, activeTab, executeSearch]);

  const handleVideoClick = (video) => {
    setSelectedVideo(video);
    setIsModalOpen(true);
  };

  async function playLocalTrack(track) {
    try {
      if (currentRoom) {
        await api.post(`/rooms/${currentRoom._id}/tracks/add-existing`, { trackId: track._id }).catch(console.error);
        const { actionSequence } = useplaybackStore.getState();
        socket.emit('playback:trackChange', { roomId: currentRoom._id, trackId: track._id, actionSequence });
      } else {
        const { data: { room } } = await api.post('/rooms/personal');
        await api.post(`/rooms/${room._id}/tracks/add-existing`, { trackId: track._id }).catch(console.error);
        socket.emit('room:join', { roomId: room._id });
        
        // Wait a bit for the room state to sync the fresh actionSequence
        setTimeout(() => {
          const { actionSequence } = useplaybackStore.getState();
          socket.emit('playback:trackChange', { roomId: room._id, trackId: track._id, actionSequence: actionSequence || 0 });
        }, 200);
      }
      toast.success(`Playing ${track.title}`);
    } catch (err) {
      console.error('Play track failed:', err);
      toast.error('Failed to play track');
    }
  }

  const hasLocalResults = localResults.tracks.length > 0 || localResults.rooms.length > 0;

  return (
    <div className="flex-1 w-full h-full overflow-y-auto relative no-scrollbar">
      <div className="max-w-6xl w-full mx-auto flex flex-col min-h-full pt-8 px-4 md:px-8 pb-12">
        
        {/* Header & Tabs */}
        <div className="mb-8 flex flex-col gap-6 items-center text-center">
          <h1 className="text-3xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-primary via-green-400 to-emerald-300 tracking-tight flex items-center justify-center gap-3">
            <SearchIcon size={36} className="text-primary hidden md:block" />
            Discover
          </h1>
          
          {/* Tabs */}
          <div className="flex bg-black/40 p-1 rounded-full border border-white/5 backdrop-blur-md">
            <button
              onClick={() => { setActiveTab('youtube'); }}
              className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${
                activeTab === 'youtube' 
                  ? 'bg-white/10 text-white shadow-lg border border-white/10' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <PlaySquare size={16} className={activeTab === 'youtube' ? 'text-red-500' : ''} />
              YouTube
            </button>
            <button
              onClick={() => { setActiveTab('local'); }}
              className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${
                activeTab === 'local' 
                  ? 'bg-white/10 text-white shadow-lg border border-white/10' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Library size={16} className={activeTab === 'local' ? 'text-primary' : ''} />
              Library & Rooms
            </button>
          </div>

          {/* Search Input - Refined UI */}
          <div className="relative w-full max-w-2xl group mx-auto">
            <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none z-10">
              <SearchIcon className="h-6 w-6 text-gray-500 group-focus-within:text-primary transition-colors" />
            </div>
            <input
              type="text"
              placeholder={activeTab === 'youtube' ? "Search YouTube for any song..." : "Search for tracks or rooms..."}
              className="block w-full pl-14 pr-6 py-4 bg-white/5 border border-white/10 rounded-full text-lg text-white placeholder-gray-500 focus:outline-none focus:bg-white/10 transition-all shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-md focus:shadow-[0_0_20px_rgba(30,215,96,0.2)] relative z-0"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {/* Results Area */}
        <div className="w-full">
          
          {/* YOUTUBE RESULTS */}
          {activeTab === 'youtube' && (
            <>
              {isSearchingYoutube ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                  <Loader2 size={48} className="animate-spin text-primary mb-4" />
                  <p className="text-lg">Searching YouTube...</p>
                </div>
              ) : youtubeResults.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                  {youtubeResults.map((video) => (
                    <div 
                      key={video.id} 
                      className="group relative bg-white/5 rounded-xl overflow-hidden hover:bg-white/10 transition-all duration-300 cursor-pointer border border-white/5 hover:border-primary/30 shadow-lg hover:shadow-primary/20 flex flex-col h-full"
                      onClick={() => handleVideoClick(video)}
                    >
                      <div className="relative aspect-video w-full overflow-hidden">
                        <img 
                          src={video.thumbnail} 
                          alt={video.title} 
                          className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500" 
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center shadow-[0_0_20px_rgba(30,215,96,0.5)] transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                            <Plus fill="black" size={24} className="text-black" />
                          </div>
                        </div>
                        <div className="absolute bottom-2 right-2 bg-black/80 px-1.5 py-0.5 rounded text-[10px] font-medium text-white backdrop-blur-md">
                          {Math.floor(video.durationMs / 60000)}:{String(Math.floor((video.durationMs % 60000) / 1000)).padStart(2, '0')}
                        </div>
                        <div className="absolute top-2 left-2 bg-red-600/90 p-1 rounded text-white backdrop-blur-md">
                          <PlaySquare size={14} />
                        </div>
                      </div>
                      
                      <div className="p-3 md:p-4 flex flex-col flex-1">
                        <h3 className="text-sm md:text-base font-bold text-white line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                          {video.title}
                        </h3>
                        <p className="text-xs md:text-sm text-gray-400 mt-1.5 line-clamp-1 mt-auto">
                          {video.artist}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : query.trim() ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                  <SearchIcon size={64} className="mb-4 opacity-20" />
                  <p className="text-xl font-medium">No results found for &quot;{query}&quot;</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                  <PlaySquare size={64} className="mb-4 opacity-20" />
                  <p className="text-xl font-medium">Search YouTube</p>
                  <p className="mt-2 text-sm text-center max-w-md">Find any song, remix, or live performance from YouTube and add it to your rooms.</p>
                </div>
              )}
            </>
          )}

          {/* LOCAL RESULTS */}
          {activeTab === 'local' && (
            <div className="max-w-3xl mx-auto w-full">
              {isSearchingLocal ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                  <Loader2 size={48} className="animate-spin text-primary mb-4" />
                  <p className="text-lg">Searching Library...</p>
                </div>
              ) : hasLocalResults ? (
                <div className="flex flex-col gap-6">
                  {/* Tracks */}
                  {localResults.tracks.length > 0 && (
                    <div className="bg-black/20 rounded-2xl border border-white/5 overflow-hidden">
                      <div className="px-6 py-4 border-b border-white/5 flex items-center gap-2 text-white font-bold">
                        <Music size={18} className="text-primary" />
                        Tracks
                      </div>
                      <div className="p-2 flex flex-col gap-1">
                        {localResults.tracks.map((track) => (
                          <button
                            key={track._id}
                            className="flex items-center gap-4 w-full p-3 rounded-xl hover:bg-white/5 transition-colors text-left group"
                            onClick={() => playLocalTrack(track)}
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
                              <div className="text-base font-semibold text-white truncate group-hover:text-primary transition-colors">
                                {track.title}
                              </div>
                              {track.artist && (
                                <div className="text-sm text-gray-400 truncate">{track.artist}</div>
                              )}
                            </div>
                            {track.durationMs && (
                              <div className="text-sm text-gray-500 flex-shrink-0">
                                {Math.floor(track.durationMs / 60000)}:{String(Math.floor((track.durationMs % 60000) / 1000)).padStart(2, '0')}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Rooms */}
                  {localResults.rooms.length > 0 && (
                    <div className="bg-black/20 rounded-2xl border border-white/5 overflow-hidden">
                      <div className="px-6 py-4 border-b border-white/5 flex items-center gap-2 text-white font-bold">
                        <Home size={18} className="text-primary" />
                        Rooms
                      </div>
                      <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {localResults.rooms.map((room) => {
                          const covers = Array.from(new Set((room.trackIds || []).map(t => t?.albumArtUrl).filter(Boolean))).slice(0, 1);
                          return (
                            <button
                              key={room._id}
                              className="flex items-center gap-4 w-full p-4 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/5 transition-all text-left group"
                              onClick={() => navigate(`/room/${room._id}`)}
                            >
                              <div className="w-14 h-14 rounded-xl bg-zinc-800 flex-shrink-0 overflow-hidden shadow-md">
                                {covers.length > 0 ? (
                                  <img src={covers[0]} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center" style={{ background: stringToGradient(room._id) }}>
                                    <span className="text-xl font-bold text-white/90">{room.name.substring(0, 2).toUpperCase()}</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-base font-bold text-white truncate group-hover:text-primary transition-colors">
                                  {room.name}
                                </div>
                                <div className="text-sm text-gray-400 mt-1">
                                  {room.hostId?.username || 'Unknown'} · {room.memberIds?.length || 0} members
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : query.trim() ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                  <SearchIcon size={64} className="mb-4 opacity-20" />
                  <p className="text-xl font-medium">No results found for &quot;{query}&quot;</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                  <Library size={64} className="mb-4 opacity-20" />
                  <p className="text-xl font-medium">Search Library & Rooms</p>
                  <p className="mt-2 text-sm text-center max-w-md">Find uploaded tracks or discover community rooms to join.</p>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      <AddToRoomModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        video={selectedVideo} 
      />
    </div>
  );
}
