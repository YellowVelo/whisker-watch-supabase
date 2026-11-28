# 0089_Database_Permissions_Parity_And_Env_Diff_Specification_v1

**Status:** Draft, 2026-11-27. Waiting for Lynn's review. Nothing built.
**Date:** 2026-11-27
**Punch list:** PA-16, PA-78 (bundle B02, "Same database permissions on all 3 projects")
**Branch:** `claude/spec-0089-db-permissions-parity` (off `main` at `9399bfc`)
**Migration:** `0065_environment_parity.sql` (reserved)
**Process:** `/ship-feature`. Type: **PROTECTED** (function permissions, default permissions, a migration on all three projects). Merge waits for Lynn's OK.
**Related files:** new `scripts/env-diff/` (`inventory.sql`, `env-diff.mjs`, `expected-differences.json`, `env-diff.test.js`), new `supabase/migrations/0065_environment_parity.sql`, `supabase/migrations/0059_server_function_lockdown.sql` (the PA-05 fix this finishes), `supabase/migrations/0026_vibe_and_symptom_count.sql`, `supabase/migrations/0055_private_uploads_phase2.sql`, `supabase/tests/function_permissions.test.ts`, `docs/foundation/0006 Technical Standards.md` §11, `docs/features/0068_PreAlpha_Deployed_State_Audit_Specification_v1.md` (AC3), `docs/testing/QA_Test_Plan.md`, `CLAUDE.md`

## Lynn — what I need from you

1. **Review and approve this spec.** This blocks everything else.
2. **Approve one choice I made for you (item 4 under "Before You Approve This"):** new number counters (sequences) get usable by signed-in users and the server, but not by logged-out visitors. Say if you'd rather have Supabase's stock setting instead.
3. After review passes: **OK the PROTECTED merge.**
4. Nothing to promote in Cloudflare. This spec changes no app screens.

## Before You Approve This

1. **Nobody can exploit PA-78 today.** I checked all three projects on 2026-11-27. No database function in the app's area of the database can be run by logged-out visitors or by "everyone." The hole is in the *starting permissions* prod gives each **new** function: on prod, a new function can be run by everyone unless its migration locks it on purpose. Every migration since 0059 has done that, so the risk is that one forgets. Dev and staging start new functions locked.
2. **Why 0059 didn't fix prod.** PostgreSQL keeps starting permissions at two levels: one for the whole database and one for the area the app's tables live in (the `public` schema). 0059 removed "everyone" at the whole-database level only. Prod also has it at the `public` level, and that one still applies. Dev and staging never had it there. One line in 0065 fixes it.
3. **The comparison script found four more small mismatches.** You chose to fix them all, so afterwards the script reports **zero** differences and any new mismatch stands out. None of them exposes data:
   - **Prod is missing a check-ins rule:** "symptom count can't be negative." Migration 0026 added the column and the rule together, but prod already had the column, so the rule was skipped. Prod has 718 check-ins and none are negative, so adding the rule is safe.
   - **Starting permissions for new number counters (sequences) differ on all three.** (A sequence hands out the next number, 1, 2, 3…, for tables that use numbered IDs. The app has none in `public` today; it uses random IDs.)
   - **A private bookkeeping table** (`private.deploy_markers`, which holds the "frontend is live" markers that unlock some migrations) has its row lock on in staging and prod but off in dev. Dev's copy was created by hand from a snippet before its migration ran. Logged-in users can't reach that table on any project either way.
   - **Seven staging trigger functions lack the server's permission** that dev and prod give them. I earlier said eight; the real count is seven. (A trigger function runs automatically when a row changes; nobody calls it by hand.) Harmless, since triggers don't check this permission. It's fixed only so the projects match.
