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

- [x] **No database backups / PITR configured — resolved.** Confirmed Supabase Daily Backups (free on Pro, 7-day retention) are active. PITR evaluated and deliberately deferred (`$100/mo` add-on, not justified pre-launch — revisit post-launch). Added a nightly encrypted `pg_dump` export to Cloudflare R2, independent of the Supabase account, with 30-day retention — covers project/account-level loss that Daily Backups alone wouldn't. Restore verified end-to-end against a scratch project (schema rebuilt from migrations, real data confirmed in Table Editor). See [requirements-database-backups.md](features/requirements-database-backups.md) for the full design, restore runbook, and known limitations (storage bucket files are not covered).
- [x] **No branch protection / CI gate on `main` — resolved.** `.github/workflows/ci.yml` runs lint + vitest + build (`frontend` job) and the Edge Function integration tests (`edge-functions` job, see item below) on every push/PR to `main`. Branch protection on `main` now requires both jobs to pass before merge (Settings → Branches). One real gotcha hit along the way, worth remembering: the branch name pattern field is a literal, case-sensitive match — a rule saved as `Main` or a non-branch string (`WWBP`) silently applies to 0 branches and can fail to save at all ("Rule is invalid") without a clear error pointing at the actual field. **Confirmed 2026-07-25:** this gate applies to PR merges. An account with bypass permission (repo admin) can still push directly to `main` without CI blocking the push — GitHub reports it as a "bypassed rule violation" rather than rejecting it. CI still runs and reports pass/fail after the fact, but doesn't prevent the push. Worth knowing before relying on this as an absolute gate.
- [x] **No dev/staging environment — resolved, and this line item itself was stale.** Three separate Supabase projects already exist (`Whisker-Watch` prod, `wysker-watch-dev`, `wysker-watch-staging`) and local `.env` already points at `wysker-watch-dev`, not prod — confirmed via `supabase projects list`/`api-keys` and the project's own `.env.example`. The "shared project" risk this item described was no longer true; CLAUDE.md and `0006 Technical Standards.md` both said otherwise and have been corrected.
- [x] **No automated test coverage on the destructive Edge Functions — resolved.** 8 Deno integration tests (`supabase/functions/delete-pet/index.test.ts`, `supabase/functions/delete-account/index.test.ts`) run against real `wysker-watch-dev` data over HTTP — sole-owner delete, co-owner transfer, co-owner leave, and no-access-403 for both functions. Also added a guard to `delete-account` refusing (403) for `account_type in ('test','demo')`, protecting the shared `test1@`/`test2@`/`demo1@` identities from ever being deleted outright (mirroring `reset-sandbox-account`'s existing "never touches the login row" guarantee) — verified live against `test2@wyskerwatch.com`.

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

- [ ] **No bounce/delivery-webhook handling for Resend.** `email_logs.status = 'sent'` only means "Resend accepted it," not "it arrived." No `resend-webhook` function exists. Needs an Edge Function verifying Resend's signature and updating `email_logs` by `provider_message_id` on delivery/bounce/complaint events.
- [ ] **Signup confirmation email isn't branded — it's Supabase's own default template, not Wysker Watch's.** `Register.jsx`'s own comment confirms this is intentional (`signUp()` uses "Supabase's default email-confirmation flow," not the custom Resend-based system used for co-owner invites). Worth a product decision: acceptable for launch, or does the first email a new user ever receives need to look like the rest of the product?
- [ ] **Every analytics metric blends `production`/`test`/`demo`/`owner` account types together.** `account_type` is tagged on every event, but nothing — including the nightly rollup — filters by it. Real-usage launch metrics (DAU, check-ins completed) will be inflated by test/demo/internal traffic unless this is filtered manually per-query. See `docs/features/Analytics Feature.md`.
**Resolved since the last version of this list:**
- [x] **Demo Account Phase 3 has no read-only enforcement — resolved 2026-07-26.** Turned out to need three separate guards, not one flag: `entityClient.js` blocks the app's normal CRUD path (create/update/delete/bulkCreate/upsert), a new DB trigger (`prevent_demo_account_writes`, migration 0036) backstops any direct write under the demo user's own session, and `delete-pet`/`invite-co-owner`/`invite-sitter` got explicit 403 guards since their writes go through the service-role connection the trigger can't see. Live on dev, staging, and prod. See [0018_Demo_Account_ReadOnly_Enforcement_Specification_v1.md](features/0018_Demo_Account_ReadOnly_Enforcement_Specification_v1.md).
- [x] **`wysker-watch-staging`'s service_role Postgres role may be missing table grants — resolved 2026-07-26.** Confirmed the real cause: every table in staging's database was missing basic select/insert/update/delete grants for every role (anon, authenticated, service_role) — not RLS, not a stale API key, and not scoped to just `profiles`/`daily_check_ins`. Fixed schema-wide via migration 0035, plus `alter default privileges` so any future table inherits the correct grants automatically on every environment. Live on dev, staging, and prod. See [0019_Staging_Missing_Table_Grants_Fix_Specification_v1.md](features/0019_Staging_Missing_Table_Grants_Fix_Specification_v1.md).
- [x] **No DMARC record for `wyskerwatch.com` — resolved 2026-07-25.** Added `_dmarc.wyskerwatch.com` TXT record in Cloudflare: `v=DMARC1; p=none; rua=mailto:dmarc-reports@wyskerwatch.com; pct=100; adkim=r; aspf=r`. Deliberately starts in monitor-only mode (`p=none`) rather than jumping straight to enforcement, since this domain has never had DMARC before — safest to review aggregate reports for a few weeks before tightening to `p=quarantine`/`p=reject`. Confirmed resolving correctly via live DNS lookup. `dmarc-reports@wyskerwatch.com` alias created in Google Workspace to receive reports.
- [x] **Test/demo account email suppression isn't centralized — resolved 2026-07-24, deployed 2026-07-25.** Moved the `account_type` check out of `invite-co-owner/index.ts` and `invite-sitter/index.ts` and into the shared `sendEmail()` itself (via an optional `sentByUserId` param) — any future caller gets the guard automatically instead of needing to remember to add it. Suppressed sends now also leave a `'suppressed'` row in `email_logs` (migration `0032`) instead of no trace at all. Live on dev, staging, and prod; verified live on dev and prod. See [requirements-centralized-email-suppression.md](features/requirements-centralized-email-suppression.md), including a deploy note about pre-existing migration-history gaps found along the way (unrelated to this change) and a follow-up flagged separately for a staging service-role grants issue.
- [x] **Sitter invite emails never actually send — resolved 2026-07-24.** `InviteSitterDialog.jsx` now calls a new `invite-sitter` Edge Function (mirroring `invite-co-owner`), with the same test/demo suppression. Testing this end to end also surfaced three more pre-existing bugs that had silently blocked the sitter-access feature entirely (not just the missing email) — `pet_sitter_access` was missing a `created_by` column every insert needs, and RLS never granted a sitter read access to `pet_sits` or `pets`. All fixed together (migrations 0028–0031) and verified live on dev, staging, and prod. See `docs/features/requirements-sitter-invite-email.md`.

---

## P3 — Product/data decisions needing sign-off

Not code defects — need an explicit decision because they affect what the
app tells users about their pets' health, or because a feature was speced
but never built.

- [ ] **Baseline defaults to a global "normal," not a per-pet baseline.** `pet_baselines` (schema exists since migration 0014) remains unpopulated — nothing in the app writes to it (re-confirmed 2026-07-25: only reference anywhere in `src/` is the generic `entities.js` registration). Every unanswered attribute defaults to the same shared baseline for every pet, not something learned per-pet. Deliberate design decision from an earlier phase, not reopened by this pass, but worth confirming it's still the intended state indefinitely rather than a deferred build.
- [ ] **CareMenu is intended to be deprecated (bottom-nav-only navigation) but is still live in code**, and removing it as-is would orphan History, Documents, and Insurance, which have no other entry point anywhere in the app. Needs a decision on those three destinations before CareMenu can actually be removed. Detail: `docs/foundation/0008 Navigation & Information Architecture_V4.md`.
- [ ] **"Contextual Alerts" (medication due, vaccination due, weight decreased from baseline, no check-in today) was speced in the original Navigation Refresh but was never built at all.** Re-confirmed 2026-07-25 via full-codebase search — no matching UI or copy exists anywhere. Build it, or formally drop it from the spec.
- [ ] **The standalone `/pet/:petId` Pet Profile page is effectively orphaned from primary navigation.** Home/Pets pet-card taps both go to Trends; Pets' "Show More" expands Pet Profile content inline instead. The only real entry points to the standalone page are the post-onboarding "start check-in" link and the accept-co-owner-invite redirect. Is this intentional, or should there be a more discoverable path?

**Dropped from the prior version of this list — fully superseded, no longer a live decision:**
- ~~Direction/severity values for bathroom/stool/mobility/breathing/itching~~ — the severity-weighted model this referred to no longer exists in any form; it was replaced by an equal-weight model, which was itself replaced by the current unweighted Vibe + Symptom Count model (migration 0026). Nothing left to decide.
- ~~Historical Health Score backfill~~ — the backfill happened under the equal-weight model, which is now itself retired along with `wellness_scores`. Moot.

**Resolved since the last version of this list:**
- [x] **Vet Export's "Wellness Overview" section — resolved.** Re-checked 2026-07-25: `VetExport.jsx` no longer has any `wellness_scores`/"Health Score data" section at all — the page was rebuilt around general "wellness history, observations, medications, vaccinations, diet, weight trend, and bloodwork" copy at some point after this item was written. Nothing left to decide; the retired-scoring section is simply gone.

---

## P4 — Known bugs / UX gaps

- [ ] **`WeightQuickLogSheet`'s date is not timezone-aware.** Confirmed in code: `PetProfileContent.jsx`'s `WeightQuickLogSheet` calls `todayStr()` with no argument, while every other date calculation in the same file explicitly passes the pet owner's `timezone`. A user logging weight late at night can have it attributed to the wrong day depending on UTC offset.
- [ ] **Adding a pet from Home is a double hop.** Home's "Add Pet" link navigates to `/pets` first; the user then has to tap "Add Pet" again on the Pets screen to actually open `AddPetDialog`. Pets' own Add Pet buttons open the dialog directly (single hop) — Home's doesn't.
- [ ] **Shared/co-owned (sitter-access) pets show no Wellbeing chips.** The component this item originally named, `SharedPetRow`, no longer exists under that name — it's `SitterPetRow` now (`src/pages/Pets.jsx:203`), renamed at some point without this item being updated. Re-confirmed 2026-07-25 the underlying claim still holds regardless of the name: it's a bare identity link (photo + name only) with no chip UI of any kind — documented as a known, undecided gap in `docs/features/0008 Pets Feature Specification V3.md`.
- [ ] **Pets-tab's Wellbeing chips don't launch Daily Check-In — they navigate to Trends.** Re-verified 2026-07-25: `PetProfileContent.jsx`'s `context === 'pets'` chip block (`~line 553`) renders `AttributeTrendChip` with `onClick` routing to `/pet/:id/trends?...`, not a check-in launcher. If a "tap to start Daily Check-In" shortcut was ever intended here, it isn't there today.
- [ ] **`TermsOfServiceSection.jsx` and `PrivacyPolicySection.jsx` duplicate rendering logic** (`BodyLink`, `BodyBlock`, section-lookup helper) instead of sharing it. Low risk today (~40 lines, static legal copy), but a future fix to link handling would need to land in both places.
- [ ] **Home screen has no tap-target audit confirmation** on its full-card-is-tappable assumption, and `loadData()` has no request-race guard. Long-standing, explicitly non-blocking.
- [ ] **`DailyCheckInSheet`/`DailyCheckInModal`'s `fixed inset-0` overlay isn't actually pinned to the viewport — it's pinned to Home's entire scrollable content.** Discovered 2026-07-25 building `0015_MultiDay_CatchUp_CheckIn_Specification_v1.md`'s calendar overlay, which has the identical bug pattern: `Home.jsx` wraps its content in `PageTransition.jsx`'s `motion.div`, and Framer Motion applies a `transform` style even at rest — per the CSS spec, any transform on an ancestor (even an identity one) makes it the containing block for `position: fixed` descendants, so "fixed" ends up relative to Home's full (often 3000px+) content height, not the real ~800px viewport. It's invisible in normal use only because the sheet auto-launches near `scrollY≈0`, where the miscalculated box happens to still cover the visible area — a user who scrolls Home first, then manually opens a check-in, would likely see the sheet rendered far off-screen. Confirmed via `getBoundingClientRect()`/`elementFromPoint` while debugging, not yet reproduced with a manual scroll+open in this pass. Fix (already applied in the new Catch Up overlay): render via `createPortal(..., document.body)` instead of inline.
- [ ] **The standalone Pet Profile route (`/pet/:petId`) is unreachable through normal in-app navigation** — confirmed 2026-07-25. Already fully documented in `docs/foundation/0008 Navigation & Information Architecture_V4.md` (Pet Profile section) — see that doc for the full detail (which links reach it, which don't). Needs a product decision on whether/how to surface a discoverable entry point.

**Resolved since the last version of this list:**
- [x] **Multi-day Catch Up's Exceptions screen was a practical dead end.** Resolving the last flagged "needs details" day (via bulk-apply or an individual detail save) never returned the owner to the Calendar screen, where "Finish Catch Up" — the action that saves every remaining day as an assumed Great Day — actually lives. Found live in production 2026-07-25 while testing a real pet: a direct SQL query showed zero saved Great Day rows despite the owner believing Catch Up was complete. Fixed in spec `0017`, commit `c8b2afd`: resolving the last flagged day now automatically returns to Calendar, and the Exceptions list's confusing dual tap-targets (a tiny checkbox vs. tapping the row, doing different things) were flipped so tapping a row selects it for bulk-apply, with a separate small icon button to open one day's details.
- [x] Vet Export orphaned from navigation — it isn't. `PetProfileContent.jsx` has a direct "Vet Report" nav card, independent of CareMenu.
- [x] Pet Profile's Wellness rings showing legacy "Stable/Improving/Monitor" wording — no longer found anywhere in `PetProfileContent.jsx`; the component has since been rebuilt around Vibe.
- [x] README's account-deletion note being stale — README already correctly states real `auth.admin.deleteUser` account deletion is done.
- [x] **Nightly analytics rollup's `pg_cron` job firing on its own schedule — confirmed 2026-07-25.** Queried `analytics_daily_summary.computed_at` directly (`supabase db query --linked`, dev project): six consecutive rows land exactly on the hour (`...03:00:00`, `...17:00:00`, etc.) roughly 24h apart per `summary_date`, which is only explainable by the scheduled job actually firing — a manual trigger wouldn't land precisely on the hour repeatedly. Real, unattended, working.
- [x] **Legacy pet photos (Harper/Auggie/Tribble) — confirmed resolving, 2026-07-25.** Queried prod directly: all three still point at `base44.app` hosting (e.g. `https://base44.app/api/apps/6a0fa45.../files/...jpeg`), and a live fetch confirms that URL 302-redirects to a working image (`200`, `image/jpeg`). Not broken.
- [x] **Demo pet photos — confirmed intact, 2026-07-25.** Both `DEMO_CAT_PHOTO_URL`/`DEMO_DOG_PHOTO_URL` (`src/lib/seedTestData.js`) resolve `200` live. Still fragile to the `reset-sandbox-account` sweep logic changing, as originally flagged — just currently fine.

---

## P5 — Technical debt

- [ ] Direction-read defense-in-depth (ordering + first-match dedup in `checkinClient.js`) is a safety net, not a guarantee — it only holds because prior observations are cleared first. If that invariant is ever removed, the dedup stops guaranteeing correctness. Re-verified 2026-07-25: the clear-then-insert pattern is unchanged, and the new `markGreatDaysBulk` follows the same pattern.
- [ ] **`npm run typecheck` has 279 pre-existing errors across 56 files (re-confirmed 2026-07-25, was 274/51 on 2026-07-21) and isn't run in CI.** The script exists in `package.json` but nothing appears to have been gating on its output — errors span nearly every shared UI primitive (`tabs`/`select`/`switch`/`textarea`/`label`/`sheet`/`drawer`/`alert-dialog`/`radio-group`, same untyped-`forwardRef` root cause already fixed for `Button`/`Input`/`Dialog`) plus real prop-shape mismatches in app components (`MenuListRow`, `PetSymptoms.jsx`, `PetTrends.jsx`, `Register.jsx`, `AuthContext.jsx`). Fixing the shared-primitive cases is probably mechanical (cast to `any`, same pattern as the three already done); the app-component cases need actual review since they may reflect real prop-contract drift, not just inference noise. `.github/workflows/ci.yml` deliberately does not run `npm run typecheck` yet — see its inline comment.

**Resolved since the last version of this list:**
- [x] **Demo/test account-type lowercase-literal drift risk — resolved, or was never real.** Re-checked 2026-07-25: searched every `.jsx` file for bare `'test'`/`'demo'` string literals; the only hit is `AccountTypeBanner.jsx`, where they're just its own internal `variant` value (derived from `isTestAccount(user)`/`isDemoAccount(user)`, the shared helpers), not a comparison against `account_type` bypassing those helpers. No actual drift-risk instance found anywhere in the current codebase.
- [x] **`checkinClient.js`'s multi-step writes weren't truly transactional — resolved.** `markGreatDay`, `markOffTough`, `markGreatDaysBulk`, and the new `markOffToughBulk` now write through `public.save_daily_check_ins()` (migration `0034`, `security invoker`), which does the upsert/delete/insert for a batch of days in one database transaction instead of several separate, independently-failable calls. Shipped in spec `0016`, commit `2a7edfa`, applied to both `wysker-watch-dev` and production.

---

## Not scoped yet (mentioned, no design exists)

- [ ] **Terms of Service acceptance at signup.** Confirmed — `Register.jsx` has no checkbox, no "I agree" language, no gate of any kind. The spec only ever asked for the readable screen, not an acceptance gate. Flag separately if this is actually needed for launch (many jurisdictions/stores expect explicit consent, not just a reachable page).
- [ ] Weekly/monthly "no-guilt" check-in cadence (1–3 week and month+ modes beyond daily) — described as a philosophy goal, never designed.
- [ ] Auto-populate agent to keep demo data fresh on a schedule — deferred pending the check-in data model, which is now built; still unstarted.
- [ ] Fi/Tractive pet tracker integration.
- [ ] Native push reminders (blocked on Capacitor; calendar `.ics` export works as a stopgap today).
- [ ] **Drag-to-reorder pets on Home.** Descoped from `0015_MultiDay_CatchUp_CheckIn_Specification_v1.md`'s pet-selection screen on 2026-07-25 — the underlying mockup showed drag-to-reorder there, but the app has no `order`/`sort` column on `pets` and no drag UI anywhere today. Owner decision: build it as its own feature on Home (not inside Catch Up), scope/spec separately when picked up.
- [ ] **`docs/features/0007 Home Feature Specification V2.md`'s "Catch-Up Reminder" section is now stale — `0015_MultiDay_CatchUp_CheckIn_Specification_v1.md` shipped 2026-07-25 (dev, staging, and prod).** It currently states "Only the most recent missed day is surfaced on Home," which is no longer true for 2+ day gaps. `doc-updater` pass is now actionable, not deferred.
