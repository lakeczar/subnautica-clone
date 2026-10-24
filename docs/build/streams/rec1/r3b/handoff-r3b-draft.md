## R3b: the recorder's cost, fixed at its root (coordinator decision after R3)

The recorder code is final at `2a34d71f`. After it there are harness and script changes only:
- `adverse.mjs`'s pause rule at the recording's own rate;
- `owner-check-serve.sh`;
- the pack names HEVC.

R3b was a decision, not a compromise: the owner's 1% budget is part of the recorder's promise.

**Result: the budget is met on our machines.** ACCEPT

### What the cost was, and what fixed it

All runs are within-run alternations: the recorder is paused and resumed in place every 10 s, on/off/off/on, and adjacent windows are paired.
- "Paused" is truly off. The video segment ends and the encoder is flushed and closed; no frames, events or renderer timing are recorded. The recording's timing setting is restored on resume (`296d21a5`).
- Main-thread task time per frame (CDP).
- Fixed pose: the refuge-reef fixture (`docs/build/streams/rec1/fixtures/hold-refuge-reef.json`).
- Owner-browser Chrome, 3090 exclusive unless named.

1. **The recorder's direct page costs (`3141b1e9`).**
   - What changed: a playtest's GPU timer queries run on one frame in eight (a driver's on every frame); the JS heap is read only in the 4 Hz sample and on long frames; a playtest's snapshots are encoded and written in the spool worker.
   - Telemetry alone before (`29df729f`, 30 pairs): +0.24 (0.09 to 0.40).
   - Telemetry alone after (`9b92d2ff`, 15 pairs): +0.02 (−0.25 to +0.30), and +0.05 (−0.07 to +0.18) with timing off.
   - The 4 Hz sample costs about 0.04 ms a sample (`--bench-sample`).
2. **What remained was taking each picture off the WebGL canvas, not encoding it.**
   - At `81b6979d` (15 pairs each): capture only (encoder off) +0.26 as an ImageBitmap and +0.28 as a direct VideoFrame; the full VP9 path +0.18.
   - At `3fcd3e3c`: `canvas.captureStream` with `requestFrame` was no cheaper. Capture alone was +0.23 and VP9 +0.25, with renderer process CPU 466 ms/s against 333 for the bitmap.
   - At 12 fps the whole playtest path was +0.178 (+0.073 to +0.284; `9b92d2ff`, 45 pairs, 15 min; one major page fault flagged it DISTURBED), against +0.224 (+0.161 to +0.287) at `dcc64dfc` before the direct fixes.
   - The cost scales with pictures per second, and every way a page can take a picture pays it.
3. **The decision (coordinator, 2026-10-24): the software rung captures 6 fps; the hardware path keeps the owner's 12 fps.** The reasoning, as given: "This isn't a quality compromise. The software rung exists only for our bot and test footage, and agents combing test footage don't need 12 fps."
   - It is an explicit ladder property (`fps` on every rung in `encoders.ts`). The recording's header, `summary.json`'s `video` and the story's video check all state it, for example "in-game software VP9 960x540 6 fps (test-machine fallback; the owner's hardware path is 12 fps)".
   - Key frames are every 2 s at either rate. The pack's gaps, coverage, held tiles and strips read the recording's own rate.
   - `adverse.mjs` passes every phase at 6 fps: clock (0 misdated, H.264 across rotations included), throw, removals, backpressure, timeline and dpr2. Its pause rule now allows the last picture captured before a pause, which is one capture interval at the recording's rate.

### The encoder ladder (owner policy: hardware first; the CPU at 960×540 only on Linux test machines)

