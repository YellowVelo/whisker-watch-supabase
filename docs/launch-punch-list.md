# Launch Punch List

Tracked list of everything outstanding before Wysker Watch goes live, ranked
by priority. Rewritten 2026-07-18 from scratch against current code (the
2026-07-10 version is retired — most of its P1 tier described a native-app
blocker list that didn't distinguish "needed for the PWA" from "needed for
the App/Play Store," which caused real confusion). Every item below was
re-verified against `src/`, `supabase/`, and this session's feature specs;
items that no longer apply (because the underlying model was replaced, or
the work already shipped) were dropped rather than carried forward stale.

Check items off as they're resolved. Add new items at the bottom of their
tier, don't renumber existing ones.

---

## P0 — Data safety & process (fix regardless of launch timing)

These aren't store requirements, but shipping to real users without them is
reckless — one already caused a real incident.

- [ ] **No database backups / PITR configured.** Confirmed on the live project: `pitr_enabled: false`, `backups: []`. Already bit us once — an entire `auth.users` account got deleted and was only recoverable because a stray migration file happened to contain the original data as INSERTs. That safety net won't exist for anything created since. Needs a paid Supabase tier with PITR or a scheduled `pg_dump` export, before real user data accumulates.
- [ ] **No branch protection / CI gate on `main`.** No `.github/workflows` exist in the repo at all — every push goes straight to production, gated only by the manual-deploy step in the Cloudflare dashboard (not represented in-repo config). Decide whether that's still acceptable once this is a shipped app with real users on it.
- [ ] **No dev/staging environment.** Local `npm run dev` and production point at the same Supabase project — any local testing writes real rows to live data.
- [ ] **No automated test coverage on the destructive Edge Functions** (`delete-pet`, `delete-account`). No `*.test.ts` files exist anywhere under `supabase/functions/`; the vitest suite covers frontend logic only. Worth revisiting now that these are irreversible, no-backup operations (see above).

---

## P1 — App Store blockers (native shell only — do NOT confuse with PWA below)

Nothing in this tier is required for the current web/PWA experience. It's
only required to appear in the Apple App Store or Google Play Store.

- [ ] **Capacitor wrapping for iOS/Android.** Not started — no `ios`/`android` folders, no `capacitor.config` anywhere in the repo. This is the root blocker; everything else in this tier cascades from this decision.
- [ ] **Universal Links / App Links (mobile deep linking).** `https://www.wyskerwatch.com/accept-invite?...` links need to open the app directly, not a browser, once it's a real native app — reviewers will test the invite flow. Needs `apple-app-site-association` + `assetlinks.json` hosted at `www.wyskerwatch.com/.well-known/`, iOS Associated Domains capability, Android `intent-filter` with `autoVerify="true"`, and Capacitor's `@capacitor/app` `appUrlOpen` listener wired to route the incoming URL. Requires an Apple Developer account.
- [ ] **Store submission assets don't exist.** App icons (all required sizes), screenshots, store listing copy, privacy manifest, permissions justification — none of this exists since there's no native project to hold them yet.
- [ ] **PWA install banners should probably be suppressed inside the native wrapper.** Once Capacitor exists, a user already inside the installed native app shouldn't see "Install App" prompts meant for the web version. Not urgent until Capacitor work actually starts.

**Resolved since the last version of this list** — no longer blockers:
- [x] In-app Terms of Service and Privacy Policy screens (`src/pages/Terms.jsx`, `src/pages/Privacy.jsx`) — both live, reachable from Menu.

---

## PWA — install & offline experience (separate from App Store; ships today, no native shell needed)

Full spec: `docs/features/PWA Feature.md`.

- [ ] **Chrome "Install App" button can miss the install prompt.** `useInstallPrompt()` (the hook that captures `beforeinstallprompt`) is only invoked from `src/pages/Settings.jsx` — if the browser fires that event while the user is on any other page, it's never captured, and the Settings row simply never appears as available for that session. Fix is to lift the hook to a global mount point (e.g. alongside `OfflineBanner`/`IosInstallBanner` in `App.jsx`) instead of scoping it to one page.
- [ ] **Firefox and non-Safari iOS browsers (Chrome iOS, Firefox iOS) get no install nudge of any kind.** Chromium's `beforeinstallprompt` never fires there, and the iOS banner explicitly excludes non-Safari iOS UAs. Product decision: acceptable gap, or worth a generic fallback banner?

**Resolved since the last version of this list:**
- [x] `manifest.json` "missing" — was true before `vite-plugin-pwa` was added; the plugin now generates and injects it at build time. Not a static file in `public/`, by design.

---

## P2 — Security / trust issues

Could cause real harm (spam, data leakage, silent failures, or misleading
launch metrics) to real users post-launch.

- [ ] **Test/demo account email suppression isn't centralized.** Only one call site (`invite-co-owner/index.ts`) checks `account_type` and skips real sends for `test`/`demo` accounts. The shared `sendEmail()` helper itself has no such gate — its own comments call this a "deliberately deferred gap," since `sendEmail()` only knows the recipient address, not which account triggered the send. Any future email-sending code has to remember to replicate the pattern at its own call site; nothing enforces it centrally.
- [ ] **No bounce/delivery-webhook handling for Resend.** `email_logs.status = 'sent'` only means "Resend accepted it," not "it arrived." No `resend-webhook` function exists. Needs an Edge Function verifying Resend's signature and updating `email_logs` by `provider_message_id` on delivery/bounce/complaint events.
- [ ] **Demo Account Phase 3 has no read-only enforcement.** Confirmed — no `readOnly`/`isReadOnly`/`read_only` logic exists anywhere in `src/`. `demo1@wyskerwatch.com` shows the DEMO MODE banner but can add/edit/delete data exactly like a real account; only seeding + admin-gating of the reset/seed tools got built.
- [ ] **Sitter invite emails never actually send.** Confirmed — `InviteSitterDialog.jsx` only creates a `PetSitterAccess` row (`entities.PetSitterAccess.create(...)`); no email call anywhere in that flow. A sitter has no way to learn they've been granted access except being told directly by the owner.
- [ ] **Signup confirmation email isn't branded — it's Supabase's own default template, not Wysker Watch's.** `Register.jsx`'s own comment confirms this is intentional (`signUp()` uses "Supabase's default email-confirmation flow," not the custom Resend-based system used for co-owner invites). Worth a product decision: acceptable for launch, or does the first email a new user ever receives need to look like the rest of the product?
- [ ] **Every analytics metric blends `production`/`test`/`demo`/`owner` account types together.** `account_type` is tagged on every event, but nothing — including the nightly rollup — filters by it. Real-usage launch metrics (DAU, check-ins completed) will be inflated by test/demo/internal traffic unless this is filtered manually per-query. See `docs/features/Analytics Feature.md`.

---

## P3 — Product/data decisions needing sign-off

Not code defects — need an explicit decision because they affect what the
app tells users about their pets' health, or because a feature was speced
but never built.

- [ ] **Baseline defaults to a global "normal," not a per-pet baseline.** `pet_baselines` (schema exists since migration 0014) remains unpopulated — nothing in the app writes to it. Every unanswered attribute defaults to the same shared baseline for every pet, not something learned per-pet. Deliberate design decision from an earlier phase, not reopened by this pass, but worth confirming it's still the intended state indefinitely rather than a deferred build.
- [ ] **Vet Export's "Wellness Overview" section is dead for any pet with only post-Vibe check-ins.** It still queries the retired `wellness_scores` table and shows "No Health Score data" for essentially all current usage. Needs a decision: drop the section, or rebuild it around Vibe/symptom-count trends. Do not rebuild it around a revived numeric score — that model is retired. Full detail: `docs/features/Vet Export.md`.
- [ ] **CareMenu is intended to be deprecated (bottom-nav-only navigation) but is still live in code**, and removing it as-is would orphan History, Documents, and Insurance, which have no other entry point anywhere in the app. Needs a decision on those three destinations before CareMenu can actually be removed. Detail: `docs/foundation/0008 Navigation & Information Architecture_V4.md`.
- [ ] **"Contextual Alerts" (medication due, vaccination due, weight decreased from baseline, no check-in today) was speced in the original Navigation Refresh but was never built at all.** Confirmed via full-codebase search — no matching UI or copy exists anywhere. Build it, or formally drop it from the spec.
- [ ] **The standalone `/pet/:petId` Pet Profile page is effectively orphaned from primary navigation.** Home/Pets pet-card taps both go to Trends; Pets' "Show More" expands Pet Profile content inline instead. The only real entry points to the standalone page are the post-onboarding "start check-in" link and the accept-co-owner-invite redirect. Is this intentional, or should there be a more discoverable path?

**Dropped from the prior version of this list — fully superseded, no longer a live decision:**
- ~~Direction/severity values for bathroom/stool/mobility/breathing/itching~~ — the severity-weighted model this referred to no longer exists in any form; it was replaced by an equal-weight model, which was itself replaced by the current unweighted Vibe + Symptom Count model (migration 0026). Nothing left to decide.
- ~~Historical Health Score backfill~~ — the backfill happened under the equal-weight model, which is now itself retired along with `wellness_scores`. Moot.

---

## P4 — Known bugs / UX gaps

- [ ] **`WeightQuickLogSheet`'s date is not timezone-aware.** Confirmed in code: `PetProfileContent.jsx`'s `WeightQuickLogSheet` calls `todayStr()` with no argument, while every other date calculation in the same file explicitly passes the pet owner's `timezone`. A user logging weight late at night can have it attributed to the wrong day depending on UTC offset.
- [ ] **Adding a pet from Home is a double hop.** Home's "Add Pet" link navigates to `/pets` first; the user then has to tap "Add Pet" again on the Pets screen to actually open `AddPetDialog`. Pets' own Add Pet buttons open the dialog directly (single hop) — Home's doesn't.
- [ ] **Shared/co-owned (sitter-access) pets show no Wellbeing chips.** `SharedPetRow` (Pets screen) is a bare identity link with no chip UI of any kind — confirmed still true, documented as a known, undecided gap in `docs/features/0008 Pets Feature Specification V3.md`.
- [ ] **Pets-tab may still be missing a "tap to start Daily Check-In" shortcut** on the Wellbeing chips (lost when interactive rings were replaced by non-interactive chips). Not re-verified this pass whether this was addressed alongside the chip rebuild — needs a fresh look at `PetProfileContent.jsx`'s `context === 'pets'` chip block.
- [ ] **`TermsOfServiceSection.jsx` and `PrivacyPolicySection.jsx` duplicate rendering logic** (`BodyLink`, `BodyBlock`, section-lookup helper) instead of sharing it. Low risk today (~40 lines, static legal copy), but a future fix to link handling would need to land in both places.
- [ ] **Home screen has no tap-target audit confirmation** on its full-card-is-tappable assumption, and `loadData()` has no request-race guard. Long-standing, explicitly non-blocking.

**Needs a live check, not just code** (no direct Supabase/dashboard access from this pass):
- [ ] Whether the nightly analytics rollup's `pg_cron` job has actually fired on its own schedule yet, vs. only having been exercised via manual RPC calls — check `analytics_daily_summary.computed_at` in the Table Editor for a run that wasn't manually triggered.
- [ ] Whether legacy pet photos (Harper/Auggie/Tribble) still resolve, or point at defunct `base44.app` hosting — flagged after the earlier account-recovery incident, never confirmed either way.
- [ ] Whether demo pet photos (stored outside the normal per-user path as a workaround so `reset-sandbox-account`'s cleanup sweep won't delete them) are still intact — fragile if that sweep logic ever changes.

**Resolved since the last version of this list:**
- [x] Vet Export orphaned from navigation — it isn't. `PetProfileContent.jsx` has a direct "Vet Report" nav card, independent of CareMenu.
- [x] Pet Profile's Wellness rings showing legacy "Stable/Improving/Monitor" wording — no longer found anywhere in `PetProfileContent.jsx`; the component has since been rebuilt around Vibe.
- [x] README's account-deletion note being stale — README already correctly states real `auth.admin.deleteUser` account deletion is done.

---

## P5 — Technical debt

- [ ] `markSkipped`/`saveChangedCheckIn` (`src/lib/checkin/checkinClient.js`) aren't truly transactional — sequential network calls, no shared transaction. Reordered to fail safe, not bulletproof. A real fix needs a Postgres RPC wrapping both writes.
- [ ] Direction-read defense-in-depth (ordering + first-match dedup in `checkinClient.js`) is a safety net, not a guarantee — it only holds because prior observations are cleared first. If that invariant is ever removed, the dedup stops guaranteeing correctness.
- [ ] Demo/test account-type checks compare against lowercase string literals in a few places instead of the shared `accountType.js` constants — drift risk if canonical labels ever change casing.

---

## Not scoped yet (mentioned, no design exists)

- [ ] **Terms of Service acceptance at signup.** Confirmed — `Register.jsx` has no checkbox, no "I agree" language, no gate of any kind. The spec only ever asked for the readable screen, not an acceptance gate. Flag separately if this is actually needed for launch (many jurisdictions/stores expect explicit consent, not just a reachable page).
- [ ] Weekly/monthly "no-guilt" check-in cadence (1–3 week and month+ modes beyond daily) — described as a philosophy goal, never designed.
- [ ] Auto-populate agent to keep demo data fresh on a schedule — deferred pending the check-in data model, which is now built; still unstarted.
- [ ] Fi/Tractive pet tracker integration.
- [ ] Native push reminders (blocked on Capacitor; calendar `.ics` export works as a stopgap today).
