import type { CaveDef } from "../content/regions/caves.js";
import { LEGACY_PRESERVE } from "../content/regions/terrain.js";
import type { Rect } from "../world/types.js";
import { actorBox, type BoxBounds } from "./ribCollision.js";
import type { Capsule, MoveResult, MovementOptions, Vec3, WorldQueries } from "./types.js";
import { createWorldQueries, type Solid } from "./world.js";

/** PROTOTYPE of the W1 terrain-query adapter (new module; the coordinator
 * wires the real one into `sim/world.ts` after C3).
 *
 * Contract it demonstrates:
 * - **Full-shape ownership.** Inside a cave footprint only cave rock exists;
 *   outside it the exterior heightfield rules. A shape touching a footprint
 *   is tested against both owners over its WHOLE box, in clearance, in every
 *   sweep and in every slide; never by its centre alone. The exterior
 *   heightfield in a collar band round each footprint becomes conservative
 *   column solids, so the existing continuous box sweep, its slides and its
 *   clearance see the exterior ground under every corner. The band is wide
 *   enough for the largest admitted shape touching the footprint plus one
 *   sub-sweep and its slides; larger shapes are refused at a cave.
 * - **Ownership per sub-sweep.** A move whose swept envelope touches a cave
 *   advances in bounded sub-sweeps. Each sub-sweep whose own envelope (grown
 *   by its length, which bounds its slides) touches a footprint runs in the
 *   cave composite; every other one runs in the original exterior world, so
 *   the model hands back as soon as the shape leaves the cave.
 * - **Nothing exterior is dropped.** The composite holds every exterior
 *   solid, so walls, structures and sight blockers anywhere along a sweep or
 *   a sight line still count.
 * - **Legacy guards untouched.** Queries and sub-sweeps that do not touch a
 *   cave go to the exterior world built with the ORIGINAL floor function, so
 *   `world.ts`'s identity-keyed legacy terrain columns and bench cut walls
 *   still apply, including after crossing back out. Caves (with their band)
 *   must keep clear of every guarded region (default: the legacy preserve,
 *   which contains them); construction throws otherwise.
 * - **Support from below.** `supportHeight` near a cave reads rock tops and
 *   collar columns at or below the actor, never the roof above it.
 * - Cabin, carrier and other local worlds stay separate `createWorldQueries`
 *   instances; this adapter is only the exterior world's. Away from caves the
 *   exterior's existing floor policy (centre-sampled clearance, unswept
 *   floor) is unchanged.
 *
 * Wrapping the floor function alone (`withCaveFloors`) is NOT enough: it
 * leaves clearance centre-sampled and changes the floor identity that keys
 * the legacy guards. Tests: `tests/cave-world.test.ts`. */

export interface CaveOwner {
  readonly id: string;
  readonly footprint: Rect;
  /** The heightfield steps aside below this inside the footprint. */
  readonly baseY: number;
  readonly rock: readonly Solid[];
}
export const caveOwner = (def: CaveDef): CaveOwner =>
  ({ id: def.id, footprint: def.replacementFootprints[0]!, baseY: def.source.baseY, rock: def.rock });

export interface CaveWorldOptions {
  /** Exterior solids and the ORIGINAL exterior floor function. */
  readonly solids: readonly Solid[];
  readonly floor: (x: number, z: number) => number;
  readonly caves: readonly CaveOwner[];
  /** Largest horizontal half-extent admitted at a cave, metres (a medium
   * hull is 4.5). The collar band is sized from it. */
  readonly maxHalfExtent?: number;
  /** Regions whose legacy terrain guards caves must keep clear of. */
  readonly guards?: readonly Rect[];
}

const COLLAR_CELL = 0.5;
const overlaps = (r: Rect, b: BoxBounds, pad = 0): boolean =>
  b.min.x < r.maxX + pad && b.max.x > r.minX - pad && b.min.z < r.maxZ + pad && b.max.z > r.minZ - pad;
const owns = (r: Rect, x: number, z: number): boolean => x >= r.minX && x < r.maxX && z >= r.minZ && z < r.maxZ;
const union = (a: BoxBounds, b: BoxBounds): BoxBounds => ({
  min: { x: Math.min(a.min.x, b.min.x), y: Math.min(a.min.y, b.min.y), z: Math.min(a.min.z, b.min.z) },
  max: { x: Math.max(a.max.x, b.max.x), y: Math.max(a.max.y, b.max.y), z: Math.max(a.max.z, b.max.z) },
});

/** Exterior ground in the collar band as columns: each 0.5 m cell outside
 * every footprint, topped at the highest of nine floor samples plus 2 cm. */
