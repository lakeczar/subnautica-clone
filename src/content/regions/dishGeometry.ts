import type { Aabb, Vec3 } from "../../world/types.js";
import { hash2 } from "./noise.js";
import { worldFloor } from "./worldFloor.js";
import { beam, block, pieceSolids, v, type VistaBlock, type VistaFacet, type VistaPiece, type VistaTone } from "../vistaKit.js";

/** The Basin's fallen survey dishes as one source for art and collision
 * (`render/biomes/structures.ts` draws exactly these shapes at every LOD;
 * `structures.ts` collides them):
 * - the rim, feed tripod and horn are prisms and the hub and grounding fins
 *   blocks (where the dish sites' poses and passages leave no room for a
 *   standing feed, it lies fallen in the silt by the rim), collided as A1's vistas are: no art outside its solids, no solid
 *   more than 0.35 m off the art;
 * - the bowl's porcelain panels are collided by small boxes, each the bounds
 *   of a cell of one panel, that stand at most `BOWL_STANDOFF` off the panel. Hugging a tilted, curved bowl to 0.35 m would take 10-12k
 *   boxes and slow every sweep near a dish 25-90 times (owner, 2026-10-22:
 *   1.0 m for the bowl). The bowl's hollow stays open water: the dish sites'
 *   work and park poses are inside it. */
export interface DishParams { readonly id: string; readonly x: number; readonly z: number; readonly base: number;
  readonly radius: number; readonly tilt: number; readonly facing: number }
export interface DishArt {
  readonly blocks: readonly VistaBlock[];
  /** Rim, tripod and horn. */
  readonly pieces: readonly VistaPiece[];
  /** Bowl panel triangles (drawn two-sided by the cel pass). */
  readonly bowl: readonly VistaFacet[];
  /** Which of the rim's `DISH_SEGMENTS` segments are drawn (a passage may
   * have broken some away). */
  readonly rimKept: readonly boolean[];
  /** Collision: the blocks' and prisms' boxes (within 0.35 m), the bowl's
   * (within `BOWL_STANDOFF`). */
  readonly solids: { readonly frame: readonly Aabb[]; readonly bowl: readonly Aabb[] };
}
/** Bowl panels: segments round, rings out. One resolution at every LOD, so
 * the collision matches what is drawn near and far. */
export const DISH_SEGMENTS = 16, DISH_RINGS = 5;
export const RIM_HALF = 0.35, BOWL_STANDOFF = 1;
/** Focal lengths tried for the feed, as fractions of the radius. */
export const FEED_FOCI = [0.62, 0.75, 0.9, 1.05, 1.2, 1.35];

/** The dish's frame: its bowl is a shallow paraboloid of revolution, tilted
 * by `tilt` about the horizontal axis square to `facing` (lifting the far
 * side), and raised so the low rim clears the hub. */
export function dishPoint(p: DishParams, local: readonly [number, number, number]): Vec3 {
  const ax = [Math.cos(p.facing), 0, Math.sin(p.facing)] as const, c = [p.x, p.base + 2.2, p.z] as const;
  const along = local[0] * ax[0] + local[2] * ax[2], perp = [local[0] - along * ax[0], local[2] - along * ax[2]] as const;
  const ca = Math.cos(p.tilt), sa = Math.sin(p.tilt), a2 = along * ca - local[1] * sa, y2 = along * sa + local[1] * ca;
  return v(c[0] + perp[0] + a2 * ax[0], c[1] + y2 + sa * p.radius * 0.5, c[2] + perp[1] + a2 * ax[2]);
}
/** Ring `k` (0 = centre, `DISH_RINGS` = rim) at segment `i`. */
export function bowlPoint(p: DishParams, k: number, i: number): Vec3 {
  const r = p.radius * k / DISH_RINGS, t = i / DISH_SEGMENTS * Math.PI * 2;
  return dishPoint(p, [Math.cos(t) * r, r * r / p.radius * 0.32, Math.sin(t) * r]);
}
/** The rim's centre line, closed (first point repeated). */
export const rimLine = (p: DishParams): Vec3[] => Array.from({ length: DISH_SEGMENTS + 1 }, (_, i) => bowlPoint(p, DISH_RINGS, i));

