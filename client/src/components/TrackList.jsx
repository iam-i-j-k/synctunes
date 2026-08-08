import api from '../api/axios';
import socket from '../socket/socket';
import useAuthStore from '../stores/authStore';
import useRoomStore from '../stores/roomStore';
import usePlayerStore from '../stores/playerStore';

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
      <div className="card" style={{ padding: '1rem', color: 'var(--color-text-muted)', fontSize: '0.95rem' }}>
        No tracks yet. Upload one below.
      </div>
    );
  }

  return (
    <div className="track-list">
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {tracks.map((track) => {
          const isPlaying = track._id === currentTrackId;
          return (
            <li
              key={track._id}
              onClick={() => handleSelect(track._id)}
              className={`track-row${isPlaying ? ' active' : ''}`}
            >
              <div className="track-meta">
                <strong>{track.title}</strong>
                <span>{track.artist}</span>
              </div>

              <span className="track-duration">{formatMs(track.durationMs)}</span>

              {(track.uploadedBy === user?.id || isHost) && (
                <button
                  type="button"
                  className="btn-danger btn-small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(track);
                  }}
                >
                  ✕
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
