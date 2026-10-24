/** C4: SYS-2's bases and knowledge composed into the fixed step. This module
 * owns the seams SYS-2 left open:
 * - **Power** (`hostPower`): SYS-1's host power model: plants always, solar in
 *   daylight, thermal at vents, cell outposts on their lockers' cells (drawn
 *   down while working), the carrier on its own battery above 20%.
 * - **Relay**: a host's relay module, or a surfaced Spindle's radio mast within
 *   reach (SYS-1's ×1.5 relay range), keeps a remote decoder working.
 * - **Siting** (`siteQuery`): the composed world (terrain, caves, solids,
 *   vents) answers SYS-2's OutpostSiteQuery.
 * - **Carrier sockets**: the Hearthline powers 2 system sockets, 4 with the
 *   system bay (SYS-1); SYS-2's socket map is checked against that.
 * - **Lost sites**: the content bible's sites are found by swimming up to them.
 * - **Commands** call SYS-2's rules directly; each refusal changes nothing. */
import { DECODABLES, DECODE_LOGS, DECODER_LOCAL_RANGE, LOST_SITES, WORLD_LOST_SITES } from "../content/systems/decodes.js";
import type { DecodableId } from "../content/systems/decodes.js";
import { isSeed } from "../content/systems/cultivation.js";
import { FIXED_HOSTS, MODULES, OUTPOST_SITING } from "../content/systems/hosts.js";
import { BEACON_CATEGORIES } from "../content/systems/navigation.js";
import type { BeaconCategory } from "../content/systems/navigation.js";
import { HAZARDS } from "../content/regions/hazards.js";
import { regionAtPoint } from "../content/regions/layout.js";
import { CAVE_SOURCES } from "../content/regions/caves.js";
import { HULLS } from "../content/registry.js";
import { distance } from "./inventory.js";
import { effectiveRating, vehicleProfile } from "./fittings.js";
import { hostPowerState, hostDrainStep } from "./power/hosts.js";
import type { HostCell, HostPowerInput } from "./power/hosts.js";
import { cellTransfer, dockCharge } from "./power/charging.js";
import { decoderSpeed, livePosition, MAST_REACH, outpostLimitBonus } from "./upgrades/hosts.js";
import { surveyModuleTier } from "./hostUpgrades.js";
import { RADIO_MAST } from "./upgrades/tools.js";
import {
  advanceSystems, collectBeacon, deployOutpost, discoverSite, handheldPing, harvest, hostById, installModule, listHosts,
  packOutpost, placeBeacon, plant, removeModule, setBeaconOn, setCategoryOn, startDecode, stationSurvey, upgradeOutpost,
} from "./systems/index.js";
import type { HostPower, OutpostSiteQuery, SiteSample, SocketHost, SystemsEvent } from "./systems/index.js";
import type { DecoderContext } from "./systems/decoder.js";
import type { GameCommand, GameEvent, GameState, Vec3, WorldQueries } from "./types.js";

const poweredModules = (host: SocketHost): number =>
  host.sockets.filter((k) => k.occupant?.module && MODULES[k.occupant.module].needsPower).length;
function cellsIn(s: GameState, host: SocketHost): HostCell[] {
  return s.inventory.items.filter((i) => host.lockers.includes(i.containerId) && (i.kind === "reserve_cell" || i.kind === "bio_cell"))
    .map((i) => ({ id: i.id, kind: i.kind as HostCell["kind"], charge: i.charge ?? 0 }));
}
function powerInput(s: GameState, host: SocketHost): HostPowerInput {
  const carrier = host.kind === "carrier" ? s.fleet.vehicles.find((v) => `carrier:${v.id}` === host.id) : undefined;
  return {
    available: host.available, poweredModules: poweredModules(host),
    power: host.kind === "carrier" ? "carrier" : host.power,
    ...(host.power === "cells" ? { cells: cellsIn(s, host) } : {}),
    ...(carrier ? { carrier: { charge: carrier.charge, disabled: carrier.disabled } } : {}),
  };
}
/** SYS-1's answer to SYS-2's "is this host powered now". */
export const hostPower: HostPower = (host, s) => hostPowerState(powerInput(s, host)).powered;
export const hostPowerReason = (s: GameState, host: SocketHost): string | null => hostPowerState(powerInput(s, host)).reason;

