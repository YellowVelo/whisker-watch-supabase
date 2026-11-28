// Spec 0074 (PA-09): opening a password-reset link logs the person in with
// a temporary "recovery" session, and Supabase announces it as the
// PASSWORD_RECOVERY auth event. If a dashboard setting (the Redirect URLs
// list) sends them anywhere but /reset-password, they'd land signed in on
// Home and never see Set New Password, which happened on prod 2026-11-21.
// AuthContext uses this to send them to the right screen regardless.
// Kept separate from AuthContext so it can be unit-tested on its own.
//
// Spec 0086: /verify-email and /accept-invite redeem 'recovery' links
// themselves (a resent sign-up link, a repeat sign-up, a re-invite), and
// supabase-js's verifyOtp() announces those as PASSWORD_RECOVERY too.
// Those pages show the finish-account-setup form, so they're never
// redirected.
export const RESET_PASSWORD_PATH = '/reset-password';
export const SELF_REDEEMING_PATHS = ['/verify-email', '/accept-invite'];

export function shouldRedirectToReset(event, pathname) {
  if (event !== 'PASSWORD_RECOVERY') return false;
  if (pathname === RESET_PASSWORD_PATH) return false;
  // React Router matches '/verify-email/' too, so ignore a trailing slash.
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return !SELF_REDEEMING_PATHS.includes(path);
}
