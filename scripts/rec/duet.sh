#!/usr/bin/env bash
# REC-1 R3b: the recorder's budget acceptance as a duet (DIRECTION convention 9), as jobs that keep the exclusive
# window free of compiling and inside its class's ceiling:
#   bash scripts/rec/duet.sh preflight                  check the declaration fits the class ceiling (run also does)
#   bash scripts/rec/duet.sh build DIST_DIR             build this commit into DIST_DIR (an ordinary seat)
#   bash scripts/rec/duet.sh run DIST_DIR OUT_DIR       one ticket: pairsPerTicket pairs from that build (the exclusive seat)
#   bash scripts/rec/duet.sh verdict OUT_DIR...         the pooled verdict over every ticket's OUT_DIR (no browser)
# The declaration (docs/build/streams/rec1/r3b/duet-declaration.json, committed before the runs) fixes the pairs,
# tickets, window, budget, exclusion and the class ceiling; the hold is derived from it, so a ticket cannot judge
# more or fewer.
set -u
cd "$(dirname "$0")/../.."
decl=docs/build/streams/rec1/r3b/duet-declaration.json
# A build's identity: a hash over every file's path and content, so tickets can prove they ran the same build.
buildhash() { (cd "$1" && find . -type f ! -name BUILDHASH -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum | cut -c1-16); }
# The ceiling check: a ticket's estimated time, startup and margin included, against its class's ceiling.
preflight() {
  node -e '
    const d = require(require("path").resolve(process.argv[1])), c = d.ceiling ?? {};
    const per = d.pairsPerTicket ?? d.pairs, hold = per * 2 * d.windowS;
    if (!c.ceilingS || c.startupS == null || !(c.marginPct >= 10)) { console.log("preflight: the declaration names no ceiling, startup and margin of at least 10%"); process.exit(2); }
    if ((d.tickets ?? 1) * per !== d.pairs) { console.log(`preflight: ${d.tickets} tickets of ${per} pairs are not the declared ${d.pairs}`); process.exit(2); }
    const need = (hold + c.startupS) * (1 + c.marginPct / 100);
    console.log(`preflight: a ticket needs ${need.toFixed(0)} s ((${hold} s hold + ${c.startupS} s startup) + ${c.marginPct}%) of the ${c.class} ceiling ${c.ceilingS} s`);
    if (need > c.ceilingS) { console.log("preflight: REFUSED: over the ceiling; split into more tickets"); process.exit(2); }' "$decl"
}
case "${1:-}" in
  preflight) preflight ;;
  build)
    dir="${2:?usage: duet.sh build DIST_DIR}"
    npm run build > /tmp/duet-build.$$.log 2>&1 || { tail -5 /tmp/duet-build.$$.log; exit 1; }
    git rev-parse HEAD > dist/COMMIT
    rm -rf "$dir" && mkdir -p "$(dirname "$dir")" && cp -r dist "$dir" && buildhash "$dir" > "$dir/BUILDHASH" \
      && echo "built $(cat "$dir/COMMIT") into $dir, build $(cat "$dir/BUILDHASH")" ;;
  run)
    dist="${2:?usage: duet.sh run DIST_DIR OUT_DIR}"; out="${3:?usage: duet.sh run DIST_DIR OUT_DIR}"
    preflight || exit 2
    [ "$(buildhash "$dist")" = "$(cat "$dist/BUILDHASH" 2>/dev/null)" ] || { echo "the build in $dist does not match its BUILDHASH"; exit 2; }
    read -r per win save < <(node -e 'const d=require(require("path").resolve(process.argv[1]));console.log(d.pairsPerTicket ?? d.pairs,d.windowS,d.save)' "$decl")
    hold=$((per * 2 * win))
    echo "duet ticket: $per pairs of ${win} s windows ($hold s), save $save, declaration $(git log -1 --format=%h -- "$decl"), build $(cat "$dist/BUILDHASH")"
    DIST="$(cd "$dist" && pwd)" VARIANTS=playtest ALT="$win" bash scripts/rec/decomp.sh "$out" "$hold" "$save" || exit 1
    printf '{"commit":"%s","build":"%s","machine":"%s"}\n' "$(cat "$dist/COMMIT")" "$(cat "$dist/BUILDHASH")" "$(hostname)" > "$out/build.json"
    node scripts/rec/duet.mjs "$decl" --ticket "$out" ;;
  verdict)
    shift; [ $# -ge 1 ] || { echo "usage: duet.sh verdict OUT_DIR..."; exit 2; }
    node scripts/rec/duet.mjs "$decl" "$@" ;;
  *) echo "usage: duet.sh preflight | build DIST_DIR | run DIST_DIR OUT_DIR | verdict OUT_DIR..."; exit 2 ;;
esac
