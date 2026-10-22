import type { RegionId } from "../registry.js";
import type { Vec3 } from "../../world/types.js";
import { hash2 } from "../regions/noise.js";
import { BRINE_Y, RIFT_AXIS } from "../regions/terrain.js";
import { worldFloor } from "../regions/worldFloor.js";
import { beam, block, dominant, lerp, slabStep, v, type VistaBlock, type VistaPiece, type VistaSet, type VistaTone } from "../vistaKit.js";

/** POI-1: small authored dressing sets along the deep legs (M2 audit #3 and
 * #10), one about every 300–400 m of each leg's route, each glimpsed from the
 * route by its lights and drawn closer on approach. Purely visual: no
 * resources, recipes or story. Ambiguous wreckage and use, not plot.
 *
 * Each POI is a solid set here (blocks and prisms: drawn exactly as its
 * collision, like `VISTA_SETS`) plus thin, visual-only dressing in
 * `render/poi/` (cables, tethers, glowing growth). Every POI keeps clear of
 * routes, rescue tethers, carrier lanes and cave footprints
 * (tests/poi.test.ts). */
export type PoiKind = "cable_span" | "buoy_line" | "gathering" | "float_line" | "cable_run" | "wreck" | "rock_arch";
export interface PoiDef {
  readonly id: string;
  readonly region: RegionId;
  readonly kind: PoiKind;
  /** The deep leg it serves (`legs.ts`). */
  readonly leg: string;
  /** Owner-facing label. */
  readonly label: string;
  /** Its brightest light: where a pilot's eye goes from the route. */
  readonly beacon: Vec3;
  /** A content-bible discovery cluster this realises, when one fits. */
  readonly cluster?: string;
}

const floor = worldFloor;
const ground = (x: number, z: number, lift = 0): Vec3 => v(x, floor(x, z) + lift, z);
/** A lamp on a block's top: the lens is its own small lit block. */
const lens = (c: Vec3, s: number, tone: VistaTone): VistaBlock => block(v(c.x - s / 2, c.y, c.z - s / 2), v(c.x + s / 2, c.y + s * 0.7, c.z + s / 2), tone);
/** A box `w x h x d` standing on `c` (its base centre). */
const stand = (c: Vec3, w: number, h: number, d: number, tone: VistaTone, top?: VistaTone): VistaBlock =>
  block(v(c.x - w / 2, c.y, c.z - d / 2), v(c.x + w / 2, c.y + h, c.z + d / 2), tone, top);

// --- Basin ↔ Rift: a cable span across the trench ---------------------------

/** A point on the Rift axis `s` metres from the head, with its across-trench
 * normal (toward the cool south-east flank). */
export function riftAxisAt(s: number): { x: number; z: number; nx: number; nz: number } {
  let acc = 0;
  for (let i = 1; i < RIFT_AXIS.length; i++) {
    const [ax, az] = RIFT_AXIS[i - 1]!, [bx, bz] = RIFT_AXIS[i]!, l = Math.hypot(bx - ax, bz - az);
    if (s <= acc + l || i === RIFT_AXIS.length - 1) {
      const t = (s - acc) / l, tx = (bx - ax) / l, tz = (bz - az) / l;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, nx: -tz, nz: tx };
    }
    acc += l;
  }
  throw new Error("unreachable");
}
const SPAN_AT = riftAxisAt(332), SPAN_HALF = 62;
/** The span's two posts, cool flank last; cables hang between their heads. */
export const SPAN_POSTS: readonly Vec3[] = [-1, 1].map(side => ground(SPAN_AT.x + SPAN_AT.nx * SPAN_HALF * side, SPAN_AT.z + SPAN_AT.nz * SPAN_HALF * side));
export const SPAN_POST_H = 8;
const span: VistaBlock[] = SPAN_POSTS.flatMap(p => [
  stand(v(p.x, p.y - 1, p.z), 3.2, 2.4, 3.2, "concrete", "ochre"),
  stand(v(p.x, p.y + 1.4, p.z), 0.8, SPAN_POST_H - 1.4, 0.8, "petrol"),
  lens(v(p.x, p.y + SPAN_POST_H, p.z), 1.2, "glow"),
]);

// --- Basin ↔ Divide: a sounding line and a fall -----------------------------

