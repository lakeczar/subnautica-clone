/** Beacons and the personal chart. Player beacons are placed items with names;
 * decoded maps add landmark, site and hint beacons; outposts and restored stops
 * are derived beacons. Each can be switched off alone or by category. The chart
 * shows only explored cells, scanned sources and decoded areas. */
import { SOURCES } from "../../content/registry.js";
import { DECODABLES, LOST_SITES } from "../../content/systems/decodes.js";
import { FIXED_HOSTS } from "../../content/systems/hosts.js";
import type { FixedHostId } from "../../content/systems/hosts.js";
import { BEACON_CATEGORIES, BEACON_NAME_MAX, BEACON_REACH, CHART_CELL, CHART_VISIT_RADIUS, PLAYER_BEACON_LIMIT } from "../../content/systems/navigation.js";
import type { BeaconCategory } from "../../content/systems/navigation.js";
import { distance, facility, nextId } from "../inventory.js";
import type { GameState, Vec3 } from "../types.js";
import { addStack, applySpend, cuOf, freeCu, planSpend } from "./ledger.js";
import type { SystemsState } from "./state.js";
import { hasMember } from "../rows.js";

export interface BeaconView { id: string; name: string; category: BeaconCategory; position: Vec3; on: boolean; removable: boolean }

export function cleanBeaconName(name: string): string | null {
  const clean = name.replace(/\s+/g, " ").trim();
  return clean.length && clean.length <= BEACON_NAME_MAX && !/[\u0000-\u001f<>]/.test(clean) ? clean : null;
}
/** Places one carried navigation beacon at the diver's position. */
export function placeBeacon(s: GameState, sys: SystemsState, name: string): string | null {
  const clean = cleanBeaconName(name);
  if (!clean) return `Name the beacon with 1–${BEACON_NAME_MAX} characters.`;
  if (s.player.controlledVehicleId || s.player.interiorId) return "Leave the craft to place a beacon.";
  if (sys.beacons.filter((b) => b.source === "player").length >= PLAYER_BEACON_LIMIT)
    return `${PLAYER_BEACON_LIMIT} beacons are already placed. Collect one first.`;
  const pay = planSpend(s, { nav_beacon: 1 }, ["diver"]);
  if (Object.keys(pay.missing).length) return "Carry a navigation beacon to place one.";
  applySpend(s, pay.lines);
  sys.beacons.push({ id: nextId(s, "beacon"), name: clean, category: "player", position: { ...s.player.pose.position }, source: "player" });
  s.feedback = `Beacon "${clean}" placed.`;
  return null;
}
export function renameBeacon(sys: SystemsState, id: string, name: string): string | null {
  const b = sys.beacons.find((b) => b.id === id), clean = cleanBeaconName(name);
  if (!b) return "That beacon isn't on your chart.";
  if (!clean) return `Name the beacon with 1–${BEACON_NAME_MAX} characters.`;
  b.name = clean;
  return null;
}
/** Picks a player beacon back up into the diver hold. */
export function collectBeacon(s: GameState, sys: SystemsState, id: string): string | null {
  const b = sys.beacons.find((b) => b.id === id);
  if (!b || b.source !== "player") return "Only your own placed beacons can be collected.";
  if (s.player.controlledVehicleId || distance(s.player.pose.position, b.position) > BEACON_REACH) return "Swim to the beacon to collect it.";
  if (freeCu(s, "diver") < cuOf("nav_beacon")) return "Make 1 CU room to collect the beacon.";
  sys.beacons = sys.beacons.filter((x) => x !== b);
  sys.beaconsOff = sys.beaconsOff.filter((x) => x !== id);
  addStack(s, "nav_beacon", 1, "diver");
  return null;
}
export function setBeaconOn(sys: SystemsState, id: string, on: boolean): void {
  sys.beaconsOff = sys.beaconsOff.filter((x) => x !== id);
  if (!on) sys.beaconsOff.push(id);
}
export function setCategoryOn(sys: SystemsState, category: BeaconCategory, on: boolean): void {
  sys.categoriesOff = sys.categoriesOff.filter((c) => c !== category);
  if (!on) sys.categoriesOff.push(category);
}
/** Every beacon, stored and derived, with its effective switch state. */
export function beaconViews(s: GameState, sys: SystemsState): BeaconView[] {
  const derived = [
    ...sys.outposts.map((o) => ({ id: `outpost:${o.id}`, name: o.name, category: "outpost" as const, position: o.position })),
    ...(Object.keys(FIXED_HOSTS) as FixedHostId[]).filter((id) => {
      const d = FIXED_HOSTS[id];
      return d.facility === null || facility(s, d.facility) || (s.knowledge.markers as string[]).includes(id);
    }).map((id) => ({ id: `stop:${id}`, name: FIXED_HOSTS[id].label, category: "stop" as const, position: FIXED_HOSTS[id].position })),
  ];
  return [...derived.map((d) => ({ ...d, removable: false })), ...sys.beacons.map((b) => ({ id: b.id, name: b.name, category: b.category, position: b.position, removable: b.source === "player" }))]
    .map((b) => ({ ...b, position: { ...b.position }, on: !sys.beaconsOff.includes(b.id) && !sys.categoriesOff.includes(b.category) }));
}
export const categoryCounts = (views: readonly BeaconView[]): Record<BeaconCategory, number> =>
  Object.fromEntries(BEACON_CATEGORIES.map((c) => [c, views.filter((v) => v.category === c).length])) as Record<BeaconCategory, number>;

