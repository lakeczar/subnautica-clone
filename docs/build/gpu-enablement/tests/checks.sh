# Runs inside bwrap (see run.sh): /usr/local/sbin/virsh is the fake, and /mnt, /boot
# and /tmp are scratch. Each case resets the fake host, runs the staged script the
# way the approved ask does (launch, detached) and checks the outcome, the
# definition afterwards and the virsh calls it made.
set -u
SRC="${SRC:?}"
S=/tmp/gpu-fake; export S
HOME_DIR=/mnt/user/appdata/fleet-gpu
SCRIPT="$HOME_DIR/host-gpu.sh"
RUNS="$HOME_DIR/runs"
UUID=ce0a610b-0a40-b2eb-1bfb-5a7203a24e22
OURS="0000:01:00.0 0000:01:00.1"
pass=0 fail=0

# R1-10: the fake infrastructure must be what the scripts reach, or nothing here means anything.
mkdir -p /tmp/gpu-guard
if [ "$(command -v virsh)" != /usr/local/sbin/virsh ] || ! S=/tmp/gpu-guard virsh version 2>/dev/null | grep -q '(fake)' \
   || [ "$(command -v logger)" != /usr/local/sbin/logger ] || [ ! -x /usr/local/emhttp/webGui/scripts/notify ]; then
  echo "FAIL the fake virsh/logger/notify are not the ones selected (PATH=$PATH, virsh=$(command -v virsh))"; echo; echo "passed 0"; echo "failed 1"; exit 1
fi
echo "ok   fake virsh, logger and notify selected (PATH=$PATH)"; pass=1

ok()  { echo "ok   $*"; pass=$((pass + 1)); }
bad() { echo "FAIL $*"; fail=$((fail + 1)); }
is()  { local name="$1"; shift; if "$@"; then ok "$name"; else bad "$name"; [ -n "${RD:-}" ] && [ -f "$RD/run.log" ] && tail -n 15 "$RD/run.log" | sed 's/^/     | /'; fi; }
put() { printf '%s\n' "$2" > "$S/$1"; }
called()     { grep -Eq -- "$1" "$S/calls.log"; }
not_called() { ! grep -Eq -- "$1" "$S/calls.log"; }
MUTATING='virsh (shutdown|start|attach-device|detach-device) '

export GPU_SYSFS="$S/sys" GPU_MEMINFO="$S/meminfo" GPU_IOMEM="$S/iomem" GPU_PROC="$S/proc" GPU_PIDDIR="$S/run" \
  GPU_POLL=0.05 GPU_ARM_DELAY=0 GPU_SHUTDOWN_TIMEOUT=1 GPU_ACPI_RESEND=1 GPU_START_TIMEOUT=1 GPU_START_RETRY_DELAY=0 \
  GPU_AGENT_TIMEOUT=1 GPU_FLEET_LOCK_WAIT=1 GPU_REHEARSAL_HOLD=1 GPU_VIRSH_TIMEOUT=20

# A PCI function in the fake sysfs: <addr> <vendor> <device> <class> <driver|none>
mkdev() {
  local d="$S/sys/bus/pci/devices/$1"
  mkdir -p "$d"; echo "0x$2" > "$d/vendor"; echo "0x$3" > "$d/device"; echo "$4" > "$d/class"
  rm -f "$d/driver"; [ "$5" = none ] || { mkdir -p "$S/sys/bus/pci/drivers/$5"; ln -s "$S/sys/bus/pci/drivers/$5" "$d/driver"; }
  printf '0x0000000000000000 0x0000000000000000 0x0000000000000000\n' > "$d/resource"
  ln -sfn "$S/sys/kernel/iommu_groups/14" "$d/iommu_group"
  touch "$S/sys/kernel/iommu_groups/14/devices/$1"
}

