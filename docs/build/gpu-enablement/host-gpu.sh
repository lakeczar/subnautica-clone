#!/usr/bin/env bash
# Give factory-worker the RTX 3090 (host functions 0000:01:00.0 and .1), or take it back.
# Runs on the Unraid host as root. README.md explains why this is a cold change.
#
#   bash host-gpu.sh [preflight] [attach|detach]   read-only checks and host facts (default: attach)
#   bash host-gpu.sh status                        the latest run
#   bash host-gpu.sh launch attach|detach --expect-sha256 <sha> --not-after <epoch> [--rehearsal]
#
# A real launch is one detached host-side run that needs nothing from its caller:
# check -> verified backup -> arm 60 s (CANCEL file) -> take Fleet's lock -> check again
# -> ACPI shutdown, never forced -> check again -> add or remove only our two <hostdev>
# entries -> check again -> start -> verify -> result.json. Fleet's lock is held from
# before the shutdown until the start, so no other definition change and no recovery
# start can interleave. --rehearsal does everything up to the shutdown, then stops.
#
# Every read that a decision depends on must succeed and be complete. A failed or
# partial read is an error, never "nothing there".
set -uo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

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
FLEET_LOCK=/tmp/fleet-admin.lock   # fleet-admin.sh takes it for vm define, snapshots and file writes
NOTIFY=/usr/local/emhttp/webGui/scripts/notify
TOOLS="flock setsid timeout sha256sum virsh awk sed grep diff cmp sync ps od mktemp logger paste sort readlink basename"

# GPU_* overrides exist for the offline tests; every run logs the ones in effect.
SYSFS="${GPU_SYSFS:-/sys}"
MEMINFO="${GPU_MEMINFO:-/proc/meminfo}"
IOMEM="${GPU_IOMEM:-/proc/iomem}"
PROC="${GPU_PROC:-/proc}"
PIDDIR="${GPU_PIDDIR:-/var/run/libvirt/qemu}"
POLL="${GPU_POLL:-5}"
ARM_DELAY="${GPU_ARM_DELAY:-60}"
SHUTDOWN_TIMEOUT="${GPU_SHUTDOWN_TIMEOUT:-600}"   # the two shutdowns since the recovery took 1-2 s
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

# --- Reads. Each fails (status 1, READ_ERR set) unless the read succeeded and is complete.

READ_ERR=""
rd_fail() { READ_ERR="$*"; return 1; }
v_read() { # <var> <virsh args...>: output of a read-only virsh call
  local __o __v="$1"; shift
  __o="$(virsh "$@" 2>&1)" || { rd_fail "'virsh $*' failed: ${__o:0:200}"; return 1; }
  printf -v "$__v" '%s' "$__o"
}
# A whole domain document (first line <domain ...>, last line </domain>), of the given VM if named.
xml_ok() { # <xml> [name] [uuid]
  [ "$(sed -n '1{s/ .*//;s/>$//;p}' <<<"$1")" = "<domain" ] && [ "$(sed -n '$p' <<<"$1")" = "</domain>" ] || return 1
  [ -z "${2:-}" ] || grep -qxF "  <name>$2</name>" <<<"$1" || return 1
  [ -z "${3:-}" ] || grep -qxF "  <uuid>$3</uuid>" <<<"$1"
}
read_xml() { # <var> inactive|live <domain> [name] [uuid]
  local __x __f=(); [ "$2" = inactive ] && __f=(--inactive)
  v_read __x dumpxml "${__f[@]}" "$3" || return 1
  xml_ok "$__x" "${4:-}" "${5:-}" || { rd_fail "the $2 definition of '$3' is incomplete or not the expected VM"; return 1; }
  printf -v "$1" '%s' "$__x"
}
read_cfg() { read_xml "$1" inactive "$VM_UUID" "$VM_NAME" "$VM_UUID"; }
read_live() { read_xml "$1" live "$VM_UUID" "$VM_NAME" "$VM_UUID"; }
read_state() { # <var> <domain>
  local __s; v_read __s domstate "$2" || return 1
  __s="$(sed -n 1p <<<"$__s")"
  case "$__s" in
    running|"shut off"|paused|"in shutdown"|crashed|pmsuspended|idle|blocked) printf -v "$1" '%s' "$__s" ;;
    *) rd_fail "the state of '$2' is not recognised: '$__s'" ;;
  esac
}
domstate() { local s; read_state s "$VM_UUID" && echo "$s" || echo unreadable; }

