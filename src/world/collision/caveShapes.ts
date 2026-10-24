import type { CaveDef } from "../../content/regions/caves.js";
import { caveShell } from "../../content/regions/caveGeometry.js";
import { orientedShapes, type Orientation } from "./bake.js";
import type { StaticShape } from "./shape.js";

/** Orientation of every W1 kit-cave shell, by construction. `surfaceNets`
 * (`content/regions/caveGeometry.ts`) emits one quad per solid/water voxel
 * pair along an axis, and winds each of its triangles so that the normal's
 * component along that axis points from the solid voxel to the water one:
 * outward from the opened rock. Later steps never reorder indices: `relax`
 * and the collar's floor snap move positions only, and `clipMeshToRect`
 * keeps each polygon's vertex order and fans it in order. So every
 * component of a shell is wound outward. (Where relaxing or snapping tilts
 * a triangle, occupancy probes near it can disagree with its normal; the
 * winding does not.) Owned by caveGeometry; COL-1 states it here because it
 * may not edit that module, and `tests/col1-art.heavy.test.ts` cross-checks
 * it on every kit shell. */
export const KIT_SHELL_ORIENTATION: Orientation = { facing: 1, source: "caveGeometry surfaceNets: solid voxel to water, outward" };

/** A W1 kit cave's fine shell as static collision (COL-1): the drawn mesh
 * itself, viewing its positions, oriented by its provenance and certified
 * per component (`orientedShapes`). Fine only: the fine shell keeps the
 * rock bound (within `clamp` of the opened rock); the coarse one makes no
 * rock-bound promise and is not a collision LOD. */
export function kitShellShapes(def: CaveDef): StaticShape[] {
  const sh = caveShell(def, "fine");
  return orientedShapes(`${def.id}.shell`, { positions: sh.positions, indices: Uint32Array.from(sh.indices), orientation: KIT_SHELL_ORIENTATION },
    { interior: "solid", shared: true });
}
