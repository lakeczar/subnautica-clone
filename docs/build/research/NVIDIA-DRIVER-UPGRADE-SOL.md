# NVIDIA driver upgrade: factory-worker / RTX 3090

Sol 6.1 xhigh · researched **2026-10-24** · research only.

## Decision

**A newer driver is worth a controlled maintenance trial, but it is not a demonstrated fix for Siltwake's frame stalls and will not enable NVENC in Linux Chromium.** Keep the working GL-EGL backend. First establish separate cold/warm shader-cache results and investigate power-state variance on 550. If the owner approves a driver trial, my practical choice is **R595 production, currently 595.112.07, through NVIDIA's Debian 13 APT repository, with an explicit version pin and a complete guest rollback image**. Start with the proprietary kernel flavor to preserve the present flavor and retain a GSP-off diagnostic; evaluate the recommended open flavor separately. The proprietary package dependency closure must pass the preparation gate below. [N1][N2][P3][P4]

**Why not simply install 580 from backports?** Debian's live trixie and trixie-backports indexes both still contain upstream **550.163.01**. NVIDIA's **Debian 13** repository has R590 and later, but no R580 packages in the indexes examined. Its **Debian 12** repository does have R580. Mixing that repository into this Debian 13 guest would create another compatibility variable; I do not recommend it. R580 is the attractive longer-supported branch if NVIDIA supplies a supported Debian 13 package route later. Do not replace APT with a `.run` installation just to obtain it. [P1][P2][P3][P5]

The immediate value is current maintenance and the chance to remove a driver-specific bottleneck. The recording and display features advertised in newer drivers mostly do not apply to our headless WebGL2 workload. Cheap settings can clarify the problem, but changes to persistence, clocks, driver configuration or the VM still need owner approval.

## Evidence and limits

Read the project's current status/direction/game direction, [GPU live result](../gpu-enablement/LIVE-RESULT.md), and the prior hardware-encoding research at `origin/research/browser-hw-encode:docs/build/research/BROWSER-HW-VIDEO-ENCODE-SOL.md`. This report extends that research rather than repeating its codec survey. Base repository commit: `344179a8a08db2e51a4f98ef2399f2b1d117a9be`.

Read-only inspection confirmed:

- Debian **13.7**, kernel **6.12.111+deb13-amd64**; loaded proprietary driver **550.163.01**. Debian names its module file `nvidia-current.ko.xz`; `modinfo nvidia_current` reports license `NVIDIA` and the matching kernel vermagic. A failed `modinfo nvidia` lookup alone would be misleading.
- RTX 3090, passthrough, BAR1 **32768 MiB**, VBIOS **94.02.59.00.F2**; display mode and active display disabled.
- **GSP Firmware Version: N/A**, so GSP is not active in the inspected configuration. Persistence mode is disabled; application clocks report **N/A**.
- One incidental snapshot showed **P5**, graphics **1005 MHz**, memory **810 MHz**, idle clock limitation active, and zero encoder sessions. A pre-existing Chromium GPU process was present. These are observations during someone else's work, **not idle baselines or measurements of our stalls**; no process was interrupted.
- `nvidia-kernel-dkms` and GL/EGL/Vulkan userspace packages are installed at `550.163.01-2`; the `nvidia-driver` metapackage itself is not installed. Preserve the actual installed-package manifest for rollback rather than assuming that reinstalling one metapackage recreates this headless setup.

No driver/settings changes, installs, browser launches, GPU jobs, PR operations or delegation were performed. Online material was retrieved over HTTP. Vendor `.deb` files were downloaded to `/tmp` and their **documentation/package metadata** inspected without installation or execution. No spoiler documents were read. No performance benefit or passthrough compatibility was tested.

Primary sources were retrieved on the date above. Chromium source is pinned to `f45262ae78835ec26ff8be22aa15fa0e38f726d4`; ANGLE to `fd19437f535d986d969850e761a59b41b9bdffef`; `nvidia-vaapi-driver` to `443050726fdb30888a2ced1cea1c5d036ea3b15c`. Those are source-level findings, not a claim that Playwright build 1248 contains those exact revisions. [C1][A1][V1]

## 1. Available branches and package routes

NVIDIA distinguishes **production branches**, with sustained fixes, from shorter-lived **new feature branches**. Its data-center lifecycle additionally identifies **long-term support** branches. These labels describe NVIDIA's release channels; data-center certification/support tables do not certify this particular GeForce/Unraid combination. The RTX 3090 device ID `2204` is listed in the Linux supported-chip documents checked for the versions below. [N1][N2][N3]

| Branch | Linux releases verified in NVIDIA's archive | Branch classification / decision relevance |
| --- | --- | --- |
| 550 | 550.163.01 | Production branch; our baseline. Older than the improvements below. |
| 555 | 555.58.02 | Intervening feature series; important because GSP becomes default on supported GPUs. Not an upgrade destination. |
| 560 | 560.35.03 | New feature branch; open modules become the recommended/default choice for compatible GPUs. |
| 565 | 565.77 | New feature branch; includes GSP/vblank and synchronization fixes. |
| 570 | 570.211.01 | Production branch, now historical; no reason to stop here for this experiment. |
| 575 | 575.64.05 | New feature branch; several display/explicit-sync changes. |
| 580 | **580.196.07** | **LTS**, listed through **June 2028**; best conservative branch in principle, but see Debian 13 package availability. |
| 590 | 590.48.01 | New feature branch; not preferred over production 595. |
| 595 | **595.112.07** | **Production**, listed through **March 2027**; matched Debian 13 vendor packages are available. Recommended trial route. |
| 610 | 610.57.04 | New feature branch; lifecycle table gives August 2026 EOL. Not a useful destination now. |
| 615 | 615.78.08 in the display archive; 615.71.10 in the data-center release catalog | New feature branch in the release catalog. The catalogs differ; existence of a higher version is not a recommendation. |

