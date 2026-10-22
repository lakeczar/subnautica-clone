import { assertGroupsDisjoint, checkGroups, type CaveGroup } from "./authored.js";
import { BASIN_CAVES } from "./basin.js";
import { CANOPY_CAVES } from "./canopy.js";

export * from "./authored.js";
export { BASIN_CAVES } from "./basin.js";
export { CANOPY_CAVES } from "./canopy.js";

/** Every Canopy and Basin cave group, Canopy first. */
export const CANOPY_BASIN_GROUPS: readonly CaveGroup[] = [...CANOPY_CAVES, ...BASIN_CAVES];
checkGroups(CANOPY_CAVES, "suspended_garden");
checkGroups(BASIN_CAVES, "silt_basin");
assertGroupsDisjoint(CANOPY_BASIN_GROUPS);
