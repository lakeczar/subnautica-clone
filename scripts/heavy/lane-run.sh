#!/bin/bash
# heavy-check's wrapper inside the second worker (SCHED-2b), uploaded by the
# remote holder and run by scripts/alickers-job.sh inside the sandbox's
# `siltwake-job` scope, in the checkout at the ticket's commit:
#
#   lane-run.sh LANE_DIR TICKET CWD_REL ARGV_BASE64 SOAK
#
# ARGV_BASE64 is the command's argv, NUL-separated, so no quoting survives the
# transport's shell layers. The wrapper records "PID START" for stops
# (remote.mjs remoteStop), refuses to start if the ticket was cancelled while
# it waited for the sandbox's job lock, records its scope's cgroup, and sets
# the job's environment. The remote holder watches the heartbeat file and the
# scope's memory.events from outside (remote.mjs remoteWatch): a monitor in
# here would share the job's cgroup and be throttled with it at MemoryHigh.
lane=$1 ticket=$2 rel=$3 b64=$4 soak=$5
d="$lane/jobs/$ticket"
mkdir -p "$d"
echo "$$ $(cut -d' ' -f22 /proc/$$/stat)" >"$d/pid"
if [ -e "$d/cancelled" ]; then echo "siltwake-lane: cancelled before start; the command did not run"; exit 75; fi
cd "$rel" || { echo "siltwake-lane: no directory $rel in the checkout"; exit 70; }
cg=/sys/fs/cgroup$(sed -n 's/^0:://p' /proc/self/cgroup)
echo "$cg" >"$d/cgroup"
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
"${argv[@]}" &
child=$!
trap 'kill -TERM "$child" 2>/dev/null' TERM INT HUP
rc=0
while kill -0 "$child" 2>/dev/null; do wait "$child"; rc=$?; done
exit "$rc"
