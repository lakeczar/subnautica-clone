# CW-1: every authored cave in the game, streamed without pauses (handoff)

Opus 5.5 high. Branch `t3/enable-authored-cave-streaming`, from root `3650e6b`; root merged at `c649b11` (CA-3, CB-2, POI-1), `0a4539d` (TT-1), `ba7d5fa` (SCHED-1, the shared terrain store) and `a536775` (SCHED-2a, CR-1, UX-1). Code: **`9c73272`** after review R1 (the R1 traversal ran on `fd457d3`; `src` is unchanged since `20679ea`). Review R1: `review/cw-1-r1`, `docs/build/reviews/CW-1-SOL-XHIGH-R1.md`.

## Outcome
All **55** authored small and medium caves are in the real game: the Fanvault and W2's four hub caves, CA-1's 18 Reef and Isles caves, CA-2's 12 Canopy and Basin groups, and CA-3's 20 Rift, Divide and Meridian sources. The browser never generates a cave: collision and light are baked, streamed ahead by proximity and heading, built in time slices and evicted behind and far first. At 1920×1080 on the RTX 3090, after review R1, 109 minutes of driving from earned library saves (an 8-segment Dart tour from `tour-ready`, deep Creel segments from `canopy-over-geared`) reached 66 of 67 cave stops, **never held and never built a cave unsliced**. The streaming frame gate is **not met**: 18 frames went over 34 ms in streaming parts (24 before R1, in half the driving). Whether they are game work or this machine's is **unresolved** (*Traversal*). R1's fixes removed every real cost the per-call attribution found. Clean 3090 frame-time evidence is listed as **missing**.

