#!/usr/bin/env bash
# Give factory-worker the RTX 3090 (host functions 0000:01:00.0 and .1), or take it back.
# Runs on the Unraid host as root. README.md explains why this is a cold change.
#
#   bash host-gpu.sh [preflight] [attach|detach]   read-only checks and host facts (default: attach)
#   bash host-gpu.sh status                        the latest run
#   bash host-gpu.sh launch attach|detach --expect-sha256 <sha> --not-after <epoch> [--rehearsal]
#
# A real launch is one detached host-side run that needs nothing from its caller:
# check -> arm 60 s (CANCEL file) -> ACPI shutdown, never forced -> add or remove
# only our two <hostdev> entries -> start -> verify -> result.json. On any failure
# after the shutdown it puts the definition back as it was and starts the VM.
# --rehearsal runs the same checks, records and locks, then stops before the shutdown.
set -uo pipefail

# --- The fixed target
VM_NAME=factory-worker
VM_UUID=ce0a610b-0a40-b2eb-1bfb-5a7203a24e22
GPU=0000:01:00.0 GPU_ID=10de:2204 GPU_CLASS=0x0300   # GA102 [GeForce RTX 3090], VGA
AUD=0000:01:00.1 AUD_ID=10de:1aef AUD_CLASS=0x0403   # GA102 HD audio
OURS="$GPU $AUD"
GUEST_BUS=0x06          # pcie-root-port index 6: the only free port in today's definition
ROOT_PORT_INDEX=6
RESERVE_KIB=2621440     # host MemAvailable left once all guest RAM is pinned (2.5 GiB, includes QEMU overhead)
MAX_PREF64_KIB=8388608  # refuse 64-bit prefetchable BARs above 8 GiB (resizable BAR): the guest window is 32 GiB

HOME_DIR=/mnt/user/appdata/fleet-gpu
RUNS="$HOME_DIR/runs"
BACKUPS=/boot/config/fleet/vm-backups
LOCK=/tmp/fleet-gpu.lock
FLEET_LOCK=/tmp/fleet-admin.lock   # fleet-admin.sh takes it for vm define and other definition changes
NOTIFY=/usr/local/emhttp/webGui/scripts/notify
TOOLS="flock setsid timeout sha256sum virsh awk sed grep diff ps od mktemp logger paste sort readlink basename"

# GPU_* overrides exist for the offline tests; every run logs the ones in effect.
SYSFS="${GPU_SYSFS:-/sys}"
MEMINFO="${GPU_MEMINFO:-/proc/meminfo}"
IOMEM="${GPU_IOMEM:-/proc/iomem}"
PROC="${GPU_PROC:-/proc}"
PIDDIR="${GPU_PIDDIR:-/var/run/libvirt/qemu}"
POLL="${GPU_POLL:-5}"
ARM_DELAY="${GPU_ARM_DELAY:-60}"
SHUTDOWN_TIMEOUT="${GPU_SHUTDOWN_TIMEOUT:-600}"   # two clean shutdowns on 2026-10-19 took about 1 s
ACPI_RESEND="${GPU_ACPI_RESEND:-300}"
START_TIMEOUT="${GPU_START_TIMEOUT:-120}"
START_RETRY_DELAY="${GPU_START_RETRY_DELAY:-10}"
AGENT_TIMEOUT="${GPU_AGENT_TIMEOUT:-600}"
FLEET_LOCK_WAIT="${GPU_FLEET_LOCK_WAIT:-120}"
REHEARSAL_HOLD="${GPU_REHEARSAL_HOLD:-30}"
VIRSH_TIMEOUT="${GPU_VIRSH_TIMEOUT:-120}"

die() { echo "host-gpu: $*" >&2; exit 2; }
ts() { date -u +%FT%TZ; }
sha_of() { sha256sum < "$1" | cut -d' ' -f1; }
my_sid() { ps -o sid= -p "$1" 2>/dev/null | tr -d ' '; }
json_str() { local s="${1//\\/\\\\}"; s="${s//\"/\\\"}"; s="${s//$'\n'/\\n}"; printf '"%s"' "${s//$'\t'/ }"; }
overrides() { env | grep -E '^GPU_' | sort | paste -sd' ' -; }
virsh() { timeout -k 10 "$VIRSH_TIMEOUT" virsh "$@"; }
log() { printf '%s %s\n' "$(ts)" "$*"; }

need_tools() {
  local t; MISSING=""
  for t in $TOOLS; do command -v "$t" >/dev/null 2>&1 || MISSING="$MISSING $t"; done
  [ -x "$NOTIFY" ] || MISSING="$MISSING notify"
  [ -z "$MISSING" ]
}

# --- Reading the VM

domstate() { virsh domstate "$VM_UUID" 2>/dev/null | sed -n 1p; }
cfg_xml() { virsh dumpxml --inactive "$VM_UUID" 2>/dev/null; }
live_xml() { virsh dumpxml "$VM_UUID" 2>/dev/null; }

