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
- [ ] **Demo Account Phase 3 has no read-only enforcement.** Confirmed — no `readOnly`/`isReadOnly`/`read_only` logic exists anywhere in `src/`. `demo1@wyskerwatch.com` shows the DEMO MODE banner but can add/edit/delete data exactly like a real account; only seeding + admin-gating of the reset/seed tools got built.
- [ ] **Signup confirmation email isn't branded — it's Supabase's own default template, not Wysker Watch's.** `Register.jsx`'s own comment confirms this is intentional (`signUp()` uses "Supabase's default email-confirmation flow," not the custom Resend-based system used for co-owner invites). Worth a product decision: acceptable for launch, or does the first email a new user ever receives need to look like the rest of the product?
- [ ] **Every analytics metric blends `production`/`test`/`demo`/`owner` account types together.** `account_type` is tagged on every event, but nothing — including the nightly rollup — filters by it. Real-usage launch metrics (DAU, check-ins completed) will be inflated by test/demo/internal traffic unless this is filtered manually per-query. See `docs/features/Analytics Feature.md`.
- [ ] **No DMARC record for `wyskerwatch.com`.** Confirmed 2026-07-24 while reviewing DNS for the new Google Workspace mailboxes — SPF and DKIM are both correctly configured (root SPF includes `_spf.google.com`; Resend's SPF/DKIM live on the `send.` subdomain and `resend._domainkey`), but there's no `_dmarc.wyskerwatch.com` TXT record. Without one, there's no explicit policy for receivers to follow on an auth failure and no visibility into spoofing attempts against the domain. Pure DNS, not a code change — needs to be added in Cloudflare's dashboard.
- [ ] **`wysker-watch-staging`'s service_role Postgres role may be missing table grants.** Confirmed 2026-07-25 while deploying the email-suppression fix: REST calls to `profiles`/`daily_check_ins` using staging's service-role key return `permission denied for table X` (a grants error, not RLS — service_role should bypass RLS entirely). Untested whether this is a genuine missing `GRANT`, a stale/legacy API key issue specific to this project, or something else. If it's real, every Edge Function using the admin client to read `profiles` (`invite-co-owner`, `invite-sitter`, `delete-account`, `reset-sandbox-account`) is likely silently failing on staging today. A background investigation task was spawned for this (`task_2ddd7059`) but hasn't run yet.

**Resolved since the last version of this list:**
- [x] **Test/demo account email suppression isn't centralized — resolved 2026-07-24, deployed 2026-07-25.** Moved the `account_type` check out of `invite-co-owner/index.ts` and `invite-sitter/index.ts` and into the shared `sendEmail()` itself (via an optional `sentByUserId` param) — any future caller gets the guard automatically instead of needing to remember to add it. Suppressed sends now also leave a `'suppressed'` row in `email_logs` (migration `0032`) instead of no trace at all. Live on dev, staging, and prod; verified live on dev and prod. See [requirements-centralized-email-suppression.md](features/requirements-centralized-email-suppression.md), including a deploy note about pre-existing migration-history gaps found along the way (unrelated to this change) and a follow-up flagged separately for a staging service-role grants issue.
- [x] **Sitter invite emails never actually send — resolved 2026-07-24.** `InviteSitterDialog.jsx` now calls a new `invite-sitter` Edge Function (mirroring `invite-co-owner`), with the same test/demo suppression. Testing this end to end also surfaced three more pre-existing bugs that had silently blocked the sitter-access feature entirely (not just the missing email) — `pet_sitter_access` was missing a `created_by` column every insert needs, and RLS never granted a sitter read access to `pet_sits` or `pets`. All fixed together (migrations 0028–0031) and verified live on dev, staging, and prod. See `docs/features/requirements-sitter-invite-email.md`.

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
- [ ] **`DailyCheckInSheet`/`DailyCheckInModal`'s `fixed inset-0` overlay isn't actually pinned to the viewport — it's pinned to Home's entire scrollable content.** Discovered 2026-07-25 building `0015_MultiDay_CatchUp_CheckIn_Specification_v1.md`'s calendar overlay, which has the identical bug pattern: `Home.jsx` wraps its content in `PageTransition.jsx`'s `motion.div`, and Framer Motion applies a `transform` style even at rest — per the CSS spec, any transform on an ancestor (even an identity one) makes it the containing block for `position: fixed` descendants, so "fixed" ends up relative to Home's full (often 3000px+) content height, not the real ~800px viewport. It's invisible in normal use only because the sheet auto-launches near `scrollY≈0`, where the miscalculated box happens to still cover the visible area — a user who scrolls Home first, then manually opens a check-in, would likely see the sheet rendered far off-screen. Confirmed via `getBoundingClientRect()`/`elementFromPoint` while debugging, not yet reproduced with a manual scroll+open in this pass. Fix (already applied in the new Catch Up overlay): render via `createPortal(..., document.body)` instead of inline.

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
- [ ] **`npm run typecheck` has 274 pre-existing errors across 51 files (confirmed 2026-07-21) and isn't run in CI.** The script exists in `package.json` but nothing appears to have been gating on its output — errors span nearly every shared UI primitive (`tabs`/`select`/`switch`/`textarea`/`label`/`sheet`/`drawer`/`alert-dialog`/`radio-group`, same untyped-`forwardRef` root cause already fixed for `Button`/`Input`/`Dialog`) plus real prop-shape mismatches in app components (`MenuListRow`, `PetSymptoms.jsx`, `PetTrends.jsx`, `Register.jsx`, `AuthContext.jsx`). Fixing the shared-primitive cases is probably mechanical (cast to `any`, same pattern as the three already done); the app-component cases need actual review since they may reflect real prop-contract drift, not just inference noise. `.github/workflows/ci.yml` deliberately does not run `npm run typecheck` yet — see its inline comment.

---

## Not scoped yet (mentioned, no design exists)

- [ ] **Terms of Service acceptance at signup.** Confirmed — `Register.jsx` has no checkbox, no "I agree" language, no gate of any kind. The spec only ever asked for the readable screen, not an acceptance gate. Flag separately if this is actually needed for launch (many jurisdictions/stores expect explicit consent, not just a reachable page).
- [ ] Weekly/monthly "no-guilt" check-in cadence (1–3 week and month+ modes beyond daily) — described as a philosophy goal, never designed.
- [ ] Auto-populate agent to keep demo data fresh on a schedule — deferred pending the check-in data model, which is now built; still unstarted.
- [ ] Fi/Tractive pet tracker integration.
- [ ] Native push reminders (blocked on Capacitor; calendar `.ics` export works as a stopgap today).
- [ ] **Drag-to-reorder pets on Home.** Descoped from `0015_MultiDay_CatchUp_CheckIn_Specification_v1.md`'s pet-selection screen on 2026-07-25 — the underlying mockup showed drag-to-reorder there, but the app has no `order`/`sort` column on `pets` and no drag UI anywhere today. Owner decision: build it as its own feature on Home (not inside Catch Up), scope/spec separately when picked up.
- [ ] **`docs/features/0007 Home Feature Specification V2.md`'s "Catch-Up Reminder" section will go stale once `0015_MultiDay_CatchUp_CheckIn_Specification_v1.md` ships.** It currently states "Only the most recent missed day is surfaced on Home," which stops being true for 2+ day gaps. Run a `doc-updater` pass after the Catch Up implementation lands, not before.
