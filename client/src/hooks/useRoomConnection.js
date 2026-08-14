import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import socket from '../socket/socket';
import useRoomStore from '../stores/roomStore';
import usePlayerStore from '../stores/playerStore';
import api from '../api/axios';

export function useRoomConnection() {
  const navigate = useNavigate();
  const { setRoom, setMembers, addTrack, removeTrack, clearRoom } = useRoomStore();
  const { applyPlaybackUpdate } = usePlayerStore();

  useEffect(() => {
    function onRoomState({ room, members, actionSequence }) {
      setRoom(room);
      setMembers(members);
      applyPlaybackUpdate(room.playbackState, actionSequence, room.currentTrackId, room.playbackMode);
      
      api.get(`/rooms/${room._id}/tracks`)
        .then(({ data }) => {
          const { setTracks } = useRoomStore.getState();
          setTracks(data.tracks);
        })
        .catch((err) => {
          console.error('Failed to load room tracks', err);
        });
    }

    function onMemberUpdate({ members }) {
      setMembers(members);
    }

    function onKicked({ roomId: kickedFrom }) {
      const currentRoom = useRoomStore.getState().currentRoom;
      if (currentRoom && kickedFrom.toString() === currentRoom._id.toString()) {
        clearRoom();
        navigate('/');
      }
    }

    function onRoomDeleted({ roomId: deletedRoomId }) {
      const currentRoom = useRoomStore.getState().currentRoom;
      // Note: room handlers emit 'room:deleted' but wait, the backend doesn't send roomId:deletedRoomId in onRoomDeleted yet, let's just clear.
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

    function onPlaybackUpdate({ playbackState, actionSequence, currentTrackId, playbackMode }) {
      applyPlaybackUpdate(playbackState, actionSequence, currentTrackId, playbackMode);
    }

    function onTrackOrderChanged({ trackIds }) {
      const { tracks, setTracks } = useRoomStore.getState();
      if (!tracks || tracks.length === 0) return;
      
      const newTracks = [];
      for (const id of trackIds) {
        const t = tracks.find(track => track._id === id);
        if (t) newTracks.push(t);
      }
      
      // Keep any tracks that might not be in trackIds (e.g. newly added) at the end
      for (const t of tracks) {
        if (!trackIds.includes(t._id)) {
          newTracks.push(t);
        }
      }
      
      setTracks(newTracks);
    }

    function onStaleAction({ currentState, actionSequence }) {
      applyPlaybackUpdate(currentState.playbackState, actionSequence, currentState.currentTrackId, currentState.playbackMode);
    }

    socket.on('room:state', onRoomState);
    socket.on('room:memberUpdate', onMemberUpdate);
    socket.on('room:kicked', onKicked);
    socket.on('room:deleted', onRoomDeleted);
    socket.on('room:updated', onRoomUpdated);
    socket.on('room:trackAdded', onTrackAdded);
    socket.on('room:trackRemoved', onTrackRemoved);
    socket.on('room:trackOrderChanged', onTrackOrderChanged);
    socket.on('playback:update', onPlaybackUpdate);
    socket.on('room:staleAction', onStaleAction);

    return () => {
      socket.off('room:state', onRoomState);
      socket.off('room:memberUpdate', onMemberUpdate);
      socket.off('room:kicked', onKicked);
      socket.off('room:deleted', onRoomDeleted);
      socket.off('room:updated', onRoomUpdated);
      socket.off('room:trackAdded', onTrackAdded);
      socket.off('room:trackRemoved', onTrackRemoved);
      socket.off('room:trackOrderChanged', onTrackOrderChanged);
      socket.off('playback:update', onPlaybackUpdate);
      socket.off('room:staleAction', onStaleAction);
    };
  }, [navigate, setRoom, setMembers, addTrack, removeTrack, clearRoom, applyPlaybackUpdate]);
}