Sources: NVIDIA's [release catalog][N1], [support/lifecycle table][N2], [display archive][N4], and per-version `README/supportedchips.html` (for example [580][N3] and [595][N5]). Do not use `latest.txt` as the selection algorithm: it returned **595.80** while the archive and package repositories contained later releases.

### What the repositories actually provide

`packages.debian.org` returned a JavaScript challenge, so the versions below were checked directly in Debian's authoritative amd64 `Packages.xz` indexes. NVIDIA versions were checked in its `Packages.gz` indexes, independently of this guest's cached APT metadata. No `apt update` was run. [P1][P2][P3][P5]

| Route | Verified contents | Implication |
| --- | --- | --- |
| Debian 13 `trixie/non-free` | `nvidia-driver`, `nvidia-kernel-dkms`: **550.163.01-2** | Current upstream version already installed. A distro revision is not a newer NVIDIA branch. |
| `trixie/contrib` | `nvidia-open-kernel-dkms`: **550.163.01-2** | Open flavor exists, but still R550. NVIDIA calls its GeForce/workstation open support **Beta** in this release's README. |
| `trixie-backports/non-free`, `contrib` | Driver and both kernel flavors: **550.163.01-4~bpo13+1** | Packaging fixes, not the 560–595 driver features. |
| Debian's other trixie driver family | `nvidia-tesla-535-driver` **535.274.02-1~deb13u1** | Older upstream branch, not an upgrade path. |
| NVIDIA CUDA/driver repo, **debian13/x86_64** | R590, R595, R610, R615; **595.112.07-1** driver, proprietary/open DKMS and `nvidia-open`; exact/branch pin packages | A vendor-maintained APT route for this OS. No CUDA toolkit is required to render WebGL. |
| NVIDIA repo, **debian12/x86_64** | Includes **580.196.07-1** and `nvidia-driver-pinning-580` | Not the matched OS repository; avoid importing it into this guest merely to get R580. |
| NVIDIA `.run` files | Archive contains the listed branches | Can install/build either supported kernel flavor, but would bypass/conflict with Debian package ownership. Recovery and kernel updates become harder. Last resort, not this recommendation. |

Debian's open package is named **`nvidia-open-kernel-dkms`**; NVIDIA's is **`nvidia-kernel-open-dkms`**, with `nvidia-open` as a vendor metapackage. Do not interchange recipes. Keep the kernel modules, firmware and GL/EGL/Vulkan/NVML libraries at a coherent driver version. The vendor installation guide's “compute-only/headless” package choice **omits GL/EGL/Vulkan**, so that is unsuitable for our **headless graphics** workload. Preserve graphics userspace even though there is no desktop. [P4][N6]

### Open modules and GSP

The 3090 is Ampere and supports NVIDIA's open modules. These are **NVIDIA's kernel modules with the same proprietary graphics userspace**, not Nouveau or Mesa NVK. Changing to them does not add a Chromium codec backend. [N6][N7]

- **550:** proprietary is the installer default; the open flavor supports Ampere but its GeForce/workstation support is documented as Beta. Our inspected proprietary configuration has GSP off. [N8][N9]
- **555 onward:** GSP becomes default for all supported GPUs, including Ampere, even with the proprietary flavor. Proprietary modules can use `NVreg_EnableGpuFirmware=0` to disable it. [N7][N10]
- **560 onward:** NVIDIA recommends open modules for Turing/Ampere/Ada/Hopper, and the installer chooses open on compatible systems. **Open modules require GSP**; GSP cannot be disabled while retaining that flavor. Both proprietary and open support the 3090 in the examined R580/R595 documents. [N6][N7][N11]

NVIDIA explicitly documents slower GPU initialization and potentially longer power-saving transitions with open/GSP versus proprietary/GSP-off; it suggests persistence to initialize ahead of applications. It also lists open-only CUDA/HMM/GDS capabilities. Those capabilities are not requirements for Babylon.js/WebGL2. Starting the trial with proprietary modules is a temporary way to control variables, not a claim that open modules are generally inferior. [N6][N7]

## 2. What an upgrade could unlock

### CUDA/NVENC memory clocks: real, conditional benefit

GPU Screen Recorder's current documentation says NVIDIA reduces memory transfer clocks when CUDA/NVENC is used and that its application-profile workaround needs **580+**. Its source actually writes `~/.nv/nvidia-application-profiles-rc.d/10-gsr-cuda-no-stable-perf-limit`, matching the **`gpu-screen-recorder` process**, with setting key `0x166c5e`. This is a process-specific recorder workaround, not a global “make WebGL faster” setting. [G1][G2]

