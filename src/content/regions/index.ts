/** S2 world content: layout, shared floor, sites, passages, hazards, rescue. */
export { ACCESS_TIERS, CRAFT_PROFILES, ROUTES, type AccessTierId, type RouteDef } from "./passages.js";
export { BIOMES, biomeAt, legacyCoverage, regionAtPoint, worldLayout } from "./layout.js";
export { HAZARDS, type HazardDef } from "./hazards.js";
export { RESCUE_PLANS, type RescuePlan } from "./rescue.js";
export { SITES, type SiteDef } from "./sites.js";
export { STRUCTURES, STRUCTURE_SOLIDS, type StructureDef } from "./structures.js";
export { spatialEntries, type S2EntryData } from "./spatial.js";
export { LEGACY_BLEND, LEGACY_PRESERVE, authoredFloor, composeWorldFloor, terrainMasks } from "./terrain.js";
export { worldFloor } from "./worldFloor.js";
export { firstAccessProblems, rescueProblems, routeProblems } from "./access.js";
