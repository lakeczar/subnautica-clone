import type { GameCommand, GameState, NoticeOptions, Vec3, WorldQueries } from "../sim/types.js";
import type { AimedTarget, ReachPreview } from "../sim/targeting.js";
import type { AudioSettings } from "../audio/director.js";
import type { Caption } from "../audio/captions.js";
import type { SaveSlot } from "../save/repository.js";
import type { Quality } from "../render/renderer.js";
import { PanelView, type PanelKind } from "./panels.js";
import { currentObjective } from "../sim/objective.js";
const OBJECTIVE_KEY = "siltwake.hud.objective.v1";
import type { JournalTabId } from "../sim/systems/journal.js";
import { hazardBanners, HudView, type HudAim } from "./hud.js";
import { developerMode } from "./developer.js";
import { HelmReadout } from "./helmHud.js";
import type { ThreatDamage } from "./notices.js";

export type { PanelKind } from "./panels.js";

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
  /** The local play timeline, as a file (C4). */
  exportTimeline(): void;
  exportBackup(): void;
  exportRaw(): void;
  /** Replace an unreadable local play-timeline store (SIM-1b), after exporting it. */
  repairTimeline(): void;
  importFile(file: File): void;
  confirm(): void;
  cancelConfirm(): void;
  lockMouse(): void;
  settings(quality: Quality, sensitivity: number, invertY: boolean, mouseMode: "captured" | "drag", keyTurnSpeed: number): void;
}

/** How long one sound caption stays in the alert column. */
const CAPTION_MS = 3000;
/** Warning captions and the hazard banner that already names the same cause:
 * one visible line per cause. */
const CAPTION_BANNER: Partial<Record<string, string>> = {
  "alert.oxygen": "oxygen", "alert.food": "food", "alert.threat-call": "threat",
  "alert.pressure": "pressure", "alert.power": "power", "alert.hull-stress": "hullDepth", "hull.failure": "hull",
};
export class GameView {
  private panelKind: PanelKind | null = null;
  private latest: GameState | null = null;
  private subtitles = true;
  private captionTimer: ReturnType<typeof setTimeout> | undefined;
  readonly canvas: HTMLCanvasElement;
  private readonly abort = new AbortController();
  private readonly menu: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly panels: PanelView;
  private readonly hudPresentation: HudView;
  private readonly helmReadout: HelmReadout;
  private wasPlaying = false;
  private canContinue = false;
  private graphicsFailed = false;
  get currentPanel(): PanelKind | null { return this.panelKind; }

