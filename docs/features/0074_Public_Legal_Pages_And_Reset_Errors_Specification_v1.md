# 0074_Public_Legal_Pages_And_Reset_Errors_Specification_v1

**Status:** Shipped 2026-11-21. PR #40 merged (`c6bc3a0`); Lynn promoted the frontend to prod. No Supabase deploy needed.
**Date:** 2026-11-21
**Punch list:** PA-08, PA-09 (both P0, Pre-Alpha Audit tab, `docs/planning/Wysker_Watch_Launch_Plan.xlsx`). Source findings: spec 0068 P0-7, spec 0069 P0-2.
**Related files:** `src/App.jsx`, `src/components/ProtectedRoute.jsx`, `src/pages/{Terms,TermsOfServiceSection,Privacy,PrivacyPolicySection}.jsx`, `src/pages/ForgotPassword.jsx`, `src/pages/ResetPassword.jsx` (unchanged), `src/pages/{Login,Register}.jsx` (link to the legal pages, unchanged), `src/lib/AuthContext.jsx`, `src/lib/errorMonitoring.js`, `src/api/supabaseClient.js`, `e2e/login.spec.js`, `supabase/tests/co_owner_access.test.ts` (pattern), `docs/foundation/0006 Technical Standards.md` §11, `docs/testing/QA_Test_Plan.md`

**Lane:** Backend (adds a CI step and a `supabase/tests` Deno test), though the app change itself is frontend-only.

## Lynn — what I need from you

1. **Say "merge" once the PR's checks pass.** Blocks the deploy.
2. **Cloudflare dashboard → promote the frontend build** for branch `main`, commit message starting "Spec 0074". I'll give you the exact row. Blocks marking PA-08/PA-09 Complete.
3. **After the promote, a 1-minute check on prod:** open `https://wyskerwatch.com/terms` in a private window (signed out). It should show the Terms, not the login page. Not blocking anything.

Everything else (code, tests, docs, punch list) is done by Claude Code. No Supabase changes are needed; your dashboard work below is already finished.

## Dashboard work already done (2026-11-21, by Lynn)

- **Custom SMTP is on in all three Supabase projects**, sending through Resend (`smtp.resend.com`, sender `Wysker Watch <no-reply@wyskerwatch.com>`, one Resend API key per project). Before this, prod used Supabase's built-in mailer, which only delivers to Supabase team members, so friend testers could never get a reset email.
- **Branded Reset Password template** pasted into each project (Authentication → Emails → Templates). It's the repo's previously unused `supabase/functions/_shared/email/templates/password-reset.ts`, rendered through `layout.ts` with `{{ .ConfirmationURL }}` as the link. Subject: "Reset your Wysker Watch password".
- **Prod Redirect URLs** now include `https://wyskerwatch.com/reset-password` and `https://www.wyskerwatch.com/reset-password`. Lynn's first test after SMTP landed on the home page (her pets) instead of Set New Password: Supabase only returns people to addresses on that list, and falls back to the Site URL otherwise. Most likely cause: the 2026-07-26 rewrite of prod's list during spec 0021 kept only `/verify-email` and `/accept-invite`. No code had changed.
- **Staging and dev Redirect URLs** now include `/reset-password` on their own addresses (dev: `http://localhost:5173/reset-password`).
- **Prod re-tested 2026-11-21 (Lynn):** a fresh reset email arrived and its link opened Set New Password. Password reset works on prod. The code in this spec is still needed so a future failure shows an error, and so a slipped setting still lands on the right screen.

## Before You Approve This