## What changed
- **Registration (`caves.ts`).** `CAVE_SOURCES` lists every cave. CA-2's groups build through `groupDef` (their edge-shelf floor, one memo) and draw in their own style (`caveShellOf`). CA-3's join through a data-only `caves/deepCaves.ts` (no simulation import, so no cycle). `caves/authored.ts` no longer imports values from `caves.ts` (the cycle would have put `EXTERIOR` in its dead zone); `assertDisjointFootprints` moved to `caveGeometry.ts` and is re-exported.
- **Region palettes.** The kit's `STYLE_PALETTES` gain lava glass (Rift), brine stone (Divide) and cut masonry (Meridian), applied by region when a source sets no style; Reef, Isles, hub and Canopy/Basin keep their looks.
- **Uphill edges (CA-2's kit change).** `buildCave(..., { edgeRock })`: a 2 m cube may lean on the exterior ground in the pad, so edge rock no longer sinks under the shell's snapped edge; boxes are clipped back to the footprint. On for CA-3, whose terrace and tube walls sank up to **16.9 m** (Meridian culvert north; 7.5 m terrace crack, 4.2 m escarp pocket, 3.5 m fissure window); after it every CA-3 edge is within 0.7 m. CA-2 keeps its tested edge-shelf floor; CA-1 and the hub sink at most 1.4 m and keep their accepted build (limit).
- **World queries (`sim/world.ts`).** Same W1 contract, composed per **cluster** (caves within two bands of each other; 55 caves make 44). A cluster's composite holds its rock, collar columns and the exterior solids round it, and is built on first use or ahead by the streamer, in slices (`buildSpatialIndex` is sliced too); eviction drops it, and a rebuild is identical, so the simulation never depends on streaming. Sight lines touching caves test every exterior solid, then each touched cluster.
  - **Vertical test (CA-2).** A shape over a footprint but wholly above the cave's `topY` is the exterior's: the carrier passes over caves. A fast test pins that every cave's ground and terraces sit at least 0.5 m under `topY`.
  - **Ground read (CA-1).** Outside every footprint `supportHeight` is the exterior's own; the collar's 0.5 m steps no longer stall a walker.
  - **Records.** `world/caves/kitCollision.ts`: rock boxes, collar columns (heights rounded outward to 1/1024 m) and 1 m inside-water bits per cave, built live (Node, the oracle) or decoded from the bake (browser, `setKitCaveRecords`).
- **Bake (`scripts/bake-terrain.mjs`).** One command bakes and verifies terrain and caves: `public/caves/collision.bin` (every record) and one light field per cave, **2.5 MiB** compressed (62.7 MiB raw, mostly light fields). Terrain grows **15.4 → 38.9 MiB** compressed with every cave's shell (fetched per chunk, never all at once). The terrain manifest lists the cave files, so SCHED-1's shared store restores both, checked by sha256. `--verify`: **276/276** files equal the live bytes (220 chunks, the pack, 55 light fields).
- **Streaming (`world/caves/kitStream.ts`, renderer).** Each frame, from the camera and its velocity: clusters within 360 m of the viewer or of where its heading puts it in 12 s are built in 2 ms slices; ready ones past 520 m behind (or 900 m anywhere, or over 220k boxes) are dropped. Light fields are fetched from 260 m and their textures filled from 140 m, 128 KiB of slabs a frame, three ahead (`CaveLighting` keeps four); terrain files are prefetched toward the heading. The cave whose footprint holds the camera is lit (light switches at a network seam).
- **Far layer (`render/farLayer.ts`).** The landmarks 20 m and taller (Rift chimney, spire, gate towers, works, stack yard, masts) as silhouettes with a lamp each, always resident, shown when their chunk is not drawn.
- **Admission (`world/caves/admission.ts`, `app.ts`).** Before each frame steps: a kit cluster in the actor's reach is built now if its records are decoded, else the frame **holds** (clock paused, "Loading cave…"). Cave biomes run LC's `CaveAdmission` (away, waiting, loading, rescue, admitted). **LC-07:** a hold that lasts 12 s without a rescue relocates to the last safe exterior pose (rechecked clear), else to the refuge base (`relocateForCave` in `step.ts`: the craft waits, inventory and vitals untouched). A save load admits during entry, before the first tick, and builds every legacy region owner into retention there too. One `CaveArbiter` now carries the world budget: regions and cave data reserve, the chunk residency is the opportunistic "world" owner (`externalFor`). No biome is placed yet; placing one registers a `BiomeRuntime`.
- **Currents and hazards (CA-3).** `flowHere` (`step.ts`): carved cave water is still; exterior flow is untouched. `sampleHazards` and SYS-1's `hazardsAt` sample `DEEP_CAVE_HAZARDS` by CA-3's rule (the only ecology edit: two additive loops in the samplers).
- **Content conflicts the registration exposed.** Three rescue tethers (`rescue.ts`) dove through cave rock in the composed world: Basin #4 (dish-lee vault), Divide #5 (fissure window), Meridian #4 (window gallery). Each has one bend moved clear; all 71 routes and tethers now sweep clear (medium hull) in the game world.
- **Stray costs fixed on the way.** The scene lights scanned a streamed mesh in one go (35 ms) and placed thousands of thin-instance lights at once (103 ms): both are sliced now. Cave textures thrashed (more caves in range than cache slots: 9,053 uploads in one run; now 17–59). Chunk retention trimmed several chunks' meshes in one frame (50–93 ms); trims are now one per frame. Legacy region owners are built behind the load screen, not on first entry (a 520 ms frame).
- **Unsliced finishes are logged and gated (STR-10).** Every unsliced cluster build goes through one path, `KitCaveStream.finishNow` (cause `query` or `admission`). It is counted (`syncBuilds`), kept in a 32-entry log (`unsliced`) and warned in the browser with the camera position. The traversal gate fails on any such build during travel; ones at load are reported apart. The safety net stays.
- **Pack provenance (STR-13).** The collision pack carries the bake's source hash in its header (`KCP1`). The build carries the expected hash: vite `define`, computed by `scripts/bake-source-hash.mjs`, the same function the bake uses. A manifest or pack from other sources is refused: logged, and the game stays on the live fallback. The terrain store now reads its manifest too. It fetches only the files the bake lists (the heading prefetch had been asking for legacy-only columns: 404s) and refuses a stale manifest (tessellates live). Regression tests cover a stale pack with the same IDs, a stale manifest, a build without a hash, and terrain.
- **A jump during play settles.** A respawn, refuge or rescue teleport built the near world synchronously in one frame: 800–907 ms measured, when the stalled Dart's diver woke at the island workshop. It now settles. The renderer draws dark frames and builds 12 ms a frame until the near world is drawn (at most 5 s), and the app keeps the clock paused meanwhile (`GameRenderer.settling`; an app test pins the pause).
- **Entry waits for its caves (R1 of the review).** A loaded expedition (New, import, Continue) stays on the menu's loading presentation, busy, no HUD and no tick, until its caves are admitted: the pack's records installed, admission clear, or a rescue or the LC-07 refuge applied there. Only then is it shown, or resumed if the request still holds its permission. Cancel withdraws the automatic resume; Resume is refused until admitted. Admission now runs on the frame clock. App-boundary tests: delayed-pack Continue and import (no hold in play, no tick, no pose change), refuge when the pack never lands, cancellation while waiting (`cw1-entry`).
- **Recovery state belongs to its expedition (R2).** The cave runtime's `reset()` clears the remembered safe pose, any running hold and LC admission's loading timer; the app resets it and its notice latch on every accepted New, import or Continue, not on pause. Counters stay lifetime diagnostics. Test: save C replacing B during a hold after save A remembered open water waits its own 12 s and goes to its own refuge.
- **Costs found by R1's frame audit, fixed at the root.** Per-call attribution inside our own code (the frame's slowest light entry, the longest build step's unit, the cave work by sub-part) and an allocation profile (`cw1/alloc.mjs`: V8's sampling heap profiler, collected objects included) named them:
  - **Tessellation:** one cell's error estimate was a single unit of work (a 37.5 ms build step); it now yields per triangle, with identical output (test).
  - **Light placement:** it checked its budget every 64 instances and re-derived every cluster's parameters per instance. It now budgets by lights placed, resumes mid-instance, and skips non-instanced meshes whose bounds are out of every light's reach. A creature field 1.2 km away had been re-placing 1,201 lights a frame for nothing.
  - **Light selection:** it allocated a score object per light and sorted every candidate (1.15 MiB a frame at 5,000 lights). It now keeps the top K in place: 15 KiB and 0.09 ms, from 3.79 ms, with identical choice and order (tested against the old algorithm).
  - **The sim's world queries:** clearance, support and move gather into reusable arrays through an allocation-free `dataInBox`. A step went from 283 to 99 KiB and from 1.58 to 0.51 ms; the remaining top allocator is SIM-1's whole-state `structuredClone`.
  - **Cave light textures:** a field's whole `texImage3D` (65–84 ms in a frame) became an empty allocation filled by `texSubImage3D` z slabs, 128 KiB a frame; a field binds only when complete.
  - **Kit cave cluster builds:** these still allocate about 18 MiB per cluster (18k boxes as objects). That's COL-1 debt (below).
