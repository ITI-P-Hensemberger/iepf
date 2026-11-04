#!/usr/bin/env bash
# Run once after the first successful release. Preserve all unrelated cron jobs.
set -Eeuo pipefail
umask 077
ROOT=/opt/iepf
RELEASE=$(readlink -f "$ROOT/current")
[[ -s "$RELEASE/images.env" && -d "$RELEASE/systemd" ]]
exec 9>"$ROOT/shared/deploy.lock"
flock -w 1800 9
crontab -l > "$ROOT/shared/crontab.before-timers"
python3 - "$ROOT/shared/crontab.before-timers" "$ROOT/shared/crontab.after-timers" <<'PY'
from pathlib import Path
import sys
lines=Path(sys.argv[1]).read_text().splitlines()
old_jobs=('backup-postgres.sh','backend-cron-generate-lessons','backend-cron-remind-feedback','backend-cron-remind-lessons')
kept=[s for s in lines if s.lstrip().startswith('#') or not ('/opt/infra/iepf' in s and any(j in s for j in old_jobs))]
Path(sys.argv[2]).write_text('\n'.join(kept)+'\n')
PY
for unit in "$RELEASE/systemd/"*; do install -m 644 "$unit" /etc/systemd/system/; done
systemctl daemon-reload
# Removing cron first avoids two independent schedulers sending the same emails.
crontab "$ROOT/shared/crontab.after-timers"
if ! systemctl enable --now iepf-backup.timer iepf-generate-lessons.timer iepf-remind-feedback.timer iepf-remind-lessons-today.timer iepf-remind-lessons-tomorrow.timer; then
  systemctl disable --now iepf-backup.timer iepf-generate-lessons.timer iepf-remind-feedback.timer iepf-remind-lessons-today.timer iepf-remind-lessons-tomorrow.timer || true
  crontab "$ROOT/shared/crontab.before-timers"
  exit 1
fi
systemctl list-timers 'iepf-*' --no-pager
