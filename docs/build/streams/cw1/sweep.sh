#!/usr/bin/env bash
# CW-1 R5: the composed functional sweep (function, not timing). Builds the candidate in the job,
# then drives each segment from the plans committed under runs/r15/plans by ordinary input, and
# prints each one's functional record: stops reached and skipped, holds, unsliced builds,
# terrain/shell fallbacks, frames in a cave with its light unbound, power and return, errors.
# Frame times are recorded but never judged here (non-exclusive). Every segment runs whatever
# the one before did; the job fails only if the build does or a segment didn't finish.
#   usage: sweep.sh <out> <kind>:<segment> ...      kind: tour | hops | surf
#   on the 4070: CW1_4070=1 (the sandbox's Chrome wrapper, through run-4070.sh)
set -u
cd "$(dirname "$0")/../../../.."
out=$1; shift
npm run build || exit 1
git rev-parse --short HEAD > dist/COMMIT
P=docs/build/streams/cw1/runs/r15/plans
for spec in "$@"; do
  kind=${spec%%:*}; k=${spec#*:}; mkdir -p "$out/$kind"
  if [ -n "${CW1_4070:-}" ]; then CW1_DIST=dist CW1_PLANS=$P/$kind CW1_OUT=$out/$kind sh docs/build/streams/cw1/run-4070.sh "$k"
  else node docs/build/streams/cw1/traverse.mjs dist "$P/$kind/plan.json" "$P/$kind/seg$k.json" "$k" "$out/$kind" 5531; fi
  echo "sweep: $kind $k exit $?"
done
node -e '
const fs = require("fs"), path = require("path"), out = process.argv[1]; let unfinished = 0;
for (const kind of fs.readdirSync(out)) for (const f of fs.readdirSync(path.join(out, kind)).filter(f => /^segment-\d+\.json$/.test(f))) {
  const d = JSON.parse(fs.readFileSync(path.join(out, kind, f), "utf8")), g = d.gate ?? {};
  const fn = { reached: `${d.reached.length}/${d.caves.length}`, skipped: d.skipped, holds: d.holdFrames, unslicedTravel: g.travelSync, unslicedLoad: g.loadSync,
    terrainFallbacks: g.terrainFallbacks, lightPendingTravel: g.travelLightPending, recoveries: d.recoveries, stalls: d.stalls?.length ?? 0, power: d.powerEnd ?? null,
    errors: d.errors.length, timingNotJudged: (g.failures ?? []).filter(x => /streaming frame/.test(x)), otherFailures: (g.failures ?? []).filter(x => !/streaming frame/.test(x)) };
  if ((g.failures ?? []).includes("the run did not finish")) unfinished++;
  console.log(`sweep ${kind} ${f}: ${JSON.stringify(fn)}`);
}
process.exit(unfinished ? 1 : 0);' "$out"
