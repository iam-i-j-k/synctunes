import { useEffect } from 'react';
import socket from '../socket/socket';
import usePlayerStore from '../stores/playerStore';

const SYNC_INTERVAL_MS = 30_000; // re-sync every 30s

export function useClockSync() {
  const setClockOffset = usePlayerStore((s) => s.setClockOffset);

  useEffect(() => {
    function doSync() {
      const clientTime = Date.now();
      socket.emit('clock:sync', { clientTime });
    }

    function handleResponse({ clientTime, serverTime }) {
      const clientReceiveTime = Date.now();
      const roundTripTime = clientReceiveTime - clientTime;
      const serverTimeOffset = serverTime - (clientReceiveTime - roundTripTime / 2);
      setClockOffset(serverTimeOffset);
    }

    socket.on('clock:syncResponse', handleResponse);

    // Initial sync
    doSync();

    const interval = setInterval(doSync, SYNC_INTERVAL_MS);

    return () => {
      socket.off('clock:syncResponse', handleResponse);
      clearInterval(interval);
    };
  }, [setClockOffset]);
}
