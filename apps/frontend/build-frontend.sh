#!/usr/bin/env bash
set -euo pipefail

OWNER="iti-p-hensemberger"
PLATFORM="linux/amd64"

IMAGE="ghcr.io/${OWNER}/iepf-frontend"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTEXT="${REPO_ROOT}"
DOCKERFILE="${REPO_ROOT}/apps/frontend/Dockerfile"

GIT_SHA="$(git rev-parse --short HEAD)"

if [[ -f VERSION ]]; then
  VERSION="$(cat VERSION | tr -d ' \n')"
else
  VERSION="dev"
fi

echo "Frontend build"
echo "Version: ${VERSION}"
echo "Git SHA: ${GIT_SHA}"
echo

docker buildx build \
  --platform "${PLATFORM}" \
  --file "${DOCKERFILE}" \
  -t "${IMAGE}:latest" \
  -t "${IMAGE}:${VERSION}" \
  -t "${IMAGE}:${GIT_SHA}" \
  --push \
  "${CONTEXT}"

echo "✔ Frontend pushed"

