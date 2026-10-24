/** How a current acts on the diver or a hull. Pure: the caller adds the
 * returned `drift` to its own drive velocity and sends the sum through the
 * SAME swept move it already uses for input (see move.ts). Drift is never a
 * separate teleport, so it can never carry an actor through rock.
 *
 * Rules, in order:
 * 1. Exposure: drift = flow × (1 − authority).
 * 2. No riding: the ground velocity is the physical sum drive + drift, kept
 *    inside the actor's reach set: everything it could do by swimming or
 *    driving in still water (a ball of its drive speed), by letting go (the
 *    drift itself), or a blend of the two (their convex hull). So in EVERY
 *    direction, progress with input never beats the better of still-water
 *    travel and simply drifting: no heading, downstream or diagonal, turns a
 *    current into propulsion. What the sum keeps: drift while you are stopped
 *    (involuntary displacement), the whole drift against you (upstream
 *    resistance), and a downstream push while you cross. In a current
 *    stronger than your drive, crossing is slow and you are swept hard.
 * 3. Holding: a stopped actor drifts unless it holds. Station keeping cancels
 *    up to `cruise` of drift, the grapple up to its line rating, the mooring
 *    anchor up to its hold; any excess still drifts.
 * 4. Cost: while driving in a current, extra drain in proportion to the drift
 *    against the drive's authority (`effort`); while holding, for what the hold
 *    cancels. The diver has no battery: a current costs them time and
 *    position, never health.
 *
 * Contact with rock caused by the current alone is never an impact (move.ts). */
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
    const ground = limitToReach({ x: drive.x + raw.x, y: drive.y + raw.y, z: drive.z + raw.z }, speed, raw);
    const drift = { x: ground.x - drive.x, y: ground.y - drive.y, z: ground.z - drive.z };
    const effort = effortOf(rawSpeed);
    return { drift, extraDrain: cost(effort), effort, headwind: Math.max(0, speed - dot(ground, drive) / speed), held: 0, overpowered: false };
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

/** The point of the reach set nearest `g`: the convex hull of the ball of
 * radius `speed` (still-water travel) and the point `drift` (letting go).
 * Points already inside are returned unchanged. When the drift is no faster
 * than the drive the hull is just the ball; otherwise it is a ball with a
 * cone running out to the drift, solved in the plane of the flow axis. */
export function limitToReach(g: Vec3, speed: number, drift: Vec3): Vec3 {
  const U = Math.max(0, speed), D = len(drift), G = len(g);
  if (D <= U) return G <= U || G === 0 ? g : scale(g, U / G);
  if (U <= 0) return drift;
  const axis = scale(drift, 1 / D), a = dot(g, axis);
  const radial = { x: g.x - axis.x * a, y: g.y - axis.y * a, z: g.z - axis.z * a }, r = len(radial);
  const L = Math.sqrt(D * D - U * U), t0 = (U * U) / D, r0 = (U * L) / D;
  if (G <= U || (a >= t0 && a <= D && r <= ((D - a) * U) / L + 1e-12)) return g;
  // Candidates on the boundary: the cone's generator from the apex (the
  // drift) to its tangent circle, and the ball beyond that circle.
  const ex = (t0 - D) / L, ey = r0 / L;
  const s = Math.max(0, Math.min(L, (a - D) * ex + r * ey));
  let best = { a: D + ex * s, r: ey * s }, bestD = (a - best.a) ** 2 + (r - best.r) ** 2;
  const onBall = { a: (a * U) / G, r: (r * U) / G };
  if (onBall.a <= t0 + 1e-12) {
    const d2 = (a - onBall.a) ** 2 + (r - onBall.r) ** 2;
    if (d2 < bestD) { best = onBall; bestD = d2; }
  }
  const out = r > 1e-12 ? scale(radial, best.r / r) : ZERO;
  return { x: axis.x * best.a + out.x, y: axis.y * best.a + out.y, z: axis.z * best.a + out.z };
}
