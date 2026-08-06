# 0046_E2E_Onboarding_Step_Transition_Flakiness_Specification_v1

**Status:** Implemented
**Date:** 2026-08-04
**Related files:** `e2e/pet-edit-conditions.spec.js`, `e2e/add-pet.spec.js`, `e2e/onboarding.spec.js`, `e2e/fixtures.js`, `src/pages/PetOnboarding.jsx`, `src/components/onboarding/PetInfoCard.jsx`, `src/lib/onboardingClient.js`, `playwright.config.js`, `docs/features/0045_FullScreen_Overlay_Dialog_Role_Specification_v1.md`

## Before You Approve This

- **The `login.spec.js` half of this couldn't actually be investigated — there's nothing to investigate yet.** I ran the full Playwright suite twice (about 10 minutes of real runs against `wysker-watch-dev`) specifically trying to catch it failing again. Both runs passed 31/31, with no failure in either `login.spec.js` or `pet-edit-conditions.spec.js`. Last session's note only wrote down *what* failed for `pet-edit-conditions.spec.js` ("Step 2 of 6" not appearing) — it never captured what `login.spec.js`'s failure actually was. Without a real error message or stack trace from a failing run, guessing at a fix for `login.spec.js` risks "fixing" the wrong thing. This spec proposes closing out the part with real evidence (the Step-2 timeout) and leaving `login.spec.js` as an explicit open item to capture next time it happens, not a guessed-at fix.
- **The same fragile wait exists in three files, not one.** The exact assertion that timed out (`expect(page.getByText('Step 2 of 6')).toBeVisible()`, waiting on the pet-creation-to-wizard transition) is copy-pasted in `pet-edit-conditions.spec.js`, `add-pet.spec.js`, and `onboarding.spec.js`. Fixing only the file named in the flake report would leave the other two exposed to the exact same intermittent timeout later. This spec fixes all three from one shared place instead.
- No Design System conflicts (this is test infrastructure, no UI changes) and no conflicts with any CLAUDE.md locked decision.

## Functional Requirements

This is a test-reliability fix, not a user-facing feature — "functional requirements" here describe what the *test suite* should reliably do:

1. When a Playwright test creates a new pet and clicks "Continue," the test should reliably detect that the onboarding wizard's second step ("Step 2 of 6") has loaded, without occasionally timing out even though the page genuinely did load correctly — just a little slower than usual.
2. The next time `login.spec.js` fails during a full-suite run, there should be enough information captured (the actual error, not just "it failed") to diagnose it for real, instead of relying on a vague memory of "it was flaky once."

## Acceptance Criteria

- **Given** a test clicks "Continue" after filling out a new pet's info, **when** the app is doing its normal (sometimes slower than usual) work of saving the pet and loading its onboarding page, **then** the test should wait long enough to reliably see "Step 2 of 6" appear, rather than failing just because the app took a bit longer than a fixed default allows.
- **Given** the same wait exists in three different test files today, **when** this fix lands, **then** all three should get the fix the same way, from one shared place, so a future change to this wait doesn't require remembering to update three files by hand.
- **Given** `login.spec.js` fails again in some future full-suite run, **when** that happens, **then** whoever's looking at it should be able to see the actual Playwright error/trace for that run (this is already true today via Playwright's built-in `trace: 'retain-on-failure'` — this spec doesn't change that, just confirms it's already sufficient and documents where to look).

## Test Plan

