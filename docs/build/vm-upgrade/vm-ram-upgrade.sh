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
# A run checks the fixed target (definition and running VM), records the
# definition, backs it up and waits an arm window (create CANCEL in the run
# folder to stop it). Nothing disruptive happens unless every record so far was
# written. It sends an ACPI shutdown and waits (never forced). Then, holding
# fleet-admin's lock, it reads the VM again, changes only <memory> and
# <currentMemory> in the persistent definition, starts the VM and checks it. A
# failure after the shutdown puts the old memory back (memory only, never a whole
# saved definition) and starts the VM if its memory is known and fits the host;
# otherwise it leaves it off and alerts. Killing this run, or a guest that powers
# off after the shutdown timeout, needs the owner (RUNBOOK.md).
# --rehearsal does every read-only step from a detached run and changes nothing.
set -uo pipefail
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
umask 022

# --- The one VM and the one change
VM_NAME=factory-worker
VM_UUID=ce0a610b-0a40-b2eb-1bfb-5a7203a24e22
OLD_KIB=12582912        # 12 GiB
NEW_KIB=16777216        # 16 GiB
GROWTH_KIB=$(( NEW_KIB - OLD_KIB ))
VCPUS=6
PINS="0:0 1:1 2:8 3:9 4:10 5:11"   # vCPU:host CPU, as in the definition
TOPOLOGY="<topology sockets='1' dies='1' clusters='1' cores='3' threads='2'/>"
DISKS="/mnt/user/domains/factory-worker/vdisk1.img
/mnt/user/domains/factory-worker/vdisk2.img"
RESERVE_KIB=2097152     # host MemAvailable that must be left once the VM has its RAM
MIN_FREE_KIB=10240      # free space the run folder needs before anything is stopped

# --- Where it keeps things
HOME_DIR=/mnt/user/appdata/fleet-vm-upgrade
RUNS="$HOME_DIR/runs"
BACKUPS=/boot/config/fleet/vm-backups
LOCK=/tmp/fleet-vm-ram-upgrade.lock
FLEET_LOCK=/tmp/fleet-admin.lock   # fleet-admin.sh holds it for vm define and other changes
NOTIFY=/usr/local/emhttp/webGui/scripts/notify
TOOLS="flock setsid timeout sha256sum virsh awk sed grep diff ps od mktemp df logger paste tr cut head readlink dirname basename"

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
READ_TRIES="${VMU_READ_TRIES:-5}"              # attempts for a VM read that fails
READ_RETRY_DELAY="${VMU_READ_RETRY_DELAY:-3}"
VIRSH_TIMEOUT="${VMU_VIRSH_TIMEOUT:-120}"      # a hung virsh call counts as failed
MEMINFO="${VMU_MEMINFO:-/proc/meminfo}"

die() { echo "vm-ram-upgrade: $*" >&2; exit 2; }
ts() { date -u +%FT%TZ; }
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
virsh() { timeout -k 10 "$VIRSH_TIMEOUT" virsh "$@"; }

[ -n "${EPOCHREALTIME:-}" ] || die "needs bash 5 or later"
for v in POLL ARM_DELAY SHUTDOWN_TIMEOUT ACPI_RESEND START_TIMEOUT START_RETRY_DELAY AGENT_TIMEOUT FLEET_LOCK_WAIT REHEARSAL_HOLD READ_RETRY_DELAY VIRSH_TIMEOUT; do
  [[ "${!v}" =~ ^[0-9]+(\.[0-9]+)?$ ]] || die "$v must be a number of seconds"
done
[[ "$READ_TRIES" =~ ^[1-9][0-9]*$ ]] || die "READ_TRIES must be a whole number of at least 1"

