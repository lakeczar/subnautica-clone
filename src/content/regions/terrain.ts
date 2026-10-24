import { along, clamp01, fbm, lerp, nearestOnPolyline, ridged, smooth, valueNoise, type PolylineHit } from "./noise.js";
import { FLOOR_PADS, type FloorPad } from "./sites.js";

/** The one physical floor for the whole 2048 x 1792 m world.
 *
 * Inside LEGACY_PRESERVE the result IS the existing `terrainHeight`, bit for
 * bit, so today's island, reef, Canopy, Basin benchmark, collision proofs and
 * render mesh are untouched. Outside it, the floor eases over LEGACY_BLEND
 * metres into the authored world below. Simulation and every art factory
 * sample this same function; there is no second terrain formula.
 *
 * Metres, +Y up, water at Y = 0, +X east, +Z north. */

/** Contains accepted B1's whole render mesh (`TERRAIN_EXTENT`: X -95..268.16,
 * Z -332.34..88, including the fracture rows south of the Basin) and its route
 * bounds (X -76..248, Z -320..66). Inside it the floor IS `terrainHeight`. */
export const LEGACY_PRESERVE = { minX: -96, maxX: 272, minZ: -336, maxZ: 88 } as const;
/** Accepted B1's whole render mesh: its 190 x 178 grid over X -95..205, Z -202..88
 * (render/terrainSurface.ts' TERRAIN_GRID), extended 40 columns east and 80 rows
 * south for the fracture. Content, so the region layout needs no render import. */
export const TERRAIN_EXTENT = {
  minX: -95, maxX: 205 + 40 * 300 / 190,
  minZ: -202 - 80 * 290 / 178, maxZ: 88,
} as const;
export const LEGACY_BLEND = 96;

export type FloorFunction = (x: number, z: number) => number;

/** Compose the legacy heightfield with the authored world. The coordinator
 * passes today's `terrainHeight` (see `worldFloor.ts`); keeping it a
 * parameter avoids an import cycle once `sim/world.ts` adopts this. */
export function composeWorldFloor(legacy: FloorFunction): FloorFunction {
  const p = LEGACY_PRESERVE;
  return (x, z) => {
    const dx = x < p.minX ? p.minX - x : x > p.maxX ? x - p.maxX : 0;
    const dz = z < p.minZ ? p.minZ - z : z > p.maxZ ? z - p.maxZ : 0;
    if (dx === 0 && dz === 0) return legacy(x, z);
    const d = Math.hypot(dx, dz);
    if (d >= LEGACY_BLEND) return authoredFloor(x, z);
    const t = d / LEGACY_BLEND, w = t * t * (3 - 2 * t);
    // The hub spur stands at full height inside the blend band: its reef
    // heads and first step would otherwise be pulled down toward the legacy
    // slope. It reaches nowhere near the preserve itself (tests hold that).
    return Math.max(legacy(x, z) * (1 - w) + authoredFloor(x, z) * w, hubRelief(x, z, null));
  };
}

/** Weights in [0, 1] describing which authored geology shapes a point. Art
 * reads these to colour and dress the same features the floor carved. */
export interface TerrainMasks {
  reef: number; isle: number; land: number; canopy: number; rib: number;
  basin: number; ridge: number; sediment: number;
  rift: number; trench: number; coolFlank: number; ledge: number;
  divide: number; brineSide: number; serviceLedge: number;
  meridian: number; terrace: number; escarpment: number;
  /** W2 hub spur: the pinnacle rock, and the reef cap on its upper terraces. */
  pinnacle: number; reefCap: number;
}
export function emptyMasks(): TerrainMasks {
  return { reef: 0, isle: 0, land: 0, canopy: 0, rib: 0, basin: 0, ridge: 0, sediment: 0, rift: 0, trench: 0,
    coolFlank: 0, ledge: 0, divide: 0, brineSide: 0, serviceLedge: 0, meridian: 0, terrace: 0, escarpment: 0,
    pinnacle: 0, reefCap: 0 };
}

