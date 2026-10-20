/** S5 story content: every discoverable story item by stable ID. C01–C06 keep their
 * player text in content/registry.ts; this file adds their story metadata and the
 * full text of C07–C15, technical records and optional personal journals.
 * IDs and labels are safe to show before they are found; meaning lives in the text. */
import type { BlueprintId, EvidenceId, MaterialId, PlaceId, RegionId } from "../registry.js";

/** Proposed sites beyond the registry PLACES. Region author (S2) places them; see sites.ts. */
export type StorySiteId =
  | PlaceId
  | "rift_materials_station"
  | "divide_upper_dock"
  | "divide_turbine_hall"
  | "splitspine_field_shelter"
  | "splitspine_headland_gantry"
  | "canopy_lower_fins"
  | "basin_service_rack"
  | "meridian_shelf"
  | "meridian_upper_hall"
  | "meridian_transfer_hall"
  | "meridian_medical_annex"
  | "meridian_gate_hall"
  | "meridian_service_window"
  | "meridian_inner_hall";

export type StoryEvidenceId = EvidenceId | "C07" | "C08" | "C09" | "C10" | "C11" | "C12" | "C13" | "C14" | "C15";
/** Durable technical records: non-optional, never personal. */
export type RecordId =
  | "rift_station_ledger" | "gate_panel" | "district_controller" | "inner_roster"
  | "pod_checklist" | "gantry_plates" | "fin_survey_post" | "basin_service_rack";
/** Optional personal journals. They deepen people and motives and never gate anything. */
export type JournalId =
  | "mara_reef_note"
  | "mara_specimen_tray"
  | "ren_access_log"
  | "iona_ledger_note"
  | "outside_names"
  | "mara_last_page";
export type DiscoveryId = StoryEvidenceId | RecordId | JournalId;

export type Medium = "physical" | "record" | "ecological" | "witness" | "telemetry" | "voice";
/** T0 opening · T1 early regional · T2 interpretation-changing · T3 explicit resolution. */
export type Tier = 0 | 1 | 2 | 3;

/** Proposed blueprint IDs added by the story. Registry blueprints keep their own IDs. */
export type StoryBlueprintId =
  | "bp_deep_service"
  | "bp_service_power"
  | "bp_service_air"
  | "bp_works_hall"
  | "bp_food_module"
  | "bp_pod_buffer";

export interface StoryItemMeta {
  site: StorySiteId;
  region: RegionId;
  tier: Tier;
  media: readonly Medium[];
  optional: boolean;
}
export interface StoryText {
  label: string;
  observation: string;
  provenance: string;
  /** First reading, labelled as a hypothesis until later facts replace it. */
  reading: string;
}

/** Story metadata for every evidence ID, including the registry's C01–C06. */
export const EVIDENCE_META = {
  C01: { site: "home_pod", region: "refuge_reef", tier: 0, media: ["physical"], optional: false },
  C02: { site: "reef_ribs", region: "refuge_reef", tier: 1, media: ["ecological", "physical"], optional: false },
  C03: { site: "island_workshop", region: "island_chain", tier: 1, media: ["record", "physical"], optional: false },
  C04: { site: "canopy_lab", region: "suspended_garden", tier: 1, media: ["ecological", "record"], optional: false },
  C05: { site: "basin_dormitory", region: "silt_basin", tier: 1, media: ["physical", "witness"], optional: false },
  C06: { site: "basin_boundary_station", region: "silt_basin", tier: 2, media: ["telemetry", "physical"], optional: false },
  C07: { site: "divide_upper_dock", region: "brine_divide", tier: 2, media: ["physical", "record"], optional: false },
  C08: { site: "meridian_transfer_hall", region: "deep_district", tier: 2, media: ["record", "physical"], optional: false },
  C09: { site: "meridian_gate_hall", region: "deep_district", tier: 2, media: ["voice", "record"], optional: false },
  C10: { site: "meridian_medical_annex", region: "deep_district", tier: 2, media: ["record"], optional: false },
  C11: { site: "splitspine_field_shelter", region: "island_chain", tier: 2, media: ["record", "ecological"], optional: false },
  C12: { site: "divide_turbine_hall", region: "brine_divide", tier: 3, media: ["voice", "telemetry"], optional: false },
  C13: { site: "meridian_service_window", region: "deep_district", tier: 3, media: ["telemetry", "physical"], optional: false },
  C14: { site: "home_pod", region: "refuge_reef", tier: 3, media: ["record", "telemetry"], optional: false },
  C15: { site: "meridian_inner_hall", region: "deep_district", tier: 3, media: ["witness"], optional: true },
} as const satisfies Record<StoryEvidenceId, StoryItemMeta>;