export const cellOf = (x: number, z: number): string => `${Math.floor(x / CHART_CELL)}:${Math.floor(z / CHART_CELL)}`;
function cellsAround(p: { x: number; z: number }, radius: number): string[] {
  const out: string[] = [];
  const reach = Math.ceil(radius / CHART_CELL);
  const cx = Math.floor(p.x / CHART_CELL), cz = Math.floor(p.z / CHART_CELL);
  for (let i = cx - reach; i <= cx + reach; i++)
    for (let k = cz - reach; k <= cz + reach; k++) {
      const nx = Math.max(i * CHART_CELL, Math.min(p.x, (i + 1) * CHART_CELL));
      const nz = Math.max(k * CHART_CELL, Math.min(p.z, (k + 1) * CHART_CELL));
      if (Math.hypot(nx - p.x, nz - p.z) <= radius) out.push(`${i}:${k}`);
    }
  return out;
}
/** Marks the cells near `position` explored. Cheap enough per step: at most nine
 * candidates, and nothing changes while the player stays in explored water. */
export function visitChart(sys: SystemsState, position: Vec3): string[] {
  const fresh = cellsAround(position, CHART_VISIT_RADIUS).filter((c) => !hasMember(sys.chart, c));
  sys.chart.push(...fresh);
  return fresh;
}

export type ChartReveal = "explored" | "scanned" | "decoded";
export interface ChartCell { key: string; x: number; z: number; size: number; reveal: ChartReveal[] }
export interface ChartMarker { id: string; label: string; kind: "source" | "site" | "beacon"; category?: BeaconCategory; position: Vec3 }
export interface ChartView { cells: ChartCell[]; markers: ChartMarker[]; player: Vec3 | null }
export interface ChartOptions {
  /** SYS-1's live-position upgrade. */
  livePosition?: boolean;
  sources?: Readonly<Record<string, { label: string; position: Vec3 }>>;
}
export function chartView(s: GameState, sys: SystemsState, options: ChartOptions = {}): ChartView {
  const sources: Readonly<Record<string, { label: string; position: Vec3 }>> = options.sources ?? SOURCES;
  const reveal = new Map<string, Set<ChartReveal>>();
  const add = (key: string, how: ChartReveal): void => { (reveal.get(key) ?? reveal.set(key, new Set()).get(key)!).add(how); };
  for (const c of sys.chart) add(c, "explored");
  const scanned = s.knowledge.scans.filter((id) => Object.hasOwn(sources, id));
  for (const id of scanned) add(cellOf(sources[id]!.position.x, sources[id]!.position.z), "scanned");
  const sites = sys.found.map((d) => DECODABLES[d].site).filter((id, n, a) => a.indexOf(id) === n);
  for (const id of sites) {
    const p = (LOST_SITES as Readonly<Record<string, { position: Vec3 }>>)[id]?.position;
    if (p) add(cellOf(p.x, p.z), "explored");
  }
  for (const d of sys.decoded) for (const r of DECODABLES[d].reveals) for (const c of cellsAround(r.position, r.radius)) add(c, "decoded");
  const cells = [...reveal].map(([key, how]) => {
    const [x, z] = key.split(":").map(Number) as [number, number];
    return { key, x: x * CHART_CELL, z: z * CHART_CELL, size: CHART_CELL, reveal: [...how].sort() };
  }).sort((a, b) => a.z - b.z || a.x - b.x);
  const markers: ChartMarker[] = [
    ...scanned.map((id) => ({ id, label: sources[id]!.label, kind: "source" as const, position: { ...sources[id]!.position } })),
    ...sites.flatMap((id) => {
      const site = (LOST_SITES as Readonly<Record<string, { label: string; position: Vec3 }>>)[id];
      return site ? [{ id, label: site.label, kind: "site" as const, position: { ...site.position } }] : [];
    }),
    ...beaconViews(s, sys).filter((b) => b.on).map((b) => ({ id: b.id, label: b.name, kind: "beacon" as const, category: b.category, position: b.position })),
  ];
  return { cells, markers, player: options.livePosition ? { ...s.player.pose.position } : null };
}