const scratch = emptyMasks();
/** Authored height only (no legacy). Exported for art and diagnostics. */
export function authoredFloor(x: number, z: number): number {
  return sampleAuthored(x, z, scratch);
}
export function terrainMasks(x: number, z: number, out: TerrainMasks = emptyMasks()): TerrainMasks {
  sampleAuthored(x, z, out);
  return out;
}

// --- Macro relief -----------------------------------------------------------
// Depth in metres (positive down) at 128 m nodes; Catmull-Rom between them.
// Rows run north (Z 160) to south (Z -1632); columns west (X -576) to east.
const MACRO_X0 = -576, MACRO_Z0 = 160, MACRO_STEP = 128;
const MACRO: readonly (readonly number[])[] = [
  [25, 20, 16, 14, 12, 14, 40, 34, 26, 30, 40, 38, 30, 30, 40, 70, 110],
  [30, 24, 20, 16, 14, 30, 90, 60, 40, 50, 66, 62, 46, 40, 56, 110, 170],
  [45, 36, 30, 26, 40, 130, 150, 110, 95, 100, 108, 104, 96, 92, 120, 220, 300],
  [120, 110, 100, 95, 110, 165, 175, 165, 170, 175, 180, 182, 180, 190, 230, 330, 380],
  [165, 160, 160, 165, 175, 190, 200, 215, 225, 230, 228, 226, 228, 245, 330, 440, 470],
  [195, 195, 200, 210, 215, 225, 240, 262, 290, 300, 300, 300, 305, 340, 440, 500, 520],
  [230, 235, 240, 245, 245, 245, 262, 300, 345, 360, 355, 345, 350, 400, 500, 540, 560],
  [245, 248, 250, 250, 250, 255, 275, 330, 372, 380, 376, 368, 375, 440, 530, 570, 590],
  [248, 250, 252, 252, 252, 258, 290, 340, 375, 382, 378, 375, 400, 480, 560, 600, 620],
  [250, 252, 254, 254, 256, 265, 305, 360, 378, 384, 384, 392, 440, 520, 580, 630, 660],
  [252, 254, 256, 256, 262, 285, 340, 385, 392, 393, 395, 410, 480, 540, 610, 660, 700],
  [254, 256, 258, 258, 270, 310, 365, 372, 368, 372, 380, 420, 510, 580, 650, 710, 740],
  [256, 258, 260, 262, 285, 360, 480, 560, 600, 600, 580, 560, 580, 640, 700, 750, 770],
  [258, 260, 262, 266, 300, 420, 580, 630, 640, 640, 620, 600, 620, 680, 740, 775, 785],
  [260, 262, 264, 270, 320, 440, 600, 640, 650, 650, 630, 610, 640, 700, 760, 780, 790],
];
const MACRO_COLS = MACRO[0]!.length, MACRO_ROWS = MACRO.length;
const node = (i: number, j: number): number =>
  MACRO[Math.max(0, Math.min(MACRO_ROWS - 1, j))]![Math.max(0, Math.min(MACRO_COLS - 1, i))]!;
const catmull = (a: number, b: number, c: number, d: number, t: number): number =>
  b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
export function macroDepth(x: number, z: number): number {
  const gx = (x - MACRO_X0) / MACRO_STEP, gz = (MACRO_Z0 - z) / MACRO_STEP;
  const i = Math.floor(gx), j = Math.floor(gz), tx = gx - i, tz = gz - j;
  const row = (jj: number): number => catmull(node(i - 1, jj), node(i, jj), node(i + 1, jj), node(i + 2, jj), tx);
  return catmull(row(j - 1), row(j), row(j + 1), row(j + 2), tz);
}