# need_tools: everything a run uses is on this host. Sets MISSING.
need_tools() {
  local t m=()
  for t in $TOOLS; do command -v "$t" >/dev/null || m+=("$t"); done
  [ -x "$NOTIFY" ] || m+=("$NOTIFY")
  MISSING="${m[*]:-}"
  [ ${#m[@]} -eq 0 ]
}

# --- Run records. A write that fails is remembered: before the shutdown it stops
# the run; after it, the VM is still brought back and the result says what is missing.

EVIDENCE_ERRORS=(); PROBLEMS=(); UNREAD=""; READ_ERR=""
note_failed_write() {
  local e
  for e in "${EVIDENCE_ERRORS[@]}"; do [ "$e" = "$1" ] && return 0; done
  EVIDENCE_ERRORS+=("$1")
}
log() { printf '%s %s\n' "$(ts)" "$*" 2>/dev/null || note_failed_write run.log; }

# put_file <file>: stdin into <file> through a new temporary file beside it.
# False if any step failed; never writes into a folder that has <file>'s name.
put_file() {
  local tmp
  tmp="$(mktemp "$(dirname -- "$1")/.$(basename -- "$1").XXXXXX" 2>/dev/null)" || return 1
  if cat > "$tmp" 2>/dev/null && chmod 644 "$tmp" && mv -fT -- "$tmp" "$1" 2>/dev/null; then return 0; fi
  rm -f -- "$tmp"; return 1
}
# save <name> <text>: a record in the run folder.
save() { printf '%s\n' "$2" | put_file "$RUN_DIR/$1" || { note_failed_write "$1"; return 1; }; }
# save_diff <name> <reference> <definition>: how a definition differs from the reference, memory aside.
save_diff() { save "$1" "$(diff <(printf '%s\n' "$2") <(strip_mem <<<"$3"))"; }
free_kib() { df -Pk "$1" 2>/dev/null | awk 'NR == 2 { print $4 }'; }
# can_write <dir>: a file can be created and removed there.
can_write() { local f; mkdir -p -- "$1" 2>/dev/null && f="$(mktemp "$1/.write-test.XXXXXX" 2>/dev/null)" && rm -f -- "$f"; }

# --- Reading the VM (never changes anything)

is_kib() { [[ "${1:-}" =~ ^[1-9][0-9]{0,9}$ ]]; }
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
# domstate: the VM's state; prints nothing and is false if it could not be read.
domstate() { local s; s="$(virsh domstate "$VM_UUID" 2>/dev/null)" && sed -n 1p <<<"$s"; }

# observe: the VM's state and memory, persistent (CFG_) and running (LIVE_).
# False, with READ_ERR saying why, if a read failed or a memory value is not a
# number of KiB. An unknown value is never taken as zero.
observe() {
  READ_ERR=""
  STATE="$(domstate)"
  [ -n "$STATE" ] || READ_ERR="its state could not be read"
  CFG_XML="$(virsh dumpxml --inactive "$VM_UUID" 2>/dev/null)" || CFG_XML=""
  CFG_MEM="$(xml_mem memory <<<"$CFG_XML")"
  CFG_CUR="$(xml_mem currentMemory <<<"$CFG_XML")"
  if [ -z "$CFG_XML" ]; then READ_ERR="${READ_ERR:+$READ_ERR; }its definition could not be read"
  elif ! is_kib "$CFG_MEM" || ! is_kib "$CFG_CUR"; then READ_ERR="${READ_ERR:+$READ_ERR; }its defined memory is not a number of KiB"; fi
  LIVE_XML=""; LIVE_MEM=""; LIVE_CUR=""
  if [ "$STATE" = running ]; then
    LIVE_XML="$(virsh dumpxml "$VM_UUID" 2>/dev/null)" || LIVE_XML=""
    LIVE_MEM="$(xml_mem memory <<<"$LIVE_XML")"
    LIVE_CUR="$(xml_mem currentMemory <<<"$LIVE_XML")"
    if [ -z "$LIVE_XML" ]; then READ_ERR="${READ_ERR:+$READ_ERR; }its running definition could not be read"
    elif ! is_kib "$LIVE_MEM" || ! is_kib "$LIVE_CUR"; then READ_ERR="${READ_ERR:+$READ_ERR; }its running memory is not a number of KiB"; fi
  fi
  [ -z "$READ_ERR" ]
}

# read_vm: observe, reading again while a read fails (READ_TRIES times).
read_vm() {
  local try
  for (( try = 1; ; try++ )); do
    observe && return 0
    [ "$try" -lt "$READ_TRIES" ] || { log "could not read the VM after $try tries: $READ_ERR"; return 1; }
    log "reading the VM failed ($READ_ERR); again in $READ_RETRY_DELAY s"
    sleep "$READ_RETRY_DELAY"
  done
}

# check_identity: the VM is the one this script was written for, apart from its
# memory. Fills PROBLEMS; sets UNREAD if a read failed. True if there are no problems.
check_identity() {
  PROBLEMS=(); UNREAD=""
  local uuid name pins disks d
  uuid="$(virsh domuuid "$VM_NAME" 2>/dev/null)" || UNREAD=1
  [ "$uuid" = "$VM_UUID" ] || PROBLEMS+=("the VM named $VM_NAME has UUID '${uuid:-none}', expected $VM_UUID")
  name="$(virsh domname "$VM_UUID" 2>/dev/null)" || UNREAD=1
  [ "$name" = "$VM_NAME" ] || PROBLEMS+=("UUID $VM_UUID is named '${name:-none}', expected $VM_NAME")
  INFO="$(virsh dominfo "$VM_UUID" 2>/dev/null)" || { UNREAD=1; INFO=""; }
  grep -Eq '^Persistent: +yes$' <<<"$INFO" || PROBLEMS+=("the VM is not persistent")
  grep -Eq '^Autostart: +enable$' <<<"$INFO" || PROBLEMS+=("autostart is not enabled")
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
  [ ${#PROBLEMS[@]} -eq 0 ]
}

# check_live: the running VM, not just its definition, has the same vCPUs,
# pins, topology and disks. Adds to PROBLEMS; sets UNREAD if a read failed.
check_live() {
  local out pins cpus disks
  grep -Fq "<vcpu placement='static'>$VCPUS</vcpu>" <<<"$LIVE_XML" || PROBLEMS+=("running: the vCPU count is not $VCPUS")
  grep -Fq "$TOPOLOGY" <<<"$LIVE_XML" || PROBLEMS+=("running: the CPU topology is not $TOPOLOGY")
  disks="$(xml_disks <<<"$LIVE_XML")"
  [ "$disks" = "$DISKS" ] || PROBLEMS+=("running: its disks are '${disks//$'\n'/ }'")
  cpus="$(sed -n 's/^CPU(s): *//p' <<<"$INFO")"
  [ "$cpus" = "$VCPUS" ] || PROBLEMS+=("running: $cpus vCPUs")
  if out="$(virsh vcpupin "$VM_UUID" 2>/dev/null)"; then
    pins="$(awk '$1 ~ /^[0-9]+$/ { printf "%s%s:%s", sep, $1, $2; sep = " " }' <<<"$out")"
    [ "$pins" = "$PINS" ] || PROBLEMS+=("running: vCPU pins are '$pins'")
  else
    UNREAD=1; PROBLEMS+=("running: its vCPU pins could not be read")
  fi
}

# examine: observe and check the fixed target (the running VM too, if it runs),
# reading again while a read fails. 0: as expected; 1: something differs
# (PROBLEMS); 2: its state or memory could not be read (READ_ERR).
examine() {
  local try
  for (( try = 1; ; try++ )); do
    if observe; then
      check_identity
      [ "$STATE" != running ] || check_live
      [ -n "$UNREAD" ] || break
    fi
    [ "$try" -lt "$READ_TRIES" ] || break
    log "reading the VM failed (${READ_ERR:-${PROBLEMS[*]}}); again in $READ_RETRY_DELAY s"
    sleep "$READ_RETRY_DELAY"
  done
  [ -z "$READ_ERR" ] || return 2
  [ ${#PROBLEMS[@]} -eq 0 ]
}

# classify: what is left to do. The only states handled (persistent memory as
# maximum/current, running memory likewise, in GiB):
#   running  12/12 or 16/12, running 12/12  full     shut down, change, start
#   running  16/16, running 12/12           restart  shut down, start
#   running  16/16, running 16/16           done     nothing
#   shut off 12/12 or 16/12                 change   change, start
#   shut off 16/16                          start    start
# 16/12 is a change that stopped between its two steps. Anything else: unexpected.
classify() {
  local cfg
  case "$CFG_MEM/$CFG_CUR" in
    "$OLD_KIB/$OLD_KIB"|"$NEW_KIB/$OLD_KIB") cfg=old ;;
    "$NEW_KIB/$NEW_KIB") cfg=new ;;
    *) echo unexpected; return ;;
  esac
  case "$STATE:$cfg:$LIVE_MEM/$LIVE_CUR" in
    "running:old:$OLD_KIB/$OLD_KIB") echo full ;;
    "running:new:$OLD_KIB/$OLD_KIB") echo restart ;;
    "running:new:$NEW_KIB/$NEW_KIB") echo done ;;
    "shut off:old:/") echo change ;;
    "shut off:new:/") echo start ;;
    *) echo unexpected ;;
  esac
}
describe() { echo "state '${STATE:-unknown}', defined ${CFG_MEM:-?}/${CFG_CUR:-?} KiB, running ${LIVE_MEM:-none}/${LIVE_CUR:-none} KiB"; }

