import { armTarget, fittedCabin } from "../sim/fleet.js";
import { SiltwakeAudio } from "../audio/director.js";
import { worldRegionAt } from "../render/regions.js";
import { executeCommand, relocateForCave, stepGame } from "../sim/step.js";
import { gameWorld, setKitCaveRecords } from "../sim/world.js";
import { actorBox } from "../sim/ribCollision.js";
import { HULL_COLLIDERS } from "../content/registry.js";
import { gameCaveStore } from "../render/caves/caveStore.js";
import { createCaveRuntime, type CaveHold } from "../world/caves/admission.js";
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
import { HelmControl } from "./helm.js";
import { forgetCorridorView } from "../sim/carrierStations.js";
import { GameView } from "../ui/view.js";
import type { PanelKind } from "../ui/view.js";
import { addNote, createRecorder, exportTimelineText, observe, recordSystemsEvents, resumeRecorder, TIMELINE_STORAGE_KEY } from "../sim/timeline/recorder.js";
import type { TimelineRecorder } from "../sim/timeline/recorder.js";
import { parseTimeline } from "../sim/timeline/report.js";
import { controlsActive } from "../sim/timeline/activity.js";
import { regionAtPoint } from "../content/regions/layout.js";
import { CONTENT_VERSION } from "../content/registry.js";
import { DEFAULT_FLIGHT_SETTINGS, FlightCapture, flightMode, type FlightSettings } from "./flight/capture.js";
import { gameSample, recordCommand, recordGameEvents, recordTimeline, stageView } from "./flight/game.js";
import { installTestHook, type HookRead } from "./flight/hooks.js";
import { exposure } from "../sim/survival.js";
import { BAKE_SOURCE } from "../render/bakeSource.js";

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
const FLIGHT_KEY = "siltwake.flight.v1";
/** REC-1: samples per second of the player and the renderer. */
const FLIGHT_SAMPLE_MS = 250;
declare const __BUILD_COMMIT__: string;
function readFlightSettings(): FlightSettings {
  try {
    const v = JSON.parse(localStorage.getItem(FLIGHT_KEY) ?? "null") as Partial<FlightSettings> | null;
    return { enabled: v?.enabled !== false, video: v?.video !== false };
  } catch { return { ...DEFAULT_FLIGHT_SETTINGS }; }
}
const BLOCKED_ASCENT_SECONDS = 0.45;
/** The swimming diver's box (step.ts), for cave admission. */
const DIVER_SHAPE = { radius: 0.34, height: 0.95 };
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
  /** CW-1 cave admission: kit-cave collision built before the actor reaches
   * it (held only if its records have not arrived), cave biomes through LC's
   * contract, and the guaranteed refuge. Never expected in ordinary play. */
  private readonly caveStore = gameCaveStore();
  private recordsSet = false;
  private caveHolding = false;
  private readonly caves = createCaveRuntime({
    world: this.world,
    canGenerate: () => !this.caveStore || (this.caveStore.settled && !this.caveStore.collision),
    clear: (feet) => {
      const s = this.state, v = s?.fleet.vehicles.find(x => x.id === s.player.controlledVehicleId);
      return this.world.clearance(feet, v ? HULL_COLLIDERS[v.hull] : DIVER_SHAPE);
    },
  });
  private readonly repository = new SaveRepository(
    storagePort(),
    browserWriterLock(navigator.locks),
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
  /** Local-only play timeline (SYS-2, C4): never in the save, never sent. */
  private timeline: TimelineRecorder | null = null;
  private timelineSaved = 0;
  /** REC-1 flight recorder (null when off) and its per-frame bookkeeping. */
  private flight: FlightCapture | null = null;
  private flightSettings = readFlightSettings();
  private flightTimeline = 0;
  private flightLast = 0;
  private flightHeap: number | null = null;
  private flightSampleAt = 0;
  private flightFrames = 0;
  private flightHidden = false;
  /** Test hook: the simulation clock is held for a fixed-view capture. */
  private frozen = false;
  private readonly uninstallHook: () => void;

  constructor(root: HTMLElement) {
    this.session = new ExpeditionSession(this.repository, {
      changed: () => this.syncSessionUi(),
      pause: () => this.pause("", false),
      entered: () => this.entered(),
      notify: (message, error, options) => this.view.notify(message, error, options, this.state),
      saved: (o) => this.flight?.recorder.event("save", `${o.manual ? "manual" : "auto"}save ${o.ok ? "ok" : `failed: ${o.error ?? ""}`} in ${o.ms.toFixed(0)} ms`,
        { tick: o.tick, detail: { manual: o.manual, ok: o.ok, ms: Math.round(o.ms) }, snapshot: !o.ok }),
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
      flight: (settings) => {
        this.flightSettings = settings;
        this.view.flightSettings(settings);
        try { localStorage.setItem(FLIGHT_KEY, JSON.stringify(settings)); } catch {}
      },
      exportFlight: () => void this.exportFlight(),
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
    this.view.flightSettings(this.flightSettings);
    this.startFlight();
    this.uninstallHook = installTestHook({
      read: () => this.hookRead(),
      stats: () => this.renderer?.stats() ?? null,
      freeze: (on) => { this.frozen = on; this.clock.reset(); this.dirty = true; },
      capture: () => this.flight,
      stage: (v) => {
        if (this.flight?.mode !== "driver" || !this.state) return false;
        this.session.state = stageView(this.state, v);
        this.helm.clear();
        this.resetAscent();
        this.flight.recorder.event("mark", `staged view at ${[v.position.x, v.position.y, v.position.z].map(n => n.toFixed(1)).join(",")}`, { snapshot: false, detail: { ...v } });
        this.dirty = true;
        return true;
      },
    });
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
        if (document.hidden) {
          this.flightHidden = true;
          this.pause("Paused while this tab is in the background.");
        }
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

  /** Cave admission for the controlled actor, before anything steps (CW-1). */
  private caveAdmission(now: number): CaveHold | null {
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
    } else if (hold.holding && !this.caveHolding) this.view.notify(hold.message, false, { channel: "system" });
    this.caveHolding = hold.holding && !hold.relocate;
    this.view.canvas.dataset.caveHold = hold.state;
    return hold;
  }

  private frame(now: number): void {
    if (this.disposed) return;
    // Frame timing for measurement harnesses only (CW-1 traversal): a page
    // that defines `__siltwakePerf` gets one entry per frame.
    const perf = (globalThis as { __siltwakePerf?: unknown[] }).__siltwakePerf;
    const timed = !!perf || !!this.flight;
    const started = timed ? performance.now() : 0;
    let simMs = 0, steps = 0, saveMs = 0;
    // Baked cave records, once they land (the pack is fetched at start).
    if (!this.recordsSet && (!this.caveStore || this.caveStore.settled)) {
      if (this.caveStore?.collision) setKitCaveRecords(this.caveStore.collision);
      this.recordsSet = true;
    }
    // While a cave holds, the simulation clock is paused (no oxygen, exposure,
    // power or AI ticks); rendering carries on.
    const hold = this.active ? this.caveAdmission(now) : null;
    // Likewise while the view settles after a jump (respawn, refuge, rescue).
    this.clock.advance(now, this.active && !hold?.holding && !this.renderer?.settling && !this.frozen, () => {
      if (!this.state || !this.active) return;
      const stepStart = timed ? performance.now() : 0;
      try { this.step(now); } finally { if (timed) { simMs += performance.now() - stepStart; steps++; saveMs += this.lastSaveMs; } }
    });
    const presentStart = timed ? performance.now() : 0;
    this.present(now);
    const presentEnd = timed ? performance.now() : 0;
    if (this.flight) this.recordFrame(now, presentEnd - started, simMs, steps, saveMs, hold?.state ?? null);
    if (perf) perf.push({ at: now, total: presentEnd - started, sim: simMs, steps, save: saveMs, present: presentEnd - presentStart,
      hud: this.lastHudMs, parts: this.renderer?.parts ?? null, hold: hold?.state ?? null });
    this.frameId = requestAnimationFrame((time) => this.frame(time));
  }

  /** REC-1: this frame's row, the periodic sample, then the snapshot and video
   * frame (after the render, while the drawing buffer is this frame's). */
  private recordFrame(now: number, work: number, sim: number, steps: number, save: number, hold: string | null): void {
    const fl = this.flight!;
    let recStart = performance.now();
    this.flightFrames++;
    if (now >= this.flightSampleAt) {
      this.flightSampleAt = now + FLIGHT_SAMPLE_MS;
      const r = this.hookRead();
      fl.sample(gameSample(now, this.state, this.renderer?.stats() ?? null, r?.camera ?? null, hold, this.active, this.flightFrames));
      this.flightFrames = 0;
      const sampled = performance.now();
      fl.recorder.charge(sampled - recStart, "sample");
      recStart = sampled;
    }
    let gap = this.flightLast ? now - this.flightLast : 0;
    if (this.flightHidden) {
      // A hidden tab has no frames: its interval is not a frame time.
      fl.recorder.event("session", `tab hidden for ${(gap / 1000).toFixed(1)} s`, { t: now, snapshot: false });
      this.flightHidden = false;
      gap = 0;
    }
    this.flightLast = now;
    const heap = fl.heapNow();
    const heapDrop = heap !== null && this.flightHeap !== null ? Math.max(0, this.flightHeap - heap) : undefined;
    this.flightHeap = heap;
    const p = this.renderer?.parts;
    for (const g of p?.gpuDone ?? []) fl.recorder.gpuResolved(g.tag, g.ms);
    fl.recorder.frame({ t: now, gap, work, sim, steps, save, hud: this.lastHudMs, hold,
      ...(p ? { chunks: p.chunks, caves: p.caves, regions: p.regions, lights: p.lights, actors: p.actors, render: p.render, dom: p.dom ?? 0, gpuTag: p.gpuTag } : {}),
      ...(heapDrop !== undefined ? { heapDrop } : {}) }, performance.now() - recStart);
    // Pictures only from a frame that drew: otherwise the canvas holds nothing current.
    if (this.drewFrame) fl.afterRender(now);
    this.drewFrame = false;
  }
  private drewFrame = false;

  /** The test hook's reading of the game (hooks.ts HookRead). */
  private hookRead(): HookRead | null {
    const s = this.state;
    if (!s) return null;
    const v = s.player.controlledVehicleId ? s.fleet.vehicles.find(x => x.id === s.player.controlledVehicleId) ?? null : null;
    const p = s.player.pose, vel = v ? v.velocity : s.player.velocity, feet = v ? v.pose.position : p.position;
    const cam = (this.view.canvas.dataset.cameraPosition ?? "").split(",").map(Number);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    return {
      tick: s.tick, phase: s.opening.phase, mode: s.player.mode, active: this.active, frozen: this.frozen,
      ready: this.view.canvas.dataset.ready === "true", settling: !!this.renderer?.settling,
      camera: cam.length === 3 && cam.every(Number.isFinite) ? cam as [number, number, number] : [feet.x, feet.y, feet.z],
      feet: [r2(feet.x), r2(feet.y), r2(feet.z)],
      yaw: r2(((p.yaw * 180) / Math.PI + 360) % 360), pitch: r2((p.pitch * 180) / Math.PI),
      depth: s.opening.phase >= 4 ? r2(exposure(s).pressureDepth) : 0,
      region: regionAtPoint(feet.x, feet.z), cave: this.view.canvas.dataset.cave || null,
      hold: this.view.canvas.dataset.caveHold ?? null,
      vitals: { health: s.player.vitals.health, oxygen: s.player.vitals.oxygen, food: s.player.vitals.food },
      speed: r2(Math.hypot(vel.x, vel.y, vel.z)),
      craft: v ? { id: v.id, hull: v.hull, charge: v.charge, health: v.health, disabled: v.disabled } : null,
      lamp: s.player.lamp,
    };
  }

  private startFlight(): void {
    const { mode, video } = flightMode(this.flightSettings);
    if (mode === "off" || !this.renderer) return;
    try {
      this.flight = new FlightCapture(this.view.canvas, mode, video, {
        content: CONTENT_VERSION,
        bake: BAKE_SOURCE ?? "",
        commit: typeof __BUILD_COMMIT__ === "string" ? __BUILD_COMMIT__ : "",
      });
      this.renderer.timing = true;
    } catch (error) {
      console.warn(`flight recorder unavailable: ${errorText(error)}`);
      this.flight = null;
    }
  }

  private async exportFlight(): Promise<void> {
    if (!this.flight) { this.view.notify("The flight recorder is off. Turn it on in Settings; it starts with the next load.", true, { channel: "system" }); return; }
    this.view.notify("Preparing the flight recording…", false, { channel: "system" });
    try {
      const { blob, name } = await this.flight.exportZip();
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      this.view.notify(`Flight recording exported (${(blob.size / 1048576).toFixed(0)} MB). It stays on this computer unless you share the file.`, false, { channel: "system" });
    } catch (error) {
      this.view.notify(`The flight recording could not be exported: ${errorText(error)}`, true, { channel: "system" });
    }
  }

  /** One fixed simulation step with this frame's input. */
  private step(now: number): void {
    if (!this.state || !this.active) return;
    const gesture = this.sampleGesture();
    const controls = this.helm.apply(this.state, this.input?.sample() ?? []);
    this.forwardThrust = controls.find(c => c.type === "move")?.forward ?? 0;
    const result = stepGame(
      this.state,
      [...controls, ...gesture],
      this.world,
    );
    this.session.state = result.state;
    this.events(result.events);
    this.observeTimeline(result.state, [...controls, ...gesture], result.events);
    if (this.flight) {
      recordGameEvents(this.flight.recorder, result.state, result.events);
      for (const c of gesture) recordCommand(this.flight.recorder, result.state, c);
      if (this.timeline) this.flightTimeline = recordTimeline(this.flight.recorder, this.timeline.events, this.flightTimeline);
    }
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
    const saveStart = performance.now();
    this.session.autosave();
    this.lastSaveMs = performance.now() - saveStart;
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
        this.drewFrame = true;
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
    // A zero look or move is not input; a command or panel action since the last
    // observation is (C4B-06).
    const input = controlsActive(controls) || this.timelineActivity;
    this.timelineActivity = false;
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
        if (this.flight) this.flightTimeline = recordTimeline(this.flight.recorder, this.timeline.events, this.flightTimeline);
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
    this.flightTimeline = this.timeline?.events.length ?? 0;
    if (this.flight && this.state) {
      const meta = this.session.envelope()?.meta;
      this.flight.recorder.event("load", `expedition entered at tick ${this.state.tick}`, { tick: this.state.tick,
        detail: { session: meta?.sessionId ?? null, savedAt: meta?.savedAt ?? null, scenario: this.state.scenario } });
    }
    // A loaded save neither replays its history nor inherits old cooldowns.
    this.sound.reset();
    this.resolutionPhase = this.state?.story.resolution.phase ?? null;
    this.resetAscent();
    this.cancelGesture();
    // UX-1: a replaced session inherits no head look or rudder, before its first frame.
    this.helm.clear();
    forgetCorridorView();
    this.view.resetPresentation();
    // A save loaded beside or inside a cave: admit it now, behind the load
    // screen, before the first tick (a hold carries on into play otherwise).
    if (this.recordsSet) this.caveAdmission(performance.now());
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
    const result = executeCommand(this.state, command, this.world);
    this.session.state = result.state;
    if (this.flight) {
      recordCommand(this.flight.recorder, result.state, command);
      recordGameEvents(this.flight.recorder, result.state, result.events);
    }
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
    cancelAnimationFrame(this.frameId);
    this.abort.abort();
    this.session.dispose();
    this.input?.dispose();
    if (document.pointerLockElement === this.view.canvas)
      document.exitPointerLock();
    this.flight?.dispose();
    this.uninstallHook();
    this.renderer?.dispose();
    this.sound.dispose();
    this.view.dispose();
  }
}
