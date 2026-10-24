/** LS-1: the lost sites (docs/build/streams/LS-1.md, §2), lifted from the content
 * bible's proposals and the LS-1 plan. Story-neutral; the lore owner's canon
 * notes stay in docs/spoilers/.
 *
 * - `CB_LOST_SITES` stand in the world now (exterior, on the composed floor).
 * - `DEFERRED_LOST_SITES` are authored but wait for their place: a cave biome, the
 *   reef caves (LS-1 stage 2) or the story structure. They are never found and
 *   none of their reveals or notes shows until the row moves into the placed table.
 * - Reveals name their target (`RevealTarget`); one whose target is not in the
 *   world yet is withheld until it is (`decodes.ts`, `revealPlaced`).
 * - Doors (`CODED_DOORS`) are coded doors whose code a decode makes readable. A
 *   door that is not placed shows no code. The keypad itself is stage 1b. */
import type { RegionId } from "../registry.js";
import { SOURCES } from "../registry.js";
import { SITES } from "../regions/sites.js";
import type { BeaconCategory } from "./navigation.js";

type Point = { x: number; y: number; z: number };
export type SitePath = "main" | "near" | "off";
/** What gives a site away before you reach it. Stage 3 builds it; stage 2's
 * listening array hears `sound` ones. `sound` is the caption-equivalent text:
 * what the sound is like, never the site's name or its solution. */
export interface SiteTell { kind: "light" | "sound" | "silhouette"; range: number; sound?: string }
export interface LostSiteDefinition {
  label: string;
  region: RegionId;
  position: Point;
  /** What you see there, before any decode. */
  see: string;
  /** The short text readable on site without a decoder (a sign, a stencil, a board). */
  plate: string;
  path: SitePath;
  tell: SiteTell;
}

export type RevealTargetKind = "lost-site" | "cave" | "site" | "source";
/** What a decoded map points at: a lost site (`CB_LOST_SITES`), an authored cave
 * (`CAVE_SOURCES` once in the world), a world site (`regions/sites.ts`) or a
 * registry source. */
export interface RevealTarget { kind: RevealTargetKind; id: string }
export interface RevealDefinition {
  id: string;
  label: string;
  category: Exclude<BeaconCategory, "player" | "outpost">;
  target: RevealTarget;
  position: Point;
  /** Chart radius in metres revealed around the point. */
  radius: number;
}

const siteAt = (id: string): Point => {
  const s = SITES.find((x) => x.id === id);
  if (!s) throw new Error(`lost sites: no world site ${id}`);
  return { x: s.at.x, y: typeof s.at.y === "number" ? s.at.y : 0, z: s.at.z };
};
const sourceAt = (id: keyof typeof SOURCES): Point => ({ ...SOURCES[id].position });
const site = (id: string, label: string, category: RevealDefinition["category"], radius: number): RevealDefinition =>
  ({ id: `site:${id}`, label, category, target: { kind: "site", id }, position: siteAt(id), radius });
const cave = (id: string, label: string, mouth: Point, radius = 50): RevealDefinition =>
  ({ id: `cave:${id}`, label, category: "site", target: { kind: "cave", id }, position: mouth, radius });

