import type { GameCommand, GameState, WorldQueries } from "../sim/types.js";
import type { AimedTarget } from "../sim/targeting.js";
import type { AudioSettings } from "../audio/sound.js";
import type { SaveSlot } from "../save/repository.js";
import type { Quality } from "../render/renderer.js";
import { PanelView, type PanelKind } from "./panels.js";
import { HudView } from "./hud.js";

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
  exportBackup(): void;
  exportRaw(): void;
  importFile(file: File): void;
  confirm(): void;
  cancelConfirm(): void;
  lockMouse(): void;
  settings(quality: Quality, sensitivity: number, invertY: boolean, mouseMode: "captured" | "drag", keyTurnSpeed: number): void;
}

export class GameView {
  private panelKind: PanelKind | null = null;
  private latest: GameState | null = null;
  private subtitles = true;
  readonly canvas: HTMLCanvasElement;
  private readonly abort = new AbortController();
  private readonly menu: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly panels: PanelView;
  private readonly hudPresentation: HudView;
  private wasPlaying = false;
  private canContinue = false;
  private graphicsFailed = false;
  get currentPanel(): PanelKind | null { return this.panelKind; }

  constructor(
    private readonly root: HTMLElement,
    actions: UiActions,
    world: WorldQueries,
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
      <section id="game-panel" class="game-panel" role="dialog" aria-modal="true" aria-labelledby="panel-title" hidden><div class="panel-frame"><div class="panel-header"><button id="panel-return" data-action="close-panel">Return <kbd>Esc</kbd></button><h2 id="panel-title"></h2><nav aria-label="Expedition panels"><button data-action="inventory-panel">Hold</button><button data-action="craft-panel">Fabricate</button><button data-action="notebook-panel">Notebook</button><button id="carrier-nav" data-action="carrier-panel" hidden>Carrier fixture</button></nav><span class="panel-paused">Paused</span></div><p id="panel-feedback" role="status" aria-live="polite" hidden></p><div id="panel-content"></div></div></section><section id="graphics-error" class="graphics-error" role="alert" hidden><h2>The ocean could not open</h2><p id="graphics-error-text"></p><p>Your existing local save has not been changed. Save exports remain available in the menu.</p></section>
      <aside id="session-warning" class="session-warning" aria-label="Local saving disabled" hidden><span>Autosave off · export before closing</span><button data-action="export">Export save</button></aside>
      <div id="notification" role="status" aria-live="polite" hidden></div>
      <input id="import-file" type="file" accept=".json,application/json" hidden />`;
    this.canvas = this.get<HTMLCanvasElement>("ocean");
    this.menu = this.get("menu");
    this.hud = this.get("hud");
    this.panels = new PanelView(root, world);
    this.hudPresentation = new HudView(root, world, (message, error) => this.panels.notify(message, error));
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
          const command = this.panels.command(target.dataset.action ?? "");
          if (command) actions.command(command);
          else map[target.dataset.action ?? ""]?.();
        }
      },
      options,
    );
    root.addEventListener("change", (event) => {
      const target = event.target as HTMLSelectElement;
      if (!this.latest || (target.id !== "storage-from" && target.id !== "storage-to")) return;
      this.panels.selectStorage(target.id, target.value);
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
    this.hudPresentation.update(state, cruise, forward);
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
    if (targetId) this.panels.focusTarget(kind, state, targetId);
  }
  refreshPanel(state: GameState): void {
    this.latest = state;
    if (this.panelKind) this.panels.refresh(this.panelKind, state);
  }

  target(t: AimedTarget | null): void {
    this.hudPresentation.target(t, this.latest);
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
  }

  notify(message: string, error = false): void {
    this.hudPresentation.notify(message, error);
  }

  graphicsError(message: string): void {
    this.graphicsFailed = true;
    this.get("graphics-error").hidden = false;
    this.get("graphics-error-text").textContent = message;
    for (const id of ["new-game", "continue", "resume", "look-action"])
      this.get<HTMLButtonElement>(id).disabled = true;
  }

  dispose(): void {
    this.panels.cancelFeedback();
    this.hudPresentation.dispose();
    this.abort.abort();
    this.root.replaceChildren();
  }
}
