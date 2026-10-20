# Runs inside bwrap with no network (see run.sh): the fake tools are first on PATH, $GF is
# their state, and worker-gpu.sh's paths point into $GF through its GPU_* overrides.
set -u
SRC="${SRC:?}"
GF=/tmp/guest-fake; export GF
W="$SRC/worker-gpu.sh"
KV=6.12.111+deb13-amd64
PKGS="linux-headers-$KV nvidia-kernel-dkms nvidia-driver-libs libgles-nvidia2 libegl-nvidia0 nvidia-vulkan-icd nvidia-smi"
pass=0 fail=0
ok()  { echo "ok   $*"; pass=$((pass + 1)); }
bad() { echo "FAIL $*"; fail=$((fail + 1)); }
is()  { local name="$1"; shift; if "$@"; then ok "$name"; else bad "$name"; [ -n "${OUT:-}" ] && printf '%s\n' "$OUT" | tail -n 12 | sed 's/^/     | /'; fi; }
called()     { grep -Eq -- "$1" "$GF/calls.log"; }
not_called() { ! grep -Eq -- "$1" "$GF/calls.log"; }
run() { OUT="$(bash "$W" "$@" 2>&1)"; RC=$?; }

for t in sudo apt-get apt-mark dpkg-query journalctl lsmod modinfo modprobe lspci nvidia-smi systemctl loginctl curl df; do
  [ "$(command -v "$t")" = "/tmp/fakebin/$t" ] || { echo "FAIL fake $t not selected (PATH=$PATH)"; echo; echo "passed 0"; echo "failed 1"; exit 1; }
done
ok "fake guest tools selected first on PATH"

export GPU_KVER=$KV GPU_CMDLINE="$GF/cmdline" GPU_GRUB_DEFAULT="$GF/grub" GPU_SOURCES="$GF/apt/siltwake-gpu-nonfree.sources" \
  GPU_STATE_DIR="$GF/state" GPU_GLVND_DIR="$GF/glvnd" GPU_VULKAN_DIR="$GF/vulkan" GPU_BOOT_DIR="$GF/boot" GPU_DEV_DIR="$GF/dev" \
  GPU_FB_DEVICE="$GF/fb0-device" GPU_BOOT_ID_FILE="$GF/boot_id" GPU_SCRATCH="$GF/scratch" \
  GPU_PCI_DIR="$GF/pci" GPU_IOMEM_FILE="$GF/iomem" GPU_FWCFG_FILE="$GF/fwcfg-raw"

# The worker as it is today, plus a driver already installed (for the checks) unless bare=1.
reset_guest() {
  rm -rf "$GF"; mkdir -p "$GF/apt" "$GF/glvnd" "$GF/vulkan" "$GF/boot" "$GF/dev" "$GF/scratch" "$GF/devices/0000:00:1e.0"
  printf 'base-files\t13.7\tii \nlibc6\t2.41-12\tii \nlinux-image-%s\t6.12.111-1\tii \n' "$KV" > "$GF/db.tsv"
  printf 'base-files\nlibc6\n' > "$GF/manual.txt"
  printf 'nvidia-installer-cleanup\ndkms\nfirmware-nvidia-gsp\nnvidia-kernel-support\n' > "$GF/deps.txt"
  echo "BOOT_IMAGE=/boot/vmlinuz-$KV root=UUID=x ro quiet module_blacklist=qxl" > "$GF/cmdline"
  printf 'GRUB_DEFAULT=0\nGRUB_CMDLINE_LINUX_DEFAULT="quiet module_blacklist=qxl"\nGRUB_CMDLINE_LINUX=""\n' > "$GF/grub"
  printf 'Oct 19 16:27:46 factory-worker kernel: Linux version %s\nOct 19 16:27:47 factory-worker kernel: Command line: quiet module_blacklist=qxl\n' "$KV" > "$GF/journal.txt"
  printf 'Module Size Used by\ndrm 774144 3\nttm 102400 1\n' > "$GF/lsmod.txt"
  touch "$GF/boot/vmlinuz-$KV"; echo c64c4bcb-e6fb-47dd-a050-571f3bf86a14 > "$GF/boot_id"
  ln -s "$GF/devices/0000:00:1e.0" "$GF/fb0-device"
  : > "$GF/modprobe.txt"; : > "$GF/calls.log"
  [ "${bare:-0}" = 1 ] && return
  for p in $PKGS nvidia-installer-cleanup dkms firmware-nvidia-gsp nvidia-kernel-support; do printf '%s\t1.0-1\tii \n' "$p" >> "$GF/db.tsv"; done
  echo '{}' > "$GF/glvnd/10_nvidia.json"; echo '{}' > "$GF/vulkan/nvidia_icd.json"; echo 'blacklist nouveau' > "$GF/modprobe.txt"; touch "$GF/modules_built"
}
# What install --apply leaves behind on a working system: the userspace files appear and the module builds.
installs_driver() { echo '{}' > "$GF/glvnd/10_nvidia.json"; echo '{}' > "$GF/vulkan/nvidia_icd.json"; echo 'blacklist nouveau' > "$GF/modprobe.txt"; touch "$GF/modules_built"; }

