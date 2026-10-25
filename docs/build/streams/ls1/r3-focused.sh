#!/bin/bash
# LS-1 1b: the focused tests, then the F4 sensitivity mutations (compiled output only).
# The test run's own exit status decides; its output is filtered only afterwards.
# usage: bash docs/build/streams/ls1/r3-focused.sh <outdir> [extra compiled test file...]
set -euo pipefail
out="$1"; shift
mkdir -p "$out"
node scripts/test-build.mjs
status=0
node --test .test-build/tests/ls1-rewards.test.js .test-build/tests/save-bridge.test.js .test-build/tests/playthrough-pacing.test.js .test-build/tests/systems-cultivation.test.js "$@" > "$out/focused.log" 2>&1 || status=$?
grep -E "^✖|^ℹ (tests|pass|fail)|AssertionError|actual|expected|at TestContext" "$out/focused.log" | head -40 || true
if [ "$status" -ne 0 ]; then echo "focused tests FAILED (exit $status); full log: $out/focused.log"; exit "$status"; fi
node docs/build/streams/ls1/r3-mutations.mjs "$out"
