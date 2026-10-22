#!/usr/bin/env bash
# Run a heavy test/render job on the shared factory-worker.
#
# Shim: runs the machine-wide installed heavy-check v2 admission queue
# (scripts/heavy/, installed by scripts/heavy/install.sh to
# ~/.local/share/siltwake-sched/current), so every worktree shares one
# implementation and one queue. Usage: docs/build/WORKER_RESOURCE_LIMITS.md.
#
# Without an installed v2 (or with SILTWAKE_SCHED_V1=1) it falls back to v1
# below: a machine-wide lock so only one heavy job runs at a time, then the
# command in a memory-capped user scope with no swap.
#
# v1 usage: scripts/heavy-check.sh [--deadline SECONDS] COMMAND [ARGS...]
# v1 env:   HEAVY_MEMORY_MAX (default 6G), HEAVY_LOCK_WAIT (default 3600)
set -euo pipefail

v2="${SILTWAKE_SCHED_HOME:-$HOME/.local/share/siltwake-sched}/current/heavy-check.mjs"
if [[ -z "${SILTWAKE_SCHED_V1:-}" && -f "$v2" ]] && command -v node >/dev/null; then
  exec node "$v2" "$@"
fi

# v1 accepts v2's job options so v2-era callers (package.json) still work:
# --mem and --queue-timeout map to the v1 variables; the rest mean nothing here.
deadline=900
case "${1:-}" in
  submit|wait|status|log|cancel) echo "heavy-check: '$1' needs heavy-check v2 (scripts/heavy/install.sh); this is the v1 fallback" >&2; exit 2 ;;
  run) shift ;;
esac
while [[ $# -gt 0 ]]; do
  case "$1" in
    --deadline) deadline="$2"; shift 2 ;;
    --class|--cpus) shift 2 ;;
    --mem) [[ "$2" == *G ]] && HEAVY_MEMORY_MAX="$2"; shift 2 ;;
    --queue-timeout) HEAVY_LOCK_WAIT="$2"; shift 2 ;;
    --review) shift ;;
    --) shift; break ;;
    *) break ;;
  esac
done
if [[ $# -eq 0 ]]; then
  echo "usage: $0 [--deadline SECONDS] COMMAND [ARGS...]" >&2
  exit 2
fi

# Nested call (e.g. `npm run test:heavy` invoked through this script): the outer
# call already holds the lock and the memory scope, so just run the command.
if [[ -n "${SILTWAKE_HEAVY_LOCK_HELD:-}" ]]; then
  exec timeout --kill-after=10s "${deadline}s" "$@"
fi

# Never delete or recreate this file: v2 bridges to it by inode (shared flock).
lock=/work/tmp/siltwake-heavy-check.lock
mkdir -p "$(dirname "$lock")"
max="${HEAVY_MEMORY_MAX:-6G}"
unit="siltwake-heavy-$(basename "$PWD")-$$"

exec 9>>"$lock"
if ! flock -n 9; then
  echo "heavy-check: waiting for lock held by: $(cat "$lock.owner" 2>/dev/null || echo unknown)" >&2
  flock -w "${HEAVY_LOCK_WAIT:-3600}" 9 || { echo "heavy-check: lock wait timed out" >&2; exit 75; }
fi
echo "$unit pid=$$ cwd=$PWD started=$(date -u +%FT%TZ) cmd=$*" >"$lock.owner"

# v1 is exclusive, so the job holds the one GPU too.
status=0
SILTWAKE_HEAVY_LOCK_HELD=1 SILTWAKE_GPU_LEASE="v1-$$" systemd-run --user --scope --quiet --unit="$unit" \
  -p MemoryHigh="$(( ${max%G} * 1024 * 85 / 100 ))M" -p MemoryMax="$max" -p MemorySwapMax=0 \
  timeout --kill-after=10s "${deadline}s" "$@" || status=$?
: >"$lock.owner"
case "$status" in
  124) echo "heavy-check: deadline ${deadline}s exceeded" >&2 ;;
  137) echo "heavy-check: killed (likely hit the ${max} memory cap)" >&2 ;;
esac
exit "$status"
