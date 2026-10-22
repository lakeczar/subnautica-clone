import { HULLS, HULL_COLLIDERS, OPENING, PLACES, REGIONS, renewable, SOURCES } from "../content/registry.js";
import { regionAtPoint } from "../content/regions/layout.js";
import { faunaVerb } from "./faunaPanels.js";
import { LEGACY_PRESERVE } from "../content/regions/terrain.js";
import { ROUTE_REGIONS } from "../content/routes.js";
import { atAirStop, inCanopyAir, nearPod, nearWorkshop, equipped } from "../sim/inventory.js";
import { WORKING_STOPS } from "../content/stops.js";
import { personalLimit } from "../sim/progression.js";
import { deliberateExit } from "../runtime/input.js";
import type { AimedTarget, ReachPreview } from "../sim/targeting.js";
import { aimedInteraction, reachPreview } from "../sim/targeting.js";
import { airSupply, exposure } from "../sim/survival.js";
import { distractionPreview, exitBlock, hullDepth, serviceState } from "../sim/vehicles.js";
import { servicePreview } from "../sim/serviceLink.js";
import { ARM_CHARGE, ARM_LIFT_SECONDS, armNearby, armTarget, cabinHull, cabinEnterRefusal, fittedCabin } from "../sim/fleet.js";
import { usedCapacity } from "../sim/inventory.js";
import type { GameState, NoticeContext, NoticeOptions, Vec3, WorldQueries } from "../sim/types.js";
import { FACILITY_SOLIDS } from "../sim/world.js";
import { escapeHtml, recoveryDisplay } from "./format.js";
import { EncounterPresentation, type ActionResult, type DamageTarget, type ThreatDamage } from "./notices.js";
import { hunterBanner, ThreatEdgeView } from "./threatCue.js";

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
  private pendingExitAnnouncements: string[] = [];
  private shownResult: ActionResult | null = null;
  private announcedContexts = new Set<string>();
  private current: GameState | null = null;
  private ascentBlocked = false;
  private thrustBlocked = false;
  private disposed = false;
  private readonly presentation = new EncounterPresentation();
  private readonly threatEdge: ThreatEdgeView;
  private impactTimer = 0;
  private impactLoss = 0;
  private impactAt = -Infinity;
  private impactUntil = -Infinity;
  private impactVehicle: string | null = null;
  private collisionVisible = false;
  private chipHasBite: boolean | null = null;
  private damageAnnouncementTimer = 0;
  private damageAnnouncementVersion = 0;
  private damageFlashUntil = -Infinity;
  private damageFlashTarget: DamageTarget | null = null;
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
    this.threatEdge = new ThreatEdgeView(this.get("threat-edge"));
  }

  private get<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = this.root.querySelector<T>(`#${id}`);
    if (!element) throw new Error(`Missing UI element ${id}`);
    return element;
  }

  update(state: GameState, cruise: boolean, forward = 0, aim?: HudAim): void {
    this.startTick ??= state.tick;
    this.observePresentation(state);
    this.renderPilotGuidance(state);
    this.renderBlocked();
    this.renderNotices();
    this.renderCall(state);
    this.threatEdge.update(state);
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
    const preserve = LEGACY_PRESERVE, legacy = p.x >= preserve.minX && p.x <= preserve.maxX && p.z >= preserve.minZ && p.z <= preserve.maxZ;
    const composed = legacy ? null : regionAtPoint(p.x, p.z);
    this.get("region-name").textContent =
      state.scenario === "carrier-fixture"
        ? "Carrier test fixture"
        // C3: beyond B1's area, S2's region footprints name the place.
        : composed ? REGIONS[composed].label
        : p.x >= ROUTE_REGIONS.silt_basin.bounds.minX && p.z < ROUTE_REGIONS.silt_basin.bounds.maxZ
          ? "Pale Basin"
        : p.x > 62
          ? "Upper Lantern Canopy"
          : p.z < -28
            ? "Splitspine shore"
            : "Hearth Reef";
    this.get("cruise").hidden = !cruise;
    // The occupied hull: the pilot seat, or the Creel cabin the player stands in.
    const e = exposure(state),
      v = state.fleet.vehicles.find(
        (v) => v.id === state.player.controlledVehicleId,
      ) ?? cabinHull(state);
    this.get("context-hint").textContent = state.world.action
      ? `Active ${state.world.action.kind} · ${Math.ceil(state.world.action.seconds)} s remaining`
      : state.recovery.operation
        ? `Bobbin · ${state.recovery.operation.phase} · follow the local tether corridor`
        : e.refuge
          ? ""
          : v?.hull === "dart" && p.x > 15 && p.x < 25 && p.z < -16 && p.z > -29
            ? Math.abs(Math.atan2(Math.sin(v.pose.yaw - Math.PI), Math.cos(v.pose.yaw - Math.PI))) > 0.6
              ? "Turn to the open lane" : ""
          // B1's area hints; beyond it the region name already says where you are.
          : !legacy
            ? ""
          : p.x >= ROUTE_REGIONS.silt_basin.bounds.minX && p.z < ROUTE_REGIONS.silt_basin.bounds.maxZ
            ? "Pale Basin · flooded survey sites · no refuge air"
          : p.x > 68
            ? "Read the upper crowns. Z quiet · cover / retreat · Tab for pulse & reserves."
            : p.z > 9 && p.y < 0 && Math.abs(p.x) < 4
              ? "Below the pod deck · swim around the ramp edge, surface, then approach its amber treads."
              : "";
    const pulse = distractionPreview(state);
    const threatened = !e.refuge && ["warn", "investigate", "pursue"].includes(state.world.threat.mode);
    const aftermath = this.presentation.damage !== null;
    if (threatened || aftermath) this.get("context-hint").textContent = "";
    this.get("pulse-summary").textContent = (!equipped(state, "essential_tools") || exposure(state).refuge ||
      !["warn", "investigate", "pursue"].includes(state.world.threat.mode) && state.world.threat.distractionSeconds <= 0) ? ""
      : state.world.threat.distractionSeconds > 0 ? `G · pulse active ${Math.ceil(state.world.threat.distractionSeconds)} s`
      : pulse.refusal === null ? `G · ${pulse.cost} cell points · ${(pulse.remainingCharge + pulse.cost).toFixed(0)} → ${pulse.remainingCharge.toFixed(0)}%`
      : `G · ${pulse.block === "facing" ? "face the survey area" : "no cell with 25 charge"} · Z quiet / cover / retreat`;
    this.get("control-hint").textContent = threatened || aftermath || this.get("context-hint").textContent ? "" : v
      ? state.tick - this.pilotSince < 720 ? "Look steers · W/S thrust · A/D slide · Space/C rise/dive · Z quiet · Shift boost" : ""
      : state.tick - this.startTick < 3600 ? "WASD move · mouse / arrows look · Space rise · C dive" : "";
    const pitch = state.player.pose.pitch;
    this.get("pitch-cue").hidden = !(mode === "swimming" || v) || Math.abs(pitch) <= 0.14;
    this.get("pitch-cue").innerHTML = `<i style="top:${50 - Math.max(-1, Math.min(1, pitch / (Math.PI / 2))) * 46}%"></i>${Math.abs(pitch) > Math.PI / 4 ? `<small>${Math.round(pitch * 180 / Math.PI)}°</small>` : ""}`;
    this.get("pitch-cue").setAttribute("aria-label", `Pitch ${Math.round(pitch * 180 / Math.PI)} degrees`);
    this.get("surface-cue").hidden = !v || v.pose.position.y < -0.95 || forward <= 0 || v.pose.pitch <= 0.1;
    if (!threatened && !aftermath && v?.hull === "dart" && v.pose.position.z > -16 && v.pose.position.z < -7 &&
      Math.abs(v.pose.position.x - 20) < 6 && v.velocity.z < -4)
      this.get("context-hint").textContent = "Slow · cradle ahead";
    if (this.get("context-hint").textContent) this.get("control-hint").textContent = "";
    const target = aim ? aim.target : aimedInteraction(state, this.world);
    this.target(target, state, aim ? aim.preview : target ? null : reachPreview(state, this.world));
    const air = airSupply(state);
    const airLabel = airSourceLabel(state);
    const service = mode === "piloting" && (v?.hull === "dart" || v?.hull === "creel") ? serviceState(state, v.id) : null;
    const preview = service && v ? servicePreview(state, v.id) : null;
    const serviceLine = !v || !preview ? "" : preview.kind === "outpost" ? (preview.refusal ? "" : "Outpost charger · Tab")
      : service === "ready" && preview.refusal === null ? "Service here · Tab" : service === "patch" ? "Patch hull first" : "";
    this.get("vitals").dataset.airSource = air.kind;
    this.get("vitals").innerHTML =
      `<div class="${state.player.vitals.oxygen < 35 ? "urgent" : ""}"><span>O₂</span><b>${state.player.vitals.oxygen.toFixed(0)}%</b><i style="--fill:${state.player.vitals.oxygen}%"></i><small>${escapeHtml(airLabel)}</small></div><div class="${this.damageFlashing("diver") ? "hull-impact" : ""}"><span>HEALTH</span><b>${state.player.vitals.health.toFixed(0)}</b><i style="--fill:${state.player.vitals.health}%"></i></div><div><span>FOOD</span><b>${state.player.vitals.food.toFixed(0)}</b><i style="--fill:${state.player.vitals.food}%"></i><small>${state.player.vitals.food === 0 ? "Grace / gather normally" : "F · eat meal"}</small></div>${v ? `<div class="${v.charge < 25 ? "urgent" : ""}${this.impactVehicle === v.id && performance.now() < this.impactUntil || this.damageFlashing("vehicle", v.id) ? " hull-impact" : ""}"><span>${HULLS[v.hull].label.toUpperCase()}</span><b>${v.charge.toFixed(0)}% power</b><small>Hull ${v.health.toFixed(0)}% · ${hullDepth(v).toFixed(0)} / ${v.rating} m${v.hull === "creel" ? ` · hold ${usedCapacity(state, v.cargoId)}/${state.inventory.containers.find(c => c.id === v.cargoId)?.capacity ?? 0} CU` : ""}</small>${serviceLine ? `<small class="service-hint">${serviceLine}</small>` : ""}</div>` : ""}`;
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
      // The Creel's E is its work key: tool arms on a host ahead, else its cabin.
      const work = v.hull === "creel" ? creelWork(state) : "";
      const exitKey = v.hull === "creel" ? "X" : this.exitKey;
      const html = `${work}<kbd>${exitKey}</kbd> ${block ? "Exit blocked" : `${deliberateExit(state) ? "Hold to exit" : "Exit"}`}${this.exitProgress !== null ? ` <progress aria-label="Exit hold" max="1" value="${this.exitProgress}"></progress>` : ""}${block || stopped ? `<small>${escapeHtml(block?.message ?? `Suit ${personalLimit(state)} m · hull ${v.rating} m`)}</small>` : ""}`;
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
        })() : t.label)} <small>${fixtureVerb(t, state) ?? ({ collect: "Collect", gather: "Gather", sort: t.kind === "source" && SOURCES[t.id as keyof typeof SOURCES].item === "meal" ? "Tend · 20 s" : "Sort · 20 s", inspect: "Inspect", review: "Notebook", read: "Read", board: "Board", recover: "Recover", open: "Open", use: "Use", empty: renewable(t.id) ? "Empty · regrowing" : "Empty" })[t.verb]}${state && equipped(state, "essential_tools") && !t.known && (t.kind === "source" || t.kind === "evidence") ? " · Q scan" : ""}</small>` : preview ? `${preview.label ? `${escapeHtml(preview.label)} · ` : ""}Move closer` : "";
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
    this.current = state;
    this.collisionVisible = true;
    this.renderDamageChip();
    window.clearTimeout(this.impactTimer);
    this.impactTimer = window.setTimeout(() => { this.collisionVisible = false; this.renderDamageChip(); }, 1800);
  }

  /** Before each step's events, invalidate feedback against that step's actor. */
  observePresentation(state: GameState): void {
    this.current = state;
    this.presentation.observe(state, this.renderHazards(state));
    this.renderDamageChip();
  }

  /** Returns a valid episode onset; suppressAnnouncement drops speech, not the chip. */
  threatDamage(event: ThreatDamage, state: GameState, suppressAnnouncement = false): boolean {
    this.observePresentation(state);
    if (this.disposed || this.hud.hidden || !this.presentation.damageTargetValid(event.target, state) ||
      !Number.isFinite(event.loss) || event.loss <= 0) return false;
    const onset = this.presentation.recordDamage(event.target, event.loss);
    this.threatEdge.flash(event.origin, state);
    this.renderDamageChip();
    if (suppressAnnouncement) this.cancelDamageAnnouncement();
    if (onset && !suppressAnnouncement) {
      this.cancelDamageAnnouncement();
      const version = this.damageAnnouncementVersion, episode = this.presentation.damage;
      const message = this.biteText();
      this.damageAnnouncementTimer = window.setTimeout(() => {
        if (this.disposed || version !== this.damageAnnouncementVersion || this.presentation.damage !== episode ||
          this.hud.hidden || !this.current || !this.presentation.damageTargetValid(event.target, this.current)) return;
        this.damageAnnouncementTimer = 0;
        this.get("damage-announce").textContent = message;
      }, 0);
    }
    return onset;
  }

  private biteText(): string {
    const damage = this.presentation.damage;
    return damage ? `Bitten · ${damage.target.kind === "vehicle" ? "hull" : "health"} −${(Math.round(damage.total * 10) / 10).toFixed(1)}${damage.target.kind === "vehicle" ? "%" : ""}` : "";
  }

  private damageFlashing(kind: DamageTarget["kind"], vehicleId?: string): boolean {
    const target = this.damageFlashTarget;
    return performance.now() < this.damageFlashUntil && target?.kind === kind &&
      (target.kind === "diver" || target.vehicleId === vehicleId);
  }

  private renderDamageChip(): void {
    const damage = this.presentation.damage, state = this.current, notice = this.get("impact-notice");
    if (!damage) {
      this.cancelDamageAnnouncement();
      this.damageFlashUntil = -Infinity;
      this.damageFlashTarget = null;
    } else if (damage.pulse) {
      this.damageFlashUntil = performance.now() + 600;
      this.damageFlashTarget = { ...damage.target };
      damage.pulse = false;
    }
    if (damage) {
      this.get("context-hint").textContent = "";
      this.get("control-hint").textContent = "";
    }
    const shown = Math.round(this.impactLoss * 10) / 10;
    const collision = this.collisionVisible && shown >= 0.1 && this.impactVehicle === state?.player.controlledVehicleId;
    const text = this.biteText() + (collision ? `${damage ? " · impact" : "Hull"} −${shown.toFixed(1)}%` : "");
    if (notice.textContent !== text) notice.textContent = text;
    if (notice.hidden === !!text) notice.hidden = !text;
    // Totals change at simulation frequency. Only the separate onset speaks.
    if (this.chipHasBite !== !!damage) {
      notice.setAttribute("aria-live", damage ? "off" : "polite");
      notice.setAttribute("aria-hidden", String(!!damage));
      this.chipHasBite = !!damage;
    }
    const health = damage?.target.kind === "diver" ? state?.player.vitals.health
      : state?.fleet.vehicles.find(v => v.id === state.player.controlledVehicleId)?.health;
    notice.classList.toggle("urgent", (health ?? 100) <= 25);
  }

  private cancelDamageAnnouncement(): void {
    window.clearTimeout(this.damageAnnouncementTimer);
    this.damageAnnouncementTimer = 0;
    ++this.damageAnnouncementVersion;
    const live = this.get("damage-announce");
    if (live.textContent) live.textContent = "";
  }

  cancelFeedback(): void {
    window.clearTimeout(this.impactTimer);
    this.impactLoss = 0;
    this.impactAt = this.impactUntil = -Infinity;
    this.impactVehicle = null;
    this.collisionVisible = false;
    this.presentation.clearDamage();
    this.renderDamageChip();
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
    this.threatEdge.reset();
    this.renderNotices();
    this.get("call-cue").hidden = true;
  }

  presentationStep(state: GameState): void {
    this.current = state;
    this.presentation.step(state, this.renderHazards(state));
    this.renderDamageChip();
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

  menu(visible: boolean): void {
    if (visible) this.cancelFeedback();
    this.presentation.setMenu(visible); this.renderNotices();
  }

  notify(message: string, error = false, options: NoticeOptions = {}, state: GameState | null = this.current): void {
    message = recoveryDisplay(message);
    // A later step can deliver an outcome without another bite. Invalidate its
    // queued onset here while retaining the still-controlled hull's damage chip.
    if (options.channel === "hazard" && (options.context === "hull" || options.context === "recovery"))
      this.cancelDamageAnnouncement();
    if (options.context === "recovery") {
      this.presentation.clearDamage();
      this.renderDamageChip();
    }
    // Retain the accepted omission of this one redundant legacy New success.
    // All notice classification uses metadata, never message text.
    if (!error && message === "Expedition saved. The island shore and reef ribs are yours to explore.") return;
    const covered = state ? this.renderHazards(state) : new Set<NoticeContext>();
    if (state) {
      this.current = state;
      this.presentation.observe(state, covered);
      this.renderDamageChip();
      this.renderPilotGuidance(state);
      // Observation can invalidate a result before this delivery replaces it,
      // even if the new refusal happens to carry the same exit metadata.
      if (this.presentation.result !== this.shownResult) this.cancelAnnouncement();
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
    const hull = state.fleet.vehicles.find(v => v.id === state.player.controlledVehicleId);
    // A disable is a new outcome even if a low-hull/power banner was already
    // speaking. Numeric totals still do not produce repeated announcements.
    const key = (b: typeof banners[number]): string => b.context === "hull"
      ? `hull:${hull?.disabled ? "disabled" : hull?.charge === 0 ? "power" : "low"}` : b.context;
    const appearing = current.filter(b => !this.announcedContexts.has(key(b)));
    if (appearing.length) this.get("hazard-announce").textContent = appearing.map(b => b.text).join(". ");
    else if (!current.length) this.get("hazard-announce").textContent = "";
    this.announcedContexts = new Set(current.map(key));
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
      const previous = this.shownResult;
      this.shownResult = result;
      if (this.pendingExitAnnouncements.length && result?.error && result.refusal && previous?.refusal &&
        result.refusal.vehicleId === previous.refusal.vehicleId && result.refusal.code === previous.refusal.code) {
        // Keep actual attempts (including repeats) until this scheduling turn
        // flushes. One atomic text update exposes their full messages in order.
        this.pendingExitAnnouncements.push(result.full);
      } else {
        this.cancelAnnouncement();
        const version = this.announcementVersion, live = this.get("action-announce");
        live.textContent = "";
        if (result) {
          if (result.error && result.refusal) this.pendingExitAnnouncements.push(result.full);
          this.announcementTimer = window.setTimeout(() => {
            if (this.disposed || version !== this.announcementVersion) return;
            this.announcementTimer = 0;
            live.textContent = this.pendingExitAnnouncements.length ? this.pendingExitAnnouncements.join("\n")
              : result.error ? result.full : result.message;
            this.pendingExitAnnouncements = [];
          }, 0);
        }
      }
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

  private cancelAnnouncement(): void {
    window.clearTimeout(this.announcementTimer);
    this.announcementTimer = 0;
    ++this.announcementVersion;
    this.pendingExitAnnouncements = [];
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
    this.cancelAnnouncement();
    window.clearTimeout(this.noticeTimer);
  }
}

/** Vitals and warnings name the same authoritative supply, including unlimited air. */
function airSourceLabel(state: GameState): string {
  const air = airSupply(state);
  const v = state.fleet.vehicles.find(v => v.id === state.player.controlledVehicleId);
  return air.kind === "craft" && v ? `${HULLS[v.hull].label} air`
    : air.kind === "refuge" ? `${nearPod(state) ? PLACES.home_pod.label : nearWorkshop(state) ? PLACES.island_workshop.label : inCanopyAir(state) ? PLACES.canopy_lab.label : cabinHull(state) ? "Creel cabin"
      // HUB-2: a restored stop with air (the Rift station, the Divide dock, the crown station) names itself.
      : atAirStop(state) ? WORKING_STOPS[atAirStop(state)!].label : "Hearthline"} air`
    : air.kind === "emergency" && cabinHull(state) ? `Cabin emergency air · ${Math.ceil(air.remainingSeconds!)} s`
    : air.kind === "surface" ? "Surface air"
    : `${air.kind === "emergency" ? "Emergency" : "Suit"} air · ${Math.ceil(air.remainingSeconds!)} s`;
}

export interface HazardBanner {
  context: NoticeContext | "pressure" | "health" | "hullDepth" | "power"; text: string;
  /** Other caption causes this banner already states (power depleted names power). */
  covers?: readonly string[];
}
/** The exact current-state list used for both visible warnings and coverage. */
export function hazardBanners(state: GameState): HazardBanner[] {
  const warnings: HazardBanner[] = [];
  const e = exposure(state), v = state.fleet.vehicles.find(v => v.id === state.player.controlledVehicleId) ?? cabinHull(state), air = airSupply(state);
  const airLabel = airSourceLabel(state);
  if (!v && !e.refuge && e.pressureDepth > personalLimit(state))
    warnings.push({ context: "pressure", text: `PRESSURE · ${e.pressureDepth.toFixed(0)} m / personal ${personalLimit(state)} m · ascend now` });
  if (!e.breathable && state.player.vitals.oxygen <= 35)
    warnings.push({ context: "oxygen", text: `LOW OXYGEN · ${state.player.vitals.oxygen.toFixed(0)}% · return to air now` });
  if (v && (v.charge === 0 || v.disabled))
    warnings.push({ context: "hull", text: `${v.disabled ? "HULL DISABLED" : "POWER DEPLETED"} · ${air.kind === "suit" ? "emergency air exhausted · " : ""}${airLabel} · protected exit / reserve cell`,
      ...(v.charge === 0 ? { covers: ["power"] } : {}) });
  if (v && hullDepth(v) > v.rating * 0.85)
    warnings.push({ context: "hullDepth", text: `HULL DEPTH · ${hullDepth(v).toFixed(0)} / ${v.rating} m · ascend before hull damage` });
  if (v && v.charge > 0 && v.charge < 25)
    warnings.push({ context: "power", text: `LOW POWER · ${v.charge.toFixed(0)}% · reserve cell or supported service` });
  if (v && !v.disabled && v.health <= 25)
    warnings.push({ context: "hull", text: `LOW HULL · ${v.health.toFixed(0)}% · retreat for repair` });
  if (state.player.vitals.health <= 25)
    warnings.push({ context: "health", text: "LOW HEALTH · retreat to refuge air and healing" });
  const threat = hunterBanner(state.world.threat.mode);
  if (!e.refuge && threat) warnings.push({ context: "threat", text: threat });
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

/** Creel work line: tool arms on the host ahead, else the cabin when stopped. */
function creelWork(state: GameState): string {
  const arm = armTarget(state);
  if (arm) return `<kbd>E</kbd> ${arm.refusal ? escapeHtml(arm.refusal) : `Tool arms · ${escapeHtml(SOURCES[arm.sourceId].label)} · ${ARM_LIFT_SECONDS} s · ${ARM_CHARGE}% power`}<br />`;
  const near = armNearby(state);
  if (near) return `<kbd>E</kbd> Turn the bow to ${escapeHtml(SOURCES[near].label)} for the tool arms<br />`;
  const v = state.fleet.vehicles.find(a => a.id === state.player.controlledVehicleId);
  if (!v || !fittedCabin(state, v)) return "";
  const no = cabinEnterRefusal(state);
  return `<kbd>E</kbd> ${no ? "Stop to enter cabin" : "Cabin · station held"}<br />`;
}
/** Specific verbs for B1 hosts and cabin fixtures; null keeps the generic verb. */
function fixtureVerb(t: AimedTarget, state: GameState | null): string | null {
  if (t.kind === "source" && SOURCES[t.id as keyof typeof SOURCES]?.item === "tagged_frame" && t.verb === "collect") return "Lift · 10 s";
  // CR-1: Catch / Net at a school, Take roe, and protected egg cases.
  const fauna = faunaVerb(state, t.id, t.kind, t.verb);
  if (fauna) return fauna;
  // Interior fixtures first: the cabin's own hatch leaves; an exterior hatch enters.
  if (!t.id.startsWith("cabin:")) return t.id.endsWith(":hatch") ? "Enter cabin" : null;
  const v = state ? cabinHull(state) : undefined;
  return ({ "cabin:bunk": state?.player.mobileRefuge?.vehicleId === v?.id ? "Clear refuge registration" : "Register refuge",
    "cabin:cooker": "Cook", "cabin:locker": "Open locker", "cabin:helm": "Take helm", "cabin:hatch": "Leave by hatch" } as Record<string, string>)[t.id] ?? null;
}