# Sources of every <hostdev> in a definition, sorted: 0000:01:00.0 for a PCI source,
# "other" for any hostdev without one (USB, mdev, ...), so that it is never overlooked.
hostdev_srcs() {
  awk '/<hostdev /{h=1; s=0; got=0} h && /<source>/{s=1}
    h && s && /<address .*domain=.*function=/ {
      d=$0; sub(/.*domain=.0x/, "", d); sub(/[^0-9a-fA-F].*/, "", d)
      b=$0; sub(/.* bus=.0x/, "", b); sub(/[^0-9a-fA-F].*/, "", b)
      l=$0; sub(/.*slot=.0x/, "", l); sub(/[^0-9a-fA-F].*/, "", l)
      f=$0; sub(/.*function=.0x/, "", f); sub(/[^0-9a-fA-F].*/, "", f)
      printf "%s:%s:%s.%s\n", tolower(d), tolower(b), tolower(l), tolower(f); s=0; got=1 }
    h && /<\/hostdev>/ { if (!got) print "other"; h=0 }' | sort | paste -sd' ' -
}
strip_hostdev() { awk '/<hostdev /{skip=1} !skip{print} /<\/hostdev>/{skip=0}'; }
xml_mem() { sed -n "s/^ *<memory unit='KiB'>\([0-9]*\)<\/memory>.*/\1/p" | head -1; }
# The lines that identify the VM and its layout; a change to any of them while the
# run waits means someone else is changing the VM, and the run backs off.
fingerprint() {
  grep -E "<(name|uuid)>|<(memory|currentMemory|vcpu) |<vcpupin |<topology |<type arch=|<source file=|<controller type='pci' |<address type='pci' |<hostdev " \
    | sed -E 's/^ +//' | sha256sum | cut -d' ' -f1
}

hostdev_xml() { # <function 0|1>: one of our two entries, as attach-device wants it
  local mf=""; [ "$1" = 0 ] && mf=" multifunction='on'"
  cat <<EOF
<hostdev mode='subsystem' type='pci' managed='yes'>
  <driver name='vfio'/>
  <source>
    <address domain='0x0000' bus='0x01' slot='0x00' function='0x$1'/>
  </source>
  <address type='pci' domain='0x0000' bus='$GUEST_BUS' slot='0x00' function='0x$1'$mf/>
</hostdev>
EOF
}

# --- Checks. Each adds to PROBLEMS; facts go to FACTS for the record.

problem() { PROBLEMS+=("$*"); }
fact() { FACTS+=("$*"); }

dev_driver() { local d="$SYSFS/bus/pci/devices/$1/driver"; [ -e "$d" ] && basename "$(readlink -f "$d")" || echo none; }

