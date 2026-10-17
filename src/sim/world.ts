import { CANOPY_COVER, SOURCES } from "../content/registry.js";
import type { Capsule, Vec3, WorldQueries } from "./types.js";

export const WATER_Y = 0;
export const WORLD_BOUNDS = {
  minX: -76,
  maxX: 188,
  minZ: -184,
  maxZ: 66,
} as const;
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

/** Shared deterministic height field. Renderer samples this very function. */
export function terrainHeight(x: number, z: number): number {
  const shelf = -8.8 + Math.sin(x * 0.105) * 0.52 + Math.cos(z * 0.12) * 0.42;
  const beach = 16.8 * Math.exp(-((x - 9) ** 2 / 620 + (z + 57) ** 2 / 680));
  const westPeak = 13 * Math.exp(-((x + 1) ** 2 / 78 + (z + 62) ** 2 / 115));
  const eastPeak = 18 * Math.exp(-((x - 19) ** 2 / 65 + (z + 64) ** 2 / 90));
  const canopy = 155 * Math.max(0, Math.min(1, (x - 42) / 60));
  const reefBowl = 22 * Math.exp(-((x + 32) ** 2 / 190 + (z + 24) ** 2 / 190));
  let height = shelf + beach + westPeak + eastPeak - canopy - reefBowl;
  // Authored source ledges share their actual collision/terrain authority. No floating loot.
  for (const source of Object.values(SOURCES)) {
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
  if (x >= 38 && x <= 54 && z >= -60 && z <= -48) height = -13;
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
];

type Axis = "x" | "y" | "z";
const AXES: readonly Axis[] = ["x", "y", "z"];

function sweep(
  origin: Vec3,
  delta: Vec3,
  capsule: Capsule,
  solid: Solid,
): { t: number; normal: Vec3 } | null {
  // Conservative swept upright capsule proxy: a box expanded by capsule dimensions.
  // This is already a continuous solid test; detailed vehicle shapes belong to M1.
  const min = {
    x: solid.min.x - capsule.radius,
    y: solid.min.y - capsule.height,
    z: solid.min.z - capsule.radius,
  };
  const max = {
    x: solid.max.x + capsule.radius,
    y: solid.max.y,
    z: solid.max.z + capsule.radius,
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

export function createWorldQueries(
  solids: readonly Solid[] = SOLIDS,
): WorldQueries {
  return {
    clearance(origin, capsule) {
      if (
        origin.x - capsule.radius < WORLD_BOUNDS.minX ||
        origin.x + capsule.radius > WORLD_BOUNDS.maxX ||
        origin.z - capsule.radius < WORLD_BOUNDS.minZ ||
        origin.z + capsule.radius > WORLD_BOUNDS.maxZ ||
        origin.y < surfaceHeight(origin.x, origin.z) - 0.02
      )
        return false;
      return !solids.some(
        (s) =>
          origin.x + capsule.radius > s.min.x + 0.001 &&
          origin.x - capsule.radius < s.max.x - 0.001 &&
          origin.z + capsule.radius > s.min.z + 0.001 &&
          origin.z - capsule.radius < s.max.z - 0.001 &&
          origin.y + capsule.height > s.min.y + 0.001 &&
          origin.y < s.max.y - 0.001,
      );
    },
    waterHeight: WATER_Y,
    groundHeight: surfaceHeight,
    supportHeight(x, z, fromY) {
      let height = surfaceHeight(x, z);
      for (const solid of solids) {
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
    moveCapsule(origin, delta, capsule) {
      let position = { ...origin },
        remaining = { ...delta },
        hitSolid = false;
      for (let i = 0; i < 4; i++) {
        let nearest: ReturnType<typeof sweep> = null;
        for (const solid of solids) {
          const hit = sweep(position, remaining, capsule, solid);
          if (hit && (!nearest || hit.t < nearest.t)) nearest = hit;
        }
        const fraction = nearest ? Math.max(0, nearest.t - 0.0001) : 1;
        position = {
          x: position.x + remaining.x * fraction,
          y: position.y + remaining.y * fraction,
          z: position.z + remaining.z * fraction,
        };
        if (!nearest) break;
        hitSolid = true;
        remaining = {
          x: remaining.x * (1 - fraction),
          y: remaining.y * (1 - fraction),
          z: remaining.z * (1 - fraction),
        };
        for (const axis of AXES)
          if (nearest.normal[axis] !== 0) remaining[axis] = 0;
      }
      const x = Math.max(
        WORLD_BOUNDS.minX,
        Math.min(WORLD_BOUNDS.maxX, position.x),
      );
      const z = Math.max(
        WORLD_BOUNDS.minZ,
        Math.min(WORLD_BOUNDS.maxZ, position.z),
      );
      return {
        position: { x, y: position.y, z },
        hitSolid,
        hitBoundary: x !== position.x || z !== position.z,
      };
    },
  };
}

/** Hull keel floor sampled across its conservative circular footprint. */
export function hullFloor(world: WorldQueries, origin: Vec3, shape: Capsule): number {
  let floor = world.groundHeight(origin.x, origin.z);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    floor = Math.max(floor, world.groundHeight(
      origin.x + Math.cos(a) * shape.radius,
      origin.z + Math.sin(a) * shape.radius,
    ));
  }
  return floor;
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
): ReturnType<WorldQueries["moveCapsule"]> {
  const slices = Math.max(
    1,
    Math.ceil(Math.hypot(delta.x, delta.y, delta.z) / 0.2),
  );
  let position = { ...origin },
    hitSolid = false,
    hitBoundary = false;
  for (let i = 0; i < slices; i++) {
    const d = { x: delta.x / slices, y: delta.y / slices, z: delta.z / slices };
    const result = world.moveCapsule(position, d, shape);
    const floor = hullFloor(world, result.position, shape);
    if (result.position.y < floor + 0.05) {
      hitSolid = true;
      if (Math.abs(d.x) + Math.abs(d.z) > 0.00001) break;
      result.position.y = Math.max(position.y, floor + 0.05);
    }
    position = result.position;
    hitSolid ||= result.hitSolid;
    hitBoundary ||= result.hitBoundary;
  }
  return { position, hitSolid, hitBoundary };
}
