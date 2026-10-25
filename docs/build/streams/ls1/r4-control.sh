#!/bin/bash
# LS-1 1b R4 F5: the focused runner's negative control, then a normal run.
# usage: bash docs/build/streams/ls1/r4-control.sh <outdir>
set -uo pipefail
out="$1"; mkdir -p "$out/negative" "$out/normal"
neg="$out/negative/deliberate-failure.test.mjs"
printf 'import test from "node:test";\ntest("negative control: a deliberately failing test", () => { throw new Error("deliberate"); });\n' > "$neg"
bash docs/build/streams/ls1/r3-focused.sh "$out/negative" "$neg"; n=$?
echo "NEGATIVE CONTROL: runner exit $n (must be nonzero); mutations ran: $([ -f "$out/negative/mutation-results.json" ] && echo yes || echo no)"
bash docs/build/streams/ls1/r3-focused.sh "$out/normal"; p=$?
echo "NORMAL RUN: runner exit $p (must be 0)"
[ "$n" -ne 0 ] && [ ! -f "$out/negative/mutation-results.json" ] && [ "$p" -eq 0 ]
