# 0058_QA_Test_Plan_And_Exit_Criteria_Specification_v1

**Status:** Approved (2026-08-19) — one item still open, see Open Questions #1
**Date:** 2026-08-19
**Related files:** `docs/testing/QA_Test_Plan.md` (new), `docs/planning/Wysker_Watch_Launch_Plan.xlsx` (Tasks 22/23/25/26, Gates 70/71), `.github/workflows/ci.yml`, `e2e/*`, `docs/foundation/0005 Design System.md` §8

## Before You Approve This

- **This isn't new scope — it's an already-tracked, already-blocking task finally getting done.** The Launch Plan xlsx's "Testing" bucket already has Task 22 ("QA test plan defined per area… Critical priority, Blocking: Yes, Not Started"), Task 23 ("Regression testing," In Progress), Task 25 ("Accessibility pass," High, Blocking: Yes, Not Started), and Task 26 ("Performance pass," Medium, Not Blocking, Not Started) — plus two formal Go/No-Go gates, Gate 70 ("Regression passed, real non-zero test count") and Gate 71 ("Accessibility passed"). This spec is what closes Tasks 22/25 and moves Task 23 from "In Progress" toward "Complete." Once you approve this, those rows in the xlsx should be updated to reflect it (per CLAUDE.md's check-off workflow — you do that edit, just flagging it exists now).
- **The full test catalog (`docs/testing/QA_Test_Plan.md`) is large — ~35 pages and 8 major flows, each with named test cases.** I wrote the whole thing now rather than a template, per your answer to the catalog-scope question. It's long because "100% pass rate" only means something against a real, complete list — a partial catalog would let you claim a pass rate that's quietly not counting most of the app.
- **One real gap I could not close from the repo alone:** the "adversarial/edge-case AI-assistant prompt set" that Launch Plan Risk row 38 ("AI Assistant quality concerns") explicitly requires as part of the QA test plan. I named it as a `[Manual]` Critical case in §5.6 of the new doc, but the actual prompt set (what specific adversarial prompts to try) needs your judgment about what "bad AI behavior" looks like for this app — it's not something I can safely author unilaterally. See Open Questions.
- **This spec changes what "Alpha-ready" requires**, specifically: it makes flipping the Playwright `e2e` CI job from advisory (`continue-on-error: true`, per spec 0055's trial period) to a required, merge-blocking check part of the Alpha Exit Criteria — not just a nice-to-have follow-up. That trial period runs through 2026-09-03; if Alpha is targeted before then, this is a real sequencing dependency worth knowing about now, not discovering at the gate.
- No Design System conflicts — this is a documentation/process deliverable, no UI changes. No duplicate or overlapping functionality found — nothing like this test plan existed before (confirmed: no `docs/testing/` directory existed prior to this spec).

## Functional Requirements

Wysker Watch needs one authoritative, living answer to "is this app actually tested, and by what?" — usable as a real pass/fail gate before Alpha, Beta, and Release, not a vague sense that things "seem to work." Today, the only testing definition is CI (lint/typecheck/unit tests/build/Edge Function tests, plus an advisory-only Playwright suite) — which covers real code correctness but doesn't touch roughly two-thirds of the app's actual pages and flows, has no accessibility check of any kind, and has no performance check of any kind.

This spec establishes:
1. A new living document, `docs/testing/QA_Test_Plan.md`, cataloging real, named test cases — automated where they exist, explicit manual steps where they don't — for every page and major flow in the app.
2. A definition of "regression testing" that ties together what CI already does and what a human still has to do by hand.
3. A definition of what an "accessibility pass" requires, including new automated tooling (none exists today).
4. An explicit, non-invented placeholder for "performance pass," since it's genuinely not scoped yet and pretending otherwise would be worse than saying so.
5. A concrete Exit Criteria checklist per stage gate (Alpha / Beta / Release), replacing "we feel ready" with a checkable list tied to the Launch Plan's own gates.

## Acceptance Criteria

- **Given** the Launch Plan's Task 22 ("QA test plan defined per area"), **when** this spec is approved, **then** `docs/testing/QA_Test_Plan.md` exists with a named test case for every page/flow inventoried, each tagged `[Playwright: file]` or `[Manual]` with priority.
- **Given** Task 23 ("Regression testing"), **when** this spec is approved, **then** the document states precisely what runs continuously (CI) versus what runs only before a gate (full manual smoke pass), and names the one concrete gap that keeps today's regression coverage incomplete (the `e2e` job being advisory, not required).
- **Given** Task 25 ("Accessibility pass"), **when** this spec is approved, **then** the document defines both an automated check (new `@axe-core/playwright` integration) and a manual checklist, and states exactly what each catches that the other doesn't.
- **Given** Task 26 ("Performance pass"), **when** this spec is approved, **then** the document states plainly that no performance testing exists yet, why that's acceptable for now (Medium priority, non-blocking per the Launch Plan), and when it becomes required.
- **Given** a stage-gate decision (Alpha/Beta/Release), **when** someone consults this document, **then** they get a literal checklist, not prose, of what must be true to pass that gate.

## Test Plan

This spec is itself a documentation deliverable, so its own "test plan" is about verifying the deliverable's accuracy, not app behavior:

- "Every existing Playwright spec file is correctly attributed to its test case(s)" → not Playwright-testable (it's a claim about documentation accuracy) — verified by cross-referencing `docs/testing/QA_Test_Plan.md` §5 against the actual contents of each file in `e2e/*.spec.js` (done during this spec's investigation; recommend a spot-check by you or Claude Code before merge, since a wrong attribution here would falsely claim coverage that doesn't exist).
- "The accessibility automated-check section is technically buildable as described" → not yet implemented in this spec (this is a spec, not the implementation) — the actual `e2e/accessibility.spec.js` + `@axe-core/playwright` addition is follow-up implementation work, itself requiring its own Playwright test run to prove it works, per the "running the Test Plan's Playwright tests is required before considering the work done" rule already in this skill's own conventions.
- **Seeding/access constraints:** none for the document itself. The `[Manual]` cases catalogued inside it that touch admin-only or destructive flows (Delete Account, admin route gating, co-owner conflict resolution requiring two real sessions) are flagged as such inside the document — they're a constraint on *running* the test plan, not on writing it.

## Visual Reference

Not applicable — documentation/process deliverable, no UI, no mockups provided or needed.

## Technical Spec

- **Schema:** none.
- **Components/files touched:**
  - `docs/testing/QA_Test_Plan.md` — new file, the living deliverable itself (already drafted, see linked file).
  - Future implementation work this spec identifies but does not itself build: `e2e/accessibility.spec.js` (new) + `@axe-core/playwright` (new devDependency) for §4's automated accessibility scan.
  - `.github/workflows/ci.yml` — this spec's Exit Criteria (§2.1 of the new doc) requires the existing `e2e` job's `continue-on-error: true` to be removed and the job added to required branch-protection checks. That's a GitHub repo-admin action only you can perform (same category as spec 0055's own deferred manual steps), and is contingent on the 2026-09-03 trial period closing clean per spec 0055 — not something this spec does itself.
- **API / edge functions:** none.
- **Design System compliance:** not applicable — no UI/component changes, documentation-only. (Confirmed: read `docs/foundation/0005 Design System.md` in full, including its 2026-07-30 Amendments; nothing in this spec touches rendered UI.)
- **Constraints from CLAUDE.md / locked decisions:**
  - Respects "Lynn edits the Launch Plan xlsx herself" — this spec does not modify `Wysker_Watch_Launch_Plan.xlsx`; it names the exact rows (Tasks 22/23/25/26, Gates 70/71) that should be updated once you've reviewed this, for you to do yourself per the existing check-off workflow.
  - Respects "e2e always targets `wysker-watch-dev`, never staging/prod" — every `[Manual]` case in the new doc that involves creating/deleting real data (Delete Account, Reset Test Account, co-owner conflict testing) implicitly assumes it's run against `wysker-watch-dev` or a designated test account, consistent with existing e2e convention; the document doesn't introduce a new environment.
  - Respects the existing spec-numbering and `docs/features/` convention (this file, `0058_...`) while placing the actual living test-plan artifact in a new `docs/testing/` directory — deliberate, explained in the new doc's §6, mirroring how `docs/foundation/` already holds cross-cutting (not per-feature) documents separately from `docs/features/`.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** none found. No `docs/testing/` directory or equivalent test-plan document existed before this spec. The closest prior art, `docs/launch-punch-list.md`, was already retired per CLAUDE.md ("removed... treat any reference to those filenames elsewhere as stale") before this spec started.
- **Technical debt nearby:** the `e2e` CI job's `continue-on-error: true` (spec 0055's deliberate trial period, through 2026-09-03) is the single biggest gap between "CI is green" and "regression testing actually blocks a bad merge" today. This spec doesn't fix it — flipping it is a GitHub-admin action — but makes it an explicit, named Exit Criteria item instead of an easy-to-forget follow-up.
- **Orphaned features nearby:** none found relevant to this spec.
- **Punch list / known issues in this area:** Launch Plan Risk row 38 ("AI Assistant quality concerns") already calls for an "adversarial/edge-case prompt set… required in the QA test plan" — captured as an open, unresolved `[Manual]` case in the new doc (§5.6) rather than invented content, since the actual prompt content needs your judgment (see Open Questions). The `login.spec.js` intermittent flake (Launch Plan Task 21, spec 0046) is inherited as-is — this spec doesn't change its status, just notes it as the named reason `e2e` is still advisory today.

