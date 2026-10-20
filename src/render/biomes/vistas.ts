import type { MeshRecipe } from "../kit/types.js";
import type { ChunkDescriptor, LodLevel } from "../../world/types.js";
import { hash2 } from "../../content/regions/noise.js";
import { ESCARPMENT_MARKERS, RING, VISTA_SETS, type VistaSet, type VistaTone } from "../../content/vistas.js";
import { PALETTE } from "../palette.js";
import { hex, RecipeBuilder, type P3, type Rgb } from "./recipe.js";

/** Composed set pieces: one authored vista per priority area, built from
 * the bookmark camera's point of view (tools/region-viewer.ts VIEWS).
 *
 * Two kinds of art, drawn into the chunk that holds each anchor:
 * - Solid sets (`content/vistas.ts`): the arch, hulls, gantry, pipes,
 *   markers and ring are drawn only from the shapes that are also their
 *   collision (`VISTA_SOLIDS`), so what looks solid is solid.
 * - Dressing (`VISTA_DRESSING` here): visual-only and drawn to read as
 *   permeable — kelp, fan blades, bulbs, open lattice masts, thin lamps,
 *   cables and low debris. Like scatter, it adds no collision and stays out
 *   of every passage and mooring (tests/vistas.test.ts). */
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
  warm: hex(PALETTE.warm), glow: hex("#ffd27a"), cyan: hex("#9fe6e0"), concrete: hex("#8e9a98"), concrete2: hex("#b8c0b9"),
  stone: hex("#6f8d8a"), stoneDark: hex("#4a676b"), basalt: hex(PALETTE.basalt), coral: hex("#e48a70"), coralRim: hex(PALETTE.coralRim),
  amber: hex(PALETTE.amber), jade: hex(PALETTE.jade), lime: hex(PALETTE.lime), teal: hex("#2f8a85"), plum: hex(PALETTE.plum),
  violet: hex(PALETTE.violet),
} as const;
const LIT: ReadonlySet<VistaTone> = new Set(["glow", "warm", "cyan"]);

const glow = (b: RecipeBuilder, f: () => void): void => { const a = b.alpha; b.alpha = -1; f(); b.alpha = a; };
const lerp3 = (a: P3, b: P3, t: number): P3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A solid set exactly as its collision: each block is its box, each tube
 * a faceted tube inside its segment boxes. Coarse LOD only drops facets. */
export function drawSolidSet(b: RecipeBuilder, s: VistaSet, fine: boolean): void {
  s.blocks.forEach((k, i) => {
    const top = k.top ? C[k.top] : undefined;
    if (LIT.has(k.tone)) { glow(b, () => b.aabb([k.min.x, k.min.y, k.min.z], [k.max.x, k.max.y, k.max.z], C[k.tone], top)); return; }
    if (!fine || (k.tone !== "stone" && k.tone !== "stoneDark")) { b.aabb([k.min.x, k.min.y, k.min.z], [k.max.x, k.max.y, k.max.z], C[k.tone], top); return; }
    // Stone reads as a chamfered block: three overlapping boxes, each inset
    // on two axes, in shifted shades. All of it stays inside the collision.
    const e = Math.min(0.6, 0.18 * Math.min(k.max.x - k.min.x, k.max.y - k.min.y, k.max.z - k.min.z));
    const shade = (f: number): Rgb => { const c = C[k.tone]; return [c[0] * f, c[1] * f, c[2] * f]; };
    const j = 0.06 * hash2(i, s.id.length, 5);
    b.aabb([k.min.x, k.min.y + e, k.min.z + e], [k.max.x, k.max.y - e, k.max.z - e], shade(0.92 + j));
    b.aabb([k.min.x + e, k.min.y + e, k.min.z], [k.max.x - e, k.max.y - e, k.max.z], shade(1.04 - j));
    b.aabb([k.min.x + e, k.min.y, k.min.z + e], [k.max.x - e, k.max.y, k.max.z - e], shade(0.86 + j), top ?? shade(1.12));
  });
  for (const t of s.tubes) b.tube(t.points.map(p => [p.x, p.y, p.z] as P3), t.radius, fine ? t.sides : Math.max(3, t.sides - 2), C[t.tone]);
}

// --- Dressing builders (visual-only, permeable) ------------------------------

/** A four-legged open lattice mast with a lit lantern. */
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