check_gpu() {
  local f id class drv dir members m mclass line start end flags size pref64=0 total=0 bars="" addr want_id want_class
  for f in "$GPU $GPU_ID $GPU_CLASS" "$AUD $AUD_ID $AUD_CLASS"; do
    read -r addr want_id want_class <<<"$f"
    dir="$SYSFS/bus/pci/devices/$addr"
    if [ ! -d "$dir" ]; then problem "host PCI device $addr is missing"; continue; fi
    id="$(sed 's/^0x//' "$dir/vendor" 2>/dev/null):$(sed 's/^0x//' "$dir/device" 2>/dev/null)"
    class="$(cut -c1-6 "$dir/class" 2>/dev/null)"
    drv="$(dev_driver "$addr")"
    fact "$addr id $id class $class host driver $drv"
    [ "$id" = "$want_id" ] || problem "$addr is $id, not the expected $want_id"
    [ "$class" = "$want_class" ] || problem "$addr has class $class, not $want_class"
    case "$drv" in vfio-pci|none) ;; *) problem "$addr is in use on the host by driver $drv" ;; esac
  done
  dir="$SYSFS/bus/pci/devices/$GPU"
  [ -d "$dir" ] || return
  # The IOMMU group may hold only our two functions and PCI bridges.
  members="$(ls "$dir/iommu_group/devices" 2>/dev/null | sort | paste -sd' ' -)"
  fact "IOMMU group $(basename "$(readlink -f "$dir/iommu_group" 2>/dev/null)"): ${members:-unreadable}"
  [ -n "$members" ] || problem "the IOMMU group of $GPU cannot be read (IOMMU off?)"
  for m in $members; do
    case " $OURS " in *" $m "*) continue ;; esac
    mclass="$(cut -c1-6 "$SYSFS/bus/pci/devices/$m/class" 2>/dev/null)"
    [ "$mclass" = 0x0604 ] || problem "IOMMU group of $GPU also holds $m (class ${mclass:-?})"
  done
  # BARs: a sysfs resource line is "start end flags"; 0x200 = memory, 0x2000 = prefetchable, 0x100000 = 64-bit.
  while read -r start end flags; do
    [ "$((start))" -ne 0 ] || [ "$((end))" -ne 0 ] || continue
    (( flags & 0x200 )) || continue
    size=$(( (end - start + 1) / 1024 ))
    total=$(( total + size ))
    (( (flags & 0x2000) && (flags & 0x100000) )) && pref64=$(( pref64 + size ))
    bars="$bars [$start-$end ${size}KiB]"
    # A host framebuffer (efifb, simplefb, BOOTFB) inside a BAR stops QEMU mapping it.
    while read -r line; do
      local fs fe
      fs=$((16#${line%%-*})); fe=$((16#$(sed -E 's/^[0-9a-f]+-([0-9a-f]+).*/\1/' <<<"$line")))
      (( fs <= end && fe >= start )) && problem "host framebuffer '${line#*: }' sits inside a BAR of $GPU"
    done < <(grep -i -E 'efifb|bootfb|simplefb|vesafb|simple-framebuffer|simpledrm' "$IOMEM" 2>/dev/null | sed -E 's/^ +//')
  done < <(head -7 "$dir/resource" 2>/dev/null)
  fact "$GPU memory BARs:${bars:- none} (64-bit prefetchable ${pref64} KiB)"
  [ "$total" -gt 0 ] || problem "no memory BARs readable for $GPU"
  [ "$pref64" -le "$MAX_PREF64_KIB" ] || problem "64-bit prefetchable BARs total ${pref64} KiB (resizable BAR?); the guest's 32 GiB window may not hold them"
}

# No other running VM may hold either function. Stopped VMs that name them are only recorded.
check_other_vms() {
  local n x
  while read -r n; do
    [ -n "$n" ] && [ "$n" != "$VM_NAME" ] || continue
    x="$(virsh dumpxml "$n" 2>/dev/null | hostdev_srcs)"
    case " $x " in *" $GPU "*|*" $AUD "*) ;; *) continue ;; esac
    if [ "$(virsh domstate "$n" 2>/dev/null | sed -n 1p)" = "shut off" ]; then
      fact "stopped VM '$n' also names the GPU (it cannot start while $VM_NAME holds it)"
    else
      problem "VM '$n' is not shut off and names the GPU"
    fi
  done < <(virsh list --all --name 2>/dev/null)
}

# The definition: our UUID/name, q35, root port 6 present and empty.
check_definition() { # <xml>
  local x="$1"
  grep -q "<uuid>$VM_UUID</uuid>" <<<"$x" || problem "definition does not have UUID $VM_UUID"
  grep -q "<name>$VM_NAME</name>" <<<"$x" || problem "definition is not named $VM_NAME"
  grep -q "machine='pc-q35-" <<<"$x" || problem "machine type is not q35"
  grep -q "<controller type='pci' index='$ROOT_PORT_INDEX' model='pcie-root-port'>" <<<"$x" \
    || problem "pcie-root-port index $ROOT_PORT_INDEX is missing"
  strip_hostdev <<<"$x" | grep -q "bus='$GUEST_BUS'" && problem "guest bus $GUEST_BUS is already used by another device"
  return 0
}

mem_available() { awk '/^MemAvailable:/ { print $2 }' "$MEMINFO" 2>/dev/null; }
qemu_rss() { local p; p="$(cat "$PIDDIR/$VM_NAME.pid" 2>/dev/null)" && awk '/^VmRSS:/ { print $2 }' "$PROC/$p/status" 2>/dev/null; }

# Pinning: with a VFIO device QEMU locks all guest RAM. Running, the estimate is what
# the host has now plus what the VM already holds; off, it is MemAvailable alone.
check_memory() { # <state>
  local need avail rss
  need=$(( VM_KIB + RESERVE_KIB )); avail="$(mem_available)"
  [[ "$avail" =~ ^[0-9]+$ ]] || { problem "host MemAvailable cannot be read"; return; }
  if [ "$1" = running ]; then
    rss="$(qemu_rss)"
    [[ "$rss" =~ ^[0-9]+$ ]] || { problem "the VM's QEMU memory use cannot be read"; return; }
    fact "host MemAvailable ${avail} KiB, QEMU RSS ${rss} KiB, needed once off ${need} KiB"
    [ $(( avail + rss )) -ge "$need" ] || problem "after the shutdown the host would have about $(( avail + rss )) KiB, less than the ${need} KiB needed to pin ${VM_KIB} KiB"
  else
    fact "host MemAvailable ${avail} KiB, needed ${need} KiB"
    [ "$avail" -ge "$need" ] || problem "host MemAvailable ${avail} KiB is less than the ${need} KiB needed to pin ${VM_KIB} KiB"
  fi
}

