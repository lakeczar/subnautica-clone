/** Stable saved identifiers. Labels and render mesh names are never saved references.
 * Seeded from WORLD_PROGRESSION / EXPEDITION_INTEGRATION, not a recipe balance. */
export const CONTENT_VERSION = "expedition.6" as const;
import { STORY_BLUEPRINT_LABELS, STORY_RECIPES } from "./story/evidence.js";
import type { StoryBlueprintId } from "./story/evidence.js";
// S9 campaign content: later tiers, carrier, specialists, stops and late sources.
import { CAMPAIGN_BLUEPRINT_LABELS, CAMPAIGN_ITEMS, CAMPAIGN_RECIPES, CAMPAIGN_REFITS, CAMPAIGN_SOURCES, CAMPAIGN_SUITS, CAMPAIGN_TECH_RECORDS } from "./campaign/index.js";
import type { CampaignBlueprintId, CampaignOutput, CampaignSiteId } from "./campaign/index.js";

export const REGIONS = {
  refuge_reef: { label: "Hearth Reef", depth: [0, 65] },
  island_chain: { label: "Splitspine Isles", depth: [-95, 90] },
  suspended_garden: { label: "Lantern Canopy", depth: [55, 220] },
  silt_basin: { label: "Pale Basin", depth: [150, 380] },
  thermal_rift: { label: "Ember Rift", depth: [250, 540] },
  brine_divide: { label: "Mirror Divide", depth: [360, 650] },
  deep_district: { label: "Meridian District", depth: [520, 780] },
} as const;
export type RegionId = keyof typeof REGIONS;

export const MATERIALS = {
  structural_alloy: {
    label: "Structural alloy",
    sources: ["silt_basin", "refuge_reef", "island_chain"],
  },
  silica_glass: {
    label: "Silica glass",
    sources: ["island_chain", "refuge_reef"],
  },
  flex_membrane: {
    label: "Flexible membrane",
    sources: ["refuge_reef", "suspended_garden"],
  },
  conductive_crust: {
    label: "Conductive crust",
    sources: ["suspended_garden", "silt_basin"],
  },
  buoyant_resin: {
    label: "Buoyant resin",
    sources: ["suspended_garden", "island_chain"],
  },
  pressure_ceramic: { label: "Pressure ceramic", sources: ["thermal_rift"] },
  thermal_core: { label: "Thermal core", sources: ["thermal_rift"] },
  brine_lattice: { label: "Brine lattice", sources: ["brine_divide"] },
} as const satisfies Record<
  string,
  { label: string; sources: readonly RegionId[] }
>;
export type MaterialId = keyof typeof MATERIALS;

export const HULLS = {
  dart: {
    label: "Dart",
    role: "scout",
    berth: "compact",
    initialDepth: 180,
    maximumDepth: 350,
  },
  creel: {
    label: "Creel",
    role: "cargo / service",
    berth: "medium",
    initialDepth: 240,
    maximumDepth: 800,
  },
  hush: {
    label: "Hush",
    role: "quiet survey",
    berth: "compact",
    initialDepth: 220,
    maximumDepth: 450,
  },
  spindle: {
    label: "Spindle",
    role: "surface tender",
    berth: "compact",
    initialDepth: 0,
    maximumDepth: 0,
  },
  mantle: {
    label: "Mantle",
    role: "deep service",
    berth: "medium",
    initialDepth: 800,
    maximumDepth: 800,
  },
  hearthline: {
    label: "Hearthline",
    role: "inhabited carrier",
    berth: null,
    initialDepth: 400,
    maximumDepth: 550,
  },
} as const;
export type HullId = keyof typeof HULLS;
/** Conservative upright sweep envelopes enclose the authored hull silhouettes. */
export const HULL_COLLIDERS = {
  dart: { radius: 3.6, height: 2.1 },
  // M2-B1: the drawn workboat is 3.9 × 6.6 m; 3.9 m bounds its rotated half-diagonal
  // (√(1.95² + 3.3²) ≈ 3.83) at every heading. The fixture-era 4.5 m box snagged
  // the slip rails and reef ribs beyond the visible hull.
  creel: { radius: 3.9, height: 3.6 },
  hush: { radius: 3.6, height: 2.1 },
  spindle: { radius: 4, height: 2.1 },
  mantle: { radius: 4.5, height: 4 },
  hearthline: { radius: 17, height: 9.2, bottom: -0.5 },
} as const satisfies Record<HullId, { radius: number; height: number; bottom?: number }>;
/** Full upright authored hull bounds while aligned with a guided carrier rail.
 * Normal piloting retains the broader square HULL_COLLIDERS proxies. Metres from keel. */
export const BERTH_ENVELOPES = {
  // S3-02 option B: the Dart's trimmed fins fit ½W 2.45, clear of the starboard room's inboard wall.
  dart: { radius: 3.6, halfWidth: 2.45, halfLength: 3.6, height: 2.1 },
  // S3: Spindle folded art; the height seats a pilot under the solar canopy.
  spindle: { radius: 4, halfWidth: 2.12, halfLength: 3.7, height: 2.1 },
  creel: { radius: 4.5, halfWidth: 2.9, halfLength: 3.3, height: 3.6 },
  hush: { radius: 3.6, halfWidth: 2.45, halfLength: 3.6, height: 2.1 },
  mantle: { radius: 4.5, halfWidth: 2.9, halfLength: 4.5, height: 4 },
} as const;
export const REMOTE_TOOLS = {
  bobbin: { label: "Bobbin", role: "tethered recovery service" },
} as const;

