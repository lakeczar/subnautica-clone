import { HUSH_HANDLING } from "../content/campaign/fleet.js";
import { HULL_COLLIDERS, HULL_HOLD_CU, HULLS, ITEMS, MODULES, SOURCES, isMountKind } from "../content/registry.js";
import type { MountKind, SourceId } from "../content/registry.js";
import type { GameState, ItemStack, Vec3, VehicleState, WorldQueries } from "./types.js";
import { cabinLockerId, distance, equipped, hasRoom, removeQuantity } from "./inventory.js";
import { personalDepth, personalLimit } from "./capabilities.js";
import { createWorldQueries, hullClearance, type Solid } from "./world.js";

/** Current hull rating: the initial HULLS value or a paid refit stored on the hull. */
export const hullRating = (v: Readonly<VehicleState>): number => v.rating;
export const hullDepth = (v: Readonly<VehicleState>): number => Math.max(0, -(v.pose.position.y + 0.5));

/** The one fitted major-mount package on a Creel, if any. */
export function fittedMount(s: Readonly<GameState>, v: Readonly<VehicleState>): (ItemStack & { kind: MountKind }) | null {
  for (const id of v.modules) {
    const item = s.inventory.items.find((i) => i.id === id);
    if (item && isMountKind(item.kind) && item.fitted === "mount") return item as ItemStack & { kind: MountKind };
  }
  return null;
}
/** Hold size implied by hull and fitted mount; the saved container must equal it. */
export function holdCapacity(s: Readonly<GameState>, v: Readonly<VehicleState>): number {
  const mount = v.hull === "creel" ? fittedMount(s, v) : null;
  return mount ? MODULES[mount.kind].holdCu : HULL_HOLD_CU[v.hull];
}
export function fittedCabin(s: Readonly<GameState>, v: Readonly<VehicleState>): (ItemStack & { kind: "creel_cabin" }) | null {
  const mount = fittedMount(s, v);
  return mount?.kind === "creel_cabin" ? mount as ItemStack & { kind: "creel_cabin" } : null;
}

// ---------------------------------------------------------------- handling
export interface HullHandling {
  quiet: number; cruise: number; boost: number;
  /** Fraction of the velocity gap closed per second. */
  response: number;
  /** Maximum heading change, rad/s. Infinity keeps the scout's free steering. */
  turnRate: number;
  /** Battery percent per second at cruise. */
  drain: number;
  loudness: { quiet: number; cruise: number; boost: number };
}
/** Creel: a slower, louder workboat with deliberate turning. Dart values are the
 * accepted M1 constants; its acoustic trim still overrides quiet/boost speed. */
export const CREEL_HANDLING: HullHandling = {
  quiet: 2.5, cruise: 5, boost: 6.5, response: 1.7, turnRate: 1.1, drain: 100 / 700,
  loudness: { quiet: 0.12, cruise: 0.62, boost: 1 },
};
/** C3 proposal, untested tuning: the Mantle is a slow, precise deep service craft
 * (S9: station keeping in the saddle downwelling). Hush uses S9's HUSH_HANDLING. */
export const MANTLE_HANDLING: HullHandling = {
  quiet: 2, cruise: 4, boost: 5, response: 2.2, turnRate: 1.3, drain: 100 / 800,
  loudness: { quiet: 0.1, cruise: 0.5, boost: 0.85 },
};
/** Handled hulls; the Dart, Spindle and carrier keep their own rules in step.ts. */
export function hullHandling(hull: string): HullHandling | null {
  return hull === "creel" ? CREEL_HANDLING : hull === "hush" ? HUSH_HANDLING : hull === "mantle" ? MANTLE_HANDLING : null;
}

// ---------------------------------------------------------------- cabin
/** Hull-local metres, keel reference, -Z is the bow. The fitted cabin is a fixed
 * dry room on the aft mount deck; art, walking solids and fixtures share these. */
