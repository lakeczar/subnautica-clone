/** SYS-2 proposed content: item kinds, blueprints, recipes, seed sources and the
 * technical record that carries the decoder plans. Nothing here is composed into
 * registry.ts yet; the coordinator merges these rows in one change (SYS-2.md).
 * Stable IDs only; labels are display text. Balance numbers are first proposals. */
import type { CostKind, FabricationSite, RegionId } from "../registry.js";

/** New item kinds. `cu` follows ITEMS. Socket modules and kits are single instances
 * (never stacked); seeds and produce stack like materials. */
export const SYS2_ITEMS = {
  outpost_kit_basic: { label: "Field outpost kit · basic", cu: 6, stack: false },
  outpost_kit_standard: { label: "Field outpost kit · standard", cu: 8, stack: false },
  outpost_kit_advanced: { label: "Field outpost kit · advanced", cu: 10, stack: false },
  mod_charger: { label: "Cell charger module", cu: 2, stack: false },
  mod_locker: { label: "Locker module", cu: 3, stack: false },
  mod_planter: { label: "Planter module", cu: 3, stack: false },
  mod_decoder: { label: "Decoder module", cu: 3, stack: false },
  mod_survey: { label: "Survey station module", cu: 3, stack: false },
  mod_fabricator: { label: "Small fabricator module", cu: 4, stack: false },
  mod_relay: { label: "Signal relay module", cu: 2, stack: false },
  nav_beacon: { label: "Navigation beacon", cu: 1, stack: true },
  seed_staple_cup: { label: "Staple cup cutting", cu: 1, stack: true },
  seed_ribbon_fan: { label: "Ribbon fan cutting", cu: 1, stack: true },
  seed_salve_frond: { label: "Salve frond cutting", cu: 1, stack: true },
  seed_lumen_bulb: { label: "Lumen bulb", cu: 1, stack: true },
  seed_pale_spore: { label: "Pale crust spore", cu: 1, stack: true },
  field_salve: { label: "Field salve", cu: 1, stack: true },
  /** The living power cell. SYS-1 owns how it powers craft; SYS-2 only grows it.
   * Charge starts at 100 like a reserve cell. */
  bio_cell: { label: "Bio-cell", cu: 2, stack: false },
} as const satisfies Record<string, { label: string; cu: number; stack: boolean }>;
export type Sys2ItemKind = keyof typeof SYS2_ITEMS;
export const isSys2Item = (kind: unknown): kind is Sys2ItemKind =>
  typeof kind === "string" && Object.hasOwn(SYS2_ITEMS, kind);

export const SYS2_BLUEPRINTS = {
  bp_field_outpost: "Field outpost kit plans",
  bp_outpost_standard: "Standard outpost frame plans",
  bp_outpost_advanced: "Advanced outpost frame plans",
  bp_decoder: "Signal decoder plans",
  bp_signal_relay: "Signal relay plans",
  bp_cultivation: "Planter module plans",
  bp_survey_station: "Survey station plans",
  bp_small_fabricator: "Small fabricator plans",
} as const;
export type Sys2BlueprintId = keyof typeof SYS2_BLUEPRINTS;

/** Same shape as registry `Recipe`, with SYS-2 outputs. In-place outpost tier
 * upgrades are rules (sim/systems/outposts.ts), not recipes. */
export interface Sys2Recipe {
  label: string;
  cost: Partial<Record<CostKind, number>>;
  bp: Sys2BlueprintId;
  needs: readonly string[];
  site: FabricationSite;
  output: Sys2ItemKind;
  quantity: number;
  once: boolean;
  maintenance: false;
}
const recipe = (label: string, cost: Sys2Recipe["cost"], bp: Sys2BlueprintId, output: Sys2ItemKind,
  site: FabricationSite = "pod_fabricator", quantity = 1, needs: readonly string[] = ["essential_tools"]): Sys2Recipe =>
  ({ label, cost, bp, needs, site, output, quantity, once: false, maintenance: false });
/** The basic kit is early: reef and island materials only, at the pod bench. Each
 * later tier needs one material from beyond the previous tier's reach. */
export const SYS2_RECIPES = {
  outpost_kit_basic: recipe("Basic field outpost kit", { structural_alloy: 3, silica_glass: 1, flex_membrane: 2 }, "bp_field_outpost", "outpost_kit_basic"),
  mod_charger: recipe("Cell charger module", { structural_alloy: 1, silica_glass: 1, conductive_crust: 1 }, "bp_field_outpost", "mod_charger"),
  mod_locker: recipe("Locker module", { structural_alloy: 2, flex_membrane: 1 }, "bp_field_outpost", "mod_locker"),
  mod_planter: recipe("Planter module", { silica_glass: 2, flex_membrane: 1, buoyant_resin: 1 }, "bp_cultivation", "mod_planter"),
  mod_decoder: recipe("Decoder module", { structural_alloy: 1, silica_glass: 2, conductive_crust: 2 }, "bp_decoder", "mod_decoder", "island_workshop", 1, ["restore_workshop"]),
  mod_survey: recipe("Survey station module", { structural_alloy: 1, silica_glass: 1, conductive_crust: 2 }, "bp_survey_station", "mod_survey", "island_workshop", 1, ["restore_workshop"]),
  mod_fabricator: recipe("Small fabricator module", { structural_alloy: 3, silica_glass: 1, conductive_crust: 2 }, "bp_small_fabricator", "mod_fabricator", "island_workshop", 1, ["restore_workshop"]),
  mod_relay: recipe("Signal relay module", { structural_alloy: 1, conductive_crust: 1, buoyant_resin: 1 }, "bp_signal_relay", "mod_relay", "island_workshop", 1, ["restore_workshop"]),
  nav_beacons: recipe("Navigation beacons ×3", { structural_alloy: 1, silica_glass: 1 }, "bp_field_outpost", "nav_beacon", "pod_fabricator", 3),
} as const satisfies Record<string, Sys2Recipe>;
export type Sys2RecipeId = keyof typeof SYS2_RECIPES;

