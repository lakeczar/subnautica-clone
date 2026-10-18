import {
  BLUEPRINTS,
  EVIDENCE,
  HULLS,
  ITEMS,
  MODULES,
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
  hasRoom,
  localBenchSite,
  materialStoragePreview,
  nearPod,
  nearWorkshop,
  usedCapacity,
} from "../sim/inventory.js";
import { craftingRefusal, personalLimit } from "../sim/progression.js";
import { deliberateExit } from "../runtime/input.js";
import type { AimedTarget } from "../sim/targeting.js";
import { aimedInteraction } from "../sim/targeting.js";
import { exposure } from "../sim/survival.js";
import { RECOVERY_NOTICES, recoveryOccupancyRefusal } from "../sim/recovery.js";
import { cellRechargePreview, distractionPreview, exitRefusal, hullDepth, PULSE_CHARGE_COST } from "../sim/vehicles.js";
import { dartPerformance, installModuleRefusal, removeModuleRefusal } from "../sim/modules.js";
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
  settings(quality: Quality, sensitivity: number, invertY: boolean, mouseMode: "captured" | "drag", keyTurnSpeed: number): void;
}

export type PanelKind = "inventory" | "craft" | "notebook" | "carrier";
type CommandButton = (label: string, command: GameCommand, disabled?: boolean) => string;
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
// Saved recovery notices are compatibility data. Only their display is softened.
function recoveryDisplay(message: string): string {
  if (message === RECOVERY_NOTICES.completed)
    return "Dart towed to the shallow rescue bench. Cargo, damage and charge are unchanged. Apply a rescue patch and use a reserve cell locally.";
  if (message === RECOVERY_NOTICES.occupied)
    return message.replace("a bound field patch", "a rescue patch");
  return message;
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
  private storageFrom: string | null = null;
  private storageTo: string | null = null;
  private highlightTimer = 0;
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
  get currentPanel(): PanelKind | null { return this.panelKind; }

  constructor(
    private readonly root: HTMLElement,
    actions: UiActions,
    private readonly world: WorldQueries,
  ) {
    root.innerHTML = `
      <canvas id="ocean" tabindex="0" aria-label="Siltwake 3D reef. WASD to move, mouse or arrow keys to look. Escape opens the menu."></canvas>
      <div class="vignette" aria-hidden="true"></div>
      <main id="hud" hidden aria-label="Exploration display">
        <div class="hud-top"><div id="hud-region" class="region"><span class="eyebrow">SILTWAKE / FIRST EXPEDITION</span><strong id="region-name">Hearth Reef</strong></div>
        <div id="hud-heading" class="heading"><span id="compass">N</span><small id="bearing">000°</small></div>
        <div class="hud-actions"><div id="hud-tools"><button data-action="inventory">Hold <kbd>Tab</kbd></button><button data-action="notebook">Notebook <kbd>J</kbd></button><button data-action="craft">Fabricate <kbd>K</kbd></button><button data-action="save" title="Save locally (F5)">Save <kbd>F5</kbd></button></div><button id="hud-pause" data-action="pause">Menu <kbd>Esc</kbd></button></div></div>
        <div id="vitals" class="vitals"></div><div id="hazard" class="hazard" role="status" aria-live="polite"></div><div id="interact-prompt" class="interact-prompt"></div><div id="pilot-guidance" class="pilot-guidance" aria-label="Pilot exit guidance" hidden></div>
        <section id="opening" class="opening" aria-label="Damaged pod opening" hidden><div aria-live="polite" aria-atomic="true"><span id="opening-progress" class="eyebrow">POD CHECK 1 / 4</span><h2 id="opening-title"></h2><p id="opening-caption"></p></div><div class="opening-actions"><button id="opening-act" data-action="opening">Act <kbd>E</kbd></button><button id="opening-skip" data-action="skip">Skip · hold <kbd>Space</kbd></button><label class="check"><input id="opening-subtitles" type="checkbox" checked /> Captions</label></div><small id="opening-detail"></small></section><div id="crosshair" class="crosshair" aria-hidden="true"></div><div id="pitch-cue" class="pitch-cue" aria-label="Pitch" hidden></div><span id="surface-cue" class="surface-cue" hidden>Surface</span><button id="look-action" class="look-action" data-action="lock" hidden>Click to look</button><div id="impact-notice" class="impact-notice" role="status" aria-live="polite" hidden></div>
        <div id="hud-bottom" class="hud-bottom"><div class="telemetry"><span class="depth"><b id="depth">0.0</b><small>m / DEPTH</small></span><span class="mode"><strong id="movement">On foot</strong><small id="refuge-distance">Home pod · 0 m</small></span></div>
        <div class="explore-note"><span id="cruise" hidden>FORWARD CRUISE · R TO STOP</span><p id="context-hint">Walk down the amber-edged ramp to the water.</p><small id="pulse-summary"></small><small id="control-hint"></small></div></div>
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
              <dl class="controls"><div><dt>W A S D</dt><dd>Move / swim</dd></div><div><dt>Mouse / ↑ ↓ ← →</dt><dd>Look around</dd></div><div><dt>Space / C</dt><dd>Rise or jump / dive</dd></div><div><dt>Shift</dt><dd>Move faster</dd></div><div><dt>R</dt><dd>Toggle forward cruise</dd></div><div><dt>E / Q / B / F / G</dt><dd>Interact / scan / buoy / meal / distract</dd></div><div><dt>Tab or I / K / J / H</dt><dd>Hold / fabricate / notebook / hint</dd></div><div><dt>W / S · A / D</dt><dd>Pilot thrust · slide; look steers</dd></div><div><dt>X</dt><dd>Exit craft (hold while moving)</dd></div><div><dt>Z / V</dt><dd>Quiet movement / fixture controls</dd></div><div><dt>Esc / F5</dt><dd>Pause / save locally</dd></div></dl>
              <div class="settings"><label>Rendering <select id="quality"><option value="rich">Rich · full viewport</option><option value="light">Light · lower resolution</option></select></label>
              <label>Sensitivity <output id="sensitivity-value">1.0</output><input id="sensitivity" type="range" min="0.4" max="2.5" step="0.1" value="1" /></label><label>Mouse look<select id="mouse-mode"><option value="captured">Captured</option><option value="drag">Drag</option></select></label><label>Key turn speed <output id="key-turn-value">1.0</output><input id="key-turn" type="range" min="0.5" max="2" step="0.1" value="1" /></label><label class="check"><input id="invert" type="checkbox" /> Invert mouse look</label></div>

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
      <aside id="session-warning" class="session-warning" aria-label="Local saving disabled" hidden><span>Autosave off · export before closing</span><button data-action="export">Export save</button></aside>
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
    root.addEventListener("change", (event) => {
      const target = event.target as HTMLSelectElement;
      if (!this.latest || (target.id !== "storage-from" && target.id !== "storage-to")) return;
      if (target.id === "storage-from") this.storageFrom = target.value;
      else this.storageTo = target.value;
      this.refreshPanel(this.latest);
      this.get(target.id).focus({ preventScroll: true });
    }, options);
    this.get("import-file").addEventListener(
      "change",
      () => {
        const file = this.get<HTMLInputElement>("import-file").files?.[0];
        if (file) actions.importFile(file);
      },
      options,
    );
    for (const id of ["quality", "sensitivity", "invert", "mouse-mode", "key-turn"])
      this.get(id).addEventListener(
        ["sensitivity", "key-turn"].includes(id) ? "input" : "change",
        () =>
          actions.settings(
            this.get<HTMLSelectElement>("quality").value as Quality,
            this.get<HTMLInputElement>("sensitivity").valueAsNumber,
            this.get<HTMLInputElement>("invert").checked,
            this.get<HTMLSelectElement>("mouse-mode").value as "captured" | "drag",
            this.get<HTMLInputElement>("key-turn").valueAsNumber,
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
    this.get("opening-subtitles").addEventListener("change", () => actions.audio({
      volume: this.get<HTMLInputElement>("volume").valueAsNumber,
      muted: this.get<HTMLInputElement>("muted").checked,
      subtitles: this.get<HTMLInputElement>("opening-subtitles").checked,
    }), options);
    this.root.addEventListener(
      "keydown",
      (event) => {
        if (!this.hud.hidden && !this.get("opening").hidden) {
          const controls = ["opening-act", "opening-skip", "opening-subtitles", "hud-pause"].map((id) => this.get(id));
          if (!this.get("session-warning").hidden)
            controls.push(...this.get("session-warning").querySelectorAll<HTMLElement>("button"));
          if (event.key === "Tab") {
            event.preventDefault();
            event.stopPropagation();
            const current = controls.indexOf(document.activeElement as HTMLElement);
            const next = current < 0 ? event.shiftKey ? controls.length - 1 : 0
              : (current + (event.shiftKey ? controls.length - 1 : 1)) % controls.length;
            controls[next]?.focus();
            return;
          }
          // Space activates the focused opening control normally. On the canvas
          // it still reaches the existing runtime shortcut to skip the opening.
          if (event.code === "Space" && controls.includes(document.activeElement as HTMLElement)) {
            event.stopPropagation();
            return;
          }
        }
        if (event.key !== "Tab" || event.defaultPrevented) return;
        const modal = !this.get("game-panel").hidden
          ? this.get("game-panel")
          : !this.menu.hidden ? this.menu : null;
        if (!modal) return;
        const visible = [
          ...modal.querySelectorAll<HTMLElement>(
            'button:not([disabled]),select:not([disabled]),input:not([disabled]),textarea:not([disabled]),a[href],summary,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]',
          ),
        ].filter((element) => element.getClientRects().length > 0);
        const first = visible[0],
          last = visible.at(-1);
        const current = visible.indexOf(document.activeElement as HTMLElement);
        if (event.shiftKey && current <= 0 && last) {
          event.preventDefault();
          event.stopPropagation();
          last.focus();
        } else if (
          !event.shiftKey &&
          (current < 0 || document.activeElement === last) &&
          first
        ) {
          event.preventDefault();
          event.stopPropagation();
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
    this.get<HTMLInputElement>("opening-subtitles").checked = settings.subtitles;
    this.get("opening-caption").hidden = !this.subtitles;
  }

  settings(quality: Quality, sensitivity: number, invertY: boolean, mouseMode: "captured" | "drag" = "captured", keyTurnSpeed = 1): void {
    this.get<HTMLSelectElement>("quality").value = quality;
    this.get<HTMLInputElement>("sensitivity").value = String(sensitivity);
    this.get<HTMLInputElement>("invert").checked = invertY;
    this.get("sensitivity-value").textContent = sensitivity.toFixed(1);
    this.get<HTMLSelectElement>("mouse-mode").value = mouseMode;
    this.get<HTMLInputElement>("key-turn").value = String(keyTurnSpeed);
    this.get("key-turn-value").textContent = keyTurnSpeed.toFixed(1);
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

  update(state: GameState, cruise: boolean, forward = 0): void {
    this.latest = state;
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
    this.target(aimedInteraction(state, this.world));
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

  closePanel(): void {
    this.panelKind = null;
    this.get("game-panel").hidden = true;
  }
  openPanel(kind: PanelKind, state: GameState, targetId?: string): void {
    this.panelKind = kind;
    this.menu.hidden = true;
    this.hud.hidden = true;
    this.get("game-panel").hidden = false;
    this.root.dataset.screen = "panel";
    this.get("panel-feedback").hidden = true;
    this.refreshPanel(state);
    this.get("panel-return").focus({ preventScroll: true });
    if (targetId) this.focusPanelTarget(kind, state, targetId);
  }
  refreshPanel(state: GameState): void {
    this.latest = state;
    if (!this.panelKind) return;
    const content = this.get("panel-content");
    const restoreFocus = content.contains(document.activeElement);
    const restoreKey = restoreFocus ? (document.activeElement as HTMLElement | null)?.dataset.commandKey : undefined;
    this.commands.clear();
    this.get("carrier-nav").hidden = state.scenario !== "carrier-fixture";
    const button: CommandButton = (label, command, disabled = false) => {
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
      html += `<div class="preparation-grid">${this.powerPreparation(state, button)}${this.materialStorageControls(state, button)}</div>`;
      html += this.moduleFitting(state, button);
      html += `<p class="equipment-note"><b>Reusable buoy</b> · ${!buoyItem ? "Not built. Discover the intake record, then fabricate at the pod." : buoy.deployed ? `Deployed · ${usedCapacity(state, "buoy_hold")} / ${state.inventory.containers.find((c) => c.id === "buoy_hold")?.capacity ?? 0} CU · ${bearing(state.player.pose.position, buoy.position)}. Empty it, approach the collar and keep 2 CU free to pack it.` : `Packed in ${containerLabel(state, buoyItem.containerId).toLowerCase()} · 2 CU. Carry it in your diver hold before deploying.`}</p>`;
      const bins = state.inventory.containers.filter((c) => containerAccessible(state, c.id));
      const distant = state.inventory.containers.filter((c) => !containerAccessible(state, c.id) && c.kind !== "cache" && (c.kind !== "buoy" || buoy.deployed));
      if (distant.length)
        html += `<p class="equipment-note"><b>Out of reach</b> · ${distant.map((c) => `${escapeHtml(containerLabel(state, c.id))} (${usedCapacity(state, c.id)} / ${c.capacity} CU)`).join(" · ")}. Approach a locker, deployed buoy or craft to transfer. A workshop locker opens after its services are restored.</p>`;
      html += '<div class="container-grid">';
      for (const c of bins) {
        html += `<article class="container" id="container-${escapeHtml(c.id)}" tabindex="-1"><h3>${escapeHtml(containerLabel(state, c.id))} <small>${usedCapacity(state, c.id)} / ${c.capacity} CU</small></h3>`;
        for (const i of state.inventory.items.filter(
          (i) => i.containerId === c.id,
        )) {
          const installed = state.fleet.vehicles.find((v) => v.modules.includes(i.id));
          html += `<div class="item-row"><strong>${ITEMS[i.kind].label} × ${i.quantity}</strong><small>${installed ? `Installed in ${HULLS[installed.hull].label} · ${ITEMS[i.kind].cu * i.quantity} CU · remove at collar before transfer` : i.fitted ? "Fitted / retained" : `${ITEMS[i.kind].cu * i.quantity} CU`}${i.charge !== null ? ` · charge ${i.charge.toFixed(0)}%` : ""}${i.provenance === "maintenance" ? " · rescue stock" : ""}</small><div>`;
          if (!i.fitted && !installed)
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
        const occupied = recoveryOccupancyRefusal(state, v.id);
        const cells = state.inventory.items.filter((i) => i.kind === "reserve_cell" && (i.containerId === "diver" || i.containerId === v.cargoId));
        html += `<article class="vessel-service" id="vessel-${escapeHtml(v.id)}" tabindex="-1"><h3>${HULLS[v.hull].label} · ${v.disabled ? "disabled transponder" : "available"}</h3><p>${bearing(state.player.pose.position, v.pose.position)} · ${local ? "service socket in reach" : "approach the service socket"}. Power ${v.charge.toFixed(0)}% · hull ${v.health.toFixed(0)}% · hull ${HULLS[v.hull].initialDepth} m / suit ${personalLimit(state)} m.</p>`;
        if (v.disabled && v.hull === "dart") {
          const frame = Object.entries(v.investment).map(([k, q]) => `${q} ${ITEMS[k as ItemKind].label}`).join(" / ") || "No frame materials recorded";
          const cu = Object.entries(v.investment).reduce((n, [k, q]) => n + ITEMS[k as ItemKind].cu * q, 0);
          const destination = state.inventory.buoy.deployed && distance(state.inventory.buoy.position, state.player.pose.position) < 6 && hasRoom(state, "buoy_hold", cu)
            ? "Deployed buoy" : hasRoom(state, "diver", cu) ? "Diver hold" : null;
          const eligibleHolds = [
            (state.inventory.containers.find((c) => c.id === "diver")?.capacity ?? 0) >= cu ? "the diver hold" : null,
            (state.inventory.containers.find((c) => c.id === "buoy_hold")?.capacity ?? 0) >= cu ? "a deployed buoy within 6 m" : null,
          ].filter(Boolean).join(" or ");
          const patchAlloy = Math.min(14, state.world.maintenance.alloy + v.boundRepairs * 2) - state.world.maintenance.alloy;
          const patchMembrane = Math.min(7, state.world.maintenance.membrane + v.boundRepairs) - state.world.maintenance.membrane;
          html += `<p class="recovery-kit">${equipped(state, "bobbin_kit") ? "Bobbin kit retained" : "Requires Bobbin kit · fabricate at the pod"} · Rescue stock: ${state.world.maintenance.alloy} alloy / ${state.world.maintenance.membrane} membrane.</p><div class="recovery-choices" aria-label="Dart recovery choices">
            <section class="recovery-choice"><h4>Patch here</h4><p class="recovery-cost">2 alloy + 1 membrane · rescue stock</p><p>At the collar, within 7 m. Restores hull to 65%; keeps cargo and charge.</p>${button("Patch here", { type: "recover", vehicleId: v.id, method: "repair" })}</section>
            <section class="recovery-choice"><h4>Tow home</h4><p class="recovery-cost">No materials · to the shallow rescue bench</p><p>Empty hull; cargo stays aboard. Start at the staging bench or collar, within 7 m.</p><small>Upper-Canopy corridor only, within 230 m of staging. Blocked routes stop the tow. No repair or recharge.</small>${button(state.recovery.operation?.vehicleId === v.id && state.recovery.operation.phase === "ready" ? "Attach collar / confirm tow" : "Tow home · deploy Bobbin", { type: "recover", vehicleId: v.id, method: "tow" }, occupied !== null)}</section>
            <section class="recovery-choice"><h4>Salvage frame</h4><p class="recovery-cost">No materials · returns the frame’s ingredients</p><p>At the collar, within 7 m. Empty the hull, hold and module sockets first.</p><small>${escapeHtml(frame)} · ${cu} CU.<br />${destination ? `Return to ${destination}.` : eligibleHolds ? `Make ${cu} CU free in ${eligibleHolds}.` : `Requires a container large enough for the complete ${cu} CU return.`}${v.boundRepairs ? `<br />Past patches return ${patchAlloy} alloy / ${patchMembrane} membrane to rescue stock only (limits 14 / 7).` : ""}</small>${button("Salvage frame", { type: "recover", vehicleId: v.id, method: "salvage" }, occupied !== null)}</section>
          </div>${occupied ? `<p class="recipe-status">${escapeHtml(occupied)}</p>` : ""}`;
        }
        html += `<div class="service-actions">${button("Supported charge / repair", { type: "service", vehicleId: v.id })}${button("Use reserve cell for hull power", { type: "reserve", vehicleId: v.id })}</div><small>Approach within 7 m of the craft at pod waters or the restored workshop cradle.${v.disabled ? " Patch the hull before routine charging." : ""}</small><details class="service-details"><summary>Reserve power & hull service</summary><p>Cells in diver / this craft: ${cells.length ? cells.map((i) => `${escapeHtml(i.id)} · ${(i.charge ?? 0).toFixed(0)}%`).join(", ") : "none"}. A full cell supplies up to 35% hull power; a pulse spends 25 of that cell’s charge points. Reserve power requires the craft’s local socket.</p><p>Supported service restores hull battery, health and emergency air, plus cells in your hold or this craft. For cells in the local locker or buoy, use Recharge local cells at the bench.</p></details></article>`;
      }
      html += this.returnInformation(state);
    } else if (kind === "craft") {
      html = `<p class="panel-intro">${nearPod(state) ? "At the home pod bench" : nearWorkshop(state) ? "At the Splitspine workshop" : "Away from a fabrication bench"}. Each recipe counts only its local sources, including a craft hold at this site’s supported cradle. The unrestored workshop locker stays locked; restore it with carried materials or a nearby deployed buoy.</p>`;
      html += this.powerPreparation(state, button);
      html += this.moduleFitting(state, button);
      for (const [key, r] of Object.entries(RECIPES)) {
        const id = key as RecipeId;
        if (!state.knowledge.blueprints.includes(r.bp)) continue;
        const done = r.once && state.knowledge.crafted.includes(id);
        const refusal = done ? null : craftingRefusal(state, id, this.world);
        const bins = fabricationContainers(state, r.site).filter((c) => containerAccessible(state, c));
        const missingSteps = r.needs.filter((n) => !state.knowledge.crafted.includes(n as RecipeId));
        const trim = state.inventory.items.find((i) => i.kind === "dart_acoustic_trim");
        const trimInstalled = trim && state.fleet.vehicles.some((v) => v.modules.includes(trim.id));
        html += `<article class="recipe" data-recipe="${id}"><div><h3>${r.label}${done ? id === "dart_acoustic_trim" ? trimInstalled ? " · installed" : " · fabricated" : " · completed" : ""}</h3>${done ? '<small>Current recipe reference</small>' : ""}<p>${Object.entries(r.cost).map(([k, q]) => {
          const kind = k as ItemKind;
          if (done) return `<span class="ingredient">${ITEMS[kind].label}: ${q}</span>`;
          const have = r.maintenance
            ? kind === "structural_alloy" ? state.world.maintenance.alloy : kind === "silica_glass" ? state.world.maintenance.glass : state.world.maintenance.membrane
            : available(state, kind, bins);
          return `<span class="ingredient${have < q ? " missing" : ""}">${ITEMS[kind].label}: ${have} / ${q}${have < q ? ` · need ${q - have}` : " · ready"}</span>`;
        }).join("")}</p><small>${r.site === "island_workshop" ? PLACES.island_workshop.label : "Home pod bench"}${r.maintenance ? " · rescue stock only" : " · gathered materials"}</small>${!done && !r.maintenance ? `<p class="recipe-sources">Local sources: ${bins.length ? bins.map((c) => escapeHtml(containerLabel(state, c))).join(" · ") : "none at this recipe’s bench"}${bins.some((c) => state.fleet.vehicles.some((v) => v.cargoId === c)) ? " (includes supported-cradle cargo)" : ""}.</p>` : ""}${missingSteps.length ? `<p class="recipe-status">First complete: ${missingSteps.map((n) => RECIPES[n as RecipeId].label).join(" → ")}</p>` : ""}${refusal ? `<p class="recipe-status">${escapeHtml(refusal)}</p>` : !done ? '<p class="recipe-ready">Ready at this bench</p>' : ""}</div>${done ? "" : button(`Fabricate · ${r.label}`, { type: "craft", recipeId: id })}</article>`;
      }
      html += this.knownHabitats(state);
      if (!state.knowledge.blueprints.length)
        html += "<p>Inspect the pod regulator to recover its checklist.</p>";
      html += `<p>Rescue stock: ${state.world.maintenance.alloy} alloy / ${state.world.maintenance.glass} glass / ${state.world.maintenance.membrane} membrane. Reserved for Bobbin and field patches; unavailable for other recipes.</p>`;
      const n = aimedInteraction(state, this.world);
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
      html += `<article class="next-question"><h3>Current question</h3><p>${found("C04") ? "What changed in the water before the equipment failed? Compare the field sheet with the intake and workshop records. On returning, Canopy crust and resin can fund optional Dart acoustic trim at the workshop; fit it for a faster quiet approach. The Basin lead is for a later expedition." : found("C02") && found("C03") ? "Why were the intake and workshop left behind? The upper laboratory beside the Canopy’s tall rib may preserve another observation." : found("C03") ? "Why were departure supplies left unused? The reef intake is an independent lead; the laboratory lies beyond the eastern buoyant crowns." : found("C02") ? "Why is the intake abandoned while its filters still live? The workshop by Splitspine’s landing may preserve a different account." : "Why is the pod damaged? Compare its regulator with the intake below the reef ribs, or investigate the workshop above the island landing."}</p><small>Either early lead can be investigated first. Personal field notes add context; they do not unlock the investigation.</small></article>`;
      if (
        state.knowledge.evidence.some((e) => e.id === "C02") &&
        state.knowledge.evidence.some((e) => e.id === "C03")
      )
        html +=
          '<p class="interpretation">Together: the living intake and unspent shore supplies suggest disrupted services. The reason people left these sites is still unconfirmed, whichever record you found first.</p>';
      for (const found of state.knowledge.evidence) {
        const e = EVIDENCE[found.id];
        html += `<article class="finding" id="finding-${found.id}" tabindex="-1"><h3>${e.label}</h3><p class="provenance">Source · ${escapeHtml(found.provenance)}</p><p><b>Observed</b> · ${e.observation}</p><p><b>Hypothesis</b> · ${e.hypothesis}</p><p class="lead"><b>Regional lead</b> · ${e.lead}</p></article>`;
      }
      for (const id of state.knowledge.scans)
        html += `<article><h3>${id === "filter_flow" ? "Current-facing filters" : SOURCES[id as keyof typeof SOURCES]?.label}</h3><p>${id === "filter_flow" ? "Open fans face the current. Harvest loose membrane from downstream catch hollows." : (SOURCES[id as keyof typeof SOURCES]?.scan ?? "")}</p></article>`;
      if (state.knowledge.journals.includes(OPTIONAL_RECORD.id))
        html += `<article><h3>Personal record · optional</h3><p>${OPTIONAL_RECORD.text}</p></article>`;
      html += this.knownHabitats(state);
      html += `<article><h3>Before committing to a dive</h3><p>Current personal suit: ${personalLimit(state)} m. A Dart hull is rated to ${HULLS.dart.initialDepth} m, but it cannot protect you outside. Prepare a 150 m suit for the upper laboratory. Your full tank lasts 180 seconds submerged. Carry a meal and charged reserve cell; plan to return with at least a quarter of your air and power.</p><p>Z reduces movement noise. Quiet movement, the tall rib’s cover and retreat cost no cell charge. G releases a 12-second directional distraction for ${PULSE_CHARGE_COST} points from one carried cell, then a controlled-craft cell; it cannot use remote locker cells or repeat while active. Move quietly away from the pulse. The same charge can instead supply reserve hull power at the craft’s socket.</p><p>Recharge local cells at a restored pod or workshop bench, before or after owning a craft. Hull battery, health and emergency air need separate supported craft service. Warning calls also appear with direction in the HUD, with sound muted or opening captions off.</p>${found("C04") ? "<p>The Canopy return can improve your next trip: two crust + two resin fabricate optional Dart acoustic trim at the workshop. Fit it at the cradle for faster quiet travel in exchange for boost speed, one socket and 2 CU. Pale Basin remains a future expedition in this build.</p>" : ""}</article>`;
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

  private powerPreparation(state: GameState, button: CommandButton): string {
    const pulse = distractionPreview(state);
    const cell = pulse.refusal === null ? state.inventory.items.find((i) => i.id === pulse.cellId) : undefined;
    const recharge = cellRechargePreview(state);
    const site = localBenchSite(state);
    const charging = recharge.cellIds.map((id) => state.inventory.items.find((i) => i.id === id)!);
    return `<article class="power-preparation"><h3>Pulse or reserve power</h3><p><kbd>G</kbd> Directional pulse · ${PULSE_CHARGE_COST} charge points from one cell · 12 seconds.</p>${cell && pulse.refusal === null
      ? `<p class="recipe-ready">Next payment: ${escapeHtml(cell.id)} in ${escapeHtml(containerLabel(state, cell.containerId))} · ${cell.charge!.toFixed(0)} → ${pulse.remainingCharge.toFixed(0)}%.</p>`
      : `<p class="recipe-status">${escapeHtml(pulse.refusal ?? "")}${state.world.threat.distractionSeconds > 0 ? ` ${Math.ceil(state.world.threat.distractionSeconds)} seconds remain.` : ""}</p>`}
      ${button(`Release pulse · ${PULSE_CHARGE_COST} cell points`, { type: "distraction" }, pulse.refusal !== null)}<small class="no-charge-options">No charge needed: Z quiet · cover behind the tall rib · retreat. A full cell can instead supply up to 35% hull power at the craft’s local socket.</small>
      <div class="bench-charge"><h4>Bench cell recharge</h4><p>${site ? `${site === "home_pod" ? "Pod" : "Workshop"} bench · ${fabricationContainers(state, site).map((id) => escapeHtml(containerLabel(state, id))).join(" · ")}.` : "Use a restored pod or workshop bench; no vessel is required."}</p>${charging.length ? `<p>${charging.map((i) => `${escapeHtml(i.id)} · ${escapeHtml(containerLabel(state, i.containerId))} · ${(i.charge ?? 0).toFixed(0)} → 100%`).join("<br />")}</p>` : ""}${recharge.refusal ? `<p class="recipe-status">${escapeHtml(recharge.refusal)}</p>` : ""}${button("Recharge local cells", { type: "recharge-cells" }, recharge.refusal !== null)}<small>Cells only. Hull battery, health and emergency air require supported service beside the craft.</small></div></article>`;
  }

  private materialStorageControls(state: GameState, button: CommandButton): string {
    const bins = state.inventory.containers.filter((c) => c.kind !== "equipment" && containerAccessible(state, c.id));
    if (bins.length < 2) return '<article class="bulk-storage"><h3>Store materials</h3><p>Approach a local locker, deployed buoy or craft hold to choose a destination. Meals, cells, tools and modules stay put.</p></article>';
    this.storageFrom = bins.find((c) => c.id === this.storageFrom)?.id
      ?? bins.find((c) => materialStoragePreview(state, c.id, bins.find((d) => d.id !== c.id)!.id).items.length)?.id
      ?? bins[0]!.id;
    const destinations = bins.filter((c) => c.id !== this.storageFrom);
    this.storageTo = destinations.find((c) => c.id === this.storageTo)?.id
      ?? destinations.find((c) => c.kind === "locker")?.id ?? destinations[0]!.id;
    const preview = materialStoragePreview(state, this.storageFrom, this.storageTo);
    const options = (choices: typeof bins, selected: string): string => choices.map((c) => `<option value="${escapeHtml(c.id)}"${c.id === selected ? " selected" : ""}>${escapeHtml(containerLabel(state, c.id))} · ${usedCapacity(state, c.id)} / ${c.capacity} CU</option>`).join("");
    return `<article class="bulk-storage"><h3>Store materials</h3><div class="storage-operands"><label>From<select id="storage-from">${options(bins, this.storageFrom)}</select></label><span aria-hidden="true">→</span><label>To<select id="storage-to">${options(destinations, this.storageTo)}</select></label></div><p class="storage-quantities">${preview.items.length ? Object.entries(preview.quantities).map(([k, q]) => `${q} × ${ITEMS[k as ItemKind].label}`).join("<br />") : "No material stacks selected"}<br /><b>${preview.totalCu} CU · whole stacks</b></p><small>Meals, cells, tools and modules stay with their container. Individual transfers are below.</small>${preview.refusal ? `<p class="recipe-status">${escapeHtml(preview.refusal)}</p>` : '<p class="recipe-ready">The complete set fits.</p>'}${button(`Store materials · ${containerLabel(state, this.storageFrom)} → ${containerLabel(state, this.storageTo)}`, { type: "store-materials", from: this.storageFrom, to: this.storageTo })}</article>`;
  }

  private moduleFitting(state: GameState, button: CommandButton): string {
    if (!state.knowledge.blueprints.includes(RECIPES.dart_acoustic_trim.bp)) return "";
    const item = state.inventory.items.find((i) => i.kind === "dart_acoustic_trim");
    const spec = MODULES.dart_acoustic_trim;
    const cost = Object.entries(RECIPES.dart_acoustic_trim.cost).map(([k, q]) => `${q} ${ITEMS[k as ItemKind].label}`).join(" + ");
    let html = `<article class="module-fitting"><h3>Dart acoustic trim · ${item ? state.fleet.vehicles.some((v) => v.modules.includes(item.id)) ? "installed" : "fabricated / stored" : "not fabricated"}</h3><p>Quiet 3 → ${spec.quietSpeed} m/s · normal 8 → 8 · boost 11 → ${spec.boostSpeed} m/s.</p><small>Faster quiet travel. Noise, power use per second and pressure rating stay the same. Uses one socket and ${ITEMS.dart_acoustic_trim.cu} CU of the Dart hold.</small>${item ? `<p>Retained item ${escapeHtml(item.id)} · ${escapeHtml(containerLabel(state, item.containerId))}.</p>` : `<p>Fabricate at the workshop: ${escapeHtml(cost)}. Then fit it at a supported cradle.</p>`}`;
    for (const v of state.fleet.vehicles.filter((v) => v.hull === "dart")) {
      const perf = dartPerformance(state, v.id)!;
      const installed = item && v.modules.includes(item.id);
      html += `<section class="fitting-choice"><h4>${HULLS[v.hull].label} · ${perf.socketsUsed} / ${perf.sockets} sockets · ${usedCapacity(state, v.cargoId)} / ${state.inventory.containers.find((c) => c.id === v.cargoId)?.capacity ?? 0} CU hold</h4><p>Now: quiet ${perf.quietSpeed} · normal ${perf.normalSpeed} · boost ${perf.boostSpeed} m/s${perf.cargoCu ? ` · trim occupies ${perf.cargoCu} CU` : ""}.</p>`;
      if (item) {
        const refusal = installed ? removeModuleRefusal(state, v.id, item.id, this.world) : installModuleRefusal(state, v.id, item.id);
        html += `${installed ? `<small>Remove intact into this hold before transferring. ${v.disabled ? "Eligible local collar removal is available before frame salvage; bring the service tool and Bobbin kit." : "Use the pod or restored workshop cradle."}</small>` : ""}${refusal ? `<p class="recipe-status">${escapeHtml(refusal)}</p>` : '<p class="recipe-ready">Local fitting available.</p>'}${button(installed ? "Remove trim into Dart hold" : "Install acoustic trim", { type: installed ? "remove-module" : "install-module", vehicleId: v.id, itemId: item.id })}`;
      }
      html += "</section>";
    }
    return html + "</article>";
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
      html += `<p class="recipe-status"><b>Last recovery report</b><br />${escapeHtml(recoveryDisplay(state.feedback))}</p>`;
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

  target(t: AimedTarget | null): void {
    const html = t
      ? `${t.verb === "empty" ? "" : "<kbd>E</kbd> "}${escapeHtml(t.kind === "vehicle" && this.latest ? (() => {
          const v = this.latest!.fleet.vehicles.find(v => v.id === t.id);
          return v ? `${HULLS[v.hull].label}${v.disabled ? " · disabled" : ""}` : t.label;
        })() : t.label)} <small>${({ collect: "Collect", gather: "Gather", sort: t.kind === "source" && SOURCES[t.id as keyof typeof SOURCES].item === "meal" ? "Tend · 20 s" : "Sort · 20 s", inspect: "Inspect", review: "Notebook", read: "Read", board: "Board", recover: "Recover", open: "Open", use: "Use", empty: "Empty" })[t.verb]}${this.latest && equipped(this.latest, "essential_tools") && !t.known && (t.kind === "source" || t.kind === "evidence") ? " · Q scan" : ""}</small>` : "";
    if (this.get("interact-prompt").innerHTML !== html) this.get("interact-prompt").innerHTML = html;
  }

  lookAction(visible: boolean, fallback = false): void {
    this.get("look-action").hidden = !visible;
    this.get("look-action").textContent = fallback ? "Click to look · drag / arrows available" : "Click to look";
  }

  gesture(kind: "exit" | "skip" | null, progress: number, key = "E"): void {
    this.exitProgress = kind === "exit" ? progress : null;
    this.exitKey = kind === "exit" ? key : "E";
    this.get("opening-skip").innerHTML = `Skip · hold <kbd>Space</kbd>${kind === "skip" ? ` <progress aria-label="Skip hold" max="1" value="${progress}"></progress>` : ""}`;
    if (this.latest?.player.controlledVehicleId) {
      const indicator = kind === "exit" ? ` <progress aria-label="Exit hold" max="1" value="${progress}"></progress>` : "";
      // The regular HUD update supplies refusal/suit information; this small
      // progress element updates every step without rebuilding the full HUD.
      const guidance = this.get("pilot-guidance");
      const base = guidance.innerHTML.replace(/ <progress[^>]*><\/progress>/g, "");
      guidance.innerHTML = base.replace(/<kbd>[EX]<\/kbd>/, `<kbd>${this.exitKey}</kbd>`) + indicator;
    }
  }

  private focusPanelTarget(kind: PanelKind, state: GameState, targetId: string): void {
    let id: string | null = null;
    if (kind === "notebook" && state.knowledge.evidence.some(e => e.id === targetId)) id = `finding-${targetId}`;
    if (kind === "inventory") {
      const cache = state.recovery.caches.find(c => c.id === targetId);
      if (cache) id = `container-${cache.containerId}`;
      else if (state.fleet.vehicles.some(v => v.id === targetId)) id = `vessel-${targetId}`;
      else if (targetId === "rescue_staging") id = "panel-content";
    }
    if (kind === "craft") id = "panel-title";
    if (!id) return;
    const element = this.get(id);
    element.setAttribute("tabindex", "-1");
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: "nearest" });
    element.classList.add("interaction-focus");
    window.clearTimeout(this.highlightTimer);
    this.highlightTimer = window.setTimeout(() => element.classList.remove("interaction-focus"), 1400);
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
    window.clearTimeout(this.highlightTimer);
    window.clearTimeout(this.impactTimer);
    this.impactLoss = 0;
    this.impactAt = this.impactUntil = -Infinity;
    this.impactVehicle = null;
    this.get("impact-notice").hidden = true;
    for (const element of this.root.querySelectorAll<HTMLElement>(".interaction-focus, .hull-impact")) element.classList.remove("interaction-focus", "hull-impact");
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
    // Keep the last result in the blocking panel after the transient HUD toast fades.
    this.get("panel-feedback").textContent = message;
    this.get("panel-feedback").hidden = false;
    this.get("panel-feedback").classList.toggle("error", error);
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

  graphicsError(message: string): void {
    this.graphicsFailed = true;
    this.get("graphics-error").hidden = false;
    this.get("graphics-error-text").textContent = message;
    for (const id of ["new-game", "continue", "resume", "look-action"])
      this.get<HTMLButtonElement>(id).disabled = true;
  }

  dispose(): void {
    this.cancelFeedback();
    window.clearTimeout(this.toastTimer);
    this.abort.abort();
    this.root.replaceChildren();
  }
}