  constructor(
    private readonly root: HTMLElement,
    actions: UiActions,
    world: WorldQueries,
  ) {
    // Diagnostic scenarios stay out of the player's front door unless ?dev is set.
    const developer = developerMode();
    root.innerHTML = `
      <canvas id="ocean" tabindex="0" aria-label="Siltwake 3D reef. WASD to move, mouse or arrow keys to look. Escape opens the menu."></canvas>
      <div class="vignette" aria-hidden="true"></div>
      <div class="experience-layout">
      <main id="hud" hidden aria-label="Exploration display">
        <div id="threat-edge" class="threat-edge" aria-hidden="true" hidden></div>
        <div class="hud-top"><div id="hud-region" class="region"><strong id="region-name">Hearth Reef</strong><p id="hud-objective" class="hud-objective" hidden></p></div>
        <div id="hud-heading" class="heading"><span id="compass">N</span><small id="bearing">000°</small></div>
        <div class="hud-actions"><div id="hud-tools"><button data-action="inventory">Cargo <kbd>Tab</kbd></button><button data-action="notebook">Notebook <kbd>J</kbd></button><button data-action="craft">Fabricate <kbd>K</kbd></button><button data-action="save" title="Save locally (F5)">Save <kbd>F5</kbd></button></div><button id="hud-pause" data-action="pause">Menu <kbd>Esc</kbd></button></div></div>
        <div id="call-cue" class="call-cue" hidden><span id="call-dial" class="call-dial" aria-hidden="true"></span><span id="call-elevation" aria-hidden="true"></span><span id="call-direction" role="status" aria-live="polite" aria-atomic="true"></span></div><div class="hud-instruments"><div id="vitals" class="vitals"></div><div id="pitch-cue" class="pitch-cue" aria-label="Pitch" hidden></div></div><span id="hazard-announce" class="hud-sr" role="status" aria-live="polite" aria-atomic="true"></span><span id="damage-announce" class="hud-sr" role="alert" aria-live="assertive" aria-atomic="true"></span><span id="action-announce" class="hud-sr" role="status" aria-live="polite" aria-atomic="true"></span><div class="motion-guidance"><span id="surface-cue" class="surface-cue" hidden>Surface</span><div id="impact-notice" class="impact-notice" role="status" aria-live="polite" hidden></div><span id="blocked-ascent" class="blocked-ascent" role="status" aria-live="polite" hidden>Blocked above</span><div id="pilot-guidance" class="pilot-guidance" aria-label="Pilot exit guidance" hidden></div><div id="helm-readout" class="helm-readout" role="status" aria-label="Hearthline helm" hidden></div></div>
        <section id="opening" class="opening" aria-label="Damaged pod opening" hidden><div aria-live="polite" aria-atomic="true"><span id="opening-progress" class="eyebrow">POD CHECK 1 / 4</span><h2 id="opening-title"></h2><p id="opening-caption"></p></div><div class="opening-actions"><button id="opening-act" data-action="opening">Act <kbd>E</kbd></button><button id="opening-skip" data-action="skip">Skip · hold <kbd>Space</kbd></button><label class="check"><input id="opening-subtitles" type="checkbox" checked /> Captions</label></div><small id="opening-detail"></small></section><div id="crosshair" class="crosshair" aria-hidden="true"></div><div class="encounter-stack"><div id="alert-stack" class="alert-stack"><div id="hazard" class="hazard" aria-live="off"></div><p id="audio-caption" class="audio-caption" role="status" aria-live="polite" hidden></p></div><div id="interaction-stack" class="interaction-stack"><div id="interact-prompt" class="interact-prompt"></div><div id="action-result" class="action-result" hidden></div><button id="look-action" class="look-action" data-action="lock" hidden>Click to look</button></div></div>
        <div id="hud-bottom" class="hud-bottom"><div class="telemetry"><span class="depth"><b id="depth">0.0</b><small>m / DEPTH</small></span><span class="mode"><strong id="movement">On foot</strong><small id="refuge-distance">Home pod · 0 m</small></span></div>
        <div class="explore-note"><span id="cruise" hidden>FORWARD CRUISE · R TO STOP</span><p id="context-hint">Walk down the amber-edged ramp to the water.</p><small id="pulse-summary"></small><small id="control-hint"></small></div></div>
      </main>
      <div id="menu" class="menu-screen" role="dialog" aria-modal="true" aria-labelledby="menu-title">
        <div class="menu-frame">
          <div class="wordmark"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 28C11 9 18 6 20 6s9 3 15 22M7 28c8-6 18-6 26 0M12 35c5-3 11-3 16 0"/></svg><span>FIELD BUILD / M2</span></div>
          <h1 id="menu-title">SILTWAKE</h1>
          <p id="pause-reason" class="pause-reason" hidden></p>
          <section id="main-menu">
            <div class="menu-buttons"><button id="resume" class="primary" data-action="resume" hidden>Return to the water <span>↗</span></button>
            <button id="continue" class="primary" data-action="continue" disabled>Continue <span>↗</span></button>
            <button id="new-game" data-action="new">New expedition <span>+</span></button></div>
            <div class="menu-tools"><button id="manual-save" data-action="save" hidden>Save locally</button><button id="export-game" data-action="export" hidden>Export save</button><button data-action="import">Import save</button><button data-action="timeline" title="Your local play timeline, for playtest feedback">Export play timeline</button><button id="open-settings" data-action="settings">Settings</button></div>
            <p id="save-status" class="save-status"></p>
            ${developer ? '<div class="menu-tools developer-tools"><button data-action="fixture">Dev · carrier fixture</button></div>' : ""}
          </section>
          <section id="settings-menu" class="settings-menu" aria-labelledby="settings-title" hidden>
            <div class="settings-head"><h2 id="settings-title">Settings</h2><button id="settings-back" data-action="settings-back">Back <kbd>Esc</kbd></button></div>
            <div class="settings-columns">
              <dl class="controls" aria-label="Controls"><div><dt>W A S D</dt><dd>Move / swim</dd></div><div><dt>Mouse / ↑ ↓ ← →</dt><dd>Look</dd></div><div><dt>Space / C</dt><dd>Rise or jump / dive</dd></div><div><dt>Shift</dt><dd>Faster</dd></div><div><dt>R</dt><dd>Forward cruise</dd></div><div><dt>E / Q</dt><dd>Interact / scan</dd></div><div><dt>B / F / G</dt><dd>Buoy / meal / pulse</dd></div><div><dt>L / T / Y</dt><dd>Lamp / glow lure / startle ink</dd></div><div><dt>Tab or I / K / J / H</dt><dd>Cargo / fabricate / notebook / hint</dd></div><div><dt>W / S · A / D</dt><dd>Pilot thrust · slide</dd></div><div><dt>X</dt><dd>Exit craft (hold while moving)</dd></div><div><dt>Z</dt><dd>Quiet movement</dd></div><div><dt>Hearthline helm</dt><dd>A / D turn · W / S ahead or astern · mouse looks around · X hold station and leave</dd></div><div><dt>V</dt><dd>Hearthline berths and lock (aboard or at its hatch)</dd></div><div><dt>Esc / F5</dt><dd>Pause / save</dd></div></dl>
              <div class="settings-fields">
                <div class="settings"><label>Rendering <select id="quality"><option value="rich">Rich · full viewport</option><option value="light">Light · lower resolution</option></select></label>
                <label>Sensitivity <output id="sensitivity-value">1.0</output><input id="sensitivity" type="range" min="0.4" max="2.5" step="0.1" value="1" /></label><label>Mouse look<select id="mouse-mode"><option value="captured">Captured</option><option value="drag">Drag</option></select></label><label>Key turn speed <output id="key-turn-value">1.0</output><input id="key-turn" type="range" min="0.5" max="2" step="0.1" value="1" /></label><label class="check"><input id="invert" type="checkbox" /> Invert mouse look</label></div>
                <div class="settings"><label>Volume <output id="volume-value">55%</output><input id="volume" type="range" min="0" max="1" step="0.05" value="0.55" /></label><label class="check"><input id="muted" type="checkbox" /> Mute</label><label class="check"><input id="subtitles" type="checkbox" checked /> Opening captions</label><label class="check"><input id="hud-objective-toggle" type="checkbox" checked /> Objective on the HUD</label></div>
                <div class="settings save-safety"><span>Autosave every 30 s of play · previous valid save kept</span><div class="menu-tools"><button id="export-backup" data-action="backup" hidden>Export previous save</button><button id="export-raw" data-action="raw" hidden>Export local record</button><button id="repair-timeline" data-action="repair-timeline" hidden>Repair play timeline</button></div></div>
              </div>
            </div>
          </section>
          <section id="confirmation" class="confirmation" hidden><h2 id="confirm-title"></h2><p id="confirm-detail"></p><div class="menu-buttons"><button id="confirm-accept" class="primary" data-action="confirm">Confirm</button><button data-action="cancel">Go back</button></div></section>
          <p id="save-operation" class="save-status" role="status" hidden>Reading a file or waiting to save safely… <button data-action="cancel">Cancel operation</button></p>
        </div>
        <div class="scene-caption" aria-hidden="true" hidden><span>01 / HEARTH REEF</span><p>Follow the light.<br/>Learn the shore.</p><i></i><small>A QUIET PLACE TO BEGIN</small></div>
      </div>
      <section id="game-panel" class="game-panel" role="dialog" aria-modal="true" aria-labelledby="panel-title" hidden><div class="panel-frame"><div class="panel-chrome"><div class="panel-header"><button id="panel-return" data-action="close-panel">Return <kbd>Esc</kbd></button><h2 id="panel-title"></h2><nav aria-label="Expedition panels"><button data-action="inventory-panel">Cargo</button><button data-action="craft-panel">Fabricate</button><button data-action="notebook-panel">Journal</button><button data-action="systems-panel">Base</button><button data-action="fit-panel">Fit</button><button id="carrier-nav" data-action="carrier-panel" hidden>Hearthline</button></nav><span class="panel-paused">Paused</span></div><p id="panel-feedback" role="status" aria-live="polite" hidden></p></div><div id="panel-content"></div></div></section>
      <div class="session-notices"><section id="graphics-error" class="graphics-error" role="alert" hidden><h2>The ocean could not open</h2><p id="graphics-error-text"></p><p>Your existing local save has not been changed. Save exports remain available in the menu.</p></section>
      <aside id="session-warning" class="session-warning" aria-label="Local saving disabled" hidden><span>Autosave off · export before closing</span><button data-action="export">Export save</button></aside>
      <div id="system-status" role="status" aria-live="polite" hidden></div><div id="notification" role="status" aria-live="polite" hidden></div></div>
      </div>
      <input id="import-file" type="file" accept=".json,application/json" hidden />
      <form id="note-entry" class="note-entry" hidden><label for="note-text">Feedback note · saved to your play timeline with the time and place</label><input id="note-text" maxlength="500" autocomplete="off" /><small>Enter saves · Esc cancels</small></form>`;
    this.canvas = this.get<HTMLCanvasElement>("ocean");
    this.menu = this.get("menu");
    this.hud = this.get("hud");
    this.panels = new PanelView(root, world);
    this.hudPresentation = new HudView(root, world);
    this.helmReadout = new HelmReadout(this.get("helm-readout"), world);
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
        (["inventory", "craft", "notebook", "carrier", "systems", "fit"] as const).map((k) => [
          `${k}-panel`,
          () => {
            if (this.latest) {
              if (this.panelKind !== k) this.panels.clearNotice();
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
      timeline: actions.exportTimeline,
      backup: actions.exportBackup,
      raw: actions.exportRaw,
      "repair-timeline": actions.repairTimeline,
      confirm: actions.confirm,
      cancel: actions.cancelConfirm,
      lock: actions.lockMouse,
      settings: () => this.settingsView(true),
      "settings-back": () => this.settingsView(false, true),
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
          const command = this.panels.command(target.dataset.action ?? "");
          if (command) actions.command(command);
          else if (this.panels.selectJournalTab(target.dataset.action ?? "")) { if (this.latest) this.refreshPanel(this.latest); }
          else map[target.dataset.action ?? ""]?.();
        }
      },
      options,
    );
    root.addEventListener("change", (event) => {
      const target = event.target as HTMLSelectElement;
      if (!this.latest) return;
      // UI-01: the Cargo kind filter is panel-local, like the storage operands.
      if (target.id === "cargo-filter") {
        if (this.panels.selectCargoFilter(target.value)) { this.refreshPanel(this.latest); this.get(target.id).focus({ preventScroll: true }); }
        return;
      }
      if (target.id !== "storage-from" && target.id !== "storage-to") return;
      this.panels.selectStorage(target.id, target.value);
      this.refreshPanel(this.latest);
      this.get(target.id).focus({ preventScroll: true });
    }, options);
    this.get("import-file").addEventListener(
      "change",
      () => {
        const input = this.get<HTMLInputElement>("import-file"), file = input.files?.[0];
        // Reset at once, so choosing the same file again fires a change (M2 audit).
        input.value = "";
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
    const objectiveToggle = this.get<HTMLInputElement>("hud-objective-toggle");
    objectiveToggle.checked = this.showObjective;
    objectiveToggle.addEventListener("change", () => {
      this.showObjective = objectiveToggle.checked;
      try { localStorage.setItem(OBJECTIVE_KEY, this.showObjective ? "on" : "off"); } catch {}
    }, options);
    this.get("opening-subtitles").addEventListener("change", () => actions.audio({
      volume: this.get<HTMLInputElement>("volume").valueAsNumber,
      muted: this.get<HTMLInputElement>("muted").checked,
      subtitles: this.get<HTMLInputElement>("opening-subtitles").checked,
    }), options);
    this.root.addEventListener(
      "keydown",
      (event) => {
        // Esc steps back from settings before the runtime treats it as pause/resume.
        if (event.key === "Escape" && !this.menu.hidden && !this.get("settings-menu").hidden) {
          event.preventDefault();
          event.stopPropagation();
          this.settingsView(false, true);
          return;
        }
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
        ].filter((element) => element.checkVisibility());
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
    // Only a usable Continue leads; with no save, New expedition is the primary action (M2 audit #9).
    button.classList.toggle("primary", this.canContinue);
    this.get("new-game").classList.toggle("primary", !this.canContinue && !hasSession);
    button.textContent =
      slot.kind === "recovered" ? "Open previous valid save ↗" : "Continue ↗";
    this.get("save-status").textContent = slot.message;
    this.get("export-backup").hidden = slot.backup === null;
    this.get("export-raw").hidden =
      slot.kind === "empty" || slot.kind === "unavailable";
    this.get("export-game").hidden = !hasSession && slot.save === null;
  }

  /** Shows Repair play timeline while the local play-timeline store is protected. */
  timelineRepair(visible: boolean): void { this.get("repair-timeline").hidden = !visible; }

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
    this.hudPresentation.menu(true);
    this.get("game-panel").hidden = true;
    this.menu.hidden = false;
    this.hud.hidden = true;
    this.root.dataset.screen = "menu";
    this.get("resume").hidden = !hasSession;
    this.get("manual-save").hidden = !hasSession;
    this.get("pause-reason").hidden = reason.length === 0;
    this.get("pause-reason").textContent = reason;
    this.settingsView(false);
    if (this.wasPlaying)
      this.get(hasSession ? "resume" : "new-game").focus({
        preventScroll: true,
      });
    this.wasPlaying = false;
  }

  showGame(): void {
    this.hudPresentation.menu(false);
    this.menu.hidden = true;
    this.hud.hidden = false;
    this.root.dataset.screen = "playing";
    this.wasPlaying = true;
    this.get("opening").hidden = !this.latest || this.latest.opening.phase === 4;
    this.canvas.focus({ preventScroll: true });
  }

  /** Settings replace the main menu in place, so neither view needs to scroll. */
  private settingsView(open: boolean, restoreFocus = false): void {
    const settings = this.get("settings-menu");
    if (!open && settings.hidden) return;
    settings.hidden = !open;
    this.get("main-menu").hidden = open;
    if (open || restoreFocus) this.get(open ? "settings-back" : "open-settings").focus({ preventScroll: true });
  }

  confirmation(title: string, detail: string, accept: string): void {
    this.get("settings-menu").hidden = true;
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

  update(state: GameState, cruise: boolean, forward = 0, aim?: HudAim): void {
    this.latest = state;
    this.panels.observeStorageContext(state);
    this.hudPresentation.update(state, cruise, forward, aim);
    this.helmReadout.update(state);
    // The current objective, one line under the region name (M2 audit #5).
    const objective = this.get("hud-objective");
    const line = state.opening.phase >= 4 && this.showObjective ? currentObjective(state).step : "";
    if (objective.textContent !== line) objective.textContent = line;
    objective.hidden = !line;
  }
  /** HUD objective line: on by default, a setting kept on this device; the journal always shows it. */
  showObjective = (() => { try { return localStorage.getItem(OBJECTIVE_KEY) !== "off"; } catch { return true; } })();
  showJournalTab(id: JournalTabId): void { this.panels.showJournalTab(id); }
  /** A one-line feedback note: Enter saves, Esc or blur cancels. */
  noteEntry(done: (text: string | null) => void): void {
    const form = this.get<HTMLFormElement>("note-entry"), input = this.get<HTMLInputElement>("note-text");
    form.hidden = false; input.value = ""; input.focus();
    const finish = (text: string | null): void => {
      form.hidden = true; form.onsubmit = null; input.onkeydown = null; input.onblur = null;
      done(text?.trim() ? text.trim() : null);
    };
    form.onsubmit = (e) => { e.preventDefault(); finish(input.value); };
    input.onkeydown = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(null); } };
    input.onblur = () => { if (!form.hidden) finish(null); };
  }

  closePanel(): void {
    this.panels.clearNotice();
    this.panelKind = null;
    this.get("game-panel").hidden = true;
  }
  openPanel(kind: PanelKind, state: GameState, targetId?: string): void {
    this.hudPresentation.cancelFeedback();
    this.hudPresentation.menu(false);
    this.panels.clearNotice();
    this.hudPresentation.clearActionNotice();
    this.hudPresentation.blockedAscent(false);
    this.panelKind = kind;
    this.menu.hidden = true;
    this.hud.hidden = true;
    this.get("game-panel").hidden = false;
    this.root.dataset.screen = "panel";
    this.get("panel-feedback").hidden = true;
    this.refreshPanel(state);
    this.get("panel-return").focus({ preventScroll: true });
    if (targetId) this.panels.focusTarget(kind, state, targetId);
  }
  refreshPanel(state: GameState): void {
    this.latest = state;
    if (this.panelKind) this.panels.refresh(this.panelKind, state);
  }

  target(t: AimedTarget | null, preview: ReachPreview | null = null): void {
    this.hudPresentation.target(t, this.latest, preview);
  }

  lookAction(visible: boolean, fallback = false): void {
    this.hudPresentation.lookAction(visible, fallback);
  }

  gesture(kind: "exit" | "skip" | null, progress: number, key = "E"): void {
    this.hudPresentation.gesture(kind, progress, key, this.latest);
  }

  impact(loss: number, state: GameState | null): void {
    this.hudPresentation.impact(loss, state);
  }

  cancelFeedback(): void {
    this.panels.cancelFeedback();
    this.hudPresentation.cancelFeedback();
  }

  resetPresentation(): void {
    this.panels.resetSession();
    this.hudPresentation.resetPresentation();
    this.hideCaption();
  }

  /** S6 sound captions in the alert column. Essential warnings show even with
   * captions off; a caption whose cause already has a hazard banner on screen
   * is not repeated. */
  audioCaption(caption: Caption, state: GameState | null = this.latest): void {
    if (!caption.essential && !this.subtitles) return;
    const banner = CAPTION_BANNER[caption.cue];
    if (banner && state && hazardBanners(state).some((b) => b.context === banner || b.covers?.includes(banner))) return;
    const element = this.get("audio-caption");
    element.textContent = caption.text;
    element.hidden = false;
    clearTimeout(this.captionTimer);
    this.captionTimer = setTimeout(() => this.hideCaption(), CAPTION_MS);
  }
  private hideCaption(): void {
    clearTimeout(this.captionTimer);
    const element = this.root.querySelector<HTMLElement>("#audio-caption");
    if (element) { element.hidden = true; element.textContent = ""; }
  }

  presentationStep(state: GameState): void { this.hudPresentation.presentationStep(state); }

  threatDamage(event: ThreatDamage, state: GameState, suppressAnnouncement = false): boolean {
    return this.hudPresentation.threatDamage(event, state, suppressAnnouncement);
  }

  threatCall(origin: Vec3, state: GameState): void { this.hudPresentation.threatCall(origin, state); }

  blockedAscent(visible: boolean): void { this.hudPresentation.blockedAscent(visible); }

  blockedThrust(visible: boolean, state: GameState | null = this.latest): void { this.hudPresentation.blockedThrust(visible, state); }

  notify(message: string, error = false, options: NoticeOptions = {}, state: GameState | null = this.latest): void {
    if (this.panelKind && (options.channel ?? "action") === "action") {
      this.hudPresentation.clearActionNotice();
      this.panels.notify(message, error);
    } else this.hudPresentation.notify(message, error, options, state);
  }

  graphicsError(message: string): void {
    this.graphicsFailed = true;
    this.get("graphics-error").hidden = false;
    this.get("graphics-error-text").textContent = message;
    for (const id of ["new-game", "continue", "resume", "look-action"])
      this.get<HTMLButtonElement>(id).disabled = true;
  }

  dispose(): void {
    clearTimeout(this.captionTimer);
    this.panels.cancelFeedback();
    this.hudPresentation.dispose();
    this.abort.abort();
    this.root.replaceChildren();
  }
}
