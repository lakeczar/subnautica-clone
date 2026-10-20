import type { MeshRecipe } from "../kit/types.js";
import type { ChunkDescriptor, LodLevel } from "../../world/types.js";
import { hash2 } from "../../content/regions/noise.js";
import { ROUTES } from "../../content/regions/passages.js";
import { PALETTE } from "../palette.js";
import { hex, mix, RecipeBuilder, type P3, type Rgb } from "./recipe.js";

/** Composed set pieces: one authored vista per priority area, built from
 * the bookmark camera's point of view (tools/region-viewer.ts VIEWS). Each
 * part is drawn into the chunk that holds its anchor and follows the shared
 * floor, so it sits on whatever the bake produced. Purely visual, like
 * scatter and the Meridian facades: parts stay clear of every passage and
 * mooring (tests/vistas.test.ts) and favour open frames over solid masses,
 * because nothing here adds collision. */
type Floor = (x: number, z: number) => number;
export interface VistaPart {
  readonly id: string;
  /** Anchor; the part is built by the chunk containing it. */
  readonly x: number;
  readonly z: number;
  draw(b: RecipeBuilder, floor: Floor, fine: boolean): void;
}

const C = {
  rust: hex("#a8743f"), rustDark: hex("#7a5232"), metal: hex(PALETTE.metal), steel: hex(PALETTE.steelLight),
  petrol: hex(PALETTE.petrol), ochre: hex(PALETTE.ochre), porcelain: hex(PALETTE.porcelain), shell: hex(PALETTE.shell),
  warm: hex(PALETTE.warm), glow: hex("#ffd27a"), cyan: hex("#9fe6e0"), concrete: hex("#8e9a98"), concrete2: hex("#a7b0aa"),
  stone: hex("#6f8d8a"), stoneDark: hex("#4a676b"), basalt: hex(PALETTE.basalt), coral: hex("#e48a70"), coralRim: hex(PALETTE.coralRim),
  amber: hex(PALETTE.amber), jade: hex(PALETTE.jade), lime: hex(PALETTE.lime), teal: hex("#2f8a85"), plum: hex(PALETTE.plum),
  violet: hex(PALETTE.violet),
} as const;

const glow = (b: RecipeBuilder, f: () => void): void => { const a = b.alpha; b.alpha = -1; f(); b.alpha = a; };
const lerp3 = (a: P3, b: P3, t: number): P3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// --- Builders -------------------------------------------------------------

/** A capsized hull's skeleton: arched ribs whose feet sink into the floor,
 * a keel along their crowns, stringers and a few surviving plates. Ribs
 * taper toward both ends and some are broken short. */