export const CB_LOST_SITES = {
  reef_pumphouse_site: { label: "Old intake pump house", region: "refuge_reef", position: { x: -380, y: -23.47, z: -20 }, path: "near",
    see: "A dead console behind a hanging door; a pressure log cabinet sealed with fan growth.",
    plate: "INTAKE 1. Keep the mouth clear.", tell: { kind: "silhouette", range: 120 } },
  isles_strain_gauges: { label: "Strain gauge line", region: "island_chain", position: { x: 345, y: -45.41, z: 70 }, path: "near",
    see: "Six anchored gauges in a row across the scar's edge, the last two bent over, a logger housing clamped to the first.",
    plate: "Gauges 1 to 6. Gauge 4: RECAL.", tell: { kind: "silhouette", range: 150 } },
  canopy_basket_site: { label: "Fallen tether basket", region: "suspended_garden", position: { x: 760, y: -108.62, z: -100 }, path: "near",
    see: "A log unit clamped in the basket frame, its screen dark.",
    plate: "TETHER CREW · CROWN 7.", tell: { kind: "silhouette", range: 140 } },
  basin_pump_heads_site: { label: "Pump-head field", region: "silt_basin", position: { x: 240, y: -260.21, z: -760 }, path: "near",
    see: "A sealed field cabinet on the central pump head.",
    plate: "Quota board: 40, 52, 61, 70.", tell: { kind: "silhouette", range: 100 } },
  rift_borehole_site: { label: "Core borehole rig", region: "thermal_rift", position: { x: -420, y: -251.36, z: -900 }, path: "off",
    see: "A field hut by the rig, its logger dark and its vent pipe still warm.",
    plate: "CORE RIG 2. Keep the vent pipe clear.",
    tell: { kind: "sound", range: 60, sound: "A steady hiss of venting water, somewhere near." } },
  divide_mixing_site: { label: "Mixing-line station", region: "brine_divide", position: { x: 880, y: -379.2, z: -1150 }, path: "near",
    see: "A sensor house at the foot of a buoy chain, its logger sealed.",
    plate: "FAULTY. Return to the ridge vault for calibration.",
    tell: { kind: "sound", range: 120, sound: "A slow metallic clank, like a chain against a float." } },
  meridian_allotments_site: { label: "Terrace allotments", region: "deep_district", position: { x: 1150, y: -600.03, z: -1250 }, path: "near",
    see: "A rota board with a sealed data tag on the allotment post.",
    plate: "Rota. Last crop: READY.", tell: { kind: "light", range: 80 } },
  hub_keepers_racks: { label: "Keeper's racks", region: "silt_basin", position: { x: 175, y: -48, z: -462 }, path: "main",
    see: "Three tiers of grow racks bolted up the step's sunward face, gone wild, under a dead grow-lamp pole.",
    plate: "Cups on the top tier, fans below, fronds in the shade.", tell: { kind: "silhouette", range: 150 } },
  // W2's beacon house (regions/sites.ts `hub.beacon_house`): its lamp is the hub's lit
  // beacon; the find point is its door. Inside: the keeper's chart room.
  hub_beacon_house: { label: "Beacon house", region: "silt_basin", position: { x: 341, y: -48, z: -571.5 }, path: "near",
    see: "The keeper's chart room inside the beacon house door: a wall chart with unlabelled pins, a bunk, a sealed chart cabinet.",
    plate: "Beacon keeper. Lamp checks at dusk.", tell: { kind: "light", range: 400 } },
} as const satisfies Record<string, LostSiteDefinition>;
export type PlacedLostSiteId = keyof typeof CB_LOST_SITES;
const lost = (id: PlacedLostSiteId, label: string, category: RevealDefinition["category"], radius: number): RevealDefinition =>
  ({ id: `lost:${id}`, label, category, target: { kind: "lost-site", id }, position: { ...CB_LOST_SITES[id].position }, radius });

/** Coded doors: a decode makes the code readable; the keypad (stage 1b) opens the door.
 * Door IDs are stable facts: never renamed or deleted. `placed` is false until its
 * owner builds the door; until then no code shows anywhere (the code-bearing log line
 * names its door, and `readableLog` withholds it). */
export type DoorId = "island.cold_store_hatch" | "basin.vault_door";
/** Most coded doors ask for a little deduction (owner, 2026-10-24): part of the code is
 * at the door (`atDoor`, its stencil or plate) and the decoded record gives the rest. The
 * first door, the cold-store hatch, teaches the keypad with a straight code. Nothing is
 * memorised: the door's part is in front of you at the keypad, the record's part stays
 * in the journal. The main path never needs a door. */
export interface CodedDoor {
  label: string; code: string; record: string; owner: string; placed: boolean;
  /** Deduction doors: the code's characters shown at the door, `·` for the ones the record gives. */
  atDoor?: string;
  /** Deduction doors: the journal's line for what the record gives. */
  clue?: string;
}
export const CODED_DOORS: Record<DoorId, CodedDoor> = {
  "island.cold_store_hatch": { label: "Cold store hatch", code: "4417", record: "isles_gauge_logger", owner: "OP-1", placed: false },
  "basin.vault_door": { label: "Ridge vault door", code: "2093", record: "divide_mixing_logger", owner: "the Basin vault biome", placed: false,
    atDoor: "20··", clue: "The return slip gives the code's last two digits, 9-3; the first two are stencilled on the vault door." },
};
/** A decoded log line; one that carries a door's code names the door. */
export type LogLine = string | { readonly text: string; readonly door: DoorId };

export interface LostSiteDecodable {
  label: string;
  site: string;
  region: RegionId;
  size: "fragment" | "log" | "archive" | "core";
  /** Records unreadable until decoded: the site's own terminal or logger, and any found notes it holds. */
  gates: readonly string[];
  blueprints: readonly string[];
  reveals: readonly RevealDefinition[];
  story: false;
  logs: readonly LogLine[];
}