echo "== check pre"
reset_guest; run check pre
is "ready worker: check pre passes" [ "$RC" = 0 ]

echo "== R1-05: a failed verification is a failed exit"
bare=1 reset_guest; run check pre
is "driver missing: check pre exits 1" [ "$RC" = 1 ]
is "driver missing: says which packages" grep -q "packages not installed: linux-headers-$KV" <<<"$OUT"
bare=1 reset_guest; run install --apply
is "apt succeeds but the module did not build: install exits 1" [ "$RC" = 1 ]
is "verification failure recorded" grep -q 'failed: verification' "$GF/state/log"

echo "== R1-09: the shutdown gate needs readable evidence and the QXL fix"
gate() { # <name> <expected FAIL text>
  run check pre
  is "$1: check pre exits 1" [ "$RC" = 1 ]
  is "$1: FAIL says why" grep -q "^FAIL .*$2" <<<"$OUT"
  is "$1: never claims a clean boot" eval '! grep -q "PASS this boot: no TTM" <<<"$OUT"'
}
reset_guest; touch "$GF/journal_fail"; gate "journal unreadable" "cannot read this boot's kernel journal"
reset_guest; echo "Oct 19 17:00:00 factory-worker kernel: something" > "$GF/journal.txt"; gate "journal truncated (no boot start)" "does not start at boot"
reset_guest; printf 'Oct 19 16:27:46 factory-worker kernel: Linux version x\nkernel: [TTM] Buffer eviction failed\n' > "$GF/journal.txt"; run check pre
is "TTM failures in this boot: FAIL, exit 1" eval '[ "$RC" = 1 ] && grep -q "^FAIL this boot: 1 TTM" <<<"$OUT"'
reset_guest; echo "BOOT_IMAGE=/boot/vmlinuz-$KV ro quiet" > "$GF/cmdline"; run check pre
is "qxl not blacklisted on the running kernel: FAIL, exit 1" eval '[ "$RC" = 1 ] && grep -q "^FAIL module_blacklist=qxl is not on the running" <<<"$OUT"'
reset_guest; sed -i 's/ module_blacklist=qxl//' "$GF/grub"; run check pre
is "qxl blacklist missing for the next boot: FAIL, exit 1" eval '[ "$RC" = 1 ] && grep -q "^FAIL module_blacklist=qxl is missing from" <<<"$OUT"'
reset_guest; echo "qxl 77824 0" >> "$GF/lsmod.txt"; run check pre
is "qxl loaded: FAIL, exit 1" eval '[ "$RC" = 1 ] && grep -q "^FAIL the qxl DRM driver is loaded" <<<"$OUT"'
reset_guest; touch "$GF/lsmod_fail"; run check pre
is "lsmod unreadable: FAIL, exit 1" eval '[ "$RC" = 1 ] && grep -q "^FAIL cannot read the loaded modules" <<<"$OUT"'
is "the gate never edits the QXL fix" eval 'grep -q module_blacklist=qxl "$GF/grub" && not_called "sed|update-grub"'

echo "== R1-04: install owns only what its own plans installed"
bare=1 reset_guest; echo "# operator's own file" > "$GF/apt/siltwake-gpu-nonfree.sources"; run install --apply
is "pre-existing sources file with other content: refused, exit 1" [ "$RC" = 1 ]
is "pre-existing sources file kept byte for byte" grep -qx "# operator's own file" "$GF/apt/siltwake-gpu-nonfree.sources"
is "pre-existing sources file: no apt call, no records" eval 'not_called "^apt-get" && [ ! -e "$GF/state" ]'

bare=1 reset_guest; touch "$GF/dpkg_fail"; run install --apply
is "first snapshot fails: refused before any change" eval '[ "$RC" = 1 ] && [ ! -e "$GF/apt/siltwake-gpu-nonfree.sources" ] && not_called "^apt-get"'
is "first snapshot fails: no before.tsv that could later misattribute packages" [ ! -s "$GF/state/before.tsv" ]

