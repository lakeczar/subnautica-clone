# RTX 3090 live result: 2026-10-20

**factory-worker has the RTX 3090 and renders the game on it.**

| Step | Result |
| --- | --- |
| Rehearsal `20261020T040634Z-8a53` | `rehearsal-ok`. The libvirt gate accepted the target, and the argv carries `-fw_cfg … X-PciMmio64Mb=65536` plus both `vfio-pci` functions |
| Attach `20261020T041458Z-762c` | `attached`/0 in 95 s. Backup at `/boot/config/fleet/vm-backups/factory-worker-gpu-20261020T041458Z-762c.xml` |
| Guest | RTX 3090 at `06:00.0`, nvidia 550.163.01, 24 GiB. BAR1 (32 GiB, ReBAR) sits inside a 33 GiB root window. `/dev/nvidia*` are usable by `worker` |
| WebGL | ANGLE GL-EGL and ANGLE Vulkan both draw on the 3090. The shared T3 preview stays on SwiftShader |
| Game smoke (`eb712f1`, probe `a755c56`) | Passes in **angle-gl-egl**: 300 frames at 60/s headless, no errors, no context loss. ANGLE Vulkan loses the WebGL context once at startup, every time (4 of 4 runs; Babylon recovers), so the probe falls back past it. This is a known issue, described in the README |
| `check post` | Every GPU check passes. The only failures are the `fleet-dashboard` services and endpoints the dashboard project moved to the Mac on purpose |

**Open items:**
- The Unraid VNC console may be blank now that the EFI framebuffer moved to the NVIDIA card. The fix is `<rom bar='off'/>`, which is the owner's call.
- The headless frame counts are not a performance measurement.
- No representative 1080p/60 claim is made yet.

**Evidence:** `~/.local/share/siltwake-evidence/gpu-live/` (`post-attach-final/`, `check-post.log`). For later agents, the GPU browser workflow is in the README section on agent GPU browsers.