/** A cluster of thin sea-fan blades: open lace, not a mass. */
function fans(b: RecipeBuilder, floor: Floor, x: number, z: number, n: number, seed: number, fine: boolean): void {
  for (let i = 0; i < (fine ? n : Math.ceil(n / 2)); i++) {
    const a = i * 2.4 + seed, r = 0.5 + 1.6 * (0.5 + 0.5 * hash2(i, seed, 1)), px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    const y = floor(px, pz) - 0.05, h = 1 + 1.2 * (0.5 + 0.5 * hash2(i, seed, 2)), w = h * 0.7, yaw = hash2(i, seed, 3) * Math.PI;
    const ux = Math.cos(yaw), uz = Math.sin(yaw), ribs = fine ? 7 : 4, hub: P3 = [px, y + h * 0.3, pz];
    b.tube([[px, y, pz], hub], 0.04, 3, C.stoneDark);
    for (let k = 0; k < ribs; k++) {
      const t0 = Math.PI * (0.1 + 0.8 * k / ribs), t1 = Math.PI * (0.1 + 0.8 * (k + 1) / ribs);
      const p = (t: number): P3 => [px + ux * Math.cos(t) * w, y + h * 0.3 + Math.sin(t) * h, pz + uz * Math.cos(t) * w];
      b.face([hub, p(t0), p(t1)], k % 2 ? (i % 3 ? C.coral : C.amber) : C.coralRim);
    }
  }
}

/** Low half-buried plates and short pipe lengths strewn along a line. */
function debrisTrail(b: RecipeBuilder, floor: Floor, from: [number, number], to: [number, number], n: number, spread: number, seed: number, fine: boolean): void {
  for (let i = 0; i < (fine ? n : Math.ceil(n / 3)); i++) {
    const t = (i + 0.5) / n, x = from[0] + (to[0] - from[0]) * t + hash2(i, seed, 1) * spread, z = from[1] + (to[1] - from[1]) * t + hash2(i, seed, 2) * spread;
    const y = floor(x, z), yaw = hash2(i, seed, 3) * Math.PI, k = hash2(i, seed, 4);
    if (k > 0.35) b.frustum([x - Math.cos(yaw) * 2, y + 0.05, z - Math.sin(yaw) * 2], [x + Math.cos(yaw) * 2, y + 0.15, z + Math.sin(yaw) * 2], 0.3, 0.3, fine ? 6 : 4, C.rust, C.petrol);
    else b.box([x, y + 0.05, z], [2.2 + k, 0.2, 1.4], k > -0.3 ? C.metal : C.rustDark, yaw, C.steel);
  }
}

// --- Dressing ---------------------------------------------------------------

