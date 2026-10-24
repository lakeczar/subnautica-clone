#!/usr/bin/env bash
# SIM-1 differential: plays every scenario through this tree's in-place step
# and, side by side, through BASE's own compiled simulation, comparing states
# and events (scripts/playthrough/differential.ts).
#
#   scripts/sim-differential.sh BASE_SHA [differential.js options ...]
#
# BASE is exported with git archive into /work/tmp/sim1-base-<sha> and compiled
# there (its node_modules is this tree's). Heavy: run it through the queue
# (`--class playthrough`) or on the second worker.
set -euo pipefail
node "$(dirname "$0")/local-guard.mjs" --lease-parent "scripts/sim-differential.sh $*" || exit $?
sha="$(git rev-parse --verify "${1:?usage: $0 BASE_SHA [options]}^{commit}")"; shift
dir="/work/tmp/sim1-base-${sha:0:12}"
# .compiled-2: the build also covers src/sim (the timeline recorder).
if [[ ! -f "$dir/.compiled-2" ]]; then
  rm -rf "$dir" && mkdir -p "$dir"
  git archive "$sha" | tar -x -C "$dir"
  ln -s "$PWD/node_modules" "$dir/node_modules"
  # The playthrough's graph, plus all of src/sim (the timeline recorder).
  (cd "$dir" && node_modules/.bin/tsc -p scripts/playthrough/tsconfig.json && node_modules/.bin/tsc -p tsconfig.test.json)
  touch "$dir/.compiled-2"
fi
node_modules/.bin/tsc -p scripts/playthrough/tsconfig.json
exec node .test-build/scripts/playthrough/differential.js --base "$dir/.test-build" "$@"
