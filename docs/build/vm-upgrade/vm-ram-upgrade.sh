#!/usr/bin/env bash
# factory-worker RAM upgrade on dkhomeserver: 12 GiB -> 16 GiB and nothing else.
#
# Runs as root on the Unraid host, never on the worker: the worker is the VM that
# gets stopped, so every step after the shutdown has to happen here, unattended.
# RUNBOOK.md next to this file says how it is staged, approved and checked.
#
#   bash vm-ram-upgrade.sh [preflight]       read-only checks (the default)
#   bash vm-ram-upgrade.sh launch --expect-sha256 <sha> [--rehearsal]
#                                            start a detached run and return
#   bash vm-ram-upgrade.sh run [--run-dir <dir>] [--rehearsal]
#                                            a run in the foreground
#   bash vm-ram-upgrade.sh status            the latest run's state and result
#
# A run checks the fixed target, backs up its definition, waits an arm window
# (create CANCEL in the run folder to stop it), sends an ACPI shutdown and waits
# for it (never forced), changes only <memory> and <currentMemory> in the
# persistent definition, starts the VM and checks it. If anything fails once the
# VM is off, it puts the old memory back (memory only, never a whole saved
# definition, so other changes are not undone) and starts the VM again.
# --rehearsal does every read-only step from a detached run and changes nothing.
set -uo pipefail
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
umask 022

# --- The one VM and the one change
VM_NAME=factory-worker
VM_UUID=ce0a610b-0a40-b2eb-1bfb-5a7203a24e22
OLD_KIB=12582912        # 12 GiB
NEW_KIB=16777216        # 16 GiB
VCPUS=6
PINS="0:0 1:1 2:8 3:9 4:10 5:11"   # vCPU:host CPU, as in the definition
TOPOLOGY="<topology sockets='1' dies='1' clusters='1' cores='3' threads='2'/>"
DISKS="/mnt/user/domains/factory-worker/vdisk1.img
/mnt/user/domains/factory-worker/vdisk2.img"
RESERVE_KIB=2097152     # host MemAvailable that must be left once the VM has its RAM

# --- Where it keeps things
HOME_DIR=/mnt/user/appdata/fleet-vm-upgrade
RUNS="$HOME_DIR/runs"
BACKUPS=/boot/config/fleet/vm-backups
LOCK=/tmp/fleet-vm-ram-upgrade.lock
FLEET_LOCK=/tmp/fleet-admin.lock   # fleet-admin.sh holds it while it changes things
NOTIFY=/usr/local/emhttp/webGui/scripts/notify

# --- Timing in seconds. VMU_* overrides exist for the offline tests; a run logs them.
POLL="${VMU_POLL:-5}"
ARM_DELAY="${VMU_ARM_DELAY:-120}"
SHUTDOWN_TIMEOUT="${VMU_SHUTDOWN_TIMEOUT:-2400}"  # past the guest's own 30 min poweroff-force
ACPI_RESEND="${VMU_ACPI_RESEND:-300}"
START_TIMEOUT="${VMU_START_TIMEOUT:-120}"
START_RETRY_DELAY="${VMU_START_RETRY_DELAY:-10}"
AGENT_TIMEOUT="${VMU_AGENT_TIMEOUT:-600}"
FLEET_LOCK_WAIT="${VMU_FLEET_LOCK_WAIT:-120}"
REHEARSAL_HOLD="${VMU_REHEARSAL_HOLD:-90}"
MEMINFO="${VMU_MEMINFO:-/proc/meminfo}"

