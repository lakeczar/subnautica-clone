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
#   scripts/heavy/install.sh --uninstall     remove `current`: every shim falls back to v1
#
# Idempotent. Installed versions are immutable, so running supervisors keep
# their own code while `current` moves.
set -euo pipefail
src=$(cd "$(dirname "$0")" && pwd)
home="${SILTWAKE_SCHED_HOME:-$HOME/.local/share/siltwake-sched}"
dir="${SILTWAKE_SCHED_DIR:-/work/tmp/siltwake-sched}"
slice_name="${SILTWAKE_SCHED_SLICE:-siltwake-heavy.slice}"
mode="" slice=0 uninstall=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) mode="$2"; shift 2 ;;
    --slice) slice=1; shift ;;
    --uninstall) uninstall=1; shift ;;
    *) echo "usage: $0 [--mode serial|normal] [--slice] [--uninstall]" >&2; exit 2 ;;
  esac
done

if [[ $uninstall == 1 ]]; then
  rm -f "$home/current"
  echo "heavy-check v2 uninstalled: shims fall back to v1. State in $dir is kept."
  exit 0
fi

files=(policy.mjs state.mjs supervisor.mjs holder.mjs heavy-check.mjs scope-run.sh build-guard.mjs gpu-lease.mjs)
version=$(cd "$src" && cat "${files[@]}" | sha256sum | cut -c1-12)
if [[ ! -d "$home/$version" ]]; then
  [[ -d "$home/$version.tmp" ]] && chmod -R u+w "$home/$version.tmp" && rm -rf "$home/$version.tmp"
  mkdir -p "$home/$version.tmp"
  (cd "$src" && cp "${files[@]}" "$home/$version.tmp/")
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

echo "heavy-check v2 $version installed at $home/current; state $dir; mode $(cat "$dir/mode")$([[ $slice == 1 ]] && echo "; slice $slice_name installed")"
