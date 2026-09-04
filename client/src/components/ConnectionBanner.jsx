import { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export default function ConnectionBanner() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true
  );
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    let restoreTimer = null;

    const handleOnline = () => {
      setIsOnline(true);
      setShowRestored(true);
      if (restoreTimer) clearTimeout(restoreTimer);
      restoreTimer = setTimeout(() => {
        setShowRestored(false);
      }, 3000);
    };

    const handleOffline = () => {
      if (restoreTimer) clearTimeout(restoreTimer);
      setIsOnline(false);
      setShowRestored(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // If currently offline according to state, check periodically if connection has resumed
    let pollInterval = null;
    if (!isOnline) {
      pollInterval = setInterval(async () => {
        if (navigator.onLine) {
          try {
            const res = await fetch('/api/health', { method: 'GET', cache: 'no-store' });
            if (res.ok) {
              handleOnline();
            }
          } catch {
            // Still offline
          }
        }
      }, 3000);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (restoreTimer) clearTimeout(restoreTimer);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [isOnline]);

  if (isOnline && !showRestored) return null;

  return (
    <div 
      className={`fixed top-0 left-0 right-0 py-2 px-4 flex items-center justify-center text-[13px] md:text-sm font-semibold z-[9999] shadow-lg transition-all duration-300 transform ${isOnline ? 'bg-emerald-500 text-white translate-y-0' : 'bg-red-500 text-white translate-y-0'}`}
      style={{
        animation: showRestored ? 'slideDown 0.3s ease-out' : 'none'
      }}
    >
      {isOnline ? (
        <>
          <Wifi className="w-4 h-4 mr-2" />
          Internet connection restored
        </>
      ) : (
        <>
          <WifiOff className="w-4 h-4 mr-2 animate-pulse" />
          No internet connection. Reconnecting...
        </>
      )}
      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
