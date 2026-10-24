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
- **C4 stage B done** at `96c7560` (code `686079f`; range `b08747f..96c7560`, root merged with ATM-1): SYS-1, SYS-2, CB and the UI composed; the HUD objective, tabbed journal and fit/base screens; the timeline and feedback key; waking at the last rested base. 1,111 tests pass, heavy and build OK, 6 economy scripts pass. **Playthrough 5/5:** both routes use a kit plan, plating, a decode and a crop, and the independent route uses a forward outpost. 3090 keyboard check passed. Decisions under review: air line from any powered craft; Dart 450; the field fabricator plan from the first lost-site decode (main-path rule being checked); objective on by default. Sol R1 running. **W2 phase-1 fix started** in the freed slot (phase 2 deferred). Builders 5 of 5: CA-3, ENC-1, POI-1, LC, W2. Queue: CA-2 fix.
- **C4B R1 (Sol):** changes-needed (`review/c4b-r1` `2ea00b5`).
  - **Confirmed:** saves load (the schema-6 bump and bridge are warranted), conservation holds, and both routes are legitimate (Creel 197 min, carrier 319 min). The fabricator-plan decision is OK: it's optional convenience, and the required decoder and kit plans are on main-path records. The UI is readable on the 3090 and 5/5 mutations were caught.
  - **Findings:**
    - P1: outpost charging is not reachable through the UI (the playthrough bypassed it);
    - P2: the carrier charger draws power without charging berths;
    - P2: thermal exchanger heat tolerance is unwired;
    - P2: reserve insertion ignores larger battery capacity;
    - P2: berth warnings sample the wrong exterior;
    - P2: idle time counts as play (confirmed on the 3090);
    - P2: cycle timings are revealed by scanning instead of observation.
  - **Queued first** (C4 author) for the next free slot, ahead of CA-2. This blocks the owner playtest.
- **CA-1 R2 (Sol): accept** (`review/ca-1-r2` `4cafc37`); 42 unclamped routes pass, and forward surface swimming reaches the shelf. **Integrated** (caves not yet switched on; the kit Float64 light fix is now on root): 1,123 tests pass, build OK. P3: surface step-up, for C4.
- **W2 phase-1 fixes done** at `985608c`: CA-1's border-cuts patch, extended to the legacy edge, with an every-border, every-LOD regression; a light-distance regression; phase 2 marked as an unwired proposal. Sol R2 running. **C4B R1 fixes started** in the freed slot (plus the surface step-up and a root merge with CA-1). Builders 5 of 5: CA-3, ENC-1, POI-1, LC, C4. Queue: CA-2 fix.
- **CA-3 done** at `4216ea7` (`t3/rift-divide-meridian-caves`, `t3-b1f6f295`): 21 Rift, Divide and Meridian caves in 20 sources, unregistered (`DEEP_CAVE_SOURCES`). 6,189/6,189 lamp-off starts escape; hazard-safe from load 70 at 20% air; adverse worst case 5.9 s. One warned niche case costs about 5 health. 19,628 boxes, 2.5 s to build. Composition notes: hazard fields, the crest current inside caves, the palette hook. Sol R1 running. **CA-2 R1 fix started** in the freed slot. Builders 5 of 5: ENC-1, POI-1, LC, C4, CA-2. **Cave authoring is now complete for all 7 regions plus the hub (about 58 caves); switch-on plus baked collision is a composition step after C4B.**
- **2026-10-22 (after the usage limit):**
  - **W2 R2 (Sol): accept** (`review/w2-r2` `0472a9a`). Phase 1 is being merged into root, with conflicts resolved (hub caves in `CAVE_SOURCES`, `AUTHORED` keeps CA-1, combined light rationale): 1,149 tests pass, build OK, bake 220/220, heavy terrain-borders check running.
  - **ENC-1 R1 fixes** at `3d46b7a`; Sol R2 running.
  - **CA-3 R1 (Sol):** changes-needed (`review/ca-3-r1` `956ab38`). 5 datums in or on rock; P3 hull-route support and hazard positive controls; the kiln niche is acceptable as a warned hazard; cave current masking goes to C4. Fix started.
  - Resumed after the limit: C4 (C4B fixes), POI-1, LC (R3 fixes), CA-2 (R1 fixes).
  - Builders 5 of 5: C4, POI-1, LC, CA-2, CA-3.