NVIDIA's changelog explicitly announces **`CudaNoStablePerfLimit` allowing CUDA applications to reach P0** under **595.45.04**. Thus NVIDIA confirms the capability; **the earliest ≥580 support threshold is the project's claim**, not independently established by that NVIDIA announcement. I did not test the undocumented numerical setting on 580 or this 3090. [N12]

**For today's GL-EGL game/browser recording path, this provides no established benefit:** WebGL is not CUDA, and the examined Linux Chromium cannot reach NVENC. If a native NVENC recorder or another concurrent CUDA application is introduced, its P-state/memory-clock effect can matter to the game on the same GPU. GPU Screen Recorder also offers experimental Vulkan Video encoding to avoid its CUDA path, with codec support dependent on the GPU/FFmpeg/driver. This does not make Chromium use it. The 3090 has H.264/HEVC encode hardware, **not AV1 encode**; no driver can add that silicon. [G1][C1][N13]

### Chromium video encoding: still no path to NVENC

At the pinned Chromium revision, the platform encoder factory selects **VA-API or V4L2 on Linux** and has **no Vulkan Video or direct NVENC encoder backend**. `media/gpu/BUILD.gn` and its source directory agree. The Linux accelerated-encode feature remains disabled by default in the examined feature definitions; enabling it would expose an available backend, not create one. WebCodecs and MediaRecorder need that browser integration. ANGLE's rendering backend is a separate choice. [C1][C2][C3]

`nvidia-vaapi-driver` still states **“Hardware decoding only, encoding is not supported.”** Its current README has newer Chromium-compatible **decode** guidance; that development does not change the encode answer. NVIDIA's newer kernel/graphics packages do not provide a verified VA-API encoder for this stack. [V1]

NVIDIA already exposes Vulkan Video encoding APIs for native applications; Khronos defines these separately from graphics rendering. An extension advertised by a driver, or FFmpeg/GPU Screen Recorder using it, is not evidence of a Chromium implementation. **No newer NVIDIA branch examined makes WebCodecs/MediaRecorder use NVENC on this Debian guest.** Future Chromium source changes could alter that answer; it is not a claim that such a backend is impossible. [N14][K1][C1]

### ANGLE-Vulkan: retest candidate, no stability/performance promise

The local GPU-enablement record is unusually useful: Vulkan drew on the 3090 but lost the WebGL context once at startup in **4/4** runs, while GL-EGL passed its smoke. No upstream bug ID, Vulkan error or device-loss trace in that record ties the startup failure to a fixed NVIDIA defect. **Whether a newer driver fixes it remains unverified.** [local GPU live result](../gpu-enablement/LIVE-RESULT.md)

There are relevant Vulkan synchronization/device-loss fixes below, so an isolated retest after a successful GL-EGL driver comparison is reasonable. A “hang while destroying a swapchain after device loss” fix does **not** establish that the original context loss is fixed. Record WebGL context-loss events, GPU-process exits, Vulkan errors and Xids; recovery is not a clean pass. [N12]

ANGLE describes Vulkan's potential for lower CPU API overhead and better multicore command recording. It also documents costly pipeline creation at draw time and visible hitches, with dynamic state, pipeline libraries and background compilation used to reduce them. Results depend on application, driver and browser interop. **There is no primary-source evidence that ANGLE-Vulkan will make this game faster or smoother than GL-EGL on this VM.** Compare both only after controlling the driver and cache state. Vulkan 1.4/new extensions also do not turn our WebGL2 application into a WebGPU application or expose ray tracing/DLSS automatically. [A1][A2]

The inspected ANGLE code's NVIDIA minimum for its graphics-pipeline-library path is **531**, below our current 550. That optimization should not be advertised as a new ≥580 unlock merely because it appears in the Vulkan design documentation; runtime extension/feature support still decides whether ANGLE uses it. [A3]

### Capture / NvFBC: update the “X only” assumption, retain the headless limit

Traditional NvFBC captures an X desktop; GPU Screen Recorder's NvFBC implementation uses X display/output information. A new driver does not supply a desktop to our surfaceless headless EGL browser. [G3]

However, **“NvFBC always requires X/Wayland” is too broad today**. NVIDIA Capture SDK **9.0**, requiring driver **570.86.16+**, adds a PipeWire backend for Wayland and a **direct PID Vulkan capture backend** documented for X11, Wayland and Vulkan direct-to-display. None is documented there as arbitrary **headless EGL/WebGL offscreen-surface capture**. Direct-to-display is not the same setup as our browser with no display. Any direct-PID capture of headless Chromium's GPU process, including ANGLE-Vulkan, is **unverified**, not an unlocked recording solution. [N15]

NVIDIA's public Capture SDK page points to Tesla/Quadro/GRID support; I could not verify an official current GeForce support commitment from the 9.0 release notes because their download requires a developer login. **Do not equate this with technical impossibility on GeForce:** GPU Screen Recorder's source retries NvFBC creation with a private enabling field, showing an unsupported/undocumented path used by community applications. No such path was tested here. Capture SDK availability and NVENC support are separate questions. [N15][G3]

## 3. Frame stalls: actual fixes versus unproven matches

The observed **60–80 ms renderer-main-thread off-CPU intervals, busy GPU process and low steal** are consistent with a GPU/IPC/synchronization dependency, but do not identify a faulty driver. GPU-process CPU work can be shader translation/compilation, allocation or copies; renderer waits can be command-buffer backpressure or IPC. Low steal excludes only one disturbance source, not guest scheduling, major faults, memory pressure or a fence waiting on legitimate GPU work. Our harness already records the job's CPU/memory pressure, faults, swap-ins, throttling and unleased GPU clients; use those fields alongside the trace. [local contention collector](../../../scripts/heavy/contention.mjs)