# Sources of every <hostdev>, sorted: 0000:01:00.0 for a PCI source, "other" for any
# hostdev without one (USB, mdev, ...), so that it is never overlooked.
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
names_gpu() { case " $(hostdev_srcs <<<"$1") " in *" $GPU "*|*" $AUD "*) return 0 ;; esac; return 1; }

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

# --- Checks. Each adds to PROBLEMS (anything that blocks) and FACTS (the record).

problem() { PROBLEMS+=("$*"); }
fact() { FACTS+=("$*"); }
sysread() { # <var> <file>: its first line; a problem if unreadable or empty
  local __l=""
  { IFS= read -r __l < "$2"; } 2>/dev/null && [ -n "$__l" ] || { problem "cannot read $2"; return 1; }
  printf -v "$1" '%s' "$__l"
}
dev_driver() { local d="$SYSFS/bus/pci/devices/$1/driver"; if [ -e "$d" ]; then basename "$(readlink -f "$d")"; elif [ -L "$d" ]; then echo broken; else echo none; fi; }

# The host side of the card, read now: identity, binding, group, BARs and host framebuffers.
check_gpu() {
  local addr want_id want_class dir v d c drv members m mclass
  for addr in "$GPU $GPU_ID $GPU_CLASS" "$AUD $AUD_ID $AUD_CLASS"; do
    read -r addr want_id want_class <<<"$addr"
    dir="$SYSFS/bus/pci/devices/$addr"
    [ -d "$dir" ] || { problem "host PCI device $addr is missing"; continue; }
    sysread v "$dir/vendor" && sysread d "$dir/device" && sysread c "$dir/class" || continue
    drv="$(dev_driver "$addr")"
    fact "$addr id ${v#0x}:${d#0x} class ${c:0:6} host driver $drv"
    [ "${v#0x}:${d#0x}" = "$want_id" ] || problem "$addr is ${v#0x}:${d#0x}, not the expected $want_id"
    [ "${c:0:6}" = "$want_class" ] || problem "$addr has class ${c:0:6}, not $want_class"
    case "$drv" in vfio-pci|none) ;; *) problem "$addr is in use on the host by driver $drv" ;; esac
  done
  dir="$SYSFS/bus/pci/devices/$GPU"
  [ -d "$dir" ] || return 0
  # The IOMMU group may hold only our two functions and PCI bridges.
  members="$(ls "$dir/iommu_group/devices" 2>/dev/null | sort | paste -sd' ' -)"
  fact "IOMMU group $(basename "$(readlink -f "$dir/iommu_group" 2>/dev/null)"): ${members:-unreadable}"
  case " $members " in *" $GPU "*) ;; *) problem "the IOMMU group of $GPU cannot be read or does not list it (IOMMU off?)" ;; esac
  for m in $members; do
    case " $OURS " in *" $m "*) continue ;; esac
    mclass=""; { IFS= read -r mclass < "$SYSFS/bus/pci/devices/$m/class"; } 2>/dev/null
    [ "${mclass:0:6}" = 0x0604 ] || problem "IOMMU group of $GPU also holds $m (class ${mclass:-unreadable})"
  done
  check_bars "$dir"
}

