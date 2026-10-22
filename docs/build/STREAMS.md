# Parallel streams (2026-10-20)

Each stream has one Opus 5.5/high owner in its own worktree, branched from the coordinator baseline. All of them follow [DIRECTION](DIRECTION.md): the ground rules, the B1-owned roots that nobody else may edit, and the lean gate. Streams write **new modules plus a short interface note** (`docs/build/streams/<ID>.md`). The coordinator composes them into the shared roots after B1 lands. Each handoff is one page, followed by one fresh Sol review.

Common to every stream:
- **Read first:** `prompts/BUILD_GAME_REVISED.md`, the specification docs it points to, `docs/build/reviews/DIRECTION-AUDIT-SOL-XHIGH.md` and the current code. B1's in-progress interfaces are readable at `/home/worker/.t3/worktrees/subnautica-clone/t3-b6aef8ec`, read-only.
- **Checks:** `npm test` (= `npm run test:fast`: typecheck plus every non-Babylon test, about 35 s, no lock) on every meaningful change. A test file that reaches Babylon or NullEngine must be named `*.heavy.test.ts`; the fast tier refuses a fast-named one and prints the rename. Heavy tests run with `npm run test:heavy`, which goes through `scripts/heavy-check.sh` one file at a time with a per-file memory budget (`tests/heavy-budgets.json`). Assertions on scene objects use `same()` and `digest()` from `tests/render-assert.ts`, never deep equality on Babylon objects or whole buffers. Content additions need no save-schema change; see [S7](streams/S7.md).
- **Browser:** read `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md` first. Use only your assigned port and T3 preview tools, and close only what you opened. The shared browser is software-rendered (SwiftShader), so judge looks and behavior there, not frame rate.
- **Branching:** commit early and often on your branch. Don't push, open a PR or start children. The coordinator reviews and integrates.
- **Design freedom:** improve the design where it serves the established game. Flag anything that changes owner scope.

| ID | Outcome | Owns (new paths) | Port | State |
| --- | --- | --- | --- | --- |
| S1 | World runtime and scale | `src/world/*`, `src/render/kit/*`, `tools/scale-slice.*`, `tests/world-*.test.ts` | 5195 | dispatched |
| S2 | Remaining regions and islands, authored | `src/content/regions/*`, `src/render/biomes/*` | 5199 | dispatched from S1 `393030a` |
| S3 | Fleet art and the Hearthline interior | `src/render/fleet/*`, `src/content/fleet/*`, `tools/fleet-viewer.*` | 5196 | dispatched |
| S4 | Ecology, encounters and hazards | `src/sim/ecology/*`, `src/content/ecology/*`, `src/render/creatures/*`, `tools/creature-viewer.*` | 5197 | dispatched |
| S5 | Campaign, evidence chain and ending | `src/content/story/*`, `src/sim/story/*`, `tests/story-*.test.ts` | — | dispatched |
| S6 | Audio | `src/audio/*` (except where B1 needs it), `tools/audio-lab.*` | 5198 | dispatched |
| S7 | Save simplification and test tiers | `src/save/*`, `package.json`, test config | — | coordinator, after B1 |

## S1 — World runtime and scale
The player can cross a full-size 2.0×1.8 km world with seven regions and three islands, down to 780 m, without hitches or unbounded memory. Deliver:
- **Descriptors:** typed chunk and region descriptors for bounds, vertical extent, adjacency, biome, LOD bands and access, plus a spatial query index for solids, sources and landmarks that works whether or not the render is resident. **Commit the descriptor and query types early, with an interface note, before the rest.** S2 builds on them.
- **Residency manager:** byte-based (CPU recipe and GPU buffer bytes tracked separately), LRU eviction, time-sliced or worker construction, bounded uploads per frame, cancellation and readiness.
- **Shared template kit:** instancing (thin instances), coarse and fine LOD, chunk culling.
- **Scale-slice harness** (`tools/scale-slice.html`), run under Vite dev. It shows more than four regions with eviction proven, dense instanced vegetation, three hulls plus a carrier-sized placeholder, and a deep vertical transition. It reports frame time, draw calls and resident bytes.
- **Integration plan:** how the current `renderer.ts`, `regions.ts`, `environment.ts`, `terrainSurface.ts` and `sim/world.ts` would migrate onto this. Write it as a plan; the coordinator composes after B1.

**Adverse case:** a fast traversal across 6+ chunks while construction is pending must not stall or leak.

## S2 — Remaining regions and islands
Starts after S1 publishes its descriptors. Authors the remaining regions, the other two islands and the research district, with source habitats, landmarks, return shortcuts and rescue access, following `docs/WORLD_PROGRESSION.md`. Each area gets one striking vista, one rich resource habitat and one refuge.

## S3 — Fleet art and the Hearthline interior
Original cel art for **Hush** (quiet survey glider), **Spindle** (surface island tender), **Mantle** (deep service craft) and **Hearthline** (inhabited carrier). Each needs a readable role silhouette, cockpit and access points, and colliders that match the visible geometry. Hearthline also needs a walkable interior kit: bridge, cabin/galley, storage, fabrication, a launch vestibule, two dry berths and authored furniture and equipment sockets. Follow B1's Creel art patterns in `fleetArt.ts`.

Also write hull role data proposals in `src/content/fleet/` (dimensions, collider, mounts, capacity, berth envelope, pressure envelope, per `docs/FLEET_AND_SURVIVAL.md`) and a dev viewer, `tools/fleet-viewer.html`.

**Adverse case:** a visible-geometry versus collider mismatch check for each hull.

## S4 — Ecology, encounters and hazards
Regional wildlife that responds to legible cues (noise, light, disturbance), with warning, evasion, cover and disengagement, and defensive or deterrent tools that don't require killing. The design comes from `docs/WORLD_PROGRESSION.md` and `docs/FLEET_AND_SURVIVAL.md`. Deliver:
- **Behaviors:** pure simulation modules for bounded active agents, at least three new behaviors for later regions, plus a few useful ecological interactions.
- **Hazards:** later-region hazards such as heat, currents, darkness and pressure, whose protective materials are reachable beforehand.
- **Art and viewer:** creature render leaves for the new species, and a viewer.

**Integration:** consume world queries through a small adapter interface, so it works against today's `sim/world.ts` and later S1.

**Adverse case:** a player cornered with no tool can still disengage.

## S5 — Campaign, evidence chain and ending
You are the lore owner and may read `docs/spoilers/NARRATIVE_CANON.md`. Keep the twist out of every handoff, commit message, filename, ID and string shown to players. Deliver:
- **The chain:** a rough, complete, playable mystery from the existing C01–C06 through the remaining evidence, to the authored resolution reachable by both fleet strategies. Include regional leads, corroboration across scans, journals and physical evidence, out-of-order discovery and interpretation, alternate sources for critical information, voluntary graduated hints, and a notebook that interprets the evidence.
- **Ending:** the ending machinery's rules and requirements, from the final repair requirements.
- **Form:** data plus pure rules, with placements proposed by region and site ID for S2.

**Adverse case:** a player who finds evidence in the reverse order still gets coherent notes, and no optional log blocks progress.

## S6 — Audio
A complete procedural soundscape, extending today's WebAudio system in `src/audio/sound.ts`:
- **Ambience:** distinct per-region ambience and depth layers, plus a warm refuge or interior bed.
- **Vehicles:** layers for each of the six hulls and the carrier.
- **Encounters:** the mix and its priority and ducking, warnings and their caption equivalents, and transitions.
- **Music:** a restrained musical identity for moments of discovery and the ending.

The host is muted. Verify with offline rendering (OfflineAudioContext in the browser), level and peak analysis and spectrum snapshots, and say plainly that no human listening was done. Expose an event-to-cue mapping the coordinator wires into `app.ts`. Add a dev page, `tools/audio-lab.html`.