// Only the bounded Reef–Canopy–Basin slice is active; the hull roster does not spawn content.
export const PLACES = {
  home_pod: {
    label: "Home pod",
    region: "refuge_reef",
    position: { x: 0, y: 0.18, z: 14 },
  },
  reef_ribs: {
    label: "Reef ribs",
    region: "refuge_reef",
    position: { x: -17, y: -5, z: -8 },
  },
  island_workshop: {
    label: "Splitspine workshop",
    region: "island_chain",
    position: { x: 10, y: 1.2, z: -36 },
  },
  canopy_lab: {
    label: "Upper Canopy laboratory",
    region: "suspended_garden",
    position: { x: 116, y: -118, z: -126 },
  },
  splitspine_shore: {
    label: "Splitspine shore",
    region: "island_chain",
    position: { x: 10, y: 0, z: -31 },
  },
  basin_dormitory: {
    label: "Basin dormitory",
    region: "silt_basin",
    position: { x: 178, y: -166, z: -218 },
  },
  basin_boundary_station: {
    label: "Sediment boundary station",
    region: "silt_basin",
    position: { x: 216, y: -172, z: -240 },
  },
  canopy_stop: {
    label: "Outer-crown service mooring",
    region: "suspended_garden",
    position: { x: 212, y: -138, z: -150 },
  },
} as const satisfies Record<
  string,
  {
    label: string;
    region: RegionId;
    position: { x: number; y: number; z: number };
  }
>;
export type PlaceId = keyof typeof PLACES;

/** Production art metadata. All generators are original; the art study is provenance,
 * not a dependency or its coordinate system (it used a different water height). */
export const ASSETS = {
  pod: {
    role: "refuge exterior including deck / ramp",
    dimensions: [7.9, 7.2, 18.2],
    pivot: "world / keel",
    materialSlots: ["porcelain", "petrol", "ochre", "glass", "warm"],
    region: "refuge_reef",
    source:
      "src/render/landmarks.ts; adapted design language from original study 20711d1",
  },
  ribs: {
    role: "orientation / solid swim-through",
    dimensions: [24, 11, 6],
    pivot: "world / seabed",
    materialSlots: ["basalt", "mineral"],
    region: "refuge_reef",
    source:
      "src/render/landmarks.ts; original authored arcs inspired by study 20711d1",
  },
  island: {
    role: "walkable terrain / split landmark",
    dimensions: [57, 30, 60],
    pivot: "world / waterline",
    materialSlots: ["sand", "basalt", "lichen"],
    region: "island_chain",
    source: "src/render/environment.ts; production analytic height field",
  },
  ribbons: {
    role: "current-facing colonies with downstream shed catches",
    dimensions: [3, 3, 3],
    pivot: "colony base",
    materialSlots: ["jade", "coral", "amber"],
    region: "refuge_reef",
    source:
      "src/render/ecology.ts; original ridged ribbon generators inspired by study 20711d1",
  },
} as const;

export const ITEMS = {
  structural_alloy: { ...MATERIALS.structural_alloy, cu: 2 },
  silica_glass: { ...MATERIALS.silica_glass, cu: 1 },
  flex_membrane: { ...MATERIALS.flex_membrane, cu: 1 },
  conductive_crust: { ...MATERIALS.conductive_crust, cu: 1 },
  buoyant_resin: { ...MATERIALS.buoyant_resin, cu: 1 },
  pressure_ceramic: { ...MATERIALS.pressure_ceramic, cu: 2 },
  thermal_core: { ...MATERIALS.thermal_core, cu: 2 },
  brine_lattice: { ...MATERIALS.brine_lattice, cu: 2 },
  meal: { label: "Prepared reef meal", cu: 1 },
  essential_tools: { label: "Scanner & service tool", cu: 2 },
  suit_150: { label: "150 m pressure suit", cu: 3 },
  suit_350: { label: "350 m refitted pressure suit", cu: 3 },
  salvage_buoy: { label: "Reusable salvage buoy", cu: 2 },
  reserve_cell: { label: "Rechargeable reserve cell", cu: 2 },
  bobbin_kit: { label: "Bobbin / rescue collar", cu: 6 },
  dart_acoustic_trim: { label: "Dart acoustic trim", cu: 2 },
  /** One salvaged, still-tagged structural member: structural alloy in an intact,
   * bulky form. Not a ninth material; a workshop strips it to 8 loose alloy. */
  tagged_frame: { label: "Tagged structural frame", cu: 10 },
  creel_cargo_rack: { label: "Creel cargo rack", cu: 6 },
  creel_cabin: { label: "Creel refuge cabin", cu: 8 },
  // S5 works assemblies, carried to the gate hall's panel.
  service_power_assembly: { label: "Portable service power assembly", cu: STORY_RECIPES.service_power_assembly.cu },
  service_air_assembly: { label: "Portable air staging assembly", cu: STORY_RECIPES.service_air_assembly.cu },
  ...CAMPAIGN_ITEMS,
} as const;
export type ItemKind = keyof typeof ITEMS;
/** Alloy carried in one intact tagged frame. */
export const FRAME_ALLOY = 8;
/** Socket modules are ordinary hold items that keep counting in their hold
 * (the M1 trim contract). The Creel's single major mount instead carries one
 * fitted package (`fitted: "mount"`), outside cargo, which sets the hold size. */
export const MODULES = {
  dart_acoustic_trim: { hull: "dart", slot: "socket", quietSpeed: 4.2, boostSpeed: 9 },
  creel_cargo_rack: { hull: "creel", slot: "mount", holdCu: 96 },
  creel_cabin: { hull: "creel", slot: "mount", holdCu: 40, lockerCu: 16 },
} as const;
export type ModuleKind = keyof typeof MODULES;
export type MountKind = "creel_cargo_rack" | "creel_cabin";
export const isMountKind = (kind: unknown): kind is MountKind =>
  kind === "creel_cargo_rack" || kind === "creel_cabin";
/** Base hold for each hull with no major mount fitted. */
/** Hearthline's 192 CU is its stores; its 32 CU pantry and 32 CU fabrication
 * compartments complete the 256 CU carrier hold (S3 HEARTHLINE_CONTAINERS). */
export const HULL_HOLD_CU = { dart: 32, creel: 64, hush: 32, spindle: 96, mantle: 32, hearthline: 192 } as const satisfies Record<HullId, number>;
/** Only paid hull refits raise a hull above its initial rating. */
export const HULL_REFITS = { dart: { recipe: "dart_350", rating: 350 }, creel: { recipe: "creel_350", rating: 350 } } as const;
/** Every paid hull refit, by recipe: it raises a hull rated `from` to `rating`.
 * HULL_REFITS keeps the first tier per hull. */
