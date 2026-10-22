import type { CaveSource } from "../caves.js";
import type { Vec3 } from "../../../world/types.js";
import { cycleLevel, sampleHazards, shapeWeight, type HazardSample } from "../../../sim/ecology/hazards.js";
import type { CaveHazard, DeepCave } from "./deepKit.js";
import { RIFT_CAVES } from "./rift.js";
import { DIVIDE_CAVES } from "./divide.js";
import { MERIDIAN_CAVES } from "./meridian.js";

/** CA-3: the Ember Rift, Mirror Divide and Meridian small and medium caves.
 *
 * Not registered in `CAVE_SOURCES` on this branch (see CA-3.md,
 * *Registration*): the coordinator adds `...DEEP_CAVE_SOURCES` there. Every
 * cave keeps the W1 contract; `DEEP_CAVES` adds contents, lamp-off cues,
 * hazard fields and the hall for each. */
export const DEEP_CAVES: readonly DeepCave[] = [...RIFT_CAVES, ...DIVIDE_CAVES, ...MERIDIAN_CAVES];
export const DEEP_CAVE_SOURCES: readonly CaveSource[] = DEEP_CAVES.map(c => c.source);
export const deepCave = (id: string): DeepCave => {
  const c = DEEP_CAVES.find(c => c.source.id === id);
  if (!c) throw new Error(`Unknown deep cave: ${id}`);
  return c;
};

/** Every cave hazard field (S4's form), for C4 to append to the sampled set. */
export const DEEP_CAVE_HAZARDS: readonly CaveHazard[] = DEEP_CAVES.flatMap(c => c.hazards);

/** One cave field's level at a point: S4's `sampleHazards` rule (shape
 * weight × cycle level over its baseline × intensity) for a field that is
 * not in `HAZARD_FIELDS`. */
export function caveFieldLevel(f: CaveHazard, p: Vec3, tick: number): number {
  const w = shapeWeight(f.shape, f.edge, p);
  if (w <= 0) return 0;
  const base = f.baseline ?? 0, level = f.cycle ? base + (1 - base) * cycleLevel(f.cycle, tick) : 1;
  return w * level * f.intensity;
}

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
