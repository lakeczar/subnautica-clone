import { CANOPY_COVER, SOURCES } from "../content/registry.js";
import { BASIN_GEOMETRY, BASIN_SOURCE_IDS, LEGACY_TERRAIN_SOURCE_IDS,
  LEGACY_WORLD_BOUNDS, ROUTE_WORLD_BOUNDS, WORLD_VERTICAL_BOUNDS } from "../content/routes.js";
import type { Capsule, MovementOptions, Vec3, WorldQueries } from "./types.js";
import { actorBox, RIB_CONTACT_TOLERANCE, RIB_SLIDE_ITERATIONS, ribUpperHeight,
  segmentBoxClosest, sweptBoxIntersects, sweepBoxRib } from "./ribCollision.js";

export const WATER_Y = 0;
export const WORLD_BOUNDS = ROUTE_WORLD_BOUNDS;
export interface HorizontalBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
export function withinWorldBounds(position: Vec3): boolean {
  return position.x >= WORLD_BOUNDS.minX && position.x <= WORLD_BOUNDS.maxX &&
    position.z >= WORLD_BOUNDS.minZ && position.z <= WORLD_BOUNDS.maxZ;
}
export interface Solid {
  id: string;
  min: Vec3;
  max: Vec3;
}
export interface RibSegment {
  a: Vec3;
  b: Vec3;
  radius: number;
}

const RESCUE_BENCH = { minX: 38, maxX: 54, minZ: -60, maxZ: -48, y: -13 } as const;

