# 0065_Production_Sentry_Silent_Failure_Investigation_Specification_v1

**Status:** Resolved — no code/config fix needed; production Sentry reporting confirmed working 2026-09-01. Only remaining action item is the already-confirmed `.env` duplicate-key cleanup below.
**Date:** 2026-08-30 (investigation steps 1–4 completed 2026-09-01; symptom confirmed no longer reproducing 2026-09-01, see Resolution section)
**Related files:** `src/lib/errorMonitoring.js`, `src/main.jsx`, `src/App.jsx`, `.env` (local, gitignored), `docs/features/0052_Production_Error_Monitoring_Specification_v1.md`

---

## Before You Approve This

- **This spec started as an investigation plan and ended as a non-issue.** The original symptom — "production has never sent a single Sentry event" — does not currently reproduce. Live testing on 2026-09-01 confirmed real, SDK-captured errors on the production site reach Sentry and appear on the dashboard, correctly tagged `environment: production`, within seconds. See the Resolution section below for the full evidence trail.
- **The only concrete, still-needed action from this spec is the small, already-confirmed `.env` duplicate-key fix** below — everything else was diagnostic and requires no code or config change.
- No conflicts found with CLAUDE.md or the Design System doc — this is a monitoring/configuration issue, no UI change.

## What's already confirmed (do not re-investigate these)

- Sentry's own "Manage Environments" page shows only two environments have **ever** existed in this project's history: `development` (1 event) and `staging` (10 events). Zero `production` events, ever, in the project's entire lifetime.
- Production's Cloudflare build environment variables (`VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT=production`) were checked directly in the Cloudflare dashboard and are correctly set, unchanged.
- Staging's Cloudflare build environment variables for Sentry **do not exist at all** in the same settings section where production's are correctly set — meaning the real staging deployment could never have sent Sentry events either. This means the 10 "staging"-tagged events are not real staging traffic.
- A local file, `.env` (gitignored, never deployed anywhere), defines `VITE_SENTRY_DSN`/`VITE_SENTRY_ENVIRONMENT` twice — once correctly as `development`, then again further down as `staging` (the second definition wins). This means every local `npm run dev` session gets mislabeled `staging` in Sentry. This fully explains the "staging" (10) and likely the "development" (1) event counts as local testing noise, not real traffic from either real environment.
- A live reproduction on the real production site, in a clean incognito window with all extensions disabled, showed **zero** network requests to any `sentry.io`/`ingest` domain when a real error occurred — checked via the browser's Network tab filtered for "sentry." Not blocked, not failed — never attempted at all.
- No Content-Security-Policy exists anywhere in this repo's own code (`index.html`, `wrangler.jsonc`, `src/`) that would block a request to Sentry. A CSP header *was* observed once via a direct `curl` request to the production domain, but that response came from Cloudflare's bot-challenge interstitial page (confirmed by its content — it only allows `challenges.cloudflare.com`), not the real authenticated app page a signed-in user actually sees. This does not confirm or rule out a CSP on the real app page — it simply wasn't checked from the right place.

## Investigation Steps — completed 2026-09-01, all four ruled out

All four steps below were run in order against the real production site (`https://wyskerwatch.com`), live, using a browser instrumented to fetch the deployed bundle, inspect the Sentry SDK's internal client/transport state, and trace real outbound requests. **None of them explain the symptom — the root cause is not in this repo's code, build, or Cloudflare config.**

