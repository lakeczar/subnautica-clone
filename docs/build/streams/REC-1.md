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
TBD

## Missing
TBD
