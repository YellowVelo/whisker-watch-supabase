# 0078_Error_Reporting_And_Edge_Function_Reliability_Specification_v1

**Status:** Built 2026-11-22. All 14 functions live and tested on dev; staging and prod pending (deploy, then the startup check), then frontend promotion.
**Date:** 2026-11-22
**Branch:** `claude/error-reporting-reliability`
**Migration:** none expected. `0060` is reserved for this spec in case the build finds it needs one.
**Punch list:** PA-15 (P1), PA-62 (P1), PA-34 (P2), PA-35 (P2), plus one item found while investigating (raw "non-2xx" error text shown to people, folded in by Lynn's choice on 2026-11-22). Pre-Alpha Audit tab, `docs/planning/Wysker_Watch_Launch_Plan.xlsx`.
**Related files:** `supabase/functions/_shared/errorReporting.ts`, all 14 `supabase/functions/*/index.ts`, `supabase/functions/_shared/*.ts` (imports), `src/lib/errorMonitoring.js`, the 26 `src/` files that call `console.error` (list in Technical Spec), `src/components/PetProfileContent.jsx`, `src/pages/Login.jsx`, `src/pages/Settings.jsx`, `src/components/InviteCoOwnerDialog.jsx`, `src/components/InviteSitterDialog.jsx`, new `scripts/check-functions-start.sh`, new `.github/workflows/function-health.yml`, new `supabase/tests/function_hygiene.test.ts`, new `src/lib/errorMonitoring.test.js`, new `e2e/friendly-function-errors.spec.js`, `.github/workflows/ci.yml`, `deno.lock`, `docs/foundation/0006 Technical Standards.md` §11, `docs/testing/QA_Test_Plan.md` §5.12.

## Lynn — what I need from you

1. **Review this spec and say "approved" (or tell me what to change).** This blocks everything. I write no code until you approve.
2. **Approve the new wording** in "Copy for your approval" below: one new error message and three fallback messages. This is part of approving the spec.
3. **Later, when shipping (I'll tell you when):** deploy all 14 functions to staging and prod. This time it's every function, because every one gets its library versions pinned. After each project I'll run the new startup check and show you the result. Then promote the frontend build in Cloudflare (branch `main`, commit message starting "Spec 0078").
4. **Later, one Sentry check (5 minutes):** after the frontend is live, I'll ask you to look at the Sentry dashboard for one test event from your own login. Today the app drops every error from your account. This confirms that's fixed.

## Before You Approve This

1. **Every backend function gets redeployed, on all 3 projects.** Pinning versions (PA-62) changes every function's code, so all 14 need a deploy. That's more than usual. It's also exactly what went wrong on 11-21, when a deploy quietly pulled in a broken Sentry version. I pin the Supabase library to `2.119.2`, the newest release since 2026-11-19. On dev, 6 functions were deployed after that date and already run it, including spec 0077's two invite functions, which we tested (invite-co-owner, invite-sitter, delete-pet, delete-account, reset-sandbox-account, sign-up). **The other 8 were last deployed earlier (7 on 2026-10-20, ask-vet-assistant on 11-16), so for them this is a real upgrade from an older 2.x version.** Staging and prod are likely similar. Why I think it's safe: it's the same major version, already proven on 6 of our functions, and every function goes through dev first, then the Deno integration tests and the startup check, before staging and prod. I'll stop if anything fails on dev.
2. **The hourly check is only as punctual as GitHub.** PA-63 found that GitHub starts our nightly backups about 8 hours late, because GitHub delays scheduled jobs when it's busy. An "hourly" check may really run every few hours some days. That's still far better than the 22 hours sign-up was down unnoticed on 11-21, but it isn't a pager. If it fails, GitHub emails whoever last edited the workflow file (that's me, through your GitHub account, so the email goes to you). The check needs no passwords or keys: it only asks each function "are you awake?" (an `OPTIONS` request, the same harmless request a browser sends before a real one). I confirmed today that dev's functions answer that with no login.
3. **The check can't catch every kind of break.** It proves each function *starts*. It can't prove a function *works* (for example, that sign-up actually sends an email). The 11-21 outage was a startup crash, so this would have caught it. A logic bug wouldn't show up here.
4. **More errors will reach Sentry, so the dashboard will get busier.** Today only 5 places in the app report to Sentry. After this, all 65 places that log an error will. Your own account starts reporting too. Test and demo accounts stay filtered out of the app's reports, as you chose. (Backend functions already report every account, test ones included; that doesn't change.) I don't know your Sentry plan's monthly error allowance. With ~13 real accounts it's unlikely to matter, but a bug that repeats on every screen load could use it up fast. Sentry already groups repeats of the same error into one issue. If one place floods it, we fix that place.
5. **Backend errors stop showing internal details to people (PA-35), and a few people will see a plainer message.** Today, when a backend function hits an unexpected error, it sends the raw technical text (database messages, for example) back to the screen. Register, Beta signup and Early Adopters show that text to visitors. After this, the screen gets a plain message and Sentry gets the detail. The specific, friendly messages people need ("Too many attempts. Please try again later.", "This action is only available for test or demo accounts.") are kept as they are. Only the catch-all "something unexpected broke" replies change.
6. **Found while investigating (folded in, your choice):** when Delete Pet, Delete Account, Reset Sample Data, Seed Sample Data or demo sign-in fail, the screen shows "Edge Function returned a non-2xx status code". That's the Supabase library's own wording for "the server said no", and it hides the server's real, friendly reason. All 5 screens make the same mistake. I'll fix them to show the server's message, or a plain fallback.
7. **Error reports from backend functions get a moment to send before the function shuts down (PA-34).** A function can be stopped as soon as it replies, so a Sentry report still on its way can get lost. The fix lets the reply go out first, then keeps the function alive (up to 2 seconds) until the report is sent. People won't wait any longer. It stays on Sentry `11.15.0`. This doesn't need the newer version that crashed everything; the "wait until sent" feature is already in 11.15.0. I'll still test it on dev before staging and prod, as the Sentry note in CLAUDE.md requires.
8. **The "stuck spinner" part of PA-15 was mostly fixed already.** Specs 0072 and 0073 fixed the main case (the save fails and the spinner never stops). Two small gaps remain, and I'll close both: (a) if anything else unexpected fails mid-save (e.g. the connection drops), the spinner still sticks, and (b) removing a sitter has no error handling at all. If it fails, nothing happens and the owner gets no message. That needs one new message (below).
9. **An old file is out of date, and I'll update it.** `deno.lock` (a file that records exact library versions for local test runs) was last updated in August and still lists Supabase library `2.110.7`. The deployed functions don't read it; they ignore it. So local tests have been running a different version than production. I'll refresh it so they match.
10. Self-review: no duplicate features found. Two shared error helpers already exist (`reportError` for functions, `errorMonitoring.js` for the app), and this spec extends both instead of adding new ones. No conflicts with locked decisions. No new debt, except one judgment call: 3 of the 65 app error sites are expected, harmless failures (for example the CAPTCHA widget failing to load on a slow connection). I'll still report them, tagged so they're easy to filter. Leaving some sites out would mean the rule is "most", not "all".

