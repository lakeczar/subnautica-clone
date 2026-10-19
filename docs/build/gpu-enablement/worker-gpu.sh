#!/usr/bin/env bash
# The guest side of the RTX 3090 change, run on factory-worker as user worker.
#
#   bash worker-gpu.sh check pre               read-only: ready for the host's cold change?
#   bash worker-gpu.sh check post [report.json] read-only: GPU, driver, services, and the WebGL probe report
#   bash worker-gpu.sh install [--apply]        dry run by default; --apply adds contrib/non-free and the driver (sudo)
#   bash worker-gpu.sh uninstall [--apply]      dry run by default; --apply removes exactly what install added (sudo)
#
# Graphics only: kernel module (DKMS, Debian 13's 550.163.01), EGL/GLES/Vulkan userspace
# and nvidia-smi. No Xorg, no CUDA toolkit. Headers are pinned to the running kernel so
# that the install does not also bring a kernel upgrade (linux-headers-amd64 would).
# Prints PASS/WARN/FAIL lines; exits 1 if any FAIL.
set -uo pipefail

KVER="$(uname -r)"
SOURCES=/etc/apt/sources.list.d/siltwake-gpu-nonfree.sources
STATE_DIR=/var/lib/siltwake-gpu
PACKAGES="linux-headers-$KVER nvidia-kernel-dkms nvidia-driver-libs libgles-nvidia2 libegl-nvidia0 nvidia-vulkan-icd nvidia-smi"
DRIVER=550.163.01
SERVICES="t3code fleet-dashboard-v2 fleet-dashboard fleet-status"
# The services listen on the tailnet address only.
TAILNET_NAME=factory-worker.tail6b68aa.ts.net
ENDPOINTS="http://$TAILNET_NAME:9100/ http://$TAILNET_NAME:9110/api/health http://$TAILNET_NAME:9101/status"
fails=0

pass() { echo "PASS $*"; }
warn() { echo "WARN $*"; }
fail() { echo "FAIL $*"; fails=$((fails + 1)); }
check() { local msg="$1"; shift; if "$@" > /dev/null 2>&1; then pass "$msg"; else fail "$msg"; fi; }

