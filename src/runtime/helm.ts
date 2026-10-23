/** UX-1: at the Hearthline's helm, looking around does not steer.
 *
 * Presentation-side input only. The simulation still steers the carrier by the
 * player's yaw, as it always has; this rewrites each fixed step's sampled
 * controls while the player holds the helm:
 * - mouse and arrow look move a head look (render only, clamped), not the hull;
 * - A/D are the rudder: an eased, bounded turn rate instead of a slide;
 * - the hull is held level (rise and dive are Space and C);
 * - throttle, rudder or depth input while holding station takes the helm back.
 * Leaving the helm hands the head look on to the walking view, so it does not jump. */
import type { GameCommand, GameState } from "../sim/types.js";
import { FIXED_SECONDS } from "../sim/clock.js";
import { atCarrierHelm } from "../sim/carrierStations.js";

/** Head look limits, radians: well past the side windows, short of the seat back. */
export const HELM_LOOK = { yaw: 1.9, up: 0.6, down: -0.85 } as const;
/** Rudder: full turn rate (rad/s, about 18°/s) and seconds to reach it. */
export const HELM_RUDDER = { rate: 0.32, ease: 0.6 } as const;

const clamp = (v: number, low: number, high: number): number => Math.max(low, Math.min(high, v));

export class HelmControl {
  /** Head look relative to the carrier's heading and level, radians. */
  readonly look = { yaw: 0, pitch: 0 };
  private rudder = 0;
  private helmId: string | null = null;
  private resumed = false;
  private handover: { yaw: number; pitch: number } | null = null;
  private tick: number | null = null;

  /** Rewrites one fixed step's controls. Off the helm they pass through. */
  apply(state: GameState, controls: readonly GameCommand[]): GameCommand[] {
    // One call per fixed step: a jump in time is a load or a new expedition, so start level.
    if (this.tick !== null && Math.abs(state.tick - this.tick) > 1) this.clear();
    this.tick = state.tick;
    const h = atCarrierHelm(state);
    if (!h) {
      if (this.helmId !== null && state.player.mode === "interior") this.handover = { ...this.look };
      if (this.helmId !== null) this.reset();
      return this.handOver(controls);
    }
    this.handover = null;
    if (this.helmId !== h.id) { this.reset(); this.helmId = h.id; }
    const look = controls.find((c) => c.type === "look"), move = controls.find((c) => c.type === "move");
    if (look) {
      this.look.yaw = clamp(this.look.yaw + look.yawDelta, -HELM_LOOK.yaw, HELM_LOOK.yaw);
      this.look.pitch = clamp(this.look.pitch + look.pitchDelta, HELM_LOOK.down, HELM_LOOK.up);
    }
    const dock = state.fleet.docking, input = !!move && (move.forward !== 0 || move.right !== 0 || move.vertical !== 0);
    // Throttle, rudder or depth input releases a hold, except while the lock cycles.
    const releasing = !!dock?.stationKeeping && !dock.transaction && input;
    // A hold is a hold: no rudder (not even one still easing out) turns the hull
    // while station keeping is engaged, and A/D do nothing during a lock cycle.
    if (dock && (dock.transaction || (dock.stationKeeping && !releasing))) this.rudder = 0;
    else {
      const steer = move ? clamp(move.right, -1, 1) : 0, step = FIXED_SECONDS / HELM_RUDDER.ease;
      this.rudder += clamp(steer - this.rudder, -step, step);
      if (Math.abs(this.rudder) < 1e-6) this.rudder = 0;
    }
    const steering: GameCommand = {
      type: "look", yawDelta: this.rudder * HELM_RUDDER.rate * FIXED_SECONDS,
      pitchDelta: clamp(-state.player.pose.pitch, -0.8, 0.8),
    };
    const out: GameCommand[] = [steering];
    for (const c of controls) if (c.type !== "look") out.push(c.type === "move" ? { ...c, right: 0 } : c);
    if (releasing) {
      if (!this.resumed) out.unshift({ type: "carrier", action: "helm" });
      this.resumed = true;
    } else this.resumed = false;
    return out;
  }

  /** The walking view picks up where the head look was, within the
   * simulation's per-step look bound. */
  private handOver(controls: readonly GameCommand[]): GameCommand[] {
    const pending = this.handover;
    if (!pending) return [...controls];
    const yaw = clamp(pending.yaw, -0.6, 0.6), pitch = clamp(pending.pitch, -0.6, 0.6);
    pending.yaw -= yaw; pending.pitch -= pitch;
    if (pending.yaw === 0 && pending.pitch === 0) this.handover = null;
    const out = controls.map((c) => c.type === "look" ? { ...c, yawDelta: c.yawDelta + yaw, pitchDelta: c.pitchDelta + pitch } : c);
    return out.some((c) => c.type === "look") ? out : [{ type: "look", yawDelta: yaw, pitchDelta: pitch }, ...out];
  }

  /** Recentre the head look (taking the helm, a new session). */
  reset(): void {
    this.look.yaw = 0;
    this.look.pitch = 0;
    this.rudder = 0;
    this.helmId = null;
    this.resumed = false;
  }
  /** Forget everything when an expedition is entered (New, Continue, import):
   * the app calls this; the tick-jump check above is only a backstop. */
  clear(): void { this.reset(); this.handover = null; }
}
