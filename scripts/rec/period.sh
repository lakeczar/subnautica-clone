#!/usr/bin/env bash
# REC-1 R3b: the game held still with the recorder off, main-thread time per frame in short windows with
# their wall-clock ends, and every process's CPU each second beside it: do slow windows come on a fixed
# wall-clock period (the 300 s pattern), and does anything inside this machine line up with them?
#   bash scripts/rec/period.sh OUT_DIR [SECONDS] [WINDOW_S] [SAVE]
# The save: a fixture path in the repository (default: the refuge-reef hold), as in decomp.sh.
set -u
out="${1:?usage: period.sh OUT_DIR [SECONDS] [WINDOW_S] [SAVE]}"; secs="${2:-1200}"; win="${3:-5}"
save="${4:-docs/build/streams/rec1/fixtures/hold-refuge-reef.json}"
cd "$(dirname "$0")/../.."; mkdir -p "$out"
npm run build > "$out/build.log" 2>&1 || { tail -5 "$out/build.log"; exit 1; }
git rev-parse HEAD > dist/COMMIT
node scripts/rec/proc-sample.mjs $((secs + 120)) "$out/proc.ndjson" &
sampler=$!
trap 'kill "$sampler" 2>/dev/null' EXIT
node scripts/rec/run.mjs --dist dist --save "$PWD/$save" --owner-browser --no-isolate --no-pack \
  --rec off --hold "$secs" --window "$win" --out "$out/hold" 2>&1 | grep --line-buffered -E 'probe|window|Error'
node scripts/rec/period.mjs "$out/hold/run.json"
