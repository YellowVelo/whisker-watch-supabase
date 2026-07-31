# 0024_Playwright_E2E_Testing_Specification_v1

**Status:** Implemented (2026-07-31)
**Date:** 2026-07-28
**Related files:** `package.json`, `playwright.config.js`, `e2e/*`, `.env.playwright.example`, `.github/workflows/ci.yml`, `.env.example`, `src/pages/Login.jsx`, `src/pages/Register.jsx`, `src/components/AddPetDialog.jsx`, `src/components/DailyCheckInSheet.jsx`, `src/components/DailyCheckInModal.jsx`, `src/pages/VetExport.jsx`, `src/pages/PetSitter.jsx`, `src/components/PetSittingSection.jsx`, `supabase/functions/reset-sandbox-account/index.ts`, `supabase/functions/_shared/testHelpers.ts`, `supabase/migrations/0004_co_owner_accounts.sql`, `docs/launch-punch-list.md`

**Implementation note — one deviation from the Technical Spec below:** `SUPABASE_SECRET_KEY` was dropped from `.env.playwright`. `global-setup.js` seeds the saved session with a plain `signInWithPassword()` call using the anon/publishable key + `test1@`'s real password — since that account is already email-confirmed, this needs no admin-level credential to skip the email click-through. Same result (a valid saved `storageState`; the Login test still exercises the real form), one fewer high-privilege credential sitting in a local env file. The orphaned `.env.test` file this spec flagged has also been removed, as recommended below.

## Before You Approve This

- **Two of the three suspected bugs behind this request don't match what the code shows.** The pet-sitting page (`/pet-sitter`) is fully wired into navigation (`App.jsx` route, a link on `Home.jsx`, and it's covered by `BottomTabBar.jsx`'s active-tab logic) — **you confirmed this in review, it's a working feature, not missing.** Spec updated accordingly: pet-sitting gets a normal coverage test, not a regression-hunt. Separately, Vet Report generation (`VetExport.jsx` → `generate-vet-report` Edge Function) reads as fully implemented in the code, not obviously broken — but "reads as implemented" isn't the same as "verified working," which is exactly why a test is still worth writing here.
- **The one suspected bug that does look real and plausible:** Add Pet's RLS policies (`0004_co_owner_accounts.sql`) look correctly written on paper (insert requires `auth.uid() = created_by`, which is exactly what the app sends) — I could not find an obvious RLS misconfiguration by reading the migration alone. This means the Add Pet test is important not because I found the bug, but because I *couldn't rule it out by reading code* — only by actually running the flow. That's a good reason to test it, explained more in Repo Findings & Risks below.
- **A stale, unused file could confuse a future reader.** `.env.test` exists in the repo (and is deliberately allowed past `.gitignore`) but points at `http://localhost:54321` — a local Supabase CLI instance that nothing in this project runs or references anywhere. It looks like a leftover from an earlier, abandoned testing approach. This spec does not reuse it and recommends removing it in the implementation PR to avoid a future person assuming it's the current convention.
- **Resolved since the first draft:** the `test1@wyskerwatch.com` duplicate-pets issue flagged below is fixed — you reset and reseeded the account using its built-in Reset Test Account / Seed Data tools, and it now holds 3 unique pets with 30 days of check-in history. Good, stable starting state for the fixture account; the open question about it is closed.

## Functional Requirements

Add an automated way to click through the app in a real browser and confirm the important flows still work — the way a human tester would, but repeatable and fast. This is a **new capability**, not a change to any existing feature; nothing about how the app behaves for real users changes.

The first batch of tests should cover, in priority order:

1. **Login** — a real account can sign in with email and password and land on a page that proves they're logged in. Everything else depends on this working, so it comes first.
2. **Add a Pet** — a logged-in owner can open the Add Pet flow, fill it out, submit it, and see the new pet actually appear — not just see the button say "Saving…" and then nothing. This is the test most likely to catch the suspected hang bug, because it checks the flow reaches a real end state, not just that the button was clicked.
3. **Daily Check-In** — a logged-in owner with a pet can complete a same-day check-in (mark a Vibe: Great / Off / Tough) and see it reflected afterward.
4. **Vet Report generation** — a logged-in owner can request a vet report for a pet and get back a real file, not a stuck spinner or a silent failure. This test exists specifically to answer the "is this actually broken" question, since nobody has confirmed it working end-to-end recently.
5. **Pet Sitting navigation** — a logged-in owner can reach the Pet Sitter page from Home and see it render correctly. (Downgraded from "regression test for a missing feature" to "normal coverage test," per your confirmation that this feature already works.)

Tests should be written so that a non-developer reading them later can tell what's being checked just from the test names and the plain-language steps inside — no clever shared helpers that hide what's actually happening on the page.

## Acceptance Criteria

- Running one command locally runs all 5 tests against a real, running copy of the app and a real (non-production) database, and reports pass/fail for each.
- None of the 5 tests can write a row into the production Supabase project (`Whisker-Watch`), under any failure mode — this is enforced by which project the tests are configured to point at, not just by convention.
- The Login test fails if valid credentials cannot sign in, or if signing in doesn't land on a recognizably-logged-in page.
- The Add Pet test fails if submitting the form does not result in the new pet becoming visible somewhere in the app within a reasonable wait — this is the check that would catch the suspected infinite-spinner bug.
- The Daily Check-In test fails if a Vibe selection does not get saved and reflected back to the user.
- The Vet Report test fails if requesting a report does not result in a downloaded file (or a clearly-surfaced error, whichever the app is supposed to do) within a reasonable wait.
- The Pet Sitting test fails if the Pet Sitter page cannot be reached from Home, or fails to render.
- Every test cleans up any pet or check-in data it created, so re-running the suite doesn't pile up junk on the test account.
- A developer (or you, reading along) can open any one test file and understand what it's checking without needing to read a separate shared helper file first.

## Visual Reference

Not applicable — this is test infrastructure, not a user-facing UI change. No mockups were provided or are needed.

## Technical Spec

### Test data safety — which Supabase project, and how

