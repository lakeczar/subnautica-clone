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
# Both paths run the export from scripts/saves-build-at.sh's archive build of the SHA.
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
# Everything below uses this one SHA, captured once: the export runs from an archive
# build of it (scripts/saves-build-at.sh), never from this worktree's .test-build, so
# a HEAD that moves meanwhile cannot change what is exported or how it is labelled.
sha="$(git rev-parse HEAD)"
root="${SILTWAKE_SAVES:-/work/tmp/siltwake-saves}"
H=/home/worker/.t3/projects/subnautica-clone/scripts/heavy-check.sh
build="$(mktemp -d "/work/tmp/siltwake-export-${sha:0:12}-XXXXXX")"
trap 'rm -rf "$build"' EXIT
scripts/saves-build-at.sh "$sha" "$build"
# The SHA's own CLI: it decodes with the SHA's own code.
saves() { node "$build/.test-build/scripts/playthrough/saves.js" "$@"; }
if [[ -f "$root/$sha/manifest.json" ]]; then
  saves verify "$sha" --root "$root" || { echo "saves-export: $root/$sha exists but does not verify; it is immutable, so investigate before removing it" >&2; exit 1; }
  echo "saves-export: $root/$sha already exported and verifies"; exit 0
fi

remote="/work/tmp/siltwake-saves"   # the same default root on both machines
remote_export() {
  local rb="/work/tmp/siltwake-export-$sha"
  scripts/alickers-job.sh --sha "$sha" --deadline "$deadline" -- bash -c \
    "rm -rf $rb && scripts/saves-build-at.sh $sha $rb && node $rb/.test-build/scripts/playthrough/run.js --jobs 3 --quiet --export --commit $sha --library-root $remote --json /work/results/siltwake-saves-$sha.json; rc=\$?; rm -rf $rb; exit \$rc"
}
fetch() {
  local tmp; tmp="$(mktemp -d /work/tmp/siltwake-saves-incoming-XXXXXX)"
  /usr/bin/ssh -F "$HOME/.ssh/siltwake.conf" siltwake-alickers -n "tar -C $remote -cf - $sha" | tar -C "$tmp" -xf -
  # Staged in the root, decoded by the SHA's build, and only then published.
  local rc=0; saves import "$tmp/$sha" --root "$root" || rc=$?
  chmod -R u+w "$tmp"; rm -rf "$tmp"
  return $rc
}

if [[ $here == 0 ]]; then
  rc=0; remote_export || rc=$?
  if [[ $rc == 0 ]]; then fetch; echo "saves-export: $sha exported on siltwake-alickers"; exit 0; fi
  [[ $rc == 75 || $rc == 255 ]] || { echo "saves-export: the export failed on siltwake-alickers (exit $rc); see its output above" >&2; exit "$rc"; }
  echo "saves-export: siltwake-alickers unavailable (exit $rc); exporting on factory-worker through the queue" >&2
fi
# --snapshot: the job doesn't depend on this worktree staying unchanged; it runs the archive build.
"$H" --class playthrough --snapshot -- node "$build/.test-build/scripts/playthrough/run.js" --quiet --export --commit "$sha"
saves verify "$sha" --root "$root"