NVIDIA's packaged **full upstream changelog** is more informative here than just a current release page. The entries below are verified fixes, with applicability deliberately limited. [N12]

| Release / area | NVIDIA's documented change | Match to our workload |
| --- | --- | --- |
| **555.58.02**, GL synchronization | More efficient `glXWaitVideoSyncSGI()`, reducing stutter in some KDE configurations with GSP | **Weak:** GLX/KDE/vblank, no X or KDE here; baseline GSP is off. |
| **565.57.01**, GSP | Reduced some OpenGL/vblank stutter; fixed GSP resource-exhaustion exits | Relevant to the risk introduced by enabling GSP, not proof of a baseline 550/GSP-off stall fix. |
| **565 series**, Vulkan fences | Fixed crashes waiting on a `VkFence` imported from a DRM syncobj | Specific external-sync path, mainly observed on Wayland; not a generic `glFinish` fix. |
| **570.124.04**, GSP | Fixed stuttering while scrolling Wayland windows with GSP enabled | **Not a direct match** to headless EGL. |
| **570.153.02**, OpenGL | Fixed OpenGL/compositor stalls with NVIDIA as a **Reverse PRIME display-offload sink** | **Not our single passed-through GPU topology.** |
| **570 introduced; 580.65.06 default**, interrupts | `RMIntrLockingMode` can reduce stutter, especially VR, under contention | Plausible general driver scheduling change, but display/VR motivation; no evidence it removes our stalls. Do not add the experimental aggressive-vblank setting. |
| **580.65.06**, Vulkan | Fixed hangs destroying swapchains after device loss, plus specific Vulkan application crashes | Candidate stability improvement; does not identify our startup context loss. |
| **580.173.02**, Vulkan synchronization | Fixed delayed wakeups when multiple threads wait on the **same Vulkan semaphore**, causing stutter/performance loss | Stronger synchronization-related lead **for Vulkan**. It is not evidence of the same bug in GL-EGL. |
| **580.173.02**, OpenGL memory | Prevented `glBufferStorage` buffers with no storage flags from migrating from GPU to host memory | Potentially relevant only if ANGLE/browser uses that allocation pattern. Actual use here is unverified. |
| **590.44.01**, Vulkan | Faster swapchain recreation to prevent resize stutter | Window-resize path; little direct value for a fixed-size headless canvas. |
| **595.104.02**, allocation | Fixed failure allocating GPU page tables larger than 2 GiB | A real fix, but no evidence we hit that threshold/failure. |

**Not established:** a 550→newer fix specifically for this game's surfaceless EGL `glFinish`/GL-fence stalls, shader compiler pauses, light-load P-state transitions or ReBAR under KVM. NVIDIA's release notes cover supported passthrough configurations, but do not certify this consumer 3090/Unraid setup. A 32 GiB BAR aperture proves address-space assignment, not that every driver memory policy uses it optimally. No identified ReBAR bug justifies changing host BAR/MMIO settings. [N16]

`glFinish` is defined to block until prior GL work completes. A long wait is not by itself a bug, and a renderer blocked on the GPU process is not necessarily calling `glFinish` at all. Trace the waiting stack/wakeup source before choosing a fix. NVIDIA documents `__GL_YIELD` behavior (`sched_yield()` by default, alternatives `USLEEP`/`NOTHING`), but changing it can exchange CPU consumption, scheduling and contention. It is not a recommended blind tuning switch. [K2][N17]

There are public user reproductions of slower `vkCreateDevice`/context initialization with GSP, including a 3080/570 case. These are **upstream user reports**, not a vendor-confirmed explanation of our recurring frames; the author explicitly distinguishes startup time from stutter. NVIDIA's own open-module README independently documents slower initialization. Our present GSP-off state makes this an **upgrade confounder** to measure, not the cause of today's observed stalls. [U1][N6]

## 4. Shader caches: useful on 550 already

NVIDIA documents a persistent GL shader-binary disk cache controlled by **`__GL_SHADER_DISK_CACHE`**, **`__GL_SHADER_DISK_CACHE_PATH`** and **`__GL_SHADER_DISK_CACHE_SIZE`**. It is normally on for a non-root direct-rendering process; setuid/setgid and indirect rendering disable it, and root defaults differ. No X server is required by these environment settings. ANGLE GL-EGL ultimately invokes NVIDIA's GL implementation, so using a writable per-job-family driver cache is a reasonable **inference**; actual cache writes/hits through our exact Chromium sandbox/process environment have not been verified. [N17][N18]

The default is `$XDG_CACHE_HOME/nvidia/GLCache`, otherwise `$HOME/.cache/nvidia/GLCache`; old `.nv/GLCache` locations are reused if present. The changelog documents a **1024 MB** default for the newer location, while legacy paths containing `/.nv/` retain **128 MB** unless overridden. This predates 550. **An upgrade is not needed to obtain the cache or these controls.** The README does not give a precise default-size value in its variable table; the value comes from NVIDIA's changelog. [N12][N17][N18]

For an approved cache diagnostic, use a stable, writable path owned by `worker`, separate by driver/backend, and pass the environment to the actual browser/GPU process. An example policy, **not applied here**, is:

```text
__GL_SHADER_DISK_CACHE=1
__GL_SHADER_DISK_CACHE_PATH=/home/worker/.cache/siltwake/nvidia/<driver>/<backend>
__GL_SHADER_DISK_CACHE_SIZE=2147483648
```

The 2 GiB cap is an experiment, not a measured requirement. Confirm free space, inheritance and real cache files first. A temporary Chromium user-data directory can discard Chromium/ANGLE's own cache while a separate NVIDIA cache survives; these are different layers. Sharing the default driver cache with applications using a smaller/default cap can trigger eviction, which is another reason to use a task-owned path rather than changing the owner's global environment. [N17]

Disk caching can reduce **repeat** compilation and eviction churn. It cannot eliminate a genuinely new shader/material variant's first compilation, ANGLE translation, pipeline linking or scene construction. Driver binaries are version-specific; an upgrade causes recompilation. Preserve the 550 cache for rollback and compare **cold-to-cold and warm-to-warm**. Keep cold first-traversal results visible: a warm run is diagnostic evidence, not acceptance evidence for a streaming hitch the player encounters on first use. [N17][A2]

For Vulkan, ANGLE's pipeline cache and NVIDIA's driver cache interact with driver-specific workarounds; the inspected ANGLE source even skips pipeline-cache serialization on NVIDIA. Do not assume the GL cache directory accounts for every Vulkan compilation or that copying cache files makes the comparison equivalent. [A3]

## 5. Power management and measurement variance

### Persistence: first low-risk setting to consider, with a narrow purpose

Persistence keeps a GPU initialized when the last application closes it. On a machine without an X server holding the device open, this can reduce between-job initialization costs and loss of initialization-lifetime settings. NVIDIA prefers **`nvidia-persistenced`** over the legacy persistence mechanism; `nvidia-smi -pm` is the older control. It does **not** lock P0, memory clocks or PCIe link speed, and does not explain away a 70 ms stall in an already active browser session. A continuously open GPU client already prevents full teardown. [N19][N20]

An owner-approved persistence A/B is inexpensive compared with replacing the driver. Record daemon/mode before and after, ensure it is the only changed variable, and restore the original disabled state after a temporary diagnostic. Do not add a fake display or permanent GPU load to keep clocks up.

### Clocks: good diagnostic control, separate from the player's result

NVIDIA documents **`-lgc`** (GPU clock range, Volta+) and **`-lmc`** (memory clock range), with root privileges and product-dependent support. Equal min/max requests a single clock; a wider range still permits variation. Values are requested/closest supported clocks, not a guarantee against thermal/power limits. On this board, **application clocks are N/A**; `-ac` is deprecated and should not be the plan. Do not assume consumer Ampere exposes every memory-clock lock just because the command exists. Query supported clocks first; treat `Not Supported` as a result rather than applying another control method. No locking was attempted. [N21]

An approved diagnostic can compare automatic clocks with a conservative, sustainable locked GPU clock, and a supported memory lock if available. Log actual clocks, P-state, power, temperature and clock-event reasons. Never copy the maximum reported clock into a command without establishing a sustainable operating point. Do not change power limits, offsets or use overclocking as part of the driver A/B.

- **Pros:** less boost/P-state variance; helps determine whether light-load ramping contributes; reduces one confounder when comparing driver CPU/synchronization behavior.
- **Cons:** higher idle energy/heat; may create thermal/power throttling; can hide a real driver power-management regression; is not how the owner's browser normally runs. Fixed high memory clocks particularly change bandwidth and power. Locks do not fix legitimate GPU work or host/guest contention.

Publish **automatic-clock results as the game-performance result**. Label locked-clock results as a controlled diagnostic. If locks remove stalls, that supports a clock/power hypothesis but still requires timestamp-correlated clock data; the change also affects workload throughput. For temporary experiments, the documented resets are `-rgc` and `-rmc`; restore the recorded starting configuration in a cleanup path and verify it. Persistence alone is not a substitute for that cleanup. [N21]

## 6. Upgrade risks and a concrete preparation gate

1. **Passthrough/GSP/ReBAR:** a driver can change initialization, resource mappings and reset behavior. Open flavor requires GSP, while our baseline does not use it. Test both a guest reboot and a later owner-controlled cold guest start. Preserve the existing libvirt XML, 64 GiB MMIO provisioning and passed-through GPU/audio functions; changing them alongside the driver would destroy the comparison. Do not adjust the host or start any of the three stopped VMs that also reference the 3090. Our live working passthrough is stronger evidence than generic data-center certification, but does not guarantee a new driver. [N6][N16][local live result](../gpu-enablement/LIVE-RESULT.md)
2. **DKMS/kernel:** 550 currently builds/loads for the exact 6.12.111 kernel. Newer branches have newer-kernel fixes, but that does not prove a successful build with this Debian kernel/configuration/compiler. Preserve that kernel and matching headers, verify DKMS build output and installed modules **before reboot**, and check Secure Boot/signing if enabled. Do not combine a kernel upgrade with the driver trial. [P4][N12]
3. **APT ownership/dependencies:** avoid a mixed Debian/NVIDIA graphics stack and never layer `.run` files over it. Save package versions, repository definitions, pins, alternatives, modprobe settings, initramfs/boot state and the existing headless device-access rules. The generic `nvidia-driver` metapackage may install X components even though no X server is started; review the proposed package transaction rather than assuming the current small footprint survives. [P4]
4. **Chromium compatibility:** keep the same browser build, executable (full Chromium versus headless shell), flags, viewport and game commit. ANGLE/Chromium has driver workarounds in addition to the GPU blocklist; `--ignore-gpu-blocklist` does not remove all workarounds or guarantee a functioning backend. An upgrade can change workaround selection. Record actual GL vendor/renderer, EGL/ANGLE backend and GPU feature status. Verify both installed Playwright executables separately if both are used operationally. [C4]
5. **Cache/startup regressions:** expect cold caches and measure initialization separately. Keep old caches for rollback; do not call one slow first launch a steady-state regression or warm away first-use hitches. New modeset/fbdev defaults can also affect the guest console, even without a desktop; preserve access over SSH and the saved boot configuration. [N12][N17]

