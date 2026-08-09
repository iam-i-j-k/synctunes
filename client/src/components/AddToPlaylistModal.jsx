import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ListMusic, Plus, Check } from 'lucide-react';
import api from '../api/axios';

export default function AddToPlaylistModal({ track, onClose }) {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addedPlaylists, setAddedPlaylists] = useState(new Set());
  const [success, setSuccess] = useState(false);
  
  // Create playlist inline
  const [showCreate, setShowCreate] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function fetchPlaylists() {
      try {
        const { data } = await api.get('/playlists');
        setPlaylists(data.playlists || []);
      } catch (err) {
        setError('Failed to load playlists');
      } finally {
        setLoading(false);
      }
    }
    fetchPlaylists();
  }, []);

  async function handleAddToPlaylist(playlistId) {
    try {
      await api.post(`/playlists/${playlistId}/tracks`, { trackId: track._id });
      setAddedPlaylists(new Set([...addedPlaylists, playlistId]));
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add to playlist');
    }
  }

  async function handleCreatePlaylist(e) {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    setCreating(true);
    try {
      const { data } = await api.post('/playlists', { name: newPlaylistName });
      setPlaylists([data.playlist, ...playlists]);
      await handleAddToPlaylist(data.playlist._id);
      setShowCreate(false);
      setNewPlaylistName('');
    } catch (err) {
      setError('Failed to create playlist');
    } finally {
      setCreating(false);
    }
  }
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col max-h-[80vh] relative">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ListMusic size={20} className="text-primary" /> Add to Playlist
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <p className="text-sm text-gray-400 mb-4 truncate">
          Select a playlist for <span className="font-bold text-white">{track.title}</span>
        </p>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="flex-1 overflow-y-auto min-h-[150px] mb-4">
          {loading ? (
             <div className="flex items-center justify-center h-full">
               <div className="w-6 h-6 border-2 border-white/20 border-t-primary rounded-full animate-spin"></div>
             </div>
          ) : playlists.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              No playlists found. Create one below!
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {playlists.map(p => {
                const isAdded = addedPlaylists.has(p._id);
                return (
                  <li 
                    key={p._id}
                    onClick={() => !isAdded && handleAddToPlaylist(p._id)}
                    className={`flex items-center justify-between p-3 rounded-xl transition-all cursor-pointer ${isAdded ? 'bg-primary/20 border border-primary/50 text-primary' : 'bg-white/5 border border-white/5 hover:bg-white/10 text-white'}`}
                  >
                    <span className="font-semibold truncate">{p.name}</span>
                    {isAdded ? <span className="text-xs font-bold uppercase">Added</span> : <Plus size={16} className="text-gray-400" />}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {showCreate ? (
          <form onSubmit={handleCreatePlaylist} className="flex flex-col gap-2 border-t border-white/10 pt-4 mt-2">
            <input
              autoFocus
              maxLength={50}
              placeholder="New playlist name..."
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              className="w-full px-4 py-2 bg-black/20 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary/50 text-sm"
            />
            <div className="flex gap-2 mt-1">
              <button type="submit" className="flex-1 py-2 bg-primary text-black font-bold rounded-xl text-sm" disabled={creating}>
                {creating ? 'Creating...' : 'Save & Add'}
              </button>
              <button type="button" className="flex-1 py-2 bg-white/10 text-white font-bold rounded-xl text-sm" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button 
            className="w-full py-3 border-2 border-dashed border-white/10 hover:border-primary/50 text-gray-400 hover:text-white rounded-xl transition-all font-semibold flex items-center justify-center gap-2 mt-2"
            onClick={() => setShowCreate(true)}
          >
            <Plus size={18} /> New Playlist
          </button>
        )}

        {/* Success Animation Overlay */}
        {success && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-zinc-900/90 backdrop-blur-sm rounded-2xl animate-fade-in">
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(30,215,96,0.5)]">
              <Check size={32} className="text-black" />
            </div>
            <h3 className="text-xl font-bold text-white">Added to Playlist</h3>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
