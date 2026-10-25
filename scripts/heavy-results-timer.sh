#!/usr/bin/env bash
# The daily heavy-results sweep (STEW-3): a persistent user systemd timer on
# factory-worker, where the queue's job logs and the results store live. Once a day it
# runs `heavy-results.mjs sweep` as a queued quick job on the 3090 (data locality, not a
# GPU or exclusive run), from a stable installed copy, never a worktree, so finished
# jobs' records are stored before the queue prunes their logs at 7 days.
#
#   scripts/heavy-results-timer.sh install [--dry-run DIR]   copy, write the units, enable the timer
#   scripts/heavy-results-timer.sh uninstall [--dry-run DIR]
#   scripts/heavy-results-timer.sh status                    the timer, and whether the sweep is overdue
#
# Bounded: one queue ticket a day (quick class, a 15-minute deadline, a 90-minute queue
# timeout), at most 200 jobs per sweep with the rest left for the next, logs over 64 MiB
# skipped, a checkpoint of jobs already read. Publishes only terminal, complete records,
# atomically (heavy-results.mjs ingest), and records the last successful sweep;
# `status` (heavy-results.mjs sweep-status) exits 1 when none succeeded in 36 hours.
# --dry-run DIR writes the copy and the units under DIR and prints the systemctl calls
# instead of making them (the tests use it).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cmd="${1:-}"; shift || true
dry=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) dry="$2"; shift 2 ;;
    *) echo "usage: $0 install|uninstall|status [--dry-run DIR]" >&2; exit 2 ;;
  esac
done
home="${dry:-$HOME}"
share="$home/.local/share/siltwake-results/sweep" units="$home/.config/systemd/user"
queue="${SILTWAKE_SWEEP_QUEUE:-$HOME/.local/share/siltwake-sched/current/heavy-check.mjs}"
name=siltwake-heavy-results
systemctl_() { if [[ -n "$dry" ]]; then echo "systemctl --user $*"; else systemctl --user "$@"; fi; }

case "$cmd" in
  install)
    node="$(command -v node)" || { echo "heavy-results-timer: node isn't on PATH" >&2; exit 1; }
    [[ -n "$dry" || -f "$queue" ]] || { echo "heavy-results-timer: the installed queue client $queue is missing (scripts/heavy/install.sh)" >&2; exit 1; }
    version="$(sha256sum "$here/heavy-results.mjs" | cut -c1-12)"
    mkdir -p "$share" "$units"
    # A version's copy is immutable: reinstalling the same version reuses it; a new one is
    # published whole (written, then renamed into place) before anything points at it.
    if [[ -f "$share/$version/heavy-results.mjs" ]]; then
      cmp -s "$here/heavy-results.mjs" "$share/$version/heavy-results.mjs" || { echo "heavy-results-timer: $share/$version differs from its own version hash; investigate before removing it" >&2; exit 1; }
    else
      stage="$(mktemp -d "$share/.$version.XXXXXX")"
      cp "$here/heavy-results.mjs" "$stage/heavy-results.mjs"
      chmod a-w "$stage/heavy-results.mjs"
      mv -T "$stage" "$share/$version"
    fi
    ln -sfn "$version" "$share/current"
    cat > "$units/$name.service" <<EOF
[Unit]
Description=Siltwake: store finished heavy-tier results before the queue prunes their logs (STEW-3)

[Service]
Type=oneshot
Slice=siltwake.slice
WorkingDirectory=$share/current
TimeoutStartSec=2h
ExecStart=$node $queue run --class quick --review --machine 3090 --deadline 900 --queue-timeout 5400 -- $node $share/current/heavy-results.mjs sweep --max 200
EOF
    cat > "$units/$name.timer" <<EOF
[Unit]
Description=Siltwake: daily heavy-results sweep (STEW-3)

[Timer]
OnCalendar=*-*-* 05:30:00
RandomizedDelaySec=15min
Persistent=true

[Install]
WantedBy=timers.target
EOF
    systemctl_ daemon-reload
    systemctl_ enable --now "$name.timer"
    echo "heavy-results-timer: installed $version ($share/current); check it with: $0 status"
    ;;
  uninstall)
    systemctl_ disable --now "$name.timer" || true
    rm -f "$units/$name.service" "$units/$name.timer"
    systemctl_ daemon-reload
    echo "heavy-results-timer: removed the units; the copies in $share and the results store stay"
    ;;
  status)
    systemctl --user list-timers "$name.timer" --no-pager || true
    node "$share/current/heavy-results.mjs" sweep-status
    ;;
  *) echo "usage: $0 install|uninstall|status [--dry-run DIR]" >&2; exit 2 ;;
esac
