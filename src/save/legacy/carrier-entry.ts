/** Frozen schema2 checked carrier landing at c1ddb0a. Only historical decode uses it. */
import { BERTH_ENVELOPES, HULL_COLLIDERS } from "./registry.js";
import type { Capsule, CarrierState, GameState, Vec3, VehicleState, WorldQueries } from "./types.js";
import { createWorldQueries } from "../../sim/world.js";
interface Solid { id: string; min: Vec3; max: Vec3 }
const WORLD_BOUNDS = { minX: -76, maxX: 188, minZ: -184, maxZ: 66 } as const;
const withinWorldBounds = (p: Vec3): boolean => p.x >= WORLD_BOUNDS.minX && p.x <= WORLD_BOUNDS.maxX && p.z >= WORLD_BOUNDS.minZ && p.z <= WORLD_BOUNDS.maxZ;
const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const CARRIER_LAYOUT = {
  wall: 0.08,
  deck: { min: { x: -6.3, y: 3.8, z: -12 }, max: { x: 6.3, y: 4, z: 12 } },
  compact: [
    { id: "carrier.berth.port", min: { x: -6, y: 4, z: -2.8 }, max: { x: -0.45, y: 8.4, z: 4.8 } },
    { id: "carrier.berth.starboard", min: { x: 0.55, y: 4, z: -2.8 }, max: { x: 6, y: 8.4, z: 4.8 } },
  ],
  medium: { id: "carrier.berth.medium", min: { x: -6, y: 4, z: -3.7 }, max: { x: 0.1, y: 8.4, z: 5.7 } },
  lock: { id: "carrier.lock", min: { x: -6, y: HULL_COLLIDERS.hearthline.bottom, z: -3.7 }, max: { x: 6, y: 3.8, z: 5.7 } },
  lockKeelY: -0.3,
  // Side shields/gate stop at the hull underside. The descending transfer route
  // continues through open water below them; it does not add a submerged skirt.
  throat: { id: "carrier.throat", min: { x: -3.1, y: HULL_COLLIDERS.hearthline.bottom, z: -12 }, max: { x: 3.1, y: 3.8, z: -3.8 } },
  gateZ: -11.5,
  railTurn: { x: 0, y: -0.3, z: -9 },
  helm: { x: 0, y: 4, z: -6 },
  vestibule: { x: 4, y: 4, z: 9 },
  exteriorVestibule: { x: 10, y: 3, z: 9 },
  interior: { minX: -4.7, maxX: 4.7, minZ: -11, maxZ: 10, y: 4 },
} as const;

export function carrierRooms(configuration: CarrierState["configuration"]): readonly Solid[] {
  return configuration === "compact" ? CARRIER_LAYOUT.compact : [CARRIER_LAYOUT.medium];
}

/** Solid shell with only the selected floor hatch and outer gate opened for transfer. */
export function carrierStructure(configuration: CarrierState["configuration"], transferSlot?: 0 | 1): Solid[] {
  const rooms = carrierRooms(configuration), t = CARRIER_LAYOUT.wall, result: Solid[] = [];
  for (const [slot, room] of rooms.entries()) {
    const { min: a, max: b, id } = room;
    result.push(
      { id: `${id}.port`, min: { x: a.x - t, y: a.y, z: a.z - t }, max: { x: a.x, y: b.y, z: b.z + t } },
      { id: `${id}.starboard`, min: { x: b.x, y: a.y, z: a.z - t }, max: { x: b.x + t, y: b.y, z: b.z + t } },
      { id: `${id}.fore`, min: { x: a.x, y: a.y, z: a.z - t }, max: { x: b.x, y: b.y, z: a.z } },
      { id: `${id}.aft`, min: { x: a.x, y: a.y, z: b.z }, max: { x: b.x, y: b.y, z: b.z + t } },
      { id: `${id}.roof`, min: { x: a.x - t, y: b.y, z: a.z - t }, max: { x: b.x + t, y: b.y + t, z: b.z + t } },
    );
    if (slot !== transferSlot) result.push({ id: `${id}.floor`, min: { x: a.x, y: CARRIER_LAYOUT.deck.min.y, z: a.z }, max: { x: b.x, y: a.y, z: b.z } });
  }
  // Deck cells around the independently sealed floor hatches, including the passage.
  const deck = CARRIER_LAYOUT.deck;
  const xs = [...new Set([deck.min.x, deck.max.x, ...rooms.flatMap((r) => [r.min.x, r.max.x])])].sort((a, b) => a - b);
  const zs = [...new Set([deck.min.z, deck.max.z, ...rooms.flatMap((r) => [r.min.z, r.max.z])])].sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++) for (let j = 1; j < zs.length; j++) {
    const x = (xs[i - 1]! + xs[i]!) / 2, z = (zs[j - 1]! + zs[j]!) / 2;
    if (!rooms.some((r) => x > r.min.x && x < r.max.x && z > r.min.z && z < r.max.z))
      result.push({ id: `carrier.deck.${i}.${j}`, min: { x: xs[i - 1]!, y: deck.min.y, z: zs[j - 1]! }, max: { x: xs[i]!, y: deck.max.y, z: zs[j]! } });
  }
  const lock = CARRIER_LAYOUT.lock, throat = CARRIER_LAYOUT.throat;
  result.push({ id: "carrier.lock.floor", min: { ...lock.min }, max: { x: lock.max.x, y: CARRIER_LAYOUT.lockKeelY, z: lock.max.z } });
  for (const [side, x] of [["port", throat.min.x - t], ["starboard", throat.max.x]] as const)
    result.push({ id: `carrier.throat.${side}`, min: { x, y: throat.min.y, z: throat.min.z }, max: { x: x + t, y: throat.max.y, z: throat.max.z } });
  if (transferSlot === undefined) result.push({ id: "carrier.lock.gate", min: { x: throat.min.x, y: throat.min.y, z: CARRIER_LAYOUT.gateZ - t }, max: { x: throat.max.x, y: throat.max.y, z: CARRIER_LAYOUT.gateZ } });
  return result;
}

