# **PWA Feature**

**Document:** `PWA Feature.md`

**Status:** New as-built documentation, written 2026-07-18; updated
2026-08-01 to reflect spec
[0032_PWA_Install_Prompt_Global_Capture_Specification_v1.md](0032_PWA_Install_Prompt_Global_Capture_Specification_v1.md).
Everything below was verified directly against `vite.config.js`,
`index.html`, `src/lib/InstallPromptContext.jsx`,
`src/components/OfflineBanner.jsx`, `src/components/IosInstallBanner.jsx`,
`src/App.jsx`, and `src/pages/Settings.jsx`.

**Owner:** Product

**Audience:** Claude Code (Engineering)

**Purpose:**

Wysker Watch is not yet wrapped as a native app — per
`docs/foundation/0006 Technical Standards.md`, Capacitor wrapping for
iOS/Android is unstarted (no `ios`/`android` folders, no
`capacitor.config`). Until that ships, the Progressive Web App
(PWA) layer is the **only** installable-app path available to users: a web
app manifest plus a service worker let the site be added to a phone's home
screen and opens as a standalone app (no browser chrome), with the static
app shell available offline.

This feature has three parts:
1. **Manifest + service worker** (build-time, via `vite-plugin-pwa`) — makes the app installable and caches the app shell for offline load.
2. **Install prompts** — a Chromium/Android native prompt (Settings screen) and an iOS Safari manual-install banner (iOS has no native prompt).
3. **Offline indicator** — a banner that tells the user when they've lost connectivity, since Supabase requests are never served from cache.

---

# **Functional Requirements**

## **1. Web App Manifest**

Generated at build time by the `vite-plugin-pwa` plugin (`vite.config.js`),
not committed to the repo as a static file:

- `name` / `short_name`: **Wysker Watch**
- `description`: "Pet health tracking app — log symptoms, medications, vaccinations, bloodwork, and food for your pets; spot patterns; generate vet-ready reports."
- `theme_color`: `#6FB7FF`
- `background_color`: `#0D0F12`
- `display`: `standalone`
- `start_url`: `/`
- Icons: 64×64, 192×192, 512×512, plus a 512×512 `maskable` variant — all sourced from `public/pwa-*.png` and `public/maskable-icon-512x512.png`
- `manifestFilename`: `manifest.json` — generated and injected at build time; **`index.html`'s source has no `<link rel="manifest">` tag**, because the plugin injects it automatically into the built output. (A manifest 404 was a real, since-resolved problem before `vite-plugin-pwa` was added — not true of the current build.)
- `public/` also holds `favicon.ico`, `icon-source.svg`, and `apple-touch-icon-180x180.png`, referenced directly from `index.html`'s `<head>` (not part of the generated manifest).

`index.html` additionally sets `apple-mobile-web-app-capable`,
`apple-mobile-web-app-status-bar-style` (`black-translucent`), and
`apple-mobile-web-app-title` (`Wysker Watch`) — iOS-specific meta tags that
predate/are independent of `vite-plugin-pwa`'s own manifest handling.

## **2. Service Worker / Offline Caching**

- `registerType: 'autoUpdate'` — the service worker updates and activates automatically in the background. There is **no user-facing "a new version is available" prompt or toast anywhere in the codebase** (confirmed: no `registerSW`/`updateSW` usage in `src/`). A user simply gets the new version on their next reload/navigation, silently.
- `workbox.globPatterns` precaches the app shell: `**/*.{js,css,html,svg,png,ico,woff,woff2}` — this is what makes the app **open at all while offline** (`navigateFallback: '/index.html'` serves the SPA shell for any offline navigation).
- `runtimeCaching`: any request to a `*.supabase.co` hostname is `NetworkOnly` — **auth, data, and storage requests are never cached and never served offline.** Offline failures for these surface through the app's own error states and the Offline Banner (§5), not through stale cached data.
- **Dev-mode caveat:** `vite-plugin-pwa`'s `devOptions.enabled` is not set in `vite.config.js`, so it defaults to `false` — the manifest, service worker, and offline caching are all **inactive when running `vite dev`.** Install prompts and offline behavior can only be verified against a production build (`vite build && vite preview`), not the local dev server.

## **3. Install Prompt — Chromium / Android (and Desktop Chrome/Edge)**

`src/lib/InstallPromptContext.jsx`'s `InstallPromptProvider` is the single
source of install-prompt state for the whole app, mounted in `App.jsx`
outside the routed `<Routes>` tree (not scoped to any one page):

