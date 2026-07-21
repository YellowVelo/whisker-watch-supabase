# Requirements: Database Backups

**Status:** Implemented (07-21). This doc describes what exists today and how to use it.
**Source files:** [.github/workflows/db-backup.yml](../../.github/workflows/db-backup.yml), [.github/workflows/db-restore-test.yml](../../.github/workflows/db-restore-test.yml), [scripts/backup-db.sh](../../scripts/backup-db.sh), [scripts/restore-test.sh](../../scripts/restore-test.sh)

## Purpose

The production Supabase project previously had no backup coverage independent of Supabase's own account (`pitr_enabled: false`, `backups: []` at the time this was raised). One incident had already occurred: an `auth.users` row was deleted and was only recoverable because a stray migration file happened to contain the original data as INSERTs — that safety net does not exist for anything created since.

Two layers now exist:

1. **Supabase Daily Backups** — included free on the Pro plan, 7-day retention, one snapshot/day. Requires no configuration; confirm it's active under the project's **Database → Backups → Scheduled backups**. Covers accidental deletes/edits within the same Supabase project.
2. **This system** — a nightly encrypted export to Cloudflare R2, independent of the Supabase account entirely. Covers loss of the Supabase project/account itself (billing lapse, account compromise, Supabase-side incident), not just in-project mistakes.

PITR (point-in-time, second-level granularity) was evaluated and deliberately **not** enabled — it's a $100/month add-on and not justified before the app has real users. Revisit post-launch.

## How it works

**Backup** (`db-backup.yml`, runs nightly at 08:00 UTC, or manually via Actions → Run workflow):
1. `pg_dump --data-only` against the production DB, scoped to `public` (application tables) and `auth` (user identities — the schema the original incident needed), excluding `auth.schema_migrations` (Supabase Auth's internal tracker, not writable by the connecting role).
2. Encrypts the dump with `gpg` (AES-256 symmetric).
3. Uploads to the `whisker-watch-db-backups` R2 bucket under `backups/whisker-watch-<timestamp>.dump.gpg`.
4. Deletes backups older than 30 days.

**Why data-only, not full schema:** schema/DDL is already versioned in [supabase/migrations/](../../supabase/migrations/) and pre-provisioned identically on every Supabase project. A full-schema dump/restore against hosted Supabase fails outright — `auth`/`storage`/`realtime`/extension schemas are owned by Supabase-managed roles the connecting `postgres` role can't `DROP`/`CREATE`. Only data needs to travel in the backup; schema comes from replaying migrations.

**Restore drill** (`db-restore-test.yml`, manual only — Actions → Run workflow, optional `backup_key` input to pick a specific backup, defaults to newest):
1. Downloads and decrypts the chosen backup.
2. Resets the target's `public` schema and clears leftover `storage.objects` policies (idempotency, so the same scratch project can be reused for repeated drills).
3. Replays every migration in `supabase/migrations/` **except** `0003_real_data_import.sql`, `0007_restore_real_data_new_account.sql`, and `0027_migrate_symptom_logs_to_checkins.sql` — these are one-off historical data recoveries hardcoded to specific real production UUIDs, not schema, and would either conflict with or depend on data that only exists in production.
4. Clears `auth.users` and the migration-seeded `observation_types`/`observation_options` rows (see Known Limitations — these need special handling), then temporarily no-ops the `handle_new_user()` trigger function (it would otherwise auto-insert a stub `profiles` row that collides with the real one in the backup).
5. Restores the backup's data with `pg_restore --data-only`.
6. Reinstates `handle_new_user()`'s real behavior.

## Required secrets (GitHub repo → Settings → Secrets and variables → Actions)

| Secret | Purpose |
|---|---|
| `SUPABASE_DB_URL` | Production DB session-pooler connection string (direct connection doesn't work from GitHub's IPv4-only runners without the paid IPv4 add-on) |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | Cloudflare R2 access, scoped to just the backups bucket |
| `BACKUP_ENCRYPTION_PASSPHRASE` | Symmetric encryption key. **If lost, all existing backups become permanently unreadable** — it's saved in the team password manager, not recoverable any other way |
| `RESTORE_TEST_DB_URL` | Session-pooler string for whatever scratch project a restore drill targets — update this before each drill if using a fresh scratch project |

## Known Limitations

- **Storage bucket file contents are not backed up.** This system backs up database rows only — `storage.objects` *metadata* would be included in a `public`/`auth` dump only if we also dumped `storage` (we don't, since that schema isn't ours to restore into on another project). The actual pet photo/document files living in the `uploads` R2-backed bucket have no independent backup. Flagging as a gap, not solving it here.
- **`observation_types`/`observation_options` need ID-stable handling.** These are seeded by migrations 0014/0026 using `gen_random_uuid()` with no fixed IDs, so replaying migrations generates different IDs each time. Real `observations` rows reference the *original* production IDs. The backup includes these tables specifically so their stable IDs travel with the data; a restore must clear the migrations' freshly-seeded rows before restoring the backup's rows (the restore-test script does this — replicate the same order for a real recovery).
- **The three excluded migrations mean a from-scratch rebuild cannot replay the exact historical data-recovery steps.** If those migrations' one-off INSERTs are ever needed again, they'd need manual review against whatever's actually in the backup at restore time.
- **No automated recurring restore drills yet.** `db-restore-test.yml` is manual-trigger only. Recommend running it against a fresh scratch project periodically (quarterly is reasonable pre-launch) to catch schema drift between migrations and the restore assumptions above before a real incident, not during one.

## Real Disaster Recovery Runbook

If the production Supabase project/account is genuinely lost:

1. Create a new Supabase project.
2. Set its connection string as `RESTORE_TEST_DB_URL` (or run the equivalent steps manually with `psql`/`pg_restore`).
3. Run `db-restore-test.yml` against it — this rebuilds schema from migrations and restores the newest backup's data.
4. Manually review whether the three skipped migrations' historical data needs re-applying by hand, cross-checked against what actually landed from the backup.
5. Repoint the app's `VITE_SUPABASE_URL`/anon key (in the Cloudflare Pages build config) at the new project.
6. Storage bucket files (pet photos, documents) are **not** covered by this process — see Known Limitations.

## Acceptance Criteria

- [x] Nightly automated backup, encrypted, stored independently of the Supabase account.
- [x] 30-day retention with automatic cleanup of older backups.
- [x] Backup verified to actually upload (confirmed non-zero file size in R2).
- [x] Restore verified end-to-end against a scratch project — schema rebuilt from migrations, real data confirmed present in Table Editor afterward.
- [x] Documented restore runbook for a real incident.
