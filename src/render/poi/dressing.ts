import { hash2 } from "../../content/regions/noise.js";
import { ARCH_LINE, archHalfWidth, FALL, FLOAT_LINE, floatAt, SOUNDING, soundingFloat, SPAN_POST_H, SPAN_POSTS, SUPPLY, WRECK, WRECK_MAST } from "../../content/poi/sets.js";
import { PALETTE } from "../palette.js";
import { hex, type P3, type RecipeBuilder, type Rgb } from "../biomes/recipe.js";
import type { VistaPart } from "../biomes/vistas.js";

/** Thin, visual-only dressing for the deep-leg points of interest
 * (`content/poi/sets.ts` holds their solid parts): cables, tethers and
 * glowing growth, drawn to look permeable like the vistas' own dressing.
 * The lights are kept at coarse LOD too: they are what reads from the route. */
type Floor = (x: number, z: number) => number;
export const C = {
  petrol: hex(PALETTE.petrol), steel: hex(PALETTE.steelLight), rust: hex("#a8743f"), ochre: hex(PALETTE.ochre),
  glow: hex("#ffd27a"), warm: hex(PALETTE.warm), cyan: hex("#9fe6e0"), mint: hex("#8ff0c4"), lilac: hex("#cdb8ff"),
  amber: hex("#ffc070"), ember: hex("#ffa060"), bone: hex("#d9d2bf"), teal: hex("#2f8a85"),
} as const;
/** Draw `f` unlit (alpha -1), or faintly luminous (-0.3: ATM-1's crystal glow). */
export const lit = (b: RecipeBuilder, f: () => void, faint = false): void => { const a = b.alpha; b.alpha = faint ? -0.3 : -1; f(); b.alpha = a; };
/** A cable hanging between two points, `sag` metres at its middle. */
export function catenary(a: P3, c: P3, sag: number, n: number): P3[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    return [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (c[2] - a[2]) * t] as P3;
  });
}
/** Glowing growth: a clump of short stalks with lit bulbs. */
function colony(b: RecipeBuilder, floor: Floor, x: number, z: number, n: number, seed: number, color: Rgb, fine: boolean): void {
  for (let i = 0; i < (fine ? n : Math.ceil(n / 3)); i++) {
    const a = i * 2.4 + seed, r = 0.3 + 1.1 * (0.5 + 0.5 * hash2(i, seed, 1)), px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    const y = floor(px, pz) - 0.1, h = 0.5 + 0.9 * (0.5 + 0.5 * hash2(i, seed, 2));
    if (fine) b.tube([[px, y, pz], [px, y + h, pz]], 0.05, 3, C.teal);
    lit(b, () => b.ellipsoid([px, y + h + 0.15, pz], [0.2, 0.24, 0.2], color, 2, fine ? 5 : 4));
  }
}

