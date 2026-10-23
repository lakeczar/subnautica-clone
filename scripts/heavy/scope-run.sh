#!/bin/sh
# Runs inside a heavy-check v2 job scope (started by holder.mjs).
#
#   scope-run.sh JOBDIR DEADLINE_S EXPECTED_MEMORY_MAX_BYTES COMMAND [ARGS...]
#   fd 3: the legacy bridge lock (shared), from the ticket's holder
#
# Records the scope's cgroup, refuses to run unless the scope's memory limits
# took effect (WORKER_RESOURCE_LIMITS: verify before the heavy command), runs
# the command under its hard limit, then saves the scope's own accounting
# (memory.peak, OOM kills, CPU time) before the scope empties and disappears.
# The scope is delegated: the heavy test runner may move the command's
# processes into a leaf and give each test file a child cgroup
# (scripts/heavy-containment.mjs); the paths below stay the scope's own.
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
# Two child cgroups. "job" holds the anchor and the command, with
# memory.oom.group=1: an OOM at the scope's reservation kills all of them at
# once, the anchor included, so no workload can outlive the anchor's hold on
# the v1 bridge. A delegated child with its own memory.max (TT-1's per-file
# budgets, created under "job") is its own OOM domain, so a per-file OOM stays
# inside it. "ctl" holds only this wrapper, outside that group (SCHED-2, R5 P3):
# it survives the group kill and records the scope's OOM counters, so an OOM
# stays classified even if the ticket's holder is gone. The scope keeps
# OOMPolicy=continue: systemd's own OOM reaction would stop the whole scope on
# any OOM in its subtree, per-file ones included.
if ! { mkdir "$cg/ctl" "$cg/job" && echo $$ >"$cg/ctl/cgroup.procs" &&
       for c in $(cat "$cg/cgroup.controllers"); do echo "+$c"; done >"$cg/cgroup.subtree_control" &&
       echo 1 >"$cg/job/memory.oom.group"; }; then
  echo "heavy-check: could not set up the job's OOM group in $cg; not running" >&2
  : >"$jobdir/refused"
  exit 70
fi
# A stop of the scope (cancel, stall, deadline, BindsTo) signals this wrapper
# too: a trap (not an ignore, which children would inherit) lets it wait for
# the command and still write the stats.
trap 'stopped=1' TERM
# The anchor takes over the bridge inside "job" before anything else runs
# there, so v1 stays out until the scope's last process is gone (anchor.sh).
# Its PID is recorded with its start time, so it is never confused with a
# reused PID. Neither this wrapper nor the command holds the bridge.
sh -c 'echo $$ >"$1/cgroup.procs" && exec sh "$2"' anchor "$cg/job" "$(dirname "$0")/anchor.sh" 9<&3 &
anchor=$!
echo "$anchor $(cut -d' ' -f22 "/proc/$anchor/stat" 2>/dev/null)" >"$jobdir/anchor.pid"
exec 3<&-
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
# The job's lifetime is this scope's cgroup: the anchor keeps the bridge, and
# the ticket's holder (holder.mjs) the reservation, until the cgroup is empty.
sh -c 'cg=$1 d=$2; shift 2; echo $$ >"$cg/cgroup.procs" && exec timeout --kill-after=10s "${d}s" "$@"' run "$cg/job" "$deadline" "$@"
rc=$?
{
  echo "rc=$rc"
  echo "peak=$(cat "$cg/memory.peak" 2>/dev/null)"
  sed -n 's/^oom_kill /oom_kill=/p; s/^oom_group_kill /oom_group_kill=/p' "$cg/memory.events"
  sed -n 's/^oom /oom_local=/p' "$cg/memory.events.local"
  sed -n 's/^usage_usec /usage_usec=/p' "$cg/cpu.stat"
} >"$jobdir/stats"
exit "$rc"
