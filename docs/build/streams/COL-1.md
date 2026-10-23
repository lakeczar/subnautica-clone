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

TABLES

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
- **The compact biome is LC, bit for bit,** on clearance, support and sight (16,000, 2,603 and 4,000 probes) and on every first contact (20,000 sweeps, identical times). Of 7,266 hits, 22 tie and choose a different normal, by design. It costs **43%** of LC's bytes before sharing positions with the art.

## Checks
CHECKS

## Adverse cases
- **No escape through a wall.** A diver overlaps a wall in a room 3 cm narrower than itself, and the far side of the wall is open water (the nearest clear pose). `depenetrate` returns null, because the escape sweep would close on the wall. With the room's other wall removed, it backs out by its overlap (`tests/col1-queries.test.ts`).
- **A collar that sags.** On a curved floor, a plain lattice lies under the floor between samples. A box resting on it was called buried by the composer's floor check (found by the composer test). The conservative lift fixes it; the largest lift on the colonnade collars is reported in the checks.

## Compromises (each with its root fix)
- **Long single-call moves of a large hull among dense triangle art are slower than boxes:** A1, medium hull, 4 m in one call. Per-frame moves (what the game makes) are faster in every scene.
  - **Root fix:** for A1's straight tubes and beams, a capsule or oriented-box primitive: one test where a rounded-rectangle prism is 44 triangles. **M**; it fits stage D's oriented proxies.
- **Canopy clearance** costs about the same as LC's, not less: LC's chunk grid finds a column's colliders directly, while this walks a top-level hierarchy over 94 shapes.
  - **Root fix in LC-2:** fold each chunk's band into a heightfield (one shape per chunk, fewer triangles). **S**.
- **Vista and dish positions aren't shared with the render's buffers.** The collider bakes its own Float32 from the same facets, so the numbers are identical, but the bytes are owned.
  - **Root fix in stage B:** the renderer draws from the collider's merged positions. **S**.
- **The collar lattice samples the physical floor function at 0.5 m.** The seabed art is an adaptive triangulation of that function, and their visual seam is not measured here (see *Missing*).

## Missing evidence
- No browser or GPU run: stage A changes nothing drawn or wired. Stage B's integration carries the ordinary-control run.
- Performance is headless Node query cost (`--class exclusive`, factory-worker), not in-game frame cost.
- Memory is Node heap and format bytes, not a browser heap.
- The Canopy oracle covers 47 of 90 chunks, the two routes' columns.

## Stage B, when CW-1 merges
1. Compose structures through `composeStaticWorld` (vistas, dishes, the sites), with `guards: [LEGACY_PRESERVE]`, and drop `VISTA_SOLIDS` and the dish boxes from `SOLIDS`.
2. Kit caves through `staticCaveCollider`, collars as `collarHeightfield`, rock as the shell (or boxes, per the call above), in CW-1's composer. Cave slides through `slideMove`.
3. `depenetrate` on save load before the first tick (ART-07), falling back to the rescue path when it returns null.
4. Retire the collar columns and the box sets; port the dish and vista tests to the static world.