export const CREEL_CABIN = {
  outer: { min: { x: -1.72, y: 1.38, z: -0.55 }, max: { x: 1.72, y: 3.5, z: 3.2 } },
  floorY: 1.45,
  walk: { minX: -1.26, maxX: 1.26, minZ: -0.1, maxZ: 2.75 },
  fittings: [
    { id: "cabin.bunk", min: { x: 0.75, y: 1.45, z: 0.35 }, max: { x: 1.6, y: 1.95, z: 2.75 } },
    { id: "cabin.galley", min: { x: -1.6, y: 1.45, z: -0.5 }, max: { x: -1.1, y: 2.35, z: 0.85 } },
    { id: "cabin.locker", min: { x: -1.6, y: 1.45, z: 2.0 }, max: { x: -1.1, y: 3.0, z: 3.14 } },
  ],
  fixtures: {
    bunk: { x: 1.15, y: 2.05, z: 1.55 },
    cooker: { x: -1.3, y: 2.45, z: 0.2 },
    locker: { x: -1.3, y: 2.3, z: 2.55 },
    helm: { x: 0, y: 2.25, z: -0.45 },
    hatch: { x: 0, y: 2.2, z: 3.08 },
  },
  helmEntry: { x: -0.35, z: 0.3 },
  hatchEntry: { x: -0.35, z: 2.45 },
  /** Exterior hatch face (diver entry target) and exit point in the water. */
  hatchOutside: { x: 0, y: 2.0, z: 3.65 },
  hatchExit: { x: 0, y: 1.2, z: 4.9 },
} as const;
/** Boarding/interaction datum on the pilot compartment's side hatch, on the same
 * (+x) side as the exit point so a diver can always reboard where they left. */
export const CREEL_BOARDING = { x: 1.2, y: 1.9, z: -1.7 } as const;
/** Raised pilot compartment view datum; never a collider or saved pose. */
export const CREEL_SEAT = { x: 0, y: 2.22, z: -1.8 } as const;
/** Tool-arm reach datum at the guarded bow; the art stays inside the berth envelope. */
export const CREEL_ARM = { x: 0, y: 0.7, z: -3.3, reach: 7.5 } as const;
export const ARM_LIFT_SECONDS = 6;
/** Battery percent per arm lift. C3 (P1 playthrough): at 4% a full Basin frame
 * haul (10 lifts plus the return loop) came home at 7%; at 1.5% it keeps the
 * 25% return margin EXPEDITION_INTEGRATION asks for. */
export const ARM_CHARGE = 1.5;
export const DIVER_LIFT_SECONDS = 10;

export function hullToWorld(local: Readonly<Vec3>, v: Readonly<VehicleState>): Vec3 {
  const { position: p, yaw } = v.pose;
  return { x: p.x + Math.cos(yaw) * local.x - Math.sin(yaw) * local.z, y: p.y + local.y,
    z: p.z + Math.sin(yaw) * local.x + Math.cos(yaw) * local.z };
}
export const cabinHull = (s: Readonly<GameState>): VehicleState | undefined =>
  s.player.interiorPose?.frame === "hull-local" ? s.fleet.vehicles.find((v) => v.id === s.player.interiorId) : undefined;
export function cabinLocalSolids(): Solid[] {
  const { outer: o } = CREEL_CABIN, t = 0.06;
  return [
    ...CREEL_CABIN.fittings.map((f) => ({ id: f.id, min: { ...f.min }, max: { ...f.max } })),
    { id: "cabin.wall.port", min: { x: o.min.x, y: o.min.y, z: o.min.z }, max: { x: o.min.x + t, y: o.max.y, z: o.max.z } },
    { id: "cabin.wall.starboard", min: { x: o.max.x - t, y: o.min.y, z: o.min.z }, max: { x: o.max.x, y: o.max.y, z: o.max.z } },
    { id: "cabin.wall.fore", min: { x: o.min.x, y: o.min.y, z: o.min.z }, max: { x: o.max.x, y: o.max.y, z: o.min.z + t } },
    { id: "cabin.wall.aft", min: { x: o.min.x, y: o.min.y, z: o.max.z - t }, max: { x: o.max.x, y: o.max.y, z: o.max.z } },
  ];
}
export const cabinWorld = (): WorldQueries => createWorldQueries(cabinLocalSolids(), () => CREEL_CABIN.floorY - 0.02);
/** Powered, intact cabin: breathable refuge with healing. */
export const cabinPowered = (v: Readonly<VehicleState>): boolean => !v.disabled && v.charge > 0 && v.health > 0;
/** Within reach of a cabin fixture, in hull-local metres from the walking datum. */
export function nearFixture(s: Readonly<GameState>, fixture: keyof typeof CREEL_CABIN.fixtures, reach = 1.7): boolean {
  const local = s.player.interiorPose?.position, f = CREEL_CABIN.fixtures[fixture];
  return !!local && cabinHull(s) !== undefined && Math.hypot(local.x - f.x, local.z - f.z) < reach;
}

