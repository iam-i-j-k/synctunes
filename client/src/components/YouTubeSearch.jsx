import { useState } from 'react';
import { Search, Loader2, Music, Check, PlaySquare } from 'lucide-react';
import api from '../api/axios';
import useRoomStore from '../stores/roomStore';

export default function YouTubeSearch({ closeModal }) {
  const { currentRoom, addTrack, tracks } = useRoomStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addingId, setAddingId] = useState(null);
  const [error, setError] = useState('');

  const trackYoutubeIds = tracks.map(t => t.youtubeId).filter(Boolean);

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setError('');
    
    try {
      const { data } = await api.get(`/youtube/search?q=${encodeURIComponent(query)}`);
      setResults(data.videos || []);
    } catch (err) {
      setError('Failed to search YouTube.');
    } finally {
      setIsSearching(false);
    }
  }

  async function handleAddVideo(video) {
    setAddingId(video.id);
    setError('');

    try {
      const { data } = await api.post('/youtube/add', {
        roomId: currentRoom._id,
        videoId: video.id,
        title: video.title,
        artist: video.artist || 'YouTube',
        thumbnail: video.thumbnail,
        durationMs: video.durationMs,
      });
      
      addTrack(data.track);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add track');
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div className="flex flex-col h-full max-h-[60vh]">
      <form onSubmit={handleSearch} className="flex gap-2 mb-4 flex-shrink-0">
        <input
          type="text"
          placeholder="Search YouTube..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 px-4 py-2 bg-black/20 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500/50"
        />
        <button
          type="submit"
          disabled={isSearching || !query.trim()}
          className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-semibold rounded-lg flex items-center justify-center transition-colors"
        >
          {isSearching ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
        </button>
      </form>

      {error && <div className="text-red-500 text-sm mb-4 text-center">{error}</div>}

      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2">
        {results.length === 0 && !isSearching && !error && (
          <div className="flex flex-col items-center justify-center h-40 text-gray-500 opacity-50">
            <PlaySquare size={48} className="mb-2" />
            <p>Search for any song on YouTube</p>
          </div>
        )}

        {results.map((video) => {
          const isAdded = trackYoutubeIds.includes(video.id);
          const isCurrentlyAdding = addingId === video.id;

          return (
            <div key={video.id} className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors">
              <img src={video.thumbnail} alt={video.title} className="w-16 h-12 object-cover rounded-md" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white truncate">{video.title}</div>
                <div className="text-xs text-gray-400 truncate">{video.artist}</div>
              </div>
              <button
                onClick={() => handleAddVideo(video)}
                disabled={isAdded || isCurrentlyAdding}
                className="ml-auto px-3 py-1.5 rounded-lg text-sm font-bold bg-white/10 hover:bg-white/20 disabled:bg-primary/20 disabled:text-primary transition-colors flex items-center justify-center gap-2 min-w-[70px]"
              >
                {isAdded ? (
                  <><Check size={16} /> Added</>
                ) : isCurrentlyAdding ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  'Add'
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
