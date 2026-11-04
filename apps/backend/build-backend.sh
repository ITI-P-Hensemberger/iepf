#!/usr/bin/env bash
set -euo pipefail

OWNER="iti-p-hensemberger"
PLATFORM="linux/amd64"

IMAGE="ghcr.io/${OWNER}/iepf-backend"
CONTEXT="."

GIT_SHA="$(git rev-parse --short HEAD)"

VERSION="$(date -u +%Y%m%d%H%M%S)"

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

docker buildx build \
  --platform "${PLATFORM}" \
  --target cron-generate-lessons \
  -t "${IMAGE}:cron-generate-lessons" \
  -t "${IMAGE}:cron-generate-lessons-${VERSION}" \
  -t "${IMAGE}:cron-generate-lessons-${GIT_SHA}" \
  --push \
  "${CONTEXT}"

docker buildx build \
  --platform "${PLATFORM}" \
  --target cron-remind-feedback \
  -t "${IMAGE}:cron-remind-feedback" \
  -t "${IMAGE}:cron-remind-feedback-${VERSION}" \
  -t "${IMAGE}:cron-remind-feedback-${GIT_SHA}" \
  --push \
  "${CONTEXT}"

docker buildx build \
  --platform "${PLATFORM}" \
  --target cron-remind-lessons \
  -t "${IMAGE}:cron-remind-lessons" \
  -t "${IMAGE}:cron-remind-lessons-${VERSION}" \
  -t "${IMAGE}:cron-remind-lessons-${GIT_SHA}" \
  --push \
  "${CONTEXT}"

echo "✔ Backend pushed"
