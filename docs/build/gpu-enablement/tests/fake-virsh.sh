#!/usr/bin/env bash
# A fake virsh for the offline tests. factory-worker's persistent definition starts
# as fixtures/factory-worker.xml (the real one, read on 2026-10-19); other VMs are
# small stubs. State lives in $S; every call is logged to $S/calls.log. Verbs the
# GPU script must never use (destroy, define, undefine, reset, reboot, setmem,
# live attach/detach, ...) are logged as FORBIDDEN and fail.
#
# Knobs (files in $S): shutdown_ignored, start_fail (always|hostdev), attach_fail_fn (0|1),
# attach_extra (attach also adds a controller), detach_noop, on_shutoff_cmd (script run at
# power-off), restart_on_read N (someone starts it at the Nth state read while off), agent_silent,
# host_free_kib (MemAvailable with the VM off), vm_rss_kib.
# Failed or broken reads (R1-01/R1-03): fail_list, fail_peer_xml, fail_peer_state, fail_live_xml,
# fail_inactive_xml, truncated_backup (security-info read prints "<domain>" and fails),
# backup_differs (security-info read succeeds with an extra element).
# R2: start_response_lost (start boots the VM, then reports failure), fail_state (the worker's
# state read fails), fail_state_on_read N (while off, the Nth state read and all later ones fail).
# R3: define replaces the persistent definition with the given file (identity checked);
# define_fail, define_fail_from N (the Nth define and later fail), define_noop, define_extra
# (libvirt adds a controller), define_drops_qemu (the <qemu:commandline> block and namespace
# are dropped), on_define_cmd (after a define).
# R4: define and domxml-to-native apply libvirt 12.2.0's qemuValidateDomainDefSysinfo
# (qemu_validate.c:1059-1081): a <sysinfo type='fwcfg'> entry not under "opt/" is invalid,
# and one under "opt/ovmf/" or "opt/org.qemu/" is reserved. domxml-to-native prints a
# QEMU argv (JSON -device vfio-pci per hostdev, the <qemu:arg> values appended, a secret
# object that must never be recorded). Knobs: native_fail, native_drop_qemu, native_drop_vfio,
# on_native_cmd (after it is called).
# Hooks: on_start_cmd (script run after a successful start), on_start_fail_cmd (after a failed
# start), on_attach_cmd (after an attach).
S="${S:-/tmp/gpu-fake}"
echo "virsh $*" >> "$S/calls.log"
get() { cat "$S/$1" 2>/dev/null; }
UUID=ce0a610b-0a40-b2eb-1bfb-5a7203a24e22
NAME=factory-worker

pos=(); inactive=""; config=""; live=""; secure=""
while [ $# -gt 0 ]; do
  case "$1" in
    --inactive) inactive=1 ;;
    --config) config=1 ;;
    --live) live=1 ;;
    --security-info) secure=1 ;;
    --all|--name|--daemon) ;;
    --mode) shift ;;
    --xml) xmlf="$2"; shift ;;
    *) pos+=("$1") ;;
  esac
  shift
