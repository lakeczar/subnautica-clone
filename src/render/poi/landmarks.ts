import { ROUTES } from "../../content/regions/passages.js";
import { STRUCTURES, type StructureDef } from "../../content/regions/structures.js";
import { riftAxisAt } from "../../content/poi/sets.js";
import { VISTA_SETS, type VistaPiece } from "../../content/vistas.js";
import type { Vec3 } from "../../world/types.js";
import type { P3, RecipeBuilder, Rgb } from "../biomes/recipe.js";
import type { VistaPart } from "../biomes/vistas.js";
import { C, lit } from "./dressing.js";

/** Landmark lights (POI-1): in ATM-1's dark, big silhouettes vanish past
 * about 120 m, but lights survive the fog far longer (an unlit lamp keeps
 * 6–10% of its colour at 250–300 m, against about 9% contrast for the
 * shape itself). So each major landmark carries running lights along its
 * edges, and its outline reads as lights:
 * - the Meridian spire: amber lamps up all four faces;
 * - the Divide gateworks: lilac lamps on the towers' corners and caps, and
 *   a band along both faces of the lintel;
 * - the Rift head and cliff walls: ember seams along both walls;
 * - the Basin dishes: amber lamps round each rim;
 * - the wreck ridge's two ribbed hulls: work lamps on the keel and crowns.
 *
 * Every lamp hugs what already exists: a structure's or vista's collision
 * (within 0.1 m), the terrain, or (the dishes, whose drawn rims stand above
 * their rim blocks) the drawn rim, so none adds a solid (tests/poi.test.ts). Each colour stays its region's own, so the lure
 * chain reads by colour as well as place. Lights are kept at coarse LOD. */
type Floor = (x: number, z: number) => number;
const structure = (id: string): StructureDef => {
  const s = STRUCTURES.find(x => x.id === id);
  if (!s) throw new Error(`landmark lights: no structure ${id}`);
  return s;
};

// --- Meridian spire ----------------------------------------------------------

const SPIRE = structure("meridian.spire.shaft");
/** Amber lamps up each face of the spire's square shaft, between its bands.
 * The shaft is a 4-sided frustum turned 45°, so its faces are square to X
 * and Z, `r cos 45°` from the axis. */
function spireLamps(b: RecipeBuilder): void {
  const sol = SPIRE.solids[0]!, top = sol.max.y - 6, k = Math.SQRT1_2;
  const face = (y: number): number => (4.6 + (2.2 - 4.6) * (y - sol.min.y) / (top - sol.min.y)) * k;
  lit(b, () => {
    for (let y = sol.min.y + 7; y < top - 6; y += 14) {
      const f = face(y) + 0.03;
      for (const [ux, uz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
        b.box([SPIRE.x + ux * f, y, SPIRE.z + uz * f], [ux ? 0.08 : 1, 1, uz ? 0.08 : 1], C.glow);
    }
  });
}

// --- Divide gateworks ---------------------------------------------------------

const TOWERS = [structure("divide.gate_tower_west"), structure("divide.gate_tower_east")], LINTEL = structure("divide.gate_lintel");
/** Lamps at the towers' body corners between bands (inside the tower's
 * collision, which stands 0.6 m proud of the body), plates on the caps'
 * faces by each corner, and a band of plates along both lintel faces. */
function gateLamps(b: RecipeBuilder): void {
  lit(b, () => {
    for (const t of TOWERS) {
      const sol = t.solids[0]!, cx = (sol.min.x + sol.max.x) / 2, cz = (sol.min.z + sol.max.z) / 2, body = (sol.max.x - sol.min.x) / 2 - 0.6;
      for (let y = sol.max.y - 8; y > sol.min.y + 12; y -= 24)
        for (const [u, w] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) b.box([cx + u * body, y, cz + w * body], [0.7, 0.9, 0.7], C.lilac);
      const half = (sol.max.x - sol.min.x) / 2 + 0.03, capY = sol.max.y - 1;
      for (const s of [-1, 1]) for (const o of [-1, 1]) {
        b.box([cx + s * half, capY, cz + o * (half - 1.2)], [0.06, 0.6, 1.2], C.lilac);
        b.box([cx + o * (half - 1.2), capY, cz + s * half], [1.2, 0.6, 0.06], C.lilac);
      }
    }
    const sol = LINTEL.solids[0]!;
    for (let x = sol.min.x + 4; x <= sol.max.x - 4; x += 6)
      for (const z of [sol.min.z - 0.03, sol.max.z + 0.03]) b.box([x, sol.min.y + 0.8, z], [1.4, 0.45, 0.06], C.lilac);
  });
}

// --- Rift head and cliff walls ------------------------------------------------

/** Carrier lanes keep 25 m clear of the swept hull (17 m), small-craft
 * routes 12 m of their centre line; seams near a route are left out. */
export const CARRIER_CLEAR = 42, ROUTE_CLEAR = 12;
const segDist = (p: Vec3, a: Vec3, c: Vec3): number => {
  const d = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z }, l = d.x * d.x + d.y * d.y + d.z * d.z;
  const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * d.x + (p.y - a.y) * d.y + (p.z - a.z) * d.z) / l)) : 0;
  return Math.hypot(p.x - a.x - d.x * t, p.y - a.y - d.y * t, p.z - a.z - d.z * t);
};
export function nearRoute(p: Vec3, margin = 0): boolean {
  for (const r of ROUTES) {
    if (r.role === "walk") continue;
    const clear = (r.carrier ? CARRIER_CLEAR : ROUTE_CLEAR) + margin;
    for (let i = 1; i < r.path.length; i++) if (segDist(p, r.path[i - 1]!, r.path[i]!) < clear) return true;
  }
  return false;
}
/** Wall left dark round the kiln tube's mouth on the south-east wall (CA-3
 * `rift_kiln_tube` and the bible's footprint for it, with the kit's collar),
 * so no seam sits on a cave. */