interface Hull { x: number; z: number; yaw: number; length: number; beam: number; height: number; ribs: number; seed: number; plates: number }
function hull(b: RecipeBuilder, floor: Floor, h: Hull, fine: boolean): void {
  const ax = [Math.cos(h.yaw), Math.sin(h.yaw)] as const, side = [-ax[1], ax[0]] as const;
  const n = fine ? h.ribs : Math.ceil(h.ribs / 2) + 1, segs = fine ? 8 : 4, sides = fine ? 5 : 3;
  const arcs: (P3[] | null)[] = [], reach: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) - 0.5, taper = 1 - Math.pow(Math.abs(t) * 2, 3) * 0.55;
    const cx = h.x + ax[0] * t * h.length, cz = h.z + ax[1] * t * h.length, half = h.beam / 2 * taper;
    const foot = (s: number): P3 => { const x = cx + side[0] * half * s, z = cz + side[1] * half * s; return [x, floor(x, z) - 1.4, z]; };
    // Ribs rise along the floor's normal, so on a flank the hull lies
    // against the slope rather than standing up like a cage.
    const P = foot(1), S = foot(-1), gx = (floor(cx + 1, cz) - floor(cx - 1, cz)) / 2, gz = (floor(cx, cz + 1) - floor(cx, cz - 1)) / 2;
    const nl = Math.hypot(gx, 1, gz), up: P3 = [-gx / nl, 1 / nl, -gz / nl], H = h.height * taper;
    const mid = lerp3(P, S, 0.5), A: P3 = [(P[0] - S[0]) / 2, (P[1] - S[1]) / 2, (P[2] - S[2]) / 2];
    const pts: P3[] = [];
    for (let j = 0; j <= segs; j++) {
      const a = Math.PI * j / segs, c = Math.cos(a) * (1 + 0.14 * Math.sin(a)), lift = H * Math.pow(Math.sin(a), 0.65);
      pts.push([mid[0] + A[0] * c + up[0] * lift, mid[1] + A[1] * c + up[1] * lift, mid[2] + A[2] * c + up[2] * lift]);
    }
    // Broken ribs keep only one side, up to a jagged end.
    const k = hash2(i, h.seed, 3);
    const keep = k < -0.45 ? Math.floor(segs * (0.35 + 0.3 * (k + 1))) : segs;
    arcs.push(keep >= 2 ? pts : null); reach.push(keep);
    if (keep < 2) continue;
    const drawn = k < -0.45 && hash2(i, h.seed, 4) > 0 ? pts.slice(segs - keep) : pts.slice(0, keep + 1);
    b.tube(drawn, fine ? 0.38 : 0.45, sides, k > 0.4 ? C.rustDark : C.rust);
  }
  // Keel along the crowns and two stringers per side, where both ribs stand.
  for (const j of fine ? [1, Math.floor(segs / 3), segs / 2, segs - Math.floor(segs / 3), segs - 1] : [segs / 2]) {
    for (let i = 0; i < n - 1; i++) {
      const a = arcs[i], c = arcs[i + 1];
      if (!a || !c || reach[i]! < segs || reach[i + 1]! < segs) continue;
      b.tube([a[j]!, c[j]!], j === segs / 2 ? 0.55 : 0.22, sides, j === segs / 2 ? C.petrol : C.metal);
    }
  }
  if (!fine) return;
  // Surviving plates: patches of hull skin between neighbouring full ribs.
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < segs; j++) {
    const a = arcs[i], c = arcs[i + 1];
    if (!a || !c || reach[i]! < segs || reach[i + 1]! < segs) continue;
    if (hash2(i * 7 + j, h.seed, 9) * 0.5 + 0.5 > h.plates) continue;
    const col = hash2(i, j, h.seed) > 0.2 ? C.metal : mix(C.rust, C.metal, 0.4);
    b.face([a[j]!, c[j]!, c[j + 1]!, a[j + 1]!], col);
  }
}

/** A faceted rock arch between two feet, rising to `apex` metres above the
 * higher foot: thick chunky segments with knuckles, coral on the crown. */
function rockArch(b: RecipeBuilder, floor: Floor, A: [number, number], B: [number, number], apex: number, r0: number, r1: number, seed: number, fine: boolean): void {
  const a: P3 = [A[0], floor(A[0], A[1]) - 3, A[1]], c: P3 = [B[0], floor(B[0], B[1]) - 3, B[1]];
  const top = Math.max(a[1], c[1]) + 3 + apex, n = fine ? 12 : 6, pts: P3[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, base = lerp3(a, c, u), lift = Math.pow(Math.sin(Math.PI * u), 0.55);
    pts.push([base[0] + hash2(i, seed, 1) * 0.8, base[1] + (top - base[1]) * lift, base[2] + hash2(i, seed, 2) * 1.2]);
  }
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, r = r0 + (r1 - r0) * Math.sin(Math.PI * u);
    const col = mix(C.stoneDark, C.stone, 0.5 + 0.5 * hash2(i, seed, 3));
    b.frustum(pts[i]!, pts[i + 1]!, r * 1.05, r * 0.95, fine ? 7 : 5, col, C.basalt, i * 0.7);
    if (fine || i % 2 === 0) b.ellipsoid(pts[i + 1]!, [r * 1.15, r * 0.95, r * 1.1], col, 3, fine ? 6 : 4, i => 1 + 0.12 * Math.sin(i * 2.7 + seed));
  }
  // Coral crust and hanging ribbons on the crown.
  for (let i = 3; i <= n - 3; i++) {
    const p = pts[i]!, r = r1 * 0.9;
    b.ellipsoid([p[0], p[1] + r * 0.75, p[2]], [r * 0.8, r * 0.45, r * 0.7], hash2(i, seed, 5) > 0 ? C.coral : C.amber, 3, fine ? 6 : 4);
    if (fine && i % 2) for (const s of [-1, 1]) {
      const x = p[0], z = p[2] + s * r * 0.8;
      b.leaf([[x, p[1] - r * 0.4, z], [x + 0.3, p[1] - r - 2.5, z + s * 0.4], [x - 0.2, p[1] - r - 5.5, z + s * 0.6]], [0.5, 0.45, 0.08], [1, 0, 0], C.jade, C.lime);
    }
  }
}

