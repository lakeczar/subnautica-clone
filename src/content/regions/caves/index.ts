import { assertGroupsDisjoint, checkGroups, type CaveGroup } from "./authored.js";
import { BASIN_CAVES } from "./basin.js";
import { CANOPY_CAVES } from "./canopy.js";

export * from "./authored.js";
export { BASIN_CAVES } from "./basin.js";
export { CANOPY_CAVES } from "./canopy.js";

/** Every Canopy and Basin cave group, Canopy first. */
export const CANOPY_BASIN_GROUPS: readonly CaveGroup[] = [...CANOPY_CAVES, ...BASIN_CAVES];
/** Their kit sources, in the game through `caves.ts` `CAVE_SOURCES` (CW-1),
 * which builds them with `groupDef` (the edge-shelf floor) and draws them
 * with `styledShell`. The registry checks them against every other cave. */
export const CANOPY_BASIN_SOURCES = CANOPY_BASIN_GROUPS.map(g => g.source);
checkGroups(CANOPY_CAVES, "suspended_garden");
checkGroups(BASIN_CAVES, "silt_basin");
assertGroupsDisjoint(CANOPY_BASIN_GROUPS);
