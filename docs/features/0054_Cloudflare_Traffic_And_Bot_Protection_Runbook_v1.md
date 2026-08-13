# 0054_Cloudflare_Traffic_And_Bot_Protection_Runbook_v1

**Status:** Implemented (partial — see "As Implemented" note below)
**Date:** 2026-08-13
**Related files:** [wrangler.jsonc](../../wrangler.jsonc), [requirements-cloudflare-deploy.md](requirements-cloudflare-deploy.md), [requirements-deploy-gate.md](requirements-deploy-gate.md), `supabase/migrations/0039_signup_rate_limits.sql`, `src/components/Turnstile.jsx`, [0053_Beta_Signup_Landing_Page_and_Screener_Specification_v1.md](0053_Beta_Signup_Landing_Page_and_Screener_Specification_v1.md), [0050_AskVetAssistant_RateLimiting_Specification_v1.md](0050_AskVetAssistant_RateLimiting_Specification_v1.md)

## As Implemented (2026-08-13)

This spec was scoped assuming a Pro/Business Cloudflare plan (confirmed with Lynn at the time) — **the actual zone turned out to be on the Free plan.** That changed what was actually deployable:

- **Bot Fight Mode: on.** Works exactly as scoped — it's a free-tier feature. Lynn confirmed the Security dashboard is clean after enabling it.
- **WAF custom rule (login-page throttling): not deployed as specced.** Free-plan rate-limiting rules have a fixed 10-second window that isn't user-configurable — the spec's "20 requests in 1 minute" condition isn't an option Cloudflare's UI offers on Free. Cloning/rescoping to production was never reached, since the rule itself couldn't be built as designed.
- **Weekly traffic check: done once.** Lynn reviewed Cloudflare Traffic and Security Events directly (no separate checklist artifact, as decided) — traffic looked normal, nothing unusual blocked or missed.
- **Decision (Lynn, 2026-08-13): close this out without the WAF rate-limiting rule.** Bot Fight Mode plus the app's existing Supabase-level rate limiting (signup, ask-vet-assistant, beta-signup — see `supabase/migrations/0039_signup_rate_limits.sql`) was judged sufficient for now; the login-page-specific edge-layer throttle from Functional Requirement #1 is not in place. If login-page brute-forcing becomes a real concern later (e.g. a plan upgrade, or evidence in Security Events of credential-stuffing attempts), the WAF rule design in the Technical Spec below is ready to revisit — it just needs a paid plan to actually configure the window.

## Before You Approve This

- **This is not a code change.** Every setting described below lives in the Cloudflare dashboard (a "zone" is Cloudflare's term for a domain — `wyskerwatch.com` — plus everything under it, including `staging.wyskerwatch.com`). Nothing in this repo is touched, so there's no PR, no deploy, and no automated test that proves it "works" the way a code change would. Verification is manual, done in Cloudflare's own dashboard.
- **Bot Fight Mode cannot be tested on staging alone.** It's a zone-wide switch — one toggle covers `wyskerwatch.com` and `staging.wyskerwatch.com` together, because both are subdomains of the same zone. There's no per-subdomain on/off for it. To get a real "staging first" test, the WAF custom rule below is scoped to `staging.wyskerwatch.com` by hostname instead — that part genuinely can be staged. Flagging this now so the rollout plan isn't assumed to behave like a normal staging/prod app deploy.
- **No duplicate or overlapping functionality found.** The app already has bot/abuse protection, but only on 3 specific flows (Turnstile on beta-signup, rate limiting on signup/ask-vet-assistant/beta-signup) — nothing today protects general page traffic (login, marketing pages, static assets). This spec doesn't touch or duplicate any of that existing app-level protection.
- **No punch-list item or prior spec covers this** — confirmed by searching `docs/launch-punch-list.md` and `docs/features/` for "bot," "WAF," "traffic," "rate limit."

## Functional Requirements

1. **Block obvious bot traffic** hitting the production site (`wyskerwatch.com`) using Cloudflare's built-in bot-detection feature ("Bot Fight Mode" — a switch that challenges or blocks traffic Cloudflare's own systems recognize as automated, like scrapers or credential-stuffing scripts) plus one custom rule for the specific pattern this app is exposed to: excessive login-page hits from a single visitor, which login forms are commonly targeted by (credential-stuffing bots trying stolen passwords).
2. **Weekly manual traffic check** — a short, repeatable checklist (5-10 minutes) for Lynn to review Cloudflare's traffic and Security Events dashboards and note anything unusual (a spike, a new source of blocked requests, a rule catching more or less than expected).
3. **A validation step for any new rule** before it's trusted — confirm it blocks the bad traffic it's meant to and does not block real users or the app's own automated tests, before leaving it enabled long-term.

