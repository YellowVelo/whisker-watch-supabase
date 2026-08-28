// Single source of truth for stacking order (spec 0059). Every fixed/sticky
// surface in the app must reference one of these named layers instead of a
// hand-picked number — see docs/foundation/0005 Design System.md, Amendment
// #12. Large gaps (100 apart, not 10) leave room for a future layer to be
// inserted without renumbering everything else.
//
// Order, low to high:
//   chrome  — persistent page chrome (AppHeader, BottomTabBar, PullToRefreshIndicator)
//   overlay — full-screen flows (CatchUpFlow, OnboardingShell, AskWyskerSheet, PetSymptoms' log overlay)
//   banner  — persistent system banners (AccountTypeBanner, OfflineBanner, IosInstallBanner)
//   popup   — BottomSheet + Dialog/AlertDialog/Drawer/Select (all portal-based popups)
//   toast   — toast notifications
//
// Popup outranks both overlay and banner deliberately: a popup opened from
// inside a full-screen flow (spec 0059's Catch Up bug) or alongside a banner
// (IosInstallBanner over a BottomSheet's action button) must always render on
// top of both, not lose to them by accident.
export const Z = {
  chrome: 'z-[100]',
  overlay: 'z-[200]',
  banner: 'z-[300]',
  popup: 'z-[400]',
  toast: 'z-[500]',
};