/** A four-legged lattice mast with a lit lantern. */
function latticeMast(b: RecipeBuilder, floor: Floor, x: number, z: number, h: number, w: number, fine: boolean, lantern: Rgb = C.glow): void {
  const half = w / 2, top = Math.max(0.5, w * 0.18), legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
  // Each leg finds its own footing; bracing starts above the highest one.
  const feet = legs.map(([u, v]) => floor(x + u * half, z + v * half) - 1), base = Math.max(...feet);
  legs.forEach(([u, v], i) => b.frustum([x + u * half, feet[i]!, z + v * half], [x + u * top, base + h, z + v * top], 0.22, 0.14, 4, C.steel));
  for (let y = 3; y < h - 2; y += fine ? 4 : 8) {
    const r0 = half + (top - half) * (y / h), r1 = half + (top - half) * ((y + 3) / h);
    for (let i = 0; i < 4; i++) {
      const [u0, v0] = legs[i]!, [u1, v1] = legs[(i + 1) % 4]!;
      b.tube([[x + u0 * r0, base + y, z + v0 * r0], [x + u1 * r1, base + y + 3, z + v1 * r1]], 0.09, 3, i % 2 ? C.steel : C.ochre);
    }
  }
  b.box([x, base + h + 0.4, z], [top * 2.6, 0.8, top * 2.6], C.petrol);
  glow(b, () => b.box([x, base + h + 1.3, z], [top * 1.6, 1.2, top * 1.6], lantern));
}

/** A lamp post: thin pole, cap and a warm lantern. */
function lamp(b: RecipeBuilder, floor: Floor, x: number, z: number, h: number, light: Rgb = C.warm): void {
  const y = floor(x, z) - 0.3;
  b.frustum([x, y, z], [x, y + h, z], 0.14, 0.1, 4, C.petrol);
  b.box([x, y + h + 0.15, z], [1, 0.25, 1], C.metal);
  glow(b, () => b.box([x, y + h - 0.4, z], [0.8, 0.7, 0.8], light));
}

/** A pipe run on saddles, following the floor `lift` metres up. */
function pipeRun(b: RecipeBuilder, floor: Floor, from: [number, number], to: [number, number], r: number, lift: number, fine: boolean): void {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]), n = Math.max(2, Math.ceil(len / 6));
  const at = (t: number): P3 => { const x = from[0] + (to[0] - from[0]) * t, z = from[1] + (to[1] - from[1]) * t; return [x, floor(x, z) + lift, z]; };
  const pts = Array.from({ length: n + 1 }, (_, i) => at(i / n));
  // Level runs between saddles so the pipe never dips into a hollow.
  for (let i = 1; i < pts.length; i++) pts[i] = [pts[i]![0], Math.max(pts[i]![1], pts[i - 1]![1] - 0.6), pts[i]![2]];
  b.tube(pts, r, fine ? 8 : 5, C.metal);
  for (let i = 0; i <= n; i += fine ? 1 : 2) {
    const p = pts[i]!, f = floor(p[0], p[2]);
    b.box([p[0], (f + p[1]) / 2 - 0.4, p[2]], [0.6, p[1] - f + 0.8, r * 2.6], C.petrol, Math.atan2(to[1] - from[1], to[0] - from[0]));
    if (fine && i % 3 === 1 && i < n) b.frustum(lerp3(p, pts[i + 1]!, 0.45), lerp3(p, pts[i + 1]!, 0.55), r * 1.2, r * 1.2, 8, C.ochre);
  }
}

