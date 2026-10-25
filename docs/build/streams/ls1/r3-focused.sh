#!/bin/sh
# LS-1 1b R3: the focused tests, then the F4 sensitivity mutations (compiled output only).
# usage: sh docs/build/streams/ls1/r3-focused.sh <outdir>
set -e
mkdir -p "$1"
node scripts/test-build.mjs
node --test .test-build/tests/ls1-rewards.test.js .test-build/tests/save-bridge.test.js .test-build/tests/playthrough-pacing.test.js .test-build/tests/systems-cultivation.test.js 2>&1 | grep -E "^✖|^ℹ (tests|pass|fail)|AssertionError|actual|expected|at TestContext" | head -40
node docs/build/streams/ls1/r3-mutations.mjs "$1"
