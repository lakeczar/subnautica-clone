import { armTarget, fittedCabin } from "../sim/fleet.js";
import { craftActions } from "../sim/signatures.js";
import { SiltwakeAudio } from "../audio/director.js";
import { relocateForCave } from "../sim/step.js";
import { gameWorld, setKitCaveRecords } from "../sim/world.js";
import { actorBox } from "../sim/ribCollision.js";
import { HULL_COLLIDERS } from "../content/registry.js";
import { gameCaveStore } from "../render/caves/caveStore.js";
import { createCaveRuntime, type CaveHold } from "../world/caves/admission.js";
import { StepFault, StepGuard } from "../sim/stepGuard.js";
import { PHASE, StepCosts, stepMeter } from "../sim/stepCosts.js";
import type { StepCostSnapshot } from "../sim/stepCosts.js";
import { simCaches } from "../sim/caches.js";
import type { CacheStats } from "../sim/caches.js";
import { warmSimulation } from "../sim/warmup.js";
import { FixedStepClock, FIXED_SECONDS } from "../sim/clock.js";
import { aimedInteraction, reachPreview } from "../sim/targeting.js";
import type { GameCommand, GameEvent, GameState } from "../sim/types.js";
import { encodeSave } from "../save/codec.js";
import { SaveRepository, warmCommit } from "../save/repository.js";
import type { StoragePort } from "../save/repository.js";
import { browserWriterLock } from "./browserLock.js";
import { ExpeditionSession } from "./session.js";
import { createRenderer } from "../render/renderer.js";
import type { GameRenderer, Quality } from "../render/renderer.js";
import { PlayerInput, controlHasFocus, textEntryHasFocus, deliberateExit } from "./input.js";
import { HelmControl } from "./helm.js";
import { forgetCorridorView } from "../sim/carrierStations.js";
import { GameView } from "../ui/view.js";
import type { PanelKind } from "../ui/view.js";
import { exportTimelineText, observe, recordSystemsEvents } from "../sim/timeline/recorder.js";
import type { TimelineRecorder } from "../sim/timeline/recorder.js";
import { LiveTimeline, type Tone } from "./liveTimeline.js";
import { controlsActive } from "../sim/timeline/activity.js";
import { regionAtPoint, regionAtPosition } from "../content/regions/layout.js";
import { CONTENT_VERSION } from "../content/registry.js";

interface Settings {
  quality: Quality;
  sensitivity: number;
  invertY: boolean;
  mouseMode: "captured" | "drag";
  keyTurnSpeed: number;
}
const DEFAULT_SETTINGS: Settings = {
  quality: "rich",
  sensitivity: 1,
  invertY: false,
  mouseMode: "captured",
  keyTurnSpeed: 1,
};
const SETTINGS_KEY = "siltwake.settings.v1";
const BLOCKED_ASCENT_SECONDS = 0.45;
/** The swimming diver's box (step.ts), for cave admission. */
const DIVER_SHAPE = { radius: 0.34, height: 0.95 };
const ASCENT_EPSILON = 1e-5;
/** Lets a pause or menu draw before idle region preparation may block a frame. */
const IDLE_PREPARE_MS = 250;
/** The menu's pause reason while an entered expedition waits for its caves (CW-1 R1). */
const ENTRY_LOADING = "Loading the caves near your expedition…";
/** Longest the entry waits for the light of a cave the view stands in, ms. */
const ENTRY_LIGHT_WAIT_MS = 8000;
/** Entry's cave light never landed, even at the safe pose (CW-1 R3-3): entry stays behind the cover. */
const ENTRY_LIGHT_FAILED = "This cave's light could not be loaded, even at a safe pose. Load another save or try again.";
/** The notice when entry or a settle moves the expedition out of an unlit cave. */
const UNLIT_MOVED = "The cave's light could not be loaded in time: you were moved to safe water.";
/** Vite's development build (false in production and in Node tests). */
const DEV = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV === true;
const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : "An unknown error occurred.";

