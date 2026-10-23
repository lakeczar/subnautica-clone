# REC-1: the flight recorder and evidence pack (handoff)

Opus 5.5 high. Branch `t3/rec-1-flight-recorder`, from CW-1's head `7dc9cc9`, root merged at `f2fd628` (CR-1, UX-1, TT-1, SCHED-1) and `51a6b27` (SCHED-2a live). Story-neutral; `docs/spoilers/*` not read.

## Outcome
**Every run of the game can show what happened, frame by frame, to an agent who reads text first and to the owner who watches.**

- **The recorder is in the game** (`src/runtime/flight/`), on by default, at about **0.04–0.08 ms a frame** (self-timed; the exclusive A/B is below). Every frame: the rAF gap, the game's own work split into simulation, streaming (chunks, caves, regions, lights), actors, render, HUD and autosave, the GPU's time for the scene (WebGL2 timer queries, where exposed), the recorder's own time, a heap drop (a collection) and the cave hold. Four times a second: position, depth, region, cave, hold, oxygen, health, food, speed, craft, draw calls, triangles, scene counts, the streamed-byte estimate, JS heap and CW-1's unsliced-build counter. Every event: milestones (the play timeline's), damage, threat warnings, holds, loads, saves (silent autosaves too), refusals, errors and warnings (console and uncaught), long frames with their split and cause, long animation frames with script attribution, player actions (for pacing) and the owner's feedback notes.
- **Snapshots** at every event (bursts share one; a long-frame burst one per 2 s), copied and scaled on the GPU (`createImageBitmap`) and encoded off the frame. Never a 2D `drawImage` of the WebGL canvas: the first 4070 run showed that reads the frame back synchronously, 40–75 ms a picture, and fed a loop of long frames causing snapshots. Recorder-caused long frames are attributed to "recorder" and never photographed.
- **Video at 12 fps, 720p:** the CDP screencast in test runs and soaks (onto a fixed 12 fps grid, VP9 through Playwright's own ffmpeg, the same binary on both machines); in owner playtests, MediaRecorder from GPU-scaled bitmaps, spooled to the browser's private storage (OPFS, durable per flush, from a worker). Off in exclusive performance runs.
- **Modes:** a person's browser records as a playtest (Settings: "Flight recorder", "Record video", "Export flight recording": one ZIP); an automated browser (`navigator.webdriver`) records in driver mode unless the URL names another (`?rec=off|driver|playtest`), so no harness pays for video it did not ask for.
- **The test hook** `window.__siltwake` (versioned, `hooks.ts`) replaces ad hoc DOM reads: `read()`, `scene()`, `freeze()`, `recorder.*` (cursor reads: each consumer keeps its own, nobody drains anybody), and in driver mode `stage()` and `capture()` for fixed views. `dataset.tick` is gone; CR-1's driver reads the hook.

**Evidence packs** (`scripts/rec/`), one directory, the same from either machine and from an owner's export:

| Tier | File | For |
| --- | --- | --- |
| 0 | `summary.json` (< 1 KB) | verdict, unproven list, frame p50/p99/max, holds, memory start/end/trend, errors, draw calls, machine, GPU, driver, browser, commit, build |
| 1 | `story.md` | checks (checked / missing / wrong), the **attention list** (each entry: reason, time, tick, its strip), pacing table, timeline |
| 2 | `strips/*.jpg` | ±2 s at 12 fps around each attention entry (48 tiles, ~150 KB, labelled time · tick · depth · speed · hold), plus 3 random unflagged moments; snapshots when there is no video |
| 3 | `timeline.html`, `recording/video.webm` | the owner's synchronised page: video, frame time, memory, activity band, event list |

Also `charts/` (frame time, memory, pacing), `contact-sheet.jpg`, `README.md` (reading order; a budget of about 6–10 strips per review). Tools: `run.mjs` (recorded traversal), `strip.mjs` (any window: `--event A07`, `--at`, `--from/--to --fps 1`), `compare.mjs` (side by side), `overhead.mjs`, `playtest-check.mjs`, `pack.mjs --zip` (an owner export), `soak-provider.mjs`, and `views/` (fixed-view regression).

**Fixed-view regression** (`scripts/rec/views/`): `views.json` (versioned poses derived from the content by `make-views.mjs`), `capture.mjs` (one load; each view staged with the clock frozen, streaming settled and the hold clear, the canvas captured twice without the HUD), `compare.mjs` (SSIM per view against the last accepted baseline for that machine class; changed views on the attention list with a baseline | new | difference strip; one contact sheet of every view) and `accept.mjs` (who and why, store outside git, index `views/baselines.json` in the repo).

**Soaks** (`scripts/soak/run.mjs`) read frames, holds and scene counts from the recorder through the provider interface (`flightFrames`, `flightRecorder`; validated by `measure.mjs normalize` in `tests/rec1-pack.test.ts`) and record their own video and pack in `OUT/pack` (`--no-record` to skip).

## Evidence
TBD

## Checks
TBD

## Compromises (each with its root fix and cost)
1. **The old DOM attributes still update every frame** (`#ocean` `data-*`: two reduces over every mesh, a `JSON.stringify` of the cave counters). The soak's `oceanDataset` provider, CW-1's traversal and older evidence drivers read them. *Root fix:* move those readers to `__siltwake.scene()` (computed only when asked), then delete the per-frame writes. *Cost:* edits to SCHED-2's provider and frozen evidence drivers; their per-frame cost is unmeasured (Missing).
2. **Tab memory in an owner playtest is the JS heap only.** `measureUserAgentSpecificMemory` needs cross-origin isolation, which a static host cannot grant without headers. Driver runs do have it (COOP/COEP served; renderer RSS from /proc). *Root fix:* serve COOP/COEP (a host that sets headers, or a service-worker shim) and sample it every 10 s. *Cost:* a hosting decision; a shim's side effects untested.
3. **Collections are inferred, not traced:** a frame's JS heap drop (precise in drivers, which pass `--enable-precise-memory-info`; coarse in a player's Chrome). *Root fix:* in driver runs, trace V8's GC events over CDP aligned to the page clock (CW-1's traversal does) and merge them into the recording. *Cost:* a trace buffer and some browser-side CPU; not built.
4. **GPU time lags 1–3 frames** (timer queries resolve late; the column holds the latest resolved value) and is -1 where the browser hides `EXT_disjoint_timer_query_webgl2`. *Root fix:* key each query to its frame row and write the value back to that row. *Cost:* small.
5. **VRAM:** this browser's own on the 3090 (nvidia-smi's process table); the whole GPU, Windows desktop included, on the 4070 (WSL lists no processes); only the game's streamed-byte estimate in a player's browser. *Root fix:* none available in a browser; MEM-1 reads the GPU process externally.
6. **Fixed views stage the diver alone** (no cockpit views), all at the base save's time of day; the pod and the island workshop are framed from the waterline without a sight-line check (`sightUnchecked`); the island lookout (OP-1) and the carrier bridge (needs a crewed-Hearthline save) are pending slots. *Root fix:* SAVE-1 library saves per view group, the lookout after OP-1. *Cost:* regenerate `views.json` (version 2) and re-accept affected baselines.
7. **Pacing is classified from motion and actions** (doing: an action within 3 s; waiting: still or held), so waiting out a threat window is "waiting", not named. *Root fix:* the simulation emits a window-watched event (CR-1's first-sight captions are close) and the pacing sheet reads it.
8. **The timeline page inlines the video only up to 32 MiB;** longer runs play `recording/video.webm` beside it (the pack is one directory, so they travel together).
9. **A playtest's current session spools without a cap** (video about 400 MB an hour); older sessions are pruned to 6 GiB and the newest four. *Root fix:* rotate video segments in very long sessions.
10. **Evidence saves are CW-1's derived traversal saves** (`/work/tmp/cw1/saves-8x`), until SAVE-1's library lands.

## Missing
- The per-frame cost of the old DOM attribute writes (compromise 1): not measured.
- The in-game video and export in a headed, owner-style Chrome: checked headless only (`playtest-check.mjs`).
