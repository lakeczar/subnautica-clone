import { createWorldQueries, moveHull, sweptHullClearance } from "./world.js";
import { HULL_COLLIDERS, ITEMS, PLACES, RECOVERY_STAGE } from "../content/registry.js";
import { LEGACY_WORLD_BOUNDS, RECOVERY_ROUTES, RECOVERY_SURFACE_OPERATOR, type RecoveryRouteId } from "../content/routes.js";
import type { MaterialId } from "../content/registry.js";
import type { GameEvent, GameState, Vec3, WorldQueries } from "./types.js";
import {
  addItem,
  distance,
  equipped,
  facility,
  hasRoom,
  nextId,
  removeQuantity,
} from "./inventory.js";
import { safePersonalDepth } from "./capabilities.js";
const DT = 1 / 60;
const OCCUPIED_RECOVERY = "the Dart is occupied. Tow and salvage require an empty hull. Exit only when depth and clearance allow it safely, then approach the exterior collar; a bound field patch remains available if eligible.";
export const RECOVERY_NOTICES = {
  ready: "Bobbin reached the exterior collar. Confirm local tow to attach; no hull has moved.",
  blocked: "Tow clearance blocked. Dart and cargo remain at this visited site. Approach locally for in-place repair or salvage.",
  completed: "Dart moored at the shallow rescue bench, with its original cargo, damage and charge. Apply a bound field patch and reserve cell locally.",
  occupied: `Bobbin recovery stopped: ${OCCUPIED_RECOVERY}`,
} as const;
export function recoveryOccupancyRefusal(s: GameState, vehicleId: string): string | null {
  return s.player.controlledVehicleId === vehicleId || s.player.interiorId === vehicleId
    ? `Recovery unavailable: ${OCCUPIED_RECOVERY}`
    : null;
}
export const RECOVERY_MOORING = { x: RECOVERY_STAGE.x + 5, y: -11, z: RECOVERY_STAGE.z } as const;
export const BOBBIN_COLLIDER = { radius: 0.25, height: 0.3 } as const;
/** Chosen at initiation from the visited loss, never from render residency or tow position. */
export function recoveryRouteFor(position: Readonly<Vec3>): RecoveryRouteId {
  return position.x > LEGACY_WORLD_BOUNDS.maxX || position.z < LEGACY_WORLD_BOUNDS.minZ ? "basin" : "canopy";
}
function retainedRoute(s: GameState, vehicleId: string): RecoveryRouteId {
  return s.recovery.operation?.vehicleId === vehicleId ? s.recovery.operation.routeId :
    recoveryRouteFor(s.recovery.losses.find(l => l.vehicleId === vehicleId)?.position ??
      s.fleet.vehicles.find(v => v.id === vehicleId)!.pose.position);
}
function towWaypoints(position: Vec3, routeId: RecoveryRouteId): Vec3[] {
  const route = RECOVERY_ROUTES[routeId];
  return [...route.tow.map(p => ({ ...p })), ...(routeId === "basin"
    ? [{ x: position.x, y: RECOVERY_ROUTES.basin.liftY, z: position.z }] : [])];
}
/** Detached complete keel path, including the visited attachment position. */
export function recoveryTowPath(s: GameState, vehicleId: string, routeId: RecoveryRouteId = retainedRoute(s, vehicleId)): Vec3[] {
  const p = s.fleet.vehicles.find(v => v.id === vehicleId)!.pose.position;
  return [{ ...p }, ...towWaypoints(p, routeId).reverse()];
}
export function disableVehicle(s: GameState, id: string): void {
  const v = s.fleet.vehicles.find((v) => v.id === id);
  if (!v) return;
  v.health = 0;
  v.disabled = true;
  v.velocity = { x: 0, y: 0, z: 0 };
  if (!s.recovery.losses.some((l) => l.vehicleId === id))
    s.recovery.losses.push({
      vehicleId: id,
      position: { ...v.pose.position },
      visited: true,
    });
}
export function incapacitate(s: GameState, reason: string): void {
  const p = s.player,
    lossPosition = { ...p.pose.position };
  if (p.controlledVehicleId) disableVehicle(s, p.controlledVehicleId);
  const cargo = s.inventory.items.filter(
    (i) =>
      i.containerId === "diver" &&
      !i.fitted &&
      i.charge === null &&
      i.kind !== "salvage_buoy" &&
      i.kind !== "dart_acoustic_trim",
  );
  let dropped = 0;
  const contents: { kind: (typeof cargo)[number]["kind"]; quantity: number }[] =
    [];
  for (const item of s.recovery.caches.length < 80 ? cargo : []) {
    const n = Math.min(
      item.quantity,
      Math.floor((8 - dropped) / ITEMS[item.kind].cu),
    );
    if (n > 0) {
      contents.push({ kind: item.kind, quantity: n });
      removeQuantity(s, item, n);
      dropped += n * ITEMS[item.kind].cu;
    }
  }
  if (contents.length && s.recovery.caches.length < 80) {
    const id = nextId(s, "cache"),
      containerId = `${id}_hold`;
    s.recovery.caches.push({ id, containerId, position: lossPosition });
    s.inventory.containers.push({
      id: containerId,
      kind: "cache",
      capacity: 8,
      ownerId: id,
    });
    for (const c of contents) addItem(s, c.kind, c.quantity, containerId);
  }
  s.recovery.operation = null;
  const workshop =
    p.refugeId === "island_workshop" && facility(s, "island_workshop");
  p.pose = {
    frame: "world",
    position: workshop
      ? { x: 10, y: 1.2, z: -34 }
      : { ...PLACES.home_pod.position },
    yaw: 0,
    pitch: -0.05,
  };
  p.velocity = { x: 0, y: 0, z: 0 };
  p.mode = "walking";
  p.controlledVehicleId = null;
  p.interiorId = null;
  p.interiorPose = null;
  p.refugeId = workshop ? "island_workshop" : "home_pod";
  p.vitals = { health: 65, oxygen: 100, food: 60 };
  p.starvationSeconds = 0;
  p.graceSeconds = 180;
  s.world.action = null;
  s.world.threat.mode = "disengage";
  s.world.threat.interest = 0;
  s.metrics.failures++;
  s.feedback = `${reason} You recovered at ${workshop ? "Splitspine workshop" : "the home pod"}. Knowledge and essential equipment remain. Ordinary cargo has a visited-site marker; disabled craft retain their hold and modules.`;
}
export function rescueWaypoints(s: GameState, vehicleId: string, routeId: RecoveryRouteId = retainedRoute(s, vehicleId)): Vec3[] {
  const v = s.fleet.vehicles.find((v) => v.id === vehicleId)!;
  const route = RECOVERY_ROUTES[routeId];
  return [
    ...route.approach.map(p => ({ ...p })),
    ...(routeId === "basin" ? [{ x: v.pose.position.x, y: RECOVERY_ROUTES.basin.liftY + 1, z: v.pose.position.z }] : []),
    { ...v.pose.position, y: v.pose.position.y + 1 },
  ];
}
export function recoveryCommand(
  s: GameState,
  id: string,
  method: "tow" | "repair" | "salvage",
  world: WorldQueries = createWorldQueries(),
): string | null {
  const v = s.fleet.vehicles.find((v) => v.id === id);
  if (!v || !v.disabled || v.berth || v.hull !== "dart")
    return "Select a disabled, visited Dart transponder.";
  if (method !== "repair") {
    const occupied = recoveryOccupancyRefusal(s, id);
    if (occupied) return occupied;
  }
  if (!equipped(s, "bobbin_kit"))
    return "Fabricate the reusable Bobbin / collar from pod rescue stock first.";
  const local = distance(s.player.pose.position, v.pose.position) < 7,
    atStage = distance(s.player.pose.position, RECOVERY_STAGE) < 7 || distance(s.player.pose.position, RECOVERY_SURFACE_OPERATOR) < 7;
  if (!local && !atStage)
    return "Travel to the shallow rescue staging bench east of Splitspine, or approach the exterior collar locally.";
  if (method === "repair") {
    if (!local)
      return "A field patch must be applied at the actual hull collar. Tow to the shallow bench if personal depth prevents access.";
    if (s.player.controlledVehicleId !== v.id && (!safePersonalDepth(s) ||
        !world.clearance(s.player.pose.position, { radius: 0.34, height: s.player.mode === "walking" ? 1.75 : 0.95 })))
      return "Reach the actual hull collar with safe personal depth and clearance before applying a field patch.";
    if (s.world.maintenance.alloy < 2 || s.world.maintenance.membrane < 1)
      return "Not enough rescue stock for a patch. Local tow needs no materials.";
    s.world.maintenance.alloy -= 2;
    s.world.maintenance.membrane--;
    v.boundRepairs = Math.min(7, v.boundRepairs + 1);
    v.health = 65;
    v.disabled = false;
    v.emergencyAir = 120;
    s.recovery.losses = s.recovery.losses.filter((l) => l.vehicleId !== id);
    if (s.recovery.operation?.vehicleId === id) s.recovery.operation = null;
    s.metrics.rescues++;
    s.feedback =
      "Rescue patch fitted. Hull restored to 65%; charge and cargo retained. Use a reserve cell if power is depleted.";
    return null;
  }
  if (method === "salvage") {
    if (!local)
      return "Salvage requires local collar access, after towing if necessary.";
    if (!safePersonalDepth(s) || !world.clearance(s.player.pose.position, { radius: 0.34, height: s.player.mode === "walking" ? 1.75 : 0.95 }))
      return "Reach the actual hull collar with safe personal depth and clearance before salvaging.";
    if (
      s.inventory.items.some((i) => i.containerId === v.cargoId) ||
      v.modules.length
    )
      return "Remove installed modules at a supported cradle or eligible local disabled-hull collar, then transfer all cargo before salvaging the frame. Nothing changed.";
    const cu = Object.entries(v.investment).reduce(
      (n, [k, q]) => n + ITEMS[k as MaterialId].cu * q,
      0,
    );
    const dest =
      hasRoom(s, "buoy_hold", cu) &&
      s.inventory.buoy.deployed &&
      distance(s.inventory.buoy.position, s.player.pose.position) < 6
        ? "buoy_hold"
        : hasRoom(s, "diver", cu)
          ? "diver"
          : null;
    if (!dest)
      return "Make space for the complete frame return. A deployed buoy can carry it; nothing is lost.";
    for (const [k, q] of Object.entries(v.investment))
      addItem(s, k as MaterialId, q, dest);
    s.world.maintenance.alloy = Math.min(
      14,
      s.world.maintenance.alloy + v.boundRepairs * 2,
    );
    s.world.maintenance.membrane = Math.min(
      7,
      s.world.maintenance.membrane + v.boundRepairs,
    );
    s.fleet.vehicles = s.fleet.vehicles.filter((a) => a.id !== id);
    s.inventory.containers = s.inventory.containers.filter(
      (a) => a.id !== v.cargoId,
    );
    s.recovery.losses = s.recovery.losses.filter((l) => l.vehicleId !== id);
    s.recovery.operation = null;
    s.feedback =
      "Frame materials recovered. Past patches return to rescue stock for future repairs. Learned Dart plans remain.";
    return null;
  }
  if (s.recovery.operation) {
    const op = s.recovery.operation;
    if (op.vehicleId !== id)
      return "A local rescue operation is already staged.";
    if (op.phase === "ready") {
      if (op.routeId === "basin" && !sweptHullClearance(world, recoveryTowPath(s, id, op.routeId), HULL_COLLIDERS.dart))
        return RECOVERY_NOTICES.blocked;
      op.phase = "tow";
      op.waypoint = RECOVERY_ROUTES[op.routeId].attachmentIndex - 1;
      s.feedback =
        "Collar attached. Guided tow follows the surveyed clear flank back to the shallow bench.";
    } else return "Bobbin is moving along the local tether corridor.";
  } else {
    const routeId = retainedRoute(s, id), route = RECOVERY_ROUTES[routeId];
    if (routeId === "canopy" && distance(RECOVERY_STAGE, v.pose.position) > route.maximumTether)
      return "This loss is outside the implemented upper-Canopy tether corridor.";
    if (routeId === "basin") {
      const approach = rescueWaypoints(s, id, routeId);
      const tetherLength = approach.slice(1).reduce((n, p, i) => n + distance(approach[i]!, p), 0);
      if (tetherLength > route.maximumTether || !sweptHullClearance(world, approach, BOBBIN_COLLIDER) ||
          !sweptHullClearance(world, recoveryTowPath(s, id, routeId), HULL_COLLIDERS.dart))
        return "The surveyed Basin tether or extraction path is blocked. No hull, cargo or rescue stock moved; use a safe local collar or clear the obstruction.";
    }
    s.recovery.operation = {
      vehicleId: id,
      routeId,
      method: "tow",
      phase: local ? "tow" : "approach",
      position: local ? { ...v.pose.position } : { ...RECOVERY_STAGE },
      waypoint: local ? route.attachmentIndex - 1 : 1,
    };
    s.feedback = local
      ? "Collar attached locally. The guided shallow tow is underway."
      : "Bobbin deployed from the shallow staging bench. Follow its progress, then attach the collar.";
  }
  return null;
}
export function updateRecovery(s: GameState, world: WorldQueries): GameEvent | null {
  const op = s.recovery.operation;
  if (!op) return null;
  const v = s.fleet.vehicles.find((v) => v.id === op.vehicleId);
  if (!v || !v.disabled || v.berth) {
    s.recovery.operation = null;
    return null;
  }
  // Valid old saves may already contain an occupied approach, ready or tow.
  // Cancel before changing either guide or hull; normal step survival still runs.
  if (recoveryOccupancyRefusal(s, v.id)) {
    s.recovery.operation = null;
    s.feedback = RECOVERY_NOTICES.occupied;
    return { type: "notice", message: s.feedback, error: true };
  }
  if (op.phase === "ready") return null;
  // Keep legacy approach/ready positions and indices intact. During tow use the
  // actual keel, preserving either the local-start offset or the old +1 m guide
  // offset without letting it change the physical route. Legacy tow index 3
  // is the attachment point: no movement, then continue through index 2.
  const origin = op.phase === "tow" ? v.pose.position : op.position;
  const target = op.phase === "tow"
    ? towWaypoints(v.pose.position, op.routeId)[op.waypoint] ?? v.pose.position
    : rescueWaypoints(s, v.id, op.routeId)[op.waypoint]!;
  const d = distance(origin, target),
    speed = op.phase === "approach" ? 10 : 7,
    scale = Math.min(1, (speed * DT) / Math.max(d, 0.001));
  const next = {
    x: origin.x + (target.x - origin.x) * scale,
    y: origin.y + (target.y - origin.y) * scale,
    z: origin.z + (target.z - origin.z) * scale,
  };
  if (op.phase === "tow") {
    const delta = { x: next.x - origin.x, y: next.y - origin.y, z: next.z - origin.z };
    const move = moveHull(world, origin, delta, HULL_COLLIDERS.dart);
    if (
      move.hitSolid ||
      move.hitBoundary ||
      distance(move.position, next) > 0.001
    ) {
      s.recovery.operation = null;
      s.feedback = RECOVERY_NOTICES.blocked;
      return { type: "notice", message: s.feedback, error: true };
    }
    v.pose.position = move.position;
    op.position = { x: op.position.x + delta.x, y: op.position.y + delta.y, z: op.position.z + delta.z };
  } else if (op.routeId === "basin") {
    const move = moveHull(world, origin, { x: next.x - origin.x, y: next.y - origin.y, z: next.z - origin.z }, BOBBIN_COLLIDER);
    if (move.hitSolid || move.hitBoundary || distance(move.position, next) > 0.001) {
      s.recovery.operation = null;
      s.feedback = "Bobbin's local tether path is blocked. The visited hull, cargo and rescue stock are unchanged.";
      return { type: "notice", message: s.feedback, error: true };
    }
    op.position = move.position;
  } else op.position = next;
  if (d <= speed * DT) {
    if (op.phase === "approach") {
      if (op.waypoint === RECOVERY_ROUTES[op.routeId].attachmentIndex) {
        op.phase = "ready";
        s.feedback = RECOVERY_NOTICES.ready;
        return { type: "notice", message: s.feedback };
      } else op.waypoint++;
    } else if (op.waypoint === 0) {
      s.recovery.losses.find((l) => l.vehicleId === v.id)!.position = {
        ...v.pose.position,
      };
      s.recovery.operation = null;
      s.metrics.rescues++;
      s.feedback = RECOVERY_NOTICES.completed;
      return { type: "notice", message: s.feedback };
    } else op.waypoint--;
  }
  return null;
}
