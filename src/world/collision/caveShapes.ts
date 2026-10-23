import type { CaveDef } from "../../content/regions/caves.js";
import { caveShell, caveVolume } from "../../content/regions/caveGeometry.js";
import type { FloorFunction } from "../../content/regions/terrain.js";
import type { LodLevel } from "../types.js";
import { meshFacing, meshShapes, type TriangleMesh } from "./bake.js";
import type { StaticShape } from "./shape.js";

/** A W1 kit cave's shell as static collision (COL-1): the drawn mesh itself,
 * viewing its positions. Its winding is certified by coherence and oriented
 * by the occupancy the shell was meshed from: the cave's opened voxel volume
 * (`caveVolume(def).solid`, "rock as collided and drawn"), unknown outside
 * its grid. Neither the raw source field (the opening removed thin rock it
 * still has) nor the rock box cover (it ends at the footprint) is that
 * occupancy, and each disagrees with the shell at the footprint's edges.
 * `floor` is kept for callers that bake from a definition built on it. */
export function kitShellShapes(def: CaveDef, _floor: FloorFunction, lod: LodLevel = "fine"): StaticShape[] {
  const sh = caveShell(def, lod), mesh: TriangleMesh = { positions: sh.positions, indices: Uint32Array.from(sh.indices) };
  const vol = caveVolume(def), g = vol.grid;
  const inside = (p: { x: number; y: number; z: number }): boolean | null => {
    const i = Math.floor((p.x - g.origin.x) / g.voxel), j = Math.floor((p.y - g.origin.y) / g.voxel), k = Math.floor((p.z - g.origin.z) / g.voxel);
    if (i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz) return null;
    return vol.solid[i + g.nx * (j + g.ny * k)] === 1;
  };
  const facing = meshFacing(`${def.id}.shell.${lod}`, mesh, inside);
  return meshShapes(`${def.id}.shell`, mesh, { interior: "solid", facing, shared: true });
}
