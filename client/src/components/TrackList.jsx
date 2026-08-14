import { Trash2, Music, Plus } from 'lucide-react';
import api from '../api/axios';
import socket from '../socket/socket';
import useAuthStore from '../stores/authStore';
import useRoomStore from '../stores/roomStore';
import usePlayerStore from '../stores/playerStore';
import { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import AddToPlaylistModal from './AddToPlaylistModal';
import ContextMenu from './ContextMenu';
import { downloadTrack } from '../utils/downloadTrack';
import { Download, GripVertical } from 'lucide-react';
import { toast } from 'react-hot-toast';

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
      toast.success('Track deleted');
    } catch (err) {
      console.error('Delete track failed:', err);
      toast.error('Failed to delete track');
    }
  }

  function onDragEnd(result) {
    if (!result.destination) return;

    const sourceIndex = result.source.index;
    const destinationIndex = result.destination.index;

    if (sourceIndex === destinationIndex) return;

    const newTracks = Array.from(tracks);
    const [reorderedItem] = newTracks.splice(sourceIndex, 1);
    newTracks.splice(destinationIndex, 0, reorderedItem);

    // Update local store immediately for optimistic UI
    useRoomStore.getState().setTracks(newTracks);

    // Emit socket event
    const newTrackIds = newTracks.map(t => t._id);
    socket.emit('room:reorderTracks', { roomId: currentRoom._id, trackIds: newTrackIds });
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
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="track-list">
          {(provided) => (
            <ul 
              className="flex flex-col gap-2 m-0 p-0 list-none" 
              {...provided.droppableProps} 
              ref={provided.innerRef}
            >
              {tracks.map((track, index) => {
                const isPlaying = track._id === currentTrackId;
                return (
                  <Draggable key={track._id} draggableId={track._id} index={index}>
                    {(provided) => (
                      <li
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        onClick={() => handleSelect(track._id)}
                        onContextMenu={(e) => handleContextMenu(e, track)}
                        className={`flex items-center gap-2 md:gap-4 p-2 md:p-3 rounded-lg cursor-pointer transition-colors group w-full ${isPlaying ? 'bg-white/5' : 'hover:bg-white/5'}`}
                      >
                        <div {...provided.dragHandleProps} className="text-gray-600 hover:text-white cursor-grab active:cursor-grabbing w-6 flex justify-center opacity-50 transition-opacity">
                          <GripVertical size={16} />
                        </div>
                        <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
                          <div className={`w-10 h-10 flex items-center justify-center rounded overflow-hidden flex-shrink-0 bg-zinc-800 ${isPlaying ? 'text-primary' : 'text-gray-500'}`}>
                            {track.albumArtUrl ? (
                              <img src={track.albumArtUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Music size={18} />
                            )}
                          </div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className={`font-medium text-[15px] truncate ${isPlaying ? 'text-primary' : 'text-white'}`}>
                              {track.title}
                            </span>
                            {track.artist && <span className="text-[12px] text-gray-400 truncate">{track.artist}</span>}
                          </div>
                        </div>

                        <span className="text-sm font-mono text-gray-500">{formatMs(track.durationMs)}</span>

                        <button
                          type="button"
                          className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors ml-2 opacity-100"
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
                            className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors ml-1 opacity-100"
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
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </ul>
          )}
        </Droppable>
      </DragDropContext>
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
