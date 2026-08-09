#!/usr/bin/env bash
# Copies every file in production's Supabase Storage "uploads" bucket
# (pet photos, vaccine record scans, bloodwork reports) into a dedicated
# R2 bucket, independent of the Supabase account.
#
# Additive only (no --delete): deleting a file from the app must never
# delete its backup copy, since the backup exists specifically to survive
# an accidental delete, not just a lost bucket. This means the R2 copy
# grows over time and nothing here prunes it — see spec 0049's Non-Goals.
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

echo "== Uploading to R2 (additive only, no deletes) =="
AWS_ACCESS_KEY_ID="$R2_STORAGE_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_STORAGE_SECRET_ACCESS_KEY" \
aws s3 sync "$WORKDIR" "s3://${R2_STORAGE_BUCKET_NAME}/uploads" \
  --endpoint-url "$R2_ENDPOINT" --region auto

echo "== Done =="