# examine <action>: read the VM and plan. Sets STATE CFG LIVE PLAN and PROBLEMS/FACTS.
examine() {
  PROBLEMS=(); FACTS=(); CFG=""; LIVE=""; PLAN=""
  STATE="$(domstate)"; CFG="$(cfg_xml)"
  [ -n "$STATE" ] && [ -n "$CFG" ] || { problem "$VM_NAME ($VM_UUID) cannot be read"; PLAN=unexpected; return; }
  [ "$STATE" = running ] && LIVE="$(live_xml)"
  VM_KIB="$(xml_mem <<<"$CFG")"
  [[ "${VM_KIB:-}" =~ ^[0-9]+$ ]] || problem "the VM's memory cannot be read"
  local c l; c="$(hostdev_srcs <<<"$CFG")"; l="$(hostdev_srcs <<<"$LIVE")"
  fact "$VM_NAME state '$STATE', memory ${VM_KIB:-?} KiB, hostdev defined '${c}' running '${l}'"
  check_definition "$(strip_hostdev <<<"$CFG")"
  case "$1:$STATE:$c:$l" in
    "attach:running::")              PLAN=full ;;
    "attach:running:$OURS:$OURS")    PLAN=done ;;
    "attach:shut off::")             PLAN=offline ;;
    "attach:shut off:$OURS:")        PLAN=start ;;
    "detach:running:$OURS:$OURS")    PLAN=full ;;
    "detach:running::")              PLAN=done ;;
    "detach:shut off:$OURS:")        PLAN=offline ;;
    "detach:shut off::")             PLAN=start ;;
    *) PLAN=unexpected; problem "state '$STATE' with hostdev defined '$c' and running '$l' is not one this script handles for $1" ;;
  esac
  if [ "$1" = attach ] && [ "$PLAN" != done ]; then
    check_gpu; check_other_vms
    [ "$PLAN" = full ] && check_memory running
    [ "$PLAN" = offline ] || [ "$PLAN" = start ] && check_memory off
  fi
  [ "$PLAN" = done ] && [ "$1" = attach ] && { [ "$(dev_driver "$GPU")" = vfio-pci ] || problem "running with the GPU but its host driver is $(dev_driver "$GPU")"; }
  return 0
}

host_facts() {
  log "host: $(uname -r), $(grep -m1 'model name' "$PROC/cpuinfo" 2>/dev/null | cut -d: -f2-)"
  log "kernel command line: $(cat "$PROC/cmdline" 2>/dev/null)"
  [ -r /boot/config/vfio-pci.cfg ] && log "vfio-pci.cfg: $(tr '\n' ' ' < /boot/config/vfio-pci.cfg)"
  command -v lspci >/dev/null && lspci -nnk -s 01:00 2>/dev/null | sed 's/^/  lspci | /'
  log "virsh: $(virsh version --daemon 2>/dev/null | tr '\n' ' ')"
}

print_check() {
  local f p
  for f in "${FACTS[@]}"; do log "  fact: $f"; done
  for p in "${PROBLEMS[@]}"; do log "  PROBLEM: $p"; done
}

# --- The run: records, locks, outcome

save() { printf '%s\n' "$2" > "$RUN_DIR/$1.tmp" && mv -f "$RUN_DIR/$1.tmp" "$RUN_DIR/$1"; }
set_phase() { PHASE="$1"; save state.json "{\"run_id\":$(json_str "$RUN_ID"),\"pid\":$$,\"sid\":$(json_str "$SID"),\"action\":$(json_str "$ACTION"),\"phase\":$(json_str "$1"),\"detail\":$(json_str "${2:-}"),\"at\":$(json_str "$(ts)")}"; }

tell_owner() {
  "$NOTIFY" -e "factory-worker GPU" -s "$2" -d "$3" -i "$1" < /dev/null > /dev/null 2>&1 8>&- 9>&- || log "the Unraid notification could not be sent"
  logger -t fleet-gpu -- "$2: $3" < /dev/null > /dev/null 2>&1 8>&- 9>&- || log "the syslog message could not be written"
}

