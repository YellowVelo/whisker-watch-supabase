// Which third-party sign-in options the Login/Register pages offer.
//
// Google sign-in is switched off (spec 0076, punch list PA-20): the
// provider isn't enabled in Supabase, so "Continue with Google" led to an
// error page. The button's code (and spec 0047's consent handoff in
// pendingOAuthConsent.js / AuthContext.jsx) is kept, so turning it back on
// is this one line plus setup outside the code:
//   1. A Google Cloud OAuth client for Wysker Watch.
//   2. Supabase → Authentication → Providers → Google, on all 3 projects.
//   3. The app's home page on each project's Redirect URLs list
//      (0006 Technical Standards.md §11).
export const GOOGLE_SIGN_IN_ENABLED = false;