- **Light placement resumes.** One streamed scatter mesh's thousands of thin-instance lights were placed in one go (37–111 ms). Placement now resumes across frames: 64 instances per budget check, no per-instance matrix allocation.
- **Tests.** New `cw1-streaming` (fast, 13), `cw1-caves.heavy` (whole world, sheltered caves, every lane near a cave), `cw1-bake.heavy` (CA-1's bake probe over every cave chunk: borders at all LOD pairs, shells, scatter, codec). Tests that assumed one registered cave, or composed CA-2's groups beside the registry, now use the registry once (CA-2 and CA-3 suites compose the game's own world); CA-3's thickness rule allows edge-clipped boxes; the shelf-race escape reads the masked flow; `regions-art` allows pit-cut coarse chunks up to 3,000 vertices (worst 2,529).

## Traversal (STR-11)
Task-owned headless Chrome, ANGLE GL-EGL, **1920×1080**, the built game (`dist`, baked caves and terrain), ordinary keys only (`docs/build/streams/cw1/traverse.mjs`, one `exclusive` ticket per run).

**Saves are earned, not edited (SAVE-1).** Every segment starts from a library save and first flies from its berth to its first stop, so each one opens with a cold approach at travel speed:
- **Dart tour:** 8 segments from `tour-ready`, the 350 m Dart at its cradle; 25.7 km.
- **Deep caves:** the 800 m Creel from `canopy-over-geared`, for the 15 caves whose mouths lie below the Dart's rating.

**The plan** (`derive.mjs`):
- Every leg is swept against the game world's solids, and keeps the keel a metre over the floor under the hull's whole footprint (`hullFloor`, as the game's movement does).
- A* replans any leg that fails.
- An independent re-sweep of all 10 segments found 0 blocked legs.

**The driver** follows each leg's depth line by horizontal progress.

**Each long gap records:**
- the frame's work by part, with the slowest light entry, the longest build unit and the cave sub-parts;
- V8 GC pauses, from a Chrome trace;
- the renderer and GPU-process main threads' kernel scheduler stats (on CPU, runnable but waiting, faults);
- the camera, with any jump;
- every hold change and HUD notice.

**After R1, 3090, `fd457d3`** (`runs/r1-tour`, `runs/r1-deep`; tables: `node docs/build/streams/cw1/summarize.mjs docs/build/streams/cw1/runs/r1-tour docs/build/streams/cw1/runs/r1-deep`):

| | Result |
|---|---|
| Runs | 8 tour segments and the first deep segment: 393,746 frames, 109 min of travel |
| Holds | **0** |
| Unsliced cave builds in travel | **0** (at load: 0) |
| p50 / p99 frame | 16.7 / 16.8 ms in every run |
| Frames over 34 ms in streaming parts | **18** (gate: 0); before R1, 24 in 56 min |
| Cave stops reached | tour 66 of 67 (Isles surf cave stopped 78 m short); deep: 11 of 15, below |
| Queue context | 8 of the 9 runs were labelled `DISTURBED` (CPU PSI up to 7–80%) despite the exclusive window; segment 6 ran quiet (PSI ≤0.56%) |

**Deep caves, cold approaches.** The Creel's runs flew 1–2 km from the hub at travel speed and reached the Basin buried hut, all eight Divide caves, and the Meridian footing void, window gallery and spire footing: 11 of 15. The Meridian east four (culvert north, escarp pocket, terrace crack, escarp culvert) were not reached, for two reasons:
- **Air:** the Creel's air ran out about 13 minutes into a dive. The HUD notice is "Oxygen exhausted. You recovered at Splitspine workshop" (`runs/r1-deep/*.log`). That is the game's rule, not a hold.
- **Memory:** the later two runs exceeded the `gpu` class's 3 GiB, mostly from the harness's own 5 ms samples.

The recovery teleport ran through the new settle path.

**Attribution of the 18 frames: unresolved** (review R1's correction). What the measurements show:
- **Not GC** (none traced inside them), **not swap** (0 major faults), and not a hold or an unsliced build.
- **Not proportional to the work in them:**
  - selection over 657 lights took 22.5 ms (the allocation profile puts 5,000 at 0.09 ms);
  - a 98.8 ms `lights` frame has no measured sub-part over 3 ms;
  - a frond mesh's 92 lights took 89 ms to place.
- **Off-CPU while JS ran:** in two frames a pure-JS section took 90+ ms while the renderer thread had about 1 ms of CPU and never waited for one.
- **On CPU, no runnable wait:** the other 16 are like this. That fits host steal invisible to the guest (TST-16's per-job steal found 3–8% at such spikes), and it fits work we don't measure. These measurements can't tell them apart.
- **One frame from the quiet run:** 53 ms in the kit cave streamer's step, on CPU, with no build slice long. It may be game work; the next step is to time the streamer's own wanted-list and eviction passes.

**Allocation** (`node docs/build/streams/cw1/alloc.mjs .`: V8's sampling heap profiler, collected objects included, per operation in Node):

| Path | Before R1 | After | Biggest allocators now | Owner |
|---|---|---|---|---|
| Light selection and uniforms, 5,000 lights | 1,153 KiB a frame, 3.79 ms | 15 KiB, 0.09 ms | the chosen lights' faded copies, uniform arrays | ours |
| Simulation step | 283 KiB a tick, 1.58 ms | 99 KiB, 0.51 ms | whole-state `structuredClone` (25 KiB), `stepGame` | the sim's (SIM-1) |
| Kit cave cluster build | 18 MiB a cluster | unchanged | spatial index 34%, collar `Solid` objects 26%, generator frames 20% | ours: COL-1 debt |
| Chunk terrain decode, fine | 638 KiB a chunk | unchanged | `octDecode`, `Math.hypot` | ours (small: a chunk at a time) |

**Before R1, 3090, `cb8ae86`** (`runs/1080p-tour`, `runs/1080p-deep`; saves edited to place the craft): 23 runs, 200,681 frames over 55.6 min, 0 holds, 0 unsliced builds in travel, 24 streaming frames over 34 ms, 50 of 55 caves reached. Review R1 found 22 of those 24 on CPU at PSI ≤1%. The handoff's earlier claim that they were "this machine's, not streaming's" is **retracted**: it was not established.

**RTX 4070 Laptop (alickers, shared desktop host; indicative), before R1 (`cb8ae86`):** segments 1 and 5 (22 caves) and 4 hops, all gate passes, 0 holds, 0 unsliced. Its whole-frame times are GPU-bound at 1080p (p95 33.4 ms), and its CPU (an i9-14900HX) is much faster than this VM's vCPUs, so it is a control for the game's logic, not proof the 3090 frames are the host's.

Screenshots (`docs/build/streams/cw1/shots/`):
- Canopy lantern hall: ![](cw1/shots/s2-02-canopy_lantern_hall.webp)
- Rift kiln tube: ![](cw1/shots/s6-01-rift_kiln_tube.webp)
- Isles storm arch: ![](cw1/shots/s4-01-isles_storm_arch.webp)
- Basin buried hut: ![](cw1/shots/s1-03-basin_buried_hut.webp)
- Divide fissure window (Creel, 427 m): ![](cw1/shots/deep-s3-01-divide_fissure_window.webp)
- Meridian window gallery (Creel, 518 m): ![](cw1/shots/deep-s9-01-meridian_window_gallery.webp)

**Views (TST-08, ART-06, CAV-07; `views.mjs`, `gpu` class, `7967893`, so functional evidence only).** The crown mast line runs at bearing 134° from the island lookout.
- **Surfaced:** the mast lamp reads on the horizon from 400 m (lamp and mast), from the lookout at 765 m (a bright point, with the starting island beside it) and from 1 km (a faint point).
  - ![](cw1/views/s0-05-mast-400m-surface.webp)
  - ![](cw1/views/s0-03-mast-lookout-765m-surface.webp)
  - ![](cw1/views/s0-01-mast-1km-surface.webp)
- **Submerged:** the far layer draws the mast's silhouette (11 landmarks shown) but underwater fog hides it at both 400 m and 1 km; only the lamp dot shows at 400 m (ART-06, below).
  - ![](cw1/views/s0-06-mast-400m-submerged.webp)
  - ![](cw1/views/s0-02-mast-1km-submerged.webp)
- **Network seam (Bellhole crawl into the Archlet, shared edge z = 84):** before the edge, the Archlet beyond is lit as open water; past it, the light switches to the Archlet's (CAV-07, below).
  - ![](cw1/views/s1-02-seam-at-edge.webp)
  - ![](cw1/views/s1-03-seam-archlet-side.webp)

## Checks
After R1 (`src` as at `20679ea`, unchanged to `9c73272`). Run on the second worker (`scripts/alickers-job.sh`, tested SHA recorded) except the build, the bake and the perf rerun:
- **Fast tier:** 1,418/1,418 at `20679ea`, including `cw1-entry` (R1 and R2) and `cw1-slicing` (tessellation, selection, box query).
- **Economy:** the five root-merge economy checks pass at `4a16985`, after the root merge with SCHED-2b and SAVE-1.
- **Heavy tier:** 63 of 64 files, 469 tests, at `20679ea`. The one failure is CA-3's `caves-deep-perf` timing bound: a diver step in the deep caves at 455 µs against 400 µs, with three files running at once on the shared host.
  - Alone, it passes: 377–390 µs on alickers; 378–380 µs on factory-worker.
  - The commit before R1 (`e935e4f`) measures 404 µs alone on factory-worker. So the bound was already exceeded before R1's changes, and they made the step slightly faster.
  - For CA-3: the bound is tight on both machines.
- **Playthrough:** at `9c73272`, all eight scenarios complete (creel, carrier, creel-loss, reverse, no-optional, low-air, tour, over-geared), with no blockers.
- **Build:** `npm run build` passes on factory-worker.
- **Provenance:** the build carries the bake's source hash `0f5f2f1ef45d…`, equal to the bake's.
- **Bake:** `bake-terrain --verify` at `fd457d3`: **276/276** files equal the live bytes (220 chunks, 1 collision pack, 55 light fields).
  - `public/caves/collision.bin`: **1,570,443 bytes** compressed (8,238,891 raw).
  - The caves total 2.46 MiB compressed; terrain is 38.91 MiB.

## Adverse cases
- **Resting in a sheltered cave (CA-3 R1).** A diver idle 15 s in the crest hollow shelter at cycle 40 s, and in the lintel galleries: moved under 0.6 m, health 100, brine 0. Unmasked control: carried over 2 m (`cw1-caves.heavy`).
- **A cave that cannot load.** Records missing: held, then admitted the frame they land. Never clearing: relocated to the remembered open water at 12 s, or the refuge if that is no longer clear. A biome reload below its budget: paused, rescued at 4 s; with no verified rescue, the refuge at 12 s (`cw1-streaming`).

## Compromises (each with its root fix and cost)
- **Clean 3090 frame-time evidence: missing.**
  - **What happened:** see *Traversal*. The attribution is unresolved. Contention outside the lane still labelled 8 of 9 runs `DISTURBED` inside the window, and the remaining spikes are not proportional to the work in them.
  - **Root fix:** TST-16's static priority slice (so local work can't contend with an exclusive run) and per-job steal on every long frame. Then rerun the 8 segments with this harness, about 2 h. A spike that is still on CPU with no steal and no contention is game work: the per-call attribution names its part.
  - **Also for SCHED:** a quiet run (load ≤2.65, PSI ≤0.54%) was still labelled `DISTURBED`.
- **Kit collision as boxes: COL-1 debt.**
  - **What happened:** the composites hold up to 149k boxes as objects, about 650k small objects in total, so the JS heap runs at 228–352 MiB, and a cluster build allocates about 18 MiB (18k boxes; `cw1/alloc.mjs`).
  - **Uphill edges:** CA-1 and hub caves sink at most 1.4 m and keep their accepted build. CA-2 keeps its edge-shelf floor. `rift_kiln_tube` and `meridian_culvert_north` keep their sunk edges, because edge rock broke their content and retreat.
  - **Root fix:** COL-1's unified triangle collider with compact typed storage (M/L). Art is not reshaped to fit boxes.
- **One active cave light field (CAV-07).**
  - **What happened:** at a network seam the next cave draws as open water until the camera crosses, then the light switches (seam shots).
  - **Root fix:** portal-aware lookup over several fields in the material (ATM-2, M/L).
- **The far layer is lost in underwater fog (ART-06).**
  - **What happened:** the silhouettes draw beyond the chunk band, but submerged at 400 m and 1 km the fog hides them.
  - **Root fix:** separate landmark and beacon visibility from near fog (ATM-2, M).
- **The island lookout is not built yet.**
  - **What happened:** the "lookout" shots are taken from its planned coordinate (`ISLAND_LOOKOUT`) at the surface, not from a standing point on land. Pending OP-1.
- **Coverage by keyboard driver.**
  - **What happened:** after R1's planner (keel rule, transits from the berth) and driver (depth along the leg) fixes, the tour reached 66 of 67 stops; the Isles surf cave stopped 78 m short. In the deep caves, the Creel's air (about 13 minutes at depth) ended the Meridian leg before its east four.
  - **Root fix:**
    - route the driver along each cave's authored approach route, not a computed outer point (S);
    - plan deep segments within the craft's air budget, from an earned save nearer the Meridian (S).
- **Bake size.**
  - **What happened:** terrain grows 15.4 → 38.9 MiB compressed with every cave's shell, plus 2.46 MiB of caves. Both are fetched per chunk and per cave, never all at once.
  - **Root fix:** shells as per-cave assets shared across LODs (S/M) if download size matters.

## Missing evidence
- **3090 1080p frame times:** clean `exclusive` frame times with no `DISTURBED` label, and a resolved attribution of the remaining streaming frames (above).
- **Mouth visits:** the Isles surf cave, not reached by driving.
- **Deep caves, cold approaches:** the Meridian east four (culvert north, escarp pocket, terrace crack, escarp culvert). The other 11 were reached cold at travel speed.
- **Exact candidate:** no 3090 run of `9c73272` itself; the runs were at `fd457d3`. Every change since is to the harness (`traverse.mjs`, notices and holds logging).
- **Lookout:** a lookout shot from the built lookout.