/** Shared deterministic height field. Renderer samples this very function. */
export function legacyTerrainHeight(x: number, z: number): number {
  const shelf = -8.8 + Math.sin(x * 0.105) * 0.52 + Math.cos(z * 0.12) * 0.42;
  const beach = 16.8 * Math.exp(-((x - 9) ** 2 / 620 + (z + 57) ** 2 / 680));
  const westPeak = 13 * Math.exp(-((x + 1) ** 2 / 78 + (z + 62) ** 2 / 115));
  const eastPeak = 18 * Math.exp(-((x - 19) ** 2 / 65 + (z + 64) ** 2 / 90));
  const canopy = 155 * Math.max(0, Math.min(1, (x - 42) / 60));
  const reefBowl = 22 * Math.exp(-((x + 32) ** 2 / 190 + (z + 24) ** 2 / 190));
  let height = shelf + beach + westPeak + eastPeak - canopy - reefBowl;
  // Authored source ledges share their actual collision/terrain authority. No floating loot.
  for (const id of LEGACY_TERRAIN_SOURCE_IDS) {
    const source = SOURCES[id];
    if (source.position.y > 0 || source.item === "meal") continue;
    const weight = Math.exp(
      -((x - source.position.x) ** 2 + (z - source.position.z) ** 2) / 18,
    );
    height = height * (1 - weight) + (source.position.y - 0.8) * weight;
  }
  // The workshop apron continues into a broad submerged approach. Blend the
  // edges into the island rather than putting an impassable lip at the shore.
  const smooth = (a: number, b: number, v: number): number => {
    const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const apron = smooth(1, 3, x) * (1 - smooth(16, 18, x)) *
    smooth(-44, -40, z) * (1 - smooth(-22, -18, z));
  const approachY = 1.2 - Math.max(0, z + 31) * 0.55;
  height = height * (1 - apron) + approachY * apron;
  // Shallow recovery staging bench.
  if (x >= RESCUE_BENCH.minX && x <= RESCUE_BENCH.maxX &&
      z >= RESCUE_BENCH.minZ && z <= RESCUE_BENCH.maxZ) height = RESCUE_BENCH.y;
  return height;
}

/** The old rectangle is bit-identical, including source order and zero-weight math.
 * Basin relief is local to the adjoining extension; its new sources never feed the old loop. */
export function terrainHeight(x: number, z: number): number {
  let height = legacyTerrainHeight(x, z);
  if (x >= LEGACY_WORLD_BOUNDS.minX && x <= LEGACY_WORLD_BOUNDS.maxX &&
      z >= LEGACY_WORLD_BOUNDS.minZ && z <= LEGACY_WORLD_BOUNDS.maxZ) return height;
  const t = Math.max(0, Math.min(1, (-z - 184) / 76));
  height -= 36 * t * t * (3 - 2 * t) * Math.max(0, Math.min(1, (x - 74) / 24));
  for (const id of BASIN_SOURCE_IDS) {
    const source = SOURCES[id], r2 = (x - source.position.x) ** 2 + (z - source.position.z) ** 2;
    if (r2 >= 144) continue;
    const weight = (Math.exp(-r2 / 18) - Math.exp(-8)) / (1 - Math.exp(-8));
    height = height * (1 - weight) + (source.position.y - 0.8) * weight;
  }
  for (const pad of BASIN_GEOMETRY.terrainPads)
    if (x >= pad.minX && x <= pad.maxX && z >= pad.minZ && z <= pad.maxZ) height = Math.max(height, pad.y);
  return height;
}

export function makeRibSegments(): RibSegment[] {
  const result: RibSegment[] = [];
  for (const [cx, cz, sx, sy, radius] of [
    [-17, -8, 11, 10, 1.12],
    [-21, -14, 10, 8.6, 0.87],
  ]) {
    if (
      cx === undefined ||
      cz === undefined ||
      sx === undefined ||
      sy === undefined ||
      radius === undefined
    )
      continue;
    const point = (t: number): Vec3 => ({
      x: cx + Math.cos(t) * sx,
      y: -8.6 + Math.sin(t) * sy + Math.cos(t) * 0.7,
      z: cz + Math.sin(t) * 1.1,
    });
    for (let i = 0; i < 18; i++)
      result.push({
        a: point((i / 18) * Math.PI),
        b: point(((i + 1) / 18) * Math.PI),
        radius,
      });
  }
  return result;
}
export const RIB_SEGMENTS = makeRibSegments();

export const POD_RAMP = {
  minX: -1.25,
  maxX: 1.25,
  minZ: 6,
  maxZ: 10,
  landingZ: 9.5,
  lowY: -1.2,
  highY: 0.18,
} as const;
export function surfaceHeight(x: number, z: number): number {
  const terrain = terrainHeight(x, z);
  if (
    x < POD_RAMP.minX ||
    x > POD_RAMP.maxX ||
    z < POD_RAMP.minZ ||
    z > POD_RAMP.maxZ
  )
    return terrain;
  // Flat overlap reaches full deck height before the capsule meets its front face.
  const ramp =
    POD_RAMP.lowY +
    Math.min(1, (z - POD_RAMP.minZ) / (POD_RAMP.landingZ - POD_RAMP.minZ)) *
      (POD_RAMP.highY - POD_RAMP.lowY);
  return Math.max(terrain, ramp);
}

export const POD_DECK = {
  id: "pod.deck",
  min: { x: -3.1, y: -0.2, z: 10 },
  max: { x: 3.1, y: 0.18, z: 19.4 },
} satisfies Solid;
/** Large facility equipment shares its authored bounds with production art. */
export const FACILITY_SOLIDS: readonly Solid[] = [
  { id: "workshop.cradle.port", min: { x: 15.4, y: -2.5, z: -26 }, max: { x: 15.7, y: 0.5, z: -18 } },
  { id: "workshop.cradle.starboard", min: { x: 24.3, y: -2.5, z: -26 }, max: { x: 24.6, y: 0.5, z: -18 } },
  { id: "pod.bench", min: { x: 1.675, y: 0.23, z: 19.75 }, max: { x: 2.825, y: 1.33, z: 22.25 } },
  { id: "pod.locker", min: { x: -2.8, y: 0.2, z: 21.8 }, max: { x: -1.6, y: 1.6, z: 23 } },
  { id: "workshop.bench", min: { x: 7.25, y: 1.25, z: -39.5 }, max: { x: 12.75, y: 2.25, z: -38.5 } },
  { id: "workshop.locker", min: { x: 14.55, y: 1.4, z: -37.3 }, max: { x: 15.25, y: 3.2, z: -35.9 } },
  { id: "canopy.bench", min: { x: 114.5, y: -118, z: -128.5 }, max: { x: 117.5, y: -117, z: -127.5 } },
  ...[3.3, 15.7].flatMap((x) => [-39.7, -32].map((z) => ({
    id: `workshop.post.${x}.${z}`, min: { x: x - 0.12, y: 1.2, z: z - 0.12 }, max: { x: x + 0.12, y: 5.4, z: z + 0.12 },
  }))),
];
export const SOLIDS: readonly Solid[] = [
  POD_DECK,
  ...FACILITY_SOLIDS,
  {
    id: "pod.floor",
    min: { x: -3.1, y: -0.2, z: 19.4 },
    max: { x: 3.1, y: 0.18, z: 24.2 },
  },
  {
    id: "pod.back",
    min: { x: -3.6, y: -2, z: 24 },
    max: { x: 3.6, y: 3.7, z: 24.3 },
  },
  {
    id: "pod.west",
    min: { x: -3.6, y: -2, z: 19 },
    max: { x: -2.9, y: 3.7, z: 24.2 },
  },
  {
    id: "pod.east",
    min: { x: 2.9, y: -2, z: 19 },
    max: { x: 3.6, y: 3.7, z: 24.2 },
  },
  {
    id: "pod.roof",
    min: { x: -3.6, y: 3.7, z: 19.4 },
    max: { x: 3.6, y: 4, z: 24.2 },
  },
  { id: "canopy.cover", ...CANOPY_COVER },
  {
    id: "canopy.lab.floor",
    min: { x: 111, y: -118.4, z: -130 },
    max: { x: 121, y: -118, z: -122 },
  },
  {
    id: "canopy.lab.roof",
    min: { x: 111, y: -114, z: -130 },
    max: { x: 121, y: -113.7, z: -122 },
  },
  {
    id: "canopy.lab.back",
    min: { x: 111, y: -118, z: -130 },
    max: { x: 121, y: -114, z: -129.7 },
  },
  {
    id: "canopy.lab.side",
    min: { x: 111, y: -118, z: -130 },
    max: { x: 111.3, y: -114, z: -122 },
  },
  {
    id: "pod.float.west",
    min: { x: -3.95, y: -1.6, z: 18.4 },
    max: { x: -2.65, y: 0, z: 22.6 },
  },
  {
    id: "pod.float.east",
    min: { x: 2.65, y: -1.6, z: 18.4 },
    max: { x: 3.95, y: 0, z: 22.6 },
  },
  // Side rails leave the front of the deck and a side access gap open.
  {
    id: "pod.rail.west",
    min: { x: -3.12, y: 0.2, z: 13 },
    max: { x: -2.95, y: 1.05, z: 19.4 },
  },
  {
    id: "pod.rail.east",
    min: { x: 2.95, y: 0.2, z: 13 },
    max: { x: 3.12, y: 1.05, z: 19.4 },
  },
  ...RIB_SEGMENTS.map(({ a, b, radius }, index) => ({
    id: `reef.rib.${index}`,
    min: {
      x: Math.min(a.x, b.x) - radius,
      y: Math.min(a.y, b.y) - radius,
      z: Math.min(a.z, b.z) - radius,
    },
    max: {
      x: Math.max(a.x, b.x) + radius,
      y: Math.max(a.y, b.y) + radius,
      z: Math.max(a.z, b.z) + radius,
    },
  })),
  ...BASIN_GEOMETRY.solids,
];

type Axis = "x" | "y" | "z";
const AXES: readonly Axis[] = ["x", "y", "z"];

const finitePoint = (p: Vec3): boolean => AXES.every(axis => Number.isFinite(p[axis]));
const subtract = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const unitClamp = (n: number): number => Math.max(0, Math.min(1, n));

/** Squared distance between finite segments, including point/parallel cases. */
function segmentDistanceSquared(a: Vec3, b: Vec3, c: Vec3, d: Vec3): number {
  const u = subtract(b, a), v = subtract(d, c), r = subtract(a, c);
  const uu = dot(u, u), vv = dot(v, v), ur = dot(u, r), vr = dot(v, r), uv = dot(u, v);
  let s = 0, t = 0;
  if (uu <= 1e-12) t = vv <= 1e-12 ? 0 : unitClamp(vr / vv);
  else if (vv <= 1e-12) s = unitClamp(-ur / uu);
  else {
    const denominator = uu * vv - uv * uv;
    s = denominator > 1e-12 ? unitClamp((uv * vr - ur * vv) / denominator) : 0;
    t = (uv * s + vr) / vv;
    if (t < 0) { t = 0; s = unitClamp(-ur / uu); }
    else if (t > 1) { t = 1; s = unitClamp((uv - ur) / uu); }
  }
  return (r.x + u.x * s - v.x * t) ** 2 +
    (r.y + u.y * s - v.y * t) ** 2 + (r.z + u.z * s - v.z * t) ** 2;
}

function segmentHitsSolid(a: Vec3, b: Vec3, solid: Solid): boolean {
  let enter = 0, exit = 1;
  for (const axis of AXES) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-12) {
      if (a[axis] < solid.min[axis] || a[axis] > solid.max[axis]) return false;
    } else {
      const t1 = (solid.min[axis] - a[axis]) / delta, t2 = (solid.max[axis] - a[axis]) / delta;
      enter = Math.max(enter, Math.min(t1, t2));
      exit = Math.min(exit, Math.max(t1, t2));
      if (enter > exit) return false;
    }
  }
  return true;
}

