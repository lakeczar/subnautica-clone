import type { TemplateRecipe } from "../kit/types.js";
import { hex, RecipeBuilder, type P3, type Rgb } from "./recipe.js";

/** Shared immutable templates for S2 scatter: unit-scale, base at the local
 * origin, +Y up. Instances scale, tilt and tint them; the kit draws each
 * template once per chunk. Every template has a fine and a cheaper coarse
 * form with the same silhouette. */
const P = {
  stone: hex("#6f8d8a"), stoneDark: hex("#4a676b"), basalt: hex("#3a5f68"), pale: hex("#c9d5ca"),
  porcelain: hex("#f1ecd8"), coral: hex("#e48a70"), coralRim: hex("#ffc18b"), ochre: hex("#e6a139"),
  jade: hex("#47b58d"), lime: hex("#c3df86"), teal: hex("#2f8a85"), violet: hex("#9a89c0"),
  crystal: hex("#b9c7ea"), crystalDeep: hex("#7f8fbf"), grass: hex("#8fae6e"), grassDark: hex("#6b8f57"),
  leaf: hex("#5d9a63"), metal: hex("#7c9ea3"), steel: hex("#9bbdb9"), petrol: hex("#193f4c"),
  salt: hex("#d9d6e2"), warm: hex("#ffe5aa"), glow: hex("#ffd27a"), amber: hex("#f2b94d"),
} as const;

let seed = 1;
const rand = (): number => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
const jitter = (k: number) => (i: number): number => { seed = 7 + i * 13; return 1 - k / 2 + rand() * k; };

type Build = (b: RecipeBuilder, fine: boolean) => void;
const template = (id: string, contour: number, build: Build): TemplateRecipe => {
  const f = new RecipeBuilder(), c = new RecipeBuilder();
  build(f, true); build(c, false);
  return { id, fine: f.finish(`${id}.fine`, contour), coarse: c.finish(`${id}.coarse`, contour) };
};

/** A sea fan blade on a short stalk. `w`/`h` set its outline, `spread` the
 * arc it opens through, `curl` how far the rim cups forward, `ruffle` a wavy
 * rim and `yaw`/`at` place it, so one function gives distinct silhouettes. */
interface FanShape { w: number; h: number; stalk: number; spread: number; curl: number; ruffle: number; yaw: number; at: P3 }
const FAN: FanShape = { w: 0.75, h: 0.95, stalk: 0.45, spread: 0.84, curl: 0, ruffle: 0.06, yaw: 0, at: [0, 0, 0] };
const fan = (b: RecipeBuilder, fine: boolean, color: Rgb, rim: Rgb, shape: Partial<FanShape> = {}): void => {
  const s = { ...FAN, ...shape }, cy = Math.cos(s.yaw), sy = Math.sin(s.yaw);
  const put = (x: number, y: number, z: number): P3 => [s.at[0] + x * cy - z * sy, s.at[1] + y, s.at[2] + x * sy + z * cy];
  b.frustum(put(0, 0, 0), put(0, s.stalk, 0), 0.06, 0.04, fine ? 5 : 3, P.stoneDark);
  const n = fine ? 9 : 4, pts: P3[] = [put(0, s.stalk, 0)];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI * ((1 - s.spread) / 2 + s.spread * i / n), edge = Math.sin(a);
    pts.push(put(Math.cos(a) * s.w, s.stalk + edge * s.h, Math.sin(i * 1.7) * s.ruffle + s.curl * edge * edge));
  }
  for (let i = 1; i < pts.length - 1; i++) b.face([pts[0]!, pts[i]!, pts[i + 1]!], i % 2 ? color : rim);
  if (fine) b.tube(pts.slice(1), 0.025, 3, rim);
};
/** Fan silhouettes shared by the pale and coral fans: the plain blade, a tall
 * narrow whip, a twin from one holdfast and a low cupped ruffle. */
