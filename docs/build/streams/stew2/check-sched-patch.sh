#!/usr/bin/env bash
# STEW-2: checks the proposed SCHED patch (stew2-sched-local-runs.patch) without
# touching scripts/heavy: applies it to a `git archive` of HEAD in a temporary
# directory and runs SCHED's policy unit tests there (Node strips the types).
# Run it through the queue: heavy-check --class quick --machine any -- bash docs/build/streams/stew2/check-sched-patch.sh
set -euo pipefail
repo="$(git rev-parse --show-toplevel)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
git -C "$repo" archive HEAD | tar -x -C "$tmp"
ln -s "$repo/node_modules" "$tmp/node_modules"
cd "$tmp"
git apply --verbose docs/build/streams/stew2/stew2-sched-local-runs.patch
node --test tests/heavy-sched-policy.test.ts