## Acceptance Criteria

- **Given** the Cloudflare zone for `wyskerwatch.com`, **when** Bot Fight Mode is turned on, **then** Cloudflare's Security Events log shows challenged/blocked requests tagged as bot traffic within 24 hours (Cloudflare needs real traffic to act on — this can't be confirmed instantly on a quiet site).
- **Given** the login page, **when** more than a set number of requests hit it from the same visitor in a short window, **then** the WAF custom rule challenges or blocks further requests from that visitor instead of letting them retry unlimited passwords.
- **Given** a real signed-in test session (the existing Playwright suite, or Lynn browsing normally), **when** that traffic hits either Bot Fight Mode or the new WAF rule, **then** it is not blocked or challenged — false positives are the failure mode this spec is most worried about, not under-blocking.
- **Given** the weekly checklist, **when** Lynn runs it, **then** she can answer three things in under 10 minutes: is traffic roughly normal, is anything being blocked that shouldn't be, is anything getting through that should have been blocked.

## Test Plan

This entire spec is Cloudflare-dashboard configuration with no code in this repo, so nothing here can be covered by Playwright/vitest/Deno tests — there is no application code path to assert against. Instead:

- Bot Fight Mode blocks real bot traffic → **not testable in advance**; Cloudflare doesn't offer a "send me fake bot traffic" simulator. Validated after the fact by checking Security Events over the following week (see Acceptance Criteria #1).
- WAF rule blocks excessive login attempts → **manually validated once, at rollout**, by Lynn deliberately sending repeated requests to the login page from her own browser/curl and confirming Cloudflare's Security Events log shows the rule firing, then confirming a normal single login attempt is unaffected.
- Real user/test traffic isn't blocked → **manually validated** by running the existing Playwright suite (`npm run test:e2e`) with `PLAYWRIGHT_BASE_URL` pointed at `https://staging.wyskerwatch.com` once the staging-scoped WAF rule is live, confirming all tests still pass. This is the one place this spec touches the existing e2e suite, and only as a manual one-time check — no new spec file or fixture is added to `e2e/`.
- Weekly reporting checklist works → **not automatable** (it's a manual dashboard review by design, per Lynn's own answer during scoping) — validated simply by Lynn running it once during rollout and confirming the three questions in Acceptance Criteria #4 are answerable from what's on screen.
- **Seeding/access constraints:** None of this needs Supabase test data. It does need Cloudflare dashboard access, which per [requirements-deploy-gate.md](requirements-deploy-gate.md) only Lynn has — so every step in this spec's rollout is something only Lynn can execute, not something Claude Code can do or verify independently.

## Visual Reference

None provided — this is a dashboard-configuration spec, not a UI spec.

## Technical Spec

This section is a runbook (a step-by-step operating procedure), not a code change — there are no files for Claude Code to edit as part of this spec.

### 1. Bot Fight Mode (zone-wide, both `wyskerwatch.com` and `staging.wyskerwatch.com`)

- Cloudflare dashboard → select the `wyskerwatch.com` zone → **Security → Bots**.
- Turn on **Bot Fight Mode** (included free; on a Pro/Business plan, **Super Bot Fight Mode** is also available and gives more granular controls — definitely-automated traffic gets blocked outright, likely-automated gets a challenge instead of an outright block, which matters for not accidentally blocking things like legitimate link-preview bots from Slack/iMessage when someone shares a Wysker Watch link).
- This applies to both `wyskerwatch.com` and `staging.wyskerwatch.com` simultaneously (same zone) — there is no way to enable it for one and not the other, so the "staging first" rollout preference applies to the WAF rule below, not to this toggle.

### 2. WAF custom rule: login-page request throttling

