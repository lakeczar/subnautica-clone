#!/usr/bin/env bash
# Offline tests for host-gpu.sh, worker-gpu.sh, ask-command.sh and webgl-probe.mjs's decision logic.
# No Unraid host, VM, GPU or network is used. Needs bubblewrap and node (factory-worker has both):
#
#   bash docs/build/gpu-enablement/tests/run.sh
#
# bwrap puts scratch folders over /mnt, /boot and /tmp and a fake virsh, logger and
# Unraid notify over /usr/local, so the production script runs unchanged with its
# real paths. The sandbox gets a fixed PATH (not the caller's), and checks.sh stops at
# once unless the fake virsh is the one selected. Scratch lives under /work/tmp (disk)
# when it exists. Exit 1 on a failure.
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
  env -i PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin HOME=/tmp LANG=C.UTF-8 SRC="$T/src" \
  bash "$T/src/checks.sh" > "$T/out.txt" 2>&1 || status=1
cat "$T/out.txt"
grep -q '^failed 0$' "$T/out.txt" || status=1

echo "== guest: worker-gpu.sh (no network, real root read-only, fake system tools first on PATH)"
mkdir -p "$T/fakebin" "$T/gtmp" "$T/gsrc/tests"
cp "$here/../worker-gpu.sh" "$here/../webgl-probe.mjs" "$T/gsrc/"; cp "$here/guest-checks.sh" "$T/gsrc/tests/"
cp "$here/fake-guest-tool.sh" "$T/fakebin/fake-guest-tool"; chmod +x "$T/fakebin/fake-guest-tool"
for t in sudo apt-get apt-mark dpkg-query journalctl lsmod modinfo modprobe lspci nvidia-smi systemctl loginctl curl df; do ln -s fake-guest-tool "$T/fakebin/$t"; done
node_dir="$(dirname "$(command -v node)")"
bwrap --ro-bind / / --dev /dev --proc /proc --bind "$T/gtmp" /tmp --ro-bind "$T/fakebin" /tmp/fakebin --unshare-net --unshare-pid --die-with-parent \
  env -i PATH="/tmp/fakebin:$node_dir:/usr/bin:/bin" HOME=/tmp USER=worker LANG=C.UTF-8 SRC="$T/gsrc" \
  bash "$T/gsrc/tests/guest-checks.sh" > "$T/guest-out.txt" 2>&1 || status=1
cat "$T/guest-out.txt"
grep -q '^failed 0$' "$T/guest-out.txt" || status=1

echo "== ask-command.sh"
for a in preflight rehearsal attach detach; do
  line="$(bash "$here/../ask-command.sh" "$a")"
  sha="$(sha256sum < "$here/../host-gpu.sh" | cut -d' ' -f1)"
  if grep -q "echo \"$sha  \$d/host-gpu.sh\" | sha256sum -c" <<<"$line" && { [ "$a" = preflight ] || grep -Eq -- "--not-after [0-9]{10}" <<<"$line"; }; then
    echo "ok   ask $a is hash-pinned$([ "$a" = preflight ] || echo ' and has a deadline')"
  else echo "FAIL ask $a: $line"; status=1; fi
done
bash "$here/../ask-command.sh" bogus 2>/dev/null && { echo "FAIL ask accepts an unknown action"; status=1; } || echo "ok   ask refuses an unknown action"

echo "== webgl-probe decision logic and report validation"
node "$here/../webgl-probe.mjs" --self-test || status=1
exit "$status"
