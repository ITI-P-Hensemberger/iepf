#!/usr/bin/env bash
set -euo pipefail

# Deploy images to GHCR (tag + push) using GitHub CLI token.
# - Logs in to ghcr.io only if not already authenticated
# - Requires: gh, docker
# Usage:
#   ./push-ghcr.sh
#
# Optional env:
#   GHCR_OWNER=jdncst-dev
#   TAG=latest
#   IMAGES="iepf-backend iepf-frontend"

GHCR_OWNER="${GHCR_OWNER:-jdncst-dev}"
TAG="${TAG:-latest}"
IMAGES="${IMAGES:-iepf-backend iepf-frontend}"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

need_cmd gh
need_cmd docker

# Ensure gh is logged in
if ! gh auth status -h github.com >/dev/null 2>&1; then
  echo "Not logged in to GitHub CLI. Run: gh auth login"
  exit 1
fi

# Ensure token has required scopes (best-effort check)
SCOPES="$(gh auth status -h github.com 2>/dev/null | sed -n "s/.*Token scopes: '\(.*\)'.*/\1/p")"
if [[ -n "${SCOPES}" ]]; then
  for s in read:packages write:packages; do
    if ! echo "${SCOPES}" | grep -q "${s}"; then
      echo "GitHub token scopes missing '${s}'."
      echo "Fix with: gh auth refresh -h github.com -s read:packages,write:packages,delete:packages"
      exit 1
    fi
  done
fi

# Check if Docker is already logged in to ghcr.io
is_docker_logged_in_ghcr() {
  # This checks whether Docker currently has usable credentials for ghcr.io
  docker system info 2>/dev/null | grep -q "Username:" || true
  docker login ghcr.io >/dev/null 2>&1 <<<''
}

# More reliable: try a harmless registry call via docker manifest inspect on a known public image.
# But we want "login only if needed" without network assumptions.
# We'll inspect docker config for stored creds entry (works with osxkeychain too, as it stores in Keychain).
has_ghcr_creds() {
  python3 - <<'PY'
import json, os
p=os.path.expanduser("~/.docker/config.json")
try:
    d=json.load(open(p))
except Exception:
    print("0"); raise SystemExit
auths=d.get("auths", {})
print("1" if ("ghcr.io" in auths) else "0")
PY
}

if [[ "$(has_ghcr_creds)" != "1" ]]; then
  echo "Logging in to ghcr.io via GitHub CLI token..."
  echo "$(gh auth token -h github.com)" | docker login ghcr.io -u "${GHCR_OWNER}" --password-stdin
else
  echo "Docker already has credentials for ghcr.io; skipping login."
fi

for img in ${IMAGES}; do
  local_ref="${img}:${TAG}"
  remote_ref="ghcr.io/${GHCR_OWNER}/${img}:${TAG}"

  echo "Tagging ${local_ref} -> ${remote_ref}"
  docker tag "${local_ref}" "${remote_ref}"

  echo "Pushing ${remote_ref}"
  docker push "${remote_ref}"
done

echo "Done."