mem_available() { awk '/^MemAvailable:/ { print $2 }' "$MEMINFO" 2>/dev/null; }
# have_room <kib>: the host can give the VM <kib> more and keep the reserve.
# False if <kib> or MemAvailable is not a known number.
have_room() {
  local avail
  is_kib "${1:-}" || { log "the memory needed is not known ('${1:-}'); not enough is assumed"; return 1; }
  avail="$(mem_available)"
  [[ "$avail" =~ ^[0-9]+$ ]] || { log "cannot read MemAvailable from $MEMINFO"; return 1; }
  log "host MemAvailable $avail KiB; needs $1 KiB plus the $RESERVE_KIB KiB reserve"
  [ "$avail" -ge $(( $1 + RESERVE_KIB )) ]
}

# --- Run bookkeeping: state.json while it runs, result.json at the end

set_phase() {
  PHASE="$1"
  [ -z "${2:-}" ] || log "phase $PHASE: $2"
  printf '{"run_id":%s,"phase":%s,"message":%s,"plan":%s,"rehearsal":%s,"pid":%s,"sid":%s,"updated_at":%s}\n' \
    "$(json_str "$RUN_ID")" "$(json_str "$PHASE")" "$(json_str "${2:-}")" "$(json_str "${PLAN:-}")" \
    "$REHEARSAL" "$$" "$(json_str "$SID")" "$(json_str "$(ts)")" \
    | put_file "$RUN_DIR/state.json" || { note_failed_write state.json; return 1; }
}

