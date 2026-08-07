// Wysker Watch — pending OAuth signup consent (spec 0047)
//
// Google sign-in does a full-page redirect, so React state on
// Register.jsx/Login.jsx (whether the agreement checkbox was checked)
// doesn't survive it. The Google button writes here immediately before
// redirecting; AuthContext.jsx reads it back once the redirect completes
// and a fresh session exists, to record consent for a first-time Google
// signup the same way the email/password path does server-side.
//
// sessionStorage (not localStorage) — this only needs to survive the
// single redirect round trip, not persist indefinitely.
const STORAGE_KEY = 'wysker_pending_oauth_consent';

export function setPendingOAuthConsent({ termsVersion, privacyVersion, marketingOptIn }) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ termsVersion, privacyVersion, marketingOptIn }));
  } catch {
    // sessionStorage unavailable (private browsing, etc.) — the
    // OAuth flow still proceeds; AuthContext.jsx simply won't find
    // anything to record, same as any other returning-user sign-in.
  }
}

export function takePendingOAuthConsent() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
