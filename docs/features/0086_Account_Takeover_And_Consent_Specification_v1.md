# 0086_Account_Takeover_And_Consent_Specification_v1

**Status:** Approved by Lynn 2026-11-27, as written, including all copy. Not built yet.
**Date:** 2026-11-27
**Punch list:** bundle B03, PA-13 (consent) and PA-18 (account takeover). Merge tier: PROTECTED (auth, migrations, service-role functions).
**Reserved numbers:** spec 0086, migration 0064 (checked against every remote branch and open PR on 2026-11-27).
**Related files:** `src/pages/Register.jsx`, `src/pages/VerifyEmail.jsx`, `src/pages/AcceptInvite.jsx`, `src/components/SetPasswordForm.jsx`, `src/components/ProtectedRoute.jsx`, `src/lib/AuthContext.jsx`, `src/lib/pendingOAuthConsent.js`, `src/pages/Login.jsx`, `src/lib/termsOfServiceContent.js`, `src/lib/privacyPolicyContent.js`, `supabase/functions/sign-up/index.ts` (+ `index.test.ts`), `supabase/functions/confirm-email/index.ts`, `supabase/functions/invite-co-owner/index.ts`, `supabase/functions/invite-sitter/index.ts`, migrations `0016`, `0020`, `0028`, `0047`, `0057`, `0059`.

## Lynn — what I need from you

1. **Approve this spec**, including the copy in "Copy for approval" below. Blocks all building.
2. **Before deploy, on each project (dev, then staging, then prod):** Supabase dashboard → Authentication → Sign In / Providers → Email → switch **"Allow new users to sign up" off** (PA-19). I'll give exact click paths and test sign-up and invites on dev first. Blocks this spec's deploy, not the build.
3. **Promote the frontend** in Cloudflare when I ask (branch `main`, I'll name the commit message). Blocks the migration push.
4. **OK the PROTECTED merge** once review and CI pass. I'll give you a plain "who can do what" summary.
5. **After it's live, open the app once on your own account** and accept the new consent screen. Your account won't be filled in for you.

## Before You Approve This

1. **The sign-up form gets shorter, and the password moves.** People enter name and email, get the email, click it, and *then* create a password and agree to the Terms. That's the fix: only the inbox owner ever sets the password. Anyone who signs up today sets a password up front, so this is a real change in what people see.
2. **Found a live bug while investigating:** the server records new sign-ups as agreeing to Privacy Policy version "November 20, 2026", but the live policy says "November 21, 2026". Every sign-up since then has the wrong version on its record. This spec fixes it and adds a test so the two can't drift again. Existing wrong records are left as they are (they can't be honestly corrected).
3. **About 11 existing accounts (including yours) will see a blocking consent screen** the next time they open the app. Their only choices are agree or sign out. Test and demo accounts are filled in by the migration so automated tests keep working; real people's accounts are never filled in.
4. **Switching off Supabase's own sign-up (PA-19) is a required deploy step.** Without it, someone can skip our sign-up page entirely and the takeover hole stays open. PA-19 stays on the B01 list, but this spec won't deploy until it's done on each project.
5. **A short, harmless gap during deploy.** Between the server update and the frontend promotion (minutes), someone using the old page could confirm an account that has no password yet. They can't do anything bad with it: the new consent screen catches them as soon as the frontend is live. Nobody gets someone else's account in that window.
6. **The Google sign-in code changes.** Google is switched off today (spec 0076). Its special "remember the consent answer across the Google redirect" code is removed; a future Google user would just see the same consent screen. That's simpler and safer, but it means turning Google back on later won't need that piece.
7. **Password reset is not changed.** It still sets a password without the breached-password check this spec adds to sign-up. Logged as a gap (see Repo Findings), not fixed here.
8. **The consent screen stays out of the way if your profile can't load** (for example, during a Supabase outage), so an outage doesn't lock everyone out. The server still never records consent without the checkbox, so this doesn't weaken anything.
9. **One check can't be fully automated:** "an unconfirmed account can't claim an invite." There's no normal way to get signed in to an unconfirmed account (that's the point), so the test checks the database rule's wording rather than running it. Noted in the Test Plan.

## Copy for approval

