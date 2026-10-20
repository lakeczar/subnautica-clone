# W1-pre: Fanvault cave kit (handoff)

Opus 5.5, branch `t3/cfb3bfb4` from `feat/siltwake-first-expedition` `fc46af8`. New files only. No shared root, sim, bake or `materials.ts` edit. Design basis: [CAVES-UNDERGROUND](../../research/CAVES-UNDERGROUND.md).

## What's built
- **The Fanvault loop**, Hearth Reef. A stepped limestone fan-terrace mound sits on the shelf break west of the Hearth drop. Its footprint is X −316..−264 and Z −92..−40: one 128 m column (`chunk:2:12:0`), outside the legacy preserve, and more than 20 m from `route.basin.reef_west`.
  - **North mouth:** tall, opening onto the shelf at 18.5 m, with amber unlit colonies inside.
  - **South mouth:** broad and low, opening down the slope at 26 m, with teal colonies inside.
  - **Inside:** a vault sunk to 26 m under a 4.5 m roof, with a skylight funnel and a dark catch pocket.
  - **Diver only:** both mouths are narrower than the smallest hull. Small craft park on the shelf about 25 m north-east of the north mouth.
- **`src/content/regions/caves.ts`** holds the contract, the authored `FANVAULT` source, `caveDef(id, floor)` (memoised) and `withCaveFloors` (the floor half of the adapter, as a pure prototype).
- **`src/content/regions/caveGeometry.ts`** is the one-source generator. Exterior rock and carved water are both signed distances, sampled once on a 0.5 m grid over the footprint plus a heightfield pad. That one occupancy feeds both outputs:
  - **Rock:** the opening by a 2 m cube, then a greedy cover with maximal boxes. This gives 1,504 `Solid`s, each at least 2 m on every side and allowed to overlap.
  - **Shell:** surface nets with SDF-placed vertices, clamped to 0.2 m per axis of their voxel corner, plus two clamped relax passes. Fine has 27k vertices; coarse (1 m, rock only if all 8 fine voxels are rock) has 6.8k.
  - **Cost:** about 0.27 s to build the rock and 0.2 s per shell. 220 sub-2 m rock voxels out of 380k are dropped from art and collision together.
  - **Codec-ready helpers:** `clipMeshToRect` and `caveShellByColumn` produce layer-0 recipe parts. The collar edge lies exactly on `worldFloor`, and alpha stays integer.
- **`src/render/caves/lightField.ts`** (Babylon-free) builds a 1 m RGBA field per cave in 0.12 s:
  - R: daylight path length through water from the openings, weighted per room by `falloff`;
  - G: direct sun through the skylight, along the cel `LIGHT_DIRECTION`;
  - B: rock;
  - A: how much of the texel is cave inside.
  `caveDaylight` mirrors the shader's curve.
- **`src/render/caves/caveLight.ts`** (GLSL, Babylon-free) adds banded darkness by path length (full light in the sun beam), caustics only where the sun reaches, a fog medium darkened inside the cave (so a mouth seen from inside glows), and a lamp cone. The lamp has three Lambert bands and three range rings, is stopped by rock through a march in the field, and adds a faint beam. Unlit colour stays unlit. `injectCaveLight(CEL_FRAGMENT)` splices this in at five anchors and throws if any anchor moved.
- **`src/render/caves/caveMaterial.ts`** (Babylon) provides `createCaveCelMaterial` and `CaveLighting`. `CaveLighting` owns the 3D texture and sets the per-frame uniforms; it activates one cave at a time.
- **`tools/cave-lab.html`** shows the Fanvault with its reef terrain: the live recipe for six columns, with the footprint cut as a hole. It has:
  - free swim using the diver's real collision (`C`);
  - a lamp toggle (`L`) and an LOD toggle (`K`);
  - a shell toggle, overlays for a rock plan slice (`?slice=`), portals, routes and rooms;
  - bookmarks, and `window.caveLab.show()` for scripted shots.

  Run it with `npx vite --port <own> --strictPort --host 127.0.0.1`, then open `/tools/cave-lab.html`.

## Interface note (changes from the research sketch)
- **Authored versus derived.** `CaveSource` (terraces, carves, rooms, portals, routes, staging) is authored. `CaveDef` adds the generated `rock`, rooms with measured `bounds` and `portals[]`, `surfaces` (LOD recipes; meshes come from `caveShell(def, lod)`) and `stats`. Nothing generated is hand-edited.
- **The floor is a parameter** (`caveDef(id, worldFloor)`), so `sim/world.ts` can import caves without a cycle, the same pattern as `composeWorldFloor`.
- **Room labels come from geometry.** A voxel's room is the nearest carve, and only for carved water under the exterior top. Portals carry an axis normal, a `clear` rectangle and `admits`. Tests hold every portal to the generated rock and both shells.
- **Room optics are one number** (`falloff`). Darkness is measured through water, never through rock, so no box-shaped light masks are needed.
- **Persisted state: none.** Geometry is static and the IDs are stable. Proposal for later: a `player.lampOn` flag plus an input binding (render-only today).

## Checks
- `npm test`: **751/751**, including `tests/caves.test.ts` (12 tests, about 4 s alone):
  - shell within 0.35 m of rock, and within 0.36 m of water for 99.9% of points;
  - no room cell inside rock, checked voxel by voxel and against the source distances;
  - both mouths and all throats clear at their target size, and neither shell crosses an opening;
  - the diver sweeps both routes; the smallest hull is stopped at each mouth; a negative control with a 2 m block stops the loop;
  - over 10 columns, a diver is clear below, supported from below, and stands on a roof at least 2 m thick without sinking; both shells draw the roof top; no roof hole outside the skylight and mouths;
  - the coarse and fine shells stay at least 0.6 m from the routes;
  - clipping preserves area, and the codec round trip holds;
  - collar steps stay under 0.75 m;
  - parking clearance;
  - light checks, the lamp-off adverse case, and splice anchors.
