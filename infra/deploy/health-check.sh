#!/usr/bin/env bash
# Hourly: the server problems that need a person before they become an outage. It alerts when
# the list of problems changes (a new one, or all solved), not every hour while one lasts.
set -Euo pipefail
ROOT=/opt/iepf
DOMAIN=iepf.hensemberger.it
STATE="$ROOT/shared/health.last"
# A deploy recreates containers: check the result, not the middle of it.
exec 9>"$ROOT/shared/deploy.lock"
flock -w 1800 9
PROBLEMS=()

disk=$(df --output=pcent / | tail -1 | tr -dc '0-9')
(( disk < 80 )) || PROBLEMS+=("disco al ${disk}%")

# free -m: "Mem:" available in the 7th column, "Swap:" total and used in the 2nd and 3rd.
read -r available < <(free -m | awk '/^Mem:/ {print $7}')
(( available >= 300 )) || PROBLEMS+=("RAM disponibile ${available} MB")
read -r swap_total swap_used < <(free -m | awk '/^Swap:/ {print $2, $3}')
(( swap_total == 0 || swap_used * 100 / swap_total < 90 )) || PROBLEMS+=("swap usato al $(( swap_used * 100 / swap_total ))%")

for container in postgres iepf-backend-1 iepf-frontend-1; do
  status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || echo 'assente')
  [[ "$status" == healthy ]] || PROBLEMS+=("$container: $status")
done
status=$(docker inspect -f '{{.State.Status}}' traefik 2>/dev/null || echo 'assente')
[[ "$status" == running ]] || PROBLEMS+=("traefik: $status")

failed=$(systemctl --failed --no-legend --plain | awk '{print $1}' | paste -sd ' ' -)
[[ -z "$failed" ]] || PROBLEMS+=("servizi in errore: $failed")

# The certificate Traefik serves, read locally so a DNS problem does not hide it.
expiry=$(openssl s_client -connect 127.0.0.1:443 -servername "$DOMAIN" </dev/null 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [[ -z "$expiry" ]]; then
  PROBLEMS+=('certificato TLS non leggibile')
else
  days=$(( ($(date -d "$expiry" +%s) - $(date +%s)) / 86400 ))
  (( days >= 14 )) || PROBLEMS+=("certificato TLS in scadenza tra $days giorni")
fi

# The kernel errors that came before the frozen reboot of 2026-11-09, and memory kills.
kernel=$(journalctl -k --since '-1h' --no-pager -q 2>/dev/null | grep -cE 'blocked for more than|Buffer eviction failed|Out of memory|oom-kill' || true)
(( kernel == 0 )) || PROBLEMS+=("$kernel errori del kernel nell'ultima ora")

current=$(printf '%s\n' "${PROBLEMS[@]}")
previous=$(cat "$STATE" 2>/dev/null || true)
[[ "$current" != "$previous" ]] || exit 0
if [[ -n "${PROBLEMS[*]}" ]]; then
  MESSAGE="IEPF $(hostname): $(printf '%s; ' "${PROBLEMS[@]}")"
else
  MESSAGE="IEPF $(hostname): risolto, nessun problema"
fi
echo "$MESSAGE"
URL=$(grep -m1 '^ALERT_WEBHOOK_URL=' "$ROOT/shared/host.env" | cut -d= -f2- || true)
if [[ -n "$URL" ]] && ! curl --fail --silent --show-error --retry 3 --retry-delay 5 --max-time 20 --data-binary "$MESSAGE" "$URL" -o /dev/null; then
  # Not recorded: the next run tries again.
  exit 1
fi
printf '%s\n' "${PROBLEMS[@]}" | sed '/^$/d' > "$STATE"
