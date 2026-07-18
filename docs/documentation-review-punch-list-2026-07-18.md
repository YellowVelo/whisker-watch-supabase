# Documentation Review Punch List (2026-07-18)

Everything found across this session's documentation audit, the
`docs/features/` triage, and the four reconciled rewrites (Pet Profile,
Navigation Refresh, Trends, Email). Two kinds of items live here:
**doc-hygiene** items (a doc is wrong, stale, or misplaced) and **product/
code** items (something real was discovered while checking docs against
code — a bug, an unwired feature, an architecture question). Check items
off as they're resolved; add new ones at the bottom of their tier.

**Update (2026-07-18, batch pass):** after this list was first written, a
second pass fixed every foundation doc against a single verified reference
of cross-cutting facts (status enum, routing/entry-point map, Menu items,
email triggers, Trends structure) instead of continuing to fix one feature
doc at a time — see the note at the bottom of P0 and the P1 checkbox below.
The four superseded doc versions are now retired to `docs/Archive/`. Items
still open are unchanged; new findings from the batch pass are folded into
the relevant tier below.

Related reading: `docs/audit-2026-07-14.md` (predecessor audit),
`docs/feature-triage-2026-07-14.md` and `docs/feature-triage-2026-07-18.md`
(prior triage passes), `docs/launch-punch-list.md` (separate, launch-focused
punch list — a couple of items below cross-reference it rather than
duplicate it).

---

## P0 — Foundation doc is factually wrong (treated as ground truth, never double-checked)

- [x] **`docs/foundation/0007 Data Model_V2.md` documented a retired status enum and a dead table as if both were live.** Fixed in place (2026-07-18): `daily_check_ins.status` corrected to `great`/`off`/`tough`/`skipped`, `symptom_count` column added to the schema description, `wellness_scores` (§3.19) rewritten to state clearly it's dead/unused schema (no more `computeDayScore`/`computeTrend`, both gone from `scoring.js`), and every downstream reference (relationships diagram, §7 "Two Logging Systems," §8 AI Integration, Summary) updated to match. This was the single highest-risk item in the whole review, since CLAUDE.md tells every session foundation docs are "locked" and "safe to treat as ground truth."
- [x] **Checking this doc surfaced that three more foundation docs had the same problem, at a larger scale.** Rather than fix them one at a time and risk the same incremental drift, all three were corrected in the same batch pass (2026-07-18), against one verified reference of cross-cutting facts instead of re-deriving them per file:
  - `docs/foundation/0008 Navigation & Information Architecture_V4.md` was the worst of the three — it described a "Pet Profiles" Menu directory, `WellnessCard`/`CheckInCard` components, and a 5-ring Pet Profile header, **none of which exist anymore** (no route, no component files). Also had a wrong Menu item list (missing Pet Sitter/AI/Terms of Service), a wrong description of the Trends screen's "Trends" sub-tab (claimed it showed legacy `symptom_logs` charts; it shows real current data), and claimed a calendar button/overflow menu on the Trends header that was never built. Extensively rewritten.
  - `docs/foundation/0006 Technical Standards.md` asserted "TypeScript for all frontend code" (false — no `tsconfig.json`, frontend is almost entirely `.js`/`.jsx`), described Capacitor/native mobile as current architecture (false — per `docs/launch-punch-list.md` P1, it's the #1 unstarted App Store blocker), and said the frontend deploys to "Netlify/Vercel" (false — it's Cloudflare Workers, per `wrangler.jsonc` and CLAUDE.md). All three corrected.
  - `docs/foundation/0009 Terminology.md` still defined the Daily Check-In's core vocabulary using the original, twice-retired pre-Vibe model ("Today was normal" / "Something changed" / "Skip today"), labeled Co-Owner as "(future)" despite having shipped over a week earlier, and labeled Health Score as "(future)" despite it having been built, twice, and then retired. All corrected to the current Vibe/Symptom-Count vocabulary.
  - `docs/foundation/0005 Design System.md` and `docs/foundation/0010 UX flow_V1.txt` had smaller issues (stale "Whisker Watch" brand name; a flow diagram showing "tap pet card → Pet Profile" from Home, which is wrong — it goes to Trends) — both fixed.
  - `docs/foundation/0001–0004 (Product Context/Vision/Principles/UX Principles)` were checked and found genuinely accurate — durable/philosophical content with no concrete implementation claims to contradict.

