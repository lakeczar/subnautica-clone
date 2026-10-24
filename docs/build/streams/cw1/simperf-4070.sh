#!/usr/bin/env bash
# SIM-PERF-1's 4070 control and decisive host test (probe only, not for merge): this probe
# (SIM-PERF-1's fixes + CW-1) built in the job, then segments of CW-1's saves-t6 plan with
# the host worker (canary, steal, the renderer thread's state and syscall). Frame times are
# indicative ("RTX 4070 Laptop"), never the 3090's evidence.
#   usage: simperf-4070.sh <segment>...
set -u
cd "$(dirname "$0")/../../../.."
[ -d /work/tmp/pw/node_modules/playwright-core ] || npm i --prefix /work/tmp/pw --no-save --no-audit --no-fund playwright-core@1.64.1 >/dev/null
npm run build > build.log 2>&1 || { tail -30 build.log; exit 1; }
git rev-parse HEAD > dist/COMMIT
out=simperf-4070; mkdir -p "$out"; rc=0
for k in "$@"; do
  SIMPERF_HOST=1 SILTWAKE_GPU_LEASE=alickers-job CW1_CHROME=/usr/local/bin/siltwake-chrome CW1_PW=/work/tmp/pw/ CW1_GPU="RTX 4070" \
    CW1_LABEL="RTX 4070 Laptop (alickers, shared desktop host; indicative)" \
    node docs/build/streams/cw1/traverse.mjs dist docs/build/streams/cw1/simperf/plan.json docs/build/streams/cw1/simperf/seg$k.json "$k" "$out" 5571 || rc=$?
done
exit $rc