die() { echo "vm-ram-upgrade: $*" >&2; exit 2; }
ts() { date -u +%FT%TZ; }
log() { echo "$(ts) $*"; }
now_ms() { local t="${EPOCHREALTIME/,/.}"; echo $(( ${t%.*} * 1000 + 10#${t#*.} / 1000 )); }
ms() { awk -v s="$1" 'BEGIN { printf "%d", s * 1000 }'; }
my_sid() { ps -o sid= -p "$1" 2>/dev/null | tr -d ' '; }
sha_of() { sha256sum < "$1" | cut -d' ' -f1; }
json_str() {
  local s="${1//\\/\\\\}"
  s="${s//\"/\\\"}"; s="${s//$'\n'/\\n}"; s="${s//$'\t'/ }"
  printf '"%s"' "$s"
}
overrides() { env | grep -E '^VMU_' | sort | paste -sd' ' -; }

[ -n "${EPOCHREALTIME:-}" ] || die "needs bash 5 or later"
for v in POLL ARM_DELAY SHUTDOWN_TIMEOUT ACPI_RESEND START_TIMEOUT START_RETRY_DELAY AGENT_TIMEOUT FLEET_LOCK_WAIT REHEARSAL_HOLD; do
  [[ "${!v}" =~ ^[0-9]+(\.[0-9]+)?$ ]] || die "$v must be a number of seconds"
done

# --- Reading the VM (never changes anything)

xml_mem() { sed -n "s/^ *<$1 unit='KiB'>\([0-9]*\)<\/$1>.*/\1/p" | head -1; }
xml_pins() { sed -n "s/.*<vcpupin vcpu='\([0-9]*\)' cpuset='\([0-9,-]*\)'\/>.*/\1:\2/p" | paste -sd' ' -; }
# File-backed disks (not CD-ROMs) of a definition, one per line.
xml_disks() {
  awk -v q="'" '
    /<disk / { d = ($0 ~ /type=.file./ && $0 ~ /device=.disk./) }
    d && /<source file=/ { s = substr($0, index($0, "file=" q) + 6); print substr(s, 1, index(s, q) - 1) }
    /<\/disk>/ { d = 0 }'
}
# A definition without its two memory lines, to see what else differs.
strip_mem() { grep -Ev "^ *<(memory|currentMemory) unit='KiB'>[0-9]+</(memory|currentMemory)>$"; }
domstate() { virsh domstate "$VM_UUID" 2>/dev/null | head -1; }

# observe: the VM's state and memory, persistent (CFG_) and running (LIVE_).
observe() {
  STATE="$(domstate)"
  CFG_XML="$(virsh dumpxml --inactive "$VM_UUID" 2>/dev/null)"
  CFG_MEM="$(xml_mem memory <<<"$CFG_XML")"
  CFG_CUR="$(xml_mem currentMemory <<<"$CFG_XML")"
  if [ "$STATE" = running ]; then
    local live; live="$(virsh dumpxml "$VM_UUID" 2>/dev/null)"
    LIVE_MEM="$(xml_mem memory <<<"$live")"
    LIVE_CUR="$(xml_mem currentMemory <<<"$live")"
  else
    LIVE_MEM=""; LIVE_CUR=""
  fi
}

# check_identity: the VM is the one this script was written for, apart from its
# memory. Fills PROBLEMS; true if there are none.
check_identity() {
  PROBLEMS=()
  local uuid name info pins disks d
  uuid="$(virsh domuuid "$VM_NAME" 2>/dev/null)"
  [ "$uuid" = "$VM_UUID" ] || PROBLEMS+=("the VM named $VM_NAME has UUID '${uuid:-none}', expected $VM_UUID")
  name="$(virsh domname "$VM_UUID" 2>/dev/null)"
  [ "$name" = "$VM_NAME" ] || PROBLEMS+=("UUID $VM_UUID is named '${name:-none}', expected $VM_NAME")
  info="$(virsh dominfo "$VM_UUID" 2>/dev/null)"
  grep -Eq '^Persistent: +yes$' <<<"$info" || PROBLEMS+=("the VM is not persistent")
  grep -Eq '^Autostart: +enable$' <<<"$info" || PROBLEMS+=("autostart is not enabled")
  if [ -z "$CFG_XML" ]; then PROBLEMS+=("its definition could not be read"); return 1; fi
  grep -Fq "<vcpu placement='static'>$VCPUS</vcpu>" <<<"$CFG_XML" || PROBLEMS+=("the vCPU count is not $VCPUS")
  pins="$(xml_pins <<<"$CFG_XML")"
  [ "$pins" = "$PINS" ] || PROBLEMS+=("vCPU pins are '$pins', expected '$PINS'")
  grep -Fq "$TOPOLOGY" <<<"$CFG_XML" || PROBLEMS+=("the CPU topology is not $TOPOLOGY")
  disks="$(xml_disks <<<"$CFG_XML")"
  [ "$disks" = "$DISKS" ] || PROBLEMS+=("its disks are '${disks//$'\n'/ }'")
  while IFS= read -r d; do [ -f "$d" ] || PROBLEMS+=("disk file $d is missing"); done <<<"$DISKS"
  grep -Fq '<acpi/>' <<<"$CFG_XML" || PROBLEMS+=("no ACPI, so a clean shutdown cannot be asked for")
  ! grep -Eq '<numa>|<hugepages|<maxMemory' <<<"$CFG_XML" || PROBLEMS+=("NUMA cells, hugepages or memory hotplug: not handled here")
  [ -n "$CFG_MEM" ] && [ -n "$CFG_CUR" ] || PROBLEMS+=("its memory is not given in KiB")
  [ ${#PROBLEMS[@]} -eq 0 ]
}

# classify: what is left to do, from STATE and memory.
#   done     running with 16 GiB             restart  16 GiB defined, running 12
#   full     running with 12 GiB defined     change   off, 12 GiB defined
#   start    off, 16 GiB defined             unexpected  anything else
# A definition with 16 GiB maximum but 12 GiB current is a change that stopped
# between its two steps; it counts as not changed yet.
classify() {
  local cfg
  if [ "$CFG_CUR" = "$OLD_KIB" ] && { [ "$CFG_MEM" = "$OLD_KIB" ] || [ "$CFG_MEM" = "$NEW_KIB" ]; }; then cfg=old
  elif [ "$CFG_MEM" = "$NEW_KIB" ] && [ "$CFG_CUR" = "$NEW_KIB" ]; then cfg=new
  else echo unexpected; return; fi
  case "$STATE" in
    running)
      if [ "$cfg" = old ]; then echo full
      elif [ "$LIVE_MEM" = "$NEW_KIB" ] && [ "$LIVE_CUR" = "$NEW_KIB" ]; then echo done
      else echo restart; fi ;;
    "shut off") [ "$cfg" = old ] && echo change || echo start ;;
    *) echo unexpected ;;
  esac
}

mem_available() { awk '/^MemAvailable:/ { print $2 }' "$MEMINFO" 2>/dev/null; }
# have_room <kib>: the host can give the VM <kib> more and keep the reserve.
have_room() {
  local avail; avail="$(mem_available)"
  [[ "$avail" =~ ^[0-9]+$ ]] || { log "cannot read MemAvailable from $MEMINFO"; return 1; }
  log "host MemAvailable $avail KiB; needs $1 KiB plus the $RESERVE_KIB KiB reserve"
  [ "$avail" -ge $(( $1 + RESERVE_KIB )) ]
}

# --- Run bookkeeping: state.json while it runs, result.json at the end

set_phase() {
  PHASE="$1"
  local tmp="$RUN_DIR/.state.json.tmp"
  {
    printf '{"run_id":%s,"phase":%s,"message":%s,' "$(json_str "$RUN_ID")" "$(json_str "$PHASE")" "$(json_str "${2:-}")"
    printf '"plan":%s,"rehearsal":%s,"pid":%s,"sid":%s,"updated_at":%s}\n' "$(json_str "${PLAN:-}")" \
      "$REHEARSAL" "$$" "$(json_str "$SID")" "$(json_str "$(ts)")"
  } > "$tmp" && mv -f "$tmp" "$RUN_DIR/state.json"
  [ -z "${2:-}" ] || log "phase $PHASE: $2"
}

# finish <outcome> <exit code> <message>: record the result, tell the owner, exit.
finish() {
  local outcome="$1" code="$2" msg="$3" level=normal tmp="$RUN_DIR/.result.json.tmp" launcher=unknown
  FINISHED=1
  observe
  [ -n "$LAUNCHER_PID" ] && { kill -0 "$LAUNCHER_PID" 2>/dev/null && launcher=yes || launcher=no; }
  {
    printf '{"run_id":%s,"outcome":%s,"exit_code":%s,"message":%s,' "$(json_str "$RUN_ID")" "$(json_str "$outcome")" "$code" "$(json_str "$msg")"
    printf '"rehearsal":%s,"plan":%s,"last_phase":%s,' "$REHEARSAL" "$(json_str "${PLAN:-}")" "$(json_str "${PHASE:-}")"
    printf '"vm":{"state":%s,"config_memory_kib":%s,"config_current_kib":%s,"live_memory_kib":%s,"live_current_kib":%s},' \
      "$(json_str "$STATE")" "$(json_str "$CFG_MEM")" "$(json_str "$CFG_CUR")" "$(json_str "$LIVE_MEM")" "$(json_str "$LIVE_CUR")"
    printf '"guest_agent":%s,"backup":%s,"script_sha256":%s,' "$(json_str "${AGENT:-not checked}")" "$(json_str "${BACKUP:-}")" "$(json_str "$SCRIPT_SHA")"
    printf '"pid":%s,"sid":%s,"launcher_pid":%s,"launcher_alive_at_finish":%s,' "$$" "$(json_str "$SID")" "$(json_str "$LAUNCHER_PID")" "$(json_str "$launcher")"
    printf '"overrides":%s,"started_at":%s,"finished_at":%s}\n' "$(json_str "$(overrides)")" "$(json_str "$STARTED_AT")" "$(json_str "$(ts)")"
  } > "$tmp" && mv -f "$tmp" "$RUN_DIR/result.json"
  set_phase finished "$outcome"
  log "RESULT $outcome (exit $code): $msg"
  log "VM now: state '$STATE', definition $CFG_MEM/$CFG_CUR KiB, running ${LIVE_MEM:-none}/${LIVE_CUR:-none} KiB"
  log "all VMs at the end:"; virsh list --all 2>&1 | sed 's/^/  | /'
  case "$code" in 0) ;; 1[0-9]) level=warning ;; *) level=alert ;; esac
  [ -x "$NOTIFY" ] && "$NOTIFY" -e "factory-worker RAM upgrade" -s "factory-worker upgrade: $outcome" \
    -d "$msg (run $RUN_ID)" -i "$level" >/dev/null 2>&1
  exit "$code"
}

