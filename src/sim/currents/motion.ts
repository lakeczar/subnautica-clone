/** How a current acts on the diver or a hull. Pure: the caller adds the
 * returned `drift` to its own drive velocity and sends the sum through the
 * SAME swept move it already uses for input (`moveCapsule` slices for the
 * diver, `moveHull` for hulls). Drift is never a separate teleport, so it can
 * never carry an actor through rock.
 *
 * Rules, in order:
 * 1. Exposure: drift = flow × (1 − authority).
 * 2. No riding, in the flow's own frame: along the flow you move at the
 *    faster of your drive's downstream part and the drift, never their sum
 *    (the drift shrinks by whatever of your drive already goes downstream).
 *    Against it the whole drift subtracts (headwind); across it your drive is
 *    untouched and the drift pushes you downstream, so you must crab.
 * 3. Holding: a stopped actor drifts unless it holds. Station keeping cancels
 *    up to `cruise` of drift, the grapple up to its line rating, the mooring
 *    anchor up to its hold; any excess still drifts.
 * 4. Cost: drift the drive works against costs extra drain in proportion to
 *    the share of the drive it takes (`effort`). The diver has no battery: for
 *    them a current costs time and position, never health.
 *
 * Impact damage must come from the drive velocity only: being pressed onto
 * rock by a current is never a collision (see the CY handoff). */
import type { Vec3 } from "../types.js";
import type { CurrentActor, HoldMode } from "./types.js";

export const MOTION = {
  /** Authority cap, S4's `protectionFor` clamp. */
  maxAuthority: 0.95,
  /** Extra drain at full effort, as a multiple of cruise drain: fighting a
   * current as hard as the drive can costs three times cruise in total. */
  fightDrain: 2,
  /** SYS-1 grapple: the line takes up to this much drift; the winch costs a
   * quarter of what thrusters would for the same hold. */
  grappleHolds: 4,
  grappleDrain: 0.25,
  /** SYS-1 MOORING_ANCHOR.holds; free once set. */
  anchorHolds: 1.5,
  /** Below this, intent is "stopped". */
  stopped: 0.05,
} as const;

export interface FlowResponse {
  /** m/s to add to the drive velocity before the sweep. */
  readonly drift: Vec3;
  /** Battery percent per second on top of the actor's ordinary drain. */
  readonly extraDrain: number;
  /** 0..1 of the drive spent fighting the flow. */
  readonly effort: number;
  /** Ground speed lost along the heading, m/s (0 when stopped). */
  readonly headwind: number;
  /** Drift a hold cancelled this step, m/s. */
  readonly held: number;
  /** True when the flow exceeds what the hold can cancel. */
  readonly overpowered: boolean;
}

const len = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);
const scale = (v: Vec3, k: number): Vec3 => ({ x: v.x * k, y: v.y * k, z: v.z * k });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

/** Drift before any hold: flow × (1 − authority). */
export function exposure(actor: CurrentActor): number {
  return 1 - Math.max(0, Math.min(MOTION.maxAuthority, actor.authority));
}

/** `drive` is the actor's own velocity this step (m/s, before drift); `hold`
 * only matters while it is stopped. `powered` is false for a flat or
 * disabled hull; the diver is always "powered" by their fins but holds nothing. */
export function respondToFlow(flow: Vec3, actor: CurrentActor, drive: Vec3, hold: HoldMode, powered = true): FlowResponse {
  const raw = scale(flow, exposure(actor)), rawSpeed = len(raw);
  if (!(rawSpeed > 1e-9) || ![raw.x, raw.y, raw.z].every(Number.isFinite))
    return { drift: ZERO, extraDrain: 0, effort: 0, headwind: 0, held: 0, overpowered: false };
  const speed = len(drive), effortOf = (fought: number) => (actor.cruise > 0 ? Math.min(1, fought / actor.cruise) : 1);
  const cost = (effort: number, share = 1) => (powered ? actor.drain * MOTION.fightDrain * effort * share : 0);
  if (speed > MOTION.stopped) {
    const downstream = Math.max(0, dot(drive, raw) / rawSpeed);
    const drift = scale(raw, Math.max(0, rawSpeed - downstream) / rawSpeed);
    const effort = effortOf(len(drift));
    return { drift, extraDrain: cost(effort), effort, headwind: Math.max(0, -dot(drift, drive) / speed), held: 0, overpowered: false };
  }
  const limit = !powered ? 0
    : hold === "station" ? actor.cruise
    : hold === "grapple" ? MOTION.grappleHolds
    : hold === "anchor" ? MOTION.anchorHolds : 0;
  const held = Math.min(rawSpeed, limit), drift = scale(raw, 1 - held / rawSpeed);
  const effort = held > 0 ? effortOf(held) : 0;
  const extraDrain = hold === "station" ? cost(effort)
    : hold === "grapple" ? cost(Math.min(1, held / MOTION.grappleHolds), MOTION.grappleDrain) : 0;
  return { drift, extraDrain, effort, headwind: 0, held, overpowered: limit > 0 && rawSpeed > limit + 1e-9 };
}

