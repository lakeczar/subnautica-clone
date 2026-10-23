#!/usr/bin/env bash
# SAVE-1: export the shared save library at this worktree's HEAD and bring it into
# the shared library on factory-worker ($SILTWAKE_SAVES, default /work/tmp/siltwake-saves).
#
#   scripts/saves-export.sh [--here] [--deadline S]
#
# Run it from a clean worktree at the commit to export (the coordinator: root, after
# each merge). The whole playthrough runs on the second worker (siltwake-alickers)
# through scripts/alickers-job.sh, writing /work/tmp/siltwake-saves/<sha> there too;
# the directory is copied back, its files checked against the manifest and every save
# decoded here, then published read-only. Exit 75 or 255 from the second worker
# (paused or unreachable) falls back to factory-worker's heavy-check queue; --here
# skips the second worker. Any other failure is the export's own (a blocked scenario,
# a kind without its facts) and is reported, not retried.
#
# When SCHED-2b's remote lane lands, remote_export becomes one call:
#   $H --machine any --artifact /work/tmp/siltwake-saves/$sha -- <the same command>
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
here=0 deadline=5400
while [[ $# -gt 0 ]]; do
  case "$1" in
    --here) here=1; shift ;;
    --deadline) deadline="$2"; shift 2 ;;
    *) echo "usage: $0 [--here] [--deadline S]" >&2; exit 2 ;;
  esac
done
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || { echo "saves-export: commit first; a library is tagged by commit" >&2; exit 2; }
sha="$(git rev-parse HEAD)"
root="${SILTWAKE_SAVES:-/work/tmp/siltwake-saves}"
H=/home/worker/.t3/projects/subnautica-clone/scripts/heavy-check.sh
[[ -f "$root/$sha/manifest.json" ]] && { echo "saves-export: $root/$sha already exported"; exit 0; }
npx tsc -p scripts/playthrough/tsconfig.json
saves() { node .test-build/scripts/playthrough/saves.js "$@"; }

remote="/work/tmp/siltwake-saves"   # the same default root on both machines
remote_export() {
  scripts/alickers-job.sh --sha "$sha" --deadline "$deadline" -- \
    npm run playthrough -- --jobs 3 --quiet --export --library-root "$remote" --json "/work/results/siltwake-saves-$sha.json"
}
fetch() {
  local tmp; tmp="$(mktemp -d /work/tmp/siltwake-saves-incoming-XXXXXX)"
  /usr/bin/ssh -F "$HOME/.ssh/siltwake.conf" siltwake-alickers -n "tar -C $remote -cf - $sha" | tar -C "$tmp" -xf -
  saves import "$tmp/$sha" --root "$root"
  chmod -R u+w "$tmp"; rm -rf "$tmp"
}

if [[ $here == 0 ]]; then
  rc=0; remote_export || rc=$?
  if [[ $rc == 0 ]]; then fetch; echo "saves-export: $sha exported on siltwake-alickers"; exit 0; fi
  [[ $rc == 75 || $rc == 255 ]] || { echo "saves-export: the export failed on siltwake-alickers (exit $rc); see its output above" >&2; exit "$rc"; }
  echo "saves-export: siltwake-alickers unavailable (exit $rc); exporting on factory-worker through the queue" >&2
fi
# Not --snapshot: the export reads git to tag the library, and the queue already rejects a changed tree.
"$H" --class playthrough -- node .test-build/scripts/playthrough/run.js --quiet --export
saves verify HEAD --root "$root"
