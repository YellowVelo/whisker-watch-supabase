# 0053_Beta_Signup_Landing_Page_and_Screener_Specification_v1

**Status:** Shipped — verified current against code 2026-08-18. All functional requirements, including Task 17 (confirmation email), are implemented: `src/pages/BetaSignup.jsx`, `src/pages/admin/BetaSignups.jsx`, `supabase/functions/beta-signup/index.ts`, and the `beta-signup-confirmation` email template.
**Date:** 2026-08-11
**Related files:**
- `src/App.jsx` (routing)
- `src/components/AuthLayout.jsx` (only existing unauthenticated-page pattern, for contrast)
- `src/pages/Login.jsx`, `src/pages/Register.jsx` (only existing public pages)
- `src/lib/AuthContext.jsx`, `src/components/ProtectedRoute.jsx`
- `src/lib/accountType.js` (`isDemoAdmin`, existing `role === 'admin'` check)
- `src/api/entities.js`
- `supabase/functions/sign-up/index.ts`, `supabase/functions/sign-up/index.test.ts` (structural precedent for a new public Edge Function, and for a real server-side rate-limit integration test)
- `e2e/ask-wysker-guardrails.spec.js` (precedent for a Playwright test that mocks a rate-limited response to prove the UI handles it)
- `supabase/functions/_shared/cors.ts`, `_shared/errorReporting.ts`, `_shared/email/sendEmail.ts`, `_shared/email/renderTemplate.ts`
- `supabase/migrations/0001_init_schema.sql` (`profiles.role`), `0011_protect_privileged_profile_fields.sql`, `0018_email_logs.sql`, `0038_resend_delivery_webhook.sql`, `0039_signup_rate_limits.sql`
- `wrangler.jsonc`
- `docs/foundation/0005 Design System.md`

## Before You Approve This

- **This introduces the app's first admin-only page and first admin-only database read policy.** Today the only "admin" logic anywhere in the app is a single `role === 'admin'` check that adds a note to the 404 page (`src/pages/PageNotFound.jsx`) — there is no precedent for a full gated page or a database rule that says "only the admin can read this." This spec has to build that pattern from scratch rather than copy an existing one, which is exactly the kind of area where a mistake (e.g. a non-admin somehow seeing the list) would be easy to miss without a test specifically for it. The Test Plan below calls this out explicitly.
- **You'll need to manually flip your own account to "admin" after this ships.** A safety rule already in this codebase (migration `0011`) blocks anyone — including you — from setting their own `role` to `'admin'` through the normal app. That's a deliberate anti-privilege-escalation protection, not a bug, so it's not something this spec should route around. It means turning on your own admin access is a one-time manual database step (e.g. a migration or a one-off SQL statement run against Supabase), not something you can click into existence from the UI. Flagged here so it doesn't come as a surprise post-launch.
- **This is the first CAPTCHA anywhere in the codebase.** This repo's real sign-up form deliberately ships without one (documented decision from spec `0021`). Given how this page will actually be distributed (posted publicly on Reddit/BetaList to a wide, anonymous audience, not just people already using the app), this spec adds Cloudflare Turnstile to the beta-signup form specifically — a new dependency (a site key and a secret key) that nothing else in this app currently has, so it's worth knowing this form's protection model is different from every other form in the app, not an extension of an existing pattern.
- **No duplicate or conflicting functionality found.** Investigation confirmed there is no existing landing page, waitlist table, screener, or admin-review UI anywhere in the codebase to collide with.
- **No conflict with `CLAUDE.md`'s locked Vibe/scoring model** — this page intentionally stays silent on it per your instruction, and nothing in the copy you provided references it.

## Functional Requirements

