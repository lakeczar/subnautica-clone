#!/usr/bin/env bash
# REC-1 R3b decomposition (BROWSER-HW-VIDEO-ENCODE-SOL §10 probe 5): where the
# recorder's cost goes, as within-run alternations (the recorder paused and
# resumed in place every 10 s), one per variant, at a fixed pose. Attribution
# (relative shares between variants), not the acceptance measurement.
#   bash scripts/rec/decomp.sh OUT_DIR [SECONDS_PER_VARIANT] [SAVE_KIND]
# Builds the game inside the job. The save comes from the SAVE-1 library (`saves.js pick`, default kind
# tour-ready: the tour-fit Dart), and its library commit and kind are recorded in OUT_DIR/save.json.
set -u
out="${1:?usage: decomp.sh OUT_DIR [SECONDS] [SAVE_KIND]}"; secs="${2:-300}"; kind="${3:-tour-ready}"
cd "$(dirname "$0")/../.."; mkdir -p "$out"
npm run build > "$out/build.log" 2>&1 || { tail -5 "$out/build.log"; exit 1; }
git rev-parse HEAD > dist/COMMIT
npx tsc -p scripts/playthrough/tsconfig.json > "$out/saves-build.log" 2>&1 || { tail -5 "$out/saves-build.log"; exit 1; }
node .test-build/scripts/playthrough/saves.js pick "$kind" --json > "$out/save.json" || { echo "the save library refused $kind (see above)"; exit 3; }
save=$(node -e 'const p=require(process.argv[1]);console.log(p.path ?? p.file)' "$PWD/$out/save.json")
echo "save: $kind $(node -e 'const p=require(process.argv[1]);console.log(p.commit ?? "", p.path ?? p.file)' "$PWD/$out/save.json")"
run() { local name="$1"; shift
  node scripts/rec/run.mjs --dist dist --save "$save" --owner-browser --no-isolate --no-pack \
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