# The host as it is expected to be: GPU and audio on vfio-pci in their own group, a
# 256 MiB BAR1, no host framebuffer on the card, factory-worker running with 16 GiB
# (QEMU holds 15.5 GiB) and 7.5 GiB available; three stopped VMs, two naming the GPU.
reset_fake() {
  rm -rf "$S" /tmp/fleet-gpu.lock /tmp/fleet-admin.lock "$RUNS"; mkdir -p "$S/sys/kernel/iommu_groups/14/devices" "$S/proc/4242" "$S/run"
  cp "$SRC/fixtures/factory-worker.xml" "$S/cfg.xml"
  put state running; cp "$S/cfg.xml" "$S/live.xml"
  mkdev 0000:01:00.0 10de 2204 0x030000 vfio-pci
  mkdev 0000:01:00.1 10de 1aef 0x040300 vfio-pci
  printf '%s\n' '0x00000000f6000000 0x00000000f6ffffff 0x0000000000040200' \
    '0x0000004000000000 0x000000400fffffff 0x000000000014220c' '0x0000000000000000 0x0000000000000000 0x0000000000000000' \
    '0x0000004010000000 0x0000004011ffffff 0x000000000014220c' '0x0000000000000000 0x0000000000000000 0x0000000000000000' \
    '0x000000000000e000 0x000000000000e07f 0x0000000000040101' '0x00000000f7000000 0x00000000f707ffff 0x0000000000046200' \
    > "$S/sys/bus/pci/devices/0000:01:00.0/resource"
  printf '%s\n' '00000000-00000fff : Reserved' 'f6000000-f6ffffff : 0000:01:00.0' '4000000000-400fffffff : 0000:01:00.0' > "$S/iomem"
  put host_free_kib 24117248; put vm_rss_kib 16252928
  echo 4242 > "$S/run/factory-worker.pid"; printf 'Name:\tqemu\nVmRSS:\t16252928 kB\n' > "$S/proc/4242/status"
  printf 'model name\t: Fake CPU\n' > "$S/proc/cpuinfo"; echo "BOOT_IMAGE=/bzimage" > "$S/proc/cmdline"
  printf '%s\n' "Debian AI 13 Control" "Debian AI13 Inference" "Windows 11 Gaming" > "$S/others"
  echo running > "$S/vm-Debian AI 13 Control.state"; printf "<domain type='kvm'>\n  <name>Debian AI 13 Control</name>\n  <devices>\n  </devices>\n</domain>\n" > "$S/vm-Debian AI 13 Control.xml"
  for v in "Debian AI13 Inference" "Windows 11 Gaming"; do
    echo "shut off" > "$S/vm-$v.state"
    { printf "<domain type='kvm'>\n  <name>%s</name>\n  <devices>\n" "$v"
      for fn in 0 1; do printf "    <hostdev mode='subsystem' type='pci' managed='yes'>\n      <source>\n        <address domain='0x0000' bus='0x01' slot='0x00' function='0x%s'/>\n      </source>\n    </hostdev>\n" "$fn"; done
      printf "  </devices>\n</domain>\n"; } > "$S/vm-$v.xml"
  done
  : > "$S/calls.log"; rm -f "$S/meminfo"; S="$S" bash /usr/local/sbin/virsh version > /dev/null
  printf 'MemTotal:       32637752 kB\nMemAvailable:   %s kB\n' $(( 24117248 - 16252928 )) > "$S/meminfo"
  : > "$S/calls.log"
  mkdir -p "$HOME_DIR"; cp "$SRC/host-gpu.sh" "$SCRIPT"
}
SHA="$(sha256sum < "$SRC/host-gpu.sh" | cut -d' ' -f1)"

# launch <action> [--rehearsal]: as the approved ask runs it; waits for result.json.
launch() {
  local out i
  out="$(bash "$SCRIPT" launch "$1" --expect-sha256 "$SHA" --not-after $(( $(date +%s) + 600 )) "${@:2}" 2>&1)"
  RID="$(sed -n 's/^Launched [a-z]* run \([^ ;]*\)[ ;].*/\1/p' <<<"$out")"; RD="$RUNS/$RID"
  [ -n "$RID" ] || { echo "     | launch said: $out"; return 1; }
  for i in $(seq 1 300); do [ -f "$RD/result.json" ] && break; sleep 0.1; done
  [ -f "$RD/result.json" ]
}
outcome() { sed -n 's/.*"outcome":"\([^"]*\)".*/\1/p' "$RD/result.json"; }
code()    { sed -n 's/.*"exit_code":\([0-9]*\).*/\1/p' "$RD/result.json"; }
srcs()    { awk '/<hostdev /{h=1;s=0} h&&/<source>/{s=1} h&&s&&/<address /{match($0,/function=.0x[01]/); print "0000:01:00." substr($0,RSTART+12,1); s=0} /<\/hostdev>/{h=0}' "$1" | sort | paste -sd' ' -; }
same_as_fixture() { diff -q <(awk '/<hostdev /{k=1} !k{print} /<\/hostdev>/{k=0}' "$S/cfg.xml") "$SRC/fixtures/factory-worker.xml" > /dev/null; }
state()   { cat "$S/state"; }

