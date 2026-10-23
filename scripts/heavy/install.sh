#!/usr/bin/env bash
# Installs heavy-check v2 machine-wide, so every worktree's scripts/heavy-check.sh
# shim runs one implementation against one queue.
#
#   scripts/heavy/install.sh                 copy this tree's scripts/heavy to
#                                            ~/.local/share/siltwake-sched/<version>,
#                                            point `current` at it, create the state
#                                            directory (mode serial if new)
#   scripts/heavy/install.sh --mode normal   switch mode (serial = v1 behaviour)
#   scripts/heavy/install.sh --slice         also install the user slice unit
#                                            (per-user config: coordinator approval)
#   scripts/heavy/install.sh --rollback VER  point `current` at an installed older version
#   scripts/heavy/install.sh --uninstall     remove `current`: every shim falls back to v1
#     Both first hand the state over (handover.mjs): they refuse while an
#     exclusive job runs or its CPU boost can't be reset and verified, because
#     older code never cleans that up (TST-16). Run them from the installed
#     copy: ~/.local/share/siltwake-sched/current/install.sh --rollback VER.
#     Never roll back by running an older tree's install.sh.
#   scripts/heavy/install.sh --gpu-guard     wrap every Playwright Chrome binary so a GPU
#                                            launch needs the GPU lease (chrome-guard.sh);
#                                            per-user change: coordinator approval
#   scripts/heavy/install.sh --gpu-guard-remove   put the real binaries back
#
# Idempotent. Installed versions are immutable, so running supervisors keep
# their own code while `current` moves.
set -euo pipefail
src=$(cd "$(dirname "$0")" && pwd)
home="${SILTWAKE_SCHED_HOME:-$HOME/.local/share/siltwake-sched}"
dir="${SILTWAKE_SCHED_DIR:-/work/tmp/siltwake-sched}"
slice_name="${SILTWAKE_SCHED_SLICE:-siltwake-heavy.slice}"
pw="${SILTWAKE_PLAYWRIGHT_DIR:-$HOME/.cache/ms-playwright}"
mode="" slice=0 uninstall=0 guard="" rollback=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) mode="$2"; shift 2 ;;
    --slice) slice=1; shift ;;
    --uninstall) uninstall=1; shift ;;
    --rollback) rollback="$2"; shift 2 ;;
    --gpu-guard) guard=on; shift ;;
    --gpu-guard-remove) guard=off; shift ;;
    *) echo "usage: $0 [--mode serial|normal] [--slice] [--gpu-guard|--gpu-guard-remove] [--rollback VERSION] [--uninstall]" >&2; exit 2 ;;
  esac
done

# Playwright's Chrome binaries (full and headless shell), real ELF files or
# ones already wrapped.
browsers() {
  find "$pw" -maxdepth 3 -type f \( -name chrome -o -name chrome-headless-shell -o -name headless_shell \) -path "$pw/chromium*" 2>/dev/null
}
if [[ $guard == off ]]; then
  for b in $(browsers); do [[ -f "$b.siltwake-real" ]] && mv -f "$b.siltwake-real" "$b" && echo "unwrapped $b"; done
  exit 0
fi

if [[ $uninstall == 1 || -n $rollback ]]; then
  [[ -z $rollback || -d "$home/$rollback" ]] || { echo "no installed version $rollback in $home" >&2; exit 2; }
  SILTWAKE_SCHED_DIR="$dir" node "$src/handover.mjs" || { echo "not handed over: the older code would not clean that up; nothing was changed" >&2; exit 3; }
  if [[ $uninstall == 1 ]]; then
    rm -f "$home/current"
    echo "heavy-check v2 uninstalled: shims fall back to v1. State in $dir is kept."
  else
    ln -sfn "$rollback" "$home/current.tmp" && mv -T "$home/current.tmp" "$home/current"
    echo "heavy-check rolled back to $rollback."
  fi
  exit 0
fi

files=(install.sh handover.mjs policy.mjs state.mjs contention.mjs supervisor.mjs holder.mjs heavy-check.mjs scope-run.sh anchor.sh build-guard.mjs gpu-lease.mjs snapshot.mjs chrome-guard.sh
  remote.mjs remote-holder.mjs lane-run.sh)
