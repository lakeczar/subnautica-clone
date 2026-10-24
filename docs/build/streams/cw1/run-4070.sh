#!/usr/bin/env bash
# CW-1's RTX 4070 check (owner rule: one short cave traversal on the second
# worker at handoff; and, from R4, the rehearsal before an exclusive 3090 run).
# Runs inside the sandbox: the sandbox's own Linux-only Chrome wrapper,
# playwright-core in /work/tmp/pw. Frame times are indicative ("RTX 4070
# Laptop"), never the 3090's evidence.
#   usage: run-4070.sh <hop>...            (hops: /work/tmp/cw1/saves-h, dist /work/tmp/cw1/dist-final)
#          CW1_SAVES=saves-8x run-4070.sh <segment>...   (another plan's saves)
#   R4, as a queued commit-only job (no local paths on the command line):
#          CW1_DIST=dist CW1_PLANS=<repo-relative plan dir> CW1_OUT=<repo-relative out> run-4070.sh <segment>...
#          e.g. heavy-check submit --class gpu --machine 4070 --stall 300 --artifact cw1-4070 -- \
#            sh -c 'npm run build && CW1_DIST=dist CW1_PLANS=docs/build/streams/cw1/runs/r14/plans/tour CW1_OUT=cw1-4070/tour sh docs/build/streams/cw1/run-4070.sh 1'
set -u
cd "$(dirname "$0")/../../../.."
[ -d /work/tmp/pw/node_modules/playwright-core ] || npm i --prefix /work/tmp/pw --no-save --no-audit --no-fund playwright-core@1.64.1 >/dev/null
plans=${CW1_PLANS:-/work/tmp/cw1/${CW1_SAVES:-saves-h}}; dist=${CW1_DIST:-/work/tmp/cw1/dist-final}
out=${CW1_OUT:-/work/results/cw1-4070${CW1_SAVES:+-$CW1_SAVES}}; mkdir -p "$out"; rc=0
[ -f "$dist/COMMIT" ] || git rev-parse --short HEAD > "$dist/COMMIT"
for k in "$@"; do
  # The sandbox's job lock is its one-GPU lease.
  SILTWAKE_GPU_LEASE=alickers-job CW1_CHROME=/usr/local/bin/siltwake-chrome CW1_PW=/work/tmp/pw/ CW1_GPU="RTX 4070" \
    CW1_LABEL="RTX 4070 Laptop (alickers, shared desktop host; indicative)" \
    node docs/build/streams/cw1/traverse.mjs "$dist" "$plans/plan.json" "$plans/seg$k.json" "$k" "$out" 5531 || rc=$?
done
exit $rc