/** Player text for the evidence the story adds. Shown only once found. */
export const STORY_EVIDENCE = {
  C07: {
    label: "Empty launch cradle",
    observation:
      "A cradle shaped to the pod's hull sits at the foot of a launch rail. The guide shoes are scored upward. The dock's staff register lists one access engineer for gates and pressure service: Ren.",
    provenance: "Mirror Divide upper service dock / launch rail, cradle fittings, staff register",
    reading:
      "Another pod launched from here, or mine did. The register makes Ren an engineer with routine access, nothing more yet.",
  },
  C08: {
    label: "Transfer board",
    observation:
      "The board counts 198 arrivals, six outside assignments and 192 bed reservations. Beside it, a gate actuator is locked under a stamped override seal: REN · ACCESS.",
    provenance: "Meridian transfer hall / D0 +04:55 transfer board; actuator override seal",
    reading:
      "A roster for confinement, or an emergency shelter? The seal puts my hand on that gate before I know why.",
  },
  C09: {
    label: "Return gate control",
    observation:
      "The control log holds an authenticated order in Ren's voice: “Close the return.” The schematic shows the outer lock crushed under the slope, and a hydraulic service pipe far too narrow for a person. Its service note gives the order: independent power and air, isolate the diversion, equalize through the pipe, then open.",
    provenance: "Meridian gate hall / D0 +05:12 command log; gallery schematic",
    reading: "Murder, coercion or triage? The log gives the order and the time, not the reason.",
  },
  C10: {
    label: "Annex protocol",
    observation:
      "A consent ledger, signed name by name. A long-suspension protocol sets its vital-sign alarms far below waking norms. Dr. Iona Vale's estimates are crossed out and revised in the same hand.",
    provenance: "Meridian medical annex / suspension protocol, consent ledger, D0 +06:30 revisions",
    reading:
      "A failed experiment, or a refuge built to run on very little air? Whatever it was, the ledger says they chose it.",
  },
  C11: {
    label: "Ridge surveys",
    observation:
      "Mara Sen's surveys show the sediment ridge thinning under the extraction quota lines. Her predictions are revised twice, each sooner than the last. The final one is dated the week of the storm.",
    provenance: "Splitspine field shelter / ridge surveys D−730 to D−6; revised predictions",
    reading: "Mara saw the ridge failing and was not believed, or was wrong about how fast. Possibly both.",
  },
  C12: {
    label: "Turbine hall recorder",
    observation:
      "The backup recorder holds the whole gate sequence. Pressure falls to the documented threshold. Ren asks for the service-pipe option and is refused: it would drain the reserve before the occupied galleries are safe. Voices from the return gallery ask for two more minutes. Nobody else gives an order on the channel. Then Ren: “Close the return.” A minute later the gallery trace floods. Six transponders go quiet.",
    provenance: "Mirror Divide turbine hall / D0 +05:04 to +05:13 recorder and pressure trace",
    reading:
      "It explains the order. It cannot say whether two more minutes would have saved six people or cost everyone else.",
  },
  C13: {
    label: "Lower service window",
    observation:
      "Behind thick glass, rows of sealed beds hold a steady blue light. The window's panel addresses each one: 191 report living occupants. One slot is empty. Its tag reads REN · ACCESS.",
    provenance: "Meridian lower service window / live bed telemetry",
    reading:
      "They did not leave and they did not all die. They are asleep under the settlement, and I was one of them.",
  },
  C14: {
    label: "Restored dispatch buffer",
    observation:
      "The repaired buffer plays its last dispatch: exterior clearance confirmed, one repair specialist cleared to wake, pod launched from the Divide dock on day 2,678. Then a regulator fault, and nineteen minutes of thin air on the way up.",
    provenance: "Home pod / dispatch buffer, D+2,678 launch log",
    reading:
      "Nobody took my memory. Seven years and four months below, a failing regulator, a hard ascent. What I lost, I lost on the way up.",
  },
  C15: {
    label: "Note on a bed frame",
    observation:
      "Taped to the empty bed, in Tavi Orr's hand: “I will not forgive you. I checked your seals twice. Wake up anyway.” Beneath it, the bed's settings, corrected by hand where the default would have failed.",
    provenance: "Meridian inner hall / Tavi Orr, before suspension",
    reading: "Tavi blamed me, and kept me alive. Both are true.",
  },
} as const satisfies Record<Exclude<StoryEvidenceId, EvidenceId>, StoryText>;

