/** HUB-2: the crown station's three restoration recipes, each one diver load
 * (16 CU at most) at its door, starting where the Creel does. The registry
 * spreads them beside C4's tables; they use plans the player already holds
 * (the Creel's, the 350 m suit's and the Rift's), not new campaign plans. */
import type { Recipe } from "../registry.js";
import type { CrownRestorationId } from "./crownStation.js";

export type HubOutput = CrownRestorationId;

export const HUB_RECIPES = {
  restore_crown_power: {
    label: "Restore crown station power and air",
    // Alloy cell racks, crust bus bars, glass lamps for the beacon house, membrane air seals.
    cost: { structural_alloy: 4, conductive_crust: 3, silica_glass: 2, flex_membrane: 2 },
    bp: "bp_creel_service", needs: ["essential_tools", "creel_base"], site: "crown_station",
    output: "restore_crown_power", quantity: 1, once: true, maintenance: false,
  },
  restore_crown_dock: {
    label: "Restore the crown dock and fabricator",
    // Alloy dock arms and bench frame, crust charge leads, resin fenders and floats, glass bench optics.
    cost: { structural_alloy: 4, conductive_crust: 3, buoyant_resin: 3, silica_glass: 2 },
    bp: "bp_canopy_reinforcement", needs: ["restore_crown_power", "suit_350"], site: "crown_station",
    output: "restore_crown_dock", quantity: 1, once: true, maintenance: false,
  },
  restore_crown_survey: {
    label: "Restore crown sockets and survey array",
    // Alloy socket frames, crust survey wiring, ceramic pressure housings for the array, glass sensor windows.
    cost: { structural_alloy: 3, conductive_crust: 4, pressure_ceramic: 2, silica_glass: 2 },
    bp: "bp_rift_pressure", needs: ["restore_crown_dock", "suit_450"], site: "crown_station",
    output: "restore_crown_survey", quantity: 1, once: true, maintenance: false,
  },
} as const satisfies Record<CrownRestorationId, Recipe>;