**Adverse case:** a burst of many simultaneous events stays within the voice and level limits.

## Live task IDs (clientRequestId; the full ID is `node:delegated-task:command%3Amcp%3A6149902b-1c5f-4da8-84f4-9330f9f8bac8%3Adelegate-task%3A<id>`)
- S1 `siltwake-s1-world-runtime-6a0fa56`
- S3 `siltwake-s3-fleet-art-6a0fa56`
- S4 `siltwake-s4-ecology-6a0fa56`
- S5 `siltwake-s5-campaign-6a0fa56`
- S6 `siltwake-s6-audio-6a0fa56`
- GPU R3 review `siltwake-gpu-r3-sol-xhigh-8d6dba9`
- B1 (earlier root session) `node:delegated-task:command%3Amcp%3A2cbf186c-627f-4d86-933f-50a2dde43454%3Adelegate-task%3Asiltwake-m2-b1-opus-high-7bd259c`

## Ratified contracts
- **S1 world frame (2026-10-20):** X −576..1472, Z −1632..160 (+Z north, +X east), Y −800..+100, with 128 m chunks and today's coordinates unchanged. The types live in S1's `src/world/types.ts` and `src/render/kit/types.ts` (`393030a`), described in `docs/build/streams/S1.md` on S1's branch. Placement follows `docs/WORLD_PROGRESSION.md`: Reef NW, Isles N/E rim, Canopy E shelf, Pale Basin centre, Rift SW, Divide S saddle, Meridian SE.
- S2 live task: `siltwake-s2-regions-393030a`.

## Worktrees (2026-10-20; all resumed after the Claude usage-limit pause)
- **S1:** `t3-466e13a2` `t3/world-runtime-scale`
- **S2:** `t3-a50e5f9f` `t3/remaining-regions-islands`
- **S3:** `t3-6eca1f89` `t3/fleet-art-hearthline-interior`
- **S4:** `t3-a550755c` `t3/ecology-encounters-hazards`
- **S5:** `t3-bd05c0c7` `t3/campaign-evidence-ending`
- **S6:** `t3-74da9dce` `t3/siltwake-audio`
- **B1:** `t3-b6aef8ec`
- **GPU author:** `t3-b9861fd3`
- **GPU R4 review:** `siltwake-gpu-r4-sol-xhigh-6cc4bec`, on candidate `6cc4bec` (the OVMF 64 GiB window for ReBAR)

## Review outcomes
- **S5 R1 (Sol xhigh):** changes-needed. The four blockers are accepted and back with the author; the report is `review/s5` `d6eb7e7`. C09 placement: the Meridian gate hall, recorded in WORLD_PROGRESSION. S2 places it there. Planner versus real registry is checked at composition.
- **S6 R1 (Sol xhigh):** changes-needed (`review/s6` `1485704`). Wet path ignores pause and solo, warning causes get mislabelled, phrase lifetimes are short, plus boundary chatter and directional damage. All accepted and back with the author.
- **S1 R1 (Sol xhigh):** changes-needed (`review/s1` `55f335e`). P1: byte budgets are not enforced. Also mixed-LOD terrain cracks up to 8.5 m, and the legacy adapter needs spelling out. All accepted and back with the author; S2 to re-merge after the fix.
- **S3 R1 (Sol xhigh):** changes-needed (`review/s3` `45405ba`). The Spindle contact-state fit is bypassed; frame updates clear sockets. There is also a **pre-existing production bug**: the Dart cannot use the starboard berth (5 cm overlap). S3 proposes the fix, and the coordinator applies it at composition.
- **S4 R1 (Sol xhigh):** changes-needed (`review/s4` `dab1858`). The escape test removed walls (68 HP > 60), strikes go through cover, heat/brine warnings are 4.28 s, and persistence IDs are unsafe. All accepted and back with the author.

## Concurrency queue (cap: 5 Opus builders)
- **Running (4):** S1 (R1 fixes), S6 (R1 fixes), S7 (test tiers and saves), S8 (concise menus). S4's fixes are done at `0bdc223` (design changed, worst loss 45.6 HP), with an R2 Sol review running. The fifth slot is held for composition once B1 is accepted. S3's fixes are done at `83afb45`, with an R2 Sol review running. S2 is done at `3c185ca`, with its Sol R1 review running. The GPU fix is done at `785503c` (`qemu:commandline` plus a pre-shutdown `domxml-to-native` gate), with an R5 Sol review running. B1 is done at `2cff245` (587/587 `npm run check`), and its Sol R1 review is running. S5's fixes are done at `476a044`; the coordinator reproduced 59/59 tests, and an R2 Sol review is running.
- **Paused:** none. Each was told to commit and stop; resume with "continue".
  - S4 paused at `27de0fb`: S4-03 mostly done and S4-04 half done; S4-01, S4-02 and S4-05 not started; tests to update.
  - S3 paused at `682bdd3`: S3-01 and S3-03 done but unrun; S3-02 (the Dart berth proposal) and the S3.md updates remain.
  - S6 paused at `ab59c89`: all five fixes are in source, but their tests, the lab re-measure and the doc updates remain.
