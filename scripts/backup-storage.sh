#!/usr/bin/env bash
# Copies every file in production's Supabase Storage "uploads" bucket
# (pet photos, vaccine record scans, bloodwork reports) into a dedicated
# R2 bucket, independent of the Supabase account.
#
# Deleting a file from the app never deletes its backup copy straight
# away: the backup exists to survive an accidental delete, not just a lost
# bucket. Instead (spec 0075), a backup copy whose file is no longer in
# Supabase is MOVED from uploads/ to deleted/uploads/ in R2. An R2
# lifecycle rule on the deleted/ prefix removes it 30 days later, which
# is what the Privacy Policy promises ("backups ... deleted automatically
# within 30 days"). To restore a recently deleted file, look under
# deleted/uploads/.
#
# Safety stop: if Supabase lists no files at all, or the move would touch
# more than half of the backup (and more than 50 files), the script exits
# with an error before moving anything, so a failed or partial listing
# can never empty the backup. Set ALLOW_LARGE_PRUNE=1 (the workflow's
# manual-run input) to allow a genuinely large clean-up once.
#
# Required env vars: SUPABASE_STORAGE_S3_ACCESS_KEY_ID,
# SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY, SUPABASE_STORAGE_S3_ENDPOINT,
# R2_ACCOUNT_ID, R2_STORAGE_ACCESS_KEY_ID, R2_STORAGE_SECRET_ACCESS_KEY,
# R2_STORAGE_BUCKET_NAME
set -euo pipefail

R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# aws s3 sync only accepts one pair of credentials per invocation, so a
# direct source-to-destination sync across two different S3-compatible
# providers isn't possible in one command. Instead: sync source -> local
# tmp dir (Supabase creds), then local tmp dir -> R2 (R2 creds).
WORKDIR=$(mktemp -d)
cleanup() {
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

echo "== Downloading from Supabase Storage =="
AWS_ACCESS_KEY_ID="$SUPABASE_STORAGE_S3_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY" \
aws s3 sync "s3://uploads" "$WORKDIR" \
  --endpoint-url "$SUPABASE_STORAGE_S3_ENDPOINT" --region auto

echo "== Uploading to R2 (additive) =="
AWS_ACCESS_KEY_ID="$R2_STORAGE_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_STORAGE_SECRET_ACCESS_KEY" \
aws s3 sync "$WORKDIR" "s3://${R2_STORAGE_BUCKET_NAME}/uploads" \
  --endpoint-url "$R2_ENDPOINT" --region auto

echo "== Moving backup copies of deleted files to deleted/ =="
LIVE_KEYS="$WORKDIR.live"
BACKUP_KEYS="$WORKDIR.backup"
(cd "$WORKDIR" && find . -type f | sed 's|^\./|uploads/|') | LC_ALL=C sort > "$LIVE_KEYS"
AWS_ACCESS_KEY_ID="$R2_STORAGE_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_STORAGE_SECRET_ACCESS_KEY" \
aws s3api list-objects-v2 --bucket "$R2_STORAGE_BUCKET_NAME" --prefix uploads/ \
  --endpoint-url "$R2_ENDPOINT" --region auto --output json \
  | jq -r '.Contents[]?.Key' | LC_ALL=C sort > "$BACKUP_KEYS"
trap 'cleanup; rm -f "$LIVE_KEYS" "$BACKUP_KEYS"' EXIT

LIVE_COUNT=$(wc -l < "$LIVE_KEYS")
BACKUP_COUNT=$(wc -l < "$BACKUP_KEYS")
TO_MOVE=$(LC_ALL=C comm -13 "$LIVE_KEYS" "$BACKUP_KEYS")
MOVE_COUNT=$(printf '%s' "$TO_MOVE" | grep -c . || true)
echo "live files: $LIVE_COUNT, backup copies: $BACKUP_COUNT, to move: $MOVE_COUNT"

if [ "$LIVE_COUNT" -eq 0 ]; then
  echo "SAFETY STOP: Supabase listed no files. Nothing moved." >&2
  exit 1
fi
if [ "$MOVE_COUNT" -gt 50 ] && [ $((MOVE_COUNT * 2)) -gt "$BACKUP_COUNT" ] && [ "${ALLOW_LARGE_PRUNE:-0}" != "1" ]; then
  echo "SAFETY STOP: would move $MOVE_COUNT of $BACKUP_COUNT backup copies. Nothing moved." >&2
  echo "If that is really right, re-run the workflow by hand with allow_large_prune." >&2
  exit 1
fi

printf '%s\n' "$TO_MOVE" | while IFS= read -r key; do
  [ -z "$key" ] && continue
  AWS_ACCESS_KEY_ID="$R2_STORAGE_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$R2_STORAGE_SECRET_ACCESS_KEY" \
  aws s3 mv "s3://${R2_STORAGE_BUCKET_NAME}/${key}" "s3://${R2_STORAGE_BUCKET_NAME}/deleted/${key}" \
    --endpoint-url "$R2_ENDPOINT" --region auto --only-show-errors
done

echo "== Done =="
