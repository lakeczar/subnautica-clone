#!/usr/bin/env bash
# Runs one job on the best-effort second test worker (siltwake-alickers: WSL2 on
# the owner's PC, 8 CPUs, 16 GB, RTX 4070 Laptop GPU), pinned to an exact commit.
#
#   scripts/alickers-job.sh [--sha SHA] [--deadline S] [--memory NG] -- COMMAND ...
#
# The commit (default: this worktree's HEAD) must be committed. A commit already
# on origin is fetched by the sandbox; otherwise it is sent as a git bundle.
# Inside the sandbox's own job lock (`siltwake-job`), the shared checkout is
# moved to that commit, `npm ci` runs if package-lock.json changed, compiled
# test output from a different commit is removed, and then
# COMMAND runs. The first and last lines name the tested SHA.
#
# Exit 75 or 255 means the worker is paused, stopped or unreachable: rerun the
# job on factory-worker with scripts/heavy-check.sh. Never restart Windows or
# change host settings to make it available.
set -euo pipefail
sha="" deadline=1800 memory=8G
while [[ $# -gt 0 ]]; do
  case "$1" in
    --sha) sha="$2"; shift 2 ;;
    --deadline) deadline="$2"; shift 2 ;;
    --memory) memory="$2"; shift 2 ;;
    --) shift; break ;;
    *) break ;;
  esac
done
[[ $# -gt 0 ]] || { echo "usage: $0 [--sha SHA] [--deadline S] [--memory NG] -- COMMAND ..." >&2; exit 2; }
[[ -n "$(git status --porcelain --untracked-files=no)" && -z "$sha" ]] && echo "alickers-job: uncommitted changes are not sent; testing HEAD only" >&2
sha="$(git rev-parse --verify "${sha:-HEAD}^{commit}")"
ssh_() { /usr/bin/ssh -F "$HOME/.ssh/siltwake.conf" siltwake-alickers "$@"; }
repo=/work/repos/subnautica-clone

rc=0
# Refresh origin first, so a thin bundle's prerequisites (pushed root commits) are present.
ssh_ -n "cd $repo && git fetch -q origin 2>/dev/null; { git cat-file -e $sha^{commit} 2>/dev/null || git fetch -q origin $sha 2>/dev/null; git cat-file -e $sha^{commit} 2>/dev/null; }" || rc=$?
[[ $rc == 255 ]] && { echo "alickers-job: worker unreachable (ssh 255); rerun on factory-worker" >&2; exit 255; }
if [[ $rc != 0 ]]; then
  # A bundle needs a ref: use a throwaway one under refs/alickers/.
  bundle="$(mktemp /work/tmp/alickers-XXXXXX.bundle)" ref="refs/alickers/$sha"
  git update-ref "$ref" "$sha"
  git bundle create -q "$bundle" "$ref" --not origin/feat/siltwake-first-expedition 2>/dev/null || git bundle create -q "$bundle" "$ref"
  git update-ref -d "$ref"
  ssh_ "cat > /work/tmp/incoming.bundle" < "$bundle"
  if ! ssh_ -n "cd $repo && git fetch -q /work/tmp/incoming.bundle $ref 2>/dev/null"; then
    # The sandbox lacks a prerequisite (for example, root not pushed yet): send the full history.
    git update-ref "$ref" "$sha"; git bundle create -q "$bundle" "$ref"; git update-ref -d "$ref"
    ssh_ "cat > /work/tmp/incoming.bundle" < "$bundle"
    ssh_ -n "cd $repo && git fetch -q /work/tmp/incoming.bundle $ref"
  fi
  rm -f "$bundle"
  ssh_ -n "cd $repo && rm -f /work/tmp/incoming.bundle && git cat-file -e $sha^{commit}"
fi

quoted="$(printf '%q ' "$@")"
ssh_ -n "cd $repo && siltwake-job --deadline $deadline --memory $memory bash -c '
  set -e
  old=\$(git rev-parse HEAD 2>/dev/null || true)
  git checkout -q --detach $sha
  if [ -n \"\$old\" ] && ! git diff --quiet \"\$old\" $sha -- package-lock.json; then npm ci --no-audit --no-fund >/dev/null; fi
  # The checkout is shared between commits: drop compiled output from another commit, so an
  # incremental build can never run stale files (COL-1 saw a stale caves.js).
  if [ \"\$old\" != $sha ]; then rm -rf .test-build .test-build-*; fi
  echo \"alickers-job: testing $sha on \$(hostname)\"
  set +e; $quoted; rc=\$?
  echo \"alickers-job: tested $sha exit \$rc\"; exit \$rc
'"
