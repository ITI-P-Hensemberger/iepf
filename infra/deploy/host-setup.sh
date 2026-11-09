#!/usr/bin/env bash
# Host configuration the release bundle does not carry. Run as root, safe to rerun:
#   ssh iepf 'bash -s' < infra/deploy/host-setup.sh
set -Eeuo pipefail

# SSH: keys only. Root keeps key login, used by the GitHub deploy (restrict) and the operators.
cat > /etc/ssh/sshd_config.d/00-iepf.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
X11Forwarding no
CONF
sshd -t
systemctl reload ssh

# Journal: a ceiling instead of 10% of a nearly full disk.
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=500M\n' > /etc/systemd/journald.conf.d/iepf.conf
systemctl restart systemd-journald
journalctl --vacuum-size=500M >/dev/null

# logrotate stops at the first config error: cloud-init and cloud-init-base both rotate the
# same files on this Ubuntu. Divert the older one so package upgrades do not bring it back.
if [[ -f /etc/logrotate.d/cloud-init && -f /etc/logrotate.d/cloud-init-base ]]; then
  dpkg-divert --local --rename --divert /etc/logrotate.d/cloud-init.disabled /etc/logrotate.d/cloud-init
fi
logrotate -d /etc/logrotate.conf 2>&1 | grep -q '^error' && { echo 'logrotate config still has errors' >&2; exit 1; }

# Container logs: capped. Applies to containers created after the next Docker restart (the
# nightly reboot below); Docker itself is not restarted here.
if [[ ! -s /etc/docker/daemon.json ]]; then
  printf '{\n  "log-driver": "json-file",\n  "log-opts": { "max-size": "10m", "max-file": "3" }\n}\n' > /etc/docker/daemon.json
fi

# Display: no virtual GPU driver. After a few days qxl fails ("[TTM] Buffer eviction failed")
# and blocks whatever writes to the screen; on 2026-11-09 it froze systemd while shutting down
# for a reboot. The console falls back to text mode, and kernel messages also go to ttyS0.
if [[ ! -f /etc/modprobe.d/iepf-no-qxl.conf ]]; then
  printf 'blacklist qxl\ninstall qxl /bin/false\n' > /etc/modprobe.d/iepf-no-qxl.conf
  update-initramfs -u
fi

# Updates: all Ubuntu updates, kernel included, installed at night after the night jobs
# (backup 02:00, cleanup 03:30), with a reboot at 04:30 when one is needed.
cat > /etc/apt/apt.conf.d/52iepf-unattended <<'CONF'
Unattended-Upgrade::Allowed-Origins:: "${distro_id}:${distro_codename}-updates";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
CONF
for timer in apt-daily:03:45 apt-daily-upgrade:04:00; do
  mkdir -p "/etc/systemd/system/${timer%%:*}.timer.d"
  printf '[Timer]\nOnCalendar=\nOnCalendar=*-*-* %s Europe/Rome\nRandomizedDelaySec=0\n' "${timer#*:}" > "/etc/systemd/system/${timer%%:*}.timer.d/iepf.conf"
done
systemctl daemon-reload
systemctl restart apt-daily.timer apt-daily-upgrade.timer

echo 'Host configured.'
