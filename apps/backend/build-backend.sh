#!/usr/bin/env bash
set -euo pipefail

OWNER="jdncst-dev"
PLATFORM="linux/amd64"

IMAGE="ghcr.io/${OWNER}/iepf-backend"
CONTEXT="."

GIT_SHA="$(git rev-parse --short HEAD)"

if [[ -f VERSION ]]; then
  VERSION="$(cat VERSION | tr -d ' \n')"
else
  VERSION="dev"
fi

echo "Backend build"
echo "Version: ${VERSION}"
echo "Git SHA: ${GIT_SHA}"
echo

docker buildx build \
  --platform "${PLATFORM}" \
  -t "${IMAGE}:latest" \
  -t "${IMAGE}:${VERSION}" \
  -t "${IMAGE}:${GIT_SHA}" \
  --push \
  "${CONTEXT}"

docker buildx build \
  --platform "${PLATFORM}" \
  --target migrate \
  -t "${IMAGE}:migrate" \
  -t "${IMAGE}:migrate-${VERSION}" \
  -t "${IMAGE}:migrate-${GIT_SHA}" \
  --push \
  "${CONTEXT}"

echo "✔ Backend pushed"

