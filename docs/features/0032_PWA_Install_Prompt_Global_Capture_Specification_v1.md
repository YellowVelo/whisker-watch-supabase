# 0032_PWA_Install_Prompt_Global_Capture_Specification_v1

**Status:** Draft
**Date:** 2026-08-01
**Related files:** `src/lib/useInstallPrompt.js`, `src/App.jsx`, `src/pages/Settings.jsx`, `src/lib/AskWyskerContext.jsx` (pattern reference), `docs/features/PWA Feature.md`, `docs/launch-punch-list.md`

## Before You Approve This

- This spec covers **only** the "Install App" button can miss the browser's install prompt bug. The second punch-list item (Firefox/non-Safari-iOS users get no install nudge) is **not** being built — per your decision, that gap is being accepted for launch and the punch list will be updated to reflect that as a closed decision, not left as an open question. If that's not what you intended, say so before I save this.
- The fix reuses an existing pattern already proven in this codebase (`AskWyskerContext.jsx`) for the exact same class of problem — no new architecture is introduced.
- No schema changes, no new dependencies, no new tracking events. The two `track()` calls that already exist in `Settings.jsx` (`install_app_selected`, `install_app_prompt_result`) move unchanged.

## Functional Requirements

Today, the "Install App" row only appears in Settings if the browser happens to offer the install option **while the user is already on the Settings screen**. In practice, a browser almost always offers to install the app the moment the app first loads — usually before the user has navigated to Settings at all — so the offer is silently missed for that entire visit, and the row never appears even though the browser was willing to let the user install.

This fix makes the app listen for that browser offer from the moment the app opens, no matter what screen the user is on, and remembers it until the user actually visits Settings. The Settings "Install App" row should then reliably appear whenever the browser is willing to install the app, matching what's already promised in `docs/features/PWA Feature.md` §3's acceptance criteria.

Nothing about what the user sees or does changes — same Settings row, same tap-to-install flow, same analytics. Only the reliability of *whether the row shows up at all* changes.

## Acceptance Criteria

