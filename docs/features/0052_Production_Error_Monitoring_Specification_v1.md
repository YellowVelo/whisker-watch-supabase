# 0052_Production_Error_Monitoring_Specification_v1

**Status:** Implemented (2026-08-11) — verified end-to-end: a real client-side error was confirmed reaching the Sentry dashboard. Edge Function delivery uses the same helper and has secrets set on all 3 Supabase projects, but hasn't had its own live-fire test yet. Sourcemaps and alerting remain deferred (see Non-Goals). Re-confirmed working 2026-09-01 after a suspected regression was investigated and disproven — see spec 0065.
**Date:** 2026-08-10
**Related files:** `src/App.jsx`, `src/main.jsx`, `src/lib/PageNotFound.jsx`, `src/lib/analytics.js`, `src/lib/AuthContext.jsx`, `supabase/functions/_shared/`, `supabase/functions/ask-vet-assistant/index.ts` (and the other 13 Edge Functions), `wrangler.jsonc`, `.env.example`, `.github/workflows/ci.yml`

## Before You Approve This

- **Sourcemaps are deliberately out of scope for this spec** (moved to Non-Goals after review) — without them, production error stack traces point at minified/scrambled code instead of readable file/line info, so this monitoring will tell you *that* and roughly *where* something broke, not the exact line, until a follow-up spec adds sourcemap upload. That's a reasonable place to start, not a shortcut being taken silently.
- **A documented Sentry limitation affects Edge Functions specifically:** Sentry's own Deno SDK does not fully separate "scope" between requests when Supabase reuses a warm Edge Function instance for back-to-back invocations. In plain terms: if we're not careful, error/user context from one person's request could theoretically leak into another person's error report in the same warm instance. The technical spec below requires resetting Sentry's context at the start of every request specifically to prevent this — flagging it here so it doesn't get quietly skipped as an implementation detail.
- No other conflicts, duplicate functionality, or locked-decision violations were found — this is genuinely new ground, nothing to reconcile with existing code.

## Functional Requirements