/** A moored line of lit floats rising from a sinker, leaning with the drift. */
export const SOUNDING = { x: 384, z: -728, floats: 6, step: 7, lean: 0.1 } as const;
export const soundingFloat = (k: number): Vec3 => {
  const base = floor(SOUNDING.x, SOUNDING.z), rise = 9 + k * SOUNDING.step;
  return v(SOUNDING.x + rise * SOUNDING.lean, base + rise, SOUNDING.z - rise * SOUNDING.lean * 0.4);
};
const sounding: VistaBlock[] = [
  stand(ground(SOUNDING.x, SOUNDING.z, -0.8), 3.4, 1.7, 3.4, "concrete2", "rust"),
  ...Array.from({ length: SOUNDING.floats }, (_, k): VistaBlock[] => {
    const c = soundingFloat(k), top = k === SOUNDING.floats - 1, s = top ? 1.6 : 1.1;
    return [stand(v(c.x, c.y - s * 0.6, c.z), s, s * 1.1, s, top ? "ochre" : "petrol"), lens(v(c.x, c.y - s * 0.6 + s * 1.1, c.z), s * 1.05, top ? "warm" : "glow")];
  }).flat(),
];

/** A great animal's fall on the deep slope: spine, a half-buried skull and
 * a broken cage of ribs, all bone; glowing growth gathers on it (render). */
export const FALL = { x: 488, z: -842, length: 26, ribs: 8, seed: 19 } as const;
const fallSpine: Vec3[] = Array.from({ length: 7 }, (_, i) => {
  const x = FALL.x - FALL.length / 2 + FALL.length * i / 6, z = FALL.z + Math.sin(i * 0.7) * 1.4;
  return v(x, floor(x, z) + 0.4, z);
});
function fallRib(i: number): VistaPiece[] {
  // The animal lies on its side: each rib leaves the spine in a constant-X
  // plane, arches up and over to the north and comes down near the floor.
  // Some are broken short.
  const t = (i + 0.5) / FALL.ribs, x = FALL.x - FALL.length * 0.32 + FALL.length * 0.62 * t, z0 = FALL.z + Math.sin(t * 4.2) * 1.4;
  const size = 1 - Math.abs(t - 0.4) * 0.9, reach = 5.5 * size + 1.5, rise = 6.5 * size + 1.2;
  const keep = hash2(i, FALL.seed, 1) > -0.35 ? 8 : 4, pts: Vec3[] = [];
  for (let j = 0; j <= keep; j++) {
    const a = Math.PI * 0.92 * j / 8, z = z0 + reach * (1 - Math.cos(a)) / 2;
    pts.push(v(x, floor(x, z) + 0.4 + rise * Math.sin(a), z));
  }
  return beam(pts, () => [0.32, 0.32, 0.14], () => "bone");
}
const fall: { blocks: VistaBlock[]; pieces: VistaPiece[] } = {
  blocks: [
    // The skull, half sunk, at the west end; a jaw beside it.
    stand(v(fallSpine[0]!.x - 3.4, fallSpine[0]!.y - 1.6, fallSpine[0]!.z), 4.2, 3, 3.2, "bone"),
    stand(ground(fallSpine[0]!.x - 3.8, fallSpine[0]!.z + 3.4, -0.5), 3.6, 1, 1.2, "bone"),
  ],
  pieces: [...beam(fallSpine, () => [0.6, 0.6, 0.25], () => "bone"), ...Array.from({ length: FALL.ribs }, (_, i) => fallRib(i)).flat()],
};

// --- Divide ↔ Meridian: a float line and a supply cable ---------------------

/** Instrument floats on short tethers, in a line stepping east toward
 * Meridian along the ridge's north lee. */
export const FLOAT_LINE: readonly Vec3[] = Array.from({ length: 6 }, (_, k) => {
  const x = 806 + k * 20, z = -1076 - k * 1.5 + hash2(k, 4, 2) * 2;
  return v(x, floor(x, z), z);
});
export const floatAt = (k: number): Vec3 => { const a = FLOAT_LINE[k]!; return v(a.x, a.y + 10 + k * 1.2, a.z); };
const floats: VistaBlock[] = FLOAT_LINE.flatMap((a, k) => {
  const f = floatAt(k);
  return [stand(v(a.x, a.y - 0.6, a.z), 1.6, 1.4, 1.6, "concrete"), stand(v(f.x, f.y - 0.7, f.z), 1, 1.4, 1, "petrol"), lens(v(f.x, f.y + 0.7, f.z), 1.2, "cyan")];
});

/** A power run laid down the Divide's east slope to the staging shelf's
 * north pylon: junction boxes on the cable every 26 m, status lamps lit,
 * one box burst open; lit couplings bead the cable between them (render). */
