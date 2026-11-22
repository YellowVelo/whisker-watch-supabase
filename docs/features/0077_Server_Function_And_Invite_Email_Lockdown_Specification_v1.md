# 0077_Server_Function_And_Invite_Email_Lockdown_Specification_v1

**Status:** Approved by Lynn 2026-11-22 (spec and copy). Building.
**Date:** 2026-11-22
**Branch:** `claude/server-function-lockdown`
**Migration:** `0059_server_function_lockdown.sql` (reserved)
**Punch list:** PA-05 (P0), PA-10 (P1), PA-21 (P1), PA-23 (P1), PA-29 (P2), and PA-36 (P2, folded in by Lynn's choice on 2026-11-22). Pre-Alpha Audit tab, `docs/planning/Wysker_Watch_Launch_Plan.xlsx`.
**Related files:** `supabase/functions/invite-co-owner/index.ts`, `supabase/functions/invite-sitter/index.ts`, `supabase/functions/send-email/index.ts`, `supabase/functions/_shared/email/templates/` (2 new templates + `index.ts`), `supabase/config.toml`, `src/components/InviteCoOwnerDialog.jsx`, `src/components/InviteSitterDialog.jsx`, new `supabase/tests/function_permissions.test.ts`, new `supabase/tests/invite_emails.test.ts`, new `e2e/invite-email-responses.spec.js`, `.github/workflows/ci.yml`, `docs/foundation/0006 Technical Standards.md` §11, `docs/testing/QA_Test_Plan.md` §5.7, `docs/features/0066_…` and `0068_…` (wording fixes).

## Lynn — what I need from you

1. **Review this spec and say "approved" (or tell me what to change).** This blocks everything. I write no code until you approve.
2. **Approve the new wording** in "Copy for your approval" below: two new emails and two new dialog messages. This is part of approving the spec.
3. **Later, when shipping (I'll tell you when):** push migration `0059` and deploy the two invite functions to staging and prod, the same way as for spec 0075. Then run the one read-only check query I give you on each project and paste me the result. I'm not allowed to read prod or staging from here, and migration history alone doesn't prove the change landed (the 0063 lesson). Then promote the frontend build in Cloudflare (branch `main`, commit message starting "Spec 0077").
4. **Later, one manual email check:** from your own login (not a test account, whose emails are dropped), invite `coowner1@wyskerwatch.com` to a pet and confirm the new "added you" email arrives and reads right.

## Before You Approve This

1. **The P0 is real on dev today, and the fix stops it coming back.** I checked dev's live permissions on 2026-11-22. Logged-out visitors can still run the "fake bounce" function (`process_resend_webhook_event`), the email-claim function, the "does this email have a password" check, and both nightly jobs. The deeper cause is that dev's **default** settings hand every *new* database function to logged-out visitors automatically. Earlier fixes only revoked from "everyone" (`public`), but Supabase grants to logged-out (`anon`) and signed-in (`authenticated`) visitors separately. This spec revokes from all three, **and** changes the default, so a future migration that forgets can't reopen the hole. The trade-off: a future helper that the app's own rules need must now be granted to signed-in users on purpose, or it fails loudly ("permission denied"). That's the safe direction, and spec 0056/0057 already work this way. I'll add it to the Technical Standards checklist.
2. **I couldn't read prod or staging myself.** Linking to them from here was blocked. The 0068 audit already recorded prod's state (same holes as dev). The migration sets every permission explicitly, so it lands the same whatever each project starts with. That's also why item 3 in your list asks you to run one check query on each project after the push.
3. **`is_pet_owner` gets the same "only about yourself" guard spec 0073 gave the sitter checks.** I checked every rule and server routine on dev: none asks it about anyone other than the signed-in person. Spec 0075's deletion code deliberately avoided it for this reason. So the guard changes nothing for the app. It just stops a signed-in user from asking "does person X own pet Y?" about strangers.
4. **Invites to existing accounts now send an email (your choice: PA-36 folded in).** Today the dialog says "X already has a Wysker Watch account" and emails nothing. That tells anyone whether an address has an account. After this, every successful invite just says "Invite sent to X!" New people get today's invite email. Existing accounts get a new, shorter "X added you, sign in to see them" email. It needs two new email templates (wording below).
5. **Invite emails are capped at 10 per person per hour, shared between co-owner and sitter invites.** It counts every attempt, including refused ones, so nobody can use the function to probe. Nobody inviting family will hit it. The e2e suite never calls these functions (it seeds invites directly), so it can't trip the cap. The cap reuses the AI assistant's existing rate-limit mechanism; nothing new is built.
6. **Each invite email must match a real, still-pending invite the sender is allowed to make.** For co-owners: the sender must be the pet's primary owner (the only person who can add co-owners since spec 0072), and the pet must have a pending invite row for that address. For sitters: the sender must have created the sit (already checked today), and the sit must have a pending invite for that address. The pet's name now comes from the database, not from the browser. Today the browser can put any pet name into a branded email.
7. **Found while investigating: the co-owner dialog's "try inviting them again" advice doesn't work.** If an invite email fails, the dialog tells the owner to try again. But inviting the same address again shows "Already a co-owner." and stops. I'll fix that: re-inviting someone who **hasn't accepted yet** resends the email. Someone who already accepted still gets "Already a co-owner." This matters more now, because the new rate-limit message also says "try again later." *(Build correction, 2026-11-22: I first wrote that the sitter dialog already resends. It doesn't: re-inviting the same sitter silently did nothing. Both dialogs now resend for an invite that hasn't been accepted. An accepted sitter is left alone, as before, with no message. Adding one would be new copy, so it's not in this spec.)*
8. **One small behavior risk, tested.** After the revoke, a logged-out request that touches a protected table (which the app never makes) gets "permission denied" instead of an empty answer. Either way, no data comes back. The trigger functions (the database's automatic "on save" steps, like stamping `updated_at`) don't need the permission at all, because PostgreSQL doesn't check it when a trigger fires. The existing Deno tests create users and save rows, so they would catch it if I'm wrong.
9. **Order matters a little when shipping.** Backend first (migration + the two functions), then the frontend. The new functions still work with today's frontend: an existing-account invite just shows "Invite sent" a bit earlier. The other order would show a misleading "no invite email was sent" message for existing accounts until the backend caught up.
10. Self-review found no duplicate features and no conflicts with locked decisions. The only new debt: `send-email` and `clear-email-suppression` still read the token's role without checking its signature themselves (they rely on Supabase's gateway). This spec makes that gateway setting explicit in `config.toml`. The stronger fix is in Non-Goals.

## Functional Requirements

1. **Server-only database functions can't be run from the browser (PA-05, PA-29).** Every database function is in exactly one of three groups:
   - **Server-only** (only the server's Secret key can run them): `claim_email_idempotency_key`, `process_resend_webhook_event`, `email_has_password`, `compute_daily_analytics_summary`, `generate_vaccination_due_notifications`, `classify_account_type`. Also already locked and re-asserted: `check_and_record_rate_limit(s)`, `get_auth_user_confirmation_state`, `prepare_account_deletion`, `transfer_pet_ownership`, the four `deletion_*` helpers.
   - **Signed-in only** (the app or its access rules call them as the user): `is_pet_owner`, `is_pet_sitter`, `is_pet_sit_sitter`, `is_primary_pet_owner`, `caller_owns_every_pet`, `caller_owns_pet_sit`, `pet_in_sit`, `pet_sit_is_open`, `claim_pending_co_owner_invites`, `claim_pending_sitter_invites`, `save_daily_check_ins`.
   - **Automatic "on save" steps** (triggers, never called directly): `handle_new_user`, `set_updated_at`, `protect_privileged_profile_fields`, `validate_profile_timezone`. Nobody can call them directly.
   Logged-out visitors can run none of them.
2. **New functions are locked by default (PA-05).** A function created by a future migration can't be run by logged-out or signed-in visitors unless that migration grants it on purpose.
3. **"Does this person own this pet?" only answers about the person asking (PA-05).** `is_pet_owner(pet, user)` returns false when `user` isn't the signed-in person.
4. **Three functions get a fixed search path (PA-29):** `handle_new_user`, `classify_account_type`, `set_updated_at`. This clears Supabase's security-scanner warning. A fixed search path means the function always looks up tables in the `public` schema, so it can't be tricked into using a look-alike table.
5. **Invite emails are tied to real invites (PA-10).**
   - Co-owner: sent only if the sender is the pet's primary owner and the pet has a pending (not yet accepted) co-owner invite for that address.
   - Sitter: sent only if the sender created the sit and the sit has a pending sitter invite for that address.
   - The pet's name in the email comes from the database. The browser no longer supplies it (ignored if sent).
   - Anything else gets a plain "Invite not found" and no email.
6. **Invite emails are rate-limited (PA-10).** Each person can make 10 invite-email requests per hour across both functions. The 11th gets a "too many invites" reply and no email.
7. **The reply never reveals whether an address has an account (PA-10, PA-36).** A successful invite replies `{ sent: true }` whether the person is new or already has an account. The two test/demo and "this address bounced before" replies stay as they are. Neither function returns Resend's message ID to the browser any more (the other half of the fake-bounce hole).
8. **Existing accounts get a "you've been added" email (PA-36).** It uses a new template: `co-owner-added` for co-owners, `sitter-added` for sitters. Its button goes to the app's sign-in page. Once they sign in, the pet appears the same way it does today.
9. **Dialogs show the new replies (PA-10).**
   - Both dialogs: remove the "already has a Wysker Watch account" message. A rate-limited reply shows the new rate-limit message (below).
   - Co-owner dialog: inviting an address that's already invited but hasn't accepted resends the invite. An address that has accepted still shows "Already a co-owner."
   - Sitter dialog: the same resend for an invite that hasn't been accepted (build correction, see Before You Approve #7).
10. **Ops-only functions' login check is written down (PA-21).** `supabase/config.toml` explicitly sets `verify_jwt = true` for `send-email` and `clear-email-suppression`, with a comment saying their safety depends on it. `send-email`'s header comment about key formats is corrected to say what was actually tested on dev.
11. **Docs are corrected (PA-23).** Spec 0066's Results no longer claim function permissions are "identical across all 3 projects". Spec 0068 P0-4 no longer says the email block affects password resets (they go through Supabase's own mailer). `0006 Technical Standards.md` §11 gains a post-migration check of function permissions on each project.

## Acceptance Criteria

- **AC1.** **Given** a logged-out visitor with only the website's Publishable key, **when** they call any function in FR1's three groups, **then** every call is refused.
- **AC2.** **Given** a signed-in user, **when** they call any server-only or trigger function, **then** it's refused. The signed-in-only functions still work.
- **AC3.** **Given** the faked-bounce attack (a signed-in user calls `process_resend_webhook_event` with type `email.bounced` and someone else's address), **then** it's refused and no row is added to `email_suppressions`.
- **AC4.** **Given** a new function created after migration 0059 with no grant, **then** logged-out and signed-in users can't run it. (Checked once on dev during the build with a throwaway function that's dropped right after. Recorded in the PR.)
- **AC5.** **Given** user A signed in, **when** they call `is_pet_owner(B's pet, B)`, **then** it returns false. `is_pet_owner(A's pet, A)` returns true.
- **AC6.** **Given** migration 0059 applied, **then** `handle_new_user`, `classify_account_type` and `set_updated_at` each have `search_path=public`. New users still get a profile with the right account type, and saving a row still updates `updated_at`.
- **AC7.** **Given** a primary owner with a pending co-owner invite, **when** they call `invite-co-owner`, **then** it replies `{ sent: true }` (or the test/demo reason) with no `messageId`, and the email uses the pet's real name even if the browser sent a different one.
- **AC8.** **Given** a stranger, or a co-owner who isn't the primary owner, **when** they call `invite-co-owner` for that pet, **then** it replies "Invite not found" and no email is sent. Same for an address with no pending invite.
- **AC9.** **Given** a sit owner with a pending sitter invite, **when** they call `invite-sitter`, **then** it replies `{ sent: true }` (or the test/demo reason) with no `messageId`. A stranger calling it for that sit gets "Invite not found".
- **AC10.** **Given** an invite to an address that already has an account, **then** the reply is `{ sent: true }`, the same as for a new address. The `co-owner-added` or `sitter-added` email is sent (or dropped, if the sender is a test account), and no invite link is created.
- **AC11.** **Given** a person who has made 10 invite requests in the past hour (any mix of both functions, refused ones included), **when** they make an 11th, **then** it gets a 429 reply and no email.
- **AC12.** **Given** the co-owner dialog, **when** the reply is rate-limited, **then** it shows the co-owner rate-limit message. Same for the sitter dialog with its message.
- **AC13.** **Given** the co-owner dialog and an address that's invited but hasn't accepted, **when** the owner invites it again, **then** the invite is resent (no "Already a co-owner."), and the list still shows that address once. An address that has accepted still shows "Already a co-owner."
- **AC14.** **Given** `supabase/config.toml`, **then** it lists `send-email` and `clear-email-suppression` with `verify_jwt = true`.
- **AC15.** **Given** the deployed functions on each project, **then** every function still answers `OPTIONS` with 200 (`0006` §11, PA-62's manual check).

## Test Plan

| AC | Test | Notes |
|---|---|---|
| AC1, AC2, AC3 | **Deno:** new `supabase/tests/function_permissions.test.ts` | Calls every function in FR1 three ways: logged out, as a signed-in scratch user, and (for signed-in-only ones) checks they still work. Uses one scratch user for the file (Auth sign-in limit). Added to CI's `supabase/tests` step. |
| AC4 | Manual on dev, once, during the build | Creating a function needs migration-level access that tests don't have. Recorded in the PR. |
| AC5 | **Deno:** `function_permissions.test.ts` | Two scratch users, one pet each. |
| AC6 | **Deno:** existing tests already create users and save rows; plus one check in `function_permissions.test.ts` that a scratch user's profile has the right `account_type` | The search-path setting itself is checked by the post-push query (Lynn list item 3). |
| AC7–AC11 | **Deno:** new `supabase/tests/invite_emails.test.ts` (the pet-name part of AC7 is checked in code review: a dropped test email's log records the template, not the wording) | Calls the deployed dev functions. Scratch inviters are set to `account_type = 'test'` (by the admin client) **before** any invite, so no real email is ever sent. Invitees are scratch users (the "existing account" path), so no new Auth accounts pile up. The rate-limit check uses its own scratch user, so it can't burn anyone else's hour. Added to CI. |
| AC10 (real email) | Manual (Lynn list item 4) | Test accounts' emails are dropped by design, so only a real account can prove the email arrives and reads right. |
| AC12, AC13 | **Playwright:** new `e2e/invite-email-responses.spec.js` | Runs as test1@ (CI-safe). Intercepts the function call in the browser (`page.route`) and returns a fake reply, so no function runs and no email is sent. Seeds invites the way `invite-sitter.spec.js` does. Each test makes and deletes its own pet. |
| AC14 | Read in code review | A config file. |
| AC15 | Manual after each deploy (`0006` §11) | Automating this is PA-62. |

## Copy for your approval

**New email: `co-owner-added`** (to someone who already has an account)
- Subject: **{owner_name} added you as a co-owner for {pet_name} in Wysker Watch**
- Preview: **{pet_name} is now in your Wysker Watch account.**
- Body: "Hi, {owner_name} added you as a co-owner for {pet_name} in Wysker Watch. Sign in to see {pet_name}'s profile and help with daily check-ins, trends and care information." Button: **Sign in to Wysker Watch**. Then: "If you weren't expecting this, you can safely ignore this email." / "The Wysker Watch Team"

**New email: `sitter-added`** (to someone who already has an account)
- Subject: **{owner_name} invited you to pet sit for {pet_names} in Wysker Watch**
- Preview: **You're pet sitting for {pet_names} from {start_date} to {end_date}.**
- Body: "Hi, {owner_name} invited you to help care for {pet_names} while pet sitting from {start_date} to {end_date}. Sign in to Wysker Watch to see their care details. They'll show up from the day before the sit starts." Button: **Sign in to Wysker Watch**. Then the same two closing lines.

**New dialog messages (rate limit)**
- Co-owner: "**{email} added as co-owner, but you've sent a lot of invites in the last hour, so we couldn't email them yet. Try inviting them again in an hour.**"
- Sitter: "**{email} added as a sitter, but you've sent a lot of invites in the last hour, so we couldn't email them yet. Try inviting them again in an hour.**"

**Removed:** "{email} already has a Wysker Watch account and can now see {pet}." and the sitter version. Those cases now show the existing "**Invite sent to {email}!**"

## Visual Reference

None. The dialog changes are message text only, shown in the dialogs' existing message area.

## Technical Spec

**Migration `0059_server_function_lockdown.sql`**
- For every function in FR1: `revoke execute on function … from public, anon, authenticated;`. Then `grant execute … to authenticated` for the signed-in-only group, and `grant execute … to service_role` for the server-only group. Triggers get no grants beyond the owner.
- `alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;` and `alter default privileges for role postgres revoke execute on functions from public;`. Dev's live default today grants `anon`/`authenticated` (`pg_default_acl`, checked 2026-11-22). Migrations run as `postgres`, so this covers every future migration.
- `create or replace function public.is_pet_owner(...)`: same body as today, wrapped in `coalesce(p_user_id = auth.uid(), false) and …`, the 0057 pattern. Safe because no live policy or function passes anything but `auth.uid()` (dev query, 2026-11-22). The server-side routines (`prepare_account_deletion`, `transfer_pet_ownership`) use `deletion_user_owns_pet` instead (0058).
- `alter function … set search_path = public` on `handle_new_user()`, `classify_account_type(text)`, `set_updated_at()`.
- Header comment: names PA-05/PA-29 and includes the post-push check query (lists `proname`, `proacl`, `proconfig` for `public` functions, and `pg_default_acl` for role `postgres`). `0006` §11 gets the same query.

**Edge Functions**
- New `_shared/inviteRateLimit.ts`: one helper, `checkInviteRateLimit(adminClient, userId)`. It calls `check_and_record_rate_limit` with key `invite-email:user:<id>`, limit 10, window 3600 s. It fails closed (503) if the check itself errors, the same as `ask-vet-assistant`. It runs right after the caller's login is confirmed and before any lookup, so refused attempts count.
- `invite-co-owner`: after the rate limit, load `pets(id, name, created_by)` for `petId` and require `created_by = caller`. Load the `pet_co_owners` row where `pet_id = petId`, `lower(co_owner_email) = lower(coOwnerEmail)` and `co_owner_user_id is null`. If either is missing, reply 404 `{ error: 'Invite not found' }`. Use `pets.name`, ignoring the body's `petName`. When `email_has_password` says the address has an account, send `co-owner-added` (variables `owner_name`, `pet_name`, `signin_url = ${appUrl}/login`) instead of replying `exists`. On success, reply `{ sent: true }` only.
- `invite-sitter`: keep the existing `created_by = caller` sit check. Add the pending `pet_sitter_access` row check (`pet_sit_id`, `lower(sitter_email)`, `sitter_user_id is null`). Existing accounts get `sitter-added`. Same reply rules.
- Error replies for unexpected failures stay as they are (PA-35 is separate).
- Templates: `co-owner-added.ts`, `sitter-added.ts`, registered in `templates/index.ts`. `signin_url` goes in `urlVariables`, so the existing own-domain link check applies.
- `send-email`: comment-only correction after one curl on dev with each key type.
- `supabase/config.toml`: add `[functions.send-email]` and `[functions.clear-email-suppression]` with `verify_jwt = true`, and update the comment that says "all other functions keep the default."

**Frontend**
- `InviteCoOwnerDialog.jsx`: the duplicate check blocks only when the matching row has `co_owner_user_id` set. For a pending row, skip the insert and call the function again (the sitter dialog's pattern). Remove the `exists` branch. Add a rate-limited branch keyed on HTTP status 429, read from `fnResp.error.context.status` (Supabase's `FunctionsHttpError` carries the response). Stop sending `petName`.
- `InviteSitterDialog.jsx`: remove the `exists` branch and add the 429 branch.
- **Design System compliance:** message text only, in the dialogs' existing message area. No new components, colors or sizes. `design-system-check` runs on both files after editing.

**Tests / CI:** two new Deno files added to the existing `supabase/tests` step in `ci.yml`, one new Playwright file, and QA cases added to `QA_Test_Plan.md` §5.7.

**Ship order:** migration on dev → deploy both functions to dev → tests green → PR merged → Lynn pushes the migration and the functions to staging and prod and runs the check query → `OPTIONS` check on every function → Lynn promotes the frontend.

## Repo Findings & Risks

- **Dev's live state (2026-11-22) matches the 0068 audit.** Logged-out visitors can run 6 server-only functions. Signed-in users can run all of them too. Every trigger function is open to everyone. `email_has_password` is open on dev (an "is this address registered?" check), as 0068 P1-7 noted.
- **The default-permission setting is the root cause,** not any one migration. Without FR2, the next migration that forgets to revoke reopens the hole.
- **The co-owner dialog's retry advice was already broken** (see Before You Approve #7). Fixed here because the new rate-limit message relies on retrying working.
- **The invite functions trust the browser's pet name and ID.** The co-owner email's pet name and link both come from the request body today. Fixed here.
- **Other account-existence leaks remain:** the "this address bounced before" reply, and sign-up's own replies. They're smaller, and sign-up is PA-18's territory. Not touched here.
- **`getJwtRole` is copied in two functions** (`send-email`, `clear-email-suppression`). That's PA-39, left alone.
- **No duplicate functionality found.** Rate limiting reuses migration 0039's mechanism, and the email templates follow the existing pattern.
- **Test-account email:** `ci-scratch-…@wyskerwatch.com` users count as `production` (`classify_account_type`'s allowlist). So the invite tests must switch scratch inviters to `test` first, or CI would send real email. Covered in the Test Plan.

## Non-Goals

- Checking the token's signature inside `send-email`/`clear-email-suppression` (`auth.getClaims()`). It works differently for legacy and new keys, and risks breaking the ops tooling. The gateway setting is now explicit instead.
- The AI proxy (PA-11), function version pinning and post-deploy checks (PA-62), generic error messages (PA-35), and moving password entry to the confirmation step (PA-18).
- An automated cross-project permission diff (PA-16). This spec adds a manual check query to §11.
- Making co-owners' powers narrower (PA-24).

## Open Questions

None. Lynn answered the one open question ("existing accounts get an email") on 2026-11-22.

## Build Notes (2026-11-22)

1. **Dev is done; staging and prod are not.** Migration `0059` was pushed to `wysker-watch-dev`, and `invite-co-owner` and `invite-sitter` were deployed there. The post-push check query on dev shows every function in its intended group, every function with `search_path=public`, and the `postgres`/`public` default granting only `postgres` + `service_role`. The migration's own safety check (nothing left runnable by `anon`/everyone, extension functions excluded) passed.
2. **AC4 checked on dev:** a throwaway `public.spec0077_probe()` created after `0059` was runnable only by `service_role`. It was dropped right after.
3. **Tests on dev:** `function_permissions.test.ts` and `invite_emails.test.ts`, 13 steps, all pass. All 26 existing Deno tests (`supabase/tests/*` plus `delete-pet`/`delete-account`) pass on the locked-down database. Vitest 154/154, lint, typecheck and build are clean. The three invite e2e specs pass (8 tests).
4. **`send-email` key formats (PA-21), tested on dev:** both `sb_secret_` and `sb_publishable_` keys get past the gateway and are refused by the function's own code (401). The header comment now says so. `supabase/config.toml` records `verify_jwt = true` for `send-email` and `clear-email-suppression`.
5. **Pre-existing, not fixed:** `deno check` reports `'err' is of type 'unknown'` in both invite functions' outer `catch`. It was there before this change, and CI doesn't type-check Edge Functions.
6. **Trigger functions keep `service_role`** (as well as their owner). The revoke removed `public`/`anon`/`authenticated` only. Harmless: the Secret key can already do anything, and PostgREST doesn't expose trigger functions.
