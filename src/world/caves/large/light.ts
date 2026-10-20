import { EXTERIOR } from "../../../content/caves/largeCave.js";
import type { LargeCave } from "./build.js";
import { emitterOf, type LifePlacement } from "./life.js";
import { chunkIndex } from "./collision.js";
import { occupied } from "./mesh.js";

/** Cave light as data (Babylon-free): darkness from the openings and glow
 * from life, both measured THROUGH WATER, then baked per vertex.
 *
 * A 1 m light grid covers every surface chunk (32^3 cells each). A cell is
 * water when at least five of its eight fine nodes are; it is exterior when
 * it is water above the seabed. Then:
 * - **Daylight** is the shortest 26-neighbour path from exterior water, each
 *   step weighted by the zone's falloff (`8 / falloff`), so a dark gallery
 *   darkens faster than the garden. A vertex reads `exp(-path / 8)`.
 * - **Glow** is a bounded shortest path from each life group's emitters up
 *   to its `reach`, adding colour * light * (1 - d / reach)^2.
 * Neither ever crosses a rock cell, and a vertex samples the cell in front of
 * it (along its normal), so light reaches a wall only from its own side. */

const CELL = 1;
const REF = 8;

export interface LightGrid {
  readonly cave: LargeCave;
  /** Chunk index -> slot, or -1. */
  readonly slot: Int32Array;
  readonly per: number;
  /** 1 water, 2 exterior water, 0 rock, per cell. */
  readonly kind: Uint8Array;
  readonly path: Float64Array;
  readonly glow: Float32Array;
  readonly ms: number;
}

/** Binary min-heap of (key, cell) in growable typed arrays. */
class Heap {
  private k = new Float64Array(1024); private v = new Int32Array(1024); size = 0;
  push(key: number, value: number): void {
    if (this.size === this.k.length) {
      const k = new Float64Array(this.size * 2); k.set(this.k); this.k = k;
      const v = new Int32Array(this.size * 2); v.set(this.v); this.v = v;
    }
    const k = this.k, v = this.v;
    let i = this.size++;
    while (i > 0) { const p = (i - 1) >> 1; if (k[p]! <= key) break; k[i] = k[p]!; v[i] = v[p]!; i = p; }
    k[i] = key; v[i] = value;
  }
  /** Pops the minimum; its key is left in `topKey`. */
  topKey = 0;
  pop(): number {
    const k = this.k, v = this.v, value = v[0]!;
    this.topKey = k[0]!;
    const n = --this.size, key = k[n]!, last = v[n]!;
    if (n) {
      let i = 0;
      for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1]! < k[c]!) c++; if (k[c]! >= key) break; k[i] = k[c]!; v[i] = v[c]!; i = c; }
      k[i] = key; v[i] = last;
    }
    return value;
  }
}
/** Daylight paths stop growing here: exp(-64 / 8) is 0.03 % of daylight. */
const PATH_CAP = 64;
const NEIGHBOURS = (() => {
  const out: [number, number, number, number][] = [];
  for (let z = -1; z <= 1; z++) for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) if (x || y || z) out.push([x, y, z, Math.hypot(x, y, z)]);
  return out;
})();

