/** C4: SYS-1's upgrades composed into the game. One place answers "what is this
 * hull fitted with and what does that make it": the craft profile that step,
 * survival, ecology and the panels read; the FitTarget the install and remove
 * previews need (dock, depth, hazards, the dry-berth launch exterior); and the
 * per-step upgrade work (flares, ballast, overdrive, solar, vents, bio-cells,
 * the Spindle's deck charging and the carrier's mooring anchor).
 *
 * Fitted upgrades are item instances listed in `VehicleState.modules`. Socket
 * modules stay ordinary hold items (the M1 trim contract); every other slot
 * keeps its item in the hull's own hold with `fitted: "mount"`, outside cargo. */
import { HAZARD_FIELDS, type HazardFieldId } from "../content/ecology/hazards.js";
import { HULL_HOLD_CU, HULLS, ITEMS, SOURCES } from "../content/registry.js";
import type { ItemKind, SourceId } from "../content/registry.js";
import { UPGRADES, upgradeId } from "../content/upgrades/catalogue.js";
import type { DockKind, UpgradeId } from "../content/upgrades/catalogue.js";
import { LOST_SITES, WORLD_LOST_SITES } from "../content/systems/decodes.js";
import { isSeed, SEEDS } from "../content/systems/cultivation.js";
import { SYS2_SOURCES } from "../content/systems/items.js";
import { fieldLevel, protectionFor, sampleHazards, shapeWeight } from "./ecology/hazards.js";
import type { Protection } from "./ecology/types.js";
import { launchPoint } from "./carrier.js";
import { FIXED_SECONDS as DT } from "./clock.js";
import { addItem, distance, hasRoom, supportedServiceSite, usedCapacity } from "./inventory.js";
import { airLineSupply, type AirLineCraft, type AirLineSupply } from "./power/airline.js";
import { bioFeedStep, insertBioCellRefusal, startBioFeed, totalRate, trickleRates } from "./power/charging.js";
import { craftProfile, motion } from "./upgrades/effects.js";
import type { CraftProfile, HeatContribution } from "./upgrades/effects.js";
import { installPreview, removePreview, slotOf } from "./upgrades/fitting.js";
import type { FitPreview, FitTarget, Fitted, Hazards } from "./upgrades/fitting.js";
import {
  anchorRefusal, ballastRefusal, blowBallast, fireFlare, flareLight, flarePosition, LISTENING_ARRAY, overdriveRefusal,
  rearm, sampleRefusal, startOverdrive,
} from "./upgrades/tools.js";
import type { GameState, ItemStack, Vec3, VehicleState, WorldQueries } from "./types.js";

/** The upgrade kinds fitted to a hull, in fitting order. */
export function fittedKinds(s: Readonly<GameState>, v: Readonly<VehicleState>): UpgradeId[] {
  const out: UpgradeId[] = [];
  for (const id of v.modules) {
    const kind = s.inventory.items.find((i) => i.id === id)?.kind;
    if (kind && upgradeId(kind)) out.push(kind);
  }
  return out;
}
export const fittedList = (s: Readonly<GameState>, v: Readonly<VehicleState>): Fitted[] =>
  v.modules.flatMap((id) => {
    const kind = s.inventory.items.find((i) => i.id === id)?.kind;
    return kind && upgradeId(kind) ? [{ itemId: id, kind }] : [];
  });
/** What this hull is now: SYS-1's profile over its paid rating and fitted kinds. */
export function vehicleProfile(s: Readonly<GameState>, v: Readonly<VehicleState>): CraftProfile {
  return craftProfile(v.hull, v.rating, fittedKinds(s, v));
}
/** Hold size: the hull's base hold plus what its fittings add or take. */
export const vehicleHoldCapacity = (s: Readonly<GameState>, v: Readonly<VehicleState>): number =>
  HULL_HOLD_CU[v.hull] + vehicleProfile(s, v).holdDeltaCu;
/** The hull's own rating, plating margin included (pressure rules read this). */
export const effectiveRating = (s: Readonly<GameState>, v: Readonly<VehicleState>): number =>
  v.hull === "spindle" ? 0 : vehicleProfile(s, v).rating;

/** S4's hazard fields at a point, as SYS-1's heat contributions: a cycled plume
 * is a core while quiet and a burst while it vents; steady warm water is ambient. */