- **S2 decisions (coordinator):** the gate hall is at 769 m, beside the machinery at 770 m; S5's 700 m reference follows S2's site at composition. Also accepted: a Hearthline construction berth at the stack yard, the 950 m deep tether, and per-region optics. S2 must re-merge S1 after S1's R1 fixes.
- **S3-02 decision:** option B, trimming the Dart's fins to a 2.45 m envelope with no save change, applied at composition and proven with S3's `transferMatrix`.
- **S5 R2 (Sol xhigh): ACCEPTED** `476a044` (`review/s5-r2` `c61ed50`). S5-07, a non-blocking note that empty quote excerpts pass, gets a non-empty guard at composition. S5-05 stays a composition check.
- **B1 ACCEPTED** (Sol R1, accept with nits), integrated at `ccf8c44`. The nits go to S8.
- **S6 fixes done** at `230c7c1` (33/33 tests, lab 76/76). The R2 review waits for the Codex rate limit.
- **Retried at 03:19 after the Codex 429s:** S3 R2 and S4 R2 continued; S1 R2 re-dispatched (`siltwake-s1-review-r2b-sol-21d9247`); S6 R2 dispatched (`siltwake-s6-review-r2-sol-230c7c1`).
- **S2 R1 (Sol xhigh):** changes-needed (`review/s2` `f01b6f2`). P1: terrain triangles and LOD edges diverge from the floor, by up to 33.5 m. P2: the access/rescue proof stops short of attachment and tow outcome. Back with the author, who merges S1 `21d9247` first. The vistas are judged readable but still somewhat repetitive; polish comes later.
- **S3 R2 (Sol xhigh): ACCEPTED** `83afb45` (`review/s3-r2` `0b86c64`), with no new findings and all 6 mutations caught. The Dart fin trim (option B) is applied at composition and proven by `transferMatrix`.
- **S4 R2 (Sol xhigh):** changes-needed, narrowly (`review/s4-r2` `8a32962`). S4-06: inactive-actor recovery eats the post-load warning, leaving 3.28 s from warning to harm. S4-07: adverse-test mutations survive. The design is otherwise verified (capsule escapes at 28/28/45.6/18 HP). Back with the author.
- **S1 R2 (Sol xhigh):** changes-needed (`review/s1-r2` `920cc60`). The R1 issues are resolved, but two new P2s turned up: S1-04, where tight LOD swaps hide terrain while reporting ready, and S1-05, where external reservations refuse fitting chunks. Back with the author (5th builder slot).
- **S6 R2 (Sol xhigh):** changes-needed (`review/s6-r2` `c07e0a3`). Blocker S6-06: stealing an ambient-detail voice orphans its graph, leaving 120 nodes after 10 min, pause and reset. Non-blocking: mixed warning causes can reuse a stale notice, and pausing during a pursuit leaves a −74.8 dBFS residual. **Queued for the next free builder slot.** Report: `/home/worker/.t3/worktrees/subnautica-clone/t3-7202eb50/docs/build/reviews/S6-SOL-XHIGH-R2.md`.
- **Builder queue (cap 5):** running S1, S2, S4 and S6 (all fixing review findings) and S7 (additive saves). S8 is done at `98dcf72` and in Sol R1 review.
- **S8 copy proposals:** accepted. Drop stats from recipe names, shorten refusals, and have the service refusal mention moorings. Applied in the registry at composition.
- **S4 R2 fixes done** at `8f01513` (37 tests; walls, accounting and vibration mutations now caught). A focused Sol R3 review is running. One builder slot is held for composition, which starts when S7 lands.
- **S7 additive-content done** at `03d5839` (fast tests 544/544, heavy 9/9, browser import/export smoke). Sol R1 review running. **C1 composition** (Opus, 5th slot) started: merges S7 + S8 + S5 + S3 onto production, then wires the story and fleet in, applies the Dart trim and the copy proposals, and makes the planner use the real registry.
- **S6 R2 fixes done** at `35fe1c4` (37 tests, lab 78/78, orphans 0, pause digitally silent). A focused Sol R3 review is running.
- **S4 R3 (Sol xhigh):** changes-needed (`review/s4-r3` `f5595aa`). S4-06/07 are resolved, but S4-08: alternating control renews hazard grace forever (0 damage over 127 s). Back with the author with an explicit episode rule.
- **S1 R2 fixes done** at `84bbc86` (39 fast and 7 heavy tests, 10/10 mutations). A focused Sol R3 review is running. S2 should re-merge `84bbc86`.
- **S7 R1 (Sol xhigh):** changes-needed (`review/s7` `4020f8b`). No save defect found. Blockers: nested heavy-lock deadlock (root fixed `heavy-check.sh` at `3225577`) and a fast-tier guard that misses indirect and dynamic Babylon imports. Back with the author.
- **S4 R3 fix done** at `4696f7a`: grace is once per episode and persists across switching and save/load, with a reminder caption via `ecology.controlled`. A focused Sol R4 review is running.
- **S8 R1 (Sol xhigh):** changes-needed, small (`review/s8` `a74f5e2`). The production build has no shader errors and warnings are clear at all sizes. P2: notebook records stay expanded after later finds; P3: Creel mount focus jumps to Return. Back with the author.
- **S8 R1 fixes done** at `ff2364f` (288 tests; newest-only notebook, mount focus, fits at 960x600). A focused Sol R2 review is running; C1 told to merge it.
- **S1 R3 (Sol xhigh): ACCEPTED** `84bbc86` (`review/s1-r3` `78ec317`), with one P3: `settled` can be one frame early. **C2** (Opus) started: the renderer moves onto S1 streaming per the S1 migration plan, in files disjoint from C1.
- **S6 R3 (Sol xhigh): ACCEPTED** `35fe1c4` (`review/s6-r3` `dec5151`), with no findings. Audio wiring was added to C1 scope.
- **S4 R4 (Sol xhigh): ACCEPT-WITH-FIXES** `4696f7a` (`review/s4-r4` `7229b61`). The P3s S4-09 (max-age save becomes unloadable) and S4-10 (stale age shortens grace) are with the author; the coordinator inspects them. Ecology wiring goes to the next composition step after C1.
- **S7 R1 fixes done** at `8355a21` (fast 549/549 in 25 s; heavy 9/9; runtime Babylon guard; nested lock fixed). A focused Sol R2 review is running.
- **S4 FINAL: accepted at `854fdf1`.** The coordinator inspected the R4 P3 fixes (warning ages saturate at `MAX_WARNING_AGE`, stale ages are rejected or reset below 40%; 40 tests). Ready for composition.
- **S8 R2 (Sol xhigh): ACCEPTED** `ff2364f` (`review/s8-r2` `950d04f`). Non-blocking notes: manual disclosure choices reset on reload (contrary to the author note), and 17 px of trailing scroll at 960x600 with all controls visible. Left for the polish pass.
- **S7 R2 (Sol xhigh):** one P2, an evaluated-worker guard bypass (`review/s7-r2` `be625e6`). **Coordinator disposition:** non-blocking, because the guard targets accidents, not deliberate bypass. The author adds a static rule refusing worker/child_process/vm/eval in fast tests, and the coordinator inspects it. Otherwise clean.
- **S2 R1 fixes done** at `29017b0` (continuous floor, adaptive tessellation, edge-matched LOD, full access/rescue proof, 15 world fixes, 17/17 tests). Watch-out: fine chunks cost 0.3–2 s CPU each. A Sol R2 review with a GPU traversal timing is running.
- **S7 FINAL: accepted at `b395e68`** (the coordinator inspected the worker/vm/eval rule). **S7 and S8 are integrated into root.** The conflict in the notebook was resolved to S8 `notebook()` with the provenance by evidence ID (S7). Root fast tier 556/556, heavy 9/9 within budgets, build OK.
- **S2 R2 (Sol xhigh):** changes-needed (`review/s2-r2` `e87b3fc`), measured on the 3090. P2: streaming stalls (168 ms steps, 6.7 s camera holes at 60 m/s). P2: a ceramic-lip tow clips a chimney. P2: the preserve misses the B1 southern Basin (up to 6.2 m change). **Decision: bake terrain recipes at build time**, with async decode, coarse-first and a bounded cache. Back with the author; C2 told to keep its legacy extent configurable.
- **C2 done** at `3a59ec4`: renderer on S1 streaming, all 6 migration steps, startup 9-10 s → 2.75-3.45 s on the 3090, memory flat, 599 fast and 12 heavy tests. Known limits: 1-2 long frames during initial streaming, pop-in after Continue. A Sol R1 review is running.
- **C1 done** at `2e6188f`: story, fleet and audio live in the game; additive saves; Dart trim (16/16 transfers); 668 fast and 10 heavy tests. A Sol R1 review is running. **S9 campaign progression content** (Opus) started on C1: deep materials, 450/800 refits, Mantle, Hearthline, service stops and specialists, so that both strategies reach the ending on finite stock.
- **C2 R1 (Sol xhigh): ACCEPTED** `3a59ec4` (`review/c2` `653ab46`). P3: a cold deep Continue gave a 2.58 s entry frame (baked terrain should help). **Integrated into root at `67e6c8a`:** fast 599/599, heavy all ok, build OK.
- **C1 R1 (Sol xhigh):** changes-needed, narrow (`review/c1` `a757d5d`). P2: discovery music can start and continue during pause. P3: duplicate pressure/power/hull captions. Saves, determinism, fleet and play passed; the 192 CU refusal is fine. Back with the author, who also merges C2 (`67e6c8a`) and switches `regionAt` to `WorldMap`.
- **S2 R2 fixes and C2 composition done** at `706535b`: baked terrain (220 chunks, 14.9 MiB), 0 camera holes at 60 m/s, p99 about 20 ms, rerouted tether, B1 preserve bit-exact, `S2_ART` in `WORLD_ART`; fast 616, heavy 14. A Sol R3 review, playing on the 3090, is running.
- **S2 R3 (Sol xhigh): ACCEPTED** `706535b` (`review/s2-r3` `d65ebad`), no blockers. **Integrated into root at `2a12484`:** fast 616/616 and build OK. Heavy passed on the second run; the first run (under load) failed `regions-stream` and `world-stream`, which then passed alone and on the full re-run, so they are **flaky**. Hardening goes to C3.
- **Gap found by the S2 reviewer:** the simulation bounds inherited from B1 block swimming into the Rift and Divide. The renderer shows them but the sim can't reach them. This is C3's first job.
- **All 9 streams accepted** (B1, S1–S8 and S2). Compositions: C2 accepted and integrated; C1 R2 review running. S9 (campaign content) resumed after the usage limit.
- **C1 R2 (Sol xhigh): ACCEPT-WITH-FIXES** `31c6006` (`review/c1-r2` `fc372f4`). Its P3, the low-power chime caption duplicating the banner, goes to C3. **Integrated into root at `a09968b`:** fast 733/733, heavy pass, build, all 4 economy and progression checks. **C3 started:** lift the world bounds, real-sim journey to the Rift, Divide and Meridian, compose S4 ecology, place S5 sites, harden the flaky stream tests.
- **S9 done** at `a67c76a`: both strategies reach the ending in the real-registry planner; 11 deep-material sources at S2 sites; refits, Hearthline, Mantle and stops; solvency survives a failed rescue. A Sol R1 review is running. **S9 wiring folded into C3**, since it shares the bounds and validation code (C4 is no longer needed).
- **2026-10-20 midday:** the owner asked about agent usage. Running: C3 (critical path), plus **P1 playthrough harness** (new test code only) and **A1 art/vista pass** (presentation only, files disjoint from C3). That's 3 Opus builders under the cap of 5, plus the S9 Sol review. Going back toward 5 for polish after C3 lands.
- **S9 R1 (Sol xhigh): ACCEPTED** `a67c76a` (`review/s9` `ae11c1e`), with no defects; the economy, geometry, mutation and save checks were reproduced independently. C3 is already wiring it in.
- **A1 done** at `44099bf` (code `bdb37ce`): stripes and caustic net replaced by world-space noise; 4 vistas plus the Basin works yard; 17 scatter variants; cap bug fixed; terrain byte-identical; 3090 p99 within noise of R3. The coordinator saw clear improvement, with a concern that the sand reads flat. A Sol R1 review is running.
- **A1 R1 (Sol xhigh):** changes-needed (`review/a1` `a7a2785`). Blocker: the arch and wreck plates look solid but have no collision, so A1 adds `VISTA_SOLIDS` in `src/content/vistas.ts` and C3 appends it to the broad phase. Non-blocking, being done now: sand detail, ring visibility, vertical-tether keep-out gap. No systematic p99 regression; GPU cost is up about 0.6 ms.
- **P1 done** at `fcd37aa`: `npm run playthrough` plays the real sim from New Game through the Basin, Creel and story; creel-loss, reverse and no-optional all pass; on C3 WIP it reaches the Rift and builds the Hearthline. **5 game bugs found**, sent to C3: Creel 7% power after a haul, carrier interface radius, 0.84 m walkway, yard mooring blocking the build, carrier route charge. A Sol R1 review is running.
- **P1 R1 (Sol xhigh):** changes-needed (`review/p1` `bb786e5`). No state injection, determinism OK, and the first 3 game bugs were reproduced as real. Fixes: a parallel crash gives exit 0, a regression shows as "pending", works logistics exceed cargo and use the wrong site, and the carrier picks an under-rated Creel. Back with the author.
- **A1 R1 fixes done** at `610a1f8`: `VISTA_SOLIDS` (1,973 thin boxes, art inside, at most 0.35 m beyond), organic arch restored, sand detail, ring, 3D tether keep-outs; 738 fast and 16 heavy. A focused Sol R2 review is running. C3 appends `VISTA_SOLIDS` to the broad phase.
- **P1 R1 fixes done** at `038844b`: crashed children fail, a versioned pending list that can only shrink, honest works logistics, hull choice by rating; 739 tests. A focused Sol R2 review is running. C3 must prune `pending.ts` when it rebases onto P1.
- **A1 R2 (Sol):** changes-needed (`review/a1-r2` `5f254c1`). Collision bulges 1.55 m past the arch and 2.13 m past the ring, and the face-centre test misses it. Back with the author: finer boxes and a dense check. **P1 R2 (Sol):** changes-needed (`review/p1-r2` `a013b32`). Crash after JSON exits 0, swallowed dependencies, broken S2 sites shown as pending, works item tracking and remote transfers. Back with the author. **C3** was rate-limited at `d85c4c4` (P1 fixes 1-3 done) and has resumed.
- **P1 R2 fixes done** at `8e28ada`: child exit code required, dependency errors propagate, pending only if the ID is absent or out of the old bounds, assembly tracking, local-only transfers; 744 tests. A Sol R3 review is running.
- **A1 R2 fixes done** at `8fd3ae3`: collision within 0.35 m everywhere (worst 0.34 m) checked by a dense 0.25 m grid test; 5,271 AABBs. The coordinator accepts the count for now; C3 measures the broad-phase cost, with an oriented-box/capsule collider kind as the polish fallback (it would cut boxes about 10× and restore curved shapes). A Sol R3 review is running.
- **P1 R3 (Sol):** changes-needed (`review/p1-r3` `22aa4d1`). The R2 fixes are verified. P2: carrier loading asks for station keeping out of range. P2: a silently failed Creel refit passes, so every action's effect must be asserted. Back with the author.
- **A1 R3 (Sol):** changes-needed (`review/a1-r3` `c62cfde`). The arch and ring are fixed and the envelope checks pass. P2: `works.pipes` is anchored outside the chunk bounds, so it is invisible but has 182 colliders. A small fix plus an invariant test; the coordinator inspects it without a further round.

