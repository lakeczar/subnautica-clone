/** ENV-1: every interior definition. The coordinator composes this registry
 * into the world from stage 2; until then nothing draws or collides with them. */
import { BASIN_DORMITORY } from "./basinDormitory.js";
import { COLD_STORE, FIELD_STATION } from "./fieldStation.js";
import { PUMP_HOUSE } from "./pumpHouse.js";
import type { InteriorDef } from "./types.js";

export const INTERIORS: readonly InteriorDef[] = [BASIN_DORMITORY, FIELD_STATION, COLD_STORE, PUMP_HOUSE];
export { BASIN_DORMITORY, COLD_STORE, FIELD_STATION, PUMP_HOUSE };
