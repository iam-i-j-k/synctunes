import { useEffect } from 'react';
import socket from '../socket/socket';
import usePlayerStore from '../stores/playerStore';

const HEARTBEAT_INTERVAL_MS = 5_000; // every 5s
const MAX_DRIFT_MS = 2000; // Hard jump if off by > 2s
const MIN_DRIFT_MS = 150;  // Ignore tiny drifts < 150ms

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
      const drift = authoritativeMs - localMs;
      const absDrift = Math.abs(drift);

      if (absDrift > MAX_DRIFT_MS) {
        // Massive desync -> Hard jump to prevent playing the wrong section
        audioRef.current.currentTime = authoritativeMs / 1000;
        audioRef.current.playbackRate = 1.0;
      } else if (absDrift > MIN_DRIFT_MS) {
        // Minor desync -> Imperceptibly speed up or slow down to catch up smoothly
        // We adjust speed to close the gap over the next 5 seconds (heartbeat interval)
        // Max adjustment will be ~1.4x or 0.6x which is only for edge cases near 2s.
        const speedModifier = drift / HEARTBEAT_INTERVAL_MS;
        audioRef.current.playbackRate = 1.0 + Math.max(-0.2, Math.min(0.2, speedModifier));
      } else {
        // Perfectly in sync
        audioRef.current.playbackRate = 1.0;
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