- Listens for the browser's `beforeinstallprompt` event, calls `preventDefault()`, and holds onto the event (Chromium-family browsers only — Safari and Firefox never fire it).
- Exposes `canInstall = !isInstalled && !!deferredPrompt` and an async `promptInstall()` that calls the captured event's `.prompt()`, awaits `.userChoice`, then clears the captured event (a `beforeinstallprompt` event can only be used once, win or lose).
- Listens for `appinstalled` to flip `isInstalled` to `true` and clear any pending prompt — this fires regardless of whether the user installed via this app's own UI or the browser's own native install affordance (e.g. the address-bar install icon), so state stays correct either way.
- `isStandalone()` (checked on mount, via `display-mode: standalone` media query or the legacy `navigator.standalone` on iOS) seeds `isInstalled` so an already-installed user never sees an install affordance.
- This logic doesn't distinguish mobile from desktop — a desktop Chrome/Edge user who meets install criteria sees the same Settings row as an Android user.
- **Why this must be global, not page-scoped (fixed by spec 0032, 2026-08-01):** `App.jsx`'s `<Routes key={location.pathname}>` fully unmounts and remounts everything inside it on every navigation. `beforeinstallprompt` fires once, asynchronously, at an unpredictable point after page load — a listener scoped to a single page (as this used to be, living only in `Settings.jsx` via a plain `useInstallPrompt()` hook) could easily not be mounted yet when the browser fired it, silently losing the offer for the rest of the session. Mounting the provider outside `<Routes>` (same tier as `OfflineBanner`/`IosInstallBanner`, see §6) means the listener attaches once at app load and stays alive regardless of which screen is showing.

Surfaced in `src/pages/Settings.jsx`, which reads `canInstall`/
`promptInstall` from the context via `useInstallPrompt()` (same call
shape as before, just sourced from the provider instead of a page-local
hook): an **"Install App"** row ("Add Wysker Watch to your device")
renders only when `canInstall` is true. Tapping it fires
`track('install_app_selected', {})`, awaits `promptInstall()`, and if the
browser returned a choice, fires
`track('install_app_prompt_result', { outcome: choice.outcome })` where
`outcome` is the browser's own `'accepted'` or `'dismissed'`.

## **4. Install Prompt — iOS Safari**

iOS never fires `beforeinstallprompt`, so it can never satisfy
`canInstall` — iOS users never see the Settings row. Instead,
`src/components/IosInstallBanner.jsx` handles iOS separately:

- Shows only when: not already standalone, the UA matches iOS + Safari (excludes in-app iOS browsers like `CriOS`/`FxiOS`/`EdgiOS`, which don't support "Add to Home Screen" the same way), and the user hasn't dismissed it before (`localStorage['ios-install-banner-dismissed']`).
- Copy: "Install Wysker Watch: tap •••, then Share, then Add to Home Screen." — a manual walkthrough, since iOS has no native install dialog to trigger programmatically.
- Dismissing sets the localStorage flag permanently — there is no snooze/re-prompt window; once dismissed on a given device/browser profile, it never shows again there.
- Fixed to the bottom of the screen, positioned just above `BottomTabBar` (`bottom: calc(4rem + env(safe-area-inset-bottom))`) so it doesn't cover primary navigation.

**Gap, not handled by either path — accepted for launch (decision
confirmed 2026-08-01, spec 0032):** Firefox (desktop and Android),
non-Safari iOS browsers, and desktop Safari (macOS) get no install nudge
of any kind — `canInstall` never becomes true (no `beforeinstallprompt`)
and `IosInstallBanner` explicitly requires an iOS device, so it never
shows on desktop. No fallback banner will be built: Firefox desktop has
no install option to point users toward at all (removed from the browser
years ago), Firefox Android's install path lives in a different menu
location than iOS Safari's Share-sheet flow this banner already walks
through, and desktop Safari traffic is considered negligible — a single
generic banner can't accurately cover all of these cases and would be
actively wrong for Firefox desktop. Mobile iOS Safari itself is
unaffected and not part of this gap. Revisit only if analytics later show
meaningful traffic from these browsers.

## **5. Offline Banner**

`src/components/OfflineBanner.jsx`:

- Tracks `navigator.onLine` plus the `online`/`offline` window events — no polling, no debounce.
- Shows a sticky top banner ("You're offline — changes and updates won't load until you reconnect.") whenever offline; hides immediately on reconnect.
- Explicitly a "V1... simple indicator" per its own code comment — **no request queueing, no background sync, no automatic retry.** It only explains why data isn't loading/saving; it doesn't do anything about it.

## **6. Global Mounting**

`OfflineBanner` and `IosInstallBanner` are both mounted at the top of
`App.jsx`'s render tree (alongside `AccountTypeBanner`), outside the routed
`<Routes>`/`<AnimatePresence>` tree — they persist identically across every
screen in the app, not scoped to any particular page.

`InstallPromptProvider` (§3) wraps the app at an even higher level — around
`<Router>` itself in `App.jsx` — for the same reason: it needs to exist
before any navigation happens, so it doesn't need router context and
sits outside everything the route tree remounts.

---

# **UI Components**

- Offline Banner (sticky top, global)
- iOS Install Banner (fixed bottom, global, dismissible)
- Settings "Install App" row (conditional, Chromium/Android/Desktop only)
- (No dedicated PWA screen or settings page beyond the single Settings row — this feature has no other UI surface)

---

# **User Interactions**

### **Tap "Install App" in Settings (Chromium/Android/Desktop only)**
Fires `install_app_selected` → triggers the native browser install dialog →
fires `install_app_prompt_result` with the browser's outcome. Row
disappears once installed (`appinstalled` fires → `canInstall` becomes
false).

### **Tap the iOS Install Banner's dismiss (X)**
Hides the banner and remembers the dismissal permanently for that
device/browser profile (`localStorage`, not tied to the user's account).

### **Go offline / come back online**
Offline Banner appears/disappears automatically; no user action required.

---

# **Navigation**

Not part of the bottom-tab navigation. Both banners render globally above
whatever screen is currently active; the Install App row lives inside the
existing Settings screen (`docs/features` doesn't yet have a dedicated
Settings spec — out of scope here).

---

# **Business Rules**

- Chromium/Android/Desktop and iOS Safari install paths are mutually exclusive and use entirely different UI — a given user only ever sees one or the other, never both, and never simultaneously.
- Already-installed (standalone-mode) users see neither the Settings row nor the iOS banner.
- Supabase requests (auth/data/storage) are never served from cache, online or offline — only the static app shell is available offline.
- Service worker updates apply automatically and silently; there is no user-facing update prompt.
- Firefox, non-Safari iOS browsers, and desktop Safari receive no install nudge at all — accepted gap for launch, not planned to be built (see Edge Cases).
- The iOS banner's dismissal is permanent and per-device — there's no re-prompt logic, no snooze, no "remind me later."

---

# **Data Requirements**

None. This feature makes no Supabase queries. Its only persisted state is:
- `localStorage['ios-install-banner-dismissed']` (client-side only, per browser profile — not synced to the user's account or across devices)
- `install_app_selected` / `install_app_prompt_result` events, which land in the existing `analytics_events` table (base table documented in `docs/foundation/0007 Data Model_V2.md` §3.20) — no new schema required.

---

# **Acceptance Criteria**

A user can:
- ✓ Install the app from Chrome/Edge/Android via the Settings "Install App" row, when install criteria are met
- ✓ Install the app from iOS Safari via the manual banner's Share → Add to Home Screen instructions
- ✓ Dismiss the iOS banner permanently
- ✓ Open the app while offline and reach the app shell (not a browser error page)
- ✓ See a clear indicator when they lose connectivity
- ✓ Get service worker updates automatically without any manual action

---

# **Edge Cases**

- Firefox (desktop/Android), non-Safari iOS browsers (Chrome iOS, Firefox iOS), and desktop Safari (macOS): no install nudge of any kind — accepted gap for launch (decision confirmed 2026-08-01, spec 0032), not planned to be built.
- User dismisses the iOS banner, then reinstalls Safari's data or switches devices: dismissal doesn't carry over (it's per-device `localStorage`), so the banner reappears.
- User installs via the browser's own native install affordance (e.g. address-bar icon) instead of the Settings row: `appinstalled` still fires and updates state correctly either way.
- Desktop Chrome/Edge users meeting install criteria see the same "Install App" row as mobile Android users — not mobile-gated.
- Brief network blips can flash the Offline Banner on/off with no debounce.
- Running the app via `vite dev` (not a production build): manifest/service worker/offline caching are inactive by default (`devOptions.enabled` unset) — install prompts and offline load cannot be validated in local dev.

---

# **Implementation Notes for Claude Code**

- All `beforeinstallprompt` handling lives in `InstallPromptContext.jsx`'s `InstallPromptProvider` — don't add a second listener elsewhere; consume the existing `useInstallPrompt()` context hook.
- Manifest and service-worker registration are generated at build time by `vite-plugin-pwa`; nothing in `public/` or `index.html` needs to be hand-maintained for a manifest change — edit the `VitePWA({...})` config in `vite.config.js` instead.
- To test install/offline behavior, use `vite build && vite preview` (or an actual Cloudflare Workers deploy), not `vite dev`.
- If Capacitor wrapping ships later, revisit whether the PWA install banners should be suppressed inside the native wrapper's webview to avoid a confusing "install the app" prompt shown to a user who's already in the installed native app.

---

# **Open Questions for Product**

- Is the permanent, no-re-prompt iOS dismissal the intended behavior, or should it expire/reappear after some interval?

**Resolved:**
- Should Firefox/non-Safari-iOS/desktop-Safari users get any install nudge? — **Decided 2026-08-01 (spec 0032): no.** Accepted as a launch gap; Chromium + iOS Safari coverage is sufficient for now. See §4's Gap note and the Edge Cases section.
