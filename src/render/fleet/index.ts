import type { Mesh, Scene, ShaderMaterial } from "@babylonjs/core";
import type { GameState, VehicleState } from "../../sim/types.js";
import type { GeometryCache } from "../geometryCache.js";
import type { LabelMaterials } from "../landmarks.js";
import type { ContactPose, S3HullId } from "../../content/fleet/hulls.js";
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

/** Presentation pose. Every field is optional and an omitted field keeps the
 * art's current value, so independent owners can reconcile different fields.
 * Nothing here is saved or read back by the simulation. */
export interface FleetPose {
  /** Spindle: 0 outriggers deployed, 1 stowed for a berth. */
  readonly fold?: number;
  /** Spindle: 0 ramp closed, 1 lowered. */
  readonly ramp?: number;
  /** Spindle: the dry cargo stack (hold not empty). */
  readonly cargo?: boolean;
  /** Pilot fittings visible (the player controls this hull). */
  readonly cockpit?: boolean;
  /** Hearthline: socket ids whose occupants are shown; all others hidden. */
  readonly occupied?: readonly string[];
}

export function setFleetPose(mesh: Mesh, hull: S3HullId, id: string, pose: FleetPose): void {
  if (pose.cockpit !== undefined)
    for (const c of mesh.getChildMeshes(true)) if (c.name === `${id}.cockpit`) c.setEnabled(pose.cockpit);
  if (hull === "spindle") setSpindlePose(mesh, id, {
    ...(pose.fold !== undefined ? { fold: pose.fold } : {}),
    ...(pose.ramp !== undefined ? { ramp: pose.ramp } : {}),
    ...(pose.cargo !== undefined ? { cargo: pose.cargo } : {}),
  });
  if (hull === "hearthline" && pose.occupied !== undefined) setHearthlineSockets(mesh, id, pose.occupied);
}

/** The contact pose matching what the art currently shows (Spindle's fold,
 * ramp and cargo), for contactParts. Other hulls have no posed parts. */
export function fleetContactPose(mesh: Mesh): ContactPose {
  const p = (mesh.metadata as { spindle?: { fold: number; ramp: number; cargo: boolean } } | null)?.spindle;
  return p ? { fold: p.fold, ramp: p.ramp, cargoLoaded: p.cargo } : {};
}

/** Per-frame reconcile from state: cockpit while piloted, gauges, Spindle
 * folded while berthed and its cargo stack while the hold is loaded. Never
 * mutates state. Spindle's ramp has no state yet and is left as set.
 * Hearthline occupancy is an explicit input owned by the caller (the carrier's
 * persisted socket fields once composed, see docs/build/streams/S3.md): pass
 * the occupied socket ids to set them; omit it to keep what is shown. */
export function updateFleetHullArt(mesh: Mesh, state: GameState | null, v: VehicleState, occupied?: readonly string[]): void {
  const hull = v.hull as S3HullId;
  setFleetPose(mesh, hull, v.id, {
    cockpit: state?.player.controlledVehicleId === v.id,
    ...(hull === "spindle" ? { fold: v.berth ? 1 : 0,
      cargo: !!state?.inventory.items.some((i) => i.containerId === v.cargoId && i.quantity > 0) } : {}),
    ...(occupied !== undefined ? { occupied } : {}),
  });
  for (const c of mesh.getChildMeshes(true)) {
    if (c.name !== `${v.id}.cockpit`) continue;
    for (const g of c.getChildMeshes(true))
      if (g.name === `${v.id}.instrument.charge`) g.scaling.x = Math.max(0, Math.min(1, v.charge / 100));
      else if (g.name === `${v.id}.instrument.health`) g.scaling.x = Math.max(0, Math.min(1, v.health / 100));
  }
}
