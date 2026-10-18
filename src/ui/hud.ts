import { HULLS, HULL_COLLIDERS, OPENING, PLACES, SOURCES } from "../content/registry.js";
import { inCanopyAir, nearPod, nearWorkshop, equipped } from "../sim/inventory.js";
import { personalLimit } from "../sim/progression.js";
import { deliberateExit } from "../runtime/input.js";
import type { AimedTarget, ReachPreview } from "../sim/targeting.js";
import { aimedInteraction, reachPreview } from "../sim/targeting.js";
import { airSupply, exposure } from "../sim/survival.js";
import { distractionPreview, exitBlock, hullDepth, serviceRefusal, serviceState } from "../sim/vehicles.js";
import type { GameState, NoticeContext, NoticeOptions, Vec3, WorldQueries } from "../sim/types.js";
import { FACILITY_SOLIDS } from "../sim/world.js";
import { escapeHtml, recoveryDisplay } from "./format.js";
import { EncounterPresentation, type ActionResult } from "./notices.js";

export interface HudAim { target: AimedTarget | null; preview: ReachPreview | null }

// State is supplied by GameView on each call; only transient presentation
// bookkeeping lives here. Input and modal focus remain with GameView.
export class HudView {
  private readonly hud: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly toast: HTMLElement;
  private noticeTimer = 0;
  private announcementTimer = 0;
  private announcementVersion = 0;
  private shownResult: ActionResult | null = null;
  private announcedContexts = new Set<string>();
  private current: GameState | null = null;
  private ascentBlocked = false;
  private thrustBlocked = false;
  private disposed = false;
  private readonly presentation = new EncounterPresentation();
  private impactTimer = 0;
  private impactLoss = 0;
  private impactAt = -Infinity;
  private impactUntil = -Infinity;
  private impactVehicle: string | null = null;
  private pilotId: string | null = null;
  private pilotSince = 0;
  private startTick: number | null = null;
  private exitKey = "E";
  private exitProgress: number | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly world: WorldQueries,
  ) {
    this.hud = this.get("hud");
    this.canvas = this.get<HTMLCanvasElement>("ocean");
    this.toast = this.get("notification");
  }

  private get<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = this.root.querySelector<T>(`#${id}`);
    if (!element) throw new Error(`Missing UI element ${id}`);
    return element;
  }

  update(state: GameState, cruise: boolean, forward = 0, aim?: HudAim): void {
    this.startTick ??= state.tick;
    const covered = this.renderHazards(state);
    this.presentation.observe(state, covered);
    this.current = state;
    this.renderPilotGuidance(state);
    this.renderBlocked();
    this.renderNotices();
    this.renderCall(state);
    const p = state.player.pose.position,
      mode = state.player.mode;
    const degrees = ((state.player.pose.yaw * 180) / Math.PI + 360) % 360;
    this.get("compass").textContent =
      ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][
        Math.round(degrees / 45) % 8
      ] ?? "N";
    this.get("bearing").textContent =
      `${Math.round(degrees).toString().padStart(3, "0")}°`;
    this.get("depth").textContent = exposure(state).pressureDepth.toFixed(1);
    this.get("movement").textContent =
      mode === "piloting"
        ? "Piloting"
        : mode === "interior"
          ? "Dry interior"
          : mode === "swimming"
            ? "Swimming"
            : "On foot";
    const home = PLACES.home_pod.position;
    this.get("refuge-distance").textContent =
      `Home pod · ${Math.round(Math.hypot(p.x - home.x, p.z - home.z))} m`;
    this.get("region-name").textContent =
      state.scenario === "carrier-fixture"
        ? "Carrier test fixture"
        : p.x > 62
          ? "Upper Lantern Canopy"
          : p.z < -28
            ? "Splitspine shore"
            : "Hearth Reef";
    this.get("cruise").hidden = !cruise;
    const e = exposure(state),
      v = state.fleet.vehicles.find(
        (v) => v.id === state.player.controlledVehicleId,
      );
    this.get("context-hint").textContent = state.world.action
      ? `Active ${state.world.action.kind} · ${Math.ceil(state.world.action.seconds)} s remaining`
      : state.recovery.operation
        ? `Bobbin · ${state.recovery.operation.phase} · follow the local tether corridor`
        : e.refuge
          ? ""
          : v?.hull === "dart" && p.x > 15 && p.x < 25 && p.z < -16 && p.z > -29
            ? Math.abs(Math.atan2(Math.sin(v.pose.yaw - Math.PI), Math.cos(v.pose.yaw - Math.PI))) > 0.6
              ? "Turn to the open lane" : ""
          : p.x > 68
            ? "Read the upper crowns. Z quiet · cover / retreat · Tab for pulse & reserves."
            : p.z > 9 && p.y < 0 && Math.abs(p.x) < 4
              ? "Below the pod deck · swim around the ramp edge, surface, then approach its amber treads."
              : "";
    const pulse = distractionPreview(state);
    const threatened = !e.refuge && ["warn", "investigate", "pursue"].includes(state.world.threat.mode);
    if (threatened) this.get("context-hint").textContent = "";
    this.get("pulse-summary").textContent = (!equipped(state, "essential_tools") || exposure(state).refuge ||
      !["warn", "investigate", "pursue"].includes(state.world.threat.mode) && state.world.threat.distractionSeconds <= 0) ? ""
      : state.world.threat.distractionSeconds > 0 ? `G · pulse active ${Math.ceil(state.world.threat.distractionSeconds)} s`
      : pulse.refusal === null ? `G · ${pulse.cost} cell points · ${(pulse.remainingCharge + pulse.cost).toFixed(0)} → ${pulse.remainingCharge.toFixed(0)}%`
      : `G · unavailable · Z quiet / cover / retreat`;
    this.get("control-hint").textContent = threatened || this.get("context-hint").textContent ? "" : v
      ? state.tick - this.pilotSince < 720 ? "Look steers · W/S thrust · A/D slide · Space/C rise/dive · Z quiet · Shift boost" : ""
      : state.tick - this.startTick < 3600 ? "WASD move · mouse / arrows look · Space rise · C dive" : "";
    const pitch = state.player.pose.pitch;
    this.get("pitch-cue").hidden = !(mode === "swimming" || v) || Math.abs(pitch) <= 0.14;
    this.get("pitch-cue").innerHTML = `<i style="top:${50 - Math.max(-1, Math.min(1, pitch / (Math.PI / 2))) * 46}%"></i>${Math.abs(pitch) > Math.PI / 4 ? `<small>${Math.round(pitch * 180 / Math.PI)}°</small>` : ""}`;
    this.get("pitch-cue").setAttribute("aria-label", `Pitch ${Math.round(pitch * 180 / Math.PI)} degrees`);
    this.get("surface-cue").hidden = !v || v.pose.position.y < -0.95 || forward <= 0 || v.pose.pitch <= 0.1;
    if (!threatened && v?.hull === "dart" && v.pose.position.z > -16 && v.pose.position.z < -7 &&
      Math.abs(v.pose.position.x - 20) < 6 && v.velocity.z < -4)
      this.get("context-hint").textContent = "Slow · cradle ahead";
    if (this.get("context-hint").textContent) this.get("control-hint").textContent = "";
    const target = aim ? aim.target : aimedInteraction(state, this.world);
    this.target(target, state, aim ? aim.preview : target ? null : reachPreview(state, this.world));
    const air = airSupply(state);
    const airLabel = airSourceLabel(state);
    const service = mode === "piloting" && v?.hull === "dart" ? serviceState(state, v.id) : null;
    const serviceLine = v && service === "ready" && serviceRefusal(state, v.id) === null ? "Service here · Tab"
      : service === "patch" ? "Patch hull first" : "";
    this.get("vitals").dataset.airSource = air.kind;
    this.get("vitals").innerHTML =
      `<div class="${state.player.vitals.oxygen < 35 ? "urgent" : ""}"><span>O₂</span><b>${state.player.vitals.oxygen.toFixed(0)}%</b><i style="--fill:${state.player.vitals.oxygen}%"></i><small>${escapeHtml(airLabel)}</small></div><div><span>HEALTH</span><b>${state.player.vitals.health.toFixed(0)}</b><i style="--fill:${state.player.vitals.health}%"></i></div><div><span>FOOD</span><b>${state.player.vitals.food.toFixed(0)}</b><i style="--fill:${state.player.vitals.food}%"></i><small>${state.player.vitals.food === 0 ? "Grace / gather normally" : "F · eat meal"}</small></div>${v ? `<div class="${v.charge < 25 ? "urgent" : ""}${this.impactVehicle === v.id && performance.now() < this.impactUntil ? " hull-impact" : ""}"><span>${HULLS[v.hull].label.toUpperCase()}</span><b>${v.charge.toFixed(0)}% power</b><small>Hull ${v.health.toFixed(0)}% · ${hullDepth(v).toFixed(0)} / ${HULLS[v.hull].initialDepth} m</small>${serviceLine ? `<small class="service-hint">${serviceLine}</small>` : ""}</div>` : ""}`;
    const opening = state.opening.phase < 4;
    this.root.dataset.opening = String(opening);
    // Hide only routine exploration elements. Warnings, pause and the opening
    // remain siblings; persistence and graphics notices live outside the HUD.
    for (const id of ["hud-region", "hud-heading", "hud-tools", "vitals", "hud-bottom", "crosshair", "interact-prompt", "interaction-stack"])
      this.get(id).hidden = opening;
    if (opening) this.clearActionNotice();
    if (opening) for (const id of ["pilot-guidance", "pitch-cue", "surface-cue"]) this.get(id).hidden = true;
    if (!opening && this.get("opening").contains(document.activeElement))
      this.canvas.focus({ preventScroll: true });
    this.get("opening").hidden = !opening;
    if (opening) {
      const o = OPENING[state.opening.phase as 0 | 1 | 2 | 3];
      const progress = `POD CHECK ${state.opening.phase + 1} / 4`;
      // Avoid repeatedly announcing unchanged captions on each HUD refresh.
      if (this.get("opening-progress").textContent !== progress || this.get("opening-title").textContent !== o.label) {
        this.get("opening-progress").textContent = progress;
        this.get("opening-title").textContent = o.label;
        this.get("opening-act").textContent = `${state.opening.phase === 3 ? "Stand up" : o.label} · E`;
        this.get("opening-caption").textContent = o.caption;
        this.get("opening-detail").textContent = o.detail;
        this.get("opening-detail").hidden = !o.detail;
      }
    }
    this.hud.dataset.tick = String(state.tick);
    this.hud.dataset.position = `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
    this.hud.dataset.mode = mode;
    this.hud.dataset.yaw = String(state.player.pose.yaw);
    this.hud.dataset.pitch = String(state.player.pose.pitch);
  }

  private renderPilotGuidance(state: GameState): void {
    const v = state.player.mode === "piloting"
      ? state.fleet.vehicles.find(v => v.id === state.player.controlledVehicleId) : undefined;
    const block = v ? exitBlock(state, this.world) : null;
    const guidance = this.get("pilot-guidance");
    guidance.hidden = !v || state.opening.phase < 4;
    if (this.pilotId !== (v?.id ?? null)) {
      this.pilotId = v?.id ?? null;
      this.pilotSince = state.tick;
    }
    if (v) {
      const stopped = Math.hypot(v.velocity.x, v.velocity.y, v.velocity.z) < 0.2;
      const html = `<kbd>${this.exitKey}</kbd> ${block ? "Exit blocked" : `${deliberateExit(state) ? "Hold to exit" : "Exit"}`}${this.exitProgress !== null ? ` <progress aria-label="Exit hold" max="1" value="${this.exitProgress}"></progress>` : ""}${block || stopped ? `<small>${escapeHtml(block?.message ?? `Suit ${personalLimit(state)} m · hull ${HULLS[v.hull].initialDepth} m`)}</small>` : ""}`;
      if (guidance.innerHTML !== html) guidance.innerHTML = html;
      guidance.classList.toggle("urgent", block !== null);
    }
    this.presentation.observeExitGuidance(v && block && !guidance.hidden && !this.hud.hidden
      ? { kind: "exit", vehicleId: v.id, code: block.code } : undefined);
  }

  target(t: AimedTarget | null, state: GameState | null, preview: ReachPreview | null = null): void {
    const html = t
      ? `${t.verb === "empty" ? "" : "<kbd>E</kbd> "}${escapeHtml(t.kind === "vehicle" && state ? (() => {
          const v = state!.fleet.vehicles.find(v => v.id === t.id);
          return v ? `${HULLS[v.hull].label}${v.disabled ? " · disabled" : ""}` : t.label;
        })() : t.label)} <small>${({ collect: "Collect", gather: "Gather", sort: t.kind === "source" && SOURCES[t.id as keyof typeof SOURCES].item === "meal" ? "Tend · 20 s" : "Sort · 20 s", inspect: "Inspect", review: "Notebook", read: "Read", board: "Board", recover: "Recover", open: "Open", use: "Use", empty: "Empty" })[t.verb]}${state && equipped(state, "essential_tools") && !t.known && (t.kind === "source" || t.kind === "evidence") ? " · Q scan" : ""}</small>` : preview ? `${preview.label ? `${escapeHtml(preview.label)} · ` : ""}Move closer` : "";
    this.get("interact-prompt").dataset.preview = String(!t && !!preview);
    if (this.get("interact-prompt").innerHTML !== html) this.get("interact-prompt").innerHTML = html;
  }

  lookAction(visible: boolean, fallback = false): void {
    this.get("look-action").hidden = !visible;
    this.get("look-action").textContent = fallback ? "Click to look · drag / arrows available" : "Click to look";
  }

  gesture(kind: "exit" | "skip" | null, progress: number, key: string, state: GameState | null): void {
    this.exitProgress = kind === "exit" ? progress : null;
    this.exitKey = kind === "exit" ? key : "E";
    this.get("opening-skip").innerHTML = `Skip · hold <kbd>Space</kbd>${kind === "skip" ? ` <progress aria-label="Skip hold" max="1" value="${progress}"></progress>` : ""}`;
    if (state?.player.controlledVehicleId) {
      const indicator = kind === "exit" ? ` <progress aria-label="Exit hold" max="1" value="${progress}"></progress>` : "";
      // The regular HUD update supplies refusal/suit information; this small
      // progress element updates every step without rebuilding the full HUD.
      const guidance = this.get("pilot-guidance");
      const base = guidance.innerHTML.replace(/ <progress[^>]*><\/progress>/g, "");
      guidance.innerHTML = base.replace(/<kbd>[EX]<\/kbd>/, `<kbd>${this.exitKey}</kbd>`) + indicator;
    }
  }

  impact(loss: number, state: GameState | null): void {
    if (!state || !Number.isFinite(loss) || loss <= 0) return;
    const id = state.player.controlledVehicleId;
    const now = performance.now();
    this.impactLoss = now - this.impactAt <= 1500 && this.impactVehicle === id ? this.impactLoss + loss : loss;
    this.impactAt = now;
    this.impactVehicle = id;
    this.impactUntil = now + 600;
    const notice = this.get("impact-notice");
    const shown = Math.round(this.impactLoss * 10) / 10;
    notice.textContent = shown < 0.1 ? "" : `Hull −${shown.toFixed(1)}%`;
    notice.hidden = shown < 0.1;
    notice.classList.toggle("urgent", (state.fleet.vehicles.find(v => v.id === id)?.health ?? 100) <= 25);
    window.clearTimeout(this.impactTimer);
    this.impactTimer = window.setTimeout(() => { notice.hidden = true; }, 1800);
  }

  cancelFeedback(): void {
    window.clearTimeout(this.impactTimer);
    this.impactLoss = 0;
    this.impactAt = this.impactUntil = -Infinity;
    this.impactVehicle = null;
    this.get("impact-notice").hidden = true;
    this.ascentBlocked = this.thrustBlocked = false;
    this.renderBlocked();
    for (const element of this.root.querySelectorAll<HTMLElement>(".hull-impact")) element.classList.remove("hull-impact");
  }

  resetPresentation(): void {
    this.cancelFeedback();
    this.pilotId = null;
    this.startTick = null;
    this.current = null;
    this.announcedContexts.clear();
    this.get("hazard-announce").textContent = "";
    this.presentation.reset();
    this.renderNotices();
    this.get("call-cue").hidden = true;
  }

  presentationStep(state: GameState): void {
    this.current = state;
    this.presentation.step(state, this.renderHazards(state));
    this.renderPilotGuidance(state);
    this.renderBlocked();
    this.renderNotices();
    this.renderCall(state);
  }

  threatCall(origin: Vec3, state: GameState): void {
    this.presentation.threatCall(origin, state);
    this.renderCall(state);
  }

  blockedAscent(visible: boolean): void { this.ascentBlocked = visible; this.renderBlocked(); }
  blockedThrust(visible: boolean, state: GameState | null): void {
    this.thrustBlocked = visible;
    this.current = state;
    this.renderBlocked();
  }

  private renderBlocked(): void {
    const cue = this.get("blocked-ascent");
    cue.hidden = !this.ascentBlocked && !this.thrustBlocked;
    cue.textContent = this.ascentBlocked ? "Blocked above" : this.thrustBlocked
      ? `Blocked ahead${this.current && atCradleRail(this.current) ? " · Centre between the rails" : ""}` : "";
  }

  clearActionNotice(): void {
    this.presentation.clearAction();
    this.renderNotices();
  }

  menu(visible: boolean): void { this.presentation.setMenu(visible); this.renderNotices(); }

  notify(message: string, error = false, options: NoticeOptions = {}, state: GameState | null = this.current): void {
    message = recoveryDisplay(message);
    // Retain the accepted omission of this one redundant legacy New success.
    // All notice classification uses metadata, never message text.
    if (!error && message === "Expedition saved. The island shore and reef ribs are yours to explore.") return;
    const covered = state ? this.renderHazards(state) : new Set<NoticeContext>();
    if (state) {
      this.current = state;
      this.presentation.observe(state, covered);
      this.renderPilotGuidance(state);
    }
    if ((options.channel ?? "action") === "action" && state && state.opening.phase < 4) return;
    this.presentation.notify(message, error, options, performance.now(), covered);
    this.renderNotices();
  }

  private renderHazards(state: GameState): ReadonlySet<NoticeContext> {
    const banners = hazardBanners(state);
    const html = banners.map(b => `<span>${escapeHtml(b.text)}</span>`).join("");
    if (this.get("hazard").innerHTML !== html) this.get("hazard").innerHTML = html;
    const current = this.hud.hidden ? [] : banners;
    const appearing = current.filter(b => !this.announcedContexts.has(b.context));
    if (appearing.length) this.get("hazard-announce").textContent = appearing.map(b => b.text).join(". ");
    else if (!current.length) this.get("hazard-announce").textContent = "";
    this.announcedContexts = new Set(current.map(b => b.context));
    return new Set(current.flatMap(b => ["threat", "oxygen", "food", "hull", "recovery"].includes(b.context) ? [b.context as NoticeContext] : []));
  }

  private renderNotices(): void {
    if (this.disposed) return;
    const now = performance.now();
    this.presentation.expire(now);
    const result = this.presentation.result, surface = this.get("action-result");
    surface.hidden = !result;
    surface.classList.toggle("error", result?.error ?? false);
    if (surface.textContent !== (result?.message ?? "")) surface.textContent = result?.message ?? "";
    if (result !== this.shownResult) {
      this.shownResult = result;
      window.clearTimeout(this.announcementTimer);
      const version = ++this.announcementVersion, live = this.get("action-announce");
      live.textContent = "";
      if (result) this.announcementTimer = window.setTimeout(() => {
        if (!this.disposed && version === this.announcementVersion) live.textContent = result.error ? result.full : result.message;
      }, 0);
    }
    const notice = this.presentation.central;
    this.toast.hidden = !notice;
    if (notice) {
      if (this.toast.textContent !== notice.message) this.toast.textContent = notice.message;
      this.toast.classList.toggle("error", notice.error);
      this.toast.dataset.channel = notice.channel;
      this.toast.setAttribute("role", notice.error ? "alert" : "status");
      this.toast.setAttribute("aria-live", notice.error ? "assertive" : "polite");
    } else this.toast.textContent = "";
    const chip = this.get("system-status"), status = this.presentation.status;
    chip.hidden = !status;
    if (chip.textContent !== (status?.message ?? "")) chip.textContent = status?.message ?? "";
    window.clearTimeout(this.noticeTimer);
    const expiry = this.presentation.nextExpiry;
    this.noticeTimer = expiry === null ? 0 : window.setTimeout(() => this.renderNotices(), Math.max(1, expiry - now));
  }

  private renderCall(state: GameState): void {
    const call = this.presentation.callDirection(state), cue = this.get("call-cue");
    cue.hidden = !call;
    if (!call) { this.get("call-direction").textContent = ""; return; }
    cue.dataset.sector = call.sector;
    const dial = this.get("call-dial");
    dial.hidden = call.vertical;
    dial.setAttribute("style", `--turn:${call.bearingStep * 45}deg`);
    this.get("call-elevation").textContent = call.elevation === "above" ? "▲" : call.elevation === "below" ? "▼" : "";
    const label = `Call bearing · ${call.label}`;
    if (this.get("call-direction").textContent !== label) this.get("call-direction").textContent = label;
  }

  dispose(): void {
    this.resetPresentation();
    this.disposed = true;
    ++this.announcementVersion;
    window.clearTimeout(this.announcementTimer);
    window.clearTimeout(this.noticeTimer);
  }
}

/** Vitals and warnings name the same authoritative supply, including unlimited air. */
function airSourceLabel(state: GameState): string {
  const air = airSupply(state);
  const v = state.fleet.vehicles.find(v => v.id === state.player.controlledVehicleId);
  return air.kind === "craft" && v ? `${HULLS[v.hull].label} air`
    : air.kind === "refuge" ? `${nearPod(state) ? PLACES.home_pod.label : nearWorkshop(state) ? PLACES.island_workshop.label : inCanopyAir(state) ? PLACES.canopy_lab.label : "Hearthline"} air`
    : air.kind === "surface" ? "Surface air"
    : `${air.kind === "emergency" ? "Emergency" : "Suit"} air · ${Math.ceil(air.remainingSeconds!)} s`;
}

export interface HazardBanner { context: NoticeContext | "pressure" | "health" | "hullDepth" | "power"; text: string }
/** The exact current-state list used for both visible warnings and coverage. */
export function hazardBanners(state: GameState): HazardBanner[] {
  const warnings: HazardBanner[] = [];
  const e = exposure(state), v = state.fleet.vehicles.find(v => v.id === state.player.controlledVehicleId), air = airSupply(state);
  const airLabel = airSourceLabel(state);
  if (!v && !e.refuge && e.pressureDepth > personalLimit(state))
    warnings.push({ context: "pressure", text: `PRESSURE · ${e.pressureDepth.toFixed(0)} m / personal ${personalLimit(state)} m · ascend now` });
  if (!e.breathable && state.player.vitals.oxygen <= 35)
    warnings.push({ context: "oxygen", text: `LOW OXYGEN · ${state.player.vitals.oxygen.toFixed(0)}% · return to air now` });
  if (v && (v.charge === 0 || v.disabled))
    warnings.push({ context: "hull", text: `${v.disabled ? "HULL DISABLED" : "POWER DEPLETED"} · ${air.kind === "suit" ? "emergency air exhausted · " : ""}${airLabel} · protected exit / reserve cell` });
  if (v && hullDepth(v) > HULLS[v.hull].initialDepth * 0.85)
    warnings.push({ context: "hullDepth", text: `HULL DEPTH · ${hullDepth(v).toFixed(0)} / ${HULLS[v.hull].initialDepth} m · ascend before hull damage` });
  if (v && v.charge > 0 && v.charge < 25)
    warnings.push({ context: "power", text: `LOW POWER · ${v.charge.toFixed(0)}% · reserve cell or supported service` });
  if (v && !v.disabled && v.health <= 25)
    warnings.push({ context: "hull", text: `LOW HULL · ${v.health.toFixed(0)}% · retreat for repair` });
  if (state.player.vitals.health <= 25)
    warnings.push({ context: "health", text: "LOW HEALTH · retreat to refuge air and healing" });
  const threat = state.world.threat.mode;
  if (!e.refuge && threat !== "idle" && threat !== "disengage")
    warnings.push({ context: "threat", text: `SOUND HUNTER · ${threat === "warn" ? "paired calls · slow down / cover" : threat === "investigate" ? "investigating · Z quiet / retreat" : "pursuit · break sight behind the tall rib / retreat"}` });
  if (state.player.vitals.food < 20)
    warnings.push({ context: "food", text: state.player.vitals.food === 0
      ? state.player.starvationSeconds > 180 ? "STARVATION · health falling · F meal / refuge emergency portion" : "FOOD EMPTY · gather normally during grace · F meal / refuge portion"
      : "LOW FOOD · F meal / shallow staples / refuge emergency portion" });
  return warnings;
}

/** Only a northward approach contacting an actual rail's forward end earns
 * centring help. Other measured solid contacts keep the generic wording. */
function atCradleRail(state: GameState): boolean {
  const v = state.fleet.vehicles.find(v => v.id === state.player.controlledVehicleId);
  if (state.player.mode !== "piloting" || v?.hull !== "dart" || Math.cos(v.pose.yaw) < 0.9) return false;
  const p = v.pose.position, proxy = HULL_COLLIDERS.dart;
  return FACILITY_SOLIDS.some(s => s.id.startsWith("workshop.cradle.") &&
    Math.abs(p.z - proxy.radius - s.max.z) < 0.15 &&
    p.x + proxy.radius > s.min.x && p.x - proxy.radius < s.max.x &&
    p.y + proxy.height > s.min.y && p.y < s.max.y);
}
