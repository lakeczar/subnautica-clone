import type { CaveDef } from "../caves.js";
import { caveVolume } from "../caveGeometry.js";
import { DISTANCE_RANGE, REFERENCE_FALLOFF, SUN_DIRECTION, type CaveLightField } from "../../../render/caves/lightField.js";

/** The kit's cave light field (`render/caves/lightField.ts`), copied with its
 * path-length bug fixed (CA-2). Babylon-free.
 *
 * KIT BUG (proposed fix in docs/build/streams/CA-2.md): the daylight path
 * length Dijkstra keeps `distance` in a Float32Array while its heap carries
 * float64 keys, and skips a popped entry when `d > distance[t]`.
 * - Where storage rounds a distance down, the entry that set it is skipped
 *   and never expanded, so whole passages beyond read as unreachable (R = 1,
 *   the darkest band) however close an opening is.
 * - Where it rounds up, stale entries pass the check and re-expand, cascading
 *   through large open water: the west rim cut's field took over ten minutes.
 * The fix is the one line below: `distance` is a Float64Array. Everything
 * else is the kit's code unchanged, so G (sun), B (rock) and A (inside) and
 * the rock grid match it exactly. Drop this module once the kit is fixed. */

const NEIGHBOURS: readonly (readonly [number, number, number, number])[] = (() => {
  const out: [number, number, number, number][] = [];
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
    if (dx || dy || dz) out.push([dx, dy, dz, Math.hypot(dx, dy, dz)]);
  return out;
})();

/** Binary min-heap of (key, value) pairs. */
class Heap {
  private keys: number[] = []; private values: number[] = [];
  get size(): number { return this.keys.length; }
  push(key: number, value: number): void {
    const k = this.keys, v = this.values;
    let i = k.length; k.push(key); v.push(value);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p]! <= key) break;
      k[i] = k[p]!; v[i] = v[p]!; i = p;
    }
    k[i] = key; v[i] = value;
  }
  pop(): [number, number] {
    const k = this.keys, v = this.values, top: [number, number] = [k[0]!, v[0]!];
    const key = k.pop()!, value = v.pop()!, n = k.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1]! < k[c]!) c++;
        if (k[c]! >= key) break;
        k[i] = k[c]!; v[i] = v[c]!; i = c;
      }
      k[i] = key; v[i] = value;
    }
    return top;
  }
}

const fields = new WeakMap<CaveDef, CaveLightField>();
/** The cave's light field, built once per definition: the kit's
 * `caveLightField` with float64 path lengths. `floor` is the exterior
 * heightfield, which shadows sun rays leaving the sampled volume. */