- `npm run build`: OK, and the bake is unchanged.
- **Heavy:** `scripts/heavy-check.sh … tests/cave-light.heavy.test.js` passes, peaking at 162 MiB. It checks every anchor once in the real `CEL_FRAGMENT`, that `SUN_DIRECTION` equals `LIGHT_DIRECTION`, and the material and field-texture lifecycle under NullEngine. Other heavy files were not rerun; no code they import changed.
- **Browser:** software preview with WebGL2. With keyboard swim, collision held: the diver went down the north passage and was stopped by the vault wall, then sank and stopped on the floor, and was never inside rock.
- **Cost:** a diver step inside the cave (move plus support) costs about 30–60 µs against the production 32 m index, with the full roster plus the cave.

## Adverse case: lamp off inside
The test runs from every route point inside the cave. With the lamp off, it looks for the brightest water in sight within 24 m and swims there. Every start reaches open water within six strictly brighter hops. In the lab, the vault with the lamp off shows the south exit glowing and the teal colonies by the mouth (02). The amber north colonies mark the other exit.

| | |
|---|---|
| ![](w1-pre/01-north-approach-daylight.png) North approach, daylight | ![](w1-pre/02-vault-lamp-off.png) Vault, lamp off: the exit glows |
| ![](w1-pre/03-vault-lamp-on.png) Vault, lamp on | ![](w1-pre/04-skylight-from-vault.png) Skylight funnel, sunlit wall |
| ![](w1-pre/05-overlay-rock-slice-routes-portals.png) Rock slice at −22.75 m, loop route, mouths, throats and skylight (shell hidden) | ![](w1-pre/06-overview-fine.png) Fine · ![](w1-pre/07-overview-coarse.png) Coarse |

## Integration after C3 (W1)
1. **World-query adapter (`sim/world.ts`).**
   - Compose `caves(worldFloor).flatMap(c => c.rock)` into the physical roster used by runtime, recovery and validators. Give the cave rock its own finer broad phase, about 8 m cells: 1.5k boxes fill a few of the 32 m cells.
   - The floor becomes `withCaveFloors(worldFloor)`. It is pointwise, so straddling shapes sample both owners.
   - `clearance`, `supportHeight`, `moveCapsule` and LOS then need no cave special case: rock tops give support, and the roof is a solid.
   - The tests here run in a frame shifted by (+300, +90) only because the baseline `WORLD_BOUNDS` is still the legacy rectangle. Drop `SHIFT` once C3's envelope bounds land.
2. **`step.ts` / `hullFloor`.**
   - `hullFloor` and `verticalCorrection` read `groundHeight`; inside a footprint that now returns `baseY − 1`, so nothing is lifted through a roof. Floors come from the swept rock.
   - Make the swim cliff guard in `step.ts` read support instead of raw `groundHeight`. Today it uses `nextFloor > y + 0.22` with `groundHeight`, so it would see a 17 m "cliff" at a mouth threshold and could zero horizontal travel for a diver hugging a sill.
   - Keep cabin and carrier worlds explicit, so they never get the cave floor.
3. **Bake.**
   - Generalise `TessellationOptions.hole` to `holes: Rect[]` (the legacy extent plus cave footprints).
   - In `liveTerrain`, append `caveShellByColumn(def, lod, [chunk])` meshes named `${chunk.id}.cave.<id>`. They already clip to the column, keep integer alpha and encode with `terrainCodec`.
   - Add `caves.ts` and `caveGeometry.ts` to the bake dependency hash.
   - Raise chunk and region Y bounds by `def.bounds`.
   - Keep the shell edge on the floor: it is snapped already. Better still, emit the hole edge from the same collar points so no skirt is needed.
4. **`materials.ts`.**
   - Set `CEL_FRAGMENT = injectCaveLight(base)`, or inline the five splices shown in `caveLight.ts` `ANCHORS`.
   - Extend `CEL_UNIFORMS` with `CAVE_UNIFORMS`, and add `samplers: ["caveField"]` in `createCelMaterial` and the kit material.
   - Create one `CaveLighting` in the renderer. Each frame, `setField(nearest cave's caveLightField)` and `apply({ on, position, direction })` from the player's head and view.
   - The water, sky and glass materials are untouched.

## Known limits
- **Collision is boxes, so the solid count is high:** 1,504 overlapping boxes. The cost is fine for now (see the step cost above). A 2D column cover or wedges could cut it later.
- **Seam at the footprint edge.** The heightfield and the cave collar meet at the floor, but the edge points differ, so a thin seam line shows in the lab, more in coarse (07). Emitting both from the same collar polyline in the bake fixes it.
- **Walls show cel band edges.** North-facing walls sit near a cel band threshold. The visual style is still rough: stacked disks of terraces with no flora, scatter or resources yet (W3).
- **Lighting is limited.** Only one cave is lit as dark at a time; others draw as open water. They are more than 200 m apart and fogged. The lamp is visual only.
- **Performance is unmeasured.** All views ran on the software preview. A GPU frame-time check on the 3090 is still due.
- **Not covered here:** no route, access or rescue validator knows about roofs yet (W1 and W2), and no saves are involved.