/** The dish's shapes and their collision. A part whose collision `blocked`
 * rejects (a passage or rescue tether runs there) is left out: a missing
 * panel, a broken rim, a fallen leg. */
export function dishArt(p: DishParams, blocked: (box: Aabb) => boolean = () => false): DishArt {
  const bowl: VistaFacet[] = [];
  for (let k = 0; k < DISH_RINGS; k++) for (let i = 0; i < DISH_SEGMENTS; i++) {
    const tone: VistaTone = hash2(i, k + 1, p.id.length) > 0.82 ? "steel" : (k + 1 + (i >> 1)) % 3 === 0 ? "shell" : "porcelain";
    const a = bowlPoint(p, k, i + 1), b = bowlPoint(p, k + 1, i + 1), c = bowlPoint(p, k + 1, i), d = bowlPoint(p, k, i);
    // The centre ring is a single point: its panels are triangles.
    bowl.push({ pts: [a, b, c], tone });
    if (k > 0) bowl.push({ pts: [a, c, d], tone });
  }
  const rim = rimLine(p);
  // The feed: a tripod from the rim to the focus and a horn under it. The
  // first focal length and tripod azimuth that clear every passage and pose
  // stands; with none, the feed has fallen.
  const feed = (f: number, turn: number): VistaPiece[] => {
    const focus = dishPoint(p, [0, p.radius * f, 0]), mouth = dishPoint(p, [0, p.radius * (f - 0.07), 0]);
    return [...[0, 1, 2].flatMap(i => beam([rim[(Math.floor(i * DISH_SEGMENTS / 3) + turn) % DISH_SEGMENTS]!, focus], () => [0.18, 0.18, 0.08], () => "metal")),
      ...beam([focus, mouth], () => [0.7, 0.7, 0.25], () => "ochre")];
  };
  const feeds = FEED_FOCI.flatMap(f => Array.from({ length: DISH_SEGMENTS / 3 + 1 }, (_, turn) => feed(f, turn)));
  const standing = feeds.find(parts => !parts.some(part => pieceSolids(part).some(blocked))) ?? fallenFeed(p, blocked);
  const pieces: VistaPiece[] = [...beam(rim, () => [RIM_HALF, RIM_HALF, 0.15], () => "petrol"), ...standing];
  const hub = p.radius * 0.14, blocks: VistaBlock[] = [block(v(p.x - hub, p.base, p.z - hub), v(p.x + hub, p.base + 3.2, p.z + hub), "petrol")];
  // Grounding fins hang under the rim, squared to the nearer world axis.
  for (let i = 0; i < 8; i++) {
    const t = (i + 0.3) / 8 * Math.PI * 2, q = bowlPoint(p, DISH_RINGS, (i + 0.3) / 8 * DISH_SEGMENTS);
    const [hx, hz] = Math.abs(Math.cos(t)) >= Math.abs(Math.sin(t)) ? [0.09, 0.7] : [0.7, 0.09];
    blocks.push(block(v(q.x - hx, q.y - 2, q.z - hz), v(q.x + hx, q.y - RIM_HALF, q.z + hz), "metal"));
  }
  const keep = <T>(parts: readonly T[], solids: (part: T) => Aabb[]): { kept: T[]; boxes: Aabb[] } => {
    const kept: T[] = [], boxes: Aabb[] = [];
    for (const part of parts) { const b = solids(part); if (!b.some(blocked)) { kept.push(part); boxes.push(...b); } }
    return { kept, boxes };
  };
  // A rim segment whose neighbour is broken away shows its end cap: thin
  // slabs there, so the cap's corners don't stand off it.
  const rimGone = pieces.slice(0, DISH_SEGMENTS).map(r => pieceSolids(r).some(blocked));
  const open = pieces.map((piece, i) => i < DISH_SEGMENTS && (rimGone[(i + 1) % DISH_SEGMENTS] || rimGone[(i + DISH_SEGMENTS - 1) % DISH_SEGMENTS])
    ? { ...piece, step: Math.min(piece.step, 0.1) } : piece);
  const k = keep(blocks, b => [{ min: b.min, max: b.max }]), q = keep(open, pieceSolids), w = keep(panels(bowl), panelSolids);
  const rimKept = rimGone.map(gone => !gone);
  return { blocks: k.kept, pieces: q.kept, bowl: w.kept.flat(), rimKept, solids: { frame: [...k.boxes, ...q.boxes], bowl: w.boxes } };
}

