import { Soundscape } from "../audio/sound.js";
import { executeCommand, stepGame } from "../sim/step.js";
import { createWorldQueries } from "../sim/world.js";
import { FixedStepClock } from "../sim/clock.js";
import type { GameCommand, GameEvent, GameState } from "../sim/types.js";
import { encodeSave } from "../save/codec.js";
import { SaveRepository } from "../save/repository.js";
import type { StoragePort } from "../save/repository.js";
import { browserWriterLock } from "../save/writer-lock.js";
import { ExpeditionSession } from "./session.js";
import { createRenderer } from "../render/renderer.js";
import type { GameRenderer, Quality } from "../render/renderer.js";
import { PlayerInput } from "./input.js";
import { GameView } from "../ui/view.js";

interface Settings {
  quality: Quality;
  sensitivity: number;
  invertY: boolean;
}
const DEFAULT_SETTINGS: Settings = {
  quality: "rich",
  sensitivity: 1,
  invertY: false,
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
  private releasingMouse = false;
  private disposed = false;
  private dirty = true;
  private frameId = 0;
  private hudTime = 0;
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
      closePanel: () => this.resume(),
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
      resume: () => this.resume(),
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
      lockMouse: () => this.lockMouse(),
      settings: (quality, sensitivity, invertY) =>
        this.applySettings({ quality, sensitivity, invertY }),
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
      this.input = new PlayerInput(this.view.canvas, () => this.active);
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
    window.addEventListener(
      "keydown",
      (event) => {
        if (
          this.active &&
          !event.repeat &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          const panels: Record<
            string,
            "inventory" | "craft" | "notebook" | "carrier"
          > = {
            Tab: "inventory",
            KeyI: "inventory",
            KeyK: "craft",
            KeyJ: "notebook",
            KeyV: "carrier",
          };
          const panel = panels[event.code];
          if (panel) {
            event.preventDefault();
            this.openPanel(panel);
            return;
          }
          const commands: Record<string, GameCommand> = {
            KeyE: { type: "interact" },
            KeyQ: { type: "scan" },
            KeyB: { type: "buoy" },
            KeyF: { type: "eat" },
            KeyG: { type: "distraction" },
            KeyH: { type: "hint" },
            KeyX: { type: "exit" },
          };
          if (this.state?.opening.phase !== 4 && event.code === "Space") {
            event.preventDefault();
            this.command({ type: "skip-opening" });
            return;
          }
          const command = commands[event.code];
          if (command) {
            event.preventDefault();
            this.command(command);
            return;
          }
        }

        if (event.code === "Escape") {
          event.preventDefault();
          if (this.session.confirmation || this.session.busy) {
            this.session.cancel();
            this.pause();
          } else if (this.active) this.pause();
          else if (this.state) this.resume();
        }
        if (event.code === "F5" && this.state) {
          event.preventDefault();
          this.session.manualSave();
        }
      },
      options,
    );
    let hadMouseLock = false;
    document.addEventListener(
      "pointerlockchange",
      () => {
        const locked = document.pointerLockElement === this.view.canvas;
        if (hadMouseLock && !locked && !this.releasingMouse)
          this.pause("Mouse released.");
        if (!locked) this.releasingMouse = false;
        hadMouseLock = locked;
      },
      options,
    );
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
      if (!this.state) return;
      const result = stepGame(
        this.state,
        this.input?.sample() ?? [],
        this.world,
      );
      this.session.state = result.state;
      this.events(result.events);
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
    if (this.state && now - this.hudTime > 90) {
      this.view.update(this.state, this.input?.cruise ?? false);
      this.hudTime = now;
    }
    if (
      this.renderer &&
      this.graphicsAvailable &&
      !document.hidden &&
      (this.active || this.dirty || this.view.canvas.dataset.ready !== "true")
    ) {
      try {
        this.renderer.present(this.state);
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
    if (this.state) this.view.update(this.state, false);
    const automatically = this.entryCanResume;
    this.entryCanResume = false;
    if (!automatically || !this.resume())
      this.pause("Expedition ready. Resume when ready.", false);
  }

  private resume(): boolean {
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
    this.clock.reset();
    this.paused = false;
    this.dirty = true;
    this.view.showGame();
    return true;
  }

  private pause(reason = "", interruptEntry = true): void {
    if (this.disposed) return;
    this.panelOpen = false;
    this.view.closePanel();
    if (interruptEntry) this.entryCanResume = false;
    this.paused = true;
    this.clock.reset();
    this.input?.clear();
    if (document.pointerLockElement === this.view.canvas) {
      this.releasingMouse = true;
      document.exitPointerLock();
    }
    this.view.showMenu(this.state !== null, reason);
    this.syncSessionUi();
    this.dirty = true;
  }

  private events(events: readonly GameEvent[]): void {
    for (const event of events) {
      if (event.type === "notice") this.view.notify(event.message, event.error);
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
    this.events(result.events);
    this.view.update(result.state, false);
    this.dirty = true;
    if (this.panelOpen) this.view.refreshPanel(result.state);
  }
  private openPanel(
    kind: "inventory" | "craft" | "notebook" | "carrier",
  ): void {
    if (
      !this.active ||
      !this.state ||
      this.session.busy ||
      this.session.confirmation
    )
      return;
    this.pause("", true);
    this.panelOpen = true;
    this.view.openPanel(kind, this.state);
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

  private lockMouse(): void {
    if (!this.state || !this.renderer) return;
    this.resume();
    if (!this.active) return;
    try {
      const request = this.view.canvas.requestPointerLock();
      if (request && typeof request.catch === "function")
        void request.catch(() => {
          this.pause(
            "Mouse lock was unavailable. Click and drag or use the arrow keys.",
          );
        });
    } catch {
      this.pause(
        "Mouse lock was unavailable. Click and drag or use the arrow keys.",
      );
    }
  }

  private applySettings(settings: Settings, persist = true): void {
    this.settings = settings;
    this.renderer?.setQuality(settings.quality);
    if (this.input)
      this.input.settings = {
        sensitivity: settings.sensitivity,
        invertY: settings.invertY,
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
