#!/usr/bin/env bash
# A fake virsh for the offline tests: factory-worker and one other VM, with
# state in $S (default /tmp/vmu-fake). Files there set the behaviour; each test
# writes the ones it needs (see reset_fake in checks.sh). Every call is logged
# to $S/calls.log. Verbs the upgrade must never use (destroy, define, undefine,
# reset, reboot, ...) are logged as FORBIDDEN and fail.
#
# Knobs beyond the VM's own values (files in $S):
#   xml_ok_off N, xml_fail_off N|always  definition reads while off: N good ones, then failures
#   live_topology                        the running VM's topology, if not the defined one
#   live_pins                            the running VM's pins (vcpupin), if not the defined ones
#   on_start_live_pins                   becomes live_pins when the VM is started
#   on_setmaxmem_pins                    someone else changes the pins during the change
#   setmaxmem_block                      setmaxmem marks $S/blocked-setmaxmem and hangs this long, then fails
#   on_setmem_fail_restart               when setmem fails, someone else starts the VM right after
#   on_shutoff_pins/_take/_restart/_cmd  at power-off: change pins, take host memory, start it, run a script
S="${S:-/tmp/vmu-fake}"
echo "virsh $*" >> "$S/calls.log"
get() { cat "$S/$1" 2>/dev/null; }
put() { printf '%s\n' "$2" > "$S/$1"; }
NEW=16777216

pos=(); inactive=""; secinfo=""; mode=""
while [ $# -gt 0 ]; do
  case "$1" in
    --inactive) inactive=1 ;;
    --security-info) secinfo=1 ;;
    --config|--all|--name|-q) ;;
    --mode) mode="$2"; shift ;;
    --timeout) shift ;;
    *) pos+=("$1") ;;
  esac
  shift
done

me() { [ "${1:-}" = "$(get uuid)" ] || [ "${1:-}" = factory-worker ]; }
need_me() { me "$1" || { echo "error: failed to get domain '$1'" >&2; exit 1; }; }

# MemAvailable: what the host has with the VM off, less what the VM holds, less what something else took.
write_meminfo() {
  local avail=$(( $(get host_free) - $(get taken) ))
  [ "$(get state)" = running ] && avail=$(( avail - $(get live_cur) ))
  printf 'MemTotal:       32000000 kB\nMemAvailable:   %s kB\n' "$avail" > "$S/meminfo"
}

xml() { # <mem> <cur> [live]
  local topology; topology="$(get topology)"
  [ -n "${3:-}" ] && [ -f "$S/live_topology" ] && topology="$(get live_topology)"
  cat <<EOF
<domain type='kvm'>
  <name>$(get name)</name>
  <uuid>$(get uuid)</uuid>
  <memory unit='KiB'>$1</memory>
  <currentMemory unit='KiB'>$2</currentMemory>
  <memoryBacking>
    <nosharepages/>
  </memoryBacking>
  <vcpu placement='static'>$(get vcpus)</vcpu>
  <cputune>
EOF
  for p in $(get pins); do printf "    <vcpupin vcpu='%s' cpuset='%s'/>\n" "${p%%:*}" "${p#*:}"; done
  cat <<EOF
  </cputune>
  <features>
EOF
  [ "$(get acpi)" = no ] || echo "    <acpi/>"
  cat <<EOF
    <apic/>
  </features>
  <cpu mode='host-passthrough' check='none' migratable='on'>
    $topology
  </cpu>
EOF
  cat "$S/extra" 2>/dev/null
  echo "  <devices>"
  for d in $(get disks); do
    printf "    <disk type='file' device='disk'>\n      <driver name='qemu' type='raw' cache='writeback'/>\n      <source file='%s'/>\n    </disk>\n" "$d"
  done
  printf "    <disk type='file' device='cdrom'>\n      <source file='/mnt/user/isos/debian-13.6.0-amd64-netinst.iso'/>\n    </disk>\n"
  if [ -n "$secinfo" ]; then echo "    <graphics type='vnc' port='-1' autoport='yes' passwd='FAKE-VNC-SECRET'/>"
  else echo "    <graphics type='vnc' port='-1' autoport='yes'/>"; fi
  echo "  </devices>"
  echo "</domain>"
}

# Each domstate call while an ACPI shutdown is pending counts down to shut off.
tick() {
  # Something else starts the VM right after it was seen shut off.
  if [ -f "$S/restart_next" ] && [ "$(get state)" = "shut off" ]; then
    rm -f "$S/restart_next"; put state running; put live_mem "$(get cfg_mem)"; put live_cur "$(get cfg_cur)"; write_meminfo
    return 0
  fi
  [ "$(get state)" = running ] && [ -f "$S/shutdown_pending" ] || return 0
  local left; left="$(get shutdown_pending)"
  [ "$left" = never ] && return 0
  if [ "$left" -le 1 ]; then
    rm -f "$S/shutdown_pending"; put state "shut off"; put live_mem ""; put live_cur ""
    [ -f "$S/on_shutoff_pins" ] && { put pins "$(get on_shutoff_pins)"; rm -f "$S/on_shutoff_pins"; }
    [ -f "$S/on_shutoff_take" ] && { put taken "$(get on_shutoff_take)"; rm -f "$S/on_shutoff_take"; }
    [ -f "$S/on_shutoff_restart" ] && mv "$S/on_shutoff_restart" "$S/restart_next"
    write_meminfo
    [ -f "$S/on_shutoff_cmd" ] && { bash "$S/on_shutoff_cmd"; rm -f "$S/on_shutoff_cmd"; }
  else
    put shutdown_pending $((left - 1))
  fi
}

