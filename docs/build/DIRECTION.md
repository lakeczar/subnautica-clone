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
