#!/usr/bin/env bash
# Read-only checks run on factory-worker as user worker, around the RAM upgrade.
# Nothing here changes the worker, the host or any VM; host facts come through the
# restricted unraid-admin verbs that need no approval.
#
#   bash worker-check.sh pre [run-id]     before the real launch (run-id: the rehearsal's)
#   bash worker-check.sh post <run-id>    after the VM is back
#   bash worker-check.sh cgroup-expect <MemTotal bytes>
#                                         T3's agent slice limits for that much RAM
#
# Prints PASS / WARN / FAIL lines; exits 1 if anything FAILed.
set -uo pipefail

HOST=(ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=yes unraid-admin)
HERE="$(cd "$(dirname "$0")" && pwd)"
STAGED=/mnt/user/appdata/fleet-vm-upgrade/vm-ram-upgrade.sh
RUNS=/mnt/user/appdata/fleet-vm-upgrade/runs
CK=/home/worker/.local/share/siltwake-checkpoints/vm-upgrade-20261019
ARCHIVE_BYTES=4137226240
ARCHIVE_SHA=188e1a36213ddb7f8ae58af26f4d1ea48280d938835883c4f2a50f37b1c13b1a
SLICE=/sys/fs/cgroup/user.slice/user-1000.slice/user@1000.service/app.slice/app-t3code.slice/app-t3code-agents.slice
TAILNET_NAME=factory-worker.tail6b68aa.ts.net
PINS_TABLE=$' 0      0\n 1      1\n 2      8\n 3      9\n 4      10\n 5      11'
fails=0

pass() { echo "PASS $*"; }
warn() { echo "WARN $*"; }
fail() { echo "FAIL $*"; fails=$((fails + 1)); }
check() { local what="$1"; shift; if "$@" >/dev/null 2>&1; then pass "$what"; else fail "$what"; fi; }

# T3 0.0.46-nightly.20261012.3021, src/process/agentScope.ts agentSliceMemoryLimits:
# high = max(total - 6 GiB, total / 2), max = max(total - 4 GiB, 0.75 * total),
# set with systemctl set-property at runtime; the kernel shows them rounded down to pages.
cgroup_expect() {
  local total="$1" gib=1073741824 high max
  high=$(( total - 6 * gib )); [ "$high" -ge $(( total / 2 )) ] || high=$(( total / 2 ))
  max=$(( total - 4 * gib )); [ "$max" -ge $(( total * 3 / 4 )) ] || max=$(( total * 3 / 4 ))
  echo "memory.high $(( high / 4096 * 4096 )) memory.max $(( max / 4096 * 4096 ))"
}

result_of() { "${HOST[@]}" files read "$RUNS/$1/result.json" 2>/dev/null; }
outcome_of() { sed -n 's/.*"outcome":"\([^"]*\)".*/\1/p'; }
exit_of() { sed -n 's/.*"exit_code":\([0-9]*\).*/\1/p'; }

vm_info() { "${HOST[@]}" vm info factory-worker 2>&1; }

pre() {
  local info local_sha remote_sha avail power res
  info="$(vm_info)"
  grep -q '^UUID: *ce0a610b-0a40-b2eb-1bfb-5a7203a24e22$' <<<"$info" && pass "host: UUID" || fail "host: UUID (vm info: $info)"
  grep -q '^Max memory: *12582912 KiB$' <<<"$info" && pass "host: 12 GiB defined and running" \
    || warn "host: not at 12 GiB; the script's plan will say what it does: $(grep 'Max memory' <<<"$info")"
  grep -q "^CPU(s): *6$" <<<"$info" && [[ "$info" == *"$PINS_TABLE"* ]] && pass "host: 6 vCPUs, pins 0,1,8,9,10,11" || fail "host: vCPUs or pins differ"
  grep -q '^Autostart: *enable$' <<<"$info" && pass "host: autostart enabled" || fail "host: autostart"
  avail="$("${HOST[@]}" status 2>/dev/null | awk '/^Mem:/ { print $7 }')"
  case "$avail" in
    *Gi) [ "${avail%%[.G]*}" -ge 6 ] && pass "host: $avail available (needs 4 GiB + 2 GiB reserve)" || fail "host: only $avail available" ;;
    *) fail "host: could not read available memory ('$avail')" ;;
  esac
  local_sha="$(sha256sum < "$HERE/vm-ram-upgrade.sh" | cut -d' ' -f1)"
  remote_sha="$("${HOST[@]}" files read "$STAGED" 2>/dev/null | sha256sum | cut -d' ' -f1)"
  [ "$local_sha" = "$remote_sha" ] && pass "staged script matches this bundle ($local_sha)" || fail "staged script differs or is missing (local $local_sha)"
  if [ -n "${1:-}" ]; then
    res="$(result_of "$1")"
    [ "$(outcome_of <<<"$res")" = rehearsal-ok ] && [ "$(exit_of <<<"$res")" = 0 ] && pass "rehearsal $1: rehearsal-ok, exit 0" \
      || fail "rehearsal $1 did not finish rehearsal-ok with exit 0"
  else
    warn "no rehearsal run id given"
  fi
  # Guest side: the ACPI power button must lead to a clean poweroff.
  power="$(systemd-analyze cat-config systemd/logind.conf 2>/dev/null | sed -n 's/^HandlePowerKey=//p' | tail -1)"
  [ "${power:-poweroff}" = poweroff ] && pass "guest: power key action ${power:-poweroff (default)}" || fail "guest: HandlePowerKey=$power"
  if systemd-inhibit --list --no-legend --no-pager 2>/dev/null | grep -Eq 'shutdown|handle-power-key'; then
    warn "guest: a shutdown or power-key inhibitor is held: $(systemd-inhibit --list --no-legend --no-pager | head -3)"
  else
    pass "guest: no shutdown inhibitors"
  fi
  check "guest: qemu-guest-agent active" systemctl is-active --quiet qemu-guest-agent
  [ "$(stat -c %s "$CK/tmp-siltwake.tar" 2>/dev/null)" = "$ARCHIVE_BYTES" ] && pass "checkpoint archive present, $ARCHIVE_BYTES bytes" || fail "checkpoint archive missing or wrong size"
}