services() {
  local s u
  for s in $SERVICES; do
    [ "$(systemctl --user is-active "$s" 2>/dev/null)/$(systemctl --user is-enabled "$s" 2>/dev/null)" = active/enabled ] \
      && pass "user service $s active and enabled" || fail "user service $s is not active and enabled"
  done
  [ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" = yes ] && pass "linger on" || fail "linger is off"
  for u in $ENDPOINTS; do check "$u answers" curl -fsS -m 5 -o /dev/null "$u"; done
}

driver_installed() {
  local p
  for p in $PACKAGES; do dpkg-query -W -f='${Status}' "$p" 2>/dev/null | grep -q 'install ok installed' || { fail "package $p is not installed"; return; }; done
  pass "driver packages installed ($PACKAGES)"
  modinfo -k "$KVER" -F vermagic nvidia-current 2>/dev/null | grep -q "^$KVER " \
    && pass "nvidia module built for the running kernel $KVER" || fail "no nvidia module for the running kernel $KVER (dkms status)"
  check "NVIDIA EGL vendor file present" test -f /usr/share/glvnd/egl_vendor.d/10_nvidia.json
  check "NVIDIA Vulkan ICD present" test -n "$(ls /usr/share/vulkan/icd.d/nvidia_icd*.json 2>/dev/null)"
  modprobe -c 2>/dev/null | grep -q '^blacklist nouveau' && pass "nouveau blacklisted" || fail "nouveau is not blacklisted"
  # The kernel the next boot picks must have the module too.
  local newest; newest="$(ls /boot/vmlinuz-* 2>/dev/null | sed 's#/boot/vmlinuz-##' | sort -V | tail -1)"
  [ "$newest" = "$KVER" ] && pass "next boot uses the running kernel $KVER" \
    || { modinfo -k "$newest" nvidia-current > /dev/null 2>&1 && pass "next boot kernel $newest has the module" || fail "next boot kernel $newest has no nvidia module"; }
}

check_pre() {
  echo "== factory-worker before the host change ($(date -u +%FT%TZ), boot $(cat /proc/sys/kernel/random/boot_id))"
  driver_installed
  # The 2026-10-19 shutdown hang: PID 1 blocked in the qxl DRM console path after
  # days of TTM eviction failures. Today qxl is not loaded (module_blacklist=qxl).
  local ttm hung
  grep -qw 'module_blacklist=qxl' /proc/cmdline && ! lsmod | grep -q '^qxl ' && pass "qxl DRM driver not loaded (module_blacklist=qxl)" \
    || warn "qxl DRM driver may be loaded; the observed shutdown hang path is possible"
  ttm="$(sudo -n journalctl -k -b 0 --no-pager 2>/dev/null | grep -c 'Buffer eviction failed')"
  hung="$(sudo -n journalctl -k -b 0 --no-pager 2>/dev/null | grep -c 'blocked for more than')"
  [ "${ttm:-x}" = 0 ] && [ "${hung:-x}" = 0 ] && pass "this boot: no TTM eviction failures, no hung tasks" \
    || fail "this boot: ${ttm:-?} TTM eviction failures, ${hung:-?} hung-task reports; do not start a shutdown"
  systemctl is-active qemu-guest-agent > /dev/null && pass "qemu-guest-agent active" || fail "qemu-guest-agent is not active"
  [ "$(df -Pk / | awk 'NR==2 {print $4}')" -gt 2097152 ] && pass "more than 2 GiB free on /" || fail "less than 2 GiB free on /"
  lspci -d 10de: | grep -q . && warn "an NVIDIA device is already present" || pass "no NVIDIA device yet (expected before the change)"
  services
}

check_post() {
  local report="${1:-}" fb
  echo "== factory-worker after the host change ($(date -u +%FT%TZ), boot $(cat /proc/sys/kernel/random/boot_id))"
  lspci -nnk -d 10de:2204 | grep -q 'Kernel driver in use: nvidia' && pass "RTX 3090 present, driver nvidia: $(lspci -s "$(lspci -d 10de:2204 | cut -d' ' -f1)")" \
    || fail "RTX 3090 not present with the nvidia driver: $(lspci -nnk -d 10de: | tr '\n' ' ')"
  lsmod | grep -q '^nouveau ' && fail "nouveau is loaded" || pass "nouveau not loaded"
  local smi; smi="$(nvidia-smi --query-gpu=name,driver_version,pci.bus_id,memory.total --format=csv,noheader 2>&1)"
  grep -q "RTX 3090, $DRIVER" <<<"$smi" && pass "nvidia-smi: $smi" || fail "nvidia-smi: $smi"
  [ -r /dev/nvidia0 ] && [ -w /dev/nvidia0 ] && [ -w /dev/nvidiactl ] && pass "/dev/nvidia0 and /dev/nvidiactl usable by $USER" || fail "/dev/nvidia* missing or not usable by $USER"
  sudo -n journalctl -k -b 0 --no-pager 2>/dev/null | grep -i -E 'NVRM: .*(fail|error|invalid)|BAR [0-9].*(no space|failed)' | head -5 | sed 's/^/     | /'
  # The VNC console: does the EFI framebuffer still sit on QXL (00:1e.0)?
  fb="$(basename "$(readlink -f /sys/class/graphics/fb0/device 2>/dev/null)" 2>/dev/null)"
  case "$fb" in *00:1e.0) pass "console framebuffer still on QXL ($fb)" ;; "") warn "no framebuffer device found; check the VNC console" ;;
    *) warn "console framebuffer moved to $fb; the Unraid VNC console may be blank (owner decision: <rom bar='off'/> on the GPU)" ;; esac
  [ "$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)" -gt 16000000 ] && pass "MemTotal $(awk '/^MemTotal:/ {print $2}' /proc/meminfo) kB" || fail "MemTotal dropped"
  services
  if [ -n "$report" ]; then
    grep -q '"verdict": "accelerated"' "$report" && pass "WebGL probe: $(grep -m1 '"chosen"' "$report" | tr -d ' ,') accelerated with smoke ($report)" \
      || fail "WebGL probe report does not say accelerated: $(grep -m1 '"verdict"' "$report")"
  else warn "no WebGL probe report given; browser acceleration not checked"; fi
}