/** Warm bulb cluster on short stalks: the reef's living wayfinding. */
function bulbs(b: RecipeBuilder, floor: Floor, x: number, z: number, n: number, seed: number, fine: boolean): void {
  for (let i = 0; i < (fine ? n : Math.ceil(n / 2)); i++) {
    const a = i * 2.4 + seed, r = 0.4 + 1.3 * (0.5 + 0.5 * hash2(i, seed, 1)), px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    const y = floor(px, pz) - 0.1, h = 0.8 + 1.4 * (0.5 + 0.5 * hash2(i, seed, 2));
    b.tube([[px, y, pz], [px + 0.15, y + h * 0.6, pz], [px, y + h, pz + 0.1]], 0.05, 3, C.petrol);
    glow(b, () => b.ellipsoid([px, y + h + 0.18, pz + 0.1], [0.22, 0.26, 0.22], i % 3 ? C.warm : C.glow, 2, fine ? 5 : 4));
  }
}

/** A tall kelp strand: wavering stalk with alternating blades. */
function kelp(b: RecipeBuilder, floor: Floor, x: number, z: number, h: number, seed: number, fine: boolean): void {
  const y = floor(x, z) - 0.2, segs = fine ? 7 : 3, pts: P3[] = [];
  for (let i = 0; i <= segs; i++) { const t = i / segs; pts.push([x + Math.sin(t * 3 + seed) * 0.9 * t, y + h * t, z + Math.cos(t * 2.3 + seed) * 0.7 * t]); }
  b.tube(pts, 0.09, 3, C.teal);
  if (!fine) return;
  for (let i = 1; i < segs; i++) {
    const p = pts[i]!, a = i * 2.1 + seed, d: P3 = [Math.cos(a), 0, Math.sin(a)];
    b.leaf([p, [p[0] + d[0] * 0.9, p[1] + 0.7, p[2] + d[2] * 0.9], [p[0] + d[0] * 1.9, p[1] + 0.3, p[2] + d[2] * 1.9]], [0.05, 0.38, 0.05], [-d[2], 0, d[0]], C.jade, C.lime);
  }
}

/** A low faceted coral mound with a lighter crown. */
function mound(b: RecipeBuilder, floor: Floor, x: number, z: number, r: number, col: Rgb, crown: Rgb, seed: number, fine: boolean): void {
  const y = floor(x, z) - r * 0.25;
  b.ellipsoid([x, y + r * 0.35, z], [r, r * 0.6, r * 0.9], col, 3, fine ? 7 : 5, i => 1 + 0.15 * Math.sin(i * 1.9 + seed));
  if (fine) b.ellipsoid([x + r * 0.2, y + r * 0.8, z - r * 0.1], [r * 0.55, r * 0.3, r * 0.5], crown, 3, 6);
}

/** Half-buried plates and pipe lengths strewn along a line. */
function debrisTrail(b: RecipeBuilder, floor: Floor, from: [number, number], to: [number, number], n: number, spread: number, seed: number, fine: boolean): void {
  for (let i = 0; i < (fine ? n : Math.ceil(n / 3)); i++) {
    const t = (i + 0.5) / n, x = from[0] + (to[0] - from[0]) * t + hash2(i, seed, 1) * spread, z = from[1] + (to[1] - from[1]) * t + hash2(i, seed, 2) * spread;
    const y = floor(x, z), yaw = hash2(i, seed, 3) * Math.PI, k = hash2(i, seed, 4);
    if (k > 0.35) b.frustum([x - Math.cos(yaw) * 2, y + 0.2, z - Math.sin(yaw) * 2], [x + Math.cos(yaw) * 2, y + 0.35, z + Math.sin(yaw) * 2], 0.4, 0.4, fine ? 6 : 4, C.rust, C.petrol);
    else b.box([x, y + 0.1, z], [2.2 + k, 0.25, 1.4], k > -0.3 ? C.metal : C.rustDark, yaw, C.steel);
  }
}

// --- Compositions ---------------------------------------------------------

/** Basin, wreck ridge. The crest carries the craft route, so the wreck lies
 * on the flanks: a capsized hull draped down the west flank toward the
 * bookmark camera, a broken bow on the east flank and a fallen crane boom
 * between, with a debris trail and the ship's beacon still burning. */