/** Proposed seed patches in SourceDefinition shape. Positions sit beside existing
 * habitats in placed regions; the world owner may move them. Finite stock: cuttings
 * return on harvest, so one cutting per crop is enough. */
export interface SeedSourceDefinition {
  label: string;
  region: RegionId;
  position: { x: number; y: number; z: number };
  item: Sys2ItemKind;
  stock: number;
  reserve: number;
  bundle: number;
  context: string;
  scan: string;
  asset: string;
}
export const SYS2_SOURCES = {
  reef_staple_cuttings: {
    label: "Staple cup nursery", region: "refuge_reef", position: { x: 6, y: -3, z: 5 }, item: "seed_staple_cup",
    stock: 3, reserve: 0, bundle: 1, asset: "food",
    context: "Young staple cups bud from the edge of the nursery bed.",
    scan: "A cutting re-roots in a planter. Each harvest leaves the cutting in place.",
  },
  reef_ribbon_cuttings: {
    label: "Ribbon fan sprigs", region: "refuge_reef", position: { x: -14, y: -11, z: 3 }, item: "seed_ribbon_fan",
    stock: 3, reserve: 0, bundle: 1, asset: "ribbons",
    context: "Small fan sprigs grow on the lee side of the ribbon catch.",
    scan: "Fan sprigs keep shedding membrane in still water. A planter gives them still water.",
  },
  island_salve_fronds: {
    label: "Salve frond pool", region: "island_chain", position: { x: 22, y: -6, z: -28 }, item: "seed_salve_frond",
    stock: 3, reserve: 0, bundle: 1, asset: "food",
    context: "Thick fronds in a tide pool below the eastern ledge.",
    scan: "Frond sap dresses wounds. A cutting grows a fresh leaf in a planter.",
  },
  canopy_lumen_bulbs: {
    label: "Lumen bulb cluster", region: "suspended_garden", position: { x: 104, y: -96, z: -104 }, item: "seed_lumen_bulb",
    stock: 3, reserve: 0, bundle: 1, asset: "resin",
    context: "Glowing bulbs hang under the upper float bladders.",
    scan: "Each bulb stores charge in living tissue. Grown in a planter, it can be cased as a cell.",
  },
  basin_pale_spores: {
    label: "Pale crust spore mat", region: "silt_basin", position: { x: 210, y: -169, z: -220 }, item: "seed_pale_spore",
    stock: 2, reserve: 0, bundle: 1, asset: "crust",
    context: "A soft spore mat clings to the survey fins.",
    scan: "Spores tear when handled. Gentle sampling keeps them alive.",
  },
} as const satisfies Record<string, SeedSourceDefinition>;
export type Sys2SourceId = keyof typeof SYS2_SOURCES;

/** Ordinary technical records proposed for TECH_RECORDS. The decoder record sits
 * on the main path at the Splitspine workshop, readable without decoding. */
export const SYS2_TECH_RECORDS = {
  workshop_outpost_sheet: {
    label: "Workshop field-outpost sheet", region: "island_chain", position: { x: 12, y: 2.2, z: -37.5 },
    text: "Assembly sheet for a folding field outpost: anchor, cell bay, locker and one module socket.",
    blueprints: ["bp_field_outpost", "bp_cultivation"],
  },
  workshop_decoder_rack: {
    label: "Workshop signal rack", region: "island_chain", position: { x: 9, y: 2.2, z: -38.5 },
    text: "A signal rack with a working decoder board and its wiring plan. A relay plan is pinned beside it.",
    blueprints: ["bp_decoder", "bp_signal_relay", "bp_survey_station"],
  },
} as const satisfies Record<string, { label: string; region: RegionId; position: { x: number; y: number; z: number };
  text: string; blueprints: readonly Sys2BlueprintId[] }>;
export type Sys2TechRecordId = keyof typeof SYS2_TECH_RECORDS;

/** Materials that stack with each other in addItem: registry materials plus SYS-2 seeds and produce. */
export const stackable = (kind: string, materials: Readonly<Record<string, unknown>>): boolean =>
  Object.hasOwn(materials, kind) || kind === "meal" || kind === "tagged_frame" ||
  (isSys2Item(kind) && SYS2_ITEMS[kind].stack);