# Not a planned exit: say so, with the phase it stopped in. A later run picks up from the VM's state.
on_exit() {
  [ -n "${FINISHED:-}" ] || finish aborted 31 "stopped unexpectedly (signal or error) in phase '${PHASE:-}'; re-run to continue from the VM's state"
}

# --- Changing the VM

# vdo <virsh args>: a logged virsh call that changes something.
vdo() {
  log "+ virsh $*"
  local out rc
  out="$(virsh "$@" 2>&1)"; rc=$?
  [ -z "$out" ] || sed 's/^/  | /' <<<"$out"
  return "$rc"
}

# set_memory <kib>: memory and current memory in the persistent definition, and
# nothing else. Returns 1 if the change failed, 3 if anything else in the
# definition differs afterwards (left as it is; the caller decides).
set_memory() {
  local kib="$1" before after
  before="$(virsh dumpxml --inactive "$VM_UUID" 2>/dev/null)" && [ -n "$before" ] || { log "cannot read the definition"; return 1; }
  printf '%s\n' "$before" > "$RUN_DIR/definition-before-$kib.xml"
  # Raising: the maximum first, then current up to it. Lowering: the maximum alone
  # also brings current down, so a rollback still works if setmem is what failed.
  vdo setmaxmem "$VM_UUID" "$kib" --config || return 1
  if [ "$(virsh dumpxml --inactive "$VM_UUID" 2>/dev/null | xml_mem currentMemory)" != "$kib" ]; then
    vdo setmem "$VM_UUID" "$kib" --config || return 1
  fi
  after="$(virsh dumpxml --inactive "$VM_UUID" 2>/dev/null)"
  printf '%s\n' "$after" > "$RUN_DIR/definition-after-$kib.xml"
  if [ "$(xml_mem memory <<<"$after")" != "$kib" ] || [ "$(xml_mem currentMemory <<<"$after")" != "$kib" ]; then
    log "the definition does not show $kib KiB after the change"; return 1
  fi
  if ! diff <(strip_mem <<<"$before") <(strip_mem <<<"$after") > "$RUN_DIR/unexpected-diff-$kib.txt"; then
    log "more than memory differs in the definition; see unexpected-diff-$kib.txt"; return 3
  fi
  rm -f "$RUN_DIR/unexpected-diff-$kib.txt"
  log "definition memory is now $kib KiB; nothing else in it changed"
}