There is also a concrete **maintenance/security** reason to revisit 550 independently of performance: Debian's tracker currently marks multiple recent NVIDIA CVEs vulnerable in trixie's version. Check the selected driver's security coverage at execution time; this report does not claim that a version number alone fixes every listed issue. [P6]

## 7. Before/after experiment and rollback

This is a plan for an **owner-approved maintenance window**, not authorization or an executed procedure. The unit under test is the guest driver stack; leave the T3 app's slices and the host configuration alone.

### Preparation and measurements

1. **Capture a reproducible 550 baseline.** Use the same game SHA, save/travel route, resolution, recorder state and Chromium executable. Include the scene with the recurring stall, a representative region/cave traversal, and a cold browser startup. Use `scripts/heavy-check.sh --class exclusive --machine 3090`; its GPU lease and per-job disturbance evidence are already the right mechanism. No new slice tuning is needed.
2. **Separate hypotheses on 550 first.** Check actual driver/Chromium cache locations and inheritance; compare cold and repeat traversal without hiding the first-use result. Then, if approved, persistence only; then a clock-lock diagnostic only. Keep caches/browser state comparable within each experiment. Revert settings between experiments.
3. **Record the useful distributions.** For equal-duration runs report median/p95/p99 frame times and counts/rates above **16.7, 33, 50 and 60 ms**, plus context losses/GPU-process restarts, not just average FPS. Collect enough identical traversals to see run-to-run range (start with three clean repetitions per steady-state condition). Disturbed/missing-coverage runs are labeled and repeated through the existing harness, not silently discarded or called clean because steal was low.
4. **Correlate representative stalls.** Capture renderer main-thread scheduling/waits, GPU-process CPU stacks/tasks, shader compilation/link/upload activity, GPU timing where available, and Xids/kernel errors. Include the harness's CPU pressure, memory pressure, major faults, swap-ins and exclusive-throttling evidence. A modest, identical telemetry cadence for clocks/P-state/power/temperature/PCIe link/encoder activity on both versions can expose correlations; monitoring itself can change GPU initialization/power state, so keep its lifetime and cadence the same. Some NVML clock reporting changed in 580; do not interpret a reporting-only difference as faster hardware. [N12][N21]
5. **Prepare recovery before installation.** With the owner, make a restorable **guest disk/boot snapshot or backup** and verify recovery access without relying on graphics. Save the complete 550 package set/manifest, the working kernel and headers, repository/pin files, modprobe configuration and initramfs. Verify that the necessary old `.deb` files are actually available, not merely named in APT history. Save the host XML as evidence; no host edits are proposed.
6. **Approve a concrete APT transaction.** Use NVIDIA's **Debian 13** repo instructions and an exact **595.112.07** pin (or a deliberately reviewed later R595 maintenance release), not an unbounded “latest” metapackage. Simulate the complete transaction and inspect removals/dependencies, including matching GSP firmware. The firmware package's versioned `Provides` explains its dependency version without the Debian `-1` suffix; that is not evidence of a broken dependency. Keep all graphics libraries. Proprietary first if dependency resolution is coherent; otherwise explicitly choose open/GSP-on or defer, without forcing dependencies. Do not install the CUDA toolkit merely because these drivers live in a CUDA repo. [P3][P4]
7. **After the approved change/reboot:** confirm driver/module flavor/GSP, device access, GPU/audio attachment and **32 GiB BAR1** before browser work. Run the known GL-EGL functional probe under a GPU lease, then the **same exclusive comparison**. First compare 550 vs 595 GL-EGL with otherwise equal settings. If GSP-on is a regression lead, a separately approved **proprietary-only GSP-off** comparison can isolate it. A later open-module comparison changes one more variable; it is optional, not required to establish the first result.
8. **Only then revisit Vulkan.** Repeat startup/context-loss checks with unchanged Chromium, followed by cold/warm exclusive measurements if functional checks pass. Retain GL-EGL unless Vulkan is both reliable and materially improves the relevant tail-frame metric. A recovered startup context loss is a failure for this decision.

**Keep/rollback rule:** require reliable startup/rendering/reboots and no visual/context-loss regression. For a performance-motivated adoption, require an improvement in the stall rate/tail that exceeds the baseline repetition range, with no first-traversal regression; define the target from the baseline before seeing upgrade numbers. If performance is unchanged, maintenance/security may still justify retaining a supported driver, but document that separate reason. No fixed percentage benefit can be predicted from the sources.