const WRECK: readonly VistaPart[] = [
  { id: "wreck.hull", x: 752, z: -588, draw: (b, floor, fine) => hull(b, floor, { x: 752, z: -588, yaw: Math.PI / 2 + 0.12, length: 62, beam: 17, height: 12, ribs: 16, seed: 41, plates: 0.55 }, fine) },
  { id: "wreck.bow", x: 808, z: -634, draw: (b, floor, fine) => {
    hull(b, floor, { x: 808, z: -634, yaw: Math.PI / 2 - 0.7, length: 26, beam: 12, height: 10, ribs: 7, seed: 77, plates: 0.6 }, fine);
    // The beacon mast, snapped and leaning back over the crest, lantern lit
    // so it reads against open water from the ridge.
    const x = 806, z = -628, y = floor(x, z);
    b.frustum([x, y - 2, z], [x - 5, y + 19, z + 2], 0.4, 0.28, 5, C.ochre);
    b.box([x - 5.2, y + 19.5, z + 2.1], [1.6, 1, 1.6], C.petrol, 0.4);
    glow(b, () => b.box([x - 5.2, y + 20.5, z + 2.1], [1.1, 1.1, 1.1], C.glow, 0.4));
  } },
  { id: "wreck.boom", x: 752, z: -605, draw: (b, floor, fine) => {
    // A crane boom fallen from the crest: two chords and lacing.
    const A: P3 = [762, floor(762, -598) + 2.5, -598], B: P3 = [731, floor(731, -612) + 0.4, -612];
    for (const o of [-1, 1]) b.tube([[A[0], A[1] + o * 0.9, A[2] + o * 0.6], [B[0], B[1] + o * 0.9, B[2] + o * 0.6]], 0.3, fine ? 5 : 3, C.ochre);
    if (fine) for (let i = 0; i < 12; i++) {
      const p = lerp3(A, B, i / 12), q = lerp3(A, B, (i + 1) / 12), o = i % 2 ? 1 : -1;
      b.tube([[p[0], p[1] + o * 0.9, p[2] + o * 0.6], [q[0], q[1] - o * 0.9, q[2] - o * 0.6]], 0.12, 3, C.petrol);
    }
    b.box([B[0] - 1, B[1] + 0.8, B[2] - 0.5], [3, 2.2, 2.4], C.rust, 0.3, C.metal);
  } },
  { id: "wreck.trail", x: 760, z: -575, draw: (b, floor, fine) => {
    debrisTrail(b, floor, [744, -540], [752, -655], 16, 7, 5, fine);
    debrisTrail(b, floor, [800, -575], [826, -660], 9, 5, 6, fine);
  } },
];

/** Reef, Hearth drop. A coral-crusted arch frames the descent high above
 * the passage; kelp curtains and coral mounds line the lip, and warm bulb
 * clusters mark the walls of the drop the route follows down. */
const DROP: readonly VistaPart[] = [
  { id: "drop.arch", x: -236, z: -116, draw: (b, floor, fine) => rockArch(b, floor, [-268, -116], [-204, -114], 20, 3.2, 2.2, 7, fine) },
  { id: "drop.lip.west", x: -262, z: -92, draw: (b, floor, fine) => {
    for (let i = 0; i < 9; i++) kelp(b, floor, -270 + hash2(i, 1, 1) * 6, -95 + i * 2.2 + hash2(i, 1, 2) * 2, 9 + 6 * (0.5 + 0.5 * hash2(i, 1, 3)), i, fine);
    mound(b, floor, -258, -84, 3.2, C.coral, C.coralRim, 1, fine);
    mound(b, floor, -266, -78, 2.2, C.violet, C.plum, 2, fine);
    bulbs(b, floor, -255, -90, 7, 3, fine);
  } },
  { id: "drop.lip.east", x: -206, z: -110, draw: (b, floor, fine) => {
    for (let i = 0; i < 8; i++) kelp(b, floor, -202 + hash2(i, 2, 1) * 5, -122 + i * 2.4 + hash2(i, 2, 2) * 2, 8 + 7 * (0.5 + 0.5 * hash2(i, 2, 3)), i + 9, fine);
    mound(b, floor, -210, -112, 2.8, C.amber, C.coralRim, 3, fine);
    mound(b, floor, -200, -106, 3.6, C.coral, C.amber, 4, fine);
    bulbs(b, floor, -214, -108, 6, 4, fine);
  } },
  ...([[-224, -150, 5], [-252, -152, 6], [-226, -190, 7], [-256, -196, 8], [-228, -235, 9], [-254, -240, 10]] as const).map(([x, z, s]) =>
    ({ id: `drop.bulbs.${s}`, x, z, draw: (b: RecipeBuilder, floor: Floor, fine: boolean) => {
      bulbs(b, floor, x, z, 8, s, fine);
      kelp(b, floor, x + (x > -240 ? 3 : -3), z + 2, 7, s, fine);
    } })),
];