export function buildLightGrid(cave: LargeCave, life: readonly LifePlacement[]): LightGrid {
  const started = Date.now();
  const l = cave.lattice, N = l.cells, n = N / 2, per = n * n * n, o = l.origin, own = cave.field.ownership;
  const slot = new Int32Array(l.nx * l.ny * l.nz).fill(-1);
  cave.chunks.forEach((c, i) => { slot[chunkIndex(cave.collision, c.cx, c.cy, c.cz)] = i; });
  const total = cave.chunks.length * per, kind = new Uint8Array(total);
  cave.chunks.forEach((c, s) => {
    const occ = cave.mesh(c, "fine").occupancy!;
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      let water = 0;
      for (let q = 0; q < 8; q++) if (!occupied(occ, N, 2 * i + (q & 1), 2 * j + ((q >> 1) & 1), 2 * k + (q >> 2))) water++;
      if (water < 5) continue;
      const x = o.x + (c.cx * n + i + 0.5) * CELL, y = o.y + (c.cy * n + j + 0.5) * CELL, z = o.z + (c.cz * n + k + 0.5) * CELL;
      const gi = Math.min(own.gx - 1, Math.round((x - o.x) / own.voxel)), gk = Math.min(own.gz - 1, Math.round((z - o.z) / own.voxel));
      kind[s * per + i + n * (j + n * k)] = y > own.ground[gi + own.gx * gk]! ? 2 : 1;
    }
  });
  // Cell <-> global cell coordinates.
  const cellOf = (gx: number, gy: number, gz: number): number => {
    if (gx < 0 || gy < 0 || gz < 0) return -1;
    const cx = Math.floor(gx / n), cy = Math.floor(gy / n), cz = Math.floor(gz / n);
    if (cx >= l.nx || cy >= l.ny || cz >= l.nz) return -1;
    const s = slot[cx + l.nx * (cy + l.ny * cz)]!;
    return s < 0 ? -1 : s * per + (gx - cx * n) + n * ((gy - cy * n) + n * (gz - cz * n));
  };
  const coordsInto = (cell: number, out: [number, number, number]): void => {
    const s = Math.floor(cell / per), r = cell - s * per, c = cave.chunks[s]!;
    out[0] = c.cx * n + (r % n); out[1] = c.cy * n + (Math.floor(r / n) % n); out[2] = c.cz * n + Math.floor(r / (n * n));
  };
  // Zone weights per water cell (nearest carve at its centre).
  const weight = new Float32Array(total).fill(1);
  const falloff = cave.source.zones.map(z => REF / z.falloff), tmp: [number, number, number] = [0, 0, 0];
  for (let cell = 0; cell < total; cell++) if (kind[cell] === 1) {
    coordsInto(cell, tmp);
    const zone = cave.field.zoneAt(o.x + tmp[0] + 0.5, o.y + tmp[1] + 0.5, o.z + tmp[2] + 0.5);
    weight[cell] = zone >= 0 ? falloff[zone]! : 1;
  }
  const path = new Float64Array(total).fill(Infinity), heap = new Heap();
  for (let cell = 0; cell < total; cell++) if (kind[cell] === 2) { path[cell] = 0; heap.push(0, cell); }
  const at: [number, number, number] = [0, 0, 0];
  while (heap.size) {
    const cell = heap.pop(), d = heap.topKey;
    if (d > path[cell]!) continue;
    coordsInto(cell, at);
    for (const [dx, dy, dz, len] of NEIGHBOURS) {
      const u = cellOf(at[0] + dx, at[1] + dy, at[2] + dz);
      if (u < 0 || !kind[u]) continue;
      const next = d + len * weight[u]!;
      if (next < path[u]! && next <= PATH_CAP) { path[u] = next; heap.push(next, u); }
    }
  }
  // Glow per life group.
  const glow = new Float32Array(total * 3);
  const groups = cave.source.life;
  groups.forEach((g, gi) => {
    const rgb = [parseInt(g.color.slice(1, 3), 16) / 255, parseInt(g.color.slice(3, 5), 16) / 255, parseInt(g.color.slice(5, 7), 16) / 255];
    const dist = new Map<number, number>(), h = new Heap();
    for (const p of life) if (p.group === gi) {
      const e = emitterOf(p), cell = nearestWater(cellOf, kind, Math.floor(e.x - o.x), Math.floor(e.y - o.y), Math.floor(e.z - o.z));
      if (cell >= 0 && !(dist.get(cell)! <= 0)) { dist.set(cell, 0); h.push(0, cell); }
    }
    while (h.size) {
      const cell = h.pop(), d = h.topKey;
      if (d > dist.get(cell)!) continue;
      coordsInto(cell, at);
      for (const [dx, dy, dz, len] of NEIGHBOURS) {
        const u = cellOf(at[0] + dx, at[1] + dy, at[2] + dz), next = d + len;
        if (u < 0 || !kind[u] || next > g.reach) continue;
        if (next < (dist.get(u) ?? Infinity)) { dist.set(u, next); h.push(next, u); }
      }
    }
    for (const [cell, d] of dist) {
      const f = g.light * (1 - d / g.reach) ** 2;
      glow[cell * 3] = glow[cell * 3]! + rgb[0]! * f; glow[cell * 3 + 1] = glow[cell * 3 + 1]! + rgb[1]! * f; glow[cell * 3 + 2] = glow[cell * 3 + 2]! + rgb[2]! * f;
    }
  });
  void EXTERIOR;
  return { cave, slot, per, kind, path, glow, ms: Date.now() - started };
}

