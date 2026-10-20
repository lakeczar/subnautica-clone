import { BERTH_ENVELOPES, HULL_COLLIDERS, HULL_HOLD_CU, HULLS } from "../content/registry.js";
import type { Capsule, CarrierState, ContainerState, GameState, Vec3, VehicleState, WorldQueries } from "./types.js";
import { CARRIER_COMPARTMENTS, compartmentId, distance } from "./inventory.js";
import { HEARTHLINE_SOCKETS, hearthlineInteriorSolids } from "../content/fleet/hearthlineInterior.js";
import { createGame, makeVehicle } from "./state.js";
import { completeOpening } from "./progression.js";
import { createWorldQueries, sweptHullClearance, withinWorldBounds, WORLD_BOUNDS, type HorizontalBounds, type Solid } from "./world.js";
export const BERTH_LOCAL: readonly Vec3[] = [
  { x: -3, y: 4, z: 1 },
  { x: 3, y: 4, z: 1 },
];
export const LAUNCH_LOCAL = { x: 0, y: -3, z: -17 };
export const CARRIER_SUPPORT = { x: 65, y: -0.9, z: 12 };
/** Metres, carrier-local, keel reference. These bounds own art and physical transfer.
 * Dry rooms have independent floor hatches. One opens to the lower lock; the other
 * remains sealed. Rail transfer is atomic, with the complete route swept beforehand. */
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
export function atCarrierSupport(h: VehicleState): boolean {
  return distance(h.pose.position, CARRIER_SUPPORT) < 4 && Math.hypot(h.velocity.x, h.velocity.y, h.velocity.z) < 0.05;
}
/** Every Hearthline socket empty: New Game's and a pre-socket save's value. */
export const emptySockets = (): Record<string, string | null> =>
  Object.fromEntries(HEARTHLINE_SOCKETS.map((socket) => [socket.id, null]));
export const occupiedSockets = (d: Pick<CarrierState, "sockets">): string[] =>
  HEARTHLINE_SOCKETS.filter((socket) => d.sockets[socket.id] != null).map((socket) => socket.id);
/** The carrier's pantry and fabrication compartments beside its stores (the cargo container). */
export const carrierCompartmentContainers = (h: VehicleState): ContainerState[] =>
  CARRIER_COMPARTMENTS.map((c) => ({ id: compartmentId(h.id, c.suffix), kind: "locker" as const, capacity: c.capacity, ownerId: h.id }));
export function carrierInteriorSolids(s: GameState): Solid[] {
  const configuration = s.fleet.docking?.configuration ?? "compact";
  return [...carrierStructure(configuration),
    // The interior kit: fixtures plus the footprint of every occupied socket.
    ...hearthlineInteriorSolids(s.fleet.docking ? occupiedSockets(s.fleet.docking) : []),
    // Sealed compartments are not walking space, even when their craft is absent.
    ...carrierRooms(configuration),
    ...s.fleet.vehicles.filter((v) => v.berth).map((v) => envelopeSolid(`berth.${v.id}`, v.berth!.pose.position, transferEnvelope(v)))];
}
export function launchPoint(h: VehicleState, v: VehicleState): Vec3 {
  const p = localToWorld(LAUNCH_LOCAL, h);
  if (v.hull === "spindle") p.y = -0.4;
  return p;
}
/** Full world-space keel route, including the independent capture approach. */
export function carrierTransferPath(s: GameState, v: VehicleState, slot: 0 | 1, type: "launch" | "capture"): Vec3[] {
  const h = carrierHull(s)!, berth = BERTH_LOCAL[slot]!;
  const path = [berth, { ...berth, y: CARRIER_LAYOUT.lockKeelY },
    { x: 0, y: CARRIER_LAYOUT.lockKeelY, z: berth.z }, CARRIER_LAYOUT.railTurn].map((p) => localToWorld(p, h));
  path.push(launchPoint(h, v));
  return type === "capture" ? [{ ...v.pose.position }, ...path.reverse()] : path;
}