case "${pos[0]:-}" in
  list)
    printf ' Id   Name                    State\n----------------------------------------\n'
    printf ' %-4s %-23s %s\n' "$([ "$(get state)" = running ] && echo 96 || echo -)" factory-worker "$(get state)"
    printf ' %-4s %-23s %s\n' 98 "Debian AI 13 Control" running ;;
  domuuid) [ "${pos[1]}" = factory-worker ] || { echo "error: no domain" >&2; exit 1; }; get uuid_by_name ;;
  domname) [ "${pos[1]}" = "$(get uuid)" ] || { echo "error: no domain" >&2; exit 1; }; get name ;;
  domstate) need_me "${pos[1]}"; tick; get state ;;
  dominfo)
    need_me "${pos[1]}"
    if [ "$(get state)" = running ]; then m="$(get live_mem)"; u="$(get live_cur)"; else m="$(get cfg_mem)"; u="$(get cfg_cur)"; fi
    printf 'Name:           %s\nUUID:           %s\nState:          %s\nCPU(s):         %s\n' "$(get name)" "$(get uuid)" "$(get state)" "$(get vcpus)"
    printf 'Max memory:     %s KiB\nUsed memory:    %s KiB\nPersistent:     yes\nAutostart:      %s\n' "$m" "$u" "$(get autostart)" ;;
  dumpxml)
    need_me "${pos[1]}"
    if [ "$(get state)" = "shut off" ] && [ -f "$S/xml_fail_off" ]; then
      if [ "$(get xml_ok_off)" -gt 0 ] 2>/dev/null; then put xml_ok_off $(( $(get xml_ok_off) - 1 ))
      elif [ "$(get xml_fail_off)" = always ] || [ "$(get xml_fail_off)" -gt 0 ]; then
        [ "$(get xml_fail_off)" = always ] || put xml_fail_off $(( $(get xml_fail_off) - 1 ))
        echo "error: failed to read the definition (injected)" >&2; exit 1
      fi
    fi
    if [ -z "$inactive" ] && [ "$(get state)" = running ]; then xml "$(get live_mem)" "$(get live_cur)" live; else xml "$(get cfg_mem)" "$(get cfg_cur)"; fi ;;
  vcpupin)
    need_me "${pos[1]}"
    pins="$(get pins)"; [ "$(get state)" = running ] && [ -f "$S/live_pins" ] && pins="$(get live_pins)"
    printf ' VCPU   CPU Affinity\n----------------------\n'
    for p in $pins; do printf ' %-6s %s\n' "${p%%:*}" "${p#*:}"; done ;;
  shutdown)
    need_me "${pos[1]}"
    [ "$mode" = acpi ] || { echo "FORBIDDEN shutdown without --mode acpi" >> "$S/calls.log"; exit 1; }
    [ "$(get state)" = running ] || { echo "error: domain is not running" >&2; exit 1; }
    [ -f "$S/shutdown_pending" ] || put shutdown_pending "$(get shutdown_polls)"
    echo "Domain '${pos[1]}' is being shutdown" ;;
  start)
    need_me "${pos[1]}"
    [ "$(get state)" = running ] && { echo "error: Requested operation is not valid: domain is already running" >&2; exit 1; }
    case "$(get start_fail)" in
      always) echo "error: Failed to start domain" >&2; exit 1 ;;
      once) put start_fail no; echo "error: Failed to start domain" >&2; exit 1 ;;
      new) [ "$(get cfg_mem)" = "$NEW" ] && { echo "error: cannot allocate memory" >&2; exit 1; } ;;
    esac
    put state running; put live_mem "$(get cfg_mem)"; put live_cur "$(get cfg_cur)"; write_meminfo
    [ -f "$S/on_start_live_pins" ] && mv "$S/on_start_live_pins" "$S/live_pins"
    echo "Domain '${pos[1]}' started" ;;
  setmaxmem)
    need_me "${pos[1]}"
    [ "$(get setmaxmem_fail)" = yes ] && { echo "error: setmaxmem refused" >&2; exit 1; }
    [ -f "$S/setmaxmem_block" ] && { touch "$S/blocked-setmaxmem"; sleep "$(get setmaxmem_block)"; echo "error: timed out" >&2; exit 1; }
    [ -f "$S/on_setmaxmem_pins" ] && { put pins "$(get on_setmaxmem_pins)"; rm -f "$S/on_setmaxmem_pins"; }
    put cfg_mem "${pos[2]}"; [ "$(get cfg_cur)" -gt "${pos[2]}" ] && put cfg_cur "${pos[2]}"; true ;;
  setmem)
    need_me "${pos[1]}"
    if [ "$(get setmem_fail)" = yes ]; then
      [ -f "$S/on_setmem_fail_restart" ] && mv "$S/on_setmem_fail_restart" "$S/restart_next"
      echo "error: setmem refused" >&2; exit 1
    fi
    [ "${pos[2]}" -le "$(get cfg_mem)" ] || { echo "error: cannot set memory higher than max memory" >&2; exit 1; }
    put cfg_cur "${pos[2]}"
    [ -f "$S/setmem_inject" ] && { cat "$S/setmem_inject" >> "$S/extra"; rm -f "$S/setmem_inject"; }
    true ;;
  qemu-agent-command)
    need_me "${pos[1]}"
    [ "$(get state)" = running ] && [ "$(get agent)" = ok ] && { echo '{"return":{}}'; exit 0; }
    echo "error: Guest agent is not responding" >&2; exit 1 ;;
  *)
    echo "FORBIDDEN virsh ${pos[*]}" >> "$S/calls.log"
    echo "error: not allowed in tests" >&2; exit 1 ;;
esac
