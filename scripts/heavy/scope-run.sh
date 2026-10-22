#!/bin/sh
# Runs inside a heavy-check v2 job scope (started by supervisor.mjs).
#
#   scope-run.sh JOBDIR DEADLINE_S EXPECTED_MEMORY_MAX_BYTES COMMAND [ARGS...]
#
# Records the scope's cgroup, refuses to run unless the scope's memory limits
# took effect (WORKER_RESOURCE_LIMITS: verify before the heavy command), runs
# the command under its deadline, then saves the scope's own accounting
# (memory.peak, OOM kills, CPU time) before the scope empties and disappears.
# The scope is delegated: the heavy test runner may move these processes into a
# leaf and give each test file a child cgroup (scripts/heavy-containment.mjs);
# the paths below stay the scope's own.
jobdir=$1 deadline=$2 expect_max=$3
shift 3
cg=/sys/fs/cgroup$(sed -n 's/^0:://p' /proc/self/cgroup)
echo "$cg" >"$jobdir/cgroup"
max=$(cat "$cg/memory.max") swap=$(cat "$cg/memory.swap.max")
if [ "$max" != "$expect_max" ] || [ "$swap" != 0 ]; then
  echo "heavy-check: scope limits not applied (memory.max=$max, expected $expect_max; memory.swap.max=$swap); not running" >&2
  : >"$jobdir/refused"
  exit 70
fi
# Launch gate, shared with `heavy-check cancel`: a cancel recorded before this
# point means the command never starts; after it, cancel stops the scope.
exec 5>>"$jobdir/gate"
flock 5
if [ -e "$jobdir/cancelled" ]; then
  : >"$jobdir/not-started"
  exit 75
fi
: >"$jobdir/started"
flock -u 5
exec 5>&-
# The job's lifetime is this scope's cgroup: the ticket's holder (holder.mjs)
# keeps the bridge and the reservation until the cgroup is empty.
timeout --kill-after=10s "${deadline}s" "$@"
rc=$?
{
  echo "rc=$rc"
  echo "peak=$(cat "$cg/memory.peak" 2>/dev/null)"
  sed -n 's/^oom_kill /oom_kill=/p' "$cg/memory.events"
  sed -n 's/^oom /oom_local=/p' "$cg/memory.events.local"
  sed -n 's/^usage_usec /usage_usec=/p' "$cg/cpu.stat"
} >"$jobdir/stats"
exit "$rc"
