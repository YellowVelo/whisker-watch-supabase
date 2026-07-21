#!/usr/bin/env bash
# Downloads an encrypted backup from R2, decrypts it, and restores it into
# a scratch database for verification. Never point this at production.
#
# Required env vars: RESTORE_TEST_DB_URL, BACKUP_ENCRYPTION_PASSPHRASE,
# AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_BUCKET_NAME
# Optional env var: BACKUP_KEY (specific R2 object key; defaults to newest)
set -euo pipefail

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

cleanup() {
  rm -f "$ENCRYPTED_FILE" "$DUMP_FILE"
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

echo "== Restoring data into scratch project =="
# --data-only: only public/auth data, matching how backup-db.sh dumps it.
# --no-owner/--no-acl: source roles don't exist in the scratch project.
pg_restore --data-only --no-owner --no-acl \
  -d "$RESTORE_TEST_DB_URL" "$DUMP_FILE"

echo "== Restore test complete =="
