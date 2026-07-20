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

echo "== Restoring into scratch project =="
# --no-owner/--no-acl: source roles don't exist in the scratch project.
# --clean --if-exists: safe to rerun against the same scratch project repeatedly.
# Extension-related "already exists" warnings on a fresh project are expected
# and non-fatal (Supabase pre-installs several extensions).
pg_restore --no-owner --no-acl --clean --if-exists \
  -d "$RESTORE_TEST_DB_URL" "$DUMP_FILE"

echo "== Restore test complete =="
