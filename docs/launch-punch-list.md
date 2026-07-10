# Launch Punch List

Tracked list of everything outstanding before Wysker Watch goes to the App Store / Play Store, ranked by priority. Pulled from code audits and session history as of 2026-07-10.

Check items off as they're resolved. Add new items at the bottom of their tier, don't renumber existing ones.

---

## P0 — Data safety & process (fix regardless of launch timing)

These aren't App Store requirements, but shipping to real users without them is reckless — one already caused a real incident.

- [ ] **No database backups / PITR configured.** Confirmed on the live project: `pitr_enabled: false`, `backups: []`. Already bit us once — an entire `auth.users` account got deleted and was only recoverable because a stray migration file happened to contain the original data as INSERTs. That safety net won't exist for anything created since. Needs a paid Supabase tier with PITR or a scheduled `pg_dump` export, before real user data accumulates.
- [ ] **No branch protection / CI gate on `main`.** No required reviews, no required checks — every push goes straight to production. Decide whether that's still acceptable once this is a shipped app with real users on it.
- [ ] **No dev/staging environment.** Local `npm run dev` and production point at the same Supabase project — any local testing writes real rows to live data.
- [ ] No automated test coverage on the destructive Edge Functions (`delete-pet`, `delete-account`). The vitest suite (59 tests) covers frontend logic only, not these Deno functions. Accepted risk when Phase 1/2 shipped — worth revisiting now that these are irreversible, no-backup operations (see above).

## P1 — App Store hard blockers

Nothing below this line can go to either store without the native shell existing.

- [ ] **Capacitor wrapping for iOS/Android.** Not started — no `ios`/`android` folders, no `capacitor.config`. This is the root blocker; everything else in this tier and P2's deep-linking item cascade from this decision.
- [ ] **Universal Links / App Links (mobile deep linking).** `https://www.wyskerwatch.com/accept-invite?...` links need to open the app directly, not a browser, once it's a real app — reviewers will test the invite flow. Needs: `apple-app-site-association` + `assetlinks.json` hosted at `www.wyskerwatch.com/.well-known/`, iOS Associated Domains capability, Android `intent-filter` with `autoVerify="true"`, and Capacitor's `@capacitor/app` `appUrlOpen` listener wired to route the incoming URL. Requires an Apple Developer account.
- [ ] **Store submission assets don't exist.** App icons (all required sizes), screenshots, store listing copy, privacy manifest, permissions justification — none of this exists since there's no native project to hold them yet.
- [ ] **No in-app Terms of Service**, and no in-app link to the Privacy Policy. `privacy-policy.md` exists in the repo but both stores require these reachable *from within the app*, not just a repo file.
- [ ] **`manifest.json` is missing.** `index.html:7` references `/manifest.json`; no such file exists anywhere in the repo (no `public/` directory either). Currently 404s. Matters if any PWA/TWA install path is part of the plan.

## P2 — Security / trust issues

Could cause real harm (spam, data leakage, silent failures) to real users post-launch.

- [ ] **Test/demo account email suppression isn't centralized.** `invite-co-owner`'s old path skipped real sends for `test`/`demo` accounts; the new shared `sendEmail()` doesn't. Needs an optional `sentByUserId` param that looks up `account_type` and skips the real Resend call (still logs the attempt) for test/demo triggers. Build into the first real workflow that calls `sendEmail`, not speculatively.
- [ ] **No bounce/delivery-webhook handling.** `email_logs.status = 'sent'` only means "Resend accepted it," not "it arrived." Needs a `resend-webhook` Edge Function verifying Resend's signature and updating `email_logs` by `provider_message_id` on delivery/bounce/complaint events.
- [ ] **Demo Account Phase 3 has no read-only enforcement.** `demo1@wyskerwatch.com` shows the DEMO MODE banner but can add/edit/delete data exactly like a real account — only seeding + admin-gating of the reset/seed tools got built.
- [ ] Sitter invite emails never actually send — access records are created but no email fires. Confirmed no sitter-invite email code exists in `supabase/functions/`.

## P3 — Product/data decisions needing your sign-off

Not code defects — need an explicit decision because they affect what the app tells users about their pets' health.

- [ ] **Direction/severity values for bathroom, stool, mobility, breathing, itching are invented, not spec-given.** Severity weights: `supabase/migrations/0014_daily_checkins_wellness.sql` lines 209–299 (`observation_options` seed data), comment at lines 187–192 admits only `appetite` traces to the actual spec. Only `appetite` (and implied water/energy) had explicit guidance. Needs product/vet review before being treated as authoritative — these numbers are what tell a user their pet is declining.
- [ ] **Baseline defaults to a global "normal," not a per-pet baseline.** `resolveDailyAttributeState` (called from `src/lib/checkin/checkinClient.js`, used in `src/components/PetProfileContent.jsx:275-276`) defaults every unanswered attribute to a shared "normal" (ordinal 0) since `pet_baselines` (schema in migration `0014`, lines 105–119) is unpopulated — confirmed no component/hook reads or writes it. Decide: is generic-normal acceptable indefinitely, or does this block on populating per-pet baselines?
- [ ] **Historical Health Score backfill.** Pre-V2 `wellness_scores` rows have no `health_score`/`health_score_version` column value — V2 scores/charts only exist from ship-date (`34bf4e7`) forward. Spec §12.4 explicitly forbids backfilling silently; needs your explicit go-ahead on a separate migration that runs existing `observations` through `computeHealthScore` (in `src/lib/checkin/scoring.js`) if historical scores are wanted.

