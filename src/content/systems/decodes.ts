/** The decoder and lost-site framework's data (SYS-2, LS-1). Lost sites and
 * landmarks are found without decoding; what they hold (logs, recipes,
 * terminals, door codes) stays unreadable until its decodable finishes. Every
 * decode is optional (`story: false`); the main path never needs one
 * (`sim/storyCampaign.ts`, `mainPathPlanProblems`). */
import type { RegionId } from "../registry.js";
import { SITES } from "../regions/sites.js";
import { CAVE_SOURCES } from "../regions/caves.js";
import { SOURCES } from "../registry.js";
import { CB_DECODABLES, CB_LOST_SITES, CODED_DOORS } from "./lostSites.js";
import type { DoorId, LostSiteDefinition, RevealDefinition, RevealTarget } from "./lostSites.js";

export type { DoorId, RevealDefinition, RevealTarget } from "./lostSites.js";
export type DecodeSize = "fragment" | "log" | "archive" | "core";
/** Play minutes at base decoder speed: about 3–15 minutes by size. */
export const DECODE_MINUTES: Readonly<Record<DecodeSize, number>> = { fragment: 3, log: 6, archive: 10, core: 15 };
/** A decoder without a relay works only while the player is this close to its host. */
export const DECODER_LOCAL_RANGE = 250;

export interface DecodableDefinition {
  label: string;
  /** The lost site where its data is captured. */
  site: string;
  region: RegionId;
  size: DecodeSize;
  /** Records (logs, terminals, found notes) unreadable until this decode completes. */
  gates: readonly string[];
  /** Plans granted on completion. */
  blueprints: readonly string[];
  /** Decoded maps: new beacons and chart areas, each naming its target. */
  reveals: readonly RevealDefinition[];
  /** Always false: lost sites deepen the story, never gate it. */
  story: false;
}

export const LOST_SITES = CB_LOST_SITES satisfies Record<string, LostSiteDefinition>;
export type LostSiteId = keyof typeof LOST_SITES;

export const DECODABLES = CB_DECODABLES satisfies Record<string, DecodableDefinition>;
export type DecodableId = keyof typeof DECODABLES;
export const DECODABLE_IDS = Object.keys(DECODABLES) as DecodableId[];
export const isDecodable = (id: unknown): id is DecodableId =>
  typeof id === "string" && Object.hasOwn(DECODABLES, id);

/** Plans both routes depend on: each must be granted on the main path by a real
 * record, never only by a decode (`sim/storyCampaign.ts` audits them). */
export const MAIN_PATH_PLANS = ["bp_decoder", "bp_field_outpost", "bp_outpost_standard", "bp_outpost_advanced", "bp_cultivation"] as const;

/** Lost sites standing in the world. */
export const WORLD_LOST_SITES = Object.keys(CB_LOST_SITES) as LostSiteId[];
/** Decoded log lines, by decodable (display text, never saved). */
export const DECODE_LOGS: Readonly<Record<string, readonly string[]>> =
  Object.fromEntries(Object.entries(CB_DECODABLES).map(([id, d]) => [id, d.logs]));

const CAVE_IDS = new Set(CAVE_SOURCES.map((c) => c.id));
const SITE_IDS = new Set(SITES.map((s) => s.id));
/** Whether a reveal's target is in the world now. An unplaced one is withheld:
 * no beacon and no chart area until a later build places it. */
export function revealPlaced(target: RevealTarget): boolean {
  switch (target.kind) {
    case "lost-site": return Object.hasOwn(CB_LOST_SITES, target.id);
    case "cave": return CAVE_IDS.has(target.id);
    case "site": return SITE_IDS.has(target.id);
    case "source": return Object.hasOwn(SOURCES, target.id);
  }
}
/** A decodable's reveals whose targets are in the world. */
export const placedReveals = (id: DecodableId): readonly RevealDefinition[] =>
  (DECODABLES[id].reveals as readonly RevealDefinition[]).filter((r) => revealPlaced(r.target));

export const DOOR_IDS = Object.keys(CODED_DOORS) as DoorId[];
/** The door whose code a gated record holds, if any. */
export const doorForRecord = (record: string): DoorId | null =>
  DOOR_IDS.find((d) => CODED_DOORS[d].record === record) ?? null;
export { CODED_DOORS };
