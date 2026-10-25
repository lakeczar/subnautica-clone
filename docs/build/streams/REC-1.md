# REC-1: the flight recorder and evidence pack (handoff)

## R3b (coordinator decision after R3): the recorder's cost, fixed at its root

The recorder code is final at `2a34d71f`. After it there are harness and script changes only:
- `adverse.mjs`'s pause rule at the recording's own rate;
- `owner-check-serve.sh`;
- the pack names HEVC;
- the period check, the duet and its declaration (`scripts/rec/period.sh`, `period.mjs`, `duet.sh`, `duet.mjs`, `span-faults.mjs`, `run.mjs --window`, `decomp.sh` with a prebuilt `DIST`).

R3b was a decision, not a compromise: the owner's 1% budget is part of the recorder's promise.

**Result: the budget is met on our machines.** The 3090 exclusive duet, declared before it ran: recorder on minus paused **+0.109 ms/frame, 95% interval +0.080 to +0.137** (n = 96 of 108 pairs, 12 excluded under the declared rule), under the 0.167 budget. Without the exclusion it is also met: +0.093 (+0.031 to +0.155), n = 108. The test machines' rung is software VP9 at 960×540 and 6 fps. The owner's own hardware path is Missing until the owner-PC check.

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
4. **The first 6 fps acceptance was inconclusive, because of noise from the host.**
   - At `eed2f2e8` (261024-231132-692c, 45 pairs, 15 min): +0.120 (+0.015 to +0.224).
   - About every 5 minutes, frames slowed to 3.6–4.6 ms against 2.9 for 10–25 s, in paused windows as often as recording ones. The pair sd was 0.34.
   - **The slow windows are locked to the wall clock:** in 5c1c and 692c, started 2.5 h apart, at the same time modulo 5 min.
   - **After the host's CPU isolation** (2026-10-25), a recorder-off hold in 5 s windows ran with a per-process sampler beside it (`scripts/rec/period.sh`, 261025-014714-dfd1).
     - Bursts of +0.9 to +1.8 ms for 15–25 s remain while the VM is quiet (other processes below their median, no steal), about 280–290 s apart.
     - That fits the host's Hermes `job-matcher` (bursts about every 4 min 45 s; fleet's report). Before the isolation, the gaps were 300–310 s.
     - It is not the recorder (off throughout), and not the game: the game's periodic work follows its own clock, not the wall clock.
     - Routed by the coordinator to the owner and fleet.
   - The run also showed that an exclusive job that compiles inside its window disturbs itself: 692c's 80 major faults all came in its first 26 s, during its own build. Exclusive windows never compile (DIRECTION convention 9).
