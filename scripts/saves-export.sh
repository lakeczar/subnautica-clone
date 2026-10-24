#!/usr/bin/env bash
# SAVE-1: export the shared save library at this worktree's HEAD and bring it into
# the shared library on factory-worker ($SILTWAKE_SAVES, default /work/tmp/siltwake-saves).
#
#   scripts/saves-export.sh [--here] [--deadline S]
#
# Run it from a clean worktree at the commit to export (the coordinator: root, after
# each merge). It compiles and decodes nothing itself (STEW-2): every build, playthrough
# and decode runs inside a heavy-check job, so it never competes with a 3090 exclusive
# run, and it may be started at any time; it waits in the queue like any job.
#
# 1. The export, one `--machine any` playthrough job: on the second worker
#    (siltwake-alickers) when its slot is free, else here. The job builds the SHA from
#    `git archive` (scripts/saves-build-at.sh), plays every scenario with --export into
#    that machine's library root, and verifies the result there. The queue brings the
#    commit directory back (--artifact).
# 2. Only when it ran on alickers: the import, a small job here, decodes every save with
#    the SHA's own build and publishes it read-only into the shared library.
# If the commit is already in the library, one job here verifies it instead.
# --here pins the export to factory-worker. Failures are the export's own (a blocked
# scenario, a kind without its facts) and are reported, not retried; a sandbox outage
# is the queue's business (an `any` job then runs here).
#
# Internal, run inside those jobs (never by hand):
#   saves-export.sh --job-export SHA | --job-verify SHA | --job-import SHA DIR
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
H="${SILTWAKE_HEAVY_CHECK:-/home/worker/.t3/projects/subnautica-clone/scripts/heavy-check.sh}"
default_root=/work/tmp/siltwake-saves
root="${SILTWAKE_SAVES:-$default_root}"

# The SHA's own build, in a directory of its own (removed on exit), and its CLI: it
# decodes with the SHA's own code.
build_at() {
  build="$(mktemp -d "/work/tmp/siltwake-export-${1:0:12}-XXXXXX")"
  trap 'rm -rf "$build"' EXIT
  scripts/saves-build-at.sh "$1" "$build"
}
saves() { node "$build/.test-build/scripts/playthrough/saves.js" "$@"; }

case "${1:-}" in
  --job-export)
    sha="$2"; build_at "$sha"
    if [[ -f "$root/$sha/manifest.json" ]] && saves verify "$sha" --root "$root"; then
      echo "saves-export: $root/$sha already exported on this machine and verifies"; exit 0
    fi
    # At most three games at once, within the job's grant.
    jobs=$(( ${SILTWAKE_JOB_CPUS:-3} < 3 ? ${SILTWAKE_JOB_CPUS:-3} : 3 ))
    node "$build/.test-build/scripts/playthrough/run.js" --jobs "$jobs" --quiet --export --commit "$sha" --library-root "$root"
    saves verify "$sha" --root "$root"
    exit 0 ;;
  --job-verify)
    sha="$2"; build_at "$sha"
    saves verify "$sha" --root "$root"
    exit 0 ;;
  --job-import)
    sha="$2" incoming="$3"; build_at "$sha"
    # Staged in the root, decoded by the SHA's build, and only then published.
    saves import "$incoming" --root "$root"
    # The fetched copy (read-only, as the queue staged it) is no longer needed.
    chmod -R u+w "$(dirname "$incoming")" && rm -rf "$(dirname "$incoming")"
    exit 0 ;;
esac

here=0 deadline=5400
while [[ $# -gt 0 ]]; do
  case "$1" in
    --here) here=1; shift ;;
    --deadline) deadline="$2"; shift 2 ;;
    *) echo "usage: $0 [--here] [--deadline S]" >&2; exit 2 ;;
  esac
done
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || { echo "saves-export: commit first; a library is tagged by commit" >&2; exit 2; }
# Everything below uses this one SHA, captured once: the jobs build it from an archive
# (scripts/saves-build-at.sh), never from this worktree's .test-build, so a HEAD that
# moves meanwhile cannot change what is exported or how it is labelled.
sha="$(git rev-parse HEAD)"
# The second worker has the default root only; another root is exported here, and
# named to the jobs.
job=(bash scripts/saves-export.sh)
[[ "$root" == "$default_root" ]] || { here=1; job=(env "SILTWAKE_SAVES=$root" "${job[@]}"); }

# Submits a job, waits for it, and leaves its result record in $receipt.
run_job() {
  local ticket
  ticket="$("$H" submit "$@")" || { echo "saves-export: the queue refused the job" >&2; return 2; }
  echo "saves-export: queued as $ticket (output: $H log $ticket)"
  local out rc=0
  out="$("$H" wait "$ticket" --json)" || rc=$?
  printf '%s\n' "$out" | sed '$d'
  receipt="$(printf '%s\n' "$out" | tail -n 1)"
  return "$rc"
}
field() { node -e 'const r = JSON.parse(process.argv[1]); const v = process.argv[2].split(".").reduce((o, k) => o?.[k], r); console.log(v ?? "")' "$receipt" "$1"; }

if [[ -f "$root/$sha/manifest.json" ]]; then
  rc=0; run_job --class quick --machine 3090 --snapshot -- "${job[@]}" --job-verify "$sha" || rc=$?
  [[ $rc == 0 ]] || { echo "saves-export: $root/$sha exists but does not verify (exit $rc); it is immutable, so investigate before removing it" >&2; exit 1; }
  echo "saves-export: $root/$sha already exported and verifies"; exit 0
fi

machine=any; [[ $here == 1 ]] && machine=3090
# --snapshot: the job doesn't depend on this worktree staying unchanged while it waits.
rc=0; run_job --class playthrough --machine "$machine" --snapshot --deadline "$deadline" --artifact "$root/$sha" \
  -- "${job[@]}" --job-export "$sha" || rc=$?
[[ $rc == 0 ]] || { echo "saves-export: the export failed (exit $rc); see its output above" >&2; exit "$rc"; }
if [[ "$(field remote)" != "true" ]]; then
  echo "saves-export: $sha exported and verified on factory-worker, in $root/$sha"; exit 0
fi
incoming="$(field artifacts.0.local)"
[[ -n "$incoming" && -f "$incoming/manifest.json" ]] || { echo "saves-export: the export ran on siltwake-alickers, but its library didn't come back ($(field artifacts.0.error))" >&2; exit 1; }
rc=0; run_job --class quick --machine 3090 --snapshot -- "${job[@]}" --job-import "$sha" "$incoming" || rc=$?
[[ $rc == 0 ]] || { echo "saves-export: importing $incoming failed (exit $rc)" >&2; exit "$rc"; }
echo "saves-export: $sha exported on siltwake-alickers and published in $root/$sha"
