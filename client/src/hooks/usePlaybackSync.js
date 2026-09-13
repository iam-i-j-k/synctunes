import { useEffect } from 'react';
import { Howler } from 'howler';
import socket from '../socket/socket';
import usePlaybackStore from '../stores/playbackStore';

const NTP_INTERVAL_MS = 30_000; // 30s
const DRIFT_INTERVAL_MS = 5_000; // 5s

export function usePlaybackSync(roomId) {
  const { 
    setClockSync, 
    howlInstance,
    ytPlayer,
    currentTrackSource,
    isPlaying, 
    clientServerOffset, 
    serverStartTime, 
    startPosition 
  } = usePlaybackStore();

  // NTP Synchronization Loop
  useEffect(() => {
    function performSync() {
      const t0 = Date.now();
      socket.emit('clock:sync', { t0 });
    }

    function handleSyncResponse({ t0, t1, t2 }) {
      const t3 = Date.now();
      const rtt = (t3 - t0) - (t2 - t1);
      const offset = ((t1 - t0) + (t2 - t3)) / 2;
      setClockSync(offset, rtt);
    }

    socket.on('clock:syncResponse', handleSyncResponse);
    performSync(); // Initial sync
    const interval = setInterval(performSync, NTP_INTERVAL_MS);

    return () => {
      socket.off('clock:syncResponse', handleSyncResponse);
      clearInterval(interval);
    };
  }, [setClockSync]);

  // Drift Correction Heartbeat Loop
  useEffect(() => {
    if (!isPlaying || !roomId) return;
    if (!howlInstance && !ytPlayer) return;

    // Send a heartbeat to get authoritative state and prevent disconnect timeouts,
    // though the prompt focuses on local drift correction. 
    // We'll maintain the heartbeat for server state tracking but do local drift correction.
    const interval = setInterval(() => {
      socket.emit('playback:heartbeat', { roomId });
      
      const correctedLocalTime = Date.now() + clientServerOffset;
      const targetTrackPosition = startPosition + ((correctedLocalTime - serverStartTime) / 1000);
      
      let localTrackPosition = 0;

      // Skip drift correction if the app is in the background. 
      // Background programmatic seeking or rate adjustments usually cause iOS/Android 
      // to forcibly suspend the AudioContext.
      if (!document.hidden && document.visibilityState !== 'hidden') {
        if (currentTrackSource === 'YOUTUBE' && ytPlayer) {
          try {
            if (ytPlayer.getPlayerState) {
              const state = ytPlayer.getPlayerState();
              // state 3 is buffering, let it buffer without seeking
              if (state === 3) return;
              // state 2 is paused, force play if we should be playing
              if (state === 2 || state === -1 || state === 5) {
                ytPlayer.playVideo();
                return;
              }
            }
            localTrackPosition = ytPlayer.getCurrentTime();
          } catch (e) {
            return;
          }
          
          if (typeof localTrackPosition !== 'number') return;
          
          const drift = targetTrackPosition - localTrackPosition;
          const absDrift = Math.abs(drift);
          
          if (absDrift > 2.0) {
            ytPlayer.seekTo(targetTrackPosition, true);
          } else {
            try { ytPlayer.setPlaybackRate(1.0); } catch(e) {}
          }
        } else if (howlInstance) {
          try {
            localTrackPosition = howlInstance.seek();
          } catch (e) {
            return;
          }
          
          if (typeof localTrackPosition !== 'number') return;
          
          const drift = targetTrackPosition - localTrackPosition;
          const absDrift = Math.abs(drift);
          
          if (absDrift > 0.3) {
            howlInstance.seek(targetTrackPosition);
            try { howlInstance.rate(1.0); } catch(e) {}
          } else if (absDrift > 0.02 && absDrift <= 0.3) {
            try { howlInstance.rate(drift > 0 ? 1.01 : 0.99); } catch(e) {}
          } else {
            try { howlInstance.rate(1.0); } catch(e) {}
          }
        }
      }
    }, DRIFT_INTERVAL_MS);

    // Keep the heartbeat response listener to update store with authoritative track/sequence
    function handleHeartbeatResponse({ playbackState, actionSequence }) {
      const store = usePlaybackStore.getState();
      store.applyPlaybackUpdate(playbackState, actionSequence, store.currentTrackId);
    }
    socket.on('playback:heartbeatResponse', handleHeartbeatResponse);

    return () => {
      clearInterval(interval);
      socket.off('playback:heartbeatResponse', handleHeartbeatResponse);
    };
  }, [isPlaying, roomId, howlInstance, clientServerOffset, serverStartTime, startPosition]);
}