function nearestWater(cellOf: (x: number, y: number, z: number) => number, kind: Uint8Array, gx: number, gy: number, gz: number): number {
  const c = cellOf(gx, gy, gz);
  if (c >= 0 && kind[c]) return c;
  for (const [dx, dy, dz] of NEIGHBOURS) { const u = cellOf(gx + dx, gy + dy, gz + dz); if (u >= 0 && kind[u]) return u; }
  return -1;
}

/** Per-vertex light [daylight, glow r, g, b] for a mesh: each vertex reads
 * the water cell `offset` metres in front of it (or the nearest water cell
 * round that point). Exterior water reads full daylight. */
export function vertexLight(grid: LightGrid, positions: Float32Array, normals: Float32Array, offset: number): Float32Array {
  const cave = grid.cave, l = cave.lattice, n = l.cells / 2, o = l.origin, out = new Float32Array(positions.length / 3 * 4);
  const cellOf = (gx: number, gy: number, gz: number): number => {
    if (gx < 0 || gy < 0 || gz < 0) return -1;
    const cx = Math.floor(gx / n), cy = Math.floor(gy / n), cz = Math.floor(gz / n);
    if (cx >= l.nx || cy >= l.ny || cz >= l.nz) return -1;
    const s = grid.slot[cx + l.nx * (cy + l.ny * cz)]!;
    return s < 0 ? -1 : s * grid.per + (gx - cx * n) + n * ((gy - cy * n) + n * (gz - cz * n));
  };
  for (let v = 0; v < positions.length / 3; v++) {
    const x = positions[v * 3]! + normals[v * 3]! * offset, y = positions[v * 3 + 1]! + normals[v * 3 + 1]! * offset, z = positions[v * 3 + 2]! + normals[v * 3 + 2]! * offset;
    const cell = nearestWater(cellOf, grid.kind, Math.floor(x - o.x), Math.floor(y - o.y), Math.floor(z - o.z));
    if (cell < 0) { out[v * 4] = 0; continue; }
    out[v * 4] = grid.kind[cell] === 2 ? 1 : Math.exp(-grid.path[cell]! / REF);
    out[v * 4 + 1] = grid.glow[cell * 3]!; out[v * 4 + 2] = grid.glow[cell * 3 + 1]!; out[v * 4 + 3] = grid.glow[cell * 3 + 2]!;
  }
  return out;
}

/** Light at a point (nearest water cell), for the camera's fog and tests. */
export function lightAt(grid: LightGrid, p: { x: number; y: number; z: number }): { daylight: number; glow: [number, number, number]; inside: boolean } {
  const v = vertexLight(grid, new Float32Array([p.x, p.y, p.z]), new Float32Array([0, 0, 0]), 0);
  const o = grid.cave.lattice.origin, outside = !grid.cave.field.owned(p.x, p.y, p.z) || p.y > grid.cave.field.floor(p.x, p.z);
  void o;
  return { daylight: outside ? 1 : v[0]!, glow: [v[1]!, v[2]!, v[3]!], inside: !outside };
}