# BARs from sysfs ("start end flags"; 0x200 memory, 0x2000 prefetchable, 0x100000 64-bit),
# then /proc/iomem as root: it must show BAR0 under the GPU's name (an unprivileged or
# missing map shows zeros or nothing) and no host framebuffer inside any BAR.
check_bars() {
  local res=() iom=() line start end flags size pref64=0 total=0 bars="" bar0="" ok0="" s e name n=0
  mapfile -t res < "$1/resource" 2>/dev/null && [ ${#res[@]} -ge 7 ] || { problem "cannot read the BARs of $GPU"; return; }
  mapfile -t iom < "$IOMEM" 2>/dev/null && [ ${#iom[@]} -gt 0 ] || { problem "cannot read the host memory map $IOMEM"; return; }
  for line in "${res[@]:0:7}"; do
    [[ "$line" =~ ^0x[0-9a-f]+\ 0x[0-9a-f]+\ 0x[0-9a-f]+$ ]] || { problem "unexpected BAR line for $GPU: '$line'"; return; }
    read -r start end flags <<<"$line"; n=$((n + 1))
    [ "$((start))" -ne 0 ] || [ "$((end))" -ne 0 ] || continue
    (( flags & 0x200 )) || continue
    size=$(( (end - start + 1) / 1024 )); total=$(( total + size ))
    (( (flags & 0x2000) && (flags & 0x100000) )) && pref64=$(( pref64 + size ))
    [ "$n" = 1 ] && bar0="$start"
    bars="$bars [$start-$end ${size}KiB]"
    for line in "${iom[@]}"; do
      [[ "$line" =~ ^\ *([0-9a-f]+)-([0-9a-f]+)\ :\ (.*)$ ]] || continue
      s=$((16#${BASH_REMATCH[1]})); e=$((16#${BASH_REMATCH[2]})); name="${BASH_REMATCH[3]}"
      [ "$s" = "$((start))" ] && [ "$name" = "$GPU" ] && [ "$n" = 1 ] && ok0=1
      if (( s <= end && e >= start )) && [[ "${name,,}" =~ efifb|bootfb|simplefb|vesafb|simple-framebuffer|simpledrm ]]; then
        problem "host framebuffer '$name' sits inside a BAR of $GPU"
      fi
    done
  done
  fact "$GPU memory BARs:${bars:- none} (64-bit prefetchable ${pref64} KiB)"
  [ -n "$bar0" ] && [ "$total" -gt 0 ] || problem "no assigned memory BARs for $GPU"
  [ -n "$ok0" ] || problem "the host memory map does not show $GPU's BAR0 (map unreadable, not root, or BAR not assigned)"
  [ "$pref64" -le "$MAX_PREF64_KIB" ] || problem "64-bit prefetchable BARs total ${pref64} KiB (resizable BAR?); the guest's 32 GiB window may not hold them"
}

# No other VM that is not shut off may name either function. A stopped VM that names
# them is recorded (it cannot start while the worker holds the card).
check_other_vms() {
  local list n st x names=0
  v_read list list --all --name || { problem "cannot list VMs: $READ_ERR"; return; }
  grep -qxF "$VM_NAME" <<<"$list" || { problem "the VM list does not include $VM_NAME; it is incomplete"; return; }
  while IFS= read -r n; do
    [ -n "$n" ] && [ "$n" != "$VM_NAME" ] || continue
    names=$((names + 1))
    read_state st "$n" || { problem "cannot read the state of '$n': $READ_ERR"; continue; }
    if [ "$st" = "shut off" ]; then
      if read_xml x inactive "$n" "$n"; then names_gpu "$x" && fact "stopped VM '$n' also names the GPU (it cannot start while $VM_NAME holds it)"
      else fact "stopped VM '$n': definition unreadable ($READ_ERR)"; fi
    else
      read_xml x live "$n" "$n" || { problem "VM '$n' is '$st' and its definition cannot be read: $READ_ERR"; continue; }
      names_gpu "$x" && problem "VM '$n' is '$st' and names the GPU"
    fi
  done <<<"$list"
  fact "checked $names other VMs"
}

# The definition: q35, root port 6 present and nothing else on its bus.
check_definition() { # <xml without hostdev>
  grep -q "machine='pc-q35-" <<<"$1" || problem "machine type is not q35"
  grep -q "<controller type='pci' index='$ROOT_PORT_INDEX' model='pcie-root-port'>" <<<"$1" \
    || problem "pcie-root-port index $ROOT_PORT_INDEX is missing"
  grep -q "bus='$GUEST_BUS'" <<<"$1" && problem "guest bus $GUEST_BUS is already used by another device"
  return 0
}

mem_available() { awk '/^MemAvailable:/ { print $2 }' "$MEMINFO" 2>/dev/null; }
qemu_rss() { local p; p="$(cat "$PIDDIR/$VM_NAME.pid" 2>/dev/null)" && [ -n "$p" ] && awk '/^VmRSS:/ { print $2 }' "$PROC/$p/status" 2>/dev/null; }

# With a VFIO device QEMU locks all guest RAM. Running, the estimate is what the host
# has now plus what the VM already holds; off, it is MemAvailable alone.
check_memory() { # running|off
  local need avail rss
  [[ "${VM_KIB:-}" =~ ^[0-9]+$ ]] || { problem "the VM's memory size is unknown"; return; }
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

# examine <action>: read the VM now and plan. Sets STATE CFG LIVE VM_KIB PLAN, PROBLEMS/FACTS.
examine() {
  PROBLEMS=(); FACTS=(); CFG=""; LIVE=""; PLAN=unexpected
  read_state STATE "$VM_UUID" || { STATE=unreadable; problem "$READ_ERR"; return 0; }
  read_cfg CFG || { problem "$READ_ERR"; return 0; }
  if [ "$STATE" != "shut off" ]; then read_live LIVE || { problem "$READ_ERR"; return 0; }; fi
  VM_KIB="$(xml_mem <<<"$CFG")"
  [[ "${VM_KIB:-}" =~ ^[0-9]+$ ]] || problem "the VM's memory cannot be read from its definition"
  local c l; c="$(hostdev_srcs <<<"$CFG")"; l="$(hostdev_srcs <<<"$LIVE")"
  fact "$VM_NAME state '$STATE', memory ${VM_KIB:-?} KiB, hostdev defined '${c}' running '${l}'"
  check_definition "$(strip_hostdev <<<"$CFG")"
  case "$1:$STATE:$c:$l" in
    "attach:running::")            PLAN=full ;;
    "attach:running:$OURS:$OURS")  PLAN=done ;;
    "attach:shut off::")           PLAN=offline ;;
    "attach:shut off:$OURS:")      PLAN=start ;;
    "detach:running:$OURS:$OURS")  PLAN=full ;;
    "detach:running::")            PLAN=done ;;
    "detach:shut off:$OURS:")      PLAN=offline ;;
    "detach:shut off::")           PLAN=start ;;
    *) problem "state '$STATE' with hostdev defined '$c' and running '$l' is not one this script handles for $1" ;;
  esac
  if [ "$1" = attach ] && [ "$PLAN" != done ]; then
    check_gpu; check_other_vms
    if [ "$PLAN" = full ]; then check_memory running; else check_memory off; fi
  fi
  if [ "$1" = attach ] && [ "$PLAN" = done ]; then
    [ "$(dev_driver "$GPU")" = vfio-pci ] || problem "running with the GPU but its host driver is $(dev_driver "$GPU")"
  fi
  return 0
}

