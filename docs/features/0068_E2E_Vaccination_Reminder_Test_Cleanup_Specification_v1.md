# 0068_E2E_Vaccination_Reminder_Test_Cleanup_Specification_v1

**Status:** Implemented
**Date:** 2026-10-19
**Related files:** `e2e/vaccination-due-reminders.spec.js`, `docs/testing/QA_Test_Plan.md`, `src/pages/Notifications.jsx` (read only), `supabase/migrations/0044_vaccination_due_notifications.sql` (read only), `e2e/vaccination-calendar-export.spec.js` (read only — see Findings)

## Before You Approve This

- This is a **test-only** fix. No app code, database, or Edge Function changes. Nothing to push to dev/staging/prod.
- **Builds on spec 0067** (PR #19, not yet merged), which edits the same test file. This PR's branch starts from 0067's branch, so 0067 should be merged first.
- **The cleanup now deletes a bit more than this test's own rows.** Besides "E2E Test Rabies…" vaccinations and their reminders, it deletes any vaccination reminder on test1@ whose vaccination no longer exists (an "orphan"). That's only ever on test1@, a test-only account on dev, and only reminders pointing at nothing — but it does mean it also tidies up after other test files (see the next point). It never touches another account: database security rules only let test1@ see and delete test1@'s own rows.
- **Found a second, smaller leak in a different test file, not fixed here.** `vaccination-calendar-export.spec.js` creates an "E2E Export Test" vaccination and deletes it afterwards, but not any reminder made for it — and it ignores delete errors, the same flaw this spec fixes. Reminders only appear for it if this test's reminder job (or dev's daily 12:00 UTC job) runs while that vaccination exists. Caught live during testing: someone ran that file at the same time as this one, which left one orphaned "E2E Export Test" reminder on test1@. The new orphan sweep here cleans these up, but the export test itself is a separate follow-up.
- **One unexplained failure in 20 full runs.** On the 2nd run, the first test ("renders with the right stage copy") failed once; it passed when re-run and in all 19 other runs. The failure details were overwritten before they could be read. The likeliest cause is the export test above running against the same test1@ account at the same time (it was run at some point during this testing window), but that is not proven.
- **Snooze-flake fix is based on reading the code, not on catching the flake in the act.** It didn't show up in any of the 20 runs; the cause (the page hides the card before the save finishes) is clear from `Notifications.jsx`.

## Functional Requirements

The automated test for vaccination-due reminders creates throwaway "E2E Test Rabies A/B/C" vaccinations on the test account (test1@) in the dev database, then runs the real reminder job to create a reminder for each. When a test failed partway through, some of those rows were never cleaned up. Because dev's real reminder job also runs every day, each leftover vaccination kept gaining new reminders. By 2026-10-19, 21 leftover vaccinations and 258 leftover reminders (going back to 2026-08-28) had piled up, and every test failed — the page showed many reminders with the same title where the test expected exactly one.

The test must:

1. Always clean up what it created, even when it fails partway, times out, or the reminder job itself fails.
2. Notice and report a failed cleanup, instead of silently leaving rows behind.
3. Clear any leftovers from earlier runs before starting and again when finishing, so one bad run can't break every future run.
4. Not fail because some other, unrelated reminder happens to be on test1@'s list.
5. Not fail randomly on the Snooze test because it checks the database before the app has finished saving.

## Acceptance Criteria

1. Given a test fails on one of its checks, when the run ends, then no "E2E Test Rabies" vaccinations or their reminders remain on test1@.
2. Given the reminder job fails right after a test vaccination is created, when the run ends, then that vaccination is gone too.
3. Given a cleanup delete returns an error, or leftovers are still there after the sweep, then the run fails with a message saying what was left behind.
4. Given leftovers from an earlier run (including reminders whose vaccination was already deleted), when the next run starts, then they're removed before any test runs.
5. Given another vaccination reminder is on test1@'s list, then the tests still check, and tap, only their own reminder.
6. Given Snooze is tapped, then the test waits (up to 10 seconds) for the database to show the reminder as read and snoozed for about 7 days, instead of checking only once.
7. Given the reminder job is run again right after snoozing, then there is still exactly one reminder for that vaccination (checked in the database, not only by its absence from the page).

## Test Plan

