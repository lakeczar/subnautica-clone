#!/usr/bin/env bash
# Runs one job on the best-effort second test worker (siltwake-alickers: WSL2 on
# the owner's PC, 8 CPUs, 16 GB, RTX 4070 Laptop GPU), pinned to an exact commit.
#
#   scripts/alickers-job.sh [--sha SHA] [--deadline S] [--memory NG] [--receipt FILE] -- COMMAND ...
#
# The commit (default: this worktree's HEAD) must be committed. A commit already
# on origin is fetched by the sandbox; otherwise it is sent as a git bundle.
# Inside the sandbox's own job lock (`siltwake-job`), the shared checkout is
# moved to that commit, `npm ci` runs if package-lock.json changed, compiled
# test output from a different commit is removed, and then
# COMMAND runs. The first and last lines name the tested SHA.
#
# --receipt FILE (a path on the sandbox; heavy-check's remote lane, SCHED-2b)
# is the control channel: this script, not the job, appends one line per phase,
# from inside the sandbox's job lock:
#   admitted <epoch>             the sandbox's lock was taken and the job may run
#   sha <sha>                    the checkout's HEAD after moving it
#   setup failed <step> <code>   checkout, npm ci or the clean failed (exit 70)
#   setup ok
#   started                      COMMAND is about to run
#   exit <code>                  COMMAND's exit code
# A missing "admitted" means the job never reached the sandbox: paused, the
# lock wait expired, or unreachable. Output lines never carry control meaning.
#
# Exit 75 or 255 means the worker is paused, stopped or unreachable: rerun the
# job on factory-worker with scripts/heavy-check.sh. Never restart Windows or
# change host settings to make it available.
#
# Test seams (private fixtures only): ALICKERS_SSH (the ssh command),
# ALICKERS_REPO (the sandbox checkout), ALICKERS_TMP (the sandbox's scratch dir).
set -euo pipefail
sha="" deadline=1800 memory=8G receipt=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --sha) sha="$2"; shift 2 ;;
    --deadline) deadline="$2"; shift 2 ;;
    --memory) memory="$2"; shift 2 ;;
    --receipt) receipt="$2"; shift 2 ;;
    --) shift; break ;;
    *) break ;;
  esac
done
[[ $# -gt 0 ]] || { echo "usage: $0 [--sha SHA] [--deadline S] [--memory NG] [--receipt FILE] -- COMMAND ..." >&2; exit 2; }
[[ -z "$receipt" || "$receipt" =~ ^/[A-Za-z0-9_./-]+$ ]] || { echo "alickers-job: --receipt must be a plain absolute path" >&2; exit 2; }
[[ -n "$(git status --porcelain --untracked-files=no)" && -z "$sha" ]] && echo "alickers-job: uncommitted changes are not sent; testing HEAD only" >&2
sha="$(git rev-parse --verify "${sha:-HEAD}^{commit}")"
ssh_() { ${ALICKERS_SSH:-/usr/bin/ssh -F "$HOME/.ssh/siltwake.conf" siltwake-alickers} "$@"; }
repo="${ALICKERS_REPO:-/work/repos/subnautica-clone}"
tmp="${ALICKERS_TMP:-/work/tmp}"

rc=0
# Refresh origin first, so a thin bundle's prerequisites (pushed root commits) are present.
ssh_ -n "cd $repo && git fetch -q origin 2>/dev/null; { git cat-file -e $sha^{commit} 2>/dev/null || git fetch -q origin $sha 2>/dev/null; git cat-file -e $sha^{commit} 2>/dev/null; }" || rc=$?
[[ $rc == 255 ]] && { echo "alickers-job: worker unreachable (ssh 255); rerun on factory-worker" >&2; exit 255; }
if [[ $rc != 0 ]]; then
  # A bundle needs a ref: use a throwaway one under refs/alickers/. Each call
  # uses its own name on the sandbox, so concurrent callers never share one.
  bundle="$(mktemp /work/tmp/alickers-XXXXXX.bundle)" ref="refs/alickers/$sha" incoming="$tmp/incoming-$sha-$$.bundle"
  git update-ref "$ref" "$sha"
  git bundle create -q "$bundle" "$ref" --not origin/feat/siltwake-first-expedition 2>/dev/null || git bundle create -q "$bundle" "$ref"
  git update-ref -d "$ref"
  ssh_ "cat > $incoming" < "$bundle"
  if ! ssh_ -n "cd $repo && git fetch -q $incoming $ref 2>/dev/null"; then
    # The sandbox lacks a prerequisite (for example, root not pushed yet): send the full history.
    git update-ref "$ref" "$sha"; git bundle create -q "$bundle" "$ref"; git update-ref -d "$ref"
    ssh_ "cat > $incoming" < "$bundle"
    ssh_ -n "cd $repo && git fetch -q $incoming $ref"
  fi
  rm -f "$bundle"
  ssh_ -n "cd $repo && rm -f $incoming && git cat-file -e $sha^{commit}"
fi

quoted="$(printf '%q ' "$@")"
ssh_ -n "cd $repo && siltwake-job --deadline $deadline --memory $memory bash -c '
  r=\"$receipt\"
  rec() { [ -z \"\$r\" ] || printf \"%s\\n\" \"\$*\" >>\"\$r\"; }
  [ -z \"\$r\" ] || mkdir -p \"\$(dirname \"\$r\")\"
  rec admitted \$(date +%s)
  old=\$(git rev-parse HEAD 2>/dev/null || true)
  git checkout -q --detach $sha || { s=\$?; rec setup failed checkout \$s; exit 70; }
  rec sha \$(git rev-parse HEAD)
  if [ -n \"\$old\" ] && ! git diff --quiet \"\$old\" $sha -- package-lock.json; then
    npm ci --no-audit --no-fund >/dev/null || { s=\$?; rec setup failed npm-ci \$s; exit 70; }
  fi
  # The checkout is shared between commits: drop compiled output from another commit, so an
  # incremental build can never run stale files (COL-1 saw a stale caves.js).
  if [ \"\$old\" != $sha ]; then rm -rf .test-build .test-build-* || { s=\$?; rec setup failed clean \$s; exit 70; }; fi
  rec setup ok
  echo \"alickers-job: testing $sha on \$(hostname)\"
  rec started
  $quoted; rc=\$?
  rec exit \$rc
  echo \"alickers-job: tested $sha exit \$rc\"; exit \$rc
'"
