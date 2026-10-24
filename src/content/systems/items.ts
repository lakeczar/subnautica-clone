/** SYS-2 proposed content: item kinds, blueprints, recipes, seed sources and the
 * technical record that carries the decoder plans. Nothing here is composed into
 * registry.ts yet; the coordinator merges these rows in one change (SYS-2.md).
 * Stable IDs only; labels are display text. Balance numbers are first proposals. */
import type { CostKind, FabricationSite, RegionId } from "../registry.js";
import { FAUNA_STACKABLE } from "../fauna/items.js";

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
  /** CR-1: a fish trap catches slowly in the background (content/fauna/items.ts TRAP). */
  mod_fish_trap: { label: "Fish trap module", cu: 3, stack: false },
  nav_beacon: { label: "Navigation beacon", cu: 1, stack: true },
  seed_staple_cup: { label: "Staple cup cutting", cu: 1, stack: true },
  seed_ribbon_fan: { label: "Ribbon fan cutting", cu: 1, stack: true },
  seed_salve_frond: { label: "Salve frond cutting", cu: 1, stack: true },
  seed_lumen_bulb: { label: "Lumen bulb", cu: 1, stack: true },
  seed_pale_spore: { label: "Pale crust spore", cu: 1, stack: true },
  /** LS-1: the Rift core crew's tuber, gone wild in their vent-warmed box. */
  seed_kiln_tuber: { label: "Kiln tuber", cu: 1, stack: true },
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
  // LS-1 lost-site rewards (docs/build/streams/LS-1.md, reward contracts).
  bp_locker_extension: "Locker extension plans",
  bp_ping_lens: "Ping lens plans",
  bp_heated_grow_bed: "Heated grow bed plans",
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
  // CR-1: membrane mesh on an alloy frame, buoyed by resin; early, with the basic kit plans.
  mod_fish_trap: recipe("Fish trap module", { structural_alloy: 1, flex_membrane: 2, buoyant_resin: 1 }, "bp_field_outpost", "mod_fish_trap"),
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
  // LS-1: the keeper's racks on the spur's second step (the owner's mid-game plot).
  hub_racks_cups: {
    label: "Keeper's racks: staple cups", region: "silt_basin", position: { x: 172, y: -48, z: -463 }, item: "seed_staple_cup",
    stock: 3, reserve: 0, bundle: 1, asset: "food",
    context: "Cups spill over the top tier of the keeper's racks.",
    scan: "A cutting re-roots in a planter. Each harvest leaves the cutting in place.",
  },
  hub_racks_fans: {
    label: "Keeper's racks: ribbon fans", region: "silt_basin", position: { x: 177, y: -48, z: -459 }, item: "seed_ribbon_fan",
    stock: 3, reserve: 0, bundle: 1, asset: "ribbons",
    context: "Fan sprigs crowd the racks' middle tier.",
    scan: "Fan sprigs keep shedding membrane in still water. A planter gives them still water.",
  },
  hub_racks_fronds: {
    label: "Keeper's racks: salve fronds", region: "silt_basin", position: { x: 179, y: -48, z: -465 }, item: "seed_salve_frond",
    stock: 3, reserve: 0, bundle: 1, asset: "food",
    context: "Thick fronds in the shade under the lowest tier.",
    scan: "Frond sap dresses wounds. A cutting grows a fresh leaf in a planter.",
  },
  // LS-1: the borehole hut's vent-warmed planter box, overgrown.
  rift_kiln_tubers: {
    label: "Kiln tubers in the hut's warm box", region: "thermal_rift", position: { x: -417, y: -251, z: -896 }, item: "seed_kiln_tuber",
    stock: 3, reserve: 0, bundle: 1, asset: "food",
    context: "Pale tubers crowd a box by the hut's warm vent pipe.",
    scan: "A tuber that wants warmth: it grows only in a heated bed, or in a planter at a thermal outpost.",
  },
} as const satisfies Record<string, SeedSourceDefinition>;
export type Sys2SourceId = keyof typeof SYS2_SOURCES;

/** Ordinary technical records proposed for TECH_RECORDS, all on the main path and
 * readable without decoding. Coordinator decision (content bible): the main path
 * carries copies of every outpost-kit tier's plans, so the independent route never
 * depends on an optional decode for its kits; decodes may grant further copies. */
export const SYS2_TECH_RECORDS = {
  workshop_outpost_sheet: {
    label: "Workshop field-outpost sheet", region: "island_chain", position: { x: 12, y: 2.2, z: -37.5 },
    text: "Assembly sheet for a folding field outpost: anchor, cell bay, locker and one module socket.",
    // LS-1 1b: the planter plan moved to the keeper's racks (owner: the mid-game plot).
    blueprints: ["bp_field_outpost"],
  },
  workshop_decoder_rack: {
    label: "Workshop signal rack", region: "island_chain", position: { x: 9, y: 2.2, z: -38.5 },
    text: "A signal rack with a working decoder board and its wiring plan. A relay plan is pinned beside it.",
    blueprints: ["bp_decoder", "bp_signal_relay", "bp_survey_station"],
  },
  canopy_lab_outpost_sheet: {
    label: "Laboratory outpost frame sheet", region: "suspended_garden", position: { x: 117.5, y: -117.2, z: -124.5 },
    text: "A field sheet for a three-socket outpost frame, braced with fin crust for the deeper shelves.",
    blueprints: ["bp_outpost_standard"],
  },
  basin_station_outpost_frame: {
    label: "Boundary station frame plate", region: "silt_basin", position: { x: 217.5, y: -171, z: -242 },
    text: "Pressure-frame plate for a five-socket outpost, rated with ceramic bracing for the Rift shoulder.",
    blueprints: ["bp_outpost_advanced"],
  },
  // LS-1 1b: the planter plan, readable without a decoder on the main path.
  hub_racks_card: {
    label: "Keeper's planting card", region: "silt_basin", position: { x: 175.5, y: -46.6, z: -461.5 },
    text: "Laminated and tied to the lamp pole: how the keeper built a planter box, and what grew on which tier.",
    blueprints: ["bp_cultivation"],
  },
} as const satisfies Record<string, { label: string; region: RegionId; position: { x: number; y: number; z: number };
  text: string; blueprints: readonly Sys2BlueprintId[] }>;
export type Sys2TechRecordId = keyof typeof SYS2_TECH_RECORDS;

/** Materials that stack with each other in addItem: registry materials plus SYS-2 seeds and produce. */
export const stackable = (kind: string, materials: Readonly<Record<string, unknown>>): boolean =>
  Object.hasOwn(materials, kind) || kind === "meal" || kind === "tagged_frame" ||
  (isSys2Item(kind) && SYS2_ITEMS[kind].stack) || (FAUNA_STACKABLE as readonly string[]).includes(kind);
