# CW-1: every authored cave in the game, streamed without pauses (handoff)

Opus 5.5 high. Branch `t3/enable-authored-cave-streaming`, from root `3650e6b`; root merged at `c649b11` (CA-3, CB-2, POI-1), `0a4539d` (TT-1), `ba7d5fa` (SCHED-1, the shared terrain store) and `a536775` (SCHED-2a, CR-1, UX-1). Code: **`e935e4f`** (the traversal ran on `cb8ae86`; `src` differs from it only by the root merge).

## Outcome
All **55** authored small and medium caves are in the real game: the Fanvault and W2's four hub caves, CA-1's 18 Reef and Isles caves, CA-2's 12 Canopy and Basin groups, and CA-3's 20 Rift, Divide and Meridian sources. The browser never generates a cave: collision and light are baked, streamed ahead by proximity and heading, built in time slices and evicted behind and far first. At 1920×1080 on the RTX 3090, 56 minutes of driving across all seven regions (an 8-segment Dart tour plus 15 deep hops in the 800 m Creel) **never held and never built a cave unsliced**. The frame-time gate is **not proven on the 3090**: 24 frames went over 34 ms in streaming parts, most of them in runs the queue labelled `DISTURBED`. The evidence says these frames are this machine's, not streaming's (*Traversal*). The RTX 4070 control passes with no streaming frame over 34 ms. Clean 3090 frame-time evidence is listed as **missing**.

