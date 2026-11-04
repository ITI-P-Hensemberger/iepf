#!/usr/bin/env bash
# Run once on the existing VPS. Prepares configuration; does not restart anything.
set -Eeuo pipefail
umask 077
ROOT=/opt/iepf
LEGACY=${1:-/opt/infra/iepf}
[[ ! -e "$ROOT/current" && ! -e "$ROOT/shared/host.env" ]] || { echo 'Already initialized; refusing to overwrite configuration' >&2; exit 1; }
command -v flock >/dev/null
command -v python3 >/dev/null
command -v rclone >/dev/null
rclone listremotes | grep -qx 'gdrive:'
docker compose version
for file in .env.backend .env.postgres; do test -s "$LEGACY/$file"; done
# Resolve the exact running image and bind paths. Never resolve mutable tags remotely.
inspect() { docker inspect "$1" --format "$2"; }
digest() {
  local image
  image=$(inspect "$1" '{{.Image}}')
  docker image inspect "$image" --format '{{index .RepoDigests 0}}'
}
PG_DIR=$(inspect postgres '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Source}}{{end}}{{end}}')
ACME_DIR=$(inspect traefik '{{range .Mounts}}{{if eq .Destination "/letsencrypt"}}{{.Source}}{{end}}{{end}}')
PROJECT=$(inspect postgres '{{index .Config.Labels "com.docker.compose.project"}}')
[[ -d "$PG_DIR" && -s "$ACME_DIR/acme.json" && "$PROJECT" =~ ^[a-z0-9_-]+$ ]]
# Seed the currently deployed images, including their original registry namespace.
# Package ownership may differ from repository ownership during a transfer.
BACKEND=$(digest "${PROJECT}-backend-1")
TOOLS_REFERENCE=${2:-"${BACKEND%@*}:migrate"}
TOOLS=$(docker image inspect "$TOOLS_REFERENCE" --format '{{index .RepoDigests 0}}')
install -d -m 700 "$ROOT" "$ROOT/shared" "$ROOT/releases"
cp "$LEGACY/.env.backend" "$ROOT/shared/backend.env"
cp "$LEGACY/.env.postgres" "$ROOT/shared/postgres.env"
printf 'DEPLOY_ROOT=%s\nCOMPOSE_PROJECT_NAME=%s\nPOSTGRES_DATA_DIR=%s\nACME_DIR=%s\nPOSTGRES_IMAGE=%s\nTRAEFIK_IMAGE=%s\n' \
  "$ROOT" "$PROJECT" "$PG_DIR" "$ACME_DIR" "$(digest postgres)" "$(digest traefik)" > "$ROOT/shared/host.env"
printf 'FRONTEND_IMAGE=%s\nBACKEND_IMAGE=%s\nTOOLS_IMAGE=%s\n' \
  "$(digest "${PROJECT}-frontend-1")" "$BACKEND" "$TOOLS" > "$ROOT/shared/images.env"
chmod 600 "$ROOT/shared/"*.env
crontab -l > "$ROOT/shared/crontab.before-migration"
echo 'Configuration prepared. Services and existing cron are unchanged.'
