#!/usr/bin/env bash
# Executed from a release bundle on the VPS, never from a Git checkout.
set -Eeuo pipefail
umask 077
ROOT=/opt/iepf
BUNDLE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
mkdir -p "$ROOT/releases" "$ROOT/shared"
exec 9>"$ROOT/shared/deploy.lock"
flock -w 1800 9

# Parse untrusted dispatch data as data, never as shell code.
mapfile -t REQUEST < <(python3 - "$BUNDLE/request.json" <<'PY'
import json, re, sys
r=json.load(open(sys.argv[1]))
component=r.get('component','infra')
if component not in ('frontend','backend','infra','rollback'): raise SystemExit('Invalid component')
for key, repo in [('image', component), ('tools_image','backend')]:
    v=r.get(key,'')
    if v and not re.fullmatch(r'ghcr\.io/iti-p-hensemberger/iepf-'+repo+r'@sha256:[0-9a-f]{64}',v): raise SystemExit('Invalid '+key)
if component in ('frontend','backend') and not r.get('image'): raise SystemExit('Missing image')
if component=='backend' and not r.get('tools_image'): raise SystemExit('Missing maintenance image')
release=r.get('release','')
if component=='rollback' and not re.fullmatch(r'[0-9]+-[0-9]+', release): raise SystemExit('Invalid rollback release')
print('valid')
for k in ('component','image','tools_image','release'): print(r.get(k,''))
PY
)
[[ ${REQUEST[0]:-} == valid ]] || { echo 'Invalid release request' >&2; exit 1; }
COMPONENT=${REQUEST[1]}
PREVIOUS=''
if [[ -L "$ROOT/current" && -d "$ROOT/current" ]]; then
  PREVIOUS=$(readlink -f "$ROOT/current")
fi
for file in host.env backend.env postgres.env; do
  [[ -s "$ROOT/shared/$file" ]] || { echo "Missing shared/$file" >&2; exit 1; }
done
if [[ "$COMPONENT" == rollback ]]; then
  RELEASE="$ROOT/releases/${REQUEST[4]}"
  [[ -s "$RELEASE/images.env" && -s "$RELEASE/compose.yaml" ]] || exit 1
else
  ID=$(cat "$BUNDLE/release-id")
  [[ "$ID" =~ ^[0-9]+-[0-9]+$ ]] || exit 1
  RELEASE="$ROOT/releases/$ID"
  [[ ! -e "$RELEASE" ]] || { echo 'Release already exists' >&2; exit 1; }
  mkdir "$RELEASE"
  cp "$BUNDLE/compose.yaml" "$BUNDLE/job.sh" "$BUNDLE/backup.sh" "$BUNDLE/restore-test.sh" "$BUNDLE/alert.sh" "$BUNDLE/install-timers.sh" "$RELEASE/"
  cp -R "$BUNDLE/systemd" "$RELEASE/"
  BASE="$ROOT/shared/images.env"
  [[ -z "$PREVIOUS" ]] || BASE="$PREVIOUS/images.env"
  cp "$BASE" "$RELEASE/images.env"
  case "$COMPONENT" in
    frontend) sed -i '/^FRONTEND_IMAGE=/d' "$RELEASE/images.env"; printf 'FRONTEND_IMAGE=%s\n' "${REQUEST[2]}" >> "$RELEASE/images.env" ;;
    backend)
      sed -i '/^BACKEND_IMAGE=/d; /^TOOLS_IMAGE=/d' "$RELEASE/images.env"
      printf 'BACKEND_IMAGE=%s\nTOOLS_IMAGE=%s\n' "${REQUEST[2]}" "${REQUEST[3]}" >> "$RELEASE/images.env" ;;
  esac
fi
# Validate complete immutable image state, including the initial seed file.
python3 - "$RELEASE/images.env" "$ROOT/shared/images.env" <<'PY'
import re, sys
rows=open(sys.argv[1]).read().splitlines()
values={}
for row in rows:
    if not row.strip() or row.startswith('#'): continue
    k, sep, v=row.partition('=')
    if k in values or not sep: raise SystemExit('Invalid or duplicate image entry')
    values[k]=v