1. **Public pitch page.** A new page, reachable at a clean, memorable web address, that any visitor (no account, no login) can open on a phone from a link posted on Reddit, BetaList, or anywhere else. It presents the finalized marketing copy you provided: hero headline/subheadline, a short problem statement, a short solution statement, a "who it's for" list, and a call-to-action leading into signup. It does not mention the internal Vibe/Great-Off-Tough check-in model, the symptom-count mechanic, or any other internal product architecture.
2. **Email + screener capture.** Below the pitch, a two-step form: first just an email field ("Get Early Access"), then — once submitted — the 4-question screener from the copy doc appears in place on the same page (condition status, current tracking method, open-text frustration, comfort with a rough beta). Submitting the screener stores the email and all 4 answers together and shows an on-page thank-you message. No account is created and no password is set — this is a lightweight capture, not real Wysker Watch signup.
3. **Confirmation email.** Immediately after a successful screener submission, an automatic email is sent to the address they gave, confirming receipt ("thanks — we'll be in touch personally if it's a good fit"). It reveals nothing about internal mechanics either.
4. **Admin review page.** A new page inside the existing app, visible only to your account, listing every signup with their screener answers (including the open-text answer in full, since that's your best signal per the copy doc's own notes). You can mark a signup as reviewed/contacted so repeat visits to the list are easy to scan for what's new.
5. **Abuse protection.** The public form is rate-limited (by email and by IP address) using the same mechanism this app already uses for its real sign-up form, so a burst of automated or repeated submissions can't flood the table. It also requires passing a Cloudflare Turnstile CAPTCHA check before the submission is accepted, since this page is designed to be posted publicly (Reddit, BetaList) to people with no account and no prior relationship to the app — a wider bot/spam surface than any existing form in this app.

## Acceptance Criteria

1. **Given** a visitor with no account, **when** they open the beta page URL on a phone, **then** they see the hero, problem, solution, "who it's for," and email CTA, laid out cleanly at mobile width, with no mention of Vibe/check-in/symptom mechanics anywhere on the page.
2. **Given** a visitor on the beta page, **when** they enter a valid email and submit, **then** the 4 screener questions appear in place, without a full page reload.
3. **Given** a visitor who has entered their email and answered all 4 screener questions, **when** they submit, **then** a row is stored with their email and all 4 answers, they see an on-page thank-you message, and a confirmation email arrives at the address they gave within a reasonable time.
4. **Given** a visitor submits the email step with an invalid or empty email, **when** they try to continue, **then** they see an inline validation error and nothing is stored.
5. **Given** the same email (or same IP) submits repeatedly beyond the configured limit in a short window, **when** they try again, **then** the submission is rejected with a generic "try again later" message rather than silently accepted.
6. **Given** you are logged in with an admin-flagged account, **when** you visit the admin review page, **then** you see every stored signup (email + all 4 answers), newest first, and can mark any one as reviewed/contacted.
7. **Given** you are logged in with a normal (non-admin) account, **when** you try to visit the admin review page's URL directly, **then** you are redirected away and see none of the signup data.
8. **Given** you are not logged in at all, **when** you try to visit the admin review page's URL directly, **then** you are redirected to login and see none of the signup data.
9. **Given** a visitor who fails or skips the Turnstile CAPTCHA check, **when** they try to submit the screener, **then** the submission is rejected with a clear error and nothing is stored.

## Test Plan

