#!/usr/bin/env bash
# SIG-1 check on either machine: the fast tier, then the field-kit NullEngine test (compiled here).
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
npm test > fast.log 2>&1; echo "FAST exit $?"
grep -E "error TS|guard-architecture: FAIL" fast.log | sort -u | head -30
grep -B2 -A22 "^✖ " fast.log | grep -v "^ *at \|node:internal" | head -200
grep -E "ℹ (tests|pass|fail)" fast.log
node scripts/test-tier.mjs heavy "$(node -e 'const c=require("./tsconfig.test.json");process.stdout.write(c.compilerOptions?.outDir??".test-build")')/tests/field-kit.heavy.test.js" 2>&1 | grep -E "^✔|^✖|ℹ (pass|fail)|Assert|Error" | head -20
