import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Heart, ListMusic, Music, Play, Plus, ArrowLeft, Trash2 } from 'lucide-react';
import api from '../api/axios';
import useAuthStore from '../stores/authStore';
import AddToPlaylistModal from '../components/AddToPlaylistModal';

import useRoomStore from '../stores/roomStore';
import usePlayerStore from '../stores/playerStore';
import socket from '../socket/socket';

export default function LibraryPage() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  
  const [likedTracks, setLikedTracks] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);

  // Playlist creation & detail
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '' });
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  
  const [activePlaylist, setActivePlaylist] = useState(null);
  const [loadingPlaylist, setLoadingPlaylist] = useState(false);
  
  const [selectedTrackForPlaylist, setSelectedTrackForPlaylist] = useState(null);

  const { currentRoom } = useRoomStore();
  const { actionSequence } = usePlayerStore();

  const addTrackToStore = useRoomStore(s => s.addTrack);

  async function addAndPlayTrack(trackId) {
    try {
      const trackObj = likedTracks.find(t => t._id === trackId) || activePlaylist?.trackIds.find(t => t._id === trackId);
      if (trackObj) addTrackToStore(trackObj);

      if (currentRoom) {
        api.post(`/rooms/${currentRoom._id}/tracks/add-existing`, { trackId }).catch(console.error);
        socket.emit('playback:trackChange', { roomId: currentRoom._id, trackId, actionSequence });
      } else {
        const { data: { room } } = await api.post('/rooms', { name: 'My Library', isPrivate: true });
        api.post(`/rooms/${room._id}/tracks/add-existing`, { trackId }).catch(console.error);
        socket.emit('room:join', { roomId: room._id });
        
        setTimeout(() => {
          socket.emit('playback:trackChange', { roomId: room._id, trackId, actionSequence: 0 });
        }, 50);
      }
    } catch (err) {
      console.error(err);
    }
  }



  async function handleOpenPlaylist(playlistId) {
    setLoadingPlaylist(true);
    try {
      const { data } = await api.get(`/playlists/${playlistId}`);
      setActivePlaylist(data.playlist);
    } catch (err) {
      console.error('Failed to load playlist', err);
    } finally {
      setLoadingPlaylist(false);
    }
  }

  async function handleDeletePlaylist() {
    if (!activePlaylist) return;
    if (!confirm('Are you sure you want to delete this playlist?')) return;
    try {
      await api.delete(`/playlists/${activePlaylist._id}`);
      setPlaylists(playlists.filter(p => p._id !== activePlaylist._id));
      setActivePlaylist(null);
    } catch (err) {
      console.error('Failed to delete playlist', err);
    }
  }

  async function handleRemoveFromPlaylist(trackId) {
    if (!activePlaylist) return;
    try {
      await api.delete(`/playlists/${activePlaylist._id}/tracks/${trackId}`);
      setActivePlaylist({
        ...activePlaylist,
        trackIds: activePlaylist.trackIds.filter(t => t._id !== trackId)
      });
    } catch (err) {
      console.error('Failed to remove track', err);
    }
  }

  async function handleCreatePlaylist(e) {
    e.preventDefault();
    if (!createForm.name.trim()) {
      setCreateError('Playlist name is required');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      const { data } = await api.post('/playlists', { name: createForm.name });
      setPlaylists([data.playlist, ...playlists]);
      setShowCreate(false);
      setCreateForm({ name: '' });
    } catch (err) {
      setCreateError(err.response?.data?.message || 'Failed to create playlist');
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    if (!tab || (tab !== 'likes' && tab !== 'playlists')) {
      navigate('/library/likes', { replace: true });
    }
    // Clear active playlist when switching tabs
    if (tab === 'likes') {
      setActivePlaylist(null);
    }
  }, [tab, navigate]);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        if (tab === 'likes') {
          const { data } = await api.get('/users/likes');
          setLikedTracks(data.tracks || []);
        } else if (tab === 'playlists') {
          const { data } = await api.get('/playlists');
          setPlaylists(data.playlists || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [tab]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-white/20 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-zinc-900 overflow-y-auto">
      {/* Header Area */}
      <div className="px-4 md:px-10 py-8 md:py-12 bg-gradient-to-b from-indigo-900/40 to-zinc-900 flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-6 text-center md:text-left">
        {tab === 'likes' && !activePlaylist ? (
          <>
            <div className="w-32 h-32 md:w-48 md:h-48 rounded-xl shadow-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
              <Heart size={60} fill="white" className="text-white drop-shadow-lg md:w-[80px] md:h-[80px]" />
            </div>
            <div className="flex flex-col gap-1 md:gap-2">
              <span className="text-xs md:text-sm font-bold uppercase tracking-wider text-white/80">Playlist</span>
              <h1 className="text-4xl md:text-7xl font-extrabold text-white tracking-tighter">Liked Songs</h1>
              <span className="text-xs md:text-sm text-gray-300 font-medium">{user?.username} • {likedTracks.length} songs</span>
            </div>
          </>
        ) : activePlaylist ? (
          <>
            <div className="w-32 h-32 md:w-48 md:h-48 rounded-xl shadow-2xl bg-zinc-800 flex items-center justify-center flex-shrink-0">
              <ListMusic size={60} className="text-white/20 md:w-[80px] md:h-[80px]" />
            </div>
            <div className="flex flex-col gap-1 md:gap-2 flex-1 items-center md:items-start">
              <span className="text-xs md:text-sm font-bold uppercase tracking-wider text-white/80">Playlist</span>
              <h1 className="text-4xl md:text-7xl font-extrabold text-white tracking-tighter truncate max-w-full md:max-w-[800px]">{activePlaylist.name}</h1>
              <span className="text-xs md:text-sm text-gray-300 font-medium">{user?.username} • {activePlaylist.trackIds?.length || 0} songs</span>
            </div>
            <div className="self-center md:self-end mt-2 md:mt-0 md:mb-4">
              <button 
                onClick={handleDeletePlaylist}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-full transition-colors text-sm font-bold"
              >
                <Trash2 size={16} /> Delete Playlist
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="w-32 h-32 md:w-48 md:h-48 rounded-xl shadow-2xl bg-zinc-800 flex items-center justify-center flex-shrink-0">
              <ListMusic size={60} className="text-white/20 md:w-[80px] md:h-[80px]" />
            </div>
            <div className="flex flex-col gap-1 md:gap-2 items-center md:items-start">
              <span className="text-xs md:text-sm font-bold uppercase tracking-wider text-white/80">Collection</span>
              <h1 className="text-4xl md:text-7xl font-extrabold text-white tracking-tighter">Playlists</h1>
              <span className="text-xs md:text-sm text-gray-300 font-medium">{user?.username} • {playlists.length} playlists</span>
            </div>
          </>
        )}
      </div>

      {/* Content Area */}
      <div className="px-4 md:px-10 py-6">
        {tab === 'likes' && (
          <div className="flex flex-col w-full">
            <div className="flex items-center gap-4 text-gray-400 border-b border-white/10 pb-2 mb-4 px-4 text-sm font-medium uppercase tracking-wider">
              <div className="w-8 text-right">#</div>
              <div className="flex-1">Title</div>
            </div>

            {likedTracks.length === 0 ? (
              <div className="py-20 text-center text-gray-400">
                <Music size={48} className="mx-auto mb-4 opacity-50" />
                <h3 className="text-xl font-bold text-white mb-2">Songs you like will appear here</h3>
                <p>Save songs by tapping the heart icon.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {likedTracks.map((track, i) => (
                  <div key={track._id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-white/5 group transition-colors cursor-pointer" onClick={() => addAndPlayTrack(track._id)}>
                    <div className="w-8 text-right text-gray-400 group-hover:hidden">{i + 1}</div>
                    <div className="w-8 text-right hidden group-hover:block" onClick={(e) => { e.stopPropagation(); addAndPlayTrack(track._id); }}>
                      <Play size={16} fill="currentColor" className="text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-white text-[15px]">{track.title}</div>
                    </div>
                    <div 
                      className="text-gray-400 hover:text-white mr-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTrackForPlaylist(track);
                      }}
                      title="Add to playlist"
                    >
                      <Plus size={16} />
                    </div>
                    <div className="text-primary">
                      <Heart size={16} fill="currentColor" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}


        {tab === 'playlists' && !activePlaylist && (
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white tracking-tight">Your Playlists</h2>
              <button 
                className="px-4 py-2 bg-white text-black font-bold rounded-full text-sm hover:scale-105 transition-transform"
                onClick={() => setShowCreate(true)}
              >
                Create Playlist
              </button>
            </div>
            
            {playlists.length === 0 ? (
              <div className="py-20 text-center text-gray-400">
                <ListMusic size={48} className="mx-auto mb-4 opacity-50" />
                <h3 className="text-xl font-bold text-white mb-2">No playlists yet</h3>
                <p>Create a playlist to organize your music.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
                {playlists.map(playlist => (
                  <div 
                    key={playlist._id} 
                    className="bg-zinc-800/40 p-4 rounded-xl hover:bg-zinc-800 transition-colors cursor-pointer group"
                    onClick={() => handleOpenPlaylist(playlist._id)}
                  >
                    <div className="w-full aspect-square bg-zinc-700 rounded-lg mb-4 flex items-center justify-center shadow-lg relative">
                      <Music size={32} className="text-white/20" />
                      <div 
                        className="absolute bottom-2 right-2 w-10 h-10 bg-primary rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all shadow-xl"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (playlist.trackIds && playlist.trackIds.length > 0) {
                            addAndPlayTrack(playlist.trackIds[0]._id || playlist.trackIds[0]);
                          } else {
                            handleOpenPlaylist(playlist._id);
                          }
                        }}
                      >
                        <Play size={20} fill="black" className="text-black ml-1" />
                      </div>
                    </div>
                    <div className="font-bold text-white text-[15px] truncate">{playlist.name}</div>
                    <div className="text-sm text-gray-400 mt-1">Playlist</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'playlists' && activePlaylist && (
          <div className="flex flex-col w-full">
            <div className="flex items-center gap-4 mb-6">
              <button 
                onClick={() => setActivePlaylist(null)}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-white"
              >
                <ArrowLeft size={24} />
              </button>
            </div>
            
            <div className="flex items-center gap-4 text-gray-400 border-b border-white/10 pb-2 mb-4 px-4 text-sm font-medium uppercase tracking-wider">
              <div className="w-8 text-right">#</div>
              <div className="flex-1">Title</div>
            </div>

            {loadingPlaylist ? (
              <div className="py-20 flex justify-center">
                 <div className="w-8 h-8 border-2 border-white/20 border-t-primary rounded-full animate-spin"></div>
              </div>
            ) : !activePlaylist.trackIds || activePlaylist.trackIds.length === 0 ? (
              <div className="py-20 text-center text-gray-400">
                <Music size={48} className="mx-auto mb-4 opacity-50" />
                <h3 className="text-xl font-bold text-white mb-2">It's a bit empty here</h3>
                <p>Add some songs to your playlist!</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {activePlaylist.trackIds.map((track, i) => (
                  <div key={track._id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-white/5 group transition-colors cursor-pointer" onClick={() => addAndPlayTrack(track._id)}>
                    <div className="w-8 text-right text-gray-400 group-hover:hidden">{i + 1}</div>
                    <div className="w-8 text-right hidden group-hover:block" onClick={(e) => { e.stopPropagation(); addAndPlayTrack(track._id); }}>
                      <Play size={16} fill="currentColor" className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-white text-[15px] truncate">{track.title}</div>
                    </div>
                    <button 
                      className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFromPlaylist(track._id);
                      }}
                      title="Remove from playlist"
                    >
                      <Trash2 size={16} />
                    </button>
                    <div 
                      className="text-gray-400 hover:text-white mr-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTrackForPlaylist(track);
                      }}
                      title="Add to another playlist"
                    >
                      <Plus size={16} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Playlist Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl p-8 shadow-2xl">
            <h2 className="mb-6 text-xl font-bold">Create a Playlist</h2>
            <form onSubmit={handleCreatePlaylist} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label htmlFor="playlist-name" className="text-sm font-medium text-gray-300">Playlist Name</label>
                <input
                  id="playlist-name"
                  maxLength={50}
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  autoFocus
                  className="w-full px-4 py-2.5 bg-black/20 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                />
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

      {/* Add To Playlist Modal */}
      {selectedTrackForPlaylist && (
        <AddToPlaylistModal 
          track={selectedTrackForPlaylist}
          onClose={() => setSelectedTrackForPlaylist(null)}
        />
      )}
    </div>
  );
}