/** A surfaced Spindle with a radio mast within `reach` metres of a point. */
function mastWithin(s: GameState, p: Vec3, reach: number): boolean {
  return s.fleet.vehicles.some((v) => v.hull === "spindle" && !v.disabled && !v.berth && v.pose.position.y > -1.5 &&
    vehicleProfile(s, v).contracts.includes("radio_mast") && distance(v.pose.position, p) <= reach);
}
export function systemsContext(s: GameState): DecoderContext {
  return { power: hostPower, relayed: (host) => mastWithin(s, host.position, DECODER_LOCAL_RANGE * RADIO_MAST.factor),
    // SIG-1: a decoder lattice speeds its own module.
    decoderSpeed: decoderSpeed(s.systems.moduleUpgrades) };
}
/** Survey tier at a host: its best array (a fixed host's built-in one, or a
 * survey module's fitted array, SIG-1), and a surfaced radio mast nearby adds one. */
export const surveyTierAt = (s: GameState, host: SocketHost): number => {
  // HUB-2: a fixed host's built-in array has its own tier (the crown's is 300 m).
  const fixed = Object.hasOwn(FIXED_HOSTS, host.id) ? FIXED_HOSTS[host.id as keyof typeof FIXED_HOSTS] : null;
  const own = Math.max(fixed && "surveyTier" in fixed ? fixed.surveyTier : 0, surveyModuleTier(s, host.id));
  return Math.min(3, own + (mastWithin(s, host.position, MAST_REACH) ? 1 : 0));
};
export const outpostRules = (s: GameState) => ({ limitBonus: outpostLimitBonus(s.knowledge.crafted) });
export const chartOptions = (s: GameState) => ({ livePosition: livePosition(s.knowledge.crafted) });

// ---------------------------------------------------------------- siting
/** Heat sources outposts can charge from: S2's vent fields and plumes. */
const VENTS: readonly Vec3[] = HAZARDS.filter((h) => h.kind === "heat").map((h) => ({
  x: (h.bounds.min.x + h.bounds.max.x) / 2, y: h.bounds.min.y, z: (h.bounds.min.z + h.bounds.max.z) / 2,
}));
const insideCave = (p: Vec3): boolean => CAVE_SOURCES.some((c) => p.x >= c.footprint.minX && p.x < c.footprint.maxX &&
  p.z >= c.footprint.minZ && p.z < c.footprint.maxZ);
/** The composed world as SYS-2's siting seam. Level ground is a ledge (the
 * floor carries no ledge tag); rock or structure tops count as structure. */
export function siteQuery(world: WorldQueries): OutpostSiteQuery {
  return {
    sample(p: Vec3): SiteSample {
      const ground = world.supportHeight(p.x, p.z, p.y + 0.5), floor = world.groundHeight(p.x, p.z);
      const h = (dx: number, dz: number): number => world.supportHeight(p.x + dx, p.z + dz, p.y + 2);
      const slope = Math.atan(Math.max(Math.abs(h(1.5, 0) - h(-1.5, 0)), Math.abs(h(0, 1.5) - h(0, -1.5))) / 3) * 180 / Math.PI;
      const covered = insideCave(p) || !world.lineOfSight({ ...p, y: p.y + 2 }, { ...p, y: Math.max(p.y + 3, -0.1) });
      const vent = VENTS.reduce((best, v) => Math.min(best, Math.hypot(v.x - p.x, v.z - p.z)), Infinity);
      const onSolid = ground > floor + 0.3;
      const level = Math.abs(p.y - ground) < 1.5;
      return {
        ground: !level ? "open_water" : insideCave(p) ? "cave_floor" : onSolid ? "structure" : slope <= OUTPOST_SITING.maxSlope ? "ledge" : "slope",
        slope, clear: world.clearance({ x: p.x, y: ground + 0.05, z: p.z }, { radius: 1.4, height: 2.4 }),
        depth: Math.max(0, -ground), ventDistance: Number.isFinite(vent) ? vent : null, covered,
        region: regionAtPoint(p.x, p.z),
      };
    },
  };
}
/** Where a deploy plants the anchor: the support below the diver's feet. */
export function deployPoint(s: GameState, world: WorldQueries): Vec3 {
  const p = s.player.pose.position;
  return { x: p.x, y: world.supportHeight(p.x, p.z, p.y + 0.5), z: p.z };
}

/** The Hearthline powers 2 system sockets, 4 with the system bay. */
export function carrierSocketRefusal(s: GameState, hostId: string): string | null {
  if (!hostId.startsWith("carrier:")) return null;
  const v = s.fleet.vehicles.find((a) => `carrier:${a.id}` === hostId);
  if (!v) return null;
  const limit = vehicleProfile(s, v).systemSockets, used = s.systems.sockets.filter((e) => e.hostId === hostId).length;
  return used >= limit ? `The Hearthline powers ${limit} system sockets${limit < 4 ? " (4 with the system bay)" : ""}. Remove a module first. Nothing changed.` : null;
}