export const RECORDS = {
  rift_station_ledger: {
    label: "Materials station ledger",
    site: "rift_materials_station",
    region: "thermal_rift",
    tier: 2,
    media: ["record"],
    optional: false,
    observation:
      "Ceramic and core output, and above them the brine quota: tripled in two years along the Basin's supporting ridge. A margin note, initialled M. Sen, asks who signed the fracture reports off as instrument faults. Deep-service rings ship south to the Divide's upper dock.",
    provenance: "Ember Rift materials station / production ledger D−730 to D−2",
    reading: "The settlement was digging under its own foundations, and someone said so in the margin.",
  },
  gate_panel: {
    label: "Return gate panel",
    site: "meridian_gate_hall",
    region: "deep_district",
    tier: 2,
    media: ["telemetry", "record"],
    optional: false,
    observation:
      "The panel still runs. The sealed compartment draws all its supply through the turbine diversion. The outer lock reads crushed. The hydraulic pipe is rated for water only. A service procedure is listed: stage independent power and air, isolate the diversion, equalize the gallery through the hydraulic pipe, then open the human route. Its log is mirrored to the turbine hall recorder.",
    provenance: "Meridian gate hall / live machinery panel and service procedure",
    reading: "Whatever is sealed in there still depends on that diversion. Opening the gate wrongly would flood it.",
  },
  district_controller: {
    label: "District controller",
    site: "meridian_service_window",
    region: "deep_district",
    tier: 3,
    media: ["record", "telemetry"],
    optional: false,
    observation:
      "A maintenance controller, not a voice. Its recovery summary: extraction load on the supporting ridge, 14 fracture alarms in two years, each closed as an instrument fault; storm load; slope collapse; mast lost; brine saddle breached; dense, oxygen-poor water in the extraction circuits; 20 dead in the first hour. 198 consolidated; six outside assignments did not return; 192 beds reserved. Return gate closed by access engineer Ren at the documented threshold; service-pipe option rejected. Outer lock crushed; hydraulic pipe not person-rated; isolating the diversion requires independent power and air; equalize through the pipe before opening. 192 entered suspension. Day 2,678: exterior viable, repair specialist dispatched; regulator fault logged on ascent. 191 occupants within thresholds. Bed 192, access engineer Ren: vacated at dispatch. Unknown: whether a later closure would have been survivable.",
    provenance: "Meridian lower service window / district controller recovery summary",
    reading: "Everything the machines knew, in one list. It does not judge, and it says what it cannot know.",
  },
  inner_roster: {
    label: "Inner hall roster",
    site: "meridian_inner_hall",
    region: "deep_district",
    tier: 3,
    media: ["physical", "record"],
    optional: false,
    observation:
      "Bed by bed, the hall's printed roster matches the window: 191 occupied, sealed and within thresholds. One frame stands open and empty, tagged REN · ACCESS. At the foot of the roster, six names are struck through: outside assignments, not returned.",
    provenance: "Meridian inner hall / printed bed roster and bed seals",
    reading: "The window was not lying. Every one of them is here.",
  },
  pod_checklist: {
    label: "Pod service checklist",
    site: "home_pod",
    region: "refuge_reef",
    tier: 0,
    media: ["record"],
    optional: false,
    recovery: true,
    observation: "A laminated checklist clipped inside the locker: regulator, bench and suit fittings, each with its parts listed.",
    provenance: "Home pod / locker service checklist",
    reading: "Whoever packed this pod expected it to need repairs.",
  },
  gantry_plates: {
    label: "Gantry fabrication plates",
    site: "splitspine_headland_gantry",
    region: "island_chain",
    tier: 1,
    media: ["record", "physical"],
    optional: false,
    recovery: true,
    observation:
      "Plates riveted inside the headland gantry housing duplicate the workshop's fabrication set: scout hull frames, bench service, and the island half of a carrier frame survey.",
    provenance: "Splitspine headland gantry / riveted fabrication plates",
    reading: "A second copy of the workshop's plans, kept where the cranes worked.",
  },
  fin_survey_post: {
    label: "Fin survey post",
    site: "canopy_lower_fins",
    region: "suspended_garden",
    tier: 1,
    media: ["record"],
    optional: false,
    recovery: true,
    observation:
      "A survey post among the lower grounding fins keeps the laboratory's bracing sheets: suit and hull reinforcement from fin crust and cured resin.",
    provenance: "Lantern Canopy lower fins / survey post sheets",
    reading: "The laboratory's reinforcement work, copied where the crust was gathered.",
  },
  basin_service_rack: {
    label: "Basin service rack",
    site: "basin_service_rack",
    region: "silt_basin",
    tier: 1,
    media: ["record", "physical"],
    optional: false,
    recovery: true,
    observation:
      "A pressure-sleeved rack on the first shelf holds Creel interior and service plans and the Basin half of the carrier frame survey.",
    provenance: "Pale Basin first shelf / service rack",
    reading: "The yard kept its own copies of the work-sub and carrier plans.",
  },
} as const satisfies Record<RecordId, StoryItemMeta & Omit<StoryText, "label"> & { label: string; recovery?: true }>;
/** Recovery records duplicate progression plans locally; they carry no story facts. */
export const isRecovery = (id: DiscoveryId): boolean =>
  Object.hasOwn(RECORDS, id) && "recovery" in RECORDS[id as RecordId];