# with_fleet_lock <command...>: under fleet-admin.sh's lock, so its verbs
# (vm define and the like) cannot change things at the same moment.
with_fleet_lock() {
  ( flock -w "$FLEET_LOCK_WAIT" 9 || { log "fleet-admin's lock was busy for $FLEET_LOCK_WAIT s"; exit 1; }
    "$@" ) 9>"$FLEET_LOCK"
}

backup_definition() {
  BACKUP="$BACKUPS/$VM_NAME-$RUN_ID.xml"
  mkdir -p "$BACKUPS" && ( umask 077; virsh dumpxml --inactive --security-info "$VM_UUID" > "$BACKUP" ) && [ -s "$BACKUP" ] \
    && log "definition backed up to $BACKUP (for the owner; this script never restores it whole)"
}

# arm_window: a last chance to stop before the shutdown. False if CANCEL appears.
arm_window() {
  local end=$(( $(now_ms) + $(ms "$ARM_DELAY") ))
  set_phase armed "ACPI shutdown in $ARM_DELAY s; to stop, create $RUN_DIR/CANCEL"
  while [ "$(now_ms)" -lt "$end" ]; do
    [ -e "$RUN_DIR/CANCEL" ] && return 1
    sleep "$POLL"
  done
  [ ! -e "$RUN_DIR/CANCEL" ]
}

