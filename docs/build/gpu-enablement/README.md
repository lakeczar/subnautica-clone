# RTX 3090 for factory-worker

**Status (2026-10-20): R4 corrections prepared and offline-tested only; the GPU is not attached.** The author changed nothing live. Root has since staged the reviewed script, run the owner-approved passing rehearsal and the failed (rolled-back) attach, and installed the guest driver. The factory-worker definition is unchanged. Author: Opus 5.5/high (`claude-opus-5-5`, effort high), worktree `t3/enable-3090-gpu`. Round 1 (`e1a85c2`) and round 2 (`c4d5191`) were reviewed by Sol 6.1/xhigh with **REQUEST CHANGES**; [R1-FIX.md](R1-FIX.md) and [R2-FIX.md](R2-FIX.md) map every finding to its correction and checks. `8d6dba9` passed Sol R3. Its real rehearsal (2026-10-20, run `20261020T003504Z-f08a`) correctly stopped on the card's resizable BAR. [R3-FIX.md](R3-FIX.md) covers the 64-bit window this round adds. `6cc4bec` passed Sol R4. Its real attach (run `20261020T032723Z-ae45`) shut down in 10 s, then `virsh define` failed: libvirt reserves `opt/ovmf/` fw_cfg names. The run rolled back and restarted the VM unchanged. [R4-FIX.md](R4-FIX.md) moves the window to `<qemu:commandline>` and adds a pre-shutdown libvirt validation gate. Next: root inspection, a fresh Sol review of the whole bundle, then byte-identical placement in Fleet and the native-gated steps below. Nothing here shows a working GPU.

## What the GPU is for

| Workload | Uses the 3090 after this? | Why |
| --- | --- | --- |
| Game smoke, captures and performance runs in a project-owned headless Chromium (`webgl-probe.mjs`, or an equivalent Playwright launch with the switches it selects) | **Yes, once verified** | WebGL2 through ANGLE on NVIDIA EGL/Vulkan |
| T3's shared preview browser and `html_render` | **No** | T3 0.1.1-nightly.20261016.3203 launches its own pinned, hash-checked `chrome-headless-shell` with a hard-coded `--disable-gpu` (`ServerBrowserContexts.launchOptions` and `launchBrowser`). It has no setting for this; it would need a T3 upstream feature. |
| Opus/Sol/Codex model inference | No | It runs remotely through the proxy; routing is unchanged |
| TypeScript builds, Node tests, Vite | No | CPU work |
| CUDA tools | Not installed | Graphics need no CUDA; `libcuda1`/toolkit would be a separate install for a real CUDA job |

## The chain, and where each link is checked

1. **Host:** `0000:01:00.0` (10de:2204, VGA) and `.1` (10de:1aef, audio), bound to `vfio-pci` or no driver, alone in their IOMMU group (bridges allowed). No VM that is not shut off may name them, and no host framebuffer may sit in a BAR. → `host-gpu.sh`, checked at the start, before the shutdown, after it, and again just before the start.
2. **Definition:** our entries in factory-worker:
   - two `<hostdev managed='yes'>` on its free `pcie-root-port` index 6 (guest bus 0x06), function 0 with `multifunction='on'` (as in the proven Windows/inference entries);
   - `<qemu:commandline>` with exactly two `<qemu:arg>`, `-fw_cfg` and `name=opt/ovmf/X-PciMmio64Mb,string=65536`, plus `xmlns:qemu` on `<domain>`. This is the 64-bit PCI window OVMF opens, sized for the resizable BAR (next section).

   They are written in one `virsh define` of the VM's own full definition, and only after the identical target has passed libvirt's own validation with `virsh domxml-to-native` before the VM is stopped. Everything else must read back byte for byte. QXL stays the primary display for VNC.