# recheck <expected state> <expected hostdev sources>: at a boundary, the VM is still in
# the expected state, its whole definition (hostdev aside) still equals the one checked
# at the start, and for attach the card and every other VM are still as required.
recheck() {
  local st cfg
  PROBLEMS=(); FACTS=()
  read_state st "$VM_UUID" || { problem "$READ_ERR"; return 1; }
  [ "$st" = "$1" ] || problem "the VM is '$st', expected '$1'"
  read_cfg cfg || { problem "$READ_ERR"; return 1; }
  if [ "$(strip_hostdev <<<"$cfg")" != "$(strip_hostdev <<<"$REF")" ]; then
    save changed-definition.xml "$cfg"; diff <(strip_hostdev <<<"$REF") <(strip_hostdev <<<"$cfg") > "$RUN_DIR/changed-definition.diff"
    problem "the definition changed since the run started (changed-definition.diff)"
  fi
  [ "$(hostdev_srcs <<<"$cfg")" = "$2" ] || problem "hostdev defined '$(hostdev_srcs <<<"$cfg")', expected '$2'"
  if [ "$ACTION" = attach ]; then
    check_gpu; check_other_vms
    if [ "$st" = running ]; then check_memory running; else check_memory off; fi
  fi
  print_check
  [ ${#PROBLEMS[@]} -eq 0 ]
}

host_facts() {
  log "host: $(uname -r), $(grep -m1 'model name' "$PROC/cpuinfo" 2>/dev/null | cut -d: -f2-)"
  log "kernel command line: $(cat "$PROC/cmdline" 2>/dev/null)"
  if [ -r /boot/config/vfio-pci.cfg ]; then log "vfio-pci.cfg: $(tr '\n' ' ' < /boot/config/vfio-pci.cfg)"; else log "vfio-pci.cfg: none"; fi
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
  local level=alert launcher=unknown st srcs="" x
  FINISHED=1
  release_fleet_lock
  st="$(domstate)"
  if [ "$st" = running ]; then if read_live x; then srcs="$(hostdev_srcs <<<"$x")"; else srcs="unreadable"; fi; fi
  [ -n "$LAUNCHER_PID" ] && { kill -0 "$LAUNCHER_PID" 2>/dev/null && launcher=yes || launcher=no; }
  set_phase finished "$1"
  log "RESULT $1 (exit $2): $3"
  log "VM now: state '$st', running hostdev '$srcs'; all VMs:"; virsh list --all 2>&1 | sed 's/^/  | /'
  if ! save result.json "{\"run_id\":$(json_str "$RUN_ID"),\"action\":$(json_str "$ACTION"),\"outcome\":$(json_str "$1"),\"exit_code\":$2,\"message\":$(json_str "$3"),\"rehearsal\":$REHEARSAL,\"plan\":$(json_str "$PLAN"),\"last_phase\":$(json_str "$PHASE"),\"vm_state\":$(json_str "$st"),\"running_hostdev\":$(json_str "$srcs"),\"backup\":$(json_str "${BACKUP_FILE:-}"),\"script_sha256\":$(json_str "$SCRIPT_SHA"),\"pid\":$$,\"sid\":$(json_str "$SID"),\"launcher_pid\":$(json_str "$LAUNCHER_PID"),\"launcher_alive_at_finish\":$(json_str "$launcher"),\"overrides\":$(json_str "$(overrides)"),\"started_at\":$(json_str "$STARTED_AT"),\"finished_at\":$(json_str "$(ts)")}"; then
    log "RESULT NOT PUBLISHED: result.json could not be written"; set -- "$1" 32 "$3"
  fi
  [ "$2" = 0 ] && level=normal
  case "$2" in 1[0-4]) [ "$st" = running ] && level=warning ;; esac
  tell_owner "$level" "factory-worker GPU $ACTION: $1" "$3 (run $RUN_ID)"
  exit "$2"
}
on_exit() { [ -n "${FINISHED:-}" ] || finish aborted 31 "stopped unexpectedly in phase '${PHASE:-}'; VM is '$(domstate)'; launch again to continue from the VM's state"; }

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

# Full definition with security info, checked: a successful complete read of this VM,
# equal to the checked definition apart from passwords, written durably and read back.
backup_definition() {
  local full f tmp
  v_read full dumpxml --inactive --security-info "$VM_UUID" || return 1
  xml_ok "$full" "$VM_NAME" "$VM_UUID" || { rd_fail "the backup read is incomplete or not $VM_NAME"; return 1; }
  [ "$(sed -E "s/ passwd='[^']*'//g" <<<"$full")" = "$REF" ] || { rd_fail "the backup read differs from the checked definition beyond passwords"; return 1; }
  f="$BACKUPS/$VM_NAME-gpu-$RUN_ID.xml"; tmp="$f.tmp"
  mkdir -p "$BACKUPS" 2>/dev/null && printf '%s\n' "$full" > "$tmp" 2>/dev/null && sync "$tmp" 2>/dev/null && mv -f "$tmp" "$f" 2>/dev/null \
    || { rm -f "$tmp" 2>/dev/null; rd_fail "the backup could not be written to $f"; return 1; }
  sync "$BACKUPS" 2>/dev/null
  cmp -s "$f" <(printf '%s\n' "$full") || { rd_fail "the backup in $f does not read back as written"; return 1; }
  BACKUP_FILE="$f"; save backup.sha256 "$(sha_of "$f")  $f"
}

# set_ours present|absent: add or remove exactly our two entries in the persistent definition.
set_ours() {
  local fn f cfg
  for fn in 0 1; do
    f="$RUN_DIR/hostdev-$fn.xml"; hostdev_xml "$fn" > "$f" || return 1
    read_cfg cfg || return 1
    case " $(hostdev_srcs <<<"$cfg") " in
      *" 0000:01:00.$fn "*) [ "$1" = absent ] && { vdo detach-device "$VM_UUID" "$f" --config || return 1; } ;;
      *) [ "$1" = present ] && { vdo attach-device "$VM_UUID" "$f" --config || return 1; } ;;
    esac
  done
}