# shutdown_and_wait: ACPI only. The request is repeated now and then in case
# one was lost; nothing here forces the VM off. False if it is still on at the deadline.
shutdown_and_wait() {
  local start now next deadline state
  start="$(now_ms)"
  deadline=$(( start + $(ms "$SHUTDOWN_TIMEOUT") ))
  next=$(( start + $(ms "$ACPI_RESEND") ))
  vdo shutdown "$VM_UUID" --mode acpi || log "the shutdown request failed; waiting anyway"
  while :; do
    state="$(domstate)"; now="$(now_ms)"
    if [ "$state" = "shut off" ]; then log "shut off after $(( (now - start) / 1000 )) s"; return 0; fi
    [ "$now" -lt "$deadline" ] || return 1
    if [ "$now" -ge "$next" ] && [ "$state" = running ]; then
      vdo shutdown "$VM_UUID" --mode acpi
      next=$(( now + $(ms "$ACPI_RESEND") ))
    fi
    set_phase shutting-down "waiting for shut off: $(( (now - start) / 1000 )) s of $SHUTDOWN_TIMEOUT, state '$state'" >/dev/null
    sleep "$POLL"
  done
}

# start_and_wait: start it (unless something else already did) and wait for running.
start_and_wait() {
  local end
  if [ "$(domstate)" != running ]; then vdo start "$VM_UUID" || return 1; fi
  end=$(( $(now_ms) + $(ms "$START_TIMEOUT") ))
  while [ "$(now_ms)" -lt "$end" ]; do
    [ "$(domstate)" = running ] && return 0
    sleep "$POLL"
  done
  [ "$(domstate)" = running ]
}

start_with_retry() {
  start_and_wait && return 0
  log "start failed; one more try in $START_RETRY_DELAY s"
  sleep "$START_RETRY_DELAY"
  start_and_wait
}

# verify_running_target: running with 16 GiB and the same CPUs, pins, disks and identity.
verify_running_target() {
  observe
  local bad=() pins cpus
  [ "$STATE" = running ] || bad+=("state is '$STATE'")
  [ "$LIVE_MEM" = "$NEW_KIB" ] && [ "$LIVE_CUR" = "$NEW_KIB" ] || bad+=("running memory is $LIVE_MEM/$LIVE_CUR KiB")
  [ "$CFG_MEM" = "$NEW_KIB" ] && [ "$CFG_CUR" = "$NEW_KIB" ] || bad+=("defined memory is $CFG_MEM/$CFG_CUR KiB")
  cpus="$(virsh dominfo "$VM_UUID" 2>/dev/null | sed -n 's/^CPU(s): *//p')"
  [ "$cpus" = "$VCPUS" ] || bad+=("running vCPUs: '$cpus'")
  pins="$(virsh vcpupin "$VM_UUID" 2>/dev/null | awk '$1 ~ /^[0-9]+$/ { printf "%s%s:%s", sep, $1, $2; sep = " " }')"
  [ "$pins" = "$PINS" ] || bad+=("running pins: '$pins'")
  check_identity || bad+=("${PROBLEMS[@]}")
  VERIFY_PROBLEMS="${bad[*]:-}"
  [ ${#bad[@]} -eq 0 ]
}

# guest_agent_wait: informative only; records whether the guest's agent answers.
guest_agent_wait() {
  local start end
  start="$(now_ms)"; end=$(( start + $(ms "$AGENT_TIMEOUT") ))
  set_phase guest-check "waiting up to $AGENT_TIMEOUT s for the guest agent"
  while [ "$(now_ms)" -lt "$end" ]; do
    if virsh qemu-agent-command "$VM_UUID" --timeout 5 '{"execute":"guest-ping"}' 2>/dev/null | grep -q '"return"'; then
      AGENT="answered after $(( ($(now_ms) - start) / 1000 )) s"; log "guest agent $AGENT"; return 0
    fi
    sleep "$POLL"
  done
  AGENT="no answer within $AGENT_TIMEOUT s"; log "guest agent: $AGENT"
}

# start_as_is <why>: start the VM with whatever it is defined with now.
start_as_is() {
  set_phase starting-as-is "$1"
  observe
  [ "$STATE" = running ] && finish restarted-elsewhere 21 "$1; it is running (something else started it)"
  have_room "${CFG_CUR:-0}" || finish left-off 30 "$1; the host lacks memory to start it safely, so it is left shut off"
  start_with_retry || finish left-off 30 "$1; starting it failed, so it is left shut off"
  finish started-as-is 21 "$1; started with its definition as it is ($CFG_CUR KiB)"
}

# recover_old <why>: after a failure with the VM off, put 12 GiB back (memory
# only) and start it.
recover_old() {
  local before="$RUN_DIR/definition-before-$NEW_KIB.xml"
  set_phase recovering "$1"
  observe
  [ "$STATE" = running ] && finish restarted-elsewhere 21 "$1; the VM is running again (something else started it)"
  if [ "$CFG_MEM" != "$OLD_KIB" ] || [ "$CFG_CUR" != "$OLD_KIB" ]; then
    with_fleet_lock set_memory "$OLD_KIB"
    case $? in
      0) ;;
      3) log "memory is back to $OLD_KIB KiB; other differences in the definition were left as they are" ;;
      *) start_as_is "$1; putting $OLD_KIB KiB back failed too" ;;
    esac
  fi
  if [ -f "$before" ] && ! diff -q <(strip_mem < "$before") <(virsh dumpxml --inactive "$VM_UUID" 2>/dev/null | strip_mem) >/dev/null; then
    log "note: apart from memory, the definition now differs from before this run; this script did not undo that"
  fi
  observe
  have_room "$CFG_CUR" || finish left-off 30 "$1; old memory restored, but the host lacks memory to start it safely, so it is left shut off"
  start_with_retry || finish left-off 30 "$1; old memory restored, but it would not start; it is left shut off"
  finish rolled-back-started-old 20 "$1; started again with $CFG_CUR KiB"
}

