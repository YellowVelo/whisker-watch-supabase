# 0067_E2E_Linked_Project_Dev_Guard_Specification_v1

**Status:** Implemented
**Date:** 2026-10-19
**Related files:** `e2e/vaccination-due-reminders.spec.js`, `docs/testing/QA_Test_Plan.md`, `supabase/.temp/project-ref` (gitignored, local-only)

## Before You Approve This

- **The hazard was live when this was found.** On 2026-10-19, the main checkout's Supabase CLI was linked to **production** (`upvtbwienebfxznnagsg`). Had anyone run the full e2e suite locally that day, this one test file would have run production's real daily vaccination-reminder job — creating real "vaccine due" notifications for real users, outside the normal daily schedule. The rest of the test (the browser part) would still have hit dev, so nothing would have looked wrong from the test's side.
- This is a **test-only** fix. No app code, database, or Edge Function changes. Nothing to push to dev/staging/prod.
- Only one place in the codebase uses `--linked` from automated code — this test. Other `--linked` mentions are in docs, as commands a person runs by hand on purpose (e.g. spec 0022's prod email-count query, spec 0063's policy check). Those are deliberately left alone.
- **A second, sneakier version of the same hazard was found while testing.** If the folder you run tests from has no `supabase/config.toml` (true for Claude Code's git worktrees, which sit *inside* the main project folder), the CLI quietly walks up to the parent folder and uses *its* link instead. So the guard could check one folder's link while the CLI used another's. Fixed by telling the CLI to use the current folder only (`--workdir .`) — it now says "not linked" instead of borrowing the parent's link. This was found the hard way: running `supabase link` from a worktree re-linked the **main** project folder (from prod to dev) without saying so.
- **Pre-existing, not fixed here:** dev's test1@ account had 258 leftover vaccination-reminder notifications and 21 leftover "E2E Test Rabies" vaccinations from earlier failed runs (back to 2026-08-28), which made all 3 tests fail on their own. Cleared before verifying (dev, test1@ only). The test's cleanup works when the tests pass, but leaks rows when a test fails partway — worth a separate fix.
- The dev project ID is written directly into the test file. If the dev project were ever replaced with a new one, this line would need updating — the test would refuse to run (fail safe), not silently do something wrong.

## Functional Requirements

One automated test needs to run a "server-only" database job (generating vaccination-due reminders) that a normal logged-in user can't trigger. It does this through the Supabase command-line tool (CLI), which runs the command against whichever Supabase project the CLI was **last linked to** — a local setting that changes whenever someone points the CLI at staging or production to deploy a change by hand.

The test must only ever run that job against the dev project (`wysker-watch-dev`). If the CLI is linked to anything else — staging, production, or nothing at all — the test must stop immediately with a clear message explaining why and how to fix it, before it creates any test data.

## Acceptance Criteria

1. Given the CLI is linked to production (or staging, or any non-dev project), when the vaccination-reminders e2e test runs, then it stops before doing anything, and the error names the project it found and says to re-link to dev.
2. Given the CLI isn't linked to any project, when the test runs, then it stops with a clear "not linked" message.
3. Given the CLI is linked to dev, when the test runs, then it behaves exactly as before and passes.
4. A refusal happens before any test vaccination is created, so a refused run leaves no stray test data behind.

## Test Plan

- AC1 → verified by running `vaccination-due-reminders.spec.js` with `supabase/.temp/project-ref` set to the prod ref; confirmed it fails in setup with the refusal message. Not a permanent automated test: a test that deliberately links the CLI to prod would itself be the hazard this spec removes.
- AC2 → same, with no `supabase/.temp/project-ref` file present.
- AC3 → the existing 3 tests in `vaccination-due-reminders.spec.js`, run against a real dev link.
- AC4 → the guard runs at the top of the file's `beforeAll` (setup step), before any insert. Checked by reading the code and by the AC1 run creating no rows.
- **Seeding/access constraints:** unchanged — still the existing Supabase-CLI pattern, now restricted to dev.

## Visual Reference

None — no UI changes.

## Technical Spec

- **Schema:** none.
- **Components/files touched:** `e2e/vaccination-due-reminders.spec.js` only — new `assertLinkedToDev()` reads `supabase/.temp/project-ref` (relative to the repo root, the same working directory the file already assumes for `.env.playwright`), trims it, and throws unless it equals `rebvizgpchpzjpoohjrd`. Called at the start of `beforeAll` (fail before seeding) and again inside `runGeneratorFunction()` (so the shell-out can never be reached without the check, even if a future test calls it directly). The CLI call also gets `--workdir .` so it reads the same `supabase/.temp` the guard checked, instead of walking up to a parent folder's link when no `supabase/config.toml` is present (confirmed: without it, a nested git worktree silently used the main checkout's link).
- **Verified 2026-10-19 (chromium):** no link → refused in setup (AC2); `project-ref` = prod ref → refused in setup (AC1); real dev link → 3/3 passed, twice in a row (AC3), after clearing stale test rows. One earlier run had a single timing flake in the snooze test's `read` check, which then passed on its own and in both full re-runs.
- **API / edge functions:** none.
- **Design System compliance:** no UI changes — not applicable.
- **Constraints from CLAUDE.md / locked decisions:** respects "the e2e suite always targets `wysker-watch-dev`" (CLAUDE.md, spec 0024). Before this fix, that rule was enforced for the browser half of the test (via `.env.playwright`) but not for the CLI half.
- **CI:** CI doesn't currently create a `supabase/.temp/project-ref`, so if this test runs in CI's `e2e` job it was already failing at the CLI call (no link) and will now fail with a clearer message instead. Not changed here.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** none. No other automated code calls `--linked`.
- **Technical debt nearby:** the file header previously said the CLI was "already authenticated locally against wysker-watch-dev" — an assumption, not something checked. Updated to point at the new guard.
- **Orphaned features nearby:** none found.
- **Punch list / known issues in this area:** related to the spec 0066 environment-sync work, where the prod link was discovered. No existing Launch Plan entry for this specific hazard.

## Non-Goals

- Checking that `.env.playwright`'s `VITE_SUPABASE_URL` also points at dev (it already does by convention; separate concern).
- Changing how or when people link the CLI for manual deploys.
- Guarding manual `--linked` commands people run by hand.

## Open Questions

None.
