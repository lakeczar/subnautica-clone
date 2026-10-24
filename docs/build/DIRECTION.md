# Build direction (Opus coordinator, 2026-10-20)

These decisions follow the [direction audit](reviews/DIRECTION-AUDIT-SOL-XHIGH.md). Where older docs conflict with them, this file wins. That includes the evidence rules in `DELIVERY_AND_ACCEPTANCE.md`, the Astra roles in `BUILD_GAME_REVISED.md`, and the historical `CONTRACTS.md` and `PLAN.md` text. The full owner scope stays the same: seven regions, three islands, six craft, Hearthline, both fleet strategies and one authored ending.

**Game design (owner, 2026-10-20):** [GAME-DIRECTION](GAME-DIRECTION.md) holds the owner-confirmed target, pacing rules, systems, fleet, caves and order of work. The length target is a **floor**: a skilled player on a first, blind, non-stop playthrough takes about 10 hours or more, organically and without padding. There is no ceiling, and playtests never trim good content.

## Priorities
1. **A rough, complete campaign from start to ending comes first.** Polish follows once the whole chain is playable. Stop re-polishing the opening.
2. **Prove the world can scale before mass content.** Run one representative scale test first: more than four regions resident or evicted, dense instanced vegetation, three hulls and the carrier, with measured memory and frame budgets. Then author the regions through that pipeline.
3. **Measure progress by playable outcomes,** not commits, test counts or evidence volume.

## Lean acceptance gate
- **One coherent player outcome per builder.** The author owns the connected code, the meaningful tests, the build and one ordinary-control browser run.
- **The handoff is one short page:** source SHA, changed contracts, check results, a few screenshots, one adverse or failure case, and known limits.
- **One fresh Sol 6.1 xhigh review plus coordinator inspection.** Fix the real findings. A follow-up review covers the affected risks and every earlier objection. It does not rerun unchanged broad checks.
- **One composed check per milestone,** plus the owner-required Opus experience audit at each stage exit.
- **No payload-hash inventories, no re-attribution receipts, no timing loops** chasing noise on a shared host. A checksum only shows a file wasn't corrupted in transit; it says nothing about gameplay quality.

## Saves (pre-release)
- **Keep strict validation for the current schema,** plus atomic writes, corruption and future-version rejection, export/import, and saveability after each command.
- **Support at most the immediately previous accepted schema,** and only during a declared transition. Retire `src/save/legacy/` and `src/save/expedition4/` once B1 lands. Convert named fixtures and the owner's saves once, archiving the originals; the reef-rib trap fixture is converted and kept as a regression. Old converters live outside the browser import graph.
- **Version stable IDs and facts, not display prose.** Content and text edits must not need a historical-domain project.
- **A durable compatibility promise starts with the first externally distributed save.**

## Tests
- **`test:fast` is the default.** It covers simulation, saves, session, input, progression and focused regressions, with no Babylon. It runs with small concurrency and needs no lock.
- **`test:heavy`** covers NullEngine art and lifecycle, terrain and collider conformance, and cache stress. It runs through the heavy-check admission queue as one `heavy-suite` job; inside that job, TT-1's runner puts files side by side within the job's CPU and memory grant. Assertion failures must print object names, never Babylon objects.
- **Browser smoke:** New → opening → gather → build → depart → return → save/reload → several region returns, recording memory and renderer. On the 3090 once it is attached.

## Docs
- **Current state:** `STATUS.md` (one page) and this file. History lives in `archive/` behind an index and is not loaded by default.
- **Builder briefs:** about a page plus links, covering the player outcome, owned modules, shared interfaces, acceptance behaviors including one adverse case, checks and resource limits.

## Concurrency (owner, 2026-10-20)
- **At most 5 Opus builder threads run at once.** The coordinator is not counted. Sol reviewers are separate and don't count toward the 5.
- **Paused streams queue.** They commit, stop cleanly, and resume in priority order as slots free up.
- **Priority:** the critical path (B1 and its composition), then GPU, then the world foundation (S1 → S2), then fixes that block finishing the game (S5), then the rest.