4. **One choice I made for you, about sequences.** The three projects disagree, so I had to pick one setting for all three. I picked: signed-in users and the server can use new sequences, logged-out visitors can't, and only the server can reset one. Supabase's stock setting also lets logged-out visitors use them and reset them. Sequences have no row locks, so "reset" is a real power, and nothing in the app needs visitors to have it. Say if you'd rather match Supabase's stock setting.
5. **Many apparent differences were just line endings.** Most function code on staging and prod was saved from Windows (each line ends with an extra invisible character) and dev's wasn't. The script ignores that, or it would report about 18 false differences.
6. **Deploy order.** Spec 0086 (PR #69) has migration 0064 on dev only so far. 0065 has to go on each project after 0064, or `db push` refuses. Until 0086 is live everywhere, the script will report 0064's changes (the migration itself plus 5 changed functions) as "projects on different migrations." That's expected, and the report says so.
7. **The script is read-only and local.** It only reads from each project, through its own temporary link folder, so the repo's own link never changes. You chose to run it locally after each push, with no GitHub schedule, so no new secrets are needed.
8. **Self-review:** no existing tool does this. Spec 0068's version was a throwaway in a scratch folder and is gone. 0006 §11 has a manual two-query check; this spec replaces it with the script. No locked decision is touched. New debt: none, except that the script needs the Supabase CLI to be logged in on the machine running it, which is already true for every push.

## Functional Requirements

- **FR1. One command compares the three projects.** It lists every difference between dev, staging and prod in database structure and permissions. That covers: functions (code, settings and who may run them), tables (row lock on/off, permissions), columns, row-lock rules (policies), including the file-storage rules, triggers, constraints, indexes, starting permissions, schema permissions, scheduled jobs, storage buckets and migration history. The results use plain labels.
- **FR2. It also checks safety rules on each project on its own,** even where all three agree:
  - no app function can be run by logged-out visitors or by everyone;
  - new functions start locked (no everyone, visitors or signed-in users);
  - every app table has its row lock on;
  - the `uploads` file bucket is private.
- **FR3. Known, intentional differences can be written down** in one file, each with a reason. The script hides them and lists how many it hid. Today that file is empty.
- **FR4.** It exits with an error if it finds any unexplained difference, any broken safety rule, or any project it couldn't reach. It never reports "all clear" for a project it didn't read.
- **FR5. Read-only.** It never changes any project, and it never changes the repo's own link to a project.
- **FR6.** After migration 0065 is on all three, new functions on prod start locked, the four other mismatches are gone, and the script reports zero differences once all projects are on the same migrations.
- **FR7.** The deploy checklist (0006 §11) says to run the script after every migration push, in place of today's manual two-query check.

## Acceptance Criteria

1. **Given** today's three projects (before 0065), **when** the script runs, **then** it reports the prod-only "everyone" starting permission as a broken safety rule plus the four mismatches above (and 0064's differences while 0086 is mid-rollout), and exits with an error.
2. **Given** a project the script can't reach (wrong ref, CLI logged out), **when** it runs, **then** it says which project failed and exits with an error, never "no differences."
3. **Given** two projects whose function code differs only in Windows vs. Unix line endings, **when** compared, **then** no difference is reported.
4. **Given** a difference listed in `expected-differences.json` with a reason, **when** the script runs, **then** it's hidden and counted as "expected," and the script can still pass. An entry with no reason is rejected.
5. **Given** a function that anyone or a logged-out visitor can run, a table with its row lock off, or a public `uploads` bucket on any one project, **when** the script runs, **then** it fails on that safety rule, even if all three projects agree.
6. **Given** 0065 pushed to a project, **when** a migration later creates a function without granting anything, **then** only `postgres` and `service_role` can run it there. Checked on every project from the starting-permissions row, and on dev by a real probe function (AC6 in the test plan).
7. **Given** 0065 on all three projects and all three on the same migration, **when** the script runs, **then** it reports 0 differences and 0 broken rules, and exits cleanly.
8. **Given** 0065 runs a second time (e.g. a restore), **then** it succeeds and changes nothing.
9. **Given** 0065 on prod, **then** check-ins still save (the new rule only refuses negative symptom counts, which the app never sends), and the existing Deno permission suite (`function_permissions.test.ts`) still passes on dev.
10. **Given** the script's own files, **then** the inventory query is one read-only `select` (no write or change statements), enforced by a unit test.

## Test Plan