export const REFIT_TIERS = {
  dart_350: { hull: "dart", from: HULLS.dart.initialDepth, rating: 350 },
  creel_350: { hull: "creel", from: HULLS.creel.initialDepth, rating: 350 },
  ...CAMPAIGN_REFITS,
} as const satisfies Record<string, { hull: HullId; from: number; rating: number }>;
export type RefitRecipeId = keyof typeof REFIT_TIERS;
/** Personal pressure suits by item, and the in-place refit that produces each. */
export const SUIT_RATINGS = { suit_150: 150, suit_350: 350, suit_450: 450, suit_800: 800 } as const;
export type SuitKind = keyof typeof SUIT_RATINGS;
export const SUIT_REFITS = { suit_350: { from: "suit_150", rating: 350 }, ...CAMPAIGN_SUITS } as const satisfies
  Record<string, { from: SuitKind; rating: number }>;
export type BlueprintId =
  | "bp_pod_checklist"
  | "bp_reef_recovery"
  | "bp_island_workshop"
  | "bp_carrier_workshop"
  | "bp_canopy_reinforcement"
  | "bp_creel_service"
  | "bp_carrier_basin"
  | "bp_rift_pressure"
  | "bp_keel_survey"
  | StoryBlueprintId
  | CampaignBlueprintId;
export type FacilityId =
  | "home_pod"
  | "pod_fabricator"
  | "island_workshop"
  | "canopy_lab"
  | "canopy_stop";
export const BLUEPRINTS: readonly BlueprintId[] = [
  "bp_pod_checklist",
  "bp_reef_recovery",
  "bp_island_workshop",
  "bp_carrier_workshop",
  "bp_canopy_reinforcement",
  "bp_creel_service",
  "bp_carrier_basin",
  "bp_rift_pressure",
  "bp_keel_survey",
  ...(Object.keys(STORY_BLUEPRINT_LABELS) as StoryBlueprintId[]),
  ...(Object.keys(CAMPAIGN_BLUEPRINT_LABELS) as CampaignBlueprintId[]),
];
/** Retained research whose construction belongs to later tiers. Plans that are
 * partly executable list only the part that is still future knowledge. */