finish() { # <outcome> <exit code> <message>
  local level=alert launcher=unknown st srcs
  FINISHED=1
  release_fleet_lock
  st="$(domstate)"; srcs="$( [ "$st" = running ] && live_xml | hostdev_srcs)"
  [ -n "$LAUNCHER_PID" ] && { kill -0 "$LAUNCHER_PID" 2>/dev/null && launcher=yes || launcher=no; }
  set_phase finished "$1"
  log "RESULT $1 (exit $2): $3"
  log "VM now: state '${st:-unreadable}', running hostdev '${srcs}'; all VMs:"; virsh list --all 2>&1 | sed 's/^/  | /'
  if ! save result.json "{\"run_id\":$(json_str "$RUN_ID"),\"action\":$(json_str "$ACTION"),\"outcome\":$(json_str "$1"),\"exit_code\":$2,\"message\":$(json_str "$3"),\"rehearsal\":$REHEARSAL,\"plan\":$(json_str "$PLAN"),\"last_phase\":$(json_str "$PHASE"),\"vm_state\":$(json_str "$st"),\"running_hostdev\":$(json_str "$srcs"),\"script_sha256\":$(json_str "$SCRIPT_SHA"),\"pid\":$$,\"sid\":$(json_str "$SID"),\"launcher_pid\":$(json_str "$LAUNCHER_PID"),\"launcher_alive_at_finish\":$(json_str "$launcher"),\"overrides\":$(json_str "$(overrides)"),\"started_at\":$(json_str "$STARTED_AT"),\"finished_at\":$(json_str "$(ts)")}"; then
    log "RESULT NOT PUBLISHED: result.json could not be written"; set -- "$1" 32 "$3"
  fi
  [ "$2" = 0 ] && level=normal
  case "$2" in 1[0-4]) [ "$st" = running ] && level=warning ;; esac
  tell_owner "$level" "factory-worker GPU $ACTION: $1" "$3 (run $RUN_ID)"
  exit "$2"
}
on_exit() { [ -n "${FINISHED:-}" ] || finish aborted 31 "stopped unexpectedly in phase '${PHASE:-}'; launch again to continue from the VM's state"; }

vdo() { # a logged virsh call that changes something
  local out rc
  log "+ virsh $*"; out="$(virsh "$@" 2>&1 8>&- 9>&-)"; rc=$?
  [ -z "$out" ] || log "  | ${out//$'\n'/$'\n'  | }"
  return "$rc"
}
take_fleet_lock() { exec 9>"$FLEET_LOCK" && flock -w "$FLEET_LOCK_WAIT" 9 && FLEET_LOCKED=1; }
release_fleet_lock() { [ -z "${FLEET_LOCKED:-}" ] || { exec 9>&-; FLEET_LOCKED=""; }; }

wait_state() { # <state> <seconds>
  local end=$(( SECONDS + ${2%.*} + 1 ))
  while [ "$SECONDS" -lt "$end" ]; do [ "$(domstate)" = "$1" ] && return 0; sleep "$POLL"; done
  [ "$(domstate)" = "$1" ]
}

shutdown_vm() {
  local sent=$SECONDS end=$(( SECONDS + ${SHUTDOWN_TIMEOUT%.*} + 1 ))
  set_phase shutdown "ACPI, waiting up to $SHUTDOWN_TIMEOUT s"
  vdo shutdown "$VM_UUID" --mode acpi || log "the shutdown request failed; waiting anyway"
  while [ "$SECONDS" -lt "$end" ]; do
    [ "$(domstate)" = "shut off" ] && { log "shut off after $(( SECONDS - sent )) s"; return 0; }
    if [ $(( SECONDS - sent )) -ge "${ACPI_RESEND%.*}" ] && [ "$(domstate)" = running ]; then
      vdo shutdown "$VM_UUID" --mode acpi || :; sent=$SECONDS
    fi
    sleep "$POLL"
  done
  [ "$(domstate)" = "shut off" ]
}

# set_ours present|absent: add or remove exactly our two entries in the persistent definition.
set_ours() {
  local fn f rc=0
  for fn in 0 1; do
    f="$RUN_DIR/hostdev-$fn.xml"; hostdev_xml "$fn" > "$f" || return 1
    if [ "$1" = present ]; then
      case " $(cfg_xml | hostdev_srcs) " in *" 0000:01:00.$fn "*) continue ;; esac
      vdo attach-device "$VM_UUID" "$f" --config || rc=1
    else
      case " $(cfg_xml | hostdev_srcs) " in *" 0000:01:00.$fn "*) vdo detach-device "$VM_UUID" "$f" --config || rc=1 ;; esac
    fi
  done
  return "$rc"
}

start_vm() { # <label>
  set_phase start "$1"
  vdo start "$VM_UUID" && wait_state running "$START_TIMEOUT"
}

# The definition change, while off and under Fleet's lock. Afterwards the definition
# without hostdev must equal what it was before, with exactly our entries present or absent.
change_definition() { # <present|absent>
  local before after want
  before="$(cfg_xml)"; save definition-before-change.xml "$before"
  set_phase change "$1"
  if set_ours "$1"; then
    after="$(cfg_xml)"; save definition-after-change.xml "$after"
    want=""; [ "$1" = present ] && want="$OURS"
    if [ "$(hostdev_srcs <<<"$after")" = "$want" ] && [ "$(strip_hostdev <<<"$after")" = "$(strip_hostdev <<<"$before")" ]; then
      return 0
    fi
    diff <(strip_hostdev <<<"$before") <(strip_hostdev <<<"$after") > "$RUN_DIR/unexpected-diff.txt"
    log "the definition changed in an unexpected way (unexpected-diff.txt); undoing"
  else
    log "the definition change failed; undoing"
  fi
  # Undo: back to the entries it had before, then it must read exactly as before.
  if [ -n "$(hostdev_srcs <<<"$before")" ]; then set_ours present; else set_ours absent; fi
  [ "$(cfg_xml)" = "$before" ] || UNDO_FAILED=1
  return 1
}

