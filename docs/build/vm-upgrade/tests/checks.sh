# Runs inside bwrap (see run.sh): /usr/local/sbin/virsh is the fake, and /mnt,
# /boot, /root and /tmp are scratch. Each case resets the fake VM, runs the
# staged script with short timings and checks the outcome, the VM afterwards
# and the virsh calls it made.
set -u
SRC="${SRC:?}"
S=/tmp/vmu-fake; export S
HOME_DIR=/mnt/user/appdata/fleet-vm-upgrade
SCRIPT="$HOME_DIR/vm-ram-upgrade.sh"
RUNS="$HOME_DIR/runs"
UUID=ce0a610b-0a40-b2eb-1bfb-5a7203a24e22
OLD=12582912 NEW=16777216 GIB=1048576
PINS="0:0 1:1 2:8 3:9 4:10 5:11"
pass=0 fail=0

ok()  { echo "ok   $*"; pass=$((pass + 1)); }
bad() { echo "FAIL $*"; fail=$((fail + 1)); }
is()  { local name="$1"; shift; if "$@"; then ok "$name"; else bad "$name"; [ -n "${RD:-}" ] && [ -f "$RD/run.log" ] && tail -n 15 "$RD/run.log" | sed 's/^/     | /'; fi; }
put() { printf '%s\n' "$2" > "$S/$1"; }
get() { cat "$S/$1" 2>/dev/null; }
called()     { grep -Eq -- "$1" "$S/calls.log"; }
not_called() { ! grep -Eq -- "$1" "$S/calls.log"; }
count()      { grep -Ec -- "$1" "$S/calls.log"; }
MUTATING='virsh (shutdown|start|setmem|setmaxmem) '

export VMU_POLL=0.02 VMU_ARM_DELAY=0.1 VMU_SHUTDOWN_TIMEOUT=1 VMU_ACPI_RESEND=0.3 VMU_START_TIMEOUT=0.5 \
  VMU_START_RETRY_DELAY=0.05 VMU_AGENT_TIMEOUT=0.3 VMU_FLEET_LOCK_WAIT=0.3 VMU_REHEARSAL_HOLD=0.5 VMU_MEMINFO="$S/meminfo"

sync_meminfo() {
  local avail=$(( $(get host_free) - $(get taken) ))
  [ "$(get state)" = running ] && avail=$(( avail - $(get live_cur) ))
  printf 'MemTotal:       32000000 kB\nMemAvailable:   %s kB\n' "$avail" > "$S/meminfo"
}

# The fake as factory-worker is today: running, 12 GiB, host with 10 GiB available.
reset_fake() {
  rm -rf "$S"; mkdir -p "$S"
  put name factory-worker; put uuid "$UUID"; put uuid_by_name "$UUID"
  put state running; put cfg_mem $OLD; put cfg_cur $OLD; put live_mem $OLD; put live_cur $OLD
  put vcpus 6; put pins "$PINS"; put autostart enable; put acpi yes
  put topology "<topology sockets='1' dies='1' clusters='1' cores='3' threads='2'/>"
  put disks "/mnt/user/domains/factory-worker/vdisk1.img /mnt/user/domains/factory-worker/vdisk2.img"
  put shutdown_polls 3; put start_fail no; put setmaxmem_fail no; put setmem_fail no; put agent ok
  put host_free $((22 * GIB)); put taken 0
  : > "$S/calls.log"
}
off_at() { put state "shut off"; put cfg_mem "$1"; put cfg_cur "${2:-$1}"; put live_mem ""; put live_cur ""; }

