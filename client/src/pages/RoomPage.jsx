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
import AudioPlayer from '../components/AudioPlayer';

export default function RoomPage() {
  const { id: roomId } = useParams();
  const navigate = useNavigate();
  const { setRoom, setMembers, setTracks, addTrack, removeTrack, clearRoom } = useRoomStore();
  const { applyPlaybackUpdate } = usePlayerStore();
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [roomError, setRoomError] = useState('');

  useClockSync();

  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    setLoadingRoom(true);
    setRoomError('');

    function onRoomState({ room, members, actionSequence }) {
      setRoom(room);
      setMembers(members);
      applyPlaybackUpdate(room.playbackState, actionSequence, room.currentTrackId);
      setLoadingRoom(false);

      api
        .get(`/rooms/${roomId}/tracks`)
        .then(({ data }) => setTracks(data.tracks))
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



    function onMemberUpdate({ members }) {
      setMembers(members);
    }

    function onKicked({ roomId: kickedFrom }) {
      if (kickedFrom.toString() === roomId) {
        clearRoom();
        navigate('/');
      }
    }

    function onRoomDeleted() {
      clearRoom();
      navigate('/');
    }

    function onRoomUpdated({ name }) {
      setRoom((prev) => (prev ? { ...prev, name } : prev));
    }

    function onTrackAdded({ track }) {
      addTrack(track);
    }

    function onTrackRemoved({ trackId }) {
      removeTrack(trackId);
    }

    function onPlaybackUpdate({ playbackState, actionSequence, currentTrackId }) {
      applyPlaybackUpdate(playbackState, actionSequence, currentTrackId);
    }

    function onStaleAction({ currentState, actionSequence }) {
      applyPlaybackUpdate(currentState.playbackState, actionSequence, currentState.currentTrackId);
    }

    socket.on('room:state', onRoomState);
    socket.on('room:joinError', onRoomStateError);
    socket.on('room:memberUpdate', onMemberUpdate);
    socket.on('room:kicked', onKicked);
    socket.on('room:deleted', onRoomDeleted);
    socket.on('room:updated', onRoomUpdated);
    socket.on('room:trackAdded', onTrackAdded);
    socket.on('room:trackRemoved', onTrackRemoved);
    socket.on('playback:update', onPlaybackUpdate);
    socket.on('room:staleAction', onStaleAction);

    function onConnect() {
      socket.emit('room:join', { roomId });
    }
    socket.on('connect', onConnect);

    return () => {
      socket.emit('room:leave', { roomId });
      socket.off('room:state', onRoomState);
      socket.off('room:joinError', onRoomStateError);
      socket.off('room:memberUpdate', onMemberUpdate);
      socket.off('room:kicked', onKicked);
      socket.off('room:deleted', onRoomDeleted);
      socket.off('room:updated', onRoomUpdated);
      socket.off('room:trackAdded', onTrackAdded);
      socket.off('room:trackRemoved', onTrackRemoved);
      socket.off('playback:update', onPlaybackUpdate);
      socket.off('room:staleAction', onStaleAction);
      socket.off('connect', onConnect);
      clearRoom();
    };
  }, [roomId]);

  return (
    <div className="app-shell">
      <RoomHeader />

      <div className="room-grid" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <aside className="sidebar">
          <MemberList />
        </aside>

        <main className="main-content">
          {roomError ? (
            <div className="room-card" style={{ margin: '1rem', color: 'var(--color-text-muted)' }}>
              {roomError}
            </div>
          ) : loadingRoom ? (
            <div className="room-card" style={{ margin: '1rem', color: 'var(--color-text-muted)' }}>
              Loading room…
            </div>
          ) : (
            <>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <TrackList />
              </div>

              <TrackUpload />
              <AudioPlayer />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
