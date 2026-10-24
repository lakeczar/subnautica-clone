#!/usr/bin/env bash
# REC-1 R3b: serve the game for the owner-PC check (docs/build/streams/rec1/OWNER-PC-CHECK.md)
# from the alickers sandbox, so the owner's own Windows Chrome opens it at
#   http://localhost:4173/?rec=playtest&recmeasure=1&reccheck=300
# (WSL2 forwards the sandbox's localhost to Windows). Run it through the 4070 lane, which
# pins the commit and keeps other jobs off the laptop while the owner measures:
#   heavy-check submit --machine 4070 --deadline 4200 --stall 600 -- bash scripts/rec/owner-check-serve.sh 60
#   bash scripts/rec/owner-check-serve.sh [MINUTES]   (default 60; cancel the ticket to stop earlier)
# Builds the job's commit, then serves dist on 127.0.0.1:4173 only (vite preview), touching the
# job heartbeat while it waits, and stops the server it started when it ends.
set -u
mins="${1:-60}"
cd "$(dirname "$0")/../.."
npm run build > /tmp/owner-check-build.log 2>&1 || { tail -5 /tmp/owner-check-build.log; exit 1; }
git rev-parse HEAD > dist/COMMIT
echo "build $(cat dist/COMMIT)"
setsid npx vite preview --host 127.0.0.1 --port 4173 --strictPort > /tmp/owner-check-serve.log 2>&1 &
pid=$!
trap 'kill -- -"$pid" 2>/dev/null; wait "$pid" 2>/dev/null' EXIT
for _ in $(seq 1 30); do curl -fsS -o /dev/null http://127.0.0.1:4173/ 2>/dev/null && break; sleep 1; done
curl -fsS -o /dev/null http://127.0.0.1:4173/ || { echo "the server did not start"; tail -5 /tmp/owner-check-serve.log; exit 1; }
echo "serving: http://localhost:4173/?rec=playtest&recmeasure=1&reccheck=300 for $mins min"
end=$(( $(date +%s) + mins * 60 ))
while [ "$(date +%s)" -lt "$end" ]; do
  kill -0 "$pid" 2>/dev/null || { echo "the server stopped"; tail -5 /tmp/owner-check-serve.log; exit 1; }
  [ -n "${SILTWAKE_JOB_HEARTBEAT:-}" ] && touch "$SILTWAKE_JOB_HEARTBEAT"
  echo "serving, $(( (end - $(date +%s)) / 60 )) min left"
  sleep 60
done
echo "done"