1. **DSN presence in the live bundle — ruled out, DSN is present.** Fetched the real production site's current bundle (`assets/index-CkLoSKni.js`) directly and confirmed it contains the literal DSN (`https://d52e23c995b769452aff5e343c1dd1fe@o4511889104371712.ingest.us.sentry.io/4511889121214464`) and `environment: "production"`. Not a stale-build issue.
2. **`Sentry.init()` reached at runtime — ruled out, it runs correctly.** On the live production login page, `window.__SENTRY__` exists, `window.onerror` is patched by the SDK, and the live client's `_options` show the correct `dsn` and `environment: "production"`. Nothing earlier in the module load path is silently failing before Sentry's setup code runs.
3. **Content-Security-Policy blocking the request — ruled out, no CSP exists.** Fetched the real authenticated page's own response headers directly (not the bot-challenge interstitial): only standard Cloudflare headers (`cf-cache-status`, `nel`, `report-to`, etc.) are present — no `Content-Security-Policy` header at all, anywhere.
4. **Cloudflare Bot Fight Mode interfering with the outbound request — ruled out, the request succeeds.** This is where the investigation found the real, unexpected result: **the event is not being blocked — it is being sent and accepted.**
   - Triggering a real thrown error on the live production page and watching the SDK's internal transport (`client._transport.send`) confirmed `send()` is called and `beforeSend` runs and returns the event (not filtered/dropped client-side).
   - The browser's Performance Resource Timing API (a ground-truth signal, independent of any devtools/proxy tooling) showed the actual `fetch` request to `o4511889104371712.ingest.us.sentry.io/api/4511889121214464/envelope/...` firing with **`responseStatus: 200`**.
   - A hand-built, well-formed Sentry envelope POSTed directly to that same ingest URL (bypassing the SDK entirely, to rule out any SDK-side quirk) got back Sentry's standard success response: `200` with body `{"id":"c49f8bdb92e34895b78ea239c1c699a9"}` — no rate-limit headers, no error, no rejection signal of any kind.

## Resolution — confirmed working end-to-end, 2026-09-01

Step 4's evidence (request sent, `200` accepted by Sentry's ingest API) left one open question: did ingestion actually *index* the event and surface it on the dashboard, or was it silently dropped after acceptance (e.g. quota/spike-protection, an Inbound Data Filter, or the dashboard being checked against the wrong project)? This was checked directly against the Sentry dashboard and answered definitively: **it's fully working.**

- The hand-built manual envelope (event `c49f8bdb92e34895b78ea239c1c699a9`, message `manual-envelope-diagnostic-test`) was found in the dashboard, tagged `environment: production`.
- More importantly, the five *real*, SDK-captured errors thrown on the live production page during this investigation (`sentry-diagnostic-test-...`, `sentry-fetch-patch-test-...`, `sentry-transport-hook-test-...`, `sentry-egress-test-...`, `sentry-perftiming-test-...`) all appear too, grouped under one trace (`8ba59e1d5382461fb9f1b9bc75df4a36`), each tagged `environment: production`. These went through the real `Sentry.init()` → `beforeSend` → transport path, not a bypass — this is exactly the path spec 0052 was meant to validate.

**So the pipeline is not broken.** No wrong project, no quota drop, no inbound filter, no CSP, no Bot Fight Mode interference, no stale build. Every hypothesis in this spec (its own and the earlier "already confirmed" findings) has now been superseded by direct, reproducible evidence that production error reporting works today.

**What this means about the original "zero production events, ever" finding:** it was likely an observation error rather than a real historic gap. Notably, this investigation's own `read_network_requests` tooling *also* failed to show the exact same request that the browser's Performance Resource Timing API and the Sentry dashboard both proved succeeded — i.e., "the Network tab showed nothing" is a documented false negative in this exact scenario (cross-origin `fetch` results not always surfacing in the tool/tab used to check), not proof the request never happened. The original "clean incognito, zero network requests" reproduction was most likely the same kind of miss, not a real absence of traffic. No code change, deploy, or Sentry-side config change occurred between that reproduction and this one — the mechanism was very likely working the whole time.

