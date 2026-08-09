import { Trash2, Music, Plus } from 'lucide-react';
import api from '../api/axios';
import socket from '../socket/socket';
import useAuthStore from '../stores/authStore';
import useRoomStore from '../stores/roomStore';
import usePlayerStore from '../stores/playerStore';
import { useState } from 'react';
import AddToPlaylistModal from './AddToPlaylistModal';
import ContextMenu from './ContextMenu';
import { downloadTrack } from '../utils/downloadTrack';
import { Download } from 'lucide-react';

function formatMs(ms) {
  if (!ms) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function TrackList() {
  const { user } = useAuthStore();
  const { currentRoom, tracks, removeTrack } = useRoomStore();
  const { currentTrackId, actionSequence } = usePlayerStore();
  const [selectedTrackForPlaylist, setSelectedTrackForPlaylist] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);

  if (!currentRoom) return null;

  const hostId = currentRoom.hostId?.toString() || currentRoom.hostId?._id?.toString();
  const isHost = hostId === user?.id;

  function handleSelect(trackId) {
    if (trackId === currentTrackId) return;
    socket.emit('playback:trackChange', {
      roomId: currentRoom._id,
      trackId,
      actionSequence,
    });
  }

  function handleContextMenu(e, track) {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      track
    });
  }

  async function handleDelete(track) {
    try {
      await api.delete(`/tracks/${track._id}`);
      removeTrack(track._id);
    } catch (err) {
      console.error('Delete track failed:', err);
    }
  }

  if (tracks.length === 0) {
    return (
      <div className="p-8 text-center bg-white/[0.02] border border-white/5 rounded-2xl text-gray-400">
        No tracks yet. Upload one below.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2 m-0 p-0 list-none">
        {tracks.map((track) => {
          const isPlaying = track._id === currentTrackId;
          return (
            <li
              key={track._id}
              onClick={() => handleSelect(track._id)}
              onContextMenu={(e) => handleContextMenu(e, track)}
              className={`flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all border ${isPlaying ? 'bg-primary/10 border-primary/30 shadow-[0_0_15px_rgba(30,215,96,0.1)]' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <Music size={18} className={isPlaying ? 'text-primary' : 'text-gray-500'} />
                <div className="flex flex-col min-w-0">
                  <span className={`font-semibold text-[15px] truncate ${isPlaying ? 'text-primary' : 'text-white'}`}>
                    {track.title}
                  </span>
                </div>
              </div>

              <span className="text-sm font-mono text-gray-500">{formatMs(track.durationMs)}</span>

              <button
                type="button"
                className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors ml-4"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTrackForPlaylist(track);
                }}
                title="Add to playlist"
              >
                <Plus size={16} />
              </button>

              {(track.uploadedBy === user?.id || isHost) && (
                <button
                  type="button"
                  className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors ml-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(track);
                  }}
                  title="Delete track"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {selectedTrackForPlaylist && (
        <AddToPlaylistModal 
          track={selectedTrackForPlaylist} 
          onClose={() => setSelectedTrackForPlaylist(null)} 
        />
      )}

      {contextMenu && (
        <ContextMenu 
          x={contextMenu.x} 
          y={contextMenu.y} 
          onClose={() => setContextMenu(null)}
          items={[
            {
              label: 'Download Song',
              icon: <Download size={16} />,
              onClick: () => downloadTrack(contextMenu.track)
            }
          ]}
        />
      )}
    </div>
  );
}
