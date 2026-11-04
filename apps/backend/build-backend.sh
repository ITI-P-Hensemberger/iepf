#!/usr/bin/env bash
set -euo pipefail

OWNER="iti-p-hensemberger"
PLATFORM="linux/amd64"

IMAGE="ghcr.io/${OWNER}/iepf-backend"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTEXT="${REPO_ROOT}"
DOCKERFILE="${REPO_ROOT}/apps/backend/Dockerfile"

GIT_SHA="$(git rev-parse --short HEAD)"

VERSION="$(date -u +%Y%m%d%H%M%S)"

echo "Backend build"
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

docker buildx build \
  --platform "${PLATFORM}" \
  --file "${DOCKERFILE}" \
  --target migrate \
  -t "${IMAGE}:migrate" \
  -t "${IMAGE}:migrate-${VERSION}" \
  -t "${IMAGE}:migrate-${GIT_SHA}" \
  --push \
  "${CONTEXT}"

docker buildx build \
  --platform "${PLATFORM}" \
  --file "${DOCKERFILE}" \
  --target cron-generate-lessons \
  -t "${IMAGE}:cron-generate-lessons" \
  -t "${IMAGE}:cron-generate-lessons-${VERSION}" \
  -t "${IMAGE}:cron-generate-lessons-${GIT_SHA}" \
  --push \
  "${CONTEXT}"

docker buildx build \
  --platform "${PLATFORM}" \
  --file "${DOCKERFILE}" \
  --target cron-remind-feedback \
  -t "${IMAGE}:cron-remind-feedback" \
  -t "${IMAGE}:cron-remind-feedback-${VERSION}" \
  -t "${IMAGE}:cron-remind-feedback-${GIT_SHA}" \
  --push \
  "${CONTEXT}"

docker buildx build \
  --platform "${PLATFORM}" \
  --file "${DOCKERFILE}" \
  --target cron-remind-lessons \
  -t "${IMAGE}:cron-remind-lessons" \
  -t "${IMAGE}:cron-remind-lessons-${VERSION}" \
  -t "${IMAGE}:cron-remind-lessons-${GIT_SHA}" \
  --push \
  "${CONTEXT}"

echo "✔ Backend pushed"