## Shared ground rules for parallel builders
- **Coordinates and IDs:** metres, Y-up, stable string IDs. One composed content registry; no second economy.
- **Composition is the coordinator's job.** New streams write new modules plus a short interface note. The coordinator composes them into the shared roots: registry, `step.ts`, `app.ts`, `renderer.ts`, `package.json` and saves.
- **No edits to B1-owned roots** until B1 is accepted and integrated. Those roots are `content/registry.ts`, `sim/types.ts`, `sim/step.ts`, `sim/survival.ts`, `sim/progression.ts`, `sim/world.ts`, `src/save/*`, `src/ui/*`, `render/expedition.ts`, `render/fleetArt.ts`, `render/renderer.ts`, `render/environment.ts`, `render/terrainSurface.ts`, `package.json` and `tests/*` support.
- **Persisted state:** a new stream that needs saved data proposes the fields in its interface note. The coordinator adds them in one schema change at integration.
- **Presentation is event-driven.** Simulation owns the truth, story owns the text, UI owns the display and audio consumes events.
- **Resources:** heavy jobs are admitted through the heavy-check queue (`scripts/heavy-check.sh`; how to run and wait is in [WORKER_RESOURCE_LIMITS](WORKER_RESOURCE_LIMITS.md)). Play and screenshots from shared runs are functional evidence only; every frame-rate or performance number comes from `--class exclusive`. Follow [WORKER_RESOURCE_LIMITS](WORKER_RESOURCE_LIMITS.md) and the browser rules (`/work/repos/fleet/BROWSER_RULES.md`, `docs/BROWSER_RULES.md`). Each builder gets its own preview port. **Second worker (best-effort, since 2026-10-23):** `siltwake-alickers`, a WSL2 sandbox on the owner's PC with an RTX 4070 Laptop GPU, runs one pinned-commit job at a time through `scripts/alickers-job.sh`: whole playthroughs, `test:heavy` and 4070 WebGL sessions. Exit 75 or 255 means rerun on factory-worker. Its rules are in [WORKER_RESOURCE_LIMITS](WORKER_RESOURCE_LIMITS.md).

**GPU browser (since 2026-10-20):** the shared T3 preview stays software-rendered (SwiftShader), so use it for looks and behaviour only. For frame-rate or GPU checks, launch a task-owned Chrome with `--use-gl=angle --use-angle=gl-egl --ignore-gpu-blocklist`, or run `docs/build/gpu-enablement/webgl-probe.mjs --candidate angle-gl-egl`. Avoid ANGLE-Vulkan, which loses the context at startup. Follow the browser rules and close what you open. GPU browser work runs through `scripts/heavy-check.sh --class gpu`, which holds the one GPU lease. Frame-rate or GPU-performance numbers only come from `--class exclusive`.

## Root fixes over workarounds (owner, 2026-10-23)

Adopted from the compromise verdict (`research/compromise-audit:docs/build/audits/COMPROMISE-VERDICT-OPUS.md`). This applies to every stream brief and handoff:
- **Compromises:** a compromise made to fit memory, time, loading, test limits or another stream's boundary is filed in the handoff with its root fix and cost, never as a quiet "limit" or P3.
- **Art:** don't reshape art to fit box collision or frozen paths. Until COL-1 stage B lands, keep the intended art, collide it with a conservative cover that blocks no route, and file the gap as COL-1 debt.
- **Evidence:** evidence that couldn't be obtained is listed as missing, never replaced by a proxy (warm caches, partial traversals, teleports, software rendering).
- **Restorations (owner-approved):** all of them, once COL-1 lands:
  - the A1 bow and round sections;
  - the standing dish feed tripods on the great and north dishes, with one deliberate rim breach;
  - the dish bowls colliding exactly;
  - the west sea cave's dry shelf (after OP-1);
  - a visible skate rest.
