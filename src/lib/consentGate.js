// When the consent screen (src/components/ConsentGate.jsx, spec 0086
// FR6) replaces an app page. Pure, so ProtectedRoute and AdminRoute share
// one rule and it can be unit-tested.

// The Terms and Privacy pages and their section pages stay readable from
// the consent screen (AC12). Matches App.jsx's /terms, /terms/:sectionId,
// /privacy and /privacy/:sectionId routes.
const LEGAL_PATH = /^\/(terms|privacy)(\/[^/]+)?\/?$/;

/** @param {string | null | undefined} pathname */
export function isLegalPath(pathname) {
  return typeof pathname === 'string' && LEGAL_PATH.test(pathname);
}

/**
 * True when a signed-in person whose profile loaded has no consent on
 * record and isn't on a legal page. If the profile failed to load
 * (profileLoadError), the gate stays out of the way so an outage doesn't
 * lock everyone out (spec 0086, Before You Approve #8); the server still
 * never records consent without the checkbox.
 *
 * @param {{ isAuthenticated: boolean, user: any, profileLoadError: boolean, pathname: string }} args
 */
export function shouldShowConsentGate({ isAuthenticated, user, profileLoadError, pathname }) {
  if (!isAuthenticated || profileLoadError || !user) return false;
  if (isLegalPath(pathname)) return false;
  return !user.terms_accepted_at;
}