export function hazardsAt(p: Vec3, tick: number): Hazards {
  const heat: HeatContribution[] = [];
  for (const id of Object.keys(HAZARD_FIELDS) as HazardFieldId[]) {
    const f = HAZARD_FIELDS[id];
    if (f.kind !== "heat") continue;
    const level = shapeWeight(f.shape, f.edge, p) * fieldLevel(id, tick) * f.intensity;
    if (level <= 1e-9) continue;
    const cycled = "cycle" in f;
    heat.push({ level, kind: !cycled ? "ambient" : fieldLevel(id, tick) > ((f as { baseline?: number }).baseline ?? 0) + 1e-9 ? "burst" : "core" });
  }
  return { heat, brine: sampleHazards(p, tick).brine };
}
const NO_HAZARD: Hazards = { heat: [], brine: 0 };
const depthOf = (p: Vec3): number => Math.max(0, -(p.y + 0.5));

/** The supported dock a hull is at, for the fitting rules. */
export function dockOf(s: Readonly<GameState>, v: Readonly<VehicleState>): DockKind | null {
  if (v.berth) return "carrier_berth";
  const carrier = s.fleet.docking;
  if (v.hull === "hearthline")
    return carrier?.vehicleId === v.id && carrier.stationKeeping && carrier.supportedDock ? "carrier_mooring"
      : supportedServiceSite(s as GameState, v as VehicleState) === "stack_yard" ? "yard" : null;
  const site = supportedServiceSite(s as GameState, v as VehicleState);
  if (site === "home_pod") return "home_pod";
  if (site === "island_workshop") return "workshop";
  if (site === "stack_yard") return "yard";
  if (site) return "service_stop";
  if (s.systems.outposts.some((o) => distance(o.position, v.pose.position) < 25)) return "outpost";
  // Another Creel with a service head within its reach changes sockets in the field.
  const head = s.fleet.vehicles.some((o) => o.id !== v.id && o.hull === "creel" && !o.disabled &&
    vehicleProfile(s, o).tools.includes("service_head") && distance(o.pose.position, v.pose.position) <= 8);
  return head ? "service_head" : null;
}
/** The carrier's launch-lock exterior: the point a berthed hull leaves at, the
 * carrier's own `launchPoint` (C4B-05), not the berth inside the hull. */
export const launchLockPosition = (carrier: Readonly<VehicleState>, v: Readonly<VehicleState>): Vec3 =>
  launchPoint(carrier as VehicleState, v as VehicleState);
export function fitTarget(s: Readonly<GameState>, v: Readonly<VehicleState>): FitTarget {
  const carrier = v.berth ? s.fleet.vehicles.find((h) => h.id === v.berth!.carrierId) : undefined;
  const fitted = fittedList(s, v);
  const systemOccupied = v.hull === "hearthline"
    ? s.systems.sockets.filter((e) => e.hostId === `carrier:${v.id}`).length : 0;
  const docking = s.fleet.docking;
  return {
    hull: v.hull, rating: v.rating, fitted, dock: dockOf(s, v),
    depth: depthOf(v.pose.position),
    // SYS-1 R2: the exterior must be the real hazard sample at the launch lock.
    berth: v.berth && carrier ? { carrierDepth: depthOf(carrier.pose.position),
      exterior: hazardsAt(launchLockPosition(carrier, v), s.tick) } : null,
    hazards: v.berth ? NO_HAZARD : hazardsAt(v.pose.position, s.tick),
    hold: { usedCu: usedCapacity(s as GameState, v.cargoId), baseCu: HULL_HOLD_CU[v.hull] },
    ...(v.hull === "hearthline" && docking?.vehicleId === v.id ? { carrier: {
      configuration: docking.configuration, berthsEmpty: !s.fleet.vehicles.some((a) => a.berth), systemOccupied,
    } } : {}),
    inUse: { anchored: v.upgrades.anchored },
  };
}
const fittedItem = (s: GameState, id: string): ItemStack | undefined => s.inventory.items.find((i) => i.id === id);

/** Read-only preview of fitting one upgrade item (the panel shows exactly this). */
export function upgradeInstallPreview(s: GameState, v: VehicleState, item: ItemStack, replace?: string): FitPreview {
  return installPreview(fitTarget(s, v), { itemId: item.id, kind: item.kind as UpgradeId },
    { ...(replace ? { replace } : {}), fromHold: item.containerId === v.cargoId });
}
export function upgradeRemovePreview(s: GameState, v: VehicleState, itemId: string): FitPreview {
  return removePreview(fitTarget(s, v), itemId);
}
/** Apply an accepted preview: the fitted list, each item's slot flag and place,
 * and the hold's new capacity. Everything returns intact to this hold. */
