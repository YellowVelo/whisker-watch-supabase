# 0047_Signup_Consent_Gate_Specification_v1

**Status:** Implemented
**Date:** 2026-08-05
**Related files:** `src/pages/Register.jsx`, `src/pages/Login.jsx`, `supabase/functions/sign-up/index.ts`, `supabase/migrations/0046_save_daily_check_ins_conflict_detection.sql` (most recent — this spec adds `0047_...`), `src/lib/termsOfServiceContent.js`, `src/lib/privacyPolicyContent.js`, `src/components/ui/checkbox.jsx`

## Before You Approve This

- **Scope grew beyond the original punch-list line.** The punch list only named `Register.jsx`. Investigation found the *same* gap on `Login.jsx`'s own "Continue with Google" button — Supabase auto-creates a brand-new account for a first-time Google sign-in, so someone could create an account through the Login page with zero consent interaction, even after Register.jsx is fixed. You already confirmed this should be included, so both pages are in scope.
- **This adds a small, new piece of database storage** (four columns on the `profiles` table — see Technical Spec) to record *that* someone agreed, *when*, and *which version* of the Terms/Privacy they agreed to. That's a real, if small, schema change — not just a UI checkbox — per your decision to make the consent provable later rather than just gate the button.
- **The Google sign-in path can only be gated on the client, not proven server-side the same way.** Supabase's OAuth flow doesn't let this app inject "the user checked this box" into the account-creation step the way the email/password path can. The workaround (write the consent record right after the redirect completes, using the session that now exists) is described in the Technical Spec — flagging here because it's a slightly different mechanism from the email-signup path, not a single unified one.
- No conflicts with CLAUDE.md's locked decisions, or with the Design System doc (checked in full, including the 2026-07-30 Amendments), were found.

## Functional Requirements