export function caveLightFieldFixed(def: CaveDef, floor: (x: number, z: number) => number): CaveLightField {
  const cached = fields.get(def);
  if (cached) return cached;
  const volume = caveVolume(def), g = volume.grid, f = 2, texel = g.voxel * f;
  const nx = g.nx / f, ny = g.ny / f, nz = g.nz / f, n = nx * ny * nz;
  const fine = (i: number, j: number, k: number): number => i + g.nx * (j + g.ny * k);
  const rockCount = new Uint8Array(n), inside = new Uint8Array(n), outside = new Uint8Array(n), room = new Int16Array(n).fill(-1);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const t = i + nx * (j + ny * k), votes = new Map<number, number>();
    for (let c = 0; c < 8; c++) {
      const at = fine(f * i + (c & 1), f * j + ((c >> 1) & 1), f * k + (c >> 2));
      if (volume.solid[at]) { rockCount[t] = rockCount[t]! + 1; continue; }
      const r = volume.room[at]!;
      if (r) { inside[t] = inside[t]! + 1; votes.set(r - 1, (votes.get(r - 1) ?? 0) + 1); } else outside[t] = outside[t]! + 1;
    }
    let best = 0;
    for (const [r, count] of votes) if (count > best) { best = count; room[t] = r; }
  }
  // Daylight path length: shortest path through water from open water.
  const scale = def.rooms.map(r => REFERENCE_FALLOFF / r.falloff);
  const distance = new Float64Array(n).fill(Infinity), heap = new Heap();
  for (let t = 0; t < n; t++) if (rockCount[t]! < 8 && outside[t]! >= inside[t]!) { distance[t] = 0; heap.push(0, t); }
  while (heap.size) {
    const [d, t] = heap.pop();
    if (d > distance[t]!) continue;
    const i = t % nx, j = Math.floor(t / nx) % ny, k = Math.floor(t / (nx * ny));
    for (const [dx, dy, dz, len] of NEIGHBOURS) {
      const a = i + dx, b = j + dy, c = k + dz;
      if (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz) continue;
      const u = a + nx * (b + ny * c);
      if (rockCount[u] === 8) continue;
      const r = room[u]!, next = d + len * texel * (r >= 0 ? scale[r]! : 1);
      if (next < distance[u]!) { distance[u] = next; heap.push(next, u); }
    }
  }
  // Direct sun along the cel light direction, from each water voxel.
  const sun = new Float32Array(n), step = g.voxel * 0.5, top = g.origin.y + g.ny * g.voxel;
  const sees = (x: number, y: number, z: number): boolean => {
    for (let s = 0; s < 400; s++) {
      x += SUN_DIRECTION.x * step; y += SUN_DIRECTION.y * step; z += SUN_DIRECTION.z * step;
      if (y >= top) return true;
      const i = Math.floor((x - g.origin.x) / g.voxel), j = Math.floor((y - g.origin.y) / g.voxel), k = Math.floor((z - g.origin.z) / g.voxel);
      if (i < 0 || k < 0 || i >= g.nx || k >= g.nz || j < 0) { if (y < floor(x, z)) return false; continue; }
      const at = fine(i, j, k);
      if (volume.solid[at]) return false;
      if (!volume.room[at]) return true;
    }
    return true;
  };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const t = i + nx * (j + ny * k);
    if (rockCount[t] === 8) continue;
    if (!inside[t]) { sun[t] = 1; continue; }
    let lit = 0, water = 0;
    for (let c = 0; c < 8; c++) {
      const fi = f * i + (c & 1), fj = f * j + ((c >> 1) & 1), fk = f * k + (c >> 2);
      if (volume.solid[fine(fi, fj, fk)]) continue;
      water++;
      if (sees(g.origin.x + (fi + 0.5) * g.voxel, g.origin.y + (fj + 0.5) * g.voxel, g.origin.z + (fk + 0.5) * g.voxel)) lit++;
    }
    sun[t] = lit / water;
  }
  // Rock texels read the nearest water texel (breadth-first through rock).
  const source = new Int32Array(n).fill(-1);
  let frontier: number[] = [];
  for (let t = 0; t < n; t++) if (rockCount[t]! < 8) { source[t] = t; frontier.push(t); }
  const steps = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;
  while (frontier.length) {
    const next: number[] = [];
    for (const t of frontier) {
      const i = t % nx, j = Math.floor(t / nx) % ny, k = Math.floor(t / (nx * ny));
      for (const [dx, dy, dz] of steps) {
        const a = i + dx, b = j + dy, c = k + dz;
        if (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz) continue;
        const u = a + nx * (b + ny * c);
        if (source[u] !== -1) continue;
        source[u] = source[t]!; next.push(u);
      }
    }
    frontier = next;
  }
  const data = new Uint8Array(n * 4), byte = (v: number): number => Math.max(0, Math.min(255, Math.round(v * 255)));
  for (let t = 0; t < n; t++) {
    const w = source[t]!, d = w < 0 ? DISTANCE_RANGE : Math.min(distance[w]!, DISTANCE_RANGE);
    const water = inside[w]! + outside[w]!;
    data[t * 4] = byte(d / DISTANCE_RANGE);
    data[t * 4 + 1] = byte(w < 0 ? 0 : sun[w]!);
    data[t * 4 + 2] = byte(rockCount[t]! / 8);
    data[t * 4 + 3] = byte(w < 0 || !water ? 0 : inside[w]! / water);
  }
  const field: CaveLightField = {
    caveId: def.id, min: { ...g.origin }, size: { x: nx * texel, y: ny * texel, z: nz * texel }, texel, nx, ny, nz, data,
    rock: { min: { ...g.origin }, voxel: g.voxel, nx: g.nx, ny: g.ny, nz: g.nz, data: volume.solid.map(v => v ? 255 : 0) },
  };
  fields.set(def, field);
  return field;
}