export const FUTURE_BLUEPRINTS = {
  bp_carrier_workshop: "Carrier workshop plans",
  bp_carrier_basin: "Carrier Basin frame and anchorage survey",
  bp_rift_pressure: "Cool-flank personal pressure research beyond 350 m",
  bp_deep_service: STORY_BLUEPRINT_LABELS.bp_deep_service,
  bp_works_hall: STORY_BLUEPRINT_LABELS.bp_works_hall,
  bp_food_module: STORY_BLUEPRINT_LABELS.bp_food_module,
} as const;
export type CostKind = MaterialId | "tagged_frame";
export type HullOutput = "dart" | "creel";
export type FabricationSite = "home_pod" | "pod_fabricator" | "island_workshop" | "canopy_stop" | CampaignSiteId;
export interface Recipe {
  label: string;
  cost: Partial<Record<CostKind, number>>;
  bp: BlueprintId;
  needs: readonly string[];
  site: FabricationSite;
  output: ItemKind | HullOutput | "pod_repair" | "restore_workshop" | "restore_canopy_stop" | "dart_350" | "creel_350" | "pod_buffer"
    | CampaignOutput;
  quantity: number;
  once: boolean;
  maintenance: boolean;
}
/** Adopted M1 subset of ECO-01. Later recipes are not executable or displayed. */
export const RECIPES = {
  pod_repair: {
    label: "Repair pod regulator & bench",
    cost: { structural_alloy: 2, silica_glass: 1, flex_membrane: 2 },
    bp: "bp_pod_checklist",
    needs: [],
    site: "home_pod",
    output: "pod_repair",
    quantity: 1,
    once: true,
    maintenance: false,
  },
  essential_tools: {
    label: "Scanner & service tool",
    cost: { structural_alloy: 1, silica_glass: 3, flex_membrane: 1 },
    bp: "bp_pod_checklist",
    needs: ["pod_repair"],
    site: "pod_fabricator",
    output: "essential_tools",
    quantity: 1,
    once: true,
    maintenance: false,
  },
  suit_150: {
    label: "Fit 150 m pressure suit",
    cost: { structural_alloy: 1, flex_membrane: 3 },
    bp: "bp_pod_checklist",
    needs: ["essential_tools"],
    site: "pod_fabricator",
    output: "suit_150",
    quantity: 1,
    once: true,
    maintenance: false,
  },
  restore_workshop: {
    label: "Restore workshop services",
    cost: { structural_alloy: 3, silica_glass: 1 },
    bp: "bp_island_workshop",
    needs: ["essential_tools"],
    site: "island_workshop",
    output: "restore_workshop",
    quantity: 1,
    once: true,
    maintenance: false,
  },
  salvage_buoy: {
    label: "Salvage buoy",
    cost: { structural_alloy: 1, silica_glass: 1, flex_membrane: 2 },
    bp: "bp_reef_recovery",
    needs: ["essential_tools"],
    site: "pod_fabricator",
    output: "salvage_buoy",
    quantity: 1,
    once: true,
    maintenance: false,
  },
  reserve_cells: {
    label: "Reserve cells ×2",
    cost: { structural_alloy: 2, silica_glass: 2, flex_membrane: 2 },
    bp: "bp_pod_checklist",
    needs: ["essential_tools"],
    site: "pod_fabricator",
    output: "reserve_cell",
    quantity: 2,
    once: true,
    maintenance: false,
  },
  bobbin_kit: {
    label: "Bobbin rescue collar",
    cost: { structural_alloy: 2, silica_glass: 1, flex_membrane: 3 },
    bp: "bp_reef_recovery",
    needs: ["essential_tools"],
    site: "pod_fabricator",
    output: "bobbin_kit",
    quantity: 1,
    once: true,
    maintenance: true,
  },
  dart_base: {
    label: "Dart scout",
    cost: { structural_alloy: 6, silica_glass: 3, flex_membrane: 2 },
    bp: "bp_island_workshop",
    needs: ["restore_workshop", "suit_150"],
    site: "island_workshop",
    output: "dart",
    quantity: 1,
    once: false,
    maintenance: false,
  },
  dart_acoustic_trim: {
    label: "Dart acoustic trim",
    cost: { conductive_crust: 2, buoyant_resin: 2 },
    bp: "bp_canopy_reinforcement",
    needs: ["dart_base"],
    site: "island_workshop",
    output: "dart_acoustic_trim",
    quantity: 1,
    once: true,
    maintenance: false,
  },
  suit_350: {
    label: "Suit refit · 350 m",
    cost: { structural_alloy: 2, flex_membrane: 2, conductive_crust: 4, buoyant_resin: 4 },
    bp: "bp_canopy_reinforcement",
    needs: ["suit_150"],
    site: "island_workshop",
    output: "suit_350",
    quantity: 1,
    once: true,
    maintenance: false,
  },
  // M2-B1. Creel-first is legal: no recipe here needs the Dart.
  creel_base: {
    label: "Creel workboat",
    cost: { structural_alloy: 10, silica_glass: 4, flex_membrane: 4, conductive_crust: 4, buoyant_resin: 2 },
    bp: "bp_creel_service",
    needs: ["restore_workshop", "suit_150"],
    site: "island_workshop",
    output: "creel",
    quantity: 1,
    once: false,
    maintenance: false,
  },
  creel_cargo_rack: {
    label: "Creel cargo rack",
    cost: { structural_alloy: 4, buoyant_resin: 2 },
    bp: "bp_creel_service",
    needs: ["creel_base"],
    site: "island_workshop",
    output: "creel_cargo_rack",
    quantity: 1,
    once: true,
    maintenance: false,
  },
  creel_cabin: {
    label: "Creel refuge cabin",
    cost: { structural_alloy: 3, silica_glass: 3, flex_membrane: 4, conductive_crust: 1, buoyant_resin: 1 },
    bp: "bp_creel_service",
    needs: ["creel_base"],
    site: "island_workshop",
    output: "creel_cabin",
    quantity: 1,
    once: true,
    maintenance: false,
  },
  strip_frame: {
    label: "Strip tagged frame",
    cost: { tagged_frame: 1 },
    bp: "bp_carrier_basin",
    needs: ["restore_workshop", "suit_350"],
    site: "island_workshop",
    output: "structural_alloy",
    quantity: 8,
    once: false,
    maintenance: false,
  },
  restore_canopy_stop: {
    label: "Restore outer-crown service mooring",
    // One 14 CU diver load: the dark mooring's own locker is shut until restored.
    cost: { tagged_frame: 1, silica_glass: 2, conductive_crust: 2 },
    bp: "bp_canopy_reinforcement",
    needs: ["essential_tools", "suit_350"],
    site: "canopy_stop",
    output: "restore_canopy_stop",
    quantity: 1,
    once: true,
    maintenance: false,
  },
  creel_350: {
    label: "Refit Creel hull / 350 m",
    cost: { tagged_frame: 2, conductive_crust: 4, buoyant_resin: 2, flex_membrane: 2 },
    bp: "bp_rift_pressure",
    needs: ["creel_base", "suit_350"],
    site: "island_workshop",
    output: "creel_350",
    quantity: 1,
    once: false,
    maintenance: false,
  },
  dart_350: {
    label: "Refit Dart hull / 350 m",
    cost: { tagged_frame: 1, conductive_crust: 3, buoyant_resin: 2, silica_glass: 1 },
    bp: "bp_keel_survey",
    needs: ["dart_base", "suit_350"],
    site: "island_workshop",
    output: "dart_350",
    quantity: 1,
    once: false,
    maintenance: false,
  },
  // S5 story work that is fabricated. The hall and food module are restored on
  // site through the works rules, from STORY_RECIPES' costs, not at a bench.
  service_power_assembly: {
    label: "Service power assembly",
    cost: STORY_RECIPES.service_power_assembly.cost,
    bp: "bp_service_power",
    needs: ["restore_workshop"],
    site: "island_workshop",
    output: "service_power_assembly",
    quantity: 1,
    once: false,
    maintenance: false,
  },
  service_air_assembly: {
    label: "Air staging assembly",
    cost: STORY_RECIPES.service_air_assembly.cost,
    bp: "bp_service_air",
    needs: ["restore_workshop"],
    site: "island_workshop",
    output: "service_air_assembly",
    quantity: 1,
    once: false,
    maintenance: false,
  },
  pod_buffer: {
    label: "Pod dispatch buffer",
    cost: STORY_RECIPES.pod_buffer.cost,
    bp: "bp_pod_buffer",
    needs: ["pod_repair"],
    site: "home_pod",
    output: "pod_buffer",
    quantity: 1,
    once: true,
    maintenance: false,
  },
  ...CAMPAIGN_RECIPES,
} as const satisfies Record<string, Recipe>;
export type RecipeId = keyof typeof RECIPES;

