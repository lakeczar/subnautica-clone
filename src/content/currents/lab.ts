/** The cycles lab: a flat sandbox floor with placeholder rock and one station
 * per candidate cycle, plus a rock-edge station for the adverse case. It sits
 * inside today's world bounds (sim/world.ts WORLD_BOUNDS) so the real swept
 * movement runs unchanged. Nothing here is placed in the game world. */
import type { Solid } from "../../sim/world.js";
import type { Vec3 } from "../../sim/types.js";
import type { CurrentVolumeDef } from "../../sim/currents/types.js";
import { CHIMNEY_PULSE, LANTERN_BLOOM, SPILL_SLACK, SPLIT_PLUME_BASELINE, WARDEN_ROUND } from "./cycles.js";

export const LAB_FLOOR_Y = -40;
/** Rock that breaks the surface, so nothing is crossed over the top. */
const TOP = 2;
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const rock = (id: string, x0: number, z0: number, x1: number, z1: number, y1 = TOP, y0 = LAB_FLOOR_Y): Solid =>
  ({ id: `lab.${id}`, min: v(x0, y0, z0), max: v(x1, y1, z1) });

export const LAB_START: Vec3 = v(83, -24, 12);

// ---------------------------------------------------------------- b: the gully spill
/** A 16 m gully between two reef walls; each wall has a 10 m window, offset
 * by nothing, so the straight crossing is window to window. The spill runs
 * west along the gully and out of its open west end. Three boulders give lees. */
export const GULLY = { minX: 20, maxX: 140, minZ: -38, maxZ: -22, windowX: [78, 88] as const } as const;
const gullyRock: Solid[] = [
  rock("gully.north_w", 20, -22, 78, -18), rock("gully.north_e", 88, -22, 140, -18),
  rock("gully.south_w", 20, -42, 78, -38), rock("gully.south_e", 88, -42, 140, -38),
  rock("gully.east_cap", 140, -42, 146, -18),
  rock("gully.boulder_w", 46, -33, 52, -27, -4), rock("gully.boulder_e", 106, -33, 112, -27, -4),
];
export const SPILL: CurrentVolumeDef = {
  id: "current.lab.spill", label: "Gully spill",
  // The box runs 2 m into the walls, cap and floor so the soft edge lies in
  // rock: flush against a face the flow is full, with no still layer to creep along.
  shape: { kind: "box", center: v(81, -20, -30), half: v(61, 22, 10) },
  direction: v(-1, 0, 0), strength: 6.5, edge: 2, cycle: SPILL_SLACK.id,
  lees: [{ min: v(38, -40, -33), max: v(46, -4, -27) }, { min: v(98, -40, -33), max: v(106, -4, -27) }],
  cue: "Ribbon weed along the gully floor lies flat to the west and silt streaks past; it stands up in the slack.",
};

// ---------------------------------------------------------------- a: the hot passage
/** A reef wall with one passage; the chimney column fills the passage. */
export const VENT = { passageX: [180, 192] as const, wallZ: [-86, -84] as const } as const;
const ventRock: Solid[] = [rock("vent.wall_w", 150, -86, 180, -84), rock("vent.wall_e", 192, -86, 240, -84)];
/** The column's heat: S4's baseline while quiet, full while venting. */
export const VENT_COLUMN = {
  id: "hazard.lab.vent_column", cycle: CHIMNEY_PULSE.id, baseline: SPLIT_PLUME_BASELINE, edge: 2,
  min: v(180, LAB_FLOOR_Y, -92), max: v(192, 0, -78),
  cue: "Shimmering water fills the passage while it vents; the mites on the lip return when it quiets.",
} as const;

// ---------------------------------------------------------------- c: the lantern bloom
export const BLOOM = {
  cycle: LANTERN_BLOOM.id,
  /** The bloom bed and an ordinary bed of the same material. */
  bed: v(20, -38, -110), ordinary: v(-30, -38, -62), reach: 5,
  /** Picks the bed offers per bloom round: always `base`, up to `base + bonus` in full bloom. */
  base: 3, bonus: 12, ordinaryPicks: 3, pickSeconds: 1,
} as const;

// ---------------------------------------------------------------- d: the warden's pocket
export const WARDEN = {
  cycle: WARDEN_ROUND.id,
  den: v(100, -36, -205),
  /** Its path out of the pocket's open north side and round to the feeding flat. */
  path: [v(100, -36, -205), v(100, -34, -180), v(140, -30, -180), v(180, -36, -250)],
  territory: 16, node: v(100, -38, -210), ordinary: v(30, -38, -190),
  /** The warden shoos a trespasser out of the pocket (faster than a diver's
   * sprint), never harms them. */
  shove: 6,
} as const;
const pocketRock: Solid[] = [
  rock("pocket.west", 82, -218, 85, -186, -20), rock("pocket.east", 115, -218, 118, -186, -20),
  rock("pocket.back", 82, -221, 118, -218, -20),
];

