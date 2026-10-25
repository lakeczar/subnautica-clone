import { legacyWorldHeight } from "../../sim/terrain.js";
import { nameFloor } from "../buildCache.js";
import { composeWorldFloor } from "./terrain.js";

/** The shared physical floor for the full envelope: B1's `legacyWorldHeight`
 * inside the legacy preserve, the authored world outside. Simulation and
 * every S2 art factory sample this; see `composeWorldFloor` for wiring. */
export const worldFloor = nameFloor(composeWorldFloor(legacyWorldHeight), "worldFloor", [import.meta.url]);
