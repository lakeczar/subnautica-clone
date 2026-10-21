# LC: large-cave technology (handoff)

Opus 5.5, branch `t3/large-cave-biome-lab`, rebased on `feat/siltwake-first-expedition` after C3's integration (`b9246bc`). New files only: `src/content/caves/*`, `src/world/caves/large/*`, `src/render/caves/large/*`, `tools/large-cave-lab.*`, `tests/large-cave*`. No shared root, save or `package.json` edit. Source SHA: see the commit that adds this page.

## The choice: one mesh is the art and the collision
- **Authoring.** `LargeCaveSource` is hand-placed data. Chambers, spline tunnels and shafts carve water; root pillars and fallen blocks add rock back; collars mark the openings; zones, portals, life, sockets and routes are all named. Procedural detail is only wall noise. The Canopy root caves live in `canopyRootCaves.ts`.
- **Field.** `field.ts` compiles the source into a continuous signed-distance estimate: the seabed, smoothly unioned carves, and added rock. Primitives are culled through an 8 m grid.
  - An *evaluation* box is wide enough that culling never steps the field near a surface; a test pins this.
  - A *core* box bounds where a surface can be; sampling skips everything else, and a test pins that skipping changes no vertex.
- **Meshing.** `mesh.ts` runs surface nets per 32 m chunk on a 0.5 m lattice, with a small apron so chunks build alone and their seams match bit for bit. Vertices are snapped to 1/1024 m. Coarse LOD samples every second node at the *most open* of 27 fine values, so coarse water contains fine water: coarse walls sit 0.5–0.9 m behind the collision and a tunnel never closes.
- **Collision.** `collision.ts` and `compose.ts` use the fine mesh itself as the collision mesh, with a BVH per chunk.
  - **Sweeps.** Swept actor boxes are tested against triangles on all 13 separating axes, with a 4 mm skin. A box that starts in contact is blocked only while closing.
  - **Slides** clip against every contact plane, then run along a crease.
  - **Containment** uses vertical-ray parity to the owned top.
  - **Sight and support** use rays against the same triangles.
- **Agreement.** Art and collision are the same Float32 triangles: **0 m** apart at fine, and the bake decodes to the same bits.

**Why not W1's boxes at scale (option A).** Same field and chunks, measured on the 45 chunks along the craft loop (`voxelBoxes.ts`, [`lc/compare.txt`](lc/compare.txt)):

| | A: voxel boxes + `createWorldQueries` | B: triangle BVH (chosen) |
| --- | --- | --- |
| Size | 22.4k boxes, ~1 MiB | 312k triangles, 12.6 MiB |
| Build (same host and run) | 53 s | 16 s |
| Creel step / diver step | 56 µs / 21 µs | 4.8 µs / 1.9 µs |
| Creel sliding along the hall wall at 15° (of 58 m requested) | 11.6 m: snags on the staircase | 38.8 m |
| Diver, same | 36.7 m | 44.7 m |
| Art vs collision | staircase vs smooth shell (W1 clamps it to 0.35 m) | identical |

Boxes cost less memory, but fixed-axis actor boxes catch on every voxel step of a curved wall. For a craft in a 250 m cave that is the dominant feel problem.

