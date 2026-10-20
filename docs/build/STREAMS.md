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
