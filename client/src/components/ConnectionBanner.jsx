import { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export default function ConnectionBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const res = await fetch('/api/health', {
          method: 'GET',
          cache: 'no-store',
        });
        return res.ok;
      } catch {
        // If server is temporarily unreachable or offline
        return navigator.onLine;
      }
    };

    const handleOnline = async () => {
      const actuallyOnline = await checkConnection();
      if (actuallyOnline) {
        setIsOnline(true);
        setShowRestored(true);
        setTimeout(() => setShowRestored(false), 3000);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowRestored(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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