export interface SourceDefinition {
  label: string;
  region: RegionId;
  position: { x: number; y: number; z: number };
  item: MaterialId | "meal" | "tagged_frame";
  stock: number;
  reserve: number;
  bundle: number;
  context: string;
  scan: string;
  asset: string;
}
export const SOURCES = {
  reef_service_scraps_east: {
    label: "Intake service scraps",
    region: "refuge_reef",
    position: { x: -9, y: -12, z: -6 },
    item: "structural_alloy",
    stock: 8,
    reserve: 8,
    bundle: 4,
    context:
      "Tagged maintenance panels beside the intake.",
    scan: "Service tags identify replaceable frames, not random seabed ore.",
    asset: "scraps",
  },
  reef_service_scraps_west: {
    label: "Western service scraps",
    region: "refuge_reef",
    position: { x: -32, y: -28, z: -17 },
    item: "structural_alloy",
    stock: 8,
    reserve: 8,
    bundle: 4,
    context: "A second intake frame on the deeper reef slope.",
    scan: "Two service frames preserve an independent shallow alloy supply.",
    asset: "scraps",
  },
  reef_glass_ridge_north: {
    label: "Grazer glass ledge",
    region: "refuge_reef",
    position: { x: -6, y: -8, z: 0 },
    item: "silica_glass",
    stock: 8,
    reserve: 8,
    bundle: 2,
    context:
      "Pale grazers scrape this exposed ledge; clear nodules remain behind.",
    scan: "Ledge grazers scrape algae from exposed glass. Existing nodules need no waiting.",
    asset: "glass",
  },
  reef_glass_ridge_south: {
    label: "Southern exposed glass",
    region: "refuge_reef",
    position: { x: -25, y: -22, z: -22 },
    item: "silica_glass",
    stock: 8,
    reserve: 8,
    bundle: 2,
    context: "Wave-washed ridge beneath the southern rib.",
    scan: "Clear nodules follow exposed rock, away from the sediment pockets.",
    asset: "glass",
  },
  reef_ribbon_catch_north: {
    label: "Downstream ribbon catch",
    region: "refuge_reef",
    position: { x: -15, y: -10, z: 1 },
    item: "flex_membrane",
    stock: 12,
    reserve: 12,
    bundle: 4,
    context:
      "Current-facing fans upstream shed ribbons into this sheltered catch.",
    scan: "Open fans face the flow; loose usable membrane catches downstream. Harvest the shed, not the colony.",
    asset: "ribbons",
  },
  reef_ribbon_catch_south: {
    label: "Lower ribbon catch",
    region: "refuge_reef",
    position: { x: -33, y: -25, z: -24 },
    item: "flex_membrane",
    stock: 12,
    reserve: 12,
    bundle: 4,
    context: "The second fan terrace feeds a separate downstream catch.",
    scan: "Ribbons collect in lee hollows below the open coral fans.",
    asset: "ribbons",
  },
  island_workshop_scraps: {
    label: "Workshop maintenance stock",
    region: "island_chain",
    position: { x: 8, y: 1.2, z: -35 },
    item: "structural_alloy",
    stock: 18,
    reserve: 8,
    bundle: 4,
    context:
      "Unused workshop frame panels, within reach from the working platform.",
    scan: "Departure supplies remain stacked beside the repair bench.",
    asset: "scraps",
  },
  island_headland_scraps: {
    label: "Headland frame scraps",
    region: "island_chain",
    position: { x: 32, y: -20, z: -36 },
    item: "structural_alloy",
    stock: 18,
    reserve: 8,
    bundle: 4,
    context: "Tagged panels spilled below the damaged headland gantry.",
    scan: "The gantry is a second alloy patch independent of the workshop.",
    asset: "scraps",
  },
  island_glass_ledge_east: {
    label: "Eastern wave-washed glass",
    region: "island_chain",
    position: { x: 28, y: -10, z: -25 },
    item: "silica_glass",
    stock: 10,
    reserve: 8,
    bundle: 2,
    context: "Grazers keep the submerged ledge exposed.",
    scan: "Exposed ledges offer more glass along the island rim.",
    asset: "glass",
  },
  island_glass_ledge_west: {
    label: "Western wave-washed glass",
    region: "island_chain",
    position: { x: -15, y: -25, z: -40 },
    item: "silica_glass",
    stock: 10,
    reserve: 8,
    bundle: 2,
    context: "A second wave-washed ridge west of the landing.",
    scan: "Wave-washed ridges continue behind the split stack.",
    asset: "glass",
  },
  island_resin_cove_east: {
    label: "Cured drift resin",
    region: "island_chain",
    position: { x: 35, y: -10, z: -32 },
    item: "buoyant_resin",
    stock: 6,
    reserve: 6,
    bundle: 2,
    context: "Detached Canopy float nodules accumulate in this lee cove.",
    scan: "Only detached cured nodules are usable; living anchors stay intact.",
    asset: "resin",
  },
  island_resin_cove_west: {
    label: "Western drift resin",
    region: "island_chain",
    position: { x: -18, y: -20, z: -36 },
    item: "buoyant_resin",
    stock: 6,
    reserve: 6,
    bundle: 2,
    context: "The sheltered western cove catches a second resin supply.",
    scan: "Sheltered island coves receive cured Canopy drift.",
    asset: "resin",
  },
  canopy_grounding_fins_upper: {
    label: "Upper grounding fins",
    region: "suspended_garden",
    position: { x: 93, y: -90, z: -96 },
    item: "conductive_crust",
    stock: 14,
    reserve: 8,
    bundle: 2,
    context: "Mineral-coated fins beneath the buoyant holdfasts.",
    scan: "Crust builds on grounding fins. Quiet access avoids disturbing the territorial sound hunter.",
    asset: "crust",
  },
  canopy_grounding_fins_lower: {
    label: "Lower grounding fins",
    region: "suspended_garden",
    position: { x: 136, y: -130, z: -135 },
    item: "conductive_crust",
    stock: 14,
    reserve: 8,
    bundle: 2,
    context: "A second exposed fin beyond the upper laboratory.",
    scan: "Two fin patches remain inside the 150 m personal envelope.",
    asset: "crust",
  },
  canopy_resin_lee_upper: {
    label: "Upper cured resin pocket",
    region: "suspended_garden",
    position: { x: 101, y: -100, z: -102 },
    item: "buoyant_resin",
    stock: 12,
    reserve: 8,
    bundle: 2,
    context: "Detached amber nodules below mature float bladders.",
    scan: "Cured resin falls into quiet lee pockets beneath occupied fronds.",
    asset: "resin",
  },
  canopy_resin_lee_lower: {
    label: "Lower cured resin pocket",
    region: "suspended_garden",
    position: { x: 144, y: -140, z: -143 },
    item: "buoyant_resin",
    stock: 12,
    reserve: 8,
    bundle: 2,
    context:
      "The lower lee pocket has detached cured nodules, no cutting required.",
    scan: "The dense lower channel is quiet of schooling fauna. A clear upper flank leads home.",
    asset: "resin",
  },
  reef_edible_school_north: {
    label: "Reef staple cups",
    region: "refuge_reef",
    position: { x: 4, y: -2, z: 3 },
    item: "meal",
    stock: 8,
    reserve: 0,
    bundle: 2,
    context:
      "Edible nursery cups can be gathered by hand. No tools or cooking chain required.",
    scan: "These shallow cups provide safe portions; the habitat can be actively tended for more.",
    asset: "food",
  },
  reef_edible_school_south: {
    label: "Southern staple cups",
    region: "refuge_reef",
    position: { x: -4, y: -3, z: 6 },
    item: "meal",
    stock: 8,
    reserve: 0,
    bundle: 2,
    context: "A second safe food patch beside the pod ramp.",
    scan: "Food remains accessible without expedition equipment.",
    asset: "food",
  },
  island_shore_crop_east: {
    label: "Workshop shore crops",
    region: "island_chain",
    position: { x: 13, y: 1.2, z: -35 },
    item: "meal",
    stock: 8,
    reserve: 0,
    bundle: 2,
    context: "Edible shore pods grow beside the workshop.",
    scan: "Quick hand preparation preserves portions without spoilage.",
    asset: "food",
  },
  island_shore_crop_west: {
    label: "Western shore cups",
    region: "island_chain",
    position: { x: 5, y: 1.2, z: -38 },
    item: "meal",
    stock: 8,
    reserve: 0,
    bundle: 2,
    context: "A second island staple patch beside the landing.",
    scan: "Established refuges retain a meal issue as a fallback.",
    asset: "food",
  },
  basin_ridge_salvage_north: {
    label: "Northern loose survey salvage",
    region: "silt_basin",
    position: { x: 160, y: -162, z: -204 },
    item: "structural_alloy",
    stock: 20,
    reserve: 8,
    bundle: 4,
    context: "Loose tagged panels on the stable ridge below the fallen survey dish.",
    scan: "Detached maintenance panels can be gathered by hand. The intact dish spine is a host, not mineable hull stock.",
    asset: "scraps",
  },
  basin_ridge_salvage_south: {
    label: "Southern loose survey salvage",
    region: "silt_basin",
    position: { x: 196, y: -172, z: -240 },
    item: "structural_alloy",
    stock: 20,
    reserve: 8,
    bundle: 4,
    context: "A separate fallen frame exposes hand-sized panels beside the southern ridge.",
    scan: "This second tagged frame supplies independent loose alloy. Powered bulk handling would help with a larger expedition load.",
    asset: "scraps",
  },
  basin_survey_fins_east: {
    label: "Eastern survey grounding fins",
    region: "silt_basin",
    position: { x: 216, y: -168, z: -214 },
    item: "conductive_crust",
    stock: 14,
    reserve: 8,
    bundle: 2,
    context: "Crust coats exposed grounding fins on the sediment survey frame.",
    scan: "The Canopy fin habitat continues on exposed Basin instruments; the clear ridge leaves these fins accessible above the silt.",
    asset: "crust",
  },
  basin_survey_fins_west: {
    label: "Western survey grounding fins",
    region: "silt_basin",
    position: { x: 144, y: -174, z: -244 },
    item: "conductive_crust",
    stock: 14,
    reserve: 8,
    bundle: 2,
    context: "A separate survey frame catches crust on its current-facing fins.",
    scan: "An independent western fin patch remains on the first Dart-accessible shelf. Read the host above the sediment before descending.",
    asset: "crust",
  },
  // M2-B1 second membrane family: finite margin catches on the clear eastern
  // crowns. Old shed, held by tether nets on two mineral ribs; it does not regrow.
  canopy_ribbon_margin_north: {
    label: "Northern margin ribbon net",
    region: "suspended_garden",
    position: { x: 223.6, y: -122, z: -130 },
    item: "flex_membrane",
    stock: 10,
    reserve: 6,
    bundle: 4,
    context: "Shed filter ribbons drift out of the crowns and snag in the old tether net on this clear-water rib.",
    scan: "Clear margin water carries loose ribbons from distant colonies. This net holds years of drift: finite, separate from the living reef catches.",
    asset: "margin",
  },
  canopy_ribbon_margin_south: {
    label: "Southern margin ribbon net",
    region: "suspended_garden",
    position: { x: 237.4, y: -128, z: -178 },
    item: "flex_membrane",
    stock: 10,
    reserve: 6,
    bundle: 4,
    context: "A second margin rib, beside the outer return lane, holds its own tangle of shed ribbon.",
    scan: "Two separate margin nets keep seal material within the 150 m suit envelope. Neither regrows; the reef catches still do.",
    asset: "margin",
  },
  // Tagged frames: intact survey-frame members with service tags. Finite, no
  // reserve. A diver lifts one in 10 s; a nearby Creel's arms take it directly.
  basin_frame_ridge: {
    label: "Tagged frame stack · ridge",
    region: "silt_basin",
    position: { x: 226, y: -171, z: -206 },
    item: "tagged_frame",
    stock: 3,
    reserve: 0,
    bundle: 1,
    context: "Spare survey-frame members, still strapped and tagged, rest on the stable ridge beside the fallen dish.",
    scan: "Each tagged member is one bulky 10 CU frame (8 alloy). A diver can lift one at a time; a workboat's arms load them straight into its hold.",
    asset: "frames",
  },
  basin_frame_terrace: {
    label: "Tagged frame stack · south terrace",
    region: "silt_basin",
    position: { x: 190, y: -198, z: -252 },
    item: "tagged_frame",
    stock: 3,
    reserve: 0,
    bundle: 1,
    context: "Frame members slid from the station gantry onto the lower terrace, below the Dart's 180 m hull.",
    scan: "The terrace lies beyond 180 m. A Creel reaches it; a Dart pilot parks on the ridge and lifts by suit.",
    asset: "frames",
  },
  basin_frame_fracture: {
    label: "Tagged frame spill · fracture",
    region: "silt_basin",
    position: { x: 196, y: -262, z: -293 },
    item: "tagged_frame",
    stock: 4,
    reserve: 0,
    bundle: 1,
    context: "The slope break carried a whole gantry bay into the fracture floor.",
    scan: "Fracture floor, about 260 m: beyond a 240 m Creel. A 350 m hull can work it directly; otherwise lift by suit from the lip.",
    asset: "frames",
  },
  ...CAMPAIGN_SOURCES,
} as const satisfies Record<string, SourceDefinition>;
export type SourceId = keyof typeof SOURCES;
/** Siltwake design, not a claim about another game: only these living sheds regrow,
 * and only during active post-opening expedition steps (60 per second). Exposed stock
 * returns toward its original authored quantity; finite reserves never refill and
 * every other source keeps its existing finite rule. Progress is discarded at the cap. */