- Cloudflare dashboard → same zone → **Security → WAF → Custom rules → Create rule**.
- **Rollout (staging-scoped first):** Field/expression: `(http.host eq "staging.wyskerwatch.com" and http.request.uri.path eq "/login")`. Rate-limiting condition: **20 requests in 1 minute** from the same visitor (confirmed with Lynn), well above what a real user retrying a forgotten password would generate. Action: **Managed Challenge** (Cloudflare shows a lightweight verification, not an outright block — confirmed with Lynn as the long-term action too, not just a starting point: a false positive costs a real user one extra click rather than locking them out).
- **After staging validation passes** (Acceptance Criteria #2 and #3 above, and the Playwright check in the Test Plan): edit the same rule's expression to `http.request.uri.path eq "/login"` (dropping the `http.host` condition) so it applies to production too, or clone it as a second rule scoped to `http.host eq "wyskerwatch.com"` — either works; cloning is safer if you want to keep the staging rule around afterward for future testing.
- Note this is a second, independent layer from the app's own Supabase-level `check_and_record_rate_limit` (used by `sign-up`, `ask-vet-assistant`, `beta-signup` — see `supabase/migrations/0039_signup_rate_limits.sql`). That mechanism limits actions *after* a request reaches the app/database; this WAF rule stops requests *before* they reach Cloudflare's origin (the app) at all. They don't conflict, but a login-page brute-force attempt would now be slowed by two independent layers rather than relying on the app-level one alone (which, as of this writing, does not cover the login page itself — only signup and the two AI endpoints).

### 3. Weekly traffic check (manual, not automated)

- Cadence: weekly, per Lynn's preference during scoping — no automated reminder is being built as part of this spec (out of scope, see Non-Goals).
- Where: Cloudflare dashboard → `wyskerwatch.com` zone → **Analytics & Logs → Traffic** (overall request volume, top countries/paths — a sudden unexplained spike is the main thing to notice) and **Security → Events** (what Bot Fight Mode and the WAF rule actually challenged/blocked that week).
- What to look for each week: (1) does total traffic look roughly like past weeks, (2) is the WAF rule or Bot Fight Mode blocking anything that looks like real users (check a sample of blocked requests' user-agent/path), (3) is there a new pattern of traffic that isn't being blocked but probably should be (e.g., a new scraper hitting an unexpected path repeatedly).
- No dashboard page, doc file, or checklist template is created as part of this spec — Cloudflare's own dashboard already surfaces this data directly; **confirmed with Lynn: no tracked checklist artifact wanted**, the two dashboard pages above are sufficient for the weekly glance.

### Design System compliance

Not applicable — no UI is added or changed by this spec.

### Constraints from CLAUDE.md / locked decisions

- Respects CLAUDE.md's note that "Frontend deploys are done manually by Lynn, not Claude" and the deploy-gate doc's confirmation that Lynn is the sole Cloudflare dashboard account holder — this spec is written entirely as instructions for Lynn to execute, with no assumption that Claude Code has or will be given Cloudflare access.
- Does not modify `wrangler.jsonc` or any deploy pipeline behavior — Bot Fight Mode and WAF rules operate at the Cloudflare network edge, ahead of and independent from the Worker/Pages deploy pipeline described in `requirements-cloudflare-deploy.md`.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** None found. Existing bot/abuse protection (Turnstile, `check_and_record_rate_limit`) covers 3 specific app flows only; this spec covers general site traffic and the login page specifically, which had no protection before.
- **Technical debt nearby:** None found directly related. Worth noting as context, not a blocker: the login page (`src/pages/Login.jsx` area) currently has no app-level rate limiting of its own (unlike signup) — this spec's WAF rule is what closes that gap, at the network edge rather than in app code.
- **Orphaned features nearby:** None found.
- **Punch list / known issues in this area:** None found — searched `docs/launch-punch-list.md` for "bot," "traffic," "WAF," "rate limit," "Cloudflare"; the only Cloudflare-related punch-list items are the already-resolved deploy-gate documentation item and the DMARC DNS record, both unrelated to bot/traffic protection.

## Non-Goals

- Does not build an automated weekly-report generator, Slack/email alert, or scheduled task — the weekly check is a manual dashboard glance by design (Lynn's stated preference).
- Does not add app-level (Supabase Edge Function) rate limiting to the login page itself — that would be a separate, code-level spec if the WAF rule alone turns out to be insufficient.
- Does not change Turnstile/CAPTCHA on any existing flow (beta-signup, signup) — those are unrelated, already-shipped mechanisms.
- Does not grant Claude Code any Cloudflare API/dashboard access — this remains a Lynn-executed runbook, not an automated integration.
- Does not cover DDoS protection specifically (Cloudflare provides baseline DDoS mitigation automatically on all plans regardless of this spec) or CDN/caching configuration — out of scope, unrelated to bot traffic.

## Open Questions

None — all three items above were confirmed with Lynn (no checklist artifact, 20 requests/minute threshold, Managed Challenge as the standing action) and this spec is Approved.