# ready_to_disrupt: everything so far was written and the run folder has room;
# otherwise stop here, before anything is stopped or changed.
ready_to_disrupt() {
  local free
  free="$(free_kib "$RUN_DIR")"
  [[ "$free" =~ ^[0-9]+$ ]] && [ "$free" -ge "$MIN_FREE_KIB" ] || note_failed_write "run folder (only '${free:-?}' KiB free, needs $MIN_FREE_KIB)"
  [ ! -e "$RUN_DIR/result.json" ] || note_failed_write "result.json (something already has its name)"
  [ ${#EVIDENCE_ERRORS[@]} -eq 0 ] \
    || finish preflight-failed 10 "could not write ${EVIDENCE_ERRORS[*]} in $RUN_DIR; nothing was stopped or changed"
}

# tell_owner <level> <subject> <text>: Unraid's notification, and the host's syslog
# as a second channel in case the run folder could not be written.
tell_owner() {
  "$NOTIFY" -e "factory-worker RAM upgrade" -s "$2" -d "$3" -i "$1" < /dev/null > /dev/null 2>&1 8>&- 9>&- \
    || log "the Unraid notification could not be sent"
  logger -t fleet-vm-upgrade -- "$2: $3" < /dev/null > /dev/null 2>&1 8>&- 9>&- \
    || log "the syslog message could not be written"
}

# finish <outcome> <exit code> <message>: record the result, tell the owner, exit.
# Success is only reported with every record written and result.json published.
finish() {
  local outcome="$1" code="$2" msg="$3" vm_outcome="$1" level=alert launcher=unknown subject
  FINISHED=1
  release_fleet_lock
  observe
  [ -n "$LAUNCHER_PID" ] && { kill -0 "$LAUNCHER_PID" 2>/dev/null && launcher=yes || launcher=no; }
  if [ ${#EVIDENCE_ERRORS[@]} -gt 0 ]; then
    msg="$msg; could not write: ${EVIDENCE_ERRORS[*]}"
    [ "$code" != 0 ] || { outcome=evidence-incomplete; code=23; }
  fi
  {
    printf '{"run_id":%s,"outcome":%s,"exit_code":%s,"message":%s,' "$(json_str "$RUN_ID")" "$(json_str "$outcome")" "$code" "$(json_str "$msg")"
    printf '"vm_outcome":%s,"evidence_errors":%s,' "$(json_str "$vm_outcome")" "$(json_str "${EVIDENCE_ERRORS[*]:-}")"
    printf '"rehearsal":%s,"plan":%s,"last_phase":%s,' "$REHEARSAL" "$(json_str "${PLAN:-}")" "$(json_str "${PHASE:-}")"
    printf '"vm":{"state":%s,"config_memory_kib":%s,"config_current_kib":%s,"live_memory_kib":%s,"live_current_kib":%s},' \
      "$(json_str "$STATE")" "$(json_str "$CFG_MEM")" "$(json_str "$CFG_CUR")" "$(json_str "$LIVE_MEM")" "$(json_str "$LIVE_CUR")"
    printf '"guest_agent":%s,"backup":%s,"script_sha256":%s,' "$(json_str "${AGENT:-not checked}")" "$(json_str "${BACKUP:-}")" "$(json_str "$SCRIPT_SHA")"
    printf '"pid":%s,"sid":%s,"launcher_pid":%s,"launcher_alive_at_finish":%s,' "$$" "$(json_str "$SID")" "$(json_str "$LAUNCHER_PID")" "$(json_str "$launcher")"
    printf '"overrides":%s,"started_at":%s,"finished_at":%s}\n' "$(json_str "$(overrides)")" "$(json_str "$STARTED_AT")" "$(json_str "$(ts)")"
  } | put_file "$RUN_DIR/result.json"
  if [ $? -ne 0 ]; then
    code=32; msg="result.json could NOT be written; the run ended '$outcome' (VM: $vm_outcome): $msg"
  fi
  set_phase finished "$outcome"
  log "RESULT $outcome (exit $code): $msg"
  log "VM now: $(describe)"
  log "all VMs at the end:"; virsh list --all 2>&1 | sed 's/^/  | /'
  case "$code" in
    0) level=normal ;;
    1[0-9]) [ "$STATE" = running ] && level=warning ;;
  esac
  subject="factory-worker upgrade: $vm_outcome"
  [ ${#EVIDENCE_ERRORS[@]} -eq 0 ] || subject="$subject, records incomplete"
  [ "$code" != 32 ] || subject="$subject, result NOT written"
  tell_owner "$level" "$subject" "$msg (run $RUN_ID)"
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
  out="$(virsh "$@" 2>&1 8>&- 9>&-)"; rc=$?
  [ -z "$out" ] || log "  | ${out//$'\n'/$'\n'  | }"
  return "$rc"
}

# take_fleet_lock: fleet-admin.sh's lock, held until release_fleet_lock or the end
# of the run. Its vm define, snapshot and file verbs wait for it; its vm start,
# shutdown and resize do not, so those need the owner's exclusion window (RUNBOOK.md).
take_fleet_lock() {
  exec 9>"$FLEET_LOCK" || { log "cannot open $FLEET_LOCK"; return 1; }
  if flock -w "$FLEET_LOCK_WAIT" 9; then FLEET_LOCKED=1; return 0; fi
  exec 9>&-; log "fleet-admin's lock was busy for $FLEET_LOCK_WAIT s"; return 1
}
release_fleet_lock() { [ -z "${FLEET_LOCKED:-}" ] || { exec 9>&-; FLEET_LOCKED=""; }; }

# set_memory <kib> <reference>: memory and current memory in the persistent
# definition, and nothing else. <reference> is the definition, memory aside, as it
# must be when the change starts. 0: done; 4: the definition differs from it, nothing
# written; 1: the change failed; 3: changed, but something besides memory now
# differs too (left as it is; the caller decides).
set_memory() {
  local kib="$1" ref="$2" before after
  before="$(virsh dumpxml --inactive "$VM_UUID" 2>/dev/null)" && [ -n "$before" ] || { log "cannot read the definition"; return 1; }
  save "definition-before-$kib.xml" "$before"
  if [ "$(strip_mem <<<"$before")" != "$ref" ]; then
    save_diff "unexpected-diff-$kib.txt" "$ref" "$before"
    log "the definition changed just before the change (unexpected-diff-$kib.txt); memory not written"; return 4
  fi
  # Raising: the maximum first, then current up to it. Lowering: the maximum alone
  # also brings current down, so a rollback still works if setmem is what failed.
  vdo setmaxmem "$VM_UUID" "$kib" --config || return 1
  if [ "$(virsh dumpxml --inactive "$VM_UUID" 2>/dev/null | xml_mem currentMemory)" != "$kib" ]; then
    vdo setmem "$VM_UUID" "$kib" --config || return 1
  fi
  after="$(virsh dumpxml --inactive "$VM_UUID" 2>/dev/null)" || after=""
  save "definition-after-$kib.xml" "$after"
  if [ "$(xml_mem memory <<<"$after")" != "$kib" ] || [ "$(xml_mem currentMemory <<<"$after")" != "$kib" ]; then
    log "the definition does not show $kib KiB after the change"; return 1
  fi
  if [ "$(strip_mem <<<"$after")" != "$ref" ]; then
    save_diff "unexpected-diff-$kib.txt" "$ref" "$after"
    log "more than memory differs in the definition; see unexpected-diff-$kib.txt"; return 3
  fi
  log "definition memory is now $kib KiB; nothing else in it changed"
}

backup_definition() {
  local xml
  BACKUP="$BACKUPS/$VM_NAME-$RUN_ID.xml"
  xml="$(virsh dumpxml --inactive --security-info "$VM_UUID" 2>/dev/null)" && [ -n "$xml" ] \
    && mkdir -p "$BACKUPS" && ( umask 077; printf '%s\n' "$xml" > "$BACKUP" ) 2>/dev/null && [ -s "$BACKUP" ] \
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

# verify_running_target: running with 16 GiB, the same CPUs, pins, topology, disks
# and identity, and nothing besides memory changed in its definition.
verify_running_target() {
  local bad=()
  examine
  case $? in 1) bad+=("${PROBLEMS[@]}") ;; 2) bad+=("$READ_ERR") ;; esac
  [ "$(classify)" = done ] || bad+=("$(describe)")
  [ "$(strip_mem <<<"$CFG_XML")" = "$REF" ] || bad+=("its definition differs from before this run besides memory")
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

# start_as_is <why>: the VM is off; start it with whatever it is defined with now,
# if that memory is known and fits the host. Memory is not changed.
start_as_is() {
  local ok=0
  set_phase starting-as-is "$1"
  read_vm || ok=1
  [ "$STATE" = running ] && finish restarted-elsewhere 21 "$1; it is running (something else started it)"
  [ "$ok" = 0 ] || finish left-off 30 "$1; its memory could not be read ($READ_ERR), so it is not started"
  [ "$STATE" = "shut off" ] || finish needs-owner 30 "$1; the VM is '$STATE'; nothing more was done"
  have_room "$CFG_MEM" || finish left-off 30 "$1; the host lacks memory to start it with $CFG_MEM KiB, so it is left shut off"
  start_with_retry || finish left-off 30 "$1; starting it failed, so it is left shut off"
  finish started-as-is 21 "$1; started with its definition as it is ($CFG_MEM/$CFG_CUR KiB)"
}

# recover_old <why>: after a failure with the VM off and fleet-admin's lock held,
# put this run's 16 GiB back to 12 GiB (memory only) and start it. Reads the VM
# again first: a VM someone else started, or memory this run did not set, is not written.
recover_old() {
  local ok=0
  set_phase recovering "$1"
  read_vm || ok=1
  [ "$STATE" = running ] && finish restarted-elsewhere 21 "$1; the VM is running again (something else started it); memory not written again"
  [ "$ok" = 0 ] || finish left-off 30 "$1; the VM could not be read afterwards ($READ_ERR), so it is not started"
  [ "$STATE" = "shut off" ] || finish needs-owner 30 "$1; the VM is '$STATE'; nothing more was done"
  case "$CFG_MEM/$CFG_CUR" in
    "$OLD_KIB/$OLD_KIB") ;;
    "$NEW_KIB/$NEW_KIB"|"$NEW_KIB/$OLD_KIB")
      set_memory "$OLD_KIB" "$(strip_mem <<<"$CFG_XML")"
      case $? in
        0) ;;
        3) log "memory is back to $OLD_KIB KiB; something else changed in the definition meanwhile and was left as it is" ;;
        *) start_as_is "$1; putting $OLD_KIB KiB back failed too" ;;
      esac ;;
    *) start_as_is "$1; its memory is $CFG_MEM/$CFG_CUR KiB, which this run did not set, so it is not changed" ;;
  esac
  ok=0; read_vm || ok=1
  [ "$STATE" = running ] && finish restarted-elsewhere 21 "$1; the VM is running again (something else started it)"
  [ "$ok" = 0 ] || finish left-off 30 "$1; the VM could not be read after the rollback ($READ_ERR), so it is not started"
  if [ "$(strip_mem <<<"$CFG_XML")" != "$REF" ]; then
    save_diff changed-besides-memory.txt "$REF" "$CFG_XML"
    log "note: apart from memory, the definition differs from before this run (changed-besides-memory.txt); this script did not undo that"
  fi
  have_room "$CFG_MEM" || finish left-off 30 "$1; old memory restored, but the host lacks memory to start it safely, so it is left shut off"
  start_with_retry || finish left-off 30 "$1; old memory restored, but it would not start; it is left shut off"
  finish rolled-back-started-old 20 "$1; started again with $CFG_MEM/$CFG_CUR KiB"
}