## Owner request (2026-10-20): world evolution
- **Gap confirmed:** the world floor is a single heightfield, so it has steep cliffs but **no caves, overhangs or underground areas.** The owner wants caves, cliffs and underground areas in iteration 1, plus richer landmarks, creatures and resources.
- **Noted for later (iteration 2):** an expanded map with a centralized hub/base and intermixed early/late biomes, like Subnautica's ring layout. Ours is currently a linear north-to-south progression.
- **Research (Sol 6.1 high):**
  - R1 layout and progression (`siltwake-research-r1-layout-progression`);
  - R2 caves and underground, design plus technology (`siltwake-research-r2-caves`);
  - R3 landmarks, creatures and resources (`siltwake-research-r3-landmarks-fauna`).
- **Next:** the coordinator consolidates these into an iteration-1 plan (caves and a content density pass) and an iteration-2 map note.
- **A1 FINAL: accepted at `7b81cbb`.** The coordinator inspected the pipe fix and the both-direction invariant test. **Integrated into root at `dfdb727`:** fast 739/739, build OK. `VISTA_SOLIDS` is 5,195 boxes, and C3 appends them to the broad phase and measures the cost.
- **World evolution research done**, and the plan is in [WORLD-EVOLUTION-PLAN](WORLD-EVOLUTION-PLAN.md). After C3: W1 caves (replacement volumes, 6 caves), W2 central hub and loops (Option A), W3 density pass. Iteration 2 (Option B, 3.2×2.8 km) is noted for later. Two S4/S2 conflicts were sent to C3.
- **P1 R3 fixes done** at `5079dc0`: every accepted command's effect and every phase's purpose are verified, the diver station-keeps at the vestibule (13.8 m, inside 15 m), 747/747 tests pass, and `npm run playthrough` exits 0 serial and with `--jobs 3`. Focused Sol R4 review running (`review/p1-r4`).
- **P1 R4 (Sol):** changes-needed (`review/p1-r4` `d82fac4`). P1-03, the silent refit and every earlier gate are verified. P1-05 is still open: the effect checks miss a wrong-source or duplicated transfer, a partial bulk store, and a craft output in the wrong container. Back with the author: full-snapshot conservation checks, plus making `commandEffect` fail closed.
- **P1 R4 fixes done** at `85e8fa9`: exact full-snapshot transactions for transfers, stores and crafts, with every command kind ruled and fail-closed; 748 tests pass, and the playthrough exits 0 serial and with `--jobs 3`. Focused Sol R5 review running.
- **W1-pre started** (Opus, `siltwake-w1pre-cave-kit-opus-1686d2a`): the Fanvault cave contract, one-source solids and shell, a cave lighting prototype and `tools/cave-lab.html`, in new files only. The sim, bake and `materials.ts` wiring wait for C3. Builders: C3, P1, W1-pre (3 of 5).
- **W1-pre done** at `fe00f5e` (`t3/siltwake-fanvault-cave`): the Fanvault loop, a diver-only 18–26 m vault with skylight, 1,504 rock boxes from one source, a cel-shader light field and lamp, and `tools/cave-lab.html`; 751 tests pass. Sol R1 review running.
- **W1-pre R1 (Sol):** changes-needed (`review/w1-pre-r1` `be5360f`). The geometry is verified (shell within 0.31 m, no diver gaps, 16.7 ms on the 3090). Three P2s:
  - the lamp-off test is not a real retreat;
  - the lamp transmits 57% through rock;
  - the floor wrapper breaks straddling clearance and the legacy guards.

  Back with the author.
