import { useCallback, useEffect, useState } from 'react';

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// Chromium browsers (Chrome, Edge, Brave, Android) fire beforeinstallprompt
// when a page meets install criteria, then let the page trigger the native
// install dialog on demand — but only if the event's prompt() is called
// from within a user gesture, so we hold onto the event and expose a
// promptInstall() for a real button to call. Safari/Firefox never fire
// this event; canInstall just stays false there (iOS has its own banner
// for the manual Add to Home Screen flow instead).
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(isStandalone);

  useEffect(() => {
    const onBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return null;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    // The captured event can only be used once regardless of outcome.
    setDeferredPrompt(null);
    return choice;
  }, [deferredPrompt]);

  return {
    canInstall: !isInstalled && !!deferredPrompt,
    promptInstall,
  };
}