function collarColumns(cave: CaveOwner, floor: (x: number, z: number) => number, band: number,
  all: readonly CaveOwner[]): Solid[] {
  const f = cave.footprint, out: Solid[] = [];
  for (let x = f.minX - band; x < f.maxX + band - 1e-9; x += COLLAR_CELL)
    for (let z = f.minZ - band; z < f.maxZ + band - 1e-9; z += COLLAR_CELL) {
      if (all.some(c => owns(c.footprint, x + COLLAR_CELL / 2, z + COLLAR_CELL / 2))) continue;
      let top = -Infinity, low = Infinity;
      for (let i = 0; i <= 2; i++) for (let k = 0; k <= 2; k++) {
        const h = floor(x + i * COLLAR_CELL / 2, z + k * COLLAR_CELL / 2);
        top = Math.max(top, h); low = Math.min(low, h);
      }
      out.push({ id: `${cave.id}.collar.${out.length}`, min: { x, y: Math.min(cave.baseY, low - 4), z },
        max: { x: x + COLLAR_CELL, y: top + 0.02, z: z + COLLAR_CELL } });
    }
  return out;
}

/** Longest sub-sweep near a cave, metres. */
export const CAVE_SUB_SWEEP = 0.5;

export function createCaveWorldQueries(options: CaveWorldOptions): WorldQueries {
  const { solids, floor, caves } = options, guards = options.guards ?? [LEGACY_PRESERVE];
  const maxHalf = options.maxHalfExtent ?? 4.5;
  // A shape touching a footprint reaches 2 x its half-extent beyond it, and
  // one sub-sweep with its slides reaches CAVE_SUB_SWEEP further.
  const band = 2 * maxHalf + CAVE_SUB_SWEEP + 0.5;
  for (const c of caves) for (const g of guards) {
    const f = c.footprint;
    if (f.minX - band < g.maxX && f.maxX + band > g.minX && f.minZ - band < g.maxZ && f.maxZ + band > g.minZ)
      throw new Error(`cave ${c.id}: footprint and collar band reach a legacy-guarded region`);
  }
  const exterior = createWorldQueries(solids, floor);
  const masked = (x: number, z: number): number => {
    for (const c of caves) if (owns(c.footprint, x, z)) return c.baseY - 1;
    return floor(x, z);
  };
  const composite = createWorldQueries([
    ...solids, ...caves.flatMap(c => c.rock), ...caves.flatMap(c => collarColumns(c, floor, band, caves)),
  ], masked);
  const touches = (box: BoxBounds): boolean => caves.some(c => overlaps(c.footprint, box));
  const inBand = (x: number, z: number): boolean => caves.some(c => owns(
    { minX: c.footprint.minX - band, maxX: c.footprint.maxX + band, minZ: c.footprint.minZ - band, maxZ: c.footprint.maxZ + band }, x, z));
  const halfExtent = (s: Capsule): number => Math.max(s.halfWidth ?? s.radius, s.halfLength ?? s.radius);
  const envelope = (p: Vec3, d: Vec3, shape: Capsule): BoxBounds => {
    const e = union(actorBox(p, shape), actorBox({ x: p.x + d.x, y: p.y + d.y, z: p.z + d.z }, shape)), r = Math.hypot(d.x, d.y, d.z);
    return { min: { x: e.min.x - r, y: e.min.y - r, z: e.min.z - r }, max: { x: e.max.x + r, y: e.max.y + r, z: e.max.z + r } };
  };

  return {
    waterHeight: exterior.waterHeight,
    groundHeight: masked,
    supportHeight: (x, z, fromY) => inBand(x, z) ? composite.supportHeight(x, z, fromY) : exterior.supportHeight(x, z, fromY),
    clearance: (origin, shape) => !touches(actorBox(origin, shape)) ? exterior.clearance(origin, shape)
      : halfExtent(shape) <= maxHalf && composite.clearance(origin, shape),
    // The composite holds every exterior solid and samples the same exterior
    // floor outside footprints, so a sight line touching a cave loses nothing.
    lineOfSight: (a, b, ignore) => touches({ min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) },
      max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) } })
      ? composite.lineOfSight(a, b, ignore) : exterior.lineOfSight(a, b, ignore),
    moveCapsule(origin: Vec3, delta: Vec3, shape: Capsule, opts?: MovementOptions): MoveResult {
      if (!touches(envelope(origin, delta, shape))) return exterior.moveCapsule(origin, delta, shape, opts);
      if (halfExtent(shape) > maxHalf) return { position: { ...origin }, hitSolid: true, hitBoundary: false };
      const slices = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.y, delta.z) / CAVE_SUB_SWEEP));
      const d = { x: delta.x / slices, y: delta.y / slices, z: delta.z / slices };
      let position = { ...origin }, hitSolid = false, hitBoundary = false;
      for (let i = 0; i < slices; i++) {
        // Each sub-sweep picks its own owner: the cave composite while its
        // envelope (slides included) touches a footprint, the original
        // exterior world (legacy guards and all) once it does not.
        const world = touches(envelope(position, d, shape)) ? composite : exterior;
        const r = world.moveCapsule(position, d, shape, opts);
        position = r.position; hitSolid ||= r.hitSolid; hitBoundary ||= r.hitBoundary;
      }
      return { position, hitSolid, hitBoundary };
    },
  };
}