/** Charging from an outpost's built-in charger: a craft moored within reach is
 * charged from the outpost's own power (cells outposts pay from their cells). */
export const OUTPOST_SERVICE_RADIUS = 14;
export function outpostChargerFor(s: GameState, vehicleId: string): SocketHost | null {
  const v = s.fleet.vehicles.find((a) => a.id === vehicleId);
  if (!v || v.berth || v.hull === "hearthline") return null;
  return listHosts(s, s.systems).find((h) => h.kind === "outpost" && distance(h.position, v.pose.position) <= OUTPOST_SERVICE_RADIUS) ?? null;
}
/** What an outpost's charger would do for this craft, read-only. Cells outposts
 * pay from their locker's reserve cells (`cellTransfer`, at the craft's capacity),
 * emptiest first; plant, solar and thermal outposts charge from their own source. */
export interface OutpostChargePlan {
  readonly host: SocketHost;
  readonly refusal: string | null;
  readonly from: number;
  readonly to: number;
  /** Reserve-cell charge drawn from the locker, in cell percent, by item. */
  readonly cells: readonly { readonly id: string; readonly charge: number }[];
  /** The power payment, in words. */
  readonly cost: string;
}
export function outpostChargePlan(s: GameState, vehicleId: string): OutpostChargePlan | null {
  const v = s.fleet.vehicles.find((a) => a.id === vehicleId), host = outpostChargerFor(s, vehicleId);
  if (!v || !host) return null;
  const plan = (refusal: string | null, to = v.charge, cells: { id: string; charge: number }[] = [], cost = ""): OutpostChargePlan =>
    ({ host, refusal, from: v.charge, to, cells, cost });
  if (v.disabled) return plan("Apply a rescue patch before routine charging.");
  if (!hostPower(host, s)) return plan(`${host.label} has no power: ${hostPowerReason(s, host) ?? "check its supply"}.`);
  if (v.charge >= 100) return plan("Battery already full.");
  if (host.power !== "cells") return plan(null, 100, [], `${host.power} power, no cells spent`);
  const cap = vehicleProfile(s, v).capacity, out: { id: string; charge: number }[] = [];
  let charge = v.charge;
  const stock = s.inventory.items.filter((i) => host.lockers.includes(i.containerId) && i.kind === "reserve_cell" && (i.charge ?? 0) > 0)
    .sort((a, b) => (a.charge ?? 0) - (b.charge ?? 0) || a.id.localeCompare(b.id));
  for (const cell of stock) {
    if (charge >= 100) break;
    const t = cellTransfer(cell.charge ?? 0, charge, cap);
    if (t.craftCharge > charge) out.push({ id: cell.id, charge: t.cellCharge });
    charge = t.craftCharge;
  }
  if (charge <= v.charge + 1e-9) return plan(`${host.label}'s cells are spent. Bring charged reserve cells.`);
  const spent = out.reduce((n, c) => n + ((stock.find((x) => x.id === c.id)!.charge ?? 0) - c.charge), 0);
  return plan(null, charge, out, `${Math.round(spent)}% of the locker's reserve-cell charge`);
}
export function outpostCharge(s: GameState, vehicleId: string): string | null {
  const p = outpostChargePlan(s, vehicleId);
  if (!p) return "Moor within 14 m of a field outpost to use its charger.";
  if (p.refusal) return p.refusal;
  const v = s.fleet.vehicles.find((a) => a.id === vehicleId)!;
  for (const c of p.cells) s.inventory.items.find((i) => i.id === c.id)!.charge = c.charge;
  v.charge = p.to;
  s.feedback = `${HULLS[v.hull].label} charged at ${p.host.label} · ${Math.round(p.from)}% → ${Math.round(p.to)}% · ${p.cost}.`;
  return null;
}

/** The carrier's charging dock (SYS-1 `dockCharge`), read-only: a socketed,
 * powered charger module fills berthed craft in berth order, each percent paid
 * from the carrier's battery at the craft's capacity, keeping its last 20%. */