## P4 — Known bugs / UX gaps

Real issues, not launch-blocking, but should land before or shortly after launch.

- [ ] **Vet Export is fully built but orphaned** — the page ([src/pages/VetExport.jsx](src/pages/VetExport.jsx), route registered in `src/App.jsx:26,84`) works and pulls live data, but `src/components/CareMenu.jsx` (item list starts ~line 13; Labs/Vaccines/Sitter entries at lines 19-21) has no entry pointing to `/pet/:petId/export` — confirmed still missing. `src/pages/About.jsx:38` advertises "exportable reports" with no link to it. Either add a `CareMenu.jsx` entry, or do the discussed rewrite first (pull from `wellness_scores`/`pet_baselines`/`bloodwork` instead of legacy `symptom_logs`, add a second entry point on the profile header, possibly split into a client-callable "generate" function + a service-role "email to vet" function).
- [ ] Shared/co-owned pets show no Wellbeing chips — `SharedPetRow` function in [src/pages/Pets.jsx:196](src/pages/Pets.jsx:196) (rendered at line 158) is still a bare identity link with no chip UI.
- [ ] Pets-tab lost its "tap the ring to start Daily Check-In" shortcut when rings were replaced with non-interactive chips (UX regression, not a spec violation). Location: the `context === 'pets'` Wellbeing-chip block in [src/components/PetProfileContent.jsx:607](src/components/PetProfileContent.jsx:607) onward.
- [ ] `WeightQuickLogSheet`'s date is still UTC, inconsistent with the rest of `PetProfileContent.jsx` (which is timezone-aware per the User Profile & Timezone Settings V1 work).
- [ ] Pet Profile's standalone Wellness rings still show legacy "Stable/Improving/Monitor/Lower" wording — confirmed still live at [src/components/PetProfileContent.jsx:37](src/components/PetProfileContent.jsx:37) (`STATUS_TONE` map) and line 522 (trend-label map); explicitly out of scope when Health Score V2 shipped, per the comment at lines 595-606 of the same file.
- [ ] Home screen: no tap-target audit confirmation on full-card assumption, and no request-race guard in `Home.jsx`'s `loadData()` — both explicitly marked non-blocking when raised.
- [ ] Demo pet photos live outside the normal per-user storage path as a manual workaround so `reset-sandbox-account`'s cleanup sweep won't delete them — fragile if that sweep logic ever changes.
- [ ] Legacy pet photos (Harper/Auggie/Tribble) may still point at `base44.app` hosting — unconfirmed whether those URLs still resolve, flagged after the account-recovery incident.

## P5 — Technical debt

Not urgent; fine to carry into post-launch iteration.

- [ ] `markSkipped` ([src/lib/checkin/checkinClient.js:354](src/lib/checkin/checkinClient.js:354)) / `saveChangedCheckIn` ([src/lib/checkin/checkinClient.js:378](src/lib/checkin/checkinClient.js:378)) aren't truly transactional — sequential network calls, no shared transaction. Reordered to fail safe (delete-before-upsert), not bulletproof. A real fix needs a Postgres RPC wrapping both writes.
- [ ] Direction-read defense-in-depth (`.order('created_at')` + first-match, see comment at [src/lib/checkin/checkinClient.js:191](src/lib/checkin/checkinClient.js:191) and :247) is a safety net, not a guarantee — it only holds because `saveChangedCheckIn` clears prior observations first (comment at line 421). If that invariant is ever removed, the ordering-based dedup stops guaranteeing correctness.
- [ ] Demo/test account-type checks compare against lowercase string literals in a few places instead of shared constants — drift risk if canonical labels ever change casing.
- [ ] README's account-deletion checklist note is stale — code already does real `auth.admin.deleteUser`, doc implies otherwise.

## Not scoped yet (mentioned, no design exists)

- [ ] Weekly/monthly "no-guilt" check-in cadence (1–3 week and month+ modes beyond daily) — described as a philosophy goal, never designed.
- [ ] Auto-populate agent to keep demo data fresh on a schedule — deferred pending the check-in data model, which is now built; still unstarted.
- [ ] Fi/Tractive pet tracker integration.
- [ ] Native push reminders (blocked on Capacitor; calendar `.ics` export works as a stopgap today).