- AC1, AC2 → verified 2026-10-19 by temporarily breaking the test file on purpose: one test given a wrong expected message, another made to throw right after creating its vaccination (as if the reminder job failed). Both tests failed as intended; afterwards the dev database had 0 "E2E Test Rabies" vaccinations, 0 of their reminders, and 0 orphaned reminders on test1@. Not a permanent automated test — a test that's designed to fail can't live in the suite.
- AC3 → by code reading: every delete and count result is checked, and the sweep re-counts after deleting.
- AC4 → the sweep runs at the start (`beforeAll`) and end (`afterAll`) of the file. Observed working live: it removed the stray "E2E Export Test" orphan described above.
- AC5, AC6, AC7 → the 3 existing tests in `vaccination-due-reminders.spec.js`, now scoped to their own reminder card, polling for the snooze save, and counting reminders in the database.
- Stability: 20 full runs of the file against dev (chromium) on 2026-10-19 — 19 fully green, 1 with a single unexplained failure (see "Before You Approve This").
- **Seeding/access constraints:** unchanged — the Supabase-CLI pattern from spec 0034, restricted to dev by spec 0067.

## Visual Reference

None — no UI changes.

## Technical Spec

- **Schema:** none.
- **Components/files touched:** `e2e/vaccination-due-reminders.spec.js` only.
  - **Why rows leaked:** (a) `seedVaccinationDueNotification` inserted the vaccination, then ran the CLI; if the CLI threw (not linked, worktree without `supabase/.temp`, network), the exception happened before the test's `try`, so the `finally` cleanup never ran. (b) `cleanupVaccination` ignored Supabase errors. (c) A `finally` inside the test body can be cut off when Playwright times a test out and tears the worker down. (d) Once leaked, dev's `daily-vaccination-due-notifications` cron job (migration 0044, 12:00 UTC, confirmed active on dev) added reminders for each leftover every time it moved to a new stage, and every later test run's generator call did too.
  - **Fix:** created IDs go into a module-level `Set` the moment the insert succeeds (before the CLI call); a `test.afterEach` deletes them. `afterEach` runs after timeouts and seeding errors too, and Playwright reports its errors alongside the test's rather than replacing them (a `throw` inside `finally` replaces the original error). `deleteTestVaccinations` checks every `error`. `sweepLeftoverTestRows` (in `beforeAll` and `afterAll`) deletes all `E2E Test Rabies%` vaccinations and their reminders, plus any test1@ `vaccination_due` notification whose `related_id` no longer matches a vaccination, then re-counts and throws if anything is left — needed because row-level security makes a disallowed delete return "0 rows", not an error.
  - **Strict-mode isolation:** each test's checks and clicks are scoped to `page.locator('div.rounded-xl').filter({ hasText: vaccineName })` — the reminder's outer card in `Notifications.jsx`. This depends on that class name; if the card's styling changes, the locator needs updating (the tests would fail, not pass wrongly).
  - **Snooze flake:** `Notifications.jsx` `handleSnooze` hides the card (sets `read: true` locally) before `await snoozeNotification(...)` finishes, so the old single DB read could run before the update landed. Replaced with `expect.poll` (10s) on `read === true` and `snoozed_until` > now + 6 days.
  - **Post-reload check:** the old "card not visible after reload" check passed trivially while the list was still loading. Now waits for `main .animate-pulse` placeholders to clear first, and also counts reminders for that vaccination in the database (must be exactly 1).
- **API / edge functions:** none.
- **Design System compliance:** no UI changes — not applicable.
- **Constraints from CLAUDE.md / locked decisions:** e2e still targets only `wysker-watch-dev` (spec 0024/0067); no service-role key added to `.env.playwright`.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** `e2e/fixtures.js` has no shared database-cleanup helper; each spec file rolls its own. Not consolidated here (one file's worth of cleanup isn't enough to justify a shared helper yet).
- **Technical debt nearby:** `vaccination-calendar-export.spec.js` has the same "ignore delete errors" flaw and doesn't remove reminders made for its vaccination — follow-up. More broadly, this file's reminder job runs for **every** vaccination in dev, not just its own, so any other test's vaccination that exists at that moment gets a reminder too.
- **Orphaned features nearby:** none found.
- **Punch list / known issues in this area:** the leak was noted as "pre-existing, not fixed here" in spec 0067's "Before You Approve This" list; this spec resolves it.

## Non-Goals

- Fixing `vaccination-calendar-export.spec.js`.
- Stopping two people/sessions from running the e2e suite against test1@ at the same time.
- Changing how the reminder job decides who gets reminders.

## Open Questions

- The one unexplained failure (run 2 of 20). If it shows up again, keep the `test-results/` folder from that run before re-running, so the error can be read.