- Given a Chromium browser (Chrome/Edge/Android/Desktop) that's willing to offer an install, when the app loads and the browser fires its install offer, then navigating to Settings later in the same session shows the "Install App" row — even though the user was on a different screen (e.g. Home) when the browser made the offer.
- Given the user taps "Install App," when the browser's install dialog resolves, then the existing `install_app_selected` / `install_app_prompt_result` analytics events still fire exactly as they do today.
- Given the user installs the app (via the Settings row or the browser's own install icon), when `appinstalled` fires, then the Settings row disappears and does not reappear for that session — same as today.
- Given an already-installed (standalone) user, when they open the app, then the Settings row never appears — same as today.
- Given a browser that never offers an install (Safari, Firefox), when the user visits Settings, then no row appears and nothing errors — same as today.

## Visual Reference

None provided — this is a state/logic fix with no visual or copy change. The Settings row's appearance and placement (`src/pages/Settings.jsx:267-278`) are unchanged.

## Technical Spec

- **Schema:** None.
- **Components/files touched:**
  - `src/lib/InstallPromptContext.jsx` **(new)** — wraps the existing logic currently in `src/lib/useInstallPrompt.js` in a React Context provider (`InstallPromptProvider`) plus a `useInstallPrompt()` consumer hook of the same name/shape, so `Settings.jsx` doesn't need to change its call site beyond the import. The `beforeinstallprompt`/`appinstalled` listeners move into the provider's `useEffect`, so they attach once, at app mount, regardless of which page is showing.
  - `src/lib/useInstallPrompt.js` — becomes the internal implementation used only by the new provider (or is deleted and its contents folded directly into `InstallPromptContext.jsx` — implementer's call, both are equivalent).
  - `src/App.jsx` — wrap `AuthenticatedApp` (or the whole `<Router>` tree) in `<InstallPromptProvider>`, mounted outside `<Routes>` for the same reason `AskWyskerProvider` needs to be outside it: `<Routes location={location} key={location.pathname}>` fully unmounts and remounts everything inside it on every navigation (documented in `AskWyskerContext.jsx`'s own comment, `src/App.jsx:82`). A provider placed inside `<Routes>` would lose its captured `beforeinstallprompt` event on the very next navigation, since the event can only be captured once per page load and there'd be no listener left alive to have caught it in the first place.
  - `src/pages/Settings.jsx` — swap `import { useInstallPrompt } from '@/lib/useInstallPrompt'` for `import { useInstallPrompt } from '@/lib/InstallPromptContext'`. Line 61 (`const { canInstall, promptInstall } = useInstallPrompt();`) and the rest of the file are unchanged.
- **API / edge functions:** None.
- **Constraints from CLAUDE.md / locked decisions:** None applicable — this doesn't touch check-in/scoring logic. Respects the existing "don't add a second `beforeinstallprompt` listener elsewhere" note in `docs/features/PWA Feature.md`'s Implementation Notes — this spec moves the one listener, it doesn't add a second.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** None found. `useInstallPrompt` is confirmed as the only place in the codebase that listens for `beforeinstallprompt` (searched all of `src/`).
- **Technical debt nearby:** None new. This is a straightforward lift-and-wrap; no shortcuts or special cases introduced.
- **Orphaned features nearby:** None found in this area.
- **Punch list / known issues in this area:** This spec directly resolves the first PWA punch-list item ("Chrome 'Install App' button can miss the install prompt," `docs/launch-punch-list.md`). The second PWA punch-list item (Firefox/non-Safari-iOS nudge) is addressed by a product decision, not code — see Non-Goals. Also worth noting for awareness, not action: `docs/launch-punch-list.md` P1 already flags that once native app wrapping (Capacitor) ships later, these install banners should probably be suppressed inside the native app's webview — out of scope here since Capacitor work hasn't started.

## Non-Goals

- **No fallback install nudge for Firefox, non-Safari iOS browsers (Chrome iOS, Firefox iOS), or desktop Safari (macOS).** Investigated as part of this spec: Firefox desktop removed PWA install support entirely years ago (there's no menu option to point users toward at all), and Firefox Android's "Add to Home screen" lives in a different menu location than iOS Safari's Share-sheet flow the existing `IosInstallBanner` walks through. Desktop Safari (macOS) was found during this investigation to be a related, previously-unnamed gap: `IosInstallBanner`'s detection (`isIosSafari()`, `src/components/IosInstallBanner.jsx:7-11`) requires an iOS device in the user agent, so it never shows on desktop Safari — even though desktop Safari does have its own "Add to Dock" install option, unlike Firefox desktop. A single generic banner can't give accurate steps across all of these cases, and would be actively wrong for Firefox desktop users specifically. Decision (confirmed 2026-08-01): accept all of the above as a known gap for launch — desktop Safari explicitly included, since that traffic is considered negligible. Revisit post-launch only if analytics show meaningful traffic from these browsers. The punch list will be updated to mark this as a closed decision rather than an open question.
- **Mobile iOS Safari is unaffected by any of this and needs no fix.** Confirmed during investigation: `IosInstallBanner`'s detection is a synchronous check (device/browser/standalone-mode/dismissal state, all read immediately on mount) rather than an asynchronous browser event like Chromium's `beforeinstallprompt` — there's nothing for it to "miss." It's already mounted globally in `App.jsx` outside the remounting route tree, the same place `OfflineBanner` lives, so it doesn't share the Settings-only bug this spec fixes. No change needed here.
- No changes to the iOS Safari banner (`IosInstallBanner.jsx`) or the Offline Banner (`OfflineBanner.jsx`) — both already work correctly and are out of scope.
- No changes to the Settings row's copy, placement, or analytics events.

## Open Questions

None remaining — both punch-list items were resolved through investigation and your decision above.