# After the VM runs: our entries are live as intended, then the guest agent answers.
verify_running() { # <present|absent>
  local want="" srcs
  [ "$1" = present ] && want="$OURS"
  srcs="$(live_xml | hostdev_srcs)"
  [ "$srcs" = "$want" ] || { VERIFY_ERR="running hostdev is '$srcs', expected '$want'"; return 1; }
  set_phase guest-agent "waiting up to $AGENT_TIMEOUT s"
  local end=$(( SECONDS + ${AGENT_TIMEOUT%.*} + 1 ))
  while [ "$SECONDS" -lt "$end" ]; do
    virsh domtime "$VM_UUID" > /dev/null 2>&1 && { log "guest agent answers"; return 0; }
    sleep "$POLL"
  done
  VERIFY_ERR="the guest agent did not answer within $AGENT_TIMEOUT s"; return 2
}

# Start without our change after a failure; the definition is as it was.
# If the undo left our GPU entries behind, the VM stays off for the owner. If it only
# left another difference (libvirt added something), the VM still starts: T3 matters more.
start_back() { # <reason>
  local note="the definition is as it was"
  if [ -n "${UNDO_FAILED:-}" ]; then
    save definition-after-undo.xml "$(cfg_xml)"
    [ -z "$(cfg_xml | hostdev_srcs)" ] \
      || finish needs-owner 30 "$1; our GPU entries could not be removed again (definition-after-undo.xml); VM left off"
    note="the GPU entries are removed but the definition still differs from before (definition-after-undo.xml)"
  fi
  start_vm "without the change" || { sleep "$START_RETRY_DELAY"; start_vm "without the change, second try"; } \
    || finish left-off 30 "$1; $note; the VM could not be started again; start it from the VM page"
  finish rolled-back 20 "$1; $note; the VM runs without the change"
}

# Take our entries out again; the rest of the definition must read as <reference>.
remove_ours_and_start() { # <reason> <reference xml>
  set_ours absent
  [ "$(cfg_xml | strip_hostdev)" = "$(strip_hostdev <<<"$2")" ] && [ -z "$(cfg_xml | hostdev_srcs)" ] || UNDO_FAILED=1
  start_back "$1"
}

transition() {
  local target=present; [ "$ACTION" = detach ] && target=absent
  if [ "$PLAN" = full ]; then
    shutdown_vm || finish shutdown-timeout 13 "still '$(domstate)' after $SHUTDOWN_TIMEOUT s; nothing was changed and nothing forced. Look at the VNC console"
  fi
  set_phase locked "waiting for $FLEET_LOCK"
  take_fleet_lock || { start_vm "as is (Fleet lock busy)"; finish started-as-is 21 "Fleet's lock stayed busy for $FLEET_LOCK_WAIT s; nothing was changed"; }
  local st now; st="$(domstate)"; now="$(cfg_xml)"
  [ "$st" = "shut off" ] || finish restarted-elsewhere 21 "the VM is '$st' after the shutdown; someone else started it; nothing was changed"
  if [ "$(strip_hostdev <<<"$now" | fingerprint)" != "$REF_PRINT" ] || [ "$(hostdev_srcs <<<"$now")" != "$REF_SRCS" ]; then
    save changed-while-off.xml "$now"
    start_vm "as is (definition changed)"; finish started-as-is 21 "someone changed the definition during the run (changed-while-off.xml); nothing was changed"
  fi
  if [ "$PLAN" != start ]; then
    change_definition "$target" || start_back "the definition change did not come out as intended"
  fi
  if [ "$target" = present ]; then
    PROBLEMS=(); FACTS=(); check_memory off
    [ ${#PROBLEMS[@]} -eq 0 ] || { log "${PROBLEMS[*]}"; remove_ours_and_start "not enough host memory to pin the guest's RAM" "$now"; }
  fi
  if ! start_vm "with the change"; then
    log "start failed; host messages:"; dmesg 2>/dev/null | grep -i -E 'vfio|DMAR|AMD-Vi' | tail -n 20 | sed 's/^/  | /'
    [ "$(domstate)" = "shut off" ] || finish needs-owner 30 "the start failed and the VM is '$(domstate)'; nothing more was done"
    [ "$target" = present ] && remove_ours_and_start "the VM did not start with the GPU" "$now"
    start_vm "second try" || finish left-off 30 "the VM did not start after removing the GPU; start it from the VM page"
  fi
  release_fleet_lock
  verify_running "$target"
  case $? in
    0) finish "${ACTION}ed" 0 "the VM runs with the GPU $([ "$target" = present ] && echo attached || echo removed) and its guest agent answers" ;;
    1) finish started-unverified 22 "$VERIFY_ERR" ;;
    *) finish guest-silent 22 "the VM runs, hostdev as intended, but $VERIFY_ERR; check the VNC console. To undo: launch $( [ "$target" = present ] && echo detach || echo attach)" ;;
  esac
}

