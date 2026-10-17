import {
  BLUEPRINTS,
  EVIDENCE,
  HULLS,
  ITEMS,
  OPENING,
  OPTIONAL_RECORD,
  PLACES,
  RECOVERY_STAGE,
  RECIPES,
  REGIONS,
  SOURCES,
} from "../content/registry.js";
import type { ItemKind, RecipeId } from "../content/registry.js";
import {
  available,
  containerAccessible,
  distance,
  equipped,
  fabricationContainers,
  facility,
  nearPod,
  nearWorkshop,
  usedCapacity,
} from "../sim/inventory.js";
import { craftingRefusal, nearestInteraction, personalLimit } from "../sim/progression.js";
import { exposure } from "../sim/survival.js";
import { RECOVERY_NOTICES } from "../sim/recovery.js";
import { exitRefusal, hullDepth } from "../sim/vehicles.js";
import type { GameCommand, Vec3, WorldQueries } from "../sim/types.js";
import type { AudioSettings } from "../audio/sound.js";
import type { GameState } from "../sim/types.js";
import type { SaveSlot } from "../save/repository.js";
import type { Quality } from "../render/renderer.js";

export interface UiActions {
  command(command: GameCommand): void;
  panel(kind: PanelKind): void;
  closePanel(): void;
  fixture(): void;
  audio(settings: AudioSettings): void;
  newGame(): void;
  continueGame(): void;
  resume(): void;
  pause(): void;
  save(): void;
  exportGame(): void;
  exportBackup(): void;
  exportRaw(): void;
  importFile(file: File): void;
  confirm(): void;
  cancelConfirm(): void;
  lockMouse(): void;
  settings(quality: Quality, sensitivity: number, invertY: boolean): void;
}

export type PanelKind = "inventory" | "craft" | "notebook" | "carrier";
const escapeHtml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

function bearing(from: Vec3, to: Vec3): string {
  const degrees = (Math.atan2(to.x - from.x, from.z - to.z) * 180 / Math.PI + 360) % 360;
  return `${["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(degrees / 45) % 8]} · ${Math.round(distance(from, to))} m away · ${Math.max(0, -to.y).toFixed(0)} m depth`;
}

function containerLabel(state: GameState, id: string): string {
  if (id === "diver") return "Diver hold";
  if (id === "equipment") return "Retained equipment";
  if (id === "buoy_hold") return "Deployed buoy";
  if (id === "pod_locker") return "Pod locker";
  if (id === "workshop_locker") return "Workshop locker";
  const v = state.fleet.vehicles.find((v) => v.cargoId === id);
  return v ? `${HULLS[v.hull].label} hold` : "Visited cargo cache";
}
export class GameView {
  private panelKind: PanelKind | null = null;
  private latest: GameState | null = null;
  private subtitles = true;
  private readonly commands = new Map<string, GameCommand>();
  readonly canvas: HTMLCanvasElement;
  private readonly abort = new AbortController();
  private readonly menu: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly toast: HTMLElement;
  private toastTimer = 0;
  private wasPlaying = false;
  private canContinue = false;
  private graphicsFailed = false;

