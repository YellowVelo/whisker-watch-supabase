import { useEffect, useRef, useId } from 'react';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
let scriptLoadPromise = null;

// No @types/cloudflare-turnstile in this project; the widget attaches
// itself to window at runtime, so every access below goes through this
// `any` cast rather than teaching jsconfig's checkJs about a global that
// doesn't exist until the external script has loaded.
const getTurnstile = () => /** @type {any} */ (window).turnstile;

function loadTurnstileScript() {
  if (getTurnstile()) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Turnstile script'));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

// Cloudflare Turnstile widget (spec 0053) — the first CAPTCHA anywhere in
// this codebase, added specifically for the public /beta form, which
// (unlike every other form in this app) is designed to be posted to a
// wide, anonymous audience (Reddit, BetaList). "managed" mode is
// invisible for most visitors; Cloudflare only shows a checkbox to
// visitors it flags as suspicious.
//
// No npm package used: Cloudflare's own guidance for React is to load
// api.js directly and manage the widget imperatively, which is what this
// does — render a target div, call turnstile.render() on it once the
// script is ready, and clean up on unmount.
export default function Turnstile({ onVerify, onError, onExpire }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const domId = useId();
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  useEffect(() => {
    let cancelled = false;

    if (!siteKey) {
      console.error('VITE_TURNSTILE_SITE_KEY is not configured — the beta signup form cannot verify submissions.');
      return undefined;
    }

    loadTurnstileScript()
      .then(() => {
        const turnstile = getTurnstile();
        if (cancelled || !containerRef.current || !turnstile) return;
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'dark',
          callback: onVerify,
          'error-callback': onError,
          'expired-callback': onExpire,
        });
      })
      .catch((err) => {
        console.error('Turnstile failed to load:', err.message);
        onError?.();
      });

    return () => {
      cancelled = true;
      const turnstile = getTurnstile();
      if (widgetIdRef.current != null && turnstile) {
        turnstile.remove(widgetIdRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  return <div id={`turnstile-${domId}`} ref={containerRef} className="flex justify-center" />;
}