- **W1-pre R1 fixes done** at `90d38b3`: a real swept lamp-off retreat (82/82 starts exit), an exact voxel lamp walk checked against the 3090 on 2,734 rays, and a prototype adapter `src/sim/caveWorld.ts` with full-actor ownership and the legacy guards preserved; 760 tests pass. Sol R2 running.
- **W1-pre R2 (Sol):** changes-needed (`review/w1-pre-r2` `803e9cf`). R1-01, R1-02 and the original R1-03 cases are verified. W1-PRE-04 (P2): the adapter picks the composite once per move, so distant exterior walls vanish. Plus a P3 lamp-skin oracle. Back with the author.
- **Owner design interview → [GAME-DIRECTION](GAME-DIRECTION.md)** (2026-10-20). Started LC (large-cave technology), SYS-1 (upgrades and power) and SYS-2 (outposts, decoder, cultivation, survey, chart, journal, timeline), in new files only. Builders 5 of 5: C3, W1-pre, LC, SYS-1, SYS-2.
- **W1-pre R2 fixes done** at `0fc6c40`: owner chosen per sub-sweep (0.5 m steps, every exterior solid kept), and a pinned lamp-skin oracle; 766 tests pass. Sol R3 running.
- **W1-pre R3 (Sol): accept** (`review/w1-pre-r3` `2b57b8f`). Integrated at the merge of `0fc6c40`: 781 tests pass, build OK. P3 W1-PRE-06: use the 8 m cave index at integration (diver move plus support 42.9 → 18.9 µs).
- **CB started:** a region content bible (lore and world) per region plus the 4 cave biomes, with typed proposals in `src/content/proposals/*`. Builders 5 of 5: C3, LC, SYS-1, SYS-2, CB.
- **SYS-2 done** at `c910fea` (`feat/sys-2-bases-knowledge`, `t3-de5d23dc`): socket hosts, outposts, decoder, cultivation, survey and ping, beacons and chart, journal model, local play timeline and report; 810 tests pass. Its open question (the carrier bridge socket accepting `decoder`) is decided yes per GAME-DIRECTION, at composition. Sol R1 running. Builders 4 of 5: C3, LC, SYS-1, CB.
- **2026-10-20, after the usage-limit reset:** C3, LC, SYS-1 and CB had hit the rate limit and were resumed. C3 is at `32c91c7`, where the Creel route reaches the ending. **SYS-2 R1 (Sol):** changes-needed (`review/sys-2-r1` `e91cf21`):
  - F1 (P1): recovery re-IDs modules and orphans jobs;
  - F2: a cutting goes into a container that rejects it;
  - F3: the carrier bridge leaves a stale occupant;
  - F4: duplicate layout references duplicate modules;
  - F5: a stationary helm counts as travel;
  - F6: reload loses an open death.

  Back with the author. Builders 5 of 5.
- **SYS-1 done** at `1bef219` (`feat/sys-1-upgrades-power`, `t3-88d63485`): 45 upgrades (common pool plus signatures), slot limits, depth-safe removal refusals, power sources with catches, air lines (27 m and Mantle 60 m), and an economy check; 832 tests pass. Advisory: S9 Creel refit costs fall per tier, against the tier rule; adjusted costs are proposed for composition. Sol R1 running. Builders 4 of 5: C3, LC, CB, SYS-2 (fixing).
- **CY started:** a currents and cycles sandbox (authored current volumes, a cycle framework, 4 cycle prototypes with keep-or-cut assessments, a turbine stub), in new files only. Builders 5 of 5: C3, LC, CB, SYS-2 (fixing), CY.
- **SYS-2 R1 fixes done** at `60ea1c7`: modules and kits kept through incapacity (wrapper until composition; the fix is the one-line `recovery.ts` filter `!retainsIdentity`), two-output harvest check, write-through carrier sockets, layout invariants, motion-based travel, death restored on reload; 822 tests pass. Sol R2 running.
- **SYS-1 R1 (Sol):** changes-needed (`review/sys-1-r1` `d36a4c1`). P2: removing heat protection while overheated passes because the margin loses its magnitude. P2: dry-berth removal gives no heat or brine warning. P3: the tier guard uses `>=`. The rest is verified. Back with the author.
- **SYS-2 R2 (Sol):** changes-needed (`review/sys-2-r2` `22aa41a`). The R1 fixes are verified, the F1 wrapper is OK before composition, and 822/822 pass. P2: two outstanding deaths lose a recovery. P2: the validators accept orphan or incompatible carrier socket entries. Back with the author.
- **Cap:** the SYS-2 R2 fix run was interrupted to stay within 5 Opus builders. It is **queued** and resumes when the next builder finishes (likely SYS-1).
- **SYS-1 R1 fixes done** at `faa97ed`: survival-rate heat comparison, `berth.exterior` launch warnings, strict tier rule; 834 tests pass. Sol R2 running. SYS-2 R2 fix **resumed** in the freed slot. Builders 5 of 5: C3, LC, CB, CY, SYS-2.
- **SYS-1 R2 (Sol):** changes-needed (`review/sys-1-r2` `509d9b3`). Heat and strict-tier fixes are verified. One P2: an optional `berth.exterior` defaults to safe water; require it or refuse affected previews. **Queued** for the SYS-1 author when a slot frees (5 of 5 running).
- **SYS-2 R2 fixes done** at `1a336bf`: per-death outstanding recoveries keyed by cache or loss, and a state-aware socket/host/kind check; 825 tests pass. Sol R3 running. The **SYS-1 R2 fix started** in the freed slot. Builders 5 of 5: C3, LC, CB, CY, SYS-1.
- **SYS-1 R2 fix done** at `40f60fb`: `berth.exterior` required and the safe-water fallback removed; 834 tests pass. Sol R3 running. Builders 4 of 5: C3, LC, CB, CY.
- **CB done** at `489ddfb` (`t3/siltwake-content-bible`, `t3-c679ebd1`): the bible, 8 region files, 4 cave-biome files and typed proposals with a placement and density test; 794 tests pass. Pacing estimates: main path 8.8 h, blind first playthrough ~11.2 h, everything 13.6 h. **Coordinator decisions:**
  1. The 10 h floor is measured on a skilled *blind first playthrough* (per GAME-DIRECTION), so ~11.2 h meets it. Still lure players toward the Drop Cathedral and Rootways; never add errands.
  2. The first craft (Dart, shore materials) is the tier-rule baseline.
  3. Main-path copies of the standard and advanced outpost-kit plans are required (folded into SYS-2 or composition).

  The hub crown pinnacle (about 240 m of new terrain) versus the apron fallback is decided with W2 after the experience audit. Sol R1 running. Builders 3 of 5: C3, LC, CY.
