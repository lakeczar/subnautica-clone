/** SYS-2 saved state, proposed as one `GameState.systems` slice (SYS-2.md). Only
 * stable IDs, positions, counters and flags; labels and views are derived.
 * In-progress work (decodes, crops) is keyed by the module item that does it, so
 * it moves with that module between hosts, kits and holds and is never copied. */
import { REGIONS } from "../../content/registry.js";
import type { RegionId } from "../../content/registry.js";
import { isSeed } from "../../content/systems/cultivation.js";
import type { SeedKind } from "../../content/systems/cultivation.js";
import { isDecodable } from "../../content/systems/decodes.js";
import type { DecodableId } from "../../content/systems/decodes.js";
import { OUTPOST_TIER_ORDER } from "../../content/systems/hosts.js";
import type { OutpostTier } from "../../content/systems/hosts.js";
import { isSys2Item } from "../../content/systems/items.js";
import { BEACON_CATEGORIES, BEACON_NAME_MAX } from "../../content/systems/navigation.js";
import type { BeaconCategory } from "../../content/systems/navigation.js";
import type { Vec3 } from "../types.js";

export type PowerSource = "solar" | "thermal" | "cells" | "plant";
export interface OutpostState {
  /** The kit item's ID: the same ID returns to the kit when packed. */
  id: string;
  tier: OutpostTier;
  name: string;
  position: Vec3;
  region: RegionId | null;
  /** Fixed at deploy from the location. */
  power: PowerSource;
}
/** One occupied socket. The module item leaves the inventory while installed. */
export interface SocketEntry { hostId: string; socket: string; itemId: string; kind: string }
/** A packed kit remembers its socket layout so a redeploy refits carried modules. */
export interface PackedKit { itemId: string; tier: OutpostTier; name: string; layout: { socket: string; itemId: string }[] }
/** `progress` is work in base-speed seconds. */
export interface DecodeJob { moduleId: string; decodable: DecodableId; progress: number }
/** `progress` is grown seconds, capped at the seed's grow time. */
export interface PlanterState { moduleId: string; seed: SeedKind; progress: number }
export interface BeaconState {
  id: string;
  name: string;
  category: BeaconCategory;
  position: Vec3;
  /** `player` beacons are items placed in the world; `decode` beacons come from decoded maps. */
  source: "player" | "decode";
}
export interface SystemsState {
  outposts: OutpostState[];
  packed: PackedKit[];
  sockets: SocketEntry[];
  /** Decodables whose site the player has found. */
  found: DecodableId[];
  decoded: DecodableId[];
  decodes: DecodeJob[];
  planters: PlanterState[];
  beacons: BeaconState[];
  /** Individually switched-off beacon IDs (stored and derived beacons alike). */
  beaconsOff: string[];
  categoriesOff: BeaconCategory[];
  /** Explored chart cells, "cx:cz". Scans and decodes reveal derived cells on top. */
  chart: string[];
}

export function createSystems(): SystemsState {
  return {
    outposts: [], packed: [], sockets: [], found: [], decoded: [], decodes: [], planters: [],
    beacons: [], beaconsOff: [], categoriesOff: [], chart: [],
  };
}

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const id = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9_:.-]{1,64}$/i.test(v);
const vec = (v: unknown): boolean => record(v) && finite(v.x) && finite(v.y) && finite(v.z);
const exactKeys = (v: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));
const unique = (a: readonly string[]): boolean => new Set(a).size === a.length;
const name = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= BEACON_NAME_MAX;
const POWER: readonly string[] = ["solar", "thermal", "cells", "plant"];

/** Strict shape check for the coordinator's save validation. Cross-references
 * against the inventory (module and kit IDs) belong to the composed validator. */
export function validSystems(v: unknown): v is SystemsState {
  if (!record(v) || !exactKeys(v, ["outposts", "packed", "sockets", "found", "decoded", "decodes", "planters",
    "beacons", "beaconsOff", "categoriesOff", "chart"])) return false;
  const arrays = Object.values(v);
  if (!arrays.every(Array.isArray)) return false;
  const s = v as unknown as SystemsState;
  if (!s.outposts.every((o) => record(o) && exactKeys(o as never, ["id", "tier", "name", "position", "region", "power"]) &&
    id(o.id) && OUTPOST_TIER_ORDER.includes(o.tier) && name(o.name) && vec(o.position) &&
    (o.region === null || Object.hasOwn(REGIONS, o.region)) && POWER.includes(o.power))) return false;
  if (!s.packed.every((p) => record(p) && exactKeys(p as never, ["itemId", "tier", "name", "layout"]) && id(p.itemId) &&
    OUTPOST_TIER_ORDER.includes(p.tier) && name(p.name) && Array.isArray(p.layout) &&
    p.layout.every((l) => record(l) && exactKeys(l as never, ["socket", "itemId"]) && id(l.socket) && id(l.itemId)))) return false;
  if (!s.sockets.every((e) => record(e) && exactKeys(e as never, ["hostId", "socket", "itemId", "kind"]) &&
    id(e.hostId) && id(e.socket) && id(e.itemId) && isSys2Item(e.kind))) return false;
  if (!unique(s.sockets.map((e) => e.itemId)) || !unique(s.sockets.map((e) => `${e.hostId}/${e.socket}`))) return false;
  if (!s.found.every(isDecodable) || !s.decoded.every(isDecodable) || !unique(s.found) || !unique(s.decoded)) return false;
  if (!s.decoded.every((d) => s.found.includes(d))) return false;
  if (!s.decodes.every((j) => record(j) && exactKeys(j as never, ["moduleId", "decodable", "progress"]) && id(j.moduleId) &&
    isDecodable(j.decodable) && finite(j.progress) && j.progress >= 0 && s.found.includes(j.decodable) && !s.decoded.includes(j.decodable))) return false;
  if (!unique(s.decodes.map((j) => j.moduleId)) || !unique(s.decodes.map((j) => j.decodable))) return false;
  if (!s.planters.every((p) => record(p) && exactKeys(p as never, ["moduleId", "seed", "progress"]) && id(p.moduleId) &&
    isSeed(p.seed) && finite(p.progress) && p.progress >= 0) || !unique(s.planters.map((p) => p.moduleId))) return false;
  if (!s.beacons.every((b) => record(b) && exactKeys(b as never, ["id", "name", "category", "position", "source"]) && id(b.id) &&
    name(b.name) && BEACON_CATEGORIES.includes(b.category) && vec(b.position) && (b.source === "player" || b.source === "decode")) ||
    !unique(s.beacons.map((b) => b.id))) return false;
  if (!s.beaconsOff.every(id) || !unique(s.beaconsOff)) return false;
  if (!s.categoriesOff.every((c) => BEACON_CATEGORIES.includes(c)) || !unique(s.categoriesOff)) return false;
  return s.chart.every((c) => typeof c === "string" && /^-?\d{1,4}:-?\d{1,4}$/.test(c)) && unique(s.chart);
}
