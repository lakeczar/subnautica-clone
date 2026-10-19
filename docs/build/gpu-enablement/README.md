# RTX 3090 for factory-worker

**Status (2026-10-19): prepared and offline-tested only.** No host file, VM definition, guest package, driver, service or browser setting has been changed. No `ask` was submitted. Author: Opus 5.5/high (`claude-opus-5-5`, effort high) in worktree `t3/enable-3090-gpu` from `d8a812e`. Next steps: root's fresh Sol 6.1/xhigh review, then root places the operational files in Fleet and runs the native-gated steps below.

## What the GPU is for

| Workload | Uses the 3090 after this? | Why |
| --- | --- | --- |
| Game smoke, captures and performance runs in a project-owned headless Chromium (`webgl-probe.mjs` or an equivalent Playwright launch) | **Yes, once verified** | WebGL2 through ANGLE on NVIDIA EGL/Vulkan |
| T3's shared preview browser and `html_render` | **No** | T3 0.1.1-nightly.20261016.3203 launches its own pinned, hash-checked `chrome-headless-shell` with a hard-coded `--disable-gpu` (`ServerBrowserContexts.launchOptions` and `launchBrowser` in the T3 binary). It has no setting for this. Changing it is a T3 upstream feature, not a flag for us to change. |
| Opus/Sol/Codex model inference | No | It runs remotely through the proxy. Model and provider routing are unchanged. |
| TypeScript builds, Node tests, Vite | No | These are CPU work. |
| CUDA tools | Not installed | Not needed for graphics. `libcuda1` and the toolkit are a separate, optional install if a real CUDA job appears. |

## The chain, and where each link is checked

1. **Host:** `0000:01:00.0` (10de:2204, VGA) and `.1` (10de:1aef, audio), bound to `vfio-pci` or no driver, alone in their IOMMU group. No running VM may hold them, and no host framebuffer may sit in a BAR. → `host-gpu.sh` preflight
2. **Definition:** two `<hostdev managed='yes'>` entries in factory-worker on its free `pcie-root-port` index 6 (guest bus 0x06), function 0 with `multifunction='on'`. Copied from the proven Windows/inference entries. Nothing else changes. QXL stays the primary display for VNC. → `host-gpu.sh` compares the rest of the definition byte for byte.
3. **Cold start:** OVMF sizes the root port's windows for the card at boot. VFIO pins all 16 GiB of guest RAM. → `host-gpu.sh` start, live hostdev check, guest-agent answer
4. **Guest driver:** Debian 13 `nvidia-kernel-dkms` 550.163.01 built for the running kernel, with nouveau blacklisted. → `worker-gpu.sh check pre|post`, `nvidia-smi`
5. **Userspace:** glvnd EGL vendor `10_nvidia.json`, GLES2, the NVIDIA Vulkan ICD. → `worker-gpu.sh`
6. **Browser:** an isolated Chromium (Chrome for Testing 156.0.8078.4, already in `~/.cache/ms-playwright/chromium-1248`) with per-process ANGLE switches. `WEBGL_debug_renderer_info` must name the RTX 3090, and SwiftShader, llvmpipe and other cards are rejected. → `webgl-probe.mjs`
7. **Game:** production build, New expedition, 5 s frame count, screenshot, page errors. → `webgl-probe.mjs --url`

A device that only appears in `lspci` passes link 3 and nothing after it.

## Why a cold change, not live hotplug

Live attach would avoid a restart, but on this VM it cannot give a working 3090:

- The only free root port, guest `00:01.5`, got **2 MiB** of 32-bit memory and **256 MiB** of 64-bit prefetchable memory from OVMF. The card needs 16 MiB (BAR0), 256 MiB + 32 MiB prefetchable (BAR1/BAR3) and a 512 KiB ROM.
- QEMU q35 uses ACPI hotplug here (`_OSC: platform does not support [PCIeHotplug LTR]`, slots 0–6 in `/sys/bus/pci/slots`). In kernel 6.12 `acpiphp_glue.c` `enable_slot()` (lines 500–520), a hot-added non-bridge device only gets `__pci_bus_assign_resources()` inside the port's existing windows. Nothing releases or grows them. The result would be a device with unassigned BARs that the NVIDIA driver cannot use. It would still pin all guest RAM and hold the card.
- Making room needs QEMU options or a guest PCI remove/rescan. Both are speculative on a live T3 host. A cold start lets OVMF size the window correctly.

