import type { LargeCaveSource } from "../src/content/caves/largeCave.js";
import { EXTERIOR } from "../src/content/caves/largeCave.js";
import type { Capsule, Vec3 } from "../src/sim/types.js";
import { createWorldQueries, SOLIDS, surfaceHeight } from "../src/sim/world.js";
import { buildCollision, createLargeCave, type LargeCave } from "../src/world/caves/large/build.js";
import { composeCaveWorld, largeCaveCollider, translatedWorld, type CaveWorld } from "../src/world/caves/large/compose.js";

/** LC test support: a small synthetic cave biome (2 x 2 x 2 chunks) and the
 * composed world round it. Fast tests use it for every mechanism; Canopy
 * checks use a few chunks of the real biome. */

/** The exterior seabed: a gentle slope at about 44 m. */
export const vaultFloor = (x: number, z: number): number => -44 + 0.05 * x - 0.02 * z;

export const VAULT: LargeCaveSource = {
  id: "test_vault", label: "Test vault", region: "suspended_garden",
  domain: { min: { x: 0, y: -96, z: 0 }, max: { x: 64, y: -32, z: 64 } },
  chunk: 32, voxel: 0.5,
  collars: [{ minX: 22, maxX: 42, minZ: 28, maxZ: 50 }],
  roofMin: 4, blend: 2.5,
  zones: [
    { id: "vault.main", label: "Main", role: "hub", falloff: 8, palette: { floor: "#7d8a78", wall: "#66706a", ceiling: "#4f5b5a", accent: "#62e6d2" }, fog: { color: "#123a44", density: 0.03 }, note: "" },
    { id: "vault.side", label: "Side", role: "passage", falloff: 5, palette: { floor: "#6f776c", wall: "#5d645e", ceiling: "#4a514f", accent: "#b9a0e8" }, fog: { color: "#0f2a31", density: 0.035 }, note: "" },
    { id: "vault.pocket", label: "Sealed pocket", role: "pool", falloff: 5, palette: { floor: "#5d5f6e", wall: "#4b4f5e", ceiling: "#383c4a", accent: "#f08aa0" }, fog: { color: "#0c1a2c", density: 0.036 }, note: "" },
  ],
  carves: [
    { kind: "chamber", id: "vault.main", zone: "vault.main", wobble: 0.5, center: { x: 32, y: -70, z: 24 }, radii: { x: 13, z: 11, up: 7, down: 5 }, yaw: 0, floor: -74 },
    { kind: "shaft", id: "vault.shaft", zone: "vault.main", wobble: 0.4, bottom: { x: 32, y: -66, z: 30 }, top: { x: 32, y: -40, z: 40 }, radius: 4.5, flare: 2 },
    { kind: "tunnel", id: "vault.squeeze", zone: "vault.side", wobble: 0.25, nodes: [
      { x: 20, y: -73, z: 22, width: 2.8, height: 2.6 }, { x: 15, y: -73, z: 18, width: 2.6, height: 2.5 }, { x: 11, y: -73.5, z: 14, width: 2.8, height: 2.6 },
    ] },
    { kind: "chamber", id: "vault.side", zone: "vault.side", wobble: 0.3, center: { x: 9, y: -72, z: 11 }, radii: { x: 4.5, z: 4.5, up: 3, down: 2 }, yaw: 0, floor: -74 },
    // Sealed: 2 m or more of rock from the main chamber's east wall.
    { kind: "chamber", id: "vault.pocket", zone: "vault.pocket", wobble: 0.2, center: { x: 53.5, y: -70, z: 24 }, radii: { x: 4, z: 5, up: 3, down: 2.5 }, yaw: 0, floor: -72.5 },
  ],
  rocks: [{ kind: "pillar", id: "vault.pillar", a: { x: 34, y: -63, z: 20 }, b: { x: 34, y: -75, z: 20 }, radiusA: 1.4, radiusB: 1.8, wobble: 0.2 }],
  portals: [
    { id: "vault.mouth", kind: "mouth", label: "Shaft", between: ["vault.main", EXTERIOR], center: { x: 32, y: -42, z: 40 }, normal: { x: 0, y: 1, z: 0 }, clear: { width: 7, height: 7 }, admits: ["diver", "small"] },
    { id: "vault.throat", kind: "throat", label: "Squeeze", between: ["vault.main", "vault.side"], center: { x: 15, y: -71.7, z: 18 }, normal: { x: -0.8, y: 0, z: -0.6 }, clear: { width: 1.6, height: 1.6 }, admits: ["diver"] },
  ],
  life: [
    { id: "vault.glow", zone: "vault.main", kind: "colony", at: { x: 44, y: -70, z: 24 }, radius: 3, count: 12, color: "#62e6d2", light: 0.8, reach: 9 },
  ],
  sockets: [], staging: [],
  routes: [
    { id: "vault.route.in", profile: "small", role: "exit", path: [{ x: 32, y: -38, z: 41 }, { x: 32, y: -52, z: 36 }, { x: 32, y: -64, z: 31 }, { x: 28, y: -72, z: 24 }] },
    { id: "vault.route.squeeze", profile: "diver", role: "spur", path: [{ x: 24, y: -72.5, z: 24 }, { x: 20, y: -72.6, z: 22 }, { x: 15, y: -72.6, z: 18 }, { x: 11, y: -73, z: 14 }, { x: 9, y: -73, z: 11 }] },
  ],
  proposal: { location: "test", depth: "test" }, note: "fixture",
};