1. **The code fix for PA-09 doesn't make reset emails arrive. It only stops the app from lying when they don't.** SMTP (above) was the real delivery fix. This spec makes any future failure visible instead of showing a fake "sent".
2. **No new "show the frame if signed in" component is needed.** The existing login guard (`ProtectedRoute`) already accepts "what to show a signed-out visitor" as a setting. For the legal pages that becomes "just show the page". Signed-in users keep the header and bottom nav; signed-out visitors get the plain page. Side effect: signed-out visitors see the same brief loading spinner every page shows while it checks whether they're logged in.
3. **Reset failures will now go to Sentry** (the crash and error tracker) from people who aren't signed in. The filter that hides test-account errors can't tell who they are, so these always get through. Only the error is sent, never the email address typed in. "Too many tries" errors aren't sent; they're normal, not a bug.
4. **Related, not in scope:** Support and About are also behind the login. A signed-out person whose reset fails can't open the Support page. The error message gives the support email directly, which works around this.
5. Self-review found no duplicate features, no conflicts with locked decisions and no new debt beyond what's listed here.
6. **Redirect list: the code needs four addresses, not three.** Besides reset, verify-email and accept-invite, Google sign-in sends people back to the app's home page (`Login.jsx:146`, `Register.jsx:73`). Usually the Site URL already covers that, but it belongs in the record so nobody tidies it away.
7. **What's automated and what's manual.** All the test accounts (test1–4@, coowner1–2@, petsitter1–2@) are aliases that deliver to Lynn, so the full click-through (email arrives, looks right, link opens Set New Password) is a manual check she can do any time. Automated tests can't read her inbox, so they test the parts a machine can: the server-side Deno suite asks Supabase for a real reset link (no email sent) and checks where it would send the person, which catches exactly the redirect-list bug found above. The app's backup redirect gets its own small unit test.
8. **The backup reloads the page once** instead of switching screens smoothly. The login system sits above the app's page-switching layer, so it can't use the normal in-app switch. There's a quick flash on the way to Set New Password; the temporary login survives the reload.

## Functional Requirements

1. Anyone can read the Terms of Service and Privacy Policy, including every section page, without signing in. This matters most from the signup screens, which ask people to agree to them.
2. Signed-in users see these pages exactly as they do today, inside the app's header and bottom nav.
3. On a legal page opened in a new tab (no history to go back to), Back still goes somewhere sensible. From a list page it goes to Login if you're signed out, or the Menu if you're signed in. From a section page it goes to that document's list. Everywhere else, Back works as it does today.
4. When a password-reset request fails, the person is told, the form stays open with their email still filled in, and they can try again.
5. The success message stays the same, so the page still never reveals whether an email address has an account.
6. Anyone who opens a password-reset link ends up on the Set New Password screen, even if a Supabase setting sends them somewhere else.
7. The repo keeps a written list of every address Supabase must allow people back to, on each project, so a dashboard change can be checked against it.

## Acceptance Criteria

