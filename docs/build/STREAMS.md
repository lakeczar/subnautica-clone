# Parallel streams (2026-10-20)

Each stream has one Opus 5.5/high owner in its own worktree, branched from the coordinator baseline. All of them follow [DIRECTION](DIRECTION.md): the ground rules, the B1-owned roots that nobody else may edit, and the lean gate. Streams write **new modules plus a short interface note** (`docs/build/streams/<ID>.md`). The coordinator composes them into the shared roots after B1 lands. Each handoff is one page, followed by one fresh Sol review.

Common to every stream:
- **Read first:** `prompts/BUILD_GAME_REVISED.md`, the specification docs it points to, `docs/build/reviews/DIRECTION-AUDIT-SOL-XHIGH.md` and the current code. B1's in-progress interfaces are readable at `/home/worker/.t3/worktrees/subnautica-clone/t3-b6aef8ec`, read-only.
- **Checks:** `npx tsc --noEmit` and your own new tests with `node --test` on your files only. Anything using Babylon or NullEngine goes through `scripts/heavy-check.sh` with `--test-concurrency=1`. Assertions on scene objects use `same()`-style name checks (see B1's `tests/render-assert.ts`), never deep equality on Babylon objects.
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
- **Running:** B1, GPU author, S1 (R1 fixes), S2, S5 (R1 fixes).
- **Paused, in resume order:** S4 (R1 fixes), S3 (R1 fixes), S6 (R1 fixes). Each was told to commit and stop; resume with "continue".
  - S6 paused at `ab59c89`: all five fixes are in source, but their tests, the lab re-measure and the doc updates remain.