/** Optional personal journals. `mara_reef_note` keeps its text in the registry. */
export const JOURNALS = {
  mara_reef_note: { site: "reef_ribs", region: "refuge_reef", label: "Mara’s field note", text: null },
  mara_specimen_tray: {
    site: "canopy_lab",
    region: "suspended_garden",
    label: "Mara’s specimen tray",
    text: "Mara Sen / tray 14: “The fans close an hour before the dense water arrives. I've timed it four times. I'll time it a fifth, and then I'll stop calling it a coincidence.”",
  },
  ren_access_log: {
    site: "divide_upper_dock",
    region: "brine_divide",
    label: "Ren’s access log",
    text: "Ren / access log. D−3: “Return gate cycled. Seals good. Turbine shoes worn; flagged.” D−1: “Flagged.” D0 +03:52: “Taking the return gate. Don't wait for me to call it.”",
  },
  iona_ledger_note: {
    site: "meridian_medical_annex",
    region: "deep_district",
    label: "Iona’s note to the ledger",
    text: "Iona Vale / note to the ledger: “My first estimate was wrong. It's 198, if the outer galleries flood. I'm writing the number down so nobody can say later it was a feeling.”",
  },
  outside_names: {
    site: "meridian_inner_hall",
    region: "deep_district",
    label: "Names by the inner door",
    text: "Six names scratched beside the inner door, in several hands: Adaeze Okafor. Piet Lindqvist. Sana Ruiz. Joon Park. Hollis Varga. Teo Marsh. Under them: “Outside assignments. We closed the door.”",
  },
  mara_last_page: {
    site: "splitspine_field_shelter",
    region: "island_chain",
    label: "Mara’s last page",
    text: "Mara Sen / last page: “I said years, to people who wanted months. I should have said days and let them laugh.”",
  },
} as const satisfies Record<JournalId, { site: StorySiteId; region: RegionId; label: string; text: string | null }>;

/** Proposed blueprint grants for story discoveries, beyond the registry's
 * EVIDENCE_BLUEPRINTS for C01–C06. Every progression-critical plan has two or more
 * non-optional sources. Journals and optional evidence never grant anything. */
