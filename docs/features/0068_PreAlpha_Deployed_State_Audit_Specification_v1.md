# 0068_PreAlpha_Deployed_State_Audit_Specification_v1

**Status:** Draft — findings only, nothing changed
**Date:** 2026-10-23
**Deadline:** fix P0s before alpha kickoff (Friend cohort, 2026-11-02)
**Method:** read-only. Prod (`upvtbwienebfxznnagsg`) was queried with SELECT-only statements through a temporary scratch-folder link, so the repo's CLI link stayed on dev. Grants, policies, cron, buckets, triggers and columns were also diffed across all three projects. One anonymous storage *list* call confirmed the bucket exposure; it printed counts only, never file names. No exploit was actually performed: the access-control findings are proven from the live policy definitions, not by trying them.
**Related files:** `supabase/migrations/0002_storage_bucket.sql`, `0004_co_owner_accounts.sql`, `0019_email_logs_idempotency.sql`, `0038_resend_delivery_webhook.sql`, `0052_restore_storage_policies.sql`, `supabase/functions/{delete-account,delete-pet,invite-co-owner,invite-sitter,ask-vet-assistant,generate-vet-report}/index.ts`, `src/api/storageClient.js`, `src/App.jsx`, `src/pages/AcceptInvite.jsx`, `src/components/InviteCoOwnerDialog.jsx`, `src/lib/errorMonitoring.js`, `src/lib/privacyPolicyContent.js`, `CLAUDE.md`

## Before You Approve This

1. **Three of your four "known" items are already fixed.** As of today, spec 0066 has redeployed all 14 backend functions on all 3 projects. Prod's live function list shows every one updated 2026-10-23, with `delete-account` on the current build and Sentry wiring in all of them. `main` and `staging` both point at `c36f7a4` (0 commits apart). Only the Vet Report item is still open, and it turned out to be worse than described (finding P1-3).
2. **The 0063-style "history says it ran, but the effect isn't there" problem is real again, in a new place.** Migrations 0019 and 0038 were meant to make two database functions server-only. On prod and dev they are still callable by anyone, even logged out. On staging they are locked down correctly. (A "database function" here is a small program stored inside the database that the app can call by name.) So testing on staging would never catch this. Spec 0066 reported the three databases as "identical", but its check never compared function permissions.
3. **I ranked sharing and deletion bugs as P0** because you said alpha testers will use co-owner/sitter invites and account deletion.
4. **No sign of abuse in prod data so far:** all 3 co-owner rows belong to the real owners, there are no pet-sit records, and there are no active email suppressions. The holes are open, but nothing shows they've been used.
5. **This doc is the deliverable, not a build plan.** Each P0 needs its own fix spec, with your review, before any code is written (per the no-work-before-review rule).
6. **Not covered:** Supabase Auth settings (e.g. whether email confirmation is required to log in, the redirect allowlist), whether the live Cloudflare frontend build equals `main` (curl gets a 403 from Bot Fight Mode), and Anthropic, Resend and R2 dashboard settings. See Open Questions.
7. **Self-review:** every evidence line below was re-checked against a live query result or a file/line read this session. No claim rests on a doc alone. No Design System or Vibe-model conflicts (no UI is proposed).

## Functional Requirements

- Before alpha, nobody can see, change or delete another household's pets, records or files unless they were genuinely invited.
- Deleting an account or a pet never destroys records that belong to someone else, and does what the Privacy Policy says it does.
- Anything that sends email or calls the AI has a limit that protects the email domain's reputation and the Anthropic bill.
- When something fails, either the user is told or Sentry records it.
- A brand-new user can get from signup through first check-in and invites with no dead ends.
- The docs a future session reads first don't send it the wrong way.

## Acceptance Criteria

1. **Given** this audit, **when** Lynn reviews it, **then** every P0 below has a decision (fix before alpha, or accept the risk in writing), and each "fix" gets its own spec.
2. **Given** a P0 fix spec ships, **when** the read-only queries in this doc are re-run on all 3 projects, **then** the finding no longer reproduces on any of them, not just the one that was tested.
3. **Given** the cross-environment diff query used here (functions, grants, policies, cron, buckets, triggers, columns), **when** it is re-run after any migration, **then** it reports 0 differences, or only differences that are written down as intentional.

