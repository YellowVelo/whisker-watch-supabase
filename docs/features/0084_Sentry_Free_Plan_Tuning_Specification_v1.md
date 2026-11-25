# 0084_Sentry_Free_Plan_Tuning_Specification_v1

**Status:** Approved by Lynn 2026-11-25. Not yet built.
**Date:** 2026-11-25
**Branch:** `claude/spec-0084-sentry-tuning` (off `main` at `a7ffed9`)
**Migration:** none
**Process:** `/ship-feature`. Type: **PROTECTED**, because it adds two secrets (a Sentry upload token in Cloudflare's build, a check-in address in GitHub) and edits the nightly database backup workflow. Merging needs Lynn's OK after review passes.
**Related files:** `src/lib/errorMonitoring.js`, `src/lib/errorMonitoring.test.js`, `supabase/functions/_shared/errorReporting.ts`, `supabase/functions/ask-vet-assistant/index.ts` (the daily-cap warning, no code change expected), `vite.config.js`, `package.json`, `.github/workflows/db-backup.yml`, `.env.example`, `docs/testing/QA_Test_Plan.md` §5.12, `docs/features/0052_Production_Error_Monitoring_Specification_v1.md`

## Lynn — what I need from you

1. ~~Review and approve this spec~~ Approved 2026-11-25.
2. **Before the build, tell me your Sentry organization slug.** It's the word in your Sentry web address: `https://<this-part>.sentry.io/`. Blocks source map upload (Part A).
3. **After approval, create a Sentry upload token:** Sentry → Settings → **Auth Tokens** (under Developer Settings) → **Create New Token**. Then paste it into Cloudflare → Workers & Pages → `whisker-watch-supabase` (the production project, *not* staging) → Settings → **Build** → Variables and secrets → add a **secret** named `SENTRY_AUTH_TOKEN`. Paste it there only, never in chat. Blocks Part A from taking effect, but not the build or merge: without the token, the build simply skips the upload.
4. **After approval, create the backup cron monitor:** Sentry → **Monitors** → **Cron** → Add monitor. Name it `nightly-database-backup`, schedule `0 8 * * *`, time zone **UTC**, check-in margin **60 minutes**, max runtime **20 minutes**, project javascript-react, environment production. Sentry then shows a check-in address (on the monitor's setup / instructions tab, it looks like `https://o….ingest.sentry.io/api/…/cron/nightly-database-backup/…/`). Add it as a GitHub secret: GitHub → repo → Settings → Secrets and variables → Actions → New repository secret, named `SENTRY_CRON_URL`. Blocks Part C from taking effect, but not the merge: without it the backup runs exactly as today.
5. **After merge, promote branch `main`'s build in Cloudflare** (commit message will start "Spec 0084"). The app part only takes effect after this.

## Before You Approve This

1. **After this, only production reports to Sentry (your choice).** Errors on staging, the dev site, local runs and CI test runs stop appearing, for both the app and the backend functions. If something breaks on staging, you'll only see it on screen or in Supabase's function logs. The hourly "do all functions start" check (`function-health.yml`) keeps running on all three projects, so a function that crashes on startup is still caught everywhere.
2. **Biggest risk: production could go silent by mistake.** The new rule is "report only when the environment is named exactly `production`". That name comes from two settings outside the code: the Cloudflare production build's `VITE_SENTRY_ENVIRONMENT` and the production Supabase project's `SENTRY_ENVIRONMENT` secret. Both were confirmed as `production` on 2026-10-23 (spec 0066), but if either were spelled differently, production would stop reporting with no warning. Before the backend change goes out, I check the Supabase secret against `production` by comparing hashes. After the Cloudflare promotion, we confirm one real report arrives (see Test Plan).
3. **Network drops stop being reported.** "Failed to fetch", Safari's "Load failed", Firefox's "NetworkError…" and Supabase's `AuthRetryableFetchError` all mean the person's connection dropped, not a bug. Downside: if Supabase itself went down for everyone, Sentry would stay quiet about it. The uptime monitor watches the site, and the hourly function check watches the backend, so an outage still gets noticed. "Failed to fetch dynamically imported module" (someone running an old copy right after a deploy) stays reported, because it's a different problem.
4. **Source map files must never be public.** They're readable copies of the app's code. The build uploads them to Sentry and then deletes them before the site is published, so visitors can't download them. Cloudflare also builds PR branches in the production project, so those builds upload maps too. That's harmless: maps don't count against any quota.
5. **The daily-AI-cap warning (spec 0080) stays as is in production.** It's sent at most once per person per day, so it costs very little. On dev it was being set off by test runs, and the production-only rule stops that without touching `ask-vet-assistant`.
6. **Local Sentry testing changes.** Spec 0065-style checks ("send a deliberate error from my laptop and see it arrive") now need `VITE_SENTRY_ENVIRONMENT=production` set temporarily in the local `.env`. That's on purpose: nothing goes to Sentry from dev unless someone chooses to send it.
7. **Docs that say otherwise get updated in the same PR.** CLAUDE.md, spec 0052's status line and QA plan §5.12 currently say all three environments report and that test-account backend errors reach Sentry. `doc-updater` will propose the changes.
8. **Self-review:** no screens, copy or database changes. No duplicate code: this extends the existing `shouldSendEvent` filter and the existing `sentryEnabled` switch instead of adding a second mechanism. No new debt. The one guess in the Technical Spec, which commit name Cloudflare's build exposes, is marked as checked during the build.

## Functional Requirements

**Part A: readable errors**
1. Every production error in Sentry shows the real file name and line number from the app's source code, not scrambled one-line code.
2. Every production error says which release (which commit) it came from, so a new problem can be traced to the deploy that caused it.
3. Nobody visiting the site can download the readable copy of the code.

**Part B: only real problems use the quota**
4. Only the production site and production backend functions send errors to Sentry. Staging, dev, local runs and CI runs send nothing.
5. In the app, a dropped network connection is not reported. Real bugs still are, including "an old copy of the app couldn't load a new part" after a deploy.
6. Everything that already works keeps working: test and demo accounts stay excluded in the app, the app still loads normally with no Sentry configured, and backend reports still flush before the function stops.

**Part C: backup watch**
7. If the nightly database backup fails, or doesn't run at all, Sentry emails Lynn.
8. If the check-in address isn't configured, or Sentry can't be reached, the backup still runs and succeeds exactly as today. Monitoring must never break the backup.

## Acceptance Criteria

- **AC1 (FR4, app):** Given `VITE_SENTRY_ENVIRONMENT` is anything other than `production` (including unset), when the app records an error, then nothing is sent to Sentry. Given it is `production` and a DSN is set, the error is sent as today.
- **AC2 (FR4, backend):** Given a function's `SENTRY_ENVIRONMENT` is anything other than `production` (including unset), when it reports an error, nothing is sent. Given it is `production` and a DSN is set, it reports and flushes as today.
- **AC3 (FR5):** Given an error whose message contains "Failed to fetch", "Load failed" or "NetworkError when attempting to fetch resource", or whose type is `AuthRetryableFetchError`, when it reaches the app's filter, then it is dropped. "Failed to fetch dynamically imported module …" is **not** dropped.
- **AC4 (FR6):** Test and demo account errors are still dropped; `production`, `owner` and not-yet-signed-in errors are still sent (existing tests keep passing unchanged).
- **AC5 (FR1, FR2):** Given the production Cloudflare build has `SENTRY_AUTH_TOKEN`, when a deliberate error is triggered on the live production site after promotion, then Sentry shows it with a readable file and line from `src/` and a release matching the deployed commit.
- **AC6 (FR3):** The finished build output contains no `.map` files, and the published site serves none (`/assets/<any>.js.map` returns the app page or 404, not a map).
- **AC7 (build safety):** Given `SENTRY_AUTH_TOKEN` is not set (staging project, local builds, CI), `npm run build` still succeeds and uploads nothing.
- **AC8 (FR7):** Given `SENTRY_CRON_URL` is set, when the backup job runs, Sentry receives "in progress" at the start and "ok" on success or "error" on any failure. If no run happens by 09:00 UTC, Sentry marks it missed and emails Lynn.
- **AC9 (FR8):** Given `SENTRY_CRON_URL` is unset, or the check-in request fails, the backup job still completes and reports success when the backup itself succeeded.

## Test Plan

- AC1 → `[Vitest: src/lib/errorMonitoring.test.js]` new cases: load the module with environment `development`, `staging`, unset and `production`; `reportClientError` calls `captureException` only for `production`. Not UI-observable, so no Playwright test.
- AC2 → `[Deno]` a new small pure helper `isReportingEnvironment(env)` in `_shared/errorReporting.ts`, tested in a new `supabase/tests/error_reporting.test.ts` (`production` → true; `development`, `staging`, `Production`, empty, unset → false). Runs in CI's `edge-functions` job. No live Sentry call.
- AC3 → `[Vitest: src/lib/errorMonitoring.test.js]` new `shouldSendEvent` cases with Sentry-shaped events for each network message, the Supabase error type, and the dynamic-import message (kept).
- AC4 → `[Vitest]` the existing `shouldSendEvent` and `reportClientError` tests, unchanged. `[Playwright: error-monitoring.spec.js]` (app loads with no DSN) keeps running.
- AC5 → `[Manual]` after Lynn's Cloudflare promotion: I give Lynn a one-line browser-console command that throws a test error on the live site (signed out, so it isn't filtered), and we check the Sentry event together. Can't be automated: needs the real production build and Sentry.
- AC6 → `[Manual + build check]` during the build: run `npm run build` with a dummy setup and confirm `dist/` has no `.map` files; after promotion, request one `.js.map` address on the live site.
- AC7 → CI's existing `build` job (no token there) must stay green.
- AC8 → `[Manual]` after merge, Lynn runs Actions → Database Backup → **Run workflow** once; the Sentry monitor shows "in progress" then "OK". A failure path test: I don't break the real backup on purpose. The "error" status is checked by reading the workflow's `if: always()` step logic in review.
- AC9 → `[Manual]` the first `workflow_dispatch` run happens before `SENTRY_CRON_URL` is added, or with it unset, and must pass.
- **Seeding/access constraints:** none for the automated tests (pure functions). AC5, AC6 and AC8 need the production Cloudflare build and a real GitHub Actions run, which only happen after merge.

## Visual Reference

None. No screens change.

## Technical Spec

- **Schema:** none.
- **App (`src/lib/errorMonitoring.js`):**
  - `sentryEnabled = !!dsn && environment === 'production'`, where `environment = import.meta.env.VITE_SENTRY_ENVIRONMENT || 'development'` (already read today). `Sentry.init` is skipped otherwise, so `reportClientError`, `setSentryAccountType` and `clearSentryAccountType` no-op as they already do with no DSN. `Sentry.ErrorBoundary` in `App.jsx` works without init (it still shows `CrashFallback`).
  - `shouldSendEvent(event)` adds a network-noise check: drop when any `event.exception.values[]` has `type === 'AuthRetryableFetchError'`, or a `value` matching `/Failed to fetch|Load failed|NetworkError when attempting to fetch resource/` **and not** `/dynamically imported module/`. Matching is in `shouldSendEvent` (already unit-tested) rather than Sentry's `ignoreErrors`, so both rules sit in one tested place.
  - No `release` set by hand: the Sentry Vite plugin injects it into the bundle.
- **Build (`vite.config.js`, `package.json`):**
  - Add `@sentry/vite-plugin` as a devDependency, exact version.
  - `build.sourcemap: 'hidden'` (maps generated, but the JS files don't point to them).
  - Plugin options: `org` (Lynn's slug, item 2), `project: 'javascript-react'`, `authToken: process.env.SENTRY_AUTH_TOKEN`, `disable: !process.env.SENTRY_AUTH_TOKEN`, `release.name: process.env.WORKERS_CI_COMMIT_SHA` (falls back to the plugin's own git detection if unset), `sourcemaps.filesToDeleteAfterUpload: ['./dist/**/*.map']`, `telemetry: false`.
  - Placed last in `plugins`, after `VitePWA`. The PWA precache patterns (`js,css,html,…`) already exclude `.map`.
  - **To check during build:** that Cloudflare Workers Builds exposes `WORKERS_CI_COMMIT_SHA`, and the output folder the `cloudflare()` plugin uses (the delete pattern covers all of `dist/`).
- **Edge Functions (`supabase/functions/_shared/errorReporting.ts`):** export `isReportingEnvironment(env: string | undefined): boolean` (exactly `'production'`), and set `sentryEnabled = !!dsn && isReportingEnvironment(environment)`. Every caller (`serverError`, `reportError`) is unchanged. The `@sentry/deno@11.15.0` pin stays. After deploy, run `scripts/check-functions-start.sh` on all three projects as usual (0006 §11). All 14 functions import this helper, so all need redeploying to each project.
- **Backup (`.github/workflows/db-backup.yml`):**
  - First step `Sentry check-in: in progress`: `if [ -n "$SENTRY_CRON_URL" ]; then curl -fsS --max-time 10 "${SENTRY_CRON_URL}?status=in_progress" || true; fi`.
  - Last step `Sentry check-in: result`, `if: always()`: status `ok` when `job.status == 'success'`, else `error`, same guarded `curl … || true`.
  - `env: SENTRY_CRON_URL: ${{ secrets.SENTRY_CRON_URL }}`. A failed check-in never fails the job.
  - The monitor is created by Lynn in the dashboard (item 4), not by the workflow, so there's no Sentry SDK or CLI in the backup job.
- **`.env.example`:** comment explaining that only `production` reports, and how to temporarily test locally.
- **Design System compliance:** no UI changes, nothing to check.
- **Constraints from CLAUDE.md / locked decisions:** `@sentry/deno` stays pinned at 11.15.0. No raw `err.message` to the browser (unchanged). `reportClientError` remains the one app-side way to report. Backend changes go to all three Supabase projects. Lynn promotes the frontend. No `console.error` added in `src/`.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** none. There's exactly one client setup (`errorMonitoring.js`) and one backend setup (`errorReporting.ts`), and this extends both.
- **Technical debt nearby:** the docs (spec 0052, CLAUDE.md, QA plan §5.12) describe all-environment reporting, and two QA rows say "look for the deliberate error in Sentry after each environment's deploy". Those rows become production-only and are updated in this PR. `vite.config.js` sets `logLevel: 'error'`, which hides build warnings, including any the Sentry plugin prints. I'll check the plugin's upload result in the Cloudflare build log instead.
- **Orphaned features nearby:** none found.
- **Punch list / known issues in this area:** spec 0052 listed source maps and alerting as deferred non-goals. This spec delivers source maps, and Lynn sets up alerting in the dashboard.

## Non-Goals

- Performance tracing, session replay, logs or metrics (all still off, as in spec 0052).
- Source maps or releases for Edge Functions. Their stack traces are already readable TypeScript.
- Filtering test accounts in backend functions specifically. The production-only rule removes CI and test-run noise; test accounts rarely act on production.
- A cron monitor for `storage-backup.yml`. The free plan allows one; Lynn chose the database backup.
- Sentry alert rules, the uptime monitor (already on `https://wyskerwatch.com`, every 5 minutes) and inbound filters, all set by Lynn in the dashboard.
- Changing the daily-AI-cap warning.

## Open Questions

- Lynn's Sentry organization slug (item 2).