// Recognize only supplied registered rib geometry, including detached copies.
// Empty/local rosters and unrelated solids reusing an id acquire no global ribs.
const CANONICAL_RIBS = new Map(SOLIDS.filter(s => s.id.startsWith("reef.rib.")).map((solid, i) =>
  [solid.id, { solid, rib: RIB_SEGMENTS[i]! }] as const));
function canonicalRib(solid: Solid): RibSegment | null {
  const registered = CANONICAL_RIBS.get(solid.id);
  return registered && AXES.every(axis => solid.min[axis] === registered.solid.min[axis] &&
    solid.max[axis] === registered.solid.max[axis]) ? registered.rib : null;
}
function validShape(shape: Capsule): boolean {
  return [shape.radius, shape.height, shape.bottom ?? 0, shape.halfWidth ?? shape.radius,
    shape.halfLength ?? shape.radius].every(Number.isFinite) &&
    shape.radius >= 0 && (shape.halfWidth ?? shape.radius) >= 0 &&
    (shape.halfLength ?? shape.radius) >= 0 && shape.height >= (shape.bottom ?? 0);
}

function sweep(
  origin: Vec3,
  delta: Vec3,
  capsule: Capsule,
  solid: Solid,
): { t: number; normal: Vec3 } | null {
  // Conservative swept upright capsule proxy: a box expanded by capsule dimensions.
  // This is already a continuous solid test; detailed vehicle shapes belong to M1.
  const min = {
    x: solid.min.x - (capsule.halfWidth ?? capsule.radius),
    y: solid.min.y - capsule.height,
    z: solid.min.z - (capsule.halfLength ?? capsule.radius),
  };
  const max = {
    x: solid.max.x + (capsule.halfWidth ?? capsule.radius),
    y: solid.max.y - (capsule.bottom ?? 0),
    z: solid.max.z + (capsule.halfLength ?? capsule.radius),
  };
  let enter = -Infinity,
    exit = Infinity;
  let normal: Vec3 = { x: 0, y: 0, z: 0 };
  for (const axis of AXES) {
    const d = delta[axis];
    if (Math.abs(d) < 1e-9) {
      if (origin[axis] <= min[axis] + 1e-6 || origin[axis] >= max[axis] - 1e-6)
        return null;
      continue;
    }
    const t1 = (min[axis] - origin[axis]) / d;
    const t2 = (max[axis] - origin[axis]) / d;
    const near = Math.min(t1, t2),
      far = Math.max(t1, t2);
    if (near > enter) {
      enter = near;
      normal = { x: 0, y: 0, z: 0 };
      normal[axis] = d > 0 ? -1 : 1;
    }
    exit = Math.min(exit, far);
    if (enter > exit) return null;
  }
  if (enter < -1e-6 || enter > 1 || exit < 0) return null;
  return { t: Math.max(0, enter), normal };
}