# upgrade_offline: the VM is off. Under fleet-admin's lock, read it again and
# check it against what was checked before, change its memory and start it.
# From here every failure ends with the VM started if its memory is known and
# fits the host, or left off with an alert.
upgrade_offline() {
  local rc
  set_phase changing "the VM is off; waiting up to $FLEET_LOCK_WAIT s for fleet-admin's lock"
  take_fleet_lock || start_as_is "fleet-admin's lock stayed busy for $FLEET_LOCK_WAIT s; memory not changed"
  log "holding fleet-admin's lock; checking the VM again"
  examine; rc=$?
  [ "$STATE" = running ] && finish restarted-elsewhere 21 "something else started the VM before the change; memory not changed"
  [ "$rc" = 2 ] && finish left-off 30 "the VM could not be read once off ($READ_ERR); nothing was changed or started"
  [ "$STATE" = "shut off" ] || finish needs-owner 30 "the VM is '$STATE', neither running nor shut off; nothing was changed or started"
  [ "$rc" = 0 ] || start_as_is "the VM changed while it was off (${PROBLEMS[*]}); memory not changed"
  if [ "$(strip_mem <<<"$CFG_XML")" != "$REF" ]; then
    save_diff changed-while-off.txt "$REF" "$CFG_XML"
    start_as_is "its definition changed besides memory while it was off (changed-while-off.txt); memory not changed"
  fi
  PLAN="$(classify)"
  case "$PLAN" in
    change)
      set_memory "$NEW_KIB" "$REF"
      case $? in
        0) ;;
        4) start_as_is "its definition changed just before the change; memory not changed" ;;
        3) recover_old "something besides memory changed in the definition" ;;
        *) recover_old "changing the memory to $NEW_KIB KiB failed" ;;
      esac ;;
    start) log "the definition already has $NEW_KIB KiB" ;;
    *) start_as_is "its memory became $CFG_MEM/$CFG_CUR KiB while it was off, which this run did not set; memory not changed" ;;
  esac

  set_phase starting "starting with $NEW_KIB KiB"
  have_room "$NEW_KIB" || recover_old "the host lacks memory to start with $NEW_KIB KiB"
  start_with_retry || recover_old "starting with $NEW_KIB KiB failed"
  release_fleet_lock

  set_phase verifying "checking the running VM"
  verify_running_target || finish started-unverified 22 "running, but not as expected: $VERIFY_PROBLEMS"
  guest_agent_wait
  finish upgraded 0 "running with $NEW_KIB KiB, $VCPUS vCPUs, the same pins, topology, disks and identity; guest agent $AGENT"
}