- **Order:**
  1. COL-1, then lost sites;
  2. LC-2, then cave biomes 2–4;
  3. SIG-1, then the owner's playtest;
  4. an early opening-hours playtest right after OP-1.

## Two test machines: how work is planned (owner grill, 2026-10-23)

- **factory-worker (RTX 3090):** builds, fast tests, focused heavy tests, reviewers' quick checks, every 3090 session and every **exclusive** performance measurement (the 60 fps target).
- **siltwake-alickers (RTX 4070 Laptop, best-effort):**
  - whole playthroughs, the full heavy tier and soaks;
  - 4070 "player-class" sessions.

  When it's paused or offline, its work falls back to factory-worker, except 4070 jobs, which wait for it. The owner uses the PC freely and pauses the sandbox when needed. 4070 frame-rate numbers are flagged as possibly disturbed.
- **Routing:** SCHED-2b's remote lane routes each job by a machine tag:
  - `any`: prefers alickers;
  - `3090`;
  - `4070`: waits for alickers, never faked on the 3090;
  - `soak`: alickers first.

  Until the lane exists, builders may call `scripts/alickers-job.sh` directly.
- **Balance the two GPUs** (owner, 2026-10-24): only acceptance numbers (frame-time gates, budget confirmations) are `--class exclusive` on the 3090.
  - Investigations, diagnostics, attribution, tests and playthroughs are submitted `--machine any`, so the queue sends them to whichever machine frees first. Results from the 4070 are labelled indicative.
  - Pin a job to one machine only when the question needs that machine (e.g. factory-worker's host pauses, or a 4070 player-floor check).
- **Graphics first; integrated graphics later** (owner, 2026-10-24):
  - **Order:** build for the best graphics first; the dedicated-GPU gates stay (3090 at 60 fps, the 4070 laptop as the player floor). Integrated-graphics laptops come later, through a settings change (a lower preset), not as a target now.
  - **The low preset, when it comes:** a steady **30 fps at a reduced internal resolution**, keeping readable exits, warning poses, lamp reach and landmark silhouettes.
  - **Keep it reachable:** don't make choices that rule it out. Quality must stay scalable through settings (resolution scale, draw distance, effects), and memory and streaming budgets must stay parameterised rather than hard-wired to the 3090.
  - **Still open:** the representative integrated-GPU device is chosen later.
  - **No battery mode and no frame-cap setting** (owner, 2026-10-24). The browser already paces frames to the display's refresh rate.
- **High refresh rates** (owner, 2026-10-24): on 120 Hz-and-above displays, motion should look as smooth as the hardware allows.
  - **The gap today:** the simulation steps at a fixed 60 Hz and the renderer draws the latest step without interpolation, so above 60 Hz frames repeat (and 144 Hz judders).
  - **Fix:** render interpolation between the last two fixed steps (camera, craft, creatures, particles), with the simulation unchanged and deterministic.
  - **When:** a small stream after CW-1 merges (CW-1 owns `renderer.ts` and `app.ts`).
  - **Acceptance:** the 60 fps gate on the 3090 stays. Measure at 120 Hz (8.3 ms budget) as indicative, not a gate.
- **Evidence:**
  - Functional results count from either machine, bound to the exact SHA tested.
  - 3090 exclusive numbers are the target.
  - 4070 numbers are the player-floor check:
    - one 4070 check at handoff for streams touching rendering, streaming, caves or UI;
    - full 4070 runs in MEM-1 and PT-0;
    - a 4070 check before every playtest.
- **Soaks have goals.**
  - **Tour soak:** 3 laps of every region and cave by ordinary travel. It passes if memory after lap 3 is within about 5% of lap 1, no streaming frame is over 33 ms, there's no loading hold, there's no growth in graphics objects, and every save reloads.
  - **Dwell soak:** in the heaviest places, for set autosave and day–night cycles. It passes if memory stays flat, with no autosave hitch over budget and no leak.
  - **Stopping:** both stop early, with a report, on a broken rule. Stall detection applies; the numbers get tuned from MEM-1.
  - **When:** after each root merge that touches streaming, memory or saves, and a full soak before each playtest.
- **Planning:**
  - **Builders:** at most 5 Opus builders until the owner upgrades the subscription.
  - **Slots:** filled from the compromise verdict's priority list by dependencies.
  - **Owner updates:** at decisions, finished streams, problems, and with a roadmap update when each wave of work completes.
- **Usage limits:**
  - When usage runs low, pause lower-priority builders so the critical path keeps going.
  - After any reset, Stop or compaction, the coordinator checks every outstanding task directly (`task_status`), because a finished agent's report can be delivered and never acted on.
- **SCHED-2 order,** each step with its own Sol review:
  1. **2a:** goals and stall detection, the soak class, the GPU lease for every driver, rejecting a changed worktree, and keeping the OOM label.
  2. **2b:** the remote lane with machine tags.
  3. **SAVE-1:** the save library, exporting on alickers.

## Evidence reading and quality review (owner, 2026-10-23)
- **Tiered, question-led evidence** (owner, 2026-10-24): agents start from at most three questions about the change, read `summary.json`, then the play debrief or story, then only the images that answer a question:
  - none by default for logic changes;
  - 2–4 for visual or content changes;
  - 6–10 as a ceiling, for a stage exit or a named risk.

  Hitches the pack doesn't judge get no strips. Builders and reviewers look at frames themselves and report conclusions in text, at most five findings, each marked observed, inferred or a question for the owner. The coordinator reads conclusions.
- **Fixed-view visual regression** (REC-1; owner, 2026-10-24):
  - stream handoffs capture the affected subset (views tagged by region and system);
  - root merges that touch rendering or content, and every wave end, capture the full set;
  - each capture is compared with the last accepted baseline per machine class. Changed views go on the attention list. Accepting a new baseline is a deliberate, recorded act.
- **Taste review once per wave:** an Opus agent reviews the fixed-view contact sheet against GAME-DIRECTION after each wave of work, together with the latest owner playtest's moment cards. The owner's notes outrank the contact sheet. The coordinator dispatches it. The owner's playtests remain the judge of feel.
- **Owner playtests** (owner, 2026-10-24; plan B in `research/recording-feedback-opus:docs/build/research/RECORDING-FEEDBACK-OPUS.md`):
  - **During:** the owner plays uninterrupted with OS screen recording (for HUD and sound), and uses tagged notes: `?` lost, `-` feels like work, `+` loved it, `!` bug.
  - **After:** a playtest debrief is read by **one** Opus agent and checked by the owner's answers (at most five time-anchored questions), not by a second agent. Sol reviews the code fixes that follow.
  - **No outside blind testers** (owner, 2026-10-24): first-timer time is estimated from the owner's play as a lower bound, calibrated per leg as a range.

## Codebase stewardship (owner, 2026-10-23)
- **Every review brief checks reuse and simplicity:** no new parallel implementation of something that already exists; shared helpers over copies; dead or legacy code removed when it's replaced; hot-path allocation justified; obvious names and one way to do each thing.
- **An architecture review once per wave,** alongside the taste review: Sol gathers evidence, and an Opus steward rules.
- **A one-off codebase health audit** (2026-10-23): Sol evidence at `research/codebase-health:docs/build/audits/CODEBASE-HEALTH-SOL.md`, then an Opus verdict and refactor plan, slotted into the waves.
- **The merge gate is `npm run gate`** (STEW-1). Its manifest (`scripts/gate.mjs`, `GATE`) *is* the gate: the fast tier with the architecture guard, the terrain bake (queued), the build, the six current economy checks and every playthrough scenario as a queued `--machine any` job. After the merge is pushed, `scripts/saves-export.sh` exports the save library. No brief, handoff or memory keeps its own list.
- **One way to do each thing:** [CORE-HELPERS](CORE-HELPERS.md) maps each job to its owner module and holds the *Open forks* register. An interim parallel implementation carries `// FORK(<id>): <what it duplicates>; retire in <stream>` and a row in that register. A stream that composes or replaces it deletes the fork in the same merge, or names the stream that will. A "temporary" comment without a FORK marker is not allowed.
- **The architecture guard** (`scripts/guard-architecture.mjs`, in `test:fast`, with `tsconfig.headless.json` keeping the DOM out of sim and content) fails on a layering break (anything sim or content reach at runtime, through any module, that ends in render, UI, audio, Babylon, an unvetted package, JavaScript or a computed load), an import cycle that doesn't match its allowance exactly, new browser, server or `gpu-prep` plumbing outside `scripts/rec`, `scripts/heavy` and `scripts/soak`, a second `RecipeBuilder`, or a region lookup outside `content/regions/layout.ts`. It prints the FORK count, the shared roots' sizes and exports nobody uses, for the per-wave review.

### Performance conventions (quote in every builder brief)
From the [steward verdict](https://github.com/lakeczar/subnautica-clone/blob/research/codebase-health/docs/build/audits/CODEBASE-STEWARD-VERDICT-OPUS.md) (`research/codebase-health`, `cc718962`).
1. **Loops that run every frame, every stream tick or every fixed step** (the render frame, `kitStream` and the residency arbiter, `stepGame`, collision sweeps) **don't allocate in proportion to world content.**
   - Reuse caller-owned scratch: module-level `Vector3` and `Matrix` for Babylon, typed arrays, output arrays cleared with `out.length = 0`.
   - A small constant allocation needs a reason in the handoff.
   - Allocation that grows with a roster is a defect.
2. **Pick the top k with a bounded selection, never a full sort.** CW-1's light selection (`localLights.ts`, `51ad6c9`) is the reference. Keep tie-breaks stable and deterministic.
3. **Spatial work goes through the index:** `WorldQueries`, with `dataInBox(box, out)` on hot paths. Never scan a world roster linearly per frame, and never index large shapes in a uniform fine grid (TST-05's 56M-entry cliff). New static shapes use COL-1's BVH or heightfield once stage B lands; no new box-set adapters.
4. **Main-thread work that can exceed about 2 ms is sliced:**
   - a generator under the stream budget, with deterministic `workClock` in tests;
   - every synchronous `Infinity` finish is counted and logged (CW-1's rule).
5. **The WK-1 worker boundary:**
   - only transferable typed arrays cross it (positions, normals, colours, indices, collider buffers), never Babylon objects, closures or `GameState`;
   - builders stay Babylon-free so they run in a worker;
   - the main thread only uploads, in bounded slices;
   - packs are content-addressed and bound to the build.
6. **Diagnostics are pulled, not pushed:** no per-frame DOM or `dataset` writes. Expose an on-demand snapshot (`__siltwake.scene()`) and REC events.
7. **Live state is mutated in place (after SIM-1):**
   - never keep a `GameState` or hull reference across frames or yields; snapshot explicitly, as the corridor search does;
   - memoize derived data only for a measured hot consumer, and only under an explicit revision, never under object identity.
8. **Every cache has an owner, a byte bound, an eviction rule and a ledger registration.** `geometryCache.ts` is the model. A `WeakMap` hung off a long-lived root is not a budget.
9. **Perf claims come from `--class exclusive` on the 3090, plus a 4070 check.** A hot-path change reports µs per call and allocations per call on a SAVE-1 save, bound to its SHA. Shared-host numbers are labelled indicative.
10. **A preview reuses the authority, it doesn't copy the rule.** A UI answer either calls a pure plan shared with execution (`planSpend`/`applySpend`, `servicePreview`) or dry-runs the real command on a clone. It never re-derives the rule in UI code. A dry run on a clone is fine on a click, but not every frame.
