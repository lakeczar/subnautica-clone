#!/usr/bin/env bash
# CW-1 R4: the 4070 rehearsal before an exclusive 3090 run, as one commit-only queue job:
# build the game in the job, then tour 1 and deep 2 from the plans committed under
# runs/r14/plans. Frame times are indicative; the run checks the harness end to end
# (sampler worker, coverage, re-entry, terrain fallback gate) before the 3090's time.
#   heavy-check submit --class gpu --machine 4070 --stall 300 --artifact cw1-4070 -- sh docs/build/streams/cw1/rehearse-4070.sh
set -u
cd "$(dirname "$0")/../../../.."
npm run build || exit 1
P=docs/build/streams/cw1/runs/r14/plans
CW1_DIST=dist CW1_PLANS=$P/tour CW1_OUT=cw1-4070/tour CW1_REENTER=hub_step_arch,hub_glimmer_crack,reef_archlet sh docs/build/streams/cw1/run-4070.sh 1; a=$?
CW1_DIST=dist CW1_PLANS=$P/deep CW1_OUT=cw1-4070/deep sh docs/build/streams/cw1/run-4070.sh 2; b=$?
echo "rehearsal: tour 1 exit $a, deep 2 exit $b"
[ $a -eq 0 ] && [ $b -eq 0 ]