export const STORY_GRANTS = {
  C06: [],
  C07: ["bp_deep_service", "bp_service_power", "bp_pod_buffer"],
  C08: ["bp_service_air", "bp_works_hall"],
  C09: ["bp_service_power"],
  C10: ["bp_service_air", "bp_food_module"],
  rift_station_ledger: ["bp_deep_service", "bp_rift_pressure"],
  gate_panel: ["bp_service_power", "bp_service_air"],
  district_controller: ["bp_works_hall", "bp_food_module"],
  pod_checklist: ["bp_pod_checklist"],
  gantry_plates: ["bp_island_workshop", "bp_carrier_workshop"],
  fin_survey_post: ["bp_canopy_reinforcement"],
  basin_service_rack: ["bp_creel_service", "bp_carrier_basin"],
} as const satisfies Partial<Record<DiscoveryId, readonly (StoryBlueprintId | BlueprintId)[]>>;

export const STORY_BLUEPRINT_LABELS = {
  bp_deep_service: "Deep service package · 800 m hull and suit",
  bp_service_power: "Portable service power assembly",
  bp_service_air: "Portable air staging assembly",
  bp_works_hall: "Upper hall restoration",
  bp_food_module: "Communal food module",
  bp_pod_buffer: "Pod dispatch buffer",
} as const satisfies Record<StoryBlueprintId, string>;

/** Proposed costs for the coordinator's recipe registry, from the eight shared
 * materials only. Assemblies are fabricated at a workshop or the carrier bay and
 * carried; the hall and food module are restored on site from carried stock. */
export const STORY_RECIPES = {
  service_power_assembly: {
    bp: "bp_service_power",
    cost: { thermal_core: 2, conductive_crust: 4, structural_alloy: 2 },
    site: "workshop_or_carrier",
    cu: 6,
  },
  service_air_assembly: {
    bp: "bp_service_air",
    cost: { brine_lattice: 2, flex_membrane: 4, silica_glass: 2 },
    site: "workshop_or_carrier",
    cu: 6,
  },
  restore_upper_hall: {
    bp: "bp_works_hall",
    cost: { structural_alloy: 6, silica_glass: 4, flex_membrane: 4, buoyant_resin: 2 },
    site: "meridian_upper_hall",
    cu: 22,
  },
  restore_food_module: {
    bp: "bp_food_module",
    cost: { flex_membrane: 3, silica_glass: 2, buoyant_resin: 2, conductive_crust: 1 },
    site: "meridian_upper_hall",
    cu: 8,
  },
  pod_buffer: {
    bp: "bp_pod_buffer",
    cost: { silica_glass: 2, conductive_crust: 2 },
    site: "home_pod",
    cu: 0,
  },
} as const satisfies Record<string, {
  bp: StoryBlueprintId;
  cost: Partial<Record<MaterialId, number>>;
  site: StorySiteId | "workshop_or_carrier";
  cu: number;
}>;
export type StoryRecipeId = keyof typeof STORY_RECIPES;

export const isOptional = (id: DiscoveryId): boolean =>
  Object.hasOwn(JOURNALS, id) || (Object.hasOwn(EVIDENCE_META, id) && EVIDENCE_META[id as StoryEvidenceId].optional);
export const DISCOVERY_IDS = [
  ...Object.keys(EVIDENCE_META),
  ...Object.keys(RECORDS),
  ...Object.keys(JOURNALS),
] as DiscoveryId[];
export const siteOf = (id: DiscoveryId): StorySiteId =>
  Object.hasOwn(EVIDENCE_META, id) ? EVIDENCE_META[id as StoryEvidenceId].site
    : Object.hasOwn(RECORDS, id) ? RECORDS[id as RecordId].site
      : JOURNALS[id as JournalId].site;
/** Discoveries that exist only once a story repair is made at their site. */
export const UNLOCKED_BY = { C14: "pod_buffer" } as const satisfies Partial<Record<DiscoveryId, StoryRecipeId>>;
/** The story repairs that can appear in saved state. */
export const STORY_REPAIRS: readonly StoryRecipeId[] = [...new Set(Object.values(UNLOCKED_BY))];