bare=1 reset_guest; echo "Remv libc6 [2.41-12]" > "$GF/sim_extra"; run install --apply
is "plan removes a package: refused, nothing installed" eval '[ "$RC" = 1 ] && not_called "^apt-get install -y"'
is "refused plan recorded" eval 'ls "$GF/state"/plan-*.txt > /dev/null 2>&1 && grep -q "refused" "$GF/state/log"'
bare=1 reset_guest; echo "Inst libc6 [2.41-12] (2.41-13 Debian:13.7/stable [amd64])" > "$GF/sim_extra"; run install --apply
is "plan upgrades a package: refused" eval '[ "$RC" = 1 ] && not_called "^apt-get install -y" && grep -q "upgrades installed packages: libc6" <<<"$OUT"'
bare=1 reset_guest; echo "Inst linux-image-6.12.113+deb13-amd64 (6.12.113-1 Debian:13.7/stable [amd64])" > "$GF/sim_extra"; run install --apply
is "plan pulls a kernel: refused" eval '[ "$RC" = 1 ] && grep -q "pulls a kernel, Xorg or CUDA" <<<"$OUT"'

bare=1 reset_guest; echo 3 > "$GF/install_partial"; run install --apply
is "partial install: exit 1" [ "$RC" = 1 ]
is "partial install: the partial state is recorded" eval 'ls "$GF/state"/after-*.tsv > /dev/null 2>&1 && grep -q "failed: apt-get install" "$GF/state/log"'
run undo-plan
is "undo-plan after a partial install: offers exactly the 3 installed packages" eval '[ "$RC" = 0 ] && [ "$(grep "sudo apt-get purge" <<<"$OUT" | wc -w)" = 6 ]'
is "undo-plan never purges by itself" not_called 'FORBIDDEN real purge'
# Retry: meanwhile someone installs an unrelated package.
rm "$GF/install_partial"; echo unrelated-concurrent-package > "$GF/install_also"; installs_driver
first_before="$(sha256sum < "$GF/state/before.tsv")"; run install --apply
is "retry after the partial install: exit 0" [ "$RC" = 0 ]
is "retry keeps the first attempt's before.tsv" [ "$(sha256sum < "$GF/state/before.tsv")" = "$first_before" ]
rm -f "$GF/install_also"; run undo-plan
is "undo-plan excludes the unrelated package (R1-04 case)" eval '[ "$RC" = 0 ] && ! grep "sudo apt-get purge" <<<"$OUT" | grep -q unrelated-concurrent-package'
is "undo-plan names it as not ours" grep -q 'not by our plans, left alone: unrelated-concurrent-package' <<<"$OUT"
is "undo-plan offers every package our plans installed" eval '( for p in $PKGS nvidia-installer-cleanup dkms; do grep "sudo apt-get purge" <<<"$OUT" | grep -qwF -- "$p" || exit 1; done )'
is "undo-plan removes our sources file only because install created it" grep -q "sudo rm $GF/apt/siltwake-gpu-nonfree.sources" <<<"$OUT"
echo unrelated-dependent > "$GF/purge_extra"; run undo-plan
is "removal that would take another package: refused, no command printed" eval '[ "$RC" = 1 ] && ! grep -q "sudo apt-get purge" <<<"$OUT" && grep -q "would also remove: unrelated-dependent" <<<"$OUT"'
rm "$GF/purge_extra"; printf 'nvidia-smi\t2.0-1\tii \n' >> "$GF/db.tsv"; sed -i '/^nvidia-smi\t1.0-1/d' "$GF/db.tsv"; run undo-plan
is "a package of ours upgraded since: left alone and named" eval 'grep -q "changed since our install, left alone: nvidia-smi" <<<"$OUT" && ! grep "sudo apt-get purge" <<<"$OUT" | grep -qw nvidia-smi'

bare=1 reset_guest; printf 'linux-headers-%s\t6.12.111-1\tii \n' "$KV" >> "$GF/db.tsv"; installs_driver; run install --apply
is "header package already installed (auto): install exit 0" [ "$RC" = 0 ]
run undo-plan
is "already-installed headers are not purged, and their auto mark is restored" eval '! grep "sudo apt-get purge" <<<"$OUT" | grep -qw "linux-headers-$KV" && grep -q "sudo apt-mark auto linux-headers-$KV" <<<"$OUT"'
run install --apply
is "second --apply on an installed system: exit 0, sources accepted as ours" eval '[ "$RC" = 0 ] && grep -q "already ours (re-entry)" <<<"$OUT"'

