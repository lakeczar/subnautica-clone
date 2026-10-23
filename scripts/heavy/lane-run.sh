#!/bin/bash
# heavy-check's wrapper inside the second worker (SCHED-2b), uploaded by the
# remote holder and run by scripts/alickers-job.sh inside the sandbox's
# `siltwake-job` scope, in the checkout at the ticket's commit:
#
#   lane-run.sh LANE_DIR TICKET CWD_REL ARGV_BASE64 SOAK TICK_S
#
# ARGV_BASE64 is the command's argv, NUL-separated, so no quoting survives the
# transport's shell layers. The wrapper records "PID START" for stops
# (remote.mjs remoteStop), refuses to start if the ticket was cancelled while
# it waited for the sandbox's job lock, sets the job's environment, and every
# TICK_S seconds reports two things on its output, which the remote holder
# reads: "siltwake-lane: heartbeat" when $SILTWAKE_JOB_HEARTBEAT was touched,
# and "siltwake-lane: memory.high N" when the scope's memory.high count rose
# (siltwake-job sets MemoryHigh at 85% of MemoryMax with no swap: a job past
# it is throttled, not killed).
lane=$1 ticket=$2 rel=$3 b64=$4 soak=$5 tick=${6:-10}
d="$lane/jobs/$ticket"
mkdir -p "$d"
echo "$$ $(cut -d' ' -f22 /proc/$$/stat)" >"$d/pid"
if [ -e "$d/cancelled" ]; then echo "siltwake-lane: cancelled before start; the command did not run"; exit 75; fi
cd "$rel" || { echo "siltwake-lane: no directory $rel in the checkout"; exit 70; }
cg=/sys/fs/cgroup$(sed -n 's/^0:://p' /proc/self/cgroup)
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
monitor() {
  local lastb=0 lasth b h
  lasth=$(sed -n 's/^high //p' "$cg/memory.events" 2>/dev/null)
  while sleep "$tick"; do
    b=$(stat -c %Y "$SILTWAKE_JOB_HEARTBEAT" 2>/dev/null || echo 0)
    if [ "$b" != 0 ] && [ "$b" != "$lastb" ]; then lastb=$b; echo "siltwake-lane: heartbeat"; fi
    h=$(sed -n 's/^high //p' "$cg/memory.events" 2>/dev/null)
    if [ -n "$h" ] && [ "$h" != "$lasth" ]; then lasth=$h; echo "siltwake-lane: memory.high $h"; fi
  done
}
monitor &
mon=$!
"${argv[@]}" &
child=$!
trap 'kill -TERM "$child" 2>/dev/null' TERM INT HUP
rc=0
while kill -0 "$child" 2>/dev/null; do wait "$child"; rc=$?; done
kill "$mon" 2>/dev/null
exit "$rc"