n=0
# go [run options]: a foreground run in a fresh run folder. Sets RD, RC, OUT.
go() {
  n=$((n + 1)); RD="$RUNS/case-$n"; mkdir -p "$RD"
  [ -n "${PRECANCEL:-}" ] && touch "$RD/CANCEL"
  sync_meminfo; : > "$S/calls.log"
  bash "$SCRIPT" run --run-dir "$RD" "$@" > /dev/null 2>&1; RC=$?
  OUT="$(sed -n 's/.*"outcome":"\([^"]*\)".*/\1/p' "$RD/result.json" 2>/dev/null)"
}
outcome() { [ "$OUT" = "$1" ] && [ "$RC" = "$2" ] || { echo "     got outcome '$OUT' exit $RC, want '$1' exit $2"; return 1; }; }
vm_is() { # <state> <defined KiB> [<running KiB>]
  [ "$(get state)" = "$1" ] && [ "$(get cfg_mem)" = "$2" ] && [ "$(get cfg_cur)" = "$2" ] \
    && { [ -z "${3:-}" ] || { [ "$(get live_mem)" = "$3" ] && [ "$(get live_cur)" = "$3" ]; }; } \
    || { echo "     VM is '$(get state)' defined $(get cfg_mem)/$(get cfg_cur) running $(get live_mem)/$(get live_cur)"; return 1; }
}
no_forbidden() { not_called FORBIDDEN; }
wait_result() { local i; for i in $(seq 1 "${2:-300}"); do [ -f "$1/result.json" ] && return 0; sleep 0.05; done; return 1; }
newest_run() { ls -1d "$RUNS"/2*/ 2>/dev/null | sort | tail -1 | sed 's:/$::'; }

mkdir -p "$HOME_DIR" /mnt/user/domains/factory-worker /root
cp "$SRC/vm-ram-upgrade.sh" "$SCRIPT"
: > /mnt/user/domains/factory-worker/vdisk1.img; : > /mnt/user/domains/factory-worker/vdisk2.img
SHA="$(sha256sum < "$SCRIPT" | cut -d' ' -f1)"

echo "# syntax"
for f in vm-ram-upgrade.sh restore-tmp-links.sh worker-check.sh ask-command.sh; do is "bash -n $f" bash -n "$SRC/$f"; done

echo "# preflight (the default) is read-only"
reset_fake; sync_meminfo
out="$(bash "$SCRIPT" 2>&1)"; rc=$?
is "preflight: ok on today's VM" grep -q '^preflight: ok$' <<<"$out"
is "preflight: exit 0" [ "$rc" = 0 ]
is "preflight: plan full" grep -q '^plan: full$' <<<"$out"
is "preflight: changes nothing" not_called "$MUTATING"
put pins "0:0 1:1 2:2 3:3 4:4 5:5"
out="$(bash "$SCRIPT" preflight 2>&1)"; rc=$?
is "preflight: wrong pins reported" grep -q 'problem: vCPU pins' <<<"$out"
is "preflight: wrong pins exit 1" [ "$rc" = 1 ]

echo "# the upgrade"
reset_fake; go
is "full: upgraded" outcome upgraded 0
is "full: running with 16 GiB" vm_is running $NEW $NEW
is "full: ACPI shutdown only" called "virsh shutdown $UUID --mode acpi"
is "full: memory-only virsh calls" called "virsh setmaxmem $UUID $NEW --config"
is "full: setmem after setmaxmem" [ "$(grep -n "setmaxmem" "$S/calls.log" | head -1 | cut -d: -f1)" -lt "$(grep -n "virsh setmem" "$S/calls.log" | head -1 | cut -d: -f1)" ]
is "full: started" called "virsh start $UUID"
is "full: nothing forbidden (no destroy, define, ...)" no_forbidden
is "full: other VMs never addressed" not_called 'virsh [a-z-]+ .*Debian'
is "full: pins and topology kept" [ "$(get pins)" = "$PINS" ]
is "full: backup has the security info" grep -q FAKE-VNC-SECRET /boot/config/fleet/vm-backups/factory-worker-case-$n.xml
is "full: run folder has no secrets" bash -c "! grep -rq FAKE-VNC-SECRET '$RD'"
is "full: guest agent recorded" grep -q '"guest_agent":"answered' "$RD/result.json"
is "full: owner notified" grep -q 'upgrade: upgraded' "$S/notify.log"
is "full: state.json says finished" grep -q '"phase":"finished"' "$RD/state.json"
go
is "re-run: already-upgraded" outcome already-upgraded 0
is "re-run: does not stop the VM" not_called "$MUTATING"

echo "# re-entry from every in-between state"
reset_fake; put cfg_mem $NEW; put cfg_cur $NEW; go
is "16 GiB defined, running 12: shutdown + start" outcome upgraded 0
is "  ...no memory change needed" not_called 'setmem|setmaxmem'
is "  ...was shut down" called 'virsh shutdown'
reset_fake; off_at $OLD; go
is "off at 12 GiB: upgraded" outcome upgraded 0
is "  ...no shutdown sent" not_called 'virsh shutdown'
reset_fake; off_at $NEW; go
is "off at 16 GiB: upgraded" outcome upgraded 0
is "  ...start only" [ "$(count "$MUTATING")" = 1 ]
reset_fake; off_at $NEW $OLD; go
is "off, half-changed (max 16, current 12): upgraded" outcome upgraded 0
is "  ...16 GiB both" vm_is running $NEW $NEW
reset_fake; put state paused; go
is "paused: preflight-failed" outcome preflight-failed 10
is "  ...nothing changed" not_called "$MUTATING"
reset_fake; put cfg_mem 8388608; put cfg_cur 8388608; put live_mem 8388608; put live_cur 8388608; go
is "unexpected memory (8 GiB): preflight-failed" outcome preflight-failed 10

echo "# fixed target"
# target <name> <knob> <value>: a run on a VM that differs in one way stops before touching it.
target() {
  reset_fake; put "$2" "$3"; go
  is "$1: preflight-failed" outcome preflight-failed 10
  is "  ...not stopped or changed" not_called "$MUTATING"
}
target "name points at another UUID" uuid_by_name 11111111-2222-3333-4444-555555555555
target "autostart off" autostart disable
target "topology differs (what vm resize would write)" topology "<topology sockets='1' dies='1' clusters='1' cores='6' threads='1'/>"
target "8 vCPUs" vcpus 8
target "disks differ" disks "/mnt/user/domains/factory-worker/vdisk1.img /mnt/user/domains/other/vdisk2.img"
target "no ACPI" acpi no
reset_fake; rm /mnt/user/domains/factory-worker/vdisk2.img; go; : > /mnt/user/domains/factory-worker/vdisk2.img
is "a disk file is missing: preflight-failed" outcome preflight-failed 10

echo "# before the shutdown"
reset_fake; put host_free $((15 * GIB)); go
is "host short of memory: preflight-failed" outcome preflight-failed 10
is "  ...not stopped" not_called "$MUTATING"
reset_fake; PRECANCEL=1 go; PRECANCEL=
is "CANCEL in the arm window: cancelled" outcome cancelled 12
is "  ...no shutdown" not_called 'virsh shutdown'
reset_fake; exec 7>/tmp/fleet-vm-ram-upgrade.lock; flock 7; go; exec 7>&-
is "another run holds the lock: locked" outcome locked 11
is "  ...nothing changed" not_called "$MUTATING"

echo "# something else changes the VM during the arm window"
# armed <command...>: start a run, run the command while it is armed, wait for the end.
armed() {
  n=$((n + 1)); RD="$RUNS/case-$n"; mkdir -p "$RD"; sync_meminfo; : > "$S/calls.log"
  VMU_ARM_DELAY=1.5 bash "$SCRIPT" run --run-dir "$RD" > /dev/null 2>&1 &
  local pid=$! i
  for i in $(seq 1 200); do grep -q '"phase":"armed"' "$RD/state.json" 2>/dev/null && break; sleep 0.02; done
  "$@"; sync_meminfo
  wait "$pid"; RC=$?; OUT="$(sed -n 's/.*"outcome":"\([^"]*\)".*/\1/p' "$RD/result.json")"
}
reset_fake; armed off_at $OLD
is "VM shut off by someone else: still upgraded" outcome upgraded 0
is "  ...without sending a shutdown" not_called 'virsh shutdown'
reset_fake; armed put pins "0:0 1:1 2:8 3:9 4:10 5:7"
is "pins changed while armed: preflight-failed" outcome preflight-failed 10
is "  ...not stopped" not_called "$MUTATING"
reset_fake; armed eval 'put cfg_mem $NEW; put cfg_cur $NEW; put live_mem $NEW; put live_cur $NEW'
is "upgraded by someone else while armed: already-upgraded" outcome already-upgraded 0
is "  ...not stopped" not_called "$MUTATING"
reset_fake; armed put state paused
is "paused while armed: preflight-failed" outcome preflight-failed 10
is "  ...not stopped" not_called "$MUTATING"

echo "# the shutdown"
reset_fake; put shutdown_polls never; go
is "guest never powers off: shutdown-timeout" outcome shutdown-timeout 13
is "  ...still running at 12 GiB" vm_is running $OLD $OLD
is "  ...ACPI asked again, never forced" [ "$(count "virsh shutdown $UUID --mode acpi")" -ge 2 ]
is "  ...no memory change" not_called 'setmem|setmaxmem'
is "  ...nothing forbidden" no_forbidden
reset_fake; touch "$S/on_shutoff_restart"; go
is "something else starts it after shut off: restarted-elsewhere" outcome restarted-elsewhere 21
is "  ...memory untouched" not_called 'setmem|setmaxmem'
reset_fake; put on_shutoff_pins "0:0 1:1 2:8 3:9 4:10 5:7"; go
is "definition changed while off: started-as-is" outcome started-as-is 21
is "  ...memory untouched" not_called 'setmem|setmaxmem'
is "  ...running again" vm_is running $OLD $OLD
is "  ...their change kept" [ "$(get pins)" = "0:0 1:1 2:8 3:9 4:10 5:7" ]

echo "# the change"
reset_fake; put setmaxmem_fail yes; go
is "setmaxmem fails: rolled-back-started-old" outcome rolled-back-started-old 20
is "  ...running at 12 GiB" vm_is running $OLD $OLD
reset_fake; put setmem_fail yes; go
is "setmem fails after setmaxmem: rolled-back-started-old" outcome rolled-back-started-old 20
is "  ...12 GiB maximum restored too" vm_is running $OLD $OLD
reset_fake; echo "  <description>edited by someone</description>" > "$S/setmem_inject"; go
is "something else changed with the memory: rolled-back-started-old" outcome rolled-back-started-old 20
is "  ...memory back to 12 GiB" vm_is running $OLD $OLD
is "  ...the other change is not clobbered" grep -q 'edited by someone' "$S/extra"
is "  ...the difference is recorded" grep -q 'edited by someone' "$RD/unexpected-diff-$NEW.txt"
is "  ...never redefined from the backup" no_forbidden
reset_fake; exec 7>/tmp/fleet-admin.lock; flock 7; go; exec 7>&-
is "fleet-admin lock busy: rolled-back-started-old" outcome rolled-back-started-old 20
is "  ...running at 12 GiB" vm_is running $OLD $OLD

echo "# the start"
reset_fake; put start_fail once; go
is "first start fails: retried, upgraded" outcome upgraded 0
reset_fake; put start_fail new; go
is "16 GiB will not start: rolled-back-started-old" outcome rolled-back-started-old 20
is "  ...running at 12 GiB" vm_is running $OLD $OLD
reset_fake; put start_fail always; go
is "no start at all: left-off" outcome left-off 30
is "  ...off, back at 12 GiB" vm_is "shut off" $OLD
is "  ...owner alerted" grep -q -- '-i alert' "$S/notify.log"
reset_fake; put on_shutoff_take $((5 * GIB)); go
is "host memory taken during shutdown: rolled-back-started-old" outcome rolled-back-started-old 20
is "  ...running at 12 GiB" vm_is running $OLD $OLD
reset_fake; put on_shutoff_take $((10 * GIB)); go
is "too little left even for 12 GiB: left-off" outcome left-off 30
is "  ...not started" [ "$(count 'virsh start')" = 0 ]
reset_fake; put live_pins "0:0 1:1 2:2 3:3 4:4 5:5"; go
is "runs but pins differ live: started-unverified" outcome started-unverified 22
is "  ...not stopped again" [ "$(count 'virsh shutdown')" = 1 ]
reset_fake; put agent no; go
is "no guest agent: still upgraded" outcome upgraded 0
is "  ...recorded" grep -q '"guest_agent":"no answer' "$RD/result.json"

echo "# killed mid-run, then re-run"
reset_fake; put shutdown_polls never; sync_meminfo; : > "$S/calls.log"
n=$((n + 1)); RD="$RUNS/case-$n"; mkdir -p "$RD"
VMU_SHUTDOWN_TIMEOUT=30 bash "$SCRIPT" run --run-dir "$RD" > /dev/null 2>&1 &
pid=$!
for i in $(seq 1 200); do grep -q '"phase":"shutting-down"' "$RD/state.json" 2>/dev/null && break; sleep 0.02; done
kill -TERM "$pid"; wait "$pid"; RC=$?; OUT="$(sed -n 's/.*"outcome":"\([^"]*\)".*/\1/p' "$RD/result.json")"
is "TERM during the shutdown wait: aborted" outcome aborted 31
rm -f "$S/shutdown_pending"; off_at $OLD   # the guest finished powering off after the script died
go
is "re-run after the abort: upgraded" outcome upgraded 0
is "  ...without a second shutdown" not_called 'virsh shutdown'

echo "# launch: the boundary between the caller and the run"
# The approved command exactly as ask-command.sh prints it for the owner, and a
# copy of approve.sh's runner: ( cd /root && timeout 3600 bash -c "$cmd" ) > output.
approved() { bash "$SRC/ask-command.sh" ${1:+"$1"}; }
runner() { ( cd /root && timeout "${2:-3600}" bash -c "$1" ) > /tmp/runner.out 2>&1; echo $? > /tmp/runner.exit; }
run_id_of() { sed -n 's/^Launched run \([^ ]*\) .*/\1/p' /tmp/runner.out; }

reset_fake; sync_meminfo
runner "$(approved --rehearsal)"
RD="$RUNS/$(run_id_of)"
is "rehearsal: launcher returned 0" [ "$(cat /tmp/runner.exit)" = 0 ]
is "rehearsal: launcher returned before the run finished" [ ! -f "$RD/result.json" ]
is "rehearsal: finishes on its own" wait_result "$RD"
OUT="$(sed -n 's/.*"outcome":"\([^"]*\)".*/\1/p' "$RD/result.json")"; RC="$(sed -n 's/.*"exit_code":\([0-9]*\).*/\1/p' "$RD/result.json")"
is "rehearsal: rehearsal-ok" outcome rehearsal-ok 0
is "rehearsal: changed nothing" not_called "$MUTATING"
is "rehearsal: no backup written" [ ! -e "/boot/config/fleet/vm-backups/factory-worker-$(run_id_of).xml" ]
is "rehearsal: launcher gone before the end" grep -q '"launcher_alive_at_finish":"no"' "$RD/result.json"
lsid="$(sed -n 's/.*"launcher_sid":"\([0-9]*\)".*/\1/p' "$RD/launch.json")"; rsid="$(sed -n 's/.*"sid":"\([0-9]*\)".*/\1/p' "$RD/result.json")"
is "rehearsal: run in its own session ($rsid, launcher $lsid)" [ -n "$rsid" ] && [ "$rsid" != "$lsid" ]
is "rehearsal: runs its own verified copy" [ "$(sha256sum < "$RD/vm-ram-upgrade.sh" | cut -d' ' -f1)" = "$SHA" ]

# The runner stays alive and its timeout signals its whole process group while the
# run is waiting for the shutdown; a SIGHUP goes to the run as well.
reset_fake; put shutdown_polls 60; sync_meminfo
VMU_SHUTDOWN_TIMEOUT=30 runner "$(approved '') && sleep 30" 1
RD="$RUNS/$(run_id_of)"
is "group kill: runner was timed out" [ "$(cat /tmp/runner.exit)" = 124 ]
pid="$(sed -n 's/.*"pid":\([0-9]*\).*/\1/p' "$RD/state.json")"
kill -HUP "$pid" 2>/dev/null
is "group kill: run survives and finishes" wait_result "$RD" 400
OUT="$(sed -n 's/.*"outcome":"\([^"]*\)".*/\1/p' "$RD/result.json")"; RC=0
is "group kill: upgraded" outcome upgraded 0
is "group kill: running with 16 GiB" vm_is running $NEW $NEW

reset_fake; sync_meminfo; before="$(ls "$RUNS" | wc -l)"
cp "$SCRIPT" /tmp/staged.bak; echo "# tampered" >> "$SCRIPT"
runner "$(approved '')"
cp /tmp/staged.bak "$SCRIPT"
is "tampered staged file: the approved command stops" [ "$(cat /tmp/runner.exit)" != 0 ]
is "  ...no run started" [ "$(ls "$RUNS" | wc -l)" = "$before" ]
is "  ...nothing called" not_called "$MUTATING"
out="$(bash "$SCRIPT" launch --expect-sha256 "$(printf '0%.0s' $(seq 64))" 2>&1)"; rc=$?
is "launch with the wrong hash: refused" [ "$rc" = 2 ] && grep -q 'nothing was started' <<<"$out"
is "launch without a hash: refused" bash -c "! bash '$SCRIPT' launch >/dev/null 2>&1"

echo "# worker-check: T3's agent slice formula"
is "12 GiB guest gives today's limits" [ "$(bash "$SRC/worker-check.sh" cgroup-expect 12542808064)" = "memory.high 6271401984 memory.max 9407102976" ]
is "16 GiB guest" [ "$(bash "$SRC/worker-check.sh" cgroup-expect 16800000000)" = "memory.high 10357547008 memory.max 12599996416" ]

echo "# restore-tmp-links"
CK=/tmp/rtl/ck; TM=/tmp/rtl/tmp; rm -rf /tmp/rtl; mkdir -p "$CK" "$TM" /tmp/rtl/src/dir-a
echo one > /tmp/rtl/src/file-a; echo two > /tmp/rtl/src/dir-a/inner; echo three > /tmp/rtl/src/file-b
tar -cf "$CK/tmp-siltwake.tar" -C /tmp/rtl/src file-a dir-a file-b
printf '%s\0' file-a dir-a file-b > "$CK/tmp-paths.nul"
echo "someone else's" > "$TM/file-b"
rsha="$(sha256sum < "$CK/tmp-siltwake.tar" | cut -d' ' -f1)"
rtl() { RTL_CHECKPOINT="$CK" RTL_TMP="$TM" RTL_SHA256="${RSHA:-$rsha}" bash "$SRC/restore-tmp-links.sh" "$@" 2>&1; }
out="$(rtl)"
is "dry run: would link 2, keeps 1" grep -q 'would link: 2, kept (exist in /tmp/rtl/tmp): 1' <<<"$out"
is "dry run: nothing extracted or linked" [ ! -e "$CK/tmp-restored" ] && [ ! -e "$TM/file-a" ]
out="$(RSHA=$(printf 'f%.0s' $(seq 64)) rtl --apply)"; rc=$?
is "wrong archive hash: refuses" [ "$rc" = 1 ] && [ ! -e "$CK/tmp-restored" ]
out="$(rtl --apply)"; rc=$?
is "apply: links the missing names" [ "$rc" = 0 ] && [ "$(cat "$TM/file-a")" = one ] && [ "$(cat "$TM/dir-a/inner")" = two ]
is "apply: links point at the disk copy" [ "$(readlink "$TM/file-a")" = "$CK/tmp-restored/file-a" ]
is "apply: an existing /tmp entry is untouched" [ "$(cat "$TM/file-b")" = "someone else's" ] && [ ! -L "$TM/file-b" ]
out="$(rtl --apply)"
is "apply again: idempotent" grep -q 'linked before: 2, linked now: 0' <<<"$out"

# Let any detached run from above finish before the sandbox goes away.
for i in $(seq 1 100); do pgrep -f 'vm-ram-upgrade.sh run' >/dev/null || break; sleep 0.1; done

echo "passed $pass"
echo "failed $fail"