export const SUPPLY: readonly Vec3[] = Array.from({ length: 5 }, (_, k) => {
  const x = 960 + k * 26, z = -1093 - k * 2.5;
  return v(x, floor(x, z), z);
});
const supply: VistaBlock[] = SUPPLY.flatMap((p, k) => k === 2
  ? [stand(v(p.x - 0.5, p.y - 0.3, p.z), 0.8, 1.2, 1.1, "rust"), stand(v(p.x + 0.6, p.y - 0.3, p.z + 0.3), 0.7, 0.9, 1.1, "rustDark")]
  : [stand(v(p.x, p.y - 0.3, p.z), 1.6, 1.4, 1.1, "concrete2", "petrol"), lens(v(p.x, p.y + 1.1, p.z), 0.9, "warm")]);

// --- Divide → service ledge: a wreck on the mirror and a crystal arch -------

/** A broken hull section adrift on the brine interface below the bench,
 * listing to the south, one work lamp still burning on its stub mast.
 * Ribs stand in constant-X planes; the keel runs along X. */
export const WRECK = { x: 796, z: -1352, ribs: 5, gap: 4, beam: 10, height: 5.5, list: 0.42 } as const;
const wreckRib = (i: number): Vec3[] => {
  // A capsized section: an arch of rib, keel on top, rolled by `list` about
  // the keel line, its gunwales sunk just under the interface.
  const x = WRECK.x - (WRECK.ribs - 1) * WRECK.gap / 2 + i * WRECK.gap, cl = Math.cos(WRECK.list), sl = Math.sin(WRECK.list), pts: Vec3[] = [];
  const H = WRECK.height * (0.85 + 0.15 * (i % 2));
  for (let j = 0; j <= 8; j++) {
    const a = Math.PI * j / 8, u = -Math.cos(a) * WRECK.beam / 2, h = Math.sin(a) * H;
    pts.push(v(x, BRINE_Y - 1 + u * sl + h * cl, WRECK.z + u * cl - h * sl));
  }
  return pts;
};
const wreckRibs = Array.from({ length: WRECK.ribs }, (_, i) => wreckRib(i));
const mastFoot = wreckRibs[2]![5]!;
export const WRECK_MAST: readonly [Vec3, Vec3] = [mastFoot, v(mastFoot.x + 2.5, mastFoot.y + 7.5, mastFoot.z + 2.5)];
const wreck: { blocks: VistaBlock[]; pieces: VistaPiece[] } = {
  blocks: [lens(v(WRECK_MAST[1].x, WRECK_MAST[1].y + 0.3, WRECK_MAST[1].z), 0.8, "warm"),
    block(v(WRECK_MAST[1].x - 0.55, WRECK_MAST[1].y - 0.4, WRECK_MAST[1].z - 0.55), v(WRECK_MAST[1].x + 0.55, WRECK_MAST[1].y + 0.3, WRECK_MAST[1].z + 0.55), "metal")],
  pieces: [
    ...wreckRibs.flatMap((r, i) => beam(i === 0 ? r.slice(0, 7) : i === 4 ? r.slice(2) : r, () => [0.34, 0.34, 0.15], () => i % 2 ? "rustDark" : "rust")),
    // The keel along the rib crowns, and two stringers.
    ...[4, 2, 6].flatMap(j => beam(wreckRibs.slice(j === 2 ? 0 : 1, j === 6 ? 4 : 5).map(r => r[j]!), () => j === 4 ? [0.5, 0.5, 0.22] : [0.22, 0.22, 0.1], () => j === 4 ? "petrol" : "metal")),
    ...beam([...WRECK_MAST], () => [0.28, 0.28, 0.12], () => "ochre"),
    // Surviving plates between ribs, carried flat along X.
    ...[[1, 3], [2, 5], [3, 2], [1, 6]].map(([i, j]): VistaPiece => {
      const a = wreckRibs[i!]!, c = wreckRibs[i! + 1]!, run = v(0, a[j! + 1]!.y - a[j!]!.y, a[j! + 1]!.z - a[j!]!.z), dx = c[j!]!.x - a[j!]!.x;
      const far = (p: Vec3): Vec3 => v(p.x + dx, p.y, p.z);
      return { closed: false, axis: dominant(run), step: slabStep(run), facets: [{ pts: [a[j!]!, a[j! + 1]!, far(a[j! + 1]!), far(a[j!]!)], tone: (i! + j!) % 2 ? "metal" : "rust" }] };
    }),
  ],
};

