import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import socket, { connectSocket } from '../socket/socket';
import useAuthStore from '../stores/authStore';
import useRoomStore from '../stores/roomStore';
import usePlayerStore from '../stores/playerStore';
import { useClockSync } from '../hooks/useClockSync';
import RoomHeader from '../components/RoomHeader';
import MemberList from '../components/MemberList';
import TrackList from '../components/TrackList';
import TrackUpload from '../components/TrackUpload';
import { Play, Pause } from 'lucide-react';

export default function RoomPage() {
  const { id: roomId } = useParams();
  const navigate = useNavigate();
  const { currentRoom, tracks, setRoom, setMembers, setTracks, addTrack, removeTrack, clearRoom } = useRoomStore();
  const { playbackState, actionSequence, currentTrackId, applyPlaybackUpdate, clearPlayer } = usePlayerStore();

  function handlePlayPauseRoom() {
    if (!currentRoom) return;
    if (playbackState.isPlaying) {
      socket.emit('playback:pause', { roomId: currentRoom._id, actionSequence });
    } else {
      if (currentTrackId) {
        socket.emit('playback:play', { roomId: currentRoom._id, actionSequence });
      } else if (tracks && tracks.length > 0) {
        socket.emit('playback:trackChange', {
          roomId: currentRoom._id,
          trackId: tracks[0]._id,
          actionSequence
        });
      }
    }
  }
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [roomError, setRoomError] = useState('');

  useClockSync();

  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    setLoadingRoom(true);
    setRoomError('');

    function onRoomState({ room }) {
      setRoomError('');
      setLoadingRoom(false);
      api
        .get(`/rooms/${roomId}/tracks`)
        .then(({ data }) => {
          setTracks(data.tracks);
        })
        .catch((err) => {
          console.error(err);
          setRoomError('Unable to load room tracks.');
        });
    }

    function onRoomStateError(error) {
      setRoomError(error?.reason || 'Failed to join room.');
      setLoadingRoom(false);
    }

    function onConnect() {
      socket.emit('room:join', { roomId });
    }

    socket.on('room:state', onRoomState);
    socket.on('room:joinError', onRoomStateError);
    socket.on('connect', onConnect);

    if (token && !socket.connected) {
      connectSocket(token);
    }

    if (socket.connected) {
      socket.emit('room:join', { roomId });
    }

    return () => {
      socket.off('room:state', onRoomState);
      socket.off('room:joinError', onRoomStateError);
      socket.off('connect', onConnect);
    };
  }, [roomId]);

  return (
    <div className="flex flex-col xl:flex-row h-full overflow-y-auto xl:overflow-hidden">
      <main className="flex-1 flex flex-col min-w-0 xl:overflow-y-auto overflow-visible">
        <RoomHeader />

        {roomError ? (
          <div className="p-6 m-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 flex items-center justify-center min-h-[200px]">
            {roomError}
          </div>
        ) : loadingRoom ? (
          <div className="flex-1 flex flex-col items-center justify-center min-h-[300px]">
            <div className="w-10 h-10 border-4 border-white/10 border-t-primary rounded-full animate-spin mb-4"></div>
            <p className="text-gray-400 animate-pulse font-medium">Entering Room...</p>
          </div>
        ) : (
          <div className="flex flex-col flex-1">
            <div className="flex items-center gap-6 px-4 md:px-8 py-4 pb-2 mt-2">
               <button 
                 className="w-14 h-14 bg-primary text-black rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-xl flex-shrink-0"
                 onClick={handlePlayPauseRoom}
                 title={playbackState.isPlaying ? 'Pause Room' : 'Play Room'}
               >
                 {playbackState.isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
               </button>
               
               <TrackUpload />
            </div>
            <div className="flex flex-col flex-1 px-4 md:px-8 py-4 pt-0">
              <TrackList />
            </div>
          </div>
        )}
      </main>

      <aside className="w-full xl:w-[320px] bg-zinc-950 border-t xl:border-t-0 xl:border-l border-white/5 flex-shrink-0 flex flex-col xl:h-full max-h-[300px] xl:max-h-full overflow-y-auto">
        <MemberList />
      </aside>
    </div>
  );
}