export const SOURCE_RENEWAL = {
  reef_ribbon_catch_north: { quantity: 2, intervalSteps: 21_600 },
  reef_ribbon_catch_south: { quantity: 2, intervalSteps: 21_600 },
  canopy_resin_lee_upper: { quantity: 2, intervalSteps: 36_000 },
  canopy_resin_lee_lower: { quantity: 2, intervalSteps: 36_000 },
} as const satisfies Partial<Record<SourceId, { quantity: number; intervalSteps: number }>>;
export type RenewableSourceId = keyof typeof SOURCE_RENEWAL;
export const RENEWABLE_SOURCE_IDS = Object.keys(SOURCE_RENEWAL) as RenewableSourceId[];
export const renewable = (id: unknown): id is RenewableSourceId =>
  typeof id === "string" && Object.hasOwn(SOURCE_RENEWAL, id);

export const EVIDENCE = {
  C01: {
    label: "Scored regulator",
    place: "home_pod",
    position: { x: -1.4, y: 1.1, z: 21.2 },
    observation:
      "The regulator is scored by deep pressure. Ballast residue points to an ascent. Its navigation buffer is damaged.",
    provenance: "Home pod / regulator serial and repair checklist",
    hypothesis:
      "Damage from an accident, or hardware used for a launch? The scoring and ballast residue need another point of comparison.",
    lead: "The abandoned intake below the twin reef ribs may explain the pod’s damaged filters.",
  },
  C02: {
    label: "Intake & living filters",
    place: "reef_ribs",
    position: { x: -17, y: -7, z: -8 },
    observation:
      "Open filter colonies thrive beside an abandoned intake. The current carries shed ribbons into lee catches.",
    provenance: "Hearth Reef / intake inspection and living colony",
    hypothesis:
      "The intake may have failed under sediment; thriving colonies alone do not explain the abandoned equipment.",
    lead: "The workshop above the Splitspine landing holds shore supplies and fabrication plans.",
  },
  C03: {
    label: "Unspent departure supplies",
    place: "island_workshop",
    position: { x: 10, y: 2.45, z: -38.8 },
    observation:
      "Departure supplies remain unused. The loading ledger has no outbound entry. Scout plans and the workshop service checklist survive.",
    provenance: "Splitspine / workshop ledger and physical stock",
    hypothesis:
      "Departure was interrupted, or people chose to stay. Neither explanation is confirmed.",
    lead: "Buoyant crowns rise east of Splitspine. A small laboratory hangs beside the tall rib on their clear upper flank.",
  },
  C04: {
    label: "Quiet lower channel",
    place: "canopy_lab",
    position: { x: 116, y: -116.8, z: -127.8 },
    observation:
      "Schooling fauna remain in the clear upper water and avoid the dense lower channel. The dated laboratory sheet records that change before equipment faults.",
    provenance: "Upper Canopy / field sheet and present fauna distribution",
    hypothesis:
      "Changing water chemistry may precede machinery failure. Predator avoidance is another possibility to investigate.",
    lead: "Beyond the lower Canopy crowns, fallen survey dishes mark the edge of Pale Basin. The field sheet leaves that water an open question. Its service log names a dark mooring on the clear eastern margin, below the outer return.",
  },
  C05: {
    label: "Inward transfer tags",
    place: "basin_dormitory",
    position: { x: 178, y: -164.8, z: -222.2 },
    observation: "Empty beds face tagged bundles moved inward, away from the open-water landing. The transfer tags read disaster day +04:20. Tavi Orr's separate +04:40 note says Ren held sole return-gate control while Tavi's partner remained outside; it records no outcome.",
    provenance: "Pale Basin dormitory / D0 +04:20 transfer tags; Tavi Orr +04:40 witness note",
    hypothesis: "An organized evacuation or confinement? The tags establish inward movement. The witness assigns control, without explaining the decision or where the residents went.",
    lead: "The service rack preserves Creel interior plans and the Basin half of the carrier frame survey. The boundary station beside the southern dish retains the sediment record; neither investigation requires the other.",
  },
  C06: {
    label: "Dated sediment profiles",
    place: "basin_boundary_station",
    position: { x: 216, y: -170.75, z: -244 },
    observation: "Profiles dated D−12 and disaster day +00:35 show dense water rising along matching fresh slope fractures. The newer instrument trace records the sediment surge before the station stopped. Present clear ridge fins stand above the sediment pockets.",
    provenance: "Pale Basin boundary station / D−12 profile; D0 +00:35 trace and fractured slope",
    hypothesis: "The storm and the weakened slope are connected to the water change. These measurements do not establish the extraction history or the residents' fate.",
    lead: "Cool-flank pressure research describes pale open fans on the Rift shoulder. Keep alloy and fin crust for service work; the dormitory's inward-facing transfer tags offer an independent regional question.",
  },
} as const;
export type EvidenceId = keyof typeof EVIDENCE;
export const EVIDENCE_BLUEPRINTS = {
  C01: ["bp_pod_checklist"], C02: ["bp_reef_recovery"],
  C03: ["bp_island_workshop", "bp_carrier_workshop"], C04: ["bp_canopy_reinforcement"],
  C05: ["bp_creel_service", "bp_carrier_basin"], C06: ["bp_rift_pressure"],
} as const satisfies Record<EvidenceId, readonly BlueprintId[]>;
export const OPTIONAL_RECORD = {
  id: "mara_reef_note",
  label: "Mara’s field note",
  position: { x: -24, y: -8, z: -9 },
  text: "Mara Sen / field method: “Start with what the fans are doing. The instruments can wait. The water will not.” A personal working note, separate from the intake service record.",
} as const;
export const DART_BUILD_POSE = { x: 20, y: -1.6, z: -22 } as const;
/** Fabrication only: saved hulls and makeVehicle's neutral heading stay intact. */
export const DART_BUILD_YAW = Math.PI;
/** M2-B1 medium slip west of the workshop landing, clear of the Dart cradle,
 * reef ribs and the starter rescue approach. Keel reference, metres. */
