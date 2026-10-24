import type { Vec3 } from "../../../world/types.js";
import { sampleHazards, type HazardSample } from "../../../sim/ecology/hazards.js";
import type { CaveHazard, DeepCave } from "./deepKit.js";
import { DEEP_CAVES, DEEP_CAVE_HAZARDS } from "./deepCaves.js";

/** CA-3: the Ember Rift, Mirror Divide and Meridian small and medium caves.
 *
 * In the game since CW-1: `caves.ts` lists `DEEP_CAVE_SOURCES`, and S4's
 * `sampleHazards` samples `DEEP_CAVE_HAZARDS` with the world's own fields.
 * Every cave keeps the W1 contract; `DEEP_CAVES` adds contents, lamp-off
 * cues, hazard fields and the hall for each. */
export { DEEP_CAVES, DEEP_CAVE_SOURCES, DEEP_CAVE_HAZARDS } from "./deepCaves.js";
export const deepCave = (id: string): DeepCave => {
  const c = DEEP_CAVES.find(c => c.source.id === id);
  if (!c) throw new Error(`Unknown deep cave: ${id}`);
  return c;
};


/** One cave field's level at a point: the sampler's own rule. */
export { caveFieldLevel } from "../../../sim/ecology/hazards.js";
import { caveFieldLevel } from "../../../sim/ecology/hazards.js";

/** The world's hazards plus the cave fields: S4's sample with each kind
 * taking the strongest field, as `sampleHazards` does. */
export function sampleDeepHazards(p: Vec3, tick: number, fields: readonly CaveHazard[] = DEEP_CAVE_HAZARDS): HazardSample {
  const s = sampleHazards(p, tick);
  let heat = s.heat, brine = s.brine;
  for (const f of fields) {
    const l = caveFieldLevel(f, p, tick);
    if (l <= 1e-9) continue;
    if (f.kind === "heat") heat = Math.max(heat, l);
    if (f.kind === "brine") brine = Math.max(brine, l);
  }
  return { ...s, heat, brine, visibility: Math.max(0, Math.min(1, 1 - s.sediment * 0.85 - brine * 0.3)) };
}