export function applyUpgradePreview(s: GameState, v: VehicleState, p: FitPreview): void {
  if (p.refusal) throw new Error(`refused fit change applied: ${p.refusal}`);
  const after = new Set(p.fittedAfter.map((f) => f.itemId));
  for (const id of v.modules) if (!after.has(id)) {
    const item = fittedItem(s, id);
    if (item) { item.fitted = null; item.containerId = v.cargoId; }
  }
  for (const f of p.fittedAfter) {
    const item = fittedItem(s, f.itemId)!;
    item.containerId = v.cargoId;
    item.fitted = slotOf(v.hull, f.kind) === "socket" ? null : "mount";
  }
  v.modules = p.fittedAfter.map((f) => f.itemId);
  s.inventory.containers.find((c) => c.id === v.cargoId)!.capacity = HULL_HOLD_CU[v.hull] + p.after.holdDeltaCu;
}

/** S4 exposure tolerance for the actor: the controlled hull's profile, or the
 * diver's suit fittings. The thermal shroud ignores ambient heat only. */
export function actorProtection(s: GameState, suitFitted: Parameters<typeof protectionFor>[1]): Protection {
  const v = s.fleet.vehicles.find((a) => a.id === s.player.controlledVehicleId);
  if (!v) return protectionFor(null, suitFitted);
  const p = vehicleProfile(s, v);
  const ambientOnly = hazardsAt(v.pose.position, s.tick).heat.every((h) => h.kind === "ambient");
  // SYS-1's classified exposure (heatExposure): the shroud ignores ambient heat
  // only; the exchanger slows the load in any heat over tolerance.
  return { heat: p.ambientHeatImmune && ambientOnly ? Math.max(p.heat, 1) : p.heat, brine: p.brine, current: p.current, heatLoad: p.heatLoad };
}

// ---------------------------------------------------------------- actions
const controlled = (s: GameState): VehicleState | undefined =>
  s.fleet.vehicles.find((v) => v.id === s.player.controlledVehicleId);
/** A direction from the pilot's view. */
const forward = (s: GameState): Vec3 => ({
  x: Math.sin(s.player.pose.yaw) * Math.cos(s.player.pose.pitch), y: Math.sin(s.player.pose.pitch),
  z: -Math.cos(s.player.pose.yaw) * Math.cos(s.player.pose.pitch),
});
export const MAX_FLARES = 8;
export const FLARE_LURE_SECONDS = 20;

/** `upgrade` commands: the actions a fitted upgrade grants. Refusals change nothing. */
export function upgradeAction(s: GameState, action: string, world: WorldQueries, itemId?: string): string | null {
  const v = controlled(s);
  if (action === "bio-cell") return bioCellCommand(s, v ?? null, itemId);
  if (!v) return "Pilot the craft first.";
  const p = vehicleProfile(s, v);
  switch (action) {
    case "overdrive": {
      const no = overdriveRefusal(p, v.upgrades, s.tick, v.charge);
      if (no) return no;
      v.upgrades = startOverdrive(v.upgrades, s.tick);
      s.feedback = "Overdrive · 14 m/s for 4 s. Loud, and it heats the hull.";
      return null;
    }
    case "flare": {
      const fired = fireFlare(p, v.upgrades, v.pose.position, forward(s), s.tick, world);
      if ("refusal" in fired) return fired.refusal;
      if (s.world.flares.length >= MAX_FLARES) s.world.flares.shift();
      v.upgrades = fired.runtime;
      s.world.flares.push(fired.flare);
      s.feedback = `Flare away · ${fired.runtime.flares} left. Light hunters turn to it.`;
      return null;
    }
    case "ballast": {
      const no = ballastRefusal(p, v.upgrades, depthOf(v.pose.position));
      if (no) return no;
      v.upgrades = blowBallast(v.upgrades);
      s.feedback = "Emergency ballast released · rising up to 40 m, power or not.";
      return null;
    }
    case "anchor": {
      if (v.upgrades.anchored) { v.upgrades = { ...v.upgrades, anchored: false }; s.feedback = "Mooring anchor raised."; return null; }
      const floorBelow = v.pose.position.y - world.groundHeight(v.pose.position.x, v.pose.position.z);
      const no = anchorRefusal(p, floorBelow, Math.hypot(v.velocity.x, v.velocity.y, v.velocity.z));
      if (no) return no;
      v.upgrades = { ...v.upgrades, anchored: true };
      s.feedback = "Mooring anchor down · the carrier holds against currents up to 1.5 m/s for free.";
      return null;
    }
    case "rearm": {
      const r = rearm(v.upgrades, p, dockOf(s, v) !== null);
      if (r.refusal) return r.refusal;
      v.upgrades = r.runtime;
      s.feedback = "Flares and ballast rearmed.";
      return null;
    }
    case "listen": return listen(s, v, p);
    case "sample": return sample(s, v, p);
  }
  return "That upgrade action does not exist.";
}