# start_vm <label>: 0 once the VM is seen running, also when the start command failed but
# the VM came up anyway (a lost response); it is then not started again. Otherwise it reads
# the state: 1 observed shut off, 2 state unreadable, 3 any other state (START_STATE says which).
start_vm() {
  set_phase start "$1"
  if vdo start "$VM_UUID" && wait_state running "$START_TIMEOUT"; then START_STATE=running; return 0; fi
  read_state START_STATE "$VM_UUID" || { START_STATE="unreadable: $READ_ERR"; return 2; }
  case "$START_STATE" in
    running) log "the start reported a failure, but the VM is running; it is not started again"; return 0 ;;
    "shut off") return 1 ;;
    *) return 3 ;;
  esac
}

# A start that did not leave the VM running ends here: left-off only when it was seen shut off.
start_failed() { # <start_vm status> <message>
  case "$1" in
    1) finish left-off 30 "$2; the VM is shut off. Start it from the VM page" ;;
    2) finish needs-owner 30 "$2; the VM's state cannot be read ($START_STATE); nothing more was done" ;;
    *) finish needs-owner 30 "$2; the VM is '$START_STATE'; nothing more was done" ;;
  esac
}

# The definition change, while off and under Fleet's lock. Afterwards the definition
# without hostdev must equal what it was just before, with exactly our entries present or
# absent. Otherwise it puts the entries back as they were; UNDO_FAILED says if that failed.
change_definition() { # present|absent
  local before after want=""; [ "$1" = present ] && want="$OURS"
  read_cfg before || { log "cannot read the definition before the change: $READ_ERR"; return 1; }
  save definition-before-change.xml "$before"
  set_phase change "$1"
  if set_ours "$1" && read_cfg after; then
    save definition-after-change.xml "$after"
    [ "$(hostdev_srcs <<<"$after")" = "$want" ] && [ "$(strip_hostdev <<<"$after")" = "$(strip_hostdev <<<"$before")" ] && return 0
    diff <(strip_hostdev <<<"$before") <(strip_hostdev <<<"$after") > "$RUN_DIR/unexpected-diff.txt"
    log "the definition changed in an unexpected way (unexpected-diff.txt); undoing"
  else
    log "the definition change failed (${READ_ERR:-see above}); undoing"
  fi
  local now
  if [ -n "$(hostdev_srcs <<<"$before")" ]; then set_ours present; else set_ours absent; fi
  read_cfg now && [ "$now" = "$before" ] || UNDO_FAILED=1
  return 1
}