export const POI_DRESSING: readonly VistaPart[] = [
  // The trench span: three cables between the post heads, lit floats on the
  // middle one, and a broken end dangling into the trench.
  { id: "poi.rift.trench_span.cables", x: SPAN_POSTS[1]!.x, z: SPAN_POSTS[1]!.z, draw: (b, _floor, fine) => {
    const [w, e] = SPAN_POSTS as [typeof SPAN_POSTS[0], typeof SPAN_POSTS[0]];
    const head = (q: typeof w, dy: number): P3 => [q.x, q.y + SPAN_POST_H - dy, q.z];
    const mid = catenary(head(w, 0.6), head(e, 0.6), 14, fine ? 24 : 12);
    for (const [dy, sag] of [[0.6, 14], [2.4, 16], [4.2, 17]] as const) b.tube(catenary(head(w, dy), head(e, dy), sag, fine ? 24 : 8), 0.12, 3, C.petrol);
    lit(b, () => { for (let i = 2; i < mid.length - 1; i += fine ? 2 : 1) b.ellipsoid(mid[i]!, [0.7, 0.6, 0.7], i % 4 === 2 ? C.warm : C.glow, 2, fine ? 6 : 4); });
    const low = catenary(head(w, 4.2), head(e, 4.2), 17, 24)[15]!;
    b.tube([low, [low[0] + 0.8, low[1] - 9, low[2] + 0.4], [low[0] + 1.6, low[1] - 17, low[2] - 0.6]], 0.11, 3, C.petrol);
  } },
  // The sounding line's riser through every float.
  { id: "poi.basin.sounding_line.riser", x: SOUNDING.x + 1, z: SOUNDING.z, draw: (b, floor) => {
    const pts: P3[] = [[SOUNDING.x, floor(SOUNDING.x, SOUNDING.z) + 0.9, SOUNDING.z]];
    for (let k = 0; k < SOUNDING.floats; k++) { const f = soundingFloat(k); pts.push([f.x, f.y - 0.7, f.z]); }
    for (let i = 0; i < pts.length - 1; i++) b.tube([pts[i]!, [pts[i + 1]![0], pts[i + 1]![1], pts[i + 1]![2]]], 0.09, 3, C.steel);
  } },
  // The fall: mint growth along the spine and among the ribs, the gathering
  // (three parts, so no one part holds up the chunk build).
  ...[0, 1, 2].map((part): VistaPart => ({ id: `poi.basin.fall.growth.${part}`, x: FALL.x - FALL.length * 0.3 + FALL.length * 0.3 * part, z: FALL.z + 3,
    draw: (b, floor, fine) => {
      for (let i = part * 3; i < part * 3 + 3; i++) {
        const x = FALL.x - FALL.length * 0.45 + FALL.length * 0.9 * i / 8 + hash2(i, 7, 1), z = FALL.z + 2.5 + hash2(i, 7, 2) * 3.5;
        colony(b, floor, x, z, 6, i + 30, i % 3 ? C.mint : C.cyan, fine);
      }
    } })),
  // Float tethers.
  { id: "poi.divide.float_line.tethers", x: FLOAT_LINE[2]!.x + 1, z: FLOAT_LINE[2]!.z, draw: (b) => {
    FLOAT_LINE.forEach((a, k) => { const f = floatAt(k); b.tube([[a.x, a.y + 0.8, a.z], [f.x, f.y - 0.7, f.z]], 0.07, 3, C.steel); });
  } },
  // The supply run: three cables on the floor from box to box, on to the
  // pylon, one part each.
  ...([[-0.45, C.petrol], [0, C.ochre], [0.45, C.petrol]] as const).map(([o, color], part): VistaPart => ({
    id: `poi.meridian.supply_cable.run.${part}`, x: SUPPLY[2]!.x + 1 + part, z: SUPPLY[2]!.z, draw: (b, floor, fine) => {
      const end = { x: 1071, z: -1105 }, line = [...SUPPLY.map(p => ({ x: p.x, z: p.z })), end], pts: P3[] = [];
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i]!, c = line[i + 1]!, n = Math.ceil(Math.hypot(c.x - a.x, c.z - a.z) / (fine ? 3 : 8));
        for (let k = i ? 1 : 0; k <= n; k++) { const x = a.x + (c.x - a.x) * k / n, z = a.z + (c.z - a.z) * k / n + o; pts.push([x, floor(x, z) + 0.2, z]); }
      }
      b.tube(pts, 0.13, 3, color);
      // Lit couplings on the middle cable, every 8 m: the run reads as a
      // dotted line down the slope.
      if (o === 0) lit(b, () => {
        let run = 0;
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1]!, c = pts[i]!;
          run += Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
          if (run >= 8) { run = 0; b.ellipsoid([c[0], c[1] + 0.1, c[2]], [0.35, 0.3, 0.35], C.warm, 2, fine ? 5 : 4); }
        }
      });
    } })),
  // Lines trailing from the wreck's gunwales into the brine.
  { id: "poi.divide.mirror_wreck.lines", x: WRECK.x + 1, z: WRECK.z, draw: (b, _floor, fine) => {
    if (!fine) return;
    for (const [dx, dz] of [[-6, -4], [-1, -4.6], [5, -4]] as const) {
      const x = WRECK.x + dx, z = WRECK.z + dz, y = WRECK_MAST[0].y - 6;
      b.tube([[x, y + 4, z], [x + 0.4, y - 2, z - 0.6], [x - 0.3, y - 9, z - 0.4]], 0.07, 3, C.steel);
    }
  } },
  // Crystal crust on the arch: lilac shards, faint along the crown, a few
  // fully lit so the arch's line reads from the route.
  { id: "poi.divide.crystal_arch.crust", x: ARCH_LINE[6]!.x + 1, z: ARCH_LINE[6]!.z, draw: (b, _floor, fine) => {
    for (let i = 1; i < ARCH_LINE.length - 1; i++) {
      // On the outer face: out from the line, in its plane, by the rock's
      // half-width at the joint (the thinner of the two segments).
      const a = ARCH_LINE[i - 1]!, q = ARCH_LINE[i]!, c = ARCH_LINE[i + 1]!, ty = c.y - a.y, tz = c.z - a.z, l = Math.hypot(ty, tz);
      const ny = Math.abs(tz) / l, nz = -Math.sign(tz) * ty / l, r = Math.min(archHalfWidth(i - 1), archHalfWidth(i)) - 0.25;
      for (let k = 0; k < (fine ? 2 : 1); k++) {
        const x = q.x + (k - 0.5) * 0.9, y = q.y + ny * r, z = q.z + nz * r + (k - 1) * 0.3, h = 1.1 + 0.9 * (0.5 + 0.5 * hash2(i, k, 5));
        const full = i % 3 === 0 && k === 0;
        lit(b, () => b.frustum([x, y - 0.3 * ny, z - 0.3 * nz], [x + 0.2, y + h * ny, z + h * nz], 0.35, 0.05, 4, C.lilac), !full);
      }
    }
  } },
];