5. **The acceptance: a duet, declared before it ran** (`docs/build/streams/rec1/r3b/duet-declaration.json`; approved by the coordinator at `a934d88d`, amended by two rulings before any window was read).
   - **Design:** 108 pairs of 10 s windows; the budget 0.167 ms/frame; a paired 95% t interval.
     - Verdict: met if the upper end is under the budget, not met if the lower end is over it, otherwise inconclusive.
     - Exclusion: a pair is dropped as a whole when either window is more than 0.6 ms over its ticket's median, so both arms lose the same time. Justified beforehand by the recorder-off bursts (4).
     - Power: planned for a true 0.10 at sd 0.20 (null pairs after the isolation: 0.159–0.176), about 90% chance of "met".
   - **Amendment 1 (`e52841b6`):** the single 36-minute ticket (261025-043054-e104) was stopped at the exclusive class's 30-minute ceiling, which `--deadline` does not raise; that was my sizing error. The same 108 pairs became two exclusive tickets of 54, pooled only when both are complete at one commit, build hash and machine. One rerun of a failed ticket, else no verdict. `duet.sh` now refuses a declaration whose ticket time, startup and a 10% margin included, exceeds the class ceiling. e104's partial windows are archived as incomplete, never read and excluded.
   - **Amendment 2 (`d686040c`, made blind):** major faults label a ticket DISTURBED only inside its measured span. e5c0's 16 faults all came at 2–7 s, during Chrome's launch; its span starts at 45 s at the earliest (`scripts/rec/span-faults.mjs`, timing only). So it was clean, and its queued rerun (261025-062916-91a8) was cancelled unrun. 3aeb took no faults and no other label.
   - **Jobs:** the build on an ordinary seat (261025-051941-8bd7, build `bffc97737c9762be` at `e52841b6`), then two exclusive tickets back to back from it on the 3090: 261025-052049-e5c0 (05:46–06:05Z) and 261025-052049-3aeb (06:27–06:46Z). Both complete; frame gaps p99 16.8 ms, none over 33 ms.
   - **Result:**

     | Ticket | On minus paused | n (excluded) | Excluded pairs' high window | Median window |
     | --- | --- | --- | --- | --- |
     | e5c0 | +0.125 (+0.089 to +0.161) | 48 (6) | off, off, on, on, on, on | 2.77 ms |
     | 3aeb | +0.092 (+0.047 to +0.138) | 48 (6) | off, off, on, on, off, off | 2.73 ms |
     | **Pooled (the verdict)** | **+0.109 (+0.080 to +0.137): MET** | 96 (12) | 6 on, 6 off | |
     | Pooled, nothing excluded | +0.093 (+0.031 to +0.155) | 108 | | |

   - **The excluded pairs are the host's bursts:** they fall about 280–290 s apart (e5c0: 05:49:39, 05:54:09–19, 05:59:00–30, 06:04:10; 3aeb: 06:28:51, 06:33:31–41, 06:38:51, 06:43:32–42), and their high window is the paused arm as often as the recording one.
   - **Known external event:** STEW-3's builder ran one 50 ms local `node` probe outside the queue while a REC-1 exclusive was running, most likely during e5c0 (05:46:24–06:05:11Z). STEW-3's handoff records no time, so it can't be placed in a window. It is not grounds for exclusion either way.
   - Renderer process CPU 322 ms/s in both tickets (the encoder and readback in the page's process, against 315 off at R3).

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
| **Acceptance duet, 6 fps software rung, two 3090 exclusive tickets, pooled** | `e52841b6` | 261025-052049-e5c0, 261025-052049-3aeb (build 261025-051941-8bd7) | **+0.109 (+0.080 to +0.137), MET**; n = 96 of 108 (12 excluded as declared); unexcluded +0.093 (+0.031 to +0.155) |
| Single-ticket duet, stopped at the exclusive ceiling | `a934d88d` | 261025-043054-e104 | incomplete, never read, excluded |
| Duet rehearsal, the same two-phase command, `--stall 300` (RTX 4070 Laptop, indicative test-machine result: about 42 fps, p99 frame gap 50 ms, recording windows 6% fewer frames) | `a934d88d` | 261025-033553-5fd5 | +0.205 (+0.186 to +0.224), 108 pairs, 0 excluded, sd 0.099. The first attempt, 261025-021147-dcbb, ended when the laptop left the network |
| 15-min rehearsal, `--stall 200` (RTX 4070 Laptop, indicative test-machine result: about 56 fps, p99 33 ms) | `2a34d71f` | 261024-222630-f4fb | +0.107 (+0.044 to +0.169), 45 pairs |
| 6 fps playtest, 15 min, 3090 exclusive (built inside the window) | `eed2f2e8` | 261024-231132-692c | +0.120 (+0.015 to +0.224), 45 pairs, sd 0.34, DISTURBED (its own build) |
| Recorder-off hold, 5 s windows, with a per-process sampler (3090, non-exclusive, after the CPU isolation) | `f4811a2a` | 261025-014714-dfd1 | host bursts +0.9 to +1.8 ms, about 280–290 s apart; null 10 s pairs sd 0.159–0.176 |
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
- WSL2 forwards the sandbox's localhost to Windows Chrome. This is untested from Windows; the one-minute test (261024-231230-7c3b) checked the server from inside the sandbox only.

The steps, in plain words:
1. The coordinator starts the server: `heavy-check submit --machine 4070 --deadline 4200 --stall 600 -- bash scripts/rec/owner-check-serve.sh 60`. Wait for its "serving" line. It builds the commit of the submitting worktree, so submit it from REC-1's head.
2. The owner closes heavy programs, plugs in the laptop and opens `http://localhost:4173/?rec=playtest&recmeasure=1&reccheck=300` in Windows Chrome.
3. They follow `OWNER-PC-CHECK.md`: begin a new expedition or import a save; hold still in open water for 5 minutes; copy the media-internals and `chrome://gpu` lines; send the downloaded `siltwake-recorder-check.json`.

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
- **For a future 30 fps preset** (input, not a finding against REC-1): the software rung's cost appears to grow when the machine is saturated. On the RTX 4070 Laptop it was +0.107 ms/frame at about 56 fps and +0.205 at about 42 fps (both indicative).
- **The host's periodic bursts** (+0.9 to +1.8 ms for 15–25 s, about every 4 min 45 s, fitting Hermes `job-matcher`): with the owner and fleet (coordinator).

## R3 (Sol R3 `31378375` on `becc169f`: four P2s, one P3)

Recorder code final at `68d0d60c` (the fixes below). After it: measuring options in `run.mjs` and `overhead.mjs`, and one measurement-only URL switch (`?rectiming=0`). Tests: `tests/rec1-capture.test.ts`, with four R3 cases added. Browser: `scripts/rec/adverse.mjs` gains three real-worker phases, and every phase is now bounded and logged.

| Finding | What changed | Checked by |
| --- | --- | --- |
| **R3-1** a video exception rejected the shared queue | Each worker operation runs inside one handler whose failure the queue catches. A failed video operation closes its picture and the encoder, keeps the segment written so far, and reports `videoError`. Every request still gets its reply, with the error, so nothing waits. The capture ends the video and records a loss fact ("the video encoder failed …; no video after this moment") and a gap | `adverse.mjs` on the 3090 host, with a worker whose encoder throws on its tenth picture: the export finishes in 20 ms; the loss fact and the telemetry recorded after the failure are both in the export. `rec1-capture`: the same through the fake worker |
| **R3-2** a locked older recording reported as removed | The worker tells a deletion that happened from an absent file (fine) and a refused one (`NoModificationAllowedError` and similar: nothing freed). Space is credited, and a removal recorded, only on confirmation. A refused file is recorded (`removalRefused`, with session, file, bytes and why), stays counted, and is never planned again; with it counted, an exhausted budget stops the recording and names it. Recordings this page still holds (the running one and the latest completed, exportable) are pinned against any other capture's budget. A stopped recording releases its file handles, which an export reopens | `adverse.mjs` against real OPFS bytes. Off → on with a 1 MiB budget: the previous recording keeps its bytes (640,971) and still exports. Another context holds a 3 MiB older file: its bytes stay on disk (3,145,728), its refusal is in the ledger, nothing is credited, and the new recording stops honestly. `rec1-capture`: refused and pinned cases |
| **R3-3** encoder drops invisible | Every picture not captured is a timestamped stretch in the ledger (`videoGaps`), kept after Off with counts (`videoDrops`): `lost` (skipped on the main thread, refused by the encoder, or after an encoder failure) or `still` (no frame drawn: a stall or a hidden tab). Each names the picture the video holds. Completeness reports lost stretches. Coverage counts only fresh pictures. Strip tiles inside a stretch are dimmed and labelled ("NO PICTURE (not captured) · held from 1.98s"). The timeline marks stretches on its chart and names them over the video when the cursor is in one | `adverse.mjs`: an encoder held behind for 2 s while 22 barcodes were drawn. The exported pack says "recording complete: partial: 24 video pictures not captured in 1 stretch (2.0 s: the encoder was behind)" and "video: partial: 67% with fresh pictures; 2.0 s without". The gap strip's 24 tiles are marked held from the picture before the gap. `rec1-capture`: the gap, its counts after Off, completeness, coverage, the tile label |
| **R3-4** the inclusive cost | **Measured; the budget is not met; not yet fixed.** See below. **Fixed and met in R3b** (above) | twelve exclusive tickets |
| **R3-5** "conclusive" | `overhead.mjs` prints each mode's figures and, against off, the paired differences with their range and a paired t 95% interval, labelled with n and its assumptions. The owner's budget is a separate line. `--collect` builds the report from runs made one per ticket; renderer and GPU process CPU are columns | the reports below |


### R3-4: the recorder's inclusive cost, measured

**Design (declared before the runs):**
- Same save and pose (`--hold`: no travel, 20 s settle, 60 s measured), same settings; owner-browser Chrome (no precise-memory flag); served as a static host serves it.
- One run per exclusive ticket under TST-16's priority slice, in ABBA, then ABBA and BAAB order. Each run is one unit, paired with its neighbour.
- Criterion: the 1% budget (0.167 ms per frame) is met only if the paired 95% interval's upper end is under it. The whole window is judged; the median of 10 s windows is reported beside it, not substituted.

**Result at `68d0d60c`, RTX 3090, six pairs** (`ab-1` … `ab-12`). One leg was flagged DISTURBED for a single major page fault.

| Scope | Off | Playtest | Paired Δ (95% interval, n = 6) |
| --- | --- | --- | --- |
| Main thread, ms per frame (every task and collection) | 3.08 | 3.49 | **+0.42** (−0.14 to +0.97); the quietest runs differ by about 0.30 |
| Renderer process CPU, ms per s (all threads: page, worker, encoder) | 315 | 561 | **+246** (+161 to +332) |
| GPU process CPU, ms per s | 449 | 357 | −92 (−110 to −74) |
| Recorder self-time, ms per frame | — | 0.094 | — |

**Verdict: the budget is not met.** The best estimate is about 0.3–0.4 ms per frame, or 2–2.5% of a frame: two to four times the budget, and four times the recorder's self-time. Off the main thread, the VP9 encoder in the spool worker takes about a quarter of one core.

**Where it goes (diagnosis so far):**
- Not the video. A playtest without video costs the same (3.92 against 3.78 ms; a shared run).
- Not allocations. A sampling heap profile at the hold shows 32.4 MiB/s off and 32.8 MiB/s playtest.
- The extra time is inside the game's own frame callback (work p50 2.5 → 3.0 ms), spread evenly across the game's own functions. In a sampling profile, `isReady` rises 30%, `dataInBox` 35%, `update` 21%, and collection from 2.5 to 4.1 ms/s.
- What recording switches on besides its own code is the renderer's per-part timing and GPU timer queries (`renderer.timing`). A decomposition is queued behind CW-1's series to test that: off, playtest, playtest without timing, without video or timing, and driver mode (`--no-timing`, `?rectiming=0`).
- **Root fix:** whatever that run names. If it's the renderer's timing, sample it (one frame in N) or drop GPU queries in playtests. **Cost:** frame rows lose per-frame GPU time or part of their split.

The earlier figures are superseded: R2's pooled travelling pairs (+0.30 ms, wide) and the diagnostic in-ticket hold (+0.15 ms, with the precise-memory flag).

Also: the snapshot's first callback is charged to the recorder; the drivers' precise-memory flag can be turned off (`--owner-browser`) to measure a player's Chrome; the resource guide's cost line and the first handoff's bold sub-1% claim are corrected.

## R2 (Sol R2 `370f2dea` on `f9c04948`: seven P2s)

Runtime code is final at `126b2cc6`; after it come `run.mjs --profile` (a measuring option), the handoff and curated evidence. Tests: `tests/rec1-capture.test.ts` (new: the real `FlightCapture` against a fake spool worker that answers in order and can refuse writes), `rec1-flight.test.ts`, `rec1-pack.test.ts`, `rec1-retention.test.ts`. Browser checks: `scripts/rec/adverse.mjs` (new; the flight modules in a task-owned Chrome, a barcoded canvas, every encoded frame decoded).

| Finding | What changed | Checked by |
| --- | --- | --- |
| **R2-7** the segment clock | The in-game video is now encoded with **WebCodecs in the spool worker**, which also writes it (`webm.ts`: a minimal live WebM writer). Each picture is copied and scaled on the GPU in the frame that drew it, as before, and handed to the encoder with that frame's page time. The file's block times are those times, less the segment's origin. The origin is the first encoded picture's time, as the worker stamped it (`videoOrigin`), not a request time. A stall, a restart, a rotation or a page with no frames is a gap in the file, never a compressed interval. MediaRecorder and the capture canvas are gone, along with the copy of every picture. An export no longer re-sends a picture with the cutoff's time (the screen may have moved on). The video needs the playtest spool, so a driver records its own, as it always did. Without WebCodecs: no video, with a warning | `adverse.mjs` on the 4070 at `126b2cc6` (decoded here with a full ffmpeg, `--decode`): 11 segments, 208 frames, **0 misdated**. Covered: an ordinary segment, a 1.5 s stall before a segment's first picture, a 1.5 s stall right after its first hand-over, a restart, 2 s rotations, 6× CPU throttling, a 2 s pause (repeats), 2.5 s with no frames. Every frame showing picture *k* is dated within *k*'s lifetime (±2 ms), and the video reaches the export cutoff. In a pause, the repeated picture may be the one before the last drawn: a frame drawn after the last capture cannot be captured later. That is at most one capture interval (83 ms), and the check allows exactly that. **A real hidden tab was not checked:** headless Chrome never reports a page hidden, even minimized (recorded in the run). No frames at all is the recorder's view of one |
| **R2-6** the probe divided by callbacks | `run.mjs` counts one frame per rAF timestamp (the soak's frame recorder and the game share each), sums the frame's callbacks, and reports task time per frame and per measured second. `overhead.mjs` carries both. The retained A/Bs are recomputed and replaced below. Deferred self-time is charged: idle frames, the video picture's later task, a picture's encoding completion and the spool's replies | the corrected A/B (below) |
| **R2-3** Off discarded a picture still encoding | `stop()` admits nothing new, then finishes what is in flight (bounded at 10 s) before its final flush. A pending picture is never declared missing because Off or an export came while it was encoding, only after its 10 s, or when still encoding at the recording's end. An export awaits that finish | `rec1-capture`: Off during a delayed successful encoding (the JPEG is written and indexed); Off during a failing one (declared missing with why) |
| **R2-2** silent loss | The header's ledger (`retention`) holds every ring's cumulative overwrites (frames, samples, events, pictures), refused writes, this recording's budget removals, older recordings' removals (session, file, bytes, why: their history, kept apart from this recording's evidence), an early stop and an export copy's overage. The memory-only export carries the rings' losses too. An export waits for the worker's barrier, so every write before it is acknowledged or refused, before it writes the header. A refused header write fails the export. Telemetry is posted as UTF-8 bytes, counted exactly. A refused write leaves the backlog. Completeness needs the ledger: a header without it is unknown, never "nothing lost". Pictures are checked up to the export cutoff | `rec1-capture`: an event-ring overflow in the exported header and the integrity verdict; the memory export's losses; UTF-8 counting and backlog after a refusal; a refused write before an export in that export's header; an older recording's removal recorded |
| **R2-1** the budget's exceptions | When nothing but this recording's telemetry is left over the budget, with video already off, the recording **stops** with a durable fact (`retention.stopped`, a loss entry "nothing after this moment was recorded", an event) and stays exportable. An export first clears older recordings and exports, never this recording's data. It records any overage of source plus copy (`retention.exportOver`). The copy is out of the budget's reach for 2 minutes while it downloads, then it is the first to go | `rec1-capture`: telemetry-only over a 1 MiB budget with video off (stopped, fact in the exported header); an export copy over the budget (overage recorded) |
| **R2-5** superseded workers | `retire()`: stop, finish, wait for an export in progress, then close the worker. The app retires the completed recording a new Off supersedes, and keeps the latest exportable | `rec1-capture`: four Off/on cycles, one worker alive, the latest still exports. `adverse.mjs` with real workers and a forced collection: **1** spool worker alive after four retirements, and the latest exported |
| **R2-4** long timelines | No series is spread into function arguments. The page carries at most about 30,000 frame points (wider bins in a long run; each keeps its worst gap) and 3,000 points per memory series. It draws one worst value per pixel column and finds points by binary search | `rec1-capture`: ten hours of frames (360,000) and two 4 Hz memory series stay bounded, and a lone long frame survives. `adverse.mjs`: the ten-hour page loads and draws in 53 ms, seeks in 5 ms, resizes, no page errors; DPR 2 sizes stable through redraws |
| **STEW-1 guard** | The idle-video experiment script (a browser and server driver outside `scripts/rec`) is deleted; its question went away with MediaRecorder. `adverse.mjs` uses the shared launcher (`imaging.mjs` `composer`) | the guard |

### R2 evidence, by the commit it ran at

Code final at `126b2cc6`; later commits are docs and curated evidence only.

| Evidence | Ran at | Machine | Result |
| --- | --- | --- | --- |
| `npm run test:fast` | `126b2cc6` | 4070 lane (`261024-001803-967d`) | 1,468 of 1,468 |
| Playtest export check, default settings (note, immediate export, more play, export, Off, export) | `126b2cc6` | RTX 3090 (`261024-003502-2ea4`, snapshot) | pass: the note at 84.43 s, video to 84.45 s; the second export covers to 103.53 s (video 105.03 s); the third ends at the Off switch; nothing absent, no page errors |
| Same, 6 MiB budget, 15 s segments | `126b2cc6` | RTX 3090 (same ticket) | pass: video to 143.73 s past the note at 143.59 s, 10–11 segments, 7 then 8 removals recorded in the ledger |
| Recorded pack (150 s) | `126b2cc6` | RTX 3090 (same ticket) | partial by design (frame times unjudged in a shared run; memory needs ≥ 10 min): 9,097 frames, none over 33 ms; recorder 0.056 ms mean, 0.21 ms p99; no errors, nothing lost |
| Playtest export check, default settings | `126b2cc6` | RTX 4070 Laptop (indicative; built in the job) | pass: the note at 129.78 s, video to 130.03 s, nothing absent or missing, no page errors (an 18 s stall in the run: the sandbox's) |
| Same, 6 MiB budget | `126b2cc6` | RTX 4070 Laptop (indicative) | pass: video past the note, 12–13 segments, 9 then 11 removals recorded |
| `adverse.mjs` (clock, workers, long timeline, DPR 2) | `126b2cc6` | RTX 4070 Laptop (indicative; video judged here with `--decode`) | pass: 208 frames in 11 segments, 0 misdated, the video to the cutoff; 1 worker alive after four retirements; the ten-hour page in 53 ms; DPR 2 stable |
| Exclusive owner-path A/B (off against playtest, corrected probe) | `126b2cc6` | RTX 3090 | **inside the noise** over four clean off/playtest pairs. The pairs come from rounds 2 and 3 of `261024-003520-0843` and of `261024-032100-17b1`; each ticket's round 1 is excluded because it overlapped the coordinator's local work, and neither ticket was flagged DISTURBED. Main thread per frame: off 3.48 ms (spread 0.45), playtest 3.78 ms (spread 0.36). The paired difference averages 0.30 ms (1.8% of a frame; 19 ms per second) but scatters from −0.02 to +0.58 ms, a 95% interval of about −0.13 to +0.73 ms. The callback work moves with it pair by pair: the scatter is the game's own work, each run travelling through a different scene at a different moment. Recorder self-time 0.084–0.091 ms in every run (0.53%). A sampling profile (`run.mjs --profile`) attributes about 0.09 ms per frame to recorder code (`performance.memory` reads, `createImageBitmap`, `postMessage`), with no extra collection or browser work. **Not established either way:** see Missing |

An earlier 4070 run at `525caf8e` declared one picture missing: it was taken during the load, just before a 21 s stall, and its 10-second limit expired before its encoding could run. That limit is gone (`70e1671b`): a picture waits as long as it is still encoding. The `126b2cc6` runs above are after the fix.

**The old A/B numbers, corrected (R2-6).** Recomputed from the retained probe files with one frame per rAF timestamp. Both runs were DISTURBED, so neither establishes the recorder's cost:

| Run | Off, ms per frame (spread) | Playtest | Δ per frame | Δ per second |
| --- | --- | --- | --- | --- |
| `af6d85de` | 3.54 (0.85) | 4.36 (1.92) | 0.82 ms, inside the noise | 49 ms |
| `48b0f251` | 3.59 (0.21) | 4.17 (1.05) | 0.58 ms, inside the noise | 35 ms |

The figures quoted in R1 (Δ 0.29 and 0.41 ms) halved these and are withdrawn.

## R1 (Sol R1 `32d6ef3c`, the codebase-health audit F21/F22, SIM-1's composition notes)

Final `9b150449`. Root merged last at `af6d85de` (root `f0dc680d`, SAVE-1 and SCHED-2b included); CW-1 merged up to `cef40de9`, top-k light selection included. Tests: `tests/rec1-flight.test.ts`, `rec1-pack.test.ts`, `rec1-retention.test.ts`, `soak-measure.test.ts`. **CW-1's newer `fd457d3d`** (cave light textures filled a slab budget per frame; tour driver) is not merged, so the view evidence is not moved under it. A trial merge with it has no conflicts, typechecks clean and passes 1,456 of 1,456 tests. Its fast tier went over only on `caves-reef.test.js`'s CPU budget (10.5 s against 10; 9.5 s on REC-1 alone), measured under load from an exclusive run, so not judged.

| Finding | What changed | Checked by |
| --- | --- | --- |
| **F1** streaming overrun could pass | Two observations, never merged: a **callback** over budget is its own (cause from its own split); an **interval** over budget belongs to the callback that ran in it (the previous row: its split, its GPU time), plus what ran outside. The pack fails a streaming overrun of either kind; a group leads with it. | The review's two rows (fail, 2 of 2), a GPU-only delay ("GPU"), an outside-task delay |
| **F2** / audit F21 false-stable images | `stable` is a successful comparison (`views/stable.mjs`); exhaustion stays unstable with the last two pictures kept; accept refuses anything not `stable: true`. **Quarantine** (`views/quarantine.json`): the 12 history-dependent views, reported apart with their reasons, pictures kept for taste, outside every verdict and refused by accept; their baselines withdrawn | always-changing and converging sequences; the repeatability run (evidence below): six more history-dependent views found and quarantined (18 in all), then capture B against the new baselines: 125 of 125 unchanged |
| **F3** timeline canvases grew at DPR 2 | Fixed logical heights (`data-h`), backing store from CSS size × DPR, `setTransform` | DPR 1 and 2 through redraws, seeks and resizes: 1952×360/300/80 at DPR 2 throughout |
| **F7** export omitted pictures and the video's tail | An export cutoff; every picture taken before it encoded and written; the video's buffered data requested and written; then the spool worker's barrier, after which **the worker writes the ZIP into its own file** as everything stands (later appends cannot change it). The video repeats its last picture while nothing draws (a pause, the note being typed), and each segment is dated from its first frame handed to the encoder, where MediaRecorder starts its clock (`48b0f251`: dating it from when that picture was taken put the first segment 5.8 s early on the 3090 and 8.4 s on the 4070, because the picture is taken just before the load's long task) | the playtest check at `48b0f251`, both GPUs: the video reaches the note; every picture present |
| **S2** no storage budget, unbounded fallback | One budget over every recording on the computer, the current one included (2 GiB, at most half the quota): oldest exports, older recordings' video, older recordings, this one's oldest video segments (10-minute, independently decodable files), then its oldest pictures; telemetry last; every removal recorded in the header. Quota errors shrink the budget and stop the video; disk backlog pauses it. No private storage: telemetry only, no video; a driver's in-memory video is capped at 64 MiB | accelerated two-hour session, older recordings first, low quota, no OPFS; the playtest check with a 6 MiB budget and 15 s segments at `48b0f251`: 11–12 segments, 2 then 4 removals recorded, the video still reaching the note |
| **F8** "Off" kept recording | Off stops the recording now (it stays exportable); on starts a new one; the video toggle ends or starts a segment | the playtest check at `48b0f251`: the third export ends at the switch |
| **S1** self-time missed its own work | Every recording step is charged by part (rows and events in `frame()`, sampling, snapshots, video and its later task, spool, GPU timer queries, simulation-side event recording); the inclusive cost is the A/B's main-thread task time per frame (CDP TaskDuration: every task and collection), judged against the rounds' own spread | the exclusive A/B at `48b0f251` (below): recorder self-time 0.089 ms (0.53% of a frame); the inclusive difference as first reported (0.29 ms) used a doubled frame count and is **withdrawn: see R2-6** |
| **S3** late GPU results accumulated | Results for rows no longer waiting are dropped | 40 late results with a 32-row ring: at most 7 kept, 0 after a settle |
| **S4** one failed picture blocked the rest | Each picture is pending, ok or failed; a failure (or 10 s pending) is recorded as missing with why, and the rest go on | (code path; the browser runs saw no failure) |
| **F4** missing evidence became success | Hold coverage from the rows: `inactive`, `opening` and `interior` say why admission was not evaluated (`measure.mjs` learns them as `n/a`); unknown rows never pass and a known hold fails among them. Completeness from facts: what was lost, what a budget removed, every indexed picture against the files, events naming absent pictures; driver-only page errors fail. Video passes only on its files' real durations over the window | mixed and known holds, n/a coverage through `normalize`, a missing JPEG, a driver-only error, video durations |
| **F5** no readings passed "memory flat" | At least 10 readings spanning 80% of a 10-minute window | 0, 1, flat and growing series |
| **F6** pacing looked ahead and counted pauses | Doing is the 3 s after an action; progression is on a play clock only travelling and doing advance (wall time alongside) | an isolated action, a 600 s menu |
| **F9** survival injury missing | Oxygen, pressure, starvation and hull-depth loss not explained by a strike or impact become damage episodes (onset with a picture, an end with the total); hazard notices are threats, not refusals | an oxygen episode with a strike inside it |
| **audit F22** baseline hash apart from its PNG | Baselines are content-addressed (`<class>/<view>/<sha256>.png`), hashed from the bytes on disk and verified after the copy; compare checks the stored bytes before any "identical"; the 262 existing entries verified and moved | same view and commit, a different picture; a tampered capture refused |
| **Reuse** | REC-1's drivers use the soak's browser session (`scripts/soak/browser.mjs`: three additive options, query, isolation, init scripts; the bound port) and its providers (`processRss`, `cdpHeap`); `scripts/rec/browser.mjs` deleted; the composer has a small launcher of its own (no game) | the runs above |
| **Hook** | `freeze` joins `stage` as driver-mode only | |
| **SIM-1 composition** (SIM-1 R1 note) | The recorder reads the play timeline through a cursor seam (`timelineSince`/`timelineHead` in `flight/game.ts`): the cursor counts entries ever recorded, never an index into `timeline.events`, and the seam is the one place that knows the timeline's layout. REC-1 merges first, so SIM-1 swaps the seam's two bodies (`timelineHead` for its `seq`, `timelineSince` for its own) and adds a burst-across-seal case. With nothing new, the read answers from the head and allocates nothing (`eb4001a7`). Found alongside: a recording turned on again in Settings replayed what the timeline gained while it was off; it now starts at the head | a 1,001-note burst read once and whole; nothing before the head replayed; the same test on SIM-1's export (`047846b4`) with only the seam's body swapped: 1,001 of 1,001, index 999 included |
| **SIM-1 R2-C1** cursor across sessions | The cursor belongs to one timeline (`TimelineReader` in `flight/game.ts`): `startTimeline()`, the only place a timeline is assigned (reload or new expedition), and `startFlight()` call `start(timeline)`, which takes `timelineHead`; both read sites (the step's events, a note) call `read`, and a timeline nobody started is read from its present, never with another's count | `rec1-flight.test.ts`: a reloaded 2,500-note timeline replays nothing and reads the next note once; a shorter replacement session's three notes all read; an unstarted timeline from its present. The same 19 flight tests on SIM-1's export with both seam bodies swapped (`seq`, its `timelineSince`): 19 of 19 |

**The seam's overhead bound** (`seam-bench.mjs`, quick job at `67a9b2b9`, 7 rounds, medians and ranges per call): with nothing new, 2.1 ns before (1.3–5.6) and 4.3 ns after (4.2–10.2); with one new entry every 30 calls, 15.9 ns before (11–32.6) and 25.3 ns after (22.3–31.8). The read runs once per 60 Hz step, so the worst difference, about 9 ns, is about 0.00006% of a 16.7 ms frame, or 0.005% of the recorder's own 0.2 ms mean. Nothing an exclusive A/B can resolve, so the seam needs no second overhead run.

### R1 evidence, by the commit it ran at

Final commit `9b150449`. Since `af6d85de`, four commits change the runtime: the timeline seam (`570c63bc`, `eb4001a7`, `67a9b2b9`), confined to cursor plumbing in `src/runtime/app.ts` and to `src/runtime/flight/game.ts`, and the video's start time (`48b0f251`, `src/runtime/flight/capture.ts`, video only). After that come the quarantine and baselines (`2e10705d`, `scripts/rec/views/`) and a test (`9b150449`). `git diff af6d85de..9b150449 -- src/render src/sim` is empty.

| Evidence | Ran at | Machine | Result |
| --- | --- | --- | --- |
| Playtest export check (default settings: note, immediate export, more play, export, Off, export) | `48b0f251` | RTX 3090 | pass: the note at 98.11 s, video to 98.19 s (the same check at `af6d85de` ended 5.8 s short: the start-time bug); second export covers to 117.09 s (video 118.58 s); the third ends at the Off switch; nothing absent, no page errors |
| Same, storage budget 6 MiB, 15 s segments | `48b0f251` | RTX 3090 | pass: video to 155.79 s past the note at 155.66 s across 11–12 segments; 2, then 4 removals recorded in the header; the note's picture kept |
| Playtest export check | `48b0f251` | RTX 4070 Laptop (indicative) | pass: the note at 97.72 s, video to 97.81 s; three exports reconciled, nothing absent, no page errors |
| Recorded pack (150 s) | `af6d85de` | RTX 3090 | partial by design: nothing failed; frame times and streaming are recorded, not judged, in a shared run; memory needs ≥ 10 min. Recorder self 0.064 ms mean, 0.25 ms p99 |
| Fixed views, capture A | `af6d85de` | RTX 3090 | 143 captured, all settled and stable; 12 quarantined, outside the verdict |
| Fixed views, capture B (repeatability) | `af6d85de` | RTX 3090 | 142 of 143 settled; against capture A (131 eligible views): 125 unchanged (57 pixel-identical), 5 changed, 1 not judged. The six are history-dependent (below) and now quarantined; their baselines withdrawn. Then B against the re-accepted baselines (`2e10705d`'s index): 125 of 125 unchanged (57 pixel-identical), 18 quarantined |
| Fixed views | `af6d85de` | RTX 4070 Laptop (indicative) | 143 captured, all settled and stable, no jitter |
| Exclusive owner-path A/B (off against playtest, 3 rounds interleaved, inclusive main-thread time; ticket `261023-220053-e7bd`) | `48b0f251` | RTX 3090 | recorder self-time 0.089 ms mean a frame (0.53%: sample 0.010, rows 0.010, heap 0.013, GPU timer 0.024, video 0.024, spool 0.003, events 0.005); gap p50/p99 unchanged (16.5 / 16.8); main thread per frame as first reported (1.79 → 2.08 ms, Δ 0.29) **withdrawn in R2-6** (the probe counted every frame twice; corrected in R2's table); marked **DISTURBED** (load ≤ 7.3, CPU pressure ≤ 31% from outside the lane; a few seconds of it mine: the baseline accept). The `af6d85de` run was also disturbed (Δ 0.41, spread 0.96). A clean inclusive figure is **missing** |
| Seam micro-bench (old against new `recordTimeline`) | `67a9b2b9` | quick job | worst difference ≈ 9 ns per 60 Hz step (below) |
| Idle-video experiment (static page, three feeding methods) | `570c63bc` | RTX 3090 | every method repeats frames while nothing draws (70 of 72 encoded): the idle path was sound; the shortfall was the start time |

**Why `af6d85de` stands for the views and the pack.** Fixed views run `?rec=driver`, where the in-game video is off, and capture through `freeze`/`stage`/`capture` with the simulation stopped; none of that reads the play timeline, and nothing under `src/render` or `src/sim` changed. The seam only decides which timeline entries become recorder events. The video fix changes only the date written for a segment's start. Neither can alter a rendered picture. The exclusive A/B was rerun at `48b0f251` anyway: the `af6d85de` run was marked DISTURBED (load ≤ 9, CPU pressure ≤ 33% from outside the lane), and the video path changed.

**Baselines.** Views v1 re-baselined for both classes from the `af6d85de` captures (3090 capture A; the 4070 capture), accepted by the REC-1 builder with the reason recorded: 125 views per class, settled, stable and outside the quarantine. Quarantine: 18 views (12 from R1, six from this repeatability run).

**Compromises (each with its root fix and cost).**
- *18 quarantined views.* They are still captured and shown for taste, but no automatic verdict covers them, so a regression in those 18 places (8 of them cave interiors) is caught only by a person looking at the contact sheet. Root fix (renderer): a capture mode that builds everything wanted at a pose before drawing, with a light selection that is a function of the pose, not of what came before; or a fresh load per view group, which costs minutes per run.
- *Views and the recorded pack ran at `af6d85de`, not the final commit.* This is argued above; it costs a reviewer one reading of `git diff af6d85de..9b150449 -- src/render src/sim` (empty).
- *4070 numbers* come from a shared desktop sandbox: indicative only.

**Findings for other streams.**
- CW-1: in two cave interiors, a staged camera inside the cave was drawn as open water while the hold said `clear` and every streaming counter (built, boxes, pending, missing, lights, uploads) stayed still for the settle window; once, the cave appeared about 6 s later. `caveView.ts` documents the state ("a field still in flight when its cave becomes active draws as open water until it lands"). While the field itself is absent, `missing` counts every frame, so a capture waits. Once the field has arrived but its textures are not resident, nothing counts and nothing says so. **Asked of CW-1:** a stat saying whether the active cave's light is resident (e.g. `lighting.has(field(active))`, in `scene().caveStream`); REC-1's capture will then wait on it, and these two views can leave the quarantine. In play the hold would want the same signal. Separately, top-k light selection depends on history: the same pose on the same build gets a different light set depending on the views before it (88% of pixels in `canopy_root_arch.interior`).
- The recorded pack's attention list has an 83 ms frame with 68.8 ms in the simulation (A05, 138.5 s, `af6d85de`, 3090): a game cost, not the recorder.
- heavy-check reported the GPU "also used outside the lease" by a `sleep 30` process during G3: this looks like an inherited device handle, not GPU work.

## Outcome
**Every run of the game can show what happened, frame by frame, to an agent who reads text first and to the owner who watches.**

- **The recorder is in the game** (`src/runtime/flight/`), on by default, its own code at **0.05–0.11 ms a frame** (self-time; the whole cost on the page is R3's measurement) depending on the mode (self-timed, by part; the exclusive A/B is below). Every frame: the rAF gap, the game's own work split into simulation, streaming (chunks, caves, regions, lights), actors, render, HUD and autosave, the GPU's time for the scene (WebGL2 timer queries, where exposed), the recorder's own time, a heap drop (a collection) and the cave hold. Four times a second: position, depth, region, cave, hold, oxygen, health, food, speed, craft, draw calls, triangles, scene counts, the streamed-byte estimate, JS heap and CW-1's unsliced-build counter. Every event: milestones (the play timeline's), damage, threat warnings, holds, loads, saves (silent autosaves too), refusals, errors and warnings (console and uncaught), long frames with their split and cause, long animation frames with script attribution, player actions (for pacing) and the owner's feedback notes.
- **Snapshots** at every event (bursts share one; a long-frame burst one per 2 s), copied and scaled on the GPU (`createImageBitmap`) and encoded off the frame. Never a 2D `drawImage` of the WebGL canvas: the first 4070 run showed that reads the frame back synchronously, 40–75 ms a picture, and fed a loop of long frames causing snapshots. Recorder-caused long frames are attributed to "recorder" and never photographed.
- **Video at 12 fps, 720p:** the CDP screencast in test runs and soaks (onto a fixed 12 fps grid, VP9 through Playwright's own ffmpeg, the same binary on both machines); in owner playtests, GPU-scaled bitmaps encoded with WebCodecs (VP9) in the spool worker, each stamped with the page time of the frame that drew it, and written as independently decodable WebM segments to the browser's private storage (OPFS, durable per flush). This replaced MediaRecorder in R2-7. Off in exclusive performance runs.
- **Modes:** a person's browser records as a playtest (Settings: "Flight recorder", "Record video", "Export flight recording": one ZIP); an automated browser (`navigator.webdriver`) records in driver mode unless the URL names another (`?rec=off|driver|playtest`), so no harness pays for video it did not ask for. The in-game video exists only with the playtest spool; a driver records its own.
- **The test hook** `window.__siltwake` (versioned, `hooks.ts`) replaces ad hoc DOM reads: `read()`, `scene()`, `freeze()`, `recorder.*` (cursor reads: each consumer keeps its own, nobody drains anybody), and in driver mode `stage()` and `capture()` for fixed views. The renderer's canvas `dataset.tick` is gone (CR-1's driver reads the hook); the HUD's `#hud` tick and the creature viewer's own are separate hooks with their own callers (the soak reads the HUD's), left for their owners.

**Evidence packs** (`scripts/rec/`), one directory, the same from either machine and from an owner's export:

| Tier | File | For |
| --- | --- | --- |
| 0 | `summary.json` (< 1 KB) | verdict, unproven list, frame p50/p99/max, holds, memory start/end/trend, errors, draw calls, machine, GPU, driver, browser, commit, build |
| 1 | `story.md` | checks (checked / missing / wrong), the **attention list** (each entry: reason, time, tick, its strip), pacing table, timeline |
| 2 | `strips/*.jpg` | ±2 s at 12 fps around each attention entry (48 tiles, ~150 KB, labelled time · tick · depth · speed · hold), plus 3 random unflagged moments; snapshots when there is no video |
| 3 | `timeline.html`, `recording/video.webm` | the owner's synchronised page: video, frame time, memory, activity band, event list |

Also `charts/` (frame time, memory, pacing), `contact-sheet.jpg`, `README.md` (reading order; a budget of about 6–10 strips per review). Tools: `run.mjs` (recorded traversal), `strip.mjs` (any window: `--event A07`, `--at`, `--from/--to --fps 1`), `compare.mjs` (side by side), `overhead.mjs`, `playtest-check.mjs`, `pack.mjs --zip` (an owner export), `soak-provider.mjs`, and `views/` (fixed-view regression).

**Fixed-view regression** (`scripts/rec/views/`): `views.json` (versioned poses derived from the content by `make-views.mjs`), `capture.mjs` (one load; each view staged at a fixed tick with the clock frozen, streaming and lights settled, the hold clear, then the canvas captured without the HUD until two successive frames are the same pixels), `compare.mjs` (SSIM per view against the last accepted baseline for that machine class; changed views on the attention list with a baseline | new | difference strip; one contact sheet of every view) and `accept.mjs` (who and why, store outside git, index `views/baselines.json` in the repo).

**Soaks** (`scripts/soak/run.mjs`) read frames, holds and scene counts from the recorder through the provider interface (`flightFrames`, `flightRecorder`; validated by `measure.mjs normalize` in `tests/rec1-pack.test.ts`) and record their own video and pack in `OUT/pack` (`--no-record` to skip).

## Evidence
All on factory-worker's RTX 3090 (ANGLE GL-EGL, Chrome 156 headless) through the queue, and the RTX 4070 Laptop on alickers (ANGLE → D3D12 under WSL, Chrome 156; **indicative**: a shared desktop host). Packs, captures and logs: `/work/tmp/rec1/final/` on factory-worker.

**Recorder overhead (exclusive, RTX 3090, `67e8394d`),** the same 120 s of CW-1's segment 0 from the same save, modes interleaved over two rounds, each with the same rAF probe:

| Mode | What runs it | Gap p50 / p99 Δ | Frames over 33 ms | Recorder self-time, mean a frame (by part) |
| --- | --- | --- | --- | --- |
| off | – | – | 0 | – |
| perf: recorder, snapshots, no video | exclusive performance runs | 0 / 0 | 9 | **0.070 ms** (rows 0.057, sampling 0.010, snapshots 0.001) |
| screencast video | functional runs, soaks | 0 / 0 | 2 | **0.048 ms** (the video is the browser's, outside the page) |
| in-game video | – | 0 / 0 | 10 | **0.110 ms** (video 0.031) |
| owner playtest, as a static host serves it (not isolated; video and spool) | owner playtests | 0 / 0 (vs 9 off) | 5 | **0.078 ms** (rows 0.041, video 0.025, sampling 0.009, spool 0.003) |

Isolated modes: ticket `261023-123448-7658`; the owner path: `261023-123455-1459` (off against playtest, 2 × 2 runs). The game's own work moved by −0.13 to +0.70 ms between modes, inside its own round-to-round spread (off alone: 3.3 to 4.2 ms mean), so the self-timed figure is the cost: ~~well under 1% of a frame in every mode (0.3–0.7%).~~ **Withdrawn (R2-6, R3-4):** this was self-time standing in for the whole cost, and these runs' probe counted every frame twice; see R3. Both tickets ran with the scheduler's warning "DISTURBED by work outside the lane" (CPU pressure up to 50% from other work on the host; some of it, in the first, mine), so these are the numbers with that caveat. The full playtest check (load and export included) self-timed 0.18 ms mean, 8.4 ms at its worst frame.

**At the handoff head (`75fd4b10`, `gpu` ticket `261023-140959-38b6`),** after the last merges: 2 minutes of segment 0 recorded on the 3090; recorder 0.088 ms mean, 0.72 ms p99 a frame; 0 of 5 long frames streaming's; no holds, unsliced builds or errors; nothing lost; video encoded (`final/head-3090/`).

**Real traversal packs (`2bf9b14e`):** CW-1's segment 0 (55 points, the reef's caves), its save, ordinary keys, recorded with the screencast video.

| | RTX 3090 (`gpu` ticket `261023-120623-5311`) | RTX 4070 Laptop (indicative) |
| --- | --- | --- |
| verdict | partial (frame times unjudged in a shared run; under 10 min for memory) | partial (same) |
| frames · minutes | 18,924 · 5.3 | 17,254 · 5.4 |
| gap p50 / p99 / max (ms) | 16.7 / 16.7 / 133.3 | 16.7 / 50 / 133.3 |
| streaming frames over 33 ms · holds · unsliced · errors | 0 · 0 · 0 · 0 | 0 · 0 · 0 · 0 |
| game work p50 / p99 (ms) | 4.5 / 11.2 | 2.8 / 7.4 |
| GPU per scene p50 / p99 (ms) | 4.0 / 10.3 | 2.1 / 18.6 |
| recorder self-time mean / p99 (ms) | 0.106 / 1.55 | 0.044 / 0.16 |
| legacy `#ocean` counters (compromise 1) | 0.133 ms mean, 0.3 ms p99 a frame | 0.062 / 0.12 |
| tab · VRAM (MiB) | 688 → 777 · this browser 170 → 1,474 | 535 → 598 · whole GPU 4,048 (desktop included) |
| lost data | none | none |

Side by side: `final/compare-seg0/` (driver marks line the runs up by place: both reached the first cave at 94 s; the 3090 run then lost 23 s to impacts its strips show, the Dart running into the isle's shore at the surface).

**The 4070 sandbox drops to 30 fps in stretches with recording off too** (A/B at `6892640d`: off 2.2% of frames over 33.4 ms, in-game video 4.4%, a full playtest 6.5%; the game's own work about 3 ms throughout, long frames carry about 8 ms of GPU against 4 ms). CW-1's shorter 4070 runs did not show it. It is the sandbox's present path, made worse by in-game video; whether a player's Windows Chrome sees it is **missing** (an owner-PC check).

**The owner's playtest path, end to end (`2bf9b14e`):** the default playtest mode (spooled to private storage, in-game 12 fps VP9), 90 s of play, a feedback note (N), Settings → Export flight recording → one ZIP (3090: 6.7 MB, 38 entries; 4070: 6.0 MB, 59 entries), unpacked and packed like any run. Both packs: no errors, nothing lost, the note on the timeline, the video synchronised. Found and fixed on the way: an export is judged from the first moment of play (CW-1's entry admission builds nearby caves at once behind the load screen, by design, and had failed the 4070 export as an unsliced build).

**Fixed views:** 143 views (2 pending slots) captured on the 3090 in 13 min (median settle 3.3 s) and on the 4070 in 10 min; one view, `region.refuge_reef.1`, never settles on either (its streaming counters keep moving with the camera frozen; on the 4070 the world is not even ready): a lead for CW-1/MEM-1. Baselines accepted with who and why in `scripts/rec/views/baselines.json`: 142 per machine class (RTX 3090 and RTX 4070, both at a fixed tick, build `67e8394d`; the never-settling view has none). Images: `~/.local/share/siltwake-views` on factory-worker (outside git, 68 MB a class).
- **Adverse case:** one view turned 15°, one cave interior's lamp off, five untouched → both changes on the attention list with baseline | new | difference strips (SSIM 0.744 and 0.948), the untouched views unchanged.
- **Found and fixed by it:** a third view flagged with nothing changed: the water's waves had moved, because each run froze the clock wherever loading left it. Views are now staged at a fixed tick (the save's) and re-baselined (`3a07c189`, ticket `261023-133220-84ba`: the adverse run again catches both changes, SSIM 0.722 and 0.951, and leaves the untouched views identical or unchanged).
- **Run to run, same build:** 74 of 143 views pixel-identical, 57 within threshold, **12 differ** (compromise 11): `place.basin_boundary_station`, `place.canopy_stop`, `place.reef_ribs` (the baseline caught it before the ribs' art was drawn), `hub.crown_station.work`, `threat.rift_cool_flank`, `region.refuge_reef.1` (never settles), `region.brine_divide.2`, `cave.reef_wrackhollow.interior`, `cave.divide_mirror_pocket.mouth`, `cave.divide_lee_burrow.mouth`, `cave.divide_fissure_window.interior`, `cave.meridian_footing_void.mouth`.

**Soak integration (`2bf9b14e`):** a two-lap tour soak on a CW-1 hop with the recorder wired in: providers `flight-frames`, `flight-recorder`, `flight-recording` with no provider errors, 4,109 frames attributed from the recorder, its own video and pack written. The soak ended "incomplete" on travel (its own driver stalled 17 m short of `canopy_fin_cleft`); hold coverage stays unproven because 47 records carry `hold: null` (admission not evaluated while not playing), which SCHED-2's contract counts as unknown.

## Checks
- `npm test` (fast tier): **1,456 pass, 0 fail** at `9b150449` (R1); 1,405 at the first handoff head; new `tests/rec1-flight.test.ts` (recorder rings and cursors, long frames and causes, recorder-caused frames, holds, snapshots, self-time, GPU time on its own row, event mapping, modes, ZIP, view staging) and `tests/rec1-pack.test.ts` (verdict, attention, pacing, shared runs, the soak provider through `measure.mjs normalize`).
- `npm run build` OK; the five economy scripts pass (root merge gate) after every root merge, the last at `990e5c1` with CW-1 `14c7a02`.
- No `test:heavy` change: REC-1 adds no NullEngine or render tests; the browser paths are covered by the queued GPU runs above.

## Compromises (each with its root fix and cost)
1. **The old DOM attributes still update every frame** (`#ocean` `data-*`: two reduces over every mesh, a `JSON.stringify` of the cave counters). The soak's `oceanDataset` provider, CW-1's traversal and older evidence drivers read them. *Root fix:* move those readers to `__siltwake.scene()` (computed only when asked), then delete the per-frame writes. *Cost now measured:* 0.133 ms a frame on the 3090 (0.3 ms p99), 0.062 ms on the 4070: more than the recorder itself. *Fix cost:* edits to SCHED-2's `oceanDataset` provider and older evidence drivers.
2. **Tab memory in an owner playtest is the JS heap only.** `measureUserAgentSpecificMemory` needs cross-origin isolation, which a static host cannot grant without headers. Driver runs do have it (COOP/COEP served; renderer RSS from /proc). *Root fix:* serve COOP/COEP (a host that sets headers, or a service-worker shim) and sample it every 10 s. *Cost:* a hosting decision; a shim's side effects untested.
3. **Collections are inferred, not traced:** a frame's JS heap drop (precise in drivers, which pass `--enable-precise-memory-info`; coarse in a player's Chrome). *Root fix:* in driver runs, trace V8's GC events over CDP aligned to the page clock (CW-1's traversal does) and merge them into the recording. *Cost:* a trace buffer and some browser-side CPU; not built.
4. **A long frame's event and picture come up to 6 frames after it** (rows wait for their GPU time, then the long-frame rule runs; the event keeps the frame's own time). Fixed on the way: GPU time used to land 1–3 frames late on the wrong row; each query now carries its frame's tag.
5. **VRAM:** this browser's own on the 3090 (nvidia-smi's process table); the whole GPU, Windows desktop included, on the 4070 (WSL lists no processes); only the game's streamed-byte estimate in a player's browser. *Root fix:* none available in a browser; MEM-1 reads the GPU process externally.
6. **Fixed views stage the diver alone** (no cockpit views), all at the base save's time of day; the pod and the island workshop are framed from the waterline without a sight-line check (`sightUnchecked`); the island lookout (OP-1) and the carrier bridge (needs a crewed-Hearthline save) are pending slots. *Root fix:* SAVE-1 library saves per view group, the lookout after OP-1. *Cost:* regenerate `views.json` (version 2) and re-accept affected baselines.
7. **Pacing is classified from motion and actions** (doing: an action within 3 s; waiting: still or held), so waiting out a threat window is "waiting", not named. *Root fix:* the simulation emits a window-watched event (CR-1's first-sight captions are close) and the pacing sheet reads it.
8. **The timeline page inlines the video only up to 32 MiB;** longer runs play `recording/video.webm` beside it (the pack is one directory, so they travel together).
9. ~~A playtest's current session spools without a cap.~~ **Resolved in R1 (S2):** one storage budget over every recording, the current one included, with 10-minute video segments (see R1). **R2-1:** when only this recording's telemetry is left over the budget, the recording stops with a durable fact rather than rotating telemetry away. *Root fix if a long session on a tiny quota matters:* segment `frames.ndjson` like the video and retire its oldest parts. *Cost:* every reader of a recording (pack, soak provider, timeline) learns segmented telemetry. The export copy may exceed the budget for its 2-minute download grace, and by how much is recorded.
10. **Evidence saves are CW-1's derived traversal saves** (`/work/tmp/cw1/saves-8x`), until SAVE-1's library lands.
11. **Fixed views are not yet fully deterministic:** 18 of 143 are quarantined (12 found at the first handoff, six in R1's repeatability run; see R1); the rest are 125 of 125 unchanged between two captures of the same build. What a view draws can depend on the views before it (the region pair's hysteresis, residency's least-recently-used eviction under its byte budget, time-sliced builds). *Root fix:* a capture mode in the renderer that builds everything wanted at the pose before it draws (as a load does), or a fresh load per view group. *Cost:* a renderer API for captures; longer captures. Until then the quarantined views are captured and shown for taste, outside every verdict and refused by accept.
12. **In a pause, the video's repeated picture can be one capture interval (83 ms) older than the paused screen** (R2-7). A WebGL frame drawn after the last capture cannot be captured later. Every frame's page time is exact; only which picture a pause repeats can lag. *Root fix:* none without capturing every drawn frame (12 times the video's picture cost).
13. **A genuinely hidden tab was not checked** (R2-7): headless Chrome never reports a page hidden, even minimized. A page with no frames, the recorder's view of a hidden tab, was checked: an honest gap in the video. *Root fix:* the owner-PC check (Missing).

## Missing
- **The owner's own browser:** the in-game video, the spool and the export in a headed Chrome on the owner's Windows PC (and whether it shows the 4070 sandbox's 30 fps stretches), including a genuinely hidden tab: checked headless only (`playtest-check.mjs`, `adverse.mjs`), on both machines.
- **A completed soak with the recorder:** the two-lap tour proved the wiring and the pack, but its own driver stalled before the first cave; a full three-lap tour and a dwell soak are MEM-1's and PT-0's.
- **Memory flatness** is judged only from 10 minutes up; every run here was shorter.
- **The recorder's inclusive cost on the owner's hardware path** (R1-S1, R2-6, R3-4): met on our machines' software rung (R3b: +0.109, 95% up to 0.137, against 0.167, 3090 exclusive duet). The owner's Windows laptop with a hardware encoder is the owner-PC check (R3b), not yet run.
- **The fixed-view set's taste:** some framings are weak (the crown station's work pose faces a wall, the dish field shows open water, a few interiors face sand or are near black). The once-per-wave Opus taste review decides version 2; `make-views.mjs` regenerates it.
