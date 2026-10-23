// Shared by tests/cave-light.test.ts and its heavy tier file (TT-1); not a test file itself.
import { caveVolume } from "../src/content/regions/caveGeometry.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import type { Vec3, WorldQueries } from "../src/sim/types.js";
import { caveDaylight, caveLightField, sampleLightField, type CaveLightField } from "../src/render/caves/lightField.js";
import { def, DIVER, insideFootprint, roomAt, shift, SHIFT } from "./cave-support.js";

export const field: CaveLightField = caveLightField(def, worldFloor);

/** The glow a diver reads with the lamp off: path-length daylight only. A
 * sun pool also reads 1, so it guides nothing (R1-01). */
export const glow = (p: Vec3): number => { const c = sampleLightField(field, p); return caveDaylight(c.r, 0, c.a); };

/** Open water between two points: the fine voxels along it are not rock. */
export function clearSight(a: Vec3, b: Vec3): boolean {
  const v = caveVolume(def), g = v.grid, steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 0.25);
  for (let s = 1; s < steps; s++) {
    const t = s / steps, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
    const i = Math.floor((x - g.origin.x) / g.voxel), j = Math.floor((y - g.origin.y) / g.voxel), k = Math.floor((z - g.origin.z) / g.voxel);
    if (i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz) continue;
    if (v.solid[i + g.nx * (j + g.ny * k)]) return false;
  }
  return true;
}

export const head = (p: Vec3): Vec3 => ({ ...p, y: p.y + 0.6 });

/** The lamp-off retreat. The policy uses only what an unlit diver sees: from
 * the current pose, among water in clear sight within 7 m whose glow is
 * brighter, take the brightest one the full diver can actually reach: the
 * destination must clear and the sweep from the last accepted pose must
 * arrive. Success is clear exterior water entered through a mouth or the
 * skylight. Returns each start's outcome. */
export function retreat(q: WorldQueries, starts: readonly Vec3[]): { failures: string[]; exits: Record<string, number>; hops: number } {
  const exterior = (p: Vec3): boolean => roomAt(p) === "" && roomAt(head(p)) === "" && roomAt({ ...p, y: p.y + 0.95 }) === "";
  const rank = (p: Vec3): number => glow(head(p)) + (exterior(p) ? 0.01 : 0); // open water outside tops a lit pool inside
  const v = caveVolume(def), g = v.grid, spots: { p: Vec3; rank: number }[] = [];
  for (let k = 0; k < g.nz; k += 2) for (let j = 0; j < g.ny; j += 2) for (let i = 0; i < g.nx; i += 2) {
    if (v.solid[i + g.nx * (j + g.ny * k)]) continue;
    const p = { x: g.origin.x + (i + 0.5) * g.voxel, y: g.origin.y + (j + 0.5) * g.voxel, z: g.origin.z + (k + 0.5) * g.voxel };
    if (q.clearance(shift(p), DIVER)) spots.push({ p, rank: rank(p) });
  }
  const openings = def.portals.filter(o => o.kind === "mouth" || o.kind === "skylight");
  const openingOf = (a: Vec3, b: Vec3): string | null => {
    for (let s = 0; s <= 40; s++) {
      const t = s / 40, w = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
      if (roomAt(w) !== "") continue;
      return openings.find(o => {
        const along = (w.x - o.center.x) * o.normal.x + (w.y - o.center.y) * o.normal.y + (w.z - o.center.z) * o.normal.z;
        const off = { x: w.x - o.center.x - o.normal.x * along, y: w.y - o.center.y - o.normal.y * along, z: w.z - o.center.z - o.normal.z * along };
        return Math.abs(along) < 3 && Math.hypot(off.x, off.y, off.z) < Math.hypot(o.clear.width, o.clear.height) / 2 + 1.5;
      })?.id ?? null;
    }
    return null;
  };
  const failures: string[] = [], exits: Record<string, number> = {};
  let hops = 0;
  for (const start of starts) {
    if (!q.clearance(shift(start), DIVER)) { failures.push(`start ${JSON.stringify(start)} is not a diver pose`); continue; }
    let at = start, exit: string | null = null, lost: string | null = null;
    for (let hop = 0; !exterior(at); hop++) {
      if (hop >= 25) { lost = `lost from ${JSON.stringify(start)} at ${JSON.stringify(at)}`; break; }
      const here = rank(at);
      const options = spots.filter(o => o.rank > here + 1e-3 && Math.hypot(o.p.x - at.x, o.p.y - at.y, o.p.z - at.z) <= 7)
        .sort((x, y) => y.rank - x.rank || Math.hypot(x.p.x - at.x, x.p.z - at.z) - Math.hypot(y.p.x - at.x, y.p.z - at.z));
      let next: Vec3 | null = null;
      for (const o of options) {
        if (!clearSight(head(at), head(o.p))) continue;
        const r = q.moveCapsule(shift(at), { x: o.p.x - at.x, y: o.p.y - at.y, z: o.p.z - at.z }, DIVER);
        if (r.hitSolid || r.hitBoundary || Math.hypot(r.position.x - SHIFT.x - o.p.x, r.position.y - o.p.y, r.position.z - SHIFT.z - o.p.z) > 1e-6) continue;
        next = o.p; break;
      }
      if (!next) { lost = `no brighter water a diver can reach from ${JSON.stringify(at)} (glow ${here.toFixed(2)})`; break; }
      if (exterior(next)) exit = openingOf(at, next);
      at = next; hops++;
    }
    if (lost) failures.push(lost);
    else if (!exit) failures.push(`left ${JSON.stringify(start)} without passing a mouth or the skylight`);
    else if (!q.clearance(shift(at), DIVER) || glow(head(at)) !== 1) failures.push(`arrival ${JSON.stringify(at)} is not clear lit water`);
    else exits[exit] = (exits[exit] ?? 0) + 1;
  }
  return { failures, exits, hops };
}

/** Every metre along both routes, inside the cave. */
export const retreatStarts: Vec3[] = def.routes.flatMap(r => r.path.slice(1).flatMap((b, i) => {
  const a = r.path[i]!, n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  return Array.from({ length: n }, (_, s) => ({ x: a.x + (b.x - a.x) * s / n, y: a.y + (b.y - a.y) * s / n, z: a.z + (b.z - a.z) * s / n }));
})).filter(p => insideFootprint(p) && roomAt(head(p)) !== "");