# --- Commands

cmd_preflight() {
  observe
  local ok=0
  echo "VM $VM_NAME ($VM_UUID): state '${STATE:-unknown}'"
  echo "memory: defined $CFG_MEM/$CFG_CUR KiB, running ${LIVE_MEM:-none}/${LIVE_CUR:-none} KiB (from $OLD_KIB to $NEW_KIB)"
  if check_identity; then echo "identity, CPUs, pins, topology, disks, autostart: as expected"
  else ok=1; printf 'problem: %s\n' "${PROBLEMS[@]}"; fi
  PLAN="$(classify)"; echo "plan: $PLAN"
  [ "$PLAN" = unexpected ] && ok=1
  if [ "$STATE" = running ] && { [ "$PLAN" = full ] || [ "$PLAN" = restart ]; }; then
    have_room $(( NEW_KIB - ${LIVE_CUR:-0} )) || { ok=1; echo "problem: not enough host memory"; }
  fi
  for t in flock setsid timeout sha256sum virsh; do command -v "$t" >/dev/null || { ok=1; echo "problem: $t is missing"; }; done
  echo "other VMs (not touched):"; virsh list --all 2>&1 | sed 's/^/  /'
  [ "$ok" = 0 ] && echo "preflight: ok" || echo "preflight: NOT ok"
  return "$ok"
}

cmd_status() {
  local last
  last="$(ls -1d "$RUNS"/*/ 2>/dev/null | sort | tail -1)"
  [ -n "$last" ] || { echo "no runs in $RUNS"; return 0; }
  echo "latest run: $last"
  cat "$last/state.json" 2>/dev/null
  cat "$last/result.json" 2>/dev/null || echo "(no result yet)"
}

