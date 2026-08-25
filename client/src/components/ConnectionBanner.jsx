import { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export default function ConnectionBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    // A reliable endpoint on 1.1.1.1 that supports CORS
    const checkConnection = async () => {
      try {
        const response = await fetch('https://1.1.1.1/cdn-cgi/trace', { 
          mode: 'cors',
          cache: 'no-store' // prevent caching the response
        });
        return response.ok;
      } catch (error) {
        return false;
      }
    };

    const handleOnline = async () => {
      // Just because 'online' fired doesn't mean we have internet access
      // Verify using the trace endpoint
      const actuallyOnline = await checkConnection();
      if (actuallyOnline) {
        setIsOnline(true);
        setShowRestored(true);
        setTimeout(() => setShowRestored(false), 3000);
      } else {
        // We are on a network, but no internet. Let's poll until we get internet.
        const intervalId = setInterval(async () => {
          const onlineNow = await checkConnection();
          if (onlineNow) {
            clearInterval(intervalId);
            setIsOnline(true);
            setShowRestored(true);
            setTimeout(() => setShowRestored(false), 3000);
          }
        }, 2000);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowRestored(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Perform an initial check just in case navigator.onLine is a false positive
    if (navigator.onLine) {
      checkConnection().then(online => {
        if (!online) setIsOnline(false);
      });
    }

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