// Movement-only terrain volumes. Keep placement/clearance's historical contract:
// foundation migration and current/legacy carrier entry must not acquire a new
// relocation policy. Custom local floors never receive these world features.
const TERRAIN_COLUMNS: readonly Solid[] = [RESCUE_BENCH, ...BASIN_GEOMETRY.terrainPads].map((p, i) => ({
  id: `terrain.column.${i}`, min: { x: p.minX, y: WORLD_VERTICAL_BOUNDS.minY - 1, z: p.minZ },
  max: { x: p.maxX, y: p.y, z: p.maxZ },
}));
function terrainGap(p: Vec3, shape: Capsule, solid: Solid): { gap: number; normal: Vec3 } {
  const box = actorBox(p, shape);
  let gap = -Infinity, normal: Vec3 = { x: 0, y: 0, z: 0 };
  for (const axis of AXES) for (const sign of [-1, 1]) {
    const g = sign < 0 ? solid.min[axis] - box.max[axis] : box.min[axis] - solid.max[axis];
    if (g > gap) { gap = g; normal = { x: 0, y: 0, z: 0 }; normal[axis] = sign; }
  }
  return { gap, normal };
}
function sweepTerrain(p: Vec3, d: Vec3, shape: Capsule, solid: Solid): ReturnType<typeof sweep> {
  const { gap, normal } = terrainGap(p, shape, solid);
  if (gap < -1e-6) {
    // A retained contact may separate or move tangentially. This supporting
    // plane proves the complete segment non-closing; each new slide is checked
    // again against all terrain, ribs and supplied solids, with a gap backstop.
    return dot(normal, d) < -1e-12 ? { t: 0, normal } : null;
  }
  return sweep(p, d, shape, solid);
}

/** At an exact nearest-face tie choose the non-closing supporting plane in the
 * requested direction. Its linear gap proves the WHOLE segment non-deepening. */
function sweepOverlap(p: Vec3, d: Vec3, shape: Capsule, solid: Solid): ReturnType<typeof sweep> {
  const { gap } = terrainGap(p, shape, solid);
  if (gap >= -1e-6) return sweep(p, d, shape, solid);
  const box = actorBox(p, shape);
  let best = -Infinity, normal: Vec3 = { x: 0, y: 0, z: 0 };
  for (const axis of AXES) for (const sign of [-1, 1]) {
    const g = sign < 0 ? solid.min[axis] - box.max[axis] : box.min[axis] - solid.max[axis];
    if (Math.abs(g - gap) > 1e-10) continue;
    const progress = d[axis] * sign;
    if (progress > best) { best = progress; normal = { x: 0, y: 0, z: 0 }; normal[axis] = sign; }
  }
  return best < -1e-12 ? { t: 0, normal } : null;
}

interface BenchEdge { axis: "x" | "z"; value: number; outward: number; lo: number; hi: number; slope: number }
const EDGE_EPSILON = 1e-9;
/** Bound the tangential derivative of the uncut heightfield on one bench edge.
 * Gaussian derivatives use their nearest/farthest distances on that interval.
 * Each source blend adds |w'| * |sourceY-height|; all blend heights are bounded
 * by235m (sum of the original base amplitudes) or the source ordinate. The apron
 * is identically zero here. No finite-difference or sampled maximum is assumed. */
