#!/usr/bin/env bash
# SIG-1 browser check on the second worker's RTX 4070 Laptop, at this checkout's HEAD:
#   scripts/heavy-check.sh --class gpu --machine 4070 --artifact sig1-4070 -- docs/build/streams/sig1/run-4070.sh
# Builds the test modules and dist, derives the diagnostic saves from the shared library's earned
# carrier-route save there, installs playwright-core once outside the checkout (UX-1's pattern), and
# plays them with /usr/local/bin/siltwake-chrome on ANGLE's GL backend. Output: ./sig1-4070.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
here=docs/build/streams/sig1 out=sig1-4070 pw=/work/tmp/sig1-pw
head=$(git rev-parse --short HEAD)
node scripts/test-build.mjs > /dev/null
npm run build > /dev/null
echo "$head" > dist/COMMIT
npx tsc -p scripts/playthrough/tsconfig.json > /dev/null
save=$(node .test-build/scripts/playthrough/saves.js pick carrier@carrier-deep)
rm -rf "$out" && mkdir -p "$out/saves"
node "$here/derive.mjs" "$PWD" "$save" "$out/saves"
[[ -d "$pw/node_modules/playwright-core" ]] || npm install --prefix "$pw" --no-save --no-audit --no-fund playwright-core@1.64.1 > /dev/null
echo "sig1 run-4070 at $head"
SIG1_PW="$pw" SIG1_ANGLE=gl SIG1_EXPECT="4070|D3D12" node "$here/play.mjs" "$PWD" dist "$out" 5281 "$out/saves" /usr/local/bin/siltwake-chrome
