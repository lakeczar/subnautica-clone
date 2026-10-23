# COL-1: one collision model (stage A: the static collider)

Opus 5.5 high. Branch `t3/col-1-static-collider` from root `fe27757`; stage A head: see the commit that adds this page. The decision that created this stream is R1 of the [compromise verdict](../audits/COMPROMISE-VERDICT-OPUS.md) (on `research/compromise-audit`), on Sol's findings ART-01/02/03/07, CAV-02/03/20 and TST-05. **New modules only:** `src/world/collision/*` and `tests/col1-*`. No edit to `world.ts`, `app.ts`, `step.ts`, LC's files, or any cave or creature file.

## What stage A gives stage B and every builder
One collider for any baked shape, each surface in the primitive that fits it:

| Module | What it is |
| --- | --- |
| `boxTriangle.ts` | LC's 13-axis swept box against a triangle, reading vertices in place, bit-equal to LC's (tested on 20,000 random cases). Adds signed separation (the push-out axis) and **order-independent tie-breaking** (see *Findings*). |
| `shape.ts` | **The compact format.** `Uint16` indices; positions are the art's own Float32 buffer where it can be (`shared`, not counted as owned); BVH nodes of 16 bytes (bounds quantised to `Uint16`, rounded outwards, plus one `Uint32` link). Closed shapes answer interior by ray parity, per part. |
| `heightfield.ts` | **Seabed as collision** for collars and seams: one Float32 per lattice point, a hole bit per cell, 8 × 8-cell tiles with min/max for culling, solid all the way down. Sampling can be **conservative**: each vertex is lifted by the largest chord sag its cells show at the old columns' nine points, so the lattice never sits below the floor the exterior world tests against. |
| `collider.ts` | `createStaticCollider(id, members)`: shapes, heightfields and true boxes behind a top-level BVH. Queries: `sweep`, `overlaps` (surfaces, interiors, buried), `support`, `segmentClear`, `move` (slides), **`depenetrate`** (ART-07), `contact`, `solidAt`, `crossings`. **No uniform grid anywhere**: cost and size follow primitive counts, never extent (TST-05). |
| `bake.ts` | **Baked from the art's own source:** `artMembers(id, blocks, pieces, skin)` takes a set piece's `VistaBlock`s and `VistaPiece`s (blocks stay boxes, closed prisms become solid parts wound outwards, open pieces become skin); `meshShapes` takes a mesh (over 65,536 vertices it splits in X/Z columns, viewing the art's buffer where it can, with group parity); `collarHeightfield`; `meshFacing`. |
| `world.ts` | The seams for stage B: `staticCaveCollider` (a W1 kit cave as LC's `CaveCollider`, for `composeCaveWorld`) and `composeStaticWorld` (structures over the exterior world; every answer away from the collider is the exterior's, bit for bit). Both answer `depenetrate`. |
| `biome.ts` | A cave biome in the compact format with LC's exact semantics (`compactBiomeCollider`): for LC-2. |
| `cover.ts` | `coverReport(art, boxes, points)`: how far a box cover stands off its art, and where art pokes out (the interim rule's debt entry). |

### Adopting it now (the interim rule)
Keep the intended art. Collide it as it will be after stage B, and measure the box cover you ship meanwhile:
```ts
const art = createStaticCollider("lost.hall", artMembers("lost.hall", blocks, pieces));
const gap = coverReport(art, coverBoxes, pieces.flatMap(p => p.facets.flatMap(f => f.pts)));
// File as COL-1 debt: gap.artOutside (where art pokes out), gap.standOffMax (where the cover stands off).
```
For a mesh, use `meshShapes(id, { positions, indices }, { interior: "solid", facing: meshFacing(id, mesh, isRock), shared: true })`. Don't bend the art to fit boxes.

## Oracle: today's queries against the static collider
`tests/col1-oracle-support.ts` builds each scene twice, as the game queries it today and on the static collider, and probes both with the same poses, moves, columns and sight lines. Most probes are seeded near the art. **Every disagreement is judged against the art itself**: a pose the new collider blocks must overlap the art, a move it stops short must have art on the old move's path, and a sight line it blocks must cross the art. Scenes:
- **dishes:** DISH-1's three dishes, frame and bowl boxes against their own art;
- **a1:** A1's set pieces (POI-1's sets are the same kit; left to their stream);
- **colonnade:** CA-1's linked Archlet, Bellhole and Wrackhollow, today's `createCaveWorldQueries` against LC's composer with three colliders:
  - `columns`: the same rock boxes and collar columns (the composer control);
  - `heightfield`: the same rock boxes, the collar as a heightfield;
  - `shell`: the fine shell (the art) as rock, plus the heightfield;
- **canopy:** LC's Canopy chunks on the squeeze and craft loop (47 of 90), LC's chunk colliders against the compact format.

**Every probe below**, from one `--class exclusive` run at `91b01cb` (`col1/oracle.json`; `tests/col1-oracle-report.ts`). The heavy test asserts on the same probes. Speed is the median of seven interleaved passes over the same inputs, headless Node on factory-worker. The scheduler logged host load up to 7.7 from work outside the queue, so treat differences under about 20% as noise. Old memory is the measured heap of the box sets and their index. New memory is the collider's exact typed-array bytes: its heap delta is below measurement noise at these sizes (A1's came out negative), so it isn't quoted.