# Start the VM without our change and finish, but only from what it can read now: state
# shut off, a complete definition of this VM, and exactly the expected hostdev entries.
# An unreadable state or definition, or other hostdev entries, leave the VM off for the owner.
recover_start() { # <outcome> <code> <message> <expected hostdev sources>
  local st now rc
  read_state st "$VM_UUID" || finish needs-owner 30 "$3; the VM's state cannot be read ($READ_ERR), so it was not started"
  case "$st" in
    "shut off") ;;
    running) finish restarted-elsewhere 21 "$3; the VM is already running (someone else started it)" ;;
    *) finish needs-owner 30 "$3; the VM is '$st', so it was not started" ;;
  esac
  read_cfg now || finish needs-owner 30 "$3; the definition cannot be read ($READ_ERR), so the VM was left off"
  if [ "$(hostdev_srcs <<<"$now")" != "$4" ]; then
    save definition-at-recovery.xml "$now"
    finish needs-owner 30 "$3; hostdev entries are '$(hostdev_srcs <<<"$now")', expected '$4' (definition-at-recovery.xml), so the VM was left off"
  fi
  start_vm "without the change"; rc=$?
  if [ "$rc" = 1 ]; then sleep "$START_RETRY_DELAY"; start_vm "without the change, second try"; rc=$?; fi
  [ "$rc" = 0 ] && finish "$1" "$2" "$3; the VM runs without the change"
  start_failed "$rc" "$3; then the VM could not be started again"
}