export interface BerthChargePlan {
  readonly refusal: string | null;
  readonly craft: readonly { readonly id: string; readonly from: number; readonly to: number }[];
  readonly carrierFrom: number;
  readonly carrierTo: number;
}
export function berthChargePlan(s: GameState, carrierId: string): BerthChargePlan | null {
  const h = s.fleet.vehicles.find((v) => v.id === carrierId && v.hull === "hearthline");
  if (!h) return null;
  const hostId = `carrier:${h.id}`, host = hostById(s, s.systems, hostId);
  const charger = s.systems.sockets.some((e) => e.hostId === hostId && e.kind === "mod_charger");
  const berthed = s.fleet.vehicles.filter((v) => v.berth?.carrierId === h.id && v.hull !== "hearthline")
    .sort((a, b) => a.berth!.slot - b.berth!.slot);
  const plan = (refusal: string | null, charges = berthed.map((v) => v.charge), carrierTo = h.charge): BerthChargePlan =>
    ({ refusal, craft: berthed.map((v, i) => ({ id: v.id, from: v.charge, to: charges[i]! })), carrierFrom: h.charge, carrierTo });
  if (charger && host && !hostPower(host, s)) return plan(`The carrier's system sockets have no power: ${hostPowerReason(s, host) ?? ""}`.trim());
  const r = dockCharge(charger, h.charge, berthed.map((v) => ({ hull: v.hull as Exclude<typeof v.hull, "hearthline">, charge: v.charge, capacity: vehicleProfile(s, v).capacity })));
  return plan(r.refusal, [...r.charges], r.carrierCharge);
}
export function chargeBerths(s: GameState, carrierId: string): string | null {
  if (s.player.interiorId !== carrierId && s.player.controlledVehicleId !== carrierId) return "Charge the berths from inside the carrier.";
  const p = berthChargePlan(s, carrierId);
  if (!p) return "Choose the carrier.";
  if (p.refusal) return p.refusal;
  for (const c of p.craft) s.fleet.vehicles.find((v) => v.id === c.id)!.charge = c.to;
  s.fleet.vehicles.find((v) => v.id === carrierId)!.charge = p.carrierTo;
  s.feedback = `Berths charged · ${p.craft.map((c) => `${Math.round(c.from)}% → ${Math.round(c.to)}%`).join(", ")} · carrier ${Math.round(p.carrierFrom)}% → ${Math.round(p.carrierTo)}%.`;
  return null;
}

// ---------------------------------------------------------------- commands
const seedOf = (v: string): v is Parameters<typeof plant>[4] => isSeed(v);
const categoryOf = (v: string | undefined): v is BeaconCategory => !!v && (BEACON_CATEGORIES as readonly string[]).includes(v);
export function systemsCommand(s: GameState, c: GameCommand, world: WorldQueries): string | null | undefined {
  const sys = s.systems;
  switch (c.type) {
    case "deploy-outpost": {
      const no = deployOutpost(s, sys, c.itemId, deployPoint(s, world), siteQuery(world), outpostRules(s));
      if (!no && c.name) { const o = sys.outposts.find((x) => x.id === c.itemId); if (o) o.name = c.name.trim().slice(0, 24) || o.name; }
      return no;
    }
    case "pack-outpost": return packOutpost(s, sys, c.outpostId, c.to);
    case "charge-berths": return chargeBerths(s, c.carrierId);
    case "upgrade-outpost": return upgradeOutpost(s, sys, c.outpostId);
    case "install-host-module": return carrierSocketRefusal(s, c.hostId) ?? installModule(s, sys, c.hostId, c.socket, c.itemId);
    case "remove-host-module": return removeModule(s, sys, c.hostId, c.socket, c.to);
    case "start-decode": {
      const host = hostById(s, sys, c.hostId);
      if (host && !hostPower(host, s)) return `${host.label} has no power for a decoder: ${hostPowerReason(s, host) ?? ""}`.trim();
      return startDecode(s, sys, c.hostId, c.decodable as DecodableId);
    }
    case "plant": return seedOf(c.seed) ? plant(s, sys, c.hostId, c.socket, c.seed) : "Choose a seed or cutting.";
    case "harvest": return harvest(s, sys, c.hostId, c.socket, { ...(c.to ? { to: c.to } : {}), ...(c.replant !== undefined ? { replant: c.replant } : {}) });
    case "place-beacon": return placeBeacon(s, sys, c.name);
    case "collect-beacon": return collectBeacon(s, sys, c.beaconId);
    case "beacon-switch":
      if (c.beaconId) setBeaconOn(sys, c.beaconId, c.on);
      else if (categoryOf(c.category)) setCategoryOn(sys, c.category, c.on);
      else return "Choose a beacon or a category.";
      s.feedback = "";
      return null;
    case "ping": {
      const r = handheldPing(s);
      if (r.refusal) return r.refusal;
      s.feedback = r.marks.length ? `Ping · ${r.marks.slice(0, 4).map((m) => `${m.label} ${Math.round(m.distance)} m`).join(" · ")}.`
        : "Ping · no scanned materials within 35 m.";
      return null;
    }
    case "survey": {
      const host = hostById(s, sys, c.hostId);
      if (!host) return "That host doesn't exist.";
      const r = stationSurvey(s, sys, c.hostId, surveyTierAt(s, host), hostPower);
      if (r.refusal) return r.refusal;
      s.feedback = r.marks.length ? `Survey (${r.range} m) · ${r.marks.slice(0, 6).map((m) => `${m.label} ${Math.round(m.distance)} m ${m.regrowth}`).join(" · ")}.`
        : `Survey (${r.range} m) · no scanned material in range.`;
      return null;
    }
    default: return undefined;
  }
}

