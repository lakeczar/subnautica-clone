#!/usr/bin/env bash
# STEW-2 dry run: every guarded entry point, started as from an agent's shell on
# factory-worker, runs itself again through the queue client, and refuses (75)
# when the client can't be run. Run it as a queued job (it is light, but this
# keeps even its process starts inside the queue):
#
#   heavy-check --class quick --machine 3090 -- bash docs/build/streams/stew2/dry-run.sh OUT
#
# Each command runs with the job's variables removed (so it is not admitted as
# the job) and with SILTWAKE_HEAVY_CHECK set to a stand-in client that prints
# the command it was asked to run, then to a client that doesn't exist.
set -uo pipefail
out="${1:?usage: dry-run.sh OUT}"
cd "$(git rev-parse --show-toplevel)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
cat >"$tmp/heavy-check" <<'EOF'
#!/bin/sh
echo "[stand-in queue client] heavy-check $*"
exit 0
EOF
chmod +x "$tmp/heavy-check"
outside() { env -u SILTWAKE_JOB_TICKET -u SILTWAKE_HEAVY_LOCK_HELD -u SILTWAKE_LOCAL_OVERRIDE -u NODE_OPTIONS SILTWAKE_GUARD_STRICT=1 SILTWAKE_SCHED_DIR="$tmp/sched" "$@"; }
commands=(
  "npm test" "npm run build" "npm run typecheck" "npm run playthrough -- --scenario creel" "npm run test:build" "npm run bake:terrain"
  "node scripts/test-tier.mjs fast" "node scripts/test-build.mjs --typecheck" "node scripts/guard-architecture.mjs --quiet"
  "node scripts/check-campaign-economy.mjs" "node scripts/check-m1-economy.mjs" "node scripts/check-m2-a-economy.mjs" "node scripts/check-m2-b1-economy.mjs"
  "node scripts/check-progression-curve.mjs" "node scripts/upgrade-economy.mjs" "node scripts/sim-bench.mjs --states $tmp/states"
  "node scripts/timeline-save-bench.mjs --tree $tmp/tree" "bash scripts/saves-build-at.sh HEAD $tmp/never" "bash scripts/sim-differential.sh HEAD"
  "npm run build:direct"
)
{
  echo "# STEW-2 dry run at $(git rev-parse --short HEAD) on $(hostname), $(date -u +%FT%TZ)"
  echo "# inside this job:  $(node scripts/local-guard.mjs --status)"
  echo "# outside (no job): $(outside node scripts/local-guard.mjs --status)"
  for c in "${commands[@]}"; do
    echo; echo "\$ $c"
    s=$(date +%s%N)
    outside env SILTWAKE_HEAVY_CHECK="$tmp/heavy-check" $c 2>&1 | grep -E "local-guard|stand-in" | sed "s|$tmp|<tmp>|g"
    echo "  routed: exit ${PIPESTATUS[0]} in $(( ($(date +%s%N) - s) / 1000000 )) ms"
    outside env SILTWAKE_HEAVY_CHECK=/nonexistent/heavy-check $c >"$tmp/r" 2>&1; rc=$?
    echo "  no queue client: exit $rc: $(grep -m1 -o "refused: .*nothing ran\|runs only inside a heavy-check job" "$tmp/r")"
  done
  if [[ -e "$tmp/never" ]]; then echo "FAIL: saves-build-at.sh made its directory"; else echo; echo "saves-build-at.sh made no directory: nothing was built here"; fi
} | tee "$out"
