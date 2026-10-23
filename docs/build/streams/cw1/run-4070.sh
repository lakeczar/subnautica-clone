#!/usr/bin/env bash
# CW-1's RTX 4070 check (owner rule: one short cave traversal on the second
# worker at handoff). Runs inside the sandbox through scripts/alickers-job.sh:
# the same dist and hop saves as the 3090 runs (copied to /work/tmp/cw1), the
# sandbox's own Linux-only Chrome wrapper, playwright-core in /work/tmp/pw.
# Frame times are indicative ("RTX 4070 Laptop"), never the 3090's evidence.
#   usage: run-4070.sh <hop>...            (hops: /work/tmp/cw1/saves-h)
#          CW1_SAVES=saves-8x run-4070.sh <segment>...   (another plan's saves)
set -u
cd "$(dirname "$0")/../../../.."
[ -d /work/tmp/pw/node_modules/playwright-core ] || npm i --prefix /work/tmp/pw --no-save --no-audit --no-fund playwright-core@1.64.1 >/dev/null
out=/work/results/cw1-4070${CW1_SAVES:+-$CW1_SAVES}; mkdir -p "$out"; rc=0
for k in "$@"; do
  # The sandbox's job lock is its one-GPU lease.
  SILTWAKE_GPU_LEASE=alickers-job CW1_CHROME=/usr/local/bin/siltwake-chrome CW1_PW=/work/tmp/pw/ CW1_GPU="RTX 4070" \
    CW1_LABEL="RTX 4070 Laptop (alickers, shared desktop host; indicative)" \
    node docs/build/streams/cw1/traverse.mjs /work/tmp/cw1/dist-final /work/tmp/cw1/${CW1_SAVES:-saves-h}/plan.json /work/tmp/cw1/${CW1_SAVES:-saves-h}/seg$k.json "$k" "$out" 5531 || rc=$?
done
exit $rc
