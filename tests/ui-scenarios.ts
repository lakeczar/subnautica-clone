import type { GameState } from "../src/sim/types.js";
import { addItem } from "../src/sim/inventory.js";
import { completeOpening, discover } from "../src/sim/progression.js";
import { createGame } from "../src/sim/state.js";
import { installModule } from "../src/sim/modules.js";
import { executeCommand } from "../src/sim/step.js";
import { at, creelFirst, fund, creelOf, parkCreel, pilotCreel, world, WORKSHOP_BENCH } from "./b1-support.js";

/** Rule-staged panel scenarios shared by UI tests and browser screenshots.
 * They are presentation fixtures, not earned traversal. */
export const UI_SCENARIOS = {
  /** The audit's first fabrication: opening done, two glass carried, in pod waters. */
  "opening-fabrication": (): GameState => {
    const s = createGame(); completeOpening(s);
    at(s, { x: 8, y: -3, z: 32 });
    addItem(s, "silica_glass", 2, "diver");
    return s;
  },
  /** Restored workshop with a Dart, early clues and part-funded work. */
  "workshop-midgame": (): GameState => {
    const s = createGame(); completeOpening(s);
    for (const id of ["C02", "C03", "C04"] as const) discover(s, id);
    for (const id of ["pod_repair", "essential_tools", "suit_150", "restore_workshop", "dart_base"] as const) fund(s, id);
    const v = s.fleet.vehicles.find((v) => v.hull === "dart")!;
    addItem(s, "structural_alloy", 3, "workshop_locker"); addItem(s, "conductive_crust", 2, "diver");
    addItem(s, "buoyant_resin", 1, "diver"); addItem(s, "flex_membrane", 2, v.cargoId);
    s.knowledge.scans.push("canopy_grounding_fins_upper", "canopy_resin_lee_upper");
    at(s, WORKSHOP_BENCH);
    return s;
  },
  /** Creel-first fleet at the workshop slip with rack and cabin made, rack fitted. */
  "creel-slip": (): GameState => {
    const s = creelFirst(["creel_cargo_rack", "creel_cabin"]);
    const rack = s.inventory.items.find((i) => i.kind === "creel_cargo_rack")!;
    rack.containerId = "diver";
    at(s, { x: -6, y: -1, z: -21 });
    if (installModule(s, creelOf(s).id, rack.id) !== null) throw new Error("rack fit refused");
    addItem(s, "structural_alloy", 6, creelOf(s).cargoId);
    creelOf(s).charge = 70;
    return s;
  },
  /** Seated in the fitted, registered Creel cabin away from any bench. */
  "creel-cabin": (): GameState => {
    const s = creelFirst(["creel_cabin"]);
    const cabin = s.inventory.items.find((i) => i.kind === "creel_cabin")!;
    cabin.containerId = "diver";
    at(s, { x: -6, y: -1, z: -21 });
    if (installModule(s, creelOf(s).id, cabin.id) !== null) throw new Error("cabin fit refused");
    parkCreel(s, { x: 30, y: -3, z: 0 }); pilotCreel(s);
    const t = executeCommand(s, { type: "cabin", action: "enter" }, world).state;
    t.player.mobileRefuge = { vehicleId: creelOf(t).id, moduleId: cabin.id };
    return t;
  },
  /** Every clue found, several habitats scanned: the longest notebook. */
  "notebook-late": (): GameState => {
    const s = creelFirst();
    s.knowledge.scans.push("reef_ribbon_catch_north", "canopy_resin_lee_lower", "island_resin_cove_east", "reef_edible_school_north");
    at(s, WORKSHOP_BENCH);
    return s;
  },
} satisfies Record<string, () => GameState>;
export type UiScenario = keyof typeof UI_SCENARIOS;