echo "== read-only preflight"
reset_fake
out="$(bash "$SCRIPT" preflight attach 2>&1)"; rc=$?
is "preflight passes on today's host shape" [ "$rc" = 0 ]
is "preflight plans the full cold change" grep -q 'plan: full' <<<"$out"
is "preflight reports BAR sizes and the group" grep -q '64-bit prefetchable 294912 KiB' <<<"$out"
is "preflight records stopped VMs naming the GPU" grep -q "stopped VM 'Windows 11 Gaming' also names the GPU" <<<"$out"
is "preflight changes nothing" not_called "$MUTATING"

refuse() { # <name> <expected text>: preflight fails with that text and changes nothing
  out="$(bash "$SCRIPT" preflight attach 2>&1)"; rc=$?
  is "$1: refused" [ "$rc" = 10 ]
  is "$1: says why" grep -q -- "$2" <<<"$out"
  is "$1: nothing changed" not_called "$MUTATING"
}
reset_fake; echo 0x2208 > "$S/sys/bus/pci/devices/0000:01:00.0/device"; refuse "another card at 01:00.0" "is 10de:2208, not the expected 10de:2204"
reset_fake; rm "$S/sys/bus/pci/devices/0000:01:00.1/driver"; mkdir -p "$S/sys/bus/pci/drivers/snd_hda_intel"; ln -s "$S/sys/bus/pci/drivers/snd_hda_intel" "$S/sys/bus/pci/devices/0000:01:00.1/driver"
refuse "audio function used by the host" "in use on the host by driver snd_hda_intel"
reset_fake; mkdev 0000:00:14.0 8086 a36d 0x0c0330 xhci_hcd; refuse "IOMMU group shared with a USB controller" "also holds 0000:00:14.0"
reset_fake; echo '4000000000-400fffffff : BOOTFB' >> "$S/iomem"; refuse "host framebuffer on BAR1" "host framebuffer 'BOOTFB' sits inside a BAR"
reset_fake; sed -i '2s/.*/0x0000004000000000 0x00000047ffffffff 0x000000000014220c/' "$S/sys/bus/pci/devices/0000:01:00.0/resource"; refuse "32 GiB resizable BAR" "resizable BAR"
reset_fake; echo running > "$S/vm-Windows 11 Gaming.state"; refuse "gaming VM running with the GPU" "VM 'Windows 11 Gaming' is 'running' and names the GPU"
reset_fake; sed -i "s#bus='0x05' slot='0x00' function='0x0'/>#bus='0x06' slot='0x00' function='0x0'/>#" "$S/cfg.xml"; cp "$S/cfg.xml" "$S/live.xml"; refuse "root port 6 taken" "guest bus 0x06 is already used"
reset_fake; printf 'Name:\tqemu\nVmRSS:\t9000000 kB\n' > "$S/proc/4242/status"; refuse "host short of memory to pin 16 GiB" "less than the 19398656 KiB needed"
reset_fake; rm "$S/run/factory-worker.pid"; refuse "QEMU memory unreadable" "QEMU memory use cannot be read"
reset_fake; sed -i "s#<uuid>.*</uuid>#<uuid>00000000-0b40-b2eb-1bfb-5a7203a24e22</uuid>#" "$S/cfg.xml"; refuse "different UUID" "is incomplete or not the expected VM"

