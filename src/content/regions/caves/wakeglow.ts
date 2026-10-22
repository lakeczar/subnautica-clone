import type { Vec3 } from "../../../world/types.js";

/** Wakeglow drift (bible `wakeglow_drift`, the Pale Basin's cave resident) as
 * data, Babylon-free.
 *
 * Faint plankton in still vault water: anything moving through leaves a
 * glowing wake that fades over about a minute, so a diver's own trail lights
 * the way back out. A craft's wake glows brighter and wider. The glow is
 * invisible inside a lamp cone, so the trail reads best lamp-off.
 *
 * The cue is the trail's age: the oldest wake still glowing is where you came
 * in. `oldestVisible` is that reading, the rule a lamp-off diver (and a
 * hint, if the game wants one) follows. Rendering and the sim tick are
 * wiring after C3; tests/caves-basin.heavy.test.ts swims it. */

/** Seconds a wake point takes to fade out. */
export const WAKE_FADE_SECONDS = 60;
/** Metres between wake points laid along a moving body's path. */
export const WAKE_SPACING = 0.5;
/** Glow strength by body: a diver, a small craft, a medium craft. */
export const WAKE_STRENGTH = { diver: 1, small: 1.6, medium: 2 } as const;

export interface WakePoint {
  readonly at: Vec3;
  /** Time laid, seconds. */
  readonly t: number;
  readonly strength: number;
}
export interface WakeTrail { readonly points: WakePoint[] }

export const wakeTrail = (): WakeTrail => ({ points: [] });

/** Brightness of one point at `now`: full when laid, linear to nothing at
 * `WAKE_FADE_SECONDS`. */
export function wakeGlow(p: WakePoint, now: number): number {
  const age = now - p.t;
  return age < 0 ? 0 : Math.max(0, 1 - age / WAKE_FADE_SECONDS) * p.strength;
}

/** Lay wake as a body moves: a point every `WAKE_SPACING` metres of path,
 * only where `still(at)` (still vault water; open water carries the drift
 * away). Faded points are dropped. */
export function layWake(trail: WakeTrail, at: Vec3, t: number, strength: number = WAKE_STRENGTH.diver,
  still: (p: Vec3) => boolean = () => true): void {
  const pts = trail.points;
  while (pts.length && wakeGlow(pts[0]!, t) <= 0) pts.shift();
  const last = pts[pts.length - 1];
  if (last && Math.hypot(at.x - last.at.x, at.y - last.at.y, at.z - last.at.z) < WAKE_SPACING) return;
  if (still(at)) pts.push({ at: { ...at }, t, strength });
}

/** Lay wake along a swim: `path` waypoints at `speed` m/s from time `t0`,
 * one point per `WAKE_SPACING`. Returns the time the swim ends. */
export function swimWake(trail: WakeTrail, path: readonly Vec3[], speed: number, t0: number,
  strength: number = WAKE_STRENGTH.diver, still: (p: Vec3) => boolean = () => true): number {
  let t = t0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!, length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const steps = Math.max(1, Math.ceil(length / (WAKE_SPACING / 2)));
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      layWake(trail, { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f }, t + length / speed * f, strength, still);
    }
    t += length / speed;
  }
  return t;
}

/** What an unlit diver at `from` reads from the trail: of the wake points
 * within `reach` that still glow at least `threshold` and that `visible`
 * accepts (clear sight), the oldest: the way they came in. Null when no
 * glowing wake is in view. */
export function oldestVisible(trail: WakeTrail, from: Vec3, now: number, visible: (p: Vec3) => boolean,
  reach = 7, threshold = 0.05): WakePoint | null {
  let best: WakePoint | null = null;
  for (const p of trail.points) {
    if (best && p.t >= best.t) continue;
    if (wakeGlow(p, now) < threshold) continue;
    if (Math.hypot(p.at.x - from.x, p.at.y - from.y, p.at.z - from.z) > reach) continue;
    if (visible(p.at)) best = p;
  }
  return best;
}