1. A new user creating an account by email/password on the Register screen must explicitly check a box confirming they agree to the Terms of Service and Privacy Policy before the "Sign Up" button will submit the form. The box is unchecked by default (nothing is pre-agreed on their behalf).
2. That same checkbox text must contain live links to the actual Terms of Service and Privacy Policy screens, so a person can read what they're agreeing to without leaving the signup flow (opening in a new tab, matching how these links already work elsewhere in the app).
3. A new user creating an account via "Continue with Google" — on both the Register screen and the Login screen (since Login's Google button can also create a brand-new account for a first-time Google user) — must also see and check the same agreement box before that button can be used.
4. A second, separate checkbox lets a new user opt in to marketing communications. It is unchecked by default and is never required — leaving it unchecked must not block account creation. (No marketing emails exist in the app yet — see Repo Findings — so checking or unchecking this box has no visible effect today. It only saves the answer for later.)
5. The app keeps a record of *that* a person agreed to the Terms/Privacy, *when*, and *which version* of each document they agreed to (the "Last updated" date already shown on those screens) — so if a legal or App/Play Store question ever comes up, there's a real answer instead of just "the box was probably checked."
6. An existing user signing in (not creating a new account) is never shown or blocked by this checkbox — this only applies to new account creation.

## Acceptance Criteria

- Given a person on the Register screen has not checked the agreement box, then the "Sign Up" button does not create an account (client-side block, and the server independently rejects the request if it somehow arrives unchecked).
- Given a person checks the agreement box and completes the form, then the account is created as it is today, and the app now has a record of when they agreed and to which Terms/Privacy version.
- Given a person on the Register screen has not checked the agreement box, then the "Continue with Google" button is disabled (not clickable).
- Given a person on the Login screen has not checked the agreement box, then the "Continue with Google" button is disabled (not clickable) — same as Register, because this button can also create a new account.
- Given a person checks the agreement box and completes Google sign-in as a first-time user, then the app records their agreement (timestamp + versions) immediately once they're signed in.
- Given a person signs in with Google and *already* has an account (returning user, not first-time), then the agreement checkbox on the Login screen is not shown, and no new consent record is created or overwritten — the box is a signup gate, not a wall to re-click every login.
- Given a person leaves the marketing checkbox unchecked, then the account is still created normally and no error is shown.
- Given a person taps either the "Terms of Service" or "Privacy Policy" link inside the checkbox label, then the corresponding screen opens in a new tab and the checkbox's own checked/unchecked state is unaffected.

## Test Plan

- Sign Up blocked with box unchecked → Playwright test: fill the Register form, leave the checkbox unchecked, assert the Sign Up button is disabled/submission doesn't proceed.
- Sign Up succeeds with box checked, consent recorded → Playwright test: complete Register with the checkbox checked, assert the success ("check your email") state renders. The *recorded* timestamp/version itself is not independently assertable through the UI (nothing displays it back to the user) — this is noted as a gap below, not silently skipped.
- Google button disabled on Register until checked → Playwright test: load Register, assert the Google button is disabled; check the box, assert it becomes enabled.
- Google button disabled on Login until checked → Playwright test: load Login, assert the Google button is disabled; check the box, assert it becomes enabled.
- Marketing checkbox optional, doesn't block signup → Playwright test: complete Register with the agreement box checked and the marketing box left unchecked, assert signup still succeeds.
- Terms/Privacy links open the right screen → not covered by a new automated test. Opening a link in a new tab (`target="_blank"`) is the same pre-existing, already-flagged test gap noted in spec `0038` (asserting new-tab behavior reliably in Playwright needs extra popup-handling setup) — not introduced by this spec.
- Consent record's actual database values (timestamp, correct version strings, marketing flag value) → **not achievable through the Playwright suite as currently set up.** The e2e suite signs in via a saved fixture session (an account that already exists) — it never runs the real signup flow end-to-end against a disposable account, and it has no privileged database access to go verify a row's column values afterward (see `e2e/` conventions in CLAUDE.md — no service-role key in `.env.playwright`). This is a real, pre-existing limitation of the suite, not something this spec can fix in passing. **Recommend a manual verification step post-implementation:** sign up a real test account once, then check the `profiles` row via the Supabase dashboard's Table Editor to confirm the four new columns populated correctly, for both the email/password path and the Google path.
- Returning Google user is not shown the checkbox again → not covered by a new automated test; would require an existing Google-authenticated fixture session, which the current suite conventions (see above) don't provide a seeding path for. Flagged as an open gap rather than silently skipped.
- **Seeding/access constraints:** the two items above are the real limits — everything else on this list is reachable through a normal, unauthenticated Playwright session (Register/Login are public pages) with no database writes needed for the test itself.

## Visual Reference

No mockups provided. No new component beyond `Checkbox` (already exists as a shared primitive, see below) and standard label text with inline links — nothing here needs a mockup to build against.

## Technical Spec

- **Schema:** New migration `supabase/migrations/0047_signup_consent.sql`, adding four columns to `public.profiles`:
  - `terms_accepted_at timestamptz` — when the Terms/Privacy agreement was recorded. Null for any account created before this ships (existing users are never retroactively asked).
  - `terms_version text` — the Terms of Service "Last updated" string in effect at signup (`TOS_LAST_UPDATED` from `src/lib/termsOfServiceContent.js`, currently `'July 10, 2026'`).
  - `privacy_version text` — same idea for the Privacy Policy (`PRIVACY_POLICY_LAST_UPDATED` from `src/lib/privacyPolicyContent.js`, currently `'June 30, 2026'`). Stored separately from `terms_version` because the two documents already carry independent "last updated" dates and can change on different schedules.
  - `marketing_opt_in boolean not null default false` — the answer to the separate, optional checkbox. Defaults to `false` for existing rows (nobody is silently opted in).
  All four are plain, self-editable columns — none need the privileged-field protection `0011_protect_privileged_profile_fields.sql` added for `role`/`account_type`, since a user controlling their own consent/marketing answer isn't a privilege escalation risk the way self-granting `account_type = 'test'` would be.
- **Components/files touched:**
  - `src/pages/Register.jsx` — adds the two checkboxes (using the existing `Checkbox` primitive at `src/components/ui/checkbox.jsx`, which today is only used internally inside dropdown/context menus, never yet as a real form control — this is its first use as one). Agreement checkbox state gates both the Sign Up button's `disabled` state and the Google button's `disabled` state. `handleRegister` now also passes `accepted_terms: true` and `marketing_opt_in` in the `sign-up` function call body.
  - `src/pages/Login.jsx` — adds the same agreement checkbox, but only ever gating the Google button (Login has no email/password signup path to gate — that's what Register is for). Shown unconditionally next to the Google button; per the accepted-criteria above, a *returning* Google user's sign-in doesn't write a new consent record even though the checkbox is visually present — see the OAuth handling note below for how "first-time vs returning" is actually detected.
  - `supabase/functions/sign-up/index.ts` — the `signup` action now requires `accepted_terms === true` in the request body, returning a 400 if missing/false (server-side enforcement, not just a disabled button — a direct API call still can't bypass this). Accepts optional `marketing_opt_in: boolean`. Both values, plus the current `TOS_LAST_UPDATED`/`PRIVACY_POLICY_LAST_UPDATED` strings (imported server-side or passed from the client — implementer's choice, see Open Questions), are passed into `adminClient.auth.admin.createUser()`'s `user_metadata`, the same mechanism `first_name` already uses.
  - `handle_new_user()` (currently defined in `0015_profile_first_name.sql`, most recently touched by `0017`) — extended to also read `terms_accepted_at`/`terms_version`/`privacy_version`/`marketing_opt_in` out of `raw_user_meta_data` and populate them on the new `profiles` row, same pattern as the existing `first_name` read.
  - **Google OAuth path (both pages):** `handleGoogleLogin` doesn't go through the `sign-up` Edge Function, so it can't pass `user_metadata` the way email signup does — Supabase's `signInWithOAuth()` has no equivalent metadata parameter. Instead: after the OAuth redirect completes and `AuthContext.jsx`'s existing `onAuthStateChange` listener fires a fresh `SIGNED_IN` session, the app checks whether `profiles.terms_accepted_at` is still null for that user. If it is (meaning this is that account's first sign-in ever, since `handle_new_user()` always creates the row but leaves these columns null for OAuth signups), the client writes `terms_accepted_at`/`terms_version`/`privacy_version`/`marketing_opt_in` directly via a normal self-update (`profiles_update_own` RLS policy already allows this — no privileged-field concern, see Schema above). If `terms_accepted_at` is already set, nothing is written — this is what makes a *returning* Google user skip re-consenting. This check/write needs a home; `AuthContext.jsx` (where the session listener already lives) is the natural place, but the exact implementation is left to the implementer.
- **API / edge functions:** `supabase/functions/sign-up/index.ts` as described above. No other Edge Function touched.
- **Design System compliance:** Checked against `docs/foundation/0005 Design System.md` including the 2026-07-30 Amendments. The shared `Checkbox` component (`src/components/ui/checkbox.jsx`) must be used rather than a hand-rolled `<input type="checkbox">` — consistent with the doc's general "don't hand-roll a control that already has a shared component" pattern (echoed in CLAUDE.md's list of de-duplicated primitives, though `Checkbox` itself wasn't one of the five named there). The checkbox's clickable area (including its label, per standard practice — clicking the label text should also toggle it) must meet the 44px minimum touch target (Amendment/rule on large touch targets, `0005 Design System.md` line ~226) — the label text wrapping the checkbox should be a large enough tap target on its own, not just the small square. Label/link text must stay at or above the 13px type-scale floor (Amendment #7). No raw hex colors — links use the existing `text-primary` treatment already used elsewhere in these files (e.g. the "Sign in"/"Sign up" footer links). No conflicts found beyond ensuring the new checkbox follows these existing patterns.
- **Constraints from CLAUDE.md / locked decisions:** Respected — this doesn't touch check-in/scoring logic, AI guardrails, or any of the other locked areas CLAUDE.md calls out. Not deployed automatically — per CLAUDE.md, frontend deploys are manual (Lynn), and this also needs the new migration pushed to all three Supabase projects (dev/staging/prod) as a manual step, same as any other schema change.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** None found for the checkbox/consent gate itself. The `Checkbox` UI primitive already exists (`src/components/ui/checkbox.jsx`, via Radix) but has never been used as an actual form control anywhere in the app — only as the internal building block for dropdown/context-menu "checkbox items." This spec is its first real-world use, not a duplicate of anything.
- **Technical debt nearby:** None found in the signup/login files themselves. One adjacent, pre-existing gap this spec's investigation surfaced (not something it needs to fix, but worth knowing): **no marketing-email sending capability exists anywhere in the app today** — confirmed directly in `docs/features/0006 Pet Delete Test and Demo Accounts V2.md`, which states plainly "No reminder, marketing, or vet-email sending exists in the app today." That's why the marketing checkbox in this spec only stores an answer — there's genuinely nothing to wire it up to yet.
- **Orphaned features nearby:** None found.
- **Punch list / known issues in this area:** This spec directly resolves `docs/launch-punch-list.md` line 127 ("Terms of Service acceptance at signup"). It also surfaces and resolves a related gap that wasn't on the punch list at all: Login.jsx's Google button creating unconsented accounts (see "Before You Approve This"). Spec `0038` (legal-content rendering de-duplication, already shipped) explicitly called this exact punch-list item out of its own scope — this spec is the "separate future spec" that document said would eventually need to pick it up.

## Non-Goals

- Does not build any marketing-email sending capability — the marketing checkbox only stores a yes/no answer for whenever that capability is eventually built.
- Does not add a Settings-screen control to change the marketing opt-in answer after signup — that's a reasonable follow-up once marketing email actually exists, not needed for this consent gate.
- Does not retroactively ask existing users (signed up before this ships) to accept anything — their `terms_accepted_at` stays null, which is treated as "predates this requirement," not as a violation to chase down.
- Does not add a CAPTCHA or otherwise change signup's existing anti-abuse posture — that's explicitly a separate, already-documented decision (see `sign-up/index.ts`'s own header comment on the "no CAPTCHA at launch" decision).
- Does not change what the Terms of Service or Privacy Policy documents themselves say.

## Open Questions

Both resolved before implementation:

- **Version source for the email/password path: Option (b) chosen.** `supabase/functions/sign-up/index.ts` holds its own copy (`TOS_VERSION`/`PRIVACY_VERSION` constants) rather than trusting a client-sent value — a modified client can't claim it agreed to a different version than what's actually live. Kept in sync by hand with `TOS_LAST_UPDATED`/`PRIVACY_POLICY_LAST_UPDATED`; a comment in the Edge Function flags this.
- **Checkbox wording: "I agree to the Terms of Service and Privacy Policy."**, with "Terms of Service" and "Privacy Policy" each as separate inline links to their respective pages.

## Implementation Notes

- `supabase/migrations/0047_signup_consent.sql` — adds the four `profiles` columns and extends `handle_new_user()`.
- `supabase/functions/sign-up/index.ts` — validates `accepted_terms === true` (400 if not), passes consent + its own version constants into `createUser()`'s `user_metadata`.
- `src/pages/Register.jsx` — both checkboxes; Sign Up and Google buttons disabled until the agreement checkbox is checked.
- `src/pages/Login.jsx` — agreement checkbox added; only gates the Google button (Sign In is unaffected, since it never creates a new account).
- `src/lib/pendingOAuthConsent.js` (new) — sessionStorage handoff so the Google button's checkbox answer survives the OAuth full-page redirect.
- `src/lib/AuthContext.jsx` — on first profile load, if `terms_accepted_at` is still null and a pending OAuth consent answer exists, writes it via a normal self-update. Returning Google users (who already have `terms_accepted_at` set) are never touched.
- `src/components/ui/checkbox.jsx` — added the same `any`-cast passthrough-props pattern already used by `Input`/`Button`, needed because this was `Checkbox`'s first real use as a form control (previously only used internally by dropdown/context menus) and `checkJs` couldn't infer `id`/`checked`/`onCheckedChange` from the bare destructured signature.
- Verified: `npm run lint`, `npm run typecheck`, and `npm test` (119 tests) all pass. Manually confirmed in-browser that both buttons start disabled and enable once the agreement checkbox is checked (Register and Login), and confirmed server-side via direct calls to the deployed function that `accepted_terms: false` and an omitted `accepted_terms` are both rejected with a 400 before any account is created.
- Migration `0047_signup_consent.sql` and the updated `sign-up` Edge Function are now deployed to all three Supabase projects: `wysker-watch-dev`, `wysker-watch-staging`, and `Whisker-Watch` (prod).
- Full success path confirmed end-to-end: a real test signup (`lynn.mount+consenttest0047@gmail.com`) was created via the deployed `sign-up` Edge Function, the confirmation email arrived, and clicking its link successfully verified the account.
- Database values confirmed directly: Lynn checked the `profiles` table via the Supabase dashboard's Table Editor and confirmed the new consent columns (`terms_accepted_at`, `terms_version`, `privacy_version`, `marketing_opt_in`) are present and populated on the row. The manual verification step called out in the Test Plan is complete — no open items remain for this spec.
- Initial verification attempts used `@example.com` test addresses, which Resend correctly rejects (reserved, non-deliverable domain) — this produced a 502 on the confirmation-email send step that had nothing to do with this change (confirmed by re-testing with a real deliverable address, which returned `{"sent":true}`). Not an app bug; a testing-methodology artifact, corrected during verification.