- "Test reliably detects Step 2 of 6, even when the app is a bit slower than usual" → covered by the existing tests themselves (`add-pet.spec.js`, `onboarding.spec.js`, `pet-edit-conditions.spec.js` all already assert on "Step 2 of 6" reaching visibility) — this spec doesn't add a new test, it makes the existing assertion's timeout realistic instead of the current 5s Playwright default. Verified by running the full suite twice after the change (same as the investigation above) and confirming all 31 tests still pass.
- "All three files get the fix from one shared place" → verified by code review of the diff: `add-pet.spec.js`, `onboarding.spec.js`, and `pet-edit-conditions.spec.js` should all call the same new helper, not each define their own timeout value.
- "login.spec.js's next failure is diagnosable" → not independently testable (we can't force a genuine intermittent failure on demand — see "Before You Approve This"). Confirmed instead by inspection: `playwright.config.js` already sets `trace: 'retain-on-failure'`, so any future failure already saves a full trace automatically. No test needed; documenting this in the punch list is the actual deliverable for this criterion.
- **Seeding/access constraints:** none — everything here is reachable via the existing `test1@` signed-in session already used by the suite.

## Visual Reference

None provided — this is a test-infrastructure fix with no UI.

## Technical Spec

- **Schema:** none.
- **Components/files touched:**
  - `e2e/fixtures.js` — add one new exported helper, e.g. `waitForOnboardingStep(page, stepText)`, wrapping `expect(page.getByText(stepText)).toBeVisible({ timeout: 15000 })` with a comment explaining *why* 15s: the transition this waits on is genuinely 3-4 sequential real network round-trips to `wysker-watch-dev` (`Pet.create` → navigate → `Pet.get` → `getOrCreatePetOnboarding`'s `filter` + possible `create`, see `src/pages/PetOnboarding.jsx:26-31` and `src/lib/onboardingClient.js`), not a single request — Playwright's 5s default assumes something closer to one round-trip.
  - `e2e/add-pet.spec.js`, `e2e/onboarding.spec.js`, `e2e/pet-edit-conditions.spec.js` — replace each file's own `expect(page.getByText('Step N of 6')).toBeVisible()` call (all step-transition waits, not just "Step 2 of 6" — `onboarding.spec.js` has the same pattern for "Step 4 of 6" and "Step 5 of 6") with the shared helper.
  - `playwright.config.js` — **not changed.** Considered bumping the global default `expect` timeout instead of a targeted helper, but that would quietly loosen every assertion in the suite, including ones that should legitimately fail fast. A targeted fix for the one confirmed slow path is safer than a blanket change.
- **API / edge functions:** none.
- **Design System compliance:** not applicable — no UI/component changes, test-only.
- **Constraints from CLAUDE.md / locked decisions:** none conflicted. Consistent with the existing `e2e/fixtures.js` pattern of centralizing shared waits (`dismissAnyOpenSheet`) rather than duplicating them per-file.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** yes — see "Before You Approve This." The `expect(page.getByText('Step N of 6')).toBeVisible())` wait pattern is duplicated across three spec files with no shared helper. This spec consolidates it.
- **Technical debt nearby:** none new introduced by this fix. The underlying multi-round-trip page load (`PetOnboarding.jsx`'s `load()`) is not being changed — this spec only makes the *test's* wait realistic, it doesn't attempt to make the app itself load faster, since there's no evidence the current load time is actually a problem for real users (this only surfaced as a test-timeout edge case).
- **Orphaned features nearby:** none found.
- **Punch list / known issues in this area:** none currently tracked — the flakiness exists today only as a footnote inside spec 0045's docs (`docs/features/0045_FullScreen_Overlay_Dialog_Role_Specification_v1.md:76`), not as its own punch-list item. Once this spec is approved and implemented, recommend adding a resolved punch-list entry so it's tracked the same way other fixes are, and updating that footnote to point at this spec.

## Non-Goals

- Not attempting to make `PetOnboarding.jsx`'s actual page-load faster — no evidence real users are affected, only that a fixed 5s test-assertion timeout is sometimes too tight for a multi-round-trip page load.
- Not enabling suite-wide `retries` in `playwright.config.js` — that would mask this specific timing issue (fixed here directly) and also mask unrelated real regressions elsewhere in the suite.
- Not fixing `login.spec.js` — there's no captured evidence of what actually failed there (see "Before You Approve This").

## Open Questions

- **What actually fails in `login.spec.js`?** Unresolved — needs a real failure captured (error message + Playwright trace, which `trace: 'retain-on-failure'` already saves automatically) the next time it happens, rather than being guessed at now. Recommend leaving this as its own punch-list item rather than closing it out alongside the Step-2 fix.