3. **Cold start:** OVMF sizes the root port's windows for the card at boot. VFIO pins all 16 GiB of guest RAM. → start, live entries read back, guest agent answers.
4. **Guest driver:** Debian 13 `nvidia-kernel-dkms` 550.163.01 built for the running kernel, with nouveau blacklisted. → `worker-gpu.sh check pre|post`, `nvidia-smi`
5. **Userspace:** glvnd EGL vendor `10_nvidia.json`, GLES2, the NVIDIA Vulkan ICD; `/dev/nvidia0` and `/dev/nvidiactl` usable by `worker`. → `worker-gpu.sh check post`
6. **Browser:** an isolated Chromium (Chrome for Testing 156.0.8078.4 in `~/.cache/ms-playwright/chromium-1248`) per fixed candidate switch set. Accelerated means the unmasked renderer names the RTX 3090 (never SwiftShader, llvmpipe or another card) **and** a real shader draw of three colours reads back exactly with no GL error or context loss. → `webgl-probe.mjs`
7. **Game:** the probe serves the production `dist/` itself and records its commit and file hashes. It starts a new expedition and waits for the game's own readiness (`#ocean` `data-graphics=available`, `data-ready=true`, HUD shown). It then counts frames from the game's render loop (`data-frames`, one per `scene.render()`) over 5 s, needing at least 10. It checks the canvas image alone (DOM overlays hidden) is a real scene, and fails on page errors, console errors, relevant WebGL warnings and context loss. → `webgl-probe.mjs --dist`, then `webgl-probe.mjs --validate` (called by `check post`), which re-derives the result from the raw observations for this commit, this boot and this host.

A device that only appears in `lspci` passes link 3 and nothing after it. The game frame count from headless Chromium is a functional signal, not a performance figure; 1080p/60 is not measured here.

## Resizable BAR and the 64-bit window

The real rehearsal found resizable BAR enabled on the host. BAR1 is **32 GiB** (`6000000000-67ffffffff`) and BAR3 32 MiB, so 33,587,200 KiB of 64-bit prefetchable memory. OVMF's 64-bit window in this guest is 32 GiB (`7000000000-77ffffffff`, 39 physical bits, `OVMF_CODE-pure-efi.fd`, `pc-q35-10.2`). The card would not fit, and the old fixed 8 GiB limit refused it before anything was changed. Decision: keep ReBAR on the host, avoid a host reboot, and enlarge the guest's window. The owner may still choose to disable ReBAR in the BIOS instead. The script then computes a 64 GiB window as before, which is harmless.

