#!/usr/bin/env bash
# REC-1 R3b: the recorder's budget acceptance as a duet (DIRECTION convention 9), in two jobs so the exclusive
# window never compiles:
#   bash scripts/rec/duet.sh build DIST_DIR          build this commit into DIST_DIR (an ordinary seat)
#   bash scripts/rec/duet.sh run DIST_DIR OUT_DIR    the duet from that build (the exclusive seat), then its verdict
# The declaration (docs/build/streams/rec1/r3b/duet-declaration.json, committed before the run) fixes the pairs,
# the window, the budget and the exclusion; the hold is derived from it, so the run cannot judge more or fewer.
set -u
cd "$(dirname "$0")/../.."
decl=docs/build/streams/rec1/r3b/duet-declaration.json
case "${1:-}" in
  build)
    dir="${2:?usage: duet.sh build DIST_DIR}"
    npm run build > /tmp/duet-build.$$.log 2>&1 || { tail -5 /tmp/duet-build.$$.log; exit 1; }
    git rev-parse HEAD > dist/COMMIT
    rm -rf "$dir" && mkdir -p "$(dirname "$dir")" && cp -r dist "$dir" && echo "built $(cat "$dir/COMMIT") into $dir" ;;
  run)
    dist="${2:?usage: duet.sh run DIST_DIR OUT_DIR}"; out="${3:?usage: duet.sh run DIST_DIR OUT_DIR}"
    read -r pairs win save < <(node -e 'const d=require(require("path").resolve(process.argv[1]));console.log(d.pairs,d.windowS,d.save)' "$decl")
    hold=$((pairs * 2 * win))
    echo "duet: $pairs pairs of ${win} s windows ($hold s), save $save, declaration $(git log -1 --format=%h -- "$decl")"
    DIST="$(cd "$dist" && pwd)" VARIANTS=playtest ALT="$win" bash scripts/rec/decomp.sh "$out" "$hold" "$save" || exit 1
    node scripts/rec/duet.mjs "$out/playtest/run.json" "$decl" ;;
  *) echo "usage: duet.sh build DIST_DIR | run DIST_DIR OUT_DIR"; exit 2 ;;
esac