// ---------------------------------------------------------------- per step
/** Swimming within this range of a lost site captures its data (finds it). */
export const LOST_SITE_FIND_RANGE = 10;
export function stepSystems(s: GameState, events: GameEvent[]): void {
  if (s.scenario !== "expedition" || s.opening.phase < 4) return;
  const sys = s.systems, p = s.player.pose.position;
  for (const id of WORLD_LOST_SITES) {
    const site = LOST_SITES[id];
    if (distance(site.position, p) > LOST_SITE_FIND_RANGE) continue;
    const fresh = discoverSite(sys, id);
    if (fresh.length) events.push({ type: "notice", channel: "action",
      message: `${site.label} · data captured: ${fresh.map((d) => DECODABLES[d].label).join(", ")}. Decode it at a decoder module to read it.` },
      { type: "sound", cue: "scan" });
  }
  // Host drain: cell outposts draw their lockers' cells; the carrier its battery. Only
  // occupied hosts can have powered modules.
  for (const host of listHosts(s, sys, { occupied: true })) {
    const input = powerInput(s, host);
    if (input.poweredModules <= 0) continue;
    const drain = hostDrainStep(input, 1 / 60);
    for (const cell of drain.cells) { const item = s.inventory.items.find((i) => i.id === cell.id); if (item) item.charge = cell.charge; }
    if (drain.carrierDrain > 0) {
      const v = s.fleet.vehicles.find((a) => `carrier:${a.id}` === host.id);
      if (v) v.charge = Math.max(0, v.charge - drain.carrierDrain);
    }
  }
  // Chart cells are state the chart redraws from; only decodes and crops are
  // events (notices, sound and the play timeline read them).
  for (const e of advanceSystems(s, sys, systemsContext(s)))
    events.push(...systemsNotice(e), ...(e.type === "chart-explored" ? [] : [{ type: "systems" as const, event: e }]));
}
function systemsNotice(e: SystemsEvent): GameEvent[] {
  if (e.type === "decoded") {
    const d = DECODABLES[e.completion.decodable], extra = [
      ...(e.completion.blueprints.length ? ["new plans in your notebook"] : []),
      ...(e.completion.beacons.length ? [`${e.completion.beacons.length} new beacon${e.completion.beacons.length === 1 ? "" : "s"} on the chart`] : []),
      ...(DECODE_LOGS[e.completion.decodable]?.length ? ["logs readable in the journal"] : []),
    ];
    return [{ type: "notice", channel: "action", message: `Decode complete · ${d.label}${extra.length ? ` · ${extra.join(", ")}` : ""}.` }, { type: "sound", cue: "scan" }];
  }
  if (e.type === "crop-ready") return [{ type: "notice", channel: "action", message: "A planter crop is ready to harvest." }];
  return [];
}
/** Inspecting a lost site: finds it if new, then says what it holds and
 * whether its records are readable yet (they are once decoded). */
export function readLostSite(s: GameState, siteId: string): string {
  const site = LOST_SITES[siteId as keyof typeof LOST_SITES];
  if (!site) return "Nothing here.";
  discoverSite(s.systems, siteId);
  const mine = (Object.keys(DECODABLES) as DecodableId[]).filter((d) => DECODABLES[d].site === siteId);
  const open = mine.filter((d) => !s.systems.decoded.includes(d));
  const see = "see" in site ? `${site.see} ` : "";
  return open.length
    ? `${site.label} · ${see}Its records are unreadable until decoded: ${open.map((d) => DECODABLES[d].label).join(", ")}. Start the decode at any powered decoder module.`
    : `${site.label} · decoded. ${mine.flatMap((d) => DECODE_LOGS[d] ?? []).join(" ")}`;
}
/** For the HUD and depth warnings: a hull's effective rating. */
export { effectiveRating };