1. **Given** I'm signed out, **when** I open `/terms`, `/privacy`, or any section page, **then** I see the page's content, not the login screen.
2. **Given** I'm signed out on a legal page, **then** there's no bottom nav. **Given** I'm signed in, **then** the bottom nav shows, with Menu active.
3. **Given** I open `/terms` directly in a fresh tab while signed out, **when** I tap Back, **then** I land on `/login`. (Signed in: `/settings`. On a section page: that document's list.)
4. **Given** I tapped into a section from the Terms list, **when** I tap Back, **then** I return to the list (normal back behavior is unchanged).
5. **Given** the reset request is refused for too many tries, **then** I see: "Too many reset requests. Please wait a few minutes, then try again." The form stays open with my email still in it.
6. **Given** the reset request fails for any other reason, **then** I see: "We couldn't send your reset email. Please try again, or email support@wyskerwatch.com if it keeps happening." The form stays open.
7. **Given** the request succeeds, **then** I see the existing "If an account exists for {email}, you'll receive a reset link shortly."
8. **Given** SMTP is set up, **when** a non-team address requests a reset on prod, **then** the branded email arrives.
9. **Given** a reset link sends me to any page other than `/reset-password`, **then** I'm moved to Set New Password automatically. **And given** Supabase's redirect list is correct, the link goes straight to `/reset-password` in the first place.
10. **Given** I'm already on `/reset-password`, **then** nothing reloads or jumps.
11. **Given** any other kind of login event (normal sign-in, background session refresh, sign-out), **then** nothing happens.
12. **Given** prod, staging and dev, **then** each project's Redirect URLs list contains every address in the record (Lynn checks this in the dashboard).

User-facing copy in AC5/AC6 approved by Lynn, 2026-11-20.

## Test Plan

New Playwright file `e2e/public-legal-and-reset.spec.js`:
- AC1 → signed out (`storageState` emptied, as `login.spec.js` does): open `/terms`, `/privacy` and one section page of each; check each heading, with the URL not changing to `/login`.
- AC2 → signed out: no "Menu" link. Signed in (default test1@ session): "Menu" link visible.
- AC3 → signed out: `goto('/terms')`, tap Back, URL is `/login`. Signed in: `/settings`. Section page opened directly: goes to `/terms`.
- AC4 → open `/terms`, tap a section, tap Back, URL is `/terms`.
- AC5/6/7 → on `/forgot-password`, fake the server's reply with `page.route()` on `**/auth/v1/recover**` (as `ask-wysker-guardrails.spec.js` does): 429 for AC5, 500 for AC6, 200 for AC7. Check the message, and for AC5/6 that the email box still holds the address. Faked replies mean no real email is sent and dev's email rate limit isn't used. No test depends on another's data, so order doesn't matter.

New Vitest file `src/lib/__tests__/passwordRecovery.test.js` (same style as `timezone.test.js`):
- AC9 (backup), AC10, AC11 → `shouldRedirectToReset` returns true only for `PASSWORD_RECOVERY` on a path other than `/reset-password`; false for `/reset-password`, and false for `SIGNED_IN`, `TOKEN_REFRESHED`, `SIGNED_OUT`, `INITIAL_SESSION`.

New Deno file `supabase/tests/password_reset_redirect.test.ts` (runs in the existing CI Edge Function job against dev, which already has the dev secret key):
- AC9 (redirect list) → create one scratch user per file (the `co_owner_access.test.ts` pattern, to stay under Supabase's sign-in limit), call `auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: '<dev app URL>/reset-password' } })` (creates the link, sends no email), fetch its `action_link` with `redirect: 'manual'`, and assert the `Location` header starts with `<dev app URL>/reset-password` and carries `type=recovery`. A missing allowlist entry makes Supabase fall back to the Site URL, so the test fails. Can be run by hand against staging/prod with that project's keys; not automated there.

Manual:
- AC8 + AC9 end to end → Lynn, prod (then staging): request a reset for petsitter1@ (an alias to her), confirm the branded email arrives and the link opens Set New Password.
- AC12 → Lynn checks each project's Redirect URLs against the table in Technical Standards §11.

**Seeding/access constraints:** Playwright needs nothing beyond normal or signed-out sessions. The Deno test uses the dev secret key the CI Deno job already has; no secret key is added to `.env.playwright`.

`QA_Test_Plan.md` additions:
- §5.9: "Privacy/Terms open while signed out" and "Back fallback in a new tab" (Playwright).
- §5.1: "`/forgot-password` shows an error on failure (rate-limit / general)" (Playwright); "reset link redirects to `/reset-password`" (Deno); "reset-link login always lands on Set New Password" (Vitest); "reset email arrives at a non-team address and opens Set New Password" (Manual, prod).

## Visual Reference

None provided. The error text uses the existing inline-error style on Login and Register (red text above the button), so there's no new visual pattern. The reset email reuses the shared transactional email layout.

## Technical Spec

- **Schema / Edge Functions:** none. Frontend, one test file per suite, and docs.
- **`src/App.jsx`:** move the 4 legal routes (`/privacy`, `/privacy/:sectionId`, `/terms`, `/terms/:sectionId`) out of the main `ProtectedRoute` group into a new group: `<Route element={<ProtectedRoute unauthenticatedElement={<Outlet />} />}>`. Signed in → `AppShell` (header + nav); signed out → just the page. No change to `ProtectedRoute.jsx`. `BottomTabBar`'s `MENU_PATHS` unchanged. `AuthContext` already checks the session on mount (`:54`), so `ProtectedRoute` resolves on these pages.
- **Back fallback:** new `src/hooks/useBackWithFallback.js` → `(fallbackPath) => () => location.key === 'default' ? navigate(fallbackPath, { replace: true }) : navigate(-1)`. React Router gives the first page of a tab the key `'default'`; a refresh keeps the page's key. Terms/Privacy pass `isAuthenticated ? '/settings' : '/login'` (from `useAuth()`); section pages pass `/terms` or `/privacy`. Only the 4 legal pages use it; the other 18 `navigate(-1)` back buttons are untouched.
- **`src/pages/ForgotPassword.jsx`:** read `{ error }` from `resetPasswordForEmail`. `error.status === 429` (Supabase's `over_email_send_rate_limit` / `over_request_rate_limit`) → rate-limit message. Any other error, or a thrown exception → general message plus `Sentry.captureException(error, { tags: { feature: 'forgot-password' } })`, never including the email. Only success switches to the "sent" view. Error markup: `<p className="text-base text-destructive text-center" role="alert">`, matching `Login.jsx:169` plus `role="alert"`. Typing in the email field clears the error. Remove the empty `catch {}`.
- **`src/lib/passwordRecovery.js`** (new): `export function shouldRedirectToReset(event, pathname) { return event === 'PASSWORD_RECOVERY' && pathname !== '/reset-password'; }`.
- **`src/lib/AuthContext.jsx`:** in the existing `onAuthStateChange` listener (`:58`), rename `_event` to `event` and add `if (shouldRedirectToReset(event, window.location.pathname)) window.location.replace('/reset-password');` before the existing session handling. `window.location` because `AuthProvider` wraps `<Router>` (`App.jsx`), so React Router navigation isn't available there; `replace` keeps the wrong page out of Back history. `supabaseClient.js` uses supabase-js's default implicit flow (token in the link), so this works even when the email is opened on another device, and the session is saved before `PASSWORD_RECOVERY` fires, so the reload finds it.
- **Redirect record:** add to `docs/foundation/0006 Technical Standards.md` §11 a "Supabase Auth → Redirect URLs (dashboard, not in the repo)" table:

  | Address (on each project's own app domain) | Used by |
  |---|---|
  | `/` (the Site URL) | Google sign-in, `Login.jsx` / `Register.jsx` |
  | `/reset-password` | Forgot Password, `ForgotPassword.jsx` |
  | `/verify-email` | Signup confirmation, `sign-up` function |
  | `/accept-invite` | Co-owner and sitter invites, `invite-co-owner` / `invite-sitter` |

  Domains: prod is bare `https://wyskerwatch.com` plus `www`; dev is `http://localhost:5173`; staging is its own address. Repeat 0069's rule: prod lists no `localhost` and no broad wildcards. Rule: any new `redirectTo` in code is added to this table and to all three dashboards in the same change. Also record in §11 that Auth emails (password reset) go through Supabase's custom SMTP → Resend, separately from the app's own `sendEmail.ts`, and that the Reset Password template is a dashboard copy of `password-reset.ts`. CLAUDE.md gets a one-line pointer.
- **Design System compliance:** checked against `0005 Design System.md` including its Amendments. The only new UI is one error line using the existing `text-destructive` token at 16px (above the 13px floor). Legal page layouts are unchanged; the back button already uses `IconButton`. No systemic component issue found. `design-system-check` runs on the edited `.jsx` files at implementation.
- **CLAUDE.md constraints:** copy approved by Lynn. Frontend deploy promoted by Lynn; name the Cloudflare row by commit message on `main`, not SHA. Staging syncs only when asked. No backend deploy needed.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** none. No existing back-with-fallback helper (no `location.key` / `history.length` use anywhere).
- **Root cause, recorded:** the reset link landing on the home page was a dashboard setting (redirect list), most likely dropped on 2026-07-26 (spec 0021). The repo had no record of which addresses the list needs; this spec adds one and a CI test that checks it on dev.
- **Technical debt nearby:** `ForgotPassword.jsx`'s empty `catch {}` hid every failure; removed here. The `password-reset` template is no longer orphaned in practice (it's pasted into the dashboards), but the dashboard copy can drift from the repo file; §11 notes this.
- **Small gap left alone:** `ResetPassword.jsx` enables its button once it has asked "is there a session?", even if the answer is no. Someone opening `/reset-password` directly gets an error only after submitting.
- **Orphaned features nearby:** none.
- **Punch list:** closes PA-08 and PA-09 once built and the manual checks pass.

## Non-Goals

- Opening Support or About to signed-out visitors.
- Changing the other 18 back buttons in the app.
- A signed-in "Change password" option on the Account page (separate punch-list item if wanted).
- Any change to `ResetPassword.jsx`.
- Automating the inbox side of the reset test.

## Open Questions

- None blocking. The prod re-test after the redirect fix confirms AC8/AC9 manually.

## Build Notes

- **Shipped 2026-11-21:** PR #40 (`c6bc3a0`). Required CI checks passed, including the new `password_reset_redirect.test.ts` in the `edge-functions` job. Frontend promoted to prod by Lynn.
- **Verified on prod (signed out, built-in browser):** `https://wyskerwatch.com/terms` shows Terms of Service, with no bottom nav and no redirect to `/login`. An automated headless check was blocked by Cloudflare Bot Fight Mode (expected), so the check was done in the Browser pane instead.
- **Prod reset flow:** confirmed end to end by Lynn before the build (custom SMTP, branded template, `/reset-password` on the Redirect URLs list). The code here adds error messages, the reset-link backup and the CI check on top.
- **Full local Playwright run before merge:** 95 passed, 3 failed. The 3 are `vaccination-due-reminders.spec.js`, broken by 7 leftover "Vaccination Due Soon" notifications on test1@'s dev account (known issue, CLAUDE.md). That file is skipped in CI.
- **Implementation detail:** the new Playwright spec must import `test` from `e2e/fixtures.js`, not `@playwright/test`, to get the saved signed-in session; the first run failed the two signed-in tests for that reason.
