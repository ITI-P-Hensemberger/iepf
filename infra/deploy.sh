#!/usr/bin/env bash
set -euo pipefail

OWNER="jdncst-dev"
IMAGE_BACKEND="ghcr.io/${OWNER}/iepf-backend"
IMAGE_FRONTEND="ghcr.io/${OWNER}/iepf-frontend"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.yml"
ENV_BACKEND="${ROOT_DIR}/.env.backend"

if [[ ! -f "${ENV_BACKEND}" ]]; then
  echo "Missing ${ENV_BACKEND}. Create it before deploying." >&2
  exit 1
fi

echo "Pulling images"
docker compose -f "${COMPOSE_FILE}" pull

# Ensure the database is up before running migrations.
docker compose -f "${COMPOSE_FILE}" up -d db

# Run migrations in a one-off container.
echo "Running migrations"
docker run --rm \
  --env-file "${ENV_BACKEND}" \
  --network iepf \
  "${IMAGE_BACKEND}:migrate"

# Deploy updated services.
echo "Starting services"
docker compose -f "${COMPOSE_FILE}" up -d

echo "Deploy complete"
