/** SYS-2 decoder framework data. Every row here is a story-neutral placeholder:
 * the lore owner replaces sites, text and rewards later through the same shape.
 * Lost sites and landmarks are found without decoding; what they hold (logs,
 * recipes, terminals) stays unreadable until its decodable finishes. */
import type { RegionId } from "../registry.js";
import type { BeaconCategory } from "./navigation.js";

export type DecodeSize = "fragment" | "log" | "archive" | "core";
/** Play minutes at base decoder speed: about 3–15 minutes by size. */
export const DECODE_MINUTES: Readonly<Record<DecodeSize, number>> = { fragment: 3, log: 6, archive: 10, core: 15 };
/** A decoder without a relay works only while the player is this close to its host. */
export const DECODER_LOCAL_RANGE = 250;

export interface RevealDefinition {
  id: string;
  label: string;
  category: Exclude<BeaconCategory, "player" | "outpost">;
  position: { x: number; y: number; z: number };
  /** Chart radius in metres revealed around the point. */
  radius: number;
}
export interface DecodableDefinition {
  label: string;
  /** The lost site or landmark where its data is captured. */
  site: string;
  region: RegionId;
  size: DecodeSize;
  /** Records (logs, terminals) unreadable until this decode completes. */
  gates: readonly string[];
  /** Plans granted on completion. */
  blueprints: readonly string[];
  /** Decoded maps: new beacons and chart areas. */
  reveals: readonly RevealDefinition[];
  /** A decode the story needs. Its decoder plans must be reachable first. */
  story: boolean;
}

export const LOST_SITES = {
  demo_relay_hut: { label: "Collapsed relay hut", region: "refuge_reef", position: { x: -40, y: -20, z: -30 } },
  demo_survey_cairn: { label: "Survey cairn", region: "suspended_garden", position: { x: 180, y: -125, z: -110 } },
  demo_sealed_vault: { label: "Sealed instrument vault", region: "silt_basin", position: { x: 230, y: -185, z: -265 } },
} as const satisfies Record<string, { label: string; region: RegionId; position: { x: number; y: number; z: number } }>;
export type LostSiteId = keyof typeof LOST_SITES;

export const DECODABLES = {
  demo_hut_fragment: {
    label: "Relay hut fragment", site: "demo_relay_hut", region: "refuge_reef", size: "fragment",
    gates: ["demo_hut_log"], blueprints: [], story: false,
    reveals: [{ id: "demo_cairn_hint", label: "Marked cairn bearing", category: "hint", position: { x: 180, y: -125, z: -110 }, radius: 60 }],
  },
  demo_cairn_survey: {
    label: "Cairn survey log", site: "demo_survey_cairn", region: "suspended_garden", size: "log",
    gates: ["demo_cairn_terminal"], blueprints: ["bp_outpost_standard"], story: false,
    reveals: [
      { id: "demo_vault", label: "Instrument vault", category: "site", position: { x: 230, y: -185, z: -265 }, radius: 80 },
      { id: "demo_ridge_arch", label: "Ridge arch", category: "landmark", position: { x: 205, y: -150, z: -190 }, radius: 50 },
    ],
  },
  demo_vault_archive: {
    label: "Vault archive", site: "demo_sealed_vault", region: "silt_basin", size: "archive",
    gates: ["demo_vault_terminal", "demo_vault_log"], blueprints: ["bp_outpost_advanced"], story: true,
    reveals: [],
  },
} as const satisfies Record<string, DecodableDefinition>;
export type DecodableId = keyof typeof DECODABLES;
export const DECODABLE_IDS = Object.keys(DECODABLES) as DecodableId[];
export const isDecodable = (id: unknown): id is DecodableId =>
  typeof id === "string" && Object.hasOwn(DECODABLES, id);

/** One step of the main path as the decode check sees it: what it grants, and
 * which decodes it needs. Demo data; the coordinator feeds P1's real route. */
export interface MainPathStep {
  id: string;
  grants: readonly string[];
  needsDecoded: readonly string[];
}
export const DEMO_MAIN_PATH: readonly MainPathStep[] = [
  { id: "pod_checklist", grants: ["bp_pod_checklist"], needsDecoded: [] },
  { id: "workshop", grants: ["bp_island_workshop", "bp_field_outpost"], needsDecoded: [] },
  { id: "workshop_signal_rack", grants: ["bp_decoder", "bp_signal_relay"], needsDecoded: [] },
  { id: "basin_vault", grants: [], needsDecoded: ["demo_vault_archive"] },
];