### Rollback

- Stop only task-owned GPU clients through the existing job workflow. Do not unload/reset a GPU in use by another job, touch T3 slices, or start an alternative VM holding the same device.
- **Preferred recovery:** restore the saved guest disk/boot state and boot the same known-good kernel. GPU device assignment lives outside a guest disk snapshot, which is why it must remain unchanged. If the GPU itself is wedged, owner-controlled VM/host recovery may be needed; no host reset is preauthorized.
- **Package rollback alternative:** remove/disable the vendor repo and pins, restore the saved Debian source/pin configuration, then reinstall/downgrade the **entire recorded** 550.163.01-2 graphics/module package set, restore the original kernel-flavor/GSP settings, rebuild DKMS/initramfs as required and reboot. Downgrading only `nvidia-kernel-dkms` or only userspace leaves an invalid mixed stack. Do not assume an ordinary `apt upgrade` will downgrade a higher vendor version.
- Restore prior persistence/clock settings and the separate 550 cache. Verify `550.163.01`, proprietary flavor, GSP N/A, expected BAR1/device permissions and the original GL-EGL functional probe. Then repeat one comparable exclusive baseline to establish recovery. Preserve the failed-run logs and exact package/driver/browser revisions.

## Sources

All are upstream/vendor/project sources unless explicitly identified as a user reproduction. Links to package indexes support the exact availability observations; do not substitute a third-party installation guide.

- **N1:** NVIDIA machine-readable branch types and releases, [releases.json][N1].
- **N2:** NVIDIA [supported drivers/lifecycle table][N2]. These are data-center lifecycle commitments, not a GeForce passthrough certification.
- **N3/N5:** NVIDIA [580 supported chips][N3], [595 supported chips][N5]; other branches checked at the same per-version path.
- **N4:** NVIDIA [Linux x86_64 display archive][N4].
- **N6/N7/N8:** NVIDIA [R580 open modules][N6], [R595 open modules][N7], [R550 open modules][N8].
- **N9/N10:** NVIDIA [R550 GSP][N9], [R555 GSP][N10].
- **N11:** NVIDIA [open-module transition announcement][N11] and [R560 module README][N22].
- **N12:** NVIDIA full upstream `changelog.gz`, extracted from [Debian 13 vendor nvidia-driver 595.112.07-1 package][N12], `/usr/share/doc/nvidia-driver/changelog.gz`. Contains historical release entries, including 550→595 changes. The [595 announcement][N23] independently confirms CudaNoStablePerfLimit; the [580 announcement][N24] confirms RMIntrLockingMode and the device-loss cleanup fix. Absence of a driver fix from selected public notes is not proof that no internal fix exists.
- **N13/N14/N15:** NVIDIA [codec support matrix][N13], [Vulkan driver notes][N14], [Capture SDK 9.0][N15].
- **N16:** NVIDIA [580.196.07 release notes, including virtualization][N16]; [595.112.07 notes][N25] include Debian 13.7 in the supported OS table, but not a certification of this precise VM.
- **N17/N18:** NVIDIA [R580 GL environment/cache variables][N17], [same controls on R550][N18].
- **N19/N20/N21:** NVIDIA [persistence guide][N19], [persistence daemon][N20], [`nvidia-smi` reference][N21].
- **P1/P2:** Debian [trixie non-free amd64 index][P1], [trixie-backports non-free index][P2]; open modules from the corresponding [trixie contrib][P7] and [backports contrib][P8] indexes.
- **P3/P5:** NVIDIA [Debian 13 package index][P3], [Debian 12 package index][P5].
- **P4:** NVIDIA [Debian install guide][P4] and [version locking][P9]. These describe future preparation, not actions executed here.
- **P6:** Debian [NVIDIA source-package security tracker][P6].
- **C1/C2/C3/C4:** pinned Chromium [encoder factory][C1], [GPU build file][C2], [media feature definitions][C3], [driver workarounds][C4].
- **V1:** pinned `nvidia-vaapi-driver` [README][V1], encoding explicitly unsupported.
- **G1/G2/G3:** GPU Screen Recorder [README][G1], [CLI profile-writing source][G2], [NvFBC source][G3]. Retrieved current project source; no recorder was run.
- **A1/A2/A3:** pinned ANGLE [Vulkan design][A1], [pipeline compilation][A2], [renderer driver/cache workarounds][A3].
- **K1/K2:** Khronos [Vulkan Video encode extension][K1], [`glFinish` semantics][K2].
- **U1:** NVIDIA forum [GSP `vkCreateDevice` latency reproduction][U1], **user report, not a confirmed diagnosis of our stalls**.

