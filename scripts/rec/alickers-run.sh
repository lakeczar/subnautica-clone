#!/usr/bin/env bash
# REC-1 on the second worker (RTX 4070 Laptop, alickers), through
# scripts/alickers-job.sh, wholly inside Linux: the sandbox's own Chrome
# wrapper (private Xvfb, ANGLE on the 4070), playwright-core and Playwright's
# ffmpeg in /work/tmp/pw (installed once, outside the checkout).
#   scripts/alickers-job.sh --deadline 1800 -- bash scripts/rec/alickers-run.sh run.mjs|overhead.mjs ARGS...
# DIST and saves are copied to /work/tmp/rec1 on the sandbox beforehand.
# Frame times from here are labelled "RTX 4070 Laptop (indicative)".
set -euo pipefail
cd "$(dirname "$0")/../.."
tool="$1"; shift
[ -d /work/tmp/pw/node_modules/playwright-core ] || npm i --prefix /work/tmp/pw --no-save --no-audit --no-fund playwright-core@1.64.1 >/dev/null
ls -d "$HOME"/.cache/ms-playwright/ffmpeg-* >/dev/null 2>&1 || node /work/tmp/pw/node_modules/playwright-core/cli.js install ffmpeg >/dev/null
# The sandbox's job lock is its one-GPU lease. The soak's browser session finds
# the sandbox's Chrome wrapper and /work/tmp/pw itself.
SILTWAKE_GPU_LEASE=alickers-job exec node "scripts/rec/$tool" --gpu "RTX 4070" \
  --machine "RTX 4070 Laptop (alickers, shared desktop host; indicative)" "$@"
