import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

// Simple online/offline indicator for V1. No queueing or sync — just
// makes it clear to the user why data isn't loading/saving right now.
export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-[70] flex items-center justify-center gap-2 bg-slate-800 px-4 py-1.5 text-sm font-medium text-white"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.375rem)' }}
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>You're offline — changes and updates won't load until you reconnect.</span>
    </div>
  );
}
