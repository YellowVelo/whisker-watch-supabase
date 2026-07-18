# Documentation Review Punch List (2026-07-18)

Full re-audit. Everything below was re-verified fresh against the current
repo state (`git log` confirms no source code changed since the last
pass — only docs) rather than carried over from the prior version of this
list. Two kinds of items live here: **doc-hygiene** items (a doc is wrong,
stale, or misplaced) and **product/code** items (something real was
discovered while checking docs against code — a bug, an unwired feature,
an architecture question). Check items off as they're resolved; add new
ones at the bottom of their tier.

Related reading: `docs/feature-triage-2026-07-18.md` (current
`docs/features/` triage — 10 CURRENT, 4 STALE-at-the-time, all 4 since
reconciled). The earliest audit/triage docs and the separate launch-focused
punch list have since been removed from the repo; items below that
originally cross-referenced them have been trimmed to stand on their own.

---

## P0 — Foundation docs factually wrong (treated as ground truth, never double-checked)

**Closed this pass.** All six foundation docs with concrete, checkable
implementation claims were re-verified against code and schema; five
needed real fixes and all five were corrected (committed `da6bb8d`):

- [x] `docs/foundation/0007 Data Model_V2.md` — retired status enum and a dead `wellness_scores` table were both described as live. Fixed throughout (schema table, relationships diagram, §7, §8, Summary).
- [x] `docs/foundation/0008 Navigation & Information Architecture_V4.md` — described a "Pet Profiles" Menu directory and `WellnessCard`/`CheckInCard` components that **don't exist anywhere in the codebase** (no route, no component file), a 5-ring Pet Profile header, a wrong Menu item list (missing Pet Sitter/AI/Terms of Service), and a wrong description of what the Trends screen's "Trends" sub-tab actually shows. Extensively rewritten.
- [x] `docs/foundation/0006 Technical Standards.md` — asserted "TypeScript for all frontend code" (false — no `tsconfig.json`), described Capacitor/native mobile as current architecture (false — it's still entirely unstarted, no `ios`/`android` folders, no `capacitor.config`), and said the frontend deploys to Netlify/Vercel (false — it's Cloudflare Workers). All corrected.
- [x] `docs/foundation/0009 Terminology.md` — still defined the Daily Check-In's core vocabulary using the twice-retired pre-Vibe model, and mislabeled two shipped features (Co-Owner, Health Score) as "(future)." Corrected. The undefined "Stability Indicator" term was dropped rather than fixed — confirmed intentional, not restored.
- [x] `docs/foundation/0005 Design System.md` and `docs/foundation/0010 UX flow_V1.txt` — stale "Whisker Watch" brand name, and a flow diagram claiming "tap pet card → Pet Profile" from Home (it actually goes to Trends). Fixed.
- [x] `docs/foundation/0001–0004` (Product Context/Vision/Principles/UX Principles) — checked, confirmed genuinely accurate. No changes needed; these are durable/philosophical content with nothing concrete to contradict.

**Re-verified this pass:** re-read all six corrected docs fresh; no residual staleness found, no dangling references to the files moved in P1 below.

---

## P1 — Doc hygiene: collisions, wrong pointers, misfiled candidates

**Closed this pass.** All four items resolved:

