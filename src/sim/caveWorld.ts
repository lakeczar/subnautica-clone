/** The W1 cave ownership adapter now lives in `sim/world.ts` (C4), where the
 * game's exterior world (`gameWorld()`) is composed. Re-exported here for the
 * cave lab and the cave tests. */
export { CAVE_SUB_SWEEP, caveOwner, createCaveWorldQueries } from "./world.js";
export type { CaveOwner, CaveWorldOptions } from "./world.js";
