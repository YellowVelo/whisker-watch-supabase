# 0070_Test_Account_Roster_All_Environments_Specification_v1

**Status:** Shipped — 2026-11-08. Migration `0053_test_account_roster.sql` applied to all three projects (`wysker-watch-dev`, `wysker-watch-staging`, `Whisker-Watch`). Verified read-only on all three: test1–4@, coowner1–2@, petsitter1–2@ exist, are email-confirmed and are `test`; demo1@ is `demo`; test3@ is still `admin` on dev; `classify_account_type()` returns `test` for the new addresses (case-insensitive) and `production` for an unlisted one. Dev accounts were created by Claude through the local app (logins in `.env.playwright`); staging accounts by Lynn. **Found while shipping:** (1) staging sign-up had been broken since 2026-07-26 because two staging Edge Function secrets were missing their scheme: `CORS_ALLOWED_ORIGINS` and `APP_URL` were both `staging.wyskerwatch.com`. Fixed to `https://staging.wyskerwatch.com,https://wysker-watch-staging.pages.dev` and `https://staging.wyskerwatch.com`. `APP_URL` also feeds `invite-co-owner`/`invite-sitter`, so staging invites were broken too. Prod's values were correct. (2) test3@ on staging couldn't receive its confirmation email: it was already on the allowlist (0049), so sign-up's own email was suppressed. It was confirmed directly (`auth.users.email_confirmed_at`) instead.
**Date:** 2026-11-07
**Related files:**
- `supabase/migrations/0010_account_type.sql`, `0049_test3_admin_fixture_account.sql`, `0051_test4_sitter_fixture_account.sql` (the test-account list this spec adds to)
- `supabase/migrations/0011_protect_privileged_profile_fields.sql` (why only a migration, not the app, can change an account's type)
- `supabase/functions/_shared/email/sendEmail.ts` (lines 182–205: emails sent *by* a test/demo account are dropped)
- `supabase/functions/invite-co-owner/index.ts`, `supabase/functions/invite-sitter/index.ts`, `supabase/functions/sign-up/index.ts` (the three callers that pass the sender to that check)
- `supabase/functions/delete-account/index.ts` (refuses test/demo accounts)
- `src/lib/accountType.js`, `src/lib/analytics.js`, `src/lib/errorMonitoring.js`, `supabase/migrations/0043_analytics_exclude_test_accounts.sql` (where "test" keeps an account out of analytics and Sentry)
- `.env.playwright.example`, `CLAUDE.md`, `docs/testing/QA_Test_Plan.md`

## Before You Approve This

- **Accounts must be created on dev and staging *before* the test-list change goes out, not after.** The app drops any email sent *by* a test account, and the sign-up confirmation email counts as being sent by the new account. If coowner1@ were already on the test list when it signed up on dev, its confirmation email would never arrive and the account couldn't be confirmed. The steps below are ordered to avoid this.
- **Real invite emails only arrive when the *sender* isn't a test account.** That's true today and this spec doesn't change it. test1@ inviting coowner1@ links them correctly when coowner1@ logs in, but no email is sent. To check that an invite email actually lands, send it from a real-user account (your own Gmail login on that environment). Once the four new accounts are marked "test," any email *they* send is dropped as well, for example a co-owner inviting a sitter.
- **The four new accounts can't run Delete Account.** That function refuses test accounts on purpose. Your QA plan's manual Delete Account test (it needs one solely owned pet and one co-owned pet) has to use a real-user account, such as your own Gmail login on dev. The QA plan currently says "Given a test account" for that test, which can't work. This spec corrects the wording.
- **This changes data on prod.** It reclassifies 5 existing prod accounts: test3@, coowner1@, coowner2@, petsitter1@, petsitter2@. Nothing is deleted. Their past activity already in analytics stays counted; only activity from now on is excluded.
- **This is the 4th time the test-account list has been edited by hand.** Every new test inbox needs its own migration. That's workable, but it's a pattern worth knowing about (see Repo Findings).
- No duplicate functionality found. This follows exactly the pattern migrations 0049 and 0051 already used.

## Functional Requirements

You've set up real email inboxes so co-owner and pet-sitter flows can be tested end to end. Today those accounts only exist on prod, and the app counts them as real users there. After this change:

1. Every test inbox has a working login on all three environments (prod, staging, dev), so co-owner and sitter flows can be tested anywhere.
2. The app treats all of them as internal test accounts on every environment, so they stay out of your real-user analytics and out of Sentry.
3. The full list of test accounts, what each one is for, and where its login lives is written down in the project, so it can't get lost again.

The roster after this spec:

| Account | Purpose |
|---|---|
| test1@ | General testing; the automated tests' default login |
| test2@ | Backend (Edge Function) automated tests in CI |
| test3@ | Admin-page testing (admin on dev) |
| test4@ | Automated tests' sitter |
| coowner1@, coowner2@ | Manual co-owner testing |
| petsitter1@, petsitter2@ | Manual pet-sitter testing |
| demo1@ | Demo account (unchanged) |

## Acceptance Criteria

- Given each of the 9 roster accounts, when its login is checked on prod, staging and dev, then it exists and is email-confirmed on all three.
- Given test1–4@, coowner1–2@ and petsitter1–2@, when their account type is checked on each environment, then all are "test"; demo1@ is "demo".
- Given a brand-new sign-up from one of those 8 addresses (for example, if an account is ever deleted and recreated), when the account is created, then it's classified "test" automatically, with no further fix needed.
- Given test3@ on dev, when its role is checked, then it's still "admin" (unchanged by this spec).
- Given coowner1@ on dev, when it signs in and opens Settings, then the account badge shows it as a test account.
- Given CLAUDE.md, `.env.playwright.example` and the QA plan, when someone looks for a test login, then the roster, each account's purpose, and where its dev login lives are all written down.

## Test Plan

- Accounts exist and are confirmed on all three → no Playwright test. This is a one-time data check across three projects, not app behavior. Verified with one read-only query per project (the same query used to find this problem on 2026-11-07), with the results recorded in this spec's Status line.
- All 8 classified "test", demo1@ "demo" → same read-only query, run on all three after the migration.
- New sign-ups classified automatically → covered by the migration itself: the list is the same function the sign-up process already uses for test1–4@. Checked by reading the function back from each project after the push. No live sign-up, because that would mean deleting a real test account.
- test3@ still admin on dev → same read-only query (it includes the role column).
- Settings badge shows "test" for coowner1@ → manual check, once, on dev. No new Playwright test: the suite doesn't use the co-owner or sitter accounts, and adding their logins to CI just for a one-time check means more secrets to keep in sync for little ongoing value.
- Docs written down → reviewed in the PR.
- **Seeding/access constraints:** the classification change can only be made by a migration (migration 0011 blocks the app itself from changing an account's type). The read-only checks use the existing pattern of running the Supabase CLI against a linked project. To avoid ever moving the repo's own CLI link off dev (spec 0067's concern), prod and staging are queried from a separate scratch folder linked to them.

## Visual Reference

None. No UI changes.

## Technical Spec

**Order of operations (this order matters, see the first flag above):**

1. *(Separate, already in progress)* You reset test1–4@'s passwords on dev and update `.env.playwright` and the matching GitHub secrets.
2. **Create the missing accounts, before the migration:**
   - **dev:** coowner1@, coowner2@, petsitter1@, petsitter2@. Claude signs them up through the app running locally (`localhost:5173`, which points at dev), using new test passwords it generates and saves to `.env.playwright`, never in chat. You click the confirmation link in each inbox.
   - **staging:** coowner1@, coowner2@, petsitter1@, petsitter2@, test3@. You sign these up on the staging site yourself with passwords of your choosing (staging and prod passwords stay in your password manager, as with test4@ today). test3@ stays a normal user on staging; admin is only needed on dev, where the admin-page tests run.
3. **Migration `supabase/migrations/0053_test_account_roster.sql`,** modeled on `0051`:
   - `create or replace function public.classify_account_type(p_email text)` with the existing 5 entries plus `coowner1@`, `coowner2@`, `petsitter1@`, `petsitter2@` → `'test'`.
   - A backfill: `update public.profiles set account_type = 'test' where lower(email) in ('test3@…', 'coowner1@…', 'coowner2@…', 'petsitter1@…', 'petsitter2@…') and account_type is distinct from 'test';`. It's safe to re-run, and it fixes prod's misclassified test3@ as well as the accounts created in step 2.
   - It runs as the database owner, so 0011's "only an admin process can change account_type" trigger allows it, the same as 0051.
4. **Push 0053 to all three projects** (dev, staging, prod), the same manual process as every migration (CLAUDE.md / Technical Standards §11).
5. **Verify** with the read-only query on all three. Record the results in this spec's Status line.
6. **Docs** (same PR as the migration):
   - `CLAUDE.md`: extend the existing `e2e/fixtures.js` architecture bullet with the full roster and each account's purpose, plus one line on the email rule ("emails sent *by* a test account are dropped, so send invites from a real-user account to see one arrive").
   - `.env.playwright.example`: add placeholder slots `COOWNER1_EMAIL`/`COOWNER1_PASSWORD` (and the same for `COOWNER2`, `PETSITTER1`, `PETSITTER2`), labeled "manual testing on dev; not used by CI."
   - `docs/testing/QA_Test_Plan.md`: correct the Delete Account row from "a test account" to a real-user account, and add a short "which account to use" note for co-owner and sitter invite tests.

- **Schema:** no table changes. One function replaced, one data backfill.
- **Components/files touched:** none in `src/`. No Edge Function changes.
- **Design System compliance:** no UI changes, so there's nothing to check against `docs/foundation/0005 Design System.md`.
- **Constraints from CLAUDE.md / locked decisions:** respected. The migration goes to all three projects. The repo's CLI link stays on dev. Logins go only in `.env.playwright`. One branch, one PR.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** none found. 0049 and 0051 used this exact pattern for test3@ and test4@.
- **Technical debt nearby:**
  - **The test list is hand-maintained.** Each new test inbox needs a new migration and a push to three projects. A rule like "anything at a dedicated test subdomain is a test account" would end that, but it's a bigger design choice. Not done here; flagged for later.
  - **"Owner" accounts are handled inconsistently.** A comment in `src/lib/accountType.js` says owner-type accounts (real personal-use accounts) are excluded from real-user analytics, but the analytics rollup (migration 0043) only excludes "test." Sentry does exclude them. Not caused or touched by this spec, but worth a look before you trust analytics numbers.
  - **The QA plan's Delete Account test describes an account the function refuses.** Fixed in this spec's docs step.
- **Orphaned code:** none found near this area.
- **Why test3@ was wrong on prod:** most likely the prod login was created before migration 0049 reached prod, so it was classified under the old list and never backfilled. 0049 assumed test3@ didn't exist yet. 0053's backfill covers this.
- **Punch list:** nothing in the Launch Plan or Pre-Alpha Audit tabs covers these accounts. This spec stands on its own.

## Non-Goals

- Changing the rule that drops emails sent by test accounts.
- Adding the co-owner or sitter accounts to the automated test suite or to CI secrets.
- Replacing the hand-maintained list with a pattern-based rule.
- Fixing the "owner" analytics inconsistency.
- Making test3@ an admin on staging or prod.
- Resetting test1–4@'s passwords (you're doing that separately).

## Open Questions

None.
