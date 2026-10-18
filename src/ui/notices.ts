import { FIXED_SECONDS } from "../sim/clock.js";
import { eyeHeight } from "../sim/state.js";
import { exposure } from "../sim/survival.js";
import type { GameState, NoticeContext, NoticeOptions, Vec3 } from "../sim/types.js";

// Trial presentation lifetimes. Only errors/status use wall time; no queue or
// saved state is involved. Ongoing danger remains in the separate hazard area.
export const NOTICE_SECONDS = { action: 2.5, refusal: 4, hazard: 6, error: 12, system: 3, release: 2.5, call: 3 } as const;
const NO_BANNERS: ReadonlySet<NoticeContext> = new Set();
export interface ActionResult {
  message: string;
  full: string;
  refusal?: NoticeOptions["refusal"];
  error: boolean;
  activeLeft: number;
}
const sameExit = (a: NoticeOptions["refusal"], b: NoticeOptions["refusal"]): boolean =>
  a?.vehicleId === b?.vehicleId && a?.code === b?.code;
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
  result: ActionResult | null = null;
  central: PresentedNotice | null = null;
  status: { message: string; expiresAt: number } | null = null;
  private mode: ThreatMode | null = null;
  private refuge = false;
  private actor: string | null = null;
  private menuVisible = false;
  private exitGuidance: NoticeOptions["refusal"];
  private call: { origin: Vec3; activeLeft: number } | null = null;

  notify(message: string, error: boolean, options: NoticeOptions, now: number,
    covered: ReadonlySet<NoticeContext> = NO_BANNERS): void {
    this.expire(now);
    const channel = options.channel ?? "action";
    if (channel === "action") {
      if (!this.menuVisible) this.result = {
        message: options.refusal ? error && sameExit(options.refusal, this.exitGuidance) ? "Exit blocked" : message
          : options.summary ?? message,
        full: message, ...(options.refusal ? { refusal: { ...options.refusal } } : {}), error,
        activeLeft: error ? NOTICE_SECONDS.refusal : NOTICE_SECONDS.action };
      return;
    }
    // Coverage belongs to this delivery's current, rendered banners. Never
    // retain a previous frame's set or classify prose by its wording.
    if (channel === "hazard" && options.context && covered.has(options.context)) return;
    // A confirmed local write resolves its obsolete failure/reminder. System
    // successes (including exports) cannot establish local-save recovery.
    if ((channel === "system" || channel === "persistence") && !error) {
      if (channel === "persistence" && this.central?.channel === "persistence") this.central = null;
      this.status = { message, expiresAt: now + NOTICE_SECONDS.system * 1000 };
      return;
    }
    const priority = channel === "persistence" ? 4 : channel === "hazard" ? 3 : error ? 2 : 1;
    // Suppressed alerts are dropped; there is no hidden queue to replay.
    const currentPriority = this.menuVisible && this.central?.channel === "hazard" ? 0 : this.central?.priority ?? 0;
    if (priority < currentPriority) return;
    const wall = channel === "persistence" || error && channel !== "hazard";
    this.central = { ...options, channel, message, error, priority,
      activeLeft: channel === "hazard" ? NOTICE_SECONDS.hazard : NOTICE_SECONDS.action,
      expiresAt: wall ? now + NOTICE_SECONDS.error * 1000 : null };
  }

  /** Only the current, rendered pilot guidance can cover an exit result. A
   * fallback delivered without a match stays readable until its context changes. */
  observeExitGuidance(guidance: NoticeOptions["refusal"]): void {
    if (this.result?.refusal && !sameExit(guidance, this.exitGuidance)) this.clearAction();
    this.exitGuidance = guidance;
  }

  observe(state: GameState, covered: ReadonlySet<NoticeContext> = NO_BANNERS): void {
    const e = exposure(state), mode = state.world.threat.mode;
    const actor = `${state.player.mode}/${state.player.controlledVehicleId ?? "diver"}`;
    const actorChanged = this.actor !== null && actor !== this.actor;
    if (state.opening.phase < 4 || this.refuge !== e.refuge || actorChanged) this.clearAction();
    if (actorChanged) this.call = null;
    const notice = this.central;
    if (notice?.channel === "hazard") {
      const v = state.fleet.vehicles.find(v => v.id === state.player.controlledVehicleId);
      const valid = notice.context === "threat"
        ? !e.refuge && (notice.release ? mode === "disengage" : mode !== "idle" && mode !== "disengage")
        : notice.context === "oxygen" ? !e.breathable && state.player.vitals.oxygen <= 35
        : notice.context === "food" ? state.player.vitals.food <= 20
        : notice.context === "hull" ? !!v && (v.disabled || v.charge === 0)
        : true;
      if (!valid || !notice.release && notice.context && covered.has(notice.context)) this.central = null;
    }
    if (!e.refuge && mode === "disengage" && this.mode !== null && this.mode !== "idle" && this.mode !== "disengage") {
      if ((this.central?.priority ?? 0) <= 3) this.central = {
        message: "Calls fading", error: false, channel: "hazard", context: "threat", priority: 3,
        release: true, activeLeft: NOTICE_SECONDS.release, expiresAt: null,
      };
    }
    if (e.refuge || mode === "idle" || mode === "disengage") this.call = null;
    this.mode = mode;
    this.refuge = e.refuge;
    this.actor = actor;
  }

  step(state: GameState, covered: ReadonlySet<NoticeContext> = NO_BANNERS): void {
    this.observe(state, covered);
    if (this.result) {
      this.result.activeLeft -= FIXED_SECONDS;
      if (this.result.activeLeft < 1e-9) this.result = null;
    }
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

  callDirection(state: GameState): { sector: string; label: string; bearingStep: number; elevation: "above" | "below" | "level"; vertical: boolean } | null {
    if (!this.call || exposure(state).refuge || ["idle", "disengage"].includes(state.world.threat.mode)) return null;
    const pose = state.player.pose, origin = this.call.origin;
    const dx = origin.x - pose.position.x, dz = origin.z - pose.position.z,
      dy = origin.y - pose.position.y - eyeHeight(state);
    const right = dx * Math.cos(pose.yaw) + dz * Math.sin(pose.yaw),
      forward = dx * Math.sin(pose.yaw) - dz * Math.cos(pose.yaw);
    // A horizontal bearing dial: pitch never rotates its notch. Elevation is
    // separately relative to the listener's eye, not a projected screen arrow.
    const elevation = Math.atan2(dy, Math.hypot(right, forward));
    const sectors = ["ahead", "ahead-right", "right", "behind-right", "behind", "behind-left", "left", "ahead-left"];
    const index = (Math.round(Math.atan2(right, forward) / (Math.PI / 4)) + 8) % 8;
    const vertical = elevation > Math.PI / 8 ? "above" : elevation < -Math.PI / 8 ? "below" : "";
    const sector = Math.abs(elevation) > Math.PI / 3 ? vertical : sectors[index]!;
    return { sector, label: sector === vertical ? vertical : `${sector.replace("-", " ")}${vertical ? `, ${vertical}` : ""}`,
      bearingStep: index, elevation: vertical || "level", vertical: Math.abs(elevation) > Math.PI / 3 };
  }

  expire(now: number): void {
    if (this.central?.expiresAt !== null && this.central && now >= this.central.expiresAt) this.central = null;
    if (this.status && now >= this.status.expiresAt) this.status = null;
  }

  get nextExpiry(): number | null {
    const times = [this.central?.expiresAt, this.status?.expiresAt].filter((n): n is number => typeof n === "number");
    return times.length ? Math.min(...times) : null;
  }

  clearAction(): void { this.result = null; }
  setMenu(visible: boolean): void { this.menuVisible = visible; if (visible) this.clearAction(); }
  reset(): void {
    this.central = this.status = this.call = null;
    this.result = null;
    this.mode = this.actor = null;
    this.exitGuidance = undefined;
    this.refuge = false;
  }
}