export const SEAM_DARK: readonly { minX: number; maxX: number; minZ: number; maxZ: number }[] = [{ minX: 108, maxX: 190, minZ: -866, maxZ: -760 }];
const dark = (p: Vec3): boolean => SEAM_DARK.some(r => p.x > r.minX && p.x < r.maxX && p.z > r.minZ && p.z < r.maxZ);
/** Seams run from the head down both walls; each part draws `SEAM_PART` m. */
export const SEAM_FROM = 24, SEAM_TO = 444, SEAM_PART = 60, SEAM_STEP = 8, SEAM_DASH = 2.5;
/** Where the wall `side` of the trench crosses `frac` of the way from the
 * trench floor to the ledge, `s` metres down the axis, or null where the
 * wall is too low to be a cliff. */
export function seamPoint(floor: Floor, s: number, side: number, frac: number): Vec3 | null {
  const a = riftAxisAt(s), at = (d: number): [number, number] => [a.x + a.nx * d * side, a.z + a.nz * d * side];
  const bottom = Math.min(...[0, 8, 16].map(d => floor(...at(d)))), ledge = floor(...at(110));
  if (ledge - bottom < 25) return null;
  const y = bottom + (ledge - bottom) * frac;
  let lo = 8, hi = 8;
  while (hi < 110 && floor(...at(hi)) < y) { lo = hi; hi += 2; }
  if (hi >= 110) return null;
  for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (floor(...at(m)) < y) lo = m; else hi = m; }
  const [x, z] = at(hi);
  return { x, y, z };
}
/** One stretch of ember seams: dashes down both walls, alternating between
 * a low and a high seam every `SEAM_STEP` m (so each seam is a dotted line
 * with a dash every 16 m), each a thin ribbon between two points on the
 * wall's contour, set 0.4 m off the rock toward the trench. */
function seams(b: RecipeBuilder, floor: Floor, from: number, to: number): void {
  lit(b, () => {
    for (const side of [-1, 1]) for (let s = from; s < to; s += SEAM_STEP) {
      const frac = Math.round(s / SEAM_STEP) % 2 ? 0.68 : 0.3;
      const p = seamPoint(floor, s, side, frac), q = seamPoint(floor, s + SEAM_DASH, side, frac);
      if (!p || !q || Math.abs(p.y - q.y) > 3 || nearRoute(p, 1.5) || nearRoute(q, 1.5) || dark(p) || dark(q)) continue;
      const a = riftAxisAt(s), ox = -a.nx * side * 0.4, oz = -a.nz * side * 0.4, h = 0.5;
      const P: P3 = [p.x + ox, p.y, p.z + oz], Q: P3 = [q.x + ox, q.y, q.z + oz];
      const quad = (lo: number, hi: number, c: Rgb): void => {
        b.face([[P[0], P[1] + lo, P[2]], [Q[0], Q[1] + lo, Q[2]], [Q[0], Q[1] + hi, Q[2]], [P[0], P[1] + hi, P[2]]], c);
        b.face([[P[0], P[1] + hi, P[2]], [Q[0], Q[1] + hi, Q[2]], [Q[0], Q[1] + lo, Q[2]], [P[0], P[1] + lo, P[2]]], c);
      };
      quad(-h, h, frac < 0.5 ? C.ember : C.amber);
    }
  });
}

// --- Basin dishes ---------------------------------------------------------------

