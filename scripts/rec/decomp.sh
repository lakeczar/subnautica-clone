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
save=$(node -e 'const p=require(require("path").resolve(process.argv[1]));console.log(p.path ?? p.file)' "$out/save.json")
echo "save: $kind $(node -e 'const p=require(require("path").resolve(process.argv[1]));console.log(p.commit ?? "", p.path ?? p.file)' "$out/save.json")"
run() { local name="$1"; shift
  node scripts/rec/run.mjs --dist dist --save "$save" --owner-browser --no-isolate --no-pack \
    --rec playtest --hold "$secs" --alternate 10 --out "$out/$name" "$@" 2>&1 | grep --line-buffered -E 'probe|window|Error|refused' | cut -c1-200
  echo "$name: $(node -e 'const r=require(require("path").resolve(process.argv[1])).probe.alternation;console.log(JSON.stringify({pairs:r.pairs,mean:r.mean,lo:r.lo,hi:r.hi}))' "$out/$name/run.json" 2>/dev/null || echo failed)"
}
# VARIANTS (env): which to run, space-separated; default all of the first decomposition.
for v in ${VARIANTS:-telemetry capture-bitmap capture-frame vp9-bitmap vp8-bitmap h264-bitmap vp8-frame}; do
  case "$v" in
    telemetry) run "$v" --video off ;;
    telemetry-notiming) run "$v" --video off --no-timing ;;
    telemetry-nosample) run "$v" --video off --no-sample ;;
    telemetry-bare) run "$v" --video off --no-timing --no-sample ;;
    capture-bitmap) run "$v" --encode off ;;
    capture-frame) run "$v" --encode off --capture frame ;;
    vp9-bitmap) run "$v" --codec vp9 ;;
    vp8-bitmap) run "$v" --codec vp8 ;;
    h264-bitmap) run "$v" --codec h264 ;;
    vp8-frame) run "$v" --codec vp8 --capture frame ;;
    bench-sample) node scripts/rec/run.mjs --dist dist --save "$save" --owner-browser --no-isolate --no-pack --rec playtest --video off --hold 5 --bench-sample --out "$out/$v" 2>&1 | grep --line-buffered -E 'bench-sample|Error' ;;
    *) echo "unknown variant $v" ;;
  esac
done