function storagePort(): StoragePort | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
function readSettings(): Settings {
  try {
    const text = localStorage.getItem(SETTINGS_KEY);
    if (!text) return { ...DEFAULT_SETTINGS };
    const data: unknown = JSON.parse(text);
    if (typeof data !== "object" || data === null)
      return { ...DEFAULT_SETTINGS };
    const value = data as Partial<Settings>;
    return {
      quality: value.quality === "light" ? "light" : "rich",
      sensitivity:
        typeof value.sensitivity === "number" &&
        Number.isFinite(value.sensitivity)
          ? Math.max(0.4, Math.min(2.5, value.sensitivity))
          : 1,
      invertY: value.invertY === true,
      mouseMode: value.mouseMode === "drag" ? "drag" : "captured",
      keyTurnSpeed: typeof value.keyTurnSpeed === "number" && Number.isFinite(value.keyTurnSpeed)
        ? Math.max(0.5, Math.min(2, value.keyTurnSpeed)) : 1,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** The single lifecycle owner. Simulation never touches the DOM, storage or Babylon. */
export class SiltwakeApp {
  // Ambience follows the semantic region map (regionAtPoint); outside it, the last region holds.
  private readonly sound = new SiltwakeAudio({
    regionAt: regionAtPosition,
    onCaption: (caption) => this.view.audioCaption(caption, this.state),
  });
  private resolutionPhase: string | null = null;
  private panelOpen = false;
  private readonly abort = new AbortController();
  private readonly clock = new FixedStepClock();
  /** The composed physical world: `worldFloor` (B1's heightfield inside the
   * preserve, S2's authored floor outside), every solid (B1's, S2's
   * STRUCTURE_SOLIDS and A1's VISTA_SOLIDS) in the indexed broad phase, and
   * the W1 caves owning their footprints. */
  private readonly world = gameWorld();
  /** CW-1 cave admission: kit-cave collision built before the actor reaches
   * it (held only if its records have not arrived), cave biomes through LC's
   * contract, and the guaranteed refuge. Never expected in ordinary play. */
  private readonly caveStore = gameCaveStore();
  private recordsSet = false;
  private caveHolding = false;
  /** CW-1 R1: an entered expedition waits here, behind the menu's loading
   * presentation, until its caves are admitted (or its rescue or refuge is
   * applied); only then is it shown or resumed. */
  /** CW-1 R3-3: readiness counts only from a present of the entered pose (`presents`
   * at entry); `fallback` once moved to a safe pose; `failed` when even that stays unlit. */
  private entryPending: { readonly generation: number; readonly since: number; readonly presents: number; readonly fallback: boolean; readonly failed: boolean } | null = null;
  /** A settle's unlit-cave fallback already applied for the current settle. */
  private settleFallback = false;
  /** The last frame's timestamp: admission's timers run on the frame clock. */
  private frameAt = 0;
  private readonly caves = createCaveRuntime({
    world: this.world,
    canGenerate: () => !this.caveStore || (this.caveStore.settled && !this.caveStore.collision),
    clear: (feet) => {
      const s = this.state, v = s?.fleet.vehicles.find(x => x.id === s.player.controlledVehicleId);
      return this.world.clearance(feet, v ? HULL_COLLIDERS[v.hull] : DIVER_SHAPE);
    },
  });
  /** One cross-tab writer lock port: the save slot and the play timeline each use their own lock name. */
  private readonly writerLock = browserWriterLock(navigator.locks);
  private readonly repository = new SaveRepository(
    storagePort(),
    this.writerLock,
  );
  private readonly view: GameView;
  private renderer: GameRenderer | null = null;
  private graphicsAvailable = true;
  private input: PlayerInput | null = null;
  /** UX-1: head look and rudder at the Hearthline helm. */
  private readonly helm = new HelmControl();
  private readonly session: ExpeditionSession;
  private get state(): GameState | null {
    return this.session.state;
  }
  private paused = true;
  // Permission belongs to one accepted New/import/Continue request. Preparation
  // pauses preserve it; an interruption or player pause revokes it permanently
  // for that request, even if focus/graphics recover before the I/O completes.
  private entryCanResume = false;
  // Native lock requests cannot be cancelled. Keep their generation until the
  // native result arrives, even after pause/replacement invalidates the intent.
  private captureGeneration = 0;
  private captureRequest: { generation: number } | null = null;
  private mouseReleasePending = false;
  private hadMouseLock = false;
  private mouseState: "off" | "requesting" | "on" | "denied" | "cooldown" = "off";
  private cooldownUntil = 0;
  private sessionGeneration = 0;
  private gesture: { code: string; kind: "exit" | "skip"; vehicleId: string | null; session: number; seconds: number } | null = null;
  private disposed = false;
  private dirty = true;
  private frameId = 0;
  private hudTime = 0;
  /** Last frame time at which play advanced; idle preparation waits after it. */
  private lastActive = Number.NEGATIVE_INFINITY;
  private forwardThrust = 0;
  private thrustSeconds = 0;
  private thrustActor: string | null = null;
  private ascentSeconds = 0;
  private ascentActor: string | null = null;
  private lastBoundaryNotice = -Infinity;
  private settings = readSettings();
  /** SIM-1: the live state steps in place; a throw restores it (development
   * builds also check every 10th checkpoint's replay against the live state). */
  private readonly guard = new StepGuard({ verifyEvery: DEV ? 10 : 0 });
  /** SIM-PERF-1: each fixed step's time by phase, the app's own work included.
   * Pulled on demand (`stepCosts()`); recording allocates nothing per step. */
  private readonly costs = new StepCosts();
  /** Local-only play timeline (SYS-2, C4): never in the save, never sent. One per expedition entry (SIM-1b). */
  private live: LiveTimeline | null = null;
  private get timeline(): TimelineRecorder | null { return this.live?.recorder ?? null; }
  private timelineSaved = 0;

  constructor(root: HTMLElement) {
    this.session = new ExpeditionSession(this.repository, {
      changed: () => this.syncSessionUi(),
      pause: () => this.pause("", false),
      entered: () => this.entered(),
      notify: (message, error, options) => this.view.notify(message, error, options, this.state),
    });
    this.view = new GameView(root, {
      command: (command) => this.command(command),
      panel: (kind) => this.openPanel(kind),
      closePanel: () => this.resume(true),
      fixture: () => {
        if (this.renderer)
          this.requestEntry(() => this.session.newGame("carrier-fixture"));
      },
      audio: (settings) => {
        this.sound.settings = settings;
        this.view.audioSettings(settings);
        try {
          localStorage.setItem("siltwake.audio.v2", JSON.stringify(settings));
        } catch {}
      },
      newGame: () => {
        if (this.renderer) this.requestEntry(() => this.session.newGame());
      },
      continueGame: () => {
        if (this.renderer) this.requestEntry(() => this.session.continueGame());
      },
      resume: () => this.resume(true),
      pause: () => this.pause(),
      save: () => this.session.manualSave(),
      exportGame: () => this.exportGame(),
      exportTimeline: () => this.exportTimeline(),
      repairTimeline: () => this.repairTimeline(),
      exportBackup: () => this.exportBackup(),
      exportRaw: () => this.exportRaw(),
      importFile: (file) =>
        this.requestEntry(() => {
          void this.session.importFile(file);
        }),
      confirm: () => this.session.confirm(),
      cancelConfirm: () => {
        this.entryCanResume = false;
        // While the entered expedition waits for its caves there is no I/O to
        // cancel: cancelling withdraws the automatic resume (it opens paused).
        if (this.entryPending && !this.session.busy && !this.session.confirmation) {
          this.view.notify("The expedition will open paused once its caves are ready.", false, { channel: "system" });
          return;
        }
        this.session.cancel();
      },
      lockMouse: () => { if (this.resume()) this.requestCapture(); },
      settings: (quality, sensitivity, invertY, mouseMode, keyTurnSpeed) =>
        this.applySettings({ quality, sensitivity, invertY, mouseMode, keyTurnSpeed }),
    }, this.world);
    try {
      const a = JSON.parse(localStorage.getItem("siltwake.audio.v2") ?? "null");
      if (a && typeof a.volume === "number" && Number.isFinite(a.volume))
        this.sound.settings = {
          volume: Math.max(0, Math.min(1, a.volume)),
          muted: a.muted === true,
          subtitles: a.subtitles !== false,
        };
    } catch {}
    this.view.audioSettings(this.sound.settings);
    this.syncSessionUi();
    this.view.settings(
      this.settings.quality,
      this.settings.sensitivity,
      this.settings.invertY,
      this.settings.mouseMode,
      this.settings.keyTurnSpeed,
    );
    try {
      this.renderer = createRenderer(this.view.canvas, (available) => {
        if (this.disposed) return;
        this.graphicsAvailable = available;
        // Reconstruction does not re-enter the session. Neither availability
        // edge may retain an episode or a deferred injury announcement.
        this.view.cancelFeedback();
        if (!available)
          this.pause("Graphics paused while the WebGL context is unavailable.");
        else {
          this.dirty = true;
          this.view.notify("Graphics restored. Resume when ready.", false, { channel: "system" });
        }
      });
      this.input = new PlayerInput(this.view.canvas, () => this.active, () => {
        if (this.settings.mouseMode !== "captured" || this.mouseState === "denied" ||
          this.mouseState === "cooldown" && performance.now() < this.cooldownUntil)
          return false;
        this.requestCapture();
        return document.pointerLockElement !== this.view.canvas;
      }, () => this.cancelGesture());
      this.applySettings(this.settings, false);
    } catch (error) {
      this.view.graphicsError(errorText(error));
    }
    const options = { signal: this.abort.signal };
    window.addEventListener(
      "resize",
      () => {
        this.renderer?.resize();
        this.dirty = true;
      },
      options,
    );
    window.addEventListener(
      "blur",
      () => this.pause("Paused because the window lost focus."),
      options,
    );
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden)
          this.pause("Paused while this tab is in the background.");
      },
      options,
    );
    window.addEventListener("keydown", (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === "Escape") {
        event.preventDefault();
        if (this.session.confirmation || this.session.busy) {
          this.session.cancel();
          this.pause();
        } else if (this.panelOpen) this.resume();
        else this.pause();
        return;
      }
      if (event.code === "F5" && this.state) {
        event.preventDefault();
        this.session.manualSave();
        return;
      }
      if (event.repeat) return;
      const panels: Record<string, PanelKind> = {
        Tab: "inventory", KeyI: "inventory", KeyK: "craft", KeyJ: "notebook", KeyV: "carrier", KeyO: "systems", KeyU: "fit",
      };
      const panel = panels[event.code];
      if (panel && !event.defaultPrevented && !event.shiftKey && (this.active || this.panelOpen) &&
        (event.code === "Tab"
          ? this.active && !this.panelOpen && !controlHasFocus(event.target)
          : !textEntryHasFocus(event.target))) {
        event.preventDefault();
        if (this.panelOpen && this.view.currentPanel === panel) this.resume(true);
        else this.openPanel(panel);
        return;
      }
      if (!this.active || controlHasFocus(event.target)) return;
      if (this.state?.opening.phase !== 4 && event.code === "Space" &&
        (event.target === this.view.canvas || document.activeElement === this.view.canvas)) {
        event.preventDefault();
        this.startGesture(event.code, "skip");
        return;
      }
      // A piloted Creel keeps E as its work key: tool arms ahead, else its cabin. X exits.
      const creel = this.state?.fleet.vehicles.find(v => v.id === this.state?.player.controlledVehicleId && v.hull === "creel");
      if (event.code === "KeyE" && creel && this.state && (armTarget(this.state) || fittedCabin(this.state, creel))) {
        event.preventDefault();
        this.command(armTarget(this.state) ? { type: "arm-lift" } : { type: "cabin", action: "enter" });
        return;
      }
      if ((event.code === "KeyE" || event.code === "KeyX") &&
        this.state?.player.controlledVehicleId) {
        event.preventDefault();
        if (deliberateExit(this.state)) this.startGesture(event.code, "exit");
        else this.command({ type: "exit" });
        return;
      }
      if (event.code === "KeyN" && this.active) { event.preventDefault(); this.feedbackNote(); return; }
      // SIG-1: the number row runs the piloted craft's fitted actions, numbered on the HUD.
      const digit = /^Digit([1-9])$/.exec(event.code)?.[1];
      const craftAction = digit && this.state?.player.controlledVehicleId ? craftActions(this.state)[Number(digit) - 1] : undefined;
      if (craftAction) { event.preventDefault(); this.command({ type: "upgrade", action: craftAction.action }); return; }
      const commands: Record<string, GameCommand> = {
        KeyE: { type: "interact" }, KeyQ: { type: "scan" }, KeyP: { type: "ping" },
        KeyB: { type: "buoy" }, KeyF: { type: "eat" },
        KeyG: { type: "distraction" }, KeyH: { type: "hint" }, KeyX: { type: "exit" },
        // S4: the lamp switch and the two nonlethal kits.
        KeyL: { type: "lamp" }, KeyT: { type: "deploy-lure" }, KeyY: { type: "release-ink" },
        // CR-1: release a caught small fish as bait.
        KeyM: { type: "release-bait" },
      };
      const command = commands[event.code];
      if (command) { event.preventDefault(); this.command(command); }
    }, options);
    window.addEventListener("keyup", (event) => {
      if (event.code === this.gesture?.code) this.cancelGesture();
    }, options);
    this.view.canvas.addEventListener("blur", () => {
      this.input?.clear();
      this.cancelGesture();
    }, options);
    document.addEventListener("pointerlockchange", () => this.pointerLockChanged(), options);
    document.addEventListener("pointerlockerror", () => this.captureDenied(), options);
    window.addEventListener(
      "pagehide",
      (event) => {
        if (event.persisted) this.pause("Paused after page navigation.");
        else {
          // Ask for a last timeline commit without depending on it: a note is durable once its own commit returns.
          this.live?.close(this.state, true);
          this.dispose();
        }
      },
      options,
    );
    // FORK(step-costs-global): a pulled diagnostic global beside REC-1's `__siltwake` hook;
    // retire in whichever of REC-1 and SIM-PERF-1 merges second (as `__siltwake.steps()`).
    (globalThis as { __siltwakeStepCosts?: () => StepCostSnapshot & { caches: CacheStats[] } }).__siltwakeStepCosts =
      () => ({ ...this.stepCosts(), caches: simCaches() });
    this.frameId = requestAnimationFrame((now) => this.frame(now));
  }

  private get active(): boolean {
    return (
      !this.paused &&
      this.graphicsAvailable &&
      this.state !== null &&
      this.renderer !== null &&
      !this.disposed
    );
  }

  /** Cave admission for the controlled actor, before anything steps (CW-1). */
  private caveAdmission(now: number, entry = false): CaveHold | null {
    const s = this.state;
    if (!s || s.opening.phase < 4 || s.player.mode === "interior") return null;
    const v = s.fleet.vehicles.find(x => x.id === s.player.controlledVehicleId);
    const feet = v ? v.pose.position : s.player.pose.position;
    const hold = this.caves.update(actorBox(feet, v ? HULL_COLLIDERS[v.hull] : DIVER_SHAPE), feet,
      { x: feet.x, y: feet.y + 0.8, z: feet.z }, now);
    if (hold.relocate) {
      this.session.state = relocateForCave(s, hold.relocate);
      this.view.notify(hold.message, false, { channel: "system" });
      this.dirty = true;
    } else if (hold.holding && !this.caveHolding && !entry) this.view.notify(hold.message, false, { channel: "system" });
    this.caveHolding = hold.holding && !hold.relocate;
    this.view.canvas.dataset.caveHold = hold.state;
    return hold;
  }

  private frame(now: number): void {
    if (this.disposed) return;
    this.frameAt = now;
    // Frame timing for measurement harnesses only (CW-1 traversal): a page
    // that defines `__siltwakePerf` gets one entry per frame.
    const perf = (globalThis as { __siltwakePerf?: unknown[] }).__siltwakePerf;
    const started = perf ? performance.now() : 0;
    let simMs = 0, steps = 0, saveMs = 0;
    this.installCaveRecords();
    if (this.entryPending) this.admitEntry(now);
    // While a cave holds, the simulation clock is paused (no oxygen, exposure,
    // power or AI ticks); rendering carries on.
    const hold = this.active ? this.caveAdmission(now) : null;
    // A settle whose cave light never landed stays dark (the renderer never
    // shows it unlit): move to safe water once, and settle there (R3-3).
    if (this.renderer?.caveLightFailed && !this.settleFallback && this.active) { this.settleFallback = true; this.toSafeWater(); }
    else if (!this.renderer?.caveLightFailed) this.settleFallback = false;
    // Likewise while the view settles after a jump (respawn, refuge, rescue).
    this.clock.advance(now, this.active && !hold?.holding && !this.renderer?.settling, () => {
      if (!this.state || !this.active) return;
      const stepStart = perf ? performance.now() : 0;
      stepMeter.active = this.costs;
      this.costs.open();
      try { this.step(now); } finally {
        this.costs.close(this.state?.tick ?? 0);
        if (perf) { simMs += performance.now() - stepStart; steps++; saveMs += this.lastSaveMs; }
      }
    });
    const presentStart = perf ? performance.now() : 0;
    this.present(now);
    if (perf) perf.push({ at: now, total: performance.now() - started, sim: simMs, steps, save: saveMs, present: performance.now() - presentStart,
      hud: this.lastHudMs,
      parts: (globalThis as { __siltwakePresent?: unknown }).__siltwakePresent ?? null, hold: hold?.state ?? null });
    this.frameId = requestAnimationFrame((time) => this.frame(time));
  }

  /** Measurement only: the last step's autosave and the last HUD update, ms. */
  private lastSaveMs = 0;
  private lastHudMs = 0;

  /** Everything after the steps: aim, HUD, the renderer, idle preparation, sound. */
  private present(now: number): void {
    const target = this.active && this.state ? aimedInteraction(this.state, this.world) : null;
    const preview = this.active && this.state && !target ? reachPreview(this.state, this.world) : null;
    const aim = { target, preview };
    if (this.state && now - this.hudTime > 90) {
      const hudStart = performance.now();
      this.view.update(this.state, this.input?.cruise ?? false, this.forwardThrust, aim);
      this.hudTime = now;
      this.lastHudMs = performance.now() - hudStart;
    } else this.lastHudMs = 0;
    if (this.state) this.view.target(target, preview);
    if (
      this.renderer &&
      this.graphicsAvailable &&
      !document.hidden &&
      (this.active || this.dirty || this.view.canvas.dataset.ready !== "true")
    ) {
      try {
        this.renderer.present(this.state, { target: target?.host ?? null, preview: preview?.host ?? null, look: this.helm.look });
        this.dirty = false;
      } catch (error) {
        this.pause();
        this.view.graphicsError(errorText(error));
        this.renderer.dispose();
        this.renderer = null;
      }
    }
    if (this.active) this.lastActive = now;
    else if (
      this.renderer && this.graphicsAvailable && !document.hidden && !this.panelOpen &&
      !this.session.busy && !this.session.confirmation &&
      this.view.canvas.dataset.ready === "true" && now - this.lastActive > IDLE_PREPARE_MS
    ) {
      // Title, pause and entry-ready screens: build at most one nearby region
      // per frame into retention so first visits during play do not stall.
      try { this.renderer.prepare(); } catch (error) {
        this.view.graphicsError(errorText(error));
        this.renderer.dispose();
        this.renderer = null;
      }
    }
    this.sound.update(this.state, this.active);
  }

  /** One fixed simulation step with this frame's input, marked phase by phase (SIM-PERF-1). */
  private step(now: number): void {
    if (!this.state || !this.active) return;
    const costs = this.costs;
    const gesture = this.sampleGesture();
    const controls = this.helm.apply(this.state, this.input?.sample() ?? []);
    this.forwardThrust = controls.find(c => c.type === "move")?.forward ?? 0;
    costs.mark(PHASE.input);
    // SIM-1: the live state steps in place; the guard keeps a throw atomic.
    let result: { state: GameState; events: GameEvent[] };
    try {
      result = { state: this.state, events: this.guard.step(this.state, [...controls, ...gesture], this.world) };
    } catch (error) {
      this.simulationFault(error);
      return;
    }
    this.events(result.events);
    costs.mark(PHASE.events);
    this.observeTimeline(result.state, [...controls, ...gesture], result.events);
    costs.mark(PHASE.timelineSave);
    this.observeAscent(result.events);
    this.observeThrust(result.events);
    this.view.presentationStep(result.state);
    this.validateGesture();
    for (const event of result.events)
      if (
        event.type === "foundation-boundary" &&
        now - this.lastBoundaryNotice > 6000
      ) {
        this.view.notify(
          "World edge · open ocean beyond. Turn back toward the regions.",
          false, { channel: "system" },
        );
        this.lastBoundaryNotice = now;
      }
    costs.mark(PHASE.presentation);
    const saveStart = performance.now();
    this.session.autosave();
    this.lastSaveMs = performance.now() - saveStart;
    costs.mark(PHASE.autosave);
  }

  /** Where the fixed steps' time has gone this page (SIM-PERF-1), read on demand; the sim's
   * cache ledger (`simCaches()`) is read beside it through the same diagnostic global. */
  stepCosts(): StepCostSnapshot { return this.costs.snapshot(); }

  private syncSessionUi(): void {
    if (this.disposed) return;
    this.view.slot(this.repository.status, this.state !== null);
    this.view.persistence(
      this.session.persistenceMessage,
      this.session.autoSaveAllowed,
      this.state !== null,
      // Busy while entry waits; a failed entry frees the menu (load another save, or Continue to try again).
      this.session.busy || (this.entryPending !== null && !this.entryPending.failed),
    );
    const choice = this.session.confirmation;
    if (choice)
      this.view.confirmation(choice.title, choice.detail, choice.accept);
    else this.view.cancelConfirmation();
  }

  private requestEntry(action: () => void): void {
    if (this.disposed || this.session.busy || this.session.confirmation) return;
    // A new deliberate request may enter after an earlier settled interruption.
    // Refused/busy actions never authorize a future completion.
    this.entryCanResume =
      this.renderer !== null && this.graphicsAvailable && !document.hidden;
    action();
  }

  /** The play timeline: one observation per active step, kept in localStorage. */
  private observeTimeline(s: GameState, controls: readonly GameCommand[], events: readonly GameEvent[]): void {
    if (!this.timeline) return;
    // A zero look or move is not input; a command or panel action since the last
    // observation is (C4B-06).
    const input = controlsActive(controls) || this.timelineActivity;
    this.timelineActivity = false;
    const waiting = [...(s.systems.decodes.length ? ["decode"] : []), ...(s.systems.planters.length ? ["growth"] : [])];
    observe(this.timeline, s, { input, waiting });
    const systems = events.flatMap((e) => e.type === "systems" ? [e.event] : []);
    if (systems.length) recordSystemsEvents(this.timeline, s, systems);
    this.costs.mark(PHASE.timeline);
    if (s.tick - this.timelineSaved >= 600) this.saveTimeline();
  }
  /** Commits the timeline journal (SIM-1b): the small head plus any new or folded chunk. */
  private saveTimeline(): void {
    if (!this.live || !this.state) return;
    this.timelineSaved = this.state.tick;
    this.live.save(this.state);
  }
  /** Start or resume the timeline for the session just entered (same save session resumes). */
  private startTimeline(): void {
    // The previous generation ends here: a commit of it still waiting for the lock never writes.
    this.live?.close(null, false);
    this.live = null;
    const meta = this.session.envelope()?.meta;
    if (!meta || !this.state) { this.view.timelineRepair(false); return; }
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* memory only */ }
    // What opening says is delivered once entry is complete (after the session's own entry notices),
    // so a protection or memory-only warning is the one left showing (SIM-1b R1 F5).
    const opening: [string, Tone][] = [];
    let opened = false;
    const say = (message: string, tone: Tone): void => {
      if (!opened) opening.push([message, tone]);
      // A timeline storage failure is a persistence warning in its own context: below urgent
      // hazards and game-save warnings, never resolved by a game save, resolved by a timeline
      // commit that succeeds (SIM-1b R2 F3/F4).
      else if (!this.disposed) this.view.notify(message, tone === "error",
        tone === "info" ? { channel: "system" } : { channel: "persistence", context: "timeline" });
    };
    this.live = LiveTimeline.open(storage, this.writerLock, { id: meta.sessionId, started: meta.createdAt, build: CONTENT_VERSION },
      { regionAt: (x: number, z: number) => regionAtPoint(x, z) }, say,
      () => { if (!this.disposed) this.view.timelineRepair(this.live?.protected ?? false); });
    const live = this.live;
    queueMicrotask(() => {
      opened = true;
      if (this.live === live) for (const [message, tone] of opening) say(message, tone);
    });
    this.view.timelineRepair(this.live.protected);
    this.timelineSaved = this.state.tick;
  }
  /** The menu's Repair play timeline: export the unreadable records first, explain, confirm, then replace. */
  private repairTimeline(): void {
    const live = this.live;
    if (!live?.protected || !this.state) return;
    const records = live.records();
    if (typeof records === "string") {
      this.view.notify(`The play-timeline store can't be repaired now: ${records}. Nothing was changed.`, true, { channel: "system" });
      return;
    }
    this.download(JSON.stringify({ format: "siltwake.timeline.records", ...records }), "siltwake-timeline-record.json");
    this.session.ask({
      title: "Replace the local play-timeline store?",
      detail: "The unreadable play-timeline record was just exported as siltwake-timeline-record.json. Replacing it stores this expedition's timeline in its place: the unreadable record, and any earlier timeline it held, are removed from this browser. Your game saves are not affected.",
      accept: "Replace & save timeline",
    }, () => { if (this.live === live && this.state) live.repair(this.state, records); });
  }
  /** N: a one-line feedback note stamped with play time and place. */
  private feedbackNote(): void {
    if (!this.timeline || !this.state) return;
    this.pause("", true);
    this.view.noteEntry((text) => {
      if (text && this.live && this.state) {
        // "Saving note…", then "Note saved" once its commit returns, come from the timeline.
        const no = this.live.note(this.state, text);
        if (no) this.view.notify(no, true, { channel: "system" });
        this.timelineSaved = this.state.tick;
      }
      this.resume(true);
    });
  }
  private exportTimeline(): void {
    if (!this.timeline || !this.state) { this.view.notify("No play timeline yet. Play a little first.", true, { channel: "system" }); return; }
    this.download(exportTimelineText(this.timeline, this.state), `siltwake-timeline-${new Date().toISOString().slice(0, 10)}.json`);
    this.view.notify("Play timeline exported. It stays on this computer unless you share the file.", false, { channel: "system" });
  }

  /** Baked cave records, once they land (the pack is fetched at start). */
  private installCaveRecords(): void {
    if (this.recordsSet || (this.caveStore && !this.caveStore.settled)) return;
    if (this.caveStore?.collision) setKitCaveRecords(this.caveStore.collision);
    this.recordsSet = true;
  }

  private entered(): void {
    if (this.disposed) return;
    this.sessionGeneration++;
    // CW-1 R2: recovery state belongs to the expedition it was learned in.
    this.caves.reset();
    this.caveHolding = false;
    // A loaded save neither replays its history nor inherits old cooldowns.
    this.sound.reset();
    this.resolutionPhase = this.state?.story.resolution.phase ?? null;
    this.resetAscent();
    this.cancelGesture();
    // UX-1: a replaced session inherits no head look or rudder, before its first frame.
    this.helm.clear();
    this.warm();
    forgetCorridorView();
    this.view.resetPresentation();
    // After the reset, so the new timeline's protection or memory-only notice stays (SIM-1b R1 F5).
    this.startTimeline();
    // CW-1 R1: the expedition stays behind the menu's loading presentation
    // (paused, busy, no HUD) until its caves are admitted: records installed,
    // admission clear, or a rescue or refuge applied. Usually that is now.
    this.entryPending = { generation: this.sessionGeneration, since: this.frameAt, presents: this.renderer?.presents ?? 0, fallback: false, failed: false };
    this.paused = true;
    this.clock.reset();
    this.view.showMenu(true, ENTRY_LOADING);
    this.syncSessionUi();
    this.admitEntry(this.frameAt);
  }

  /** One step of the entry wait: admit the entered expedition's caves, then finish entry. */
  private admitEntry(now: number): void {
    const pending = this.entryPending;
    if (!pending || this.disposed) return;
    if (pending.generation !== this.sessionGeneration || !this.state) { this.entryPending = null; this.syncSessionUi(); return; }
    this.installCaveRecords();
    const hold = this.caveAdmission(now, true);
    // Held: keep waiting (the refuge timeout bounds it), presenting the entered pose behind the cover
    // so its readiness is known when the records land. Relocated: admit again at the new pose next frame.
    if (hold?.holding) { this.dirty = true; return; }
    // A cave the view stands in is lit before it is shown (never a pop of open
    // water inside a cave, CW-1 R1). Readiness is the entered pose's: only a
    // frame presented since entry counts (R3-3). The wait is bounded; if the
    // light never lands, the expedition moves to safe water (the remembered
    // open water, else the refuge) and waits again there; if even that stays
    // unlit, entry keeps the loading cover with a message. Never revealed unlit.
    if (this.renderer && this.graphicsAvailable) {
      if (pending.failed) return;
      const seen = this.renderer.presents > pending.presents;
      if (!seen || this.renderer.caveLightPending) {
        this.dirty = true;
        if (!seen || now - pending.since < ENTRY_LIGHT_WAIT_MS) return;
        if (!pending.fallback) {
          this.toSafeWater();
          this.entryPending = { ...pending, since: now, presents: this.renderer.presents, fallback: true };
          return;
        }
        this.entryPending = { ...pending, failed: true };
        this.view.showMenu(true, ENTRY_LIGHT_FAILED);
        this.syncSessionUi();
        return;
      }
    }
    this.entryPending = null;
    this.syncSessionUi();
    this.finishEntry();
  }

  /** Out of an unlit cave (CW-1 R3-3): to the remembered open water, else the refuge. */
  private toSafeWater(): void {
    const s = this.state;
    if (!s) return;
    const back = this.caves.lastSafe;
    this.session.state = relocateForCave(s, back ? { kind: "point", position: back } : { kind: "refuge" });
    this.view.notify(UNLIT_MOVED, false, { channel: "system" });
    this.dirty = true;
  }

  private finishEntry(): void {
    // CW-1: the legacy region owners are monolithic builds (up to half a
    // second each); make every one now, into retention, behind the load, so
    // crossing into a region during play only re-attaches it.
    this.warmRegions();
    if (this.state) this.view.update(this.state, false);
    const automatically = this.entryCanResume;
    this.entryCanResume = false;
    if (!automatically || !this.resume())
      this.pause("Expedition ready. Resume when ready.", false);
    else if (navigator.userActivation?.isActive) this.requestCapture();
  }

  /** Build every nearby legacy region owner into retention (bounded). */
  private warmRegions(): void {
    if (!this.renderer || !this.graphicsAvailable || !this.state) return;
    try {
      this.renderer.present(this.state);
      for (let i = 0; i < 8 && this.renderer.prepare(); i++);
    } catch (error) {
      this.view.graphicsError(errorText(error));
    }
  }

  /** SIM-PERF-1: the first steps' compilation, the hull contact meshes and the save path's
   * first commit are paid here, behind the entry pause, not in the first seconds of play
   * (5–8, about 3 and 12–17 ms). Nothing live changes: the step runs on a copy. */
  private warm(): void {
    if (!this.state) return;
    warmSimulation(this.state, this.world);
    const save = this.session.envelope();
    if (save) warmCommit(save);
  }

  private resume(capture = false): boolean {
    if (
      this.disposed ||
      !this.state ||
      !this.renderer ||
      this.session.confirmation ||
      this.session.busy ||
      this.entryPending ||
      !this.graphicsAvailable ||
      document.hidden
    )
      return false;
    this.panelOpen = false;
    this.view.closePanel();
    this.sound.activate();
    this.input?.clear();
    this.cancelGesture();
    this.clock.reset();
    this.paused = false;
    this.dirty = true;
    this.view.showGame();
    this.lookAction();
    if (capture) this.requestCapture();
    return true;
  }

  private pause(reason = "", interruptEntry = true): void {
    if (this.disposed) return;
    this.panelOpen = false;
    this.view.closePanel();
    if (interruptEntry) this.entryCanResume = false;
    this.paused = true;
    this.resetAscent();
    this.forwardThrust = 0;
    this.clock.reset();
    this.input?.clear();
    this.cancelGesture();
    this.view.cancelFeedback();
    this.sound.update(this.state, false);
    this.releaseMouse();
    this.view.target(null);
    this.lookAction();
    this.view.showMenu(this.state !== null, this.entryPending?.failed ? ENTRY_LIGHT_FAILED : this.entryPending && !reason ? ENTRY_LOADING : reason);
    this.syncSessionUi();
    this.dirty = true;
  }

  /** SIM-1: a simulation exception. The guard has already restored the live
   * state, so saving and export stay safe: pause and say so. Development
   * builds also rethrow, so the fault is loud there. */
  private simulationFault(error: unknown): void {
    console.error(error);
    const restored = !(error instanceof StepFault) ? "is unchanged"
      : error.restored === "exact" ? "was restored to the moment before the fault"
      : "was restored to its last checkpoint, up to a second earlier";
    this.pause(`Simulation fault · the expedition ${restored}; saving and export are safe. ${errorText(error)}`);
    if (DEV) queueMicrotask(() => { throw error; });
  }

  private events(events: readonly GameEvent[]): void {
    for (const event of events) {
      if (event.type === "notice") this.view.notify(event.message, event.error, event, this.state);
      if (event.type === "sound" && event.source === "threat-call" && event.origin && this.state &&
        [event.origin.x, event.origin.y, event.origin.z].every(Number.isFinite))
        this.view.threatCall(event.origin, this.state);
      if (event.type === "impact" && event.hullLoss > 0) this.view.impact(event.hullLoss, this.state);
      if (event.type === "interaction-panel") {
        if (event.panel === "journal") this.view.showJournalTab("decodes");
        this.openPanel(event.panel === "journal" ? "notebook" : event.panel, event.targetId);
      }
    }
    // One batch per step: the mapper reads impact and threat-damage itself and
    // keeps the hunter's bearing on the single injury hit.
    this.sound.events(events, this.state);
    // S5's resolution scene begins: the ending piece plays once.
    const phase = this.state?.story.resolution.phase ?? null;
    if (phase === "first" && this.resolutionPhase === "none") this.sound.moment("ending");
    this.resolutionPhase = phase;
    // Deliver injury after this batch's outcomes. The view observes the exact
    // installed step state before accepting its event target (including a
    // disabled, still-controlled hull). No frame-final health inference.
    const outcomeSpeaks = events.some(e => e.type === "notice" && e.channel === "hazard" &&
      (e.context === "hull" || e.context === "recovery"));
    for (const event of events) if (event.type === "threat-damage" && this.active && this.state)
      this.view.threatDamage(event, this.state, outcomeSpeaks);
  }

  private resetAscent(resetThrust = true): void {
    this.ascentSeconds = 0;
    this.ascentActor = null;
    this.view.blockedAscent(false);
    if (resetThrust) this.resetThrust();
  }

  private observeAscent(events: readonly GameEvent[]): void {
    const sample = events.find((e): e is Extract<GameEvent, { type: "ascent-sample" }> => e.type === "ascent-sample");
    if (!this.active || !this.state || !sample || sample.actorId !== this.state.player.controlledVehicleId ||
      ![sample.requestedRise, sample.actualRise, sample.solidLimitedRise, sample.surfaceLimitedRise].every(Number.isFinite) ||
      sample.requestedRise <= ASCENT_EPSILON || sample.surfaceLimitedRise > ASCENT_EPSILON ||
      Math.abs(sample.actualRise) > sample.requestedRise * 0.1 + ASCENT_EPSILON ||
      sample.solidLimitedRise <= sample.requestedRise * 0.5 + ASCENT_EPSILON) {
      this.resetAscent(false);
      return;
    }
    const actor = `${this.state.player.mode}/${sample.actorId ?? "diver"}`;
    if (actor !== this.ascentActor) this.ascentSeconds = 0;
    this.ascentActor = actor;
    this.ascentSeconds = Math.min(BLOCKED_ASCENT_SECONDS, this.ascentSeconds + FIXED_SECONDS);
    this.view.blockedAscent(this.ascentSeconds + 1e-9 >= BLOCKED_ASCENT_SECONDS);
  }

  private resetThrust(): void {
    this.thrustSeconds = 0;
    this.thrustActor = null;
    this.view.blockedThrust(false, this.state);
  }

  private observeThrust(events: readonly GameEvent[]): void {
    const s = this.state, v = s?.fleet.vehicles.find(v => v.id === s.player.controlledVehicleId);
    const sample = events.find((e): e is Extract<GameEvent, { type: "thrust-sample" }> => e.type === "thrust-sample");
    if (!this.active || !s || s.opening.phase < 4 || s.player.mode !== "piloting" ||
      v?.hull !== "dart" || v.disabled || v.charge <= 0 || !sample || sample.actorId !== v.id ||
      events.some(e => e.type === "foundation-boundary") ||
      ![sample.requested, sample.actual, sample.solidLimited, sample.supportLimited].every(Number.isFinite) ||
      sample.requested <= 1e-5 || sample.actual < 0 || sample.solidLimited < 0 || sample.supportLimited < 0 ||
      sample.actual > sample.requested * 0.1 ||
      Math.min(sample.requested - sample.actual, sample.solidLimited + sample.supportLimited) <
        0.8 * (sample.requested - sample.actual)) {
      this.resetThrust();
      return;
    }
    if (this.thrustActor !== v.id) this.thrustSeconds = 0;
    this.thrustActor = v.id;
    this.thrustSeconds = Math.min(0.5, this.thrustSeconds + FIXED_SECONDS);
    this.view.blockedThrust(this.thrustSeconds + 1e-9 >= 0.5, s);
  }

  /** A command or panel action since the last timeline observation. */
  private timelineActivity = false;
  private command(command: GameCommand): void {
    this.timelineActivity = true;
    if (
      !this.state ||
      this.disposed ||
      this.session.busy ||
      this.session.confirmation ||
      !this.graphicsAvailable ||
      document.hidden ||
      (!this.active && !this.panelOpen)
    )
      return;
    this.sound.activate();
    const actor = `${this.state.player.mode}/${this.state.player.controlledVehicleId ?? "diver"}`;
    let result: { state: GameState; events: GameEvent[] };
    // A throw inside a command never touches the live state (executeCommand's draft).
    try { result = this.guard.command(this.state, command, this.world); } catch (error) { this.simulationFault(error); return; }
    this.session.state = result.state;
    if (actor !== `${result.state.player.mode}/${result.state.player.controlledVehicleId ?? "diver"}`) this.resetAscent();
    this.validateGesture();
    this.view.update(result.state, false);
    this.dirty = true;
    if (this.panelOpen) this.view.refreshPanel(result.state);
    this.events(result.events);
  }
  private openPanel(
    kind: PanelKind,
    targetId?: string,
  ): void {
    if (
      (!this.active && !this.panelOpen) ||
      !this.state ||
      this.session.busy ||
      this.session.confirmation
    )
      return;
    this.pause("", true);
    this.timelineActivity = true;
    this.panelOpen = true;
    this.view.openPanel(kind, this.state, targetId);
    this.dirty = true;
  }

  private exportGame(): void {
    const save = this.session.envelope() ?? this.repository.status.save;
    if (!save) return;
    const encoded = encodeSave(save);
    if (!encoded.ok) {
      this.view.notify(encoded.error, true, { channel: "persistence" });
      return;
    }
    this.download(
      encoded.value,
      `siltwake-${save.meta.savedAt.slice(0, 10)}.json`,
    );
    this.view.notify(
      "Save file exported. Import it into a compatible Siltwake build to continue.",
      false, { channel: "system" },
    );
  }

  private exportBackup(): void {
    const text = this.repository.backupText;
    if (text) this.download(text, "siltwake-previous-save.json");
  }
  private exportRaw(): void {
    const text = this.repository.raw;
    if (text) {
      this.download(text, "siltwake-local-record.json");
      this.view.notify(
        "Local journal exported for safekeeping. This record contains both generations; use Export save for a normal importable file.",
        false, { channel: "system" },
      );
    }
  }

  private download(text: string, name: string): void {
    const url = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private lookAction(): void {
    this.view.lookAction(this.active && this.settings.mouseMode === "captured" &&
      document.pointerLockElement !== this.view.canvas,
      this.mouseState === "denied" || this.mouseState === "cooldown");
  }

  private requestCapture(): void {
    if (!this.active || this.settings.mouseMode !== "captured" || this.captureRequest ||
      this.mouseReleasePending || document.pointerLockElement === this.view.canvas ||
      navigator.userActivation?.isActive === false) return;
    if (this.mouseState === "cooldown" && performance.now() < this.cooldownUntil) return;
    const request = { generation: this.captureGeneration };
    this.captureRequest = request;
    this.mouseState = "requesting";
    try {
      const result = this.view.canvas.requestPointerLock();
      if (result && typeof result.then === "function") void result.then(() => {
        if (this.disposed) {
          if (document.pointerLockElement === this.view.canvas) document.exitPointerLock();
          return;
        }
        if (document.pointerLockElement === this.view.canvas) this.pointerLockChanged();
      }, () => this.captureDenied(request));
    } catch { this.captureDenied(request); }
    this.lookAction();
  }

  private captureDenied(request = this.captureRequest): void {
    if (!request || request !== this.captureRequest) return;
    this.captureRequest = null;
    if (this.disposed || request.generation !== this.captureGeneration) return;
    this.mouseState = "denied";
    this.lookAction();
  }

  private releaseMouse(): void {
    this.captureGeneration++;
    if (document.pointerLockElement === this.view.canvas) {
      // Persists until the native unlocked event, regardless of its delivery order.
      this.mouseReleasePending = true;
      document.exitPointerLock();
    }
  }

  private pointerLockChanged(): void {
    const locked = document.pointerLockElement === this.view.canvas;
    if (locked) {
      const stale = this.captureRequest && this.captureRequest.generation !== this.captureGeneration;
      this.captureRequest = null;
      this.hadMouseLock = true;
      if (this.disposed || stale || !this.active || this.settings.mouseMode !== "captured" || this.mouseReleasePending) {
        this.releaseMouse();
        return;
      }
      this.mouseState = "on";
    } else {
      const intentional = this.mouseReleasePending;
      this.mouseReleasePending = false;
      if (this.hadMouseLock && !intentional) {
        this.mouseState = "cooldown";
        this.cooldownUntil = performance.now() + 1200;
        this.hadMouseLock = false;
        this.pause();
      } else if (this.mouseState === "on") this.mouseState = "off";
      this.hadMouseLock = false;
    }
    this.lookAction();
  }

  private startGesture(code: string, kind: "exit" | "skip"): void {
    if (!this.state || this.gesture) return;
    if (kind === "skip") this.input?.clear();
    this.gesture = { code, kind, seconds: 0, session: this.sessionGeneration,
      vehicleId: this.state.player.controlledVehicleId };
    this.view.gesture(kind, 0, code === "KeyX" ? "X" : "E");
  }

  private cancelGesture(): void {
    this.gesture = null;
    this.view.gesture(null, 0);
  }

  private validateGesture(): void {
    const g = this.gesture;
    if (g && (!this.active || g.session !== this.sessionGeneration ||
      g.vehicleId !== this.state?.player.controlledVehicleId ||
      (g.kind === "skip" && this.state?.opening.phase === 4))) this.cancelGesture();
  }

  private sampleGesture(): GameCommand[] {
    this.validateGesture();
    const g = this.gesture;
    if (!g || !this.state) return [];
    g.seconds += FIXED_SECONDS;
    const duration = g.kind === "skip" ? 0.8 : 0.35;
    this.view.gesture(g.kind, Math.min(1, g.seconds / duration), g.code === "KeyX" ? "X" : "E");
    if (g.seconds + 1e-9 < duration && (g.kind !== "exit" || deliberateExit(this.state))) return [];
    this.cancelGesture();
    if (g.kind === "skip") this.input?.clear();
    return [{ type: g.kind === "skip" ? "skip-opening" : "exit" }];
  }

  private applySettings(settings: Settings, persist = true): void {
    if (settings.mouseMode !== this.settings.mouseMode) this.releaseMouse();
    this.settings = settings;
    this.view.settings(settings.quality, settings.sensitivity, settings.invertY, settings.mouseMode, settings.keyTurnSpeed);
    this.lookAction();
    this.renderer?.setQuality(settings.quality);
    if (this.input)
      this.input.settings = {
        sensitivity: settings.sensitivity,
        invertY: settings.invertY,
        keyTurnSpeed: settings.keyTurnSpeed,
      };
    this.dirty = true;
    if (persist)
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch {
        /* Settings are optional; saving gameplay reports its own errors. */
      }
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancelGesture();
    this.resetAscent();
    this.releaseMouse();
    this.view.cancelFeedback();
    this.disposed = true;
    this.paused = true;
    this.live?.close(null, false);
    cancelAnimationFrame(this.frameId);
    if (stepMeter.active === this.costs) stepMeter.active = null;
    const g = globalThis as { __siltwakeStepCosts?: () => unknown };
    if (g.__siltwakeStepCosts) delete g.__siltwakeStepCosts;
    this.abort.abort();
    this.session.dispose();
    this.input?.dispose();
    if (document.pointerLockElement === this.view.canvas)
      document.exitPointerLock();
    this.renderer?.dispose();
    this.sound.dispose();
    this.view.dispose();
  }
}