/** Hush listening array: while the Hush is quiet, bearings to sound-making lost
 * sites and animals within range. A site heard is marked on the chart. */
function listen(s: GameState, v: VehicleState, p: CraftProfile): string | null {
  if (!p.contracts.includes("listening_array")) return "No listening array is fitted.";
  const loud = Math.hypot(v.velocity.x, v.velocity.y, v.velocity.z) > 0.6 ? p.loudness.cruise : p.loudness.idle;
  if (loud > LISTENING_ARRAY.quietBelow) return "Too much self-noise to listen. Stop or glide quietly.";
  const at = v.pose.position, heard: string[] = [];
  const bearing = (q: Vec3): string => {
    const deg = ((Math.atan2(q.x - at.x, -(q.z - at.z)) * 180 / Math.PI) + 360) % 360;
    return `${Math.round(deg / LISTENING_ARRAY.bearingStepDeg) * LISTENING_ARRAY.bearingStepDeg % 360}°`;
  };
  for (const id of WORLD_LOST_SITES) {
    const site = LOST_SITES[id], d = distance(site.position, at);
    if (d > LISTENING_ARRAY.range) continue;
    heard.push(`${site.label} ${bearing(site.position)} · ${Math.round(d)} m`);
    const beacon = `listen:${id}`;
    if (!s.systems.beacons.some((b) => b.id === beacon))
      s.systems.beacons.push({ id: beacon, name: site.label.slice(0, 24), category: "site", position: { ...site.position }, source: "decode" });
  }
  for (const a of s.world.ecology.agents) {
    const d = distance(a.position, at);
    if (d <= LISTENING_ARRAY.range && heard.length < 8) heard.push(`${a.id.replaceAll("_", " ")} ${bearing(a.position)} · ${Math.round(d)} m`);
  }
  s.feedback = heard.length ? `Listening · ${heard.join(" · ")}.` : "Listening · nothing within 220 m.";
  return null;
}
/** Hush specimen bay: a live seed or spore sample, taken without tearing it. */
function sample(s: GameState, v: VehicleState, p: CraftProfile): string | null {
  const held = s.inventory.items.filter((i) => i.containerId === v.cargoId && isSeed(i.kind)).reduce((n, i) => n + i.quantity, 0);
  const near = (Object.keys(SYS2_SOURCES) as (keyof typeof SYS2_SOURCES)[])
    .filter((id) => distance(SOURCES[id as SourceId].position, v.pose.position) <= 10)
    .sort((a, b) => distance(SOURCES[a as SourceId].position, v.pose.position) - distance(SOURCES[b as SourceId].position, v.pose.position))[0];
  if (!near) return p.tools.includes("specimen_bay") ? "Bring the bay within 10 m of a living seed patch." : "No specimen bay is fitted.";
  const no = sampleRefusal(p, held, true);
  if (no) return no;
  const node = s.world.resources.find((r) => r.id === near)!;
  if (node.stock <= 0) return "Nothing left to sample here. It regrows from the cuttings planters return.";
  if (!hasRoom(s, v.cargoId, ITEMS[SOURCES[near as SourceId].item as ItemKind].cu)) return "Make room in the hold for the specimen.";
  node.stock--;
  addItem(s, SOURCES[near as SourceId].item as ItemKind, 1, v.cargoId);
  if (!s.knowledge.scans.includes(near)) s.knowledge.scans.push(near);
  const seed = SOURCES[near as SourceId].item;
  s.feedback = `Specimen taken intact · ${ITEMS[seed as ItemKind].label}${isSeed(seed) && SEEDS[seed].sampling === "specimen" ? " (it tears by hand)" : ""}.`;
  return null;
}
/** Insert a grown bio-cell from the diver hold or this craft's hold. */
function bioCellCommand(s: GameState, v: VehicleState | null, itemId?: string): string | null {
  const target = v ?? s.fleet.vehicles.find((a) => !a.berth && distance(a.pose.position, s.player.pose.position) < 6) ?? null;
  if (!target) return "Pilot a craft, or reach one, to feed it a bio-cell.";
  const holds = ["diver", target.cargoId];
  const cell = s.inventory.items.find((i) => i.kind === "bio_cell" && holds.includes(i.containerId) && (!itemId || i.id === itemId));
  const no = insertBioCellRefusal(target.bioFeed, cell ? cell.charge ?? 100 : null, target.disabled);
  if (no) return no;
  target.bioFeed = startBioFeed(cell!.charge ?? 100);
  s.inventory.items = s.inventory.items.filter((i) => i !== cell);
  s.feedback = `Bio-cell feeding the ${HULLS[target.hull].label} · about ${Math.round(target.bioFeed.remaining)}% over 100 s.`;
  return null;
}