- **SYS-1 R3 (Sol): accept** (`review/sys-1-r3` `57c260f`). Integrated, new modules only: 834 tests pass, economy OK. Wiring follows C3.
- **SYS-2 R3 (Sol):** changes-needed (`review/sys-2-r3` `0ecb054`). The R2 fixes are verified; "nothing lost" and "tow until patch" are accepted. P2: salvage canisters close recovery early. P2: unrelated deposits keep a death open. Back with the author, together with the CB decision on main-path outpost-kit plans. Builders 4 of 5.
- **CB R1 (Sol):** changes-needed (`review/cb-r1` `39393fb`). Spec fit, adverse case and spoilers are verified. CB-01: early samples let a player skip the Rift for the 450 tier, and the wrong previous limits are used. CB-02: some caves break their size class or loop rule. CB-03: the seam mouths sit above its domain. Back with the author. Builders 5 of 5: C3, LC, CY, SYS-2, CB.
- **SYS-2 R3 fixes done** at `e65f0f4`: a per-death cargo ledger (shrink-only, saved in exports), salvage canisters carry the obligation, and main-path copies of the decoder and 3 kit plans with a `mainPathPlanProblems` check; 830 tests pass. Sol R4 running. Builders 4 of 5: C3, LC, CY, CB.
- **CY done** at `e3c9a64` (`feat/cy-currents-cycles`, `t3-31352b4a`): current volumes with drift through the existing sweep (no riding), station keeping that costs power, a cycle framework, and the lab. Keep or cut: vent pulse keep; slackening current keep sparingly; bloom cut as a cycle (rework as regrowth); migration keep as behaviour; turbine cut for small craft (possible Hearthline-anchor perk). Composition notes: three `step.ts` changes, remove C3's second ecology drift move, retire S2's stale chimney cycle. 814 tests pass. Sol R1 running. Builders 3 of 5: C3, LC, CB.
- **SYS-2 R4 (Sol):** changes-needed (`review/sys-2-r4` `c1902fc`). One P2: same-kind deposits keep a death open. Coordinator direction: attribute by stack identity, settle ambiguity in the player's favour, keep it simple. Back with the author. Builders 4 of 5.
- **SYS-2 R4 fix done** at `72786dd`: recovery attributed by stack identity, deposits never add, ambiguity settled for the player; 832 tests pass. Composition must check kit prerequisites in the route graph. Sol R5 running. Builders 3 of 5: C3, LC, CB.
- **CY R1 (Sol):** changes-needed (`review/cy-r1` `01f6876`). P1: cross-current wall contact destroys hulls sliding along rock. P2: diagonal movement gains speed (riding). P2: downflow pins supported hulls in `moveHull`. P2: the C3 migration drops the Basin sediment flow. Back with the author. Builders 4 of 5: C3, LC, CB, CY.
- **SYS-2 R5 (Sol): accept** (`review/sys-2-r5` `9178b9d`). Integrated, new modules only: 912 tests pass, build OK. Composition obligations are listed in the merge commit.
- **CB R1 fixes done** at `a84a3c9`: tier rule against the real previous limits, frontier sources at exactly 150/350/450 m, samples cut so they can never pay a tier, typed cave water extents and topology, seam domain at −350 with 3D entrance checks; 798 tests pass. **Coordinator decision:** the 150 m suit shares the Dart's tier-rule baseline (both are shore-stock starters). The Fanvault (about 51 m of water) is a disclosed exception. Proposed recipe changes for the registry, S9 and SYS-1 are applied at composition, followed by a rerun of the playthrough and economy checks. Sol R2 running.
- **CY R1 fixes done** at `41858b7`: impact only from drive closing into the face; a no-riding rule (progress never beats the better of still water and drift); `supportedDrift` for floor contact; `fromHazardField` migrating both C3 flow fields (worst difference 5.6e-17); `move.ts` as the single movement owner. 824 tests pass. Sol R2 running. Builders 3 of 5: C3, LC, CB (in review).
- **CB R2 (Sol):** CB-01 and CB-03 closed (exact snapshots; an independent ledger pays both routes; entrances valid in 3D). Remaining: the loop half of CB-02. Medium caves need a real cycle, not an exit-to-exit chain, and the topology test needs a cycle check. Back with the author.
- **CA-1 started:** Reef and Isles small and medium caves authored with the W1 kit from the bible (medium caves have real loops), with a lab mode, performance numbers and a lamp-off/low-air adverse case. Builders 4 of 5: C3, LC, CB, CA-1.
- **CB R2 loop fix done** at `ac40de9`: all 15 medium caves have a real chamber cycle, passage edges with a named closing passage, and a cycle test with a self-test; 799 tests pass. Sol R3 running.
- **CY R2 (Sol): accept** (`review/cy-r2` `362a508`). Integrated, new modules only: 955 tests pass, build OK. Keep or cut is recorded in the merge commit (owner may override).
- **C3 progress:** `e0c4ea3` shows the harness reaching the ending on **both routes** (`npm run playthrough` exits 0, 5/5 complete). The handoff should be close. **CA-2 started:** Canopy and Basin small and medium caves, with no kit or lab edits (they go to CA-1) and its own lab page. Builders 4 of 5: C3, LC, CA-1, CA-2; one slot held for C3 review fixes.
- **CB R3 (Sol): accept** (`review/cb-r3` `211634b`). Integrated (docs plus typed proposals): 973 tests pass.
- **C3 ready** at `e190176`: **both routes reach the ending** (`playthrough --jobs 3` 5/5); carrier launch/capture fixed below 200 m and at angled headings; works hold-lending within 30 m; HUD fixes; 3090 keyboard play at ~60 fps (p95 16.7 ms). Merges cleanly with root. **Sol R1 running** (`siltwake-c3-review-r1-sol-e190176`). Builders 4 of 5: LC, CA-1, CA-2, plus C3 idle pending review.
- **C3 R1 (Sol):** changes-needed (`review/c3-r1` `065d9b7`). Both routes finish (5/5, 72 reloads match), the completion routes are legitimate, the physical roster and carrier probes are good, and the 3090 runs at 60 fps. Two P2s block saving: new recipe outputs overfill the diver hold, and salvage leaves a stale ecology entry. Also asked: autosave recovery after a failed save, and two P3 test pins. Back with the author, together with a merge of root.
- **C3 R1 fixes done** at `8eeb99e`: output placement checked for every carried output, salvage clears ecology ownership, autosave retries after a validation refusal, P3 pins, root merged; 1,071 tests pass, playthrough 5/5. Sol R2 running.
- **C3 R2 (Sol): accept** (`review/c3-r2` `6804b76`). **Integrated at `a21e764`.** On root: 1,071 tests pass, build OK, and `playthrough --jobs 3` reaches all 5 endings (14 saves matched, no blockers). **Milestone: a rough complete game, finishable on both routes.** P3: a stale autosave notice shows briefly after a New Game save.
- **Started:** C4 (compose systems in two stages) and the M2 stage-exit Opus experience audit (`siltwake-m2-experience-audit-opus-ffc9847`). Builders 5 of 5: C4, audit, LC, CA-1, CA-2.
- **Usage-limit reset:** C4, the M2 audit, LC and CA-1 had hit the limit and were resumed; CA-2 was already running. Builders 5 of 5.
- **CA-1 near done** at `0ed2219`: 18 Reef and Isles caves plus the Fanvault, 1,096 tests pass, every one of 1,515 lamp-off starts escapes. The adverse-case rerun is queued on the heavy lock. **Performance flag:** 153,092 cave boxes loaded, diver step 97.8 µs with the 8 m index. Caves for four regions will be more, so composition must budget query cost. **Lock contention:** the M2 audit holds the heavy lock up to 2 h; asked it to split into jobs of at most 30 minutes.
- **Owner decision:** hub = central pinnacle (A). The crown station is deliberately better than the pod: staged restoration, refit bench, dock, large lockers, 6 sockets, survey, wake at the last rested base. Recorded in GAME-DIRECTION. **W2 queued** after C4 stage A.
- **C4 stage A done** at `b08747f` (`t3/integrate-world-systems`, `t3-75d095f9`): caves and currents composed into the real game, the Fanvault in the world, a 220-chunk rebake verified, playthrough 5/5, 1,088 tests pass, 3090 keyboard run at 60 fps. Design changes to judge: a 0.6 m underwater step-up for swimmers, and hull damage only from drive into a face. Sol R1 running. C4 holds for the stage B go-ahead.
- **M2 stage-exit Opus experience audit** (`review/m2-opus-audit` `b6a9b5b`, report now in root). Verdict: the opening is clear and charming, and both routes finish. The deep half is a well-lit commute; the carrier runs through a dev panel; only the Dart and Creel earn their place.
  - **Estimate:** skilled blind first-timer about 4–6 h (Creel route) and 6–8 h (carrier route), with 40–50% of that repeated travel.
  - **Dispositions:**
    - **#1 depth darkness, #6 camera, #10 Rift warmth:** to **ATM-1** (started, based on C4 stage A `b08747f`).
    - **#3 refits at restored stops, Dart 450, outposts; #5 objective and practical hints; #7 signature roles; #8 gaps via decoder; #9 journal, menus, HUD header, title; save re-import:** folded into **C4 stage B**.
    - **#2 carrier dev panel and helm view:** queued **UX-1**, after C4 B (it touches the UI).
    - **#4 hunter readability:** queued **ENC-1**.
    - **#10 mid-route points of interest and landmarks:** the CB density pass, after the cave builders.
  - Builders 5 of 5: C4, ATM-1, LC, CA-1, CA-2.