echo "== launch guards"
reset_fake
out="$(bash "$SCRIPT" launch attach --expect-sha256 "$(printf '0%.0s' {1..64})" --not-after $(( $(date +%s) + 600 )) 2>&1)"; rc=$?
is "wrong hash starts nothing" [ "$rc" != 0 ] && is "wrong hash says so" grep -q "SHA-256 is not" <<<"$out"
out="$(bash "$SCRIPT" launch attach --expect-sha256 "$SHA" --not-after $(( $(date +%s) - 5 )) 2>&1)"; rc=$?
is "expired request starts nothing" [ "$rc" != 0 ] && is "expired request says so" grep -q "expired" <<<"$out"
is "no run folder for refused launches" [ ! -d "$RUNS" ] || [ -z "$(ls -A "$RUNS")" ]
is "guards change nothing" not_called "$MUTATING"

echo "== rehearsal: detached, outlives its launcher's process group"
reset_fake
GPU_REHEARSAL_HOLD=5 setsid bash -c "timeout -s KILL 2 bash -c 'bash \"$SCRIPT\" launch attach --expect-sha256 $SHA --not-after $(( $(date +%s) + 600 )) --rehearsal > $S/launch.out 2>&1; sleep 30'" ; true
RID="$(sed -n 's/^Launched [a-z]* run \([^ ]*\) .*/\1/p' "$S/launch.out")"; RD="$RUNS/$RID"
for i in $(seq 1 100); do [ -f "$RD/result.json" ] && break; sleep 0.1; done
is "rehearsal-ok after the launcher group was killed" [ "$(outcome)" = rehearsal-ok ]
is "its launcher was gone when it finished" grep -q '"launcher_alive_at_finish":"no"' "$RD/result.json"
is "rehearsal ran in its own session" [ "$(sed -n 's/.*"sid":"\([0-9]*\)".*/\1/p' "$RD/result.json")" != "$(sed -n 's/.*"launcher_sid":"\([0-9]*\)".*/\1/p' "$RD/launch.json")" ]
is "rehearsal backed up the definition to flash" [ -s "/boot/config/fleet/vm-backups/factory-worker-gpu-$RID.xml" ]
is "rehearsal changed nothing" not_called "$MUTATING"

echo "== attach"
reset_fake; launch attach
is "attached, exit 0" [ "$(outcome)/$(code)" = attached/0 ]
is "VM running" [ "$(state)" = running ]
is "both functions defined and running" [ "$(srcs "$S/cfg.xml")/$(srcs "$S/live.xml")" = "$OURS/$OURS" ]
is "rest of the definition byte-identical" same_as_fixture
is "guest addresses on root port 6, function 0 multifunction" grep -q "bus='0x06' slot='0x00' function='0x0' multifunction='on'" "$S/cfg.xml"
is "ACPI shutdown, config-only attach, start, in that order" [ "$(grep -Eo "$MUTATING" "$S/calls.log" | paste -sd, -)" = "virsh shutdown ,virsh attach-device ,virsh attach-device ,virsh start " ]
is "never forced, defined or live-attached" not_called 'FORBIDDEN|destroy|define |--live'

echo "== attach again: nothing to do"
launch attach
is "already-attached, exit 0" [ "$(outcome)/$(code)" = already-attached/0 ]
is "no second shutdown" [ "$(grep -c 'virsh shutdown' "$S/calls.log")" = 1 ]

echo "== detach restores only our change"
launch detach
is "detached, exit 0" [ "$(outcome)/$(code)" = detached/0 ]
is "definition equals the original fixture exactly" diff -q "$S/cfg.xml" "$SRC/fixtures/factory-worker.xml"
is "no hostdev running" [ -z "$(srcs "$S/live.xml")" ]

echo "== detach refuses a hostdev that is not ours"
reset_fake
sed -i "s#^    <watchdog #    <hostdev mode='subsystem' type='usb' managed='yes'>\n      <source>\n        <vendor id='0x1234'/>\n      </source>\n    </hostdev>\n&#" "$S/cfg.xml"; cp "$S/cfg.xml" "$S/live.xml"
launch detach
is "preflight-failed, exit 10" [ "$(outcome)/$(code)" = preflight-failed/10 ]
is "nothing changed" not_called "$MUTATING"
reset_fake
sed -i "s#^    <watchdog #    <hostdev mode='subsystem' type='usb' managed='yes'>\n      <source>\n        <vendor id='0x1234'/>\n      </source>\n    </hostdev>\n&#" "$S/cfg.xml"; cp "$S/cfg.xml" "$S/live.xml"
out="$(bash "$SCRIPT" preflight attach 2>&1)"; rc=$?
is "attach refuses a foreign hostdev too" eval '[ "$rc" = 10 ] && grep -q "hostdev defined '\''other'\''" <<<"$out"'

