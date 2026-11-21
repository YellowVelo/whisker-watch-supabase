# 0075_Account_Deletion_Data_Safety_Specification_v1

**Status:** Approved (Lynn, 2026-11-21: 1A sits pass to the new owner, 2A keep email logs + say so, 3A 30-day backup window, policy wording approved, OQ2 yes). Built 2026-11-21 on `claude/gallant-maxwell-vadhux` (see Build Notes). Not yet deployed anywhere.
**Date:** 2026-11-21
**Lane:** Backend (migration + Edge Functions + backup script)
**Punch list:** PA-06, PA-07 (both P0), PA-14 (P1). Pre-Alpha Audit tab, `docs/planning/Wysker_Watch_Launch_Plan.xlsx`. Source findings: spec 0068 P0-5, P0-6, P1-5 and two of its P2s ("delete-account can partly finish", "misleading header comment").
**Related files:** `supabase/functions/delete-account/index.ts` + `index.test.ts`, `supabase/functions/delete-pet/index.ts` + `index.test.ts`, `supabase/functions/reset-sandbox-account/index.ts` (pagination pattern reused), `supabase/functions/_shared/petPhoto.ts`, `supabase/migrations/0001_init_schema.sql`, `0004_co_owner_accounts.sql`, `0012_pet_onboarding.sql`, `0014_daily_checkins_wellness.sql`, `0029_add_pet_sitter_access_created_by.sql`, `0054_private_uploads_phase1.sql` (storage read rule, `pet_documents`), `0056_co_owner_access_lockdown.sql`, `0057_sitter_access_lockdown.sql`, `scripts/backup-storage.sh`, `.github/workflows/storage-backup.yml`, `src/lib/privacyPolicyContent.js`, `src/components/DailyCheckInSheet.jsx`, `docs/testing/QA_Test_Plan.md` §5.8

## Lynn — what I need from you

Decisions all answered 2026-11-21 (see Status).

**Later (after I've built it, I'll remind you):**
4. **Cloudflare dashboard:** R2 → `whisker-watch-storage-backups` → Settings → Object lifecycle rules → Add rule. Prefix `deleted/`, delete after 30 days. About 2 minutes.
5. **Promote the frontend build** (Privacy Policy text) in Cloudflare. I'll name the exact row.

I do everything else: the code, tests, read-only checks, and pushing to all 3 Supabase projects.

## Before You Approve This

Items 1–3 were confirmed by Lynn on 2026-11-21.

1. **Decision: pet sits pass to the new owner.** When a primary owner deletes their account and the pet passes to a co-owner, any pet sit (and its sitter invites) the leaving owner set up for that pet now passes to the new owner too. Today they're silently deleted. One exception: if a sit covers several pets that end up with *different* new owners, that sit can't have one owner, so it ends, and each new owner is notified.
2. **Decision: email history is kept, and the policy says so.** Delivery logs and the do-not-email list (bounces and unsubscribes) keep the address, so we never email an address that bounced or asked us to stop. The person's beta-signup and early-adopter rows **are** deleted.
3. **Decision: deleted files' backup copies are removed after 30 days**, matching the database backups. You'd add one rule in the Cloudflare dashboard (exact steps in the Technical Spec).
4. **New Privacy Policy wording, approved by Lynn 2026-11-21.** Text is under Functional Requirement 8. It replaces "permanently delete your account and all associated data", which isn't true today and won't be fully true after this fix either, because co-owners keep shared history (by design) and backups take up to 30 days to age out.
5. **I found a bug the audit missed.** Even after the audit's fix, the other co-owners' access would *still* be deleted. Each co-owner record also stores who sent the invite, and that link is set to "delete with the account". So when the primary owner leaves, every invite they sent is deleted with them. This spec fixes that too.
6. **Records a departed person entered will show no name.** Records keep the entry but lose the "entered by" link. The only place the app shows who entered something is the "someone else already saved today" pop-up, which already falls back to "Your co-owner". Nothing else in the app reads it.
7. **The transferred pet's photo and documents stay where they are, rather than being moved.** The audit said "move". I recommend leaving the files in the old folder and simply *not deleting them*. Since spec 0071, who can open a file depends on which pet it belongs to, not whose folder it's in, so the new owner can already open them. Moving them would mean copying files and rewriting links, which adds new ways to fail with no benefit to you.
8. **The backup script will now move (not delete) backup copies of deleted files** into a holding area, and Cloudflare clears that area after 30 days. A safety check stops the script if Supabase suddenly reports far fewer files than the backup holds (for example, a failed listing), so a glitch can't empty the backup.
9. **A new server-only database function is added.** Per PA-05's lesson, it's locked so only the backend can call it, never a browser. There's a test for that.
10. **One check is by review, not a test.** "If the database step fails partway, nothing is transferred" is guaranteed by how the database works, not by a test, because forcing a failure would mean adding test-only code to the real function. The retry half is tested.
11. **Push to all 3 Supabase projects**, by hand as usual: the migration, `delete-account` and `delete-pet`, plus a read-only pre-check on each project first.

