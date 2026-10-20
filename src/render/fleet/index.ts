import type { Mesh, Scene, ShaderMaterial } from "@babylonjs/core";
import type { GameState, VehicleState } from "../../sim/types.js";
import type { GeometryCache } from "../geometryCache.js";
import type { LabelMaterials } from "../landmarks.js";
import type { S3HullId } from "../../content/fleet/hulls.js";
import { hushArt } from "./hush.js";
import { setSpindlePose, spindleArt } from "./spindle.js";
import { mantleArt } from "./mantle.js";
import { hearthlineArt, setHearthlineSockets } from "./hearthline.js";

export { hearthlineShellArt } from "./hearthline.js";

/** S3 hull art entry point, parallel to B1's creelArt/updateCreelArt. The
 * returned root is hull-local (keel datum, -Z bow); the caller owns its pose.
 * Hearthline's berth configuration is a separate shell (hearthlineShellArt). */
export function fleetHullArt(scene: Scene, cel: ShaderMaterial, glass: ShaderMaterial, id: string, hull: S3HullId,
  labels?: LabelMaterials, cache?: GeometryCache): Mesh {
  switch (hull) {
    case "hush": return hushArt(scene, cel, glass, id, cache);
    case "spindle": return spindleArt(scene, cel, glass, id, cache);
    case "mantle": return mantleArt(scene, cel, glass, id, cache);
    case "hearthline": return hearthlineArt(scene, cel, glass, id, labels, cache);
  }
}

/** Presentation pose. Nothing here is saved or read back by the simulation. */
export interface FleetPose {
  /** Spindle: 0 outriggers deployed, 1 stowed for a berth. */
  readonly fold?: number;
  /** Spindle: 0 ramp closed, 1 lowered. */
  readonly ramp?: number;
  /** Pilot fittings visible (the player controls this hull). */
  readonly cockpit?: boolean;
  /** Hearthline: socket ids whose occupants are shown. */
  readonly occupied?: readonly string[];
}

export function setFleetPose(mesh: Mesh, hull: S3HullId, id: string, pose: FleetPose): void {
  for (const c of mesh.getChildMeshes(true)) if (c.name === `${id}.cockpit`) c.setEnabled(!!pose.cockpit);
  if (hull === "spindle") setSpindlePose(mesh, id, { fold: pose.fold ?? 0, ramp: pose.ramp ?? 0 });
  if (hull === "hearthline") setHearthlineSockets(mesh, id, pose.occupied ?? []);
}

/** Reconcile from state: cockpit when controlled, gauges, Spindle folded while
 * berthed. Never mutates state. Hearthline sockets wait for the coordinator's
 * persisted socket fields (docs/build/streams/S3.md). */
export function updateFleetHullArt(mesh: Mesh, state: GameState | null, v: VehicleState): void {
  const hull = v.hull as S3HullId;
  setFleetPose(mesh, hull, v.id, { cockpit: state?.player.controlledVehicleId === v.id, fold: v.berth ? 1 : 0, ramp: 0 });
  for (const c of mesh.getChildMeshes(true)) {
    if (c.name !== `${v.id}.cockpit`) continue;
    for (const g of c.getChildMeshes(true))
      if (g.name === `${v.id}.instrument.charge`) g.scaling.x = Math.max(0, Math.min(1, v.charge / 100));
      else if (g.name === `${v.id}.instrument.health`) g.scaling.x = Math.max(0, Math.min(1, v.health / 100));
  }
}
