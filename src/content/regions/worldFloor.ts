import { terrainHeight } from "../../sim/world.js";
import { composeWorldFloor } from "./terrain.js";

/** The shared physical floor for the full envelope: today's `terrainHeight`
 * inside the legacy preserve, the authored world outside. Simulation and
 * every S2 art factory sample this; see `composeWorldFloor` for wiring. */
export const worldFloor = composeWorldFloor(terrainHeight);
