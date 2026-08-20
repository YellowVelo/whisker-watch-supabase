# 0057_Sitter_Wellbeing_Chips_E2E_Coverage_Specification_v1

**Status:** Shipped — 2026-08-20. Migration `0051_test4_sitter_fixture_account.sql` applied to all three Supabase projects (`wysker-watch-dev`, `wysker-watch-staging`, `Whisker-Watch`); `test4@wyskerwatch.com` created in all three (with different passwords per environment — `.env.playwright` documents the dev one). The four new sitter-identity tests in `e2e/pet-sitter.spec.js` pass against `wysker-watch-dev`, cleanup verified leaving no orphaned data. One implementation deviation from the draft, worth knowing: the seeded check-in dates had to be computed in the browser's local timezone (matching `src/lib/timezone.js`'s `dateStrInTimezone`), not plain UTC as first written — `test4@` has no `profile.timezone` set (never onboarded), so it falls back to the browser-detected zone, which can land on a different calendar day than UTC depending on time of day. Caught and fixed during test-writing, not a change to the feature itself.
**Date:** 2026-08-18
**Related files:**
- `docs/features/0037_Sitter_Wellbeing_Chips_Specification_v1.md` (the parent spec — this one only covers its unfinished Test Plan section, Launch Plan Task #18)
- `e2e/pet-sitter.spec.js` (currently navigation-only, gains the new tests)
- `e2e/fixtures.js`, `e2e/global-setup.js` (unchanged — the second identity is scoped to the new spec file, not added here)
- `src/pages/Pets.jsx` (`SitterPetRow`, lines 211-267)
- `src/components/WellbeingChipGrid.jsx`, `src/components/AttributeTrendChip.jsx`
- `src/lib/checkin/checkinClient.js` (`markGreatDay`, `getCheckIn`)
- `src/components/InviteSitterDialog.jsx`, `src/lib/AuthContext.jsx` (lines ~91-99, `claim_pending_sitter_invites` RPC call on login)
- `supabase/migrations/0010_account_type.sql`, `0049_test3_admin_fixture_account.sql` (the allowlist this spec adds `test4@` to)
- `supabase/migrations/0028_link_pending_sitter_invites.sql` (why a sitter invite made via email automatically links to `test4@`'s real login)
- `.env.playwright.example`

## Before You Approve This

- **`test4@wyskerwatch.com` needs one more step before it works as a test account, not just an Auth login.** You've created the login itself, but the app also has a separate "is this a real user or an internal test account" list (`classify_account_type()`, migration `0010`) that `test1@`/`test2@`/`test3@` are already on. Right now `test4@` isn't on that list, so the app would currently treat it as an ordinary production account. This spec adds it — see Technical Spec.
- **Because `test4@` already exists (unlike `test3@`, which was added to the allowlist *before* the account was created), this migration needs an explicit one-time "fix the existing row" statement, not just the allowlist update.** The allowlist only affects *new* signups going forward; `test4@`'s account row was already written with the old rules. Missing this step would leave the test silently unable to prove the RLS (row permission) policies actually work, since a production-classified account doesn't behave identically in every code path that checks account type. Flagged explicitly so it isn't a repeat of the pattern CLAUDE.md already warns about for this migration file.
- **This is real backend infrastructure, not a "test-only" throwaway.** Per your answers, the sitter login is scoped to just this one file (not `global-setup.js`) and uses a dedicated, disposable pet (not one of `test1@`'s real pets) — both reduce risk to the rest of the suite, but the migration itself (the allowlist change) still needs the same three-project push (`wysker-watch-dev`, `wysker-watch-staging`, `Whisker-Watch` prod) CLAUDE.md requires for every migration, even though only `wysker-watch-dev` will ever actually use `test4@` to log in.
- No duplicate or overlapping test coverage was found — `e2e/pet-sitter.spec.js`'s existing test only confirms the page is reachable and doesn't touch wellbeing chips at all.

## Functional Requirements

This spec adds no user-facing behavior — the Sitter Wellbeing Chips feature itself already shipped (spec 0037). It adds automated proof that the feature keeps working:

1. A second, dedicated test login (`test4@wyskerwatch.com`) that the automated test suite can use to act as "a sitter looking at someone else's pet," separate from the suite's main account (`test1@`, which plays every other role).
2. Automated checks that a sitter's pet row shows the five Wellbeing badges, that they reflect a real check-in correctly, that a not-yet-checked-in pet shows the right empty state, and that tapping a badge doesn't do anything extra beyond the row's existing tap-to-Trends behavior.

## Acceptance Criteria

*(Restated from spec 0037 — this spec's job is to make each of these automatically checked, not to change what "correct" means.)*

- Given a signed-in user has sitter access to a pet they don't own, when they open the Pets screen, then that pet's row under "Pets I Sit" shows five Wellbeing badges.
- Given the shared pet has a check-in logged for today, when the badges load, then each shows the correct direction, matching what the pet's owner would see.
- Given the shared pet has no check-in yet for today, when the row loads, then the badges show the "no check-in yet" state, not a spinner or error.
- Given the badges are showing, when the sitter taps a badge directly, then only the existing row-level navigation to Trends fires — nothing else happens.

## Test Plan

- Row shows 5 badges for a shared pet → Playwright test, new (`e2e/pet-sitter.spec.js`).
- Badges reflect correct direction for a logged check-in → Playwright test, new. Seeds a real "Great Day" check-in as `test1@` (the pet's owner) before signing in as `test4@`, then asserts the badges match that check-in's known directions.
- "No check-in yet" state renders correctly → Playwright test, new. Uses the freshly-created test pet before any check-in is seeded for it.
- Tapping a badge doesn't create a second action → Playwright test, new. Clicks directly on a badge and asserts the same single navigation to `/pet/:id/trends` that clicking elsewhere on the row produces — no second event, no console error from a duplicate handler.
- "Unable to load wellbeing" fallback on a failed load → still not covered by Playwright, same as spec 0037 said: it would require intercepting Supabase network requests mid-test, which nothing in this suite does today, and the owner-side equivalent of this same message isn't tested that way either. Covered by manual QA only — no change from spec 0037's original plan.
- **Seeding/access constraints:** everything above is reachable from real, already-permitted API calls made directly through `@supabase/supabase-js` (the same pattern `add-pet.spec.js` and `daily-checkin.spec.js` already use for their own setup/cleanup) — no service-role key, no admin access, nothing outside what a normal signed-in user can already do:
  1. **New migration** adds `test4@wyskerwatch.com` to the `classify_account_type()` allowlist (migration `0010`), following the exact pattern `0049_test3_admin_fixture_account.sql` used for `test3@`, plus the backfill `update` statement flagged above.
  2. **`e2e/pet-sitter.spec.js` gains its own local setup** (not `global-setup.js`, per your answer): in a `test.beforeAll`, signed in as `test1@` via `supabase-js` directly, it creates one uniquely-named test pet (`E2E Sitter Test Pet <timestamp>`, matching `add-pet.spec.js`'s disposable-fixture naming), a `pet_sits` row covering it, and a `pet_sitter_access` row inviting `test4@wyskerwatch.com` by email — the same three writes `InviteSitterDialog.jsx`'s real UI flow makes, just called directly instead of clicked through.
  3. **The check-in-direction test** seeds one real check-in for that pet as `test1@` (via `markGreatDay`-equivalent direct insert, or by calling the same client helper `checkinClient.js` exports) before switching to `test4@`.
  4. **Signing in as `test4@` inside the spec file** (not a shared fixture) triggers `AuthContext.jsx`'s existing `claim_pending_sitter_invites()` RPC call on login, which is what actually links the invite created in step 2 to `test4@`'s real user id — this is existing, already-shipped logic (migration `0028`), not something this spec adds.
  5. **`test.afterAll` deletes the test pet** (via the same `delete-pet` Edge Function `add-pet.spec.js` already uses for cleanup) — deleting the pet cascades to its `pet_sits`/`pet_sitter_access`/check-in rows, so no separate cleanup of those is needed.
  6. **New env vars** `PLAYWRIGHT_TEST4_SITTER_EMAIL` / `PLAYWRIGHT_TEST4_SITTER_PASSWORD` in `.env.playwright` (documented in `.env.playwright.example`, following the exact `PLAYWRIGHT_TEST3_ADMIN_*` pattern) — you'll need to add `test4@`'s real password there yourself before these tests can run; this spec doesn't need or store that password anywhere.

## Visual Reference

None — no UI changes. This spec is test infrastructure only.

## Technical Spec

- **Schema:** one new migration, next sequential number (`0051_test4_sitter_fixture_account.sql`), modeled on `0049_test3_admin_fixture_account.sql`:
  - Adds `'test4@wyskerwatch.com' then 'test'` to `classify_account_type()`.
  - **Unlike `0049`**, also includes an explicit `update public.profiles set account_type = 'test' where lower(email) = 'test4@wyskerwatch.com'` — needed because (per your account) `test4@` already exists, so the signup-time trigger already ran under the old rules and wrote `account_type = 'production'` to its profile row. `0049` didn't need this because `test3@` didn't exist yet when that migration ran.
  - Per CLAUDE.md, pushed manually to all three Supabase projects (`wysker-watch-dev`, `wysker-watch-staging`, `Whisker-Watch`), even though only `wysker-watch-dev` will ever have this account actually used to sign in.
- **Components/files touched:** no application code changes — `src/pages/Pets.jsx`, `WellbeingChipGrid.jsx`, etc. are untouched, since the feature itself already shipped correctly under spec 0037.
- **Test files touched:**
  - `e2e/pet-sitter.spec.js` — gains `test.beforeAll`/`test.afterAll` setup (local to this file, not `fixtures.js`/`global-setup.js`) and four new test cases.
  - `.env.playwright.example` — documents the two new env vars.
- **API / edge functions:** none new. Reuses `delete-pet` (already exists, used by `add-pet.spec.js`) for cleanup and the existing `claim_pending_sitter_invites` RPC (already exists, called by `AuthContext.jsx` on every login) — this spec depends on both already working, doesn't change either.
- **Design System compliance:** not applicable — no UI or component changes.
- **Constraints from CLAUDE.md / locked decisions:** none conflict. This follows the existing e2e conventions documented in `e2e/fixtures.js`'s own comments (flow-specific setup stays local to its spec file) and in `0024_Playwright_E2E_Testing_Specification_v1.md`, rather than introducing a new pattern.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** none — `e2e/pet-sitter.spec.js`'s existing test (navigation only) doesn't overlap with anything this spec adds.
- **Technical debt nearby:** the `test4@` account-classification gap described above (Before You Approve This) is the one piece of debt this spec directly fixes; no other debt found nearby.
- **Orphaned features nearby:** none found.
- **Punch list / known issues in this area:** this spec closes out Launch Plan Task #18, the remaining open half of spec 0037. No other open item found nearby.

## Non-Goals

- No changes to the Sitter Wellbeing Chips feature itself (badges, RLS policies, `SitterPetRow`) — spec 0037 already shipped that; this spec is test coverage only.
- No Playwright test for the "Unable to load wellbeing" network-failure fallback — same scoping decision spec 0037 already made, unchanged here.
- No change to `global-setup.js` or `fixtures.js` — the second identity stays local to `pet-sitter.spec.js` per your answer, so no other spec file is affected.
- No change to how real (non-test) sitters are invited or linked — this only adds a test account to the existing, already-shipped invite/link mechanism.

## Open Questions

None outstanding — both open design decisions (where the second login lives, and whether to use a dedicated vs. shared pet) were resolved by your answers before drafting.