# Start again after undoing our change. The hostdev entries must read back as <expected>
# (none after a failed attach; ours again after a failed detach). If they do not, or the
# definition cannot be read, the VM stays off for the owner. Any other difference left by
# libvirt is recorded and the VM still starts: T3 matters more.
start_back() { # <reason> <expected hostdev sources>
  local now srcs note="the definition is as it was"
  read_cfg now || finish needs-owner 30 "$1; the definition cannot be read to confirm our entries ($READ_ERR); VM left off"
  srcs="$(hostdev_srcs <<<"$now")"
  if [ "$srcs" != "$2" ]; then
    save definition-after-undo.xml "$now"
    finish needs-owner 30 "$1; hostdev entries are '$srcs' after the undo, expected '$2' (definition-after-undo.xml); VM left off"
  fi
  if [ -n "${UNDO_FAILED:-}" ]; then save definition-after-undo.xml "$now"; note="the definition still differs from before (definition-after-undo.xml)"; fi
  recover_start rolled-back 20 "$1; $note" "$2"
}

remove_ours_and_start() { # <reason>: attach only; never returns
  set_ours absent || UNDO_FAILED=1
  local now; read_cfg now && [ "$(strip_hostdev <<<"$now")" = "$(strip_hostdev <<<"$REF")" ] || UNDO_FAILED=1
  start_back "$1" ""
}

transition() {
  local target=present want="$OURS" st
  [ "$ACTION" = detach ] && { target=absent; want=""; }
  set_phase locking "waiting for $FLEET_LOCK"
  take_fleet_lock || finish locked 11 "Fleet's lock stayed busy for $FLEET_LOCK_WAIT s; nothing was changed and the VM was not stopped"
  log "holding $FLEET_LOCK until the VM is started"
  recheck "$STATE" "$REF_SRCS" || finish preflight-failed 10 "before the shutdown: ${PROBLEMS[*]}; nothing was changed"
  if [ "$PLAN" = full ]; then
    shutdown_vm || finish shutdown-timeout 13 "still '$(domstate)' after $SHUTDOWN_TIMEOUT s; nothing was changed and nothing forced. Look at the VNC console"
  fi
  read_state st "$VM_UUID" || finish needs-owner 30 "the VM's state cannot be read after the shutdown ($READ_ERR); nothing was changed"
  case "$st" in
    "shut off") ;;
    running) finish restarted-elsewhere 21 "the VM is running again after the shutdown; someone else started it; nothing was changed" ;;
    *) finish needs-owner 30 "the VM is '$st' after the shutdown; nothing was changed" ;;
  esac
  recheck "shut off" "$REF_SRCS" || recover_start backed-off 21 "after the shutdown: ${PROBLEMS[*]}; nothing was changed" "$REF_SRCS"
  if [ "$PLAN" != start ]; then
    change_definition "$target" || start_back "the definition change did not come out as intended" "$REF_SRCS"
  fi
  if ! recheck "shut off" "$want"; then
    [ "$target" = present ] && remove_ours_and_start "just before the start: ${PROBLEMS[*]}"
    recover_start backed-off 21 "the GPU entries were removed, then the check before the start failed: ${PROBLEMS[*]}" ""
  fi
  local rc; start_vm "with the change"; rc=$?
  if [ "$rc" != 0 ]; then
    log "start failed; host messages:"; dmesg 2>/dev/null | grep -i -E 'vfio|DMAR|AMD-Vi' | tail -n 20 | sed 's/^/  | /'
    [ "$rc" = 1 ] || start_failed "$rc" "the start with the change failed"
    [ "$target" = present ] && remove_ours_and_start "the VM did not start with the GPU"
    sleep "$START_RETRY_DELAY"; start_vm "second try"; rc=$?
    [ "$rc" = 0 ] || start_failed "$rc" "the VM did not start after removing the GPU"
  fi
  release_fleet_lock
  verify_running "$want"
  case $? in
    0) finish "${ACTION}ed" 0 "the VM runs with the GPU $([ "$target" = present ] && echo attached || echo removed) and its guest agent answers" ;;
    1) finish started-unverified 22 "$VERIFY_ERR" ;;
    *) finish guest-silent 22 "the VM runs, hostdev as intended, but $VERIFY_ERR; check the VNC console. To undo: launch $( [ "$target" = present ] && echo detach || echo attach)" ;;
  esac
}