/** A feed that has fallen: its horn on its side in the silt just past the
 * rim and three broken legs splayed from it, each laid along the floor. The
 * first spot round the rim (from the dish's low side) that `blocked` allows. */
function fallenFeed(p: DishParams, blocked: (box: Aabb) => boolean): VistaPiece[] {
  const along = (a: Vec3, ux: number, uz: number, len: number, lift: number): Vec3[] => {
    const n = Math.max(1, Math.ceil(len / 3));
    return Array.from({ length: n + 1 }, (_, i) => { const t = len * i / n, x = a.x + ux * t, z = a.z + uz * t; return v(x, worldFloor(x, z) + lift, z); });
  };
  for (let k = 0; k < 16; k++) {
    const a = p.facing + Math.PI + k * Math.PI / 8, ux = Math.cos(a), uz = Math.sin(a), tx = -uz, tz = ux;
    const c = v(p.x + ux * (p.radius + 5), 0, p.z + uz * (p.radius + 5)), mouth = v(c.x - tx * 1.6, 0, c.z - tz * 1.6);
    // The horn lies level, on the higher of its two ends.
    const hx = mouth.x + tx * 3.2, hz = mouth.z + tz * 3.2, hy = Math.max(worldFloor(mouth.x, mouth.z), worldFloor(hx, hz)) + 0.4;
    const parts: VistaPiece[] = [
      ...beam([v(mouth.x, hy, mouth.z), v(hx, hy, hz)], () => [0.45, 0.45, 0.1], () => "ochre"),
      ...[-0.45, 0.05, 0.5].flatMap((s, i) => {
        const end = v(mouth.x + tx * 3.2, 0, mouth.z + tz * 3.2), dx = Math.cos(Math.atan2(tz, tx) + s), dz = Math.sin(Math.atan2(tz, tx) + s);
        return beam(along(end, dx, dz, p.radius * (0.35 + 0.1 * i), 0.22), () => [0.18, 0.18, 0.08], () => "metal");
      }),
    ];
    // Laid on uneven silt, the pieces bend at every joint: collide them in
    // thin slabs so no slab corner stands off a bend.
    const thin = parts.map(part => ({ ...part, step: Math.min(part.step, 0.1) }));
    if (!thin.some(part => pieceSolids(part).some(blocked))) return thin;
  }
  return [];
}

const sub = (a: Vec3, b: Vec3): Vec3 => v(a.x - b.x, a.y - b.y, a.z - b.z);
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
/** Distance from `p` to triangle abc (closest point by Voronoi region). */
export function triangleDistance(p: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  const at = (o: Vec3, d: Vec3, t: number): Vec3 => v(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t), len = (q: Vec3): number => Math.sqrt(dot(q, q));
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return len(ap);
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return len(bp);
  if (d1 * d4 - d3 * d2 <= 0 && d1 >= 0 && d3 <= 0) return len(sub(p, at(a, ab, d1 / (d1 - d3))));
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return len(cp);
  if (d5 * d2 - d1 * d6 <= 0 && d2 >= 0 && d6 <= 0) return len(sub(p, at(a, ac, d2 / (d2 - d6))));
  if (d3 * d6 - d5 * d4 <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return len(sub(p, at(b, sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6)))));
  const n = v(ab.y * ac.z - ab.z * ac.y, ab.z * ac.x - ab.x * ac.z, ab.x * ac.y - ab.y * ac.x);
  return Math.abs(dot(n, ap)) / len(n);
}
/** Boxes over one bowl panel (a quad of two triangles, or the centre's
 * triangles): the panel is cut into a x b cells along its own edges, with
 * the fewest cells for which every corner of every cell's bounds lies within
 * `BOWL_STANDOFF` (less a 5 cm margin) of the panel. */