So one restart is needed. It is a host-owned power cycle, because a guest reboot keeps the same QEMU process and would not pick up a new device.

## The earlier 40-minute shutdown failure

Run `20261019T203605Z-d291` failed (`shutdown-timeout`/13), and nothing here relabels it. The guest journal shows what happened. The power key arrived at 15:38:06 and logind began powering off. PID 1 then sat in D state from 15:40 (`INFO: task systemd:1 blocked …`), in `drm_modeset_lock … drm_fb_helper_pan_display … fbcon_switch … con_write`, which is the **qxl** DRM console path. That boot had logged **65,643** `[TTM] Buffer eviction failed` since 2026-10-08 and repeated `qxl object_init failed`. The ACPI re-sends every 5 minutes changed nothing.

The recovery added `module_blacklist=qxl` to `GRUB_CMDLINE_LINUX_DEFAULT` (`/etc/default/grub` and `grub.cfg` written 2026-10-19 16:24:33). The current boot has no qxl module, uses the EFI framebuffer, and has 0 TTM failures and 0 hung tasks. Since then, the next boot (still with qxl, but fresh) rebooted with `systemctl reboot` in about 2 s. The one after it, with qxl blacklisted, powered off from an ACPI power key in about 1 s, and the following boot took about 15 s.

This **supports** that the observed hang path is gone. It does **not guarantee** every future shutdown. So:

- `worker-gpu.sh check pre` requires qxl unloaded, zero TTM failures and zero hung tasks in the current boot, plus an active guest agent.
- The host run waits 10 minutes with one ACPI re-send. It **never forces**, and it changes nothing unless the VM really is off.

Raw excerpts: `guest-shutdown-evidence.txt` under the evidence path below.

## Files

| File | Runs on | Purpose |
| --- | --- | --- |
| `host-gpu.sh` | Unraid, root | `preflight` (default, read-only, prints host facts), `launch attach\|detach` (detached run), `status` |
| `ask-command.sh` | worker | prints the exact hash-pinned `ask run` text: `preflight`, `rehearsal`, `attach`, `detach`; launches expire after 30 min |
| `worker-gpu.sh` | worker | `check pre`, `check post [report.json]` (read-only); `install`/`uninstall` (dry run unless `--apply`) |
| `webgl-probe.mjs` | worker | isolated WebGL2 renderer probe plus optional game smoke; `--self-test` |
| `tests/run.sh` | worker | offline suite in bwrap with a fake `virsh` built from the real definition (`tests/fixtures/factory-worker.xml`, no secrets in it) |

Host layout: `/mnt/user/appdata/fleet-gpu/host-gpu.sh` (staged) and `runs/<RUN_ID>/` containing `launch.json`, `state.json`, `run.log` (host facts included), `result.json`, `definition-*.xml`, `hostdev-[01].xml` and, when relevant, `unexpected-diff.txt` / `changed-while-off.xml`. A full definition backup with security info goes to `/boot/config/fleet/vm-backups/factory-worker-gpu-<RUN_ID>.xml`. Locks: `/tmp/fleet-gpu.lock`, plus Fleet's `/tmp/fleet-admin.lock` from power-off to start. Syslog tag `fleet-gpu`; an Unraid notification at the end of each run.

## Run outcomes (`result.json`)

| Outcome | Exit | VM afterwards |
| --- | --- | --- |
| `attached` / `detached` | 0 | running with or without the GPU, entries live, guest agent answers |
| `already-attached` / `already-detached` | 0 | not stopped |
| `rehearsal-ok` | 0 | untouched |
| `preflight-failed` | 10 | untouched; `message` says why |
| `locked` / `cancelled` | 11 / 12 | untouched |
| `shutdown-timeout` | 13 | still running or stuck going down; nothing changed or forced; look at VNC |
| `rolled-back` | 20 | running without the change; the definition is as before, or the message names a remaining non-GPU difference (`definition-after-undo.xml`) |
| `started-as-is`, `restarted-elsewhere` | 21 | someone else changed or started the VM, or Fleet's lock was busy; their change is kept and ours is not made |
| `guest-silent`, `started-unverified` | 22 | running with the intended entries, but the guest agent is silent or the live entries are wrong |
| `left-off`, `needs-owner` | 30 | off: it would not start, or our entries could not be removed again; alert |
| `aborted` | 31 | launch again; the plan follows the VM's current state |