cmd_install() {
  local apply="${1:-}" before after
  echo "Would write $SOURCES:"; sources_text | sed 's/^/    /'
  echo "Then: apt-get update; apt-get install --no-install-recommends $PACKAGES"
  echo "Expected: 38 new packages, about 138 MiB download (simulated 2026-10-19), no kernel, Xorg or CUDA change."
  [ "$apply" = --apply ] || { echo "Dry run. Add --apply to do it (needs sudo; no reboot; the module loads once the GPU is attached)."; return 0; }
  sudo install -d -m 755 "$STATE_DIR" || return 1
  [ -f "$STATE_DIR/before.txt" ] || dpkg-query -W -f='${Package}\n' | sort | sudo tee "$STATE_DIR/before.txt" > /dev/null
  sources_text | sudo tee "$SOURCES" > /dev/null || return 1
  sudo apt-get update || return 1
  sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $PACKAGES || return 1
  dpkg-query -W -f='${Package}\n' | sort > /work/tmp/siltwake-gpu-after.txt
  comm -13 "$STATE_DIR/before.txt" /work/tmp/siltwake-gpu-after.txt | sudo tee "$STATE_DIR/added.txt" > /dev/null
  echo "Added $(wc -l < "$STATE_DIR/added.txt") packages (list in $STATE_DIR/added.txt)."
  driver_installed
}

cmd_uninstall() {
  local apply="${1:-}"
  [ -f "$STATE_DIR/added.txt" ] || { echo "nothing recorded in $STATE_DIR/added.txt; nothing to remove"; return 0; }
  echo "Would purge: $(paste -sd' ' "$STATE_DIR/added.txt")"; echo "and remove $SOURCES, then apt-get update."
  lspci -d 10de: | grep -q . && echo "Note: the GPU is still attached; detach it on the host first (ask-command.sh detach)."
  [ "$apply" = --apply ] || { echo "Dry run. Add --apply to do it."; return 0; }
  # shellcheck disable=SC2046
  sudo env DEBIAN_FRONTEND=noninteractive apt-get purge -y $(cat "$STATE_DIR/added.txt") && sudo rm -f "$SOURCES" && sudo apt-get update \
    && sudo mv "$STATE_DIR" "$STATE_DIR.removed-$(date -u +%Y%m%dT%H%M%SZ)"
}

sources_text() {
  cat <<'EOF'
# Added for the RTX 3090 (docs/build/gpu-enablement): NVIDIA's driver is in non-free,
# nvidia-installer-cleanup in contrib. main and non-free-firmware stay in sources.list.
Types: deb
URIs: http://deb.debian.org/debian/
Suites: trixie trixie-updates
Components: contrib non-free
Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg

Types: deb
URIs: http://security.debian.org/debian-security/
Suites: trixie-security
Components: contrib non-free
Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg
EOF
}

case "${1:-} ${2:-}" in
  "check pre") check_pre ;;
  "check post") check_post "${3:-}" ;;
  install*) cmd_install "${2:-}"; exit $? ;;
  uninstall*) cmd_uninstall "${2:-}"; exit $? ;;
  *) echo "usage: worker-gpu.sh check pre | check post [report.json] | install [--apply] | uninstall [--apply]" >&2; exit 2 ;;
esac
echo "== $([ "$fails" = 0 ] && echo "all checks pass" || echo "$fails check(s) FAILED")"
[ "$fails" = 0 ]
