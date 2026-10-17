/** Stable saved identifiers. Labels and render mesh names are never saved references.
 * Seeded from WORLD_PROGRESSION / EXPEDITION_INTEGRATION, not a recipe balance. */
export const CONTENT_VERSION = "expedition.2" as const;

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
  creel: { radius: 4.5, height: 3.6 },
  hush: { radius: 3.6, height: 2.1 },
  spindle: { radius: 4, height: 1.7 },
  mantle: { radius: 4.5, height: 4 },
  hearthline: { radius: 17, height: 9.2 },
} as const satisfies Record<HullId, { radius: number; height: number }>;
/** Full upright authored hull bounds while aligned with a guided carrier rail.
 * Normal piloting retains the broader square HULL_COLLIDERS proxies. Metres from keel. */
export const BERTH_ENVELOPES = {
  dart: { radius: 3.6, halfWidth: 2.5, halfLength: 3.6, height: 2.1 },
  spindle: { radius: 4, halfWidth: 2.4, halfLength: 3.7, height: 1.7 },
  creel: { radius: 4.5, halfWidth: 2.9, halfLength: 3.3, height: 3.6 },
  hush: { radius: 3.6, halfWidth: 2.5, halfLength: 3.6, height: 2.1 },
  mantle: { radius: 4.5, halfWidth: 2.9, halfLength: 4.5, height: 4 },
} as const;
export const REMOTE_TOOLS = {
  bobbin: { label: "Bobbin", role: "tethered recovery service" },
} as const;

// Only the bounded foundation is active. The seed roster above does not spawn content.
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
  salvage_buoy: { label: "Reusable salvage buoy", cu: 2 },
  reserve_cell: { label: "Rechargeable reserve cell", cu: 2 },
  bobbin_kit: { label: "Bobbin / rescue collar", cu: 6 },
} as const;
export type ItemKind = keyof typeof ITEMS;
export type BlueprintId =
  | "bp_pod_checklist"
  | "bp_reef_recovery"
  | "bp_island_workshop"
  | "bp_carrier_workshop"
  | "bp_canopy_reinforcement";
export type FacilityId =
  | "home_pod"
  | "pod_fabricator"
  | "island_workshop"
  | "canopy_lab";
export const BLUEPRINTS: readonly BlueprintId[] = [
  "bp_pod_checklist",
  "bp_reef_recovery",
  "bp_island_workshop",
  "bp_carrier_workshop",
  "bp_canopy_reinforcement",
];
export interface Recipe {
  label: string;
  cost: Partial<Record<MaterialId, number>>;
  bp: BlueprintId;
  needs: readonly string[];
  site: "home_pod" | "pod_fabricator" | "island_workshop";
  output: ItemKind | "dart" | "pod_repair" | "restore_workshop";
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
    cost: { structural_alloy: 2, silica_glass: 2, flex_membrane: 2 },
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
    cost: { structural_alloy: 1, silica_glass: 1, flex_membrane: 2 },
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
    cost: { structural_alloy: 2, silica_glass: 1, flex_membrane: 1 },
    bp: "bp_island_workshop",
    needs: ["essential_tools"],
    site: "island_workshop",
    output: "restore_workshop",
    quantity: 1,
    once: true,
    maintenance: false,
  },
  salvage_buoy: {
    label: "Reusable salvage buoy / 24 CU",
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
    label: "Two rechargeable reserve cells",
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
    label: "Bobbin / reusable local rescue collar",
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
    label: "Build Dart scout / 180 m",
    cost: { structural_alloy: 6, silica_glass: 3, flex_membrane: 2 },
    bp: "bp_island_workshop",
    needs: ["restore_workshop", "suit_150"],
    site: "island_workshop",
    output: "dart",
    quantity: 1,
    once: false,
    maintenance: false,
  },
} as const satisfies Record<string, Recipe>;
export type RecipeId = keyof typeof RECIPES;

export interface SourceDefinition {
  label: string;
  region: RegionId;
  position: { x: number; y: number; z: number };
  item: MaterialId | "meal";
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
      "Tagged maintenance panels beside the intake; four alloy per hand bundle.",
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
} as const satisfies Record<string, SourceDefinition>;
export type SourceId = keyof typeof SOURCES;

export const EVIDENCE = {
  C01: {
    label: "Scored regulator",
    place: "home_pod",
    position: { x: -1.4, y: 1.1, z: 21.2 },
    observation:
      "The regulator is scored by deep pressure. Ballast residue points to an ascent. Its navigation buffer is damaged.",
    provenance: "Home pod / regulator serial and repair checklist",
    hypothesis:
      "An underwater launch fits the hardware. Its purpose is still unknown.",
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
    lead: "Investigate the buoyant crowns east of the workshop. The upper laboratory sits beside the clear flank; prepare a 150 m suit and return power.",
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
    lead: "Survey dishes beyond the lower crowns point toward Pale Basin. That longer expedition needs reinforcement and service preparation.",
  },
} as const;
export type EvidenceId = keyof typeof EVIDENCE;
export const OPTIONAL_RECORD = {
  id: "mara_reef_note",
  label: "Mara’s field note",
  position: { x: -24, y: -8, z: -9 },
  text: "Mara Sen / field method: “Start with what the fans are doing. The instruments can wait. The water will not.” A personal working note, separate from the intake service record.",
} as const;
export const DART_BUILD_POSE = { x: 20, y: -1.6, z: -22 } as const;
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
      "Pressure alarm. Upward motion. A restraint holds your chest against the seat.",
    detail: "E · release the amber restraint. Space · skip the opening.",
  },
  {
    label: "Close service latch",
    caption:
      "The pod rises through black water. A leaking service latch shakes beside the damaged regulator.",
    detail: "E · close the service latch. The air refuge remains protected.",
  },
  {
    label: "Trigger reserve purge",
    caption:
      "Reserve pressure is holding. Purge the fogged window before the pod settles.",
    detail: "E · trigger the reserve purge.",
  },
  {
    label: "A place to breathe",
    caption:
      "Shallow light. A reef. An island. “Ren. Access engineer.” The remaining introduction breaks into static.",
    detail: "E · stand up. Your hands remember the work.",
  },
] as const;