export const CREEL_BUILD_POSE = { x: -6, y: -3.2, z: -26 } as const;
export const CREEL_BUILD_YAW = Math.PI;
export const HULL_BUILD = {
  dart: { pose: DART_BUILD_POSE, yaw: DART_BUILD_YAW },
  creel: { pose: CREEL_BUILD_POSE, yaw: CREEL_BUILD_YAW },
} as const;
/** Ordinary technical records: plates and logs, not story clues. Inspecting one
 * keeps its ID in knowledge.scans and grants the listed plans, order-independent. */
export const TECH_RECORDS = {
  basin_keel_plate: {
    label: "Survey dish keel plate",
    region: "silt_basin",
    position: { x: 172, y: -199.3, z: -256 },
    text: "Pressure-ring plate from the fallen dish keel: a compact scout hull ring rated to 350 m, refitted from one tagged frame with fin crust and cured resin.",
    blueprints: ["bp_keel_survey"],
  },
  ...CAMPAIGN_TECH_RECORDS,
} as const satisfies Record<string, { label: string; region: RegionId; position: { x: number; y: number; z: number };
  text: string; blueprints: readonly BlueprintId[] }>;
export type TechRecordId = keyof typeof TECH_RECORDS;
export const techRecord = (id: unknown): id is TechRecordId =>
  typeof id === "string" && Object.hasOwn(TECH_RECORDS, id);
