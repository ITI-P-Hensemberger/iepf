#!/usr/bin/env bash
# Monthly: loads the newest local backup into a throwaway PostgreSQL, with no network, and
# checks that the data is there. A backup that cannot be restored is found here, not on the
# day it is needed.
set -Eeuo pipefail
ROOT=/opt/iepf
NAME=iepf-restore-test
LATEST=$(find "$ROOT/shared/backups" -maxdepth 1 -name 'iepf-[0-9]*.sql.gz.gpg' -printf '%T@ %p\n' | sort -rn | head -1 | cut -d' ' -f2-)
[[ -n "$LATEST" ]] || { echo 'Restore test: no backup found' >&2; exit 1; }
IMAGE=$(sed -n 's/^POSTGRES_IMAGE=//p' "$ROOT/shared/host.env")
docker rm -f "$NAME" >/dev/null 2>&1 || true
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$NAME" --network none -e POSTGRES_PASSWORD=restore-test -e POSTGRES_DB=restore "$IMAGE" >/dev/null
# The image starts a temporary server to initialise, then the real one: wait for the second.
for _ in $(seq 90); do
  [[ $(docker logs "$NAME" 2>&1 | grep -c 'ready to accept connections') -ge 2 ]] && break
  sleep 2
done
gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$ROOT/shared/backup.key" -d "$LATEST" | gunzip -c | docker exec -i "$NAME" psql -U postgres -d restore -v ON_ERROR_STOP=1 -q >/dev/null
USERS=$(docker exec "$NAME" psql -U postgres -d restore -tAc 'select count(*) from users')
[[ "$USERS" =~ ^[0-9]+$ && "$USERS" -gt 0 ]] || { echo "Restore test: no users in $(basename "$LATEST")" >&2; exit 1; }
echo "Restore test passed: $(basename "$LATEST"), $USERS users"
