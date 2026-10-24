import type { CaveSource } from "../caves.js";
import type { CaveHazard, DeepCave } from "./deepKit.js";
import { RIFT_CAVES } from "./rift.js";
import { DIVIDE_CAVES } from "./divide.js";
import { MERIDIAN_CAVES } from "./meridian.js";

/** CA-3's caves as data only (CW-1): no simulation import, so the cave
 * registry and the hazard sampler can both list them without a cycle.
 * `deep.ts` re-exports these beside its sampling helpers. */
export const DEEP_CAVES: readonly DeepCave[] = [...RIFT_CAVES, ...DIVIDE_CAVES, ...MERIDIAN_CAVES];
export const DEEP_CAVE_SOURCES: readonly CaveSource[] = DEEP_CAVES.map(c => c.source);
/** Every cave hazard field (S4's form), sampled with the world's own (CW-1). */
export const DEEP_CAVE_HAZARDS: readonly CaveHazard[] = DEEP_CAVES.flatMap(c => c.hazards);
