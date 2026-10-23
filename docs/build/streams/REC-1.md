# REC-1: the flight recorder and evidence pack (handoff)

Opus 5.5 high. Branch `t3/rec-1-flight-recorder`, from CW-1's head `7dc9cc9`; root merged at `f2fd628` (CR-1, UX-1, TT-1, SCHED-1), `51a6b27` (SCHED-2a live), `1bdcc39` and `990e5c1` (the soak's fact reducer, `--snapshot` with a linked `node_modules`); CW-1 merged up to its R1 fixes `14c7a02` (CW-1 is not in root yet). The evidence below ran at `2bf9b14e`, `67e8394d` and `3a07c189`, before the last two merges; a recorded run at the handoff head confirms the recorder against them (below). Story-neutral; `docs/spoilers/*` not read.

## Outcome
**Every run of the game can show what happened, frame by frame, to an agent who reads text first and to the owner who watches.**

- **The recorder is in the game** (`src/runtime/flight/`), on by default, at **0.05–0.11 ms a frame** depending on the mode (self-timed, by part; the exclusive A/B is below). Every frame: the rAF gap, the game's own work split into simulation, streaming (chunks, caves, regions, lights), actors, render, HUD and autosave, the GPU's time for the scene (WebGL2 timer queries, where exposed), the recorder's own time, a heap drop (a collection) and the cave hold. Four times a second: position, depth, region, cave, hold, oxygen, health, food, speed, craft, draw calls, triangles, scene counts, the streamed-byte estimate, JS heap and CW-1's unsliced-build counter. Every event: milestones (the play timeline's), damage, threat warnings, holds, loads, saves (silent autosaves too), refusals, errors and warnings (console and uncaught), long frames with their split and cause, long animation frames with script attribution, player actions (for pacing) and the owner's feedback notes.
- **Snapshots** at every event (bursts share one; a long-frame burst one per 2 s), copied and scaled on the GPU (`createImageBitmap`) and encoded off the frame. Never a 2D `drawImage` of the WebGL canvas: the first 4070 run showed that reads the frame back synchronously, 40–75 ms a picture, and fed a loop of long frames causing snapshots. Recorder-caused long frames are attributed to "recorder" and never photographed.
- **Video at 12 fps, 720p:** the CDP screencast in test runs and soaks (onto a fixed 12 fps grid, VP9 through Playwright's own ffmpeg, the same binary on both machines); in owner playtests, MediaRecorder from GPU-scaled bitmaps, spooled to the browser's private storage (OPFS, durable per flush, from a worker). Off in exclusive performance runs.
- **Modes:** a person's browser records as a playtest (Settings: "Flight recorder", "Record video", "Export flight recording": one ZIP); an automated browser (`navigator.webdriver`) records in driver mode unless the URL names another (`?rec=off|driver|playtest`), so no harness pays for video it did not ask for.
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

Isolated modes: ticket `261023-123448-7658`; the owner path: `261023-123455-1459` (off against playtest, 2 × 2 runs). The game's own work moved by −0.13 to +0.70 ms between modes, inside its own round-to-round spread (off alone: 3.3 to 4.2 ms mean), so the self-timed figure is the cost: **well under 1% of a frame in every mode (0.3–0.7%).** Both tickets ran with the scheduler's warning "DISTURBED by work outside the lane" (CPU pressure up to 50% from other work on the host; some of it, in the first, mine), so these are the numbers with that caveat. The full playtest check (load and export included) self-timed 0.18 ms mean, 8.4 ms at its worst frame.

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
- `npm test` (fast tier): **1,405 pass, 0 fail** at the handoff head; new `tests/rec1-flight.test.ts` (recorder rings and cursors, long frames and causes, recorder-caused frames, holds, snapshots, self-time, GPU time on its own row, event mapping, modes, ZIP, view staging) and `tests/rec1-pack.test.ts` (verdict, attention, pacing, shared runs, the soak provider through `measure.mjs normalize`).
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
9. **A playtest's current session spools without a cap** (video about 400 MB an hour); older sessions are pruned to 6 GiB and the newest four. *Root fix:* rotate video segments in very long sessions.
10. **Evidence saves are CW-1's derived traversal saves** (`/work/tmp/cw1/saves-8x`), until SAVE-1's library lands.
11. **Fixed views are not yet fully deterministic:** 12 of 143 differ between two captures of the same build. What a view draws can depend on the views before it (the region pair's hysteresis, residency's least-recently-used eviction under its byte budget, time-sliced builds). *Root fix:* a capture mode in the renderer that builds everything wanted at the pose before it draws (as a load does), or a fresh load per view group. *Cost:* a renderer API for captures; longer captures. Until then a flagged view in that list needs a second look before it is believed.

## Missing
- **The owner's own browser:** the in-game video, the spool and the export in a headed Chrome on the owner's Windows PC (and whether it shows the 4070 sandbox's 30 fps stretches): checked headless only (`playtest-check.mjs`), on both machines.
- **A completed soak with the recorder:** the two-lap tour proved the wiring and the pack, but its own driver stalled before the first cave; a full three-lap tour and a dwell soak are MEM-1's and PT-0's.
- **Memory flatness** is judged only from 10 minutes up; every run here was shorter.
- **The fixed-view set's taste:** some framings are weak (the crown station's work pose faces a wall, the dish field shows open water, a few interiors face sand or are near black). The once-per-wave Opus taste review decides version 2; `make-views.mjs` regenerates it.
