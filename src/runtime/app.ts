import { armTarget, fittedCabin } from "../sim/fleet.js";
import { SiltwakeAudio } from "../audio/director.js";
import { worldRegionAt } from "../render/regions.js";
import { executeCommand, stepGame } from "../sim/step.js";
import { gameWorld } from "../sim/world.js";
import { FixedStepClock, FIXED_SECONDS } from "../sim/clock.js";
import { aimedInteraction, reachPreview } from "../sim/targeting.js";
import type { GameCommand, GameEvent, GameState } from "../sim/types.js";
import { encodeSave } from "../save/codec.js";
import { SaveRepository } from "../save/repository.js";
import type { StoragePort } from "../save/repository.js";
import { browserWriterLock } from "../save/writer-lock.js";
import { ExpeditionSession } from "./session.js";
import { createRenderer } from "../render/renderer.js";
import type { GameRenderer, Quality } from "../render/renderer.js";
import { PlayerInput, controlHasFocus, textEntryHasFocus, deliberateExit } from "./input.js";
import { GameView } from "../ui/view.js";
import type { PanelKind } from "../ui/view.js";
import { addNote, createRecorder, exportTimelineText, observe, recordSystemsEvents, resumeRecorder, TIMELINE_STORAGE_KEY } from "../sim/timeline/recorder.js";
import type { TimelineRecorder } from "../sim/timeline/recorder.js";
import { parseTimeline } from "../sim/timeline/report.js";
import { regionAtPoint } from "../content/regions/layout.js";
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
const ASCENT_EPSILON = 1e-5;
/** Lets a pause or menu draw before idle region preparation may block a frame. */
const IDLE_PREPARE_MS = 250;
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
  // Ambience follows C2's WorldMap, the map region selection uses; outside it, the last region holds.
  private readonly sound = new SiltwakeAudio({
    regionAt: worldRegionAt,
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
  private readonly repository = new SaveRepository(
    storagePort(),
    browserWriterLock(navigator.locks),
  );
  private readonly view: GameView;
  private renderer: GameRenderer | null = null;
  private graphicsAvailable = true;
  private input: PlayerInput | null = null;
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
  /** Local-only play timeline (SYS-2, C4): never in the save, never sent. */
  private timeline: TimelineRecorder | null = null;
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
      exportBackup: () => this.exportBackup(),
      exportRaw: () => this.exportRaw(),
      importFile: (file) =>
        this.requestEntry(() => {
          void this.session.importFile(file);
        }),
      confirm: () => this.session.confirm(),
      cancelConfirm: () => {
        this.entryCanResume = false;
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
      // C4: piloted upgrade actions on the number row, and the handheld ping.
      const upgrade = ({ Digit1: "overdrive", Digit2: "flare", Digit3: "ballast", Digit4: "listen", Digit5: "sample", Digit6: "anchor" } as const)[event.code as "Digit1"];
      if (upgrade && this.state?.player.controlledVehicleId) { event.preventDefault(); this.command({ type: "upgrade", action: upgrade }); return; }
      const commands: Record<string, GameCommand> = {
        KeyE: { type: "interact" }, KeyQ: { type: "scan" }, KeyP: { type: "ping" },
        KeyB: { type: "buoy" }, KeyF: { type: "eat" },
        KeyG: { type: "distraction" }, KeyH: { type: "hint" }, KeyX: { type: "exit" },
        // S4: the lamp switch and the two nonlethal kits.
        KeyL: { type: "lamp" }, KeyT: { type: "deploy-lure" }, KeyY: { type: "release-ink" },
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
        else this.dispose();
      },
      options,
    );
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

  private frame(now: number): void {
    if (this.disposed) return;
    this.clock.advance(now, this.active, () => {
      if (!this.state || !this.active) return;
      const gesture = this.sampleGesture();
      const controls = this.input?.sample() ?? [];
      this.forwardThrust = controls.find(c => c.type === "move")?.forward ?? 0;
      const result = stepGame(
        this.state,
        [...controls, ...gesture],
        this.world,
      );
      this.session.state = result.state;
      this.events(result.events);
      this.observeTimeline(result.state, controls, result.events);
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
      this.session.autosave();
    });
    const target = this.active && this.state ? aimedInteraction(this.state, this.world) : null;
    const preview = this.active && this.state && !target ? reachPreview(this.state, this.world) : null;
    const aim = { target, preview };
    if (this.state && now - this.hudTime > 90) {
      this.view.update(this.state, this.input?.cruise ?? false, this.forwardThrust, aim);
      this.hudTime = now;
    }
    if (this.state) this.view.target(target, preview);
    if (
      this.renderer &&
      this.graphicsAvailable &&
      !document.hidden &&
      (this.active || this.dirty || this.view.canvas.dataset.ready !== "true")
    ) {
      try {
        this.renderer.present(this.state, { target: target?.host ?? null, preview: preview?.host ?? null });
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
    this.frameId = requestAnimationFrame((time) => this.frame(time));
  }

  private syncSessionUi(): void {
    if (this.disposed) return;
    this.view.slot(this.repository.status, this.state !== null);
    this.view.persistence(
      this.session.persistenceMessage,
      this.session.autoSaveAllowed,
      this.state !== null,
      this.session.busy,
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
    const input = controls.some((c) => c.type !== "move" || c.forward !== 0 || c.right !== 0 || c.vertical !== 0);
    const waiting = [...(s.systems.decodes.length ? ["decode"] : []), ...(s.systems.planters.length ? ["growth"] : [])];
    observe(this.timeline, s, { input, waiting });
    const systems = events.flatMap((e) => e.type === "systems" ? [e.event] : []);
    if (systems.length) recordSystemsEvents(this.timeline, s, systems);
    if (s.tick - this.timelineSaved >= 600) this.saveTimeline();
  }
  private saveTimeline(): void {
    if (!this.timeline || !this.state) return;
    this.timelineSaved = this.state.tick;
    try { localStorage.setItem(TIMELINE_STORAGE_KEY, exportTimelineText(this.timeline, this.state)); } catch {}
  }
  /** Start or resume the timeline for the session just entered (same save session resumes). */
  private startTimeline(): void {
    const meta = this.session.envelope()?.meta;
    if (!meta || !this.state) { this.timeline = null; return; }
    const options = { regionAt: (x: number, z: number) => regionAtPoint(x, z) };
    let stored: string | null = null;
    try { stored = localStorage.getItem(TIMELINE_STORAGE_KEY); } catch {}
    const parsed = stored ? parseTimeline(stored) : null;
    this.timeline = parsed?.ok && parsed.value.session.id === meta.sessionId ? resumeRecorder(parsed.value, options)
      : createRecorder({ id: meta.sessionId, started: meta.createdAt, build: CONTENT_VERSION }, options);
    this.timelineSaved = this.state.tick;
  }
  /** N: a one-line feedback note stamped with play time and place. */
  private feedbackNote(): void {
    if (!this.timeline || !this.state) return;
    this.pause("", true);
    this.view.noteEntry((text) => {
      if (text && this.timeline && this.state) {
        const no = addNote(this.timeline, this.state, text, new Date().toISOString());
        this.view.notify(no ?? "Note saved to the play timeline.", !!no, { channel: "system" });
        this.saveTimeline();
      }
      this.resume(true);
    });
  }
  private exportTimeline(): void {
    if (!this.timeline || !this.state) { this.view.notify("No play timeline yet. Play a little first.", true, { channel: "system" }); return; }
    this.download(exportTimelineText(this.timeline, this.state), `siltwake-timeline-${new Date().toISOString().slice(0, 10)}.json`);
    this.view.notify("Play timeline exported. It stays on this computer unless you share the file.", false, { channel: "system" });
  }

  private entered(): void {
    if (this.disposed) return;
    this.sessionGeneration++;
    this.startTimeline();
    // A loaded save neither replays its history nor inherits old cooldowns.
    this.sound.reset();
    this.resolutionPhase = this.state?.story.resolution.phase ?? null;
    this.resetAscent();
    this.cancelGesture();
    this.view.resetPresentation();
    if (this.state) this.view.update(this.state, false);
    const automatically = this.entryCanResume;
    this.entryCanResume = false;
    if (!automatically || !this.resume())
      this.pause("Expedition ready. Resume when ready.", false);
    else if (navigator.userActivation?.isActive) this.requestCapture();
  }

  private resume(capture = false): boolean {
    if (
      this.disposed ||
      !this.state ||
      !this.renderer ||
      this.session.confirmation ||
      this.session.busy ||
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
    this.view.showMenu(this.state !== null, reason);
    this.syncSessionUi();
    this.dirty = true;
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

  private command(command: GameCommand): void {
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
    const result = executeCommand(this.state, command, this.world);
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
    cancelAnimationFrame(this.frameId);
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