echo "== guest never powers off"
reset_fake; touch "$S/shutdown_ignored"; launch attach
is "shutdown-timeout, exit 13" [ "$(outcome)/$(code)" = shutdown-timeout/13 ]
is "definition untouched" diff -q "$S/cfg.xml" "$SRC/fixtures/factory-worker.xml"
is "nothing forced or started" not_called 'destroy|virsh start |attach-device'
is "ACPI was re-sent" [ "$(grep -c 'virsh shutdown' "$S/calls.log")" -ge 2 ]

echo "== VM will not start with the GPU"
reset_fake; put start_fail hostdev; launch attach
is "rolled-back, exit 20" [ "$(outcome)/$(code)" = rolled-back/20 ]
is "definition back to the original exactly" diff -q "$S/cfg.xml" "$SRC/fixtures/factory-worker.xml"
is "VM running without the GPU" [ "$(state)" = running ] && is "no hostdev live" [ -z "$(srcs "$S/live.xml")" ]

echo "== VM will not start at all"
reset_fake; put start_fail always; launch attach
is "left-off, exit 30" [ "$(outcome)/$(code)" = left-off/30 ]
is "definition back to the original" diff -q "$S/cfg.xml" "$SRC/fixtures/factory-worker.xml"

echo "== second attach fails half way"
reset_fake; put attach_fail_fn 1; launch attach
is "rolled-back, exit 20" [ "$(outcome)/$(code)" = rolled-back/20 ]
is "function 0 removed again" diff -q "$S/cfg.xml" "$SRC/fixtures/factory-worker.xml"
is "VM running" [ "$(state)" = running ]

echo "== attach changes something else too"
reset_fake; touch "$S/attach_extra"; launch attach
is "GPU removed again and VM started: rolled-back, exit 20" [ "$(outcome)/$(code)/$(state)/$(srcs "$S/cfg.xml")" = "rolled-back/20/running/" ]
is "the unexpected difference is recorded" grep -q "index='7'" "$RD/unexpected-diff.txt"
is "the result says the definition still differs" grep -q 'still differs from before' "$RD/result.json"

echo "== the undo cannot remove our entry"
reset_fake; put attach_fail_fn 1; touch "$S/detach_noop"; launch attach
is "needs-owner, exit 30, VM left off with the entry recorded" eval '[ "$(outcome)/$(code)/$(state)" = "needs-owner/30/shut off" ] && [ -s "$RD/definition-after-undo.xml" ]'
is "not started with a half-attached GPU" not_called 'virsh start ' 

echo "== someone changes the pins during the shutdown"
reset_fake; put on_shutoff_cmd "sed -i \"s/cpuset='11'/cpuset='5'/\" $S/cfg.xml"; launch attach
is "backed-off, exit 21 (was started-as-is; nothing is changed, so not a rollback)" [ "$(outcome)/$(code)" = backed-off/21 ]
is "no attach" not_called 'attach-device'
is "their change kept" grep -q "cpuset='5'" "$S/cfg.xml"
is "VM running" [ "$(state)" = running ]

echo "== someone starts it again after the shutdown"
reset_fake; put restart_on_read 2; launch attach
is "restarted-elsewhere, exit 21, no attach" eval '[ "$(outcome)/$(code)" = restarted-elsewhere/21 ] && not_called attach-device'

echo "== host memory taken while it was off"
reset_fake; put on_shutoff_cmd "echo 12000000 > $S/host_free_kib"; launch attach
is "checked before any change now: backed-off, exit 21, worker running" eval '[ "$(outcome)/$(code)/$(state)" = backed-off/21/running ]'
is "definition untouched" diff -q "$S/cfg.xml" "$SRC/fixtures/factory-worker.xml"
is "no attach" not_called 'attach-device'