done
verb="${pos[0]:-}"; dom="${pos[1]:-}"
# libvirt's qemuValidateDomainDefSysinfo, applied to a definition file.
validate_sysinfo() {
  awk '/<sysinfo type=.fwcfg.>/{s=1} s && /<entry name=/{ n=$0; sub(/.*<entry name=./, "", n); sub(/\047.*/, "", n)
      if (n !~ /^opt\//) { print "error: unsupported configuration: Invalid firmware name"; exit 1 }
      if (n ~ /^opt\/ovmf\// || n ~ /^opt\/org\.qemu\//) { print "error: unsupported configuration: That firmware name is reserved"; exit 1 } }
    /<\/sysinfo>/{s=0}' "$1" >&2
}
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
  list) [ -f "$S/fail_list" ] && { echo "error: failed to connect to the hypervisor" >&2; exit 1; }
    { echo "$NAME"; cat "$S/others" 2>/dev/null; } ;;
  domstate)
    if me && [ "$(get state)" = "shut off" ] && [ -f "$S/restart_on_read" ]; then
      n=$(( $(get restart_on_read) - 1 )); echo "$n" > "$S/restart_on_read"
      [ "$n" -le 0 ] && { echo running > "$S/state"; make_live; rm -f "$S/restart_on_read"; }
    fi
    if me && [ "$(get state)" = "shut off" ] && [ -f "$S/fail_state_on_read" ]; then
      n=$(( $(get fail_state_on_read) - 1 )); echo "$n" > "$S/fail_state_on_read"
      [ "$n" -le 0 ] && { touch "$S/fail_state"; rm -f "$S/fail_state_on_read"; }
    fi
    if me; then [ -f "$S/fail_state" ] && { echo "error: cannot read state" >&2; exit 1; }; get state
    else [ -f "$S/fail_peer_state" ] && { echo "error: cannot read state" >&2; exit 1; }
      [ -f "$S/vm-$dom.state" ] && cat "$S/vm-$dom.state" || { echo "error: no domain" >&2; exit 1; }; fi ;;
  dumpxml)
    if me; then
      if [ -n "$secure" ]; then
        [ -f "$S/truncated_backup" ] && { echo "<domain>"; exit 1; }
        sed '/^  <\/devices>/i\    <!-- secure -->' "$S/cfg.xml" > "$S/secure.xml"
        if [ -f "$S/backup_differs" ]; then cat "$S/secure.xml"; else cat "$S/cfg.xml"; fi
      elif [ -n "$inactive" ] || [ "$(get state)" != running ]; then
        [ -f "$S/fail_inactive_xml" ] && { echo "error: internal error" >&2; exit 1; }
        cat "$S/cfg.xml"
      else
        [ -f "$S/fail_live_xml" ] && { echo "error: internal error" >&2; exit 1; }
        cat "$S/live.xml"
      fi
    else
      [ -f "$S/fail_peer_xml" ] && { echo "error: internal error" >&2; exit 1; }
      cat "$S/vm-$dom.xml" 2>/dev/null || { echo "error: no domain" >&2; exit 1; }
    fi ;;
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
    fail_start() { [ -f "$S/on_start_fail_cmd" ] && bash "$S/on_start_fail_cmd"; echo "error: $1" >&2; exit 1; }
    case "$(get start_fail)" in
      always) fail_start "Failed to start domain" ;;
      hostdev) grep -q '<hostdev ' "$S/cfg.xml" && fail_start "vfio 0000:01:00.0: group 14 is not viable" ;;
    esac
    echo running > "$S/state"; make_live; meminfo
    [ -f "$S/on_start_cmd" ] && bash "$S/on_start_cmd"
    [ -f "$S/start_response_lost" ] && { echo "error: response lost after boot" >&2; exit 1; }
    echo "Domain '$NAME' started" ;;
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
      [ -f "$S/on_attach_cmd" ] && bash "$S/on_attach_cmd"
    else
      [ -f "$S/detach_noop" ] && exit 0
      has_src "$fn" || { echo "error: device not found" >&2; exit 1; }
      awk -v fn="$fn" '/<hostdev /{buf=$0 "\n"; h=1; next}
        h { buf=buf $0 "\n"; if ($0 ~ /<\/hostdev>/) { h=0; if (buf !~ ("bus=.0x01. slot=.0x00. function=.0x" fn ".")) printf "%s", buf }; next }
        { print }' "$S/cfg.xml" > "$S/cfg.new" && mv "$S/cfg.new" "$S/cfg.xml"
    fi
    echo "Device ${verb%-device}ed successfully" ;;
  define)
    f="${pos[1]:-}"; [ -f "$f" ] && grep -q "<uuid>$UUID</uuid>" "$f" || forbid
    n=$(( $(get define_count || echo 0) + 1 )); echo "$n" > "$S/define_count"
    validate_sysinfo "$f" || { echo "error: Failed to define domain from $f" >&2; exit 1; }
    [ -f "$S/define_fail" ] && { echo "error: XML error: define failed" >&2; exit 1; }
    [ -n "$(get define_fail_from)" ] && [ "$n" -ge "$(get define_fail_from)" ] && { echo "error: define failed" >&2; exit 1; }
    [ -f "$S/define_noop" ] && { echo "Domain '$NAME' defined from $f"; exit 0; }
    if [ -f "$S/define_drops_qemu" ]; then
      awk 'NR == 1 {sub(/ xmlns:qemu=.[^ >]*/, "")} /<qemu:commandline>/{d=1} !d{print} /<\/qemu:commandline>/{d=0}' "$f" > "$S/cfg.xml"
    else cp "$f" "$S/cfg.xml"; fi
    [ -f "$S/define_extra" ] && sed -i "s#^  </devices>#    <controller type='pci' index='7' model='pcie-root-port'/>\n&#" "$S/cfg.xml"
    [ -f "$S/on_define_cmd" ] && bash "$S/on_define_cmd"
    echo "Domain '$NAME' defined from $f" ;;
  domxml-to-native)
    [ "${pos[1]:-}" = qemu-argv ] && [ -f "${xmlf:-}" ] || forbid
    [ -f "$S/on_native_cmd" ] && bash "$S/on_native_cmd"
    [ -f "$S/native_fail" ] && { echo "error: internal error: unable to build the command line" >&2; exit 1; }
    validate_sysinfo "$xmlf" || exit 1
    grep -q "<uuid>$UUID</uuid>" "$xmlf" || { echo "error: not factory-worker" >&2; exit 1; }
    out="LC_ALL=C /usr/local/sbin/qemu -name guest=factory-worker,debug-threads=on -machine pc-q35-10.2"
    out="$out -object '{\"qom-type\":\"secret\",\"id\":\"vnc0-secret0\",\"data\":\"c2VjcmV0LXBhc3N3b3Jk\",\"format\":\"base64\"}'"
    i=0
    if [ ! -f "$S/native_drop_vfio" ]; then
      for fn in $(awk '/<hostdev /{h=1} h && /<source>/{s=1} h && s && /<address /{ f=$0; sub(/.*function=.0x/, "", f); sub(/[^0-9].*/, "", f); print f; s=0 } /<\/hostdev>/{h=0}' "$xmlf"); do
        out="$out -device '{\"driver\":\"vfio-pci\",\"host\":\"0000:01:00.$fn\",\"id\":\"hostdev$i\",\"bus\":\"pci.6\",\"addr\":\"0x0.0x$fn\"}'"; i=$((i + 1))
      done
    fi
    if [ ! -f "$S/native_drop_qemu" ]; then
      while read -r v; do out="$out $v"; done < <(sed -n "s#^ *<qemu:arg value='\(.*\)'/>\$#\1#p" "$xmlf")
    fi
    echo "$out" ;;
  domtime)
    me || forbid
    [ "$(get state)" = running ] && [ ! -f "$S/agent_silent" ] || { echo "error: guest agent is not responding" >&2; exit 1; }
    echo "Time: 1792000000" ;;
  version) echo "Running against daemon: 11.6.0 (fake)" ;;
  *) forbid ;;
esac