  constructor(
    private readonly root: HTMLElement,
    actions: UiActions,
    private readonly world: WorldQueries,
  ) {
    root.innerHTML = `
      <canvas id="ocean" tabindex="0" aria-label="Siltwake 3D reef. WASD to move, arrow keys or mouse drag to look. Escape opens the menu."></canvas>
      <div class="vignette" aria-hidden="true"></div>
      <main id="hud" hidden aria-label="Exploration display">
        <div class="hud-top"><div class="region"><span class="eyebrow">SILTWAKE / FIRST EXPEDITION</span><strong id="region-name">Hearth Reef</strong></div>
        <div class="heading"><span id="compass">N</span><small id="bearing">000°</small></div>
        <div class="hud-actions"><span id="session-warning" hidden>Autosave off · export before closing</span><button data-action="inventory">Hold <kbd>Tab</kbd></button><button data-action="notebook">Notebook <kbd>J</kbd></button><button data-action="craft">Fabricate <kbd>K</kbd></button><button data-action="save" title="Save locally (F5)">Save <kbd>F5</kbd></button><button data-action="pause">Menu <kbd>Esc</kbd></button></div></div>
        <div id="vitals" class="vitals"></div><div id="hazard" class="hazard" role="status" aria-live="polite"></div><div id="interact-prompt" class="interact-prompt"></div><div id="opening" class="opening" hidden><span id="opening-progress" class="eyebrow">POD CHECK 1 / 4</span><h2 id="opening-title"></h2><p id="opening-caption"></p><button id="opening-act" data-action="opening">Act <kbd>E</kbd></button><button data-action="skip">Skip opening <kbd>Space</kbd></button><small id="opening-detail"></small></div><div class="crosshair" aria-hidden="true"></div>
        <div class="hud-bottom"><div class="telemetry"><span class="depth"><b id="depth">0.0</b><small>m / DEPTH</small></span><span class="mode"><strong id="movement">On foot</strong><small id="refuge-distance">Home pod · 0 m</small></span></div>
        <div class="explore-note"><span id="cruise" hidden>FORWARD CRUISE · R TO STOP</span><p id="context-hint">Walk down the amber-edged ramp to the water.</p><small>WASD move · drag / arrows look · Space rise · C dive</small></div></div>
      </main>
      <div id="menu" class="menu-screen" role="dialog" aria-modal="true" aria-labelledby="menu-title">
        <div class="menu-frame">
          <div class="wordmark"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 28C11 9 18 6 20 6s9 3 15 22M7 28c8-6 18-6 26 0M12 35c5-3 11-3 16 0"/></svg><span>FIELD BUILD / M1</span></div>
          <h1 id="menu-title">SILTWAKE</h1><p id="menu-subtitle" class="subtitle">A refuge. A reef. A first horizon.</p>
          <p id="pause-reason" class="pause-reason" hidden></p>
          <section id="main-menu">
            <div class="menu-buttons"><button id="resume" class="primary" data-action="resume" hidden>Return to the water <span>↗</span></button>
            <button id="continue" class="primary" data-action="continue" disabled>Continue <span>↗</span></button>
            <button id="new-game" data-action="new">New expedition <span>+</span></button></div>
            <div class="menu-tools"><button id="manual-save" data-action="save" hidden>Save locally</button><button id="export-game" data-action="export" hidden>Export save</button><button data-action="import">Import save</button></div>
            <p id="save-status" class="save-status"></p>
            <details class="details"><summary>Controls & settings</summary>
              <dl class="controls"><div><dt>W A S D</dt><dd>Move / swim</dd></div><div><dt>Drag mouse / ↑ ↓ ← →</dt><dd>Look around</dd></div><div><dt>Space / C</dt><dd>Rise or jump / dive</dd></div><div><dt>Shift</dt><dd>Move faster</dd></div><div><dt>R</dt><dd>Toggle forward cruise</dd></div><div><dt>E / Q / B / F / G</dt><dd>Interact / scan / buoy / meal / distract</dd></div><div><dt>Tab / K / J / H</dt><dd>Hold / fabricate / notebook / hint</dd></div><div><dt>Z / V</dt><dd>Quiet movement / fixture controls</dd></div><div><dt>Esc / F5</dt><dd>Pause / save locally</dd></div></dl>
              <div class="settings"><label>Rendering <select id="quality"><option value="rich">Rich · full viewport</option><option value="light">Light · lower resolution</option></select></label>
              <label>Mouse sensitivity <input id="sensitivity" type="range" min="0.4" max="2.5" step="0.1" value="1" /></label><label class="check"><input id="invert" type="checkbox" /> Invert mouse look</label></div>
              <button id="lock-mouse" data-action="lock" hidden>Resume with locked mouse</button><small class="control-note">Mouse lock is optional. Escape releases it and pauses. Click and drag also works.</small>
            </details>
            <details class="details"><summary>Sound & captions</summary><div class="settings"><label>Volume <output id="volume-value">55%</output><input id="volume" type="range" min="0" max="1" step="0.05" value="0.55" /></label><label class="check"><input id="muted" type="checkbox" /> Mute</label><label class="check"><input id="subtitles" type="checkbox" checked /> Opening captions</label></div><p>Hazards, action results and notebook records remain readable with captions off. Audio starts after deliberate play input.</p></details><details class="details"><summary>Carrier feasibility fixture</summary><p>Separate seeded test of stationary interiors and isolated launch locks. Starting this replaces the Continue slot after confirmation; export your expedition first.</p><button data-action="fixture">Open seeded carrier fixture</button></details><details class="details"><summary>Save safety</summary><p>Autosaves run every 30 seconds of active exploration when local saving is enabled. Menu and background time do not advance the world. Local saves keep a previous valid generation and coordinate writers between tabs.</p><p>Use export to keep a portable file. Browser storage belongs to this site and can be cleared by the browser. Session-only expeditions need an export before closing.</p><div class="menu-tools"><button id="export-backup" data-action="backup" hidden>Export previous save</button><button id="export-raw" data-action="raw" hidden>Export local record</button></div></details>
          </section>
          <section id="confirmation" class="confirmation" hidden><h2 id="confirm-title"></h2><p id="confirm-detail"></p><div class="menu-buttons"><button id="confirm-accept" class="primary" data-action="confirm">Confirm</button><button data-action="cancel">Go back</button></div></section>
          <p id="save-operation" class="save-status" role="status" hidden>Reading a file or waiting to save safely… <button data-action="cancel">Cancel operation</button></p>
          <p class="build-note"><span class="status-dot"></span> FIRST LINKED EXPEDITION<span>Restore the pod and workshop, investigate their habitats, build a Dart and explore the upper Canopy. The remaining campaign is under construction.</span></p>
        </div>
        <div class="scene-caption" aria-hidden="true"><span>01 / HEARTH REEF</span><p>Follow the light.<br/>Learn the shore.</p><i></i><small>A QUIET PLACE TO BEGIN</small></div>
      </div>
      <section id="game-panel" class="game-panel" role="dialog" aria-modal="true" aria-labelledby="panel-title" hidden><div class="panel-frame"><div class="panel-header"><span class="eyebrow">EXPEDITION PAUSED / NO SURVIVAL DRAIN</span><button id="panel-return" data-action="close-panel">Return <kbd>Esc</kbd></button></div><nav aria-label="Expedition panels"><button data-action="inventory-panel">Hold</button><button data-action="craft-panel">Fabricate</button><button data-action="notebook-panel">Notebook</button><button id="carrier-nav" data-action="carrier-panel" hidden>Carrier fixture</button></nav><h2 id="panel-title"></h2><p id="panel-feedback" role="status" aria-live="polite" hidden></p><div id="panel-content"></div></div></section><section id="graphics-error" class="graphics-error" role="alert" hidden><h2>The ocean could not open</h2><p id="graphics-error-text"></p><p>Your existing local save has not been changed. Save exports remain available in the menu.</p></section>
      <div id="notification" role="status" aria-live="polite" hidden></div>
      <input id="import-file" type="file" accept=".json,application/json" hidden />`;
    this.canvas = this.get<HTMLCanvasElement>("ocean");
    this.menu = this.get("menu");
    this.hud = this.get("hud");
    this.toast = this.get("notification");
    const options = { signal: this.abort.signal };
    const map: Record<string, () => void> = {
      opening: () => actions.command({ type: "interact" }),
      skip: () => actions.command({ type: "skip-opening" }),
      inventory: () => actions.panel("inventory"),
      craft: () => actions.panel("craft"),
      notebook: () => actions.panel("notebook"),
      fixture: actions.fixture,
      "close-panel": actions.closePanel,
      ...Object.fromEntries(
        (["inventory", "craft", "notebook", "carrier"] as const).map((k) => [
          `${k}-panel`,
          () => {
            if (this.latest) {
              this.panelKind = k;
              this.refreshPanel(this.latest);
            }
          },
        ]),
      ),
      new: actions.newGame,
      continue: actions.continueGame,
      resume: actions.resume,
      pause: actions.pause,
      save: actions.save,
      export: actions.exportGame,
      backup: actions.exportBackup,
      raw: actions.exportRaw,
      confirm: actions.confirm,
      cancel: actions.cancelConfirm,
      lock: actions.lockMouse,
      import: () => {
        const input = this.get<HTMLInputElement>("import-file");
        input.value = "";
        input.click();
      },
    };
    root.addEventListener(
      "click",
      (event) => {
        const target = (event.target as Element).closest<HTMLButtonElement>(
          "[data-action]",
        );
        if (target && !target.disabled) {
          const command = this.commands.get(target.dataset.action ?? "");
          if (command) actions.command(command);
          else map[target.dataset.action ?? ""]?.();
        }
      },
      options,
    );
    this.get("import-file").addEventListener(
      "change",
      () => {
        const file = this.get<HTMLInputElement>("import-file").files?.[0];
        if (file) actions.importFile(file);
      },
      options,
    );
    for (const id of ["quality", "sensitivity", "invert"])
      this.get(id).addEventListener(
        id === "sensitivity" ? "input" : "change",
        () =>
          actions.settings(
            this.get<HTMLSelectElement>("quality").value as Quality,
            this.get<HTMLInputElement>("sensitivity").valueAsNumber,
            this.get<HTMLInputElement>("invert").checked,
          ),
        options,
      );
    for (const id of ["volume", "muted", "subtitles"])
      this.get(id).addEventListener(
        id === "volume" ? "input" : "change",
        () =>
          actions.audio({
            volume: this.get<HTMLInputElement>("volume").valueAsNumber,
            muted: this.get<HTMLInputElement>("muted").checked,
            subtitles: this.get<HTMLInputElement>("subtitles").checked,
          }),
        options,
      );
    this.root.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Tab") return;
        const modal = !this.get("game-panel").hidden
          ? this.get("game-panel")
          : !this.menu.hidden ? this.menu : null;
        if (!modal) return;
        const visible = [
          ...modal.querySelectorAll<HTMLElement>(
            "button:not([disabled]),select,input,summary",
          ),
        ].filter((element) => element.getClientRects().length > 0);
        const first = visible[0],
          last = visible.at(-1);
        if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement)) && last) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || !modal.contains(document.activeElement)) &&
          first
        ) {
          event.preventDefault();
          first.focus();
        }
      },
      options,
    );
  }

  private get<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = this.root.querySelector<T>(`#${id}`);
    if (!element) throw new Error(`Missing UI element ${id}`);
    return element;
  }

  audioSettings(settings: AudioSettings): void {
    this.subtitles = settings.subtitles;
    this.get<HTMLInputElement>("volume").value = String(settings.volume);
    this.get("volume-value").textContent = `${Math.round(settings.volume * 100)}%`;
    this.get<HTMLInputElement>("muted").checked = settings.muted;
    this.get<HTMLInputElement>("subtitles").checked = settings.subtitles;
    this.get("opening-caption").hidden = !this.subtitles;
  }

  settings(quality: Quality, sensitivity: number, invertY: boolean): void {
    this.get<HTMLSelectElement>("quality").value = quality;
    this.get<HTMLInputElement>("sensitivity").value = String(sensitivity);
    this.get<HTMLInputElement>("invert").checked = invertY;
  }

  slot(slot: SaveSlot, hasSession: boolean): void {
    const button = this.get<HTMLButtonElement>("continue");
    this.canContinue = slot.save !== null;
    button.hidden = hasSession;
    button.disabled = !this.canContinue;
    button.textContent =
      slot.kind === "recovered" ? "Open previous valid save ↗" : "Continue ↗";
    this.get("save-status").textContent = slot.message;
    this.get("export-backup").hidden = slot.backup === null;
    this.get("export-raw").hidden =
      slot.kind === "empty" || slot.kind === "unavailable";
    this.get("export-game").hidden = !hasSession && slot.save === null;
  }

  persistence(
    message: string,
    autoSaveAllowed: boolean,
    hasSession: boolean,
    busy: boolean,
  ): void {
    if (message) this.get("save-status").textContent += ` ${message}`;
    this.get("session-warning").hidden = !hasSession || autoSaveAllowed;
    this.get("save-operation").hidden = !busy;
    this.root.dataset.autosave = autoSaveAllowed ? "enabled" : "disabled";
    this.root.dataset.busy = String(busy);
    this.menu.setAttribute("aria-busy", String(busy));
    for (const button of this.root.querySelectorAll<HTMLButtonElement>(
      "[data-action]",
    )) {
      const action = button.dataset.action;
      if (
        [
          "new",
          "continue",
          "resume",
          "lock",
          "save",
          "import",
          "confirm",
        ].includes(action ?? "")
      ) {
        button.disabled =
          busy ||
          (action === "continue" && !this.canContinue) ||
          (this.graphicsFailed &&
            ["new", "continue", "resume", "lock"].includes(action ?? ""));
      }
    }
  }

  showMenu(hasSession: boolean, reason = ""): void {
    this.get("game-panel").hidden = true;
    this.menu.hidden = false;
    this.hud.hidden = true;
    this.root.dataset.screen = "menu";
    this.get("resume").hidden = !hasSession;
    this.get("manual-save").hidden = !hasSession;
    this.get("lock-mouse").hidden =
      !hasSession || typeof this.canvas.requestPointerLock !== "function";
    this.get("pause-reason").hidden = reason.length === 0;
    this.get("pause-reason").textContent = reason;
    this.get("menu-subtitle").textContent = hasSession
      ? "A moment ashore."
      : "A refuge. A reef. A first horizon.";
    if (this.wasPlaying)
      this.get(hasSession ? "resume" : "new-game").focus({
        preventScroll: true,
      });
    this.wasPlaying = false;
  }

  showGame(): void {
    this.menu.hidden = true;
    this.hud.hidden = false;
    this.root.dataset.screen = "playing";
    this.wasPlaying = true;
    this.get("opening").hidden = !this.latest || this.latest.opening.phase === 4;
    this.canvas.focus({ preventScroll: true });
  }

  confirmation(title: string, detail: string, accept: string): void {
    this.get("main-menu").hidden = true;
    this.get("confirmation").hidden = false;
    this.get("confirm-title").textContent = title;
    this.get("confirm-detail").textContent = detail;
    this.get("confirm-accept").textContent = accept;
    this.get("confirm-accept").focus({ preventScroll: true });
  }

  cancelConfirmation(): void {
    if (this.get("confirmation").hidden) return;
    this.get("main-menu").hidden = false;
    this.get("confirmation").hidden = true;
    this.get("new-game").focus({ preventScroll: true });
  }

  update(state: GameState, cruise: boolean): void {
    this.latest = state;
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
      ),
      t = nearestInteraction(state);
    this.get("context-hint").textContent = state.world.action
      ? `Active ${state.world.action.kind} · ${Math.ceil(state.world.action.seconds)} s remaining`
      : state.recovery.operation
        ? `Bobbin · ${state.recovery.operation.phase} · follow the local tether corridor`
        : e.refuge
          ? "Safe air · gradual healing · hold / fabricate / notebook"
          : v?.hull === "dart" && p.x > 15 && p.x < 25 && p.z < -16 && p.z > -29
            ? "Launch cradle · move south beyond the amber rails before turning. Return along the same clear approach."
          : p.x > 68
            ? "Read the upper crowns. Z quiet · G distraction · retreat behind the tall rib."
            : p.z > 9 && p.y < 0 && Math.abs(p.x) < 4
              ? "Below the pod deck · swim around the ramp edge, surface, then approach its amber treads."
              : "E interact · Q scan · B buoy · F meal · H voluntary hint";
    const exitBlocked = v ? exitRefusal(state, this.world) : null;
    this.get("interact-prompt").innerHTML = v
      ? `<kbd>E</kbd> ${exitBlocked ? "Exit blocked" : "Clear side exit"} · suit ${personalLimit(state)} m / hull ${HULLS[v.hull].initialDepth} m<small>${escapeHtml(exitBlocked ?? "Personal air and pressure protection apply outside.")}</small>`
      : t
        ? `<kbd>E</kbd> ${escapeHtml(t.label)} <small>${t.id in SOURCES ? `${SOURCES[t.id as keyof typeof SOURCES].item === "meal" ? "Hand-gather food" : "Collect exposed bundle"} · Q scan` : t.kind === "evidence" ? "Inspect & record · J notebook" : "Inspect"}</small>`
        : "";
    this.get("vitals").innerHTML =
      `<div class="${state.player.vitals.oxygen < 35 ? "urgent" : ""}"><span>O₂</span><b>${state.player.vitals.oxygen.toFixed(0)}%</b><i style="--fill:${state.player.vitals.oxygen}%"></i><small>${e.breathable ? "Breathing air" : "180 s tank"}</small></div><div><span>HEALTH</span><b>${state.player.vitals.health.toFixed(0)}</b><i style="--fill:${state.player.vitals.health}%"></i></div><div><span>FOOD</span><b>${state.player.vitals.food.toFixed(0)}</b><i style="--fill:${state.player.vitals.food}%"></i><small>${state.player.vitals.food === 0 ? "Grace / gather normally" : "F · eat meal"}</small></div>${v ? `<div class="${v.charge < 25 ? "urgent" : ""}"><span>${HULLS[v.hull].label.toUpperCase()}</span><b>${v.charge.toFixed(0)}% power</b><small>Hull ${v.health.toFixed(0)}% · ${hullDepth(v).toFixed(0)} / ${HULLS[v.hull].initialDepth} m</small></div>` : ""}`;
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
    if (state.player.vitals.health <= 25)
      warnings.push("LOW HEALTH · retreat to refuge air and healing");
    const threat = state.world.threat.mode;
    if (!e.refuge && threat !== "idle") {
      const direction = bearing(p, state.world.threat.position).split(" · ")[0];
      warnings.push(`SOUND HUNTER · ${direction} · ${threat === "warn" ? "paired warning calls — slow down / cover" : threat === "investigate" ? "investigating — Z quiet / G distraction" : threat === "pursue" ? "pursuit — break sight behind the tall rib" : "disengaging"}`);
    }
    if (state.player.vitals.food < 20)
      warnings.push(state.player.vitals.food === 0
        ? state.player.starvationSeconds > 180 ? "STARVATION · health falling · F meal / refuge emergency portion" : "FOOD EMPTY · gather normally during grace · F meal / refuge portion"
        : "LOW FOOD · F meal / shallow staples / refuge emergency portion");
    const warningHtml = warnings.map((w) => `<span>${escapeHtml(w)}</span>`).join("");
    if (this.get("hazard").innerHTML !== warningHtml) this.get("hazard").innerHTML = warningHtml;
    const opening = state.opening.phase < 4;
    this.get("opening").hidden = !opening;
    if (opening) {
      const o = OPENING[state.opening.phase as 0 | 1 | 2 | 3];
      this.get("opening-progress").textContent = `POD CHECK ${state.opening.phase + 1} / 4 · ${state.opening.phase ? "PREVIOUS CHECK COMPLETE" : "E TO ACT"}`;
      this.get("opening-title").textContent = o.label;
      this.get("opening-act").textContent = `${o.label} · E`;
      this.get("opening-caption").textContent = o.caption;
      this.get("opening-detail").textContent = o.detail;
    }
    this.hud.dataset.tick = String(state.tick);
    this.hud.dataset.position = `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
    this.hud.dataset.mode = mode;
    this.hud.dataset.yaw = String(state.player.pose.yaw);
    this.hud.dataset.pitch = String(state.player.pose.pitch);
  }

  closePanel(): void {
    this.panelKind = null;
    this.get("game-panel").hidden = true;
  }
  openPanel(kind: PanelKind, state: GameState): void {
    this.panelKind = kind;
    this.menu.hidden = true;
    this.hud.hidden = true;
    this.get("game-panel").hidden = false;
    this.root.dataset.screen = "panel";
    this.get("panel-feedback").hidden = true;
    this.refreshPanel(state);
    this.get("panel-return").focus({ preventScroll: true });
  }
  refreshPanel(state: GameState): void {
    this.latest = state;
    if (!this.panelKind) return;
    const content = this.get("panel-content");
    const restoreFocus = content.contains(document.activeElement);
    const restoreKey = restoreFocus ? (document.activeElement as HTMLElement | null)?.dataset.commandKey : undefined;
    this.commands.clear();
    this.get("carrier-nav").hidden = state.scenario !== "carrier-fixture";
    const button = (label: string, command: GameCommand, disabled = false): string => {
      const id = `command-${this.commands.size}`;
      this.commands.set(id, command);
      // Every operand identifies the action, independently of its label or render order.
      const key = JSON.stringify(command, Object.keys(command).sort());
      return `<button data-action="${id}" data-command-key="${escapeHtml(key)}"${disabled ? " disabled" : ""}>${escapeHtml(label)}</button>`;
    };
    const kind = this.panelKind;
    this.get("panel-title").textContent = {
      inventory: "Hold & preparation",
      craft: "Fabrication & services",
      notebook: "Field notebook",
      carrier: "Carrier feasibility fixture",
    }[kind];
    for (const nav of this.get("game-panel").querySelectorAll<HTMLButtonElement>("nav button"))
      nav.setAttribute("aria-current", nav.dataset.action === `${kind}-panel` ? "page" : "false");
    let html = "";
    if (kind === "inventory") {
      const buoy = state.inventory.buoy,
        buoyItem = state.inventory.items.find((i) => i.id === buoy.itemId),
        diver = state.inventory.containers.find((c) => c.id === "diver");
      html = `<p class="panel-intro">Personal suit ${personalLimit(state)} m · diver hold ${usedCapacity(state, "diver")} / ${diver?.capacity ?? 0} CU. A hull protects you only while aboard; check the side exit before leaving it.</p><div class="service-actions">${button("Eat a meal", { type: "eat" })}${button(buoy.deployed ? "Pack empty buoy" : "Deploy carried buoy", { type: "buoy" }, !buoyItem)}${button("Request emergency refuge meal", { type: "emergency-meal" })}</div>`;
      html += `<p class="equipment-note"><b>Reusable buoy</b> · ${!buoyItem ? "Not built. Discover the intake record, then fabricate at the pod." : buoy.deployed ? `Deployed · ${usedCapacity(state, "buoy_hold")} / ${state.inventory.containers.find((c) => c.id === "buoy_hold")?.capacity ?? 0} CU · ${bearing(state.player.pose.position, buoy.position)}. Empty it, approach the collar and keep 2 CU free to pack it.` : `Packed in ${containerLabel(state, buoyItem.containerId).toLowerCase()} · 2 CU. Carry it in your diver hold before deploying.`} Packing and deploying retain the same buoy and cargo hold.</p>`;
      const bins = state.inventory.containers.filter((c) => containerAccessible(state, c.id));
      const distant = state.inventory.containers.filter((c) => !containerAccessible(state, c.id) && c.kind !== "cache" && (c.kind !== "buoy" || buoy.deployed));
      if (distant.length)
        html += `<p class="equipment-note"><b>Out of reach</b> · ${distant.map((c) => `${escapeHtml(containerLabel(state, c.id))} (${usedCapacity(state, c.id)} / ${c.capacity} CU)`).join(" · ")}. Approach a locker, deployed buoy or craft to transfer. A workshop locker opens after its services are restored.</p>`;
      html += '<div class="container-grid">';
      for (const c of bins) {
        html += `<article class="container"><h3>${escapeHtml(containerLabel(state, c.id))} <small>${usedCapacity(state, c.id)} / ${c.capacity} CU</small></h3>`;
        for (const i of state.inventory.items.filter(
          (i) => i.containerId === c.id,
        )) {
          html += `<div class="item-row"><strong>${ITEMS[i.kind].label} × ${i.quantity}</strong><small>${i.fitted ? "Fitted / retained" : `${ITEMS[i.kind].cu * i.quantity} CU`}${i.charge !== null ? ` · charge ${i.charge.toFixed(0)}%` : ""}${i.provenance === "maintenance" ? " · recovery allocation" : ""}</small><div>`;
          if (!i.fitted)
            for (const d of bins.filter(
              (d) => d.id !== c.id && d.kind !== "equipment",
            )) {
              html += button(
                `${d.id === "diver" ? "Take to diver" : "To " + containerLabel(state, d.id)} · ${i.quantity}${usedCapacity(state, d.id) + ITEMS[i.kind].cu * i.quantity > d.capacity ? " (needs space)" : ""}`,
                {
                  type: "transfer",
                  itemId: i.id,
                  to: d.id,
                  quantity: i.quantity,
                },
              );
              if (i.quantity > 1)
                html += button(`${d.id === "diver" ? "Take to diver" : "To " + containerLabel(state, d.id)} · 1`, {
                  type: "transfer", itemId: i.id, to: d.id, quantity: 1,
                });
            }
          html += "</div></div>";
        }
        html += "</article>";
      }
      html += "</div>";
      for (const v of state.fleet.vehicles.filter((v) => !v.berth && v.hull !== "hearthline")) {
        const local = distance(state.player.pose.position, v.pose.position) < 7;
        const cells = state.inventory.items.filter((i) => i.kind === "reserve_cell" && (i.containerId === "diver" || i.containerId === v.cargoId));
        html += `<article><h3>${HULLS[v.hull].label} · ${v.disabled ? "disabled transponder" : "available"}</h3><p>${bearing(state.player.pose.position, v.pose.position)} · ${local ? "service socket in reach" : "approach the service socket"}. Power ${v.charge.toFixed(0)}% · hull ${v.health.toFixed(0)}% · hull rating ${HULLS[v.hull].initialDepth} m / personal suit ${personalLimit(state)} m.</p><p>Reserve cells in diver / this craft: ${cells.length ? cells.map((i) => `${(i.charge ?? 0).toFixed(0)}%`).join(", ") : "none"}. A full cell transfers up to 35% hull power; supported service recharges these cells. Cells in a locker must be carried first.</p><div class="service-actions">${button("Supported charge / repair", { type: "service", vehicleId: v.id })}${button("Use reserve cell", { type: "reserve", vehicleId: v.id })}${v.disabled ? `${button("Field patch · 2 maintenance alloy / 1 membrane", { type: "recover", vehicleId: v.id, method: "repair" })}${button(state.recovery.operation?.vehicleId === v.id && state.recovery.operation.phase === "ready" ? "Attach collar / confirm tow" : "Deploy Bobbin / local tow", { type: "recover", vehicleId: v.id, method: "tow" })}${button("Salvage empty frame locally", { type: "recover", vehicleId: v.id, method: "salvage" })}` : ""}</div><small>Routine service: pod waters or restored workshop cradle, within reach of the craft. ${v.disabled ? "Bobbin kit required. Start tow at the shallow staging bench or local collar; field patch and salvage require local access." : "Field recovery options appear for a disabled Dart."}</small></article>`;
      }
      html += this.returnInformation(state);
    } else if (kind === "craft") {
      html = `<p class="panel-intro">${nearPod(state) ? "At the home pod bench" : nearWorkshop(state) ? "At the Splitspine workshop" : "Away from a fabrication bench"}. Ingredients use your diver hold, the required bench’s accessible locker and a nearby deployed buoy. Craft cargo is not a bench ingredient source: transfer it first. A refusal consumes nothing.</p>`;
      for (const [key, r] of Object.entries(RECIPES)) {
        const id = key as RecipeId;
        if (!state.knowledge.blueprints.includes(r.bp)) continue;
        const done = r.once && state.knowledge.crafted.includes(id);
        const refusal = done ? null : craftingRefusal(state, id, this.world);
        const bins = fabricationContainers(state, r.site).filter((c) => containerAccessible(state, c));
        const missingSteps = r.needs.filter((n) => !state.knowledge.crafted.includes(n as RecipeId));
        html += `<article class="recipe" data-recipe="${id}"><div><h3>${r.label}${done ? " · installed" : ""}</h3><p>${Object.entries(r.cost).map(([k, q]) => {
          const kind = k as ItemKind;
          if (done) return `<span class="ingredient">${ITEMS[kind].label}: ${q} used</span>`;
          const have = r.maintenance
            ? kind === "structural_alloy" ? state.world.maintenance.alloy : kind === "silica_glass" ? state.world.maintenance.glass : state.world.maintenance.membrane
            : available(state, kind, bins);
          return `<span class="ingredient${have < q ? " missing" : ""}">${ITEMS[kind].label}: ${have} / ${q}${have < q ? ` · need ${q - have}` : " · ready"}</span>`;
        }).join("")}</p><small>${r.site === "island_workshop" ? PLACES.island_workshop.label : "Home pod bench"}${r.maintenance ? " · maintenance allocation only" : " · public materials"}</small>${missingSteps.length ? `<p class="recipe-status">First complete: ${missingSteps.map((n) => RECIPES[n as RecipeId].label).join(" → ")}</p>` : ""}${refusal ? `<p class="recipe-status">${escapeHtml(refusal)}</p>` : !done ? '<p class="recipe-ready">Ready at this bench</p>' : ""}</div>${done ? "" : button(`Fabricate · ${r.label}`, { type: "craft", recipeId: id })}</article>`;
      }
      html += this.knownHabitats(state);
      if (!state.knowledge.blueprints.length)
        html += "<p>Inspect the pod regulator to recover its checklist.</p>";
      html += `<p>Recovery allocation: ${state.world.maintenance.alloy} alloy / ${state.world.maintenance.glass} glass / ${state.world.maintenance.membrane} membrane. It funds Bobbin and bound repair patches only.</p>`;
      const n = nearestInteraction(state);
      if (n && n.id in SOURCES) {
        const id = n.id as keyof typeof SOURCES;
        html +=
          button("Sort finite source reserve · 20 active seconds", {
            type: "sort",
            sourceId: id,
          }) +
          button("Sort recovery-only patch · if allocation empty", {
            type: "sort",
            sourceId: id,
            maintenance: true,
          });
      }
      if (facility(state, "island_workshop"))
        html +=
          "<article><h3>The unfinished large berth</h3><p>The carrier cradle needs complementary surveys and frame recovery from Pale Basin. It is a future construction opportunity; no campaign carrier is available here yet.</p></article>";
    } else if (kind === "notebook") {
      html = `<p class="panel-intro">Observations retain their source. Hypotheses are interpretations, not established facts. Hints sharpen regional leads voluntarily.</p>${button("Request a regional hint", { type: "hint" })}`;
      const found = (id: string): boolean => state.knowledge.evidence.some((e) => e.id === id);
      html += `<article class="next-question"><h3>Current question</h3><p>${found("C04") ? "What changed in the water before the equipment failed? Compare the field sheet with the intake and workshop records. The Basin lead is for a later expedition." : found("C02") && found("C03") ? "Why were the intake and workshop left behind? Prepare for the upper Canopy laboratory, then compare its observations with these records." : found("C03") ? "Why were departure supplies left unused? The reef intake is an independent lead; the laboratory beyond the eastern crowns needs a protected return plan." : found("C02") ? "Why is the intake abandoned while its filters still live? The workshop by Splitspine’s landing may preserve a different account." : "Why is the pod damaged? Compare its regulator with the intake below the reef ribs, or investigate the workshop above the island landing."}</p><small>Either early lead can be investigated first. Personal field notes add context; they do not unlock the investigation.</small></article>`;
      if (
        state.knowledge.evidence.some((e) => e.id === "C02") &&
        state.knowledge.evidence.some((e) => e.id === "C03")
      )
        html +=
          '<p class="interpretation">Together: the living intake and unspent shore supplies suggest disrupted services. The reason people left these sites is still unconfirmed, whichever record you found first.</p>';
      for (const found of state.knowledge.evidence) {
        const e = EVIDENCE[found.id];
        html += `<article class="finding"><h3>${e.label}</h3><p class="provenance">Source · ${escapeHtml(found.provenance)}</p><p><b>Observed</b> · ${e.observation}</p><p><b>Hypothesis</b> · ${e.hypothesis}</p><p class="lead"><b>Regional lead</b> · ${e.lead}</p></article>`;
      }
      for (const id of state.knowledge.scans)
        html += `<article><h3>${id === "filter_flow" ? "Current-facing filters" : SOURCES[id as keyof typeof SOURCES]?.label}</h3><p>${id === "filter_flow" ? "Open fans face the current. Harvest loose membrane from downstream catch hollows." : (SOURCES[id as keyof typeof SOURCES]?.scan ?? "")}</p></article>`;
      if (state.knowledge.journals.includes(OPTIONAL_RECORD.id))
        html += `<article><h3>Personal record · optional</h3><p>${OPTIONAL_RECORD.text}</p></article>`;
      html += this.knownHabitats(state);
      html += `<article><h3>Before committing to a dive</h3><p>Current personal suit: ${personalLimit(state)} m. A Dart hull is rated to ${HULLS.dart.initialDepth} m, but it cannot protect you outside. Your full tank lasts 180 seconds submerged. Carry a meal and charged reserve cell; plan to return with at least a quarter of your air and power.</p><p>Z reduces movement noise. The tall rib’s cover and the service tool’s G distraction can break a sound hunter’s interest. Warning calls have a visible HUD equivalent even with sound muted or opening captions off.</p></article>`;
      html += this.returnInformation(state);
      html += `<p>Recovered research: ${state.knowledge.blueprints.length} / ${BLUEPRINTS.length} in this expedition. Later fleets and deeper regions remain under construction.</p>`;
    } else {
      const d = state.fleet.docking;
      html =
        '<p class="fixture-label">SEEDED FEASIBILITY · no earned campaign progression · station keeping only, no underway walking</p>';
      if (!d)
        html += "<p>Open the separate carrier fixture from the main menu.</p>";
      else {
        html += `<p>${d.stationKeeping ? "Station keeping" : "Under helm control"} · ${d.configuration} configuration · ${d.transaction ? `${d.transaction.type} / ${d.transaction.phase}` : "lock closed"} · completed transactions ${d.completed.length}</p><div class="service-actions">`;
        for (const [label, a] of [
          ["Engage station keeping", "station-keep"],
          ["Take helm", "helm"],
          ["Leave helm", "leave-helm"],
          ["Leave aft vestibule", "leave-interior"],
          ["Enter exterior vestibule", "enter-interior"],
          ["Reconfigure empty supported berth", "reconfigure"],
          ["Toggle fixture obstruction", "block-exit"],
          ["Interrupt lock transaction", "interrupt"],
          ["Fixture incapacity / refuge fallback", "failure-drill"],
        ] as const)
          html += button(label, { type: "carrier", action: a });
        html += "</div>";
        for (const v of state.fleet.vehicles.filter(
          (v) => v.id !== d.vehicleId,
        ))
          html += `<article><h3>${HULLS[v.hull].label} · ${v.berth ? "dry isolated berth " + v.berth.slot : "world craft"}</h3><p>Identity ${v.id} · power ${v.charge.toFixed(1)} · damage ${(100 - v.health).toFixed(1)} · cargo ${usedCapacity(state, v.cargoId)} CU</p>${button(v.berth ? "Launch through lock" : "Capture from corridor", { type: "carrier", action: v.berth ? "launch" : "capture", vehicleId: v.id })}</article>`;
      }
    }
    this.get("panel-content").innerHTML = html;
    if (restoreFocus) {
      const next = restoreKey ? [...content.querySelectorAll<HTMLButtonElement>("button:not([disabled])")].find((b) => b.dataset.commandKey === restoreKey) : undefined;
      (next ?? this.get("panel-return")).focus({ preventScroll: true });
    }
  }

  private knownHabitats(state: GameState): string {
    const known = Object.entries(SOURCES).filter(([id]) => state.knowledge.scans.includes(id));
    return `<article class="habitat-notes"><h3>Known source habitats</h3>${known.length ? known.map(([id, s]) => {
      const stock = state.world.resources.find((r) => r.id === id);
      return `<p><b>${ITEMS[s.item].label} · ${s.label}</b><br />${REGIONS[s.region].label} · ${s.context}<br /><small>${stock?.stock ?? 0} exposed · ${stock?.reserve ?? 0} finite reserve · ${s.bundle} per hand bundle. ${s.item === "meal" ? "When empty, tend here for 20 active seconds for two more portions." : "Sort the host’s finite reserve locally if exposed stock is empty."}</small></p>`;
    }).join("") : "<p>Collect or scan a source to retain its habitat here. Inspecting a record does not reveal every deposit.</p>"}</article>`;
  }

  private returnInformation(state: GameState): string {
    let html = '<article class="return-plan"><h3>Return & recovery</h3><p>Knowledge, blueprints and retained equipment survive incapacity. Ordinary cargo may remain in a visited cache; disabled craft keep their own holds. Recovering takes a local expedition.</p>';
    // The saved report survives toast expiry, panel reopening and reload. Only
    // recovery transitions belong here; other command feedback stays transient.
    if (Object.values(RECOVERY_NOTICES).some((message) => message === state.feedback))
      html += `<p class="recipe-status"><b>Last recovery report</b><br />${escapeHtml(state.feedback)}</p>`;
    for (const id of ["home_pod", "island_workshop", "canopy_lab"] as const) {
      if (id !== "home_pod" && !state.knowledge.markers.includes(id) && !facility(state, id)) continue;
      html += `<p><b>${PLACES[id].label}</b> · ${bearing(state.player.pose.position, PLACES[id].position)}<br />${id === "home_pod" ? `Air, healing, locker and emergency meal. ${facility(state, "pod_fabricator") ? "Equipment fabrication restored." : "Repair its bench for equipment fabrication."} Routine craft service is in the nearby pod waters.` : id === "island_workshop" ? facility(state, id) ? "Restored: air, healing, locker, charging and hull fabrication. Craft service is at the launch cradle." : "Known workshop: restore its services for air, healing, locker, charging and hull fabrication." : "Laboratory air pocket and gradual healing. It has no cargo locker or craft charging service."}</p>`;
    }
    for (const cache of state.recovery.caches) {
      const items = state.inventory.items.filter((i) => i.containerId === cache.containerId);
      if (!items.length) continue;
      html += `<p><b>Visited cargo cache</b> · ${bearing(state.player.pose.position, cache.position)}<br />${items.map((i) => `${i.quantity} ${ITEMS[i.kind].label}`).join(" / ")}. Approach within 4 m, then open Hold to transfer.</p>`;
    }
    for (const loss of state.recovery.losses.filter((l) => l.visited)) {
      const v = state.fleet.vehicles.find((v) => v.id === loss.vehicleId);
      if (!v) continue;
      html += `<p><b>${HULLS[v.hull].label} loss transponder</b> · ${bearing(state.player.pose.position, v.pose.position)} · hold ${usedCapacity(state, v.cargoId)} CU.<br />${v.hull === "dart" ? "Use the retained Bobbin kit for local tow, a bound field patch, or salvage after emptying the hold. Tow does not restore damage or charge." : "This fixture hull is outside the expedition’s implemented Dart recovery options."}</p>`;
    }
    if (equipped(state, "bobbin_kit") || state.recovery.losses.length) {
      html += `<p><b>Shallow rescue staging</b> · east of Splitspine · ${Math.max(0, -RECOVERY_STAGE.y)} m depth. Start the upper-Canopy tow here or at the disabled Dart’s collar. A deep collar may exceed your suit: stage the tow first. No remote passenger transport or story interactions.</p>`;
      const op = state.recovery.operation;
      if (op) html += `<p class="recipe-status">Bobbin: ${op.phase === "ready" ? "at the exterior collar — confirm tow in Hold to attach" : op.phase === "tow" ? "guiding the original hull back to shallow staging" : "following the local tether corridor toward the collar"}. Progress pauses while this panel is open.</p>`;
    }
    return html + "</article>";
  }

  notify(message: string, error = false): void {
    // Keep the last result in the blocking panel after the transient HUD toast fades.
    this.get("panel-feedback").textContent = message;
    this.get("panel-feedback").hidden = false;
    this.get("panel-feedback").classList.toggle("error", error);
    window.clearTimeout(this.toastTimer);
    this.toast.textContent = message;
    this.toast.hidden = false;
    this.toast.classList.toggle("error", error);
    this.toastTimer = window.setTimeout(
      () => {
        this.toast.hidden = true;
      },
      error ? 12000 : 5500,
    );
  }

  graphicsError(message: string): void {
    this.graphicsFailed = true;
    this.get("graphics-error").hidden = false;
    this.get("graphics-error-text").textContent = message;
    for (const id of ["new-game", "continue", "resume", "lock-mouse"])
      this.get<HTMLButtonElement>(id).disabled = true;
  }

  dispose(): void {
    window.clearTimeout(this.toastTimer);
    this.abort.abort();
    this.root.replaceChildren();
  }
}
