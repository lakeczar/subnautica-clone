import type { Solid } from "../../../sim/world.js";
import type { Aabb, Rect, Vec3 } from "../../types.js";
import { sweepBoxBox, type SweepHit } from "./collision.js";
import type { CaveCollider } from "./compose.js";

/** The W1 small-cave kit (thick rock boxes, one owned footprint) as a
 * `CaveCollider`, so small and medium caves and cave biomes share one
 * composer (`composeCaveWorld`). Like W1's prototype adapter, the exterior
 * ground in a band round the footprint becomes 0.5 m column boxes topped at
 * the highest of nine floor samples, so a shape touching the footprint is
 * answered over its whole box by this collider alone. */

export interface BoxCaveOwner {
  readonly id: string;
  readonly footprint: Rect;
  /** The heightfield steps aside below this inside the footprint. */
  readonly baseY: number;
  readonly rock: readonly Solid[];
}

const CELL = 0.5, BUCKET = 4;

export function boxCaveCollider(owner: BoxCaveOwner, floor: (x: number, z: number) => number, band: number): CaveCollider {
  const f = owner.footprint;
  const inFoot = (x: number, z: number): boolean => x >= f.minX && x < f.maxX && z >= f.minZ && z < f.maxZ;
  const boxes: Solid[] = [...owner.rock];
  for (let x = f.minX - band; x < f.maxX + band - 1e-9; x += CELL)
    for (let z = f.minZ - band; z < f.maxZ + band - 1e-9; z += CELL) {
      if (inFoot(x + CELL / 2, z + CELL / 2)) continue;
      let top = -Infinity, low = Infinity;
      for (let i = 0; i <= 2; i++) for (let k = 0; k <= 2; k++) { const h = floor(x + i * CELL / 2, z + k * CELL / 2); top = Math.max(top, h); low = Math.min(low, h); }
      boxes.push({ id: `${owner.id}.collar.${boxes.length}`, min: { x, y: Math.min(owner.baseY, low - 4), z }, max: { x: x + CELL, y: top + 0.02, z: z + CELL } });
    }
  // A 4 m X/Z bucket grid over every box.
  const buckets = new Map<string, Solid[]>();
  for (const b of boxes)
    for (let i = Math.floor(b.min.x / BUCKET); i <= Math.floor(b.max.x / BUCKET); i++)
      for (let k = Math.floor(b.min.z / BUCKET); k <= Math.floor(b.max.z / BUCKET); k++) {
        const key = `${i}:${k}`;
        (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(b);
      }
  const near = (box: Aabb): Solid[] => {
    const out = new Set<Solid>();
    for (let i = Math.floor(box.min.x / BUCKET); i <= Math.floor(box.max.x / BUCKET); i++)
      for (let k = Math.floor(box.min.z / BUCKET); k <= Math.floor(box.max.z / BUCKET); k++)
        for (const b of buckets.get(`${i}:${k}`) ?? [])
          if (b.min.y <= box.max.y && b.max.y >= box.min.y && b.min.x <= box.max.x && b.max.x >= box.min.x && b.min.z <= box.max.z && b.max.z >= box.min.z) out.add(b);
    return [...out];
  };
  const hit: SweepHit = { t: 0, nx: 0, ny: 0, nz: 0, start: false };
  return {
    id: owner.id,
    baseY: owner.baseY,
    touches: b => b.min.x < f.maxX && b.max.x > f.minX && b.min.z < f.maxZ && b.max.z > f.minZ,
    sweep(c, e, d, skin, out) {
      const r = skin + 0.01;
      const swept: Aabb = { min: { x: c.x - e.x + Math.min(0, d.x) - r, y: c.y - e.y + Math.min(0, d.y) - r, z: c.z - e.z + Math.min(0, d.z) - r },
        max: { x: c.x + e.x + Math.max(0, d.x) + r, y: c.y + e.y + Math.max(0, d.y) + r, z: c.z + e.z + Math.max(0, d.z) + r } };
      let found = false;
      for (const b of near(swept)) if (sweepBoxBox(c.x, c.y, c.z, e.x, e.y, e.z, d.x, d.y, d.z, b.min, b.max, skin, hit) && (!found || hit.t < out.t)) {
        Object.assign(out, hit); found = true;
      }
      return found;
    },
    blocked(c, e) {
      const t = 0.001;
      return near({ min: { x: c.x - e.x, y: c.y - e.y, z: c.z - e.z }, max: { x: c.x + e.x, y: c.y + e.y, z: c.z + e.z } }).some(b =>
        c.x + e.x > b.min.x + t && c.x - e.x < b.max.x - t && c.y + e.y > b.min.y + t && c.y - e.y < b.max.y - t && c.z + e.z > b.min.z + t && c.z - e.z < b.max.z - t);
    },
    segmentClear(a, b) {
      const box: Aabb = { min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) }, max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) } };
      return !near(box).some(s => segmentHitsBox(a, b, s));
    },
    support(x, z, fromY) {
      let h = -Infinity;
      for (const b of near({ min: { x, y: -1e4, z }, max: { x, y: fromY, z } }))
        if (x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z && b.max.y <= fromY) h = Math.max(h, b.max.y);
      return h;
    },
    masksGround: inFoot,
    ownsPoint: (p: Vec3) => inFoot(p.x, p.z),
  };
}

function segmentHitsBox(a: Vec3, b: Vec3, s: Solid): boolean {
  let t0 = 0, t1 = 1;
  for (const k of ["x", "y", "z"] as const) {
    const d = b[k] - a[k];
    if (Math.abs(d) < 1e-12) { if (a[k] <= s.min[k] || a[k] >= s.max[k]) return false; continue; }
    let u = (s.min[k] - a[k]) / d, w = (s.max[k] - a[k]) / d;
    if (u > w) { const q = u; u = w; w = q; }
    t0 = Math.max(t0, u); t1 = Math.min(t1, w);
    if (t0 >= t1) return false;
  }
  return true;
}