// --- Authored features ------------------------------------------------------
/** Ember Rift fracture axis, NE head (meets Pale Basin) to SW. */
export const RIFT_AXIS: readonly (readonly [number, number])[] = [
  [180, -590], [75, -750], [-45, -912], [-165, -1065], [-280, -1235], [-392, -1420], [-470, -1632],
];
/** Mirror Divide crest, west (Rift flank) to east (Meridian). */
export const DIVIDE_RIDGE: readonly (readonly [number, number])[] = [
  // The end points extend each end segment straight past the weighted zone,
  // so the sides of the crest never swap across an end-point wedge.
  [-20, -1170.5], [190, -1205], [330, -1228], [460, -1250], [600, -1262], [740, -1254], [860, -1232], [975, -1205], [1147.5, -1164.5],
];
export const DIVIDE_GATE_X = 600;
/** Dense brine interface (the "mirror"). Below this, south of the ridge, is brine. */
export const BRINE_Y = -440;
/** The drawn mirror sheet's height: BRINE_Y softly varied by ±0.25 m. Art laid
 * on the mirror (CR-1's resting-skate outlines) samples this to sit on it. */
export const brineSheetY = (x: number, z: number): number => BRINE_Y + 0.25 * fbm(x, z, 30, 2, 77);
/** Narrow exterior service ledge depth on the Divide's south face. */
export const SERVICE_LEDGE_Y = -412;
export const MERIDIAN_CENTRE = { x: 1490, z: -1650 } as const;
/** Half-width of each terrace retaining wall (a near-vertical cut). */
export const MERIDIAN_WALL = 2.5;
/** Terrace outer radii (from MERIDIAN_CENTRE) and their floor depths. */
export const MERIDIAN_TERRACES = [
  { outer: 700, depth: 520 }, { outer: 560, depth: 600 }, { outer: 400, depth: 680 }, { outer: 240, depth: 770 },
] as const;
const BASIN_DISH_RIDGE: readonly (readonly [number, number])[] = [[410, -505], [500, -560], [590, -615]];
const BASIN_WRECK_RIDGE: readonly (readonly [number, number])[] = [[770, -400], [786, -520], [778, -650]];
/** Basin ridges: axis, crest depth, half-width. Hoisted: the floor runs per sample. */
const BASIN_RIDGES = [[BASIN_DISH_RIDGE, 268, 58], [BASIN_WRECK_RIDGE, 252, 48]] as const;
const HEARTH_DROP: readonly (readonly [number, number])[] = [[-236, -96], [-246, -172], [-240, -262], [-226, -330]];
export const SEA_STACK = { x: 470, z: 95 } as const;
/** Centre line of the stack's water cleft. */
export const stackCleftX = (z: number): number => SEA_STACK.x + 3 * Math.sin(z / 14);
export const HEADLAND = { a: [955, -8] as const, b: [1125, 108] as const };
const ESCARPMENT_DEPTH: readonly (readonly [number, number])[] = [
  [-1080, 522], [-900, 505], [-760, 482], [-620, 452], [-500, 404], [-420, 332], [-340, 248], [-280, 215],
];
const CANOPY_RIBS = [-70, -152, -238, -306] as const;

const hit: PolylineHit = { d: 0, s: 0, length: 0, side: 0, tx: 1, tz: 0 };

export function escarpmentLedgeDepth(z: number): number {
  const t = ESCARPMENT_DEPTH;
  if (z <= t[0]![0]) return t[0]![1];
  for (let i = 1; i < t.length; i++) {
    const [z1, d1] = t[i]!, [z0, d0] = t[i - 1]!;
    if (z <= z1) return lerp(d0, d1, smooth(z0, z1, z));
  }
  return t.at(-1)![1];
}
export const escarpmentLedgeX = (z: number): number => 1350 + 22 * Math.sin(z / 95);

// --- Central hub spur (W2, owner Option A) ----------------------------------
/** A reef-capped pinnacle: a radial profile of `[radius, depth]` knots,
 * eased with a smoothstep between knots so every knot reads as a terrace
 * tread and every span between them as a riser. The radius is warped by
 * `wobble` metres of noise, so the risers are irregular rock faces. */