| Scene | Before | After | Memory: old (measured heap) → new (format bytes) |
| --- | --- | --- | --- |
| dishes | 4,855 boxes | 3,922 triangles, 27 boxes | 1.89 MiB → 100 KiB |
| a1 | 5,195 boxes | 14,436 triangles, 71 boxes | 2.08 MiB → 348 KiB |
| colonnade.columns | 20,153 boxes | 20,153 boxes | 7.92 MiB → 1.53 MiB |
| colonnade.heightfield | 20,153 boxes | 2,313 boxes, 41,623 samples | 7.97 MiB → 356 KiB |
| colonnade.shell | 20,153 boxes | 83,084 triangles, 41,623 samples | 7.96 MiB → 1.39 MiB + 501 KiB shared with art |
| canopy | LC chunk colliders | 362,861 triangles | 13.82 MiB (LC's format bytes) → 6.04 MiB + 1.82 MiB shared with art (47 chunks) |

| Scene | Poses agree | Freed (stand-off max / mean) | Newly blocked (of them inside the art) | Moves agree / freed / slide differs / spurious | Sight: old-only blocked / new-only | Protected newly blocked |
| --- | --- | --- | --- | --- | --- | --- |
| dishes | 35,418 / 36,000 | 582 (0.53 / 0.13 m) | 0 (0) | 16,660 / 267 / 1071 / 0 of 18,000 | 115 / 0 | 0 of 4 paths, 14 poses |
| a1 | 35,840 / 36,000 | 160 (0.09 / 0.03 m) | 0 (0) | 17,091 / 127 / 779 / 0 of 18,000 | 60 / 0 | 0 of 5 paths, 10 poses |
| colonnade.columns | 16,000 / 16,000 | 0 (0.00 / 0.00 m) | 0 (0) | 7,700 / 0 / 296 / 4 of 8,000 | 1 / 0 | 0 of 8 paths, 2 poses |
| colonnade.heightfield | 15,994 / 16,000 | 6 (0.11 / 0.04 m) | 0 (0) | 7,640 / 5 / 351 / 4 of 8,000 | 1 / 0 | 0 of 8 paths, 2 poses |
| colonnade.shell | 15,804 / 16,000 | 82 (0.18 / 0.06 m) | 114 (114) | 6,824 / 84 / 1070 / 0 of 8,000 | 43 / 7 | 0 of 8 paths, 2 poses |
| canopy | 16,000 / 16,000 | 0 (0.00 / 0.00 m) | 0 (0) | 7,837 / 0 / 163 / 0 of 8,000 | 0 / 0 | 0 of 2 paths, 0 poses |

Speed, µs per query, old → new (same inputs). A frame is one 60 Hz step (diver 0.09 m, medium 0.2 m, Creel 0.11 m); a long move is twenty frames in one call:

| Scene, shape | clearance | move.frame | move.long | support | sight |
| --- | --- | --- | --- | --- | --- |
| dishes, diver (400 poses) | 19.8 → 12.9 | 15.1 → 13.2 | 30.2 → 26.1 | 16.7 → 6.6 | 135.6 → 64.8 |
| dishes, medium (400 poses) | 21.0 → 11.1 | 17.7 → 13.0 | 70.1 → 69.1 | 12.8 → 5.3 | 178.9 → 128.6 |
| a1, diver (400 poses) | 35.1 → 13.7 | 29.8 → 12.8 | 43.0 → 28.1 | 28.0 → 6.7 | 176.7 → 61.3 |
| a1, medium (400 poses) | 33.5 → 13.0 | 27.0 → 17.4 | 73.7 → 117.9 | 18.8 → 5.6 | 183.9 → 108.0 |
| colonnade.columns, diver (400 poses) | 10.1 → 3.2 | 11.9 → 2.5 | 49.5 → 9.0 | 11.3 → 2.6 | 30.4 → 3.3 |
| colonnade.heightfield, diver (400 poses) | 9.4 → 2.4 | 11.4 → 2.6 | 46.6 → 9.9 | 10.7 → 2.5 | 28.3 → 3.3 |
| colonnade.shell, diver (400 poses) | 9.3 → 2.6 | 10.9 → 2.3 | 47.4 → 25.6 | 11.1 → 1.6 | 29.6 → 4.2 |
| canopy, creel (400 poses) | 50.9 → 51.3 | 13.4 → 12.0 | 377.7 → 247.1 | 2.4 → 2.4 | 22.0 → 22.1 |
| canopy, diver (400 poses) | 8.8 → 10.2 | 3.8 → 2.8 | 59.3 → 23.4 | 1.9 → 2.0 | 7.8 → 7.9 |

Bowl float (feet above the highest porcelain under the diver, resting drops):

| Dish | Drops | Old mean / p95 | New mean / p50 / p95 |
| --- | --- | --- | --- |
| basin.dish_north.dish | 127 | 0.51 / 0.94 m | 16 / 4.6 / 6.6 mm |
| basin.dish_centre.dish | 99 | 0.55 / 0.93 m | 5 / 4.6 / 6.2 mm |
| basin.dish_south.dish | 136 | 0.52 / 1.06 m | 44 / 4.7 / 7.7 mm |

Collar float (straddling the footprint edge, resting drops):

| Variant | Old p50 / p95 | New p50 / p95 |
| --- | --- | --- |
| colonnade.heightfield | 6.6 / 20.6 cm | 1.3 / 20.4 cm |
| colonnade.shell | 6.6 / 20.6 cm | 0.5 / 3.7 cm |

## Findings stage B should act on
- **No route, tether, park or work pose is newly blocked** in any scene. That covers every route, tether and site pose within 12 m of each scene, plus the colonnade's own routes and staging.
- **The art is more faithful everywhere it differs.**
  - **Dishes:** the old covers stood up to 0.53 m off the art.
  - **A1:** up to 0.09 m.
  - **Bowls:** a diver rested 0.5 m above the porcelain on average (p95 about 1 m); on the bowl's own triangles it rests at the skin.
  - **Old covers let you stand on air:** a diver stood on box tops up to 11–13 m above the next art surface below (slab corners beside tilted members).
- **The shell as cave rock blocks 114 of 16,000 poses that the rock boxes allowed.** Each one is inside the drawn shell: the art stands up to 0.35 m in front of the boxes. It blocks no route.
  - **Stage B's call:** collide kit caves by their shell (exact art) or keep the boxes and only replace collars (`heightfield`, no new blocking at all).
  - **I recommend the shell.** It is the art, it is faster, and it removes the 0.35 m art/collision gap the cave kit documents.
- **Ghost contacts on flat meshes (fixed here, and present in LC's composer).** A box resting exactly at the skin, sliding along a flat triangle grid, meets the edges of the coplanar neighbours as walls; picking a tied contact by storage order made it worse. Fixed at the root in this collider:
  - ties prefer a face contact, then the most head-on normal;
  - slides leave each contact 10 µm past the skin.

  A layout test (the same triangles in any order, leaf size or split give the same moves) fails if either fix is removed (mutation checked). LC's own composer slide loop (`compose.ts`) has the same exposure: on the Canopy, 163 of 8,000 moves differ by slide after a tie. **Stage B should run cave slides through `slideMove`.**
- **Composer control (identical boxes): today's W1 composite vs LC's composer.** These aren't collider effects:
  - Clearance agrees on 16,000 of 16,000 poses.
  - 4 of 8,000 moves differ: half-millimetre near-misses at rock-box corners, which LC's 4 mm skin counts as contacts (one traced to `reef_bellhole.rock.0740`).
  - Support outside a footprint reads up to 0.28 m lower in LC's composer, which doesn't read collar tops there.

  Stage B picks one composer.
- **The compact biome is LC, bit for bit,** on clearance, support and sight (16,000, 2,603 and 4,000 probes) and on every first contact (20,000 sweeps, identical times). Of 7,266 hits, 22 tie and choose a different normal, by design.
  - **Storage:** it owns **6.04 MiB against LC's 13.82 MiB (44%)** and views 1.82 MiB of the art's positions. Copying those positions would make it 57%.
  - **For LC-2:** the "roughly half" LC estimated is met.
- **Where the speed comes from in caves.** The composer control, with identical boxes, is already 3–5× faster than today's W1 composite: a box hierarchy against an 8 m grid. The heightfield adds the memory (1.53 MiB of boxes become 356 KiB). The shell adds faithfulness and keeps the speed, except on long moves.

## Checks
- **Fast tier:** `node scripts/test-tier.mjs fast` passes **1,314 / 1,314** at `91b01cb`. The COL-1 fast files are under the 5 s warning: `col1-collider` 3.5 s, `col1-oracle` 2.5 s, `col1-queries` 1.2 s and `col1-cover` 0.4 s of main-thread CPU.
  - **Format:** `Uint16` indices, 16-byte nodes, shared positions; over 65,536 vertices a shape refuses, and a split mesh views the art's buffer.
  - **Hierarchy:** quantised nodes hold every triangle under them; candidates never miss one; swept slab culling equals a sweep over every triangle.
  - **Kernels:** sweep and overlap are LC's, bit for bit (20,000 cases).
  - **Sweeps:** triangles stop exactly where a box obstacle does at 2–62 m/s, and a move never ends inside.
  - **Slides:** along walls and creases; **layout independence**, with mutation checked.
  - **Support:** solids rest on their up faces only; skin is a floor from either side.
  - **Interiors:** a union of overlapping parts, with a parity control; parity across a split group.
  - **Heightfield:** planar exactness; sweeps equal to the same triangles as a shape; buried boxes and holes; DDA sight equal to brute force.
  - **Collar:** never blocks a pose the columns allowed, within 2 cm plus slope of them, and the same through LC's composer.
  - **Depenetration:** sunk, deep, bounded, and the wall adverse case.
  - **`composeStaticWorld`:** the exterior's own answers away from the collider; guards.
  - **Cover check** and its adverse case; **TST-05**: size follows primitives, not a 2 km extent.
  - **Oracle smoke,** plus DISH-1's own rim and bowl checks on the static world.
- **Heavy oracle:** `col1-oracle.heavy.test.ts` passes **4 / 4** through the queue at `91b01cb` (49 s, peak 204 MiB).
- **Whole heavy tier:** on the second worker at `ecf2467`, `npm run test:heavy` passes every file. `col1-oracle` took 61 s at 217 MiB. That run predates only the report's interleaved timing and a depenetration refactor, both covered by the queued run above.
- **Build:** `npm run build` OK; `tsc --noEmit` clean. No app-graph change: nothing in the game imports `world/collision` yet.
- **Collar lift:** the conservative lift on the colonnade collars is at most **10.7 mm** (Archlet), against the old columns' blanket 2 cm plus nine-sample maximum.

## Adverse cases
- **No escape through a wall.** A diver overlaps a wall in a room 3 cm narrower than itself, and the far side of the wall is open water (the nearest clear pose). `depenetrate` returns null, because the escape sweep would close on the wall. With the room's other wall removed, it backs out by its overlap (`tests/col1-queries.test.ts`).
- **A collar that sags.** On a curved floor, a plain lattice lies under the floor between samples. A box resting on it was called buried by the composer's floor check (found by the composer test). The conservative lift fixes it; on the colonnade collars the largest lift is 10.7 mm.

## Compromises (each with its root fix)
- **Long single-call moves of a large hull among dense triangle art are slower than boxes:** A1, medium hull, 4 m in one call, 73.7 → 117.9 µs; dishes about even. Per-frame moves (what the game makes) are as fast or faster in every scene.
  - **Root fix:** for A1's straight tubes and beams, a capsule or oriented-box primitive: one test where a rounded-rectangle prism is 44 triangles. **M**; it fits stage D's oriented proxies.
- **Canopy diver clearance** is 8.8 → 10.2 µs, about 16%, inside the run's noise band; Creel clearance is even. LC's chunk grid finds a column's colliders directly, while this walks a top-level hierarchy over 94 shapes.
  - **Root fix in LC-2:** fold each chunk's band into a heightfield (one shape per chunk, fewer triangles). **S**.
- **Vista and dish positions aren't shared with the render's buffers.** The collider bakes its own Float32 from the same facets, so the numbers are identical, but the bytes are owned.
  - **Root fix in stage B:** the renderer draws from the collider's merged positions. **S**.
- **The collar lattice samples the physical floor function at 0.5 m.** The seabed art is an adaptive triangulation of that function, and their visual seam is not measured here (see *Missing*).

## Missing evidence
- No browser or GPU run: stage A changes nothing drawn or wired. Stage B's integration carries the ordinary-control run.
- Performance is headless Node query cost (`--class exclusive`, factory-worker), not in-game frame cost.
- Memory is Node heap (old) and exact format bytes (new), not a browser heap. The new collider's heap delta was below measurement noise.
- The Canopy oracle covers 47 of 90 chunks, the two routes' columns.

## Stage B, when CW-1 merges
1. Compose structures through `composeStaticWorld` (vistas, dishes, the sites), with `guards: [LEGACY_PRESERVE]`, and drop `VISTA_SOLIDS` and the dish boxes from `SOLIDS`.
2. Kit caves through `staticCaveCollider`, collars as `collarHeightfield`, rock as the shell (or boxes, per the call above), in CW-1's composer. Cave slides through `slideMove`.
3. `depenetrate` on save load before the first tick (ART-07), falling back to the rescue path when it returns null.
4. Retire the collar columns and the box sets; port the dish and vista tests to the static world.