The plan always comes from the current state: running without the GPU → full; off without → attach and start; off with ours → start only; running with ours → nothing. Any other hostdev, including non-PCI ones, is refused. `detach` is the mirror image and removes only our two entries.

## Procedure (root; native approval where marked)

```bash
H='ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=yes unraid-admin'
U=/mnt/user/appdata/fleet-gpu; B=<bundle directory>
```

1. **Stage** (no approval): `$H files write $U/host-gpu.sh < $B/host-gpu.sh`, then compare `$H files read $U/host-gpu.sh | sha256sum` with the reviewed hash.
2. **Rehearsal** (approval 1, changes nothing): `$H "ask run $(bash $B/ask-command.sh rehearsal)"`. After approval, read `$U/runs/<RUN_ID>/{result.json,run.log}`. Accept only:
   - `rehearsal-ok`/0, `launcher_alive_at_finish` `no`, and a `sid` different from `launch.json`'s `launcher_sid`;
   - a plan of `full`, no PROBLEM lines, and facts that show 10de:2204/1aef, `vfio-pci` or `none`, a two-member group, the BAR sizes, and memory with `MemAvailable` + QEMU RSS ≥ 19,398,656 KiB.

   This is also the read-only host diagnostic. It shows `lspci -nnk`, `vfio-pci.cfg` and the kernel command line. `ask-command.sh preflight` gives the same checks synchronously in `ask result`, if root only needs the facts.
3. **Guest driver** (guest-local, no reboot, no owner approval needed): `bash worker-gpu.sh install` (dry run), then `bash worker-gpu.sh install --apply`. It adds `/etc/apt/sources.list.d/siltwake-gpu-nonfree.sources` (`contrib non-free`) and installs `linux-headers-$(uname -r) nvidia-kernel-dkms nvidia-driver-libs libgles-nvidia2 libegl-nvidia0 nvidia-vulkan-icd nvidia-smi` with `--no-install-recommends`. That is 38 packages and about 138 MiB, with no kernel, Xorg or CUDA change. Nouveau is not loaded now, so nothing changes until the card appears.
4. **Checkpoint**: root's durable checkpoint, and no shared work that cannot pause. `bash worker-gpu.sh check pre` must be all PASS.
5. **Attach** (approval 2): `$H "ask run $(bash $B/ask-command.sh attach)"`. A 60 s arm window follows (`echo cancel | $H files write $U/runs/<RUN_ID>/CANCEL`). Expect the worker and T3 to be gone for about 1–3 minutes. Submit only when the owner can approve within 30 minutes; a later approval starts nothing.
6. **After boot** (new root session):
   - read `$H files read $U/runs/<RUN_ID>/result.json` and expect `attached`/0.
   - run the probe:
     ```bash
     npm install --prefix /work/tmp/gpu-enable --no-audit --no-fund playwright-core@1.64.1
     # serve a production build on free port 5192
     TMPDIR=/work/tmp node webgl-probe.mjs --out <evidence dir> \
       --playwright /work/tmp/gpu-enable/node_modules/playwright-core --url http://127.0.0.1:5192/
     ```
   - run `bash worker-gpu.sh check post <evidence dir>/report.json`.
   - update Fleet `machines.yaml` and `docs/STATE.md` in the same commit.
7. **Undo**: `ask-command.sh detach` (another restart), then optionally `worker-gpu.sh uninstall --apply`, which purges exactly the recorded packages and removes our sources file. The owner can always run `bash /mnt/user/appdata/fleet-gpu/host-gpu.sh status`, or the same `launch` text, from the web terminal.

If the probe finds no accelerated candidate while `nvidia-smi` works, the report holds `chrome://gpu` for each candidate. Any further browser switch is a new reviewed change, not an ad-hoc edit.

## Owner decisions

- **The card becomes factory-worker's.** factory-worker autostarts and stays on, so `Windows 11 Gaming` and `Debian AI13 Inference` cannot start while it holds the 3090; libvirt refuses with "in use". Their definitions are untouched. Gaming means `detach` (a worker restart) first, or a later switching tool.
- **One worker restart** for attach and one for any detach.
- **Host memory:** all 16 GiB of worker RAM becomes pinned, and the balloon is ineffective with VFIO. On 2026-10-19 the host had 31 GiB, 7.5 GiB available, Hermes 4 GiB and no host swap.
- **VNC console:** OVMF may put the EFI console on the NVIDIA card. `check post` reports where it went. If it moved, adding `<rom bar='off'/>` to the GPU entry is a separate reviewed change.