# After the VM runs: its live definition reads back with exactly the intended entries,
# then the guest agent answers. 1: entries wrong or unreadable; 2: agent silent.
verify_running() { # <expected sources>
  local x
  read_live x || { VERIFY_ERR="the running definition cannot be read ($READ_ERR)"; return 1; }
  [ "$(hostdev_srcs <<<"$x")" = "$1" ] || { VERIFY_ERR="running hostdev is '$(hostdev_srcs <<<"$x")', expected '$1'"; return 1; }
  set_phase guest-agent "waiting up to $AGENT_TIMEOUT s"
  local end=$(( SECONDS + ${AGENT_TIMEOUT%.*} + 1 ))
  while [ "$SECONDS" -lt "$end" ]; do
    virsh domtime "$VM_UUID" > /dev/null 2>&1 && { log "guest agent answers"; return 0; }
    sleep "$POLL"
  done
  VERIFY_ERR="the guest agent did not answer within $AGENT_TIMEOUT s"; return 2
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
  local action="${1:-}" expect="" not_after="" rehearsal=() self run_id dir pid i done_already=""
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
  REHEARSAL=false; LAUNCHER_PID=""; RUN_DIR=""; PLAN=""; PHASE=start; SID=""; SCRIPT_SHA=""; STARTED_AT="$(ts)"; UNDO_FAILED=""; BACKUP_FILE=""
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
  REF="$CFG"; REF_SRCS="$(hostdev_srcs <<<"$CFG")"
  save definition-at-start.xml "$CFG" || finish preflight-failed 10 "cannot write the run's records; nothing was changed"
  if [ "$PLAN" = done ]; then
    [ "$REHEARSAL" = true ] && finish rehearsal-ok 0 "already ${ACTION}ed; a real run would do nothing"
    if verify_running "$REF_SRCS"; then finish "already-${ACTION}ed" 0 "nothing to do"; else finish started-unverified 22 "${VERIFY_ERR}; nothing was changed"; fi
  fi
  backup_definition || finish preflight-failed 10 "no valid backup: $READ_ERR; nothing was changed"
  log "backup $BACKUP_FILE verified"
  if [ "$REHEARSAL" = true ]; then
    set_phase rehearsal "lock and boundary check, then holding $REHEARSAL_HOLD s"
    take_fleet_lock || finish locked 11 "Fleet's lock stayed busy for $FLEET_LOCK_WAIT s (rehearsal); nothing was changed"
    recheck "$STATE" "$REF_SRCS" || finish preflight-failed 10 "boundary check: ${PROBLEMS[*]} (rehearsal); nothing was changed"
    release_fleet_lock
    sleep "$REHEARSAL_HOLD"
    finish rehearsal-ok 0 "all checks pass, backup verified, plan '$PLAN'; nothing was changed"
  fi
  set_phase armed "$ACTION in $ARM_DELAY s unless $RUN_DIR/CANCEL appears"
  local end=$(( SECONDS + ${ARM_DELAY%.*} ))
  while [ "$SECONDS" -lt "$end" ]; do [ -e "$RUN_DIR/CANCEL" ] && finish cancelled 12 "CANCEL found; nothing was changed"; sleep 1; done
  [ -e "$RUN_DIR/CANCEL" ] && finish cancelled 12 "CANCEL found; nothing was changed"
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