export interface HubPinnacle {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  /** Radius ascending (metres), depth positive down. */
  readonly profile: readonly (readonly [radius: number, depth: number])[];
  readonly wobble: number;
  /** Floor depth above which the rock reads as reef cap. */
  readonly cap: number;
}
/** The spur, apron to crown: two reef heads on the apron's south lip, two
 * stepping-stone pinnacles and the crown, which rises about 240 m from the
 * Basin floor to a summit at 47 m. Carrier lanes pass between the second
 * step and the crown at depth; the spur is never a wall across the lobe. */
export const HUB_PINNACLES: readonly HubPinnacle[] = [
  { id: "hub.head_west", x: 8, z: -392, wobble: 1.2, cap: 60,
    profile: [[0, 29], [4, 30], [8, 35], [12, 48], [17, 72], [23, 110]] },
  { id: "hub.head_apron", x: 40, z: -376, wobble: 1, cap: 60,
    profile: [[0, 23], [6, 24], [11, 28], [16, 40], [22, 66], [28, 104], [34, 146]] },
  { id: "hub.step_one", x: 80, z: -400, wobble: 2.2, cap: 75,
    profile: [[0, 38.5], [6, 39.5], [11, 44], [16, 54], [21, 76], [27, 114], [33, 160], [40, 205], [48, 240]] },
  { id: "hub.step_two", x: 186, z: -464, wobble: 2.4, cap: 80,
    profile: [[0, 43.5], [6, 44.5], [11, 48.5], [16, 59], [21, 80], [26, 118], [31, 166], [35, 214], [39, 244], [46, 266]] },
  { id: "hub.crown", x: 330, z: -560, wobble: 3,  cap: 128,
    profile: [[0, 46.5], [12, 47.2], [18, 50], [23, 57], [28, 63], [33, 69], [37, 83], [41, 102], [45, 117], [48, 123],
      [51, 170], [55, 225], [60, 262], [66, 283], [74, 300]] },
];
/** Flat shelves grafted onto a pinnacle flank. The rim balcony sits on the
 * crown's north lip, looking down 120 m on the carrier anchorage. */
export const HUB_LEDGES: readonly { readonly id: string; readonly x: number; readonly z: number; readonly radius: number; readonly depth: number }[] = [
  { id: "hub.rim_balcony", x: 350, z: -522, radius: 17, depth: 121 },
];
const HUB_REACH = HUB_PINNACLES.map(p => p.profile.at(-1)![0] + p.wobble);
/** Noise seed from the pinnacle's id, so authoring one never moves another. */
const HUB_SEEDS = HUB_PINNACLES.map(p => {
  let h = 701;
  for (let i = 0; i < p.id.length; i++) h = (h * 31 + p.id.charCodeAt(i)) % 9973;
  return h;
});
const hubSeed = (i: number): number => HUB_SEEDS[i]!;

/** Height (+Y) of the hub spur at a point, or -Infinity beyond it. Applied
 * as `max` over the floor, so the spur only ever adds rock. */
