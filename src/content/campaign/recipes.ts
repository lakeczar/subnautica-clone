/** S9 campaign recipes: personal and Creel refits past 350 m, the Mantle, the
 * Hearthline and its 550 m refit, the Rift and Divide service stops, the optional
 * Hush and Spindle, S4's protections and kits, and the deep rescue tether. Every
 * cost uses the eight shared materials (plus intact tagged frames); comments name
 * each ingredient's function. Quantities are tuned against
 * `src/sim/campaignEconomy.ts`; changes are recorded in EXPEDITION_INTEGRATION. */
import type { Recipe } from "../registry.js";

export const CAMPAIGN_ITEMS = {
  suit_450: { label: "450 m refitted pressure suit", cu: 3 },
  suit_800: { label: "800 m deep-service suit", cu: 3 },
  // S4 protections: suit fittings and hull modules.
  heat_shroud: { label: "Ceramic heat shroud", cu: 2 },
  hull_heat_lining: { label: "Hull heat lining", cu: 4 },
  brine_seals: { label: "Lattice brine seals", cu: 2 },
  hull_brine_seals: { label: "Hull brine seals", cu: 4 },
  trim_vanes: { label: "Resin trim vanes", cu: 3 },
  // S4 nonlethal kits, consumed on use.
  glow_lure: { label: "Glow lure", cu: 1 },
  startle_ink: { label: "Startle ink canister", cu: 1 },
  /** S2's 950 m deep Bobbin tether, from shallow materials. */
  bobbin_deep_tether: { label: "Bobbin deep tether reel", cu: 4 },
  /** A small onboard crop for a Hearthline galley socket. */
  galley_planter: { label: "Galley planter", cu: 4 },
} as const;
export type CampaignItemKind = keyof typeof CAMPAIGN_ITEMS;

/** Outputs that are neither items nor existing hull outputs. */
export type CampaignOutput =
  | CampaignItemKind
  | "creel_450" | "creel_800" | "hearthline_550"
  | "hearthline_keel" | "hearthline" | "mantle" | "hush" | "spindle"
  | "restore_rift_station" | "restore_divide_stop";