## Verified (read-only or offline, 2026-10-19)

- Host via the helper: Unraid 7.3.2, 12 CPUs, 31 GiB, 7.5 GiB available, no swap. factory-worker runs with 16 GiB and 6 vCPUs, UUID as fixed, q35 `pc-q35-10.2`, OVMF pure-efi, no hostdev, QXL video, virtio balloon, and `pcie-root-port` indexes 1–6 with bus 0x06 unused. Windows 11 Gaming, Debian AI13 Inference **and Ubuntu AI 24_OLD** name `01:00.0`/`.1` (vfio, managed) and are all shut off. Hermes runs. No NVIDIA plugin is installed on the host.
- Guest: Debian 13.7, kernel 6.12.111+deb13-amd64, no Secure Boot, gcc 14.2 (the kernel's compiler), no `unattended-upgrades`, 19 GiB free on `/`, `non-free`/`contrib` not enabled.
- Package resolution against the live Debian 13 archive, in a private apt directory:
  - adding `linux-headers-amd64` would also **upgrade the kernel to 6.12.113**, so headers are pinned to the running kernel;
  - the pinned set is 38 packages.
- Module build: the signed `nvidia-kernel-dkms_550.163.01-2` (sha256 `729d1721…0107`) built offline against the running kernel's headers, unprivileged and without network. `make` exited 0 in 57 s, with `vermagic 6.12.111+deb13-amd64 SMP preempt mod_unload modversions`. This shows build compatibility, not that the module loads.
- Offline suite (`tests/run.sh`): **104 checks pass**, as 91 host-script, 5 ask-command and 8 classifier checks. They cover:
  - every preflight refusal;
  - hash and deadline guards;
  - detached survival of a SIGKILLed launcher group;
  - the full attach/detach;
  - shutdown timeout without force;
  - start failure and its rollback;
  - a half-failed attach;
  - an undo that cannot complete;
  - concurrent definition changes and restarts;
  - memory taken while off;
  - a silent guest agent;
  - CANCEL;
  - both locks;
  - re-entry.

  Five mutation trials (accepting any definition change, ignoring a host framebuffer, unverified undo, no deadline, a running VM only noted) each make the suite fail.
- The probe was run on factory-worker Linux, with its own browser and temporary profile, then closed:
  - `angle-vulkan` gave no WebGL2, and `angle-gl-egl` and the default both gave `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) …))`. All were correctly rejected, exit 1.
  - The smoke against production `eb712f1` on port 5192 reached the pod opening ("Release restraint") with 0 page errors and 3 fps on SwiftShader, at 1280×800.
  - This checks the harness only.

## Not verified (needs the real run)

- Host facts behind the helper: the GPU's actual IDs, driver binding, IOMMU group, BAR sizes (resizable BAR?), host framebuffer, `vfio-pci.cfg`, QEMU RSS, and the libvirt pid-file path. The rehearsal reports all of them.
- That OVMF fits the BARs, the guest boots with the card, the 550 module loads, and `nvidia-smi` shows the 3090.
- Which ANGLE backend gives NVIDIA WebGL2 in headless Chromium 156, and real frame rates.
- That the next ACPI shutdown completes. It is supported by the evidence above, but not guaranteed.
- Libvirt's formatting matches between `attach --config` and its undo. A mismatch ends as `rolled-back` with the difference named, or `needs-owner` if our entries remain.

## Evidence

Persistent: `/home/worker/.local/share/siltwake-evidence/gpu-enablement-prep/`. It holds:

- host status/observe/VM info, and all five VM definitions read with passwords redacted (none present);
- guest shutdown and PCI excerpts;
- the T3 preview-launch excerpt and kernel `acpiphp_glue.c` v6.12;
- the apt simulations and install set, plus the gzipped module build log;
- the test and mutation output, plus both probe reports and the smoke screenshot.

## Recommendations (not part of this change)

- T3 upstream: an opt-in GPU setting for the server preview browser, so shared previews can use the card.
- Fleet: a small `vm gpu attach|detach|status` verb built from this script, so switching the card to the gaming VM is one approved command.
- Remove `module_blacklist=qxl` only together with a video-model decision (for example virtio), not casually.