const ARCH = VISTA_SETS.find(s => s.id === "drop.arch")!;
const RING_POINTS = VISTA_SETS.find(s => s.id === "escarp.ring")!.tubes[0]!.points;
export const VISTA_DRESSING: readonly VistaPart[] = [
  // Wreck ridge: debris trails down both flanks and the boom's lacing.
  { id: "wreck.trail", x: 760, z: -575, draw: (b, floor, fine) => {
    debrisTrail(b, floor, [744, -540], [752, -655], 16, 7, 5, fine);
    debrisTrail(b, floor, [800, -575], [826, -660], 9, 5, 6, fine);
  } },
  { id: "wreck.lacing", x: 752, z: -605, draw: (b, floor, fine) => {
    if (!fine) return;
    const A: P3 = [762, floor(762, -598) + 2.5, -598], B: P3 = [731, floor(731, -612) + 0.4, -612];
    for (let i = 0; i < 12; i++) {
      const p = lerp3(A, B, i / 12), q = lerp3(A, B, (i + 1) / 12), o = i % 2 ? 1 : -1;
      b.tube([[p[0], p[1] + o * 0.75, p[2] + o * 0.5], [q[0], q[1] - o * 0.75, q[2] - o * 0.5]], 0.1, 3, C.petrol);
    }
  } },
  // Hearth drop: ribbons hang from the arch's crown blocks; kelp, fan lace
  // and bulbs on the lip; bulb clusters mark the walls down the drop.
  { id: "drop.ribbons", x: -236, z: -116, draw: (b, _floor, fine) => {
    if (!fine) return;
    ARCH.blocks.forEach((k, i) => {
      if (!k.top) return;
      for (const s of [-1, 1]) {
        const x = (k.min.x + k.max.x) / 2 + s * 0.6, z = s > 0 ? k.max.z + 0.05 : k.min.z - 0.05, y = k.min.y + 0.3;
        b.leaf([[x, y, z], [x + 0.3, y - 2.5 - (i % 3), z + s * 0.4], [x - 0.2, y - 5.5 - (i % 3), z + s * 0.6]], [0.5, 0.45, 0.08], [1, 0, 0], C.jade, C.lime);
      }
    });
  } },
  { id: "drop.lip.west", x: -262, z: -92, draw: (b, floor, fine) => {
    for (let i = 0; i < 10; i++) kelp(b, floor, -270 + hash2(i, 1, 1) * 6, -97 + i * 2.2 + hash2(i, 1, 2) * 2, 9 + 6 * (0.5 + 0.5 * hash2(i, 1, 3)), i, fine);
    fans(b, floor, -258, -84, 9, 1, fine);
    fans(b, floor, -266, -78, 7, 2, fine);
    bulbs(b, floor, -255, -90, 7, 3, fine);
  } },
  { id: "drop.lip.east", x: -206, z: -110, draw: (b, floor, fine) => {
    for (let i = 0; i < 9; i++) kelp(b, floor, -202 + hash2(i, 2, 1) * 5, -124 + i * 2.4 + hash2(i, 2, 2) * 2, 8 + 7 * (0.5 + 0.5 * hash2(i, 2, 3)), i + 9, fine);
    fans(b, floor, -210, -112, 8, 3, fine);
    fans(b, floor, -200, -106, 9, 4, fine);
    bulbs(b, floor, -214, -108, 6, 4, fine);
  } },
  ...([[-224, -150, 5], [-252, -152, 6], [-226, -190, 7], [-256, -196, 8], [-228, -235, 9], [-254, -240, 10]] as const).map(([x, z, s]) =>
    ({ id: `drop.bulbs.${s}`, x, z, draw: (b: RecipeBuilder, floor: Floor, fine: boolean) => {
      bulbs(b, floor, x, z, 8, s, fine);
      kelp(b, floor, x + (x > -240 ? 3 : -3), z + 2, 7, s, fine);
    } })),
  // Meridian works: framing lattice masts, the hook cable, the lamp avenue.
  { id: "works.towers", x: 1420, z: -1553, draw: (b, floor, fine) => {
    latticeMast(b, floor, 1368, -1566, 44, 6, fine, C.glow);
    latticeMast(b, floor, 1474, -1540, 38, 5, fine, C.cyan);
    // No cable between them: the rescue tethers drop through the yard.
    b.tube([[1446, -736.6, -1576], [1446, -742.1, -1576]], 0.08, 3, C.petrol);
  } },
  { id: "works.avenue", x: 1414, z: -1545, draw: (b, floor, fine) => {
    // From just past the route's end to the hatch; (nx, nz) is across the avenue.
    const nx = 0.655, nz = 0.756;
    for (let i = 0; i < 5; i++) {
      const t = 0.2 + 0.8 * i / 4, x = 1398 + 30 * t, z = -1532 - 26 * t;
      for (const s of [-1, 1]) lamp(b, floor, x + nx * 5.5 * s, z + nz * 5.5 * s, 3.6, i === 4 ? C.glow : C.warm);
      if (fine) b.box([x, floor(x, z) + 0.06, z], [9, 0.08, 0.6], C.ochre, Math.atan2(nz, nx));
    }
  } },
  // Escarpment: bulbs beside alternate markers, the survey mast, and lit
  // inlays on the ring's approach face so its arc reads against the wall.
  ...ESCARPMENT_MARKERS.flatMap((m, i) => i % 2 ? [{ id: `escarp.bulbs.${i}`, x: m.x - 2, z: m.z + 3,
    draw: (b: RecipeBuilder, floor: Floor, fine: boolean) => bulbs(b, floor, m.x - 2, m.z + 3, 4, i + 20, fine) }] : []),
  { id: "escarp.mast", x: 1356, z: -748, draw: (b, floor, fine) => latticeMast(b, floor, 1356, -748, 30, 4.5, fine, C.warm) },
  { id: "escarp.inlays", x: RING.x, z: RING.z - 1, draw: (b, _floor, fine) => {
    // The ring's square section presents a ridge toward -Z: inlays sit on it.
    const face = RING.z - RING.thick - 0.04;
    glow(b, () => { for (let i = 1; i < RING_POINTS.length - 1; i += fine ? 2 : 4) b.box([RING_POINTS[i]!.x, RING_POINTS[i]!.y, face], [0.9, 0.9, 0.06], i % 4 === 1 ? C.cyan : C.warm); });
  } },
];

/** Solid sets and dressing anchored in this chunk, as one cel mesh (or
 * null). Yields between parts when the build step's slice is used. */
export function* vistaMesh(chunk: ChunkDescriptor, lod: LodLevel, floor: Floor, due: () => boolean): Generator<void, MeshRecipe | null> {
  const { min, max } = chunk.bounds, inside = (x: number, z: number): boolean => x >= min.x && x < max.x && z >= min.z && z < max.z;
  const sets = VISTA_SETS.filter(s => inside(s.anchor.x, s.anchor.z)), dressing = VISTA_DRESSING.filter(p => inside(p.x, p.z));
  if (!sets.length && !dressing.length) return null;
  const b = new RecipeBuilder(), fine = lod === "fine";
  for (const s of sets) { if (due()) yield; drawSolidSet(b, s, fine); }
  for (const p of dressing) { if (due()) yield; p.draw(b, floor, fine); }
  return b.vertexCount ? b.finish(`${chunk.id}.vista`, 0.22) : null;
}
