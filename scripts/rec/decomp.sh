#!/usr/bin/env bash
# REC-1 R3b decomposition (BROWSER-HW-VIDEO-ENCODE-SOL §10 probe 5): where the
# recorder's cost goes, as within-run alternations (the recorder paused and
# resumed in place every 10 s), one per variant, at a fixed pose. Attribution
# (relative shares between variants), not the acceptance measurement.
#   bash scripts/rec/decomp.sh OUT_DIR [SECONDS_PER_VARIANT] [SAVES_DIR]
# Builds the game inside the job. SAVES_DIR (CW-1's derived saves: seg0.json, plan.json) defaults to /work/tmp/cw1/saves-8x.
set -u
out="${1:?usage: decomp.sh OUT_DIR [SECONDS] [SAVES_DIR]}"; secs="${2:-300}"; saves="${3:-/work/tmp/cw1/saves-8x}"
cd "$(dirname "$0")/../.."; mkdir -p "$out"
npm run build > "$out/build.log" 2>&1 || { tail -5 "$out/build.log"; exit 1; }
git rev-parse HEAD > dist/COMMIT
run() { local name="$1"; shift
  node scripts/rec/run.mjs --dist dist --save "$saves/seg0.json" --plan "$saves/plan.json" --segment 0 --owner-browser --no-isolate --no-pack \
    --rec playtest --hold "$secs" --alternate 10 --out "$out/$name" "$@" 2>&1 | grep -E 'probe|Error|refused' | cut -c1-200
  echo "$name: $(node -e 'const r=require(process.argv[1]).probe.alternation;console.log(JSON.stringify({pairs:r.pairs,mean:r.mean,lo:r.lo,hi:r.hi}))' "$PWD/$out/$name/run.json" 2>/dev/null || echo failed)"
}
run telemetry --video off
run capture-bitmap --encode off
run capture-frame --encode off --capture frame
run vp9-bitmap --codec vp9
run vp8-bitmap --codec vp8
run h264-bitmap --codec h264
run vp8-frame --codec vp8 --capture frame
