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

/** C4: the Divide crest downwelling slackens (CB `divide.crest_slack`): it runs
 * 52 s, eases over 4 s, lies slack 30 s (at S4's baseline) and builds over 4 s.
 * The worst wait for slack water is 56 s. The Divide's one slackening current. */
export const S4_CREST_SLACK = { period: 90, start: 12, duration: 52, ramp: 4 } as const;
/** Share of the downwelling that keeps running in slack water. */
export const CREST_SLACK_BASELINE = 0.15;
export const CREST_SLACK: CycleDef = fromHazardCycle("cycle.divide.crest_slack", "Crest slack water", S4_CREST_SLACK,
  { active: "running", quiet: "slack", rise: "building", fall: "easing" },
  [{ phase: "fall", leadS: 5, cue: "The crest ribbons start to stand upright: the downwelling is about to slacken." },
    { phase: "rise", leadS: 5, cue: "The crest ribbons lean south again and grains streak past: the downwelling is about to run." }]);

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

/** CR-1: each threat's natural window, a creature rhythm the player can watch
 * and time (owner, 2026-10-22). The stalkers and skates keep the clocks of the
 * fields they live by, with the same numbers, so their windows line up with the
 * chimney and the crest exactly. The hunter's round is the warden candidate's
 * shape given to a real animal. Every wait is about a minute at most, and quiet,
 * dark, cover, retreat and the deterrents remain the alternatives. */
export const HUNTER_FEEDING: CycleDef = {
  id: "cycle.canopy.hunter_feeding", label: "Sound hunter's feeding round", offset: 0,
  phases: [
    { id: "resident", seconds: 45, level: 0, label: "at home" },
    { id: "leaving", seconds: 8, label: "leaving to feed" },
    { id: "away", seconds: 40, level: 1, label: "feeding on the east shoal" },
    { id: "returning", seconds: 8, label: "returning" },
  ],
  warnings: [
    { phase: "leaving", leadS: 6, cue: "The lantern shoal east of the lab bunches and flashes: the hunter is about to go and feed." },
    { phase: "returning", leadS: 8, cue: "The east shoal scatters: the hunter has finished feeding and turns home." },
  ],
};
/** The stalkers turn to the chimney as it builds (S4's 3 s rise), feed through
 * the 18 s vent and linger 15 s on what settles: 36 s of every 75, aligned
 * with the chimney pulse (S4 `start` 30, so the rise begins at 27). */
export const STALKER_FEEDING: CycleDef = {
  id: "cycle.rift.stalker_feeding", label: "Glare stalkers' vent feeding", offset: S4_SPLIT_PLUME.start - S4_SPLIT_PLUME.ramp,
  phases: [
    { id: "turning", seconds: S4_SPLIT_PLUME.ramp, label: "turning to the vent" },
    { id: "feeding", seconds: S4_SPLIT_PLUME.duration, level: 1, label: "feeding in the plume" },
    { id: "lingering", seconds: 15, level: 1, label: "feeding on what settles" },
    { id: "hunting", seconds: S4_SPLIT_PLUME.period - S4_SPLIT_PLUME.ramp - S4_SPLIT_PLUME.duration - 15, level: 0, label: "hunting the passage" },
  ],
  warnings: [
    { phase: "turning", leadS: 7, cue: "The mites leave the lip and the stalkers' lights swing toward the chimney: they are going to feed in the plume." },
    { phase: "hunting", leadS: 6, cue: "The stalkers' lights turn back toward the passage: they are about to hunt again." },
  ],
};
export const SKATE_REST: CycleDef = fromHazardCycle("cycle.divide.skate_rest", "Layer skates' slack-water rest", S4_CREST_SLACK,
  { active: "patrolling the layer", quiet: "resting deep", rise: "rising to the layer", fall: "sinking to rest" },
  [{ phase: "fall", leadS: 5, cue: "The crest ribbons start to stand upright; the skates' ripples slow as they sink to rest." },
    { phase: "rise", leadS: 5, cue: "The crest ribbons lean again: the skates will rise to the layer." }]);
/** CB-2 (owner-confirmed): skates leave the dense water only to lay, on the
 * Divide's lee shelf. A rare, long visit; the mirror is unguarded meanwhile.
 * The slack-water rest stays the frequent window. */
export const SKATE_LAYING: CycleDef = {
  id: "cycle.divide.skate_laying", label: "Layer skates' laying visit", offset: 0,
  phases: [
    { id: "patrolling", seconds: 270, level: 0, label: "in the dense water" },
    { id: "leaving", seconds: 15, label: "leaving for the lee shelf" },
    { id: "laying", seconds: 60, level: 1, label: "laying on the lee shelf" },
    { id: "returning", seconds: 15, label: "returning to the brine" },
  ],
  warnings: [{ phase: "leaving", leadS: 6, cue: "Both skates turn north under the mirror, toward the lee shelf where they lay." }],
};
export const CHOIR_REST: CycleDef = {
  id: "cycle.meridian.choir_rest", label: "Hollow choir's rest", offset: 0,
  phases: [
    { id: "open", seconds: 48, level: 0, label: "open and listening" },
    { id: "closing", seconds: 4, label: "folding shut" },
    { id: "closed", seconds: 22, level: 1, label: "closed, resting" },
    { id: "opening", seconds: 4, label: "opening" },
  ],
  warnings: [
    { phase: "closing", leadS: 5, cue: "The bells' rims dim one by one: the choir is about to close and rest." },
    { phase: "opening", leadS: 5, cue: "The bells start to part: the choir will be listening again." },
  ],
};
export const CREATURE_CYCLES: readonly CycleDef[] = [HUNTER_FEEDING, STALKER_FEEDING, SKATE_REST, CHOIR_REST, SKATE_LAYING];

/** The cycles running in the game world. Owner keep-or-cut (CY, recorded
 * 2026-10-20): the vent pulse is kept; slackening currents at most one or two
 * per region (the Divide crest); the lantern bloom is dropped as a clock (its
 * reward is regrowth, SYS-2); the warden's round waits for a real creature;
 * the turbine is only a Hearthline mooring-anchor perk (SYS-1, stage B).
 * CR-1's creature windows follow; they are watched at the animal, not a field. */
export const WORLD_CYCLES: readonly CycleDef[] = [CHIMNEY_PULSE, SEDIMENT_SURGE, CREST_SLACK, ...CREATURE_CYCLES];
export const WORLD_CYCLE_BY_ID: ReadonlyMap<string, CycleDef> = new Map(WORLD_CYCLES.map(c => [c.id, c]));

export const CYCLES: readonly CycleDef[] = [CHIMNEY_PULSE, SEDIMENT_SURGE, CREST_SLACK, SPILL_SLACK, LANTERN_BLOOM, WARDEN_ROUND, ...CREATURE_CYCLES];
export const CYCLE_BY_ID: ReadonlyMap<string, CycleDef> = new Map(CYCLES.map(c => [c.id, c]));
