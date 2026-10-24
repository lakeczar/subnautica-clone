#!/usr/bin/env bash
# SAVE-1: build the playthrough and save library code of one exact commit, in a
# directory of its own, from `git archive` (so no worktree edit, checkout or stale
# compile can leak in). The directory carries `.siltwake-source-commit`; exports
# refuse to run, and imports refuse to decode, from code without it.
#
#   scripts/saves-build-at.sh SHA DIR
#
# node_modules is linked from this checkout when SHA's package-lock.json is the
# same as this checkout's; otherwise `npm ci` installs SHA's own.
set -euo pipefail
[[ $# == 2 ]] || { echo "usage: $0 SHA DIR" >&2; exit 2; }
# A compile: not on factory-worker outside the queue while a 3090 exclusive is running or queued (STEW-2).
node "$(dirname "$0")/local-guard.mjs" --lease-parent "scripts/saves-build-at.sh $1" || exit $?
repo="$(git rev-parse --show-toplevel)"
sha="$(git -C "$repo" rev-parse --verify "$1^{commit}")"
dir="$2"
[[ ! -e "$dir" || -z "$(ls -A "$dir")" ]] || { echo "saves-build-at: $dir is not empty" >&2; exit 2; }
mkdir -p "$dir"
git -C "$repo" archive "$sha" | tar -x -C "$dir"
if [[ -d "$repo/node_modules" ]] && git -C "$repo" show "$sha:package-lock.json" | cmp -s - "$repo/package-lock.json"; then
  ln -s "$repo/node_modules" "$dir/node_modules"
else
  (cd "$dir" && npm ci --no-audit --no-fund >/dev/null)
fi
(cd "$dir" && node_modules/.bin/tsc -p scripts/playthrough/tsconfig.json)
# Written last: a directory whose build failed carries no marker.
echo "$sha" > "$dir/.siltwake-source-commit"
echo "saves-build-at: $sha built in $dir"
