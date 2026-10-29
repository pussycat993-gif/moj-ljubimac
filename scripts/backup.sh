#!/usr/bin/env bash
# Nightly database backup (TC ADR-13 Mechanics, §8; RISK-13). Run by .github/workflows/nightly-backup.yml.
#   1. pg_dump (custom format) of the production database at SUPABASE_DB_URL;
#   2. upload to the separate backup bucket R2_BACKUP_BUCKET with the AWS CLI over the R2 S3-compatible
#      endpoint https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com (region auto) as db/moj-ljubimac-<UTC stamp>.dump;
#   3. delete backup objects older than 14 days.
# Inputs (GitHub Actions secrets, TC §8.1): SUPABASE_DB_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
# R2_SECRET_ACCESS_KEY, R2_BACKUP_BUCKET. PG_DUMP overrides the pg_dump binary (its major version must not be
# lower than the database's).
set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is not set}"
: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is not set}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is not set}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is not set}"
: "${R2_BACKUP_BUCKET:?R2_BACKUP_BUCKET is not set}"

RETENTION_DAYS=14
PG_DUMP="${PG_DUMP:-pg_dump}"
ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION=auto
# R2 does not accept every default checksum of newer AWS CLI versions; send checksums only when required.
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
key="db/moj-ljubimac-${stamp}.dump"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
dump="${workdir}/moj-ljubimac-${stamp}.dump"

echo "pg_dump: $("$PG_DUMP" --version)"
"$PG_DUMP" --format=custom --dbname="$SUPABASE_DB_URL" --file="$dump"
echo "dump size: $(wc -c < "$dump") bytes"

aws s3 cp "$dump" "s3://${R2_BACKUP_BUCKET}/${key}" --endpoint-url "$ENDPOINT" --only-show-errors
echo "uploaded s3://${R2_BACKUP_BUCKET}/${key}"

# Delete backup objects older than 14 days (LastModified before the cutoff).
cutoff="$(date -u -d "${RETENTION_DAYS} days ago" +%Y-%m-%dT%H:%M:%SZ)"
old_keys="$(aws s3api list-objects-v2 \
  --bucket "$R2_BACKUP_BUCKET" \
  --prefix db/ \
  --endpoint-url "$ENDPOINT" \
  --query "Contents[?LastModified<'${cutoff}'].Key" \
  --output text)"

deleted=0
for old in $old_keys; do
  [ "$old" = "None" ] && continue
  aws s3api delete-object --bucket "$R2_BACKUP_BUCKET" --key "$old" --endpoint-url "$ENDPOINT" > /dev/null
  echo "deleted ${old}"
  deleted=$((deleted + 1))
done
echo "backup done: ${key}; ${deleted} object(s) older than ${RETENTION_DAYS} days deleted"