cmd_preflight() {
  local action="${1:-attach}"
  case "$action" in attach|detach) ;; *) die "preflight attach|detach" ;; esac
  [ "$(id -u)" = 0 ] || die "run this as root on the Unraid host"
  need_tools || die "missing on this host:$MISSING"
  host_facts
  examine "$action"; print_check
  log "plan: $PLAN"
  [ ${#PROBLEMS[@]} -eq 0 ] && [ "$PLAN" != unexpected ] && { log "preflight $action: PASS (nothing was changed)"; return 0; }
  log "preflight $action: FAIL (nothing was changed)"; return 10
}

cmd_status() {
  local d; d="$(ls -1d "$RUNS"/*/ 2>/dev/null | sort | tail -1)"
  [ -n "$d" ] || { echo "no runs in $RUNS"; return 0; }
  echo "latest run: $(basename "$d")"; cat "$d/result.json" 2>/dev/null || cat "$d/state.json" 2>/dev/null
}

cmd_launch() {
  local action="${1:-}" expect="" not_after="" rehearsal=() self run_id dir pid i
  case "$action" in attach|detach) shift ;; *) die "launch attach|detach --expect-sha256 <sha> --not-after <epoch> [--rehearsal]" ;; esac
  while [ $# -gt 0 ]; do
    case "$1" in
      --expect-sha256) expect="${2:-}"; shift 2 ;;
      --not-after) not_after="${2:-}"; shift 2 ;;
      --rehearsal) rehearsal=(--rehearsal); shift ;;
      *) die "unknown launch option '$1'" ;;
    esac
  done
  [[ "$expect" =~ ^[0-9a-f]{64}$ ]] || die "launch needs --expect-sha256 <SHA-256 of this script>"
  [[ "$not_after" =~ ^[0-9]{10}$ ]] || die "launch needs --not-after <epoch seconds>"
  [ "$(date +%s)" -le "$not_after" ] || die "this request expired at $(date -u -d "@$not_after" +%FT%TZ); nothing was started. Ask for a new one"
  [ "$(id -u)" = 0 ] || die "run this as root on the Unraid host"
  self="$(readlink -f -- "$0")"
  [ "$(sha_of "$self")" = "$expect" ] || die "this script's SHA-256 is not $expect; nothing was started"
  need_tools || die "missing on this host:$MISSING; nothing was started"
  run_id="$(date -u +%Y%m%dT%H%M%SZ)-$(od -An -N2 -tx1 /dev/urandom | tr -d ' \n')"
  dir="$RUNS/$run_id"
  mkdir -p "$RUNS" && mkdir "$dir" || die "cannot create $dir"
  cp -- "$self" "$dir/host-gpu.sh" && [ "$(sha_of "$dir/host-gpu.sh")" = "$expect" ] || die "the copy in $dir does not match; nothing was started"
  printf '{"run_id":"%s","action":"%s","launcher_pid":%s,"launcher_sid":"%s","launched_at":"%s","not_after":%s,"rehearsal":%s}\n' \
    "$run_id" "$action" "$$" "$(my_sid $$)" "$(ts)" "$not_after" "$([ ${#rehearsal[@]} -gt 0 ] && echo true || echo false)" > "$dir/launch.json" \
    || die "cannot write $dir/launch.json; nothing was started"
  # A new session, stdin closed, output to the run's own log: the run outlives ssh,
  # the approval runner and its timeout, and the worker VM it is about to stop.
  setsid bash "$dir/host-gpu.sh" run "$action" --run-dir "$dir" --launcher-pid "$$" "${rehearsal[@]}" < /dev/null >> "$dir/run.log" 2>&1 &
  local done_already=""
  for i in $(seq 1 30); do
    pid="$(sed -n 's/.*"pid":\([0-9]*\).*/\1/p' "$dir/state.json" 2>/dev/null)"
    [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && break
    [ -f "$dir/result.json" ] && { done_already="$(sed -n 's/.*"outcome":"\([^"]*\)".*/\1/p' "$dir/result.json")"; break; }
    pid=""; sleep 0.5
  done
  [ -n "$pid" ] || [ -n "$done_already" ] || { echo "run $run_id did not report in; its log:"; tail -n 20 "$dir/run.log" 2>/dev/null; return 1; }
  if [ -n "$done_already" ]; then
    echo "Launched $action run $run_id; it already finished: $done_already."
  else
    echo "Launched $action run $run_id (pid $pid, session $(my_sid "$pid"))$([ ${#rehearsal[@]} -gt 0 ] && echo ', rehearsal: changes nothing')."
  fi
  echo "Progress: files read $dir/state.json   Log: $dir/run.log   Result: $dir/result.json"
  [ ${#rehearsal[@]} -gt 0 ] || echo "Cancel before the shutdown (${ARM_DELAY} s): echo cancel | files write $dir/CANCEL"
}

cmd_run() {
  ACTION="${1:-}"; shift
  REHEARSAL=false; LAUNCHER_PID=""; RUN_DIR=""; PLAN=""; PHASE=start; SID=""; SCRIPT_SHA=""; STARTED_AT="$(ts)"; UNDO_FAILED=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --run-dir) RUN_DIR="${2:-}"; shift 2 ;;
      --launcher-pid) LAUNCHER_PID="${2:-}"; shift 2 ;;
      --rehearsal) REHEARSAL=true; shift ;;
      *) die "unknown run option '$1'" ;;
    esac
  done
  [ -d "$RUN_DIR" ] || die "run needs --run-dir"
  RUN_ID="$(basename "$RUN_DIR")"
  trap '' HUP
  trap on_exit EXIT
  trap on_exit TERM INT
  SID="$(my_sid $$)"; SCRIPT_SHA="$(sha_of "$0")"
  set_phase preflight "checking $VM_NAME" || { echo "cannot write $RUN_DIR/state.json"; FINISHED=1; exit 10; }
  log "run $RUN_ID: $ACTION, pid $$, session $SID, launcher ${LAUNCHER_PID:-none}, rehearsal $REHEARSAL, sha256 $SCRIPT_SHA; overrides: $(overrides)"
  exec 8>"$LOCK"
  flock -n 8 || finish locked 11 "another run holds $LOCK; nothing was done"
  host_facts
  examine "$ACTION"; print_check
  log "plan: $PLAN"
  [ ${#PROBLEMS[@]} -eq 0 ] && [ "$PLAN" != unexpected ] || finish preflight-failed 10 "${PROBLEMS[*]}; nothing was changed"
  save definition-at-start.xml "$CFG" || finish preflight-failed 10 "cannot write the run's records; nothing was changed"
  REF_PRINT="$(strip_hostdev <<<"$CFG" | fingerprint)"; REF_SRCS="$(hostdev_srcs <<<"$CFG")"
  if [ "$PLAN" = done ]; then
    [ "$REHEARSAL" = true ] && finish rehearsal-ok 0 "already ${ACTION}ed; a real run would do nothing"
    verify_running "$([ "$ACTION" = attach ] && echo present || echo absent)" \
      && finish "already-${ACTION}ed" 0 "nothing to do" || finish started-unverified 22 "${VERIFY_ERR}; nothing was changed"
  fi
  # Full definition, security info included, on flash where `files read` cannot reach it.
  local full; full="$(virsh dumpxml --inactive --security-info "$VM_UUID" 2>/dev/null)"
  [ -n "$full" ] && mkdir -p "$BACKUPS" && printf '%s\n' "$full" > "$BACKUPS/$VM_NAME-gpu-$RUN_ID.xml" \
    || finish preflight-failed 10 "cannot back up the definition to $BACKUPS; nothing was changed"
  if [ "$REHEARSAL" = true ]; then
    set_phase rehearsal "holding $REHEARSAL_HOLD s"; sleep "$REHEARSAL_HOLD"
    finish rehearsal-ok 0 "all checks pass, plan '$PLAN'; nothing was changed"
  fi
  set_phase armed "$ACTION in $ARM_DELAY s unless $RUN_DIR/CANCEL appears"
  local end=$(( SECONDS + ${ARM_DELAY%.*} ))
  while [ "$SECONDS" -lt "$end" ]; do [ -e "$RUN_DIR/CANCEL" ] && finish cancelled 12 "CANCEL found; nothing was changed"; sleep 1; done
  [ -e "$RUN_DIR/CANCEL" ] && finish cancelled 12 "CANCEL found; nothing was changed"
  # Check again at the end of the window: nothing may have moved meanwhile.
  local again; again="$(cfg_xml)"
  [ "$(domstate)" = "$STATE" ] && [ "$(strip_hostdev <<<"$again" | fingerprint)" = "$REF_PRINT" ] && [ "$(hostdev_srcs <<<"$again")" = "$REF_SRCS" ] \
    || finish preflight-failed 10 "the VM changed during the arm window; nothing was changed"
  transition
}

main() {
  case "${1:-preflight}" in
    preflight) shift || :; cmd_preflight "$@" ;;
    status) cmd_status ;;
    launch) shift; cmd_launch "$@" ;;
    run) shift; cmd_run "$@" ;;
    *) die "usage: host-gpu.sh [preflight [attach|detach]] | status | launch attach|detach --expect-sha256 <sha> --not-after <epoch> [--rehearsal]" ;;
  esac
}
main "$@"