## Functional Requirements

1. **Shared history survives.** When someone deletes their account, every record they entered on a pet that someone else still owns (check-ins, observations, vaccinations, medications, bloodwork, food logs, foods, baselines, onboarding answers, sitter checklist entries) stays on that pet. Only the "entered by" link is cleared.
2. **Every co-owner keeps access.** When a primary owner deletes their account and their pet passes to the longest-standing co-owner, every *other* co-owner keeps their access too.
3. **The transferred pet keeps its photo and documents.** Files belonging to a pet that survives the deletion are never deleted, and every remaining owner can still open them.
4. **Pet sits pass on with the pet.** Sits and sitter invites the leaving person set up for pets that survive pass to the surviving owner (see Before You Approve, item 1). The same applies when a primary owner removes one shared pet (delete-pet's transfer path), not only on account deletion (Lynn, OQ2, 2026-11-21).
5. **Everything else is fully deleted.** Pets only the leaving person owned, with all their records, photos and documents, are deleted. So is every other file in the person's folder, however many files there are (today only the first 100 are deleted). So are their sitter invites (if they were a sitter), notifications, analytics events, beta-signup and early-adopter rows, and their login.
6. **Deletion either finishes or can be safely retried.** All the database changes (ownership transfers, hand-overs) happen together or not at all. If a later step (deleting files or the login) fails, the person sees an error and can try again. A retry picks up where it stopped, without transferring anything twice.
7. **Deleting a pet also deletes its scanned documents** (today only the photo is deleted), except a document also linked to another pet that still exists.
8. **The Privacy Policy matches what actually happens.** Wording (replaces the last sentence of "Data retention and deletion"):
   Approved wording:
   > You can also delete your account at any time using the Delete Account option in Settings. This permanently deletes your profile and any pets only you own, along with their records, photos and documents. If you share a pet with a co-owner, that pet and its history, including entries you made, stay with them, without your name attached. Copies held in our backups are deleted automatically within 30 days. We keep a record of the emails we've sent to your address, and whether any bounced or were unsubscribed, so we never email an address that asked us to stop.

   "Last updated" moves to the build date, as the policy promises for material changes.
9. **Deleted files leave the backup within 30 days.** A file deleted from the app stays recoverable from the backup for 30 days, then is gone.

## Acceptance Criteria

- **AC1.** **Given** a pet owned by A with co-owners B and C, where A, B and C have each entered a check-in, an observation and a vaccination, **when** A deletes their account, **then** all 9 records still exist; A's 3 have no "entered by"; B is the primary owner; C is still a co-owner and can read the pet and all 9 records.
- **AC2.** **Given** the same setup, where A uploaded the pet's photo and a scanned document linked to the pet, **when** A deletes their account, **then** B and C can each open both files.
- **AC3.** **Given** a pet owned by B with co-owner A, where A entered records, **when** A deletes their account, **then** A's records remain, B keeps the pet, and B gets a "no longer has access" notification.
- **AC4.** **Given** A owns a solo pet with a photo and a scanned document, **when** A deletes their account, **then** the pet, its records and both files are gone.
- **AC5.** **Given** A has more than 100 files in their folder, none belonging to a surviving pet, **when** A deletes their account, **then** every one of them is deleted.
- **AC6.** **Given** A created a sit for a pet that passes to B, with sitter S invited, **when** A deletes their account, **then** the sit and S's invite still exist, are now B's, and S can still see the pet during the sit.
- **AC7.** **Given** a sit A created covering two pets that pass to two different people, **when** A deletes their account, **then** that sit ends and both new owners are notified.
- **AC8.** **Given** sitter S has an invite on a sit, **when** S deletes their account, **then** S's invite row is gone (not just unlinked), and re-registering with the same email doesn't bring the access back.
- **AC9.** **Given** the database transfer step fails partway (simulated), **when** delete-account returns, **then** nothing was transferred. **Given** the file-delete step fails, **when** the person retries, **then** deletion completes and no pet is transferred twice.
- **AC10.** **Given** a sole owner deletes a pet with a photo and two scanned documents, one of which is also linked to another of their pets, **when** delete-pet finishes, **then** the photo and the unshared document are gone, and the shared document still opens on the other pet.
- **AC11.** **Given** a primary owner removes a shared pet from their account (delete-pet's transfer path), **then** it behaves exactly as today: every co-owner except the promoted one keeps access, and the promoted one becomes primary. It now uses the same transfer code as delete-account, so the leaving owner's sits and sitter invites for that pet pass to the promoted owner too (if the sit also covers pets the leaving owner keeps, the sit stays with them for those pets, this pet is taken out of it, and the new owner is notified, so one pet's removal never ends a sit for the others).
- **AC12.** **Given** a signed-in or logged-out browser, **when** it calls the new deletion database function directly, **then** it is refused.
- **AC13.** **Given** a file removed from production storage, **when** the nightly backup runs, **then** its backup copy moves to the holding area, and Cloudflare removes it 30 days later. **Given** Supabase reports less than half the files the backup holds, **then** the script stops without moving anything and the workflow fails visibly.
- **AC14.** **Given** the Privacy Policy page, **then** it shows the approved wording and the new "Last updated" date.
- **AC15.** **Given** A deletes their account, **then** A's beta-signup and early-adopter rows (matched by email, ignoring case) are gone, and A's email-log and do-not-email rows remain.

## Test Plan

- AC1, AC2, AC3, AC4, AC6, AC7, AC8, AC15 → **Deno:** `supabase/functions/delete-account/index.test.ts`, extended. Scratch users are created and signed in **once per file** (per CLAUDE.md's sign-in limit note), and each test builds its own fresh pets. AC2 checks file access by asking for a signed link with B's and C's *own* sessions, so the storage read rule is really exercised.
- AC5 → **Deno**, same file: upload 101 tiny (1-byte) files for one scratch user, delete the account, list the folder with the service role, expect 0.
- AC9 → **Deno**, retry half only: run `prepare_account_deletion` twice for the same user, then the full delete. Assert exactly one transfer and one notification. The "nothing changed on failure" half is **not automated**: forcing a failure mid-function would mean adding test-only code to the real function, which is new debt. It's guaranteed by the database instead, because one database function always runs as a single all-or-nothing transaction. It's checked in code review: no `commit` or `dblink` inside the function, and no transfers left in the Edge Function.
- AC10, AC11 → **Deno:** `supabase/functions/delete-pet/index.test.ts`, extended.
- AC12 → **Deno:** a new case in `supabase/tests/` calling the function via the API as anon and as a signed-in user, expecting a permission error.
- AC13 → **Not automated.** It runs against production storage and R2 only. Manual: run `storage-backup.yml` by hand after deleting a test file on prod, check the file appears under the holding area in R2, and check the lifecycle rule is listed in the R2 dashboard. The safety stop gets a dry-run check with a fake empty source list during the build.
- AC14 → **Playwright:** extend the existing legal-page check (if PA-08 has landed by then; otherwise manual).
- The account-deletion UI flow itself stays `[Manual]` in QA §5.8, as today: delete-account refuses test accounts, and Playwright has none it may destroy.
- **Seeding/access constraints:** every Deno test uses the existing `createScratchUser` (service role, dev only) and `adminClient()` helpers. No new secrets.

## Visual Reference

None. No UI changes apart from the Privacy Policy text.

## Technical Spec

- **Schema (migration `0058_account_deletion_data_safety.sql`; spec 0074 added no migration, so 0058 is next):**
  - `created_by` → `ON DELETE SET NULL`, and `DROP NOT NULL`, on `daily_check_ins`, `observations`, `vaccinations`, `medications`, `bloodwork`, `food_logs`, `pet_foods`, `pet_baselines`, `pet_onboarding`, `symptom_logs`, `wellness_scores`, `pet_sit_logs`. Find each foreign key by catalog lookup (`pg_constraint` where the column is `created_by` and the target is `auth.users`), not by assumed name, because production has drifted from migration history before (0052/0063). Inserts still set `created_by` (app and `save_daily_check_ins`), so new rows aren't affected.
  - `pet_co_owners.created_by` → `ON DELETE SET NULL` + `DROP NOT NULL` (the bug in Before You Approve, item 5). The insert rule from 0056 still requires `created_by = auth.uid()` on new rows.
  - `pet_sitter_access.sitter_user_id` → `ON DELETE CASCADE` (FR5/AC8).
  - `pets.created_by`, `pet_sits.created_by`, `pet_sitter_access.owner_id`/`created_by`, `pet_co_owners.owner_id`, `pet_co_owners.co_owner_user_id` stay `CASCADE`. The new function repoints whatever should survive before the login is deleted, so whatever is still pointing at the person is meant to go.
  - New `public.transfer_pet_ownership(p_pet_id uuid, p_from_user uuid) returns uuid` (new owner, or null if no linked co-owner): promotes the oldest linked co-owner, deletes only *their* `pet_co_owners` row, repoints every other row's `owner_id` and `created_by`, and hands over the leaving owner's sits and sitter invites covering this pet (FR4 rule) or ends them. Writes the notification.
  - New `public.prepare_account_deletion(p_user_id uuid) returns jsonb`: one transaction. Calls `transfer_pet_ownership` for each pet primary-owned by the user; hands over sits the user created (as a co-owner) on pets that survive; strips to-be-deleted pet ids from any other sit's `pet_ids` (same reason as delete-pet's existing cleanup); writes the co-owner-leaving notifications; deletes `beta_signups`/`early_adopters` rows matching the user's auth email; returns `{ transferred: [...], files_to_delete: [...] }`. `files_to_delete` = every path referenced by a pet or `pet_documents` row that will be deleted, plus everything else in the user's folder (the function receives the folder listing from the Edge Function), minus any path referenced by a surviving pet or document. Idempotent: a second run transfers nothing new.
  - Both functions: `SECURITY DEFINER`, `set search_path = public`, `revoke execute … from public, anon, authenticated`, grant to `service_role` only.
- **Edge Functions:**
  - `delete-account/index.ts`: (1) auth + test/demo guard (unchanged); (2) list the user's folder with pagination (reuse `reset-sandbox-account`'s 100-per-page loop, moved into `_shared/storageList.ts` and used by both); (3) `rpc('prepare_account_deletion')`; (4) remove `files_to_delete` in batches of 100; (5) `auth.admin.deleteUser`. Each failure returns a non-200 error and is sent to Sentry (`reportError`), not only the console. Rewrite the header comment to describe this exactly, including "a retry is safe".
  - `delete-pet/index.ts`: the transfer path calls `rpc('transfer_pet_ownership')` in place of its own copy. The sole-owner path also deletes the pet's `pet_documents` files not linked to another pet (FR7).
- **Backup (`scripts/backup-storage.sh`):** after the existing additive sync, list R2 `uploads/` keys and Supabase keys; for each key in R2 but not in Supabase, `aws s3 mv` it to `deleted/uploads/…` (inside R2, so it gets a fresh date). Abort with exit 1, before moving anything, if the Supabase count is under 50% of the R2 count. **Lynn, once, in the Cloudflare dashboard:** R2 → `whisker-watch-storage-backups` → Settings → Object lifecycle rules → Add rule: prefix `deleted/`, delete objects 30 days after upload. Update `docs/features/requirements-database-backups.md` and the restore steps to say deleted files live under `deleted/` for 30 days.
- **Frontend:** `src/lib/privacyPolicyContent.js` paragraph text + `PRIVACY_POLICY_LAST_UPDATED`. No other change. `DailyCheckInSheet.jsx` already handles a missing "entered by".
- **Pre-check (read-only, each project, before the migration):** the current `created_by`/`sitter_user_id` foreign-key rules on the tables above (`pg_constraint`), and a count of `pet_co_owners` rows whose `created_by` differs from `owner_id`. Results go in the build notes.
- **Design System compliance:** no new UI. The only frontend change is policy text in existing components. Checked, no conflicts.
- **Constraints from CLAUDE.md / locked decisions:** respects the locked rule from `account-deletion-edge-function-spec_1.md` (data is never deleted just because one household member leaves), which the code never fully met. Backend changes go to all 3 projects. New server-only functions get explicit revokes (PA-05 lesson). Policy copy goes to Lynn before build. No change to the Vibe/check-in model.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** `delete-pet` and `delete-account` each have their own copy of the "pass the pet to a co-owner" logic. Only `delete-account`'s copy has the access bug. This spec replaces both with one shared database function. `reset-sandbox-account` already deletes files 100 at a time correctly. That loop becomes a shared helper rather than a third copy.
- **Technical debt nearby:** `delete-account`'s header comment promises "never left half-deleted", which isn't true today. There are no database transactions (all-or-nothing groups of changes) across its steps, and pets are transferred before files are deleted. Moving the transfers into one database function fixes the half-finished-transfer case. A failed file or login delete still needs a retry, and the error says so. `wellness_scores` and `symptom_logs` belong to retired scoring models but still exist, so they're included to be safe. Dropping them is out of scope.
- **Orphaned features nearby:** after a primary owner hands over a pet, the stored `owner_id` on remaining co-owner rows goes stale unless code patches it. 0056 already stopped relying on it for permissions. Not worth removing in this spec.
- **Punch list / known issues in this area:** PA-24 (co-owners can change `created_by` or delete the pet directly) is close by but separate. It isn't needed for this fix. PA-25 ("entered by" should always be the real person) is compatible. delete-pet's transfer path still leaves the leaving owner's sits on the pet (it doesn't delete an account, so nothing cascades). See Open Question 2.
- **Can't be checked from this session:** the live foreign-key rules on each project. This session has no database login. The pre-check step covers it before anything runs.

## Non-Goals

- A "download my data" export (Launch Plan task 92).
- Changing who can delete or transfer a pet (PA-24, PA-25).
- Pruning database dumps (already 30 days) or Supabase's own daily backups (7 days).
- Any UI for the account-deletion flow itself. Its screens and copy are unchanged.
- Deleting email-log rows (decided against, Before You Approve item 2).

## Open Questions

None. Both resolved by Lynn on 2026-11-21: the decisions and policy wording are approved, and OQ2 is yes (sits follow a removed shared pet too).

## Build Notes (2026-11-21)

1. **Verified locally, not yet on dev.** This cloud session has no Supabase login, so nothing has been pushed to any project. Instead, every migration (0001–0058, minus prod-only data import 0027) was loaded into a throwaway local Postgres 16 with small stand-ins for Supabase's `auth`/`storage` schemas, and 7 scenarios were run against 0058 (3-person transfer with records, files, sits and a retry; split sit ending; sitter deleting; co-owner leaving; delete-pet transfer with single and mixed sits; browser roles refused; foreign-key rules). All passed, and a deliberately wrong expectation was confirmed to fail. The Deno integration tests type-check but still need a run against dev (they call the deployed functions).
2. **Bug caught during the build:** the first draft's "remove sits left with no pets" step would have deleted every empty sit in the database, not just this person's. Fixed before any test run. It now only touches sits that included a pet being deleted.
3. **New notification wording (approved by Lynn, 2026-11-21):**
   - Transfer, account deleted: *"{Name} deleted their account. You are now the primary owner of {Pet}."* (was "…the sole owner of {Pet}." Wrong when other co-owners remain.)
   - Transfer, pet removed: *"{Name} removed {Pet} from their account. You are now the primary owner."* (was "…You are now the sole owner.")
   - Sit handed over: *"You now manage the pet sit for {Pets} ({Dec 1 – Dec 5}), which {Name} set up."*
   - Pet taken out of a sit: *"{Pet} was taken out of the pet sit {Name} set up for {Pets} ({dates}). You can set up a new sit for {Pet} anytime."*
   - Sit cancelled: *"{Name} deleted their account, so the pet sit they set up for {Pets} ({dates}) was cancelled. You can set up a new one anytime."*
   - Co-owner left (unchanged): *"{Name} deleted their account and no longer has access to {Pet}."*
4. **Found, not fixed (pre-existing):** when delete-account fails, Settings shows Supabase's generic "Edge Function returned a non-2xx status code" text, not the function's own message, because `supabase.functions.invoke` doesn't pass the body through on errors. The new "Please try again" messages therefore won't be seen until that's fixed (frontend lane).
5. **Found, not fixed:** a co-owner who *leaves one pet* (delete-pet's "left" path) and had set up a sit covering it keeps that sit, though they no longer own the pet. Rare; same shape as PA-24.
6. **First production backup run may hit the safety stop.** Before this change nothing was ever pruned, so R2's `uploads/` may hold many long-deleted files. If the first nightly run stops, re-run `storage-backup.yml` by hand with `allow_large_prune` ticked, once.
7. `reset-sandbox-account` now uses the shared paginated storage helpers (`_shared/storageFiles.ts`) instead of its own loop. Its behavior is unchanged.
8. Frontend change is the Privacy Policy text only (`src/lib/privacyPolicyContent.js`, date November 21, 2026). No `.jsx` changed, so design-system-check doesn't apply. Lint, typecheck, vitest (143) and build pass.
9. **Pre-check results (2026-11-21, read-only, run before 0058 on all three projects):** dev, staging and prod are identical. Each has the same 24 foreign keys from `public` to `auth.users`, with the same names and rules, so nothing has drifted from migration history.
   - All 13 tables 0058 changes exist on every project, and each has exactly one `created_by` → `auth.users` key, currently `CASCADE`: `daily_check_ins`, `observations`, `vaccinations`, `medications`, `bloodwork`, `food_logs`, `pet_foods`, `pet_baselines`, `pet_onboarding`, `symptom_logs`, `wellness_scores`, `pet_sit_logs`, `pet_co_owners`.
   - `pet_sitter_access.sitter_user_id` is `SET NULL` everywhere, which is the sitter-re-registering bug this spec fixes.
   - Already `SET NULL` and left alone: `pet_documents.uploaded_by`. Stay `CASCADE` as the spec says: `pets.created_by`, `pet_sits.created_by`, `pet_sitter_access.owner_id`/`created_by`, `pet_co_owners.owner_id`/`co_owner_user_id`, `profiles.id`. `notifications.user_id` and `analytics_events.user_id` are also `CASCADE`, which is correct: those belong to the person leaving.
   - `pet_co_owners` rows where `created_by` differs from `owner_id`: **0** on all three. No one is currently exposed to the "co-owner invites vanish when the inviter leaves" bug, so the fix is preventive.
   - Nothing surprising.
10. **Dev rollout (2026-11-21):** 0058 pushed to dev (dev was at 0057, only 0058 pending). Afterwards the 13 `created_by` keys are `SET NULL`, `pet_sitter_access.sitter_user_id` is `CASCADE`, and the others are unchanged. `transfer_pet_ownership` and `prepare_account_deletion` can be run by `service_role` only (not `anon` or `authenticated`). `delete-account`, `delete-pet` and `reset-sandbox-account` deployed to dev with default settings (`supabase/config.toml` only sets a flag for `resend-webhook`). Staging and prod not touched.
11. **Found and fixed during the dev rollout: new deploys of any Edge Function crash on startup.** After the first dev deploy, every request to `delete-account`, `delete-pet` and `reset-sandbox-account` returned `WORKER_ERROR` ("Function exited due to an error"), even the test-account guard that does nothing. The cause wasn't this spec's code. `_shared/errorReporting.ts` imported `npm:@sentry/deno` with no version, so each deploy takes the newest release. **11.16.0 (published 2026-11-20 14:00 UTC) crashes the function when `Sentry.init` runs at startup.** This was confirmed on dev with a throwaway function, deployed and then deleted: 10.x, 11.14.0 and 11.15.0 start fine and 11.16.0 crashes. `supabase-js` and the Sentry import alone are fine. Fix: pinned to `npm:@sentry/deno@11.15.0`, with a comment explaining why.
    - **This already affects production and staging.** `sign-up` was redeployed to all three projects on 2026-11-21 around 01:00–01:11 UTC (spec 0074 rollout) and crashes on every project, so **no one can create an account with email on prod right now**. A harmless `OPTIONS` request returns 500 on all three, while `ask-vet-assistant` (last deployed 2026-11-18) returns 200. Every function deployed before 2026-11-20 14:00 UTC is unaffected until it's redeployed. Dev's `sign-up` was redeployed from this branch and now works. Staging and prod were not touched (out of scope for this rollout). They need `sign-up` redeployed from a branch that has the pin, the same way the 0075 functions will be.
12. **Dev test results (2026-11-21, `.env.playwright` + `DEV_SUPABASE_SECRET_KEY`, after the fix in note 11):** all pass. `delete-account/index.test.ts` 8/8, `delete-pet/index.test.ts` 6/6, `account_deletion.test.ts` 1/1, `private_uploads.test.ts` 5/5, `co_owner_access.test.ts` 2/2 (8 steps), `sitter_access.test.ts` 1/1 (9 steps). Before the fix, delete-account was 0/8 and delete-pet 0/6, all from the startup crash. The four `supabase/tests/` files passed both times, because they call the database directly, not Edge Functions.
