#!/usr/bin/env bash
# The guest side of the RTX 3090 change, run on factory-worker as user worker.
#
#   bash worker-gpu.sh check pre                         read-only: ready for the host's cold change?
#   bash worker-gpu.sh check post REPORT --commit SHA    read-only: GPU, driver, services, and the probe's game-smoke report
#   bash worker-gpu.sh install                           read-only plan, simulated in a private apt directory (no root)
#   bash worker-gpu.sh install --apply                   add contrib/non-free and the driver (sudo), recording the transaction
#   bash worker-gpu.sh undo-plan                         read-only: the exact, simulated removal of what install added
#
# Graphics only: kernel module (DKMS, Debian 13's 550.163.01), EGL/GLES/Vulkan userspace
# and nvidia-smi. No Xorg, no CUDA toolkit. Headers are pinned to the running kernel so
# the install does not also bring a kernel upgrade (linux-headers-amd64 would).
#
# What install owns is what its own recorded apt plans newly installed, never a
# machine-wide difference. A plan that would remove or upgrade anything, or pull in a
# kernel, Xorg or CUDA, is refused before anything is installed. Undo is a printed,
# simulated plan that an operator runs by hand; nothing here purges packages.
# Prints PASS/WARN/FAIL lines. Exit status: 0 only when every check passed.
set -uo pipefail

KVER="${GPU_KVER:-$(uname -r)}"
# GPU_* overrides exist for the offline tests only.
CMDLINE="${GPU_CMDLINE:-/proc/cmdline}"
GRUB_FILE="${GPU_GRUB_DEFAULT:-/etc/default/grub}"
SOURCES="${GPU_SOURCES:-/etc/apt/sources.list.d/siltwake-gpu-nonfree.sources}"
STATE_DIR="${GPU_STATE_DIR:-/var/lib/siltwake-gpu}"
GLVND_DIR="${GPU_GLVND_DIR:-/usr/share/glvnd/egl_vendor.d}"
VULKAN_DIR="${GPU_VULKAN_DIR:-/usr/share/vulkan/icd.d}"
BOOT_DIR="${GPU_BOOT_DIR:-/boot}"
DEV_DIR="${GPU_DEV_DIR:-/dev}"
FB_DEVICE="${GPU_FB_DEVICE:-/sys/class/graphics/fb0/device}"
BOOT_ID_FILE="${GPU_BOOT_ID_FILE:-/proc/sys/kernel/random/boot_id}"
PCI_DIR="${GPU_PCI_DIR:-/sys/bus/pci/devices}"
IOMEM_FILE="${GPU_IOMEM_FILE:-/proc/iomem}"
FWCFG_FILE="${GPU_FWCFG_FILE:-/sys/firmware/qemu_fw_cfg/by_name/opt/ovmf/X-PciMmio64Mb/raw}"
SCRATCH="${GPU_SCRATCH:-/work/tmp}"
PROBE="$(cd "$(dirname "$0")" && pwd)/webgl-probe.mjs"
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
# section: run a group of checks; its status is 0 only if none of them failed.
section() { local before=$fails; "$@"; [ "$fails" -eq "$before" ]; }

