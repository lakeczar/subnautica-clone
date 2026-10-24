#!/usr/bin/env bash
# Runs one job on the best-effort second test worker (siltwake-alickers: WSL2 on
# the owner's PC, 8 CPUs, 16 GB, RTX 4070 Laptop GPU), pinned to an exact commit.
#
#   scripts/alickers-job.sh [--sha SHA] [--deadline S] [--memory NG] [--receipt DIR] [--no-wait] -- COMMAND ...
#
# The commit (default: this worktree's HEAD) must be committed. A commit already
# on origin is fetched by the sandbox; otherwise it is sent as a git bundle.
# Inside the sandbox's own job lock (`siltwake-job`), the shared checkout is
# moved to that commit, `npm ci` runs if package-lock.json changed, compiled
# test output from a different commit is removed, and then
# COMMAND runs. The first and last lines name the tested SHA.
#
# --receipt DIR (a directory on the sandbox; heavy-check's remote lane,
# SCHED-2b) makes DIR/receipt the control channel. The caller gives a random
# nonce as the first line of this script's stdin. It travels to the sandbox over
# ssh stdin, never in argv, the environment or a path the job is told. The script,
# not the job, appends one "<nonce> <phase> ..." line per phase, from inside the
# sandbox's job lock, in exactly this order:
#   admitted <epoch>              the sandbox's lock was taken and this attempt claimed
#   sha <sha>                     the checkout's HEAD after moving it
#   setup ok clean|restored:<n>   the tracked tree is exactly the commit (n tracked
#                                 files left changed by an earlier job were restored)
#   | setup failed <step> <code>  checkout, npm ci, the clean or that check failed (exit 70; last line)
#   started                       COMMAND is about to run
#   lane <word> ...               COMMAND's own lines (heavy-check's lane-run.sh)
#   after <head> clean|changed:<n> HEAD and the tracked files once COMMAND ended
#   exit <code>                   COMMAND's exit code (last line)
# or a single line instead of all that: "busy" (--no-wait and the lock was held)
# or "abandoned" (the caller gave this attempt up first; see DIR/claim). Nothing
# ran then. COMMAND's stdin is one line, "<nonce> DIR", so a wrapper can add its own
# "lane" lines (heavy-check's lane-run.sh reads it and gives its job /dev/null).
# DIR/claim is a symlink: the sandbox creates it as "run" when it admits the
# attempt, and a caller that gives the attempt up first creates it as "abandon".
# Whichever is first wins, so an abandoned attempt can never start. Before
# claiming, the sandbox publishes DIR/scope, "<boot id> <cgroup> <inode>" of the
# job scope, atomically: a claimed attempt always has it, so a stop can prove
# its end (the cgroup gone, empty, another inode, or another boot).
# Output lines never carry control meaning. With fd 3 open, this script writes
# "handover" there just before the job command goes to the sandbox: an earlier
# failure means nothing reached it.
#
# --no-wait: if the sandbox's job lock is held (another agent's direct call),
# write "busy" and exit 75 at once instead of waiting for it (heavy-check's any
# and soak jobs: they run on factory-worker instead). The default is to wait, as
# siltwake-job does, up to 3,600 s.
#
# The shared checkout: tracked files are put back to the commit with `git
# checkout -f` before COMMAND runs, and again after it if it changed them.
# Untracked files are left alone, except compiled test output (.test-build*),
# which is removed whenever the commit changes or tracked files were restored.
#
# Exit 75 or 255 means the worker is paused, stopped, busy (--no-wait) or
# unreachable: rerun the job on factory-worker with scripts/heavy-check.sh.
# Never restart Windows or change host settings to make it available.
#
# Test seams (ALICKERS_SSH, the ssh command; ALICKERS_REPO, the sandbox
# checkout; ALICKERS_TMP, its scratch directory; ALICKERS_LOCK, its job lock)
# work only with ALICKERS_TEST_MODE=1 and a private SILTWAKE_SCHED_DIR (not
# /work/tmp/siltwake-sched). Otherwise they are ignored, with a warning.
set -euo pipefail
sha="" deadline=1800 memory=8G receipt="" nowait=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --sha) sha="$2"; shift 2 ;;
    --deadline) deadline="$2"; shift 2 ;;
    --memory) memory="$2"; shift 2 ;;
    --receipt) receipt="$2"; shift 2 ;;
    --no-wait) nowait=1; shift ;;
    --) shift; break ;;
    *) break ;;
  esac