---

## P1 — Doc hygiene: collisions, wrong pointers, misfiled candidates

- [ ] **Filename collision:** `docs/features/0006 Pet Delete Test and Demo Accounts V2.md` and `docs/Archive/0006 Pet Delete Test and Demo Accounts V2.md` are two different documents with the identical name. The Archive one ("Pet Management – Add Pet Expansion," an intermediate reconciliation note) reads as authoritative but isn't the real spec. Rename or delete the Archive copy.
- [ ] **CLAUDE.md's own canonical-spec pointer resolves into the wrong folder.** It names `/docs/features/0012_DailyCheckIn_Vibe_Trends_Specification_v5.txt` — that `.txt` file lives in `docs/Archive/` (byte-identical today to the real `docs/features/…v5.md`, but CLAUDE.md's own rule says never build against Archive). Fix the path in CLAUDE.md, or delete the Archive duplicate so there's only one copy to drift.
- [ ] **A reconciled-looking Pets spec is sitting in Archive instead of features.** `docs/Archive/0008 Pets Feature SpecificationV2.md` is labeled "Ready for Implementation" and has zero stale Wellness Score references — unlike every other Archive doc. Every other screen got a real reconciled doc moved to `docs/features/` in the 2026-07-18 reorg; Pets didn't. Human review needed: confirm this draft is actually current before promoting it (it reads "Ready for Implementation," i.e. forward-looking, not "as-built" — may still need reconciliation work, not just a move).
- [x] **Now-superseded doc versions were sitting in `docs/features/` alongside their replacements**, recreating the exact "which one is real" risk flagged above. Resolved 2026-07-18 — moved to `docs/Archive/` via `git mv` (history preserved):
  - `0009 Pet Profile Feature V3.md` (superseded by `…V4.md`)
  - `0004 Navigation Refresh.md` (superseded by `…V2.md`)
  - `0010 Trends Feature SpecificationV4.md` (superseded by `…V5.md`)
  - `0014 Email Send Feature.txt` (superseded by `…V2.md`)

  `docs/features/` now contains exactly one version of each of these four specs.

---

## P2 — Undocumented shipped features

- [ ] **Pets screen (`src/pages/Pets.jsx`) has no current doc.** See the P1 Archive-misfile item above — likely the fastest fix in this whole list if that draft turns out to be genuinely current.
- [ ] **Vet Export has no doc anywhere**, and per `docs/launch-punch-list.md` P4 it's fully built but not linked from the UI (`CareMenu.jsx` has no entry pointing to it). Worth writing up together with whatever UI-linkage decision resolves that punch-list item.
- [ ] **PWA install flow (manifest, iOS/Chromium install banners) has no doc anywhere** — only mentioned in passing in `docs/audit-2026-07-14.md` and `docs/launch-punch-list.md`.
- [ ] **`app_opened` event + nightly analytics rollup (migrations 0023/0024) has no doc anywhere.** The base `analytics_events` table is documented in the Data Model doc; the rollup and the event itself aren't.

---

## P3 — Real product/code gaps discovered while reviewing docs (not doc problems themselves)