- **LC R3 fixes done** at `61246f9`: the `CaveAdmission` state machine (away, waiting, loading with a paused clock, rescue to the nearest mouth exterior, admitted), priority preemption on reload, one shared fine remainder, and survival regressions over 180 s. Sol R4 running. Builders 4 of 5: C4, POI-1, CA-2, CA-3.
- **W2 phase 1 integrated at `9d06df2`:** 1,149 tests pass, build OK, bake 220/220, heavy terrain-borders and cave-light pass. **The central pinnacle hub is in the main game.**
- **ENC-1 R2 (Sol): accept** (`review/enc-1-r2` `b062535`). **Integrated:** 1,160 tests pass, build OK. C4 must keep `#threat-edge` in `ui/view.ts` when merging root.
- **LC R4 (Sol):** changes-needed (`review/lc-r4` `c468410`). The R3 repros, rescue safety in the sandbox and priority all pass. LC-03 reopened: leaving releases fixed bytes while buffers stay loaded. LC-06: the rescue fallback bypasses the safety check. Back with the author. Builders 5 of 5: C4, POI-1, CA-2, CA-3, LC.
- **Owner (2026-10-22):** no loading pauses in ordinary play. Recorded in GAME-DIRECTION → *Streaming without pauses*; it's an acceptance gate for cave switch-on (CW-1). Owner asked about creature variety; proposed CR-1 (a creature interaction pass).
- **CA-2 R1 fixes done** at `631edd1`: datums moved 0.4 m into water, a production targeting-and-LOS check per group (it caught a fifth datum), `lightFix.ts` removed, the wake test through the production selector with a 3 m hop assertion; 1,159 tests and 161 heavy pass. Overlap checks now cover all authored caves. Sol R2 running. Builders 4 of 5: C4, POI-1, CA-3, LC.
- **Owner decisions (2026-10-22):** no guide or helper creatures; natural non-combat ways past threats; creatures as resources (shed and byproducts, catch and cook small fish, a fish trap, bait, carcass falls; never threats or rare animals); two-door seals for built interiors and twisting throats for natural caves; a far layer for distant landmarks. Recorded in GAME-DIRECTION. **CR-1 started** (creature behaviour and resources). Builders 5 of 5: C4, POI-1, CA-3, LC, CR-1.
- **C4B R1 fixes done** at `b5f8bf4` (fixes `dfb5c37`, root merged through `41ce9d6` with CA-1, W2 and ENC-1): a shared service preview with charge buttons through the UI (and the playthrough uses them), carrier berth charging, exchanger heat, cell capacity, the berth launch-point sample, idle detection, cycle observation (in schema 6 before release), and the surface step-up. 1,182 tests and 25/25 heavy pass, playthrough 5/5, 3090 keyboard charging confirmed. Sol R2 running. Builders 4 of 5: POI-1, CA-3, LC, CR-1.
- **CA-2 R2 (Sol): accept** (`review/ca-2-r2` `131b3b2`). **Integrated:** 1,170 tests pass, build OK; `CANOPY_BASIN_SOURCES` not switched on yet.
- **LC R4 fixes done** at `c30c2fe`: separate load and unload lifetimes for fixed bytes, a verified-only rescue with a retry while paused; 1,125 tests and 6/6 heavy pass, GPU ok. Sol R5 running (asked about a guaranteed last-resort, such as the last safe exterior position or the nearest base). Builders 4 of 5: POI-1, CA-3, CR-1, plus LC idle.
- **Owner (2026-10-22):** creature mechanics must be taught in-world (a field guide plus found notes hinting at roe and spawning). **CB-2 started** (lore owner, via the CB thread). CR-1 told: roe is in scope as regrowth spawning grounds, and to publish IDs for CB-2. Builders 4 of 5: POI-1, CA-3, CR-1, CB-2.
- **POI-1 done** at `a0aec12` (`t3/deep-route-pois`, `t3-cec0f8de`): 7 lit points of interest on the deep legs plus landmark lights; empty travel at Creel speed drops to 42–59 s on the deep legs; 1,199 tests pass; p95 unchanged. Found: the Basin dish rims stand 2–13 m above their collision (existing bug). Sol R1 running. C4B and LC merged into root locally (C4B `82a46ea`; LC merge pending a full test run). Builders 3 of 5: CA-3, CR-1, CB-2.
- **CB-2 done** at `032b8fd` (`t3/siltwake-cb2-creature-lore`): `FIELD-GUIDE.md` with an entry per species plus a new animal (the pale drifter, whose remains are the carcass falls), and 15 found notes (5 always readable and covering every threat window, 10 after decode). Matches CR-1 IDs; new IDs proposed. CR-1 told to adopt them; skate egg cases stay above the brine. Sol R1 running. Builders 3 of 5: CA-3, CR-1, plus root tests running.
- **LC integrated** (merge of `c30c2fe`) on top of **C4B (`82a46ea`)**: 1,229 fast tests pass, build OK. Note: the fast tier now takes 337 s (it was 30 s), which needs a test-tier performance pass. **Root now has every system composed, plus the large-cave technology.**
- **Started:** **CW-1** (switch on CA-1 and CA-2 caves, the composition obligations, LC runtime admission plus a guaranteed refuge, baked cave collision and light, predictive streaming, a no-pause Dart traversal gate) and **HUB-2** (the crown station composed against C4B, fixing W2-02, 03 and 04; W2 thread). Builders 4 of 5: CA-3, CR-1, CW-1, HUB-2. Reviews: POI-1 R1, CB-2 R1. Queued: the Basin dish rim collision fix, and test-tier speed (the fast tier is now 337 s).
- **POI-1 R1 (Sol): accept** (`review/poi-1-r1` `6096923`). Pacing independently under 90 s, no hull snags. Merged into root (tests running). The **dish collision P2 fix plus the POI pacing P3** were sent to the POI-1 author. Builders 5 of 5: CA-3, CR-1, CW-1, HUB-2, POI-1 (dish fix).
- **CB-2 R1 (Sol):** changes-needed (`review/cb-2-r1` `346a937`). P2: glimmer and wakeglow text teaches navigation by animals. **Coordinator ruling:** keep the passive cave cues physically (glimmers lean with water flow, the wakeglow is the player's own stirred sediment), but the text must describe ecology observationally, never "signpost", "way out" or "follow it". P2: skate egg cases are underground, so ground them on the shelf and tighten the test. P3: unsafe window prose. Back with the author.
- **Cap:** the CB-2 R1 fix run was interrupted to stay within 5 builders; it is **queued** for the next free slot. Builders 5 of 5: CA-3, CR-1, CW-1, HUB-2, POI-1 (dish).
- **Owner correction (2026-10-22): helper creatures are allowed.** GAME-DIRECTION updated. The CB-2 R1 finding CB-2-01 (guide wording) no longer applies: glimmer and wakeglow guidance text may stay. CR-1 told it may add natural helper behaviour.
- **POI-1 integrated** (`68ec382`): 1,236 tests pass, build OK. Answered a dish-fix question: the bowl collides within 1 m (a documented exception), rim, frame and hub within 0.35 m.
- **CA-3 R1 fixes done** at `82222fd` (rebased onto `12b6a33`): items in water with production targeting checks, hull-clearance craft routes, positive hazard controls through real survival; 1,238 fast and 151 heavy tests pass. Sol R2 running. **CB-2 R1 fix resumed** in the freed slot (CB-2-01 withdrawn per the owner's helper-creature correction). Builders 5 of 5: CR-1, CW-1, HUB-2, POI-1 (dish), CB-2.
- **CB-2 R1 fixes done** at `2c7669b`: egg cases grounded, a stricter datum visibility test (9 more datums raised, 3 of them CR-1 falls, synced with CR-1), window-prose safety checks; 1,247 tests pass. Sol R2 running. Builders 4 of 5: CR-1, CW-1, HUB-2, POI-1 (dish).
- **TT-1 started:** bring the fast tier back to about 60 s or less (it's 337 s now) without losing coverage: profile, cheapen, move inherently heavy tests to the heavy tier, add a per-file budget guard. Builders 5 of 5: CR-1, CW-1, HUB-2, POI-1 (dish), TT-1.
- **CA-3 R2 (Sol): accept** (`review/ca-3-r2` `2bd7105`) and **CB-2 R2 (Sol): accept** (`review/cb-2-r2` `ed0edcc`). Both merged into root (`4609901`, `c649b11`); tests running. **All ~58 small and medium caves are now authored and accepted;** switch-on is CW-1.
- **Usage-limit reset:** CW-1, HUB-2, CR-1, the POI-1 dish fix and TT-1 had all hit the limit and were resumed (the platform had already armed auto-resume). CW-1 was told to include CA-3's deep caves with current masking; CR-1 to match CB-2's IDs and datums.
- Root after the CA-3 and CB-2 merges: 1,256 tests pass, build OK.
- **Owner grill on the opening and starting island** (in progress): `docs/build/OPENING-DESIGN.md`. Research: starting-island art and exploration (Sol high). Opening pass to build after CW-1 and HUB-2.
- Island research switched from Sol to **Opus** at the owner's request (taste and art direction): `siltwake-research-start-island-art-opus`.
- **Opening grill complete** (owner 2026-10-22): Lifted Reef island 205 m west-south-west of the pod, three threads with a two-of-three feed board, 33-item checklist, 150 m suit moved later, garden clarified. `OPENING-DESIGN.md`. The **OP-1 opening pass is queued** for the next free slot. HUB-2 asked for a surface beacon mast (sent).
- **Perf diagnosis (owner request, 2026-10-22):** three Sol xhigh analyses: A (lock and job scheduling), B (test and playthrough cost, caching), C (machine capacity, parallel workers, fleet asks). Snapshot: one global heavy lock serialises playthroughs (up to about 29 min), GPU sessions (up to about 25 min) and heavy files across about 6 agents; queued holders seen: CR-1 playthrough, CW-1 GPU traversal, a carrier playthrough.
- **HUB-2 done** at `ed0be89` (`t3/hub-2-crown-station`): the crown station in 3 staged restorations composed into C4 stops, hosts, rest bases and recipes; a dock gated on stage 2; the bench predicate; the surface mast with a sweep lamp (far layer joins with CW-1); the carrier playthrough uses the crown. 1,230 tests pass. Sol R1 running. Perf A (lock) and C (capacity) reports are in; B pending, then the Opus debate.

### 2026-10-22 21:20Z — perf decision started
- Perf B landed at `0d9b9f3` (19:53Z). The coordinator missed the completion wake; a Sol stall investigation is running (report outside the repo, `/work/tmp/coordinator-stall-2026-10-22/REPORT.md`).
- An Opus decision agent (`siltwake-perf-decision-opus-34a961f`) is arguing out A, B and C toward a heavy-check v2 design, written to `research/perf-decision:docs/build/perf/DECISION-OPUS.md`. Nothing is implemented until the owner picks.

### 2026-10-22 ~21:45Z — stall found, HUB-2 merged, perf decided, SCHED-1 started
- **Stall cause:** a coordinator Stop (19:45) disposed the completion wakes of all running children. "Continue" doesn't re-arm them (report: `/work/tmp/coordinator-stall-2026-10-22/REPORT.md`). Disposed and still running: CW-1, CR-1, TT-1. Reconcile them with `task_status` on every wake.
- **HUB-2:** Sol R1 accepts (`review/hub-2-r1` `afea2b5`); merged `--no-ff`.
  - Follow-up P3 **HUB-2-01**: the stage-order test passes with the prerequisite removed.
  - The mast GPU spot-check didn't run (lock timeouts); it moves to the CW-1 integration check.
- **DISH-1** (POI-1 follow-ups) is done at `b3ea752` on `t3/dish-rim-collision`; Sol R1 is running. For the owner to look at: the feed tripods now lie fallen, and some rim segments are broken away.
- **Perf decision:** Opus `fd4cdcd` (`research/perf-decision`). Owner choices:
  - build the queue now;
  - the rule becomes "admitted through the queue", with performance numbers from exclusive mode only;
  - VM: ask for 8 vCPU and keep 16 GiB.
- **SCHED-1** (Opus, `t3/sched-1-heavy-queue`) is building it. Next after it: the `stepGame` state-copy speed-up.

### 2026-10-22 ~22:10Z — paused for the VM CPU upgrade (6 → 8 vCPU)
All builders are paused at a pushed checkpoint, with no jobs running and the lock free. Resume order after the restart:
1. **Coordinator:** check `nproc` is 8, then run `task_status` on every task below.
2. **SCHED-1** `t3/sched-1-heavy-queue` @ `12ff032`: resume, and check that tokens come out at 6. Then Sol review, then switch the fleet over.
3. **CW-1** `t3/enable-authored-cave-streaming` @ `f55254f`: resume. The completion wake was disposed, so reconcile by hand.
4. **CR-1** `t3/natural-threat-windows` @ `2ab8db7`: root merged, 1,287 fast tests pass. Resume to finish the economy scripts (the m1 roster pin may need the crown recipes) and the split playthrough, then Sol R1.
5. **TT-1** `feat/tt-1-test-speed` @ `34c08a0`: resume the R1 fixes (four P2s plus one P3), then a fresh Sol R2.
Queued after these: OP-1 opening pass, the `stepGame` state-copy speed-up, the four cave biomes, UX-1, lost sites, the atmosphere pass, then the owner's playtest.

### 2026-10-22 22:20Z — VM back with 8 vCPU; builders resumed
`nproc` is 8, about 15 GiB is visible, and the 3090 is OK. SCHED-1, CW-1, CR-1 and TT-1 are resumed through new tracked thread-send tasks, so their wakes work again. The fifth slot is held: OP-1 waits for CW-1 (shared island and cave streaming), and the `stepGame` speed-up waits for CR-1 and SCHED-1 (`step.ts` overlap).

### 2026-10-23 — TT-1 merged
- **Review:** TT-1 was accepted by Sol R3 (`review/tt-1-r3` `267bd0b`) after R1 Fix and R2 Fix.
- **Merged into root:** fast tests pass 1,264/1,264 in 79 s from a cold cache; the build is OK.
- **Effect:** `npm test` takes about 1 minute; the heavy tier runs 59 files, 440 tests, in about 5 minutes, with per-file cgroups.
- **Follow-up:** apply `docs/build/streams/sched1/tt1-test-build-guard.patch` when SCHED-1 merges.
- **CW-1 and CR-1** must merge root before handoff: TT-1 moved tests out of their files into `*.heavy.test.ts` and `*-support.ts`.
- **SCHED-1:** in Sol R4 at `8759122`.

### 2026-10-23 ~00:25Z — owner decisions on job limits and saves
- **Jobs have goals, not time limits** (owner). The 20–30 min cap was a fairness rule for the single v1 lock. After the SCHED-1 cut-over:
  - jobs run until their goal is done;
  - the queue kills only on a **stall** (no output or heartbeat for about 15 min) or a generous runaway ceiling;
  - exclusive performance drains keep a cap.
  - Planned as the SCHED-1 follow-up (SCHED-2) once R4 accepts. Soak runs for long-session problems come with it.
- **Save library approved:** after each root merge, the playthrough exports standard milestone, adverse and gear-variant saves to a shared store tagged by commit, for tests, reviews and 3090 sessions. **SAVE-1** starts after SCHED-1 merges.
- **Second machine:** switch the queue on first, measure for a day, then decide.

### 2026-10-23 ~01:00Z — compromise audit started; worker plan
- **Owner question:** did builders sacrifice quality to fit memory, time or loading limits instead of fixing root flaws for scale?
- **Audit:** Sol evidence audit `siltwake-compromise-audit-sol-562a8a0`, written to `research/compromise-audit:docs/build/audits/COMPROMISE-AUDIT-SOL.md`. After it, an Opus verdict on what to fix and in what order, presented side by side.
- **Web workers (client side) planned:**
  1. Sol profiles a Dart traversal on the 3090 after the SCHED-1 cut-over.
  2. An Opus decision on which jobs move and the pool size.
  3. WK-1 builds it after CW-1.
  - **Rule:** workers build only rebuildable data, the sim never waits on them for correctness, and collision admission is kept.
- **SCHED-1:** R4 found one P2 (an OOM can kill the anchor alone). The fix is under way: `OOMPolicy=kill` on the job scope.

### 2026-10-23 ~02:20Z — SCHED-1 merged and live; audit verdict started
- **Builders:** usage limit hit about 00:52Z; CW-1, CR-1 and UX-1 auto-resumed at 02:00Z.
- **SCHED-1 accepted** by Sol R5 (`review/sched-1-r5` `59d2a4b`) after R1–R4 Fix rounds. Merged into root as `b03cb9d`: 1,286 fast tests pass in 63 s; the build is OK.
- **Cut-over:**
  - installed v2 `afad2b8a688f` with the user slice; serial first;
  - acceptance 6, 6b, 6c and 15 rerun privately and pass;
  - switched to **normal** mode.
  - The v1 lock inode is preserved (527188).
  - CW-1, CR-1 and UX-1 are told to merge root at a safe point and move to v2. v1 waiters pause v2 until they do.
  - The 2 h canary observation is under way (ledger at `/work/tmp/siltwake-sched/ledger.jsonl`).
- **Compromise audit:** Sol evidence `4e81ac9` on `research/compromise-audit` has 107 findings: A 30, B 32, C 19, D 26. The Opus verdict (`siltwake-compromise-verdict-opus-4e81ac9`) is running.

### 2026-10-23 ~02:45Z — second worker; compromise verdict adopted; COL-1 and SCHED-2 started
- **Second worker `siltwake-alickers`** (WSL2 plus RTX 4070 Laptop on the owner's PC) is integrated as best-effort through `scripts/alickers-job.sh`, at a pinned SHA.
  - Verified: fast tests 1,286/1,286 in 52 s; the 4070 GPU probe passes with no leftovers.
  - The full playthrough qualification run is under way at `12ecbc8`.
  - Rules are in `WORKER_RESOURCE_LIMITS.md`.
- **Compromise verdict** (Opus `cd6993a`, on Sol `4e81ac9`) **adopted** by the owner:
  - five roots: box-only collision (COL-1), runtime building (a wider WK-1), an underived memory budget (MEM-1 and LC-2), frozen paths (NAV-1), and evidence that measured the setup (SCHED-2, SAVE-1, PT-0);
  - every art restoration approved;
  - queue changes approved; early opening-hours playtest after OP-1 approved;
  - the memory floor is pending an owner discussion: RAM or VRAM, and quality.
- **Started:** COL-1 stage A (`siltwake-col1-static-collider-opus-fe27757`, new modules only) and SCHED-2 then SAVE-1 (`siltwake-sched2-save1-opus-fe27757`). Builders are 5 of 5: CW-1, CR-1, UX-1, COL-1, SCHED-2.
- **Folded in:**
  - CW-1: 8 segments at 1080p, `Infinity`-finish counting, pack-hash rejection, mast and seam shots;
  - CR-1: visible skate rest, out-of-view laying swap, continuous approaches, the hunter sight line.
- **Next:** MEM-1 (Sol), after CW-1 merges; it measures RAM and VRAM on the 3090 and the 4070.

### 2026-10-23 ~03:30Z — REC-1 approved (owner)
**REC-1, the flight recorder and evidence pack,** takes the **next free builder slot after CW-1 merges**, ahead of WK-1 and MEM-1. MEM-1, the soaks and PT-0 all consume it.

**In-game recorder:**
- **Per frame:** time split into sim, render, streaming build and GC, plus long tasks.
- **Sampled a few times a second:** position, depth, region, cave admission, oxygen, speed and craft; draw calls, triangles, tab RAM and VRAM where the browser exposes them.
- **Every event:** milestones, damage, threat warnings, holds, loads and saves, refusals, errors.
- **Cost:** well under 1% of a frame.
- **Owner playtests:** on by default (it can be turned off), carrying the feedback notes.

**Visuals:**
- **Event snapshots:** every event, every frame over 33 ms, every milestone.
- **Video at 12 fps** (owner choice), 720p. It's on for functional runs, soaks and owner playtests, and **off in exclusive perf runs**, which keep only the snapshots. REC-1 measures the recording's own overhead.

**Outputs, the same format on both machines:**
- a story sheet for agents: a timeline with thumbnails, plus frames extracted around any event;
- a timeline page for the owner: video, frame-time chart, memory curve and event markers, synchronised;
- the evidence pack: header, contact sheet, charts and summary;
- 3090 and 4070 packs side by side.

SCHED-2b's remote lane carries the packs back from alickers.

### 2026-10-23 ~05:00Z — UX-1 merged; COL-1 A and SCHED-2a in fixes
- **UX-1 accepted:** Sol R1 requested changes (helm rudder during Hold; steering retained across a same-tick import); R2 accepted (`review/ux-1-r2` `5b88509`).
  - **Merged:** 1,305 fast tests pass, build OK, all 5 economy scripts pass.
  - **P3s carried:** stale sliced advice; the synchronous console search cost (worst case 36.6 ms).
  - **Evidence:** 3090 exclusive and 4070 (indicative) bridge runs at 60 fps, max 16.8 ms.
- **COL-1 A** (`245a006`): R1 requested changes, with five edge-case defects (escape through another wall, parity at shared edges, heightfield entry from holes, missed bounded recovery, lost vertical bounds). The builder is fixing them.
- **SCHED-2a** (`8f702de`): R1 not accepted (5 P1, 3 P2). The builder is fixing them, and R2 is dispatched by the coordinator.
- **Builders:** UX-1's slot is free and reserved for REC-1 once CW-1 merges.

### 2026-10-23 ~08:00Z — reviews in flight; MEM-1 inputs
- **COL-1 A:** the R1 fixes are done (`b94430c`), and Sol R2 is running. It also found LC's own endpoint debt: 45 of 8,000 Canopy probe moves end in poses LC rejects. It's bounded at 1% by the oracle; the root fix (walls on LC's cap and collar boundaries) goes to LC-2 or COL-1 B.
- **CR-1:** ready at `494b7c3`, with root merged. Sol R1 is running.
- **SCHED-2a:** the R1 fixes are done (`e85c8e3`), and Sol R2 is running. It isn't installed; the cut-over and `--gpu-guard` are the coordinator's.
- **For MEM-1:**
  - the GPU process's RSS grows about 35–40 MiB an hour idling at the pod (SCHED-2's 3090 dwell soak);
  - every load requests terrain tiles `t_4/5_11/12`, which aren't in the bake, giving four 404s. That's for the bake owner (WK-1), unless CW-1's terrain manifest check already fixes it.
- **alickers-job:** clears compiled test output when the sandbox changes commit (`fa35339`).

### 2026-10-23 — coordinator decision: LC endpoint debt is a COL-1 stage-B prerequisite
LC's cap and collar boundaries need walls, as the COL-1 heightfield now has, so that no clear-start move ends in a pose LC rejects. Today 45 of 8,000 Canopy probe moves do. **COL-1 stage B can't be accepted until that's fixed** in whichever stream lands first, COL-1 B or LC-2. The oracle's 1% bound is only a regression alarm, not proof that the failures match LC's. In flight now: COL-1 A R3 (`e8ce814`), SCHED-2a R3 (`014f37b`), and CR-1 (fixes at `4c4c7eb`, heavy tier running).

### 2026-10-23 — CR-1 merged
- **CR-1 accepted** by Sol R2 (`review/cr-1-r2` `5aa79da`) after R1 asked for changes (skate jump, hunter rejoin snap, dormant outlines by the pod).
  - **Merged:** 1,321 fast tests pass, the build is OK, and all 5 economy scripts pass.
  - **Adverse bound:** all 1,440 phased cases stay under 60 HP. A late departure can take one fully warned strike after a window closes, which is fair by ENC-1.
  - **Compromises carried, with root fixes:** the laying stand-ins (NAV-1), the idle hunter's unswept round (broadphase), the CRE-03 fallback, the shelf-only laying caption, `dataset.tick` (REC-1's test API), and no trap model in the world.
- **In flight:**
  - CW-1's final 23-ticket exclusive series;
  - COL-1 A R4 (`dfab435`);
  - SCHED-2a R4 fixes (soak harness only), with the scheduler cut-over planned once CW-1's series ends;
  - SCHED-2b R1 (`c88bab6`).
- **Builders:** COL-1 and SCHED-2/SAVE-1 are active, CW-1 is finishing, and 2 slots are free for REC-1 and OP-1 once CW-1 merges.

### 2026-10-23 ~09:15Z — owner priority: testing infrastructure first
The owner prioritised the recorder, testing, scheduling and the save library.
- **SIM-1 paused** (in-place stepping; resumes next).
- **SAVE-1** split out to its own builder: `siltwake-save1-library-opus-f025bf6`, branch `t3/save-1-shared-library`.
- **REC-1 started**, based on CW-1's head `7dc9cc9`: `siltwake-rec1-recorder-opus-7dc9cc9`, branch `t3/rec-1-flight-recorder`.
- **The SCHED-2 builder** keeps the scheduler only: 2b R1 fixes (F1/F2 structural: staged artifacts under the sandbox lock, a receipt file instead of log markers), then any 2a R5 follow-ups.
- **SCHED-2a R5 is reviewing `919a372`:** the soak fixes, plus a 7-line per-class stall default, to set `{"stalls":{"playthrough":2700}}` until active worktrees have the heartbeat.
- **Builders:** CW-1 (final exclusive series), COL-1 (A R4 in review), SCHED-2 (2b fixes), SAVE-1, REC-1. SIM-1 is paused.

### 2026-10-23 ~09:50Z — SCHED-2a cut over (scheduler); soak harness pending
- **Merged** `t3/sched-2a-stall-floor` (`f91f0fc`). The gate passed: 1,359 tests, the build, and all 5 economy scripts.
- **Installed v2 `e552265ea963`** in normal mode. The slice is as wanted (700%, 8 GiB) and the v1 lock inode is preserved. A smoke quick job runs to its goal, with its evidence bound to the commit.
- **Bridge:** `/work/tmp/siltwake-sched/config.json` has `"stalls":{"playthrough":2700}` until active worktrees have the playthrough heartbeat. **Remove it after CW-1, COL-1, REC-1, SAVE-1 and SIM-1 merge root.**
- **Soak verdicts are not evidence yet:** R6 asked for an append-only fact reducer. The note is in `WORKER_RESOURCE_LIMITS.md`.
- **GPU guard (`install.sh --gpu-guard`) is deferred** until REC-1's queued pre-cutover tickets drain.
- **CW-1's exclusive series finished;** the handoff is pending from the builder.

### 2026-10-23 10:12Z — GPU guard installed; SCHED-2a fully live
- **Installed:** `install.sh --gpu-guard` wrapped all three Playwright Chrome binaries; the guard's own version is `073e8b0da3da`.
- **Verified:**
  - a GPU-flagged launch outside a job is refused with the lease message;
  - a plain launch works;
  - a GPU launch inside a `gpu` ticket works (`261023-101223-f3f1`, evidence bound to `a536775`).
- **Stall fix:** `a5724a7` merged and reinstalled as v2 `112892426b5d`. The full suites pass on it: SCHED-1 23/23, SCHED-2 16/16, policy 25/25. No job was mislabelled in the window.
- **SCHED-2b:** R1 fixes are at `2e35921`, and Sol R2 is running. The SCHED-2 builder is now on the soak reducer.

### 2026-10-23 — coordinator decisions: the remote-lane threat model; COL-1 stage-B conditions
- **SCHED-2b R2** (`1d5b7ff`): 2 P1s and 3 P2s.
  - **Threat model ruled:** the receipt protocol must be robust to **accidents** by our own job and setup code (marker output, stray writes, stale or partial records, dropped connections). It doesn't defend against a payload **deliberately** forging records through `/proc`. That's documented as a named limit, with its root fix (a separate transport uid), the same class as SCHED-1's accepted "job kills its own anchor".
  - **Fixes:**
    - a per-attempt nonce over ssh stdin;
    - a strict phase grammar;
    - an exit-status cross-check;
    - checked out tree clean and verified under the lock;
    - ownership kept until the old attempt is conclusively stopped;
    - non-blocking admission for `any`;
    - test seams only under an explicit test scope.
- **COL-1 stage-B acceptance conditions:**
  - LC cap and collar walls (no clear-start move ends in a pose LC rejects);
  - **collars and other collision bakes happen offline** (WK-1's bake pipeline), never at runtime (stage A measured 9–14 s for 0.25 m collars);
  - **collar corners stored per cell only where needed**, to recover memory.

### 2026-10-23 ~12:15Z — CW-1 and SAVE-1 done; reviews out; SIM-1 resumed
- **Usage limit:** about 11:00–12:00Z. Builders auto-resumed at 12:00.
- **CW-1 done** at `d62586c` (code `e935e4f`); Sol R1 `siltwake-cw1-review-r1-sol-d62586c`.
  - The 3090 1080p traversal had 0 holds and 0 unsliced builds in travel, but the 34 ms gate fails on 24 frames, mostly in runs marked `DISTURBED`.
  - Clean 3090 frame evidence is missing; the root fix is TST-16 (light-work slice), assigned to the SCHED-2 builder after 2b.
  - The 4070 control passes.
- **SAVE-1 done** at `f86dd48` (unpushed; a docs conflict with root); Sol R1 `siltwake-save1-review-r1-sol-f86dd48`.
  - **Store:** 73 bot-earned saves per export at `/work/tmp/siltwake-saves/<sha>/`, 16 named kinds, with tour-ready fitting a 27.2 km lap at cruise.
  - **Merge gate addition, after SAVE-1 merges:** run `scripts/saves-export.sh` after each root merge.
  - **UI finding:** a dying battery gets only a sound cue, no notice (for SIG-1 or a UX pass).
- **COL-1 A R6** (`89c3158`): one P2, the floor snap flips triangles (`meridian_culvert_north` support is 0.75 m off). **COL-1 now owns the snap/seam step** in `caveGeometry.ts` for this fix.
- **Soak R7** (`7810194`): 2 P2s, plus 3 of 6 mutants survive the property tests. Queued after the SCHED-2b R2 fixes, then TST-16.
- **SIM-1 resumed.** Builders: REC-1, SCHED-2, COL-1, SIM-1 active; CW-1 and SAVE-1 in review.

### 2026-10-23 — soak harness accepted; SAVE-1 R2; SCHED-2b R3
- **Soak reducer accepted** by Sol R8 (`review/sched-2a-soak-r8` `79c752c1`) after R1–R7. Merged into root as `fd2e5fe`; the gate passed (1,370 tests, build, economy). **Soak verdicts are evidence now.**
  - **P3 follow-up:** five reviewer mutants survive the example suite (the reviewer's probes kill them). Add those probes as tests.
  - **P3:** one conservative timestamp false failure.
- **SAVE-1 R1 fixes** at `4690311`:
  - the factory-fallback export now runs end to end (25 min, 73 saves, byte-identical with alickers);
  - the library holds `0a464bc`, `1d4d2c3` and `dabaa79`;
  - Sol R2 dispatched.
- **SCHED-2b R3** (`2c78ac0`): 2 P2s (claim/scope crash boundary, cross-boot identity reuse), plus a request for a supported operator `release-remote`. Fixes are in progress.
- **CW-1 R1** (`2bf88b4`): 2 P2s (admission escapes the load screen; recovery state leaks across saves), and **the 3090 spikes look like real main-thread work** (renderer on-CPU, PSI ≤ 1% in 22/24). CW-1 is profiling them.

### 2026-10-23 ~14:25Z — SCHED-2b accepted and merged; switch-over pending drain
- **SCHED-2b** was accepted by Sol R4 (`review/sched-2b-r4` `0aad7f2`) after R1–R3. The real `any` and `4070` canaries ran at `b1aa462a`, which is identical in `scripts/heavy` and `alickers-job.sh` to merged root `ca36d15`.
  - **Merged:** fast 1,381, build OK, economy OK; full suites on merged root SCHED-1 23/23, SCHED-2 16/16, SCHED-2b 27/27, policy 32/32.
  - **Switch-over (review checklist):** builders are holding new submissions; a watcher waits for the queue to drain with no 2a supervisors or holders. Then: record versions and inodes, install, verify the guard refresh, run a short local and a short remote canary, and announce.
  - **Release precondition:** `release-remote` only after the owner confirms the sandbox's processes are dead. Losing SSH alone isn't enough.
- **REC-1 done** at `b65dfbbc` (built on CW-1); Sol R1 dispatched.
- **TST-16 done** at `312b1be`; Sol R1 running. It adds swap and major-fault signals.
  - **Correction:** the 4 run-A "contention" frames include 24–50 ms GC pauses, which is game allocation pressure. That's passed to CW-1.
- **Fleet:** pinning was already done. Option A recommended to the owner (move Kopia, the proxy and interrupts to CPUs 0–3); B (isolcpus, host reboot) not now. The 3090 inventory gets updated.

### 2026-10-23 14:30Z — SAVE-1 merged; SCHED-2b live
- **SAVE-1 accepted** by Sol R3 (`review/save-1-r3` `94fbcc3`). Merged as `91dc1ab`: 1,397 tests pass, build and economy OK. The library export at `91dc1ab` is running. **Merge gate addition:** `scripts/saves-export.sh` after game-code merges.
- **The SCHED-2b switch-over** followed the review checklist:
  - the queue drained, with no 2a processes left;
  - pre-switch state recorded in `/work/tmp/cutover-2b/`;
  - installed v2 `95f340380c25`; the transport is byte-identical, and the inodes were preserved;
  - the guard refresh (`75ab0906bfb0`) still refuses outside a lease and allows inside one;
  - a local `gpu` ticket was labelled RTX 3090;
  - the `any` canary ran locally while health was unknown (correct);
  - **the `4070` canary ran remotely** on the RTX 4070 D3D12 renderer, bound to `91dc1ab`, and the sandbox was left clean;
  - alickers shows `up`.

  Builders were told to merge root and use `--machine`.
- **TST-16 R1 rejected** (`81d6d83`): stuck clamps, escaped memory limits, a sticky slice cap, false-clean sampling, a missed final GPU scan. It's being redesigned (CPU-only deprioritisation within the caller's containment, or labelling only).

### 2026-10-23 ~17:00Z — usage limit again; codebase audit in; steward verdict started
- **Usage limit:** about 16:00–17:00Z. SIM-1, REC-1 and CW-1 failed with the rate limit and auto-resume at reset.
- **Codebase health audit:** Sol `c912151` on `research/codebase-health` (28 findings, top 15). The Opus steward verdict (`siltwake-codebase-steward-opus-c912151`) is running.
- **REC-1 R1** (`32d6ef3`): 4 P1s and 8 P2s, among them **no storage budget for the default playtest recording**, an incomplete export, and false streaming and stable passes. Fixes are in progress; also told to fix the audit's baseline hash/PNG defect and merge CW-1's latest.
- **TST-16 R2** (`b3ecb67`): 2 P2s (a surviving apply re-boosts after recovery; rollback strands boost cleanup). Fixes are in progress, with a suggested backstop: reset the slice weight whenever no exclusive job is running.
- **Memory corrected:** the 3090 frame-stall note now says the causes are mixed, game work included.

### 2026-10-23 — codebase steward verdict adopted (Opus `cc718962`)
- **Root causes of drift:**
  - interim copies never retired → the FORK register;
  - per-stream evidence drivers → one driver library, `scripts/rec`;
  - no hot-path rules → ten performance conventions;
  - contracts kept in memory → one `npm run gate`.
- **A live bug, F11:** audio uses the old four-region map, so the Rift, the Divide and the Deep District play the wrong ambience. It's fixed in STEW-1.
- **New streams:**
  - **STEW-1:** guard rails and small fixes. It started on the SAVE-1 builder's slot.
  - **REC-2:** one evidence driver. The REC-1 builder does it after REC-1 merges, before BIO-1.
- **Folded into existing streams:**
  - REC-1: the two recorder defects, plus CW-1's top-k merge;
  - COL-1 B: retire the box collision copies;
  - WK-1: one mesh builder, cache ledger and verify path;
  - SIG-1 stage 0: one inventory authority.
- **Per-wave architecture review:** Sol makes one read-only pass against 8 checks (at most 2 pages), then an Opus steward rules (at most 1 page). At most one cleanup stream per wave.
- **COL-1 A R7** (Sol on `38e50afb`, report on `review/col-1a-r7` `c863a203`): REQUEST CHANGES, one P2 (R7-1). The appended seam skirts are never validated. Where an open-edge chain doubles back, the curtains overlap with opposite normals in nine fine shells. That makes `escapeSweep` block exits at Step arch and at the Glimmer crack. R6-1 is fixed, 78/78 pass, and the art, memo and memory checks are confirmed. The coordinator agrees and sent it back to the builder for a constructed seam boundary validated on the final faces (no probes, flips, two-sided fallback or reopened seam).
- **TST-16 R3** (Sol on `ef037871`, report on `review/tst-16-r3` `ee0bee6d`): REJECT, one P2 (F1). Handover is not atomic with admission: a refusing guard can reset a running exclusive's boost, and a guarded rollback, or a queued candidate exclusive admitted after it, can strand a boost the old version never repairs. R2 fixes hold, the backstop is sound, and the suites pass 23/23, 22/22 and 27/27. Sent back for one shared drain/admission protocol through the version switch, with all three races added to S22. Not installed. The boosted CW-1 steal comparison for fleet waits on this.
- **SIM-1 R1** (Sol on `2b0b7d88`, report on `review/sim-1-r1` `48f6e0b3`): REQUEST CHANGES, two P1s in timeline persistence.
  - **F1:** export-time span closure rotates a chunk in the copy, so a "saved" result drops recent notes and duplicates old ones.
  - **F2:** rotated chunks and the v1 key are deleted before the new head commits, so a failed save or migration loses previously saved history.
  - **What holds:** the in-place step, StepGuard, indexes and aliasing are clean; the independent oracle, reload and fault checks match; fast tier 140/140.
  - **C1 contract:** SIM-1 exposes a monotonic event cursor, and REC-1 consumes it behind a seam (REC-1's array offset loses events at 1,000-event seals). Whichever merges second wires it. Both builders told.
- **SIM-1 done at `3b797af3`** (R1 fixes in `047846b4`): the head-as-commit-point store, fold-in-place compaction, one shared span-closing helper, and the `timelineSince` monotonic cursor for REC-1. A focused Sol R2 on the persistence paths is running (`siltwake-sim1-review-r2-sol-3b797af`).
- **TST-16 done at `97e4f718`** (R3 fixes): a freeze/wait/certify handover inside transaction(), one shared `boostBackstop()`, unboosted admission under the freeze, which is labelled DISTURBED as "not boosted evidence", and an S22 rewrite against the real `95f340380c25`. Suites pass 23/23, 22/22 and 27/27, and the fast tier 1404/1404 (one soak-runner timing flake, passed on rerun). Sol R4 is running (`siltwake-tst16-review-r4-sol-97e4f71`).
- **Follow-up (after TST-16 merges):** soak-runner test "R4-F3" flaked 1/1404 at 22% host CPU pressure (passed 5/5 alone). Make it deterministic rather than timing-sensitive; the owner is the SCHED-2/soak builder. Kept off the TST-16 branch so the R4 candidate doesn't move.
- **SIM-1 R2** (Sol on `3b797af3`, report on `review/sim-1-r2` `7f4c9ae6`): REQUEST CHANGES. R1 F1 and F2 are resolved (2,711 fresh-reader snapshots). New findings in the store lifecycle:
  - **P1:** cached chunk facts survive a session change, so a "saved" result reloads null;
  - **P2:** a rotated export → resume duplicates chunk numbers;
  - **P2:** orphans from interrupted saves can't be discovered after a restart and consume the quota;
  - **P2:** the REC-1 cursor must be initialised from `seq` at every entry.
  - **Decision:** the coordinator asked for the class to be removed rather than patched case by case: no trusted cross-save cache, read the head on each save, one owned key prefix, collection by enumeration. REC-1 was told to initialise its cursor from the head.
- **STEW-1 done at `b7cb626`** (code `666fb71`):
  - **Fixes:** F11 audio/HUD now use `regionAtPosition`, so the Rift, Divide and Meridian get their own ambience; `npm run gate` (`scripts/gate.mjs`); `scripts/guard-architecture.mjs` with planted-violation tests; `CORE-HELPERS.md` with 5 open forks; small fixes F14/F18–F20/F23–F25.
  - **Evidence:** the gate passed 10/10 at 666fb71, npm test 1,402/1,402.
  - **Review:** Sol R1 running (`siltwake-stew1-review-r1-sol-b7cb626`).
  - **After merge:** update the root-merge-gate memory to `npm run gate`.
- **SIM-1 done at `8eb5e374`** (R2 fixes): a stateless store that reads the durable head on every save; one owned key prefix with per-session heads and provisional heads; collection by prefix enumeration, plus a 10-minute stale rule for other sessions; collision-free resume numbering; the cursor rule stated. Timeline tests 42/42, fast tier 140/140. Focused Sol R3 running (`siltwake-sim1-review-r3-sol-8eb5e37`); it is told to check whether collecting another session's committed timeline matches the game's session model.
- **TST-16 R4** (Sol on `97e4f718`, report on `review/tst-16-r4` `4bae66a0`): REQUEST CHANGES, do not install. R3's races are fixed and the labelling is honest. New findings:
  - **F1, P2:** concurrent installer operations clear a certified freeze, which strands a boost.
  - **F2, P2:** a surviving reset child zeroes a later live job's boost while the result claims clean.
  - **F3, P3:** an abandoned freeze is invisible in status.
  - **Decision:** four rounds of lifetime races in runtime CPUWeight mutation. The builder is to first evaluate a static design: a dedicated slice with a fixed weight and limits that exclusive payloads are placed into, deleting the freeze/handover machinery. Only if R1's containment constraints forbid that is it to fix F1–F3 in place.
- **STEW-1 R1** (Sol on `b7cb626`, report on `review/stew-1-r1` `1805c3dd`): REQUEST CHANGES. F11 is verified headless and the small fixes are bit-identical.
  - **P2s:** the gate trusts exit codes, not bound or undisturbed receipts; the guard misses dynamic imports and `.mts`; cycle allowances don't ratchet down; DOM detection isn't scope-aware. The fix for the last is to adopt the headless sim/content tsconfig now.
  - **P3s:** add `--review` to the gate's queued steps; add the missing `FORK(stream-drivers)` marker.
  - The HUD region naming is accepted. Sent back.
- **SIM-1 R3** (Sol on `8eb5e374`, report on `review/sim-1-r3` `e69c771c`): REQUEST CHANGES. R2 is repaired. New findings:
  - **P1:** the 10-minute collection deletes committed timelines of expeditions players return to (import, backup, Continue after a session-only play).
  - **P1:** a swallowed read error lets cleanup delete a just-committed history.
  - **P2:** cross-tab collection races a provisional retry.
  - **Coordinator retention contract:**
    - committed timelines are never age-collected;
    - Continue and backup sessions are never evicted;
    - eviction happens only under quota pressure, least-recently-written first, and is reported;
    - v1 is deleted only after the same session's v2 head is durable;
    - reads are tri-state (unreadable never authorises a delete);
    - uncommitted garbage is reclaimed under Web Locks, behind a lock port.
- **TST-16 done at `40fdc202`** (R4): static priority by placement. Exclusive payloads go into a top-level user slice, `siltwake_exclusive.slice`, with a fixed CPUWeight of 10000 and the heavy slice's caps, written once by install.sh. The handover, freeze, backstop, journal, runtime setter and `--rollback` are deleted (−427/+206 vs R3). A missing slice means `unavailable`, which is DISTURBED. Suites pass 23/23, 22/22 and 27/27, and the fast tier 1404/1404. Sol R5 running (`siltwake-tst16-review-r5-sol-40fdc20`).
- **SIM-1 done at `dd717cb0`** (R3 fixes): the retention contract as built. No age rule; eviction only under quota pressure, unreferenced timelines least-recently-written first, reported in the save result, the export and a player notice; tri-state reads; Web Locks behind `TimelineLockPort`; async saves. store.ts is 275 lines. Fast tier 141/141, timeline 48/48. Sol R4 running (`siltwake-sim1-review-r4-sol-dd717cb`); it also checks async saves against the page lifecycle and the app changes.
- **TST-16 R5** (Sol on `40fdc202`, report on `review/tst-16-r5` `430a2ec0`): REQUEST CHANGES, one P2. The static design is confirmed: R1 containment holds and rollback works. Defect: uninstall deletes the unit between holder readiness and scope launch, so the job lands in an implicit weight-100 uncapped slice but reports applied and clean. Fix: uninstall leaves the inert unit (removal is a separate step that refuses while tickets exist), and the slice's real cgroup properties are verified before and after the payload.
- **SIM-1 R4** (Sol on `dd717cb0`, report on `review/sim-1-r4` `812f6467`): REQUEST CHANGES, 4 P1s, 3 P2s and 1 P3. Findings: a waiting tab overwrites newer history; a disposed writer erases its successor's commit; cached references allow evicting the Continue and backup timelines; malformed v1 loads as absent; a pending or rejected lock is silent; v1 is evicted; partial eviction goes unreported; the eviction notice is unrecognisable.
  - **Coordinator correction:** the R3 contract over-scoped SIM-05 into a multi-session store. It is replaced by **contract v2, which mirrors `SaveRepository`**:
    - one atomic journal `{current, previous}` of heads naming chunk keys; everything else is garbage;
    - retention is current plus one previous expedition;
    - every commit (chunks, journal, collection) runs inside one `runExclusive`, with observed-journal conflict detection and an AbortSignal per session generation;
    - an unreadable journal means protected;
    - no lock API means read and export only;
    - honest page-lifecycle bounds.
- **TST-16 done at `b10aa825`** (R5): uninstall keeps the inert unit, and `--remove-exclusive-slice` is a separate step that refuses while tickets run. Kernel cgroup properties are read before and after each payload, and a mismatch means unavailable plus DISTURBED. New S23. Suites pass 23/23, 23/23 and 27/27, and the fast tier 1405/1405. Focused Sol R6 running (`siltwake-tst16-review-r6-sol-b10aa82`).
- **STEW-1 done at `d168cd6`** (R1 fixes, code `14136e8`):
  - **Gate:** judges bound, undisturbed receipts for the pinned commit, and fails if the tree changes.
  - **Guard:** dynamic and require imports plus `.mts`/`.cts`/`.tsx`; exact-match cycle and driver allowances; a headless sim/content typecheck replaces the DOM name list; `--review` on queued steps; the FORK(stream-drivers) marker added; a tightened region exemption.
  - **Docs:** the 4070 and remote-lane rules are documented.
  - **Evidence:** the gate passed 10/10 at 14136e8, npm test 1,410/1,410.
  - **Review:** Sol R2 running (`siltwake-stew1-review-r2-sol-d168cd6`).
- **SIM-1 done at `3731a553`** (contract v2):
  - **Built:** TimelineJournal, with a `{current, previous}` journal under `runExclusive`, conflict and abort, tri-state reads, v1 migration, quota drop-previous with an ID-free label; LiveTimeline, one per expedition entry; and a per-tab note outbox for close safety, an addition beyond the contract.
  - **Deleted:** eviction, leases and the lock port.
  - **Size:** store.ts 285 lines plus liveTimeline.ts 97.
  - **Open gap:** no "replace protected timeline" action.
  - **Review:** Sol R5 running (`siltwake-sim1-review-r5-sol-3731a55`), focused on the outbox and on contract conformance.
- **TST-16 R6** (Sol on `b10aa825`, report on `review/tst-16-r6` `867fd6e9`): REQUEST CHANGES. **P2:** `--remove-exclusive-slice` treats a failed population query as empty. **P3:** the endpoint readings can't see a mid-run change that is later restored, which is reachable via reinstall. Fixes: fail-closed population (reusing state.mjs); install refuses to rewrite the unit while the slice is populated; `cpu.stat` throttling deltas, where any throttling means DISTURBED; documented limits. A short R7 follows.
- **STEW-1 R2** (Sol on `d168cd6`, report on `review/stew-1-r2` `b6a03882`): REQUEST CHANGES.
  - **P2:** `.cts`/`.tsx` aren't collected and the headless roots are `*.ts` only.
  - **P2:** a barrel outside sim/content hides render or Babylon deps.
  - **P3:** the gate ignores the waiter's exit status and signal.
  - **What holds:** all in-flight merge trees pass the guard with no allowance changes.
  - **Composition:** STEW-1 declares TextEncoder/TextDecoder/AbortSignal headless now. SIM-1 splits `writer-lock.ts` into a portable port and a browser adapter when it merges after STEW-1.
- **SIM-1 R5** (Sol on `3731a553`, report on `review/sim-1-r5` `6b74707f`): REQUEST CHANGES, 4 P1s, 4 P2s and 1 P3.
  - **What holds:** the v2 journal core (stale-writer protection, v1 migration, zero old-generation mutation); Creel playthrough 17/17 reloads.
  - **Findings:** 6 of the 9 are in the note outbox. Others: other-session heads protected inconsistently; swallowed and late notices; a premature victim report.
  - **Decisions:**
    - remove the outbox and mirror game saves ("Note saved" only after commit, honest pending and memory-only states);
    - validate both retained heads via the shared validator before any mutation;
    - fix the notice wording;
    - report victims only after commit;
    - add a timeline-scoped export-and-repair action in this stream;
    - fold in the STEW-1 headless writer-lock split now.
- **TST-16 done at `2ada5062`** (R6): fail-closed `unitPopulated` for removal and install refusal; `cpu.stat` throttle deltas, where any throttling means DISTURBED; endpoint limits documented. Suites pass 23/23, 24/24 and 27/27, and the fast tier 1405/1405. Short Sol R7 running (`siltwake-tst16-review-r7-sol-2ada506`).
- **Usage limit, ~19:44–22:00 UTC:** the SIM-1 R5 fixes, STEW-1 R2 fixes and CW-1 runs failed on the rate limit and auto-resumed at 22:00. All builder threads were checked and are running.
- **TST-16 R7** (Sol on `2ada5062`, report on `review/tst-16-r7` `4aa06738`): REQUEST CHANGES.
  - **P2:** the install refusal isn't inside the admission transaction, and it skips fileless slices.
  - **P2:** missing throttle counters certify clean.
  - **P3:** incomplete events text counts as empty.
  - All mechanical; sent back.
- **SIM-1 done at `f6fee338`** (R5 fixes `85266cd7`):
  - **Changes:** the outbox is removed and notes commit like game saves; both heads validated before any mutation; victims reported after commit; the timeline-scoped "Repair play timeline" action; the writer-lock split. store.ts is 318 lines plus liveTimeline.ts 138.
  - **Review:** Sol R6 running (`siltwake-sim1-review-r6-sol-f6fee33`).
- **TST-16 done at `1d1a1bfe`** (R7 fixes): the install check/write/reload is in the admission transaction; `sliceThrottle` and `populatedFromEvents` fail closed. Suites pass 23/23, 24/24 and 27/27. Sol R8 running (`siltwake-tst16-review-r8-sol-1d1a1bf`).
- **CW-1 R1:** R1 and R2 are fixed (`477b2b4`); the frame work continues. Its last series lost 6 of 10 exclusives to the 7,200 s admission timeout.
  - **3090 window:** granted for about 23:00–01:30 UTC, for 10 segments at `fd457d3` with `--queue-timeout 21600`.
  - **Others:** REC-1 and COL-1 hold further exclusives, and builders route fast tiers to the 4070 meanwhile.
- **STEW-1 done at `1c17c4a`** (R2 fixes, code `0c9b2ff`):
  - **Fixes:** one `TS_EXTENSIONS` set and recursive headless roots; value-edge traversal through modules outside sim/content; a failing waiter fails its step; headless TextEncoder/TextDecoder/AbortSignal declarations.
  - **Evidence:** the gate passed 10/10 at 0c9b2ff, npm test 1,415/1,415.
  - **Review:** short Sol R3 running (`siltwake-stew1-review-r3-sol-1c17c4a`).
- **SIM-1 R6** (Sol on `f6fee338`, report on `review/sim-1-r6` `802b99e6`): REQUEST CHANGES, 2 P1s, 4 P2s and 1 P3.
  - **Findings:** the commit-ID validation cache permits writes and GC over post-validation damage; malformed heads throw before protection; repair failure handling; live-commit protection; failure-mode retry; the pending notice.
  - **Decision: split.**
    - **SIM-1a merges now:** the in-place step, StepGuard, SIM-02, the chunked recorder with note-keeping rotation, the cursor, the lock split, and root's own single-key atomic persistence. That's no regression vs root, and notes are now kept.
    - **SIM-1b follows:** the incremental journal (parked from f6fee338), with the R6 rulings: no cache and a fresh head parse per commit; a total reader; repair supersedes v1; a rejected lock or quota failure retries, while conflict and protection don't.
- **TST-16 R8** (Sol on `1d1a1bfe`, report on `review/tst-16-r8` `39ac5fb6`): REQUEST CHANGES. R7 is fixed and all controls hold.
  - **P2:** the unbounded `daemon-reload` inside the transaction holds the lock, so a failed submission runs later.
  - **P2:** reload failure is swallowed, and the equality shortcut never retries.
  - **P3:** prefix counter parsing.
  - **P3:** an invalid throttle reading is still `measured:true`.
  - **Fix:** one checked, timed systemctl helper for install and removal that restores the prior unit on failure and exits before any switch.
- **STEW-1 R3** (Sol on `1c17c4a`, report on `review/stew-1-r3` `763cbcc5`): REQUEST CHANGES. **P2:** inline `{ type X }` imports still emit a runtime edge. **P2:** the traversal fails open outside the TS-under-src graph (tools/ barrels, .js files, computed loads in helpers, unlisted packages). Decision: fail closed on any unanalysable reachable edge, with an explicit portable-package allowlist. After this the guard is complete enough to accept.
- **SIM-1a at `cc3b7de0`** (code `68a2c5bd`):
  - **Contents:** root's single-key atomic persistence restored over the chunked recorder; SIM-1b parked on `t3/sim-1b-timeline-journal` (f6fee338). Diff vs f6fee338: +117/−1,300. Fast tier 140/140, focused 281/281, 4070 Creel 17/17.
  - **Before review:** a full window exports 2.85M code units, close to the shared localStorage quota. Asked for a quota-pressure fold of the exported copy (halve the whole-event window, notes kept) and a retry before falling back to memory-only.
- **REC-1 done at `f9c04948`** (code `48b0f251`): R1 dispositions per finding; F7 tail root cause (segment start dated before MediaRecorder's clock) fixed; 18 views quarantined, 125/125 stable; budget run passes. The clean exclusive overhead figure is missing and is queued after CW-1's window. Sol R2 running (`siltwake-rec1-review-r2-sol-f9c0494`).
  - **Forwarded to CW-1:** a light-resident stat (open water drawn inside caves before light lands); top-k light selection depends on history; a 68.8 ms simulation frame (pack A05).
- **CW-1 window hygiene:** REC-1 overlapped CW-1 ticket 261023-224051-4599 with a local npm test, so that segment is to be rerun. SIM-1 and TST-16 builders were told late about the window; all are now routing CPU work to the 4070 or keeping it small.
- **SIM-1a done at `80651074`** (quota fold `54bbae19`): the export folds to 10/5/2 whole chunks on QuotaExceededError, keeping every note, before falling back to memory-only. Fast tier 140 files on the 4070. Sol review running (`siltwake-sim1a-review-sol-8065107`).
- **TST-16 done at `b8e9b103`** (R8 fixes, code `2fe7aef1`): one bounded, checked systemctl helper (`exclusive-unit.mjs`) that restores the previous unit on failure and exits 4 before any switch; whole-value counter parsing; invalid throttle readings count as missing. Suites pass 23/23, 25/25 and 27/27; fast tier on the 4070. Sol R9 running (`siltwake-tst16-review-r9-sol-b8e9b10`).
- **SIM-1a review** (Sol on `80651074`, report on `review/sim-1a` `9d3f503f`): REQUEST CHANGES. **P2:** a resume that rotates during re-chunking forgets regions, so a revisit counts as new. **P3:** legacy quota code 1014. Everything else passed (persistence, fold, unchanged stepping, no SIM-1b leftovers, headless). Small fixes, then a focused re-check and merge.
- **TST-16 R9** (Sol on `b8e9b103`, report on `review/tst-16-r9` `fddd7ae8`): REQUEST CHANGES, 3 P2s.
  - **Findings:** combined systemd delays exceed client deadlines; a failed restore is forgotten, so a retry certifies stale settings; a previous-file read error deletes the unit.
  - **Decision:** a maintenance mode, set and cleared in short transactions (admission paused, submissions queue). The unit update runs outside the lock and succeeds only when systemd's own properties match. On failure, maintenance stays set and the recovery is to rerun install. No rollback, no equality shortcut.
- **REC-1 R2** (Sol on `f9c04948`, report on `review/rec-1-r2` `370f2dea`): REQUEST CHANGES, 7 P2s.
  - **Findings:** a telemetry budget exception; loss accounting says "nothing lost" when data is lost; Off discards an in-flight picture; a campaign-length timeline.html throws; Off/on leaks spool workers; the overhead probe divides by callbacks, so the queued A/B 261023-224654-17c1 is to be cancelled or discounted; the segment clock after a restart or long task.
  - **Status:** the ordinary path works. Sent back.
- **STEW-1 done at `c5ab187`** (R3 fixes, code `762cf55`):
  - **Guard:** inline `{ type X }` imports count as runtime edges; layering fails closed over the reachable closure in any directory, with an empty PORTABLE_PACKAGES allowlist. Root and all five merge trees pass.
  - **Gate:** a new `--machine M` override. The gate passed 10/10 on the 4070, npm test 1,417/1,417.
  - **Review:** short Sol R4 running (`siltwake-stew1-review-r4-sol-c5ab187`).
- **SIM-1a done at `a6010a80`** (fixes `ff623989`): regions rebuilt from one restored partition; quota code 1014. Fast tier on the 4070. Short Sol re-check running (`siltwake-sim1a-review-r2-sol-a6010a8`); it is also asked to look for any other recorder index built from a mixed partition.
- **TST-16 done at `028793ae`** (R9 fixes, code `110f12d4`): maintenance mode as specified. Admission is paused and submissions queue; the unit update runs outside the lock with bounded calls (reload 120 s); success means systemd's properties match; on failure, maintenance stays and the recovery is to rerun install; ENOENT-only absence; no rollback. Suites pass 23/23, 25/25 and 27/27, units 42/42, fast tier on the 4070. Sol R10 running (`siltwake-tst16-review-r10-sol-028793a`).
- **SIM-1a ACCEPTED and MERGED** (Sol re-check `0d9b955d` on `review/sim-1a-r2`). Root `b54bfd92`.
  - **Gate:** run on the 4070 via queue ticket 261023-233143-e0e4, bound to b54bfd92: npm test 1,417/1,417, build, all five economy scripts.
  - **After:** saves export running. SIG-1 can start from this root. SIM-1b (incremental journal) is parked on `t3/sim-1b-timeline-journal`.
- **SIG-1 started** in SIM-1's freed slot (`siltwake-sig1-signatures-opus-1662e5a`, branch `t3/sig-1-signatures`, from root `1662e5a0`). Stage 0 is F12 (one inventory authority, `planSpend`/`applySpend`, ledger fork deleted) and is reported separately; then the nine signature upgrades, host upgrades, visible outposts and fish trap, cargo filter, and the HUB-2-01 negative control. Builders: CW-1, COL-1, REC-1, STEW-1, TST-16 and SIG-1, with STEW-1 and TST-16 in review rounds.
- **Saves exported** for root `b54bfd92` (alickers, decoded before publishing).
- **STEW-1 R4** (Sol on `c5ab187`, report on `review/stew-1-r4` `08137166`): REQUEST CHANGES, one P2. JS or missing targets inside `src/sim` and `src/content` bypass the fail-closed verdict. Merge trees: REC-1's `idle-video-experiment.mjs` and COL-1's `r7-shots.mjs` are correctly flagged as new drivers. REC-1 is to move or delete its experiment; COL-1 is to fold r7 into r6-shots or allowlist it under FORK(stream-drivers).
- **SIG-1 stage 0 done at `0f53b8f9`** (code `f2bdb984`): `sim/inventory.ts` is the one authority; the ledger fork is deleted (7 importers repointed); `planSpend`/`applySpend` with explicit `listed`/`oldest` priority; F05 clone dry runs replaced by `hasRoomAfter`; the journal remerge removed. Gate on the 4070: 1,421/1,421, 6 economy scripts, playthrough 8/8, and 122 save hashes bit-identical to the b54bfd92 library. Sol review running (`siltwake-sig1-stage0-review-sol-0f53b8f`). Stage 1 continues; it needs save schema 7 with a 6→7 bridge.
- **TST-16 R10** (Sol on `028793ae`, report on `review/tst-16-r10` `1895713a`): REQUEST CHANGES. **P2:** a failed recheck clears maintenance. **P2:** installers aren't serialized, so marks can be cleared by others. **P3:** the reload bound is only a TERM. Fix: a separate installer flock for the whole operation; an owner-identified mark that only the owner clears, with dead-owner takeover by rerun; any uncertainty keeps maintenance; KILL escalation.
- **SIG-1 stage 0 review** (Sol on `0f53b8f9`, report on `review/sig-1-stage0` `fa337a6e`): REQUEST CHANGES. Behaviour is preserved (replays match root). **P2:** consumption bypasses remain (bio-cell, hosts, outposts) and there are duplicate CU sums (fleetArt, the playthrough driver). **P2:** `applySpend` partly applies an incomplete plan. Stage 0 is fixed before stage 1 continues.
- **STEW-1 done at `1274099`** (R4 fixes, code `f35e216`): lower-directory targets are skipped only when they're analysed TS; everything else fails closed. Merge trees pass except REC-1's experiment driver, which is correct (REC-1 to move or delete it). The gate passed 10/10 on the 4070, npm test 1,419/1,419. Short Sol R5 running (`siltwake-stew1-review-r5-sol-1274099`).
- **TST-16 done at `1bc6c8dc`** (R10 fixes, code `31ca5821`): every post-pause failure keeps maintenance (exit 4); a separate `install.lock` covers the whole operation; an op-owned mark with dead-owner takeover; reload TERM→KILL with reaping. New S26. Suites pass 23/23, 26/26 and 27/27, units 42/42, fast tier on the 4070. Sol R11 running (`siltwake-tst16-review-r11-sol-1bc6c8d`).
- **STEW-1 R5** (Sol on `1274099`, report on `review/stew-1-r5` `26163769`): REQUEST CHANGES. **P2:** a missing `.json` import passes. **P2:** a symlink alias hides layers. Decision: JSON must exist; fail on any symlink under `src/`; document the guard's scope as a regression rail over honest code, not a sandbox. Further exotic bypasses are out of scope unless reachable by ordinary code.
- **SIG-1 stage 0 done at `2de5e3d8`** (R1 fixes in `cc7f55f7`): `applySpend` refuses incomplete or stale plans before any write (`SpendRefused`); `takeInstance` handles chosen-item removal; all duplicate CU sums go through the authority. Gate on the 4070: 1,424/1,424, 6 economy scripts, playthrough 8/8, save hashes bit-identical. Sol R2 running (`siltwake-sig1-stage0-review-r2-sol-2de5e3d`).
- **SIG-1 stage 0 R2** (Sol on `2de5e3d8`, report on `review/sig-1-stage0-r2` `acf1dcdf`): REQUEST CHANGES, one P2. Cooking (`fauna/catch.ts:91/93`) sums freed quantity as CU outside the authority; fix is `hasRoomAfter`. Everything else passed. After a quick re-check, stage 0 merges to root.
- **TST-16 ACCEPTED** (R11, Sol `a9196eec` on `review/tst-16-r11`), safe to install live via the canonical state path once the lane is idle. Merged locally at `f5a1170f`; scripts/heavy is identical to the reviewed code. The root gate is running on the 4070.
  - **Install plan:** after CW-1's window, once the lane is idle, run the full SCHED suites at the merged root, then install, then the boosted CW-1 comparison for fleet.
  - **Follow-up TST-16b:** P3-F1 (publication under the installer lock), P3-F2 (production path identity), plus the soak-runner R4-F3 flake.
- **TST-16 MERGED** to root `f5a1170f` and pushed (gate on the 4070, ticket 261024-004258-e7cf: 1,427/1,427, build, 5 economy scripts). Not installed yet: CW-1's series is still running at 00:53Z.
- **STEW-1 done at `bdaef84`** (R5 fixes, code `d2617b1`): JSON must exist; symlinks under src fail; the scope is documented. All merge trees pass, including REC-1. The gate passed 10/10 on the 4070. Final Sol R6 running (`siltwake-stew1-review-r6-sol-bdaef84`).
- **STEW-1 ACCEPTED** (R6, Sol `f3d82c64` on `review/stew-1-r6`; one nonblocking P3 about ignored-name symlinks). The builder merges root (SIM-1a + TST-16) into the branch, resolves app.ts and runs `npm run gate`; then the coordinator merges it and the root gate becomes `npm run gate`.
- **SIG-1 stage 0 done at `da226755`** (R2 fix `a4e1834e`): cooking uses `hasRoomAfter`, with no result change (1-CU items). Gate on the 4070 and bit-identical saves. Short Sol R3 running (`siltwake-sig1-stage0-review-r3-sol-da22675`).
- **SIG-1 stage 0 MERGED and pushed** (root `7df4c8ab`). Gate on the 4070: 1,435/1,435, build, 5 economy scripts, plus `check-progression-curve` run separately (PROGRESSION-OK). Correction: the coordinator's hand gate had been missing the sixth economy script (`check-progression-curve`) for SIM-1a and TST-16; it passes on the current root, which contains both.
- **STEW-1 merged locally** at `06442757` (ledger.ts stays deleted; its CORE-HELPERS row is removed). `npm run gate` was started locally and stopped at about 01:18Z because REC-1's exclusive overhead A/B was running (REC-1 told). It reruns when the lane is idle, followed by the TST-16 install.
- **Usage limit, ~01:30–03:00 UTC:** CW-1 and SIG-1 runs failed on the rate limit and resumed at 03:00; all builder threads were checked. CW-1's exclusive series and REC-1's A/B are finished; the lane is idle at 03:00Z.
- **TST-16b done at `75c659eb`** (code `d2e54642`): install.sh holds `install.lock` through publication (the helper verifies the inherited fd); production is decided by directory identity (`sameDir`); the R4-F3 flake is made deterministic. Suites pass 23/23, 27/27 and 27/27, fast tier on the 4070. Sol review running (`siltwake-tst16b-review-sol-75c659e`).
- **CW-1 R1 fixes done at `699b575d`** (code `9c73272`):
  - **Fixed:** R1 (admission held on the load screen) and R2 (per-session recovery reset), with 5 app tests.
  - **Root-fixed costs:** terrain step 37.5 ms; far light placement; selection 1.15 MiB→15 KiB; sim queries 283→99 KiB per tick; light uploads sliced.
  - **3090 run:** frame gate not met (18 frames over 34 ms, 17 DISTURBED); one quiet 53 ms streamer frame is open. Missing evidence is listed.
  - **Review:** Sol R2 running (`siltwake-cw1-review-r2-sol-699b575`).
  - **Infra follow-ups:**
    - the 7,200 s default queue timeout is too short for exclusive series (consider a class default);
    - the `gpu` class's 3 GiB reservation is too small for the deep traverse harness.
  - **Design question:** the Creel's ~13 min air limit makes 4 Meridian east deep caves unreachable by cold approach. Decide whether that's intended (an upgrade gate) or a route or pacing issue.
- **STEW-1 MERGED and pushed** (root `a7ca6054`). `npm run gate` passed 10/10 at a7ca6054 (playthrough ticket 261024-031515-c0ed on the 3090). The root merge gate is now `npm run gate`. The saves export follows.
- **TST-16b ACCEPTED** (Sol `98940eed` on `review/tst-16b`), safe to install. P3 follow-ups: a missing-directory symlink alias can read as private; the fd check accepts an unlocked matching descriptor; the soak rewrite lacks window-end frame coverage.
- **Owner request (2026-10-24):** how to read the flight-recorder packs for real gameplay feedback without low-value checks. Plan: Sol 6.1 xhigh research (`siltwake-evidence-feedback-research-sol`, writing `docs/build/research/RECORDING-FEEDBACK-SOL.md` on `research/recording-feedback`), then an independent Opus 5.5 view built on that report, then the coordinator consolidates the options for the owner.
- **REC-1 R2 fixes done at `becc169f`** (runtime `126b2cc6`):
  - **Fixed:** the WebCodecs VP9 spool-worker video, with encoder-stamped times and honest gaps; the probe corrected; Off finalisation; the loss ledger; budget stops; worker retirement; bounded timeline.html.
  - **Open:** the inclusive cost isn't established (0.30 ms mean, noise-bound). A fixed-pose A/B is approved after the TST-16 install.
  - **Review:** Sol R3 running (`siltwake-rec1-review-r3-sol-becc169`).
  - **Merge order:** CW-1, then REC-1.
- **CW-1 at `92527bc2`:** REC-1's three findings folded in.
  - **Cave readiness:** a `data-cave-light` and lights-settled stat, waited on at load and after jumps.
  - **Light selection:** a pure function of pose and candidates.
  - **Simulation spikes:** not cave-driven (6 frames over 30 ms in 3 h, the biggest far from caves), so routed to a SIM perf follow-up, owner to be chosen.
  - The R2 review covers 699b575d; 92527bc2 goes into the next round. The 15-ticket clean remeasure is held for the TST-16 install.
  - **Simulation spike detail (CW-1):** the 3 biggest (63–136 ms) were far from caves; the near-cave ones line up with the diver's collision checks costing about 11× in dense deep-cave geometry (380 vs 34 µs per step). That's input for COL-1 stage B (the unified collider) and the SIM perf follow-up.
- **CW-1 R2** (Sol on `699b575d`, report on `review/cw-1-r2` `8463b5d7`): REQUEST CHANGES, 5 P2s. Binding bypasses upload slices; light readiness missing from entry and diagnostics; tie-break history; roster-proportional tick allocation; unbounded lighting geometry cache. R1 and R2 are verified fixed. Decision: fix all five, then one clean 3090 remeasure on the final code.
- **TST-16b MERGED and pushed** (root `5f9bd604`). `npm run gate` passed 10/10. No saves export is needed (no game code). The full SCHED-1/2/2b suites are running at the merged root before install.
- **TST-16 + TST-16b INSTALLED LIVE** at 04:02Z: heavy-check v2 `baf9369c3418` from root `5f9bd604`.
  - **Before install:** full suites at the merged root (SCHED-1 23/23, SCHED-2 27/27, SCHED-2b 27/27, policy and config units 35/35). Pre-state in `/work/tmp/cutover-tst16/` (previous `95f340380c25`).
  - **Unit:** `siltwake_exclusive.slice` is loaded: CPUWeight 10000, 700%, 8 GiB, swap 0.
  - **Canary:** exclusive canary 261024-040242-6f8a was placed in the slice, boost applied, not disturbed, with steal, faults and swap reported per job.
  - **Notified:** REC-1 (fixed-pose A/B go) and CW-1 (remeasure after R2 fixes).
- **Recording-feedback research:** Sol report on `research/recording-feedback` (`60196347`, pushed). The Opus independent view is running (`siltwake-evidence-feedback-opus-view`).
- **REC-1 R3** (Sol on `becc169f`, report on `review/rec-1-r3` `31378375`): REQUEST CHANGES, 4 P2s and 1 P3. The clock passes (204/204).
  - **Findings:** an encoder throw kills the serial queue; a locked older recording is credited as removed; encoder drops are invisible to completeness and strips; the inclusive cost is unestablished (a cheap fixed-pose plan of 2 pairs × 30–60 s, now under TST-16); the "conclusive" label.
  - **Scope:** kept narrow; the Opus pack-format ideas are held for the owner's decision.
- **Opus recording-feedback view** at `e5738b9b` on `research/recording-feedback-opus` (pushed). It recommends plan B: a play debrief plus a health split in REC-2, reading habits now, and an owner playtest protocol. DIRECTION rule changes await owner approval.
- **Owner decision, recording feedback (2026-10-24): plan B plus all four DIRECTION rule changes** (now in DIRECTION "Evidence reading and quality review"). No outside blind tester.
  - **REC-1b**, a short follow-up after REC-1 merges: two verdicts in `summary.json`; no strips for unjudged hitches; pacing suppressed on traversal and short runs; one control strip; fixed views tagged by region and system for subset capture.
  - **REC-2, before the first owner playtest (after OP-1):** one pacing model (`analyseTimeline`, deleting the `analyse.mjs` heuristic); major/minor new things; the note context snapshot; `debrief.md` plus a ribbon with a tension trace and moment cards; a separate `health.md`; then the shared driver.
- **Owner request (2026-10-24): each note also saves the full game state.** Added to REC-2's note-context item: at each feedback-key note, embed a save (existing codec; the largest save today is 44 KiB) in the flight recording. Agents can then load the exact moment, reproduce it, test fixes from it, and keep it as a regression save (via SAVE-1's library format).
- **SIG-1 stage 1 done at `416441bc`**:
  - **Contents:** nine signatures live with typed outcomes; module host upgrades; visible outposts, fish trap and tools; the HUD craft action bar; the Cargo filter; the HUB-2-01 control; save schema 7 with an additive bridge6 (schema 5 refused, bridge5 deleted).
  - **Checks:** npm test 1,472/1,472, heavy 465/465 (3 unattributed OOM kills to investigate), 6 economy scripts, playthrough 8/8 equal to stage 0, browser on both GPUs.
  - **Open:** the Spindle isn't built by any route.
  - **Review:** Sol R1 running (`siltwake-sig1-stage1-review-sol-416441b`).
- **SIG-1 stage 1 R1** (Sol on `416441bc`, report on `review/sig-1-stage1` `fe580446`): REQUEST CHANGES, 5 P2s.
  - **Findings:** unsaveable mid-action transitions; silent cutting-arm completion and inferred feedback; the drone can launch in rock; per-step roster scans for lifts; an unbounded field-kit line cache.
  - **Resolved:** the OOM kills were intentional probes; the Spindle is intentionally optional (a specialist, walk-on Isles plate).
- **SIG-1 stage 1 done at `5f557cbf`** (R1 fixes, code `a3e716f3`): saveable mid-actions; typed arm and berth events; drone launch clearance with atomic refusal; `rowById` lifts; a bounded line pool. Gate parts on the 4070 (fast 1,475, build, 6 economy, playthrough 8/8). Sol R2 running (`siltwake-sig1-stage1-review-r2-sol-5f557cb`).
- **SIG-1 stage 1 R2** (Sol on `5f557cbf`, report on `review/sig-1-stage1-r2` `6e56048c`): REQUEST CHANGES. **P2:** the fitting memo survives a save load, showing the wrong hardware. **P3:** hardware thrashes at the 240 m threshold, so add hysteresis. R1–R4 pass and the bake skip was safe. Short re-check, then merge.
- **SIG-1 stage 1 ACCEPTED and MERGED** (R3, Sol `9a7c44dc` on `review/sig-1-stage1-r3`). Root `2901fed1`; `npm run gate` passed 10/10 at 2901fed1. Saves export (schema 7) running. Every craft's signatures, the visible outposts, the action bar and the Cargo filter are on root. Open items: NAV-1 tow/pod paths, the sonar wavefront, the `armTarget` scan, and `sig1/play.mjs` (FORK stream-drivers). The SIG-1 slot is freed.
- **SIM-PERF-1 started** in SIG-1's freed slot (`siltwake-simperf1-opus-168a508`, branch `t3/sim-perf-1`, from root `168a5084`): attribute and root-fix simulation steps over 8 ms (CW-1: 63–136 ms spikes far from caves; REC-1 A05: 68.8 ms). An attribution report comes first. Builders active: CW-1, COL-1, REC-1, SIM-PERF-1.
- **CW-1 R2 fixes ready at `3779f59c`** (not yet "done"):
  - **Fixed:** all 5 P2s; a measurement bug (shared timing object) fixed. The deep stall turned out to be a flat battery, and the planner now plans power.
  - **Gate parts at 0f4d36fe:** fast 1,486, heavy 476/476 (CA-3 passes unloosened), 6 economy, playthrough 8/8, bake verify.
  - **Clean remeasure:** greenlit at 06:50Z: 16 exclusive tickets under TST-16 priority. Segments in the 08:30–09:45Z backup window are flagged, which gives fleet the in-window versus out-of-window steal comparison.
- **SIM-PERF-1 attribution at `3b9eef1e`:**
  - **Large spikes (30–136 ms):** don't reproduce when the step is re-run. The builder attributes them to host or VM pauses; the coordinator is not yet convinced (steal is low under TST-16, and recorded idle samples point to a blocked main thread). A decisive canary-plus-per-vCPU-steal test and a 4070 control come after CW-1's series.
  - **Real fixes:** a memoized `craftProfile` and single-pass hazard sampling (99→80 KiB a step); autosave no longer re-decodes its own record (3.4→1.2 ms commit); hunter solid validation once per world (threat p99 1.1 ms→21 µs).
  - **Timeline save:** 13–21 ms of stringify at 20k events, so SIM-1b gets assigned.
  - **Also asked for:** warm the cold costs behind "Resume when ready"; a systems-view revision counter.
- **SIM-1b started:** the incremental timeline journal, on the SIM-1 builder, from the parked `t3/sim-1b-timeline-journal`. Spec: contract v2 plus the R5 decisions plus the R6 rulings. It must land before the owner's first playtest. Builders: CW-1, COL-1, REC-1, SIM-PERF-1, SIM-1b (5).
- **REC-1 R3 fixes at `3eec4044`** (code `68d0d60c`): R3-1/2/3/5 fixed and checked with real workers and OPFS.
  - **R3-4, inclusive cost measured** (fixed pose, 6 one-run pairs under the TST-16 slice): +0.42 ms per frame (95% CI −0.14 to +0.97), with a best estimate of 0.3–0.4 ms. That's **over the 0.167 ms budget**. It sits in the game's own frame callback with collection up, and the suspect is renderer per-part timing and GPU timer queries.
  - **Decision:** fix it in R3b, not as a compromise; then one R4 covers everything.
- **SIM-1b code complete at `5314f3ef`** (rebuilt on root `96255382`):
  - **Bench at 20k on the 4070:** 2.96M chars and 9.36 ms per save → 64k chars and 0.80 ms steady; a sealing commit is 2.80 ms.
  - **Rulings and tests:** the R6 rulings are in, and their regressions fail on f6fee338. Note events carry `saveRef` for REC-2.
  - **Gate:** running inside 4070 jobs.
  - **Review:** Sol R1 dispatched in parallel (`siltwake-sim1b-review-r1-sol-5314f3e`).
- **SIM-1b R1** (Sol on `5314f3ef`, report on `review/sim-1b-r1` `61a2e4a4`): REQUEST CHANGES, 2 P1s and 3 P2s.
  - **Findings:** a failed repair collects against the uncommitted empty journal and deletes data; the reader isn't total (malformed v1 throws, a header admits unreadable history); a malformed summary bypasses fold validation; quota retries mutate before protecting; entry clears the protection warning.
  - **Decision:** fix all five, and add one seeded model-based fault-and-corruption harness that asserts the invariants after every step, to end the case-by-case rounds.
- **CW-1 remeasure, 09:04Z: 6/16 in.**
  - **Lost tickets:** the submit client's 2 h limit killed 10 queued run-mode tickets; they're resubmitted detached.
  - **Window:** tour 4 (in window) came back DISTURBED with steal max 5.3%, so it's rerun at the end; tour 5 (in window) was clean.
  - **Gate:** tours 1–2 pass; 0, 3, 4 and 5 fail on 1–3 streaming frames each. Every segment reached all its caves, with 0 faults and 0 swap.
  - **Two kinds of frame:**
    - **off-CPU blocks** of 70+ ms (not steal, since PARAVIRT_TIME_ACCOUNTING is off); naming them needs an eBPF off-CPU stack (root), which is a fleet question;
    - **on-CPU:** uncapped residency eviction (38–72 ms) and light placement (24–31 ms).
  - **Plan:** finish the series and diagnostics, root-fix the on-CPU passes (slicing), then a targeted remeasure of the failing segments.
- **SIM-1b R1 fixes at `b2aebd6d`:** F1–F5 fixed, plus a model-based fault harness (24 sequences fast, 2,000 heavy; seed replay). The harness found one more store bug (seed 66769815), now fixed. Gate parts and 5,000 more sequences queued on the 4070. Sol R2 dispatched in parallel, with mutation-testing of the harness as its main question (`siltwake-sim1b-review-r2-sol-b2aebd6`).
- **REC-1 R3b:** the cost is the video path (software VP9 plus GPU readback contention), not timing or allocations. The confirmation design approved is within-run alternation (`?recmeasure=1`) plus off-versus-paused corroboration. Hardware encoder preferred, with a software fallback. The 540p fallback question is with the owner.
- **Owner (2026-10-24), recorder video encoder:** the owner points out that every player machine has a GPU with a hardware encoder. Decision: a hardware ladder of AV1 → VP9 → H.264 (`prefer-hardware`; H.264 covers integrated GPUs, in MKV or MP4 if needed); the software fallback (effectively our Linux test machines) at 960×540; the pack states the encoder used. The 1% budget is judged on the owner's hardware path (owner-PC check) and on the 540p software path on our machines.
- **Owner encoder policy (2026-10-24):** the owner's laptop uses the best encoder available; the sandbox may use something else; the CPU route at 960×540 is approved on Linux only if all else fails. A Sol research agent is studying browser hardware video encoding (`siltwake-research-webcodecs-hw-encode-sol`, writing `research/browser-hw-encode`) to give REC-1 concrete probes.
- **SIM-1b R2** (Sol on `b2aebd6d`, report on `review/sim-1b-r2` `27a3f3ad`): REQUEST CHANGES, 3 P2s and 1 P3. R1's P1s are fixed, and the parse cost is 0.166 ms at 20k.
  - **Findings:**
    - the validator misses malformed known fields;
    - the harness is weak: mutation testing showed the F3 and F4 mutants surviving 2,000 sequences, and its oracle follows production parsers;
    - a timeline warning suppresses urgent hazard captions (player-facing);
    - a stale failure warning remains after repair.
  - **Fix plan:** an independent oracle, read snapshots, deterministic fault schedules, fast-tier seeds that kill the known mutants, and mutants kept as a heavy self-check.
- **Hardware-encode research in** (`research/browser-hw-encode` `e212e70a`, pushed).
  - **Windows 4070:** hardware AV1, H.264 or HEVC (no CPU fallback on Windows).
  - **factory-worker:** no NVENC from Linux Chrome (nvidia-vaapi-driver is decode-only), so the approved 540p software path.
  - **WSL2:** Mesa D3D12 VA-API H.264 is a real possible hardware path; probe `vainfo` first.
  - **Capture:** direct `VideoFrame(canvas)` against the scaled bitmap, traced for readback.
  - **Containers:** fMP4 for H.264/HEVC, WebM for VP8/VP9/AV1.
  - Forwarded to REC-1 with its probes. The owner-PC probes are batched for one owner session.
- **Owner suggestion (2026-10-24): GPU Screen Recorder** (native Linux NVENC/VA-API capture).
  - **Fit:** viable as the "native NVENC recorder" route from the hw-encode research.
  - **Not adopted now:** factory-worker's browsers are headless on a display-less GPU (it would need an X server on the 3090, a VM change); the timing is wall-clock only, not page-time; and its docs warn that NVENC causes memory downclocking on NVIDIA drivers before 580 (factory-worker runs 550), which would distort 3090 frame evidence.
  - **Kept as the fallback** if the 540p software path is over budget on Linux. It would need owner/fleet approval for the X server and a 580+ driver.
- **NVIDIA driver research in** (`research/nvidia-driver` `3079444c`, pushed):
  - **Findings:** an upgrade isn't a demonstrated fix for the stalls and won't enable NVENC in Linux Chrome (no Vulkan Video encoder or NVENC backend in Chromium; nvidia-vaapi-driver is decode-only). Keep GL-EGL.
  - **Cheap first steps on 550:** a task-owned GL shader disk cache with a cold/warm comparison (no VM change; handed to SIM-PERF-1); persistence mode and clock-lock diagnostics need root and owner approval.
  - **Upgrade option, owner-approved maintenance only:** R595 production (595.112.07) via NVIDIA's Debian 13 APT repo, pinned, with a full guest rollback image. R580 has no Debian 13 vendor repo.
- **Owner approves fleet option B (2026-10-24):** move ZFS write threads, remaining host kernel work and tailscaled to host CPUs 0–3. This needs boot parameters and a host reboot.
  - **Evidence sent via the owner:** 6/16 exclusive runs disturbed by steal of 5–8.5%, five of them outside the backup window.
  - **Before the reboot:** the coordinator pauses builders (WIP committed) and drains the queue once fleet names a time.
  - **After:** health checks (3090 passthrough, queue), resume, then a before/after steal comparison on the same route.
- **SIM-1b R2 fixes at `16961a67`** (code `80b11146`):
  - **Fixes:** full known-field validation; a rewritten independent-oracle harness (read snapshots, full fault and lock families, 40-step replay; all 12 mutants killed in the fast tier, plus a heavy self-check); the timeline warning at rank 2.5, below hazards and game-save warnings; scoped resolution of timeline warnings.
  - **New defect found by the harness:** a 1,001-event seal on reload, now fixed.
  - **Review:** Sol R3 running with fresh mutants (`siltwake-sim1b-review-r3-sol-16961a6`).
- **CW-1 diagnostic D1 (key finding):**
  - **What it shows:** all 20 frames over 34 ms coincide with VM-wide host steal of 410–670 ms across 8 vCPUs inside a 100 ms gap, i.e. **the VM is paused about 100 ms, several times a minute**. Steal sometimes shows as run time and sometimes not. Receipts read about 2% because pauses average out over 5 s windows.
  - **Plan:**
    - the CW-1 fixes stand (they break convention 4 regardless);
    - the gate splits frames into host-paused, mixed (remainder after subtracting steal still over budget, which counts as ours) and clean ours;
    - a targeted remeasure with per-vCPU steal follows.
  - **Owner and fleet:** a question about what pauses the whole VM for about 100 ms; this strengthens the option-B case.
  - **Surf cave stall:** a driver drift onto a shallow bump; root fix is the planner sweeping legs with lateral margin.
- **SIM-1b R3** (Sol on `16961a67`, report on `review/sim-1b-r3` `9bacc5ff`): REQUEST CHANGES, one P2. The timeline warning (rank 2.5) hides failed-import errors (rank 2) in both arrival orders; fix is to put the timeline warning below general errors. Everything else passed: library saves under the stricter validator, the seal boundaries, all R2 mutants. Short check next.
- **REC-1 R3b probes:**
  - **Results:** no hardware encoder on either Linux machine (factory-worker Chrome 156.0.8078.4, alickers 156.0.8078.47), even with `AcceleratedVideoEncoder`. Software AV1, VP9, VP8 and H.264 are available. The media log identifies the encoder.
  - **Sandbox VA-API:** there was no driver or `vainfo` at all, so the owner approved installing `mesa-va-drivers`, `vainfo` and `ffmpeg` inside the WSL sandbox only (no Windows or host changes), recorded with a removal path.
  - **540p confirmation:** stopped by the stall detector (the hold printed nothing), now resubmitted with per-window logging.
  - **Queued:** the decomposition. The owner-PC probe script is being prepared.
