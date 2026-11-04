#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT=/opt/iepf
mkdir -p "$ROOT/shared/backups"
exec 8>"$ROOT/shared/backup.lock"
flock -w 1800 8
FILE="$ROOT/shared/backups/iepf-$(date -u +%Y%m%dT%H%M%S)-$$.sql.gz"
trap 'rm -f "$FILE.partial"' EXIT
# pipefail is essential: never accept an empty gzip after a failed pg_dump.
docker exec postgres sh -ec 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl' | gzip -c > "$FILE.partial"
gzip -t "$FILE.partial"
mv "$FILE.partial" "$FILE"
# Keep existing offsite destination. The deploy must stop if upload fails.
rclone copy "$FILE" gdrive:postgres-backups
rclone delete gdrive:postgres-backups --min-age 30d
find "$ROOT/shared/backups" -type f -name '*.sql.gz' -mtime +7 -delete
echo 'Backup complete'
