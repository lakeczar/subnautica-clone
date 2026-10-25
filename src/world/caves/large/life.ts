import type { LargeCaveLife } from "../../../content/caves/largeCave.js";
import type { LargeCave } from "./build.js";
import { chunkBox, type ChunkCoord } from "./mesh.js";
import { seedOf } from "./field.js";

/** Glowing life placement (Babylon-free, deterministic).
 *
 * Each authored life group scatters onto fine-mesh vertices within its
 * radius whose facing suits its kind (fronds and silt glow on floors, root
 * tips under ceilings, colonies on walls), picked by a positional hash with a
 * minimum spacing. A placement is an anchor, a normal, a size and an emitter
 * point a little off the rock, which the light grid lights through water. */

export interface LifePlacement {
  readonly group: number;
  readonly kind: LargeCaveLife["kind"];
  readonly position: { x: number; y: number; z: number };
  readonly normal: { x: number; y: number; z: number };
  readonly size: number;
  /** Turn about the normal, radians. */
  readonly spin: number;
}

const FACING: Record<LargeCaveLife["kind"], (ny: number) => boolean> = {
  frond: ny => ny > 0.55,
  silt_glow: ny => ny > 0.7,
  root_tip: ny => ny < -0.45,
  colony: ny => Math.abs(ny) < 0.6,
};
const SPACING: Record<LargeCaveLife["kind"], number> = { frond: 0.9, silt_glow: 1.4, root_tip: 1.1, colony: 0.9 };

function hash(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(Math.round(x * 64), 374761393) ^ Math.imul(Math.round(y * 64), 1103515245) ^ Math.imul(Math.round(z * 64), 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Place every life group of the cave. Needs fine meshes for the chunks the
 * groups reach (built on demand through `cave.mesh`). */
export function placeLife(cave: LargeCave): LifePlacement[] {
  const out: LifePlacement[] = [];
  cave.source.life.forEach((g, gi) => {
    const seed = seedOf(g.id), facing = FACING[g.kind], spacing = SPACING[g.kind];
    const cands: { x: number; y: number; z: number; nx: number; ny: number; nz: number; h: number }[] = [];
    for (const c of chunksInSphere(cave, g.at, g.radius)) {
      const m = cave.mesh(c, "fine"), P = m.positions, N = m.normals, Z = m.zones;
      for (let v = 0; v < P.length / 3; v++) {
        const x = P[v * 3]!, y = P[v * 3 + 1]!, z = P[v * 3 + 2]!;
        if (Math.hypot(x - g.at.x, y - g.at.y, z - g.at.z) > g.radius || !facing(N[v * 3 + 1]!) || Z[v] === 0) continue;
        cands.push({ x, y, z, nx: N[v * 3]!, ny: N[v * 3 + 1]!, nz: N[v * 3 + 2]!, h: hash(x, y, z, seed) });
      }
    }
    cands.sort((a, b) => a.h - b.h || a.x - b.x || a.y - b.y || a.z - b.z);
    const kept: typeof cands = [];
    for (const c of cands) {
      if (kept.length >= g.count) break;
      if (kept.some(k => Math.hypot(k.x - c.x, k.y - c.y, k.z - c.z) < spacing)) continue;
      kept.push(c);
    }
    for (const k of kept) out.push({ group: gi, kind: g.kind, position: { x: k.x, y: k.y, z: k.z },
      normal: { x: k.nx, y: k.ny, z: k.nz }, size: 0.6 + 0.8 * hash(k.z, k.x, k.y, seed + 1), spin: hash(k.y, k.z, k.x, seed + 2) * Math.PI * 2 });
  });
  return out;
}

export function chunksInSphere(cave: LargeCave, p: { x: number; y: number; z: number }, r: number): ChunkCoord[] {
  return cave.chunks.filter(c => {
    const b = chunkBox(cave.lattice, c);
    const dx = Math.max(b.min.x - p.x, 0, p.x - b.max.x), dy = Math.max(b.min.y - p.y, 0, p.y - b.max.y), dz = Math.max(b.min.z - p.z, 0, p.z - b.max.z);
    return Math.hypot(dx, dy, dz) <= r + 1;
  });
}

/** The point a placement lights from: half a metre off the rock. */
export const emitterOf = (p: LifePlacement): { x: number; y: number; z: number } =>
  ({ x: p.position.x + p.normal.x * 0.5, y: p.position.y + p.normal.y * 0.5, z: p.position.z + p.normal.z * 0.5 });