- AC1 (pitch page renders, no internal mechanics, mobile) → Playwright test loads `/beta` at a mobile viewport and asserts hero/problem/solution copy is present and that none of "Vibe", "Great", "Off day", "Tough day", or "symptom count" appear in the rendered page text.
- AC2 (email step reveals screener in place) → Playwright test fills the email field, submits, and asserts the 4 screener questions render without a `page.waitForNavigation` / full reload.
- AC3 (full submission stores data + confirmation email) → Playwright test completes the full flow with a fixed test email address (Turnstile mocked/bypassed in the test environment — see AC9 below) and asserts the on-page thank-you message. Proof that the row was actually written is covered by the admin-view test (AC6), which reads that same row back through the app. Proof that the confirmation email actually sends is **not automated** — per your answer, this is verified manually after each deploy by checking one of your existing test email inboxes/the Resend dashboard, the same way you'd already spot-check any other transactional email in this app. (Correction from the earlier draft: I'd claimed this repo already has a "Supabase CLI against the linked project" pattern for privileged test assertions — I couldn't actually find one anywhere in `e2e/`, so that claim was wrong and I'm not relying on it here.)
- AC4 (invalid email rejected) → Playwright test submits an empty/malformed email and asserts an inline error and that the screener step never appears.
- AC5 (rate limiting) → Two tests, reusing two different existing patterns in this repo rather than inventing a new one:
  - A Deno integration test at `supabase/functions/beta-signup/index.test.ts`, structured like `supabase/functions/sign-up/index.test.ts:125` (`'sign-up: rate limit blocks repeated attempts...'`) — calls the real deployed-locally function repeatedly against the linked dev Supabase project and asserts it actually gets blocked after the configured limit. This is the only place that proves the server-side limit logic itself works.
  - A Playwright test in the new `e2e/beta-signup.spec.js`, structured like `e2e/ask-wysker-guardrails.spec.js:125` — uses `page.route()` to mock a 429 response from the Edge Function (rather than firing 20+ real requests, which that file's own comment explains is slow/flaky/wasteful) and asserts the on-page message matches AC5's wording. This proves the client UI handles a rate-limited response correctly, not that the server logic works — that's what the Deno test above is for.
- AC6 (admin sees all signups, can mark reviewed) → Playwright test, logged in as an admin-role test account, visits the admin page and asserts signups are listed and the reviewed toggle persists after reload. **Seeding/access constraint:** this repo's e2e fixtures do not currently include an admin-role (`profiles.role = 'admin'`) test account — one will need to be added to the fixture setup (matching however this repo already provisions its other fixture accounts) as part of implementing this spec, not invented ad hoc in the test file.
- AC7 (non-admin redirected) → Playwright test, logged in as a normal fixture account, visits the admin URL directly and asserts redirect + absence of signup data in the page.
- AC8 (logged-out redirected to login) → Playwright test, logged out, visits the admin URL directly and asserts redirect to `/login`.
- AC9 (CAPTCHA failure rejected) → Playwright test mocks a failed/absent Turnstile token and asserts the submission is rejected client-side with a clear error and no thank-you message. **Seeding/access constraint:** Turnstile has an official "always passes"/"always blocks" test site key pair for exactly this purpose (documented by Cloudflare) — the test environment should use the always-passes key for AC1-AC8/AC6/AC7/AC8 so CAPTCHA doesn't block unrelated tests, and this AC9 test specifically forces the always-blocks key or mocks the verification response to exercise the rejection path.

## Visual Reference

No screenshots or mockups were provided — only the finalized copy document (`wysker-watch-landing-page-and-screener.md`). That doc specifies content and question wording (used verbatim in Functional Requirements above) but not a visual layout. The visual layout described in Technical Spec below is proposed fresh, built from the Design System's tokens, since no landing/marketing page layout exists anywhere in this codebase to reference or reuse.

## Technical Spec

- **Schema:**
  - New migration, next available number, creating `public.beta_signups`:
    - `id uuid primary key default gen_random_uuid()`
    - `email text not null`
    - `condition_status text not null` (the Q1 answer)
    - `tracking_method text not null` (Q2)
    - `frustration text not null` (Q3, open text)
    - `beta_comfort text not null` (Q4)
    - `reviewed_at timestamptz` (null until you mark it reviewed on the admin page)
    - `created_at timestamptz not null default now()`
  - RLS: `enable row level security`, **no insert/select policy for `anon`/`authenticated`** — matches this repo's established pattern for tables an Edge Function alone writes to (`email_logs`, `rate_limit_hits`, `email_suppressions`), so public inserts only happen via the service-role client inside the new Edge Function, never directly from the browser.
  - **New pattern, called out above in "Before You Approve This":** an additional `select` and `update` policy scoped to `to authenticated using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))`, so the admin page can read/update through the normal authenticated Supabase client rather than needing its own Edge Function just to list rows. No table in this repo currently has an admin-gated RLS policy — this is the first one, so the redirect/data-hiding behavior in AC7/AC8 needs the explicit tests above rather than being assumed safe.

- **Components/files touched:**
  - `src/pages/BetaSignup.jsx` (new) — the public pitch + capture page. Two-step form: email step, then screener step in place (component-level state, no route change between steps).
  - `src/pages/admin/BetaSignups.jsx` (new) — the admin review list.
  - `src/App.jsx` — add `/beta` to the existing unauthenticated route group (alongside `/login`, `/register`); add `/admin/beta-signups` as a new protected route wrapped in an admin check (new small `AdminRoute` wrapper component, modeled on the existing `ProtectedRoute.jsx` but additionally checking `user.role === 'admin'`, redirecting non-admins to `/`).
  - `src/api/entities.js` — add a `BetaSignup` entity for the admin page's authenticated reads/updates (not used for the public insert, which goes through the Edge Function).

- **API / edge functions:**
  - `supabase/functions/beta-signup/index.ts` (new), structured like `sign-up/index.ts`: `scopedCorsHeaders()` for CORS, service-role `adminClient` for the insert, `check_and_record_rate_limits` (reusing the existing migration-`0039` mechanism, mirroring `sign-up`'s email+IP limit convention) before writing anything, `reportError()` in the catch block, and a generic response shape on both success and rejection so the endpoint doesn't leak which case occurred.
  - **CAPTCHA:** the function verifies the Turnstile token server-side (POSTing it to Cloudflare's `siteverify` endpoint with a new `TURNSTILE_SECRET_KEY` secret) before the rate-limit check, so a failed/missing token is rejected before it can even consume rate-limit budget. The frontend renders the Turnstile widget using a new `VITE_TURNSTILE_SITE_KEY` env var (public, safe to ship in the bundle — this is how Turnstile site keys work) and attaches the resulting token to the submission. This is new infrastructure this repo doesn't have yet — no existing shared helper to reuse, so `beta-signup/index.ts` is where that verification call lives for now.
  - After a successful insert, the same function calls the existing shared `sendEmail()` helper (`_shared/email/sendEmail.ts`) with a new template (`'beta-signup-confirmation'`, added under `_shared/email/templates/`) — this automatically inherits the existing suppression-list check and `email_logs` logging, since that's built into `sendEmail()` already.

- **Confirmation email copy** (approved, use verbatim):
  - From: `support@wyskerwatch.com` (already `sendEmail.ts`'s `DEFAULT_REPLY_TO` — replies land where you'd expect)
  - Subject: `You're on the list — Wysker Watch early access`
  - Body:
    ```
    Hi there,

    Thanks for signing up for early access to Wysker Watch. Your spot on the waitlist is confirmed.

    Here's what happens next: I'm personally reviewing signups and reaching out to a small group for our first round of testing. If you're a good fit, you'll hear from me directly with access details — no automated links, just a real email from a real person.

    In the meantime, if anything changes (like your pet's situation, or you'd rather not be contacted), just reply to this email and let me know.

    Thanks for your interest in what we're building.

    — Lynn
    Wysker Watch
    ```
  - Note: current `FROM_ADDRESS` in `sendEmail.ts` is `Wysker Watch <no-reply@wyskerwatch.com>`, not `support@wyskerwatch.com` — since this email is meant to read as coming personally from you and inviting a reply, the `beta-signup-confirmation` template should override the From address to `support@wyskerwatch.com` (or a `Lynn @ Wysker Watch <support@wyskerwatch.com>` display name) rather than using the app's default no-reply sender, since a no-reply From address would visually contradict "just reply to this email."

- **Design System compliance:** Checked against `docs/foundation/0005 Design System.md` including the 2026-07-30 Amendments. No existing marketing/hero-style page exists anywhere in this codebase to reuse (the only unauthenticated-page pattern, `AuthLayout.jsx`, is a narrow centered card meant for a login form, not a long-form pitch page with multiple sections) — so this page is new layout, not a reused one, but every element in it must still pull from the same tokens as the rest of the app: Inter font only (no serif/display face, Amendment #2), the 3-tier text-opacity system (Amendment #3), 13px type-scale floor (Amendment #7), `bg-card`/`border-border` tokens for any card-like section (Amendment #4), the Charcoal-bg/Sky-Blue-outline/white-text primary button style (Amendment #1) for the CTA and Submit buttons, 44px minimum touch targets on the email/answer inputs and buttons (§8), and the existing `IconButton`/`ListRow`/`PillToggle` shared components (`src/components/*.jsx`) reused for the screener's multiple-choice options and the admin list rows rather than hand-rolling new versions of those patterns. No emoji-as-icon anywhere. The `design-system-check` skill should be run against `BetaSignup.jsx` and `admin/BetaSignups.jsx` once written, per the standing CLAUDE.md instruction to run it after any page/component edit.

- **Constraints from CLAUDE.md / locked decisions:** Respected — this page does not reference the Vibe model, symptom-count logic, or medication-tracking architecture anywhere in its copy (per the doc you provided and per CLAUDE.md's instruction to treat that model as internal). Frontend deploy remains manual (Lynn promotes in the Cloudflare dashboard) — no change to that pipeline. No custom domain work is in scope; per your answer, this ships at `/beta` on whatever URL the app already deploys to (investigation found `www.wyskerwatch.com` is already the app's configured production origin per the Edge Functions' CORS allow-list and email `FROM_ADDRESS`, so `/beta` will resolve there automatically once this reaches production — no separate domain/subdomain setup is needed).

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** None found. No existing landing page, waitlist table, screener, or admin-review UI anywhere in the codebase.
- **Technical debt nearby:** None found specific to this area.
- **Orphaned features nearby:** None found.
- **Punch list / known issues in this area:** None found — `docs/launch-punch-list.md` has no entry related to a landing page, beta signups, or a tester screener.
- **Something worth knowing, not a blocker:** this is the first table and first RLS policy in the app keyed on `profiles.role = 'admin'`, and the first fully admin-gated page/route. Every other "privileged" table in this codebase (email logs, rate-limit hits, suppressions) is written and read only by service-role Edge Functions with zero policies for real user sessions — this spec is the first time a real logged-in user's session is trusted to read a table directly based on their role. That's a reasonable, small addition, but it's new enough surface area that it's worth double-checking manually after launch (log in as a non-admin test account and confirm `/admin/beta-signups` really does redirect and really does return zero rows), not just trusting the Playwright test alone.

## Non-Goals

- No real Wysker Watch account, password, or onboarding is created by this flow — it is a separate, lightweight capture only.
- No automatic accept/reject logic. Every submission lands in the table for you to review manually, per your answer — this spec does not build any scoring or auto-qualification.
- No custom domain / DNS setup — out of scope, handled by you separately in the Cloudflare dashboard if/when you want a domain other than the one already configured.
- No changes to the real `sign-up` flow, real onboarding, or any existing authenticated feature.
- No bulk actions on the admin page (e.g. CSV export, bulk email) — just list + mark-reviewed.

## Open Questions

All previously open questions have been resolved:

- **AC3 DB-write coverage:** resolved — no dedicated DB-assertion test; the admin-view test (AC6) is the proof the row was written, and email delivery is checked manually with an existing test inbox after each deploy.
- **Rate-limit test pattern:** resolved — reuse both existing patterns (a Deno integration test like `sign-up`'s that exercises the real limit, plus a Playwright test like `ask-vet-assistant`'s that mocks the response to prove the UI handles it). See Test Plan, AC5.
- **Confirmation email copy:** resolved — approved copy is in the Technical Spec above, to be used verbatim.
- **Reviewed/contacted status:** resolved — plain `reviewed_at` timestamp only, no status/notes field.

- **Turnstile mode:** resolved — **managed mode** (invisible for most visitors, only occasionally shows a checkbox to visitors Cloudflare flags as suspicious). Chosen over always-visible checkbox mode to keep friction low for real mobile visitors coming from Reddit/BetaList links. Turnstile's block/pass counts are visible in the Cloudflare dashboard, and any spam that does get through will still be visible as obviously-junk rows on the admin review page (AC6) — so this is monitorable without new code, and the widget's mode can be tightened later as a Cloudflare dashboard setting rather than a code change.