echo "== guest agent silent after the start"
reset_fake; touch "$S/agent_silent"; launch attach
is "guest-silent, exit 22, GPU kept, VM running" [ "$(outcome)/$(code)/$(state)/$(srcs "$S/live.xml")" = "guest-silent/22/running/$OURS" ]

echo "== CANCEL inside the arm window"
reset_fake
out="$(GPU_ARM_DELAY=3 bash "$SCRIPT" launch attach --expect-sha256 "$SHA" --not-after $(( $(date +%s) + 600 )) 2>&1)"
RID="$(sed -n 's/^Launched [a-z]* run \([^ ]*\) .*/\1/p' <<<"$out")"; RD="$RUNS/$RID"; echo cancel > "$RD/CANCEL"
for i in $(seq 1 100); do [ -f "$RD/result.json" ] && break; sleep 0.1; done
is "cancelled, exit 12, nothing changed" eval '[ "$(outcome)/$(code)" = cancelled/12 ] && not_called "$MUTATING"'

echo "== another run holds the lock"
reset_fake; exec 7>/tmp/fleet-gpu.lock; flock -n 7
launch attach
is "locked, exit 11, nothing changed" eval '[ "$(outcome)/$(code)" = locked/11 ] && not_called "$MUTATING"'
exec 7>&-

echo "== Fleet's lock busy (taken before the shutdown now)"
reset_fake; exec 7>/tmp/fleet-admin.lock; flock -n 7
launch attach
is "locked, exit 11, never shut down, running" eval '[ "$(outcome)/$(code)/$(state)" = locked/11/running ] && not_called "$MUTATING"'
exec 7>&-

echo "== re-entry: off, with our entries already defined"
reset_fake; launch attach; echo "shut off" > "$S/state"; rm -f "$S/live.xml"; : > "$S/calls.log"
printf 'MemTotal:       32637752 kB\nMemAvailable:   24117248 kB\n' > "$S/meminfo"
launch attach
is "attached by starting only" eval '[ "$(outcome)/$(code)" = attached/0 ] && not_called '\''shutdown|attach-device'\'''


echo "== R1-01: a failed or incomplete read is never taken as absence"
fails_closed() { # <name>: preflight must refuse and change nothing
  out="$(bash "$SCRIPT" preflight attach 2>&1)"; rc=$?
  is "$1: preflight refuses (exit $rc)" [ "$rc" != 0 ]
  is "$1: nothing changed" not_called "$MUTATING"
}
reset_fake; touch "$S/fail_list"; fails_closed "VM list unreadable"
reset_fake; echo running > "$S/vm-Windows 11 Gaming.state"; touch "$S/fail_peer_xml"; fails_closed "running peer's definition unreadable"
reset_fake; touch "$S/fail_peer_state"; fails_closed "peer state unreadable"
reset_fake; touch "$S/fail_live_xml"; fails_closed "worker's running definition unreadable"
reset_fake; touch "$S/fail_inactive_xml"; fails_closed "worker's persistent definition unreadable"
reset_fake; rm "$S/iomem"; fails_closed "host memory map missing"
reset_fake; sed -i -E 's/^[0-9a-f]+-[0-9a-f]+/00000000-00000000/' "$S/iomem"; fails_closed "host memory map without addresses (not root)"
reset_fake; chmod 000 "$S/sys/bus/pci/devices/0000:01:00.0/resource"; [ -r "$S/sys/bus/pci/devices/0000:01:00.0/resource" ] && rm "$S/sys/bus/pci/devices/0000:01:00.0/resource"; fails_closed "GPU BARs unreadable"
reset_fake; rm -rf "$S/sys/kernel/iommu_groups/14/devices"; fails_closed "IOMMU group unreadable"
reset_fake; touch "$S/fail_live_xml"; launch attach
is "launch with an unreadable running definition: not attached, nothing changed" eval '[ "$(outcome)" != attached ] && not_called "$MUTATING"'
reset_fake; put on_start_cmd "touch $S/fail_live_xml"; launch attach
is "final check cannot read the running definition: not reported attached/0" [ "$(outcome)/$(code)" != attached/0 ]
reset_fake; launch attach; put on_start_cmd "touch $S/fail_live_xml"; : > "$S/calls.log"; launch detach
is "detach whose absence cannot be read back: not reported detached/0" [ "$(outcome)/$(code)" != detached/0 ]