## What changed
- **Registration (`caves.ts`).** `CAVE_SOURCES` lists every cave. CA-2's groups build through `groupDef` (their edge-shelf floor, one memo) and draw in their own style (`caveShellOf`). CA-3's join through a data-only `caves/deepCaves.ts` (no simulation import, so no cycle). `caves/authored.ts` no longer imports values from `caves.ts` (the cycle would have put `EXTERIOR` in its dead zone); `assertDisjointFootprints` moved to `caveGeometry.ts` and is re-exported.
- **Region palettes.** The kit's `STYLE_PALETTES` gain lava glass (Rift), brine stone (Divide) and cut masonry (Meridian), applied by region when a source sets no style; Reef, Isles, hub and Canopy/Basin keep their looks.
- **Uphill edges (CA-2's kit change).** `buildCave(..., { edgeRock })`: a 2 m cube may lean on the exterior ground in the pad, so edge rock no longer sinks under the shell's snapped edge; boxes are clipped back to the footprint. On for CA-3, whose terrace and tube walls sank up to **16.9 m** (Meridian culvert north; 7.5 m terrace crack, 4.2 m escarp pocket, 3.5 m fissure window); after it every CA-3 edge is within 0.7 m. CA-2 keeps its tested edge-shelf floor; CA-1 and the hub sink at most 1.4 m and keep their accepted build (limit).
- **World queries (`sim/world.ts`).** Same W1 contract, composed per **cluster** (caves within two bands of each other; 55 caves make 44). A cluster's composite holds its rock, collar columns and the exterior solids round it, and is built on first use or ahead by the streamer, in slices (`buildSpatialIndex` is sliced too); eviction drops it, and a rebuild is identical, so the simulation never depends on streaming. Sight lines touching caves test every exterior solid, then each touched cluster.
  - **Vertical test (CA-2).** A shape over a footprint but wholly above the cave's `topY` is the exterior's: the carrier passes over caves. A fast test pins that every cave's ground and terraces sit at least 0.5 m under `topY`.
  - **Ground read (CA-1).** Outside every footprint `supportHeight` is the exterior's own; the collar's 0.5 m steps no longer stall a walker.
  - **Records.** `world/caves/kitCollision.ts`: rock boxes, collar columns (heights rounded outward to 1/1024 m) and 1 m inside-water bits per cave, built live (Node, the oracle) or decoded from the bake (browser, `setKitCaveRecords`).
- **Bake (`scripts/bake-terrain.mjs`).** One command bakes and verifies terrain and caves: `public/caves/collision.bin` (every record) and one light field per cave, **2.5 MiB** compressed (62.7 MiB raw, mostly light fields). Terrain grows **15.4 → 38.9 MiB** compressed with every cave's shell (fetched per chunk, never all at once). The terrain manifest lists the cave files, so SCHED-1's shared store restores both, checked by sha256. `--verify`: **276/276** files equal the live bytes (220 chunks, the pack, 55 light fields).
- **Streaming (`world/caves/kitStream.ts`, renderer).** Each frame, from the camera and its velocity: clusters within 360 m of the viewer or of where its heading puts it in 12 s are built in 2 ms slices; ready ones past 520 m behind (or 900 m anywhere, or over 220k boxes) are dropped. Light fields are fetched from 260 m and their textures made from 140 m, one per frame, three ahead (`CaveLighting` keeps four); terrain files are prefetched toward the heading. The cave whose footprint holds the camera is lit (light switches at a network seam).
- **Far layer (`render/farLayer.ts`).** The landmarks 20 m and taller (Rift chimney, spire, gate towers, works, stack yard, masts) as silhouettes with a lamp each, always resident, shown when their chunk is not drawn.
- **Admission (`world/caves/admission.ts`, `app.ts`).** Before each frame steps: a kit cluster in the actor's reach is built now if its records are decoded, else the frame **holds** (clock paused, "Loading cave…"). Cave biomes run LC's `CaveAdmission` (away, waiting, loading, rescue, admitted). **LC-07:** a hold that lasts 12 s without a rescue relocates to the last safe exterior pose (rechecked clear), else to the refuge base (`relocateForCave` in `step.ts`: the craft waits, inventory and vitals untouched). A save load admits during entry, before the first tick, and builds every legacy region owner into retention there too. One `CaveArbiter` now carries the world budget: regions and cave data reserve, the chunk residency is the opportunistic "world" owner (`externalFor`). No biome is placed yet; placing one registers a `BiomeRuntime`.
- **Currents and hazards (CA-3).** `flowHere` (`step.ts`): carved cave water is still; exterior flow is untouched. `sampleHazards` and SYS-1's `hazardsAt` sample `DEEP_CAVE_HAZARDS` by CA-3's rule (the only ecology edit: two additive loops in the samplers).
- **Content conflicts the registration exposed.** Three rescue tethers (`rescue.ts`) dove through cave rock in the composed world: Basin #4 (dish-lee vault), Divide #5 (fissure window), Meridian #4 (window gallery). Each has one bend moved clear; all 71 routes and tethers now sweep clear (medium hull) in the game world.
- **Stray costs fixed on the way.** The scene lights scanned a streamed mesh in one go (35 ms) and placed thousands of thin-instance lights at once (103 ms): both are sliced now. Cave textures thrashed (more caves in range than cache slots: 9,053 uploads in one run; now 17–59). Chunk retention trimmed several chunks' meshes in one frame (50–93 ms); trims are now one per frame. Legacy region owners are built behind the load screen, not on first entry (a 520 ms frame).
- **Unsliced finishes are logged and gated (STR-10).** Every unsliced cluster build goes through one path, `KitCaveStream.finishNow` (cause `query` or `admission`). It is counted (`syncBuilds`), kept in a 32-entry log (`unsliced`) and warned in the browser with the camera position. The traversal gate fails on any such build during travel; ones at load are reported apart. The safety net stays.
- **Pack provenance (STR-13).** The collision pack carries the bake's source hash in its header (`KCP1`). The build carries the expected hash: vite `define`, computed by `scripts/bake-source-hash.mjs`, the same function the bake uses. A manifest or pack from other sources is refused: logged, and the game stays on the live fallback. The terrain store now reads its manifest too. It fetches only the files the bake lists (the heading prefetch had been asking for legacy-only columns: 404s) and refuses a stale manifest (tessellates live). Regression tests cover a stale pack with the same IDs, a stale manifest, a build without a hash, and terrain.
- **A jump during play settles.** A respawn, refuge or rescue teleport built the near world synchronously in one frame: 800–907 ms measured, when the stalled Dart's diver woke at the island workshop. It now settles. The renderer draws dark frames and builds 12 ms a frame until the near world is drawn (at most 5 s), and the app keeps the clock paused meanwhile (`GameRenderer.settling`; an app test pins the pause).
- **Light placement resumes.** One streamed scatter mesh's thousands of thin-instance lights were placed in one go (37–111 ms). Placement now resumes across frames: 64 instances per budget check, no per-instance matrix allocation.
- **Tests.** New `cw1-streaming` (fast, 13), `cw1-caves.heavy` (whole world, sheltered caves, every lane near a cave), `cw1-bake.heavy` (CA-1's bake probe over every cave chunk: borders at all LOD pairs, shells, scatter, codec). Tests that assumed one registered cave, or composed CA-2's groups beside the registry, now use the registry once (CA-2 and CA-3 suites compose the game's own world); CA-3's thickness rule allows edge-clipped boxes; the shelf-race escape reads the masked flow; `regions-art` allows pit-cut coarse chunks up to 3,000 vertices (worst 2,529).

## Traversal (STR-11)
Task-owned headless Chrome, ANGLE GL-EGL, **1920×1080**, the built game (`dist`, baked caves and terrain), saves derived from the playthrough's real late state, ordinary keys only (`docs/build/streams/cw1/traverse.mjs`, one `exclusive` ticket per run). The plan (`derive.mjs`) visits every cave mouth:
- **Tour:** 8 Dart segments, 25 km.
- **Deep caves:** the 15 caves whose mouths lie below the Dart's 350 m are run as hops in the 800 m Creel, from the divide phase's state.
- **Legs:** planned by A* over Dart-clear cells with every link swept against the game world's solids.

Every frame records its own work by part (simulation, chunks, caves, regions, lights, render, light selection and placement). Every long gap also records:
- the camera, and any camera jump;
- V8 GC pauses, from a Chrome trace;
- the renderer main thread's kernel scheduler stats (on CPU, runnable but waiting, faults) and the GPU process's.

**Summary, 3090, `cb8ae86`** (23 runs, 200,681 frames, 55.6 min of travel; per-run tables: `node docs/build/streams/cw1/summarize.mjs docs/build/streams/cw1/runs/1080p-tour docs/build/streams/cw1/runs/1080p-deep`):

| | Result |
|---|---|
| Holds | **0** |
| Unsliced cave builds in travel | **0** (one at load in most runs: the start cluster, admitted before the first tick) |
| p50 / p99 frame | 16.7 / 16.8 ms in every run |
| Frames over 34 ms in streaming parts | **24** (gate: 0) |
| Caves reached by driving | 50 of 55; the Fanvault is the start; Canopy fin cleft and east crown (16–17 m short), Isles surf cave (82 m) and scar crawl (176 m) not reached |
| Cold start | title 5.0 s; playable 6.8–8.6 s (24.5 s from the pod start); collision pack ready 4.0–4.9 s |
| Memory | chunks ≤75.3 MiB CPU / 57.7 MiB GPU of the 256 MiB budget; regions 12.7 MiB; collision boxes ≤148,906 (cap 220k); JS heap 228–352 MiB |

**Why the 24 frames are not attributed to streaming:**
- **Not streaming work.** In every one, a part that normally costs under 1 ms (light selection on the same 3–5k lights, the cave view, chunk residency) took 40–120 ms with its own work counters flat: no build, no upload, no new lights.
- **Not GC.** The Chrome trace's longest GC pause was 16.4 ms, and only one long frame contains a collection.
- **Contention, mostly.** Six of the eight tour runs were labelled `DISTURBED` (CPU PSI up to 27–39%, load up to 12).
- **Even the quiet runs look like the machine.** By the kernel's own count, the thread in pure-JS sections was either "on CPU" for the whole gap (11 frames) or off it without waiting for a CPU (11 frames). Light selection cannot block, and cannot run hundreds of times slower on CPU. Both look like the vCPU being descheduled underneath the guest.
- **The control is clean.** The same segments on the RTX 4070 (alickers, a different machine) had no streaming frame over 34 ms (`runs/rtx4070-tour`, `runs/rtx4070`).

**RTX 4070 Laptop (alickers, shared desktop host; indicative):** segments 1 and 5 (22 caves) and 4 hops (one per region), all gate passes, 0 holds, 0 unsliced. Its whole-frame times are GPU-bound at 1080p (p95 33.4 ms).

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
All at code `e935e4f` (root merged), on the second worker (`scripts/alickers-job.sh`, tested SHA recorded) except the build and bake:
- **Fast tier:** 1,372/1,372.
- **Economy:** the five root-merge economy checks pass (campaign, M1, M2-A, M2-B1, progression curve).
- **Heavy tier:** 63/63 files, 466 tests, including `cw1-caves`, `cw1-bake`, `cave-light`, `cave-light-retreat` and the CA-1, CA-2 and CA-3 cave suites.
- **Playthrough:** all five scenarios reach the ending (creel 201.8, carrier 363.4, creel-loss 209.8, reverse 207.0, no-optional 201.0 in-game minutes); no blockers; every milestone reload matches.
- **Build:** `npm run build` passes on factory-worker.
- **Provenance:** the build carries the bake's source hash, and the bake is current for `e935e4f` (hash equal).
- **Bake:** `bake-terrain --verify`: **276/276** files equal the live bytes (220 chunks, 1 collision pack, 55 light fields).
  - `public/caves/collision.bin`: **1,570,441 bytes** compressed (8,238,891 raw).
  - The caves total 2.46 MiB compressed; terrain is 38.91 MiB.

## Adverse cases
- **Resting in a sheltered cave (CA-3 R1).** A diver idle 15 s in the crest hollow shelter at cycle 40 s, and in the lintel galleries: moved under 0.6 m, health 100, brine 0. Unmasked control: carried over 2 m (`cw1-caves.heavy`).
- **A cave that cannot load.** Records missing: held, then admitted the frame they land. Never clearing: relocated to the remembered open water at 12 s, or the refuge if that is no longer clear. A biome reload below its budget: paused, rescued at 4 s; with no verified rescue, the refuge at 12 s (`cw1-streaming`).

## Compromises (each with its root fix and cost)
- **Clean 3090 frame-time evidence: missing.**
  - **What happened:** see *Traversal*. Light work outside the queue keeps running beside `exclusive` jobs (TST-16), and the quiet runs still lose wall time in pure-JS sections in a way that looks host-level.
  - **Root fix:** clamp light work during exclusive runs (TST-16, SCHED-2b), then rerun the 8 segments with this harness (about 1 h). If quiet runs still stall, check vCPU scheduling on the host (pinning, steal reporting; fleet).
  - **Also for SCHED:** a quiet run (load ≤2.65, PSI ≤0.54%) was still labelled `DISTURBED`.
- **Kit collision as boxes: COL-1 debt.**
  - **What happened:** the composites hold up to 149k boxes as objects, about 650k small objects in total, so the JS heap runs at 228–352 MiB.
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
  - **What happened:** 4 caves were not reached within tolerance, though each was passed within streaming range and built. Canopy fin cleft and east crown stopped 16–17 m short. Isles surf cave and scar crawl were 82 m and 176 m short; the tour's last segment spent its time recovering in the Isles' shallows.
  - **Root fix:** route the driver along each cave's authored approach route, not a computed outer point (S).
- **Bake size.**
  - **What happened:** terrain grows 15.4 → 38.9 MiB compressed with every cave's shell, plus 2.46 MiB of caves. Both are fetched per chunk and per cave, never all at once.
  - **Root fix:** shells as per-cave assets shared across LODs (S/M) if download size matters.

## Missing evidence
- **3090 1080p frame times:** clean `exclusive` frame times with no `DISTURBED` label (above).
- **Mouth visits:** the four mouths above, not reached by driving.
- **Lookout:** a lookout shot from the built lookout.