## Copy for your approval

| Where | When it shows | Wording |
|---|---|---|
| Share with Sitter dialog | Removing a sitter fails | "We couldn't remove that sitter. Please try again." *(matches the co-owner dialog's existing wording)* |
| Delete Pet | Server gives no reason | "We couldn't delete this pet. Please try again." *(already the fallback today; now it actually shows)* |
| Delete Account | Server gives no reason | "Unable to delete account. Please try again later." *(already the fallback today; now it actually shows)* |
| Any backend function | Unexpected error (catch-all) | "Something went wrong. Please try again." *(same wording as the app's existing AI error, `aiErrorText`)* |

## Functional Requirements

1. **Every Edge Function library version is exact (PA-62).** Every `npm:` and `jsr:` import in `supabase/functions/` names a full `x.y.z` version. Nothing floats on `@2` or `@1`.
2. **A startup check covers every function on every project (PA-62).**
   - A script, `scripts/check-functions-start.sh <project-url>`, sends `OPTIONS` to every function folder in `supabase/functions/` (except `_shared`) and fails if any doesn't answer 200. It reads the list of functions from the folder, so a new function is covered automatically.
   - It runs after every function deploy (added to the §11 deploy checklist) and **every hour** on dev, staging and prod, through a new GitHub Actions workflow. A failure emails the workflow owner.
3. **Backend catch-all errors are reported, then answered with a plain message (PA-35, PA-15).** A new shared helper, `serverError(err, tags, cors)`, in `_shared/errorReporting.ts`, does three things in one step: logs the error, reports it to Sentry, and returns a 500 with `{ error: 'Something went wrong. Please try again.' }`. Every function's top-level catch uses it. Intentional 4xx messages are unchanged. `send-email` and `generate-vet-report` keep their structured `{ error: { code, message } }` format (their catch-alls already return fixed text). The vet-report screen (`vetReportClient.js`) reads `error.message` from that format, so changing it would break the screen.
4. **Raw library messages in error replies are replaced (PA-35).** The 5 places that return a Supabase library's own error text to the browser (`linkError.message`, `recoveryLinkError.message` and the inner `err.message`, in `invite-co-owner` and `invite-sitter`) report it to Sentry and return a plain message instead.
5. **Sentry reports from functions finish sending (PA-34).** After a report, the function keeps running for up to 2 seconds in the background (`EdgeRuntime.waitUntil(Sentry.flush(2000))`) without delaying the reply. If `EdgeRuntime` isn't there (local tests), it waits for the flush directly.
6. **The app reports every logged error to Sentry (PA-15).** A new helper, `reportClientError(err, { feature })`, in `src/lib/errorMonitoring.js`, logs to the console and reports to Sentry. It replaces all 65 `console.error` calls in `src/`. It does nothing extra when no Sentry DSN is set.
7. **Lynn's own account reports; test and demo don't (PA-15).** The app's Sentry filter drops events only when `account_type` is `test` or `demo`. `production`, `owner`, and "not known yet" (before sign-in) are sent.
8. **Screens show the server's real reason, not "non-2xx" (found while investigating).** Delete Pet, Delete Account, Reset Sample Data, Seed Sample Data and demo sign-in read the server's `{ error }` message from the response, the same way `Register.jsx` already does. If there isn't one, they show their existing fallback. One shared helper does this, so the 5 screens can't drift apart.
9. **Invite dialogs can't get stuck (PA-15).** Both invite dialogs' save handlers always clear "saving", whatever fails (`try/finally`). Removing a sitter that fails shows "We couldn't remove that sitter. Please try again." and reports to Sentry.

## Acceptance Criteria

- **AC1.** No `npm:` or `jsr:` import under `supabase/functions/` lacks an exact `x.y.z` version. `@sentry/deno` is still `11.15.0`; `@supabase/supabase-js` is `2.119.2`; `@std/encoding` is `1.0.11`.
- **AC2.** `scripts/check-functions-start.sh` exits 0 on dev with all 14 functions listed as 200, and exits non-zero (naming the function) if any function answers anything else.
- **AC3.** `.github/workflows/function-health.yml` runs hourly and on manual trigger, checks all 3 projects, and its first manual run is green.
- **AC4.** Every function's top-level catch returns `{ error: 'Something went wrong. Please try again.' }` with status 500, and no reply anywhere contains a raw `err.message` / `linkError.message` / `recoveryLinkError.message`.
- **AC5.** A deliberate error on dev (a malformed JSON body sent to `ask-vet-assistant` as test1@) shows up in Sentry within 2 minutes, tagged `function: ask-vet-assistant`, and the caller gets the plain message.
- **AC6.** The app's Sentry filter sends `production`, `owner` and untagged events, and drops `test` and `demo`.
- **AC7.** No `console.error` call remains in `src/` outside `errorMonitoring.js` itself.
- **AC8.** When `delete-pet` answers with an error, the Delete Pet screen shows the server's message (or the fallback), never "non-2xx". Same for the other 4 screens in FR8.
- **AC9.** When removing a sitter fails, the dialog shows "We couldn't remove that sitter. Please try again." and the sitter is still listed.
- **AC10.** When the invite save fails unexpectedly, the Send button stops spinning and an error shows.
- **AC11.** After the staging and prod deploys, the startup check passes on both.

## Test Plan

| AC | Test | How |
|---|---|---|
| AC1 | **Automated (Deno, CI):** new `supabase/tests/function_hygiene.test.ts` | Reads every `.ts` file under `supabase/functions/` and fails on any `npm:`/`jsr:` import without an exact version. Runs in the existing `edge-functions` CI job. No network, no logins. This is what keeps a future function from floating again. |
| AC2 | **Manual, by me:** run the script against dev | Not a Playwright test: it checks backend deploys, not the app. Failure case checked by pointing it at a function name that doesn't exist. |
| AC3 | **Manual, by me:** trigger the workflow once with `gh workflow run` and confirm it's green | It's a schedule; there's nothing to test in a browser. |
| AC4 | **Automated (Deno, CI):** same `function_hygiene.test.ts` | Fails if any `index.ts` returns `.message` inside a reply, and checks every `index.ts` imports `serverError`. Plus a unit test of `serverError` itself (status 500, plain body, CORS headers present). |
| AC5 | **Manual, by me, on dev** | Sentry is an outside service; no automated test can see its dashboard (same as spec 0052/0066). I check the event arrived through Sentry's dashboard and show you. |
| AC6 | **Automated (Vitest, CI):** new `src/lib/errorMonitoring.test.js` | The filter moves into a small exported function (`shouldSendEvent`), tested with all 5 cases. Plus a test that `reportClientError` logs and reports. |
| AC7 | **Automated (Vitest, CI):** same file | Scans `src/` for `console.error` outside `errorMonitoring.js`. |
| AC8 | **Playwright:** new `e2e/friendly-function-errors.spec.js` | Uses `page.route` (already used in 8 spec files, e.g. `invite-email-responses.spec.js`) to make the browser's `delete-pet` call get a 500 with `{ error: 'Pet not found' }`, then checks that text shows and "non-2xx" doesn't. Never actually deletes anything. Delete Account is checked the same way, intercepted, so test1@ is never really deleted. Demo sign-in and the two Settings reset buttons share the same helper and get a Vitest unit test, not their own e2e (demo sign-in needs the demo login, which isn't in `.env.playwright`). |
| AC9 | **Playwright:** added to `e2e/invite-sitter.spec.js` | Intercepts the `pet_sitter_access` delete request and makes it fail, then checks the message and that the sitter is still listed. It seeds its own invite, the way that file already does, so it doesn't depend on other tests' data. |
| AC10 | **Playwright:** added to `e2e/invite-email-responses.spec.js` | Aborts the invite function call mid-save (`route.abort()`), then checks the button is clickable again and an error shows. |
| AC11 | **Manual, by me, during rollout** | Same script as AC2, per project. |

Test order: every new e2e test seeds and removes its own rows and only intercepts its own requests, so none depends on another's leftovers. None changes test1@'s real data.

## Visual Reference

No mockups. The only visible change is error text in existing places (see Copy for your approval).

## Technical Spec

### Backend (`supabase/functions/`)

- **`_shared/errorReporting.ts`:**
  - `reportError()` keeps its signature. After `captureException`, it schedules `Sentry.flush(2000)` with `EdgeRuntime.waitUntil` when `globalThis.EdgeRuntime` exists, or awaits it otherwise. `flush` is exported by `@sentry/deno` 11.15.0. Check that on dev before staging/prod (CLAUDE.md Sentry note).
  - New `serverError(err, tags, corsHeaders)`: `console.error` + `reportError` + `Response(500, { error: GENERIC_ERROR })`. `GENERIC_ERROR = 'Something went wrong. Please try again.'`
- **Catch-alls to switch to `serverError`:** `ask-vet-assistant:266`, `beta-signup:204`, `confirm-email:90`, `delete-account:154`, `delete-pet:276`, `early-adopter-signup:183`, `invite-co-owner:369`, `invite-sitter:347`, `reset-sandbox-account:145`, `sign-up:391`. `generate-vet-report`, `clear-email-suppression`, `resend-webhook` and `send-email` already return fixed text; they get the flush through `reportError` and keep their reply format.
- **Raw library messages to replace:** `invite-co-owner:128, 267, 322` and `invite-sitter:96, 252, 300`. Each one reports first, then returns a plain message. The dialogs already treat any error as "the email couldn't be sent", so they behave the same.
- **Version pins:** 18 files `jsr:@supabase/supabase-js@2` → `@2.119.2`; `jsr:@std/encoding@1` → `@1.0.11`. `https://deno.land/std@0.224.0` (tests only) and `npm:pdf-lib@1.17.1` are already exact. Refresh the root `deno.lock` to match (it's stale at 2.110.7, last touched in spec 0056).
- **`scripts/check-functions-start.sh <url>`:** loops over `supabase/functions/*/` excluding `_shared`, `curl -s -o /dev/null -w '%{http_code}' -X OPTIONS`, prints a table and exits 1 on any non-200.
- **`.github/workflows/function-health.yml`:** `schedule: cron '7 * * * *'` + `workflow_dispatch`. A matrix of the 3 project URLs, read from GitHub Actions **variables** (not secrets) `DEV_SUPABASE_URL`, `STAGING_SUPABASE_URL`, `PROD_SUPABASE_URL`. These URLs are already public (every visitor's browser has them), so they aren't secrets. I'll set the three variables with `gh variable set`, reading the project refs from `supabase projects list`. That's read-only and doesn't change the CLI link.
- **CI:** add `supabase/tests/function_hygiene.test.ts` to the existing Deno step in `ci.yml`.

### Frontend (`src/`)

- **`src/lib/errorMonitoring.js`:**
  - Export `shouldSendEvent(event)`: returns false only for `account_type` `test` or `demo`. `beforeSend` calls it.
  - Export `reportClientError(err, context = {})`: `console.error(context.feature ?? 'error', err)`, then `Sentry.captureException(err, { tags: context })` when enabled.
  - Export `functionErrorMessage(error, data, fallback)`: async. Reads `error.context.json().error` (the pattern `Register.jsx:53` already uses), then `data?.error`, then `fallback`. It never returns supabase-js's own "non-2xx" text.
- **`console.error` → `reportClientError`:** all 65 calls in 26 files. Biggest: `PetProfileContent.jsx` (12), `Home.jsx` (10), `AuthContext.jsx` (4), `DailyCheckInSheet.jsx` (4). Each gets a short `feature` tag (e.g. `pet_profile_load`). The 5 existing `Sentry.captureException` calls stay as they are.
- **Raw-message screens:** `PetProfileContent.jsx:345` (Delete Pet), `Settings.jsx:129, 151, 173` (Reset / Seed / Delete Account), `Login.jsx:81` (demo) → `functionErrorMessage(...)`.
- **`InviteCoOwnerDialog.jsx` / `InviteSitterDialog.jsx`:** wrap the save handler body in `try/catch/finally` (`finally` clears `saving`). `InviteSitterDialog.handleRemove` gets the same `try/catch` and error message as the co-owner dialog's.

### Schema

None. No migration needed (`0060` stays reserved, unused, unless the build proves otherwise; if so, I stop and tell you first).

### Design System compliance

No new UI. The only visible changes are error text in existing error spots, which already use the Design System's error style. I'll run `design-system-check` on every changed `.jsx` file after the build.

## Repo Findings & Risks

- **Already exists, extended rather than duplicated:** `reportError` (backend, spec 0052) and `errorMonitoring.js` (app, spec 0052). `delete-account` already has its own small `fail()` helper (spec 0075) that reports every step's failure. `serverError` is the same idea for the catch-all, so the two fit together.
- **What spec 0077 already fixed:** `send-email` already returns fixed text for unexpected errors. The invite dialogs' main stuck-spinner case was fixed in specs 0072/0073.
- **Out-of-date file:** the root `deno.lock` (see Before You Approve #9).
- **Expected-noise sites:** `Turnstile.jsx` (2) and `api/supabaseClient.js` (1, a missing-config warning at startup). They'll be reported but tagged so they're easy to filter.
- **Locked decisions:** the Sentry 11.15.0 pin (CLAUDE.md, spec 0075) is kept. The §11 "OPTIONS 200 after every deploy" rule becomes a script instead of a manual step, so the doc gets updated to point at it.
- **No orphaned code** found in the area being touched.

## Non-Goals

- Upgrading `@sentry/deno` past 11.15.0.
- Checking that functions *work*, beyond starting (a deeper health check per function is a separate idea).
- Moving duplicated helpers into `_shared` (`getRequestIp`, `verifyTurnstile`, `getJwtRole`). That's PA-39, separate.
- Making the hourly check punctual. That's the same GitHub delay as PA-63.
- Changing which backend errors reach Sentry by account type (backend reports every account today, and keeps doing so).
- Sentry alert rules (who gets emailed for which error). You can set those in Sentry's dashboard any time; I can suggest some later.

## Build Notes (2026-11-22)

1. **The startup check needed more than a 200.** First run: pointing the script at a wrong address still got "200 OK" for every function. Some other part of Supabase answers some `OPTIONS` requests itself without running any function code. The script now also requires the `x-deno-execution-id` header, which only a running function sends back. Checked both ways: all 14 pass on dev, staging and prod, and the wrong address fails all 14.
2. **The invite spinner crash that remained.** If the dialog's "who am I?" check (`supabase.auth.getUser()`) failed mid-save, the handler crashed on `me.email` and left the button stuck. `try/finally` now always clears it. The new e2e test (AC10) causes exactly that failure. Unexpected failures reuse each dialog's existing approved wording ("We couldn't add that co-owner. Please try again." / "Couldn't save this invite. Please try again."), so no new copy was needed beyond the approved sitter-removal message.
3. **Raw messages replaced in the invite functions:** `generateLink` errors now go through `serverError`, and the email service's errors are reported to Sentry (tagged `step: send_email`, with the code) and answered with the plain message, status 502. The dialogs treat any error as "the invite email could not be sent", so they behave the same.
4. **The app error helper also wraps Supabase's plain error objects** in a real `Error` (named `Error <code>`), so Sentry shows "permission denied for table pets" instead of "Object captured as exception". `scannedDocuments.js` had its own Sentry call plus a `console.error`. Both became one `reportClientError`. Turnstile's load failure is tagged `expected: 'true'`.
5. **Pre-existing, not fixed here:** `deno check` finds 22 type errors on `main` in `ask-vet-assistant`, `generate-vet-report` and `sign-up` (19 on this branch, because removing the raw `err.message` replies removed 3). CI never type-checks functions, so they went unnoticed. Logged as **PA-65**.
6. **`deno.lock` refreshed.** Because of the root `package.json`, Deno uses this lockfile for local and CI test runs. It still has an unused `jsr:@supabase/supabase-js@2 → 2.110.7` line, which is harmless, since every import now names `2.119.2`.
7. **The hourly workflow can't run until merged.** GitHub only runs scheduled and manually started workflows from the default branch. AC3's first manual run happens right after the merge. The three URL variables were set on 2026-11-22 with `gh variable set`, from `supabase projects list`.
8. **Verified on dev:** all 14 functions deployed. The startup check passes, and the JWT settings are unchanged (`resend-webhook` off, the rest on). All 32 Deno integration tests pass, plus the 4 hygiene tests. A malformed body sent to `ask-vet-assistant` as test1@ (20:43:50 UTC) got `{"error":"Something went wrong. Please try again."}`, status 500, in 1.3s, and the function still started afterwards (the flush didn't break the runtime). Vitest: 163/163. New and changed e2e: 13/13. Lint, typecheck and build are clean. design-system-check: clean (no markup changed).

## Open Questions

None. All four were answered on 2026-11-22: hourly + post-deploy check; all 65 app error sites; fold in the "non-2xx" fix; keep test/demo filtered out of the app's reports.