- [x] **Filename collision.** The Archive copy of `0006 Pet Delete Test and Demo Accounts V2.md` was a genuinely different document — an as-built reconciliation memo with its own "Open decisions for Product" list, not a duplicate of the real spec — that happened to share the exact filename with `docs/features/0006 …V2.md`. Renamed to `docs/Archive/0006 Pet Delete Test and Demo Accounts — As-Built Reconciliation Notes.md` so it can't be mistaken for the spec itself; content untouched, since it's still a useful decision-tracking record.
- [x] **CLAUDE.md's canonical-spec pointer.** Fixed to point at `docs/features/0012_DailyCheckIn_Vibe_Trends_Specification_v5.md` (the real file), with a note explaining the byte-identical `.txt` in `docs/Archive/` is a leftover duplicate, not a second source.
- [x] **Misfiled Pets draft.** Investigated properly rather than just moved — the "Ready for Implementation" framing was the right instinct: several of its specifics were never built as written (it claimed the whole pet card is tappable and navigates to Pet Profile with a chevron; actually, "Show More" expands the card in place, with no navigation and no chevron at all — confirmed against `Pets.jsx`/`ExpandablePetProfileCard.jsx`/`PetProfileContent.jsx`). Wrote a full as-built reconciliation, `docs/features/0008 Pets Feature Specification V3.md`, correcting card-tap navigation, adding the previously-undocumented "Shared with Me" section, and fixing several smaller claims (no medication chip or "Healthy" fallback on this screen, error copy, Life Stage not actually displayed). The old V2 draft stays in Archive, now correctly superseded rather than merely misplaced. This also closes the matching P2 item below.
- [x] **"Claude Whisker Watch Project" phrasing.** Confirmed with the team: this is the actual, still-current name of the Claude.ai Project workspace, unrelated to the app's own Whisker→Wysker rebrand. Accurate as-is — no change made.

---

## P2 — Undocumented shipped features

