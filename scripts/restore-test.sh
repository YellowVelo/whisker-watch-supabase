#!/usr/bin/env bash
# Downloads an encrypted backup from R2, decrypts it, and restores it into
# a scratch database for verification. Never point this at production.
#
# Required env vars: RESTORE_TEST_DB_URL, RESTORE_TEST_ALLOW_TARGET,
# BACKUP_ENCRYPTION_PASSPHRASE, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
# R2_ACCOUNT_ID, R2_BUCKET_NAME
# Optional env var: BACKUP_KEY (specific R2 object key; defaults to newest)
set -euo pipefail

# Same-target guard: this script runs DROP SCHEMA public CASCADE and wipes
# auth.users on whatever RESTORE_TEST_DB_URL points at. That's safe and
# intentional against the dedicated wysker-watch-restore-scratch project,
# but this workflow also runs unattended on a quarterly schedule now (see
# spec 0048) with nobody watching to catch a misconfigured target before it
# runs. RESTORE_TEST_ALLOW_TARGET must be the scratch project's ref and
# must appear in the connection string, or this refuses to touch anything.
if [ -z "${RESTORE_TEST_ALLOW_TARGET:-}" ]; then
  echo "RESTORE_TEST_ALLOW_TARGET is not set — refusing to run a destructive restore against an unverified target." >&2
  exit 1
fi
case "$RESTORE_TEST_DB_URL" in
  *"$RESTORE_TEST_ALLOW_TARGET"*) ;;
  *)
    echo "RESTORE_TEST_DB_URL does not reference the expected scratch project ($RESTORE_TEST_ALLOW_TARGET) — refusing to run. This guard exists so a misconfigured target fails loudly instead of silently wiping the wrong database." >&2
    exit 1
    ;;
esac

ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

if [ -z "${BACKUP_KEY:-}" ]; then
  echo "== Finding latest backup =="
  BACKUP_KEY=$(aws s3api list-objects-v2 \
    --endpoint-url "$ENDPOINT" --region auto \
    --bucket "$R2_BUCKET_NAME" --prefix "backups/whisker-watch-" \
    --query 'sort_by(Contents, &LastModified)[-1].Key' --output text)
fi

if [ -z "$BACKUP_KEY" ] || [ "$BACKUP_KEY" = "None" ]; then
  echo "No backup found in R2." >&2
  exit 1
fi

echo "Restoring from: $BACKUP_KEY"
ENCRYPTED_FILE=$(basename "$BACKUP_KEY")
DUMP_FILE="${ENCRYPTED_FILE%.gpg}"

RESTORE_LIST="${DUMP_FILE}.list"

cleanup() {
  rm -f "$ENCRYPTED_FILE" "$DUMP_FILE" "$RESTORE_LIST" "$RESTORE_LIST.full"
}
trap cleanup EXIT

echo "== Downloading =="
aws s3 cp "s3://${R2_BUCKET_NAME}/${BACKUP_KEY}" "$ENCRYPTED_FILE" \
  --endpoint-url "$ENDPOINT" --region auto

echo "== Decrypting =="
gpg --batch --yes --passphrase "$BACKUP_ENCRYPTION_PASSPHRASE" \
  --decrypt --output "$DUMP_FILE" "$ENCRYPTED_FILE"

echo "== Resetting public schema =="
# Makes this drill safely rerunnable against the same scratch project:
# "postgres" owns public (unlike auth/storage/realtime), so this is a
# clean drop/recreate with no ownership errors.
psql "$RESTORE_TEST_DB_URL" -v ON_ERROR_STOP=1 -q -c "
  DROP SCHEMA public CASCADE;
  CREATE SCHEMA public;
  GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
"

# storage.objects isn't ours to drop/recreate, but the policies migration
# 0002 creates on it are ours (owned by postgres) and CREATE POLICY has no
# IF NOT EXISTS, so clear any leftovers from a prior drill run.
psql "$RESTORE_TEST_DB_URL" -v ON_ERROR_STOP=1 -q -c "
  DROP POLICY IF EXISTS uploads_public_read ON storage.objects;
  DROP POLICY IF EXISTS uploads_insert_own_folder ON storage.objects;
  DROP POLICY IF EXISTS uploads_update_own_folder ON storage.objects;
  DROP POLICY IF EXISTS uploads_delete_own_folder ON storage.objects;
"

# auth data persists across drill runs (public reset doesn't touch it),
# so previously-restored users would collide with the same rows in this
# run's backup. auth's own FK cascades clear identities/sessions/etc.
psql "$RESTORE_TEST_DB_URL" -v ON_ERROR_STOP=1 -q -c "DELETE FROM auth.users;"

