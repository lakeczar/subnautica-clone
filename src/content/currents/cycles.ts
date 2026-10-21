/** Authored natural cycles. The chimney pulse and the Basin plume lane are
 * S4's running hazard clocks (content/ecology/hazards.ts at 854fdf1, composed
 * by C3) restated on the cycle framework with the same numbers; the other
 * three are sandbox candidates (see docs/build/streams/CY.md). */
import { fromHazardCycle } from "../../sim/cycles/cycle.js";
import type { CycleDef } from "../../sim/cycles/cycle.js";

/** S4 `rift_split_plume.cycle` and the ember mites' 7 s lead (species.ts). */
export const S4_SPLIT_PLUME = { period: 75, start: 30, duration: 18, ramp: 3 } as const;
/** S4 `basin_sediment_lane.cycle` and the scavengers' 8 s lead. */
export const S4_SEDIMENT_LANE = { period: 100, start: 50, duration: 16, ramp: 4 } as const;
/** S4 `rift_split_plume.baseline`: heat that stays while the chimney is quiet. */
export const SPLIT_PLUME_BASELINE = 0.3;

export const CHIMNEY_PULSE: CycleDef = fromHazardCycle("cycle.rift.chimney_pulse", "Split chimney pulse", S4_SPLIT_PLUME,
  { active: "venting", quiet: "quiet", rise: "building", fall: "easing" },
  [{ phase: "rise", leadS: 7, cue: "Ember mites leave the chimney lip and a low roar builds." }]);

export const SEDIMENT_SURGE: CycleDef = fromHazardCycle("cycle.basin.sediment_surge", "Basin plume surge", S4_SEDIMENT_LANE,
  { active: "surging", quiet: "settled", rise: "lifting", fall: "settling" },
  [{ phase: "rise", leadS: 8, cue: "Scavengers back into their burrows as the lane floor lifts." }]);

/** Candidate b: a cross-flow spill that slackens. Worst wait for the lull is
 * the surge plus both ramps, 42 s; the lull itself is 18 s. */
export const SPILL_SLACK: CycleDef = {
  id: "cycle.lab.spill_slack", label: "Gully spill", offset: 0,
  phases: [
    { id: "surge", seconds: 30, level: 1, label: "running hard" },
    { id: "ease", seconds: 6, label: "easing" },
    { id: "lull", seconds: 18, level: 0.1, label: "slack" },
    { id: "build", seconds: 6, label: "building" },
  ],
  warnings: [
    { phase: "lull", leadS: 5, cue: "The ribbon weed on the gully floor starts to lift and the silt streaks slow." },
    { phase: "build", leadS: 4, cue: "The ribbons lean west again; the spill is about to run." },
  ],
};

/** Candidate c: a lantern bloom. A long dormant stretch; nobody should wait
 * for it, they should come back. */
export const LANTERN_BLOOM: CycleDef = {
  id: "cycle.lab.lantern_bloom", label: "Lantern bloom", offset: 40,
  phases: [
    { id: "dormant", seconds: 150, level: 0, label: "dormant" },
    { id: "budding", seconds: 20, label: "budding" },
    { id: "bloom", seconds: 50, level: 1, label: "in bloom" },
    { id: "fading", seconds: 20, label: "fading" },
  ],
  warnings: [{ phase: "bloom", leadS: 15, cue: "Lantern buds swell and glow at their tips." }],
};

/** Candidate d: a territorial warden leaves its pocket to feed. Level is how
 * far along its path to the feeding flat it is. */
export const WARDEN_ROUND: CycleDef = {
  id: "cycle.lab.warden_round", label: "Warden's feeding round", offset: 20,
  phases: [
    { id: "resident", seconds: 35, level: 0, label: "at home" },
    { id: "leaving", seconds: 10, label: "leaving" },
    { id: "away", seconds: 40, level: 1, label: "feeding" },
    { id: "returning", seconds: 10, label: "returning" },
  ],
  warnings: [
    { phase: "leaving", leadS: 6, cue: "The warden rises off its den and turns to the open side of the pocket." },
    { phase: "returning", leadS: 8, cue: "The warden's clicks change from the feeding flat: it is about to head home." },
  ],
};

export const CYCLES: readonly CycleDef[] = [CHIMNEY_PULSE, SEDIMENT_SURGE, SPILL_SLACK, LANTERN_BLOOM, WARDEN_ROUND];
export const CYCLE_BY_ID: ReadonlyMap<string, CycleDef> = new Map(CYCLES.map(c => [c.id, c]));