function benchEdgeSlope(edge: Omit<BenchEdge, "slope">): number {
  const axis = edge.axis === "x" ? "z" : "x";
  const bounds = edge.axis === "x"
    ? { minX: edge.value - EDGE_EPSILON, maxX: edge.value + EDGE_EPSILON, minZ: edge.lo, maxZ: edge.hi }
    : { minX: edge.lo, maxX: edge.hi, minZ: edge.value - EDGE_EPSILON, maxZ: edge.value + EDGE_EPSILON };
  const derivative = (cx: number, cz: number, kx: number, kz: number): number => {
    const dx = Math.max(0, bounds.minX - cx, cx - bounds.maxX);
    const dz = Math.max(0, bounds.minZ - cz, cz - bounds.maxZ);
    const far = axis === "x" ? Math.max(Math.abs(bounds.minX - cx), Math.abs(bounds.maxX - cx))
      : Math.max(Math.abs(bounds.minZ - cz), Math.abs(bounds.maxZ - cz));
    return 2 * far / (axis === "x" ? kx : kz) * Math.exp(-dx * dx / kx - dz * dz / kz);
  };
  let slope = (axis === "x" ? .52 * .105 + 155 / 60 : .42 * .12) +
    16.8 * derivative(9, -57, 620, 680) + 13 * derivative(-1, -62, 78, 115) +
    18 * derivative(19, -64, 65, 90) + 22 * derivative(-32, -24, 190, 190);
  const sources = LEGACY_TERRAIN_SOURCE_IDS.map(id => SOURCES[id]).filter(s => s.position.y <= 0 && s.item !== "meal");
  const magnitude = Math.max(235, ...sources.map(s => Math.abs(s.position.y - .8)));
  for (const s of sources) slope += derivative(s.position.x, s.position.z, 18, 18) *
    (magnitude + Math.abs(s.position.y - .8));
  return slope;
}
const BENCH_EDGES: readonly BenchEdge[] = [
  { axis: "x" as const, value: RESCUE_BENCH.minX, outward: -1, lo: RESCUE_BENCH.minZ, hi: RESCUE_BENCH.maxZ },
  { axis: "x" as const, value: RESCUE_BENCH.maxX, outward: 1, lo: RESCUE_BENCH.minZ, hi: RESCUE_BENCH.maxZ },
  { axis: "z" as const, value: RESCUE_BENCH.minZ, outward: -1, lo: RESCUE_BENCH.minX, hi: RESCUE_BENCH.maxX },
  { axis: "z" as const, value: RESCUE_BENCH.maxZ, outward: 1, lo: RESCUE_BENCH.minX, hi: RESCUE_BENCH.maxX },
].map(e => ({ ...e, slope: benchEdgeSlope(e) }));

/** The bench overwrites terrain, so some sides cut INTO higher natural ground.
 * Bound only these exposed side faces, never an infinite rectangular obstacle.
 * Constant raised pads need only their columns: max(natural,pad) has no cut side.
 * Interval bounds prove each coarse face covers the whole requested height; only
 * ambiguous top/edge contacts refine, to <0.1um (below the solid sweep tolerance).
 * All faces are continuously swept. Exhaustion discards unproved movement. */
function benchCutWalls(p: Vec3, d: Vec3, shape: Capsule): Solid[] | null {
  const box = actorBox(p, shape), result: Solid[] = [];
  if (box.max.y + Math.max(0, d.y) <= RESCUE_BENCH.y) return result;
  let budget = 4096;
  for (const edge of BENCH_EDGES) {
    if (box.min[edge.axis] + Math.min(0, d[edge.axis]) > edge.value ||
        box.max[edge.axis] + Math.max(0, d[edge.axis]) < edge.value) continue;
    const tangent = edge.axis === "x" ? "z" : "x";
    const lo = Math.max(edge.lo, box.min[tangent] + Math.min(0, d[tangent]));
    const hi = Math.min(edge.hi, box.max[tangent] + Math.max(0, d[tangent]));
    if (lo > hi) continue;
    const pending: [number, number][] = [[lo, hi]];
    while (pending.length) {
      if (--budget < 0) return null;
      const [a, b] = pending.pop()!, mid = (a + b) / 2;
      const h = edge.axis === "x"
        ? legacyTerrainHeight(edge.value + edge.outward * EDGE_EPSILON, mid)
        : legacyTerrainHeight(mid, edge.value + edge.outward * EDGE_EPSILON);
      const error = edge.slope * ((b - a) / 2 + EDGE_EPSILON) + 1e-11;
      const upper = h + error;
      if (upper <= RESCUE_BENCH.y) continue;
      const solid: Solid = { id: "terrain.bench.cut", min: { x: a, y: RESCUE_BENCH.y, z: a },
        max: { x: b, y: upper, z: b } };
      solid.min[edge.axis] = solid.max[edge.axis] = edge.value;
      if (!sweptBoxIntersects(box, d, solid)) continue;
      if (terrainGap(p, shape, solid).gap >= 0 && !sweep(p, d, shape, solid)) continue;
      if (h - error >= box.min.y + Math.max(0, d.y) || error < 1e-7) result.push(solid);
      else {
        if (mid === a || mid === b) return null;
        pending.push([mid, b], [a, mid]);
      }
    }
  }
  return result;
}