function transferEnvelope(v: VehicleState): Capsule {
  return v.hull === "hearthline" ? HULL_COLLIDERS.hearthline : BERTH_ENVELOPES[v.hull];
}
function envelopeSolid(id: string, p: Vec3, shape: Capsule): Solid {
  const x = shape.halfWidth ?? shape.radius, z = shape.halfLength ?? shape.radius;
  return { id, min: { x: p.x - x, y: p.y + (shape.bottom ?? 0), z: p.z - z }, max: { x: p.x + x, y: p.y + shape.height, z: p.z + z } };
}
export function carrierInteriorSolids(s: GameState): Solid[] {
  const configuration = s.fleet.docking?.configuration ?? "compact";
  return [...carrierStructure(configuration),
    // Sealed compartments are not walking space, even when their craft is absent.
    ...carrierRooms(configuration),
    ...s.fleet.vehicles.filter((v) => v.berth).map((v) => envelopeSolid(`berth.${v.id}`, v.berth!.pose.position, transferEnvelope(v)))];
}
export function localToWorld(local: Vec3, carrier: VehicleState): Vec3 {
  const { position: p, yaw } = carrier.pose;
  return {
    x: p.x + Math.cos(yaw) * local.x - Math.sin(yaw) * local.z,
    y: p.y + local.y,
    z: p.z + Math.sin(yaw) * local.x + Math.cos(yaw) * local.z,
  };
}
export function carrierInteriorEntry(s: GameState, world: WorldQueries, preferred: Vec3): Vec3 | null {
  const h = carrierHull(s)!, shape = { radius: 0.34, height: 1.75 };
  const solids = carrierInteriorSolids(s), localWorld = createWorldQueries(solids, () => -200);
  const clear = (p: Vec3): boolean => localWorld.clearance(p, shape) && world.clearance(localToWorld(p, h), shape);
  if (clear(preferred)) return { ...preferred };
  const target = localToWorld(preferred, h), r = shape.radius;
  if (withinWorldBounds({ ...target, x: target.x - r, z: target.z - r }) &&
    withinWorldBounds({ ...target, x: target.x + r, z: target.z + r })) return null;
  const b = CARRIER_LAYOUT.interior;
  // Partition by physical room/wall faces expanded by the walking capsule.
  // Each clear cell is convex; clipping it against the world gives safe entry
  // candidates without arbitrary sampled margins or moving any vessel.
  const cuts = (axis: "x" | "z", min: number, max: number): number[] => [...new Set([
    min, max, ...solids.filter((a) => a.min.y < b.y + shape.height && a.max.y > b.y)
      .flatMap((a) => [a.min[axis] - r, a.max[axis] + r]).map((n) => Math.max(min, Math.min(max, n))),
  ])].sort((a, c) => a - c);
  const xs = cuts("x", b.minX, b.maxX), zs = cuts("z", b.minZ, b.maxZ);
  let best: Vec3 | null = null;
  for (let i = 1; i < xs.length; i++) for (let j = 1; j < zs.length; j++) {
    const x0 = xs[i - 1]!, x1 = xs[i]!, z0 = zs[j - 1]!, z1 = zs[j]!;
    if (!localWorld.clearance({ x: (x0 + x1) / 2, y: b.y, z: (z0 + z1) / 2 }, shape)) continue;
    let polygon: Vec3[] = [{ x: x0, y: b.y, z: z0 }, { x: x1, y: b.y, z: z0 },
      { x: x1, y: b.y, z: z1 }, { x: x0, y: b.y, z: z1 }];
    for (const [axis, edge, sign] of [["x", WORLD_BOUNDS.minX + r, 1], ["x", WORLD_BOUNDS.maxX - r, -1],
      ["z", WORLD_BOUNDS.minZ + r, 1], ["z", WORLD_BOUNDS.maxZ - r, -1]] as const) {
      const clipped: Vec3[] = [];
      for (let k = 0; k < polygon.length; k++) {
        const a = polygon[k]!, c = polygon[(k + 1) % polygon.length]!;
        const da = (localToWorld(a, h)[axis] - edge) * sign, dc = (localToWorld(c, h)[axis] - edge) * sign;
        if (da >= 0) clipped.push(a);
        if ((da >= 0) !== (dc >= 0)) {
          const t = da / (da - dc);
          clipped.push({ x: a.x + (c.x - a.x) * t, y: b.y, z: a.z + (c.z - a.z) * t });
        }
      }
      polygon = clipped;
    }
    if (!polygon.length) continue;
    const p = { x: polygon.reduce((sum, a) => sum + a.x, 0) / polygon.length, y: b.y,
      z: polygon.reduce((sum, a) => sum + a.z, 0) / polygon.length };
    if (clear(p) && (!best || distance(p, preferred) < distance(best, preferred))) best = p;
  }
  return best;
}
export const carrierHull = (s: GameState): VehicleState | undefined =>
  s.fleet.vehicles.find((v) => v.id === s.fleet.docking?.vehicleId);