- **Target project: `wysker-watch-dev`.** Same project your existing Deno Edge Function integration tests already run against (`.github/workflows/ci.yml`'s `edge-functions` job). Never `wysker-watch-staging` or `Whisker-Watch` (prod).
- **New `.env.playwright` file (gitignored, like `.env` — never committed), with exactly these keys:**

  ```
  PLAYWRIGHT_BASE_URL=http://localhost:5173

  VITE_SUPABASE_URL=https://<wysker-watch-dev-project-ref>.supabase.co
  VITE_SUPABASE_ANON_KEY=<wysker-watch-dev publishable/anon key>

  SUPABASE_SECRET_KEY=<wysker-watch-dev secret key>

  PLAYWRIGHT_TEST1_EMAIL=test1@wyskerwatch.com
  PLAYWRIGHT_TEST1_PASSWORD=<test1's actual password>
  ```

  All values come from the `wysker-watch-dev` project specifically (Settings → API in the Supabase dashboard for that project — same place `.env.example` points at, just the "Secret key" this time instead of the "Publishable key", since `SUPABASE_SECRET_KEY` needs admin-level access to seed a session without clicking an email link). `SUPABASE_SECRET_KEY` is server-side only — used by the one-time login-session setup script, never sent to the browser, never referenced inside a test itself. A `.env.playwright.example` gets committed alongside it with placeholder values and the same "never point this at prod" warning already used in `.env.example`.
- **Test account: `test1@wyskerwatch.com`**, per your direction — `test2@` stays reserved for the existing Deno CI tests so the two suites never collide on the same account.
- **Cleanup:** each test that creates data (Add Pet, Daily Check-In) deletes what it created in an `afterEach`/teardown step, via the same Edge Functions / entity API the app itself uses (`delete-pet`, etc.) — not direct database access — so cleanup is exercised through the same RLS/permission path a real user would hit, and a cleanup failure doesn't leave orphaned test data invisible to future runs.
- **Not proposing a fifth Supabase project or a brand-new dedicated test account** — `wysker-watch-dev` plus the existing, now-clean `test1@` account reuses infrastructure you already trust and already pay for, consistent with how the Deno tests work today.

### Authentication in tests — avoiding the email-confirmation click-through

**Approach: `storageState` reuse, seeded via Supabase's admin API — no email link is ever clicked.**

How it works, in plain terms:
1. A one-time **global setup script** runs once before the whole test suite starts. It uses the Supabase **secret key** (server-side only, same credential class already used by `reset-sandbox-account` and the Deno test helpers — never the publishable/anon key the browser uses) to sign in as `test1@wyskerwatch.com` directly via the Supabase Auth API, bypassing the login form and any email step entirely.
2. That signed-in session gets saved to a JSON file (Playwright's built-in `storageState` feature — literally the browser's local storage/cookies at that moment).
3. Every test that needs to start "already logged in" (Add Pet, Daily Check-In, Vet Report, Pet Sitting) loads that saved session instead of re-logging-in through the UI. This makes those 4 tests fast and immune to Login page changes breaking them.
4. **The Login test is the one exception** — it deliberately does *not* use the saved session. It drives the real `Login.jsx` form with real keystrokes, so the actual login UI gets exercised by at least one test. This is what "everything else depends on it" means in practice: if `signInWithPassword` or the login form itself breaks, the Login test is designed to be the one that fails and tells you.

**Tradeoff, stated plainly:** this means 4 of the 5 tests don't touch the login form at all — they trust that a valid session is a valid session, which is true, but it does mean a bug that's *specific to the login form* (a broken button, a CSS issue hiding a field) would only be caught by the Login test, not by the other four. This is the standard, recommended Playwright pattern for exactly this reason — it trades a small amount of login-path coverage in the other 4 tests for a large speed and reliability win, and is considered the right tradeoff industry-wide.

**Google OAuth is explicitly out of scope for this first batch** (see Non-Goals) — automating a real Google consent screen in a test is fragile and generally discouraged; email/password is the flow that gets covered.

### Framework setup

- `@playwright/test` added as a new devDependency.
- New `playwright.config.js` at the repo root, configured with a `webServer` block that runs `npm run dev` (the existing Vite dev server, port 5173) automatically before tests start — so `npx playwright test` is a single command, no separate "start the server first" step.
- New `e2e/` directory at the repo root (sibling to `src/`, not inside it) holding the 5 test files, `global-setup.js` (the session-seeding script above), and a small `fixtures.js` with genuinely shared, obvious things only (e.g. "the logged-in page" helper) — deliberately kept thin per your readability preference, not a deep abstraction layer.
- New `package.json` script: `"test:e2e": "playwright test"`.
- Playwright's own config already excludes `e2e/` from Vite's build and from `vitest run`'s test discovery by directory convention; confirmed no collision with the existing `npm run test` (Vitest) command, which only looks inside `src/`.

### CI integration

**Decided: not part of this first PR.** The suite ships as local/manual-only tooling (`npm run test:e2e`) for now, run by hand until the tests have proven themselves reliable. No changes to `.github/workflows/ci.yml` and no new CI secrets in this pass. Wiring it into CI as a required check (alongside the existing `frontend` and `edge-functions` jobs) is a deliberate, separate follow-up once there's confidence the tests aren't flaky — tracked as a Non-Goal below, not forgotten.

### Constraints from CLAUDE.md / locked decisions

- No conflict with the Vibe/symptom-count data model — the Daily Check-In test only needs to select a Vibe and confirm it saved, it doesn't need to know about or assert on any retired scoring concept.
- Respects "Frontend deploys are done manually by Lynn, not Claude" — these tests run against the dev server / dev Supabase project locally or in CI, never trigger or require a deploy.
- Respects the three-separate-Supabase-projects setup already documented in CLAUDE.md — this spec doesn't change that setup, it just adds a new consumer of the existing `wysker-watch-dev` project.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** None found. There is no existing test setup of any kind in this repo — `npm run test` (Vitest) exists as a script but no `*.test.js`/`*.test.jsx` files exist under `src/` today, and the only other automated tests are the Deno Edge Function integration tests, which test server-side functions directly over HTTP, not the browser UI. This is a genuinely clean slate, as you said.
- **Technical debt nearby:** The orphaned `.env.test` file described above. Also worth knowing: `npm run typecheck` has ~279 pre-existing errors and isn't run in CI (documented in the punch list) — not something Playwright needs to fix, but means "the app typechecks cleanly" isn't a safety net Playwright is stacking on top of; it's closer to the only real safety net for these 5 flows once this ships.
- **Orphaned features nearby:** None found specific to the flows being tested.
- **Punch list / known issues in this area — several, all relevant to what's being tested here:**
  - **Add Pet:** No open punch-list item names an infinite-spinner bug directly, but the RLS rewrite in `0004_co_owner_accounts.sql` (the "co-owner migration" you suspected) is real and touches exactly the `pets` insert/select policies this flow depends on. I read the current policies and they look correct on paper — insert requires `auth.uid() = created_by`, which matches what `entities.Pet.create()` sends. I can't confirm from reading code alone whether this is actually broken in practice; that's precisely the gap this test is meant to close.
  - **`test1@wyskerwatch.com`'s duplicate-pets issue (punch list P4) is resolved** — reset and reseeded, now holds 3 unique pets with 30 days of check-in history. The punch list entry itself is now stale and should be checked off as part of (or shortly after) this work landing.
  - **Two open, unrelated-but-nearby UI bugs could bite a test that isn't careful:** `EditPetSheet.jsx`'s slide-in panel is confirmed to never actually become visible (P4, severe) — not touched by this spec's flows, but worth knowing if a future test ever needs to edit a pet. Separately, `DailyCheckInSheet`/`DailyCheckInModal`'s overlay can render off-screen if the page was scrolled first, due to a Framer Motion/`position:fixed` interaction (P4) — the Daily Check-In test should open the sheet from a fresh, unscrolled page load to avoid tripping over this pre-existing bug rather than accidentally "discovering" it.
  - **Home's "Add Pet" link is a double hop** (P4: navigates to `/pets` first, then requires a second tap) while the Pets screen's own Add Pet button opens the dialog in one hop. The Add Pet test should navigate directly to `/pets` and use its Add Pet button, not replicate Home's double-hop path, to keep the test aimed at the flow itself rather than incidentally re-testing a known nav quirk.
- **Locked-decision conflicts:** None found.

## Non-Goals

- Testing the Google OAuth login path (explicitly deferred — see Authentication section above).
- Testing account signup / email confirmation click-through itself (a separate, more involved flow — this spec covers signing *in*, not registering a brand-new account).
- Visual regression / screenshot-diff testing.
- Testing every flow in the app — this spec covers only the 5 flows explicitly prioritized. Broader coverage is a natural follow-up, not part of this batch.
- **Running in CI.** Decided: this ships local/manual-only for now (`npm run test:e2e`, run by hand). Wiring it into `.github/workflows/ci.yml` as an automatic check on every PR is a deliberate follow-up once the suite has proven reliable — not part of this spec.
- Fixing any of the bugs this testing effort might confirm (the Add Pet hang, the Vet Report status) — this spec is about building the tests that would reveal them, not the fixes themselves.

## Open Questions

None remaining — all three from the original draft are resolved: `test1@` is clean and ready to use, CI integration is deliberately deferred (see Non-Goals), and `test1@`'s password will be supplied via `.env.playwright` as documented above.
