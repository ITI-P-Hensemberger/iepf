#!/usr/bin/env bash
# Run after the first successful release and whenever systemd/ or alert.sh change.
# Safe to rerun. Preserve all unrelated cron jobs.
set -Eeuo pipefail
umask 077
ROOT=/opt/iepf
RELEASE=$(readlink -f "$ROOT/current")
[[ -s "$RELEASE/images.env" && -d "$RELEASE/systemd" ]]
exec 9>"$ROOT/shared/deploy.lock"
flock -w 1800 9
# crontab -l fails when the user has no crontab, which is a normal state on a rerun.
crontab -l > "$ROOT/shared/crontab.before-timers" 2>/dev/null || : > "$ROOT/shared/crontab.before-timers"
python3 - "$ROOT/shared/crontab.before-timers" "$ROOT/shared/crontab.after-timers" <<'PY'
from pathlib import Path
import sys
lines=Path(sys.argv[1]).read_text().splitlines()
old_jobs=('backup-postgres.sh','backend-cron-generate-lessons','backend-cron-remind-feedback','backend-cron-remind-lessons')
kept=[s for s in lines if s.lstrip().startswith('#') or not ('/opt/infra/iepf' in s and any(j in s for j in old_jobs))]
Path(sys.argv[2]).write_text('\n'.join(kept)+'\n')
PY
# Outside the release: a rollback to one without this script must still be able to alert.
install -m 755 "$RELEASE/alert.sh" "$ROOT/shared/alert.sh"
for unit in "$RELEASE/systemd/"*; do install -m 644 "$unit" /etc/systemd/system/; done
systemctl daemon-reload
# Removing cron first avoids two independent schedulers sending the same emails.
crontab "$ROOT/shared/crontab.after-timers"
if ! systemctl enable --now iepf-backup.timer iepf-cleanup-data.timer iepf-generate-lessons.timer iepf-notify-admins.timer iepf-remind-feedback.timer iepf-remind-lessons-today.timer iepf-remind-lessons-tomorrow.timer; then
  systemctl disable --now iepf-backup.timer iepf-cleanup-data.timer iepf-generate-lessons.timer iepf-notify-admins.timer iepf-remind-feedback.timer iepf-remind-lessons-today.timer iepf-remind-lessons-tomorrow.timer || true
  crontab "$ROOT/shared/crontab.before-timers"
  exit 1
fi
systemctl list-timers 'iepf-*' --no-pager
