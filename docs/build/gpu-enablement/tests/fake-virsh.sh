#!/usr/bin/env bash
# A fake virsh for the offline tests. factory-worker's persistent definition starts
# as fixtures/factory-worker.xml (the real one, read on 2026-10-19); other VMs are
# small stubs. State lives in $S; every call is logged to $S/calls.log. Verbs the
# GPU script must never use (destroy, define, undefine, reset, reboot, setmem,
# live attach/detach, ...) are logged as FORBIDDEN and fail.
#
# Knobs (files in $S): shutdown_ignored, start_fail (always|hostdev), attach_fail_fn (0|1),
# attach_extra (attach also adds a controller), detach_noop, on_shutoff_cmd (script run at
# power-off), restart_on_read N (someone starts it at the Nth state read while off), agent_silent, host_free_kib (MemAvailable with the VM off), vm_rss_kib.
S="${S:-/tmp/gpu-fake}"
echo "virsh $*" >> "$S/calls.log"
get() { cat "$S/$1" 2>/dev/null; }
UUID=ce0a610b-0a40-b2eb-1bfb-5a7203a24e22
NAME=factory-worker

pos=(); inactive=""; config=""; live=""
while [ $# -gt 0 ]; do
  case "$1" in
    --inactive) inactive=1 ;;
    --config) config=1 ;;
    --live) live=1 ;;
    --security-info|--all|--name|--daemon) ;;
    --mode) shift ;;
    *) pos+=("$1") ;;
  esac
  shift
done
verb="${pos[0]:-}"; dom="${pos[1]:-}"
me() { [ "$dom" = "$UUID" ] || [ "$dom" = "$NAME" ]; }
forbid() { echo "FORBIDDEN virsh ${pos[*]}" >> "$S/calls.log"; echo "error: forbidden in tests" >&2; exit 1; }

# MemAvailable follows the VM: running, it holds vm_rss_kib.
meminfo() {
  local avail; avail="$(get host_free_kib)"
  [ "$(get state)" = running ] && avail=$(( avail - $(get vm_rss_kib) ))
  printf 'MemTotal:       32637752 kB\nMemAvailable:   %s kB\n' "$avail" > "$S/meminfo"
}

# Running definition: the persistent one plus the aliases libvirt adds.
make_live() { sed "s#^\(\s*\)<driver name='vfio'/>#&\n\1<alias name='hostdev'/>#" "$S/cfg.xml" > "$S/live.xml"; }

# Is host function 01:00.<fn> the source of a hostdev in the definition?
has_src() { awk -v fn="$1" '/<hostdev /{h=1} h && /<address domain=.0x0000. bus=.0x01. slot=.0x00. function=.0x/ && $0 ~ ("function=.0x" fn ".") {f=1} /<\/hostdev>/{h=0} END{exit !f}' "$S/cfg.xml"; }
src_fn() { sed -n "s/.*<address domain='0x0000' bus='0x01' slot='0x00' function='0x\([01]\)'.*/\1/p" "$1" | head -1; }

case "$verb" in
  list) { echo "$NAME"; cat "$S/others" 2>/dev/null; } ;;
  domstate)
    if me && [ "$(get state)" = "shut off" ] && [ -f "$S/restart_on_read" ]; then
      n=$(( $(get restart_on_read) - 1 )); echo "$n" > "$S/restart_on_read"
      [ "$n" -le 0 ] && { echo running > "$S/state"; make_live; rm -f "$S/restart_on_read"; }
    fi
    if me; then get state; else n="$dom"; [ -f "$S/vm-$n.state" ] && cat "$S/vm-$n.state" || { echo "error: no domain" >&2; exit 1; }; fi ;;
  dumpxml)
    if me; then
      if [ -n "$inactive" ] || [ "$(get state)" != running ]; then cat "$S/cfg.xml"; else cat "$S/live.xml"; fi
    else cat "$S/vm-$dom.xml" 2>/dev/null || { echo "error: no domain" >&2; exit 1; }; fi ;;
  shutdown)
    me || forbid
    [ "$(get state)" = running ] || { echo "error: domain is not running" >&2; exit 1; }
    if [ ! -f "$S/shutdown_ignored" ]; then
      echo "shut off" > "$S/state"; rm -f "$S/live.xml"
      [ -f "$S/on_shutoff_cmd" ] && bash "$S/on_shutoff_cmd"
    fi
    meminfo; echo "Domain '$NAME' is being shutdown" ;;
  start)
    me || forbid
    [ "$(get state)" = "shut off" ] || { echo "error: domain is already active" >&2; exit 1; }
    case "$(get start_fail)" in
      always) echo "error: Failed to start domain" >&2; exit 1 ;;
      hostdev) grep -q '<hostdev ' "$S/cfg.xml" && { echo "error: vfio 0000:01:00.0: group 14 is not viable" >&2; exit 1; } ;;
    esac
    echo running > "$S/state"; make_live; meminfo; echo "Domain '$NAME' started" ;;
  attach-device|detach-device)
    me || forbid
    [ -n "$config" ] && [ -z "$live" ] || forbid
    [ "$(get state)" = "shut off" ] || echo "note: config-only change while running" >> "$S/calls.log"
    f="${pos[2]:-}"; fn="$(src_fn "$f")"
    [ -n "$fn" ] || { echo "error: bad device XML" >&2; exit 1; }
    if [ "$verb" = attach-device ]; then
      [ "$(get attach_fail_fn)" = "$fn" ] && { echo "error: attach failed" >&2; exit 1; }
      has_src "$fn" && { echo "error: device already present" >&2; exit 1; }
      { sed -n '1,/^    <watchdog /{/^    <watchdog /!p}' "$S/cfg.xml"
        sed 's/^/    /' "$f"
        [ -f "$S/attach_extra" ] && printf "    <controller type='pci' index='7' model='pcie-root-port'/>\n"
        sed -n '/^    <watchdog /,$p' "$S/cfg.xml"; } > "$S/cfg.new" && mv "$S/cfg.new" "$S/cfg.xml"
    else
      [ -f "$S/detach_noop" ] && exit 0
      has_src "$fn" || { echo "error: device not found" >&2; exit 1; }
      awk -v fn="$fn" '/<hostdev /{buf=$0 "\n"; h=1; next}
        h { buf=buf $0 "\n"; if ($0 ~ /<\/hostdev>/) { h=0; if (buf !~ ("bus=.0x01. slot=.0x00. function=.0x" fn ".")) printf "%s", buf }; next }
        { print }' "$S/cfg.xml" > "$S/cfg.new" && mv "$S/cfg.new" "$S/cfg.xml"
    fi
    echo "Device ${verb%-device}ed successfully" ;;
  domtime)
    me || forbid
    [ "$(get state)" = running ] && [ ! -f "$S/agent_silent" ] || { echo "error: guest agent is not responding" >&2; exit 1; }
    echo "Time: 1792000000" ;;
  version) echo "Running against daemon: 11.6.0 (fake)" ;;
  *) forbid ;;
esac