export const CB_DECODABLES = {
  reef_pumphouse_log: {
    label: "Pump house log", site: "reef_pumphouse_site", region: "refuge_reef", size: "log",
    gates: ["reef_pumphouse_terminal", "note_reef_season"], blueprints: ["bp_small_fabricator"], story: false,
    reveals: [
      cave("reef_lantern_grotto", "Lantern grotto", { x: -470, y: -43.5, z: -110 }),
      site("hub.crown", "Spur crown bearing", "hint", 90),
    ],
    logs: [
      "Commissioning notes from the expedition's first year: the intake ran clean, and the crew was cheerful about it.",
      "A rota of complaints that fans keep colonising the intake mouth faster than anyone expected.",
      "A shorter later entry moving the intake east, to the ribs, 'where the water is better'.",
    ],
  },
  isles_strain_gauge_log: {
    label: "Gauge logger", site: "isles_strain_gauges", region: "island_chain", size: "log",
    gates: ["isles_gauge_logger", "note_tide_sheet"], blueprints: [], story: false,
    reveals: [
      cave("isles_storm_arch", "Storm arch", { x: 1130, y: -14.3, z: 134 }, 60),
      { ...cave("isles_headland_root", "Root stair under the headland", { x: 1012, y: -31.8, z: -72 }, 60), category: "hint" },
    ],
    logs: [
      "Two years of strain readings, flat and then climbing.",
      "Recalibration notes that call the climb instrument drift.",
      "A last technician's entry asking for a slope review, with no reply attached.",
      { text: "A stores note: spare gauges and the slope sheets are in the west island station's cold store. Door code 4-4-1-7.", door: "island.cold_store_hatch" },
    ],
  },
  canopy_basket_log: {
    label: "Tether crew log", site: "canopy_basket_site", region: "suspended_garden", size: "log",
    gates: ["canopy_basket_unit", "note_tether_aside"], blueprints: ["bp_outpost_standard"], story: false,
    reveals: [
      cave("canopy_lantern_hall", "Lantern hall", { x: 520, y: -175.8, z: -230 }),
    ],
    logs: [
      "Tether inspections crown by crown, with a running joke about the hunter, which the crew call the singer.",
      "A note that the small fish have moved up out of the lower channel this season.",
      "A field-outpost layout the crew used on their longer inspection runs.",
    ],
  },
  basin_pumphead_log: {
    label: "Pump-head field log", site: "basin_pump_heads_site", region: "silt_basin", size: "log",
    gates: ["basin_pumphead_cabinet", "note_fall_survey"], blueprints: [], story: false,
    reveals: [
      // The reveal live since C4 keeps its ID and point, so decoded saves keep their beacon.
      { id: "basin_stop_rift_station", label: "Materials station", category: "stop", target: { kind: "site", id: "rift.materials_station" },
        position: { x: 135.6, y: -262, z: -920 }, radius: 60 },
      cave("basin_west_rim", "West rim cut", { x: 230, y: -261.1, z: -810 }, 60),
    ],
    logs: [
      "Two seasons of extraction quotas, each higher than the last.",
      "Pump pressure logs with notes about the sediment 'settling oddly'.",
      "A crew request to slow the west rim pumps, marked as declined.",
      "Calibration requests for the pump sensors, filed to 'the ridge vault'.",
    ],
  },
  rift_borehole_log: {
    label: "Drill logger", site: "rift_borehole_site", region: "thermal_rift", size: "log",
    gates: ["rift_borehole_logger", "note_drill_crew"], blueprints: [], story: false,
    reveals: [
      cave("rift_west_tube", "West tube", { x: -300, y: -287.5, z: -1000 }),
    ],
    logs: [
      "Core sample depths and heat readings, shift by shift.",
      "How the crew piped vent heat into the field hut so they could stay out a week, and grew tubers in a warm box by the pipe.",
      "A map sketch of a tube running east under the flank 'all the way to the cold'.",
    ],
  },
  divide_mixing_log: {
    label: "Mixing-line logger", site: "divide_mixing_site", region: "brine_divide", size: "archive",
    gates: ["divide_mixing_logger", "note_mixing_aside"], blueprints: [], story: false,
    reveals: [
      cave("divide_brine_cistern", "Brine cistern", { x: 930, y: -446, z: -1200 }, 60),
    ],
    logs: [
      "Brine profiles along the mixing line, with dense-water spikes flagged in red.",
      "Maintenance tickets replacing the 'faulty' sensors that kept reporting them.",
      "A diver's aside: the sails moved lanes that month.",
      { text: "A return slip for the replaced sensors, sent to the ridge vault for calibration, signed off with the vault's code: '…9-3, the rest's on the door'.", door: "basin.vault_door" },
    ],
  },
  meridian_allotment_log: {
    label: "Allotment rota", site: "meridian_allotments_site", region: "deep_district", size: "log",
    gates: ["meridian_allotment_tag", "note_allotment_margin"], blueprints: [], story: false,
    reveals: [
      cave("meridian_escarp_culvert", "Escarpment culvert", { x: 1370, y: -509.6, z: -960 }, 60),
      cave("meridian_window_gallery", "Terrace window gallery", { x: 1010, y: -520, z: -1290 }, 60),
    ],
    logs: [
      "A planting rota with names in rotation and small complaints in the margins.",
      "A note that the night shift's lamps keep the garden awake.",
      "The last entry's crop is listed as 'ready', never collected.",
    ],
  },
  hub_keeper_garden_tag: {
    label: "Keeper's garden tag", site: "hub_keepers_racks", region: "silt_basin", size: "log",
    gates: ["hub_keeper_garden_notes"], blueprints: [], story: false,
    reveals: [
      { id: "source:canopy_lumen_bulbs", label: "Lumen bulbs", category: "hint", target: { kind: "source", id: "canopy_lumen_bulbs" },
        position: sourceAt("canopy_lumen_bulbs"), radius: 70 },
      { id: "source:basin_pale_spores", label: "Pale crust spores", category: "hint", target: { kind: "source", id: "basin_pale_spores" },
        position: sourceAt("basin_pale_spores"), radius: 70 },
    ],
    logs: [
      "Feed the trays with scavenger casts and a little crushed fall bone. Once a crop, no more.",
      "Cups took on the top tier, fans below them, fronds only in the shade. The bulbs from the Canopy rim never liked the light up here.",
      "The core crew down the Rift swear by vent heat for their tubers. Worth a look when the lamp's fixed.",
    ],
  },
  hub_beacon_archive: {
    label: "Beacon chart archive", site: "hub_beacon_house", region: "silt_basin", size: "archive",
    gates: ["hub_chart_cabinet", "note_beacon_keeper"], blueprints: [], story: false,
    reveals: [
      site("basin.dish_field", "Dish field", "landmark", 120),
      site("canopy.east_crowns", "Lantern crowns", "landmark", 120),
      site("rift.split_chimney", "Split chimney", "landmark", 120),
      site("divide.gateworks", "Gateworks", "landmark", 120),
      site("meridian.spire", "Signal spire", "landmark", 120),
      lost("rift_borehole_site", "Core rig bearing", "hint", 150),
      lost("divide_mixing_site", "Mixing line bearing", "hint", 150),
    ],
    logs: [
      "The expedition's beacon plan for the whole basin, one light per landmark.",
      "A maintenance list of which beacons failed first, and where.",
      "Field stations the keeper resupplied: a core rig on the Rift's cool flank, and a mixing-line house in the Divide's lee.",
    ],
  },
} as const satisfies Record<string, LostSiteDecodable>;