echo "== R2-02: a failed configuration is repaired by the retry"
bare=1 reset_guest; echo nvidia-kernel-dkms > "$GF/config_fail"; run install --apply
is "DKMS configuration fails: install exits 1" [ "$RC" = 1 ]
is "dpkg leaves nvidia-kernel-dkms half-configured (iF)" eval 'grep -q "^nvidia-kernel-dkms	1.0-1	iF " "$GF/db.tsv"'
run undo-plan
is "undo-plan lists the pending package" eval 'grep -q "pending: nvidia-kernel-dkms (iF)" <<<"$OUT" && grep "sudo apt-get purge" <<<"$OUT" | grep -qw nvidia-kernel-dkms'
rm "$GF/config_fail"; installs_driver; run install --apply
is "retry with apt's Conf repair line: accepted, exit 0" eval '[ "$RC" = 0 ] && grep -q "^Conf nvidia-kernel-dkms (1.0-1  \[amd64\])" "$(ls "$GF/state"/plan-*.txt | sort | tail -1)"'
is "after the retry nvidia-kernel-dkms is configured (ii)" eval 'grep -q "^nvidia-kernel-dkms	1.0-1	ii " "$GF/db.tsv"'
# R3-01: a pending package of ours whose version changed since our install is left alone, and said so.
bare=1 reset_guest; echo nvidia-kernel-dkms > "$GF/config_fail"; run install --apply
awk -F'\t' -v OFS='\t' '$1 == "nvidia-kernel-dkms" {$2 = "9.9"} {print}' "$GF/db.tsv" > "$GF/db.new" && mv "$GF/db.new" "$GF/db.tsv"; run undo-plan
is "R3-01: changed pending package: left alone, never called 'included'" eval '! grep -q "nvidia-kernel-dkms.*included in the removal" <<<"$OUT" && grep -q "pending: nvidia-kernel-dkms (iF) at another version than our install; left alone" <<<"$OUT" && ! grep "sudo apt-get purge" <<<"$OUT" | grep -qw nvidia-kernel-dkms'
bare=1 reset_guest; echo "Conf libc6 (2.41-12  [amd64])" > "$GF/sim_extra"; run install --apply
is "Conf of a package that is neither new nor pending: refused" eval '[ "$RC" = 1 ] && grep -q "configures packages it does not install" <<<"$OUT"'
bare=1 reset_guest; printf 'nvidia-kernel-dkms\t0.9-1\tiF \n' >> "$GF/db.tsv"; echo "Inst nvidia-kernel-dkms [0.9-1] (1.0-1 Debian:13.7/stable [amd64])" > "$GF/sim_extra"; run install --apply
is "a pending package at another version (upgrade): still refused" eval '[ "$RC" = 1 ] && grep -q "upgrades installed packages: nvidia-kernel-dkms" <<<"$OUT"'

echo "== install dry run"
bare=1 reset_guest; run install
is "dry run: exit 0, plan shown, no sudo, nothing written" eval '[ "$RC" = 0 ] && not_called "^sudo" && [ ! -e "$GF/apt/siltwake-gpu-nonfree.sources" ] && [ ! -e "$GF/state" ]'
echo "Remv libc6 [2.41-12]" > "$GF/sim_extra"; run install
is "dry run of an unsafe plan: exit 1" [ "$RC" = 1 ]