done
[[ $# -gt 0 ]] || { echo "usage: $0 [--sha SHA] [--deadline S] [--memory NG] [--receipt DIR] [--no-wait] -- COMMAND ..." >&2; exit 2; }
[[ -z "$receipt" || "$receipt" =~ ^/[A-Za-z0-9_./-]+$ ]] || { echo "alickers-job: --receipt must be a plain absolute path" >&2; exit 2; }
nonce=""
if [[ -n "$receipt" ]]; then
  IFS= read -r nonce || true
  [[ "$nonce" =~ ^[0-9a-f]{32}$ ]] || { echo "alickers-job: --receipt needs a 32-hex nonce as the first line of stdin" >&2; exit 2; }
fi
[[ -n "$(git status --porcelain --untracked-files=no)" && -z "$sha" ]] && echo "alickers-job: uncommitted changes are not sent; testing HEAD only" >&2
sha="$(git rev-parse --verify "${sha:-HEAD}^{commit}")"
ssh_cmd=(/usr/bin/ssh -F "$HOME/.ssh/siltwake.conf" siltwake-alickers) repo=/work/repos/subnautica-clone tmp=/work/tmp lock=/work/tmp/siltwake-sandbox-job.lock
# Private by identity, not spelling: a trailing slash, `..` or a symlink to the
# production state is production (as scripts/heavy/state.mjs sameDir).
private_state() { [[ -n "${SILTWAKE_SCHED_DIR:-}" && ! "$SILTWAKE_SCHED_DIR" -ef /work/tmp/siltwake-sched && "$(realpath -m -- "$SILTWAKE_SCHED_DIR")" != /work/tmp/siltwake-sched ]]; }
if [[ "${ALICKERS_TEST_MODE:-}" == 1 ]] && private_state; then
  [[ -n "${ALICKERS_SSH:-}" ]] && read -r -a ssh_cmd <<<"$ALICKERS_SSH"
  repo="${ALICKERS_REPO:-$repo}" tmp="${ALICKERS_TMP:-$tmp}" lock="${ALICKERS_LOCK:-$lock}"
elif [[ -n "${ALICKERS_SSH:-}${ALICKERS_REPO:-}${ALICKERS_TMP:-}${ALICKERS_LOCK:-}" ]]; then
  echo "alickers-job: ignoring ALICKERS_* test overrides (they need ALICKERS_TEST_MODE=1 and a private SILTWAKE_SCHED_DIR)" >&2
fi
# fd 3 (the caller's control pipe) is never passed on.
ssh_() { "${ssh_cmd[@]}" "$@" 3>&-; }

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

# One script for both sides, given its own text as $0: "outer" runs in the
# sandbox's login shell (the no-wait check, then siltwake-job); "inner" runs
# inside siltwake-job's lock and scope. The nonce is only ever read from stdin.
remote=$(cat <<'REMOTE'
role=$1; shift
if [ "$role" = outer ]; then
  sha=$1 c=$2 nowait=$3 deadline=$4 memory=$5 lock=$6; shift 6
  n=""; [ -z "$c" ] || { IFS= read -r n; mkdir -p "$c"; }
  if [ "$nowait" = 1 ] && ! flock -n "$lock" true; then
    [ -z "$c" ] || printf '%s busy\n' "$n" >>"$c/receipt"
    echo "alickers-job: the sandbox is busy (its job lock is held); not waiting" >&2; exit 75
  fi
  if [ -z "$c" ]; then exec siltwake-job --deadline "$deadline" --memory "$memory" bash -c "$0" "$0" inner "$sha" "" "$@" </dev/null; fi
  printf '%s\n' "$n" | siltwake-job --deadline "$deadline" --memory "$memory" bash -c "$0" "$0" inner "$sha" "$c" "$@"
  exit $?
fi
sha=$1 c=$2; shift 2
n=""; [ -z "$c" ] || IFS= read -r n
rec() { [ -z "$c" ] || printf '%s %s\n' "$n" "$*" >>"$c/receipt"; }
if [ -n "$c" ]; then
  # The scope's identity (this boot, its cgroup and inode) is published, complete
  # and atomically, before the claim: once "run" is claimed, a stop can always
  # prove this attempt's end from it. Without it, nothing is claimed.
  boot=$(cat /proc/sys/kernel/random/boot_id 2>/dev/null) cg=/sys/fs/cgroup$(sed -n 's/^0:://p' /proc/self/cgroup)
  ino=$(stat -c %i "$cg" 2>/dev/null)
  if ! [[ "$boot" =~ ^[0-9a-f-]{36}$ && "$ino" =~ ^[0-9]+$ ]] || ! { printf '%s %s %s\n' "$boot" "$cg" "$ino" >"$c/scope.tmp" && mv -f "$c/scope.tmp" "$c/scope"; }; then
    echo "alickers-job: could not record the job scope's identity; the command did not run" >&2; exit 70
  fi
  ln -s run "$c/claim" 2>/dev/null
  [ "$(readlink "$c/claim")" = run ] || { rec abandoned; echo "alickers-job: this attempt was given up before the sandbox admitted it; the command did not run" >&2; exit 75; }
fi
rec admitted "$(date +%s)"
old=$(git rev-parse HEAD 2>/dev/null || true)
dirty=$(git status --porcelain --untracked-files=no 2>/dev/null | wc -l)
git checkout -q -f --detach "$sha" || { s=$?; rec setup failed checkout $s; exit 70; }
rec sha "$(git rev-parse HEAD)"
if [ -n "$old" ] && ! git diff --quiet "$old" "$sha" -- package-lock.json; then
  npm ci --no-audit --no-fund >/dev/null || { s=$?; rec setup failed npm-ci $s; exit 70; }
fi
# The checkout is shared between commits: drop compiled output from another commit
# or from restored edits, so an incremental build never runs stale files (COL-1 saw a stale caves.js).
if [ "$old" != "$sha" ] || [ "$dirty" -gt 0 ]; then rm -rf .test-build .test-build-* || { s=$?; rec setup failed clean $s; exit 70; }; fi
# The tracked tree must be exactly the commit when the command starts.
if [ "$(git rev-parse HEAD)" != "$sha" ] || [ -n "$(git status --porcelain --untracked-files=no)" ]; then rec setup failed verify 1; exit 70; fi
tree=clean
if [ "$dirty" -gt 0 ]; then tree="restored:$dirty"; echo "alickers-job: $dirty tracked files in the sandbox checkout were changed; restored to $sha" >&2; fi
rec setup ok $tree
echo "alickers-job: testing $sha on $(hostname)"
rec started
if [ -n "$c" ]; then "$@" <<<"$n $c"; else "$@" </dev/null; fi
rc=$?
head=$(git rev-parse HEAD 2>/dev/null || echo none) changed=$(git status --porcelain --untracked-files=no 2>/dev/null | wc -l)
if [ "$head" = "$sha" ] && [ "$changed" = 0 ]; then after=clean; else
  after="changed:$changed"
  echo "alickers-job: the job changed the checkout (HEAD $head, $changed tracked files); restored to $sha" >&2
  git checkout -q -f --detach "$sha" 2>/dev/null; rm -rf .test-build .test-build-*
fi
rec after "$head" "$after"
rec exit $rc
echo "alickers-job: tested $sha exit $rc"; exit $rc
REMOTE
)
args=("$remote" "$remote" outer "$sha" "$receipt" "$nowait" "$deadline" "$memory" "$lock" "$@")
cmd="cd $(printf %q "$repo") && exec bash -c$(printf ' %q' "${args[@]}")"
if [[ -n "$receipt" ]]; then
  { true >&3; } 2>/dev/null && echo handover >&3
  printf '%s\n' "$nonce" | ssh_ "$cmd"
else
  ssh_ -n "$cmd"
fi