let cached: LargeCave | null = null;
export function vault(): LargeCave {
  if (!cached) { cached = createLargeCave(VAULT, vaultFloor); buildCollision(cached); }
  return cached;
}

/** The real exterior world (`createWorldQueries`) in a frame shifted inside
 * the baseline WORLD_BOUNDS, composed with a cave. */
export function composedWith(cave: LargeCave, floor: (x: number, z: number) => number, offset: Vec3): CaveWorld {
  const exterior = translatedWorld(createWorldQueries([], (x, z) => floor(x - offset.x, z - offset.z)), offset);
  return composeCaveWorld({ exterior, solids: [], floor, caves: [largeCaveCollider(cave.collision)] });
}
export const VAULT_OFFSET: Vec3 = { x: 0, y: 0, z: -100 };
export const DIVER: Capsule = { radius: 0.34, height: 0.95 };
export const DART: Capsule = { radius: 3.6, height: 2.1 };
export const CREEL: Capsule = { radius: 3.9, height: 3.6 };
export const MANTLE: Capsule = { radius: 4.5, height: 4 };
export const random = (seed: number) => () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);

/** Corners and face centres of a shape's box. */
export function boxSamples(p: Vec3, s: Capsule): Vec3[] {
  const hx = s.halfWidth ?? s.radius, hz = s.halfLength ?? s.radius, y0 = p.y + (s.bottom ?? 0), y1 = p.y + s.height;
  const out: Vec3[] = [];
  for (const x of [p.x - hx, p.x, p.x + hx]) for (const y of [y0, (y0 + y1) / 2, y1]) for (const z of [p.z - hz, p.z, p.z + hz]) out.push({ x, y, z });
  return out;
}

/** Seek along a path at `speed` m/s, 60 Hz, one move per frame. */
export function seek(world: CaveWorld, path: readonly Vec3[], shape: Capsule, speed: number, frames = 6000):
  { reached: boolean; poses: Vec3[]; stalls: number } {
  let p = { ...path[0]! }, wp = 1, stalls = 0;
  const poses = [p];
  for (let i = 0; i < frames && wp < path.length; i++) {
    const g = path[wp]!, dx = g.x - p.x, dy = g.y - p.y, dz = g.z - p.z, l = Math.hypot(dx, dy, dz);
    if (l < 0.6) { wp++; continue; }
    const s = Math.min(speed / 60, l), r = world.moveCapsule(p, { x: dx / l * s, y: dy / l * s, z: dz / l * s }, shape);
    if (Math.hypot(r.position.x - p.x, r.position.y - p.y, r.position.z - p.z) < 0.25 * s) stalls++;
    p = r.position; poses.push(p);
  }
  return { reached: wp >= path.length, poses, stalls };
}

/** A cave composed with the production exterior world, in the real frame:
 * `createWorldQueries()` (every world solid, the one physical floor) and the
 * same solids and floor for the composer. */
export function productionWorld(cave: LargeCave): CaveWorld {
  return composeCaveWorld({ exterior: createWorldQueries(), solids: SOLIDS, floor: surfaceHeight, caves: [largeCaveCollider(cave.collision)] });
}
