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

export default function RoomPage() {
  const { id: roomId } = useParams();
  const navigate = useNavigate();
  const { setRoom, setMembers, setTracks, addTrack, removeTrack, clearRoom } = useRoomStore();
  const { applyPlaybackUpdate, clearPlayer } = usePlayerStore();
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
    <div className="flex flex-col xl:flex-row h-full">
      <main className="flex-1 flex flex-col min-w-0">
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
          <>
            <div className="px-6 pt-6">
              <TrackUpload />
            </div>
            <div className="flex-1 overflow-y-auto px-6 pb-6">
              <TrackList />
            </div>
          </>
        )}
      </main>

      <aside className="w-full xl:w-[320px] bg-zinc-950 border-t xl:border-t-0 xl:border-l border-white/5 flex-shrink-0 flex flex-col xl:h-full max-h-[300px] xl:max-h-full overflow-y-auto">
        <MemberList />
      </aside>
    </div>
  );
}