export const CAMPAIGN_RECIPES = {
  // ------------------------------------------------------------ personal refits
  suit_450: {
    label: "Suit refit · 450 m",
    // Ceramic shell inserts carry the pressure; membrane reseals the joints; crust runs the new depth telemetry.
    cost: { pressure_ceramic: 4, flex_membrane: 2, conductive_crust: 2 },
    bp: "bp_rift_pressure", needs: ["suit_350"], site: "island_workshop",
    output: "suit_450", quantity: 1, once: true, maintenance: false,
  },
  suit_800: {
    label: "Suit refit · 800 m",
    // The deep service package's personal exit protection: ceramic shell, lattice
    // exposure filters and seals, a core suit heater for the cold deep water.
    cost: { pressure_ceramic: 4, brine_lattice: 4, thermal_core: 1, flex_membrane: 1 },
    bp: "bp_deep_service", needs: ["suit_450"], site: "island_workshop",
    output: "suit_800", quantity: 1, once: true, maintenance: false,
  },
  // ------------------------------------------------------------ Creel refits
  creel_450: {
    label: "Refit Creel hull / 450 m",
    // Ceramic pressure ring; core for thermal power handling on the cool flank; crust controls; membrane seals.
    cost: { pressure_ceramic: 6, thermal_core: 2, conductive_crust: 2, flex_membrane: 2 },
    bp: "bp_rift_pressure", needs: ["creel_350"], site: "island_workshop",
    output: "creel_450", quantity: 1, once: false, maintenance: false,
  },
  creel_800: {
    label: "Refit Creel hull / 800 m",
    // Deep service package: ceramic hull, lattice filtration for sheltered brine-edge
    // approaches, core power for station keeping, a thicker glass viewport.
    cost: { pressure_ceramic: 8, brine_lattice: 5, thermal_core: 3, silica_glass: 2 },
    bp: "bp_deep_service", needs: ["creel_450", "suit_450"], site: "island_workshop",
    output: "creel_800", quantity: 1, once: false, maintenance: false,
  },
  // ------------------------------------------------------------ service stops
  restore_rift_station: {
    label: "Restore materials station services",
    // One 14 CU diver load, like the Canopy mooring: alloy fixtures, glass lamps, membrane air seals, crust charging.
    cost: { structural_alloy: 4, silica_glass: 2, flex_membrane: 2, conductive_crust: 2 },
    bp: "bp_rift_pressure", needs: ["essential_tools", "suit_350"], site: "rift_station",
    output: "restore_rift_station", quantity: 1, once: true, maintenance: false,
  },
  restore_divide_stop: {
    label: "Restore upper service dock",
    // One 16 CU diver load: alloy collar, glass lamps, crust charging, lattice air filtration above the brine.
    cost: { structural_alloy: 3, silica_glass: 3, conductive_crust: 3, brine_lattice: 2 },
    bp: "bp_deep_service", needs: ["essential_tools", "suit_450"], site: "divide_dock",
    output: "restore_divide_stop", quantity: 1, once: true, maintenance: false,
  },
  // ------------------------------------------------------------ Hearthline
  hearthline_keel: {
    label: "Lay Hearthline keel",
    // Basin frame survey: two intact tagged frames set the keel spine, bulk wreck alloy the
    // twin pontoons; resin trims the empty hull for floating out.
    cost: { tagged_frame: 2, structural_alloy: 16, buoyant_resin: 6 },
    bp: "bp_carrier_basin", needs: ["restore_workshop", "creel_base", "suit_350"], site: "stack_yard",
    output: "hearthline_keel", quantity: 1, once: false, maintenance: false,
  },
  hearthline_base: {
    label: "Fit out Hearthline carrier",
    // Workshop plans: alloy fixtures, glass windows, membrane seals for the dry berths and
    // launch lock, crust controls and charging, resin trim for the furnished hull.
    cost: { structural_alloy: 6, silica_glass: 8, flex_membrane: 8, conductive_crust: 8, buoyant_resin: 4 },
    bp: "bp_carrier_workshop", needs: ["hearthline_keel"], site: "stack_yard",
    output: "hearthline", quantity: 1, once: false, maintenance: false,
  },
  hearthline_550: {
    label: "Refit Hearthline hull / 550 m",
    // Ceramic plating on both dorsal hull modules; lattice seals for the deeper lock.
    cost: { pressure_ceramic: 10, brine_lattice: 6 },
    bp: "bp_rift_pressure", needs: ["hearthline_base", "suit_450"], site: "stack_yard",
    output: "hearthline_550", quantity: 1, once: false, maintenance: false,
  },
  galley_planter: {
    label: "Galley planter",
    // Membrane trays, resin floats, a glass grow lamp: convenience food, never a farming chain.
    cost: { flex_membrane: 2, buoyant_resin: 1, silica_glass: 1 },
    bp: "bp_carrier_workshop", needs: ["hearthline_base"], site: "island_workshop",
    output: "galley_planter", quantity: 1, once: true, maintenance: false,
  },
  // ------------------------------------------------------------ deep and optional craft
  mantle_base: {
    label: "Mantle deep service craft",
    // Ceramic bell, core cooling fins and service power, lattice seals, alloy skid ring and
    // jaw, glass ports, crust station-keeping controls.
    cost: { pressure_ceramic: 8, thermal_core: 4, brine_lattice: 5, structural_alloy: 8, silica_glass: 3, conductive_crust: 4 },
    bp: "bp_deep_service", needs: ["restore_workshop", "suit_450"], site: "stack_yard",
    output: "mantle", quantity: 1, once: false, maintenance: false,
  },
  hush_base: {
    label: "Hush survey glider",
    // Alloy spar, glass observation blister, membrane control skins, resin wing trim, crust hydrophones.
    cost: { structural_alloy: 4, silica_glass: 3, flex_membrane: 3, buoyant_resin: 3, conductive_crust: 2 },
    bp: "bp_hush_survey", needs: ["restore_workshop", "suit_150"], site: "stack_yard",
    output: "hush", quantity: 1, once: false, maintenance: false,
  },
  spindle_base: {
    label: "Spindle island tender",
    // Alloy hull and ramp, resin outrigger floats, glass solar canopy, membrane fold seals, crust charge control.
    cost: { structural_alloy: 6, buoyant_resin: 4, silica_glass: 2, flex_membrane: 2, conductive_crust: 2 },
    bp: "bp_spindle_tender", needs: ["restore_workshop", "suit_150"], site: "stack_yard",
    output: "spindle", quantity: 1, once: false, maintenance: false,
  },
  // ------------------------------------------------------------ S4 protection and kits
  heat_shroud: {
    label: "Ceramic heat shroud",
    // S4: ceramic plates over membrane seals.
    cost: { pressure_ceramic: 2, flex_membrane: 2 },
    bp: "bp_rift_pressure", needs: ["suit_350"], site: "island_workshop",
    output: "heat_shroud", quantity: 1, once: true, maintenance: false,
  },
  hull_heat_lining: {
    label: "Hull heat lining",
    cost: { pressure_ceramic: 3, structural_alloy: 1 },
    bp: "bp_rift_pressure", needs: ["restore_workshop", "suit_350"], site: "island_workshop",
    output: "hull_heat_lining", quantity: 1, once: true, maintenance: false,
  },
  brine_seals: {
    label: "Lattice brine seals",
    cost: { brine_lattice: 2, flex_membrane: 2 },
    bp: "bp_deep_service", needs: ["suit_450"], site: "island_workshop",
    output: "brine_seals", quantity: 1, once: true, maintenance: false,
  },
  hull_brine_seals: {
    label: "Hull brine seals",
    cost: { brine_lattice: 3, flex_membrane: 1 },
    bp: "bp_deep_service", needs: ["restore_workshop", "suit_450"], site: "island_workshop",
    output: "hull_brine_seals", quantity: 1, once: true, maintenance: false,
  },
  trim_vanes: {
    label: "Resin trim vanes",
    cost: { buoyant_resin: 2, structural_alloy: 1 },
    bp: "bp_canopy_reinforcement", needs: ["restore_workshop"], site: "island_workshop",
    output: "trim_vanes", quantity: 1, once: true, maintenance: false,
  },
  glow_lures: {
    label: "Glow lures ×2",
    cost: { silica_glass: 1, buoyant_resin: 1 },
    bp: "bp_reef_recovery", needs: ["essential_tools"], site: "pod_fabricator",
    output: "glow_lure", quantity: 2, once: false, maintenance: false,
  },
  startle_ink: {
    label: "Startle ink ×2",
    cost: { flex_membrane: 1, buoyant_resin: 1 },
    bp: "bp_reef_recovery", needs: ["essential_tools"], site: "pod_fabricator",
    output: "startle_ink", quantity: 2, once: false, maintenance: false,
  },
  // ------------------------------------------------------------ recovery
  bobbin_deep_tether: {
    label: "Bobbin deep tether",
    // S2's 950 m reel: shed membrane braid, an alloy spool, resin buoyancy beads. Shallow stock only.
    cost: { flex_membrane: 2, structural_alloy: 2, buoyant_resin: 1 },
    bp: "bp_reef_recovery", needs: ["bobbin_kit"], site: "pod_fabricator",
    output: "bobbin_deep_tether", quantity: 1, once: true, maintenance: false,
  },
} as const satisfies Record<string, Recipe>;
export type CampaignRecipeId = keyof typeof CAMPAIGN_RECIPES;

