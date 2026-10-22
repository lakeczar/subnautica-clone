import type { HullId } from "../registry.js";

/** ENC-1: how the Canopy sound hunter shows itself before it harms, and how
 * hard it bites the longer a loud craft stays in its pursuit. Metres, seconds,
 * radians. Tuning hypotheses: adjust from playtests, keep the tested promises
 * (first contact non-lethal from full, disengagement always open). */
export const HUNTER_ENCOUNTER = {
  /** Warn: the animal swims toward the noise instead of waiting out of sight. */
  warn: { speed: 4, stopAt: 24 },
  /** Investigate: a silhouette pass that weaves across the actor's bow, `ahead`
   * along its view (plus `lead` seconds of the actor's speed) and `rise` above
   * its eye line, sweeping ±`sweep` over `period` seconds. */
  pass: { ahead: 11, lead: 1, rise: 1.4, sweep: 0.9, period: 6, closeSpeed: 10, passSpeed: 4 },
  /** Pursuit starts only once it is this close and (before `latest`) inside
   * this cone of the actor's view: the first lunge comes from where it was seen. */
  pursuit: { range: 18, view: 0.55, earliest: 4, latest: 10 },
  /** One bite per contact cycle, loss by the cycle's index in this pursuit. The
   * first is a warning bump that never disables; later bites ramp. */
  bites: { vehicle: [6, 10, 15, 20, 25], diver: [6, 10, 14, 18, 22] },
  /** Metres a bite pushes the craft away from the mouth, as one swept,
   * collision-safe displacement. It never enters the craft's velocity, so the
   * push itself is never charged as an impact (R1 ENC-1-01). Divers and the
   * carrier take none (the diver is light enough to be caught; the carrier is too heavy). */
  knock: { dart: 0.8, creel: 0.5, hush: 0.8, spindle: 0.6, mantle: 0.45, hearthline: 0 } satisfies Record<HullId, number>,
  /** Interest decay per second without noise. A lit lamp lets it keep track.
   * `max` also bounds loaded interest: the save schema still accepts up to 12. */
  interest: { max: 7, dark: 3, lit: 1.5, cover: 3 },
  /** Approach ring: crossing it toward the hunter's home gives the teaching caption once per entry. */
  approachRing: 100,
} as const;

/** Ecology threats (glare stalker, layer skate, hollow choir): the first strike
 * of an engagement lands at this share; later cycles at full strength. */
export const FIRST_STRIKE_SHARE = 0.6;
/** Share of an investigating animal's stand-off bearing pulled toward the
 * actor's view, so the animal that may lunge has been in front of it. */
export const VIEW_BIAS = 0.6;
