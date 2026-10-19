#!/usr/bin/env bash
# Offline tests for host-gpu.sh, ask-command.sh and webgl-probe.mjs's classifier.
# No Unraid host, VM, GPU or network is used. Needs bubblewrap and node (factory-worker has both):
#
#   bash docs/build/gpu-enablement/tests/run.sh
#
# bwrap puts scratch folders over /mnt, /boot and /tmp and a fake virsh, logger and
# Unraid notify over /usr/local, so the production script runs unchanged with its
# real paths. Scratch lives under /work/tmp (disk) when it exists. Exit 1 on a failure.
set -euo pipefail
command -v bwrap >/dev/null || { echo "needs bubblewrap: sudo apt-get install bubblewrap" >&2; exit 1; }
here="$(cd "$(dirname "$0")" && pwd)"
base=/work/tmp; [ -d "$base" ] && [ -w "$base" ] || base="${TMPDIR:-/tmp}"
T="$(mktemp -d -p "$base" gpu-test.XXXXXX)"
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/sbin" "$T/emhttp/webGui/scripts" "$T/mnt" "$T/boot" "$T/tmp" "$T/src/fixtures"
cp "$here/../host-gpu.sh" "$here/../ask-command.sh" "$here/checks.sh" "$T/src/"
cp "$here/fixtures/factory-worker.xml" "$T/src/fixtures/"
cp "$here/fake-virsh.sh" "$T/sbin/virsh"
printf '#!/bin/bash\necho "notify $*" >> /tmp/gpu-fake/notify.log\n' > "$T/emhttp/webGui/scripts/notify"
printf '#!/bin/bash\necho "logger $*" >> /tmp/gpu-fake/syslog.log\n' > "$T/sbin/logger"
chmod +x "$T/sbin/virsh" "$T/sbin/logger" "$T/emhttp/webGui/scripts/notify"

status=0
bwrap --dev-bind / / --unshare-user --uid 0 --gid 0 \
  --tmpfs /usr/local --bind "$T/sbin" /usr/local/sbin --bind "$T/emhttp" /usr/local/emhttp \
  --bind "$T/mnt" /mnt --bind "$T/boot" /boot --bind "$T/tmp" /tmp \
  env SRC="$T/src" bash "$T/src/checks.sh" > "$T/out.txt" 2>&1 || status=1
cat "$T/out.txt"
grep -q '^failed 0$' "$T/out.txt" || status=1

echo "== ask-command.sh"
for a in preflight rehearsal attach detach; do
  line="$(bash "$here/../ask-command.sh" "$a")"
  sha="$(sha256sum < "$here/../host-gpu.sh" | cut -d' ' -f1)"
  if grep -q "echo \"$sha  \$d/host-gpu.sh\" | sha256sum -c" <<<"$line" && { [ "$a" = preflight ] || grep -Eq -- "--not-after [0-9]{10}" <<<"$line"; }; then
    echo "ok   ask $a is hash-pinned$([ "$a" = preflight ] || echo ' and has a deadline')"
  else echo "FAIL ask $a: $line"; status=1; fi
done
bash "$here/../ask-command.sh" bogus 2>/dev/null && { echo "FAIL ask accepts an unknown action"; status=1; } || echo "ok   ask refuses an unknown action"

echo "== webgl-probe classifier"
node "$here/../webgl-probe.mjs" --self-test || status=1
exit "$status"