export function createWorldQueries(
  solids: readonly Solid[] = SOLIDS,
  floorHeight: (x: number, z: number) => number = surfaceHeight,
): WorldQueries {
  const worldTerrain = floorHeight === surfaceHeight || floorHeight === terrainHeight;
  return {
    lineOfSight(a, b, ignore = []) {
      if (!finitePoint(a) || !finitePoint(b)) return false;
      const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      const steps = Math.max(1, Math.ceil(length / 0.15));
      if (!Number.isFinite(steps) || steps > 100000) return false;
      for (const solid of solids) {
        if (!finitePoint(solid.min) || !finitePoint(solid.max) ||
            AXES.some(axis => solid.min[axis] > solid.max[axis])) return false;
        if (ignore.includes(solid.id)) continue;
        const rib = canonicalRib(solid);
        if (rib ? segmentDistanceSquared(a, b, rib.a, rib.b) <= rib.radius ** 2
          : segmentHitsSolid(a, b, solid)) return false;
      }
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        const floor = floorHeight(x, z);
        if (!Number.isFinite(floor) || a.y + (b.y - a.y) * t < floor - 0.02) return false;
      }
      return true;
    },
    clearance(origin, capsule) {
      if (!finitePoint(origin) || !validShape(capsule)) return false;
      const rx = capsule.halfWidth ?? capsule.radius, rz = capsule.halfLength ?? capsule.radius;
      if (
        origin.x - rx < WORLD_BOUNDS.minX ||
        origin.x + rx > WORLD_BOUNDS.maxX ||
        origin.z - rz < WORLD_BOUNDS.minZ ||
        origin.z + rz > WORLD_BOUNDS.maxZ ||
        origin.y < WORLD_VERTICAL_BOUNDS.minY || origin.y > WORLD_VERTICAL_BOUNDS.maxY ||
        origin.y + (capsule.bottom ?? 0) < floorHeight(origin.x, origin.z) - 0.02
      )
        return false;
      const box = actorBox(origin, capsule);
      return !solids.some((s) => {
        if (!sweptBoxIntersects(box, { x: 0, y: 0, z: 0 }, s)) return false;
        const rib = canonicalRib(s);
        if (rib) return segmentBoxClosest(rib.a, rib.b, box).distance < rib.radius - RIB_CONTACT_TOLERANCE;
        return (
          origin.x + rx > s.min.x + 0.001 &&
          origin.x - rx < s.max.x - 0.001 &&
          origin.z + rz > s.min.z + 0.001 &&
          origin.z - rz < s.max.z - 0.001 &&
          origin.y + capsule.height > s.min.y + 0.001 &&
          origin.y + (capsule.bottom ?? 0) < s.max.y - 0.001
        );
      });
    },
    waterHeight: WATER_Y,
    groundHeight: floorHeight,
    supportHeight(x, z, fromY) {
      let height = floorHeight(x, z);
      for (const solid of solids) {
        const rib = canonicalRib(solid);
        if (rib) {
          if (x >= solid.min.x && x <= solid.max.x && z >= solid.min.z && z <= solid.max.z) {
            const upper = ribUpperHeight(x, z, rib);
            if (upper !== null && fromY >= upper - 0.25) height = Math.max(height, upper);
          }
          continue;
        }
        if (
          x >= solid.min.x &&
          x <= solid.max.x &&
          z >= solid.min.z &&
          z <= solid.max.z &&
          fromY >= solid.max.y - 0.25
        )
          height = Math.max(height, solid.max.y);
      }
      return height;
    },
    moveCapsule(origin, delta, capsule, options) {
      if (!finitePoint(origin)) throw new RangeError("Movement origin must be finite.");
      if (!finitePoint(delta) || !validShape(capsule) ||
          !finitePoint({ x: origin.x + delta.x, y: origin.y + delta.y, z: origin.z + delta.z }))
        return { position: { ...origin }, hitSolid: true, hitBoundary: false };
      if (options?.separateBoxOverlaps && (solids.some(s => !finitePoint(s.min) || !finitePoint(s.max) ||
          AXES.some(a => s.min[a] > s.max[a])) || !Number.isFinite(floorHeight(origin.x, origin.z))))
        return { position: { ...origin }, hitSolid: true, hitBoundary: false };
      let position = { ...origin },
        remaining = { ...delta },
        hitSolid = false, clippedBoundary = false;
      if (options?.separateBoxOverlaps) {
        // Clip requested travel before sweeping; do not clamp an accepted
        // endpoint through another solid. Retained edge poses can move inward.
        const limits = { x: [WORLD_BOUNDS.minX + (capsule.halfWidth ?? capsule.radius), WORLD_BOUNDS.maxX - (capsule.halfWidth ?? capsule.radius)],
          y: [WORLD_VERTICAL_BOUNDS.minY - (capsule.bottom ?? 0), WORLD_VERTICAL_BOUNDS.maxY - capsule.height],
          z: [WORLD_BOUNDS.minZ + (capsule.halfLength ?? capsule.radius), WORLD_BOUNDS.maxZ - (capsule.halfLength ?? capsule.radius)] };
        for (const a of AXES) {
          const next = Math.max(Math.min(origin[a], limits[a][0]!),
            Math.min(Math.max(origin[a], limits[a][1]!), origin[a] + remaining[a])) - origin[a];
          clippedBoundary ||= next !== remaining[a]; remaining[a] = next;
        }
      }
      // Every new tangent is swept against the entire supplied roster again.
      // Eight unresolved contacts exhaust conservatively: the remainder is discarded.
      for (let i = 0; i < RIB_SLIDE_ITERATIONS; i++) {
        let nearest: { t: number; normal: Vec3; rib: boolean; stop: boolean } | null = null;
        const box = actorBox(position, capsule);
        const overlaps: { rib: RibSegment; gap: number }[] = [];
        const cuts = worldTerrain ? benchCutWalls(position, remaining, capsule) : [];
        if (!cuts) { hitSolid = true; break; }
        const terrain = worldTerrain ? [...TERRAIN_COLUMNS, ...cuts] : [];
        const terrainOverlaps: { solid: Solid; gap: number }[] = [];
        for (const solid of terrain) {
          if (!sweptBoxIntersects(box, remaining, solid)) continue;
          const { gap } = terrainGap(position, capsule, solid);
          if (gap < -1e-6) terrainOverlaps.push({ solid, gap });
          const hit = sweepTerrain(position, remaining, capsule, solid);
          if (hit && (!nearest || hit.t < nearest.t)) nearest = { ...hit, rib: false, stop: false };
        }
        for (const solid of solids) {
          if (!sweptBoxIntersects(box, remaining, solid)) continue;
          const rib = canonicalRib(solid);
          if (!rib && options?.separateBoxOverlaps) {
            const { gap } = terrainGap(position, capsule, solid);
            if (gap < -1e-6) terrainOverlaps.push({ solid, gap });
          }
          if (rib && sweptBoxIntersects(box, { x: 0, y: 0, z: 0 }, solid)) {
            const gap = segmentBoxClosest(rib.a, rib.b, box).distance - rib.radius;
            if (gap < -RIB_CONTACT_TOLERANCE) overlaps.push({ rib, gap });
          }
          const hit = rib
            ? sweepBoxRib(box, remaining, rib)
            : options?.separateBoxOverlaps ? sweepOverlap(position, remaining, capsule, solid)
              : sweep(position, remaining, capsule, solid);
          if (hit && (!nearest || hit.t < nearest.t || (hit.t === nearest.t && "stop" in hit && hit.stop)))
            nearest = { ...hit, rib: rib !== null, stop: "stop" in hit && hit.stop === true };
        }
        const fraction = nearest ? Math.max(0, nearest.t - (nearest.rib ? 0 : 0.0001)) : 1;
        const next = {
          x: position.x + remaining.x * fraction,
          y: position.y + remaining.y * fraction,
          z: position.z + remaining.z * fraction,
        };
        // Numerical backstop for the non-closing proof, at EVERY accepted slide.
        // Never use overlap as permission to accept a deeper endpoint.
        if (terrainOverlaps.some(({ solid, gap }) => terrainGap(next, capsule, solid).gap < gap - 1e-9) ||
          overlaps.some(({ rib, gap }) => {
          const nextGap = segmentBoxClosest(rib.a, rib.b, actorBox(next, capsule)).distance - rib.radius;
          return !Number.isFinite(nextGap) || nextGap < gap - 1e-9;
        })) { hitSolid = true; break; }
        position = next;
        if (!nearest) break;
        hitSolid = true;
        if (nearest.stop) break;
        remaining = {
          x: remaining.x * (1 - fraction),
          y: remaining.y * (1 - fraction),
          z: remaining.z * (1 - fraction),
        };
        const inward = dot(remaining, nearest.normal);
        if (inward >= 0) break; // no progress: never treat unresolved travel as clear
        for (const axis of AXES) remaining[axis] -= nearest.normal[axis] * inward;
        if (Math.hypot(remaining.x, remaining.y, remaining.z) < 1e-12) break;
      }
      const x = options?.separateBoxOverlaps ? position.x : Math.max(
        WORLD_BOUNDS.minX,
        Math.min(WORLD_BOUNDS.maxX, position.x),
      );
      const z = options?.separateBoxOverlaps ? position.z : Math.max(
        WORLD_BOUNDS.minZ,
        Math.min(WORLD_BOUNDS.maxZ, position.z),
      );
      const y = options?.separateBoxOverlaps ? position.y : Math.max(WORLD_VERTICAL_BOUNDS.minY, Math.min(WORLD_VERTICAL_BOUNDS.maxY, position.y));
      return {
        position: { x, y, z },
        hitSolid,
        hitBoundary: clippedBoundary || x !== position.x || y !== position.y || z !== position.z,
      };
    },
  };
}