## Non-Goals

- **Building the automated accessibility scan itself** (`e2e/accessibility.spec.js`, `@axe-core/playwright`). This spec defines what it must do and catch; building and landing it is follow-up implementation work, not part of this spec.
- **Building Lighthouse CI or any performance-testing mechanism.** Explicitly deferred per your answer — §7 of the new doc records it as a placeholder, not a build.
- **Writing the actual adversarial AI prompt set.** Named as a required, unresolved `[Manual]` case — the specific prompts need your input, not invented here (see Open Questions).
- **Flipping the `e2e` CI job to required/blocking.** A GitHub branch-protection settings change only you can make, and gated on the 2026-09-03 trial period closing clean per spec 0055 — named as an Exit Criteria dependency, not performed by this spec.
- **Updating the Launch Plan xlsx.** Per CLAUDE.md convention, that's your edit to make; this spec identifies exactly which rows it affects.
- **Retroactively running every `[Manual]` case right now.** This spec establishes the catalog; actually executing the full manual smoke pass happens at the next real gate transition, per §2/§3 of the new doc.

## Open Questions

1. **Still genuinely open — the adversarial/edge-case AI prompt set (§5.6 of the new doc, Launch Plan Risk row 38) has no content yet.** You confirmed (2026-08-19) you haven't decided what to do here. The case stays in the catalog as `[Manual, Critical, content TBD]` — it is a real blocker for the Accessibility/Regression gates being honestly called "100% pass" until it's resolved, but it does not block approving the rest of this document. Revisit before the Alpha gate is actually scheduled.
2. **Resolved for now — no Alpha date exists yet (confirmed 2026-08-19), so the 2026-09-03 e2e-trial-period timing conflict flagged above is not an active conflict.** Re-check this once a real Alpha date is set: if it lands before 2026-09-03, the `e2e`-required Exit Criteria item (§2.1) will need either a delay or an explicit, recorded one-time exception — decide at that point, don't default silently.
3. **Resolved — you (Lynn) are the one running `[Manual]` cases, confirmed 2026-08-19, possibly with occasional help but plan for solo.** §3's "full manual smoke pass before every gate" in the new doc is a real, single-person time cost every gate transition — worth budgeting for explicitly when a gate date is set, not treated as instantaneous.