export interface InteractionHostDefinition {
  offset?: { x: number; y: number; z: number };
  radius?: number;
  solidIds?: readonly string[];
  /** Work-face height from the source datum. Surface-authored island stock
   * rests on the heightfield; its tags/anchor share the X/Z offset below. */
  renderOffsetY?: number;
}
/** Offsets from interaction datums to the actual instrument, record or work face.
 * Only a host's own furniture is exempt from optical occlusion, never its room. */
export const INTERACTION_HOSTS: Readonly<Record<string, InteractionHostDefinition>> = {
  C01: { offset: { x: -1.25, y: 0.75, z: -0.3 }, radius: 0.7 },
  C02: { offset: { x: 0, y: -0.7, z: 0 }, radius: 1.05 },
  C03: { radius: 0.55 },
  C04: { offset: { x: 0, y: -0.025, z: 0 }, radius: 0.5 },
  C05: { radius: 0.55, solidIds: ["basin.dormitory.bundles"] },
  C06: { radius: 0.55, solidIds: ["basin.station.console"] },
  pod_services: {
    offset: { x: 0.34, y: 1.2, z: 0.9 }, radius: 0.45, solidIds: ["pod.bench"],
  },
  workshop_services: {
    offset: { x: 0.8, y: 0.85, z: -4.15 }, radius: 0.65, solidIds: ["workshop.bench"],
  },
  rescue_staging: { offset: { x: 0, y: -0.3, z: 0 }, radius: 0.85 },
  reef_ribbon_catch_north: { offset: { x: 0.35, y: -0.25, z: 0.1 }, radius: 1.3 },
  reef_ribbon_catch_south: { offset: { x: 0.35, y: -0.25, z: 0.1 }, radius: 1.3 },
  island_workshop_scraps: { renderOffsetY: 0.25, offset: { x: -.32, y: -.1, z: -.35 } },
  island_headland_scraps: { renderOffsetY: 1.5, offset: { x: -.5, y: .1, z: -.4 } },
  island_glass_ledge_west: { renderOffsetY: 1, offset: { x: -.3, y: .2, z: -.25 } },
  island_shore_crop_east: { offset: { x: 0, y: 0.18, z: -0.35 } },
  island_shore_crop_west: { offset: { x: 0, y: 0.18, z: -0.35 } },
  basin_ridge_salvage_north: { offset: { x: 0, y: 0.15, z: 0 }, radius: 1.1, renderOffsetY: 0 },
  basin_ridge_salvage_south: { offset: { x: 0, y: 0.15, z: 0 }, radius: 1.1, renderOffsetY: 0 },
  basin_survey_fins_east: { offset: { x: 0, y: 0.25, z: 0 }, radius: 0.9, renderOffsetY: 0 },
  basin_survey_fins_west: { offset: { x: 0, y: 0.25, z: 0 }, radius: 0.9, renderOffsetY: 0 },
  canopy_ribbon_margin_north: { offset: { x: 0, y: 0.35, z: 0 }, radius: 0.9 },
  canopy_ribbon_margin_south: { offset: { x: 0, y: 0.35, z: 0 }, radius: 0.9 },
  basin_frame_ridge: { offset: { x: 0, y: 0.35, z: 0 }, radius: 1.2, renderOffsetY: 0 },
  basin_frame_terrace: { offset: { x: 0, y: 0.35, z: 0 }, radius: 1.2, renderOffsetY: 0 },
  basin_frame_fracture: { offset: { x: 0, y: 0.35, z: 0 }, radius: 1.2, renderOffsetY: 0 },
  basin_keel_plate: { offset: { x: 0, y: 0.2, z: 0 }, radius: 0.8 },
  canopy_stop_services: { offset: { x: 0, y: 0.9, z: 0 }, radius: 0.7 },
};
export const RECOVERY_STAGE = { x: 46, y: -12, z: -54 } as const;
export const CANOPY_COVER = {
  min: { x: 103, y: -145, z: -122 },
  max: { x: 109, y: -73, z: -115 },
} as const;
export const THREAT_HOME = { x: 132, y: -112, z: -113 } as const;
export const OPENING = [
  {
    label: "Release restraint",
    caption:
      "Pressure alarm. The pod lurches. A restraint holds your chest against the seat.",
    detail: "",
  },
  {
    label: "Close service latch",
    caption:
      "Black water fills the window. A leaking service latch shakes beside the damaged regulator.",
    detail: "The air refuge remains protected.",
  },
  {
    label: "Trigger reserve purge",
    caption:
      "Reserve pressure is holding. Purge the fogged window before the pod settles.",
    detail: "",
  },
  {
    label: "A place to breathe",
    caption:
      "Shallow light. A reef. An island. “Ren. Access engineer.” The remaining introduction breaks into static.",
    detail: "Your hands remember the work.",
  },
] as const;
