# 0042_CheckIn_Observation_Cleanup_Regression_Test_Specification_v1

**Status:** Implemented and verified 2026-08-03
**Date:** 2026-08-02
**Related files:** `supabase/migrations/0034_save_daily_check_ins.sql`, `src/lib/checkin/checkinClient.js`, `src/lib/checkin/checkinClient.persistence.test.js`, `.github/workflows/ci.yml`, `supabase/tests/save_daily_check_ins.test.ts`

## Before You Approve This

- The existing automated tests for this code (`checkinClient.persistence.test.js`) already state, in their own comments, that clearing old entries before writing new ones is "the RPC's job, not this JS code's" — but **no test anywhere actually checks that the real database function does this.** The existing tests fake out ("mock") the database entirely, so they can't see this behavior at all. That's the exact gap this spec closes.
- I checked whether a stricter database rule ("never allow two entries for the same day+category") would be a cleaner fix. It wouldn't — the app legitimately writes multiple entries for one category on one day when an owner logs more than one symptom in that category (e.g. both "diarrhea" and "blood" under Bathroom). A blanket rule like that would incorrectly block real, correct data. Ruled out.
- While reading this code I noticed one small unrelated leftover — a function called `describeObservation` that doesn't appear to be called anywhere in the actual app anymore, only in its own test. Flagging for visibility; not part of this fix.
- No conflicts found with any locked decision in CLAUDE.md, and no UI changes at all, so no Design System review applies.

## Functional Requirements

When someone saves a pet's day — whether logging it for the first time or updating a day that was already logged — the app must end up storing only the current, correct symptom information for that day. Nothing from a previous, now-outdated version of that entry should be left behind (e.g. correcting a day's entry from "vomiting + diarrhea" down to "vomiting only" must not leave a leftover, invisible "diarrhea" entry behind).

This already works correctly today. This change adds a permanent, automatic check that keeps confirming it *stays* working correctly as the app continues to change — a "tripwire," not a behavior change.

## Acceptance Criteria

- **Given** a pet's day has already been saved with symptoms, **when** that same day is saved again with different symptoms, **then** looking at that day's stored data afterward shows only the newly saved symptoms — nothing left over from the previous save.
- **Given** a pet's day is saved with two symptoms in the same category (the legitimate multi-symptom case), **when** that day is saved again with only one symptom in that category, **then** the removed symptom is gone from storage, not sitting alongside the new answer.
- **Given** this automatic check exists, **when** a future code change accidentally removes the "clear old entries first" step, **then** the required automated test suite fails on that change, before it can be shipped.

## Test Plan

- AC1 → New integration test that calls the real `save_daily_check_ins` database function directly against a real database (not the app's mocked unit tests) — see Seeding/access constraints.
- AC2 → Same test, extended with the multi-symptom-then-reduced scenario.
- AC3 → Structural: this test is added to the same required CI check that already blocks merges to `main`, so a future regression fails the build, not just a future test run someone forgets to check.
- **Seeding/access constraints:** This needs to create and then destroy real rows in `wysker-watch-dev`'s real database — a normal signed-in user session can do this (saving a check-in for your own pet is an ordinary user action, not an admin-only one), so this reuses the existing `test2@` dev account and its existing test pet, the same account/pattern already used by `delete-pet`/`delete-account`'s integration tests. The test must clean up the check-in it creates afterward so it doesn't leave clutter behind in the dev database.

## Visual Reference

Not applicable — no UI change.

## Technical Spec

- **Schema:** None. No migration — this only adds a test, it does not change `save_daily_check_ins` itself.
- **Components/files touched:** A new test file exercising the real RPC over a live connection (Deno, matching the existing pattern in `supabase/functions/delete-pet/index.test.ts` / `delete-account/index.test.ts`, since those already prove out "call a real Supabase project from a test" in this repo) — open question below on exact placement, since this is testing a database function directly rather than an Edge Function.
- **API / edge functions:** None changed. The test calls the existing `save_daily_check_ins` function the same way `checkinClient.js` already does.
- **CI:** `.github/workflows/ci.yml` needs this new test wired into the required `edge-functions` job (or a new job) so it actually blocks merges, not just exists.
- **Design System compliance:** Not applicable — no UI.
- **Constraints from CLAUDE.md / locked decisions:** None violated. This reinforces the existing "prior observations are cleared first" rule already documented in `checkinClient.js`'s own comments — doesn't touch the Vibe/Symptom Count model at all.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** None. No existing test currently checks the real database function's behavior — the current suite mocks it out entirely and defers the guarantee to "the RPC," untested.
- **Technical debt nearby:** None newly introduced. (The bulk-chunking behavior from spec 0016 is a separate, already-covered concern — not touched here.)
- **Orphaned features nearby:** `describeObservation()` in `checkinClient.js` — appears unused outside its own test file. Noted, not addressed here.
- **Punch list / known issues in this area:** This *is* the punch-list item "Direction-read defense-in-depth ... is a safety net, not a guarantee." Implementing this resolves it via the automated-test approach (as opposed to the database-permission-lockdown alternative that was considered and set aside during scoping).

## Non-Goals

- Does not add a database-level rule restricting how many entries can exist per category per day — investigated and rejected (would break legitimate multi-symptom logging).
- Does not address the separate "silent overwrite" issue found during scoping (one person's save silently overwriting another's, including the co-owner scenario) — real, but a different problem, covered instead by spec 0043.
- Does not change `save_daily_check_ins`, `checkinClient.js`, or any save/UI behavior — this is a test-only addition.

## Open Questions

None remaining — both resolved during implementation (2026-08-03). The test lives in a new `supabase/tests/` directory (a Deno test, matching the existing Edge Function integration-test pattern, since it needed a real Supabase connection rather than the app's usual mocked Vitest style) — a new top-level location rather than `supabase/functions/`'s per-function tests, since this exercises a database function, not an Edge Function. It runs inside the existing `edge-functions` CI job alongside the others, rather than a separate job. One real gotcha hit along the way: Vitest's default glob initially picked up this file too and failed trying to run Deno-only imports under Node — fixed by adding `supabase/tests/**` to `vitest.config.js`'s exclude list, alongside the existing `supabase/functions/**` exclusion.
