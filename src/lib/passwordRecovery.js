// Spec 0074 (PA-09): opening a password-reset link logs the person in with
// a temporary "recovery" session, and Supabase announces it as the
// PASSWORD_RECOVERY auth event. If a dashboard setting (the Redirect URLs
// list) sends them anywhere but /reset-password, they'd land signed in on
// Home and never see Set New Password, which happened on prod 2026-11-21.
// AuthContext uses this to send them to the right screen regardless.
// Kept separate from AuthContext so it can be unit-tested on its own.
export const RESET_PASSWORD_PATH = '/reset-password';

export function shouldRedirectToReset(event, pathname) {
  return event === 'PASSWORD_RECOVERY' && pathname !== RESET_PASSWORD_PATH;
}
