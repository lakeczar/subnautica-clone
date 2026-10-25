#!/usr/bin/env bash
# UX-1 GPU bridge/helm session with the portable driver (drive.mjs), at this checkout's HEAD.
#   factory-worker (RTX 3090):   docs/build/streams/ux1/run-gpu.sh factory  /work/tmp/ux1/gpu-final
#   second worker (RTX 4070):    scripts/alickers-job.sh --deadline 1800 -- docs/build/streams/ux1/run-gpu.sh alickers /work/results/ux1-4070
# Builds dist if it is missing or from another commit. On the second worker it installs playwright-core
# 1.64.1 once into /work/tmp/ux1-pw (outside the checkout) and uses /usr/local/bin/siltwake-chrome.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
here=docs/build/streams/ux1
machine=$1 out=$2 port=${3:-5580}
head=$(git rev-parse --short HEAD)
if [[ ! -f dist/index.html || "$(cat dist/COMMIT 2>/dev/null)" != "$head" ]]; then
  npm run build > /dev/null
  echo "$head" > dist/COMMIT
fi
case "$machine" in
  factory)
    pw=/work/tmp/gpu-prep/pw chrome="$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome" angle=gl-egl expect="RTX 3090" ;;
  alickers)
    pw=/work/tmp/ux1-pw chrome=/usr/local/bin/siltwake-chrome angle=gl expect="4070|D3D12"
    [[ -d "$pw/node_modules/playwright-core" ]] || npm install --prefix "$pw" --no-save --no-audit --no-fund playwright-core@1.64.1 > /dev/null ;;
  *) echo "usage: $0 factory|alickers OUT [PORT]" >&2; exit 2 ;;
esac
echo "ux1 run-gpu: $machine at $head"
node "$here/drive.mjs" --dist dist --saves "$here/saves" --out "$out" --port "$port" --pw "$pw" --chrome "$chrome" --angle "$angle" --expect "$expect"
