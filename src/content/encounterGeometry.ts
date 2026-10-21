/** Numeric copies of authored primitives, shared by art and encounter queries.
 * Metres; local -Z is the nose. No movement collider or saved-state authority. */
export type Point3 = readonly [number, number, number];
export interface LoftSection { readonly z: number; readonly w: number; readonly low: number; readonly high: number }
export interface ContactBox { readonly center: Point3; readonly size: Point3 }
export const SCOUT_GEOMETRY = {
  bow: [{ z: -3.6, w: .15, low: .15, high: .6 }, { z: -2.6, w: .7833, low: .05, high: .7667 }],
  body: [{ z: -2.6, w: .7833, low: .05, high: .7667 }, { z: -2.1, w: 1.1, low: 0, high: .85 },
    { z: .1, w: 1.85, low: 0, high: .9 }, { z: 2.5, w: 1.15, low: .2, high: .75 }],
  inset: [{ z: -2, w: .7, low: .15, high: .6 }, { z: 0, w: 1.7, low: .1, high: .7 }, { z: 2.5, w: 1.15, low: .2, high: .7 }],
  canopy: [[-.78, .85, -1.5], [.94, .85, -1.5], [1, 1.95, .1], [-.65, 1.95, .1]],
  starboard: [[.94, .85, -1.5], [1.2, .8, 1], [1, 1.95, .1]],
  port: [[-.78, .85, -1.5], [-.9, .8, 1], [-.65, 1.95, .1]],
  aft: [[-.6, 1.96, .1], [.95, 1.96, .1], [.9, 1.1, 1.02], [-.78, 1.1, 1.02]],
  prow: { center: [0, .61, -2.2], size: [1.3, .2, .95] },
  /** Swept side-fin tip half-width: S3-02 option B trims it to the 2.45 m berth envelope. */
  finTip: 2.45,
} as const;
export const SPINDLE_GEOMETRY = {
  body: [{ z: -3.7, w: .1, low: 0, high: .4 }, { z: -1, w: .85, low: 0, high: 1 }, { z: 2.8, w: .7, low: .1, high: 1 }],
  roof: { center: [0, 1.4, 0], size: [1.2, .12, 1.5] },
  float: { radius: [.32, .45, 2.6] },
} as const;
/** M2-B1 workboat envelopes shared with src/render/fleetArt.ts: low hull, raised
 * pilot compartment, forward pane, guarded arms and the aft major-mount volume
 * (cabin or rack; a bare mount is conservatively treated the same). */
export const CREEL_GEOMETRY = {
  body: { center: [0, .69, .15], size: [3.96, 1.38, 6.2] },
  cabin: { center: [0, 2.08, -1.675], size: [2.3, 1.4, 2.15] },
  window: { center: [0, 2.08, -2.78], size: [1.9, .74, .06] },
  mount: { center: [0, 2.44, 1.325], size: [3.44, 2.12, 3.75] },
  tools: [{ center: [-1.3, .82, -2.95], size: [.5, .5, .75] }, { center: [1.3, .82, -2.95], size: [.5, .5, .75] }],
} as const;
/** Twin keel pontoons as one box per side, from S3's HEARTHLINE_KEELS (x 6.12..9.32,
 * keel datum to y 3.2, ±14.5), clear of the lock transfer corridor. */
export const HEARTHLINE_KEEL = { centerY: 1.6, offsetX: 7.72, size: [3.2, 3.2, 29] } as const;
export const HUNTER_GEOMETRY = {
  body: [{ z: -4, w: .36, low: .5, high: .68 }, { z: -3.3, w: .9, low: .34, high: .87 },
    { z: -1.8, w: 1.2, low: .12, high: 1.15 }, { z: 1, w: .7, low: .2, high: 1.05 }, { z: 4, w: .1, low: .4, high: .7 }],
  mouth: [0, .46, -4.01],
  // Includes tail, both animated fins and .045 rad body roll, at every yaw.
  worldEnvelope: { radius: 4.65, bottom: -1.23, height: 2.91 },
  localEnvelope: { min: [-3.55, -1.07, -4.05], max: [3.55, 2.71, 4.5] },
  mouthGap: .5, reach: .65, investigateGap: 4, withdrawalGap: 3.5,
  // ENC-1: a 2 s withdrawal after each bite (was 3 s cycles) paces the ramp.
  cycleSeconds: 4, contactSeconds: 2,
  approachSpeed: 7, investigateSpeed: 3, yieldSpeed: 13,
} as const;
/** Conservative actor-separation pieces; each animated art triangle fits a
 * piece. The long fins do not turn the narrow rostrum into a square face. */
export const HUNTER_PART_ENVELOPES: readonly ContactBox[] = [
  {center:[0,.59,-3.55],size:[1.92,.65,1]}, {center:[0,.63,-2.05],size:[2.5,1.06,2.6]},
  {center:[0,.65,-.4],size:[2.5,1.1,2.8]}, {center:[0,.7,2.5],size:[1.5,1,3]},
  {center:[0,.85,3.75],size:[.25,3.7,1.5]}, {center:[0,1.8,.75],size:[.15,1.8,3.3]},
  {center:[0,.9,-2.9],size:[1.5,.6,2.2]},
  {center:[0,1,-1.9],size:[3.9,1.2,1]}, {center:[0,.8,.6],size:[7.1,2.1,4.4]},
];