# --- Commands

cmd_preflight() {
  local ok=0 rc
  need_tools || { ok=1; echo "problem: missing on this host: $MISSING"; }
  examine; rc=$?
  echo "VM $VM_NAME ($VM_UUID): state '${STATE:-unknown}'"
  echo "memory: defined $CFG_MEM/$CFG_CUR KiB, running ${LIVE_MEM:-none}/${LIVE_CUR:-none} KiB (from $OLD_KIB to $NEW_KIB)"
  case "$rc" in
    0) echo "identity, CPUs, pins, topology, disks, autostart (and the running VM's): as expected" ;;
    1) ok=1; printf 'problem: %s\n' "${PROBLEMS[@]}" ;;
    *) ok=1; echo "problem: $READ_ERR" ;;
  esac
  PLAN="$(classify)"; echo "plan: $PLAN"
  [ "$PLAN" = unexpected ] && { ok=1; echo "problem: $(describe) is not a state this script handles"; }
  case "$PLAN" in full|restart) have_room "$GROWTH_KIB" || { ok=1; echo "problem: not enough host memory"; } ;; esac
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
  need_tools || die "missing on this host: $MISSING; nothing was started"
  run_id="$(date -u +%Y%m%dT%H%M%SZ)-$(od -An -N2 -tx1 /dev/urandom | tr -d ' \n')"
  dir="$RUNS/$run_id"
  mkdir -p "$RUNS" && mkdir "$dir" || die "cannot create $dir"
  # The run uses its own root-owned copy, so a change to the staged file cannot reach it.
  cp -- "$self" "$dir/vm-ram-upgrade.sh" && [ "$(sha_of "$dir/vm-ram-upgrade.sh")" = "$expect" ] \
    || die "the copy in $dir does not match; nothing was started"
  printf '{"run_id":%s,"launcher_pid":%s,"launcher_sid":%s,"launched_at":%s,"expect_sha256":%s,"rehearsal":%s}\n' \
    "$(json_str "$run_id")" "$$" "$(json_str "$(my_sid $$)")" "$(json_str "$(ts)")" "$(json_str "$expect")" \
    "$([ ${#rehearsal[@]} -gt 0 ] && echo true || echo false)" > "$dir/launch.json" \
    || die "cannot write $dir/launch.json; nothing was started"
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
  REHEARSAL=false; LAUNCHER_PID=""; RUN_DIR=""; PLAN=""; PHASE=start; AGENT=""; BACKUP=""; REF=""; SHUTDOWN_SENT=""
  STATE=""; CFG_XML=""; CFG_MEM=""; CFG_CUR=""; LIVE_XML=""; LIVE_MEM=""; LIVE_CUR=""; SID=""; STARTED_AT="$(ts)"; SCRIPT_SHA=""
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
  if [ -t 1 ]; then exec > >(tee -a "$RUN_DIR/run.log") 2>&1
  else exec >> "$RUN_DIR/run.log" 2>&1 || die "cannot open $RUN_DIR/run.log; nothing was done"; fi
  trap '' HUP
  trap on_exit EXIT
  trap on_exit TERM INT   # ignored while finish is already recording a result
  SID="$(my_sid $$)"; SCRIPT_SHA="$(sha_of "$0")"
  log "run $RUN_ID: pid $$, session $SID, launcher ${LAUNCHER_PID:-none}, rehearsal $REHEARSAL"
  log "script $(readlink -f -- "$0") sha256 $SCRIPT_SHA; overrides: $(overrides)"
  need_tools || finish preflight-failed 10 "missing on this host: $MISSING; nothing was changed"
  set_phase preflight "checking $VM_NAME" || finish preflight-failed 10 "cannot write $RUN_DIR/state.json; nothing was changed"

  exec 8>"$LOCK"
  flock -n 8 || finish locked 11 "another run holds $LOCK; nothing was done"
  log "all VMs at the start:"; virsh list --all 2>&1 | sed 's/^/  | /'

  examine
  case $? in
    1) finish preflight-failed 10 "not the expected VM: ${PROBLEMS[*]}; nothing was changed" ;;
    2) finish preflight-failed 10 "the VM could not be read: $READ_ERR; nothing was changed" ;;
  esac
  PLAN="$(classify)"
  log "$(describe): plan '$PLAN'"
  [ "$PLAN" = unexpected ] && finish preflight-failed 10 "$(describe) is not a state this script handles; nothing was changed"
  if [ "$PLAN" = done ]; then
    [ "$REHEARSAL" = true ] && finish rehearsal-ok 0 "already running with $NEW_KIB KiB and as expected; a real run would do nothing"
    finish already-upgraded 0 "already running with $NEW_KIB KiB and as expected; nothing to do, the VM was not stopped"
  fi
  if [ "$PLAN" = full ] || [ "$PLAN" = restart ]; then
    have_room "$GROWTH_KIB" || finish preflight-failed 10 "the host lacks memory for $NEW_KIB KiB; nothing was changed"
  fi
  # What the definition must still be, memory aside, when the change is made.
  REF="$(strip_mem <<<"$CFG_XML")"
  save definition-reference.xml "$REF"
  can_write "$BACKUPS" || finish preflight-failed 10 "cannot write backups to $BACKUPS; nothing was changed"

  if [ "$REHEARSAL" = true ]; then
    take_fleet_lock || finish preflight-failed 10 "could not take fleet-admin's lock $FLEET_LOCK; nothing was changed"
    release_fleet_lock
    set_phase rehearsal-hold "plan '$PLAN'; holding $REHEARSAL_HOLD s to outlive the launcher; nothing will be changed"
    ready_to_disrupt
    sleep "$REHEARSAL_HOLD"
    examine || finish preflight-failed 10 "the VM changed or could not be read during the rehearsal: ${READ_ERR:-${PROBLEMS[*]}}"
    [ "$(classify)" = "$PLAN" ] || finish preflight-failed 10 "the VM changed during the rehearsal: $(describe)"
    if [ "$(strip_mem <<<"$CFG_XML")" != "$REF" ]; then
      save_diff changed-during-rehearsal.txt "$REF" "$CFG_XML"
      finish preflight-failed 10 "the definition changed during the rehearsal (changed-during-rehearsal.txt)"
    fi
    ready_to_disrupt
    finish rehearsal-ok 0 "plan '$PLAN'; the detached run (session $SID) outlived its launcher, read the VM twice the same, wrote its records and changed nothing"
  fi

  backup_definition || finish preflight-failed 10 "could not back up the definition to $BACKUPS; nothing was changed"

  if [ "$PLAN" = full ] || [ "$PLAN" = restart ]; then
    arm_window || finish cancelled 12 "CANCEL found before the shutdown; nothing was changed"
    # Look again: something else may have changed the VM during the window.
    examine
    case $? in
      1) finish preflight-failed 10 "the VM changed during the arm window: ${PROBLEMS[*]}; it was not stopped" ;;
      2) finish preflight-failed 10 "the VM could not be read at the end of the arm window: $READ_ERR; it was not stopped" ;;
    esac
    PLAN="$(classify)"
    case "$PLAN" in
      full|restart)
        if [ "$(strip_mem <<<"$CFG_XML")" != "$REF" ]; then
          save_diff changed-while-armed.txt "$REF" "$CFG_XML"
          finish preflight-failed 10 "the definition changed during the arm window (changed-while-armed.txt); it was not stopped"
        fi
        have_room "$GROWTH_KIB" || finish preflight-failed 10 "the host lacks memory for $NEW_KIB KiB; it was not stopped"
        set_phase shutting-down "ACPI shutdown; waiting up to $SHUTDOWN_TIMEOUT s, never forced"
        ready_to_disrupt
        SHUTDOWN_SENT=1
        shutdown_and_wait || finish shutdown-timeout 13 "still '$(domstate)' after $SHUTDOWN_TIMEOUT s of ACPI shutdown; not forced, definition unchanged. If the guest powers off later it stays off: the owner relaunches or starts it"
        ;;
      done) finish already-upgraded 0 "running with $NEW_KIB KiB and as expected by the end of the arm window; this run did not stop it" ;;
      change|start) log "the VM went off during the arm window; continuing without a shutdown" ;;
      *) finish preflight-failed 10 "the VM became $(describe) during the arm window; nothing was changed" ;;
    esac
  fi
  [ -n "$SHUTDOWN_SENT" ] || ready_to_disrupt
  upgrade_offline
}

main() {
  case "${1:-preflight}" in
    preflight) cmd_preflight ;;
    launch) shift; cmd_launch "$@" ;;
    run) shift; cmd_run "$@" ;;
    status) cmd_status ;;
    *) sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; return 2 ;;
  esac
}

main "$@"
exit $?