**Sign-up form (`/register`)**
- Fields: First Name, Email. Button: **Sign Up** (unchanged).
- Line under the button (links open in a new tab): *"After you confirm your email, you'll create a password and review our Terms of Service and Privacy Policy."*
- After sending (unchanged): *"We sent a confirmation link to {email}. Click it to finish creating your account."*

**Finish page, from the sign-up email (`/verify-email`)**
- Title: **Finish setting up your account**
- Subtitle: *"Create a password and review our terms to start using Wysker Watch."*
- Fields: Password, Confirm Password.
- Checkbox (required): *"I agree to the Terms of Service and Privacy Policy."* (same as today's sign-up form)
- Checkbox (optional): *"Send me tips, product updates, and other marketing communications."* (same as today)
- Button: **Finish**

**Finish page, from a co-owner or sitter invite (`/accept-invite`)**
- Title: **Welcome to Wysker Watch** (unchanged)
- Subtitle: *"Create a password and review our terms to finish accepting your invitation."*
- Same fields and checkboxes. Button: **Continue** (unchanged)

**Consent screen for existing accounts that already have a password**
- Title: **One quick thing before you continue**
- Body: *"We need your OK on our Terms of Service and Privacy Policy. It only takes a moment."*
- Checkbox (required): *"I agree to the Terms of Service and Privacy Policy."*
- Buttons: **Continue** (primary), **Sign out** (secondary).
- No marketing checkbox here (as you chose on 2026-11-27).

**Consent screen for an account with no password yet** (someone who closed the finish page early): same as the "Finish setting up your account" page.

**Errors**
- Passwords don't match: *"Passwords do not match"* (existing).
- Too short/long: *"Password must be between 8 and 128 characters"* (existing server text).
- Breached: *"This password has appeared in a data breach. Please choose a different password."* (existing server text).
- Anything else: *"Something went wrong. Please try again."* (the app's standard text).

## Functional Requirements

1. Signing up asks only for a first name and email. It never sets a password.
2. The confirmation email's link opens a page where the person creates a password and agrees to the Terms and Privacy Policy, with an optional marketing opt-in. The account is only confirmed when they finish that page.
3. Accepting a co-owner or sitter invite uses the same page and records consent too.
4. Finishing that page signs out every other session on the account.
5. If someone signs up at another person's address, the real inbox owner, by finishing the page, ends up with the only working password. The person who filled in the form never gets in.
6. Anyone signed in with no consent on record sees a blocking consent screen before any app page. If they signed in from an email link (sign-up, invite or reset) and haven't finished setup, the screen asks for a password too. The Terms and Privacy pages stay readable from that screen.
7. Consent is recorded by the server, with the server's own version dates, and can't be edited or erased by the user afterward.
8. An account only receives shared pets (co-owner or sitter invites) once its email is confirmed.
9. Existing unconfirmed accounts lose any password they were created with, so they also have to go through the new finish page.

## Acceptance Criteria

1. **Given** the sign-up form, **then** there are no password fields and no Terms checkbox, and Sign Up works with a name and email.
2. **Given** someone signs up at address X (sending a password, as an old page would), **then** the account has no password.
3. **Given** the inbox owner clicks the link and finishes with password B, **then** B works, the account is confirmed, and no other password works.
4. **Given** the finish page, **when** the Terms box isn't ticked, **then** Finish is disabled, and the server refuses a request without it.
5. **Given** a breached or out-of-range password, **then** the server refuses it with the existing message and nothing is confirmed.
6. **Given** two sessions on one account, **when** one finishes setup, **then** the other session can no longer refresh.
7. **Given** a finish request, **then** `terms_accepted_at`, `terms_version` and `privacy_version` are set by the server, using the versions shown on the live Terms and Privacy pages; marketing opt-in matches the checkbox.
8. **Given** consent is already recorded, **when** the finish call runs again, **then** the original record is kept.
9. **Given** a signed-in user, **when** they try to change their own consent fields directly, **then** the database refuses.
10. **Given** an account with a password and no consent, **when** it opens any app page, **then** it sees the consent screen; Continue records consent and opens the app; Sign out signs out.
11. **Given** a session opened from an email link (session sign-in method `otp`) on an account with no consent, **then** the consent screen asks for a password too; a session signed in with a password sees consent only.
12. **Given** the consent screen, **when** the person opens Terms or Privacy, **then** the page opens instead of the consent screen.
13. **Given** a session signed in with a password, or an account whose consent is already recorded, **when** the finish call includes a password, **then** the server refuses (this screen is never a way to change a password).
14. **Given** an invite for address X, **when** an account at X is unconfirmed, **then** the invite-claim functions don't link it.
15. **Given** the app's Terms/Privacy version dates and the server's, **when** they differ, **then** a unit test fails.
16. **Given** the migration has run, **then** no unconfirmed account has a password, and every test and demo account has consent recorded.

## Test Plan

- AC1 → Playwright: update `e2e/login.spec.js` "Google button is hidden…" test (Register no longer has a checkbox gating Sign Up) and add a check for no password fields; `e2e/public-legal-and-reset.spec.js`'s Terms-link test keeps working against the new line.
- AC2, AC3, AC5, AC6, AC7, AC8, AC13 → Deno integration tests on dev in new `supabase/functions/finish-account-setup/index.test.ts` and updated `sign-up/index.test.ts`. They use the existing pattern: scratch users created and signed in once per file, a recovery link minted with the service role, redeemed with `verifyOtp`. Not Playwright: a browser test can't read the email or mint a link without the service role.
- AC3 (the takeover itself) → Deno: "sign up as X sending password A → redeem the link → finish with B → signing in with A fails, B works." This is the test 0069 P1-1 asked for.
- AC4, AC10, AC11, AC12 → Vitest component tests for the new finish form and consent screen (states, disabled button, Sign out, legal routes not gated). Not Playwright: every e2e account is seeded with consent (AC16), so none would see the screen, and creating an unseeded account needs the service role.
- AC9 → Deno: a signed-in scratch user's direct `profiles` update of each consent column is refused.
- AC14 → Deno: checks the two claim functions' definitions require a confirmed email. Running them as an unconfirmed user isn't possible (no normal way to sign in to one), so this is a wording check, flagged in Before You Approve #9.
- AC15 → Vitest parity test next to `src/lib/aiServerParity.test.js`.
- AC16 → Deno: after the migration, a service-role query finds zero unconfirmed accounts with a password and zero test/demo accounts without consent.
- **Manual (Lynn's checklist, on staging):** sign up with a real inbox, finish, log in; accept a real co-owner invite from a non-test account; open the app on an existing account and see the consent screen.
- **Seeding/access constraints:** every server-side check runs in the Deno suite with the service role, as the suite already does. Nothing is added to `.env.playwright`.
- Order independence: each Deno test makes its own scratch user and link; no test reuses another's account.

## Visual Reference

No mockups. The finish page and consent screen reuse `AuthLayout` (the same frame as Login, Register and Accept Invite) and the existing checkbox rows from `Register.jsx`.

## Technical Spec

- **Schema (migration `0064_account_setup_consent.sql`):**
  - Gate: refuses to run until `private.deploy_markers` has `spec_0086_frontend_live` (same pattern as 0055/0061/0063, snippet in its header).
  - `protect_privileged_profile_fields()`: also refuse any non-service-role change to `terms_accepted_at`, `terms_version`, `privacy_version`. `marketing_opt_in` stays user-changeable (people must be able to opt out).
  - `handle_new_user()`: stop copying consent from sign-up metadata (keeps `first_name`). Consent is only ever written by the new function.
  - `claim_pending_co_owner_invites()` / `claim_pending_sitter_invites()`: add `and email_confirmed_at is not null` to the caller lookup. Keep `security definer`, `search_path`, and existing grants (0059 rules).
  - One-time: `update auth.users set encrypted_password = '' where email_confirmed_at is null and encrypted_password <> ''` (the form `email_has_password()` already treats as "no password").
  - One-time: fill consent for `profiles.account_type in ('test','demo')` where it's null, with the current versions. Comment says these are fixture accounts.
- **New Edge Function `finish-account-setup`** (replaces `confirm-email`):
  - Caller identified from their own JWT only. Body: `{ action: 'status' }` → `{ needs_password, needs_consent }`; or `{ action: 'finish', password?, accepted_terms, marketing_opt_in? }`.
  - `finish`: `accepted_terms` must be `true`. If the session came from an email link (JWT `amr` method `otp`) and consent isn't recorded yet, `password` is required and checked (8–128, breached check); otherwise a `password` is refused. `status` returns `needs_password` on the same rule. Never use `email_has_password()` for this (see Planning decision 7). Then one `admin.updateUserById(id, { password?, email_confirm: true })`, then the consent write (`.is('terms_accepted_at', null)`, versions from `_shared/legalVersions.ts`), then `admin.signOut(callerJwt, 'others')`.
  - Uses `serverError()` and plain error copy (spec 0078); exact `npm:`/`jsr:` versions; `verify_jwt` default (true), recorded in `config.toml`.
- **`sign-up`:** create the user with no password, ignoring any `password` or `accepted_terms` sent (old cached pages keep working). Metadata keeps only `first_name`. The breached-password check moves to `_shared/passwordPolicy.ts`, shared with the new function.
- **`confirm-email`:** deleted from all three projects after the frontend is promoted. Its tests in `sign-up/index.test.ts` move to the new function's tests.
- **`_shared/legalVersions.ts`** holds the Terms and Privacy dates; a Vitest parity test compares them with `TOS_LAST_UPDATED` and `PRIVACY_POLICY_LAST_UPDATED`. Fixes the November 20/21 drift.
- **Frontend:**
  - `Register.jsx`: remove password, confirm, both checkboxes and the Google consent stash; add the line from the copy section.
  - New `src/components/FinishAccountSetupForm.jsx`: optional password fields, Terms and marketing checkboxes, calls the function. Used by `VerifyEmail.jsx`, `AcceptInvite.jsx` and the consent screen. `SetPasswordForm.jsx` stays for `ResetPassword.jsx`; the two password inputs are shared, not copied.
  - `VerifyEmail.jsx`: after `verifyOtp`, show the form (no more automatic `confirm-email` call or redirect).
  - New `src/components/ConsentGate.jsx`, rendered by `ProtectedRoute.jsx` and `AdminRoute.jsx` (the admin page sits outside `ProtectedRoute`) when the profile loaded and has no `terms_accepted_at`; asks `status` for whether to show password fields. Skipped on `/terms`, `/privacy` and their section pages. If the profile failed to load, the existing "couldn't load" handling applies and the gate doesn't show (it would otherwise block everyone during an outage); the server still never confirms or records anything without the checkbox.
  - `AuthContext.jsx`: remove the client-side Google consent write; `pendingOAuthConsent.js` and its calls in `Login.jsx`/`Register.jsx` are deleted.
- **Deploy order, per project:** PA-19 off → functions (`sign-up`, `finish-account-setup`) → Lynn promotes the frontend → marker `spec_0086_frontend_live` → `db push` → delete `confirm-email` → `scripts/check-functions-start.sh` and the §11 permissions check.
- **Design System compliance:** checked against `0005 Design System.md` and its amendments. New screens reuse `AuthLayout`, `Button`, `Input`, `Label`, `Checkbox` and Register's existing 44px checkbox rows; text 13px or larger; no emoji, raw colors or hand-rolled sheets. The consent screen is a full page, not an overlay, so it needs no focus trap. `design-system-check` runs after the build. No conflicts found.
- **Constraints from CLAUDE.md:** ships to all three projects (§11); PROTECTED merge; numbers from this first session; the new function follows the 0078/0082 rules (no raw error text, caller's own identity, exact import versions). No conflict with the Vibe model (not touched).

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** `SetPasswordForm.jsx` already exists for reset and invites. This spec shares its password inputs instead of making a second copy. The breached-password check exists only inside `sign-up`; it moves to `_shared` so both functions use one copy.
- **Technical debt nearby:**
  - The Terms/Privacy version dates were hand-copied and already drifted (Before You Approve #2). Fixed here.
  - Password reset skips the breached-password check, because it sets the password in the browser. Not fixed here; worth a punch-list line.
  - `getRequestIp`/`verifyTurnstile` are still copied in three functions (PA-39, bundle B04). Not touched here.
- **Orphaned features nearby:** `pendingOAuthConsent.js` becomes unused and is deleted. The unused `password-reset` email template (PA-39) is unchanged.
- **Punch list / known issues:** this closes PA-13 and PA-18. It depends on PA-19 (B01) as a deploy step. 0069's P2 "invite claims don't require a confirmed email" is part of PA-18 and closed here. PA-31 (CAPTCHA on Register) is separate (B04).
- **Invite behavior change, by design:** `invite-co-owner`/`invite-sitter` decide "existing account vs stuck invite" by whether the address has a password (`email_has_password()`). An unconfirmed sign-up now has no password, so an invite to that address sends an invite link (going to the finish page) instead of the "you've been added" email. That's the safe outcome: the inbox owner gets a working link.

## Non-Goals

- Asking people to agree again when the Terms or Privacy Policy change (a later spec; the write-once rule will need a server-side "new version" path then).
- A consent history log (one current record per account only).
- Turning Google sign-in back on.
- CAPTCHA on sign-up (PA-31) and the other B01 dashboard items.
- Adding the breached-password check to password reset.
- Deleting old unconfirmed accounts.

## Planning decisions (Lynn, 2026-11-27)

1. **Resend:** the sign-up function's "resend" (and its already-registered branch) sends a fresh link to any account that is unconfirmed **or has no consent recorded** (changed by decision 7; it originally said "has no password"), so someone whose link-click already confirmed them but who closed the page early can still get back in. Still enumeration-safe (same generic response).
2. **Invite link for a finished account:** if `status` says no password and no consent are needed, `/accept-invite` skips the form and goes straight to the pet (or Pet Sitter page).
3. **Partial failure:** if a password was saved but consent wasn't, the form re-checks `status` and shows just the Terms checkbox.
4. **Marketing on the existing-account screen:** a finish call with no `marketing_opt_in` leaves the person's current setting unchanged.
5. **Build finding (T2 review, 2026-11-27):** on dev, `admin.createUser()` with no password still stores a random password hash, so `email_has_password()` says the account has one. New sign-ups are therefore created with `admin.generateLink({ type: 'invite', email, options: { data: { first_name }, redirectTo } })`, the same call `invite-co-owner` already uses, which creates the account with no password and returns the link token. The email link carries `type=signup` (verified on dev: an invite-minted token redeems as `signup`), so it works on both the old and new `/verify-email` page and the deploy order is unaffected; `/verify-email` also accepts `invite`. If the address already has an account, sign-up skips the invite call and sends a recovery link (so a pending co-owner/sitter invite link keeps working). No behavior change for people.
7. **Signal for "needs a password" (Lynn, 2026-11-27, after the T2 review):** verified on dev that redeeming a sign-up or invite link makes Supabase store a random password (upstream `verify.go`, invited users), so `email_has_password()` is true for every account after its link is clicked. "Needs a password" is therefore decided by how the session signed in: the JWT's `amr` claim is `otp` for every email-link session (sign-up, invite, recovery; survives refresh) and `password` for a password login (both verified on dev). Email-link session + no consent → password required; anything else → password refused. Tests must redeem real links with `verifyOtp`, never fake the state with `updateUserById`.
8. **Build note (T3, 2026-11-27):** verified on dev that an admin password change ends *every* session, including the caller's own. So after a finish that set a password, the page signs in again with the email and the new password before continuing (invisible to the person). If consent failed to save after the password did, that new password-login session sees the Terms-checkbox-only screen, which is decision 3.
9. **Build note (T4, 2026-11-27):** on shared dev, other test files deliberately create unconfirmed accounts with passwords and test accounts without consent, and CI runs can overlap. So AC16's test checks the 9 named allowlist fixture accounts for consent, and skips `ci-scratch-*` and under-an-hour-old accounts for the password check. Since `handle_new_user()` no longer copies consent, a fixture account newly created on any project needs consent recorded with the service role (add to CLAUDE.md's "adding a test inbox" steps). After restoring a backup taken before 0064, 0064's one-time steps (password wipe, fixture consent) must be run again.
10. No rate limit on `finish-account-setup` (sign-in required). Sign-up integration tests stay local-only, as today.

## Open Questions

None. Lynn answered these on 2026-11-27: the Terms checkbox moves to the finish page only; existing accounts get a blocking screen; marketing opt-in moves to the finish page (not shown on the existing-account screen); PA-19 is a required deploy step.