function placeInCabin(s: GameState, v: VehicleState, at: { x: number; z: number }, faceAft: boolean): void {
  const local = { x: at.x, y: CREEL_CABIN.floorY, z: at.z };
  s.player.controlledVehicleId = null;
  s.player.interiorId = v.id;
  s.player.interiorPose = { frame: "hull-local", position: local };
  s.player.mode = "interior";
  s.player.pose.position = hullToWorld(local, v);
  s.player.pose.yaw = ((v.pose.yaw + (faceAft ? Math.PI : 0)) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  s.player.pose.pitch = -0.05;
  s.player.velocity = { x: 0, y: 0, z: 0 };
}
/** Station is held only after the hull is effectively stopped. */
const stationary = (v: Readonly<VehicleState>): boolean => Math.hypot(v.velocity.x, v.velocity.y, v.velocity.z) < 0.6;

export function cabinEnterRefusal(s: Readonly<GameState>): string | null {
  const v = s.fleet.vehicles.find((v) => v.id === s.player.controlledVehicleId);
  if (!v || v.hull !== "creel") return "Pilot a Creel with its refuge cabin fitted.";
  if (!fittedCabin(s, v)) return "No cabin is fitted to this Creel's mount. The pilot compartment stays sealed; fit the cabin at a supported mooring.";
  if (!stationary(v)) return "Slow to a stop before leaving the helm. Station keeping holds only a stationary hull.";
  return null;
}
export function enterCabinFromHelm(s: GameState): string | null {
  const no = cabinEnterRefusal(s);
  if (no) return no;
  const v = s.fleet.vehicles.find((v) => v.id === s.player.controlledVehicleId)!;
  v.velocity = { x: 0, y: 0, z: 0 };
  placeInCabin(s, v, CREEL_CABIN.helmEntry, true);
  s.feedback = cabinPowered(v)
    ? "Station held · Creel cabin: dry, powered air. Bunk, cooker and locker aft."
    : `Station held · cabin on emergency air · ${Math.ceil(v.emergencyAir)} s. Restore power or leave by the hatch.`;
  return null;
}
export function hatchEntryRefusal(s: Readonly<GameState>, vehicleId: string): string | null {
  const v = s.fleet.vehicles.find((v) => v.id === vehicleId);
  if (!v || v.hull !== "creel" || v.berth) return "Approach a Creel cabin hatch.";
  if (s.player.controlledVehicleId || s.player.interiorId) return "Leave the current hull first.";
  if (!fittedCabin(s, v)) return "This Creel has no cabin fitted.";
  if (distance(s.player.pose.position, hullToWorld(CREEL_CABIN.hatchOutside, v)) > 4)
    return "Swim to the aft cabin hatch.";
  if (!stationary(v)) return "The hull is still moving.";
  return null;
}
export function enterCabinFromHatch(s: GameState, vehicleId: string): string | null {
  const no = hatchEntryRefusal(s, vehicleId);
  if (no) return no;
  const v = s.fleet.vehicles.find((a) => a.id === vehicleId)!;
  placeInCabin(s, v, CREEL_CABIN.hatchEntry, false);
  s.feedback = cabinPowered(v) ? "Cabin hatch sealed · dry, powered air." :
    `Cabin hatch sealed · emergency air ${Math.ceil(v.emergencyAir)} s; the hull is ${v.disabled ? "disabled" : "unpowered"}.`;
  return null;
}
export function takeHelmFromCabin(s: GameState): string | null {
  const v = cabinHull(s);
  if (!v) return "You are not in a Creel cabin.";
  if (!nearFixture(s, "helm", 1.4)) return "Walk forward to the helm door.";
  if (v.disabled || v.charge <= 0) return "Helm unavailable: the hull is disabled or out of power. Insert a charged reserve cell from the hold, or leave by the hatch.";
  s.player.interiorId = null;
  s.player.interiorPose = null;
  s.player.controlledVehicleId = v.id;
  s.player.mode = "piloting";
  s.player.pose.position = { ...v.pose.position };
  s.player.pose.yaw = v.pose.yaw;
  s.player.pose.pitch = 0;
  s.player.velocity = { x: 0, y: 0, z: 0 };
  s.feedback = "Creel helm · W/S thrust · steady turns · E tool arms on a salvage host ahead.";
  return null;
}
export function hatchExitBlock(s: Readonly<GameState>, world: WorldQueries): string | null {
  const v = cabinHull(s);
  if (!v) return "You are not in a Creel cabin.";
  const exit = hullToWorld(CREEL_CABIN.hatchExit, v), depth = personalDepth(exit);
  if (depth > personalLimit(s))
    return `Hatch exposure ${depth.toFixed(0)} m exceeds your ${personalLimit(s)} m personal suit. The ${hullRating(v)} m hull does not protect a diver outside.`;
  if (!world.clearance(exit, { radius: 0.34, height: 0.95 }))
    return "The aft hatch faces an obstruction. Take the helm and move to clear water first.";
  return null;
}
export function leaveByHatch(s: GameState, world: WorldQueries): string | null {
  const no = hatchExitBlock(s, world);
  if (no) return no;
  const v = cabinHull(s)!;
  s.player.pose.position = hullToWorld(CREEL_CABIN.hatchExit, v);
  s.player.pose.yaw = v.pose.yaw;
  s.player.interiorId = null;
  s.player.interiorPose = null;
  s.player.mode = "swimming";
  s.player.velocity = { x: 0, y: 0, z: 0 };
  s.feedback = "Aft hatch · your personal oxygen and pressure protection now apply.";
  return null;
}
/** Every container whose meals the cabin cooker can reach. */
function cabinFoodContainers(s: Readonly<GameState>, v: Readonly<VehicleState>): string[] {
  const cabin = fittedCabin(s, v);
  return ["diver", v.cargoId, ...(cabin ? [cabinLockerId(cabin.id)] : [])];
}
export function cookRefusal(s: Readonly<GameState>): string | null {
  const v = cabinHull(s);
  if (!v) return "Use the cooker in a Creel cabin.";
  if (!nearFixture(s, "cooker", 1.5)) return "Step to the galley cooker.";
  if (!cabinPowered(v)) return "The cooker needs hull power. A cold meal can still be eaten with F.";
  if (s.player.vitals.food >= 99 && s.player.graceSeconds >= 179) return "Already fed. Meal retained.";
  const ids = cabinFoodContainers(s, v);
  if (!s.inventory.items.some((i) => i.kind === "meal" && ids.includes(i.containerId)))
    return "No meal in the cabin locker, hold or your pack. Gather staples, or stock the locker before departure.";
  return null;
}
/** One hot portion: more food than a cold meal, and a fresh three-minute grace. */
export function cook(s: GameState): string | null {
  const no = cookRefusal(s);
  if (no) return no;
  const v = cabinHull(s)!, ids = cabinFoodContainers(s, v);
  const meal = [...s.inventory.items].filter((i) => i.kind === "meal" && ids.includes(i.containerId))
    .sort((a, b) => ids.indexOf(b.containerId) - ids.indexOf(a.containerId))[0]!;
  removeQuantity(s, meal, 1);
  s.player.vitals.food = Math.min(100, s.player.vitals.food + 85);
  s.player.starvationSeconds = 0;
  s.player.graceSeconds = 180;
  s.feedback = `Hot meal cooked · food ${Math.round(s.player.vitals.food)} · three minutes before hunger resumes.`;
  return null;
}

// ---------------------------------------------------------------- mobile refuge
export type RefugeBlockCode = "missing" | "berthed" | "towing" | "disabled" | "unpowered" | "depth" | "threat" | "obstructed";
export interface RefugeBlock { code: RefugeBlockCode; message: string }
const REFUGE_BLOCKS: Record<RefugeBlockCode, string> = {
  missing: "its cabin is no longer fitted",
  berthed: "it is berthed",
  towing: "it is under tow",
  disabled: "the hull is disabled",
  unpowered: "it has no power for air",
  depth: "it is beyond its hull rating",
  threat: "a hunter is at the hull",
  obstructed: "its hull or hatch is obstructed",
};
/** Safety of the registered cabin as a recovery destination, checked at the moment
 * of use. Never grants air by itself; a refused cabin falls back to the pod. */
export function mobileRefugeBlock(s: Readonly<GameState>, world: WorldQueries = createWorldQueries()): RefugeBlock | null {
  const r = s.player.mobileRefuge;
  if (!r) return null;
  const block = (code: RefugeBlockCode): RefugeBlock => ({ code, message: REFUGE_BLOCKS[code] });
  const v = s.fleet.vehicles.find((a) => a.id === r.vehicleId);
  if (!v || v.hull !== "creel" || fittedCabin(s, v)?.id !== r.moduleId) return block("missing");
  if (v.berth) return block("berthed");
  if (s.recovery.operation?.vehicleId === v.id) return block("towing");
  if (v.disabled || v.health <= 0) return block("disabled");
  if (v.charge <= 0) return block("unpowered");
  if (hullDepth(v) > hullRating(v)) return block("depth");
  const t = s.world.threat;
  if (t.mode !== "idle" && t.mode !== "disengage" && distance(t.position, v.pose.position) < 30) return block("threat");
  if (!hullClearance(world, v.pose.position, HULL_COLLIDERS.creel) ||
      !world.clearance(hullToWorld(CREEL_CABIN.hatchExit, v), { radius: 0.34, height: 0.95 })) return block("obstructed");
  return null;
}
export function registerRefugeRefusal(s: Readonly<GameState>, vehicleId: string | null): string | null {
  const v = cabinHull(s);
  if (!v || !nearFixture(s, "bunk", 1.6)) return "Register at the bunk inside a fitted Creel cabin.";
  if (vehicleId === null) return s.player.mobileRefuge?.vehicleId === v.id ? null : "This cabin is not your registered refuge.";
  if (vehicleId !== v.id) return "Register the cabin you are in.";
  if (s.player.mobileRefuge?.vehicleId === v.id && s.player.mobileRefuge.moduleId === fittedCabin(s, v)?.id)
    return "Already your registered refuge.";
  if (v.disabled) return "A disabled hull cannot be registered. Patch it first.";
  return null;
}
export function registerRefuge(s: GameState, vehicleId: string | null): string | null {
  const no = registerRefugeRefusal(s, vehicleId);
  if (no) return no;
  const v = cabinHull(s)!;
  if (vehicleId === null) {
    s.player.mobileRefuge = null;
    s.feedback = "Cabin registration cleared · incapacity returns you to your last fixed refuge.";
  } else {
    s.player.mobileRefuge = { vehicleId: v.id, moduleId: fittedCabin(s, v)!.id };
    s.feedback = "Creel cabin registered as your refuge. If it is unpowered, disabled, obstructed or threatened when needed, you recover at the home pod.";
  }
  return null;
}

// ---------------------------------------------------------------- tool arms
/** Loose maintenance salvage and tagged frames are the arms' hosts; living
 * sources and mineral fins stay hand work. */
export const armHost = (id: SourceId): boolean => SOURCES[id].region === "silt_basin" &&
  (SOURCES[id].item === "tagged_frame" || SOURCES[id].item === "structural_alloy");
export type ArmTarget = { sourceId: SourceId; refusal: string | null };
/** Nearest stocked arm host in reach of the bow, or the reason a visible host
 * cannot be worked. Pure. */
export function armTarget(s: Readonly<GameState>): ArmTarget | null {
  const v = s.fleet.vehicles.find((a) => a.id === s.player.controlledVehicleId);
  if (!v || v.hull !== "creel") return null;
  const arm = hullToWorld(CREEL_ARM, v);
  const near = (Object.keys(SOURCES) as SourceId[]).filter(armHost)
    .map((id) => ({ id, d: distance(arm, SOURCES[id].position) }))
    .filter((c) => c.d <= CREEL_ARM.reach).sort((a, b) => a.d - b.d || a.id.localeCompare(b.id));
  const target = near.find((c) => (s.world.resources.find((n) => n.id === c.id)?.stock ?? 0) > 0) ?? near[0];
  if (!target) return null;
  const id = target.id, def = SOURCES[id], node = s.world.resources.find((n) => n.id === id);
  const cu = ITEMS[def.item].cu * Math.min(def.bundle, node?.stock ?? 0);
  const refusal = !node || node.stock <= 0 ? `${def.label} · empty.`
    : v.disabled || v.charge < ARM_CHARGE ? `Tool arms need ${ARM_CHARGE}% hull power.`
    : !hasRoom(s as GameState, v.cargoId, cu) ? `Hold full · ${cu} CU needed for this lift. Store cargo or fit the rack.`
    : null;
  return { sourceId: id, refusal };
}
/** A stocked arm host near the piloted Creel but outside arm reach: the bow must
 * turn or close in. Presentation only; never starts work. */
export function armNearby(s: Readonly<GameState>, radius = 16): SourceId | null {
  const v = s.fleet.vehicles.find((a) => a.id === s.player.controlledVehicleId);
  if (!v || v.hull !== "creel" || armTarget(s)) return null;
  return (Object.keys(SOURCES) as SourceId[]).filter(armHost)
    .filter((id) => (s.world.resources.find((n) => n.id === id)?.stock ?? 0) > 0)
    .map((id) => ({ id, d: distance(v.pose.position, SOURCES[id].position) }))
    .filter((c) => c.d <= radius).sort((a, b) => a.d - b.d || a.id.localeCompare(b.id))[0]?.id ?? null;
}
export function equippedForLift(s: Readonly<GameState>): boolean {
  return equipped(s as GameState, "essential_tools");
}
export const mountLabel = (kind: MountKind): string => kind === "creel_cabin" ? "Refuge cabin" : "Cargo rack";
export const hullLabel = (v: Readonly<VehicleState>): string => HULLS[v.hull].label;