export function hubRelief(x: number, z: number, m: TerrainMasks | null): number {
  let h = -Infinity, cap = 0, rock = 0;
  for (let i = 0; i < HUB_PINNACLES.length; i++) {
    const p = HUB_PINNACLES[i]!, dx = x - p.x, dz = z - p.z;
    if (Math.abs(dx) > HUB_REACH[i]! || Math.abs(dz) > HUB_REACH[i]!) continue;
    const raw = Math.hypot(dx, dz);
    if (raw > HUB_REACH[i]!) continue;
    const r = Math.max(0, raw + p.wobble * fbm(x, z, 26, 3, hubSeed(i)));
    const k = p.profile;
    let depth = k.at(-1)![1];
    for (let j = 1; j < k.length; j++) {
      if (r > k[j]![0]) continue;
      depth = lerp(k[j - 1]![1], k[j]![1], smooth(k[j - 1]![0], k[j]![0], r));
      break;
    }
    // Reef relief on the treads, none on the summit datum the station uses.
    depth += 0.7 * fbm(x, z, 7, 2, hubSeed(i) + 5) * smooth(10, 16, raw);
    const y = -depth;
    if (y > h) { h = y; cap = smooth(p.cap + 12, p.cap - 4, depth); rock = 1 - smooth(k.at(-2)![0], k.at(-1)![0], raw); }
  }
  for (const l of HUB_LEDGES) {
    const r = Math.hypot(x - l.x, z - l.z);
    if (r >= l.radius) continue;
    const y = -l.depth - 0.4 * fbm(x, z, 6, 2, 761) - 180 * smooth(l.radius * 0.72, l.radius, r);
    if (y > h) { h = y; cap = 1 - smooth(l.radius * 0.6, l.radius, r); rock = 1; }
  }
  if (m && h > -Infinity) { m.pinnacle = Math.max(m.pinnacle, rock); m.reefCap = Math.max(m.reefCap, cap); }
  return h;
}

/** Height (+Y) of the sea stack and its shoal, or -Infinity outside it. */
function seaStack(x: number, z: number, m: TerrainMasks): number {
  const dx = x - SEA_STACK.x, dz = (z - SEA_STACK.z) * 1.08, r = Math.hypot(dx, dz);
  if (r > 215) return -Infinity;
  let h = -14 - 52 * smooth(95, 205, r) + 1.2 * fbm(x, z, 26, 3, 71);
  const skirtTop = 2.6 + 1.8 * smooth(64, 40, r) + 0.7 * fbm(x, z, 9, 2, 72);
  h = lerp(h, skirtTop, smooth(86, 62, r));
  // The stack's west half carries the walkable plateau; the east is lower.
  const plateau = (x < SEA_STACK.x ? 46 : 37) + 2.2 * fbm(x, z, 11, 2, 73);
  h = lerp(h, plateau, smooth(40.5, 33, r));
  // A ramp hugs the south-west face: 120 degrees of arc from the south
  // landing (+3.4) to the plateau (+46), about 0.55 m/m for a walker.
  const theta = Math.atan2(dz, dx) * 180 / Math.PI;
  // Signed arc from the ramp's foot, so the band blends in on both ends.
  const phi = ((((-116 - theta) % 360) + 540) % 360) - 180;
  const band = smooth(30.5, 33.5, r) * (1 - smooth(40.5, 44.5, r)) * smooth(-14, -4, phi) * (1 - smooth(118, 136, phi));
  if (band > 0) h = lerp(h, 3.4 + (plateau - 3.4) * clamp01(phi / 110), band);
  // The split: a sinuous water cleft running north-south through the stack.
  const cx = stackCleftX(z), half = Math.abs(x - cx);
  if (r < 150) h = Math.min(h, lerp(-9.5, h, Math.max(smooth(7, 11, half), smooth(130, 150, r))));
  // Yard berth: a dredged cove in the stack's southern lee.
  const berth = Math.hypot(x - 470, z + 6);
  if (berth < 70) h = Math.min(h, lerp(-34, h, smooth(42, 68, berth)));
  const land = smooth(-0.5, 1.5, h);
  m.isle = Math.max(m.isle, 1 - smooth(150, 215, r)); m.land = Math.max(m.land, land);
  return h;
}