- **What OVMF reads:** fw_cfg `opt/ovmf/X-PciMmio64Mb`, in MiB (edk2 `OvmfPkg/Library/PlatformInitLib/MemDetect.c`). A value sets `PcdPciMmio64Size` and `PcdPciMmio64Override`, which bypasses the dynamic and classic window sizing. The base is then the first address above RAM, aligned to the window's power-of-two size.
- **How it is set:** two QEMU arguments in `<qemu:commandline>`. libvirt passes them unchanged and writes them back in this exact form (`qemuDomainDefNamespaceFormatXMLCommandline`, `qemu_domain.c`). libvirt marks the domain "tainted: custom-argv", which is expected. The native `<sysinfo type='fwcfg'>` **cannot** carry this item: `qemuValidateDomainDefSysinfo` (libvirt 12.2.0 `src/qemu/qemu_validate.c:1059–1081`) rejects any name under `opt/ovmf/` or `opt/org.qemu/` with "That firmware name is reserved". That is exactly how the R4 attach failed. Libvirt's `pcihole64` is not used: it sets only QEMU's ACPI window, not where OVMF places BARs.
- **Pre-shutdown gate:** in the rehearsal, and in a real run under Fleet's lock just before the shutdown, the run builds the exact target definition and runs `virsh domxml-to-native qemu-argv --xml`. In 12.2.0 that parses with full domain validation (no `SKIP_VALIDATE`, `qemu_driver.c:6248`) on a fresh unregistered domain object in "pretend" mode, so it touches neither the running VM nor the card. The argv must contain `-fw_cfg name=opt/ovmf/X-PciMmio64Mb,string=65536` and a `vfio-pci` device for each function (for detach: neither). Otherwise the run is `preflight-failed` and the VM is never stopped. Only the matched arguments are logged, because the argv can contain secrets.
- **Size:** the card's 64-bit prefetchable total, plus 2 GiB for the other root ports' 64-bit padding (5 × 256 MiB observed in the guest), rounded up to a power of two, at least 64 GiB. For this card that is **65536**. This follows edk2's `CalculateResourceAperture`: a root port's aperture is its children packed by alignment and aligned to the bridge's own 1 MiB, so the GPU port needs 32 GiB + 32 MiB, aligned at 32 GiB. The script refuses if the window, placed above all RAM and aligned to its size, would end beyond the CPU's physical address bits (host-passthrough CPU, so the host's `address sizes`: 39 bits = 512 GiB).
- **Ownership:** "ours" is our hostdevs, and our `<qemu:commandline>` holding exactly the two arguments, together with the `xmlns:qemu` it requires. They are added together, compared, and removed together on detach and on every rollback. Anything else is foreign, and the run refuses or leaves the VM for the owner. That covers:
  - any other QEMU content (more arguments, `<qemu:env>`, `<qemu:override>`, `<qemu:capabilities>`);
  - our name with `file=`;
  - a non-PCI hostdev.

  An unrelated valid `<sysinfo>` is ordinary definition content and is kept. The whole-definition comparison treats exactly our entries as the only allowed difference.
- **Check in the guest:** QEMU's ACPI window starts at the lowest 64-bit BAR, so Linux will not show a "64 GiB" window. `check post` requires BAR1 to be assigned and inside a `PCI Bus 0000:00` window of this boot's `/proc/iomem`. It reports the window and, when the `qemu_fw_cfg` module exposes it, the `X-PciMmio64Mb` value OVMF received.
- **Unraid's form-view VM editor** rebuilds the definition from its form and may drop `<qemu:commandline>` and the namespace, and with them the window. If the owner edits factory-worker in form view, run `ask-command.sh rehearsal`: a dropped block shows as plan `full`, and `attach` restores it with one restart. Use the XML view to keep it. Without the window the guest still boots, but BAR1 does not fit, and `check post` fails on BAR1.
- **Windows 11 Gaming** has the same card and no MMIO settings, so it probably has the same latent problem with resizable BAR on. It is not changed here.

## Why a cold change, not live hotplug

Live attach would avoid a restart, but on this VM it cannot give a working 3090:

- The only free root port, guest `00:01.5`, got **2 MiB** of 32-bit memory and **256 MiB** of 64-bit prefetchable memory from OVMF. The card needs 16 MiB (BAR0), 256 MiB + 32 MiB prefetchable (BAR1/BAR3) and a 512 KiB ROM.
- q35 uses ACPI hotplug here (`_OSC: platform does not support [PCIeHotplug LTR]`). In kernel 6.12 `acpiphp_glue.c` `enable_slot()` (lines 500–520), a hot-added non-bridge device only gets `__pci_bus_assign_resources()` inside the port's existing windows; nothing grows them. The device would have unassigned BARs while still pinning all guest RAM and holding the card.
- Making room needs QEMU options or a guest PCI remove/rescan, both speculative on a live T3 host. A cold start lets OVMF size the window. A guest reboot keeps the same QEMU process, so the power cycle is host-owned.

## The earlier 40-minute shutdown failure, and the QXL gate

Run `20261019T203605Z-d291` failed (`shutdown-timeout`/13), and nothing here relabels it. In that boot the power key arrived at 15:38:06. PID 1 then blocked in the **qxl** DRM console path (`drm_modeset_lock … drm_fb_helper_pan_display … fbcon_switch … con_write`), after **65,643** `[TTM] Buffer eviction failed` since 2026-10-08. The recovery added `module_blacklist=qxl` to `GRUB_CMDLINE_LINUX_DEFAULT` (written 2026-10-19 16:24:33). The current boot has no qxl module and 0 TTM failures and hung tasks. The following reboot and power-off each took 1–2 s.

That **supports** that the observed hang path is gone; it does **not guarantee** the next shutdown. Policy, enforced as FAIL by `worker-gpu.sh check pre`:

- `module_blacklist=qxl` must be on the running kernel and in `/etc/default/grub` for the next boot;
- qxl must be unloaded;
- this boot's kernel journal must be readable from its start (`Linux version`), with zero TTM failures and zero hung-task reports.

The scripts check the recovery configuration and never edit it. The host run waits at most 10 minutes with one ACPI re-send, **never forces**, and changes nothing unless the VM really is off.

## Files

| File | Runs on | Purpose |
| --- | --- | --- |
| `host-gpu.sh` | Unraid, root | `preflight [attach\|detach]` (default, read-only, prints host facts), `launch attach\|detach` (detached run), `status` |
| `ask-command.sh` | worker | the exact hash-pinned `ask run` text: `preflight`, `rehearsal`, `attach`, `detach`; launches expire 30 min after the text is printed |
| `worker-gpu.sh` | worker | `check pre`, `check post REPORT --commit SHA`, `install` (simulated, no root), `install --apply`, `undo-plan` (read-only) |
| `webgl-probe.mjs` | worker | context probe + draw check, optional production game smoke, `--validate`, `--self-test` |
| `tests/run.sh` | worker | the offline suite: host (fake `virsh` built from the real definition), guest (fake system tools, no network), ask text, probe logic |
| `R1-FIX.md` | — | round-1 findings → corrections → checks |

Host records: `/mnt/user/appdata/fleet-gpu/host-gpu.sh` (staged) and `runs/<RUN_ID>/`. Each run folder holds:

- `launch.json`, `state.json`, `run.log` (with host facts and every check) and `result.json`;
- `definition-at-start.xml`, plus `definition-before-change.xml`/`-after-change.xml` (the `define` file itself holds security info and is a root-only temporary file in the host's `/tmp`, removed at once);
- `backup.sha256`;
- when relevant, `changed-definition.xml/.diff`, `unexpected-diff.txt` and `definition-after-undo.xml`.

The full backup with security info is `/boot/config/fleet/vm-backups/factory-worker-gpu-<RUN_ID>.xml`, outside `files read`. Before any shutdown it must be a successful, complete read of this VM, equal to the checked definition apart from passwords, synced and read back. Locks: `/tmp/fleet-gpu.lock`, and Fleet's `/tmp/fleet-admin.lock` **from before the shutdown until the start**. Syslog tag `fleet-gpu`; an Unraid notification ends every run.

## Run outcomes (`result.json`)

| Outcome | Exit | VM afterwards |
| --- | --- | --- |
| `attached` / `detached` | 0 | running with/without the GPU; live entries read back; guest agent answers |
| `already-attached` / `already-detached` | 0 | not stopped (live entries read back) |
| `rehearsal-ok` | 0 | untouched (checks, verified backup, Fleet lock, boundary check done) |
| `preflight-failed` | 10 | untouched, still running; `message` lists every problem (including unreadable state) |
| `locked` | 11 | untouched, **never stopped**: our run lock or Fleet's lock was busy |
| `cancelled` | 12 | untouched |
| `shutdown-timeout` | 13 | still running or stuck going down; nothing changed or forced; look at VNC |
| `rolled-back` | 20 | running without the change; definition as before, or the message names a remaining non-GPU difference |
| `backed-off`, `restarted-elsewhere` | 21 | running, **nothing changed**: after the shutdown the definition, the card or another VM's ownership no longer matched, or someone started the VM |
| `guest-silent`, `started-unverified` | 22 | running, but the guest agent is silent, or the live entries are wrong or unreadable |
| `left-off` | 30 | **observed shut off**: a start failed and the VM was then read as shut off; start it from the VM page |
| `needs-owner` | 30 | **not started by the run**: after the shutdown the state or definition could not be read, or its hostdev entries were not the expected ones, or the state after a failed start is unreadable or unusual; the message gives what was observed |
| `aborted` | 31 | launch again; the plan follows the VM's current state |

A recovery start happens only after a successful read of a shut-off state and a complete definition whose entries of ours (hostdevs and the fw_cfg window) are exactly the expected ones; otherwise the VM stays off as `needs-owner`. After any failed start the run reads the state: running (for example a lost response after boot) counts as started and is not started again; shut off is `left-off`; unreadable or other is `needs-owner`. The plan always comes from the current state of our entries, defined and running. Running and different from the target (including a dropped fw_cfg entry) → full. Off and different → change and start. Off and equal → start only. Running and equal → nothing. Anything foreign is refused, and `detach` removes only our entries.

## Procedure (root; native approval where marked)

Root places this bundle byte for byte in its chosen Fleet location after review (for example `/work/repos/fleet-vm-upgrade/unraid/gpu-enablement/`) and records the path, commit and hashes. `B` below is that directory.

```bash
H='ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=yes unraid-admin'
U=/mnt/user/appdata/fleet-gpu; B=<placed bundle directory>; SRC=<game source commit to smoke, e.g. eb712f1527439ec1f38f2c52ef61ac78989ba74c>
```

1. **Stage** (no approval): `$H files write $U/host-gpu.sh < $B/host-gpu.sh`; `$H files read $U/host-gpu.sh | sha256sum` must equal the reviewed hash.
2. **Rehearsal** (approval 1, changes nothing): `$H "ask run $(bash $B/ask-command.sh rehearsal)"`. After approval read `$U/runs/<RUN_ID>/{result.json,run.log}`. Accept only:
   - `rehearsal-ok`/0, `launcher_alive_at_finish` `no`, a `sid` different from `launch.json`'s `launcher_sid`, and a `backup` path;
   - plan `full`, no PROBLEM lines, and facts showing 10de:2204/1aef, `vfio-pci` or `none`, the group members, BAR sizes with BAR0 seen in the host memory map, the 64-bit window line (`X-PciMmio64Mb=65536`, 39 physical bits), the line `gate: libvirt accepts the target; argv has: -fw_cfg …,string=65536 | … 0000:01:00.0 … | … 0000:01:00.1`, every other VM checked, and `MemAvailable` + QEMU RSS ≥ 19,398,656 KiB.

   This is also the read-only host diagnostic. `ask-command.sh preflight` gives the checks synchronously if only facts are needed.
3. **Guest driver** (guest-local, no reboot):
   - `bash $B/worker-gpu.sh install` simulates against the real archive in a private apt directory. It must show 38 new packages and no removal, upgrade, kernel, Xorg or CUDA.
   - `bash $B/worker-gpu.sh install --apply` refuses a pre-existing `/etc/apt/sources.list.d/siltwake-gpu-nonfree.sources` it did not write. It records the system first (`/var/lib/siltwake-gpu/before.tsv`, manual marks), then checks the real plan the same way before installing. It records every plan and the result, and exits 1 on any apt or verification failure. A failed install is retried with the same command; the first attempt's record is kept. On a retry, packages dpkg left pending (for example `nvidia-kernel-dkms` half-configured `iF` after a failed DKMS build) are accepted only at their exact version and only for apt's `Conf` repair; upgrades and removals are still refused, and the install passes only once everything is configured (`ii`) and the module is built.
4. **Checkpoint:** root's durable checkpoint of active work, repositories, worktrees and evidence; nothing that cannot pause. `bash $B/worker-gpu.sh check pre` must end `all checks pass` (exit 0).
5. **Attach** (approval 2): `$H "ask run $(bash $B/ask-command.sh attach)"`, submitted only when the owner can approve within 30 minutes. A 60 s arm window follows (`echo cancel | $H files write $U/runs/<RUN_ID>/CANCEL`). Then Fleet's lock is taken and held to the start. Expect T3 and the worker to be gone for about 1–3 minutes.
6. **After boot** (new root session):
   - `$H files read $U/runs/<RUN_ID>/result.json` → `attached`/0.
   - Build `$SRC` into a scratch `dist/` (`git archive $SRC | tar -x -C <dir> && npm ci && npx vite build`).
   - Run the probe (it serves `dist/` itself on 127.0.0.1:5192 and closes everything it starts):
     ```bash
     npm install --prefix /work/tmp/gpu-enable --no-audit --no-fund playwright-core@1.64.1
     TMPDIR=/work/tmp node $B/webgl-probe.mjs --out <evidence dir> --playwright /work/tmp/gpu-enable/node_modules/playwright-core \
       --dist <dir>/dist --commit $SRC
     bash $B/worker-gpu.sh check post <evidence dir>/report.json --commit $SRC
     ```
     `check post` passes only with the 3090 on the nvidia driver, `nvidia-smi`, usable device nodes, the QXL/journal gate, services and endpoints, **and** a report that validates as a passing game smoke of `$SRC` in this boot on this host.
   - Record resumed services/endpoints, CPU/memory/disks/autostart and unchanged repository/evidence checkpoints; update Fleet `machines.yaml` and `docs/STATE.md` together.
   - Link this GPU-browser workflow from Fleet's operational docs and Siltwake's agent/browser guidance (root's integration step).
7. **Undo:**
   - The GPU: `ask-command.sh detach` (another restart). It removes the hostdevs and the fw_cfg window entry together.
   - The packages, optionally afterwards: `bash $B/worker-gpu.sh undo-plan` is read-only. It lists only packages that one of our recorded plans newly installed, that were absent before, and that are still at the version we installed. It simulates their removal and refuses if apt would remove anything else. It names unrelated or changed packages it leaves alone, and the `apt-mark auto` and sources-file steps, and prints the commands for an operator to run by hand.
   - The owner can always run `bash $U/host-gpu.sh status`, or the same `launch` text, from the web terminal.

If no candidate is accelerated while `nvidia-smi` works, the report holds `chrome://gpu` text for each candidate. Any further browser switch is a new reviewed change.

## Owner decisions

- **The card becomes factory-worker's.** It autostarts and stays on, so `Windows 11 Gaming`, `Debian AI13 Inference` and `Ubuntu AI 24_OLD` cannot start while it holds the 3090 (libvirt refuses). Their definitions are untouched. Gaming means `detach` first (a worker restart).
- **Resizable BAR stays on;** the guest gets a 64 GiB 64-bit window instead (no host reboot). Disabling ReBAR in the BIOS remains the owner's alternative.
- **One worker restart** for attach, and one for any detach.
- **Host memory:** all 16 GiB of worker RAM becomes pinned; the balloon is ineffective with VFIO. On 2026-10-19 the host had 31 GiB, about 7.5 GiB available, Hermes 4 GiB and no swap.
- **VNC console:** OVMF may put the EFI console on the NVIDIA card. `check post` reports where it went; `<rom bar='off'/>` would be a separate reviewed change.

## Verified (read-only or offline)

Round 1 (2026-10-19), still valid:

- Host facts through the helper: Unraid 7.3.2, worker 16 GiB/6 vCPU, q35, no hostdev, root ports 1–6 with bus 0x06 free. The Windows, inference and Ubuntu-old definitions name the GPU and are shut off; Hermes runs.
- Guest: Debian 13.7, kernel 6.12.111, no Secure Boot.
- Debian 13 resolution: `linux-headers-amd64` would upgrade the kernel, so headers are pinned.
- The signed DKMS source builds against the running kernel's headers. That is a build, not a load.

Round-1 fix:

- The offline suite with a hostile PATH, the reviewer's fixture against the corrected probe, a read-only real-archive dry run, and isolated software-renderer integration runs of the corrected probe on factory-worker. Details and numbers are in [R1-FIX.md](R1-FIX.md).

## Not verified (needs the real run)

- The GPU's actual IDs, binding, group, BAR sizes, host framebuffer, `vfio-pci.cfg`, QEMU RSS, libvirt pid path, and the security-info backup matching the plain definition on this libvirt. The rehearsal reports or checks all of them before any shutdown.
- That libvirt formats the inactive definition identically before and after a power-off and after our `define`/its undo. A difference makes the run back off or report it; it never forces. The gate shows that libvirt accepts the target and builds the argv; it cannot prove that QEMU starts.
- That Unraid's OVMF build honours `X-PciMmio64Mb` (in edk2 since 2017) and that OVMF places BAR1 in the 64 GiB window. `check post` shows BAR1 assigned inside a root window.
- The next ACPI shutdown, OVMF BAR allocation, guest boot with the card, module load, `nvidia-smi`, device permissions, which ANGLE backend renders on the 3090, the draw check and game smoke on it, VNC framebuffer placement, and detach on real libvirt.
- Any performance figure; a complete-game or 1080p/60 claim.

## Recommendations (not part of this change)

- T3 upstream: an opt-in GPU setting for the server preview browser.
- Fleet: a small `vm gpu attach|detach|status` verb built from this script, for switching the card to the gaming VM.
- Remove `module_blacklist=qxl` only together with a video-model decision (for example virtio).