/** Meridian, deep works. The block becomes a working yard: an open gantry
 * crane straddles it, lattice towers with beacons and a pipe yard stand
 * behind, and a lamp avenue leads from the terrace route to the hatch. */
const WORKS: readonly VistaPart[] = [
  { id: "works.gantry", x: 1440, z: -1582, draw: (b, floor, fine) => {
    const legs = [[1413, -1558], [1467, -1558], [1413, -1606], [1467, -1606]] as const, top = -735;
    for (const [x, z] of legs) {
      const y = floor(x, z) - 0.5;
      b.frustum([x, y, z], [x, top, z], 0.7, 0.55, fine ? 6 : 4, C.ochre, C.petrol);
      if (fine) for (let yy = y + 6; yy < top - 4; yy += 6) b.box([x, yy, z], [1.6, 0.4, 1.6], C.petrol);
    }
    for (const z of [-1558, -1606]) b.box([1440, top + 0.8, z], [56, 1.6, 1.6], C.ochre, 0, C.steel);
    for (const x of [1413, 1467]) b.box([x, top + 0.8, -1582], [1.6, 1.6, 49], C.petrol);
    // The trolley, its cable and a hanging hook block over the open roof.
    b.box([1446, top - 0.6, -1582], [5, 2, 50], C.metal);
    b.tube([[1446, top - 1.6, -1576], [1446, -742, -1576]], 0.08, 3, C.petrol);
    b.box([1446, -743.2, -1576], [1.4, 2.2, 1.4], C.ochre);
    glow(b, () => { for (const [x, z] of legs) b.box([x, top + 2.2, z], [0.9, 0.9, 0.9], C.glow); b.box([1446, top - 1.9, -1588], [1.2, 0.4, 1.2], C.warm); });
  } },
  { id: "works.towers", x: 1420, z: -1553, draw: (b, floor, fine) => {
    // Masts either side of the yard frame the block from the terrace route.
    latticeMast(b, floor, 1368, -1566, 44, 6, fine, C.glow);
    latticeMast(b, floor, 1474, -1540, 38, 5, fine, C.cyan);
    // No cable between them: the rescue tethers drop through the yard.
  } },
  { id: "works.pipes", x: 1478, z: -1590, draw: (b, floor, fine) => {
    pipeRun(b, floor, [1418, -1567], [1371, -1567], 1.1, 1.8, fine);
    pipeRun(b, floor, [1462, -1566], [1472, -1544], 0.9, 1.5, fine);
    pipeRun(b, floor, [1462, -1590], [1515, -1600], 1.1, 1.8, fine);
    pipeRun(b, floor, [1450, -1602], [1452, -1650], 0.8, 1.3, fine);
  } },
  { id: "works.avenue", x: 1414, z: -1545, draw: (b, floor, fine) => {
    // From just past the route's end to the hatch; (nx, nz) is across the avenue.
    const nx = 0.655, nz = 0.756;
    for (let i = 0; i < 5; i++) {
      const t = 0.2 + 0.8 * i / 4, x = 1398 + 30 * t, z = -1532 - 26 * t;
      for (const s of [-1, 1]) lamp(b, floor, x + nx * 5.5 * s, z + nz * 5.5 * s, 3.6, i === 4 ? C.glow : C.warm);
      // Painted strips across the hard floor between the lamps.
      if (fine) b.box([x, floor(x, z) + 0.06, z], [9, 0.08, 0.6], C.ochre, Math.atan2(nz, nx));
    }
  } },
];