- [ ] **Timeline mislabels every non-skipped check-in.** `src/lib/checkin/petProfileClient.js:126` — `getTimelineEvents()` titles a check-in event using `c.status === 'normal' ? 'Daily check-in — everything normal' : … 'Daily check-in — changes logged'`. `'normal'` hasn't been a live status value since migration 0026 (it's `great`/`off`/`tough` now), so this condition never matches — **every Great Day shows as "changes logged" on the Timeline**, identical to an Off/Tough Day. Found while reconciling `0004 Navigation RefreshV2.md`; this is a code bug, not a doc issue — flagging here since it surfaced during the review rather than a dedicated code audit.
- [ ] **Three of five email templates are fully built but never triggered.** `welcome`, `verify-email`, and `password-reset` exist as complete template files (`supabase/functions/_shared/email/templates/`) with zero callers anywhere in `supabase/functions/`. If real signup/verify/reset emails go out today, they're coming from Supabase Auth's own built-in email system, not this branded one — meaning new users likely never get a branded "Welcome to Wysker Watch" email. Needs a product decision: wire these up (and decide whether they replace or supplement Supabase Auth's own emails for those flows), or drop them from the spec as intentionally out of scope.
- [ ] **Health Records / Bloodwork and lab results never appear on the Timeline**, despite being a real, separate, shipped feature (the Bloodwork tab). Found while reconciling `0010 Trends…V5.md`'s sibling doc review; `getTimelineEvents()` only assembles check-ins, medication starts, vaccinations, and symptom logs.
- [ ] **"Contextual Alerts" (medication due, vaccination due, weight decreased from baseline, no check-in today) was speced in the original Navigation Refresh but never built at all** — confirmed via full-codebase grep, no matching UI or copy exists anywhere. Needs a product decision: build it, or formally drop it from the spec (currently corrected to say "never implemented" in `…V2.md`, but the underlying feature gap is still open).
- [ ] **The standalone `/pet/:petId` Pet Profile page is effectively orphaned from primary navigation.** Tapping a pet card on Home or Pets goes to Trends, not Pet Profile; Pets' "Show More" expands Pet Profile content inline rather than navigating to this route. The only real entry points are the post-Pet-Onboarding "start check-in" link and the accept-co-owner-invite redirect. Worth a product check-in: is this intentional (a niche/legacy route kept alive by two flows), or should there be a more discoverable path to it?

---

## P4 — Minor / low-priority

- [ ] `pets.icon_name`/`pets.icon_color` were speced in the original Navigation Refresh (as an optional addition) but were never added — no migration creates either column; the app uses a species icon (Dog/Cat) fallback instead. Low stakes; just confirm this was a deliberate drop, not an oversight, next time anyone touches per-pet iconography.
- [ ] `docs/launch-punch-list.md` line 26 still lists "`manifest.json` is missing" as an open P1 item — already resolved (`vite-plugin-pwa` auto-generates it as of the 2026-07-11 PWA commit; `docs/audit-2026-07-14.md` already flagged this). Left unchecked here deliberately — this is a checkbox in a different file (`launch-punch-list.md`), not this one; noting it here doesn't fix it there.
- [ ] No bounce/delivery-webhook handling for Resend — already tracked as its own item in `docs/launch-punch-list.md` P2; re-confirmed still true during the Email doc reconciliation, not a new finding, just noting the cross-reference here so it isn't logged twice.

---

## Summary

- **P0 — resolved.** All six foundation docs with concrete implementation claims were checked; five needed fixes (Data Model, Navigation & IA, Technical Standards, Terminology, Design System/UX flow) and all five were corrected in this batch pass. Four docs (Product Context, Vision, Principles, UX Principles) were checked and confirmed accurate.
- **4 P1** — one resolved this pass (superseded doc versions retired to Archive). Three still open: the `0006 …V2.md` filename collision, CLAUDE.md's canonical-spec pointer resolving into Archive, and the misfiled Pets draft.
- **4 P2** — still open, untouched by this pass (Pets screen, Vet Export, PWA, analytics rollup all still undocumented).
- **5 P3** — still open, untouched by this pass (Timeline status-label bug, 3 unwired email templates, Timeline missing Health Records, Contextual Alerts never built, Pet Profile's narrow entry points).
- **3 P4** — still open (icon columns, manifest.json checkbox lives in a different file, bounce webhook tracked in launch-punch-list.md).

The 10 feature docs already marked CURRENT in `docs/feature-triage-2026-07-18.md` were also spot-checked against the corrected foundation docs for cross-doc contradictions (routing targets, Menu item list, email triggers) — none found; their CURRENT verdicts hold.

Next fastest wins: the three remaining P1 items (rename/delete the Archive `0006` duplicate, fix CLAUDE.md's spec pointer, decide on the misfiled Pets draft) are all cheap, zero-research cleanup. P2/P3 need actual writing or product decisions, not just verification.