// ---------------------------------------------------------------- adverse: the rock edge
/** An always-on 6.5 m/s current pressing east onto a cliff, with a notch lee. */
export const EDGE = { flowMinZ: -160, flowMaxZ: -140, cliffX: 20, notchZ: [-156, -152] as const } as const;
const edgeRock: Solid[] = [
  rock("edge.cliff_n", 20, -152, 28, -120), rock("edge.cliff_s", 20, -180, 28, -156), rock("edge.notch_back", 24, -156, 28, -152),
];
export const EDGE_RACE: CurrentVolumeDef = {
  id: "current.lab.edge_race", label: "Cliff race",
  // Runs 2 m into the cliff and the floor; the north, south and top sides are open water.
  shape: { kind: "box", center: v(-9, -26, -150), half: v(31, 16, 10) },
  direction: v(1, 0, 0), strength: 6.5, edge: 2,
  // The notch, run 2 m into its rock so the stilled water reaches the back wall.
  lees: [{ min: v(19, -40, -158), max: v(26, -10, -150) }],
  cue: "Sand streams east along the floor and piles against the cliff foot.",
};

/** A gentle current for texture: a light hull crabs; nothing is gated. */
export const DRIFT_LANE: CurrentVolumeDef = {
  id: "current.lab.drift_lane", label: "Drift lane",
  shape: { kind: "tube", a: v(-40, -20, 20), b: v(60, -20, 40), radius: 10 },
  strength: 1.2, edge: 4,
  cue: "Particles drift north-east in a steady sheet.",
};

export const LAB_FLOOR: Solid = { id: "lab.floor", min: v(-76, LAB_FLOOR_Y - 20, -320), max: v(248, LAB_FLOOR_Y, 66) };
export const LAB_SOLIDS: readonly Solid[] = [LAB_FLOOR, ...gullyRock, ...ventRock, ...pocketRock, ...edgeRock];
export const LAB_VOLUMES: readonly CurrentVolumeDef[] = [SPILL, EDGE_RACE, DRIFT_LANE];

// ---------------------------------------------------------------- candidates
export type CandidateId = "vent_pulse" | "slack_current" | "bloom" | "migration";
export interface CycleCandidate {
  readonly id: CandidateId;
  readonly letter: "a" | "b" | "c" | "d";
  readonly label: string;
  readonly cycle: string;
  /** A gate closes a route for part of the cycle; a bonus only adds. */
  readonly kind: "gate" | "bonus";
  /** Open (or the bonus on) while the cycle level is within these bounds. */
  readonly openWhen: { readonly atMost?: number; readonly atLeast?: number };
  /** Where the cue is watched from, and how close counts as watching. */
  readonly site: Vec3;
  readonly watchRange: number;
  /** The gated (or bonus) way, and the way that is always open. Diver-swimmable
   * polylines; the alternative never enters the gated volume at its peak. */
  readonly direct: readonly Vec3[];
  readonly alternative: readonly Vec3[];
}
export const CANDIDATES: readonly CycleCandidate[] = [
  { id: "vent_pulse", letter: "a", label: "Vent pulse: the hot passage", cycle: CHIMNEY_PULSE.id, kind: "gate",
    // Safe only when quiet: any rise lifts the column over a diver's tolerance.
    openWhen: { atMost: 0 }, site: v(186, -20, -85), watchRange: 45,
    direct: [v(186, -20, -66), v(186, -20, -104)],
    alternative: [v(186, -20, -66), v(144, -20, -70), v(144, -20, -100), v(186, -20, -104)] },
  { id: "slack_current", letter: "b", label: "Slackening current: the gully spill", cycle: SPILL_SLACK.id, kind: "gate",
    openWhen: { atMost: 0.15 }, site: v(83, -24, -30), watchRange: 50,
    direct: [v(83, -24, -12), v(83, -24, -48)],
    alternative: [v(83, -24, -12), v(152, -24, -12), v(152, -24, -48), v(83, -24, -48)] },
  { id: "bloom", letter: "c", label: "Lantern bloom: a big harvest for a while", cycle: LANTERN_BLOOM.id, kind: "bonus",
    openWhen: { atLeast: 0.5 }, site: BLOOM.bed, watchRange: 40,
    direct: [v(20, -30, -80), BLOOM.bed], alternative: [v(20, -30, -80), BLOOM.ordinary] },
  { id: "migration", letter: "d", label: "Migration: the warden's pocket opens", cycle: WARDEN_ROUND.id, kind: "gate",
    openWhen: { atLeast: 0.9 }, site: v(100, -30, -170), watchRange: 60,
    direct: [v(100, -30, -165), WARDEN.node], alternative: [v(100, -30, -165), WARDEN.ordinary] },
];

export const candidateOpen = (c: CycleCandidate, level: number): boolean =>
  (c.openWhen.atMost === undefined || level <= c.openWhen.atMost) && (c.openWhen.atLeast === undefined || level >= c.openWhen.atLeast);