- **One ladder** (`src/runtime/flight/encoders.ts`): hardware AV1, then H.264, then HEVC, then VP9 (the research's order for an RTX 40 laptop); then software VP9 and VP8.
  - Each rung names its codec, hardware or software, container, Matroska codec ID, WebCodecs extras and capture rate.
  - The page asks the browser down the ladder once per recording, VBR then CBR, and takes the first rung it supports. The worker opens that rung, or the ones below it in the same container if the browser refuses it after all.
  - A new codec, profile or container is a row (plus a writer for a new container), not new control flow.
- **Windows never encodes on the CPU automatically:** no hardware encoder means no video, recorded as such. Software rungs are allowed only on Linux.
- **H.264 and HEVC** are written as Matroska (`.mkv`) by the same writer as WebM: H.264 has its `avcC` as CodecPrivate. HEVC would have its `hvcC`, but that's untested, because no machine here encodes HEVC. The worker keeps the encoder's decoder configuration, so every segment after a rotation has it too.
- **The pack** remuxes `.mkv` in place and writes a playable `.mp4` beside it for the timeline page. Strips fall back to the system ffmpeg, because Playwright's has no H.264.
- **The software fallback** is 960×540 at 6 fps. It's owner-approved, and it doesn't touch the owner's footage.

**Encoders the test machines' Chrome offers** (`scripts/rec/encoder-probe.mjs`: `isConfigSupported` with `prefer-hardware`, at 720p and 540p, from a secure local page, for AV1, VP9, HEVC, and H.264 baseline, main and high):

| Machine | Hardware | Software | `chrome://gpu` |
| --- | --- | --- | --- |
| factory-worker, RTX 3090, run flags (`--use-angle=gl-egl`) | none | all except HEVC | "Accelerated video encode has been disabled, either via blocklist, about:flags or the command line." |
| Same, plus `--enable-features=VaapiVideoEncoder,VaapiVideoDecodeLinuxGL,VaapiIgnoreDriverChecks,AcceleratedVideoEncoder` (probe only) | none | the same | the same |
| alickers sandbox, RTX 4070 Laptop (WSL2, Linux Chrome) | none | the same | the same |

The media log names the encoder that ran (`VpxVideoEncoder`, `kIsPlatformVideoEncoder: false`).

**Why there's no hardware encoder on Linux:**
- Chrome on Linux encodes in hardware only through VA-API.
- factory-worker has libva but no VA-API video driver, and NVIDIA ships none that encodes.
- No Chrome flag exposes NVENC on Linux.

So no flag is enabled, and none would be safe to ship.

**The sandbox's D3D12 VA-API path (research §8) isn't testable yet.** The owner approved installing `mesa-va-drivers`, `vainfo` and `ffmpeg` inside the WSL sandbox only. The install job (`scripts/rec/alickers-vaapi.sh`, ticket 261024-130307-d219) found that the sandbox user has no non-interactive `sudo`. It stopped with nothing installed, as instructed.
- **The inventory:** `/dev/dxg` and `/dev/dri/renderD128` are present; there's no VA driver, no `vainfo` and no system ffmpeg.
- **To proceed:** someone with sudo inside the sandbox runs `sudo apt-get install --no-install-recommends mesa-va-drivers vainfo ffmpeg`.
  - To remove: `sudo apt remove mesa-va-drivers vainfo ffmpeg && sudo apt autoremove`.
  - Then the same script probes read-only: `vainfo` encode entrypoints with `LIBVA_DRIVER_NAME=d3d12`, the native `h264_vaapi` encode, and Chrome's VA-API path only if that encodes.

### R3b evidence, by the commit it ran at

| Run | Commit | Ticket | Result (ms/frame, paired 95% interval) |
| --- | --- | --- | --- |
| **Acceptance, 6 fps software rung, 15 min, 3090 exclusive** | ACCSHA | ACCTICKET | ACCROW |
| Rehearsal of the same command, `--stall 200` (RTX 4070 Laptop, indicative) | `2a34d71f` | 261024-222630-f4fb | +0.107 (+0.044 to +0.169), 45 pairs, no stall |
| 12 fps playtest, 15 min, 3090 exclusive | `9b92d2ff` | 261024-203711-5c1c | +0.178 (+0.073 to +0.284), 45 pairs, DISTURBED (one major fault) |
| 12 fps playtest before the direct fixes | `dcc64dfc` | 261024-130050-fb9a | +0.224 (+0.161 to +0.287), 45 pairs |
| Per-window CPU profiles: telemetry, telemetry without timing, VP9 (after the fixes) | `9b92d2ff` | 261024-203711-eb08 | +0.02, +0.05, +0.19 (15 pairs each) |
| Capture paths: bitmap, VideoFrame, VP9 from VideoFrame | `81b6979d` | 261024-211638-b094 | +0.26, +0.28, +0.18 |
| captureStream: capture only, VP9 | `3fcd3e3c` | 261024-215134-7c3f | +0.23, +0.25 |
| Fast tier | `2a34d71f` | 261024-222630-d899 | 1,476 pass |
| `adverse.mjs` at 6 fps | `2a34d71f` | 261024-222630-5596 | every phase passes once the harness's pause rule reads the rate (re-judged at `eed2f2e8`) |

Curated copies of these runs are in `docs/build/streams/rec1/r3b/`.

**Decomposition provenance.** The 4070 run 261024-131031-f36a used CW-1's derived save (`/work/tmp/cw1/saves-8x/seg0.json`, which is present on the sandbox) through a default path in `decomp.sh`. That hid a factory-worker-style path from the lane's guard. Relative shares are what that run is for, so it was allowed to finish. From `7bcbfb90` on, `decomp.sh` takes its save from the SAVE-1 library (`saves.js pick`) or a repository fixture, and records which in `save.json`.

### The owner-PC check (Missing until the owner runs it)

The owner's own path is hardware on their Windows laptop, which our machines can't reach. `docs/build/streams/rec1/OWNER-PC-CHECK.md` is the one-page procedure. The build is served from the alickers sandbox on the owner's own laptop with `scripts/rec/owner-check-serve.sh`, through the 4070 lane:
- the lane pins the commit and keeps other jobs off the laptop while the owner measures;
- WSL2 forwards the sandbox's localhost to Windows Chrome.

The check reports:
- the browser's encoder grid;
- the encoder the recording chose;
- an in-page on/off frame-work A/B, judged against the same 0.167 budget.

### Follow-ups (not in REC-1)

- **OffscreenCanvas rendering (option 3; not now):** this is a possible future root fix for the capture cost.
  - If the game rendered on an OffscreenCanvas in a worker, the picture could be taken off the main thread at no cost to the game's frame.
  - It would also let the software rung return to 12 fps.
  - It belongs to a future renderer stream, not the recorder.
- **REC-1b, storage risk 3** (STORAGE-ENVELOPE §4): probe a denied OPFS and route that case to `memoryZip`.
- **REC-2, storage risks 2, 4, 7 and 8** (STORAGE-ENVELOPE §4).
- **The sandbox's D3D12 VA-API probe,** once someone with sudo installs the three packages (above).