## Test Plan

- AC1 → process gate (Lynn's review). Not testable.
- AC2 → each fix spec brings its own Playwright/Deno tests. Plus the read-only query for that finding, listed under its Evidence, re-run per project.
- AC3 → the diff script (`acl.sql` + `diff3.py`, currently in the session scratchpad). Recommend committing it as `scripts/env-diff/` in a follow-up. This is the "cross-environment policy-diff tooling" that spec 0063 flagged as missing.
- **Seeding/access constraints:** none for this audit (read-only). Fix specs that need to prove "a stranger can't do X" need two real sessions (e.g. `test1@` acting on `test4@`'s pet). That already fits the existing fixture-account pattern.

## Visual Reference

None — no UI.

## Findings

### P0 — blocks alpha

**P0-1. Every uploaded file (pet photos, vet documents) can be listed and downloaded by anyone on the internet, even logged out.**
- *Evidence:* bucket `uploads` has `public=true`, no size limit, any file type (`select id, public, file_size_limit, allowed_mime_types from storage.buckets`). The storage policy `uploads_public_read` is `SELECT` for role `{public}` with only `bucket_id = 'uploads'`. An anonymous `POST /storage/v1/object/list/uploads`, using only the publishable key that ships inside the website, returned 2 user folders and their files. Prod holds 6 objects (5 JPEG, 1 PDF, ~7 MB) across 2 users. Folder names are user IDs (`src/api/storageClient.js:19`), so listing also reveals every uploader's account ID.
- *Why it matters:* scanned vet invoices typically carry the owner's name, address, phone and the pet's medical history.
- *Fix:* make the bucket private. Replace the read policy with "own folder, or a pet you own/co-own/sit". Switch `storageClient.js` from `getPublicUrl` to short-lived signed URLs, and store the file *path* rather than the public URL. `ask-vet-assistant` must then download through the service role instead of a public URL. Add a size cap and an image/PDF-only type list. Note: restoring `0002`'s policies (spec 0063) restored this public-read rule as-is; the rule itself is the problem.

**P0-2. Any signed-in user who knows a pet's ID can make themselves its co-owner, invisibly, and then edit or delete the pet.**
- *Evidence:* policy `pet_co_owners_insert_owner_only` checks only `auth.uid() = owner_id`. Nothing requires the inserter to own `pet_id`, and nothing stops them setting `co_owner_user_id` to themselves. No trigger on `pet_co_owners` validates this (trigger list checked). `is_pet_owner()` returns true for any `pet_co_owners` row with `co_owner_user_id = user`. That grants all of `pets_update_owner`, `pets_delete_owner` and every child table. The real owner can't see the intruder's row: `pet_co_owners_select_owner_or_self` only shows rows where *they* are `owner_id` or `co_owner_user_id`.
- *Who knows a pet ID:* every past co-owner or sitter (it's in the URL, `/pet/:petId`, and in the invite email link, `invite-co-owner/index.ts:229`). Removing a co-owner is therefore not a real revocation: they can add themselves back.
- *Fix:* the insert check must require `is_pet_owner(pet_id, auth.uid())` and `co_owner_user_id is null`, so only `claim_pending_co_owner_invites()` can link a user. Widen select so any owner of the pet sees every co-owner row. Add a Deno/Playwright test: `test1@` attempting this on `test4@`'s pet must fail.

**P0-3. Any signed-in user can give themselves read access to any pet (profile, check-ins, observations) through a fake pet-sit.**
- *Evidence:* `pet_sits_insert_owner` passes if `auth.uid() = created_by` *or* the user owns *any* pet in the list. `pet_sitter_access_insert_owner` passes if the user owns *any one* pet in the sit's `pet_ids`. So: create a sit listing your own pet plus the victim's pet, then add yourself as sitter. `is_pet_sitter()` then returns true for the victim's pet, opening `pets_select_sitter`, `daily_check_ins_select_sitter` and `observations_select_sitter`. `invite-sitter` also reads the victim pet's name with the service role (`invite-sitter/index.ts:116`) and puts it in an email.
- *Fix:* both checks must require the caller to own **every** pet in `pet_ids` (a `not exists` over the unowned IDs), on insert and on update. Drop the bare `created_by` shortcut.

**P0-4. Two server-only database functions can be called by anyone, which lets a stranger silently block email to any address (including password resets).** *(the 0063 pattern)*
- *Evidence:* the function permission list (`proacl`) on prod shows `anon=X` and `authenticated=X` on `process_resend_webhook_event` and `claim_email_idempotency_key`. Migrations `0019:80` and `0038:169` only `revoke ... from public`. Supabase separately grants the `anon`/`authenticated` roles directly, so revoking from `public` doesn't remove them. Migrations `0020`/`0039`/`0040` did it right (`from public, anon, authenticated`). Staging *is* locked down, because it was set up with different default permissions, so this is also cross-environment drift. Supabase's own security advisor flags both on prod (`anon_security_definer_function_executable`, 12 functions).
- *Attack:* `invite-co-owner`/`invite-sitter` return Resend's `messageId` to the browser (`invite-co-owner/index.ts:282`, `invite-sitter/index.ts:274`). Feeding that ID into `rpc/process_resend_webhook_event` with type `email.bounced` and *any* email address writes that address into `email_suppressions`. Every future email to it (invites, password reset, verification) is then silently skipped. The fake event never passes through the webhook's signature check.
- *Fix:* a new migration revoking `execute ... from public, anon, authenticated` on every server-only function. `is_pet_*` must keep `authenticated`, because RLS calls them as the user. Also stop returning `messageId` to the browser, and add `proacl` to the permanent cross-env diff.

**P0-5. When someone deletes their account, every check-in, observation and vaccination they logged on a *shared* pet is deleted from the other owner's history.**
- *Evidence:* every child table has `created_by → auth.users ON DELETE CASCADE`: `daily_check_ins`, `observations`, `vaccinations`, `medications`, `bloodwork`, `food_logs`, `pet_foods`, `pet_baselines`, `pet_onboarding`, `symptom_logs`, `wellness_scores`, `pet_sit_logs`, `pet_sits` (FK query on `pg_constraint`). The pets themselves are protected (they cascade on `pet_id`), but the *records* go with whoever typed them. A co-owner who deletes their account erases their half of the pet's history. When the primary owner leaves, the pet transfers to a co-owner with the departing owner's entries already wiped.
- *History:* this was supposed to be prevented. `account-deletion-edge-function-spec_1.md` locked the decision that data is never deleted automatically just because one household member's account is removed. The implementation (`c66b2ad`) kept the pet row and transferred ownership, but the spec only discussed the pet row, never who entered each record. Every record table has had `created_by … on delete cascade` since `0001_init_schema.sql` (9 tables), and no migration ever changed it.
- *Test gap:* the transfer test (`delete-account/index.test.ts:89-118`, added in `c118600`) creates a pet with no records at all and checks only the new `created_by` and that a notification exists. A test with even one check-in entered by the departing owner would have failed.
- *Fix:* change those `created_by` foreign keys to `ON DELETE SET NULL` (with a nullable column). Records belong to the pet, not to whoever typed them. Extend the transfer and co-owner-leaves tests so each departing person has entered at least one check-in, observation and vaccination, then assert all of them still exist afterward.

**P0-6. `delete-account` removes the other co-owners' access and deletes the transferred pet's photo and documents.**
- *Evidence:* `delete-account/index.ts:156-160` deletes every `pet_co_owners` row where `owner_id = departing user`. Those rows are the invitations the departing owner *sent*, so every co-owner except the new primary loses access. The follow-up repoint at `:164-168` then finds nothing to update. Separately, `:202-216` deletes everything in the departing user's storage folder, which is where the transferred pet's photo and scanned documents live. The new owner gets broken images. Also, `.list(userId)` returns at most 100 files by default, so heavier users leave files behind.
- *History:* the original deletion spec (`account-deletion-edge-function-spec_1.md`, step 3) itself says to delete everything in the user's storage folder, without accounting for that folder also holding a transferred pet's photo and documents. The co-owner row bug has been in the code since the first version (`c66b2ad`). `delete-pet` handles the same situation correctly: it repoints the remaining co-owners instead of deleting their rows.
- *Test gap:* every `delete-account` test links exactly one co-owner and never uploads a file (`index.test.ts:34-44`, `:89-157`). With one co-owner, wrongly deleting the "other" co-owner rows has nothing to delete, and with no files, the photo loss can't show up.
- *Fix:* delete only the new primary's own co-owner row and repoint the rest, sharing one helper with `delete-pet`. Move (not delete) storage files belonging to transferred pets. Paginate the storage list. Add a 3-person (owner + 2 co-owners) Deno test with a pet photo and one scanned document, asserting that both co-owners keep access and both files still load.

**P0-7. The Terms of Service and Privacy Policy links on the signup screen bounce signed-out visitors to the login page.**
- *Evidence:* `/terms` and `/privacy` are inside `ProtectedRoute` (`src/App.jsx:137-140`, `unauthenticatedElement={<Navigate to="/login" />}`). Register links to both (`src/pages/Register.jsx:107-109`, also `Login.jsx:213-215`). A new user agrees to documents they can't open.
- *Fix:* move the four legal routes outside `ProtectedRoute` (they're static content). Add one Playwright test: signed out → `/terms` shows the Terms.

### P1 — fix before public launch

**P1-1. Invite emails: any signed-in user can send Wysker-branded email to any address, about any pet name, with no limit.**
- *Evidence:* `invite-co-owner/index.ts:93-99` takes `coOwnerEmail`/`petName`/`petId` from the request and never checks that the caller owns `petId`. Neither invite function calls `check_and_record_rate_limit(s)`. The only rate-limited functions are `sign-up`, `beta-signup`, `early-adopter-signup` and `ask-vet-assistant`. Each call also creates a real `auth.users` row for the target address (`generateLink type 'invite'`, `:134`). The `'exists'` response tells the caller whether an address has a Wysker account with a password (an account-enumeration leak).
- *Why it matters:* spam complaints against the sending domain undo the warm-up work in spec 0022.
- *Fix:* verify ownership server-side (or look up the pet name server-side instead of trusting `petName`). Add a per-user rate limit, e.g. 10 invites/hour, reusing `check_and_record_rate_limit`. Make the response the same whether or not the address has an account.

**P1-2. The AI endpoint is an open, general-purpose Claude proxy for any signed-in user.**
- *Evidence:* `ask-vet-assistant/index.ts:110` accepts any `prompt` from the browser. The safety rules in `src/lib/aiGuardrails.js` only run in the browser, so a direct call skips them. The limit is 20 requests / 10 min per user (≈2,880/day), with `max_tokens: 2048` on `claude-sonnet-4-6`, no daily cap and no project-wide cap. Separately, `:124` fetches *any* `file_url` server-side with no host allowlist or size cap and base64-encodes it in memory. That allows server-side requests to arbitrary addresses (SSRF), and very large files will time out or crash the function. Anthropic failures (`:168-175`) and bad JSON (`:188-194`) return 502 without reaching Sentry.
- *Fix:* move prompts server-side as named templates (scan-vaccine, scan-bloodwork, chat), with guardrails applied on the server. Only accept `file_url`s from this project's own storage, with a size cap. Add a daily per-user cap. Set a monthly spend limit in the Anthropic console. Report AI failures to Sentry.

**P1-3. The Vet Report shows a retired "Health Score /10" and never includes daily check-ins (Vibe) at all.**
- *Evidence:* `generate-vet-report/index.ts:301` reads `wellness_scores`, and `:338-345` prints "Current Health Score: X / 10". No query in the function touches `daily_check_ins`. Prod's `wellness_scores` has 83 rows, the last from 2026-07-12. `daily_check_ins` has live data through 2026-09-01. For every alpha user, the Wellness Overview will be empty and the vet will see no check-in history. This contradicts the locked spec 0012 model.
- *Fix:* rebuild the section from `daily_check_ins` (Vibe distribution plus symptom-count direction, kept separate, per 0012). Drop the `wellness_scores` read.

**P1-4. Invited co-owners and sitters never accept the Terms or Privacy Policy, and existing accounts were never asked.**
- *Evidence:* `AcceptInvite.jsx` only sets a password (`:102-105`), and `invite-co-owner`'s `generateLink` sends no consent metadata. `AuthContext.jsx:120-140` records consent only when a pending Google answer exists; otherwise it silently moves on. Prod: 11 of 13 profiles have `terms_accepted_at` null. Consent fields are also user-editable (`profiles_update_own`; the protect trigger only guards `account_type`/`role`).
- *Fix:* add a consent checkbox to AcceptInvite, plus an in-app gate for any profile with null consent. Make the consent columns write-once through the existing protect trigger.

**P1-5. Deletion doesn't match the Privacy Policy's "permanently delete … all associated data."**
- *Evidence:* `src/lib/privacyPolicyContent.js:81`. In practice, the storage backup to R2 is add-only forever (spec 0049), and database dumps last 30 days. `email_logs`, `email_suppressions`, `resend_webhook_events`, `beta_signups` and `early_adopters` keep the email address after deletion (no foreign key to the user). `delete-pet` removes only the pet photo; scanned vaccination and bloodwork documents stay in storage (`delete-pet/index.ts:250-260`). `pet_sitter_access.sitter_user_id` is `ON DELETE SET NULL`, leaving `sitter_email`. If that person re-registers, `claim_pending_sitter_invites()` restores their old sitter access.
- *Fix:* say in the policy that backups age out after N days. Add pruning of R2 storage backups for deleted users. Delete document files with the pet. Delete (rather than null out) sitter rows when the sitter deletes their account. Decide whether to keep email-log rows (they're defensible for deliverability, but then the policy should say so).

**P1-6. Most backend and frontend failures never reach Sentry.**
- *Evidence:* every Edge Function calls `reportError` only in its outer `catch`. The dozens of early `return … 500` branches (e.g. `delete-account/index.ts:89,116,129,150,216,226`) are logged to the Supabase console only. Frontend: 2 `captureException` call sites, both in `VaccinationSection.jsx`, against 56 `console.error` calls and 18 `.catch(() => …)` swallowers. `errorMonitoring.js:21-23` drops every event whose `account_type` isn't `production`, which includes `owner` (your own account), so you'll never see your own errors. `InviteCoOwnerDialog.jsx` `handleSubmit` has no try/catch: a failed save leaves the spinner on forever.
- *Fix:* a shared `fail(status, msg, err)` helper in `_shared` that reports and responds in one step. Send `console.error` in data-loading code to Sentry. Let `owner` through the client filter.

**P1-7. Database permissions differ between the three projects, and the spec 0066 "identical" result missed it.**
- *Evidence:* the cross-env diff of 492 items found 0 differences in tables, policies, columns, triggers, cron and buckets, but 16 differences in function permissions. Staging uses default permissions for most functions, while prod and dev grant `anon`/`authenticated` explicitly. Dev also exposes `email_has_password()` to logged-out callers (an account-existence oracle on dev), which prod and staging don't. As a result, anything verified on staging doesn't prove prod (see P0-4).
- *Fix:* fold into the P0-4 migration, then add the diff to the deploy checklist (`0006 Technical Standards.md` §11).

**P1-8. Prod's `CORS_ALLOWED_ORIGINS` is still unset** (secret list checked today), so it falls back to `www.wyskerwatch.com` only. If any alpha link uses the bare domain or a `*.workers.dev` URL, signup, beta and early-adopter requests will fail with an error the user sees only as "something went wrong." The 0066 follow-up is still open. *Fix:* set it, or confirm the bare domain redirects to `www`.

### P2 — later

- **Co-owners have more power than intended.** Any co-owner can change `pets.created_by` to any user (the update policy re-checks only that the *editor* is an owner) and can delete the pet directly through the data API, skipping `delete-pet`'s transfer logic. *Fix:* block `created_by` changes in a trigger; limit delete to the primary owner.
- **The "created by" field on records can be faked.** Insert checks only verify pet ownership, not `created_by = auth.uid()`. *Fix:* add the check, or set the column from `auth.uid()` by default.
- **Three functions have a mutable search path** (`handle_new_user`, `classify_account_type`, `set_updated_at`) — advisor warning.
- **Leaked-password protection is off** (advisor `auth_leaked_password_protection`). It's a single toggle in the dashboard.
- **Two scheduled functions are also callable by anyone.** `compute_daily_analytics_summary` and `generate_vaccination_due_notifications` can be triggered by logged-out callers (covered by the P0-4 revoke).
- **A cron job's name doesn't match its schedule.** `nightly-analytics-summary` actually runs hourly (`0 * * * *`, 336 runs in 14 days). That's harmless, but confirm it's intended.
- **`analytics_events` takes unlimited client inserts** (insert-own policy, no cap).
- **`delete-account` can partly finish.** If storage cleanup fails, pets have already been transferred, which contradicts the header comment's "never left half-deleted."
- **Backend Sentry doesn't flush before returning.** `reportError` doesn't await `Sentry.flush()`. Live-fire passed, but events can drop when the function shuts down.
- **The "already has an account" invite path sends no email and no in-app notice.** The dialog says the person "can now see" the pet, but access only appears after their next login (`InviteCoOwnerDialog.jsx:98-104`).

### Docs vs code drift (would mislead a future session)

- **P1:** spec 0066 Results AC1 says permissions are "identical across dev, staging and prod". They aren't (P1-7). Correct it when P0-4 lands.
- **P1:** `generate-vet-report/index.ts:21` comment documents Health Score V2 as current, contradicting CLAUDE.md's locked model.
- **P2:** CLAUDE.md "Start here" points to `/docs/foundation/Product Context.md`; the file is `0001 Product Context_V2.md`.
- **P2:** CLAUDE.md says the e2e CI job is "non-blocking … through 2026-09-03". Spec 0067 found it has never passed once and was never made required. The `project_e2e_ci_trial_period` memory is stale too.
- **P2:** CLAUDE.md names `docs/planning/Wysker_Watch_Launch_Plan.xlsx` as the master planner. Saved memory says `Wysker_Watch_Execution_Plan.xlsx` superseded it (and that file isn't in the repo). One of them is wrong.
- **P2:** CLAUDE.md's `0052_restore_storage_policies` note should add: "the restored public-read rule is itself a P0 (spec 0068)", so nobody treats 0052 as the safe end state.
- **P2:** `delete-account/index.ts` header comment describes the co-owner row cleanup as removing "the departing user's rows". It actually removes the other co-owners' (P0-6).

## Technical Spec

- **Schema:** none in this spec. Fixes will need migrations for: storage policy + bucket privacy (P0-1); `pet_co_owners`, `pet_sits` and `pet_sitter_access` policies (P0-2/3); function revokes (P0-4); `created_by` foreign keys to `SET NULL` (P0-5).
- **Components/files touched by future fixes:** listed per finding above.
- **Design System compliance:** no UI in this spec. P0-7 and P1-4 will touch `App.jsx`/`AcceptInvite.jsx`, and those fix specs must run `design-system-check`.
- **Constraints from CLAUDE.md / locked decisions:** read-only respected. Backend fixes must ship to all three projects (§11), and P0-4 shows why each one must be verified *per project*. P1-3 enforces the locked 0012 Vibe model. P0-1's signed-URL change also affects `storage-backup.yml`; it uses the S3 API with its own keys, so it should be unaffected, but the fix spec must verify that.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** `delete-pet` and `delete-account` each carry their own copy of the co-owner transfer logic, and only `delete-account`'s has the P0-6 bug. The fix should share one helper.
- **Technical debt nearby:** `wellness_scores` (83 rows) and `symptom_logs` (13 rows, still the only source of weight) are retired-model tables still read by live code.
- **Orphaned features nearby:** `wellness_scores` writes stopped 2026-07-12; its only remaining reader is the Vet Report.
- **Punch list / known issues:** "11 functions predate Sentry", "delete-account differs per env" and "staging 4 behind" are resolved (spec 0066, today). "Vet Report dead table" is confirmed and expanded (P1-3). The `CORS_ALLOWED_ORIGINS` follow-up from 0066 is still open (P1-8).

## Non-Goals

- Fixing anything (each P0 gets its own spec).
- Load or penetration testing, or actually running any exploit.
- Native app-store readiness.

## Open Questions

1. Can you check three dashboard settings for me (they aren't readable from here)? (a) Supabase Auth → "Confirm email" required. (b) Auth redirect URL allowlist. (c) Anthropic console monthly spend limit.
2. Is the live production frontend on Cloudflare the `c36f7a4` build? Promotion is manual, and I can't see it from here.
3. Which launch planner is current, `Launch_Plan.xlsx` or `Execution_Plan.xlsx`? Whichever it is, CLAUDE.md or the memory should be corrected.
4. The test-account passwords shared in a chat on 2026-10-19 (spec 0066 open item): have they been rotated?
