import type { Solid } from "../../../sim/world.js";
import type { CaveField } from "./field.js";
import { chunkBox, type CaveLattice, type ChunkCoord } from "./mesh.js";

/** Option A of the LC comparison (measurement only, not the shipped path):
 * the W1 approach scaled up. Owned rock voxels within `shell` metres of
 * water, from the same field and lattice, greedily merged into boxes per
 * chunk, for the production box sweep (`createWorldQueries`). The shipped
 * representation is the triangle mesh (`collision.ts`); see LC.md. */
export function voxelBoxes(field: CaveField, l: CaveLattice, c: ChunkCoord, shell = 2): Solid[] {
  const N = l.cells, h = l.voxel, b = chunkBox(l, c), pad = Math.ceil(shell / h);
  const m = N + 2 * pad, at = (i: number, j: number, k: number): number => i + m * (j + m * k);
  // Voxel centres of the chunk plus a shell-wide apron (to see nearby water).
  const rock = new Uint8Array(m * m * m), owned = new Uint8Array(m * m * m);
  for (let k = 0; k < m; k++) for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
    const x = b.min.x + (i - pad + 0.5) * h, y = b.min.y + (j - pad + 0.5) * h, z = b.min.z + (k - pad + 0.5) * h;
    owned[at(i, j, k)] = field.owned(x, y, z) ? 1 : 0;
    rock[at(i, j, k)] = field.rock(x, y, z) < 0 ? 1 : 0;
  }
  // Water dilated by `pad` voxels (chessboard), one axis at a time.
  let near = new Uint8Array(m * m * m);
  for (let q = 0; q < near.length; q++) near[q] = rock[q] ? 0 : 1;
  for (const stride of [1, m, m * m]) {
    const next = new Uint8Array(near.length);
    for (let q = 0; q < near.length; q++) {
      if (!near[q]) continue;
      const along = Math.floor(q / stride) % m;
      for (let s = -pad; s <= pad; s++) if (along + s >= 0 && along + s < m) next[q + s * stride] = 1;
    }
    near = next;
  }
  const want = (i: number, j: number, k: number): boolean => {
    const q = at(i + pad, j + pad, k + pad);
    return rock[q] === 1 && near[q] === 1 && owned[q] === 1;
  };
  const done = new Uint8Array(N * N * N), cell = (i: number, j: number, k: number): number => i + N * (j + N * k);
  const out: Solid[] = [];
  for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) for (let i = 0; i < N; i++) {
    if (done[cell(i, j, k)] || !want(i, j, k)) continue;
    let i1 = i + 1;
    while (i1 < N && !done[cell(i1, j, k)] && want(i1, j, k)) i1++;
    let k1 = k + 1;
    rows: while (k1 < N) { for (let a = i; a < i1; a++) if (done[cell(a, j, k1)] || !want(a, j, k1)) break rows; k1++; }
    let j1 = j + 1;
    slabs: while (j1 < N) { for (let e = k; e < k1; e++) for (let a = i; a < i1; a++) if (done[cell(a, j1, e)] || !want(a, j1, e)) break slabs; j1++; }
    for (let jj = j; jj < j1; jj++) for (let e = k; e < k1; e++) for (let a = i; a < i1; a++) done[cell(a, jj, e)] = 1;
    out.push({ id: `${field.source.id}.vox.${c.cx}.${c.cy}.${c.cz}.${out.length}`,
      min: { x: b.min.x + i * h, y: b.min.y + j * h, z: b.min.z + k * h }, max: { x: b.min.x + i1 * h, y: b.min.y + j1 * h, z: b.min.z + k1 * h } });
  }
  return out;
}