reset_fake; put start_fail hostdev; put on_start_fail_cmd "touch $S/fail_inactive_xml"; launch attach
is "start fails and the definition cannot be read back: needs-owner, VM left off, never started unverified" eval '[ "$(outcome)/$(code)/$(state)" = "needs-owner/30/shut off" ] && [ "$(grep -c "virsh start " "$S/calls.log")" = 1 ]'

echo "== R1-02: ownership and the whole definition are checked again at each boundary"
reset_fake; put on_shutoff_cmd "echo running > '$S/vm-Windows 11 Gaming.state'"; launch attach
is "gaming VM starts during the shutdown: no attach" not_called 'attach-device'
is "gaming VM starts during the shutdown: not attached/0, worker running again" eval '[ "$(outcome)/$(code)" != attached/0 ] && [ "$(state)" = running ]'
reset_fake; put on_shutoff_cmd "sed -i 's/52:54:00:26:c2:c7/52:54:00:aa:bb:cc/' $S/cfg.xml"; launch attach
is "MAC changed during the shutdown: no attach, their edit kept" eval 'not_called '\''attach-device'\'' && grep -q '\''52:54:00:aa:bb:cc'\'' "$S/cfg.xml"'
is "MAC changed during the shutdown: not attached/0" [ "$(outcome)/$(code)" != attached/0 ]
reset_fake; put on_shutoff_cmd "rm $S/sys/bus/pci/devices/0000:01:00.1/driver; mkdir -p $S/sys/bus/pci/drivers/snd_hda_intel; ln -s $S/sys/bus/pci/drivers/snd_hda_intel $S/sys/bus/pci/devices/0000:01:00.1/driver"; launch attach
is "host driver takes the audio function during the shutdown: no attach" not_called 'attach-device'
reset_fake; put on_attach_cmd "echo running > '$S/vm-Windows 11 Gaming.state'"; launch attach
is "gaming VM starts between attach and start: GPU entries removed again" eval '[ -z "$(srcs "$S/cfg.xml")" ] && diff -q "$S/cfg.xml" "$SRC/fixtures/factory-worker.xml" > /dev/null'
is "gaming VM starts between attach and start: not attached/0, worker running" eval '[ "$(outcome)/$(code)" != attached/0 ] && [ "$(state)" = running ]'

echo "== R1-03: no shutdown without a complete, matching, durable backup"
reset_fake; touch "$S/truncated_backup"; launch attach
is "truncated backup read: no shutdown or attach" not_called "$MUTATING"
is "truncated backup read: refused" [ "$(code)" != 0 ]
reset_fake; touch "$S/backup_differs"; launch attach
is "backup differing from the checked definition: no shutdown" not_called "$MUTATING"
reset_fake; mkdir -p /boot/config/fleet; rm -rf /boot/config/fleet/vm-backups; touch /boot/config/fleet/vm-backups; launch attach
is "backup cannot be written: no shutdown" not_called "$MUTATING"
rm -f /boot/config/fleet/vm-backups

echo "== R1-08: a failed recovery start is never reported as started"
reset_fake; exec 7>/tmp/fleet-admin.lock; flock -n 7; put start_fail always; launch attach
is "Fleet's lock busy and starts failing: not started-as-is" [ "$(outcome)" != started-as-is ]
is "Fleet's lock busy: the worker is not shut down while another operation holds it" eval 'not_called '\''virsh shutdown '\'' && [ "$(state)" = running ]'
exec 7>&-
reset_fake; put on_shutoff_cmd "sed -i \"s/cpuset='11'/cpuset='5'/\" $S/cfg.xml; echo always > $S/start_fail"; launch attach
is "definition changed and the restart fails: reported left off (exit 30), not started" eval '[ "$(outcome)/$(code)" = left-off/30 ] && [ "$(state)" = "shut off" ]'
reset_fake; put on_shutoff_cmd "echo running > '$S/vm-Windows 11 Gaming.state'; echo always > $S/start_fail"; launch attach
is "conflict and the restart fails: reported left off (exit 30)" [ "$(outcome)/$(code)" = left-off/30 ]

echo
echo "passed $pass"
echo "failed $fail"