const FAN_FORMS: readonly (readonly [string, readonly Partial<FanShape>[]])[] = [
  ["", [{}]],
  [".whip", [{ w: 0.38, h: 1.55, stalk: 0.3, spread: 0.7, ruffle: 0.03 }]],
  [".twin", [{ w: 0.55, h: 0.8, yaw: 0.5, at: [0.12, 0, 0] }, { w: 0.45, h: 0.62, stalk: 0.35, yaw: -0.65, at: [-0.14, 0, 0.05] }]],
  [".ruffle", [{ w: 1.05, h: 0.6, stalk: 0.25, spread: 0.92, curl: 0.35, ruffle: 0.14 }]],
];

/** Flat rock plates: one slab, a stepped stack, a split pair and a wedge. */
const SLABS: Readonly<Record<string, (b: RecipeBuilder, fine: boolean) => void>> = {
  "": (b, fine) => {
    b.box([0, 0.16, 0], [2, 0.32, 1.35], P.stoneDark, 0.1, P.stone);
    if (fine) b.box([0.25, 0.4, 0.1], [1.2, 0.18, 0.8], P.stone, -0.25, P.pale);
  },
  ".stack": (b, fine) => {
    b.box([0, 0.14, 0], [1.7, 0.28, 1.2], P.stoneDark, 0.3, P.stone);
    b.box([0.2, 0.4, -0.1], [1.25, 0.24, 0.9], P.stone, -0.2, P.pale);
    if (fine) b.box([-0.05, 0.62, 0.05], [0.7, 0.2, 0.55], P.stoneDark, 0.6, P.stone);
  },
  ".split": (b, fine) => {
    b.box([-0.55, 0.15, 0], [0.95, 0.3, 1.4], P.stoneDark, 0.05, P.stone);
    b.box([0.6, 0.32, 0.1], [0.9, 0.28, 1.25], P.stone, -0.12, P.pale);
    if (fine) b.box([0.05, 0.08, -0.55], [0.35, 0.16, 0.3], P.stoneDark, 0.4);
  },
  ".wedge": (b, fine) => {
    const l = 1.1, d = 0.75;
    b.face([[-l, 0, -d], [l, 0, -d], [l, 0.75, -d * 0.2], [-l, 0.55, -d * 0.2]], P.stone);
    b.face([[-l, 0, d], [-l, 0.55, -d * 0.2], [l, 0.75, -d * 0.2], [l, 0, d]], P.pale);
    b.face([[-l, 0, -d], [-l, 0.55, -d * 0.2], [-l, 0, d]], P.stoneDark);
    b.face([[l, 0, -d], [l, 0, d], [l, 0.75, -d * 0.2]], P.stoneDark);
    if (fine) b.box([0.7, 0.08, 0.95], [0.5, 0.16, 0.35], P.stoneDark, 0.5);
  },
};

