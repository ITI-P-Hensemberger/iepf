#!/bin/bash
set -e

# CONFIG
SOURCE="/opt/infra/iepf/postgres-data"
TMP="/tmp/postgres-backup"
DATE=$(date +"%Y-%m-%d_%H-%M")
BACKUP_NAME="postgres-data-$DATE.tar.gz"
REMOTE="gdrive:postgres-backups"

mkdir -p "$TMP"

# crea archivio
tar -czf "$TMP/$BACKUP_NAME" -C "$SOURCE" .

# upload su Google Drive
rclone copy "$TMP/$BACKUP_NAME" "$REMOTE"

# cleanup locale
rm -f "$TMP/$BACKUP_NAME"

# retention: cancella backup più vecchi di 14 giorni
rclone delete "$REMOTE" --min-age 14d