#!/usr/bin/env bash
# Run a heavy test/render job on the shared 16 GiB factory-worker.
#
# Takes a machine-wide lock so only one heavy job runs at a time across all
# Siltwake worktrees, then runs the command in a memory-capped user scope with
# no swap. Waits for the lock (up to HEAVY_LOCK_WAIT seconds) instead of
# overlapping with another agent's job.
#
# Usage: scripts/heavy-check.sh [--deadline SECONDS] COMMAND [ARGS...]
# Env:   HEAVY_MEMORY_MAX (default 6G), HEAVY_LOCK_WAIT (default 3600)
set -euo pipefail

deadline=900
if [[ "${1:-}" == "--deadline" ]]; then
  deadline="$2"
  shift 2
fi
if [[ $# -eq 0 ]]; then
  echo "usage: $0 [--deadline SECONDS] COMMAND [ARGS...]" >&2
  exit 2
fi

lock=/work/tmp/siltwake-heavy-check.lock
mkdir -p "$(dirname "$lock")"
max="${HEAVY_MEMORY_MAX:-6G}"
unit="siltwake-heavy-$(basename "$PWD")-$$"

exec 9>"$lock"
if ! flock -n 9; then
  echo "heavy-check: waiting for lock held by: $(cat "$lock.owner" 2>/dev/null || echo unknown)" >&2
  flock -w "${HEAVY_LOCK_WAIT:-3600}" 9 || { echo "heavy-check: lock wait timed out" >&2; exit 75; }
fi
echo "$unit pid=$$ cwd=$PWD started=$(date -u +%FT%TZ) cmd=$*" >"$lock.owner"

status=0
systemd-run --user --scope --quiet --unit="$unit" \
  -p MemoryHigh="$(( ${max%G} * 1024 - 1024 ))M" -p MemoryMax="$max" -p MemorySwapMax=0 \
  timeout --kill-after=10s "${deadline}s" "$@" || status=$?
: >"$lock.owner"
case "$status" in
  124) echo "heavy-check: deadline ${deadline}s exceeded" >&2 ;;
  137) echo "heavy-check: killed (likely hit the ${max} memory cap)" >&2 ;;
esac
exit "$status"