## Measurements (RTX 3090, ANGLE GL-EGL, headless 1600×900; `tools/large-cave-lab.gpu.mjs`)
Final pass on the rebased code (C3's production exterior, 5,406 world solids). Every run drives the lab's real input path at boost with real collision. "Coverage" is the adverse-case invariant, checked every frame.

| Run | Frame p50 / p95 / p99 | GPU | Render CPU p95 | Step (move, support, hull floor) | Coverage misses |
| --- | --- | --- | --- | --- | --- |
| Dart, craft loop, hollow to Scarp mouth, 11 m/s | 16.7 / 16.8 / 17.6 ms | 4.0 ms | 0.6 ms | 59 µs (max 0.7 ms) | 0 / 1,361 |
| Dart, west loop through the gallery, 11 m/s | 16.7 / 16.8 / 16.9 ms | 4.3 ms | 0.4 ms | 51 µs | 0 / 1,303 |
| Creel, craft loop, 6.5 m/s | 16.7 / 16.8 / 17.3 ms | 4.1 ms | 0.7 ms | 61 µs | 0 / 2,298 |
| Diver, squeeze, 5.2 m/s | 16.7 / 16.8 / 16.9 ms | 4.4 ms | 0.4 ms | 41 µs | 0 / 832 |
| Dart, pool drop at overdrive, 16 m/s | 16.7 / 16.9 / 18.7 ms | 3.8 ms | 0.4 ms | 83 µs | 0 / 258 |
| **Ordinary control:** real key holds and mouse drags, hollow to Scarp mouth | 16.7 / 16.9 / 17.3 ms | 3.3 ms | 0.6 ms | 76 µs (max 1.5 ms) | 0 / 1,612 (14 of 14 waypoints, 27 s) |

- **Frame time.** Frames are vsync-capped at 60 Hz, and the GPU has 4× headroom. The worst single frames were 19–37 ms.
- **A regression found and fixed while measuring.** Composed with the production world, a step first cost 300–800 µs, because the composer scanned all 5,406 exterior solids. It now uses the shared 32 m index. A fast test guards a diver move at under 150 µs; it measures about 2.5 µs.
- **Lamp-window rebuild:** p95 1.6–1.9 ms per frame, time-sliced.
- **Residency update:** p95 0.3–0.8 ms.
- **Collision query cost per step** (no rendering; [`lc/compare.txt`](lc/compare.txt)): about 5–7 µs for a Creel move and 2–3 µs for a diver move. The lab's step adds support reads and the hull floor.
- **Resident bytes:**
  - collision 20.8 MB;
  - lamp occupancy 2.9 MB (CPU) and a 2 MB window texture;
  - art for all 90 chunks: 17–18.5 MB on the GPU, the same plus Babylon's copies on the CPU;
  - S1 accounted total about 41 MB of the 256 MiB budget.
- **Bake:** 90 chunks; 397k fine, 103k coarse and 4.6k life triangles. 13.0 MB raw, **6.2 MB zlib**. Building from source takes about 1 min offline. `--verify` reports 0 collider mismatches between bake and live.
- **Cold entry,** from page load to control (the Dart held at the hollow until its zone and touched chunks are drawn fine): **3.2 s**, made up of:
  - fetch 0.08 s;
  - decoding and indexing every collider 0.8 s;
  - recompiling the field and surface-chunk list 1.0 s (a baked map would drop this);
  - shaders and residency to readiness about 1.3 s.

## Streaming and light
- **Streaming** (`streaming.ts`). The cave's chunks form their own S1 `WorldLayout`: 32 m columns, one layer per occupied slab. A second `createResidency` runs over it under the shared budget (`setExternalBytes` both ways).
  - **Pins.** `CavePins` wraps `chunksWithin`. Within 160 m of the domain every chunk is wanted at least coarse (the *coarse floor*), and the chunks of the viewer's zone plus every zone one portal away are wanted fine.
  - **Invariant.** `coverageProblems` states the adverse case: a moving box touches only chunks drawn fine, and every chunk of its zone is drawn.
  - **Collision** is outside residency. It is loaded with the cave (from the bake) and never unloads with art.
- **Light** (`light.ts`, `caveShader.ts`) extends W1 to a biome by baking light per vertex, so nothing samples across rock or chunks:
  - **Daylight** is the shortest path through water from exterior water, weighted by each zone's falloff (1 m grid, 26-neighbour Dijkstra).
  - **Glow** is a bounded path from each life group's emitters.
  - **The lamp** is W1's exact unfiltered voxel walk with the pinned skin, over a 64 m R8 window of the fine node signs round the player. It is rebuilt time-sliced every 8 m.
  - **Fog.** The medium darkens with each fragment's own daylight, so exits glow from inside. The zone tints the fog.

## One world-query interface for every cave
`CaveCollider` (`compose.ts`) is what a cave answers for: sweep, blocked, segment, support, `masksGround` and `ownsPoint`. `composeCaveWorld({ exterior, solids, floor, caves })` wraps the original exterior world:
- **Per-sub-sweep ownership**, slides included, in sub-sweeps of 0.5 m.
- **Every exterior solid kept**, swept as a box in cave sub-sweeps and tested in sight lines.
- **The exterior floor** sampled along sight lines wherever no cave owns the point.
- **Legacy guards intact:** a query that touches no cave *is* the exterior world's.

Both kinds of cave implement it:
- `largeCaveCollider` for biomes;
- `boxCaveCollider` for the W1 kit (its rock boxes plus collar columns, as in `sim/caveWorld.ts`).

`tests/large-cave-shared.test.ts` runs W1's straddle and fuzz regressions through the composer and checks legacy equality away from caves. It also puts the Fanvault and a cave biome in one world.

## Placement: CB's Lantern Rootways is the site of record
The content bible (accepted after this brief) places the Canopy cave biome as **Lantern Rootways** (`canopy_rootways`, X 880–1100, Z −300 to −70, 150–222 m deep). The LC blockout is a **sandbox** immediately west of it (X 624–880, Z −224 to −32, 85–187 m). CB puts three small caves inside that sandbox: `canopy_knot_hollow`, `canopy_quiet_crawl` and `canopy_bladder_pocket`. **Do not place both.** Building Lantern Rootways is a content task: a new `LargeCaveSource` at CB's site on these modules, guarded by the same content tests (ownership, portals, routes, continuity). The zones map directly:

| LC sandbox | CB Lantern Rootways |
| --- | --- |
| Crown hollow (craft) | Crown mouth (front) |
| Root hall | Root nave |
| Collapsed gallery and squeeze | Weaver galleries |
| Hub | Knot warren (den with a second way round) |
| Deep pool | Salt-sweat hollow |
| Knoll crawl | Back stair (diver) |
| Scarp mouth | Escarpment exit |

## Integration after C3
1. **World queries (`sim/world.ts`; C4 is wiring the W1 kit now).**
   - Wire caves through `CaveCollider` and `composeCaveWorld`: exterior = `createWorldQueries()` (since C3, the whole envelope and the one physical floor), plus `boxCaveCollider` per kit cave and `largeCaveCollider` per biome. If C4 keeps W1's adapter, give it the `CaveCollider` interface, so a biome drops in as one more collider.
   - Load each biome's collision from its bake when the world is created (21 MiB each, below).
   - Port `tests/large-cave-shared.test.ts` and `tests/cave-world.test.ts` to the wired world.
2. **`step.ts` and `hullFloor`.** `groundHeight(x, z)` has no Y. Over a biome's deep part it is the seabed *above* the cave, so:
   - `hullFloor` must read support under the keel (`hullFloorFromSupport`);
   - the swim cliff guard must read `supportHeight`.

   The lab runs both that way. Collars mask `groundHeight` as W1 does.
3. **Bake.**
   - Add `tools/large-cave-lab.bake.mjs`'s pipeline to the build (`public/caves/<id>.bin.z`, source-hashed, with `--verify` requiring bit-equal colliders).
   - Store the surface-chunk list and zone map in the bake. Today the lab recomputes them (`createLargeCave`, about 1.0–1.3 s of cold entry).
   - Generalise the terrain bake's `hole` to `holes[]` for collars, and draw the heightfield with `seabedColor` so the collar seam disappears.
4. **Renderer.**
   - Keep `createLargeCaveMaterial` as a separate material. Exterior meshes have no `caveLight` attribute, and a missing attribute reads zero: black.
   - Add it to `updateOpticalUniforms`; call `LampWindow.update` and `apply` each frame with the player's head, view and zone tint.
   - Run a second residency over `caveWorldMap` with `CavePins`, and count cave bytes in `setExternalBytes` both ways. Include `coverageProblems` in readiness near a cave (the lab holds control until it is empty).
5. **Persisted state:** none. A cave's IDs are stable; the lamp flag is W1's proposal.

## Checks
- **Fast tier:** `npm run test:fast` passes **1,096/1,096** (106 files) on the rebased branch, before the composer index fix. The 25 large-cave tests also pass after it:
  - `tests/large-cave.test.ts` (fixture biome):
    - ownership and its negative control;
    - chunk-seam closure;
    - brick skipping changes no vertex;
    - art = collision, plus independent dense field probes within 0.35 m;
    - coarse never crosses a route and stays in fine rock;
    - walls, roof and floor at 2–60 m/s, with no tunnelling on a 40 m step;
    - grazing and crease slides; a craft cannot enter the squeeze;
    - collar straddles in both owners;
    - sight blocked through a pillar, a wall and the roof; support from below;
    - daylight, glow and lamp never cross rock;
    - bake round trip.
  - `tests/large-cave-canopy.test.ts`:
    - ownership;
    - field continuity (the test that caught a culling step);
    - exhaustive sampling;
    - every portal open and admitting exactly its profiles;
    - every route's profile box in water;
    - real sweeps along each diver spur against the production exterior.
  - `tests/large-cave-streaming.test.ts`: the layout, the pins, and the adverse case with its control.
  - `tests/large-cave-shared.test.ts`: the W1 Fanvault through the composer.
- **Heavy tier:** `scripts/heavy-check.sh … large-cave.heavy.test.js` passes 4/4 at a 412 MiB peak:
  - every craft route with its admitted hull, against the production world;
  - coarse vs every route;
  - 40,000 probes round all routes, 0 disagreeing;
  - the bake round trip on all chunks;
  - a NullEngine residency that builds, shows, evicts and disposes all chunk art while collision answers stay identical.
- **Build:** `npm run build` OK. `tsc -p tools/large-cave-lab.tsconfig.json` is clean.
- **GPU:** `scripts/heavy-check.sh --deadline 2400 node tools/large-cave-lab.gpu.mjs <port> <out> all` on a task-owned Chrome (ANGLE GL-EGL, RTX 3090) reports `ok`, with no page or GL errors.

## Adverse case: a fast craft while chunks construct
- **Fast test.** `tests/large-cave-streaming.test.ts` drives a Dart along a 2,600-frame tour (hollow, hall, hub, pool and back, west loop) at 11 and 16 m/s from a cold start, with builds and uploads costing simulated time and a 32 MiB share. It never touches a chunk not drawn fine and never sees an undrawn chunk of its zone.
- **Control.** On tighter bands (fine 32 m, coarse 96 m) and the same budget, distance alone fails: 412 uncovered frames, the first a Root hall chunk on entering the hollow. With pins, the same tight bands hold.
- **Browser.** The lab checks the same invariant every frame.

## Screenshots (RTX 3090)
| | |
|---|---|
| ![](lc/01-approach.png) Crown hollow from the shelf | ![](lc/02-hollow.png) Down the hollow: daylight fades along the path |
| ![](lc/03-hall.png) Root hall, lamp on: amber root tips stain the roof | ![](lc/hall-lamp-off.png) Root hall, lamp off |
| ![](lc/05-garden.png) Glow garden: glow lights the rock through water only | ![](lc/07-hub.png) Hub: the great root; the Scarp mouth glows on the left |
| ![](lc/04-gallery.png) Collapsed gallery: a fallen block in the lamp | ![](lc/08-pool.png) Deep pool, about 187 m |
| ![](lc/09-scarp.png) Scarp mouth from the lower terrace | ![](lc/11-overview.png) Plan (seabed hidden): hall, east run, hub, low run, garden, gallery, pool, crawl |

## Limits
- **Collision memory.** It is about 20× W1's boxes per metre of cave: 21 MiB resident for this biome. Per-chunk `Uint16` indices and a decimated band would roughly halve it.
- **Build cost.** A biome builds offline in about a minute. A live build in the browser is lab-only (`?live=1`).
- **Fixed-axis proxies.** Actors keep the world's square boxes, so a diagonal passage needs up to √2 more width. The gallery is 15 m with a 12 m lane for that reason.
- **Light is static per vertex.** Only the player's lamp lights rock dynamically. Life is placeholder geometry, and finds are proposals, not registry items.
- **The lab is not the game.** Its exterior seabed is a 1 m stand-in mesh, so hairline seams show at collar edges. Frame numbers are vsync-capped at 60 Hz in headless Chrome at 1600×900, not representative 1080p play.
- **Placement is a proposal.** The location and depths are in the source's `proposal`. The deep pool (about 187 m) sits below the Canopy's 150 m rating on purpose, as a soft depth gate.