post() {
  local run="${1:-}" info total exp high max h m res
  [ -n "$run" ] || { echo "usage: worker-check.sh post <run-id>" >&2; exit 2; }
  res="$(result_of "$run")"
  [ "$(outcome_of <<<"$res")" = upgraded ] && [ "$(exit_of <<<"$res")" = 0 ] && pass "host run $run: upgraded, exit 0" || fail "host run $run: $(outcome_of <<<"$res") — $(sed -n 's/.*"message":"\([^"]*\)".*/\1/p' <<<"$res")"
  info="$(vm_info)"
  grep -q '^Max memory: *16777216 KiB$' <<<"$info" && pass "host: 16 GiB" || fail "host: $(grep 'Max memory' <<<"$info")"
  grep -q "^CPU(s): *6$" <<<"$info" && [[ "$info" == *"$PINS_TABLE"* ]] && pass "host: 6 vCPUs, same pins" || fail "host: vCPUs or pins differ"
  grep -q '^Autostart: *enable$' <<<"$info" && pass "host: autostart enabled" || fail "host: autostart"
  grep -q 'factory-worker/vdisk1.img' <<<"$info" && grep -q 'factory-worker/vdisk2.img' <<<"$info" && pass "host: same disks" || fail "host: disks differ"
  [ "$(nproc)" = 6 ] && pass "guest: 6 CPUs" || fail "guest: $(nproc) CPUs"
  total="$(awk '/^MemTotal:/ { print $2 * 1024 }' /proc/meminfo)"
  [ "$total" -gt 16106127360 ] && [ "$total" -le 17179869184 ] && pass "guest: MemTotal $total bytes" || fail "guest: MemTotal $total bytes (want 15–16 GiB)"
  check "guest: t3code.service active" systemctl --user is-active --quiet t3code.service
  for s in fleet-dashboard-v2 fleet-dashboard fleet-status; do check "guest: $s.service active" systemctl --user is-active --quiet "$s.service"; done
  for s in t3code fleet-dashboard-v2 fleet-dashboard fleet-status; do check "guest: $s.service enabled" systemctl --user is-enabled --quiet "$s.service"; done
  [ "$(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null)" = yes ] && pass "guest: lingering on (user services start at boot)" || fail "guest: lingering is off"
  check "guest: :9100 architecture page" curl -fsS -m 10 -o /dev/null "http://$TAILNET_NAME:9100/"
  check "guest: :9110/api/health" curl -fsS -m 10 "http://$TAILNET_NAME:9110/api/health"
  check "guest: :9101/status" curl -fsS -m 10 "http://$TAILNET_NAME:9101/status"
  exp="$(cgroup_expect "$total")"
  if [ -r "$SLICE/memory.high" ]; then
    h="$(cat "$SLICE/memory.high")"; m="$(cat "$SLICE/memory.max")"
    [ "memory.high $h memory.max $m" = "$exp" ] && pass "agent slice: high $h, max $m (T3's formula for this RAM)" \
      || warn "agent slice: high $h, max $m; T3's formula gives $exp"
  else
    warn "agent slice not there yet (T3 makes it with the first agent); expected then: $exp"
  fi
  [ "$(sha256sum < "$CK/tmp-siltwake.tar" | cut -d' ' -f1)" = "$ARCHIVE_SHA" ] && pass "checkpoint archive SHA-256" || fail "checkpoint archive SHA-256"
  df -h /work /home /tmp | sed 's/^/     /'
}

case "${1:-}" in
  pre) shift; pre "$@" ;;
  post) shift; post "$@" ;;
  cgroup-expect) [[ "${2:-}" =~ ^[0-9]+$ ]] || { echo "usage: worker-check.sh cgroup-expect <bytes>" >&2; exit 2; }; cgroup_expect "$2"; exit 0 ;;
  *) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
[ "$fails" = 0 ]
