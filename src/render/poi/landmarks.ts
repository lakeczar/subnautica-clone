import { STRUCTURES, type StructureDef } from "../../content/regions/structures.js";
import { riftAxisAt } from "../../content/poi/sets.js";
import { VISTA_SETS, type VistaPiece } from "../../content/vistas.js";
import type { Vec3 } from "../../world/types.js";
import type { P3, RecipeBuilder, Rgb } from "../biomes/recipe.js";
import type { VistaPart } from "../biomes/vistas.js";
import { C, lit } from "./dressing.js";
// Scatter imports the vista module, which imports this one: `blocked` is
// only called while drawing, after every module has loaded.
import { blocked } from "../biomes/scatter.js";

/** Landmark lights (POI-1): in ATM-1's dark, big silhouettes vanish past
 * about 120 m, but lights survive the fog far longer (an unlit lamp keeps
 * 6–10% of its colour at 250–300 m, against about 9% contrast for the
 * shape itself). So each major landmark carries running lights along its
 * edges, and its outline reads as lights:
 * - the Meridian spire: amber lamps up all four faces;
 * - the Divide gateworks: lilac lamps on the towers' corners and caps, and
 *   a band along both faces of the lintel;
 * - the Rift head and cliff walls: ember seams along both walls;
 * - the Basin dishes: a dashed amber band round each rim;
 * - the wreck ridge's two ribbed hulls: bands on the keel and rib crowns.
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
/** Amber lamp plates up each face of the spire's square shaft, between its
 * bands, tall enough to read as a line of lights at 250 m. The shaft is a
 * 4-sided frustum turned 45°, so its faces are square to X and Z, `r cos 45°`
 * from the axis. */
