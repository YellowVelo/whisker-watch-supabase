# 0055_E2E_CI_Integration_Specification_v1

**Status:** Draft
**Date:** 2026-08-13
**Related files:** `.github/workflows/ci.yml`, `playwright.config.js`, `e2e/global-setup.js`, `e2e/fixtures.js`, `.env.playwright.example`, `docs/features/0024_Playwright_E2E_Testing_Specification_v1.md`, `docs/features/0046_E2E_Onboarding_Step_Transition_Flakiness_Specification_v1.md`, `docs/launch-punch-list.md`

## Before You Approve This

- **This isn't a new idea — it's a planned follow-up that was deliberately deferred.** Spec 0024 (the original Playwright setup) shipped local-only on purpose, with CI wiring explicitly named as "a deliberate, separate follow-up once there's confidence the tests aren't flaky." This spec is that follow-up.
- **One test has an unresolved, unreproduced flake — this shapes the whole design.** Spec 0046 found and fixed a real timing bug in three onboarding tests, but `login.spec.js` also flaked once during that investigation and was never caught again — two full-suite reruns came back clean, and the original failure was never captured with enough detail (error message, trace) to diagnose. It might be fixed by coincidence, or it might not be. Wiring this straight in as a required, merge-blocking check risks blocking unrelated PRs on a red X nobody can explain yet. Your answer to the clarifying question was to run it as **visible-but-non-blocking for a trial period** — reported on every PR, but not required to merge — until it's proven stable, then flip it to required. That's what this spec builds.
- **The beta-signup test needs one more secret than the rest of the suite (`VITE_TURNSTILE_SITE_KEY`), which isn't in `.env.playwright.example` today.** `e2e/beta-signup.spec.js` drives the public `/beta` form, which requires Cloudflare Turnstile's public "always passes" test site key to render and auto-complete. That key currently only lives in `.env.example` (for local dev), not `.env.playwright.example`. It's a public, non-secret value (Cloudflare's own documented test key, safe to appear in a public repo) — this spec adds it directly into the CI workflow file rather than asking you to store it as a GitHub secret, since it isn't sensitive.
- **This spec cannot finish the job by itself — two manual steps are required from you, the same way backend deploys already are.** (1) Adding the new GitHub Actions secrets (listed in the Technical Spec below) in the repo's Settings → Secrets, since I don't have permission to do that. (2) Later, once the trial period has passed with no false-positive failures, flipping the new job to a *required* check in branch protection settings — also a GitHub repo-admin action I can't perform. Both are called out again in Non-Goals so they aren't lost.
- No Design System conflicts — this is CI/test-infrastructure only, no UI changes.

## Functional Requirements

Right now, the automated "click through the app like a real user" test suite (Playwright, see spec 0024) only runs when someone remembers to run it by hand. If a change breaks a real user flow — logging in, adding a pet, checking in, generating a vet report, sitter access, the public beta signup form, and so on — nothing stops that change from merging into `main` unnoticed.

This spec adds that suite as a new, automatic check that runs every time someone opens a pull request or pushes to `main`, the same way the existing lint/typecheck/test/build check and the backend integration-test check already do. For a trial period, it will report pass or fail visibly on every PR but will **not** block merging — so a genuine regression is now visible to everyone within minutes instead of being caught eventually (or not at all), while the one known-flaky test gets a chance to prove itself stable before it's allowed to block anyone's work.

## Acceptance Criteria

- **Given** a pull request is opened against `main`, **when** CI runs, **then** a new check runs the full Playwright suite against a real, disposable copy of the app (the existing `wysker-watch-dev` database — never staging or production) and reports pass/fail for the whole suite, visible on the PR the same way the existing checks are.
- **Given** the same trigger, **when** CI runs, **then** the new check also runs on every push to `main`, not just on pull requests — matching how the existing `frontend` and `edge-functions` jobs already trigger.
- **Given** the e2e check fails, **when** someone tries to merge the PR, **then** the merge is **not blocked** — during this trial period, the failure is visible (a red X on the check) but advisory only, not a hard gate.
- **Given** the e2e suite runs in CI, **when** it executes, **then** it uses the same test accounts and target project (`wysker-watch-dev`, `test1@wyskerwatch.com`, `test3@wyskerwatch.com`) already established for local runs — no new test accounts or a new Supabase project.
- **Given** the e2e suite runs in CI, **when** it executes, **then** it cannot write to, or connect to, the production Supabase project or the staging Supabase project under any failure mode — enforced by which secrets the workflow is given, not by convention.
- **Given** the trial period runs for 3 weeks from merge (through 2026-09-03) with no false-positive failures caused by the known `login.spec.js` flake or general CI-environment flakiness, **when** that window closes, **then** flipping the check to a required, merge-blocking gate is a small, well-defined follow-up (a branch-protection settings change) — not a re-implementation.