# Only the exact bootstrap digests may keep their pre-transfer namespace.
seed={}
for row in open(sys.argv[2]).read().splitlines():
    if not row.strip() or row.startswith('#'): continue
    k, sep, v=row.partition('=')
    if not sep or k in seed: raise SystemExit('Invalid bootstrap image state')
    seed[k]=v
for k, repo in [('FRONTEND_IMAGE','frontend'),('BACKEND_IMAGE','backend'),('TOOLS_IMAGE','backend')]:
    value=values.get(k,'')
    new_image=re.fullmatch(r'ghcr\.io/iti-p-hensemberger/iepf-'+repo+r'@sha256:[0-9a-f]{64}',value)
    bootstrap_image=value==seed.get(k) and re.fullmatch(r'ghcr\.io/[a-z0-9][a-z0-9-]*/iepf-'+repo+r'@sha256:[0-9a-f]{64}',value)
    if not (new_image or bootstrap_image): raise SystemExit('Invalid '+k)
if len(values)!=3: raise SystemExit('Unexpected image keys')
PY
compose() {
  docker compose --env-file "$ROOT/shared/host.env" --env-file "$RELEASE/images.env" -f "$RELEASE/compose.yaml" "$@"
}
compose config --quiet
# Do not pull/recreate database or proxy on every application update.
compose pull frontend backend maintenance
compose up -d --wait --wait-timeout 180 db
MIGRATE=false
if [[ "$COMPONENT" != rollback ]]; then
  if [[ -z "$PREVIOUS" && "$COMPONENT" == backend ]] || { [[ -n "$PREVIOUS" ]] && ! cmp -s <(sed -n '/^TOOLS_IMAGE=/p' "$PREVIOUS/images.env") <(sed -n '/^TOOLS_IMAGE=/p' "$RELEASE/images.env"); }; then
    MIGRATE=true
  fi
fi
if "$MIGRATE"; then
  # A failed backup or migration stops deployment before switching application images.
  bash "$BUNDLE/backup.sh"
  compose run --rm --no-deps maintenance npm run db:migrate
fi
recover() {
  local status=$?
  trap - ERR
  echo 'Application activation failed. Database migrations are NOT reverted.' >&2
  if [[ -n "$PREVIOUS" ]]; then
    docker compose --env-file "$ROOT/shared/host.env" --env-file "$PREVIOUS/images.env" -f "$PREVIOUS/compose.yaml" up -d --wait --wait-timeout 180 frontend backend || echo 'Recovery failed: operator action required' >&2
  else
    echo 'First deployment: no managed release available for recovery.' >&2
  fi
  exit "$status"
}
trap recover ERR
compose up -d --wait --wait-timeout 180 traefik backend frontend
# Smoke-test public routing and TLS as well as container health.
# Traefik routes a recreated container only once it has seen it turn healthy, a few seconds after
# `--wait` returns: until then it answers 404, which curl retries only with --retry-all-errors.
curl --fail --silent --show-error --retry 10 --retry-delay 3 --retry-all-errors --max-time 20 https://iepf.hensemberger.it/auth/login -o /dev/null
rm -f "$ROOT/current.next"
ln -s "$RELEASE" "$ROOT/current.next"
mv -Tf "$ROOT/current.next" "$ROOT/current"
trap - ERR
echo "Active release: $(basename "$RELEASE")"
# Only the active release's app images stay on disk: a rollback pulls its digests from GHCR
# again. Images are removed by ID, skipping any ID that a kept reference also points to.
KEEP=$(sed -n 's/^[A-Z_]*_IMAGE=//p' "$RELEASE/images.env")
KEEP_IDS=$(for ref in $KEEP; do docker image inspect --format '{{.Id}}' "$ref" 2>/dev/null || true; done)
docker images --no-trunc --digests --format '{{.Repository}}@{{.Digest}} {{.ID}}' \
  | awk '$1 ~ /^ghcr\.io\/[a-z0-9-]+\/iepf-(backend|frontend)@sha256:/ {print $2}' | sort -u \
  | while read -r id; do grep -qxF "$id" <<<"$KEEP_IDS" || docker rmi -f "$id" >/dev/null 2>&1 || true; done
