#!/usr/bin/env bash
# Run by iepf-alert@.service when a scheduled unit fails. Without a configured URL the
# message only reaches the journal, so an unset value is reported as a warning.
set -Euo pipefail
ROOT=/opt/iepf
UNIT=${1:-unknown}
MESSAGE="IEPF: $UNIT failed on $(hostname)"
echo "$MESSAGE" >&2
# host.env is never sourced as shell code.
URL=$(grep -m1 '^ALERT_WEBHOOK_URL=' "$ROOT/shared/host.env" | cut -d= -f2- || true)
if [[ -z "$URL" ]]; then
  echo 'ALERT_WEBHOOK_URL is not set: nobody was notified' >&2
  exit 0
fi
curl --fail --silent --show-error --retry 3 --retry-delay 5 --max-time 20 --data-binary "$MESSAGE" "$URL" -o /dev/null