export const S2_TEMPLATES: readonly TemplateRecipe[] = [
  template("s2.rock.boulder", 0.15, (b, fine) =>
    b.ellipsoid([0, 0.45, 0], [1, 0.72, 0.86], P.stone, fine ? 4 : 3, fine ? 7 : 5, jitter(0.35))),
  template("s2.rock.boulder.flat", 0.15, (b, fine) => {
    b.ellipsoid([0, 0.28, 0], [1.25, 0.42, 0.95], P.stoneDark, fine ? 4 : 3, fine ? 8 : 5, jitter(0.3));
    if (fine) b.ellipsoid([0.2, 0.55, -0.1], [0.7, 0.2, 0.55], P.stone, 3, 6, jitter(0.25));
  }),
  template("s2.rock.boulder.pair", 0.15, (b, fine) => {
    b.ellipsoid([-0.25, 0.5, 0], [0.85, 0.78, 0.8], P.stone, fine ? 4 : 3, fine ? 7 : 5, jitter(0.35));
    b.ellipsoid([0.8, 0.26, 0.35], [0.45, 0.36, 0.42], P.stoneDark, 3, fine ? 6 : 4, jitter(0.3));
  }),
  ...Object.entries(SLABS).map(([suffix, build]) => template(`s2.rock.slab${suffix}`, 0.15, build)),
  template("s2.rock.column", 0.2, (b, fine) => {
    const cols: [number, number, number][] = fine ? [[0, 0, 3], [0.62, 0.2, 2.2], [-0.4, 0.55, 1.6]] : [[0, 0, 3]];
    for (const [x, z, h] of cols) b.frustum([x, 0, z], [x, h, z], 0.36, 0.33, 6, P.basalt, P.stone);
  }),
  template("s2.rock.column.lean", 0.2, (b, fine) => {
    // A broken pair: one leaning shaft and its fallen top beside it.
    b.frustum([0, 0, 0], [0.55, 2.6, 0.2], 0.4, 0.34, 6, P.basalt, P.stone);
    b.frustum([0.9, 0.3, 0.6], [2.2, 0.32, 1.1], 0.33, 0.31, fine ? 6 : 4, P.basalt, P.stone);
    if (fine) b.frustum([-0.55, 0, -0.3], [-0.6, 1.2, -0.3], 0.3, 0.28, 6, P.basalt, P.pale);
  }),
  template("s2.rock.column.stump", 0.2, (b, fine) => {
    const cols: [number, number, number][] = fine ? [[0, 0, 1.1], [0.7, 0.1, 0.8], [0.3, 0.68, 0.55], [-0.45, 0.4, 0.95]] : [[0, 0, 1.1], [0.6, 0.3, 0.8]];
    for (const [x, z, h] of cols) b.frustum([x, 0, z], [x, h, z], 0.42, 0.4, 6, P.stoneDark, P.pale);
  }),
  template("s2.rock.shard", 0.2, (b, fine) => {
    const s: [number, number, number, number][] = fine ? [[0, 0, 1.7, 0.08], [0.3, 0.1, 1.1, -0.35], [-0.25, -0.2, 0.9, 0.4]] : [[0, 0, 1.7, 0]];
    for (const [x, z, h, lean] of s) b.frustum([x, 0, z], [x + lean * 0.5, h, z], 0.22, 0.01, fine ? 6 : 4, P.crystal, P.crystalDeep);
  }),
  template("s2.rock.shard.spray", 0.2, (b, fine) => {
    // Shards radiating from one seam, longest leaning outward.
    const n = fine ? 7 : 3;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + 0.4, r = 0.55 + 0.6 * ((i * 5) % 3) / 2, h = 0.8 + 1.3 * ((i * 3) % 4) / 3;
      b.frustum([Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12], [Math.cos(a) * r, h, Math.sin(a) * r], 0.16, 0.01, fine ? 5 : 4, i % 3 ? P.crystal : P.violet, P.crystalDeep);
    }
  }),
  ...FAN_FORMS.flatMap(([suffix, blades]) => [
    template(`s2.flora.fan${suffix}`, 0.12, (b, fine) => { for (const s of blades) fan(b, fine, P.porcelain, P.coralRim, s); }),
    template(`s2.flora.fan_coral${suffix}`, 0.12, (b, fine) => { for (const s of blades) fan(b, fine, P.coral, P.amber, s); }),
  ]),
  template("s2.flora.tube", 0.1, (b, fine) => {
    const tubes: [number, number, number][] = fine ? [[0, 0, 1], [0.2, 0.12, 0.75], [-0.16, 0.18, 0.6], [0.08, -0.22, 0.85], [-0.22, -0.1, 0.5]] : [[0, 0, 1], [0.18, 0.1, 0.7]];
    for (const [x, z, h] of tubes) {
      b.frustum([x, 0, z], [x, h, z], 0.07, 0.06, fine ? 5 : 3, P.pale);
      b.frustum([x, h, z], [x, h + 0.08, z], 0.075, 0.09, fine ? 5 : 3, P.ochre);
    }
  }),
  template("s2.flora.tube.organ", 0.1, (b, fine) => {
    // Tall pipes stepping down in a curve, wider mouths.
    const n = fine ? 6 : 3;
    for (let i = 0; i < n; i++) {
      const t = i / Math.max(1, n - 1), x = Math.cos(t * 2.2) * 0.35, z = Math.sin(t * 2.2) * 0.35, h = 1.8 - t * 1.1;
      b.frustum([x, 0, z], [x, h, z], 0.09, 0.08, fine ? 5 : 3, i % 2 ? P.pale : P.salt);
      b.frustum([x, h, z], [x, h + 0.1, z], 0.1, 0.13, fine ? 5 : 3, P.amber);
    }
  }),
  template("s2.flora.tube.ring", 0.1, (b, fine) => {
    const n = fine ? 9 : 4;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, x = Math.cos(a) * 0.5, z = Math.sin(a) * 0.5, h = 0.35 + 0.25 * ((i * 7) % 3) / 2;
      b.frustum([x, 0, z], [x * 1.1, h, z * 1.1], 0.08, 0.07, fine ? 5 : 3, P.pale);
      b.frustum([x * 1.1, h, z * 1.1], [x * 1.12, h + 0.06, z * 1.12], 0.08, 0.1, fine ? 5 : 3, P.coral);
    }
  }),
  template("s2.flora.frond", 0.15, (b, fine) => {
    b.tube([[0, 0, 0], [0.12, 2.2, 0.05], [0.05, 4.4, -0.1], [-0.1, 6, 0]], 0.07, fine ? 5 : 3, P.teal);
    const leaves = fine ? 4 : 2;
    for (let i = 0; i < leaves; i++) {
      const a = i / leaves * Math.PI * 2, y = 1.6 + i * 0.9;
      const ax: P3 = [Math.cos(a), 0, Math.sin(a)];
      b.leaf([[0, y, 0], [ax[0] * 0.9, y + 0.7, ax[2] * 0.9], [ax[0] * 1.6, y + 0.5, ax[2] * 1.6]], [0.05, 0.35, 0.05],
        [-ax[2], 0, ax[0]], P.jade, P.lime);
    }
    b.alpha = -1; b.ellipsoid([-0.1, 6.25, 0], [0.32, 0.4, 0.32], P.glow, fine ? 3 : 2, fine ? 6 : 4); b.alpha = 1;
  }),
  template("s2.flora.crown", 0.2, (b, fine) => {
    // A tethered lantern crown: thin holdfast line, float bladder, skirt of fronds.
    b.tube([[0, 0, 0], [0.4, 9, 0.2], [0.1, 18, -0.3], [0, 24, 0]], 0.12, fine ? 4 : 3, P.teal);
    b.ellipsoid([0, 26.5, 0], [3.2, 2.6, 3.2], P.ochre, fine ? 5 : 3, fine ? 9 : 6);
    const n = fine ? 8 : 4;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, d: P3 = [Math.cos(a), 0, Math.sin(a)];
      b.leaf([[d[0] * 2.4, 25, d[2] * 2.4], [d[0] * 5, 24.2, d[2] * 5], [d[0] * 7.5, 21.5, d[2] * 7.5]], [0.2, 1.1, 0.1],
        [-d[2], 0, d[0]], P.jade, P.lime);
    }
    b.alpha = -1;
    for (let i = 0; i < (fine ? 5 : 2); i++) { const a = i * 1.26; b.ellipsoid([Math.cos(a) * 2.2, 24.3, Math.sin(a) * 2.2], [0.35, 0.45, 0.35], P.warm, 2, 4); }
    b.alpha = 1;
  }),
  template("s2.flora.ribbon", 0.1, (b, fine) => {
    const n = fine ? 5 : 2;
    for (let i = 0; i < n; i++) {
      const a = i * 1.3, x = Math.cos(a) * 0.25, z = Math.sin(a) * 0.25;
      b.leaf([[x, 0, z], [x + 0.15, 0.9, z], [x + 0.45, 1.8, z + 0.1], [x + 0.95, 2.5, z + 0.15]], [0.05, 0.14, 0.12, 0.04],
        [0, 0, 1], i % 2 ? P.jade : P.coral, P.amber);
    }
  }),
  template("s2.flora.grass", 0, (b, fine) => {
    const n = fine ? 7 : 3;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + 0.3, r = 0.12, x = Math.cos(a) * r, z = Math.sin(a) * r;
      const tip: P3 = [x * 3.2, 0.55 + (i % 3) * 0.12, z * 3.2];
      b.face([[x - 0.04 * Math.sin(a), 0, z + 0.04 * Math.cos(a)], [x + 0.04 * Math.sin(a), 0, z - 0.04 * Math.cos(a)], tip], i % 2 ? P.grass : P.grassDark);
    }
  }),
  template("s2.flora.shrub", 0.12, (b, fine) => {
    b.ellipsoid([0, 0.5, 0], [0.75, 0.55, 0.7], P.leaf, 3, fine ? 7 : 5, jitter(0.3));
    if (fine) { b.ellipsoid([0.45, 0.75, 0.2], [0.45, 0.4, 0.45], P.grass, 3, 6); b.ellipsoid([-0.3, 0.85, -0.25], [0.35, 0.32, 0.35], P.lime, 3, 5); }
  }),
  template("s2.flora.cup", 0.1, (b, fine) => {
    const cups: [number, number, number][] = fine ? [[0, 0, 0.3], [0.35, 0.15, 0.22], [-0.25, 0.3, 0.18]] : [[0, 0, 0.3]];
    for (const [x, z, r] of cups) {
      b.frustum([x, 0, z], [x, r * 0.9, z], r * 0.25, r * 0.15, 4, P.stoneDark);
      b.frustum([x, r * 0.9, z], [x, r * 1.4, z], r * 0.4, r, fine ? 7 : 4, P.coral, P.coralRim);
    }
  }),
  template("s2.flora.cup.tier", 0.1, (b, fine) => {
    // Plate cups stacked up one stalk, widest at the bottom.
    b.frustum([0, 0, 0], [0.05, 1.1, 0], 0.07, 0.05, 4, P.stoneDark);
    for (const [y, r] of fine ? [[0.3, 0.42], [0.62, 0.32], [0.92, 0.22]] as const : [[0.3, 0.42], [0.8, 0.26]] as const)
      b.frustum([0.02, y, 0], [0.02, y + 0.12, 0], r * 0.3, r, fine ? 7 : 4, P.coral, P.coralRim);
  }),
  template("s2.debris.panel", 0.25, (b, fine) => {
    b.box([0, 0.04, 0], [0.9, 0.08, 0.6], P.metal, 0, P.steel);
    if (fine) b.box([0, 0.085, -0.2], [0.9, 0.012, 0.08], P.ochre);
  }),
  template("s2.debris.pipe", 0.25, (b, fine) => {
    b.frustum([-1.5, 0.25, 0], [1.5, 0.25, 0], 0.25, 0.25, fine ? 7 : 4, P.metal, P.petrol);
    if (fine) b.frustum([1.1, 0.25, 0], [1.25, 0.25, 0], 0.3, 0.3, 7, P.ochre);
  }),
  template("s2.salt.crust", 0, (b, fine) => {
    const n = fine ? 7 : 5, pts: P3[] = [];
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push([Math.cos(a) * (0.8 + (i % 2) * 0.25), 0.12, Math.sin(a) * (0.8 + (i % 2) * 0.25)]); }
    b.face([...pts].reverse(), P.salt);
    for (let i = 0; i < n; i++) b.face([[pts[i]![0] * 1.1, 0, pts[i]![2] * 1.1], pts[i]!, pts[(i + 1) % n]!, [pts[(i + 1) % n]![0] * 1.1, 0, pts[(i + 1) % n]![2] * 1.1]].reverse() as P3[], P.violet);
  }),
  template("s2.lamp", 0.2, (b, fine) => {
    b.frustum([0, 0, 0], [0, 3.4, 0], 0.09, 0.07, fine ? 5 : 3, P.petrol);
    b.box([0, 3.45, 0], [0.5, 0.18, 0.5], P.metal);
    b.alpha = -1; b.box([0, 3.3, 0], [0.38, 0.14, 0.38], P.warm); b.alpha = 1;
  }),
];
export const S2_TEMPLATE_IDS = new Set(S2_TEMPLATES.map(t => t.id));