function headland(x: number, z: number, m: TerrainMasks): number {
  const [ax, az] = HEADLAND.a, [bx, bz] = HEADLAND.b;
  const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
  const px = x - ax, pz = z - az;
  const u = px * ux + pz * uz - len / 2, v = -px * uz + pz * ux;
  const e = (u / 175) ** 2 + (v / 118) ** 2;
  if (e > 1.4) return -Infinity;
  const shoal = -14 - 52 * smooth(0.5, 1.25, e) + 1.4 * fbm(x, z, 30, 3, 81);
  const ground = 2.5 + 85.5 * smooth(-118, 100, u) + 1.1 * fbm(x, z, 18, 3, 82);
  let land = lerp(ground, 2.2 + 0.6 * fbm(x, z, 7, 2, 83), smooth(-16, -64, v));
  // Storm-cut: sheer cliffs face north-west and north-east.
  land = lerp(land, -24, smooth(30, 39, v + 3 * Math.sin(u / 9)));
  land = lerp(land, -24, smooth(99, 110, u + 2.5 * Math.sin(v / 7)));
  land = lerp(land, -5, smooth(-96, -124, u));
  const e2 = (u / 120) ** 2 + (v / 64) ** 2;
  const h = lerp(shoal, land, smooth(1.12, 0.92, e2));
  m.isle = Math.max(m.isle, smooth(1.4, 1, e)); m.land = Math.max(m.land, smooth(-0.5, 1.5, h));
  return h;
}