[N1]: https://docs.nvidia.com/datacenter/tesla/drivers/releases.json
[N2]: https://docs.nvidia.com/datacenter/tesla/drivers/supported-drivers-and-cuda-toolkit-versions.html
[N3]: https://download.nvidia.com/XFree86/Linux-x86_64/580.196.07/README/supportedchips.html
[N4]: https://download.nvidia.com/XFree86/Linux-x86_64/
[N5]: https://download.nvidia.com/XFree86/Linux-x86_64/595.112.07/README/supportedchips.html
[N6]: https://download.nvidia.com/XFree86/Linux-x86_64/580.196.07/README/kernel_open.html
[N7]: https://download.nvidia.com/XFree86/Linux-x86_64/595.112.07/README/kernel_open.html
[N8]: https://download.nvidia.com/XFree86/Linux-x86_64/550.163.01/README/kernel_open.html
[N9]: https://download.nvidia.com/XFree86/Linux-x86_64/550.163.01/README/gsp.html
[N10]: https://download.nvidia.com/XFree86/Linux-x86_64/555.58.02/README/gsp.html
[N11]: https://developer.nvidia.com/blog/nvidia-transitions-fully-towards-open-source-gpu-kernel-modules/
[N12]: https://developer.download.nvidia.com/compute/cuda/repos/debian13/x86_64/nvidia-driver_595.112.07-1_amd64.deb
[N13]: https://developer.nvidia.com/video-encode-decode-support-matrix
[N14]: https://developer.nvidia.com/vulkan-driver
[N15]: https://developer.nvidia.com/capture-sdk
[N16]: https://docs.nvidia.com/datacenter/tesla/tesla-release-notes-580-196-07/index.html
[N17]: https://download.nvidia.com/XFree86/Linux-x86_64/580.196.07/README/openglenvvariables.html
[N18]: https://download.nvidia.com/XFree86/Linux-x86_64/550.163.01/README/openglenvvariables.html
[N19]: https://docs.nvidia.com/deploy/driver-persistence/index.html
[N20]: https://docs.nvidia.com/deploy/driver-persistence/persistence-daemon.html
[N21]: https://docs.nvidia.com/deploy/nvidia-smi/index.html
[N22]: https://download.nvidia.com/XFree86/Linux-x86_64/560.35.03/README/kernel_open.html
[N23]: https://forums.developer.nvidia.com/t/595-release-feedback-discussion/362561
[N24]: https://forums.developer.nvidia.com/t/580-release-feedback-discussion/341205
[N25]: https://docs.nvidia.com/datacenter/tesla/tesla-release-notes-595-112-07/index.html
[P1]: https://deb.debian.org/debian/dists/trixie/non-free/binary-amd64/Packages.xz
[P2]: https://deb.debian.org/debian/dists/trixie-backports/non-free/binary-amd64/Packages.xz
[P3]: https://developer.download.nvidia.com/compute/cuda/repos/debian13/x86_64/Packages.gz
[P4]: https://docs.nvidia.com/datacenter/tesla/driver-installation-guide/latest/debian.html
[P5]: https://developer.download.nvidia.com/compute/cuda/repos/debian12/x86_64/Packages.gz
[P6]: https://security-tracker.debian.org/tracker/source-package/nvidia-graphics-drivers
[P7]: https://deb.debian.org/debian/dists/trixie/contrib/binary-amd64/Packages.xz
[P8]: https://deb.debian.org/debian/dists/trixie-backports/contrib/binary-amd64/Packages.xz
[P9]: https://docs.nvidia.com/datacenter/tesla/driver-installation-guide/latest/version-locking.html
[C1]: https://github.com/chromium/chromium/blob/f45262ae78835ec26ff8be22aa15fa0e38f726d4/media/gpu/gpu_video_encode_accelerator_factory.cc
[C2]: https://github.com/chromium/chromium/blob/f45262ae78835ec26ff8be22aa15fa0e38f726d4/media/gpu/BUILD.gn
[C3]: https://github.com/chromium/chromium/blob/f45262ae78835ec26ff8be22aa15fa0e38f726d4/media/base/media_switches.cc
[C4]: https://github.com/chromium/chromium/blob/f45262ae78835ec26ff8be22aa15fa0e38f726d4/gpu/config/gpu_driver_bug_list.json
[V1]: https://github.com/elFarto/nvidia-vaapi-driver/blob/443050726fdb30888a2ced1cea1c5d036ea3b15c/README.md
[G1]: https://git.dec05eba.com/gpu-screen-recorder/plain/README.md
[G2]: https://git.dec05eba.com/gpu-screen-recorder/plain/src/cli/main.c
[G3]: https://git.dec05eba.com/gpu-screen-recorder/plain/src/capture/nvfbc.c
[A1]: https://github.com/google/angle/blob/fd19437f535d986d969850e761a59b41b9bdffef/src/libANGLE/renderer/vulkan/README.md
[A2]: https://github.com/google/angle/blob/fd19437f535d986d969850e761a59b41b9bdffef/src/libANGLE/renderer/vulkan/doc/PipelineCreation.md
[A3]: https://github.com/google/angle/blob/fd19437f535d986d969850e761a59b41b9bdffef/src/libANGLE/renderer/vulkan/vk_renderer.cpp
[K1]: https://docs.vulkan.org/refpages/latest/refpages/source/VK_KHR_video_encode_queue.html
[K2]: https://registry.khronos.org/OpenGL-Refpages/gl4/html/glFinish.xhtml
[U1]: https://forums.developer.nvidia.com/t/performance-regression-for-vkcreatedevice-with-gsp-firmware-enabled/326581

## For the owner

Updating may help, but we have no proof it fixes the long frames. It will not give Linux Chrome hardware video recording. Try checking shader caches and power behavior first, then use a backed-up, pinned production-driver trial if you approve the downtime. Keep the working GL-EGL mode, compare the same runs, and restore the old guest if reliability gets worse. The driver upgrade is a useful maintenance experiment, not a shortcut around diagnosing the stalls.