- **LC done** at `ccb76e8` (`t3/large-cave-biome-lab`, `t3-38ff32f5`): a distance field meshed per 32 m chunk is both art and collision (they agree at 0 m). Collision is ~10× faster than W1 boxes, with no snagging on walls, at ~12× the memory. A 250 m five-zone sandbox runs at 60 fps on the 3090; streaming is safe at 16 m/s; a shared cave-collider composer serves box and mesh caves. The sandbox placement conflicts with the bible, so the real biome is Lantern Rootways at X 880–1100 (content job). Sol R1 running. Builders 4 of 5.
- **ENC-1 started** (based on C4 stage A): a readable first hunter encounter, with a silhouette, a non-lethal first contact and damage ramp, non-text cues, the counterplay taught, a reserve cell obtainable, and the same pass for the other threats. Builders 5 of 5: C4, ATM-1, CA-1, CA-2, ENC-1.
- **C4A R1 (Sol): accept** (`review/c4a-r1` `dc19376`). The swim lip is safe (refuses 0.61 m risers and walls, no climbing), hull contact is acceptable, caves and currents are correct, runtime riding excess 1e-12, 60 fps at 1080p in the cave, saves in the cave and the current. **Integrated at the merge of `b08747f`:** 1,088 tests pass, build OK. P3s (runtime damping and cliff-guard test pins) go to C4 stage B. **W2 (central pinnacle hub) unblocked**, queued for the next free slot.
- **LC R1 (Sol):** changes-needed (`review/lc-r1` `ea32eb8`). LC-01: buried collar-straddling clearance. LC-02: streaming safety lost under budget pressure after entry. LC-03: retained bake and map buffers not counted. Four-biome estimate: ~143 MiB fixed CPU, fits 256 MiB only with eviction. Back with the author. Builders 5 of 5: C4, ATM-1, CA-2, ENC-1, LC. **Queued:** CA-1's final adverse-table rerun (its run ended at `0ed2219`), then W2.
- **Usage-limit reset (2026-10-21):** C4 (stage B), ATM-1, ENC-1 and LC (R1 fixes) had hit the limit and were resumed; CA-2 was nudged. Builders 5 of 5. Queued: the CA-1 final rerun, then W2.
- **ATM-1 done** at `f7923b8` (`t3/atm-1-depth-lighting`, `t3-5016c37c`). Depth brightness: Basin 140 → 38, Rift 106 → 27, Divide 91 → 18, Meridian 90 → 15; the Creel arm whiteout is fixed; 60 fps everywhere; marker and surface glow in the lamp-off case. Limits: distant landmarks vanish beyond 450 m; no shadows on local lights. Sol R1 running; the owner judges the look. **CA-1 resumed** for its final rerun in the freed slot. Builders 5 of 5: C4, ENC-1, LC, CA-1, CA-2.
- **ENC-1 done** at `8639ed6` (`t3/enc-1-readable-threats`, `t3-208fe0c1`): a silhouette pass before pursuit, a non-lethal 6% first bump then ramped bites, edge cues, a teaching hint (no free cell; the validator caps cells at 2), and the same readability for the stalker and skate. 1,095 tests pass, playthrough 5/5. Touches small UI hooks owned by C4 (merge with C4 stage B). Sol R1 running. Builders 4 of 5: C4, LC, CA-1, CA-2. **Next free slot: W2 hub.**
- **W2 started:** the central pinnacle hub. Phase 1: terrain spur and crown, rebake, routes and rescue, hub caves in `CAVE_SOURCES`, crown rays and beacon. Phase 2: the crown station against C4 stage B's host and registry interfaces. Builders 5 of 5: C4, LC, CA-1, CA-2, W2. Reviews running: ATM-1, ENC-1.
- **ATM-1 R1 (Sol): accept** (`review/atm-1-r1` `7bf47be`). **Integrated:** 1,098 tests pass, build OK, GPU lamp check 0/3,200 mismatches, about 60 fps at 1080p in all regions. **Polish backlog (P3):** a 0.66 m camera pop on overlap escape; test pins for lamp range, work view and surface depth; large silhouettes lost beyond about 120 m in deep water (landmark lights or rims for the atmosphere pass); pilot views for the other hulls.
- **LC R1 fixes done** at `9e39508` (rebased onto C4A): whole-box two-owner clearance; a streaming movement gate with `caveArtMinimum` (19.5 MiB for the Canopy); every retained buffer counted (37.2 MB fixed per biome; four-biome estimate ~126–147 MiB). 1,118 tests pass. Sol R2 running. Builders 4 of 5: C4, CA-1, CA-2, W2.
- **CA-3 started:** Rift, Divide and Meridian small and medium caves from the bible (hazard-aware escape, story-neutral Meridian), in new files with its own lab page. Builders 5 of 5: C4, CA-1, CA-2, CA-3, W2.
- **ENC-1 R1 (Sol):** changes-needed (`review/enc-1-r1` `ed17ba8`). P2: the warning knockback can disable a quiet, dark craft against rock. P2: saves with interest above 7 defeat the quiet escape. P3s: the view-gate test and the cadence (bites actually ~2.5 s apart). Merge note: conflict with C4B in `ui/view.ts`. **The fix run was paused for the cap and is queued** behind CA-1, which still has a pending run. Builders 5 of 5: C4, CA-1, CA-2, CA-3, W2.
- **LC R2 (Sol):** changes-needed (`review/lc-r2` `bb21683`). LC-01, LC-03 and LC-04 are closed (exact buffer count of 32.96 MB, 78/78 buried hull poses refused). **LC-02 is still open:** under sustained pressure the gate refuses even physically clear retreats (stranding), and minimum-share admission is not enforced. **Coordinator direction for the fix:**
  - keep the occupied biome's coarse LOD (plus the mouths and collar) permanently pinned as a non-revocable reservation counted at admission;
  - the gate requires only coarse coverage, which is guaranteed, and fine LOD is opportunistic;
  - admission is enforced (hold outside the mouth if the reservation can't be made);
  - regression: keep the pressure and actually back out to exterior water, with a forward-into-uncovered control.

  **Queued** for the next free slot, after ENC-1.
- **Usage-limit reset (2026-10-22):** C4, W2, CA-1, CA-2 and CA-3 had all hit the limit and were resumed; each was told to commit a WIP checkpoint first (C4 had about 87 uncommitted files). Builders 5 of 5. **Queued:** ENC-1 R1 fixes, then LC R2 fixes.
- **CA-1 done** at `cfe64a8`: 18 Reef and Isles caves in `AUTHORED_CAVE_SOURCES` (not yet switched on); 1,494/1,494 lamp-off starts escape; the adverse case surfaces with 7.7% air. Switch-on needs C4 to adopt `border-cuts.patch` (non-4 m footprint edges break chunk borders), the ground-read fix and the test patches. Cost: 6–9 s of builds plus 3–5 s of collision at first use, bake 15.4 → 22.3 MiB, so build lazily or bake. Sol R1 running. **ENC-1 fixes resumed** in the freed slot. Builders 5 of 5: C4, W2, CA-2, CA-3, ENC-1. Queued: LC R2 fixes.
- **CA-1 R1 (Sol):** changes-needed (`review/ca-1-r1` `9eca9f4`). P2: the Blowhole dry ledge and chimney-top exit are unreachable through game movement (the route test clamped above-water targets). P3: a regression test for the light-field fix. Composition patches verified, bake 220/220; recommends baking static collision before registration. **Fix queued** (CA-1 author) behind LC. Queue order: LC R2 fixes, then CA-1 R1 fixes.
- **CA-2 done** at `ff18178` (`t3/canopy-basin-caves`, `t3-1722ec11`): 13 Canopy and Basin caves in 12 sources (root hollows with weavers; silt vaults with wakeglow), all 3 crawlways, adverse wake escape in 11.9 s, 149/149 heavy tests. **Kit issues for C4:** a light-field float32 path-length bug (passages read dark, west rim build over 10 min; check against CA-1's lightField fix); the carrier box is refused above cave footprints (about 25 m clearance, or the kit adds a vertical test); rock sinks at uphill edges. Sol R1 running. **LC R2 fix started** in the freed slot. Builders 5 of 5: C4, W2, CA-3, ENC-1 (playthrough finishing), LC. Queued: CA-1 R1 fix.
- **W2 done** at `2d09dc0` (`t3/central-pinnacle-hub`, `t3-f3c46250`). Phase 1 (`6f7df8a`): the pinnacle spur and crown in the world, rebake 220/220, the carrier lane gap, 4 hub caves in `CAVE_SOURCES`, the beacon and crown rays; playthrough 5/5; 60 fps. Phase 2: the crown station as data and rules against C4B interfaces, with 7 composition edits after C4B. **Coordinator call:** keep the beacon lit from New Game, as a lure and findability aid in the dark; restoration brightens it. **Light field:** three different fixes (CA-1 rounding, CA-2 float32 copy, W2 memory overflow); C4 reconciles one kit fix. Sol R1 running. **CA-1 R1 fix started** in the freed slot. Builders 5 of 5: C4, CA-3, ENC-1, LC, CA-1.
- **LC R2 fix done** at `589d1c0`: a reservation arbiter (fixed bytes plus a non-revocable 3.56 MiB coarse safety set), a coarse-coverage gate, enforced admission held outside the mouth, and anti-stranding regressions; the 3090 retreat under sustained pressure works. One admitted biome needs 39.0 MiB CPU. Sol R3 running (it also checks that holding on reload can't drown the player). Builders 4 of 5: C4, CA-3, ENC-1, CA-1.
- **POI-1 started:** points of interest every 300–400 m along the deep legs, plus lights or rims on the major landmarks so they read in ATM-1 darkness (audit #3, #10; ATM-1 P3). New files only. Builders 5 of 5: C4, CA-3, ENC-1, CA-1, POI-1. Reviews running: LC R3, W2 R1, CA-2 R1.
- **CA-2 R1 (Sol):** changes-needed (`review/ca-2-r1` `54fd8bb`). All 21 diver and 4 hull routes pass through `stepGame` with unclamped targets; the wake escape works through the game step (13.35 s, 12.6% air left); no overlap with CA-1. P2: four content datums sit on rock faces, so targeting and line of sight are blocked (offsets of +0.3 m proposed). P3s: a light-precision regression (same gap as CA-1, to fix once in the kit) and the wake test bypassing the production selector. Note: it's 15 caves, not 13. **Fix queued** for the next free slot.
- **LC R3 (Sol):** changes-needed (`review/lc-r3` `9c41d41`). The R2 retreat trap is fixed. **LC-02 (P1):** an inside reload with insufficient budget holds forever, and real survival drowns the diver at 180 s. **LC-05 (P2):** competing fine residencies spend the same remainder, exceeding the caps.
  - **Coordinator direction:**
    - (a) the occupied biome's fixed and safety reservation has top priority: it is reserved **before the simulation resumes** on a reload, evicting other owners' opportunistic art;
    - (b) while held for admission the game is in a **loading state**, with the simulation clock paused (no oxygen, exposure, power or damage ticks) and a visible "loading cave" indicator;
    - (c) if admission still can't succeed within a few seconds, relocate the player to the nearest mouth's exterior water (rescue) and say so;
    - (d) the arbiter allocates one shared remainder across fine residencies;
    - (e) regressions advance real survival past a full air supply while held.
  - Not yet wired into the game, so there is no player risk now. **Queued first** for the next slot, ahead of the CA-2 fix.
- **W2 R1 (Sol):** changes-needed (`review/w2-r1` `a8d1fab`). Both routes complete, the light-field fix is correct (W2, CA-1 and CA-2 fix the same Float32/Float64 mismatch), and the GPU landmark checks passed.
  - **Findings:**
    - W2-01: hub cave cuts off the 4 m grid crack terrain borders by 2–6 cm, the same defect as CA-1's `border-cuts.patch`;
    - W2-02/03/04: phase-2 station rows don't execute against C4, stage 1 bypasses the paid dock, and the bench predicate is incomplete;
    - W2-05 (P3): a light regression test.
  - **Coordinator decision:** split W2.
    - **Phase 1** (terrain, caves, beacon, rays, light fix) is the acceptance target. Fix W2-01 by adopting CA-1's union-of-cuts border patch on the W2 branch, which owns terrain, and add the light regression.
    - **Phase 2 (crown station)** is **deferred** to a composition task after C4 stage B is accepted, with W2-02, 03 and 04 folded in there.
  - **Queue order:** LC R3 fix, W2 phase-1 fix, CA-2 fix.
- **CA-1 R1 fixes done** at `de2c353`: the Blowhole gets a wading shelf plus a ledge one step up (keyboard test in and out), the chimney top is air and daylight only, there are no clamped targets anywhere, and a standable-waypoint check plus a light-field regression were added; 1,123 tests pass. Note for C4: allow the step-up at the surface. Sol R2 running. **LC R3 fix started** in the freed slot. Builders 5 of 5: C4, CA-3, ENC-1, POI-1, LC. Queue: W2 phase-1 fix, then CA-2 fix. Light-field consensus: the Float64 one-liner plus W2's cut-off; delete CA-2's `lightFix.ts` copy at composition.