# Three migrations refuse to run until a deploy marker says that
# environment's frontend is live: 0055 (spec 0071), 0061 (spec 0081) and
# 0063 (spec 0085). The scratch database has no frontend to wait for, so
# mark all three before replaying. Same snippet as those migrations' headers. The private schema
# isn't reset above, so each line is safe to rerun on a later drill.
echo "== Setting deploy markers for gated migrations =="
psql "$RESTORE_TEST_DB_URL" -v ON_ERROR_STOP=1 -q -c "
  CREATE SCHEMA IF NOT EXISTS private;
  CREATE TABLE IF NOT EXISTS private.deploy_markers (
    key text PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  REVOKE ALL ON SCHEMA private FROM anon, authenticated;
  REVOKE ALL ON private.deploy_markers FROM anon, authenticated;
  INSERT INTO private.deploy_markers (key)
  VALUES ('spec_0071_frontend_live'), ('spec_0081_frontend_live'),
         ('spec_0085_frontend_live')
  ON CONFLICT (key) DO NOTHING;
"

echo "== Rebuilding schema from migrations =="
# A real disaster recovery starts from an empty Supabase project: the
# schema comes from replaying supabase/migrations/, not from the backup.
# Three migrations (0003, 0007, 0027) are one-off historical data
# INSERTs hardcoded to specific real pet/user rows, not schema — they
# either conflict with or depend on data that only exists in
# production, so they're skipped here.
for MIGRATION in supabase/migrations/*.sql; do
  case "$(basename "$MIGRATION")" in
    0003_real_data_import.sql|0007_restore_real_data_new_account.sql|0027_migrate_symptom_logs_to_checkins.sql)
      echo "Skipping $MIGRATION (historical data recovery, not schema)"
      continue
      ;;
  esac
  echo "Applying $MIGRATION"
  psql "$RESTORE_TEST_DB_URL" -v ON_ERROR_STOP=1 -q -f "$MIGRATION"
done

# observation_types/observation_options seeded by migrations 0014/0026
# (just applied, above) use gen_random_uuid() with no fixed IDs - clear
# those so the backup's rows (with the real, stable production IDs that
# observations rows reference) are what actually gets restored.
psql "$RESTORE_TEST_DB_URL" -v ON_ERROR_STOP=1 -q -c "
  DELETE FROM public.observation_options;
  DELETE FROM public.observation_types;
"

# Restoring auth.users data fires the on_auth_user_created trigger (just
# created by migration 0001, above), which would insert a stub
# public.profiles row and collide with the real profiles row in the same
# backup. Temporarily no-op the function around the restore (postgres
# owns it, unlike auth.users itself), then restore its real behavior after.
psql "$RESTORE_TEST_DB_URL" -v ON_ERROR_STOP=1 -q -c "
  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger AS \$\$
  BEGIN
    RETURN NEW;
  END;
  \$\$ LANGUAGE plpgsql SECURITY DEFINER;
"

echo "== Building restore list =="
# Migration 0061 (spec 0081) drops symptom_logs, wellness_scores and
# food_logs, so the schema rebuilt above no longer has them. A backup taken
# before 0061 ran on that project still holds their rows, and restoring
# those into missing tables makes pg_restore exit non-zero. Leave just those
# three TABLE DATA entries out of the restore list; everything else in the
# backup is restored as before. A newer backup has no such entries, so the
# filter then removes nothing. TOC lines look like
#   "4012; 0 17021 TABLE DATA public food_logs postgres".
# (grep exits 1 only if every line was filtered out, which can't happen
# with a real backup; || true keeps set -e from treating that as fatal.)
pg_restore -l "$DUMP_FILE" > "$RESTORE_LIST.full"
grep -vE '^[0-9]+; [0-9]+ [0-9]+ TABLE DATA public (symptom_logs|wellness_scores|food_logs)( |$)' \
  "$RESTORE_LIST.full" > "$RESTORE_LIST" || true
SKIPPED=$(( $(wc -l < "$RESTORE_LIST.full") - $(wc -l < "$RESTORE_LIST") ))
rm -f "$RESTORE_LIST.full"
echo "Left out $SKIPPED retired-table data entries (migration 0061)"

echo "== Restoring data into scratch project =="
# --data-only: only public/auth data, matching how backup-db.sh dumps it.
# --no-owner/--no-acl: source roles don't exist in the scratch project.
# -L: restore only the entries in the list built above.
# Migration 0063 (spec 0085) adds the check constraint pet_sits_dates_sane.
# Any backup taken before prod's bad sit was fixed still contains that sit,
# so restoring its pet_sits data fails this rule (and its child tables,
# pet_sit_logs and pet_sitter_access, then fail their foreign keys).
# Backups are kept 30 days, so this can only happen with a backup from that
# window; the risk was accepted (Lynn, 2026-11-26), not engineered around.
# If a restore or drill fails on pet_sits_dates_sane:
#   alter table public.pet_sits drop constraint if exists pet_sits_dates_sane;
#   -- run the restore / data load again
#   -- fix (update ... set start_date = ..., end_date = ...) or delete the bad sit(s)
#   alter table public.pet_sits add constraint pet_sits_dates_sane check (
#     start_date between '2000-01-01' and '2100-12-31'
#     and end_date between '2000-01-01' and '2100-12-31'
#     and end_date >= start_date
#     and end_date - start_date <= 30
#   );
pg_restore --data-only --no-owner --no-acl \
  -L "$RESTORE_LIST" \
  -d "$RESTORE_TEST_DB_URL" "$DUMP_FILE"

echo "== Reinstating handle_new_user =="
psql "$RESTORE_TEST_DB_URL" -v ON_ERROR_STOP=1 -q -c "
  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger AS \$\$
  BEGIN
    INSERT INTO public.profiles (id, email)
    VALUES (NEW.id, NEW.email);
    RETURN NEW;
  END;
  \$\$ LANGUAGE plpgsql SECURITY DEFINER;
"

echo "== Verifying restored data (row-count sanity check) =="
# Non-empty check, not a fixed-count match: catches a restore that
# completed without error but silently restored nothing. Doesn't compare
# against a prior run's counts, so normal data growth never trips it.
for TABLE in profiles pets daily_check_ins; do
  COUNT=$(psql "$RESTORE_TEST_DB_URL" -v ON_ERROR_STOP=1 -tA -c "SELECT count(*) FROM public.$TABLE;")
  echo "public.$TABLE: $COUNT rows"
  if [ "$COUNT" -eq 0 ]; then
    echo "public.$TABLE is empty after restore — treating this as a failed drill." >&2
    exit 1
  fi
done

echo "== Restore test complete =="