/** A crystal-crusted rock arch on the slope below the bench's east end, in a
 * constant-X plane so the descending route sees through it. */
export const ARCH = { x: 952, z0: -1330, z1: -1372, apex: 20, seed: 11 } as const;
export const ARCH_LINE: readonly Vec3[] = (() => {
  const a = v(ARCH.x, floor(ARCH.x, ARCH.z0) - 3, ARCH.z0), c = v(ARCH.x, floor(ARCH.x, ARCH.z1) - 3, ARCH.z1), n = 12;
  const top = Math.max(a.y, c.y) + 3 + ARCH.apex, pts: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, b = lerp(a, c, u), lift = Math.pow(Math.sin(Math.PI * u), 0.6), edge = i === 0 || i === n ? 0 : 1;
    pts.push(v(b.x + hash2(i, ARCH.seed, 1) * 0.7 * edge, b.y + (top - b.y) * lift + hash2(i, ARCH.seed, 2) * 0.5 * edge, b.z));
  }
  return pts;
})();
/** Segment i's half-width across the arch's line (its rock face). */
export const archHalfWidth = (i: number): number => 2.6 - 0.8 * Math.sin(Math.PI * (i + 0.5) / 12);
const arch: VistaPiece[] = beam(ARCH_LINE, i => [archHalfWidth(i), 2.2 + 0.4 * (0.5 + 0.5 * hash2(i, ARCH.seed, 7)), 0.35],
  (i, up) => up > 0.55 && i > 1 && i < 10 ? "stone" : up < -0.6 ? "stoneDark" : hash2(i, ARCH.seed, 3) > 0 ? "stone" : "stoneDark");

// --- The sets ---------------------------------------------------------------

export const POIS: readonly PoiDef[] = [
  { id: "poi.rift.trench_span", region: "thermal_rift", kind: "cable_span", leg: "basin_rift", label: "Cable span over the trench",
    beacon: lerp(SPAN_POSTS[0]!, SPAN_POSTS[1]!, 0.5) },
  { id: "poi.basin.sounding_line", region: "silt_basin", kind: "buoy_line", leg: "basin_divide", label: "Sounding line",
    beacon: soundingFloat(SOUNDING.floats - 1) },
  { id: "poi.basin.fall", region: "silt_basin", kind: "gathering", leg: "basin_divide", label: "The fall",
    beacon: v(FALL.x, floor(FALL.x, FALL.z) + 4, FALL.z) },
  { id: "poi.divide.float_line", region: "brine_divide", kind: "float_line", leg: "divide_meridian", label: "Float line", beacon: floatAt(5) },
  { id: "poi.meridian.supply_cable", region: "deep_district", kind: "cable_run", leg: "divide_meridian", label: "Supply cable",
    beacon: v(SUPPLY[3]!.x, SUPPLY[3]!.y + 1.4, SUPPLY[3]!.z) },
  { id: "poi.divide.mirror_wreck", region: "brine_divide", kind: "wreck", leg: "service_ledge", label: "Wreck on the mirror", beacon: WRECK_MAST[1] },
  { id: "poi.divide.crystal_arch", region: "brine_divide", kind: "rock_arch", leg: "service_ledge", label: "Crystal arch", beacon: ARCH_LINE[6]! },
];

const set = (id: string, region: RegionId, anchor: { x: number; z: number }, blocks: readonly VistaBlock[], pieces: readonly VistaPiece[] = []): VistaSet =>
  ({ id, region, anchor, blocks, pieces });
/** Solid parts of every POI, in `VISTA_SETS` (drawn and collided as one). */
export const POI_SETS: readonly VistaSet[] = [
  set("poi.rift.trench_span.west", "thermal_rift", SPAN_POSTS[0]!, span.slice(0, 3)),
  set("poi.rift.trench_span.east", "thermal_rift", SPAN_POSTS[1]!, span.slice(3)),
  set("poi.basin.sounding_line", "silt_basin", SOUNDING, sounding),
  set("poi.basin.fall", "silt_basin", FALL, fall.blocks, fall.pieces),
  set("poi.divide.float_line", "brine_divide", FLOAT_LINE[2]!, floats),
  set("poi.meridian.supply_cable", "deep_district", SUPPLY[2]!, supply),
  set("poi.divide.mirror_wreck", "brine_divide", WRECK, wreck.blocks, wreck.pieces),
  set("poi.divide.crystal_arch", "brine_divide", { x: ARCH.x, z: (ARCH.z0 + ARCH.z1) / 2 }, [], arch),
];