cmd_launch() {
  local expect="" rehearsal=() self run_id dir i pid
  while [ $# -gt 0 ]; do
    case "$1" in
      --expect-sha256) expect="${2:-}"; shift 2 ;;
      --rehearsal) rehearsal=(--rehearsal); shift ;;
      *) die "unknown launch option '$1'" ;;
    esac
  done
  [[ "$expect" =~ ^[0-9a-f]{64}$ ]] || die "launch needs --expect-sha256 <SHA-256 of this script>"
  [ "$(id -u)" = 0 ] || die "run this as root on the Unraid host"
  self="$(readlink -f -- "$0")"
  [ "$(sha_of "$self")" = "$expect" ] || die "this script's SHA-256 is not $expect; nothing was started"
  run_id="$(date -u +%Y%m%dT%H%M%SZ)-$(od -An -N2 -tx1 /dev/urandom | tr -d ' \n')"
  dir="$RUNS/$run_id"
  mkdir -p "$RUNS" && mkdir "$dir" || die "cannot create $dir"
  # The run uses its own root-owned copy, so a change to the staged file cannot reach it.
  cp -- "$self" "$dir/vm-ram-upgrade.sh" && [ "$(sha_of "$dir/vm-ram-upgrade.sh")" = "$expect" ] \
    || die "the copy in $dir does not match; nothing was started"
  printf '{"run_id":%s,"launcher_pid":%s,"launcher_sid":%s,"launched_at":%s,"expect_sha256":%s,"rehearsal":%s}\n' \
    "$(json_str "$run_id")" "$$" "$(json_str "$(my_sid $$)")" "$(json_str "$(ts)")" "$(json_str "$expect")" \
    "$([ ${#rehearsal[@]} -gt 0 ] && echo true || echo false)" > "$dir/launch.json"
  # A new session, stdin closed and output to the run's own log: the run does not
  # depend on whoever launched it (ssh, the approval runner, its timeout, a terminal).
  setsid bash "$dir/vm-ram-upgrade.sh" run --run-dir "$dir" --launcher-pid "$$" "${rehearsal[@]}" \
    < /dev/null >> "$dir/run.log" 2>&1 &
  for i in $(seq 1 30); do
    pid="$(sed -n 's/.*"pid":\([0-9]*\).*/\1/p' "$dir/state.json" 2>/dev/null)"
    [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && break
    pid=""; sleep 0.5
  done
  if [ -z "$pid" ]; then
    echo "run $run_id did not report in; its log:"; tail -n 20 "$dir/run.log" 2>/dev/null
    return 1
  fi
  echo "Launched run $run_id (pid $pid, session $(my_sid "$pid")$([ ${#rehearsal[@]} -gt 0 ] && echo ', rehearsal: changes nothing'))."
  echo "It needs nothing more from the caller and keeps going if the caller goes away."
  echo "Progress: files read $dir/state.json"
  echo "Log:      files read $dir/run.log"
  echo "Result:   files read $dir/result.json"
  [ ${#rehearsal[@]} -gt 0 ] || echo "Cancel before the shutdown ($ARM_DELAY s): files write $dir/CANCEL"
}

cmd_run() {
  REHEARSAL=false; LAUNCHER_PID=""; RUN_DIR=""; PLAN=""; PHASE=start; AGENT=""; BACKUP=""
  STATE=""; CFG_MEM=""; CFG_CUR=""; LIVE_MEM=""; LIVE_CUR=""; SID=""; STARTED_AT="$(ts)"; SCRIPT_SHA=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --run-dir) RUN_DIR="${2:-}"; shift 2 ;;
      --launcher-pid) LAUNCHER_PID="${2:-}"; shift 2 ;;
      --rehearsal) REHEARSAL=true; shift ;;
      *) die "unknown run option '$1'" ;;
    esac
  done
  [ "$(id -u)" = 0 ] || die "run this as root on the Unraid host"
  [ -n "$RUN_DIR" ] || RUN_DIR="$RUNS/$(date -u +%Y%m%dT%H%M%SZ)-$(od -An -N2 -tx1 /dev/urandom | tr -d ' \n')"
  mkdir -p "$RUN_DIR" || die "cannot create $RUN_DIR"
  RUN_ID="$(basename "$RUN_DIR")"
  if [ -t 1 ]; then exec > >(tee -a "$RUN_DIR/run.log") 2>&1; else exec >> "$RUN_DIR/run.log" 2>&1; fi
  trap '' HUP
  trap on_exit EXIT
  trap on_exit TERM INT   # ignored while finish is already recording a result
  SID="$(my_sid $$)"; SCRIPT_SHA="$(sha_of "$0")"
  log "run $RUN_ID: pid $$, session $SID, launcher ${LAUNCHER_PID:-none}, rehearsal $REHEARSAL"
  log "script $(readlink -f -- "$0") sha256 $SCRIPT_SHA; overrides: $(overrides)"
  set_phase preflight "checking $VM_NAME"

  exec 8>"$LOCK"
  flock -n 8 || finish locked 11 "another run holds $LOCK; nothing was done"
  log "all VMs at the start:"; virsh list --all 2>&1 | sed 's/^/  | /'

  observe
  check_identity || finish preflight-failed 10 "not the expected VM: ${PROBLEMS[*]}; nothing was changed"
  PLAN="$(classify)"
  log "state '$STATE', definition $CFG_MEM/$CFG_CUR KiB, running ${LIVE_MEM:-none}/${LIVE_CUR:-none} KiB: plan '$PLAN'"
  [ "$PLAN" = unexpected ] && finish preflight-failed 10 "state '$STATE' with memory $CFG_MEM/$CFG_CUR KiB is not one this script handles; nothing was changed"
  if [ "$PLAN" = done ]; then
    [ "$REHEARSAL" = true ] && finish rehearsal-ok 0 "already running with $NEW_KIB KiB; a real run would do nothing"
    finish already-upgraded 0 "already running with $NEW_KIB KiB; nothing to do, the VM was not stopped"
  fi
  if [ "$PLAN" = full ] || [ "$PLAN" = restart ]; then
    have_room $(( NEW_KIB - LIVE_CUR )) || finish preflight-failed 10 "the host lacks memory for $NEW_KIB KiB; nothing was changed"
  fi
  mkdir -p "$BACKUPS" && [ -w "$BACKUPS" ] || finish preflight-failed 10 "cannot write backups to $BACKUPS; nothing was changed"

  if [ "$REHEARSAL" = true ]; then
    set_phase rehearsal-hold "plan '$PLAN'; holding $REHEARSAL_HOLD s to outlive the launcher; nothing will be changed"
    sleep "$REHEARSAL_HOLD"
    observe
    check_identity || finish preflight-failed 10 "the VM changed during the rehearsal: ${PROBLEMS[*]}"
    finish rehearsal-ok 0 "plan '$PLAN'; the detached run (session $SID) outlived its launcher and changed nothing"
  fi

  backup_definition || finish preflight-failed 10 "could not back up the definition to $BACKUPS; nothing was changed"

  if [ "$PLAN" = full ] || [ "$PLAN" = restart ]; then
    arm_window || finish cancelled 12 "CANCEL found before the shutdown; nothing was changed"
    # Look again: something else may have changed the VM during the window.
    observe
    PLAN="$(classify)"
    case "$PLAN" in
      full|restart)
        check_identity || finish preflight-failed 10 "the VM changed during the arm window: ${PROBLEMS[*]}; nothing was changed"
        set_phase shutting-down "ACPI shutdown; waiting up to $SHUTDOWN_TIMEOUT s, never forced"
        shutdown_and_wait || finish shutdown-timeout 13 "still '$(domstate)' after $SHUTDOWN_TIMEOUT s of ACPI shutdown; not forced, definition unchanged"
        ;;
      done) finish already-upgraded 0 "running with $NEW_KIB KiB by the end of the arm window; this run did not stop it" ;;
      change|start) log "the VM went off during the arm window; continuing without a shutdown" ;;
      *) finish preflight-failed 10 "the VM became '$STATE' with memory $CFG_MEM/$CFG_CUR KiB during the arm window; nothing was changed" ;;
    esac
  fi

  # The VM is off. From here every failure ends with the VM started again if the host can take it.
  set_phase changing "VM is off; checking it again before the change"
  observe
  if [ "$STATE" = running ]; then
    finish restarted-elsewhere 21 "something else started the VM before the change; definition unchanged"
  elif [ "$STATE" != "shut off" ]; then
    start_as_is "the VM was '$STATE' instead of shut off; memory not changed"
  elif ! check_identity; then
    start_as_is "the definition changed while the VM was off (${PROBLEMS[*]}); memory not changed"
  fi
  if [ "$CFG_MEM" != "$NEW_KIB" ] || [ "$CFG_CUR" != "$NEW_KIB" ]; then
    with_fleet_lock set_memory "$NEW_KIB"
    case $? in
      0) ;;
      3) recover_old "something besides memory changed in the definition" ;;
      *) recover_old "changing the memory to $NEW_KIB KiB failed" ;;
    esac
  fi

  set_phase starting "starting with $NEW_KIB KiB"
  have_room "$NEW_KIB" || recover_old "the host lacks memory to start with $NEW_KIB KiB"
  start_with_retry || recover_old "starting with $NEW_KIB KiB failed"

  set_phase verifying "checking the running VM"
  verify_running_target || finish started-unverified 22 "running, but not as expected: $VERIFY_PROBLEMS"
  guest_agent_wait
  finish upgraded 0 "running with $NEW_KIB KiB, $VCPUS vCPUs, the same pins, topology, disks and identity; guest agent $AGENT"
}

main() {
  case "${1:-preflight}" in
    preflight) cmd_preflight ;;
    launch) shift; cmd_launch "$@" ;;
    run) shift; cmd_run "$@" ;;
    status) cmd_status ;;
    *) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; return 2 ;;
  esac
}

main "$@"
exit $?