/** Hull keel floor sampled across its conservative circular footprint. */
export function hullFloor(world: WorldQueries, origin: Vec3, shape: Capsule): number {
  let floor = world.groundHeight(origin.x, origin.z);
  if (shape.halfWidth !== undefined || shape.halfLength !== undefined) {
    for (const x of [-1, 0, 1]) for (const z of [-1, 0, 1])
      floor = Math.max(floor, world.groundHeight(origin.x + x * (shape.halfWidth ?? shape.radius), origin.z + z * (shape.halfLength ?? shape.radius)));
    return floor - (shape.bottom ?? 0);
  }
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    floor = Math.max(floor, world.groundHeight(
      origin.x + Math.cos(a) * shape.radius,
      origin.z + Math.sin(a) * shape.radius,
    ));
  }
  return floor - (shape.bottom ?? 0);
}
export function hullClearance(world: WorldQueries, origin: Vec3, shape: Capsule): boolean {
  return world.clearance(origin, shape) && origin.y >= hullFloor(world, origin, shape) + 0.05;
}

/** Continuous solid sweep plus short travel slices against the shared terrain.
 * A conservative footprint prevents scout/large hulls climbing or tunnelling shore cliffs. */
export function moveHull(
  world: WorldQueries,
  origin: Vec3,
  delta: Vec3,
  shape: Capsule,
  bounds?: HorizontalBounds,
  observeSupport?: (rejectedHorizontalTravel: number) => void,
  options?: MovementOptions,
): ReturnType<WorldQueries["moveCapsule"]> {
  if (!finitePoint(origin)) throw new RangeError("Movement origin must be finite.");
  const slices = Math.max(
    1,
    Math.ceil(Math.hypot(delta.x, delta.y, delta.z) / 0.2),
  );
  if (!finitePoint(delta) || !validShape(shape) || !Number.isFinite(slices) || slices > 100000)
    return { position: { ...origin }, hitSolid: true, hitBoundary: false };
  let position = { ...origin },
    hitSolid = false,
    hitBoundary = false;
  for (let i = 0; i < slices; i++) {
    const d = { x: delta.x / slices, y: delta.y / slices, z: delta.z / slices };
    if (bounds) {
      // Restrict requested travel BEFORE the physical sweep, never project its
      // result through a solid. A retained pose outside a tighter envelope can
      // move inward/tangentially without snapping to the new boundary.
      for (const axis of ["x", "z"] as const) {
        const min = axis === "x" ? bounds.minX : bounds.minZ;
        const max = axis === "x" ? bounds.maxX : bounds.maxZ;
        const next = Math.max(Math.min(position[axis], min),
          Math.min(Math.max(position[axis], max), position[axis] + d[axis]));
        hitBoundary ||= next !== position[axis] + d[axis];
        d[axis] = next - position[axis];
      }
    }
    const result = world.moveCapsule(position, d, shape, options);
    const floor = hullFloor(world, result.position, shape);
    if (options?.separateBoxOverlaps && !Number.isFinite(floor)) { hitSolid = true; break; }
    if (result.position.y < floor + 0.05) {
      if (options?.separateBoxOverlaps) {
        const oldGap = position.y - hullFloor(world, position, shape);
        const nextGap = result.position.y - floor;
        // Retained floor overlaps may escape continuously; never snap/lift the
        // enlarged animal, or accept a deeper gap at a short travel slice.
        if (!Number.isFinite(oldGap) || !Number.isFinite(nextGap) || nextGap < Math.min(.05, oldGap) - 1e-10) {
          hitSolid = true; break;
        }
        position = result.position; hitSolid ||= result.hitSolid; hitBoundary ||= result.hitBoundary;
        continue;
      }
      hitSolid = true;
      if (Math.abs(d.x) + Math.abs(d.z) > 0.00001) {
        // The floor refuses the sweep's remaining horizontal progress and
        // cancels later slices. Sweep-rejected travel is already measured by
        // its caller; only the progress it allowed belongs to floor support.
        const rejected = Math.hypot(result.position.x - position.x, result.position.z - position.z) +
          Math.hypot(delta.x / slices, delta.z / slices) * (slices - i - 1);
        if (Number.isFinite(rejected)) observeSupport?.(Math.max(0, rejected));
        break;
      }
      const y = Math.max(position.y, floor + 0.05);
      const lift = world.moveCapsule(result.position, { x: 0, y: y - result.position.y, z: 0 }, shape, options);
      if (lift.hitSolid || lift.hitBoundary || Math.abs(lift.position.y - y) > 1e-10 ||
          Math.hypot(lift.position.x - result.position.x, lift.position.z - result.position.z) > 1e-10) break;
      result.position = lift.position;
    }
    position = result.position;
    hitSolid ||= result.hitSolid;
    hitBoundary ||= result.hitBoundary;
  }
  return { position, hitSolid, hitBoundary };
}

/** Tests a guided route without sliding or changing state. Solids sweep continuously;
 * terrain uses the same 0.2 m slices and full footprint as piloted movement. */
export function sweptHullClearance(world: WorldQueries, path: readonly Vec3[], shape: Capsule): boolean {
  if (!path.length || !path.every((p) => hullClearance(world, p, shape))) return false;
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1]!, to = path[i]!;
    const move = moveHull(world, from, { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z }, shape);
    if (move.hitSolid || move.hitBoundary || Math.hypot(move.position.x - to.x, move.position.y - to.y, move.position.z - to.z) > 0.001) return false;
  }
  return true;
}