export function panelSolids(tris: readonly VistaFacet[]): Aabb[] {
  const [a, b, c] = tris[0]!.pts as [Vec3, Vec3, Vec3], d = tris[1] ? tris[1].pts[2]! : a;
  const near = (q: Vec3): number => Math.min(...tris.map(t => triangleDistance(q, t.pts[0]!, t.pts[1]!, t.pts[2]!)));
  // Bilinear over the panel: d-a along u, b-a toward c along w.
  const at = (u: number, w: number): Vec3 => {
    const p0 = v(a.x + (d.x - a.x) * u, a.y + (d.y - a.y) * u, a.z + (d.z - a.z) * u), p1 = v(b.x + (c.x - b.x) * u, b.y + (c.y - b.y) * u, b.z + (c.z - b.z) * u);
    return v(p0.x + (p1.x - p0.x) * w, p0.y + (p1.y - p0.y) * w, p0.z + (p1.z - p0.z) * w);
  };
  const cells = (na: number, nb: number): Aabb[] | null => {
    const out: Aabb[] = [];
    for (let i = 0; i < na; i++) for (let j = 0; j < nb; j++) {
      const q = [at(i / na, j / nb), at((i + 1) / na, j / nb), at(i / na, (j + 1) / nb), at((i + 1) / na, (j + 1) / nb)];
      const lo = { x: Math.min(...q.map(r => r.x)), y: Math.min(...q.map(r => r.y)), z: Math.min(...q.map(r => r.z)) };
      const hi = { x: Math.max(...q.map(r => r.x)), y: Math.max(...q.map(r => r.y)), z: Math.max(...q.map(r => r.z)) };
      // A minimum thickness, as the vista slabs keep, so a level panel still blocks.
      for (const k of ["x", "y", "z"] as const) { const m = Math.max(0.005, (0.1 - (hi[k] - lo[k])) / 2); lo[k] -= m; hi[k] += m; }
      for (const x of [lo.x, hi.x]) for (const y of [lo.y, hi.y]) for (const z of [lo.z, hi.z]) if (near(v(x, y, z)) > BOWL_STANDOFF - 0.05) return null;
      out.push({ min: lo, max: hi });
    }
    return out;
  };
  for (let n = 1; n <= 400; n++) for (let na = 1; na <= n; na++) {
    if (n % na) continue;
    const got = cells(na, n / na);
    if (got) return got;
  }
  throw new Error("panelSolids: no tiling within 400 cells");
}
/** The bowl's panels as drawn: the centre ring's single triangles, then each
 * quad's two triangles. */
function panels(bowl: readonly VistaFacet[]): VistaFacet[][] {
  const out: VistaFacet[][] = [];
  for (let i = 0; i < bowl.length;) {
    const k0 = i < DISH_SEGMENTS;
    out.push(k0 ? [bowl[i]!] : [bowl[i]!, bowl[i + 1]!]);
    i += k0 ? 1 : 2;
  }
  return out;
}
/** Where scatter must not grow round a dish: a ring of rim footings and the
 * hub, as S2 first laid them. Kept apart from collision so the dressing
 * round the dishes, and its build cost, stay as they were. */
export function dishScatterKeep(p: DishParams, footing: (x: number, z: number) => number): Aabb[] {
  const out: Aabb[] = [], n = 12, seg = 2 * Math.PI * p.radius / n;
  for (let i = 0; i < n; i++) {
    const a = (i + 0.5) / n * Math.PI * 2, rise = p.radius * Math.sin(p.tilt) * (1 + Math.cos(a - p.facing)) / 2;
    const cx = p.x + Math.cos(a) * p.radius, cz = p.z + Math.sin(a) * p.radius, lo = footing(cx, cz) - 0.4, top = p.base + 2.2 + rise;
    const half = Math.max(1.2, seg * 0.36);
    out.push({ min: v(cx - half, Math.min(lo, top - 2), cz - half), max: v(cx + half, top, cz + half) });
  }
  const hub = p.radius * 0.14;
  out.push({ min: v(p.x - hub, p.base, p.z - hub), max: v(p.x + hub, p.base + 3.2, p.z + hub) });
  return out;
}