## Test Plan

- "New check runs the full suite on PR + push to main" → not a Playwright test itself (this is CI infrastructure, not app behavior) — verified by opening a real PR after implementation and confirming the new check appears and runs, plus checking a push to `main` triggers it too.
- "Suite runs against `wysker-watch-dev`, never staging/prod" → not independently Playwright-testable — verified by code review of the new workflow YAML (the secrets it's given are literally only capable of pointing at `wysker-watch-dev`, since that's the only project those secret values will exist for) plus a real CI run's logs showing the dev project URL.
- "Failure doesn't block merge during the trial period" → verified by inspection of the workflow YAML (the new job is not added to any required-status-check list) and, if useful, by intentionally breaking a test locally in a scratch branch to confirm the PR still shows itself as mergeable with a failing e2e check.
- "Uses existing test1@/test3@ accounts and dev project, no new accounts" → verified by code review — the new workflow step reuses `.env.playwright.example`'s existing key names, sourced from GitHub secrets, no new Supabase project or account is created.
- **Seeding/access constraints:** none beyond what the existing local suite already requires — the CI job needs the same test-account credentials and dev-project keys a developer already puts in their local `.env.playwright`, just supplied as GitHub Actions secrets instead. No new database access, no service-role/secret key given to CI (the suite already runs entirely on `test1@`'s and `test3@`'s normal signed-in RLS-scoped permissions, per spec 0024).

## Visual Reference

Not applicable — this is CI/test infrastructure, no UI.

## Technical Spec