function sampleAuthored(x: number, z: number, m: TerrainMasks): number {
  for (const k in m) (m as unknown as Record<string, number>)[k] = 0;
  let depth = macroDepth(x, z);
  let amp = 1.8; // geology relief amplitude, metres

  // Reef west flats and the Hearth drop gully toward the Basin's west lobe.
  m.reef = smooth(-60, 40, z) * smooth(-40, -110, x);
  if (m.reef > 0) depth -= m.reef * 3 * fbm(x, z, 22, 3, 11);
  nearestOnPolyline(x, z, HEARTH_DROP, hit);
  if (hit.d < 60) {
    const t = along(x, z, HEARTH_DROP), floor = lerp(36, 172, t);
    const wall = smooth(16, 34, hit.d);
    depth = lerp(Math.max(depth, floor + 10 * (1 - hit.d / 16)), depth, wall);
  }

  // Pale Basin: bowl, dish ridge, wreck ridge and rippled sediment flats.
  const bowl = Math.hypot((x - 560) / 1.15, z + 720);
  m.basin = Math.max(1 - smooth(470, 600, bowl),
    smooth(-90, -240, z) * smooth(-470, -620, z) * smooth(-40, -120, x)); // west lobe
  if (m.basin > 0) {
    for (const [axis, crest, half] of BASIN_RIDGES) {
      nearestOnPolyline(x, z, axis, hit);
      if (hit.d < half * 1.8) {
        const r = Math.min(depth, crest + (hit.d / half) ** 2 * 46 + 6 * fbm(x, z, 20, 3, 21));
        const w = 1 - smooth(half * 1.2, half * 1.8, hit.d);
        depth = lerp(depth, r, w); m.ridge = Math.max(m.ridge, w);
      }
    }
    m.sediment = m.basin * (1 - m.ridge) * smooth(250, 300, depth);
    if (m.sediment > 0) {
      const a = 0.7 + 0.6 * valueNoise(x / 260, z / 260, 23);
      const phase = (x * Math.cos(a) + z * Math.sin(a)) / 1.7 + 2.4 * valueNoise(x / 60, z / 60, 24);
      depth -= m.sediment * 0.42 * Math.sin(phase);
      amp = lerp(amp, 0.5, m.sediment);
    }
  }

  // Lantern Canopy east shelf: tethering mineral ribs with lower passages.
  m.canopy = smooth(-380, -320, z) * smooth(60, 20, z) * smooth(250, 310, x) * smooth(1250, 1190, x);
  if (m.canopy > 0) {
    for (const k of CANOPY_RIBS) {
      const zc = k + 18 * Math.sin(x / 110 + k);
      const gap = smooth(-0.35, -0.15, valueNoise(x / 85, k, 31));
      const mooring = smooth(60, 90, Math.hypot(x - 620, z + 200));
      const rib = m.canopy * gap * mooring * (1 - smooth(5, 17, Math.abs(z - zc)));
      depth -= rib * (15 + 5 * fbm(x, z, 18, 2, 32));
      m.rib = Math.max(m.rib, rib);
    }
  }

  // Ember Rift: trench, stepped ledges and a cooled south-east flank.
  nearestOnPolyline(x, z, RIFT_AXIS, hit);
  if (hit.d < 380) {
    const t = along(x, z, RIFT_AXIS), d = hit.d, se = hit.side > 0;
    const w = 32 + 14 * valueNoise(x / 90, z / 90, 41);
    const trench = lerp(280, 430, smooth(0, 0.12, t)) + 110 * smooth(0.1, 0.42, t) - 22 * smooth(0.72, 1, t);
    const head = smooth(0, 0.14, t);
    const lower = lerp(262, se ? 306 : 314, head), upper = lerp(255, se ? 262 : 287, head);
    const lowW = 40 + 16 * valueNoise(x / 120, z / 120, 42), upW = 62 + 26 * valueNoise(x / 140, z / 140, 43);
    const e1 = w, e2 = e1 + 26, e3 = e2 + lowW, e4 = e3 + 15, e5 = e4 + upW;
    let r: number;
    if (d < e1) r = trench + 8 * (1 - (d / e1) ** 2);
    else if (d < e2) r = lerp(trench, lower, Math.pow(smooth(e1, e2, d), 0.7));
    else if (d < e3) r = lower;
    else if (d < e4) r = lerp(lower, upper, smooth(e3, e4, d));
    else r = upper;
    // Pale strata: the ledges step in 3 m layers where they are exposed.
    // Pale strata: a continuous staircase (flat treads, 0.9 m risers every
    // 3 m), faded in past the trench lip so it adds no edge of its own.
    const q = r / 3, k = Math.floor(q), stair = (k + smooth(0.35, 0.65, q - k)) * 3;
    r = lerp(r, stair, 0.35 * smooth(e2 - 4, e2 + 4, d));
    const weight = (1 - smooth(e5, e5 + 100, d)) * smooth(-0.01, 0.04, t);
    depth = lerp(depth, r, weight);
    m.rift = weight; m.trench = weight * (1 - smooth(e1, e2, d));
    m.ledge = weight * smooth(e1 + 10, e2, d) * (1 - smooth(e5, e5 + 40, d));
    m.coolFlank = se ? m.ledge : 0;
    amp = lerp(amp, lerp(3.2, 1.1, smooth(e2 - 6, e2 + 6, d)), weight);
  }

  // Mirror Divide: fractured E-W ridge, the gateworks notch, brine to the south.
  nearestOnPolyline(x, z, DIVIDE_RIDGE, hit);
  if (hit.d < 270 && x > 120 && x < 1060) {
    const d = hit.d, north = hit.side > 0;
    let crest = 358 + 9 * valueNoise(x / 60, z / 60, 51);
    crest += 60 * (1 - smooth(18, 46, Math.abs(x - DIVIDE_GATE_X)));
    crest += 34 * (1 - smooth(10, 26, Math.abs(x - 362))) + 40 * (1 - smooth(12, 30, Math.abs(x - 818)));
    let r: number;
    if (north) r = lerp(crest, 392, smooth(0, 125, d));
    else {
      r = lerp(crest, 622, smooth(22, 175, d));
      // Cut service bench above the mirror, gate to Meridian.
      const bench = (1 - smooth(8, 12, Math.abs(d - 62))) * smooth(588, 612, x) * smooth(1050, 1000, x);
      r = lerp(r, -SERVICE_LEDGE_Y + 6, bench);
      m.serviceLedge = bench;
      m.brineSide = smooth(20, 60, d);
    }
    const weight = (1 - smooth(200, 270, d)) * smooth(130, 190, x) * smooth(1060, 1000, x);
    depth = lerp(depth, r, weight);
    m.divide = weight; m.brineSide *= weight;
    amp = lerp(amp, 3.4, weight * (1 - m.serviceLedge));
  }

  // Meridian District: an amphitheatre of terraces stepping into the SE.
  const mr = Math.hypot(x - MERIDIAN_CENTRE.x, z - MERIDIAN_CENTRE.z);
  if (mr < 800 && x > 860 && z < -940) {
    let r: number = MERIDIAN_TERRACES[0].depth;
    for (let i = 1; i < MERIDIAN_TERRACES.length; i++) {
      const t = MERIDIAN_TERRACES[i]!, step = t.depth - MERIDIAN_TERRACES[i - 1]!.depth;
      r += step * (1 - smooth(t.outer - MERIDIAN_WALL, t.outer + MERIDIAN_WALL, mr));
    }
    r += 10 * clamp01(0.5 + fbm(x, z, 30, 2, 61)) * (1 - smooth(228, 236, mr));
    const weight = (1 - smooth(700, 790, mr)) * smooth(870, 950, x) * smooth(-950, -1030, z);
    depth = lerp(depth, r, weight);
    m.meridian = weight; m.terrace = weight * (1 - smooth(690, 720, mr));
    amp = lerp(amp, 0.25, m.terrace);
  }

  // Outer escarpment: a ledge on the eastern wall, Meridian north to Canopy.
  const esc = smooth(1140, 1215, x) * smooth(-1100, -1030, z) * smooth(-250, -300, z);
  if (esc > 0) {
    const ledge = escarpmentLedgeDepth(z), dx = x - escarpmentLedgeX(z);
    let r: number;
    if (dx > 24) r = Math.max(130, ledge - (dx - 24) * 2.3);
    else if (dx >= -24) r = ledge;
    else r = ledge + 95 * smooth(-280, -470, z) * smooth(-24, -80, dx);
    depth = lerp(depth, r, esc);
    m.escarpment = esc;
    amp = lerp(amp, lerp(0.8, 4.5, smooth(20, 30, Math.abs(dx))), esc);
  }

  // Geology relief: ridged outcrops on rock, softer elsewhere.
  const rock = Math.max(m.rift * (1 - m.ledge), m.divide, m.escarpment, m.ridge);
  depth -= amp * (lerp(fbm(x, z, 46, 4, 3), ridged(x, z, 38, 4, 5) * 1.6 - 0.6, rock));

  // Islands raise the floor out of the water.
  let h = -depth;
  const stack = seaStack(x, z, m);
  if (stack > h) h = lerp(h, stack, clamp01(m.isle * 1.6));
  const head = headland(x, z, m);
  if (head > h) h = lerp(h, head, clamp01(m.isle * 1.6));

  // The hub spur only ever adds rock (see `hubRelief`).
  const hub = hubRelief(x, z, m);
  if (hub > h) h = hub;

  // Authored site pads: flat datums for moorings, deposits and structures.
  const pads = padsNear(x, z);
  if (pads) for (const p of pads) {
    const r = Math.hypot(x - p.x, z - p.z);
    if (r >= p.radius) continue;
    const w = 1 - smooth(p.radius * (p.flat ?? 0.55), p.radius, r);
    h = lerp(h, p.y, w);
  }
  return h;
}

// --- Pad buckets: each sample visits only the pads near it ------------------
const BUCKET = 64;
const buckets = new Map<number, FloorPad[]>();
const bucketKey = (bx: number, bz: number): number => (bx + 1000) * 4096 + (bz + 1000);
for (const p of FLOOR_PADS) {
  for (let bx = Math.floor((p.x - p.radius) / BUCKET); bx <= Math.floor((p.x + p.radius) / BUCKET); bx++)
    for (let bz = Math.floor((p.z - p.radius) / BUCKET); bz <= Math.floor((p.z + p.radius) / BUCKET); bz++) {
      const k = bucketKey(bx, bz);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(p);
    }
}
function padsNear(x: number, z: number): readonly FloorPad[] | undefined {
  return buckets.get(bucketKey(Math.floor(x / BUCKET), Math.floor(z / BUCKET)));
}
