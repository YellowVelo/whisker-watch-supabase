# Documentation Review Punch List (2026-07-18)

Full re-audit. Everything below was re-verified fresh against the current
repo state (`git log` confirms no source code changed since the last
pass — only docs) rather than carried over from the prior version of this
list. Two kinds of items live here: **doc-hygiene** items (a doc is wrong,
stale, or misplaced) and **product/code** items (something real was
discovered while checking docs against code — a bug, an unwired feature,
an architecture question). Check items off as they're resolved; add new
ones at the bottom of their tier.

Related reading: `docs/audit-2026-07-14.md` and `docs/feature-triage-2026-07-14.md`
(earliest audit/triage), `docs/feature-triage-2026-07-18.md` (current
`docs/features/` triage — 10 CURRENT, 4 STALE-at-the-time, all 4 since
reconciled), `docs/launch-punch-list.md` (separate, launch-focused punch
list — a couple of items below cross-reference it rather than duplicate it).

---

## P0 — Foundation docs factually wrong (treated as ground truth, never double-checked)

**Closed this pass.** All six foundation docs with concrete, checkable
implementation claims were re-verified against code and schema; five
needed real fixes and all five were corrected (committed `da6bb8d`):

- [x] `docs/foundation/0007 Data Model_V2.md` — retired status enum and a dead `wellness_scores` table were both described as live. Fixed throughout (schema table, relationships diagram, §7, §8, Summary).
- [x] `docs/foundation/0008 Navigation & Information Architecture_V4.md` — described a "Pet Profiles" Menu directory and `WellnessCard`/`CheckInCard` components that **don't exist anywhere in the codebase** (no route, no component file), a 5-ring Pet Profile header, a wrong Menu item list (missing Pet Sitter/AI/Terms of Service), and a wrong description of what the Trends screen's "Trends" sub-tab actually shows. Extensively rewritten.
- [x] `docs/foundation/0006 Technical Standards.md` — asserted "TypeScript for all frontend code" (false — no `tsconfig.json`), described Capacitor/native mobile as current architecture (false — it's the #1 unstarted App Store blocker per `docs/launch-punch-list.md` P1), and said the frontend deploys to Netlify/Vercel (false — it's Cloudflare Workers). All corrected.
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
- [ ] **Vet Export has no doc anywhere**, and per `docs/launch-punch-list.md` P4 it's fully built but not linked from the UI (`CareMenu.jsx` has no entry pointing to it).
- [ ] **PWA install flow (manifest, iOS/Chromium install banners) has no doc anywhere** — only mentioned in passing in `docs/audit-2026-07-14.md` and `docs/launch-punch-list.md`.
- [ ] **`app_opened` event + nightly analytics rollup (migrations 0023/0024) has no doc anywhere.** The base `analytics_events` table is documented in the Data Model doc; the rollup and the event itself aren't.

---

## P3 — Real product/code gaps discovered while reviewing docs (not doc problems themselves)

Re-confirmed against current code — nothing here changed since no source files were touched this session:

- [ ] **Timeline mislabels every non-skipped check-in.** `src/lib/checkin/petProfileClient.js:126` — `getTimelineEvents()` titles a check-in event using `c.status === 'normal' ? … : …`. `'normal'` hasn't been a live status value since migration 0026, so this condition never matches — every Great Day currently shows as "changes logged" on the Timeline, identical to an Off/Tough Day. A genuine code bug, not a doc issue.
- [ ] **Three of five email templates are fully built but never triggered.** `welcome`, `verify-email`, and `password-reset` (`supabase/functions/_shared/email/templates/`) have zero callers anywhere in `supabase/functions/`. If real signup/verify/reset emails go out today, they're coming from Supabase Auth's own built-in email system, not this branded one. Needs a product decision: wire these up, or drop them from the spec as intentionally out of scope.
- [ ] **Health Records / Bloodwork and lab results never appear on the Timeline**, despite being a real, separate, shipped feature. `getTimelineEvents()` only assembles check-ins, medication starts, vaccinations, and symptom logs.
- [ ] **"Contextual Alerts" (medication due, vaccination due, weight decreased from baseline, no check-in today) was speced in the original Navigation Refresh but was never built at all** — confirmed via full-codebase grep, no matching UI or copy exists anywhere. Needs a product decision: build it, or formally drop it (both `docs/features/0004 Navigation RefreshV2.md` and the newly-corrected `docs/foundation/0008 Navigation & Information Architecture_V4.md` now document this accurately as "never implemented," but the underlying feature gap itself is still open).
- [ ] **The standalone `/pet/:petId` Pet Profile page is effectively orphaned from primary navigation.** Tapping a pet card on Home or Pets goes to Trends, not Pet Profile; Pets' "Show More" expands Pet Profile content inline instead. The only real entry points are the post-Pet-Onboarding "start check-in" link and the accept-co-owner-invite redirect. Worth a product check-in: is this intentional, or should there be a more discoverable path to it?

---

## P4 — Minor / low-priority

- [ ] `pets.icon_name`/`pets.icon_color` were speced in the original Navigation Refresh (optional addition) but were never added — no migration creates either column; the app uses a species icon fallback instead. Confirm this was a deliberate drop next time anyone touches per-pet iconography.
- [ ] `docs/launch-punch-list.md` line 26 still lists "`manifest.json` is missing" as an open P1 item — already resolved (`vite-plugin-pwa` auto-generates it as of the 2026-07-11 PWA commit). This is a checkbox in a different file; noting it here doesn't fix it there.
- [ ] No bounce/delivery-webhook handling for Resend — already tracked as its own item in `docs/launch-punch-list.md` P2; re-confirmed still true, not a new finding.

---

## Summary

- **P0 — closed.** All six foundation docs re-verified; five corrected, four confirmed clean, none open.
- **P1 — closed.** All four items resolved: the `0006` Archive doc renamed (not deleted — it had real standalone value), CLAUDE.md's pointer fixed, the Pets draft properly reconciled into a real V3 spec rather than just relocated, and the Project-name question confirmed accurate as-is.
- **3 P2** — down from 4; Pets is now documented. Vet Export, PWA, and the analytics rollup still have zero documentation and need actual writing, not just verification.
- **5 P3** — unchanged, real product/code gaps, one a genuine bug (Timeline status-label check). Needs product decisions and/or code fixes, not doc work.
- **3 P4** — low-priority; one is literally just a different file's unchecked checkbox.

Two full tiers (P0, P1) are now closed. What's left is no longer "re-verify and fix" work — P2 needs specs written from scratch for features that were never documented at all, and P3 needs actual product decisions or code changes, not documentation.
