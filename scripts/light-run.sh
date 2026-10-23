#!/usr/bin/env bash
# Runs light work (npm test, typecheck, build: the package.json scripts) in
# siltwake-light.slice, so heavy-check can clamp it while an exclusive
# measurement runs (TST-16, scripts/heavy/contention.mjs). Outside an
# exclusive run the slice is not limited for CPU.
#
#   scripts/light-run.sh COMMAND ...
#
# It runs COMMAND in place, unmoved:
# - inside a heavy-check job or the second worker's job (never moved out of a
#   job's limits), or already in the light slice;
# - where systemd's user manager isn't reachable (CI, containers).
# Memory: the light slice gets the memory.high and memory.max of the caller's
# nearest limited ancestor (for an agent, its T3 slice), unless it already has
# tighter ones, so moving work here never escapes the caller's memory budget.
slice=${SILTWAKE_LIGHT_SLICE:-siltwake-light.slice}
cg=$(sed -n 's/^0:://p' /proc/self/cgroup 2>/dev/null)
if [ -n "${SILTWAKE_JOB_TICKET:-}${SILTWAKE_LANE_TICKET:-}${SILTWAKE_LIGHT:-}" ] || [[ "$cg" == *siltwake* || "$cg" == *sched1test* ]] ||
   ! command -v systemd-run >/dev/null 2>&1 || ! systemctl --user show-environment >/dev/null 2>&1; then
  exec "$@"
fi
# The caller's memory budget: the nearest ancestor cgroup with a memory.max.
high=max max=max d=/sys/fs/cgroup$cg
while [ "$d" != /sys/fs/cgroup ] && [ -n "$d" ]; do
  m=$(cat "$d/memory.max" 2>/dev/null)
  if [ -n "$m" ] && [ "$m" != max ]; then max=$m high=$(cat "$d/memory.high" 2>/dev/null); [ "$high" = max ] && high=infinity; break; fi
  d=$(dirname "$d")
done
if [ "$max" != max ]; then
  cur=$(systemctl --user show -p MemoryMax --value "$slice" 2>/dev/null)
  if [ -z "$cur" ] || [ "$cur" = infinity ] || [ "$cur" -gt "$max" ] 2>/dev/null; then
    systemctl --user set-property --runtime "$slice" "MemoryMax=$max" "MemoryHigh=${high:-infinity}" >/dev/null 2>&1 || true
  fi
fi
export SILTWAKE_LIGHT=1
exec systemd-run --user --scope --quiet --collect --slice="$slice" -- "$@"
