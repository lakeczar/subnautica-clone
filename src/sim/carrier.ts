import { HULLS } from "../content/registry.js";
import type { GameState, Vec3, VehicleState, WorldQueries } from "./types.js";
import { distance } from "./inventory.js";
import { createGame, makeVehicle } from "./state.js";
import { completeOpening } from "./progression.js";
export const BERTH_LOCAL: readonly Vec3[] = [
  { x: -3, y: 1, z: 1 },
  { x: 3, y: 1, z: 1 },
];
export const LAUNCH_LOCAL = { x: 0, y: -3, z: -17 };
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
    supportedDock: true,
    transaction: null,
    sequence: 0,
    completed: [],
    launchBlocked: false,
  };
  for (const v of s.fleet.vehicles)
    s.inventory.containers.push({
      id: v.cargoId,
      kind: "vehicle",
      capacity:
        v.hull === "hearthline"
          ? 256
          : v.hull === "spindle"
            ? 96
            : v.hull === "creel"
              ? 64
              : 32,
      ownerId: v.id,
    });
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
    position: { x: 0, y: 4, z: -6 },
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
    const exit = localToWorld({ x: 10, y: 3, z: 9 }, h);
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
      distance(s.player.pose.position, localToWorld({ x: 10, y: 3, z: 9 }, h)) >
        5
    )
      return "Approach the exterior vestibule while station keeping is engaged.";
    s.player.controlledVehicleId = null;
    s.player.interiorId = h.id;
    s.player.interiorPose = {
      frame: "carrier-local",
      position: { x: 4, y: 4, z: 9 },
    };
    s.player.pose.position = localToWorld(s.player.interiorPose.position, h);
    s.player.mode = "interior";
    return null;
  }
  if (action === "station-keep") {
    h.velocity = { x: 0, y: 0, z: 0 };
    dock.stationKeeping = true;
    s.feedback =
      "Station keeping engaged. Interior and launch controls available.";
    return null;
  }
  if (action === "helm") {
    if (dock.transaction)
      return "Close the launch lock before taking the helm.";
    s.player.mode = "piloting";
    s.player.controlledVehicleId = h.id;
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
    s.player.controlledVehicleId = null;
    s.player.interiorId = h.id;
    s.player.interiorPose = {
      frame: "carrier-local",
      position: { x: 0, y: 4, z: -6 },
    };
    s.player.pose.position = localToWorld(s.player.interiorPose.position, h);
    s.player.mode = "interior";
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
      !dock.supportedDock ||
      s.fleet.vehicles.some((v) => v.berth?.carrierId === h.id)
    )
      return "Reconfiguration requires an empty carrier at a supported dock.";
    dock.configuration =
      dock.configuration === "compact" ? "medium" : "compact";
    s.feedback = `Empty supported berth reconfigured to ${dock.configuration}.`;
    return null;
  }
  const v = s.fleet.vehicles.find((v) => v.id === vehicleId);
  if (!v || v.id === h.id) return "Select a craft at this berth.";
  if (action === "launch") {
    if (v.berth?.carrierId !== h.id) return "This craft is already detached.";
    if (v.hull === "spindle" && h.pose.position.y < -1)
      return "Spindle is dry and isolated. Launch it only at the surface.";
    if (launchRefusal(s, v, world)) return launchRefusal(s, v, world);
    dock.transaction = {
      id: `berth_${++dock.sequence}`,
      type: "launch",
      vehicleId: v.id,
      slot: v.berth.slot,
      phase: "prepared",
      ticks: 0,
    };
  } else if (action === "capture") {
    if (
      v.berth ||
      v.disabled ||
      distance(v.pose.position, localToWorld(LAUNCH_LOCAL, h)) > 13 ||
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
  const h = carrierHull(s)!;
  const exit = localToWorld(LAUNCH_LOCAL, h);
  if (
    s.fleet.docking?.launchBlocked ||
    !world.clearance(exit, {
      radius: v.hull === "creel" ? 3 : 2.2,
      height: 2.8,
    })
  )
    return "Launch volume obstructed. Docked identity, cargo, charge and damage are unchanged.";
  if (
    s.fleet.vehicles.some(
      (a) =>
        a.id !== v.id &&
        a.id !== h.id &&
        !a.berth &&
        distance(a.pose.position, exit) < 6,
    )
  )
    return "Another craft occupies the launch corridor.";
  return null;
}
export function updateBerth(s: GameState, world: WorldQueries): void {
  const dock = s.fleet.docking,
    h = carrierHull(s);
  if (!dock || !h) return;
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
  if (!dock.stationKeeping) {
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
    v.pose.position = localToWorld(LAUNCH_LOCAL, h);
    v.pose.yaw = h.pose.yaw;
    v.pose.pitch = 0;
  } else {
    if (v.berth) {
      dock.transaction = null;
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
  }
  dock.completed.push(t.id);
  if (dock.completed.length > 64) dock.completed.shift();
  dock.transaction = null;
  s.feedback = `${v.hull} ${t.type === "launch" ? "detached exactly once" : "captured in an isolated dry berth"}. Other berths remain sealed.`;
}
