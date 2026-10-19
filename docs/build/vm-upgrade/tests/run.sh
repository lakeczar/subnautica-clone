#!/usr/bin/env bash
# Offline tests for vm-ram-upgrade.sh and restore-tmp-links.sh. No Unraid host,
# no VM and no network are used. Run as a normal user on a Linux box with
# bubblewrap (factory-worker has it):
#
#   bash docs/build/vm-upgrade/tests/run.sh
#
# Like Fleet's unraid/test/run.sh, bwrap puts scratch folders over /mnt, /boot,
# /root and /tmp and a fake virsh, logger and Unraid notify over /usr/local, so the
# production script runs unchanged with its real paths and nothing real is
# touched. Scratch lives under /work/tmp (disk) when it exists, not in RAM /tmp;
# the one exception is a 16 MiB tmpfs at /mnt/smallfs that a test fills up.
# Exit 1 if a check fails.
set -euo pipefail

command -v bwrap >/dev/null || { echo "needs bubblewrap: sudo apt-get install bubblewrap" >&2; exit 1; }
here="$(cd "$(dirname "$0")" && pwd)"
base=/work/tmp; [ -d "$base" ] && [ -w "$base" ] || base="${TMPDIR:-/tmp}"
T="$(mktemp -d -p "$base" vmu-test.XXXXXX)"
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/sbin" "$T/emhttp/webGui/scripts" "$T/mnt/smallfs" "$T/boot" "$T/root" "$T/tmp" "$T/src"
cp "$here/../vm-ram-upgrade.sh" "$here/../restore-tmp-links.sh" "$here/../worker-check.sh" "$here/../ask-command.sh" "$here/checks.sh" "$T/src/"
cp "$here/fake-virsh.sh" "$T/sbin/virsh"
printf '#!/bin/bash\necho "notify $*" >> /tmp/vmu-fake/notify.log\n' > "$T/emhttp/webGui/scripts/notify"
# syslog stays in the sandbox too: a fake logger ahead of the real one on the script's PATH.
printf '#!/bin/bash\necho "logger $*" >> /tmp/vmu-fake/syslog.log\n' > "$T/sbin/logger"
chmod +x "$T/sbin/virsh" "$T/sbin/logger" "$T/emhttp/webGui/scripts/notify"

set +e
bwrap --dev-bind / / --unshare-user --uid 0 --gid 0 \
  --tmpfs /usr/local --bind "$T/sbin" /usr/local/sbin --bind "$T/emhttp" /usr/local/emhttp \
  --bind "$T/mnt" /mnt --size 16777216 --tmpfs /mnt/smallfs --bind "$T/boot" /boot --bind "$T/root" /root --bind "$T/tmp" /tmp \
  env SRC="$T/src" bash "$T/src/checks.sh" 2>&1 | tee "$T/out.txt"
set -e
# Detached runs from the launch checks may still be finishing; checks.sh waits for them.
grep -q '^failed 0$' "$T/out.txt"
