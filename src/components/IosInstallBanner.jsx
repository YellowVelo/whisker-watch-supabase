import { useEffect, useState } from 'react';
import { Share, X } from 'lucide-react';

const DISMISSED_KEY = 'ios-install-banner-dismissed';

function isIosSafari() {
  const ua = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIos && isSafari;
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// iOS has no native install prompt (no beforeinstallprompt event), so
// "Add to Home Screen" is only ever discoverable via the manual Share
// sheet. This nudges iOS Safari users toward it once; dismissal is
// remembered in localStorage so it doesn't nag on every visit.
export default function IosInstallBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (!isIosSafari()) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;
    setVisible(true);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 z-[70] flex items-center gap-3 px-4 py-3 text-sm text-white"
      style={{
        backgroundColor: '#0D0F12',
        // Sits just above BottomTabBar (h-16 + its own safe-area padding)
        // instead of at bottom-0, so it doesn't cover primary navigation.
        bottom: 'calc(4rem + env(safe-area-inset-bottom))',
      }}
    >
      <Share className="h-5 w-5 shrink-0" style={{ color: '#6FB7FF' }} />
      <span className="flex-1">
        Install Wysker Watch: tap <strong>•••</strong>, then <strong>Share</strong>, then{' '}
        <strong>Add to Home Screen</strong>.
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-full p-1 text-white/70 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