/** Authored, not yet in the world: each waits on `blockedBy`. Their decodes join
 * `CB_DECODABLES` when the row is placed; until then nothing here is findable. */
export const DEFERRED_LOST_SITES = {
  isles_tide_store: { label: "Yard tide store", region: "island_chain", blockedBy: "the Isles cave biome (isles_undercroft)",
    decodes: [{ id: "isles_tide_store_fragment", size: "fragment", gates: ["isles_tide_store_sleeve", "note_trapper_tally"] }] },
  canopy_root_specimen_store: { label: "Root specimen store", region: "suspended_garden", blockedBy: "BIO-1 (canopy_rootways)",
    decodes: [{ id: "canopy_roots_store_archive", size: "archive", gates: ["canopy_roots_catalogue"] }] },
  basin_instrument_vault: { label: "Sealed instrument vault", region: "silt_basin", blockedBy: "the Basin vault biome (basin_ridge_vaults)",
    decodes: [{ id: "basin_vault_archive", size: "archive", gates: ["basin_vault_terminal", "basin_vault_profiles", "note_basin_tray"] }] },
  seam_drainage_panel: { label: "Drainage panel", region: "thermal_rift", blockedBy: "the Rift–Divide seam biome and the story structure",
    decodes: [{ id: "seam_drainage_schematic", size: "core", gates: ["seam_drainage_panel"] }] },
  reef_school_route1: { label: "Dive-school slate, route 1", region: "refuge_reef", blockedBy: "LS-1 stage 2 (reef_archlet, after CW-1)",
    decodes: [{ id: "reef_school_route1_tag", size: "fragment", gates: ["reef_school_route1"] }] },
  reef_school_route2: { label: "Dive-school tag, route 2", region: "refuge_reef", blockedBy: "LS-1 stage 2 (reef_bellhole, after CW-1)",
    decodes: [{ id: "reef_school_route2_tag", size: "fragment", gates: ["reef_school_route2"] }] },
  reef_school_route3: { label: "Dive-school tag, route 3", region: "refuge_reef", blockedBy: "LS-1 stage 2 (reef_lantern_grotto, after CW-1)",
    decodes: [{ id: "reef_school_route3_tag", size: "fragment", gates: ["reef_school_route3"] }] },
} as const satisfies Record<string, { label: string; region: RegionId; blockedBy: string;
  decodes: readonly { id: string; size: LostSiteDecodable["size"]; gates: readonly string[] }[] }>;