// ---------------------------------------------------------------- per step
/** Reserve cells in a surfaced, parked Spindle's hold charge from its deck array. */
export const DECK_CHARGE_RATE = 0.25;
/** One active step of upgrade work for every hull: charging sources, bio feeds,
 * ballast rise (applied by step.ts), anchor release when moved, flare expiry. */
export function stepUpgrades(s: GameState, movedIds: ReadonlySet<string>): void {
  for (const v of s.fleet.vehicles) {
    if (v.disabled || v.berth) continue;
    const p = vehicleProfile(s, v), moving = movedIds.has(v.id);
    const heat = hazardsAt(v.pose.position, s.tick).heat.reduce((n, h) => Math.max(n, h.level), 0);
    const rate = totalRate(trickleRates({ profile: p, depth: depthOf(v.pose.position), moving, heat }));
    if (rate > 0) v.charge = Math.min(100, v.charge + rate * DT);
    if (v.bioFeed) {
      const fed = bioFeedStep(v.bioFeed, p.capacity, v.charge, DT);
      v.charge = Math.min(100, v.charge + fed.gain);
      v.bioFeed = fed.feed;
    }
    // Spindle deck charging: an array on a surfaced, parked Spindle tops up the
    // reserve cells stowed in its hold, so cells refill at sea.
    if (v.hull === "spindle" && p.solar > HULLS_SOLAR_STOCK && !moving && depthOf(v.pose.position) <= 1.5)
      for (const cell of s.inventory.items.filter((i) => i.containerId === v.cargoId && i.kind === "reserve_cell" && (i.charge ?? 0) < 100))
        cell.charge = Math.min(100, (cell.charge ?? 0) + DECK_CHARGE_RATE * DT);
    if (v.upgrades.anchored && Math.hypot(v.velocity.x, v.velocity.y, v.velocity.z) > 0.6) v.upgrades = { ...v.upgrades, anchored: false };
  }
  s.world.flares = s.world.flares.filter((f) => s.tick < f.until);
}
/** The Spindle's own canopy rate; the array doubles it. */
const HULLS_SOLAR_STOCK = 0.05 + 1e-9;
/** Burning flares as ecology light sources: position and output now. */
export function flareLights(s: GameState): { position: Vec3; light: number }[] {
  return s.world.flares.map((f) => ({ position: flarePosition(f, s.tick), light: flareLight(f, s.tick) })).filter((f) => f.light > 0);
}

/** The diver's air line from a parked, powered craft nearby (SYS-1). */
export function airLineFor(s: GameState): AirLineSupply | null {
  if (s.player.mode !== "swimming") return null;
  const crafts: AirLineCraft[] = s.fleet.vehicles.map((v) => ({
    id: v.id, profile: vehicleProfile(s, v), position: v.pose.position,
    speed: Math.hypot(v.velocity.x, v.velocity.y, v.velocity.z), charge: v.charge, disabled: v.disabled,
    emergencyAir: v.emergencyAir, berthed: !!v.berth,
  }));
  return airLineSupply(s.player.pose.position, crafts);
}
/** Motion for one piloted step (speed, loudness and drain in the chosen mode). */
export const pilotMotion = (s: GameState, v: VehicleState, mode: "idle" | "quiet" | "cruise" | "boost", lamp: boolean) =>
  motion(vehicleProfile(s, v), mode, { lamp });
export const upgradeLabel = (kind: UpgradeId): string => UPGRADES[kind].label;
