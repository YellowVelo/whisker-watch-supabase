# 0069_Security_Review_Uncovered_Areas_Specification_v1

**Status:** Draft — findings only, nothing changed
**Date:** 2026-10-23
**Deadline:** decide on P0s before alpha kickoff (Friend cohort, 2026-11-02)
**Companion to:** spec 0068 (pre-alpha deployed-state audit). Nothing 0068 already reported is repeated here; related items point to it by ID (e.g. "see 0068 P0-3").
**Method:** read-only. Code read in full for every file listed below. Prod (`upvtbwienebfxznnagsg`) was queried with SELECT-only statements through a scratch-folder link (the repo's CLI link stayed on dev). Live function definitions, RLS policies, triggers, cron jobs and column lists were pulled from prod. Prod's public Auth settings were read from `GET /auth/v1/settings` (a public endpoint the website itself uses), using only the publishable key; dev's were read the same way for comparison. Prod's Edge Function list (including each function's "JWT check" flag) came from `supabase functions list`. Only counts were printed; no emails, IPs, file names or keys. No exploit was attempted against any project.
**Related files:** `supabase/functions/{sign-up,confirm-email,send-email,reset-sandbox-account,clear-email-suppression,resend-webhook,beta-signup,early-adopter-signup}/index.ts`, `supabase/functions/_shared/{cors,appUrl,webhookSignature}.ts`, `supabase/functions/_shared/email/{sendEmail,renderTemplate,layout,utils}.ts`, `supabase/config.toml`, `src/api/{entities,entityClient}.js`, `src/lib/petsClient.js`, `src/lib/privacyPolicyContent.js`, `src/pages/{Login,Register,ForgotPassword,VerifyEmail}.jsx`, `src/pages/admin/BetaSignups.jsx`, `src/components/{AdminRoute,PetProfileContent,VaccinationSection}.jsx`, migrations `0031`, `0036`, `0037`

## Before You Approve This

1. **Two P0s, and one of them needs you to look at a dashboard before we know if it's real.** P0-1 (sitters never lose access) is proven from the live database. P0-2 (password-reset emails may not reach your testers) depends on one Supabase setting I can't read from here.
2. **The good news first: most of what I was asked to check is solid.** The daily check-in save, the vaccination reminders, the admin page, the account-type protections, the email template escaping, the Resend webhook signature check, the beta and early-adopter forms, and every `/pet/:petId/...` page are all correctly locked down *apart from* the holes 0068 already found. A second account opening someone else's pet URL just gets an error screen; nothing leaks. Details in "Checked and OK" below, so nobody re-audits them.
3. **Confirmed on prod today:** email confirmation is required before login (and 0 unconfirmed accounts have ever signed in). Every function except `resend-webhook` has its login check switched on, which the two ops-only functions depend on.
4. **One correction to 0068.** 0068 P0-4 says a fake bounce could block "password resets". It can't: password resets are sent by Supabase's own email system, not by our Resend code. It *does* still block signup confirmations, co-owner/sitter invites and the beta/early-adopter emails, so P0-4 stays a P0. Noted under Docs drift.
5. **This doc is the deliverable, not a build plan.** Each P0/P1 you choose to fix needs its own fix spec and your review first.
6. **Self-review:** every evidence line was re-checked against a live query result or a file:line read this session. No claim rests on a doc alone. No UI is proposed, so no Design System or Vibe-model conflicts.

## Functional Requirements

- Sharing access ends when the Privacy Policy says it does.
- Every alpha tester can recover a forgotten password.
- Nobody can set up an account at someone else's email address and later get into what that person stores.
- Every way of creating an account goes through the same checks (consent, password rules, rate limits).
- No button on the signup or login screens leads to an error page.

## Acceptance Criteria

1. **Given** this review, **when** Lynn reads it, **then** each P0 has a decision (fix before alpha, or accept in writing), and each "fix" gets its own spec.
2. **Given** the P0-1 fix ships, **when** a sit's end date has passed, **then** the sitter can no longer read that pet, its check-ins or observations, on all 3 projects.
3. **Given** the P0-2 check, **when** a non-team email address requests a password reset on prod, **then** the reset email arrives (or the app shows an error, never a false "sent").

## Test Plan

- AC1 → process gate (Lynn's review). Not testable.
- AC2 → Deno or Playwright test using `test4@` (the sitter fixture, spec 0057): create a sit that ended yesterday, assert the sitter's `pets`/`daily_check_ins`/`observations` reads return 0 rows. Plus the read-only query under P0-1, re-run per project.
- AC3 → manual: request a reset from a personal (non-team) address on prod, confirm receipt. Cannot be automated against prod without a real inbox.
- **Seeding/access constraints:** none for this review (read-only).

## Visual Reference

None — no UI.

## Findings

### P0 — blocks alpha

**P0-1. A pet sitter keeps read access to the pet forever. It never ends when the sit ends, which contradicts the Privacy Policy.**
- *Evidence:* the live `is_pet_sitter()` function on prod checks only that a `pet_sitter_access` row links the user to a sit containing the pet. It never looks at `pet_sits.start_date` or `end_date` (prod definition, matches `supabase/migrations/0031_pets_select_sitter.sql:31-37`). That one function grants `pets_select_sitter`, `daily_check_ins_select_sitter` and `observations_select_sitter` (prod policy list). `pet_sits_select_sitter` likewise has no date check. So a sitter from a weekend in November can still read the pet's profile and every future daily check-in and observation a year later, until the owner manually removes them.
- *Why it's a P0:* the Privacy Policy tells users a sitter "will have limited access to the specific pet-sitting period and pets you grant them" (`src/lib/privacyPolicyContent.js:56`). Alpha testers will use sitter invites. Prod has 0 sits today, so nobody is affected yet.
- *Related:* 0068 P0-3 (anyone can make themselves a sitter). Fixing P0-3 stops strangers; this fix is about genuinely invited sitters.
- *Fix:* add `and current_date between ps.start_date and ps.end_date` to `is_pet_sitter()` and `is_pet_sit_sitter()`. Decide whether sitters get a grace day, or early access before the start date to read instructions. Then either hide ended sits on the sitter's "Pets I Sit" list or show them as "ended". Ship to all 3 projects.

**P0-2 (needs a dashboard check). Password-reset emails go through Supabase's own mailer, and the app hides it if they fail.**
- *Evidence:* `src/pages/ForgotPassword.jsx:19` calls `supabase.auth.resetPasswordForEmail()`, which makes Supabase Auth send its own email. It does not go through our Resend `sendEmail()`; the branded `password-reset` template exists but no function uses it (grep across `supabase/functions`). That call returns its errors rather than throwing them, but the page wraps it in `try {} catch {}` (`:18-22`), so any failure, including "email rate limit exceeded", still shows "If an account exists… you'll receive a reset link shortly."
- *Why it might be a P0:* if prod's Supabase Auth still uses Supabase's built-in email service instead of custom SMTP, Supabase only delivers to your own team members' addresses and limits it to a few emails an hour. Then no friend tester could ever reset a password, and the app would tell them it worked. I can't read the SMTP setting from here.
- *Fix:* (1) Lynn checks Supabase → prod → Authentication → Emails → SMTP Settings. If "Enable custom SMTP" is off, point it at Resend's SMTP using the same `wyskerwatch.com` sender, and brand the reset template. (2) Either way, make `ForgotPassword.jsx` read the returned `error` and show a retry message instead of a false success. The "If an account exists" wording can stay for the success case, so this doesn't reveal which emails have accounts.

### P1 — fix before public launch (cheap ones worth doing before alpha are marked)

**P1-1. Someone can set up an account at a friend's email address in advance, and get into it later if the friend clicks the confirmation email.**
- *Evidence:* `sign-up` creates the account with the password the *requester* chose (`sign-up/index.ts:307-318`) and emails a confirmation link to the address. Nothing checks that the requester owns that address. If the real owner clicks the link, `VerifyEmail.jsx:40-70` logs them in and `confirm-email` marks the account confirmed. The page deliberately skips asking for a password (`VerifyEmail.jsx:11-13`), so the account keeps the attacker's password. The same happens if the real owner later tries to sign up themselves: the "already registered, not confirmed" branch (`:320-332`) sends them a link to confirm the attacker's account, and their own new password is discarded.
- *What the attacker gets:* a confirmed login at the victim's address. They can read everything the victim adds, and `claim_pending_co_owner_invites()` / `claim_pending_sitter_invites()` hand them any pet a friend later shares with that address (matched by the account's email). The invite would also take the silent "already has an account" path (`invite-co-owner/index.ts:183-187`), so no invite email is sent at all.
- *Fix:* when confirming, always finish with the existing `SetPasswordForm`, the same way `AcceptInvite.jsx` does, so whoever owns the inbox sets the password. Then sign out all other sessions. Alternatively, have `sign-up`'s "already registered, not confirmed" branch reset the stored password to the new requester's. That alone isn't enough, though, because of the first-click case. Add a Deno test: sign up as X with password A, confirm through the link, then assert that password A no longer works.

**P1-2. Supabase's built-in public signup is still switched on, so anyone can skip the `sign-up` function's protections.** *(cheap, consider before alpha)*
- *Evidence:* prod `GET /auth/v1/settings` returns `"disable_signup": false` (dev too). Anyone holding the publishable key, which ships inside the website, can create accounts directly through Supabase's `/auth/v1/signup`. That skips the `sign-up` function's rate limits, the leaked-password check, the terms-consent requirement (`sign-up/index.ts:248`), and the branded email. Supabase would send its own unbranded confirmation email instead. Accounts created that way get null consent fields (`handle_new_user` only copies consent from signup metadata).
- *Fix:* turn off "Allow new users to sign up" in Supabase Auth on all 3 projects. The `sign-up` and invite functions use the admin API, which still works with public signups off; verify on dev first. Note this also blocks first-time Google signups, which are already broken (P1-3).

**P1-3. The "Continue with Google" button can't work: Google login is switched off on prod (and dev).** *(cheap, consider before alpha)*
- *Evidence:* prod `/auth/v1/settings` returns `"google": false`, and prod has 0 Google-linked identities (`auth.identities`). `Register.jsx:124` and `Login.jsx` render the button unconditionally. A tester who taps it is sent to Supabase's error page ("provider is not enabled"), which is a dead end on the very first screen.
- *Fix:* decide: either enable Google in Supabase Auth (client ID/secret plus redirect allowlist), or hide the button until you do. Hiding it is one line per page.

**P1-4. Two ops-only functions trust a login token's "role" without checking its signature themselves.**
- *Evidence:* `send-email` (`:67-78`, `:114-117`) and `clear-email-suppression` (`:56-67`, `:76-79`) decode the token and accept it if it says `role: service_role`, relying entirely on Supabase's gateway login check. Prod has that check on for both today (`supabase functions list`: `verify_jwt = True`), so this is **not exploitable now**. But `supabase/config.toml` only records the setting for `resend-webhook`. If either function is ever deployed with `--no-verify-jwt`, or someone copies `resend-webhook`'s pattern, anyone could forge a token by hand. They could then send Wysker-branded email to any address, or clear any suppression.
- *Fix:* add explicit `[functions.send-email] verify_jwt = true` and `[functions.clear-email-suppression] verify_jwt = true` to `config.toml`, so the safety depends on a recorded setting rather than a default. Better still, verify the token server-side with `auth.getClaims()`.

### P2 — later

- **Sitters can attach log entries to pets that aren't in their sit.** `pet_sit_logs_insert_owner_or_sitter` checks that the sitter belongs to the sit, but never that `pet_id` is one of that sit's `pet_ids` (prod policy). The owner path has the reverse gap: it checks pet ownership, not that the sit belongs to them. Mostly junk-data risk, since the UI reads logs by sit. *Fix:* require `pet_id = any(sit.pet_ids)` in the check.
- **Users can change their own `profiles.email`, and one sitter policy trusts it.** `profiles_update_own` allows every column; the protect trigger only guards `account_type`/`role` (prod trigger definition). `pet_sitter_access_select_owner_or_sitter` matches `sitter_email = profiles.email`. So anyone can set their profile email to someone else's and read sitter-invite rows addressed to that person, which shows the owner's user ID and the sit ID, but not the pet. *Fix:* match on `auth.users.email` (via `auth.jwt()->>'email'`), and make `profiles.email` read-only in the protect trigger.
- **The `is_pet_owner` / `is_pet_sitter` / `is_pet_sit_sitter` functions answer for *any* user ID, even to logged-out callers.** Anyone can ask "is user X an owner of pet Y?" (prod grants include `anon`; the functions take `p_user_id` as a parameter). It needs both IDs, so the impact is low. *Fix:* the 0068 P0-4 revoke can't remove `authenticated` (RLS needs it), so rewrite them to ignore the parameter and use `auth.uid()`, or revoke `anon` only.
- **The invite-claim functions don't require a confirmed email.** `claim_pending_co_owner_invites()`/`claim_pending_sitter_invites()` match on `auth.users.email` with no `email_confirmed_at` check. This is safe today only because prod requires confirmation to log in. *Fix:* add `and email_confirmed_at is not null`, as a backstop for P1-1.
- **Per-IP rate limits may not see the real visitor IP.** `sign-up`, `beta-signup` and `early-adopter-signup` key on the *last* `X-Forwarded-For` entry (`sign-up/index.ts:104-109`). If Supabase's edge puts its own proxy address there, every visitor shares one bucket, and the 21st signup in an hour site-wide would be refused. Prod's rate-limit table has no IP rows yet, so I couldn't check. *Fix:* log (to Sentry, not the response) what that header looks like for one real request on dev, then confirm.
- **Error responses echo internal messages.** Each function's outer `catch` returns `err.message` to the caller (`sign-up/index.ts:391`, `beta-signup:204`, `early-adopter-signup:183`, `confirm-email:90`, `reset-sandbox-account:169`). *Fix:* return a generic message; Sentry already gets the detail.
- **Inbox flooding via "resend confirmation".** Limited to 5 an hour per address, with no CAPTCHA (`sign-up/index.ts:75-77`). An attacker rotating IPs can send ~120 a day to one victim. *Fix:* add Turnstile to Register/resend, as on `/beta`.
- **Sitter-only pets show up in owner-only flows.** `entities.Pet.list()` returns pets the user only *sits* for (RLS `pets_select_sitter`). So Scan Record's pet matching (`VaccinationSection.jsx:102`) can assign a scanned vaccine to a sitter's pet, and the save then fails with an RLS error. A sitter can also open `/pet/:petId/edit` or `/export`: edit fails on save, and the vet report comes out with empty medication and vaccine sections. *Fix:* filter sitter-only IDs (`getSitterOnlyPetIds()`) out of those flows.
- **The shared demo login is a real prod session.** Prod has 1 `demo` account (`demo1@`). Since migration `0037` reverted the database-level write block, the demo is fully writable between logins (by design, spec 0027). Anyone given the demo password can therefore use the AI endpoint (0068 P1-2), create auth rows for any address via invites (0068 P1-1), and, until 0068's P0-1–P0-3 are fixed, act on any pet ID they learn. *Fix:* depends on who has the password (Open Question 3).
- **Analytics can be skewed from the client.** `analytics_events.properties.account_type` is client-supplied. `compute_daily_analytics_summary` excludes only `'test'`, not `'demo'` (prod definition). Low stakes.
- **`observations.photo_url` accepts any URL.** A co-owner could point it at an outside server and log viewers' IPs. Low; fold into 0068 P0-1's storage rework.

### Checked and OK (so nobody re-audits these)

- **`save_daily_check_ins`** runs as the calling user (not elevated), stamps `created_by = auth.uid()`, and every read/write inside it is bound by RLS. A caller cannot write check-ins or observations for a pet they don't own (prod definition).
- **`generate_vaccination_due_notifications`** only writes notifications to the pet's owner and linked co-owners, and never sitters. Its only issue is being callable by anyone (0068 P2 / P0-4 revoke). **`compute_daily_analytics_summary`** only rewrites one summary row with recomputed totals; same caveat.
- **`handle_new_user` / `classify_account_type`:** account type comes from a fixed email list, never from anything the user sends. `role` defaults to `user`. The protect trigger blocks users changing their own `role`/`account_type`. There is no insert policy on `profiles`, so users can't create their own profile row.
- **Admin:** `AdminRoute.jsx` is only a screen gate, but the real protection is server-side: `beta_signups` is readable and updatable only when `profiles.role = 'admin'` (prod policies), and `role` can't be self-edited. Prod has exactly 1 admin. `BetaSignups.jsx` renders signup text as plain text, so a malicious signup can't inject script.
- **`reset-sandbox-account`** checks `account_type` server-side and only ever touches the caller's own data.
- **`confirm-email`** can only confirm the caller's own account (ID from the verified session, never the request).
- **`resend-webhook`:** HMAC signature, constant-time compare, 5-minute replay window; JWT check intentionally off.
- **`beta-signup` / `early-adopter-signup`:** Turnstile checked first and fails closed; per-email and per-IP limits; enum validation; no account created.
- **Email rendering:** every non-URL variable is HTML-escaped. Every URL variable is required, https-only, and limited to `wyskerwatch.com` (`renderTemplate.ts:27-50`, `utils.ts:32-54`).
- **Frontend data layer:** `entityClient.js` is a thin wrapper, so every page relies purely on RLS. No page passes a URL `petId` to an elevated (service-role) path except `delete-pet`/`invite-*` (0068) and `generate-vet-report`, which uses the caller's own session and is RLS-bound. A second account opening another account's `/pet/:petId/...` gets the "couldn't load" state (`PetProfileContent.jsx:182-191`), with no data. Beyond the 0068 holes and the sitter edge cases above, nothing leaks.
- **Auth on prod:** `mailer_autoconfirm: false` (confirmation required). 1 unconfirmed account, 0 unconfirmed accounts that have ever signed in. No anonymous sign-ins, no phone login. No public views or materialized views that could bypass RLS. Every table in `public` has RLS on.

### Docs vs code drift

- **P1:** 0068 P0-4 says a fake bounce blocks "password resets". Resets go through Supabase Auth's mailer (`ForgotPassword.jsx:19`), not `sendEmail()`. Correct the wording; the finding itself stands.
- **P1:** the Privacy Policy's sitter wording (`privacyPolicyContent.js:56`) doesn't match the code (P0-1). Fix the code rather than the policy.
- **P2:** three comments disagree about the real domain. `_shared/email/utils.ts:18-20` says bare `wyskerwatch.com` is production and `www.` redirects to it. `_shared/cors.ts:12` and `_shared/appUrl.ts:15` default to `www.`. `invite-co-owner/index.ts:114-115` says the email allowlist permits only `www.wyskerwatch.com`, but the code allows `wyskerwatch.com` plus any subdomain. This ties into 0068 P1-8 (CORS); settle which one is canonical.
- **P2:** `send-email/index.ts:17-28` says it supports the newer `sb_secret_` keys. In fact `getJwtRole()` returns null for those (they aren't JWTs), so only the legacy service-role JWT works.
- **P2:** `supabase/config.toml:13-14` says "All other functions keep the default (verify_jwt = true)". True today, but two functions' safety depends on it, so it should be explicit (P1-4).

## Technical Spec

- **Schema:** none in this spec. Fixes would touch `is_pet_sitter`/`is_pet_sit_sitter` (P0-1), the `pet_sit_logs` insert policy, `pet_sitter_access` select policy, the protect trigger, and the claim functions (P2s).
- **Dashboard-only fixes:** P0-2 (SMTP), P1-2 (disable public signup), P1-3 (Google on/off).
- **Design System compliance:** no UI here. P0-2 (`ForgotPassword.jsx`), P1-1 (`VerifyEmail.jsx`) and P1-3 (`Register.jsx`/`Login.jsx`) fix specs must run `design-system-check`.
- **Constraints from CLAUDE.md:** read-only respected. Backend fixes ship to all 3 projects (§11); dashboard settings must be changed on all 3 too, since dev already matches prod on P1-2/P1-3.

## Repo Findings & Risks

- **Duplicate code:** the same `getJwtRole()` lives in two files (`send-email`, `clear-email-suppression`), and the same `getRequestIp()`/`verifyTurnstile()` in three. A fix to either has to be made in every copy; move them to `_shared/`.
- **Orphaned code:** the `password-reset` email template is never used (see P0-2). Either wire it in via custom SMTP/templates or delete it.
- **Error reporting:** in these 8 functions, Sentry only sees the outer `catch`. Examples that never reach it: `confirm-email`'s confirm failure (`:76-82`), `beta-signup`/`early-adopter-signup` insert failures (`:173-176`/`:153-156`), and every `EmailServiceError` in `send-email` (`:159-161`). This is the same pattern as 0068 P1-6; fold it into that fix.

## Non-Goals

- Fixing anything; re-reporting 0068's findings; running exploits; load testing.

## Open Questions

1. **(Unblocks P0-2)** In Supabase → prod → Authentication → Emails → SMTP Settings, is custom SMTP on? Which sender does it use?
2. **Dashboard checklist (prod, then the same on dev/staging).** I can't read these from here; anything on this list can be fixed with a toggle:
   - Authentication → Sign In / Providers → Email: "Confirm email" **on** (confirmed via API), "Secure email change" **on**, "Allow new users to sign up" (currently **on**, see P1-2).
   - Same page: Email OTP / link expiry. Recommend ≤ 1 hour; the default is 1 hour, and the maximum allowed is 24.
   - Authentication → URL Configuration: Site URL is your real domain. The Redirect URL list contains only exact app URLs (`https://www.wyskerwatch.com/**`, the bare domain if used). On **prod** it should have no `localhost` and no broad wildcards such as `https://*.workers.dev/**`.
   - Authentication → Rate Limits: emails sent per hour (relevant to P0-2).
   - Authentication → Sessions / Attack Protection: refresh-token reuse detection on, leaked-password protection on (0068 P2).
   - Authentication → Providers → Google: intentionally off? (P1-3)
3. Who has the `demo1@` password, and is it published anywhere (a landing page, a pitch deck)? This decides how serious the demo P2 is.
4. For P0-1: should a sitter see the pet before the sit starts (to read instructions), and for how long after it ends?
5. For P1-1: are you OK with new users setting their password at the confirmation step rather than on the signup form? That's the simplest complete fix.
