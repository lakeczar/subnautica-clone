import { HULLS, OPENING, PLACES, SOURCES } from "../content/registry.js";
import { equipped } from "../sim/inventory.js";
import { personalLimit } from "../sim/progression.js";
import { deliberateExit } from "../runtime/input.js";
import type { AimedTarget } from "../sim/targeting.js";
import { aimedInteraction } from "../sim/targeting.js";
import { exposure } from "../sim/survival.js";
import { distractionPreview, exitRefusal, hullDepth } from "../sim/vehicles.js";
import type { GameState, WorldQueries } from "../sim/types.js";
import { bearing, escapeHtml, recoveryDisplay } from "./format.js";

// State is supplied by GameView on each call; only transient presentation
// bookkeeping lives here. Input and modal focus remain with GameView.
export class HudView {
  private readonly hud: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly toast: HTMLElement;
  private toastTimer = 0;
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
    private readonly panelNotice: (message: string, error: boolean) => void,
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

  update(state: GameState, cruise: boolean, forward = 0): void {
    this.startTick ??= state.tick;
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
        ? "Carrier feasibility fixture"
        : p.x > 62
          ? "Upper Lantern Canopy"
          : p.z < -28
            ? "Splitspine shore"
            : "Hearth Reef";
    this.get("cruise").hidden = !cruise;
    this.get("context-hint").textContent =
      mode === "swimming"
        ? "The pod’s amber-edged ramp leads back to the deck."
        : p.z < -25
          ? "The shore is walkable. The split ridge is your landmark."
          : "Walk down the amber-edged ramp to the water.";
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
    const exitBlocked = v ? exitRefusal(state, this.world) : null;
    const pulse = distractionPreview(state);
    this.get("pulse-summary").textContent = !equipped(state, "essential_tools") ? ""
      : state.world.threat.distractionSeconds > 0 ? `G · pulse active ${Math.ceil(state.world.threat.distractionSeconds)} s`
      : pulse.refusal === null ? `G · ${pulse.cost} cell points · ${(pulse.remainingCharge + pulse.cost).toFixed(0)} → ${pulse.remainingCharge.toFixed(0)}%`
      : `G · unavailable · Tab for reserves`;
    this.get("pilot-guidance").hidden = !v;
    if (this.pilotId !== (v?.id ?? null)) {
      this.pilotId = v?.id ?? null;
      this.pilotSince = state.tick;
    }
    this.get("control-hint").textContent = v
      ? state.tick - this.pilotSince < 720 ? "Look steers · W/S thrust · A/D slide · Space/C rise/dive · Z quiet · Shift boost" : ""
      : state.tick - this.startTick < 3600 ? "WASD move · mouse / arrows look · Space rise · C dive" : "";
    if (v) {
      const stopped = Math.hypot(v.velocity.x, v.velocity.y, v.velocity.z) < 0.2;
      this.get("pilot-guidance").innerHTML = `<kbd>${this.exitKey}</kbd> ${exitBlocked ? "Exit blocked" : `${deliberateExit(state) ? "Hold to exit" : "Exit"}`}${this.exitProgress !== null ? ` <progress aria-label="Exit hold" max="1" value="${this.exitProgress}"></progress>` : ""}${exitBlocked || stopped ? `<small>${escapeHtml(exitBlocked ?? `Suit ${personalLimit(state)} m · hull ${HULLS[v.hull].initialDepth} m`)}</small>` : ""}`;
      this.get("pilot-guidance").classList.toggle("urgent", exitBlocked !== null);
    }
    const pitch = state.player.pose.pitch;
    this.get("pitch-cue").hidden = !(mode === "swimming" || v) || Math.abs(pitch) <= 0.14;
    this.get("pitch-cue").innerHTML = `<i style="top:${50 - Math.max(-1, Math.min(1, pitch / (Math.PI / 2))) * 46}%"></i>${Math.abs(pitch) > Math.PI / 4 ? `<small>${Math.round(pitch * 180 / Math.PI)}°</small>` : ""}`;
    this.get("pitch-cue").setAttribute("aria-label", `Pitch ${Math.round(pitch * 180 / Math.PI)} degrees`);
    this.get("surface-cue").hidden = !v || v.pose.position.y < -0.95 || forward <= 0 || v.pose.pitch <= 0.1;
    if (v?.hull === "dart" && v.pose.position.z > -16 && v.pose.position.z < -7 &&
      Math.abs(v.pose.position.x - 20) < 6 && v.velocity.z < -4)
      this.get("context-hint").textContent = "Slow · cradle ahead";
    this.target(aimedInteraction(state, this.world), state);
    this.get("vitals").innerHTML =
      `<div class="${state.player.vitals.oxygen < 35 ? "urgent" : ""}"><span>O₂</span><b>${state.player.vitals.oxygen.toFixed(0)}%</b><i style="--fill:${state.player.vitals.oxygen}%"></i><small>${e.breathable ? "Breathing air" : "180 s tank"}</small></div><div><span>HEALTH</span><b>${state.player.vitals.health.toFixed(0)}</b><i style="--fill:${state.player.vitals.health}%"></i></div><div><span>FOOD</span><b>${state.player.vitals.food.toFixed(0)}</b><i style="--fill:${state.player.vitals.food}%"></i><small>${state.player.vitals.food === 0 ? "Grace / gather normally" : "F · eat meal"}</small></div>${v ? `<div class="${v.charge < 25 ? "urgent" : ""}${this.impactVehicle === v.id && performance.now() < this.impactUntil ? " hull-impact" : ""}"><span>${HULLS[v.hull].label.toUpperCase()}</span><b>${v.charge.toFixed(0)}% power</b><small>Hull ${v.health.toFixed(0)}% · ${hullDepth(v).toFixed(0)} / ${HULLS[v.hull].initialDepth} m</small></div>` : ""}`;
    const warnings: string[] = [];
    if (!v && !e.refuge && e.pressureDepth > personalLimit(state))
      warnings.push(`PRESSURE · ${e.pressureDepth.toFixed(0)} m / personal ${personalLimit(state)} m · ascend now`);
    if (!e.breathable && state.player.vitals.oxygen <= 35)
      warnings.push(`LOW OXYGEN · ${state.player.vitals.oxygen.toFixed(0)}% · return to air now`);
    if (v && (v.charge === 0 || v.disabled))
      warnings.push(`${v.disabled ? "HULL DISABLED" : "POWER DEPLETED"} · emergency air ${v.emergencyAir.toFixed(0)} s · protected exit / reserve cell`);
    if (v && hullDepth(v) > HULLS[v.hull].initialDepth * 0.85)
      warnings.push(`HULL DEPTH · ${hullDepth(v).toFixed(0)} / ${HULLS[v.hull].initialDepth} m · ascend before hull damage`);
    if (v && v.charge > 0 && v.charge < 25)
      warnings.push(`LOW POWER · ${v.charge.toFixed(0)}% · reserve cell or supported service`);
    if (v && !v.disabled && v.health <= 25)
      warnings.push(`LOW HULL · ${v.health.toFixed(0)}% · retreat for repair`);
    if (state.player.vitals.health <= 25)
      warnings.push("LOW HEALTH · retreat to refuge air and healing");
    const threat = state.world.threat.mode;
    if (!e.refuge && threat !== "idle") {
      const direction = bearing(p, state.world.threat.position).split(" · ")[0];
      warnings.push(`SOUND HUNTER · ${direction} · ${threat === "warn" ? "paired calls · slow down / cover" : threat === "investigate" ? "investigating · Z quiet / retreat" : threat === "pursue" ? "pursuit · break sight behind the tall rib" : "disengaging"}`);
    }
    if (state.player.vitals.food < 20)
      warnings.push(state.player.vitals.food === 0
        ? state.player.starvationSeconds > 180 ? "STARVATION · health falling · F meal / refuge emergency portion" : "FOOD EMPTY · gather normally during grace · F meal / refuge portion"
        : "LOW FOOD · F meal / shallow staples / refuge emergency portion");
    const warningHtml = warnings.map((w) => `<span>${escapeHtml(w)}</span>`).join("");
    if (this.get("hazard").innerHTML !== warningHtml) this.get("hazard").innerHTML = warningHtml;
    const opening = state.opening.phase < 4;
    this.root.dataset.opening = String(opening);
    // Hide only routine exploration elements. Warnings, pause and the opening
    // remain siblings; persistence and graphics notices live outside the HUD.
    for (const id of ["hud-region", "hud-heading", "hud-tools", "vitals", "hud-bottom", "crosshair", "interact-prompt"])
      this.get(id).hidden = opening;
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
      }
    }
    this.hud.dataset.tick = String(state.tick);
    this.hud.dataset.position = `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
    this.hud.dataset.mode = mode;
    this.hud.dataset.yaw = String(state.player.pose.yaw);
    this.hud.dataset.pitch = String(state.player.pose.pitch);
  }

  target(t: AimedTarget | null, state: GameState | null): void {
    const html = t
      ? `${t.verb === "empty" ? "" : "<kbd>E</kbd> "}${escapeHtml(t.kind === "vehicle" && state ? (() => {
          const v = state!.fleet.vehicles.find(v => v.id === t.id);
          return v ? `${HULLS[v.hull].label}${v.disabled ? " · disabled" : ""}` : t.label;
        })() : t.label)} <small>${({ collect: "Collect", gather: "Gather", sort: t.kind === "source" && SOURCES[t.id as keyof typeof SOURCES].item === "meal" ? "Tend · 20 s" : "Sort · 20 s", inspect: "Inspect", review: "Notebook", read: "Read", board: "Board", recover: "Recover", open: "Open", use: "Use", empty: "Empty" })[t.verb]}${state && equipped(state, "essential_tools") && !t.known && (t.kind === "source" || t.kind === "evidence") ? " · Q scan" : ""}</small>` : "";
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
    notice.textContent = `Hull −${this.impactLoss.toFixed(1)}%`;
    notice.hidden = false;
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
    for (const element of this.root.querySelectorAll<HTMLElement>(".hull-impact")) element.classList.remove("hull-impact");
  }

  resetPresentation(): void {
    this.cancelFeedback();
    this.pilotId = null;
    this.startTick = null;
    window.clearTimeout(this.toastTimer);
    this.toast.hidden = true;
  }

  notify(message: string, error = false): void {
    message = recoveryDisplay(message);
    // Session replacement enters/updates the view before this notice, while
    // Continue/import have different notices. Omit only this redundant New
    // success, regardless of timing, so no queued text can leak across sessions.
    if (!error && message === "Expedition saved. The island shore and reef ribs are yours to explore.") return;
    this.panelNotice(message, error);
    window.clearTimeout(this.toastTimer);
    this.toast.textContent = message;
    this.toast.hidden = false;
    this.toast.classList.toggle("error", error);
    this.toast.setAttribute("role", error ? "alert" : "status");
    this.toast.setAttribute("aria-live", error ? "assertive" : "polite");
    this.toastTimer = window.setTimeout(
      () => {
        this.toast.hidden = true;
      },
      error ? 12000 : 5500,
    );
  }

  dispose(): void {
    this.cancelFeedback();
    window.clearTimeout(this.toastTimer);
  }
}
