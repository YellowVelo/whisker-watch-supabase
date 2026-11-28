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
 * True when a signed-in person's profile loaded with no consent on
 * record, whatever the page. If the profile failed to load
 * (profileLoadError), this is false so an outage doesn't lock everyone
 * out (spec 0086, Before You Approve #8); the server still never records
 * consent without the checkbox.
 *
 * @param {{ isAuthenticated: boolean, user: any, profileLoadError: boolean }} args
 */
function needsConsent({ isAuthenticated, user, profileLoadError }) {
  if (!isAuthenticated || profileLoadError || !user) return false;
  return !user.terms_accepted_at;
}

/**
 * True when the consent screen replaces the page: a signed-in person with
 * no consent on record, on any page but Terms and Privacy.
 *
 * @param {{ isAuthenticated: boolean, user: any, profileLoadError: boolean, pathname: string }} args
 */
export function shouldShowConsentGate(args) {
  return needsConsent(args) && !isLegalPath(args.pathname);
}

/**
 * True when a signed-in person with no consent on record is on Terms or
 * Privacy. That page is shown the way a signed-out visitor sees it, with
 * no App Shell, so its header (Ask Wysker, notifications) and bottom nav
 * can't be used before they agree.
 *
 * @param {{ isAuthenticated: boolean, user: any, profileLoadError: boolean, pathname: string }} args
 */
export function legalPageWithoutShell(args) {
  return needsConsent(args) && isLegalPath(args.pathname);
}
