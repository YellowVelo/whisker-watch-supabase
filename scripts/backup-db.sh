#!/usr/bin/env bash
# Dumps the production Postgres database, encrypts it, uploads it to R2,
# and deletes backups older than RETENTION_DAYS.
#
# Required env vars: SUPABASE_DB_URL, BACKUP_ENCRYPTION_PASSPHRASE,
# AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_BUCKET_NAME
set -euo pipefail

RETENTION_DAYS=30
TIMESTAMP=$(date -u +%Y%m%d-%H%M%S)
DUMP_FILE="whisker-watch-${TIMESTAMP}.dump"
ENCRYPTED_FILE="${DUMP_FILE}.gpg"
ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

cleanup() {
  rm -f "$DUMP_FILE" "$ENCRYPTED_FILE"
}
trap cleanup EXIT

echo "== Dumping database =="
pg_dump "$SUPABASE_DB_URL" -Fc -f "$DUMP_FILE"

echo "== Encrypting dump =="
gpg --batch --yes --passphrase "$BACKUP_ENCRYPTION_PASSPHRASE" \
  --symmetric --cipher-algo AES256 \
  --output "$ENCRYPTED_FILE" "$DUMP_FILE"
rm -f "$DUMP_FILE"

echo "== Uploading to R2 =="
aws s3 cp "$ENCRYPTED_FILE" "s3://${R2_BUCKET_NAME}/backups/${ENCRYPTED_FILE}" \
  --endpoint-url "$ENDPOINT" --region auto

echo "== Applying ${RETENTION_DAYS}-day retention =="
CUTOFF=$(date -u -d "${RETENTION_DAYS} days ago" +%Y%m%d)

KEYS=$(aws s3api list-objects-v2 \
  --endpoint-url "$ENDPOINT" --region auto \
  --bucket "$R2_BUCKET_NAME" --prefix "backups/whisker-watch-" \
  --query 'Contents[].Key' --output text 2>/dev/null || true)

if [ -n "$KEYS" ] && [ "$KEYS" != "None" ]; then
  echo "$KEYS" | tr '\t' '\n' | while read -r KEY; do
    [ -z "$KEY" ] && continue
    FILE_DATE=$(echo "$KEY" | sed -E 's#.*whisker-watch-([0-9]{8})-.*#\1#')
    if [[ "$FILE_DATE" =~ ^[0-9]{8}$ ]] && [ "$FILE_DATE" -lt "$CUTOFF" ]; then
      echo "Deleting expired backup: $KEY"
      aws s3 rm "s3://${R2_BUCKET_NAME}/${KEY}" --endpoint-url "$ENDPOINT" --region auto
    fi
  done
fi

echo "== Done: ${ENCRYPTED_FILE} =="
