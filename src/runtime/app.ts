import { Soundscape } from "../audio/sound.js";
import { executeCommand, stepGame } from "../sim/step.js";
import { createWorldQueries } from "../sim/world.js";
import { FixedStepClock, FIXED_SECONDS } from "../sim/clock.js";
import { aimedInteraction } from "../sim/targeting.js";
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
  private readonly sound = new Soundscape();
  private panelOpen = false;
  private readonly abort = new AbortController();
  private readonly clock = new FixedStepClock();
  private readonly world = createWorldQueries();
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
  private forwardThrust = 0;
  private lastBoundaryNotice = -Infinity;
  private settings = readSettings();

  constructor(root: HTMLElement) {
    this.session = new ExpeditionSession(this.repository, {
      changed: () => this.syncSessionUi(),
      pause: () => this.pause("", false),
      entered: () => this.entered(),
      notify: (message, error) => this.view.notify(message, error),
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
        if (!available)
          this.pause("Graphics paused while the WebGL context is unavailable.");
        else {
          this.dirty = true;
          this.view.notify("Graphics restored. Resume when ready.");
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
        Tab: "inventory", KeyI: "inventory", KeyK: "craft", KeyJ: "notebook", KeyV: "carrier",
      };
      const panel = panels[event.code];
      if (panel && !event.shiftKey && (this.active || this.panelOpen) &&
        (event.code === "Tab" || !textEntryHasFocus(event.target))) {
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
      if ((event.code === "KeyE" || event.code === "KeyX") &&
        this.state?.player.controlledVehicleId) {
        event.preventDefault();
        if (deliberateExit(this.state)) this.startGesture(event.code, "exit");
        else this.command({ type: "exit" });
        return;
      }
      const commands: Record<string, GameCommand> = {
        KeyE: { type: "interact" }, KeyQ: { type: "scan" },
        KeyB: { type: "buoy" }, KeyF: { type: "eat" },
        KeyG: { type: "distraction" }, KeyH: { type: "hint" }, KeyX: { type: "exit" },
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
      this.validateGesture();
      for (const event of result.events)
        if (
          event.type === "foundation-boundary" &&
          now - this.lastBoundaryNotice > 6000
        ) {
          this.view.notify(
            "Upper-Canopy survey boundary. Prepare at a refuge before the later Basin expedition; that route is not yet open.",
          );
          this.lastBoundaryNotice = now;
        }
      this.session.autosave();
    });
    if (this.state) this.view.target(this.active ? aimedInteraction(this.state, this.world) : null);
    if (this.state && now - this.hudTime > 90) {
      this.view.update(this.state, this.input?.cruise ?? false, this.forwardThrust);
      this.hudTime = now;
    }
    if (
      this.renderer &&
      this.graphicsAvailable &&
      !document.hidden &&
      (this.active || this.dirty || this.view.canvas.dataset.ready !== "true")
    ) {
      try {
        this.renderer.present(this.state, { target: this.active && this.state ? aimedInteraction(this.state, this.world)?.host ?? null : null });
        this.dirty = false;
      } catch (error) {
        this.pause();
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

  private entered(): void {
    if (this.disposed) return;
    this.sessionGeneration++;
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
      if (event.type === "notice") this.view.notify(event.message, event.error);
      if (event.type === "impact" && event.hullLoss > 0) {
        this.view.impact(event.hullLoss, this.state);
        this.sound.event({ type: "sound", cue: "impact" }, this.state);
      }
      if (event.type === "interaction-panel") this.openPanel(event.panel, event.targetId);
      this.sound.event(event, this.state);
    }
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
    const result = executeCommand(this.state, command, this.world);
    this.session.state = result.state;
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
      this.view.notify(encoded.error, true);
      return;
    }
    this.download(
      encoded.value,
      `siltwake-${save.meta.savedAt.slice(0, 10)}.json`,
    );
    this.view.notify(
      "Save file exported. Import it into a compatible Siltwake build to continue.",
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
