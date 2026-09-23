#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
TEST_EMAIL="${TEST_EMAIL:-user.test@hensemberger.it}"
TEST_PASSWORD="${TEST_PASSWORD:-password123}"

say() {
  echo "\n==> $*"
}

say "Auth register"
curl -sS -X POST "$BASE_URL/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"firstName\":\"Test\",\"lastName\":\"User\",\"year\":4,\"sectionId\":\"00000000-0000-0000-0000-000000000000\"}" || true

say "Auth login"
curl -sS -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" || true

say "Verify email request"
curl -sS -X POST "$BASE_URL/api/auth/verify-email/request" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$TEST_EMAIL\"}" || true

say "Password reset request"
curl -sS -X POST "$BASE_URL/api/auth/password/reset/request" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$TEST_EMAIL\"}" || true

say "Users list (requires auth cookie)"
curl -sS "$BASE_URL/api/users" || true

say "Done"
