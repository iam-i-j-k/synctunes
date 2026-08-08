import { useEffect } from 'react';
import socket from '../socket/socket';
import usePlayerStore from '../stores/playerStore';

const HEARTBEAT_INTERVAL_MS = 5_000; // every 5s
const DRIFT_THRESHOLD_MS = 300;      // correct if drift > 300ms

export function useDriftCorrection(audioRef, roomId) {
  const { playbackState, applyPlaybackUpdate, getAuthorisedPositionMs } = usePlayerStore();
  const isPlaying = playbackState.isPlaying;

  useEffect(() => {
    if (!isPlaying || !roomId) return;

    const interval = setInterval(() => {
      socket.emit('playback:heartbeat', { roomId });
    }, HEARTBEAT_INTERVAL_MS);

    function handleHeartbeatResponse({ playbackState: serverState, actionSequence, serverTime }) {
      // Update store with latest authoritative state
      applyPlaybackUpdate(serverState, actionSequence, usePlayerStore.getState().currentTrackId);

      if (!audioRef.current) return;

      const authoritativeMs = getAuthorisedPositionMs();
      const localMs = audioRef.current.currentTime * 1000;
      const drift = Math.abs(localMs - authoritativeMs);

      if (drift > DRIFT_THRESHOLD_MS) {
        audioRef.current.currentTime = authoritativeMs / 1000;
      }

      // Ensure play/pause matches server state
      if (serverState.isPlaying && audioRef.current.paused) {
        audioRef.current.play().catch(() => {});
      } else if (!serverState.isPlaying && !audioRef.current.paused) {
        audioRef.current.pause();
      }
    }

    socket.on('playback:heartbeatResponse', handleHeartbeatResponse);

    return () => {
      clearInterval(interval);
      socket.off('playback:heartbeatResponse', handleHeartbeatResponse);
    };
  }, [isPlaying, roomId, audioRef, applyPlaybackUpdate, getAuthorisedPositionMs]);
}