- AC1 → manual, recorded in the spec's Results: run before 0065, paste the summary. Needs all three live projects, which CI can't reach (no prod credentials in CI, by your choice).
- AC2, AC3, AC4, AC5, AC10 → **vitest** unit tests in `scripts/env-diff/env-diff.test.js`, using small fake project snapshots (no network). These run in CI with the rest of `npm run test`.
- AC6 → after pushing 0065 to dev: one read-only run of the starting-permissions check on each project, plus on dev only, a probe in one transaction that is always rolled back: create `public.zz_env_diff_probe()`, read who may run it, roll back. If the CLI's query endpoint won't hold a transaction open, the builder creates it, reads it and drops it in one dev-only `do` block instead. Prod and staging get the read-only check only; nothing is created there.
- AC7 → manual: run the script after 0065 is on all three. Recorded in Results. Same reason as AC1.
- AC8 → apply 0065 twice on dev (`supabase db query --linked -f` the migration after `db push`), then run the script: no change.
- AC9 → `function_permissions.test.ts` (existing, CI, dev) plus the existing e2e check-in tests. A dev check-in save after the push is covered by `e2e/daily-checkin.spec.js` in CI.
- **No Playwright test:** this spec has no screen changes.
- **Seeding/access constraints:** the live runs need the Supabase CLI logged in with access to all three projects (already true on Lynn's machine for pushes). The unit tests need nothing.

## Visual Reference

None. No UI changes.

## Technical Spec

### The script (`scripts/env-diff/`)

- **`inventory.sql`**: one `select … union all …` statement returning `(kind, item, detail)` rows for the `public` and `private` schemas (and `storage` policies, `auth` triggers): functions (`pg_get_function_identity_arguments`, `prosecdef`, `proconfig`, `proacl`, `md5(replace(prosrc, chr(13), ''))`), tables/views/sequences (`relkind`, `relrowsecurity`, `relforcerowsecurity`, `relacl`), columns (`information_schema.columns`), policies (`pg_policies`, `md5` of `qual`/`with_check`), triggers (`md5(pg_get_triggerdef)`, `tgenabled`), constraints (`md5(pg_get_constraintdef)`), indexes (`md5(indexdef)`), `pg_default_acl` (all roles), schema ACLs, `cron.job` (schedule, active, `md5(command)`), `storage.buckets`, `supabase_migrations.schema_migrations`. Prototyped on 2026-11-27 against all three projects: 761 items, ~118 KB per project. A function with a `null` ACL is reported as `DEFAULT`, which the safety rule treats as "everyone may run it" (that's PostgreSQL's meaning of null).
- **`env-diff.mjs`** (Node, no new packages): for each of `dev` `rebvizgpchpzjpoohjrd`, `staging` `vfhowemvqhwoqtwybzjs`, `prod` `upvtbwienebfxznnagsg`, it makes a temp folder, runs `supabase link --project-ref <ref> --workdir <tmp>` then `supabase db query --linked -o json -f inventory.sql --workdir <tmp>`, and deletes the temp folder. The repo's `supabase/.temp` link is never touched (the method spec 0068 used by hand). It diffs by `(kind, item)` and prints differences grouped by kind, a separate "projects are on different migrations" banner listing each project's latest version, the safety-rule results per project, and a summary line. Exit `0` clean, `1` differences or broken rules, `2` a project couldn't be read. `--only dev,staging` limits projects. `--json` writes the raw snapshots to a folder for debugging.
- The query result comes back wrapped as untrusted data; the script reads only the `rows` field and never runs anything it returned.
- **`expected-differences.json`**: `[{ "kind": "...", "item": "...", "reason": "..." }]`, starting as `[]`. Missing `reason` → exit 1.
- **Safety rules (per project):** R1 no `public`/`private` function ACL is `DEFAULT`/null, contains a bare `=X/` (everyone) or `anon=`. R2 the `postgres` default-ACL rows for functions (`ALL` and `public`) contain no bare `=X/`, `anon=` or `authenticated=`. R3 every `public` table (`relkind r`/`p`) has `rls=true`. R4 bucket `uploads` has `public=false`.
- **`env-diff.test.js`** (vitest): diff, line-ending normalization, expected-differences filtering and validation, each safety rule, unreachable-project handling, and the read-only guard on `inventory.sql` (one statement, starts with `select`, no `insert|update|delete|alter|create|drop|grant|revoke|truncate|copy` outside quoted text). `vitest.config` already picks up `*.test.js`; the builder checks that it includes `scripts/`.

### Migration `0065_environment_parity.sql`

Idempotent; same result on all three whatever each starts with. Header carries the post-push step ("run `node scripts/env-diff/env-diff.mjs`").

1. **PA-78.** `alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;` then `… grant execute on functions to service_role;` (makes staging match dev/prod; 0059's server-only group is `service_role`).
2. **Sequence starting permissions** (choice in item 4 above): `alter default privileges for role postgres in schema public revoke all on sequences from public, anon, authenticated, service_role;` then `grant usage, select on sequences to authenticated, service_role;` and `grant update on sequences to service_role;`. No sequences exist in `public` today (checked 2026-11-27), so nothing current changes.
3. **Staging trigger grants:** `grant execute on function` `public.handle_new_user()`, `protect_pet_photo_path()`, `protect_privileged_profile_fields()`, `protect_record_creator()`, `set_updated_at()`, `stamp_record_author()`, `validate_profile_timezone()` `to service_role;`. A no-op on dev/prod. No `anon`/`authenticated` change; 0059's "triggers: nobody calls them directly" still holds for users.
4. **Check-ins rule:** a `do` block that adds `daily_check_ins_symptom_count_check check (symptom_count >= 0)` to `public.daily_check_ins` only if a constraint of that name is missing (prod). Prod has 0 negative rows of 718 (checked 2026-11-27); the block validates normally.
5. **Deploy markers:** `alter table private.deploy_markers enable row level security;` (dev only in effect). Owners bypass row locks, so the migrations that read it as `postgres` keep working.

No new functions, so `function_permissions.test.ts` lists don't change.

### Docs

- `0006 Technical Standards.md` §11: replace the manual two-query block with "run `node scripts/env-diff/env-diff.mjs` after any migration push; it must exit 0, or every difference must be in `expected-differences.json` with a reason." Note the line-endings normalization and the starting-permissions lesson (two levels).
- `CLAUDE.md`: one line under Key architecture pointing at `scripts/env-diff/`; drop "No automated cross-environment policy-diff tooling exists yet" from the 0052 bullet.
- `QA_Test_Plan.md`: rows for AC1–AC10.
- 0068's AC3 recommendation and 0063's follow-up are marked done.

- **Design System compliance:** no UI changes; nothing to check.
- **Constraints from CLAUDE.md / locked decisions:** respected. Migration gate markers aren't needed (no frontend dependency). Agents test on dev only; the prod/staging live runs are read-only, plus the 0065 push itself, done during deploy as for every migration. Spec 0083/0086 work isn't touched.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** none in the repo. 0006 §11's manual query does part of this by hand and is replaced. `function_permissions.test.ts` checks each function's group on dev only; it stays, since it proves calls actually fail, which the script doesn't.
- **Technical debt nearby:** migration 0026's `add column if not exists … check (…)` pattern silently skips the rule when the column already exists. That's how prod lost its rule. Other migrations may use the same pattern; the script will now catch any rule that's missing on one project.
- **Line endings:** function code saved from Windows carries extra invisible characters. Harmless, but it's why a naive comparison is noisy.
- **Orphaned features nearby:** none found.
- **Punch list / known issues:** PA-16 and PA-78 are this spec. PA-78's note planned the fix as spec 0085 / migration 0063; those numbers went to the pet-sit date fix, so it's 0089 / 0065 here. PA-23's root cause (0066 compared code but not permissions) is what the script prevents.

## Non-Goals

- Running the script on a schedule in GitHub (you chose local-only; needs a secret if wanted later).
- Comparing data, Edge Function code or secrets, or Auth dashboard settings (PA-41 covers the dashboard checklist).
- Comparing the restore-scratch project or the Smart Meds project.
- Changing any function's permissions beyond the seven staging trigger grants.

## Open Questions

None, unless you'd prefer Supabase's stock sequence setting (item 4 above).
