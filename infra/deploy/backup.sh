#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT=/opt/iepf
mkdir -p "$ROOT/shared/backups"
exec 8>"$ROOT/shared/backup.lock"
flock -w 1800 8
STAMP="$(date -u +%Y%m%dT%H%M%S)-$$"
FILE="$ROOT/shared/backups/iepf-$STAMP.sql.gz.gpg"
CONFIG="$ROOT/shared/backups/iepf-config-$STAMP.tar.gz.gpg"
trap 'rm -f "$FILE.partial" "$CONFIG.partial"' EXIT
# Dump and configuration are encrypted with the passphrase in shared/backup.key, which is also
# kept outside the server: the dump holds students' data and goes to Drive (see README).
[[ -s "$ROOT/shared/backup.key" ]] || { echo 'Missing shared/backup.key' >&2; exit 1; }
encrypt() { gpg --batch --yes --pinentry-mode loopback --symmetric --cipher-algo AES256 --passphrase-file "$ROOT/shared/backup.key" -o "$1"; }
# pipefail is essential: never accept an empty gzip after a failed pg_dump.
docker exec postgres sh -ec 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl' | gzip -c | encrypt "$FILE.partial"
gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$ROOT/shared/backup.key" -d "$FILE.partial" | gzip -t
mv "$FILE.partial" "$FILE"
# The server's configuration and secrets (VAPID keys, SMTP, JWT), which the database dump lacks.
tar -C "$ROOT/shared" -czf - host.env backend.env postgres.env images.env \
  | encrypt "$CONFIG.partial"
mv "$CONFIG.partial" "$CONFIG"
# Keep existing offsite destination. The deploy must stop if upload fails.
rclone copy "$FILE" gdrive:postgres-backups
rclone copy "$CONFIG" gdrive:postgres-backups/config
rclone delete gdrive:postgres-backups --min-age 30d
find "$ROOT/shared/backups" -type f \( -name '*.sql.gz' -o -name '*.gpg' \) -mtime +7 -delete
# A missed ping is what reveals a run that never started, which OnFailure cannot see.
HEARTBEAT=$(grep -m1 '^BACKUP_HEARTBEAT_URL=' "$ROOT/shared/host.env" | cut -d= -f2- || true)
if [[ -n "$HEARTBEAT" ]]; then
  curl --fail --silent --show-error --retry 3 --retry-delay 5 --max-time 20 "$HEARTBEAT" -o /dev/null || echo 'Backup heartbeat failed' >&2
fi
echo 'Backup complete'
