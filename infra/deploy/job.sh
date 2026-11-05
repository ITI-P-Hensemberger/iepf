#!/usr/bin/env bash
set -euo pipefail
ROOT=/opt/iepf
# Jobs and deploys share a lock: never run against a partially migrated schema.
exec 9>"$ROOT/shared/deploy.lock"
flock -w 1800 9
RELEASE=$(readlink -f "$ROOT/current")
ARGS=()
case "${1:-}" in
  cleanup-data) TASK=cleanup:data ;;
  generate-lessons) TASK=generate:lessons ;;
  remind-feedback) TASK=remind:feedback ;;
  remind-lessons-today) TASK=remind:lessons; ARGS=(-- --today) ;;
  remind-lessons-tomorrow) TASK=remind:lessons; ARGS=(-- --tomorrow) ;;
  *) echo 'Unknown job' >&2; exit 1 ;;
esac
docker compose --env-file "$ROOT/shared/host.env" --env-file "$RELEASE/images.env" -f "$RELEASE/compose.yaml" run --rm --no-deps maintenance npm run "$TASK" "${ARGS[@]}"