function transferRefusal(s: GameState, v: VehicleState, slot: 0 | 1, type: "launch" | "capture", world: WorldQueries): string | null {
  const dock = s.fleet.docking!, h = carrierHull(s)!, shape = transferEnvelope(v);
  if (dock.launchBlocked) return "Transfer corridor obstructed. Vehicle identity, cargo, charge and damage are unchanged.";
  const path = carrierTransferPath(s, v, slot, type), local = path.map((p) => worldToLocal(p, h));
  // The independent approach is outside the carrier. At the mouth, guided rails
  // align the hull; use its broader piloting envelope for that initial approach.
  const structure = carrierStructure(dock.configuration, slot);
  for (const a of s.fleet.vehicles)
    if (a.id !== v.id && a.berth?.carrierId === h.id)
      structure.push(envelopeSolid(`berth.${a.id}`, a.berth.pose.position, transferEnvelope(a)));
  const localWorld = createWorldQueries(structure, () => -200);
  const cos = Math.abs(Math.cos(h.pose.yaw)), sin = Math.abs(Math.sin(h.pose.yaw));
  const rx = shape.halfWidth ?? shape.radius, rz = shape.halfLength ?? shape.radius;
  const worldShape = { ...shape, halfWidth: rx * cos + rz * sin, halfLength: rx * sin + rz * cos };
  const obstacles = s.fleet.vehicles.filter((a) => a.id !== v.id && a.id !== h.id && !a.berth)
    .map((a) => envelopeSolid(`craft.${a.id}`, a.pose.position, HULL_COLLIDERS[a.hull]));
  const otherWorld = createWorldQueries(obstacles, () => -200);
  if (!sweptHullClearance(localWorld, local, shape) ||
    !sweptHullClearance(world, path, worldShape) ||
    !sweptHullClearance(otherWorld, path, worldShape) ||
    (type === "capture" && (!sweptHullClearance(world, path.slice(0, 2), HULL_COLLIDERS[v.hull]) ||
      !sweptHullClearance(localWorld, local.slice(0, 2), HULL_COLLIDERS[v.hull]) ||
      !sweptHullClearance(otherWorld, path.slice(0, 2), HULL_COLLIDERS[v.hull]))))
    return "Transfer corridor obstructed. Vehicle identity, cargo, charge and damage are unchanged.";
  return null;
}
export function localToWorld(local: Vec3, carrier: VehicleState): Vec3 {
  const { position: p, yaw } = carrier.pose;
  return {
    x: p.x + Math.cos(yaw) * local.x - Math.sin(yaw) * local.z,
    y: p.y + local.y,
    z: p.z + Math.sin(yaw) * local.x + Math.cos(yaw) * local.z,
  };
}
export function worldToLocal(world: Vec3, carrier: VehicleState): Vec3 {
  const p = carrier.pose.position,
    dx = world.x - p.x,
    dz = world.z - p.z;
  return {
    x: Math.cos(carrier.pose.yaw) * dx + Math.sin(carrier.pose.yaw) * dz,
    y: world.y - p.y,
    z: -Math.sin(carrier.pose.yaw) * dx + Math.cos(carrier.pose.yaw) * dz,
  };
}
/** The existing yaw-independent piloting proxy encloses the rooms, berth hulls,
 * walking bounds and vestibules at every heading. Launch still needs its own sweep. */
export function carrierTravelBounds(): HorizontalBounds {
  const { radius } = HULL_COLLIDERS.hearthline;
  return { minX: WORLD_BOUNDS.minX + radius, maxX: WORLD_BOUNDS.maxX - radius,
    minZ: WORLD_BOUNDS.minZ + radius, maxZ: WORLD_BOUNDS.maxZ - radius };
}

/** Retained old poses may overhang the new travel envelope. Restrict their turn
 * at the first attached-origin world contact, including extrema between ticks.
 * This does not add rotating-hull solid collision or require propulsion power. */