const ESCARPMENT_ROUTE = ROUTES.find(r => r.id === "route.meridian.escarpment")!.path;
/** The route's X where it crosses `z` (it runs north-south). */
function routeX(path: readonly { x: number; z: number }[], z: number): number {
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!, c = path[i + 1]!;
    if ((z - a.z) * (z - c.z) <= 0 && a.z !== c.z) return a.x + (c.x - a.x) * (z - a.z) / (c.z - a.z);
  }
  return path[0]!.x;
}

/** Meridian escarpment. Warm markers trace the ledge's outer edge so the
 * return line reads from far off; a survey mast and a broken ring of
 * Meridian stone stand on the wall shelf as the focal pair. */
const ESCARPMENT: readonly VistaPart[] = [
  ...Array.from({ length: 12 }, (_, i) => {
    const z = -845 + i * 22, x = routeX(ESCARPMENT_ROUTE, z) - 18;
    return { id: `escarp.marker.${i}`, x, z, draw: (b: RecipeBuilder, floor: Floor, fine: boolean) => {
      const y = floor(x, z) - 0.4, h = 2.6 + (i % 3) * 0.6;
      b.box([x, y + h / 2, z], [0.5, h, 0.5], C.concrete, 0.3 * i, C.concrete2);
      b.box([x, y + h + 0.1, z], [0.8, 0.25, 0.8], C.ochre, 0.3 * i);
      glow(b, () => b.box([x, y + h - 0.5, z + 0.26], [0.3, 0.5, 0.06], i % 4 === 3 ? C.cyan : C.warm, 0.3 * i));
      if (fine && i % 2) bulbs(b, floor, x - 2, z + 3, 4, i + 20, fine);
    } };
  }),
  { id: "escarp.mast", x: 1356, z: -748, draw: (b, floor, fine) => latticeMast(b, floor, 1356, -748, 30, 4.5, fine, C.warm) },
  { id: "escarp.ring", x: 1352, z: -690, draw: (b, floor, fine) => {
    // Three-quarters of a stone ring standing on edge, broken at the top,
    // its far side sunk into the foot of the wall.
    // Turned to face the ledge's approach from the north end.
    const cx = 1352, cz = -690, R = 10, base = floor(cx, cz) + R - 2.5, n = fine ? 20 : 10, yaw = 2.6;
    const at = (a: number): P3 => [cx + Math.cos(yaw) * Math.cos(a) * R, base + Math.sin(a) * R, cz + Math.sin(yaw) * Math.cos(a) * R];
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 - Math.PI * 0.75 + (i / n) * Math.PI * 1.5 + 0.1, a1 = a0 + Math.PI * 1.5 / n;
      b.frustum(at(a0), at(a1), 1.6, 1.6, 4, i % 4 === 0 ? C.concrete2 : C.concrete, C.ochre, Math.PI / 4);
      if (fine && i % 3 === 1) glow(b, () => { const p = lerp3(at(a0), at(a1), 0.5); b.box([p[0], p[1], p[2]], [0.9, 0.9, 0.9], C.cyan); });
    }
    b.frustum([cx - 4, floor(cx - 4, cz + 6), cz + 6], [cx - 1, floor(cx - 1, cz + 9) + 1.2, cz + 9], 1.5, 1.4, 4, C.concrete, C.ochre, 0.3);
  } },
];

export const VISTAS: readonly VistaPart[] = [...WRECK, ...DROP, ...WORKS, ...ESCARPMENT];

/** The vista parts anchored in this chunk, as one cel mesh (or null).
 * Yields between parts when the build step's slice is used. */
export function* vistaMesh(chunk: ChunkDescriptor, lod: LodLevel, floor: Floor, due: () => boolean): Generator<void, MeshRecipe | null> {
  const { min, max } = chunk.bounds;
  const here = VISTAS.filter(p => p.x >= min.x && p.x < max.x && p.z >= min.z && p.z < max.z);
  if (!here.length) return null;
  const b = new RecipeBuilder();
  for (const p of here) { if (due()) yield; p.draw(b, floor, lod === "fine"); }
  return b.vertexCount ? b.finish(`${chunk.id}.vista`, 0.22) : null;
}