- If the app crashes while someone is using it (a bug in a page's code, not a network hiccup), they should see a plain "something went wrong" screen with a way to get back to the app, instead of a blank white screen with no explanation — which is what happens today.
- Whenever that kind of crash happens, or any of the backend functions (Edge Functions) hit an unexpected error, a record of it should be sent to a monitoring tool (Sentry) so it can be reviewed after the fact, without anyone needing to ask a user what went wrong or dig through server logs.
- Each error record should say which environment it came from (local dev, staging, or the live production site) so a report from a developer testing on staging is never confused with a report from a real user in production.
- Errors that happen on test/demo/sandbox accounts (the same "not a real user" flag already used for analytics) should not show up in the error monitoring tool — only real users' errors should land there.
- This is capture-and-review only for now: errors show up in a Sentry dashboard for someone to check periodically. No Slack/email alerts are being wired up in this pass.

## Acceptance Criteria

1. **Given** a bug causes a page in the app to crash while a real user is using it, **when** the crash happens, **then** the user sees a friendly "something went wrong" screen with a button to return home, instead of a blank white page.
2. **Given** that same crash, **when** it happens on a real (non-sandbox) production account, **then** a record of it appears in the Sentry dashboard, tagged with the environment ("production").
3. **Given** an Edge Function (e.g. `ask-vet-assistant`, `sign-up`, `delete-pet`) throws an unexpected error while handling a request, **when** that happens, **then** a record of it appears in Sentry tagged with which function and which environment (dev/staging/production) it came from.
4. **Given** an error happens on a test/demo/sandbox account, **when** it's captured client-side, **then** it is not sent to Sentry at all.
5. **Given** the same local-dev environment has no Sentry configuration set up (e.g. a contributor hasn't been given a DSN), **when** an error occurs, **then** the app and Edge Functions continue to work normally — monitoring is silently a no-op, it never breaks the app itself.

## Test Plan

- AC1 (fallback screen on crash) → **Not covered by an automated Playwright test.** Reliably forcing a real React render crash from an external, black-box browser test requires either a dedicated "throw an error" test hook baked into the app (extra surface/tech debt for a single test) or reaching into component internals Playwright can't touch. This will be verified manually in the browser during implementation (a temporary forced `throw` in a component, removed before commit) and confirmed a second time by checking that Sentry actually received the event.
- AC2 (production error reaches Sentry, tagged) → **Not portable to this repo's Playwright suite.** Sentry is a third-party service with no local/mock instance, and reading events back would need a Sentry API token — a credential this repo has deliberately never added to `.env.playwright` (see `e2e/` conventions: no privileged/external-service keys in the test environment). Verified manually: trigger a test error in a non-sandbox context, confirm it appears in the Sentry project UI.
- AC3 (Edge Function errors reach Sentry, tagged by function + environment) → Same reasoning as AC2 — external service, no repo-side way to assert receipt. Verified manually per function during implementation, spot-checked against wysker-watch-dev first (matching this repo's existing "deploy to dev before merging Edge Function changes" convention from `ci.yml`).
- AC4 (sandbox accounts excluded) → **Not covered by Playwright either**, for the same reason as AC2 (would require querying Sentry to prove absence). Verified manually: trigger an error while signed into a sandbox/test account, confirm nothing appears in Sentry.
- AC5 (no-DSN = silent no-op, app still works) → **This one is testable and should get a Playwright test.** Run the existing smoke-level navigation flow (any flow that already exists, e.g. login → home) with the Sentry init code present but no DSN configured, and assert the page loads normally with no thrown errors. This is the one behavior that's actually observable through normal app usage rather than through Sentry's own dashboard.
- **Seeding/access constraints:** None of the above need new test data or elevated Supabase access — the constraint here is entirely "Sentry is external and this repo's E2E suite has no credentialed access to it," not a data-seeding problem.

## Visual Reference

None provided. The one new piece of UI (the crash fallback screen) should visually match the existing `PageNotFound.jsx` pattern — centered card, `text-muted-foreground`/`text-foreground` tokens, a single `Button` action — rather than introducing a new visual style, since that page already solves "something's wrong, here's a clear way back" for the 404 case.

## Technical Spec

- **New dependency (client):** `@sentry/react` (official Sentry React SDK — includes browser error capture, an `ErrorBoundary` component, and automatic `window.onerror`/`unhandledrejection` capture).
- **New dependency (Edge Functions):** Sentry's official Deno SDK, imported via `npm:@sentry/deno` inside `supabase/functions/_shared/` (Deno's `npm:` specifier support, already relied on implicitly since Edge Functions run on Deno — confirmed against Supabase's own "Monitoring with Sentry" guide for Edge Functions).
- **Client init (`src/main.jsx`):** `Sentry.init()` called before `ReactDOM.createRoot(...).render(...)`, reading `VITE_SENTRY_DSN` and `VITE_SENTRY_ENVIRONMENT` from env vars. If `VITE_SENTRY_DSN` is unset (e.g. local dev without one configured), skip `Sentry.init()` entirely rather than calling it with an empty string — this is what makes AC5's no-op behavior explicit rather than relying on the SDK's own fallback behavior.
- **Client crash boundary (`src/App.jsx`):** Wrap `<AuthenticatedApp />` (or the whole `<Router>` tree) in Sentry's `Sentry.ErrorBoundary` component with a `fallback` render prop matching the `PageNotFound.jsx`-style layout described above. This replaces "no error boundary exists" (finding #1 below) rather than adding a second, competing one.
- **Sandbox exclusion (client):** `AuthContext.jsx` already resolves the signed-in user; once `account_type` is known (same lookup pattern as `getCachedAccountType` in `analytics.js`), call `Sentry.setTag('account_type', accountType)`. `Sentry.init()`'s `beforeSend` hook checks this tag and returns `null` (drops the event) when `account_type !== 'production'`, per AC4.
- **Environment tagging (client):** `VITE_SENTRY_ENVIRONMENT` set per deploy target — `development` in local `.env` (per `.env.example`'s existing pattern), `staging` in the Cloudflare Pages build environment for the staging build, `production` in the Cloudflare Pages build environment for production. One Sentry project, one DSN, environment distinguished entirely by this tag (per your "one project" answer) — matches the existing `VITE_SUPABASE_URL`-per-environment pattern already documented in `CLAUDE.md`.
- **Edge Function shared helper (`supabase/functions/_shared/errorReporting.ts`, new file):** A small wrapper around `Sentry.init()`/`Sentry.captureException()` that each of the 14 functions' top-level `catch` blocks calls instead of (in addition to) their current `console.error`. Reads `SENTRY_DSN` and `SENTRY_ENVIRONMENT` from `Deno.env` (set as a Supabase Edge Function secret per project — `wysker-watch-dev`, `wysker-watch-staging`, `Whisker-Watch` prod — same DSN value, different `SENTRY_ENVIRONMENT` value per project, and **never** set on the disposable `wysker-watch-restore-scratch` project). If `SENTRY_DSN` is unset, the helper no-ops (AC5), so CI's edge-functions integration test job (`ci.yml`) needs no new secret to keep passing.
- **Per-request scope reset (Edge Functions) — required, not optional:** Per Sentry's own documented limitation for its Deno SDK, a warm/reused Edge Function instance does not automatically separate context between requests. The shared helper must call `Sentry.withScope()` (or manually clear tags/user context) at the start of each request handler, so one user's request context can never bleed into another's error report on a reused instance. This is the concrete fix for the flag raised in "Before You Approve This."
- **Design System compliance:** Checked against `docs/foundation/0005 Design System.md` including the 2026-07-30 Amendments. The only new UI is the crash fallback screen, modeled directly on `PageNotFound.jsx`, which already uses the compliant patterns (Inter-only via the shared `Button` component, semantic `text-foreground`/`text-muted-foreground` tokens, no raw hex, no serif face, 13px+ text). No new one-off violations introduced, and no existing systemic violation is being extended.
- **Constraints from CLAUDE.md / locked decisions:** No conflicts. This doesn't touch the Vibe/scoring data model, doesn't add a new AI-facing prompt (so `aiGuardrails.js` isn't implicated), and doesn't add a new single-day check-in save path. It does touch all three Supabase projects (new secrets) and the Cloudflare build env — both are called out explicitly above so this doesn't join the list of "backend changes that only shipped to one project."

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** None found. `analytics.js` is a first-party event log for product analytics, not error monitoring — no overlap, though its `account_type` exclusion pattern is reused here by design (see Technical Spec).
- **Technical debt nearby:** The main finding *is* the debt: no `ErrorBoundary` exists anywhere in `src/App.jsx` today, so any uncaught render error currently produces a silent blank white screen with zero record of what happened, client-side or server-side. This spec is the fix, not something found *near* an unrelated change.
- **Orphaned features nearby:** None found.
- **Punch list / known issues in this area:** Nothing on `docs/launch-punch-list.md` or elsewhere currently mentions error monitoring, Sentry, or crash reporting — this spec isn't superseding or duplicating a planned item.

## Non-Goals

- Performance monitoring / transaction tracing (Sentry's "Performance" product) — this spec is error capture only. `tracesSampleRate` should be left at `0`/unset.
- Session replay.
- Real-time alerting (Slack/email on new errors) — dashboard-only per your answer; a natural fast-follow spec once the team has a sense of real error volume.
- Retrofitting every existing `try/catch` block across the app (55+ `console.error`/`console.warn` call sites in `src/`) to explicitly call `Sentry.captureException`. This spec covers *uncaught* errors (the client crash boundary + Edge Function top-level catches) automatically; deliberately-caught-and-handled errors elsewhere are not touched, since surfacing all of those is a much bigger, separate scoping exercise.
- **Sourcemap upload and per-release tracking.** This means production stack traces will show minified/scrambled code locations rather than the real file and line number. Deferred deliberately: getting basic capture (the crash screen, DSN wiring, environment tags) working and proven first is the higher-value, lower-risk step; sourcemaps are a natural fast-follow spec once that's confirmed working, and add their own setup (a Sentry auth token as a new build secret).

## Open Questions

- **Sentry plan/quota:** free-tier Sentry plans cap monthly error events; with sandbox-account exclusion in place this should stay well under typical free-tier limits pre-launch, but worth a quick check once real production volume is visible post-launch. No action needed now.