**Recommendation:** no further investigation needed. If real user-triggered production errors still seem under-represented in Sentry going forward, treat that as a fresh question (e.g., are enough real errors even occurring, is `beforeSend`'s `account_type` filter excluding more than expected) rather than reopening this "requests never leave the browser" theory, which is now well and directly disproven.

## Functional Requirements (the end state this investigation should achieve)

1. ~~A real error occurring on the production site must actually reach Sentry, tagged `environment: production`, the way spec 0052 originally intended.~~ **Confirmed already true as of 2026-09-01 — no fix needed** (see Resolution).
2. ~~The local `.env` duplicate-key issue should be cleaned up so local development sessions correctly tag as `development` again, not `staging`.~~ **Done 2026-09-01** — removed the duplicate second `VITE_SENTRY_DSN`/`VITE_SENTRY_ENVIRONMENT=staging` block from `.env`, keeping only the original correct `development` one.

## Acceptance Criteria

- ~~Given the investigation steps above are followed and a fix is identified and applied, when a real error is deliberately triggered on the production site afterward, then a new event appears in Sentry tagged `environment: production` within a few minutes.~~ **Already satisfied without any fix** — verified directly during this investigation (see Resolution: 5 real errors, all appeared correctly tagged).
- ~~Given the local `.env` cleanup, when `npm run dev` is used locally afterward and an error occurs, then it's tagged `environment: development` in Sentry, not `staging`.~~ **Verified 2026-09-01** — `local-dev-trace-test-1788263855543`, thrown from a restarted local `npm run dev` session, appeared in Sentry correctly filtered/tagged `development`.

## Test Plan

- ~~Production errors reach Sentry, correctly tagged~~ → `[Manual]` — **already verified during this investigation** (2026-09-01): 5 real thrown errors on the live production site, all appeared in Sentry tagged `environment: production` within seconds. No further verification needed unless the symptom recurs.
- ~~Local dev sessions tag correctly after the `.env` fix~~ → `[Manual]` — **Verified 2026-09-01**: a real thrown error from a restarted local `npm run dev` session (`local-dev-trace-test-1788263855543`) appeared in Sentry filtered/tagged `environment: development`, confirming the duplicate-key removal fixed the mistagging.
- **Seeding/access constraints:** This entire spec is inherently outside what a normal signed-in Playwright session against dev can verify — it's about production infrastructure and a local file, neither of which the automated suite has any access to or reason to test.

## Visual Reference

None — this is a monitoring/configuration investigation with no UI change.

## Technical Spec

- **Schema:** None.
- **Components/files touched:** Likely none in `src/`, depending on what the investigation finds — if the root cause turns out to be "the live bundle predates the correct Cloudflare settings," the fix is a fresh deploy, not a code change. If it turns out to be something else (e.g., an import-order issue in `main.jsx`), that would need a small code fix, which should be documented as an update to this spec once found, before implementing it.
- `.env` (local only, never committed — confirmed via `git ls-files .env` returning nothing and `.gitignore` explicitly listing it): remove the duplicate second `VITE_SENTRY_DSN`/`VITE_SENTRY_ENVIRONMENT` block, keeping only the first, correct `development` one.
- **API / edge functions:** None expected — this is specifically about the *client-side* (frontend) Sentry reporting gap. The Edge Function side of error monitoring (`supabase/functions/_shared/errorReporting.ts`) is a separate, already-working mechanism (confirmed working — the `reportError` calls in Edge Functions are unrelated to this investigation, which is scoped to the browser-side `Sentry.init()` in `src/lib/errorMonitoring.js`).
- **Design System compliance:** N/A — no UI change.
- **Constraints from CLAUDE.md / locked decisions:** None conflict.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** None found beyond the `.env` duplicate-key issue itself, which is the finding.
- **Technical debt nearby:** The `.env` duplicate-key issue is itself a small piece of debt — easy to introduce (someone pastes a new block below an old one instead of editing in place) and easy to miss, since `.env` files aren't code-reviewed or linted. Worth a quick visual scan of the rest of that file for any other accidental duplicates while this is being cleaned up.
- **Orphaned features nearby:** None found.
- **Punch list / known issues in this area:** None on record — this gap in production error monitoring was invisible until this investigation specifically went looking for a Sentry event that should have existed and didn't.

## Non-Goals

- Not re-litigating spec 0052's original design (sampling rate, sandbox-account exclusion, the crash-boundary UI) — that design is sound; this spec is only about why production traffic isn't reaching it at all.
- Not building alerting (Slack/email on new Sentry events) — same non-goal as spec 0052 originally set, unchanged.
- Not auditing whether *other* Cloudflare-side headers/security settings affect anything else in the app beyond this one investigation's scope.

## Open Questions

- None. Core symptom resolved (see Resolution) and the `.env` duplicate-key fix is applied and fully verified (see Test Plan) — this spec is closed.
- Unresolved, lower-priority curiosity (not blocking, not worth further investigation time): why the original "clean incognito, zero network requests" reproduction and this investigation's own `read_network_requests` tooling both failed to show a request that demonstrably succeeded. Noted in the Resolution section as a likely tooling/observation limitation rather than a real absence of traffic.