export function constrainCarrierYaw(s: GameState, desiredYaw: number): number {
  const h = carrierHull(s);
  if (!h) return desiredYaw;
  const tau = Math.PI * 2, quarter = Math.PI / 2;
  // Check precisely the representation we will save. Adding/subtracting tau
  // after a contact search can round an origin through a strict world plane.
  const wrap = (yaw: number): number => yaw < 0 ? yaw + tau : yaw >= tau ? yaw - tau : yaw;
  const delta = ((desiredYaw - h.pose.yaw + Math.PI + tau) % tau) - Math.PI;
  const points = s.fleet.vehicles.filter((v) => v.berth?.carrierId === h.id).map((v) => v.berth!.pose.position);
  const fits = (fraction: number): boolean => {
    const end = h.pose.yaw + delta * fraction;
    // The requested endpoint can round differently from the recomputed arc end.
    const endpoint = fraction === 1 ? desiredYaw : wrap(end);
    for (const p of points) {
      const phase = Math.atan2(p.z, p.x), angles = [h.pose.yaw, endpoint];
      for (let n = Math.ceil((Math.min(h.pose.yaw, end) + phase) / quarter);
        n <= Math.floor((Math.max(h.pose.yaw, end) + phase) / quarter); n++) angles.push(wrap(n * quarter - phase));
      for (const yaw of angles)
        if (!withinWorldBounds(localToWorld(p, { ...h, pose: { ...h.pose, yaw } }))) return false;
    }
    return true;
  };
  if (fits(1)) return desiredYaw;
  let low = 0, high = 1;
  for (let i = 0; i < 48; i++) {
    const mid = (low + high) / 2;
    if (fits(mid)) low = mid;
    else high = mid;
  }
  return low === 0 ? h.pose.yaw : wrap(h.pose.yaw + delta * low);
}