- [x] **Pets screen** now has a real, reconciled doc: `docs/features/0008 Pets Feature Specification V3.md` (see P1).
- [x] **Vet Export now has a doc:** `docs/features/Vet Export.md` (2026-07-18) — covers the entry point (`PetProfileContent.jsx`'s "Vet Report" nav card, confirmed independent of `CareMenu.jsx`), the client wrapper, and the full `generate-vet-report` Edge Function (all 9 report sections, RLS-based access control, 180-day data windows). Surfaced a new, real finding: the report's "Wellness Overview" section still queries the dead `wellness_scores` table (see the `0007 Data Model_V2.md` §3.19 note on that table) and has shown "No Health Score data" for any pet with only post-Vibe-model check-ins since 2026-07-13 — a real product gap, added as a new P3 item below. Also notes the code references a "Vet Export Feature Spec v2" that doesn't exist anywhere in this repo.
- [x] **PWA install flow now has a doc:** `docs/features/PWA Feature.md` (2026-07-18) — covers the manifest/service worker (`vite-plugin-pwa`), the Chromium/Android install prompt (Settings row), the iOS Safari manual-install banner, and the offline banner. Also flags a real gap: Firefox and non-Safari iOS browsers get no install nudge at all.
- [x] **Analytics now has a doc:** `docs/features/Analytics Feature.md` (2026-07-18) — covers the full event catalog (~45 live events), the `account_type` tagging, the `pg_cron` nightly/hourly rollup, and access/exposure (SQL-Editor-only, no in-app dashboard). Also documents a retired event found in live data (`menu_pet_profiles_selected`, matching no current Menu item) and explicitly clarifies that this system is **not** a database backup — the project has no database backup or point-in-time recovery configured at all (`pitr_enabled: false`, confirmed on the live Supabase project), a real, separate, still-open gap.

---

## P3 — Real product/code gaps discovered while reviewing docs (not doc problems themselves)

Re-confirmed against current code — nothing here changed since no source files were touched this session:

- [ ] **Timeline mislabels every non-skipped check-in.** `src/lib/checkin/petProfileClient.js:126` — `getTimelineEvents()` titles a check-in event using `c.status === 'normal' ? … : …`. `'normal'` hasn't been a live status value since migration 0026, so this condition never matches — every Great Day currently shows as "changes logged" on the Timeline, identical to an Off/Tough Day. A genuine code bug, not a doc issue.
- [ ] **Three of five email templates are fully built but never triggered.** `welcome`, `verify-email`, and `password-reset` (`supabase/functions/_shared/email/templates/`) have zero callers anywhere in `supabase/functions/`. If real signup/verify/reset emails go out today, they're coming from Supabase Auth's own built-in email system, not this branded one. Needs a product decision: wire these up, or drop them from the spec as intentionally out of scope.
- [ ] **Health Records / Bloodwork and lab results never appear on the Timeline**, despite being a real, separate, shipped feature. `getTimelineEvents()` only assembles check-ins, medication starts, vaccinations, and symptom logs.
- [ ] **"Contextual Alerts" (medication due, vaccination due, weight decreased from baseline, no check-in today) was speced in the original Navigation Refresh but was never built at all** — confirmed via full-codebase grep, no matching UI or copy exists anywhere. Needs a product decision: build it, or formally drop it (both `docs/features/0004 Navigation RefreshV2.md` and the newly-corrected `docs/foundation/0008 Navigation & Information Architecture_V4.md` now document this accurately as "never implemented," but the underlying feature gap itself is still open).
- [ ] **The standalone `/pet/:petId` Pet Profile page is effectively orphaned from primary navigation.** Tapping a pet card on Home or Pets goes to Trends, not Pet Profile; Pets' "Show More" expands Pet Profile content inline instead. The only real entry points are the post-Pet-Onboarding "start check-in" link and the accept-co-owner-invite redirect. Worth a product check-in: is this intentional, or should there be a more discoverable path to it?
- [ ] **CareMenu (the hamburger menu on the legacy `PetProfileTabs.jsx` page, `Documents.jsx`, and `Insurance.jsx`) is intended to be deprecated per product direction — bottom nav + back only — but is still live in code, and removing it as-is would orphan History, Documents, and Insurance.** Confirmed 2026-07-18: Vet Report/Baseline/Medications/Food/Vaccinations/Health Records/AI/Pet Sitter all already have independent entry points that don't touch CareMenu, but `LogHistory.jsx` (History), `Documents.jsx`, and `Insurance.jsx` have no other link anywhere in the app. `docs/foundation/0008 Navigation & Information Architecture_V4.md`'s CareMenu section (written this session, before this deprecation direction was known) describes it as a normal, ongoing part of the navigation — needs a note added once a decision is made on the three orphaned destinations.
- [ ] **The nightly analytics rollup's `checkins_completed` count has likely been silently broken since the Vibe model shipped (2026-07-13).** `compute_daily_analytics_summary()` (migrations 0023/0024) counts completions by querying `analytics_events` for `event_name in ('daily_check_in_marked_normal', 'daily_check_in_marked_changed')` — **neither event name is fired anywhere in the current codebase.** The actual completion event was renamed to `vibe_recorded` (`DailyCheckInSheet.jsx:70,131`) the day after the rollup migration shipped, and the rollup function was never updated to match. `app_opened`/`daily_check_in_started`/`daily_check_in_skipped` all still fire correctly, so DAU/new/returning/started/skipped counts are unaffected — only `checkins_completed` in `analytics_daily_summary` is likely wrong. A genuine code bug, found while investigating whether the analytics rollup needed a doc. Confirmed live in production data (Table Editor screenshot, 2026-07-18): `checkins_started` of 9/26/13/4/5/6/7 against `checkins_completed` of 6/0/1/0/0/0/0 for 2026-07-11 through 07-17 — the collapse lines up exactly with the Vibe rename, not a real drop in completions.
- [ ] **Vet Export's "Wellness Overview" section is effectively dead for any pet with only post-Vibe check-ins.** `generate-vet-report` (Edge Function) queries `wellness_scores` for `health_score_version = 'health_score_v2'` — but nothing has written to `wellness_scores` since migration 0026 retired it in favor of the Vibe/symptom-count model (2026-07-13). The report's first content section now shows "No Health Score data has been recorded for this pet yet" for essentially all current usage; only pets with surviving pre-migration rows show anything there, and that data can only get staler. A real product gap, not a generation bug — found while writing `docs/features/Vet Export.md`. Needs a product decision: drop the section, or redesign it around the current model. **Do not fix by reviving a "Wellness Score"** — see the next item.
- [ ] **Vet Export has no email-to-vet capability.** Generate/download only today. Verified 2026-07-18 against an external product-review doc that turned out to describe the feature's pre-2026-07-11 state (see `docs/features/Vet Export.md` "Proposed Enhancements" §1 for the full comparison) — most of that doc's claims were already fixed by the 07-11 PDF rewrite, but this one is still genuinely true. Proposed: a second, service-role Edge Function (`send-vet-report`) that the client never calls directly, separate from the existing user-JWT `generate-vet-report`. Also flags that doc's "Wellness Score as primary summary" recommendation as actively wrong to build — the app retired scoring two days after the PDF rewrite shipped, in favor of Vibe + symptom count.
- [ ] **Vet Export's only entry point is a nav card buried inside "Show More"** — no prominent "Share with Vet" / "Generate Vet Report" button nearer the top of Pet Profile. See `docs/features/Vet Export.md` "Proposed Enhancements" §2.
- [ ] **Vet Export's PDF omits real, captured pet-identity fields.** `akc_registered`, `akc_registered_name`, `breeder`, `gotcha_date`/`gotcha_date_precision` all exist on `pets` (migration 0008) but aren't queried by `generate-vet-report`. See `docs/features/Vet Export.md` "Proposed Enhancements" §3.
- [ ] **Vet Export's PDF drops observation photos.** `observations.photo_url` is a real column (migration 0014), and `appetite`/`vomiting`/`other` check-in categories support attaching one — the report's observations query never selects it. Nontrivial to fix: `pdf-lib` can embed images but the current `ReportBuilder` has no image-layout support, and photos live in Storage, not the row itself. See `docs/features/Vet Export.md` "Proposed Enhancements" §4.
- [ ] **Vet Export's Weight Trend table truncates silently.** Unlike Observations and Food Logs (which show a "data truncated" note), the Weight Trend table (`slice(0, 60)`) drops anything past the most recent 60 entries with no note at all. See `docs/features/Vet Export.md` "Proposed Enhancements" §5.
- [ ] **Vet Export's PDF has no metadata section** — no app/build version, no stated time zone, no explicit reporting-period statement, no report identifier; only a bare generation date. See `docs/features/Vet Export.md` "Proposed Enhancements" §6.

---

## P4 — Minor / low-priority

- [ ] `pets.icon_name`/`pets.icon_color` were speced in the original Navigation Refresh (optional addition) but were never added — no migration creates either column; the app uses a species icon fallback instead. Confirm this was a deliberate drop next time anyone touches per-pet iconography.
- [ ] No bounce/delivery-webhook handling for Resend — re-confirmed still true as of 2026-07-18, no webhook endpoint or Resend event handling found anywhere in `supabase/functions/`.

---

## Summary

- **P0 — closed.** All six foundation docs re-verified; five corrected, four confirmed clean, none open.
- **P1 — closed.** All four items resolved: the `0006` Archive doc renamed (not deleted — it had real standalone value), CLAUDE.md's pointer fixed, the Pets draft properly reconciled into a real V3 spec rather than just relocated, and the Project-name question confirmed accurate as-is.
- **P2 — closed.** Pets, PWA, Analytics, and Vet Export all now have real, as-built specs in `docs/features/`.
- **13 P3** — up from 5. Two genuine code/data bugs surfaced while writing the new specs (the analytics `checkins_completed` undercount, now confirmed against live production data, and Vet Export's dead Wellness Overview section). Six more came from reconciling an external Vet Export review document against current code (2026-07-18): most of that document's claims turned out to already be fixed by the 2026-07-11 PDF rewrite, but email-to-vet, a prominent entry point, missing AKC/breeder/gotcha-date fields, dropped observation photos, silent Weight Trend truncation, and missing report metadata all checked out as genuinely open. Needs product decisions and/or code fixes, not doc work.
- **2 P4** — one dropped, since it only tracked a fix in the now-removed `docs/launch-punch-list.md`.

Three full tiers (P0, P1, P2) are now closed. What's left is no longer any kind of documentation gap — every P3/P4 item needs an actual product decision or code change, not writing.
