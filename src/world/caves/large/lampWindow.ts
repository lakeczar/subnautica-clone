import type { RockGrid } from "../../../render/caves/lightField.js";
import type { Vec3 } from "../../types.js";
import { chunkIndex, type CaveCollision } from "./collision.js";
import { occupied } from "./mesh.js";
import { owns } from "./ownership.js";

/** The lamp's exact occupancy round the viewer (Babylon-free).
 *
 * A W1 `RockGrid` (R8, 255 = rock) of `size` 0.5 m voxels, one per lattice
 * node, centred on the viewer snapped to `snap` metres. Nodes come from the
 * chunks' bit-packed occupancy (the fine field's own signs, which the
 * collision mesh separates); nodes in chunks with no surface are rock when
 * the cave owns them or they lie under the seabed, else open water. A window
 * built round a snap point covers at least `size * voxel / 2 - snap` metres
 * round the viewer: 24 m for the 128-voxel, 8 m-snap default, more than the
 * 22 m lamp. `windowJob` builds one in steps so a re-centre costs no frame. */

export const WINDOW_SIZE = 128;
export const WINDOW_SNAP = 8;

export interface OccupancySource {
  readonly collision: CaveCollision;
  readonly cells: number;
  /** Occupancy bits of a chunk (index as in the collision store), or null. */
  occupancy(index: number): Uint8Array | null;
}

export function windowCentre(p: Vec3, snap = WINDOW_SNAP): Vec3 {
  return { x: Math.round(p.x / snap) * snap, y: Math.round(p.y / snap) * snap, z: Math.round(p.z / snap) * snap };
}

/** Build the window round `centre` in steps of `slab` Z rows per yield. */
export function* windowJob(src: OccupancySource, centre: Vec3, size = WINDOW_SIZE, slab = 8): Generator<void, RockGrid> {
  const c = src.collision, o = c.origin, own = c.ownership, h = own.voxel, N = src.cells;
  // Window voxel (i, j, k) is lattice node g0 + (i, j, k); its centre is the node.
  const g0 = [Math.round((centre.x - o.x) / h) - size / 2, Math.round((centre.y - o.y) / h) - size / 2, Math.round((centre.z - o.z) / h) - size / 2];
  const data = new Uint8Array(size * size * size);
  for (let k = 0; k < size; k++) {
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const gx = g0[0]! + i, gy = g0[1]! + j, gz = g0[2]! + k;
      const cx = Math.floor(gx / N), cy = Math.floor(gy / N), cz = Math.floor(gz / N);
      let rock: boolean;
      const inside = cx >= 0 && cy >= 0 && cz >= 0 && cx < c.nx && cy < c.ny && cz < c.nz;
      const bits = inside ? src.occupancy(chunkIndex(c, cx, cy, cz)) : null;
      if (bits) rock = occupied(bits, N, gx - cx * N, gy - cy * N, gz - cz * N);
      else {
        const x = o.x + gx * h, y = o.y + gy * h, z = o.z + gz * h;
        const fi = Math.max(0, Math.min(own.gx - 1, gx)), fk = Math.max(0, Math.min(own.gz - 1, gz));
        rock = owns(own, x, y, z) || y < own.ground[fi + own.gx * fk]!;
      }
      if (rock) data[i + size * (j + size * k)] = 255;
    }
    if (k % slab === slab - 1) yield;
  }
  return { min: { x: o.x + (g0[0]! - 0.5) * h, y: o.y + (g0[1]! - 0.5) * h, z: o.z + (g0[2]! - 0.5) * h }, voxel: h, nx: size, ny: size, nz: size, data };
}

export function buildWindow(src: OccupancySource, centre: Vec3, size = WINDOW_SIZE): RockGrid {
  const job = windowJob(src, centre, size);
  for (;;) { const r = job.next(); if (r.done) return r.value; }
}
