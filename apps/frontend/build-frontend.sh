#!/usr/bin/env bash
set -euo pipefail

OWNER="jdncst-dev"
PLATFORM="linux/amd64"

IMAGE="ghcr.io/${OWNER}/iepf-frontend"
CONTEXT="."

GIT_SHA="$(git rev-parse --short HEAD)"

if [[ ! -f .env.production ]]; then
  echo "Missing .env.production (required for production build)" >&2
  exit 1
fi

ENV_VALUE="$(grep -E '^NEXT_PUBLIC_API_BASE_URL=' .env.production | cut -d= -f2-)"
if [[ -z "${ENV_VALUE}" ]]; then
  echo "NEXT_PUBLIC_API_BASE_URL is missing in .env.production" >&2
  exit 1
fi

NEXT_PUBLIC_API_BASE_URL="$ENV_VALUE"

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
  --build-arg NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL}" \
  -t "${IMAGE}:latest" \
  -t "${IMAGE}:${VERSION}" \
  -t "${IMAGE}:${GIT_SHA}" \
  --push \
  "${CONTEXT}"

echo "✔ Frontend pushed"