- **Schema:** none.
- **Components/files touched:**
  - `.github/workflows/ci.yml` — add a third job, `e2e`, alongside the existing `frontend` and `edge-functions` jobs. Structure:
    - `runs-on: ubuntu-latest`, `timeout-minutes: 20` — originally estimated at 10 minutes from spec 0046's older, partial-suite timing. A real full local run on 2026-08-15 (all 44 tests, single worker, post-implementation) measured 7.1 minutes, which prompted a real investigation rather than just widening the number to fit: a grep of `e2e/` for `waitForTimeout`/`setTimeout`/`sleep` found zero hard-coded waits, and the 44 individual test durations sum to ~6.5 of that 7.1 minutes — meaning the time is genuine work (real browser-driven round trips to `wysker-watch-dev`), not something padded or wasted. The suite is single-worker by design (`playwright.config.js`'s `workers: 1`), not by accident — all 44 tests share and mutate one live account's (`test1@`) data, so running them concurrently would mean tests corrupting each other's state; that's *why* 44 tests' durations simply add up instead of overlapping. Actually cutting the ~7-minute baseline down would require parallelizing across multiple independent test accounts — a real infrastructure change, tracked below as a possible future follow-up, not attempted in this spec. 20 minutes is genuine headroom over the measured 7.1-minute baseline for `npm ci` + Playwright browser install (chromium + webkit) + a CI runner typically running slower than a local dev machine.
    - `npm ci`, then `npx playwright install --with-deps chromium webkit` (both browser engines are used — `chromium` for the main suite, `webkit` with an iPhone device profile for `pwa-ios-safari.spec.js` — see `playwright.config.js`'s `projects` array).
    - Environment variables passed directly as job/step `env:`, sourced from new GitHub Actions secrets (see below) — no `.env.playwright` file is written to disk in CI; Vite and Node both pick up `VITE_`-prefixed and plain process env vars directly, matching how the existing `edge-functions` job already passes its secrets as `env:` rather than writing a file.
    - `run: npx playwright test`.
    - **`continue-on-error: true` on the job (or step)** — this is the actual mechanism for "visible but non-blocking": GitHub still shows the check and its real pass/fail result on the PR, but a failure doesn't count against mergeability. This is intentionally different from simply not adding the job to branch protection's required list (which is also true here) — `continue-on-error` additionally means a failing e2e run won't show the PR's overall CI status as red, avoiding a full-suite failure look for what is, right now, a check we don't yet trust to fail for the right reasons every time.
  - `.env.playwright.example` — add a documented (non-secret) `VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA` line, matching the value already in `.env.example`, so a local `.env.playwright` and CI both provide it. This is Cloudflare's own publicly documented "always passes" test key, not a secret.
- **API / edge functions:** none changed. The suite continues to exercise existing, already-deployed `wysker-watch-dev` Edge Functions exactly as it does locally.
- **Design System compliance:** not applicable — no UI/component changes, test-and-CI-only.
- **Constraints from CLAUDE.md / locked decisions:**
  - Respects "Frontend deploys are done manually by Lynn, not Claude" — this job never builds for deploy or touches Cloudflare; it runs the existing local dev server (`npm run dev`) the same way `npm run test:e2e` already does locally.
  - Respects the three-Supabase-projects-are-separate rule — this job is only ever given `wysker-watch-dev` credentials; the GitHub secrets it's told to use don't exist for staging or prod, so there's no value it could accidentally use to reach them.
  - Consistent with the existing CI convention (documented in CLAUDE.md) that "an account with bypass permission can still push directly without CI blocking it" — this spec doesn't change that; it only adds a new, currently-non-blocking check.

### New GitHub Actions secrets needed (manual step for you, not part of this PR)

Reusing the same `wysker-watch-dev` project and `test1@`/`test3@` accounts already set up for local `.env.playwright` — no new accounts or project:

| Secret name | Value source |
|---|---|
| `PLAYWRIGHT_DEV_SUPABASE_URL` | `wysker-watch-dev` → Settings → API → Project URL (same value as local `.env.playwright`'s `VITE_SUPABASE_URL`) |
| `PLAYWRIGHT_DEV_SUPABASE_ANON_KEY` | `wysker-watch-dev` → Settings → API → Publishable key |
| `PLAYWRIGHT_TEST1_EMAIL` / `PLAYWRIGHT_TEST1_PASSWORD` | `test1@wyskerwatch.com`'s real credentials, same as local `.env.playwright` |
| `PLAYWRIGHT_TEST3_ADMIN_EMAIL` / `PLAYWRIGHT_TEST3_ADMIN_PASSWORD` | `test3@wyskerwatch.com`'s real credentials, same as local `.env.playwright` |

(Named with a `PLAYWRIGHT_DEV_` prefix for the URL/key pair specifically to avoid colliding with the `edge-functions` job's existing `SUPABASE_DEV_URL` / `sb_publishable` secrets, which point at the same project but are consumed by a different test runner with different expectations about credential format — keeping them separate avoids one job's secret rotation silently breaking the other.)

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** none — no existing CI job runs Playwright or any browser-driven test today. The `edge-functions` job tests server-side functions directly over HTTP, which is a different layer entirely.
- **Technical debt nearby:** the unresolved `login.spec.js` flake from spec 0046 (see "Before You Approve This") is the main one — this spec doesn't fix it, it designs around it (non-blocking trial period) so it can be caught with a real trace next time it happens, per spec 0046's own recommendation.
- **Orphaned features nearby:** none found.
- **Punch list / known issues in this area:** `docs/launch-punch-list.md` (line 17) already lists "e2e, Edge Function integration tests, in-browser smoke test" as one of the pre-launch verification layers, implying CI coverage was always the intended end state, not a new ask. The `login.spec.js` flake itself is tracked as an explicit Open Question in spec 0046, not yet closed — this spec doesn't close it, just designs around it as noted above.

## Non-Goals

- **Fixing the `login.spec.js` flake itself.** Still unresolved per spec 0046 — this spec's non-blocking design is a deliberate way to ship CI integration without waiting on a fix that has no reproducible bug to point at yet.
- **Making the e2e check a required, merge-blocking gate.** Explicitly deferred to a later, smaller follow-up once the trial period shows no false-positive failures — a branch-protection settings change only you can make, not something this spec's implementation includes.
- **Adding GitHub Actions secrets.** Also a manual step only you can do (see "Before You Approve This") — this spec documents exactly what's needed but doesn't (can't) create the secrets itself.
- **Expanding test coverage to new flows.** This spec only changes *where* the existing suite runs, not *what* it covers.
- **Caching Playwright browser binaries between CI runs for speed.** A reasonable later optimization once the job's real run time in CI is known, not assumed up front.
- **Parallelizing the suite to reduce its ~7-minute baseline runtime.** Investigated during implementation (see Technical Spec's timeout reasoning) — the ~7 minutes is genuine work, not waste, and is serialized because every test shares one live account's data. Actually speeding it up would mean adding multiple independent test accounts/workers, a real infrastructure change with its own test-isolation risks, worth its own spec if it's ever wanted — not folded in here.

## Open Questions

None remaining — timeout is set to 20 minutes, sized against a real, investigated 7.1-minute full local baseline (2026-08-15) rather than the earlier 10-minute estimate; the trial period is fixed at 3 weeks from merge (through 2026-09-03); and the ~7-minute runtime itself is accepted as the genuine cost of the suite's current single-worker, shared-account design, with parallelizing it left as a possible future follow-up (see Non-Goals) rather than pursued now. All confirmed with you.