services() {
  local s u
  for s in $SERVICES; do
    [ "$(systemctl --user is-active "$s" 2>/dev/null)/$(systemctl --user is-enabled "$s" 2>/dev/null)" = active/enabled ] \
      && pass "user service $s active and enabled" || fail "user service $s is not active and enabled"
  done
  [ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" = yes ] && pass "linger on" || fail "linger is off or unreadable"
  for u in $ENDPOINTS; do check "$u answers" curl -fsS -m 5 -o /dev/null "$u"; done
}

# Package names contain '+' and '.', so they are only ever compared as exact fields.
plan_has() { awk -v p="$2" '$1 == "Inst" && $2 == p {f = 1} END {exit !f}' <<<"$1"; }       # <plan> <pkg>
tsv_has() { awk -F'\t' -v p="$1" -v v="${3:-}" '$1 == p && (v == "" || $2 == v) {f = 1} END {exit !f}' "$2"; }  # <pkg> <file> [version]
line_has() { awk -v p="$1" '$0 == p {f = 1} END {exit !f}' "$2"; }                              # <line> <file>
installed_version() { dpkg-query -W -f='${db:Status-Abbrev}\t${Version}' "$1" 2>/dev/null | awk -F'\t' '$1 ~ /^ii/ {print $2}'; }
# A package dpkg holds as pending (unpacked, half-configured, half-installed, awaiting
# triggers: iU iF iH iW it), e.g. after a failed DKMS build: "<status> <version>".
pending_status() { dpkg-query -W -f='${db:Status-Abbrev}\t${Version}' "$1" 2>/dev/null | awk -F'\t' '$1 ~ /^i[UFHWt]/ {sub(/ +$/, "", $1); print $1, $2}'; }
present_version() { local v; v="$(installed_version "$1")"; [ -n "$v" ] || v="$(pending_status "$1" | cut -d' ' -f2)"; printf '%s' "$v"; }

driver_installed() {
  local p missing="" mods newest
  for p in $PACKAGES; do [ -n "$(installed_version "$p")" ] || missing="$missing $p"; done
  [ -z "$missing" ] && pass "driver packages installed ($PACKAGES)" || fail "packages not installed:$missing"
  mods="$(modinfo -k "$KVER" -F vermagic nvidia-current 2>/dev/null)"
  [ "${mods%% *}" = "$KVER" ] && pass "nvidia module built for the running kernel $KVER" || fail "no nvidia module for the running kernel $KVER (see dkms status)"
  check "NVIDIA EGL vendor file present" test -s "$GLVND_DIR/10_nvidia.json"
  check "NVIDIA Vulkan ICD present" test -n "$(ls "$VULKAN_DIR"/nvidia_icd*.json 2>/dev/null)"
  local conf; if conf="$(modprobe -c 2>/dev/null)" && grep -q '^blacklist nouveau' <<<"$conf"; then pass "nouveau blacklisted"; else fail "nouveau is not blacklisted (or modprobe -c failed)"; fi
  # The kernel the next boot picks must have the module too.
  newest="$(ls "$BOOT_DIR"/vmlinuz-* 2>/dev/null | sed 's#.*/vmlinuz-##' | sort -V | tail -1)"
  if [ -z "$newest" ]; then fail "no kernels found in $BOOT_DIR"
  elif [ "$newest" = "$KVER" ]; then pass "next boot uses the running kernel $KVER"
  else mods="$(modinfo -k "$newest" -F vermagic nvidia-current 2>/dev/null)"; [ "${mods%% *}" = "$newest" ] && pass "next boot kernel $newest has the module" || fail "next boot kernel $newest has no nvidia module"; fi
}

# The 2026-10-19 shutdown hang: PID 1 blocked in the qxl DRM console path after days of
# TTM eviction failures. The recovery's fix is module_blacklist=qxl, on the running kernel
# and in GRUB for the next boot. This script only checks it; it never edits it.
qxl_and_journal() {
  local cmd grub mods jrn ttm hung
  if ! cmd="$(cat "$CMDLINE" 2>/dev/null)"; then fail "cannot read $CMDLINE"
  elif grep -qw 'module_blacklist=qxl' <<<"$cmd"; then pass "running kernel has module_blacklist=qxl"
  else fail "module_blacklist=qxl is not on the running kernel's command line"; fi
  if ! grub="$(grep -E '^GRUB_CMDLINE_LINUX(_DEFAULT)?=' "$GRUB_FILE" 2>/dev/null)"; then fail "cannot read GRUB_CMDLINE_LINUX* from $GRUB_FILE"
  elif grep -qw 'module_blacklist=qxl' <<<"$grub"; then pass "next boot keeps module_blacklist=qxl ($GRUB_FILE)"
  else fail "module_blacklist=qxl is missing from $GRUB_FILE; the next boot would load qxl"; fi
  if ! mods="$(lsmod 2>/dev/null)" || [ -z "$mods" ]; then fail "cannot read the loaded modules (lsmod)"
  elif grep -q '^qxl ' <<<"$mods"; then fail "the qxl DRM driver is loaded"
  else pass "qxl DRM driver not loaded"; fi
  # The kernel log of this boot must be readable and complete before its counts mean anything.
  if ! jrn="$(sudo -n journalctl -k -b 0 --no-pager -q 2>/dev/null)"; then fail "cannot read this boot's kernel journal (sudo journalctl failed)"; return
  elif ! grep -q 'Linux version' <<<"$jrn"; then fail "this boot's kernel journal does not start at boot (no 'Linux version' line)"; return; fi
  ttm="$(grep -c 'Buffer eviction failed' <<<"$jrn")"; hung="$(grep -c 'blocked for more than' <<<"$jrn")"
  [ "$ttm" = 0 ] && [ "$hung" = 0 ] && pass "this boot: no TTM eviction failures, no hung tasks" \
    || fail "this boot: $ttm TTM eviction failures, $hung hung-task reports; do not start a shutdown"
}

check_pre() {
  echo "== factory-worker before the host change ($(date -u +%FT%TZ), boot $(cat "$BOOT_ID_FILE" 2>/dev/null))"
  driver_installed
  qxl_and_journal
  [ "$(systemctl is-active qemu-guest-agent 2>/dev/null)" = active ] && pass "qemu-guest-agent active" || fail "qemu-guest-agent is not active"
  local free; free="$(df -Pk / 2>/dev/null | awk 'NR==2 {print $4}')"
  [[ "$free" =~ ^[0-9]+$ ]] && [ "$free" -gt 2097152 ] && pass "more than 2 GiB free on /" || fail "less than 2 GiB free on / (or df failed)"
  local pci; if ! pci="$(lspci -d 10de: 2>/dev/null)"; then fail "lspci failed"; elif [ -n "$pci" ]; then warn "an NVIDIA device is already present"; else pass "no NVIDIA device yet (expected before the change)"; fi
  services
}

# Resizable BAR: BAR1 is 32 GiB, so the host run enlarges OVMF's 64-bit window. Here BAR1
# must be assigned and lie inside a root bus window of this boot's /proc/iomem (read as
# root; unprivileged reads show zeros). QEMU's window starts at the lowest 64-bit BAR, so its
# size is not the configured 64 GiB; containment is what matters.
gpu_bars() {
  local d dev="" res=() start end flags iom line s e win=""
  for d in "$PCI_DIR"/*; do
    [ "$(cat "$d/vendor" 2>/dev/null):$(cat "$d/device" 2>/dev/null)" = 0x10de:0x2204 ] && { dev="$d"; break; }
  done
  [ -n "$dev" ] || { fail "no 10de:2204 function in $PCI_DIR"; return; }
  mapfile -t res < "$dev/resource" 2>/dev/null && [ ${#res[@]} -ge 3 ] || { fail "cannot read the BARs of $(basename "$dev")"; return; }
  read -r start end flags <<<"${res[1]}"
  [[ "$start $end $flags" =~ ^0x[0-9a-f]+\ 0x[0-9a-f]+\ 0x[0-9a-f]+$ ]] && [ "$((start))" -ne 0 ] && (( flags & 0x2000 )) \
    || { fail "BAR1 of $(basename "$dev") is not assigned ('${res[1]}')"; return; }
  if ! iom="$(sudo -n cat "$IOMEM_FILE" 2>/dev/null)" || [ -z "$iom" ]; then fail "cannot read $IOMEM_FILE as root"; return; fi
  while IFS= read -r line; do
    [[ "$line" =~ ^([0-9a-f]+)-([0-9a-f]+)\ :\ PCI\ Bus\ 0000:00$ ]] || continue
    s=$((16#${BASH_REMATCH[1]})); e=$((16#${BASH_REMATCH[2]}))
    (( s != 0 && s <= start && end <= e )) && win="${BASH_REMATCH[1]}-${BASH_REMATCH[2]} ($(( (e - s + 1) >> 30 )) GiB)"
  done <<<"$iom"
  local bar; bar="$(printf '%x-%x' "$start" "$end")"
  [ -n "$win" ] && pass "BAR1 $bar ($(( (end - start + 1) >> 20 )) MiB) assigned inside root window $win" \
    || fail "BAR1 $bar is not inside any 'PCI Bus 0000:00' window of $IOMEM_FILE"
  local fw; if fw="$(sudo -n cat "$FWCFG_FILE" 2>/dev/null)" && [ -n "$fw" ]; then pass "OVMF received X-PciMmio64Mb=$fw"
  else warn "fw_cfg X-PciMmio64Mb not visible in the guest (qemu_fw_cfg module not loaded?); the BAR1 check above is what counts"; fi
}

check_post() {
  local report="" commit="" fb pci smi
  while [ $# -gt 0 ]; do case "$1" in --commit) commit="${2:-}"; shift 2 ;; *) report="$1"; shift ;; esac; done
  echo "== factory-worker after the host change ($(date -u +%FT%TZ), boot $(cat "$BOOT_ID_FILE" 2>/dev/null))"
  if ! pci="$(lspci -nnk -d 10de:2204 2>/dev/null)"; then fail "lspci failed"
  elif grep -q 'Kernel driver in use: nvidia' <<<"$pci"; then pass "RTX 3090 present, driver nvidia: $(head -1 <<<"$pci")"
  else fail "RTX 3090 not present with the nvidia driver: $(tr '\n' ' ' <<<"$pci")"; fi
  gpu_bars
  local mods; if ! mods="$(lsmod 2>/dev/null)" || [ -z "$mods" ]; then fail "cannot read the loaded modules"; elif grep -q '^nouveau ' <<<"$mods"; then fail "nouveau is loaded"; else pass "nouveau not loaded"; fi
  if smi="$(nvidia-smi --query-gpu=name,driver_version,pci.bus_id,memory.total --format=csv,noheader 2>&1)" && grep -q "RTX 3090, $DRIVER" <<<"$smi"; then pass "nvidia-smi: $smi"; else fail "nvidia-smi: $smi"; fi
  [ -r "$DEV_DIR/nvidia0" ] && [ -w "$DEV_DIR/nvidia0" ] && [ -w "$DEV_DIR/nvidiactl" ] && pass "$DEV_DIR/nvidia0 and nvidiactl usable by $USER" || fail "$DEV_DIR/nvidia* missing or not usable by $USER"
  local klog; if klog="$(sudo -n journalctl -k -b 0 --no-pager -q 2>/dev/null)"; then
    grep -i -E 'NVRM: .*(fail|error|invalid)|BAR [0-9].*(no space|failed)' <<<"$klog" | head -5 | sed 's/^/     | /'
  else warn "cannot read this boot's kernel journal for NVRM/BAR messages"; fi
  qxl_and_journal
  # The VNC console: does the EFI framebuffer still sit on QXL (00:1e.0)?
  fb="$(basename "$(readlink -f "$FB_DEVICE" 2>/dev/null)" 2>/dev/null)"
  case "$fb" in *00:1e.0) pass "console framebuffer still on QXL ($fb)" ;; ""|.) warn "no framebuffer device found; check the VNC console" ;;
    *) warn "console framebuffer moved to $fb; the Unraid VNC console may be blank (owner decision: <rom bar='off'/> on the GPU)" ;; esac
  local mt; mt="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"; [ "${mt:-0}" -gt 16000000 ] && pass "MemTotal $mt kB" || fail "MemTotal ${mt:-unreadable} kB"
  services
  if [ -z "$report" ] || [ -z "$commit" ]; then fail "check post needs the probe's game-smoke report and --commit <source commit>"; return; fi
  local out; out="$(node "$PROBE" --validate "$report" --commit "$commit" --boot-id "$(cat "$BOOT_ID_FILE" 2>/dev/null)" --host "$(hostname)" 2>&1)"
  if [ $? -eq 0 ]; then pass "WebGL probe: $out"; else while IFS= read -r l; do fail "WebGL probe report: ${l#FAIL }"; done <<<"$out"; fi
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

# plan_check <apt simulation>: refuses removals, upgrades, and kernel/Xorg/CUDA packages,
# and requires every requested package to be installed by it, already installed, or pending
# at a version the plan only configures. Every "Conf" line must configure a package this plan
# installs or one pending at exactly that version (the repair of a failed configuration).
plan_check() {
  local plan="$1" bad=0 p v pend conf_bad="" repaired=""
  grep -qE '^(Remv|Purg) ' <<<"$plan" && { fail "the apt plan removes packages: $(grep -E '^(Remv|Purg) ' <<<"$plan" | awk '{print $2}' | paste -sd' ' -)"; bad=1; }
  grep -qE '^Inst [^ ]+ \[' <<<"$plan" && { fail "the apt plan upgrades installed packages: $(grep -E '^Inst [^ ]+ \[' <<<"$plan" | awk '{print $2}' | paste -sd' ' -)"; bad=1; }
  grep -qE '^Inst (linux-image|xserver|xorg|[^ ]*cuda)' <<<"$plan" && { fail "the apt plan pulls a kernel, Xorg or CUDA: $(grep -E '^Inst (linux-image|xserver|xorg|[^ ]*cuda)' <<<"$plan" | awk '{print $2}' | paste -sd' ' -)"; bad=1; }
  while read -r _ p v; do
    v="${v#(}"; v="${v%% *}"
    plan_has "$plan" "$p" && continue
    pend="$(pending_status "$p")"
    if [ -n "$pend" ] && [ "${pend#* }" = "$v" ]; then repaired="$repaired $p(${pend% *})"; else conf_bad="$conf_bad $p"; fi
  done < <(grep -E '^Conf ' <<<"$plan")
  [ -z "$conf_bad" ] || { fail "the apt plan configures packages it does not install and that are not pending at that version:$conf_bad"; bad=1; }
  for p in $PACKAGES; do
    plan_has "$plan" "$p" || [ -n "$(installed_version "$p")" ] || [[ " $repaired " == *" $p("* ]] || { fail "the apt plan does not install $p"; bad=1; }
  done
  [ "$bad" = 0 ] || return 1
  NEW_PKGS="$(grep -E '^Inst [^ ]+ \(' <<<"$plan" | awk '{print $2}' | sort)"
  pass "apt plan: $(grep -c '^Inst ' <<<"$plan") new packages, nothing removed or upgraded, no kernel/Xorg/CUDA${repaired:+; completes pending:$repaired}"
}

# Root-owned transaction records. Every write is checked.
rec_put() { printf '%s\n' "$2" | sudo tee "$STATE_DIR/$1" > /dev/null; }
rec_log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" | sudo tee -a "$STATE_DIR/log" > /dev/null || fail "cannot write $STATE_DIR/log"; }
snapshot() { dpkg-query -W -f='${binary:Package}\t${Version}\t${db:Status-Abbrev}\n' 2>/dev/null | sort; }

cmd_install() {
  local apply="${1:-}" plan tmp snap manual rc
  if [ "$apply" != --apply ]; then
    # A dry run sees what --apply would see: the system's sources plus ours, in a private apt directory.
    tmp="$(mktemp -d -p "$SCRATCH" siltwake-gpu-plan.XXXXXX)" || { fail "cannot create a scratch directory in $SCRATCH"; return 1; }
    mkdir -p "$tmp/lists/partial" "$tmp/cache/archives/partial" "$tmp/parts"
    cp /etc/apt/sources.list.d/*.sources /etc/apt/sources.list.d/*.list "$tmp/parts/" 2>/dev/null; sources_text > "$tmp/parts/siltwake-gpu-nonfree.sources"
    local o=(-o "Dir::State::Lists=$tmp/lists" -o "Dir::Cache=$tmp/cache" -o "Dir::Etc::SourceParts=$tmp/parts" -o Debug::NoLocking=1 -o APT::Get::List-Cleanup=0)
    apt-get "${o[@]}" -qq update > "$tmp/update.log" 2>&1 || { fail "private apt update failed ($tmp/update.log)"; return 1; }
    plan="$(apt-get "${o[@]}" -s install --no-install-recommends $PACKAGES 2>&1)" || { fail "apt simulation failed: $(tail -3 <<<"$plan")"; return 1; }
    printf '%s\n' "$plan" > "$tmp/plan.txt"; echo "Plan (simulated, nothing changed): $tmp/plan.txt"
    plan_check "$plan" || return 1
    echo "New: $(paste -sd' ' <<<"$NEW_PKGS")"
    echo "Would write $SOURCES (contrib non-free); --apply records the transaction in $STATE_DIR."
    return 0
  fi

  # 1. The sources file must be absent or exactly ours; anything else belongs to someone else.
  if [ -e "$SOURCES" ]; then
    if [ "$(cat "$SOURCES" 2>/dev/null)" = "$(sources_text)" ]; then pass "$SOURCES is already ours (re-entry)"
    else fail "$SOURCES exists with other content; it is not ours and is left alone. Nothing was changed"; return 1; fi
  fi
  # 2. Transaction records. The first attempt records the system as it was; a retry keeps it.
  sudo install -d -m 755 "$STATE_DIR" || { fail "cannot create $STATE_DIR"; return 1; }
  if [ ! -s "$STATE_DIR/before.tsv" ]; then
    snap="$(snapshot)" && [ -n "$snap" ] && grep -q $'\tii' <<<"$snap" || { fail "cannot read the installed packages (dpkg-query); nothing was changed"; return 1; }
    manual="$(apt-mark showmanual 2>/dev/null)" || { fail "cannot read apt's manual marks; nothing was changed"; return 1; }
    rec_put before.tsv "$snap" && rec_put manual-before.txt "$manual" || { fail "cannot write $STATE_DIR records; nothing was changed"; return 1; }
    [ -e "$SOURCES" ] && rec_put sources-preexisting "yes" || rec_put sources-preexisting "no"
    rec_log "started: recorded $(wc -l <<<"$snap") packages"
  else rec_log "re-entry: keeping before.tsv from the first attempt"; fi
  # 3. Our sources, then the real plan, checked before anything is installed.
  if [ ! -e "$SOURCES" ]; then
    sources_text | sudo tee "$SOURCES" > /dev/null && [ "$(cat "$SOURCES")" = "$(sources_text)" ] || { fail "cannot write $SOURCES"; rec_log "failed: sources"; return 1; }
    rec_log "wrote $SOURCES"
  fi
  sudo apt-get update || { fail "apt-get update failed"; rec_log "failed: apt-get update"; return 1; }
  plan="$(apt-get -s install --no-install-recommends $PACKAGES 2>&1)" || { fail "apt simulation failed: $(tail -3 <<<"$plan")"; rec_log "failed: simulation"; return 1; }
  local stamp; stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  rec_put "plan-$stamp.txt" "$plan" || { fail "cannot record the plan"; return 1; }
  plan_check "$plan" || { rec_log "refused: plan-$stamp.txt"; return 1; }
  # Ours: what one of our recorded plans newly installs (kept across retries).
  rec_put planned.txt "$(sort -u <(cat "$STATE_DIR/planned.txt" 2>/dev/null) <(printf '%s\n' "$NEW_PKGS") | sed '/^$/d')" || { fail "cannot record planned.txt"; return 1; }
  rec_log "installing per plan-$stamp.txt"
  # 4. Install exactly that, then record what is installed now, whatever happened.
  sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $PACKAGES; rc=$?
  snap="$(snapshot)" && [ -n "$snap" ] && rec_put "after-$stamp.tsv" "$snap" || fail "cannot record the packages after the install"
  if [ "$rc" != 0 ]; then
    fail "apt-get install failed (exit $rc); the partial state is in $STATE_DIR/after-$stamp.tsv. Fix the cause and run install --apply again, or see undo-plan"
    rec_log "failed: apt-get install exit $rc"; return 1
  fi
  # 5. Verify. A failed verification is a failed install.
  if section driver_installed; then rec_log "installed and verified"; return 0; fi
  rec_log "failed: verification"; fail "installed, but verification failed; see above, then run install --apply again"; return 1
}

# Read-only. Ours = in one of our recorded plans as a new package, absent before the first
# attempt, and still installed at the version our install left. The removal is simulated; it
# is refused if apt would also remove anything else.
cmd_undo_plan() {
  local ours="" p v after plan extra notours="" changed="" pend
  [ -s "$STATE_DIR/before.tsv" ] && [ -s "$STATE_DIR/planned.txt" ] || { fail "no recorded install in $STATE_DIR; nothing to undo"; return 1; }
  after="$(ls "$STATE_DIR"/after-*.tsv 2>/dev/null | sort | tail -1)"
  [ -n "$after" ] || { fail "no after-*.tsv record; the install never reached apt"; return 1; }
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    tsv_has "$p" "$STATE_DIR/before.tsv" && continue
    v="$(present_version "$p")"; [ -n "$v" ] || continue
    pend="$(pending_status "$p")"
    if tsv_has "$p" "$after" "$v"; then
      ours="$ours $p"; [ -z "$pend" ] || warn "pending: $p (${pend% *}): not fully configured; included in the removal below"
    else
      changed="$changed $p"; [ -z "$pend" ] || warn "pending: $p (${pend% *}) at another version than our install; left alone"
    fi
  done < "$STATE_DIR/planned.txt"
  while IFS=$'\t' read -r p v _; do
    tsv_has "$p" "$STATE_DIR/before.tsv" || line_has "$p" "$STATE_DIR/planned.txt" || notours="$notours $p"
  done < "$after"
  [ -z "$notours" ] || warn "installed since the first attempt but not by our plans, left alone:$notours"
  [ -z "$changed" ] || warn "ours but changed since our install, left alone:$changed"
  [ -n "$ours" ] || { pass "nothing of ours is installed"; return 0; }
  plan="$(apt-get -s purge $ours 2>&1)" || { fail "apt simulation of the removal failed: $(tail -3 <<<"$plan")"; return 1; }
  extra="$(grep -E '^(Remv|Purg) ' <<<"$plan" | awk '{print $2}' | grep -vxF -f <(tr ' ' '\n' <<<"$ours" | sed '/^$/d') | paste -sd' ' -)"
  [ -z "$extra" ] || { fail "removing ours would also remove: $extra. Do not run it; inspect by hand"; return 1; }
  pass "removal simulated: only our$(wc -w <<<"$ours") packages"
  echo "To undo (detach the GPU on the host first), run by hand:"
  echo "  sudo apt-get purge$ours"
  for p in $PACKAGES; do
    tsv_has "$p" "$STATE_DIR/before.tsv" && ! line_has "$p" "$STATE_DIR/manual-before.txt" && echo "  sudo apt-mark auto $p"
  done
  if [ "$(cat "$STATE_DIR/sources-preexisting" 2>/dev/null)" = no ] && [ "$(cat "$SOURCES" 2>/dev/null)" = "$(sources_text)" ]; then
    echo "  sudo rm $SOURCES && sudo apt-get update"
  else echo "  ($SOURCES was not created by install, or has changed; leave it)"; fi
}

case "${1:-} ${2:-}" in
  "check pre") check_pre ;;
  "check post") shift 2; check_post "$@" ;;
  install*) cmd_install "${2:-}" || { echo "== install FAILED"; exit 1; } ;;
  undo-plan*) cmd_undo_plan || { echo "== undo-plan FAILED"; exit 1; } ;;
  *) echo "usage: worker-gpu.sh check pre | check post REPORT --commit SHA | install [--apply] | undo-plan" >&2; exit 2 ;;
esac
echo "== $([ "$fails" = 0 ] && echo "all checks pass" || echo "$fails check(s) FAILED")"
[ "$fails" = 0 ]
