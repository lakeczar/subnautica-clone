#!/bin/bash
# heavy-check's wrapper inside the second worker (SCHED-2b), uploaded by the
# remote holder and run by scripts/alickers-job.sh inside the sandbox's
# `siltwake-job` scope and job lock, in the checkout at the ticket's commit:
#
#   lane-run.sh LANE_DIR TICKET ATTEMPT CWD_REL ARGV_BASE64 SOAK ARTIFACTS_BASE64
#
# Every attempt has its own directory, LANE_DIR/jobs/TICKET/aATTEMPT: its PID,
# cgroup, heartbeat, yield file and staged outputs. A retry never sees an older
# attempt's markers. The receipt is elsewhere (the transport's --receipt DIR,
# LANE_DIR/receipts/TICKET/aATTEMPT), never named to the job: stdin's first
# line is "<nonce> DIR", and this wrapper's lines go there as "<nonce> lane ...".
# The job itself gets /dev/null as stdin, and neither the nonce nor DIR.
#
# - It refuses to start (receipt "lane refused …", exit 75) if the ticket was
#   cancelled or this attempt retired or superseded.
# - It records "PID START BOOT" and its scope's cgroup first, before those checks, so
#   a stop that finds no PID knows the job has not started.
# - After the command, still inside the lock, it stages each declared output
#   (ARTIFACTS_BASE64: NUL-separated paths) into the attempt's stage/
#   directory: a path inside the checkout is moved there (so it never leaks into
#   the next job's tree), one elsewhere is copied. Then stage/ is made read-only.
#   The remote holder fetches only stage/, after the lock is gone: nothing in
#   the shared checkout is read or removed once another job may own it.
lane=$1 ticket=$2 attempt=$3 rel=$4 b64=$5 soak=$6 arts=$7
t="$lane/jobs/$ticket" d="$lane/jobs/$ticket/a$attempt"
IFS=' ' read -r n c || true
exec </dev/null
mkdir -p "$d"
rec() { [ -n "$c" ] && printf '%s lane %s\n' "$n" "$*" >>"$c/receipt"; }
echo "$$ $(cut -d' ' -f22 /proc/$$/stat) $(cat /proc/sys/kernel/random/boot_id)" >"$d/pid"
cg=/sys/fs/cgroup$(sed -n 's/^0:://p' /proc/self/cgroup)
echo "$cg" >"$d/cgroup"
if [ -e "$t/cancelled" ]; then rec refused cancelled; echo "siltwake-lane: cancelled before start; the command did not run"; exit 75; fi
if [ -e "$d/retired" ]; then rec refused retired; echo "siltwake-lane: this attempt was retired; the command did not run"; exit 75; fi
# Only the ticket's current attempt may run: a delayed start of an older one never does.
if [ "$(cat "$t/current" 2>/dev/null)" != "$attempt" ]; then rec refused superseded; echo "siltwake-lane: a later attempt superseded this one; the command did not run"; exit 75; fi
top=$(pwd)
cd "$rel" || { rec refused "no directory $rel"; exit 70; }
mem_max=$(cat "$cg/memory.max" 2>/dev/null)
export SILTWAKE_LANE_TICKET="$ticket" SILTWAKE_JOB_HEARTBEAT="$d/heartbeat"
# The sandbox runs one job at a time, so this job has its GPU (gpu-lease.mjs
# also accepts the siltwake-job scope itself; older commits read the variable).
export SILTWAKE_GPU_LEASE="alickers-$ticket"
export SILTWAKE_SOAK_MACHINE="RTX 4070 Laptop (alickers, shared desktop host)"
# Worker counts for the sandbox's grant (siltwake-job: 6 CPUs; the heavy tier's
# pool below MemoryHigh). Nested heavy-check calls run inline, inside this job.
export SILTWAKE_JOB_CPUS=6 SILTWAKE_HEAVY_CONCURRENCY=4 BAKE_WORKERS=6 SILTWAKE_HEAVY_LOCK_HELD=1 SILTWAKE_HEAVY_CGROUP=delegated
case "$mem_max" in ''|max) ;; *) export SILTWAKE_HEAVY_POOL_MIB=$(( mem_max / 1048576 * 85 / 100 - 512 )) SILTWAKE_JOB_MEM_MIB=$(( mem_max / 1048576 )) ;; esac
[ "$soak" = 1 ] && export SILTWAKE_JOB_YIELD="$d/yield"
mapfile -d '' -t argv < <(printf %s "$b64" | base64 -d)
mapfile -d '' -t outputs < <(printf %s "$arts" | base64 -d)
"${argv[@]}" </dev/null &
child=$!
trap 'kill -TERM "$child" 2>/dev/null' TERM INT HUP
rc=0
while kill -0 "$child" 2>/dev/null; do wait "$child"; rc=$?; done
trap '' TERM INT HUP # staging must finish inside the lock
mkdir -p "$d/stage"
for p in "${outputs[@]}"; do
  [ -n "$p" ] || continue
  case "$p" in /*) src="$p" ;; *) src="$(pwd)/$p" ;; esac
  name=$(basename "$p")
  if [ ! -e "$src" ]; then rec stage-missing "$p"; continue; fi
  case "$(realpath -m "$src")/" in
    "$(realpath -m "$top")"/*) mv -- "$src" "$d/stage/$name" && rec staged "$name" || rec stage-failed "$p" ;;
    *) cp -a -- "$src" "$d/stage/$name" && rec staged "$name" || rec stage-failed "$p" ;;
  esac
done
chmod -R a-w "$d/stage"
rec stage done
exit "$rc"