function spireLamps(b: RecipeBuilder): void {
  const sol = SPIRE.solids[0]!, top = sol.max.y - 6, k = Math.SQRT1_2;
  const face = (y: number): number => (4.6 + (2.2 - 4.6) * (y - sol.min.y) / (top - sol.min.y)) * k;
  lit(b, () => {
    for (let y = sol.min.y + 7; y < top - 6; y += 14) {
      const f = face(y) + 0.03;
      for (const [ux, uz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
        b.box([SPIRE.x + ux * f, y, SPIRE.z + uz * f], [ux ? 0.08 : 1.4, 2.6, uz ? 0.08 : 1.4], C.glow);
    }
  });
}

// --- Divide gateworks ---------------------------------------------------------

const TOWERS = [structure("divide.gate_tower_west"), structure("divide.gate_tower_east")], LINTEL = structure("divide.gate_lintel");
/** Lamps at the towers' exposed body corners between bands (inside the tower's
 * collision, which stands 0.6 m proud of the body), plates on the caps'
 * faces by each corner, and a band of plates along both lintel faces. */
function gateLamps(b: RecipeBuilder, floor: Floor): void {
  lit(b, () => {
    for (const t of TOWERS) {
      const sol = t.solids[0]!, cx = (sol.min.x + sol.max.x) / 2, cz = (sol.min.z + sol.max.z) / 2, body = (sol.max.x - sol.min.x) / 2 - 0.6;
      for (let y = sol.max.y - 8; y > sol.min.y + 12; y -= 24)
        for (const [u, w] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
          // Only where the corner stands clear of the ridge: the towers' feet
          // run far down the south slope.
          const x = cx + u * body, z = cz + w * body;
          if (y - 0.8 > floor(x, z) + 2) b.box([x, y, z], [1, 1.6, 1], C.lilac);
        }
      const half = (sol.max.x - sol.min.x) / 2 + 0.03, capY = sol.max.y - 1;
      for (const s of [-1, 1]) for (const o of [-1, 1]) {
        b.box([cx + s * half, capY, cz + o * (half - 1.6)], [0.06, 0.9, 2.2], C.lilac);
        b.box([cx + o * (half - 1.6), capY, cz + s * half], [2.2, 0.9, 0.06], C.lilac);
      }
    }
    const sol = LINTEL.solids[0]!;
    for (let x = sol.min.x + 5; x <= sol.max.x - 5; x += 8)
      for (const z of [sol.min.z - 0.03, sol.max.z + 0.03]) b.box([x, sol.min.y + 0.8, z], [3.2, 0.9, 0.06], C.lilac);
  });
}

// --- Rift head and cliff walls ------------------------------------------------

/** Points of interest in open water keep carrier lanes 25 m clear of the
 * swept hull (17 m) and small-craft routes 12 m clear of their centre line
 * (tests/poi.test.ts). Seams lie on the rock like scatter, so they follow
 * scatter's open-water keep-out instead (`blocked`). */
export const CARRIER_CLEAR = 42, ROUTE_CLEAR = 12;
/** Wall left dark round the kiln tube's mouth on the south-east wall (CA-3
 * `rift_kiln_tube` and the bible's footprint for it, with the kit's collar),
 * so no seam sits on a cave. */
export const SEAM_DARK: readonly { minX: number; maxX: number; minZ: number; maxZ: number }[] = [{ minX: 108, maxX: 190, minZ: -866, maxZ: -760 }];
const dark = (p: Vec3): boolean => SEAM_DARK.some(r => p.x > r.minX && p.x < r.maxX && p.z > r.minZ && p.z < r.maxZ);
/** Seams run from the head down both walls; each part draws `SEAM_PART` m. */
/** Parts are short so each builds in about a millisecond: the chunk build
 * can only pause between parts. */
export const SEAM_FROM = 24, SEAM_TO = 444, SEAM_PART = 16, SEAM_STEP = 8, SEAM_DASH = 3.5;
/** Where the wall `side` of the trench crosses `frac` of the way from the
 * trench floor to the ledge, `s` metres down the axis, or null where the
 * wall is too low to be a cliff. */
export function seamPoint(floor: Floor, s: number, side: number, frac: number): Vec3 | null {
  const a = riftAxisAt(s), at = (d: number): [number, number] => [a.x + a.nx * d * side, a.z + a.nz * d * side];
  // The cliff runs from the trench floor up to the lower ledge, 50-70 m out
  // (the step to the upper ledge beyond it is not the cliff).
  const bottom = Math.min(...[0, 8, 16].map(d => floor(...at(d)))), ledge = floor(...at(70));
  if (ledge - bottom < 25) return null;
  const y = bottom + (ledge - bottom) * frac;
  // The cliff itself stands within 80 m of the axis; a crossing further out
  // is the shoulder beyond it, not the wall.
  let lo = 12, hi = 12;
  while (hi < 80 && floor(...at(hi)) < y) { lo = hi; hi += 3; }
  if (hi >= 80) return null;
  for (let i = 0; i < 9; i++) { const m = (lo + hi) / 2; if (floor(...at(m)) < y) lo = m; else hi = m; }
  const [x, z] = at(hi);
  return { x, y, z };
}
/** One stretch of ember seams on both walls: a rim seam just under the lip
 * (a dash every `SEAM_STEP` m), which outlines the trench from above and
 * along its length, where the walls themselves are hidden. Each dash is a
 * ribbon between two points on the wall's contour, set 0.4 m off the rock
 * toward the trench. */
function seams(b: RecipeBuilder, floor: Floor, from: number, to: number): void {
  lit(b, () => {
    for (const side of [-1, 1]) for (let s = from; s < to; s += SEAM_STEP) {
      const frac = 0.92;
      const p = seamPoint(floor, s, side, frac), q = seamPoint(floor, s + SEAM_DASH, side, frac);
      if (!p || !q || Math.abs(p.y - q.y) > 3 || dark(p) || dark(q)) continue;
      if (blocked(p.x, p.z, p.y + 1, 1, p.y - 1) || blocked(q.x, q.z, q.y + 1, 1, q.y - 1)) continue;
      const a = riftAxisAt(s), ox = -a.nx * side * 0.4, oz = -a.nz * side * 0.4, h = 0.7;
      const P: P3 = [p.x + ox, p.y, p.z + oz], Q: P3 = [q.x + ox, q.y, q.z + oz];
      const quad = (lo: number, hi: number, c: Rgb): void => {
        b.face([[P[0], P[1] + lo, P[2]], [Q[0], Q[1] + lo, Q[2]], [Q[0], Q[1] + hi, Q[2]], [P[0], P[1] + hi, P[2]]], c);
        b.face([[P[0], P[1] + hi, P[2]], [Q[0], Q[1] + hi, Q[2]], [Q[0], Q[1] + lo, Q[2]], [P[0], P[1] + lo, P[2]]], c);
      };
      quad(-h, h, C.ember);
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
/** The fine LOD draws the rim as this many straight segments. */
const DISH_SEGMENTS = 18;
export const DISH_DASH = 3.4, DISH_GAP = 1.8;
/** A dashed glowing band wrapping the drawn (fine) rim tube: from 300 m in
 * the Basin's pale silt the dish outline reads as a ring of light. */
function dishBand(b: RecipeBuilder, s: StructureDef): void {
  const ring = Array.from({ length: DISH_SEGMENTS + 1 }, (_, i) => dishRim(s, i / DISH_SEGMENTS * Math.PI * 2));
  const at = (d: number): P3 => {
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1]!, c = ring[i]!, l = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
      if (d <= l || i === ring.length - 1) { const t = Math.min(1, d / l); return [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t]; }
      d -= l;
    }
    return ring[0]!;
  };
  let length = 0;
  for (let i = 1; i < ring.length; i++) length += Math.hypot(ring[i]![0] - ring[i - 1]![0], ring[i]![1] - ring[i - 1]![1], ring[i]![2] - ring[i - 1]![2]);
  const n = Math.floor(length / (DISH_DASH + DISH_GAP)), step = length / n;
  lit(b, () => { for (let k = 0; k < n; k++) b.tube([0, 0.5, 1].map(t => at(k * step + t * DISH_DASH)), 0.5, 4, C.amber); });
}

// --- Wreck ridge hulls -------------------------------------------------------------

/** A glowing band wrapping a prism: a tube along its centre line (between
 * its end caps' centres), `r` just over the prism's half-size and 80% of its
 * length, so a hull's keel or rib reads as a line of light. */
function band(b: RecipeBuilder, piece: VistaPiece, r: number, color: Rgb): void {
  const centre = (f: { pts: readonly Vec3[] }): P3 => {
    const n = f.pts.length;
    return [f.pts.reduce((s, q) => s + q.x, 0) / n, f.pts.reduce((s, q) => s + q.y, 0) / n, f.pts.reduce((s, q) => s + q.z, 0) / n];
  };
  const [a, c] = piece.facets.slice(-2).map(centre) as [P3, P3], m = (t: number): P3 => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
  b.tube([m(0.1), m(0.9)], r, 6, color);
}
const HULL = VISTA_SETS.find(s => s.id === "wreck.hull")!, BOW = VISTA_SETS.find(s => s.id === "wreck.bow")!;
/** Glowing bands on the west hull's keel (petrol prisms) and the bow's rib
 * crowns (the highest prism of each rib), so both hulls' backs read as lines
 * of light along the ridge, even through the Basin's pale silt. */
function hullLamps(b: RecipeBuilder): void {
  lit(b, () => {
    for (const p of HULL.pieces.filter(p => p.closed && p.facets.every(f => f.tone === "petrol"))) band(b, p, 0.6, C.amber);
    const ribs = new Map<number, VistaPiece>();
    for (const p of BOW.pieces.filter(p => p.closed && p.facets.every(f => f.tone === "rust" || f.tone === "rustDark"))) {
      const zs = p.facets.flatMap(f => f.pts.map(q => q.z)), key = Math.round((Math.min(...zs) + Math.max(...zs)) / 2);
      const top = (q: VistaPiece): number => Math.max(...q.facets.flatMap(f => f.pts.map(r => r.y)));
      if (!ribs.has(key) || top(p) > top(ribs.get(key)!)) ribs.set(key, p);
    }
    for (const p of ribs.values()) band(b, p, 0.42, C.amber);
  });
}

// --- The parts ----------------------------------------------------------------------

const center = (s: StructureDef): { x: number; z: number } => ({ x: s.x, z: s.z });
export const LANDMARK_LIGHTS: readonly VistaPart[] = [
  { id: "landmark.meridian.spire", ...center(SPIRE), draw: b => spireLamps(b) },
  { id: "landmark.divide.gateworks", ...center(LINTEL), draw: (b, floor) => gateLamps(b, floor) },
  ...Array.from({ length: Math.ceil((SEAM_TO - SEAM_FROM) / SEAM_PART) }, (_, i): VistaPart => {
    const from = SEAM_FROM + i * SEAM_PART, to = Math.min(SEAM_TO, from + SEAM_PART), mid = riftAxisAt((from + to) / 2);
    return { id: `landmark.rift.seams.${i}`, x: mid.x, z: mid.z, draw: (b, floor) => seams(b, floor, from, to) };
  }),
  ...DISHES.map((s): VistaPart => ({ id: `landmark.basin.${s.id}`, ...center(s), draw: b => dishBand(b, s) })),
  { id: "landmark.basin.wreck_hulls", x: HULL.anchor.x + 1, z: HULL.anchor.z, draw: b => hullLamps(b) },
];