/** Suit tiers past 350 m: each refits the fitted previous suit in place. */
export const CAMPAIGN_SUITS = {
  suit_450: { from: "suit_350", rating: 450 },
  suit_800: { from: "suit_450", rating: 800 },
} as const;
/** Hull refit tiers past 350 m: a paid refit raises a hull rated `from` to `rating`. */
export const CAMPAIGN_REFITS = {
  creel_450: { hull: "creel", from: 350, rating: 450 },
  creel_800: { hull: "creel", from: 450, rating: 800 },
  hearthline_550: { hull: "hearthline", from: 400, rating: 550 },
} as const;

/** Campaign recipes the simulation cannot execute until C3 composes their site,
 * hull or fitting. `craftingBlock` refuses them with this reason; the economy and
 * planner still count them. Refits at the workshop are executable today. */
export const CAMPAIGN_PENDING: Readonly<Partial<Record<CampaignRecipeId, "site" | "hull" | "fitting">>> = {
  restore_rift_station: "site", restore_divide_stop: "site",
  hearthline_keel: "site", hearthline_base: "hull", hearthline_550: "site", galley_planter: "fitting",
  mantle_base: "hull", hush_base: "hull", spindle_base: "hull",
  heat_shroud: "fitting", hull_heat_lining: "fitting", brine_seals: "fitting", hull_brine_seals: "fitting",
  trim_vanes: "fitting", glow_lures: "fitting", startle_ink: "fitting", bobbin_deep_tether: "fitting",
};