/** Points on a dish's drawn rim (the same tilt as `structures.ts` draws). */
export function dishRim(s: StructureDef, t: number): P3 {
  const R = s.p.radius!, tilt = s.p.tilt!, face = s.p.facing!, c: P3 = [s.x, s.base + 2.2, s.z], ax: P3 = [Math.cos(face), 0, Math.sin(face)];
  const p: P3 = [Math.cos(t) * R, R * 0.32, Math.sin(t) * R];
  const along = p[0] * ax[0] + p[2] * ax[2], perp: P3 = [p[0] - along * ax[0], 0, p[2] - along * ax[2]];
  const ca = Math.cos(tilt), sa = Math.sin(tilt), a2 = along * ca - p[1] * sa, y2 = along * sa + p[1] * ca;
  return [c[0] + perp[0] + a2 * ax[0], c[1] + y2 + Math.sin(tilt) * R * 0.5, c[2] + perp[2] + a2 * ax[2]];
}
const DISHES = STRUCTURES.filter(s => s.kind === "dish");
export const DISH_LAMPS = 9;
function dishLamps(b: RecipeBuilder, s: StructureDef): void {
  lit(b, () => { for (let i = 0; i < DISH_LAMPS; i++) b.box(dishRim(s, (i + 0.25) / DISH_LAMPS * Math.PI * 2), [0.6, 0.6, 0.6], C.amber); });
}

// --- Wreck ridge hulls -------------------------------------------------------------

/** A prism's most upward face, shrunk about its centre and lifted off it:
 * a lamp plate on the beam's back. */
function crownPlate(b: RecipeBuilder, piece: VistaPiece, shrink: number, color: Rgb): void {
  let best: { pts: readonly Vec3[]; n: Vec3 } | null = null;
  for (const f of piece.facets.slice(0, -2)) {
    const [a, c, d] = f.pts as [Vec3, Vec3, Vec3];
    const u = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z }, w = { x: d.x - a.x, y: d.y - a.y, z: d.z - a.z };
    const n = { x: u.y * w.z - u.z * w.y, y: u.z * w.x - u.x * w.z, z: u.x * w.y - u.y * w.x }, l = Math.hypot(n.x, n.y, n.z) || 1;
    const unit = { x: n.x / l, y: n.y / l, z: n.z / l };
    if (!best || unit.y > best.n.y) best = { pts: f.pts, n: unit };
  }
  if (!best || best.n.y < 0.5) return;
  const m = best.pts.reduce((s, q) => ({ x: s.x + q.x / best!.pts.length, y: s.y + q.y / best!.pts.length, z: s.z + q.z / best!.pts.length }), { x: 0, y: 0, z: 0 });
  b.face(best.pts.map(q => [m.x + (q.x - m.x) * shrink + best!.n.x * 0.04, m.y + (q.y - m.y) * shrink + best!.n.y * 0.04, m.z + (q.z - m.z) * shrink + best!.n.z * 0.04] as P3), color);
}
const HULL = VISTA_SETS.find(s => s.id === "wreck.hull")!, BOW = VISTA_SETS.find(s => s.id === "wreck.bow")!;
/** The west hull's keel (petrol prisms), every other segment lit; the bow's
 * rib crowns (the highest prism of every other rib). */
function hullLamps(b: RecipeBuilder): void {
  lit(b, () => {
    HULL.pieces.filter(p => p.closed && p.facets.every(f => f.tone === "petrol")).forEach((p, i) => { if (i % 2 === 0) crownPlate(b, p, 0.45, C.amber); });
    const ribs = new Map<number, VistaPiece>();
    for (const p of BOW.pieces.filter(p => p.closed && p.facets.every(f => f.tone === "rust" || f.tone === "rustDark"))) {
      const zs = p.facets.flatMap(f => f.pts.map(q => q.z)), key = Math.round((Math.min(...zs) + Math.max(...zs)) / 2);
      const top = (q: VistaPiece): number => Math.max(...q.facets.flatMap(f => f.pts.map(r => r.y)));
      if (!ribs.has(key) || top(p) > top(ribs.get(key)!)) ribs.set(key, p);
    }
    [...ribs.entries()].sort((a, c) => a[0] - c[0]).forEach(([, p], i) => { if (i % 2 === 0) crownPlate(b, p, 0.5, C.amber); });
  });
}

// --- The parts ----------------------------------------------------------------------

const center = (s: StructureDef): { x: number; z: number } => ({ x: s.x, z: s.z });
export const LANDMARK_LIGHTS: readonly VistaPart[] = [
  { id: "landmark.meridian.spire", ...center(SPIRE), draw: b => spireLamps(b) },
  { id: "landmark.divide.gateworks", ...center(LINTEL), draw: b => gateLamps(b) },
  ...Array.from({ length: Math.ceil((SEAM_TO - SEAM_FROM) / SEAM_PART) }, (_, i): VistaPart => {
    const from = SEAM_FROM + i * SEAM_PART, to = Math.min(SEAM_TO, from + SEAM_PART), mid = riftAxisAt((from + to) / 2);
    return { id: `landmark.rift.seams.${i}`, x: mid.x, z: mid.z, draw: (b, floor) => seams(b, floor, from, to) };
  }),
  ...DISHES.map((s): VistaPart => ({ id: `landmark.basin.${s.id}`, ...center(s), draw: b => dishLamps(b, s) })),
  { id: "landmark.basin.wreck_hulls", x: HULL.anchor.x + 1, z: HULL.anchor.z, draw: b => hullLamps(b) },
];