echo "== check post"
NV="NVIDIA GeForce RTX 3090, 550.163.01, 00000000:06:00.0, 24576 MiB"
post_ready() { reset_guest; printf '06:00.0 VGA compatible controller [0300]: NVIDIA Corporation GA102 [GeForce RTX 3090] [10de:2204]\n\tKernel driver in use: nvidia\n' > "$GF/lspci.txt"
  echo "$NV" > "$GF/nvidia-smi.txt"; : > "$GF/dev/nvidia0"; : > "$GF/dev/nvidiactl"
  # The card behind root port 6 with its 32 GiB BAR1 placed in a 64 GiB OVMF window at 64 GiB.
  mkdir -p "$GF/pci/0000:06:00.0" "$GF/pci/0000:00:1e.0"; echo 0x1b36 > "$GF/pci/0000:00:1e.0/vendor"; echo 0x0100 > "$GF/pci/0000:00:1e.0/device"
  echo 0x10de > "$GF/pci/0000:06:00.0/vendor"; echo 0x2204 > "$GF/pci/0000:06:00.0/device"
  printf '%s\n' '0x0000000086000000 0x0000000086ffffff 0x0000000000040200' '0x0000001000000000 0x00000017ffffffff 0x000000000014220c' \
    '0x0000000000000000 0x0000000000000000 0x0000000000000000' '0x0000001800000000 0x0000001801ffffff 0x000000000014220c' > "$GF/pci/0000:06:00.0/resource"
  printf '%s\n' '00000000-00000fff : Reserved' '80000000-dfffffff : PCI Bus 0000:00' '1000000000-18ffffffff : PCI Bus 0000:00' \
    '  1000000000-1801ffffff : PCI Bus 0000:06' '    1000000000-17ffffffff : 0000:06:00.0' > "$GF/iomem"
  echo 65536 > "$GF/fwcfg-raw"
  # A complete passing report for this boot and host, written by the probe's own builder, so
  # that every post case below fails only for the reason it sets up.
  node --input-type=module -e "import { fixtureReport } from '$SRC/webgl-probe.mjs'; import fs from 'node:fs';
    fs.writeFileSync('$GF/report.json', JSON.stringify(fixtureReport({ bootId: '$(cat "$GF/boot_id")', host: '$(hostname)', commit: 'abc123', finishedAt: new Date().toISOString() })));"; }
post_ready; run check post
is "no report: check post exits 1" eval '[ "$RC" = 1 ] && grep -q "needs the probe" <<<"$OUT"'
REPORT="$GF/report.json"
is "fixture report written by the probe's own builder" [ -s "$REPORT" ]
run check post "$REPORT" --commit abc123
is "complete current report and a working device: check post exits 0" [ "$RC" = 0 ]
is "R3: BAR1 reported inside the root window, fw_cfg value shown" eval 'grep -q "^PASS BAR1 1000000000-17ffffffff (32768 MiB) assigned inside root window 1000000000-18ffffffff (36 GiB)" <<<"$OUT" && grep -q "^PASS OVMF received X-PciMmio64Mb=65536" <<<"$OUT"'
run check post "$REPORT" --commit other
is "report from another commit: exit 1" eval '[ "$RC" = 1 ] && grep -q "built from" <<<"$OUT"'
echo 00000000-0000-0000-0000-000000000000 > "$GF/boot_id"; run check post "$REPORT" --commit abc123
is "report from an earlier boot: exit 1" eval '[ "$RC" = 1 ] && grep -q "not this boot" <<<"$OUT"'
post_ready; sed -i '2s/.*/0x0000000000000000 0x0000000000000000 0x0000000000000000/' "$GF/pci/0000:06:00.0/resource"; run check post "$REPORT" --commit abc123
is "R3: BAR1 not assigned (window too small): exit 1, only that" eval '[ "$RC" = 1 ] && [ "$(grep -c "^FAIL" <<<"$OUT")" = 1 ] && grep -q "^FAIL BAR1 of 0000:06:00.0 is not assigned" <<<"$OUT"'
post_ready; sed -i 's/^1000000000-18ffffffff : PCI Bus 0000:00$/1000000000-13ffffffff : PCI Bus 0000:00/' "$GF/iomem"; run check post "$REPORT" --commit abc123
is "R3: BAR1 outside every root window: exit 1, only that" eval '[ "$RC" = 1 ] && [ "$(grep -c "^FAIL" <<<"$OUT")" = 1 ] && grep -q "is not inside any" <<<"$OUT"'
post_ready; rm "$GF/iomem"; run check post "$REPORT" --commit abc123
is "R3: /proc/iomem unreadable: exit 1, only that" eval '[ "$RC" = 1 ] && [ "$(grep -c "^FAIL" <<<"$OUT")" = 1 ] && grep -q "^FAIL cannot read .*iomem as root" <<<"$OUT"'
post_ready; rm "$GF/fwcfg-raw"; run check post "$REPORT" --commit abc123
is "R3: fw_cfg not visible is only a warning when BAR1 is placed" eval '[ "$RC" = 0 ] && grep -q "^WARN fw_cfg X-PciMmio64Mb not visible" <<<"$OUT"'
post_ready; rm "$GF/nvidia-smi.txt"; run check post "$REPORT" --commit abc123
is "nvidia-smi failing: exit 1, and that is the only failure" eval '[ "$RC" = 1 ] && [ "$(grep -c "^FAIL" <<<"$OUT")" = 1 ] && grep -q "^FAIL nvidia-smi" <<<"$OUT"'
post_ready; echo '{"verdict":"accelerated","exitCode":0}' > "$GF/context.json"; run check post "$GF/context.json" --commit abc123
is "context-only document: exit 1 (R1-06 case)" eval '[ "$RC" = 1 ] && grep -q "a context probe alone is not a game smoke" <<<"$OUT"'

echo
echo "passed $pass"
echo "failed $fail"
