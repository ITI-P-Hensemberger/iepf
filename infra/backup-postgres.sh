#!/bin/sh
set -eu

# === CONFIG ===
PROJECT_DIR="/opt/infra/iepf"
CONTAINER="postgres"
RCLONE_REMOTE="gdrive:postgres-backups"
RETENTION_DAYS=30
LOCAL_TMP_DIR="/tmp/postgres-backups"

# === RUNTIME ===
TS="$(date +"%Y-%m-%d_%H-%M-%S")"
HOSTNAME_SHORT="$(hostname -s || echo vps)"
OUT_FILE="${LOCAL_TMP_DIR}/iepf-postgres_${HOSTNAME_SHORT}_${TS}.sql.gz"

mkdir -p "$LOCAL_TMP_DIR"

# Verifica container in esecuzione
if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "ERROR: container '$CONTAINER' non in esecuzione"
  exit 1
fi

# Dump del DB indicato da POSTGRES_DB/POSTGRES_USER (dentro container), compressione gzip
docker exec -T "$CONTAINER" sh -lc '
  set -eu
  : "${POSTGRES_USER:?missing POSTGRES_USER}"
  : "${POSTGRES_DB:?missing POSTGRES_DB}"
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl
' | gzip -c > "$OUT_FILE"

# Upload su Google Drive
rclone copy "$OUT_FILE" "$RCLONE_REMOTE"

# Cleanup locale (tieni solo ultimi 7 file locali, per sicurezza)
ls -1t "${LOCAL_TMP_DIR}"/*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm -f

# Retention su Drive
rclone delete "$RCLONE_REMOTE" --min-age "${RETENTION_DAYS}d"

echo "OK: backup creato e caricato -> $OUT_FILE"