/** Checked landing for explicit entry and legacy walking-pose migration in a
 * validated carrier assembly. Returns a detached carrier-local point, preferring
 * the authored destination. Only a world-edge overhang enables the dry-passage
 * fallback; every candidate must clear local structure and the supplied world.
 * Returns null if no supported landing clears. Does not mutate state/ownership. */
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
export function fixtureGame(): GameState {
  const s = createGame();
  completeOpening(s);
  s.scenario = "carrier-fixture";
  s.feedback =
    "CARRIER FEASIBILITY FIXTURE · seeded state, separate from earned expedition progression.";
  const h = makeVehicle(
    "fixture_hearthline",
    "hearthline",
    { x: 65, y: -24, z: 12 },
    "fixture_carrier_hold",
  );
  const d = makeVehicle(
    "fixture_dart",
    "dart",
    localToWorld(BERTH_LOCAL[0]!, h),
    "fixture_dart_hold",
  );
  d.charge = 63;
  d.health = 74;
  const p = makeVehicle(
    "fixture_spindle",
    "spindle",
    localToWorld(BERTH_LOCAL[1]!, h),
    "fixture_spindle_hold",
  );
  p.charge = 82;
  p.health = 91;
  const c = makeVehicle(
    "fixture_creel",
    "creel",
    { x: 81, y: -25, z: -12 },
    "fixture_creel_hold",
  );
  d.berth = {
    carrierId: h.id,
    slot: 0,
    pose: { frame: "carrier-local", position: { ...BERTH_LOCAL[0]! }, yaw: 0 },
  };
  p.berth = {
    carrierId: h.id,
    slot: 1,
    pose: { frame: "carrier-local", position: { ...BERTH_LOCAL[1]! }, yaw: 0 },
  };
  s.fleet.vehicles = [h, d, p, c];
  s.fleet.docking = {
    vehicleId: h.id,
    configuration: "compact",
    stationKeeping: true,
    supportedDock: false,
    transaction: null,
    sequence: 0,
    completed: [],
    launchBlocked: false,
    // Two seeded occupants show the interior kit's socket occupancy.
    sockets: { ...emptySockets(), "hl.socket.galley.planter": "galley_planter", "hl.socket.bridge.survey": "directional_survey" },
  };
  for (const v of s.fleet.vehicles)
    s.inventory.containers.push({
      id: v.cargoId,
      kind: "vehicle",
      capacity: HULL_HOLD_CU[v.hull],
      ownerId: v.id,
    });
  s.inventory.containers.push(...carrierCompartmentContainers(h));
  s.inventory.items.push({
    id: "fixture_cargo",
    kind: "silica_glass",
    quantity: 3,
    containerId: d.cargoId,
    fitted: null,
    charge: null,
    provenance: "public",
  });
  s.player.mode = "interior";
  s.player.interiorId = h.id;
  s.player.interiorPose = {
    frame: "carrier-local",
    position: { ...CARRIER_LAYOUT.helm },
  };
  s.player.pose.position = localToWorld(s.player.interiorPose.position, h);
  return s;
}
export function carrierCommand(
  s: GameState,
  action: string,
  vehicleId: string | undefined,
  world: WorldQueries,
): string | null {
  const dock = s.fleet.docking,
    h = carrierHull(s);
  if (!dock || !h) return "No carrier interface is present in this expedition.";
  if (
    s.player.interiorId !== h.id &&
    s.player.controlledVehicleId !== h.id &&
    distance(s.player.pose.position, h.pose.position) > 15
  )
    return "Approach the carrier interface locally.";
  if (action === "leave-interior") {
    if (!dock.stationKeeping || !s.player.interiorPose)
      return "Station keeping is required before using the vestibule.";
    if (s.player.interiorPose.position.z < 7)
      return "Walk aft to the yellow launch vestibule before leaving the dry interior.";
    const exit = localToWorld(CARRIER_LAYOUT.exteriorVestibule, h);
    if (!world.clearance(exit, { radius: 0.34, height: 0.95 }))
      return "Exterior vestibule exit is blocked.";
    s.player.interiorId = null;
    s.player.interiorPose = null;
    s.player.pose.position = exit;
    s.player.mode = "swimming";
    return null;
  }
  if (action === "enter-interior") {
    if (
      !dock.stationKeeping ||
      distance(s.player.pose.position, localToWorld(CARRIER_LAYOUT.exteriorVestibule, h)) >
        5
    )
      return "Approach the exterior vestibule while station keeping is engaged.";
    const entry = carrierInteriorEntry(s, world, CARRIER_LAYOUT.vestibule);
    if (!entry) return "World edge or an obstruction blocks the dry interior. Turn or move inward before boarding.";
    s.player.controlledVehicleId = null;
    s.player.interiorId = h.id;
    s.player.interiorPose = {
      frame: "carrier-local",
      position: entry,
    };
    s.player.pose.position = localToWorld(s.player.interiorPose.position, h);
    s.player.mode = "interior";
    if (distance(entry, CARRIER_LAYOUT.vestibule) > 0.001)
      s.feedback = "World edge blocks the vestibule landing. Entered a clear dry passage; carrier position is unchanged.";
    return null;
  }
  if (action === "station-keep") {
    h.velocity = { x: 0, y: 0, z: 0 };
    dock.stationKeeping = true;
    dock.supportedDock = atCarrierSupport(h);
    s.feedback =
      "Station keeping engaged. Interior and launch controls available.";
    return null;
  }
  if (action === "helm") {
    if (dock.transaction)
      return "Close the launch lock before taking the helm.";
    s.player.mode = "piloting";
    s.player.controlledVehicleId = h.id;
    s.player.pose.position = { ...h.pose.position };
    s.player.velocity = { ...h.velocity };
    s.player.interiorId = null;
    s.player.interiorPose = null;
    dock.stationKeeping = false;
    s.feedback =
      "Carrier helm. Station keeping is required before walking or launching.";
    return null;
  }
  if (action === "leave-helm") {
    if (
      !dock.stationKeeping ||
      Math.hypot(h.velocity.x, h.velocity.y, h.velocity.z) > 0.05
    )
      return "Stop and engage station keeping before leaving the helm.";
    const entry = carrierInteriorEntry(s, world, CARRIER_LAYOUT.helm);
    if (!entry) return "World edge or an obstruction blocks the dry interior. Turn or move inward before leaving the helm.";
    s.player.controlledVehicleId = null;
    s.player.interiorId = h.id;
    s.player.interiorPose = {
      frame: "carrier-local",
      position: entry,
    };
    s.player.pose.position = localToWorld(s.player.interiorPose.position, h);
    s.player.mode = "interior";
    s.player.velocity = { x: 0, y: 0, z: 0 };
    if (distance(entry, CARRIER_LAYOUT.helm) > 0.001)
      s.feedback = "World edge blocks the bridge landing. Entered a clear dry passage; carrier position is unchanged.";
    return null;
  }
  if (
    !dock.stationKeeping ||
    Math.hypot(h.velocity.x, h.velocity.y, h.velocity.z) > 0.05
  )
    return "Station keeping is required. No vehicle state changed.";
  if (action === "interrupt") {
    dock.transaction = null;
    s.feedback =
      "Launch/capture interrupted before detachment. Original vehicle and cargo retained.";
    return null;
  }
  if (action === "block-exit" && s.scenario === "carrier-fixture") {
    dock.launchBlocked = !dock.launchBlocked;
    s.feedback = dock.launchBlocked
      ? "Fixture obstruction in the launch volume."
      : "Fixture launch volume cleared.";
    return null;
  }
  if (dock.transaction) return "A berth transaction is already in progress.";
  if (action === "reconfigure") {
    if (
      !dock.supportedDock || !atCarrierSupport(h) ||
      s.fleet.vehicles.some((v) => v.berth?.carrierId === h.id)
    )
      return "Reconfiguration requires an empty carrier at a supported dock.";
    const configuration = dock.configuration === "compact" ? "medium" : "compact";
    if (s.player.interiorPose && !createWorldQueries([
      ...carrierStructure(configuration), ...carrierRooms(configuration),
    ], () => -200).clearance(s.player.interiorPose.position, { radius: 0.34, height: 1.75 }))
      return "Move to the clear bridge passage before reconfiguring the sealed compartments. Nothing changed.";
    dock.configuration = configuration;
    s.feedback = `Empty supported berth reconfigured to ${dock.configuration}.`;
    return null;
  }
  const v = s.fleet.vehicles.find((v) => v.id === vehicleId);
  if (!v || v.id === h.id) return "Select a craft at this berth.";
  if (action === "launch") {
    if (v.berth?.carrierId !== h.id) return "This craft is already detached.";
    if (v.hull === "spindle" && h.pose.position.y < -1)
      return "Spindle is dry and isolated. Launch it only at the surface.";
    const no = launchRefusal(s, v, world);
    if (no) return no;
    dock.transaction = {
      id: `berth_${++dock.sequence}`,
      type: "launch",
      vehicleId: v.id,
      slot: v.berth.slot,
      phase: "prepared",
      ticks: 0,
    };
  } else if (action === "capture") {
    if (s.player.controlledVehicleId === v.id)
      return "Exit the craft and use the stationary carrier interface before capture.";
    if (
      v.berth ||
      v.disabled ||
      distance(v.pose.position, launchPoint(h, v)) > 13 ||
      Math.hypot(v.velocity.x, v.velocity.y, v.velocity.z) > 1
    )
      return "Approach the launch corridor slowly with an independent craft.";
    if (v.hull === "spindle" && h.pose.position.y < -1)
      return "Spindle capture is surface-only.";
    const slot = ([0, 1] as const).find(
      (n) =>
        !s.fleet.vehicles.some(
          (a) => a.berth?.carrierId === h.id && a.berth.slot === n,
        ),
    );
    if (
      slot === undefined ||
      (dock.configuration === "medium" && slot !== 0) ||
      HULLS[v.hull].berth !== dock.configuration
    )
      return "Craft size does not fit an empty berth in this configuration.";
    const no = transferRefusal(s, v, slot, "capture", world);
    if (no) return no;
    dock.transaction = {
      id: `berth_${++dock.sequence}`,
      type: "capture",
      vehicleId: v.id,
      slot,
      phase: "prepared",
      ticks: 0,
    };
  } else return "Unknown berth action.";
  s.feedback =
    "Lock transaction prepared. Saving or interruption preserves one craft identity.";
  return null;
}
export function launchRefusal(
  s: GameState,
  v: VehicleState,
  world: WorldQueries,
): string | null {
  if (!v.berth || v.berth.carrierId !== carrierHull(s)?.id) return "This craft is already detached.";
  if (v.hull === "spindle" && carrierHull(s)!.pose.position.y < -1) return "Spindle is dry and isolated. Launch it only at the surface.";
  return transferRefusal(s, v, v.berth.slot, "launch", world);
}
export function updateBerth(s: GameState, world: WorldQueries): void {
  const dock = s.fleet.docking,
    h = carrierHull(s);
  if (!dock || !h) return;
  dock.supportedDock = atCarrierSupport(h);
  for (const v of s.fleet.vehicles)
    if (v.berth?.carrierId === h.id) {
      v.pose.position = localToWorld(v.berth.pose.position, h);
      v.pose.yaw = h.pose.yaw + v.berth.pose.yaw;
      v.velocity = { x: 0, y: 0, z: 0 };
    }
  if (s.player.interiorId === h.id && s.player.interiorPose)
    s.player.pose.position = localToWorld(s.player.interiorPose.position, h);
  const t = dock.transaction;
  if (!t) return;
  if (!dock.stationKeeping || Math.hypot(h.velocity.x, h.velocity.y, h.velocity.z) > 0.05) {
    dock.transaction = null;
    s.feedback = "Transaction rolled back: station keeping interrupted.";
    return;
  }
  t.ticks++;
  if (t.phase === "prepared") {
    t.phase = "lock";
    return;
  }
  if (t.ticks < 30) return;
  const v = s.fleet.vehicles.find((v) => v.id === t.vehicleId);
  if (!v || dock.completed.includes(t.id)) {
    dock.transaction = null;
    return;
  }
  if (t.type === "launch") {
    const no = launchRefusal(s, v, world);
    if (no) {
      dock.transaction = null;
      s.feedback = no;
      return;
    }
    if (!v.berth) {
      dock.transaction = null;
      return;
    }
    v.berth = null;
    v.pose.position = launchPoint(h, v);
    v.pose.yaw = h.pose.yaw;
    v.pose.pitch = 0;
  } else {
    if (v.berth || v.disabled || s.player.controlledVehicleId === v.id ||
      distance(v.pose.position, launchPoint(h, v)) > 13 ||
      Math.hypot(v.velocity.x, v.velocity.y, v.velocity.z) > 1 ||
      (v.hull === "spindle" && h.pose.position.y < -1) ||
      s.fleet.vehicles.some((a) => a.berth?.carrierId === h.id && a.berth.slot === t.slot) ||
      HULLS[v.hull].berth !== dock.configuration) {
      dock.transaction = null;
      s.feedback = "Capture clearance changed before lock closure. World craft and cargo retained.";
      return;
    }
    const no = transferRefusal(s, v, t.slot, "capture", world);
    if (no) {
      dock.transaction = null;
      s.feedback = no;
      return;
    }
    v.berth = {
      carrierId: h.id,
      slot: t.slot,
      pose: {
        frame: "carrier-local",
        position: { ...BERTH_LOCAL[t.slot]! },
        yaw: 0,
      },
    };
    v.pose.position = localToWorld(v.berth.pose.position, h);
    v.pose.yaw = h.pose.yaw;
    v.pose.pitch = 0;
    v.velocity = { x: 0, y: 0, z: 0 };
  }
  dock.completed.push(t.id);
  if (dock.completed.length > 64) dock.completed.shift();
  dock.transaction = null;
  s.feedback = `${v.hull} ${t.type === "launch" ? "detached exactly once" : "captured in an isolated dry berth"}. Other berths remain sealed.`;
}
