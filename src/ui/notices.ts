import { FIXED_SECONDS } from "../sim/clock.js";
import { eyeHeight } from "../sim/state.js";
import { exposure } from "../sim/survival.js";
import type { GameState, NoticeOptions, Vec3 } from "../sim/types.js";

// Trial presentation lifetimes. Only errors/status use wall time; no queue or
// saved state is involved. Ongoing danger remains in the separate hazard area.
export const NOTICE_SECONDS = { action: 4, hazard: 6, error: 12, system: 3, release: 2.5, call: 3 } as const;
type ThreatMode = GameState["world"]["threat"]["mode"];
export interface PresentedNotice extends NoticeOptions {
  message: string;
  error: boolean;
  priority: number;
  activeLeft: number;
  expiresAt: number | null;
  release?: boolean;
}

/** Pure, bounded presentation state. Wall time is supplied by the DOM owner. */
export class EncounterPresentation {
  central: PresentedNotice | null = null;
  status: { message: string; expiresAt: number } | null = null;
  private mode: ThreatMode | null = null;
  private refuge = false;
  private actor: string | null = null;
  private danger = false;
  private menuVisible = false;
  private call: { origin: Vec3; activeLeft: number } | null = null;

  notify(message: string, error: boolean, options: NoticeOptions, now: number): void {
    this.expire(now);
    const channel = options.channel ?? "action";
    // SessionEvents labels successful writes as persistence too. Their success
    // is bookkeeping; only a failure/reminder claims the central priority.
    if ((channel === "system" || channel === "persistence") && !error) {
      this.status = { message, expiresAt: now + NOTICE_SECONDS.system * 1000 };
      return;
    }
    const priority = channel === "persistence" ? 4 : channel === "hazard" ? 3 : error ? 2 : 1;
    // Suppressed transients are dropped, including panel outcomes. There is no
    // hidden pending success to replay after a hazard, refuge or replacement.
    const currentPriority = this.menuVisible && this.central?.channel === "hazard" ? 0 : this.central?.priority ?? 0;
    if (priority < currentPriority || priority < 3 && this.danger && !this.menuVisible) return;
    const wall = channel === "persistence" || error && channel !== "hazard";
    this.central = { ...options, channel, message, error, priority,
      activeLeft: channel === "hazard" ? NOTICE_SECONDS.hazard : NOTICE_SECONDS.action,
      expiresAt: wall ? now + NOTICE_SECONDS.error * 1000 : null };
  }

  observe(state: GameState, danger: boolean): void {
    const e = exposure(state), mode = state.world.threat.mode;
    const actor = `${state.player.mode}/${state.player.controlledVehicleId ?? "diver"}`;
    if ((!this.refuge && e.refuge) || this.actor !== null && actor !== this.actor) this.clearAction();
    const notice = this.central;
    if (notice?.channel === "hazard") {
      const v = state.fleet.vehicles.find(v => v.id === state.player.controlledVehicleId);
      const valid = notice.context === "threat"
        ? !e.refuge && (notice.release ? mode === "disengage" : mode !== "idle" && mode !== "disengage")
        : notice.context === "oxygen" ? !e.breathable && state.player.vitals.oxygen <= 35
        : notice.context === "food" ? state.player.vitals.food <= 20
        : notice.context === "hull" ? !!v && (v.disabled || v.charge === 0)
        : true;
      if (!valid) this.central = null;
    }
    if (!e.refuge && mode === "disengage" && this.mode !== null && this.mode !== "idle" && this.mode !== "disengage") {
      if ((this.central?.priority ?? 0) <= 3) this.central = {
        message: "Calls fading", error: false, channel: "hazard", context: "threat", priority: 3,
        release: true, activeLeft: NOTICE_SECONDS.release, expiresAt: null,
      };
    }
    if (e.refuge || mode === "idle" || mode === "disengage") this.call = null;
    if (danger && !this.menuVisible && (this.central?.priority ?? 3) < 3) this.central = null;
    this.mode = mode;
    this.refuge = e.refuge;
    this.actor = actor;
    this.danger = danger;
  }

  step(state: GameState, danger: boolean): void {
    this.observe(state, danger);
    if (this.central?.expiresAt === null) {
      this.central.activeLeft -= FIXED_SECONDS;
      if (this.central.activeLeft < 1e-9) this.central = null;
    }
    if (this.call) {
      this.call.activeLeft -= FIXED_SECONDS;
      if (this.call.activeLeft < 1e-9) this.call = null;
    }
  }

  threatCall(origin: Vec3, state: GameState): void {
    if (![origin.x, origin.y, origin.z].every(Number.isFinite) || exposure(state).refuge ||
      state.world.threat.mode === "idle" || state.world.threat.mode === "disengage") return;
    this.call = { origin: { ...origin }, activeLeft: NOTICE_SECONDS.call };
  }

  callDirection(state: GameState): { sector: string; label: string; glyph: string } | null {
    if (!this.call || exposure(state).refuge || ["idle", "disengage"].includes(state.world.threat.mode)) return null;
    const pose = state.player.pose, origin = this.call.origin;
    const dx = origin.x - pose.position.x, dz = origin.z - pose.position.z,
      dy = origin.y - pose.position.y - eyeHeight(state);
    const right = dx * Math.cos(pose.yaw) + dz * Math.sin(pose.yaw),
      forward = dx * Math.sin(pose.yaw) - dz * Math.cos(pose.yaw);
    const facing = forward * Math.cos(pose.pitch) + dy * Math.sin(pose.pitch),
      up = dy * Math.cos(pose.pitch) - forward * Math.sin(pose.pitch);
    const elevation = Math.atan2(up, Math.hypot(right, facing));
    const sectors = ["ahead", "ahead-right", "right", "behind-right", "behind", "behind-left", "left", "ahead-left"];
    const index = (Math.round(Math.atan2(right, facing) / (Math.PI / 4)) + 8) % 8;
    const vertical = elevation > Math.PI / 8 ? "above" : elevation < -Math.PI / 8 ? "below" : "";
    const sector = Math.abs(elevation) > Math.PI / 3 ? vertical : sectors[index]!;
    return { sector, label: sector === vertical ? vertical : `${sector.replace("-", " ")}${vertical ? `, ${vertical}` : ""}`,
      glyph: sector === "above" ? "↑" : sector === "below" ? "↓" : ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"][index]! };
  }

  expire(now: number): void {
    if (this.central?.expiresAt !== null && this.central && now >= this.central.expiresAt) this.central = null;
    if (this.status && now >= this.status.expiresAt) this.status = null;
  }

  get nextExpiry(): number | null {
    const times = [this.central?.expiresAt, this.status?.expiresAt].filter((n): n is number => typeof n === "number");
    return times.length ? Math.min(...times) : null;
  }

  clearAction(): void { if (this.central?.channel === "action") this.central = null; }
  setMenu(visible: boolean): void { this.menuVisible = visible; }
  reset(): void {
    this.central = this.status = this.call = null;
    this.mode = this.actor = null;
    this.refuge = this.danger = false;
  }
}