# The remote lane's transport (SCHED-2b) is scripts/alickers-job.sh; each
# version carries its own copy, so a running remote ticket keeps its transport.
transport="$src/../alickers-job.sh"
# The GPU lease checker has its own immutable install ($home/guard/<version>,
# `guard/current`): the Chrome wrappers point there, never at the scheduler's
# `current`, so installing an older scheduler (a rollback) or uninstalling it
# leaves the guard enforcing (R1-F5). A lease names a ticket's grant, which
# SCHED-1 and SCHED-2 write alike.
guard_files=(gpu-lease.mjs state.mjs contention.mjs policy.mjs snapshot.mjs)
install_guard() {
  local gv
  gv=$(cd "$src" && cat "${guard_files[@]}" | sha256sum | cut -c1-12)
  if [[ ! -d "$home/guard/$gv" ]]; then
    [[ -d "$home/guard/$gv.tmp" ]] && chmod -R u+w "$home/guard/$gv.tmp" && rm -rf "$home/guard/$gv.tmp"
    mkdir -p "$home/guard/$gv.tmp"
    (cd "$src" && cp "${guard_files[@]}" "$home/guard/$gv.tmp/")
    chmod -R a-w "$home/guard/$gv.tmp"
    mv -T "$home/guard/$gv.tmp" "$home/guard/$gv"
  fi
  ln -sfn "$gv" "$home/guard/current.tmp"
  mv -T "$home/guard/current.tmp" "$home/guard/current"
}
version=$(cd "$src" && cat "${files[@]}" "$transport" | sha256sum | cut -c1-12)
if [[ ! -d "$home/$version" ]]; then
  [[ -d "$home/$version.tmp" ]] && chmod -R u+w "$home/$version.tmp" && rm -rf "$home/$version.tmp"
  mkdir -p "$home/$version.tmp"
  (cd "$src" && cp "${files[@]}" "$home/$version.tmp/")
  cp "$transport" "$home/$version.tmp/alickers-job.sh"
  chmod -R a-w "$home/$version.tmp"
  mv -T "$home/$version.tmp" "$home/$version"
fi
ln -sfn "$version" "$home/current.tmp"
mv -T "$home/current.tmp" "$home/current"

mkdir -p "$dir/jobs"
[[ -f "$dir/protocol" ]] || echo 1 >"$dir/protocol"
[[ -f "$dir/mode" ]] || echo serial >"$dir/mode"
if [[ -n "$mode" ]]; then
  [[ "$mode" == serial || "$mode" == normal ]] || { echo "mode must be serial or normal" >&2; exit 2; }
  echo "$mode" >"$dir/mode.tmp" && mv "$dir/mode.tmp" "$dir/mode"
fi

if [[ $slice == 1 ]]; then
  # Static values for 6 vCPU; supervisors correct CPUQuota and MemoryMax at
  # runtime from nproc and the pool (config.json), so a vCPU change needs no
  # reinstall.
  unit_dir="$HOME/.config/systemd/user"
  mkdir -p "$unit_dir"
  cat >"$unit_dir/$slice_name" <<EOF
[Unit]
Description=Siltwake heavy-check v2 lane (scripts/heavy, SCHED-1)

[Slice]
MemoryAccounting=yes
MemoryMax=8G
MemorySwapMax=0
CPUAccounting=yes
CPUQuota=500%
EOF
  systemctl --user daemon-reload
  node -e '
    const fs = require("fs"), p = process.argv[1];
    let c = {}; try { c = JSON.parse(fs.readFileSync(p, "utf8")); } catch {}
    c.manageSlice = true;
    fs.writeFileSync(p + ".tmp", JSON.stringify(c, null, 1)); fs.renameSync(p + ".tmp", p);
  ' "$dir/config.json"
fi

# A guard already in place follows this scheduler's lease checker.
[[ $guard != on && -e "$home/guard/current" ]] && install_guard

if [[ $guard == on ]]; then
  install_guard
  # Each wrapper carries the guard itself (chrome-guard.sh), so nothing at
  # launch depends on the scheduler's install; a missing checker fails closed.
  # The wrapper takes the binary's place atomically: the real file gets a
  # second name (a hard link, same inode), then the wrapper is renamed over the
  # original name, so a concurrent launch always finds one or the other.
  # Running browsers are unaffected. Re-run after `npx playwright install`.
  for b in $(browsers); do
    if [[ ! -f "$b.siltwake-real" ]]; then
      [[ "$(head -c4 "$b" | od -An -c | tr -d ' ')" == '177ELF' ]] || { echo "skipping $b: not an ELF binary" >&2; continue; }
      ln "$b" "$b.siltwake-real"
    fi
    {
      echo '#!/bin/sh'
      echo '# Siltwake GPU lease guard (scripts/heavy/install.sh --gpu-guard). The real'
      echo '# binary is $0.siltwake-real; install.sh --gpu-guard-remove puts it back.'
      echo 'real="$0.siltwake-real"'
      echo "check='$home/guard/current/gpu-lease.mjs'"
      cat "$src/chrome-guard.sh"
    } >"$b.siltwake-tmp"
    chmod 755 "$b.siltwake-tmp" && mv -f "$b.siltwake-tmp" "$b"
    echo "wrapped $b"
  done
fi

echo "heavy-check v2 $version installed at $home/current; state $dir; mode $(cat "$dir/mode")$([[ $slice == 1 ]] && echo "; slice $slice_name installed")"
