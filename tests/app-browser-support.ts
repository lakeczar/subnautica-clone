// Stands in for the renderer, view and input in the app tests (loaded by tests/app-loader.ts); not a test file itself.
// Readiness is set directly here, so the app tests prove session and save wiring, never rendered readiness, physical input or GPU behaviour.
import type { GameCommand, GameState, NoticeOptions, Vec3 } from "../src/sim/types.js";
import type { SaveSlot } from "../src/save/repository.js";
export { deliberateExit, controlHasFocus, textEntryHasFocus } from "../src/runtime/input.js";
import type { UiActions } from "../src/ui/view.js";
import { MemoryStorage, TestWriterLock } from "./persistence-support.js";

class TestCanvas extends EventTarget {
  dataset: Record<string, string> = {};
  focus(): void { (document as unknown as { activeElement: unknown }).activeElement = this; }
  captures = 0;
  lock: () => Promise<void> | void = () => { this.captures++; };
  requestPointerLock(): Promise<void> | void { return this.lock(); }
}
export class GameView {
  static current: GameView;
  readonly canvas = new TestCanvas();
  screen = "menu";
  state: GameState | null = null;
  reason = "";
  notices: string[] = [];
  noticeRecords: { message: string; error: boolean; options: NoticeOptions }[] = [];
  presentationSteps: { tick: number; mode: string; threat: string; vehicleId: string | null }[] = [];
  calls: { origin: Vec3; tick: number; mode: string }[] = [];
  blocked: boolean[] = [];
  thrustBlocked: boolean[] = [];
  observations: { kind: string; tick: number | null }[] = [];
  disposed = false;
  currentPanel: string | null = null;
  lookVisible = false;
  fallback = false;
  lastSettings: unknown[] = [];
  progress: { kind: string | null; progress: number } = { kind: null, progress: 0 };
  targetId: string | null = null;
  constructor(
    _root: HTMLElement,
    readonly actions: UiActions,
  ) {
    GameView.current = this;
  }
  slot(_slot: SaveSlot, _hasSession: boolean): void {}
  /** Whether the menu shows Repair play timeline. */
  repairVisible = false;
  timelineRepair(visible: boolean): void { this.repairVisible = visible; }
  persistence(
    _message: string,
    _automatic: boolean,
    _hasSession: boolean,
    _busy: boolean,
  ): void {}
  settings(...settings: unknown[]): void { this.lastSettings = settings; }
  lookAction(visible: boolean, fallback = false): void { this.lookVisible = visible; this.fallback = fallback; }
  target(): void {}
  gesture(kind: string | null, progress: number): void { this.progress = { kind, progress }; }
  impact(): void {}
  cancelFeedback(): void {}
  resetPresentation(): void {}
  presentationStep(state: GameState): void {
    this.presentationSteps.push({ tick: state.tick, mode: state.player.mode, threat: state.world.threat.mode, vehicleId: state.player.controlledVehicleId });
    this.observations.push({ kind: "step", tick: state.tick });
  }
  threatCall(origin: Vec3, state: GameState): void {
    this.calls.push({ origin: { ...origin }, tick: state.tick, mode: state.world.threat.mode });
    this.observations.push({ kind: "call", tick: state.tick });
  }
  blockedAscent(visible: boolean): void { this.blocked.push(visible); }
  blockedThrust(visible: boolean): void { this.thrustBlocked.push(visible); }
  audioSettings(): void {}
  captions: { cue: string; text: string; essential: boolean }[] = [];
  audioCaption(caption: { cue: string; text: string; essential: boolean }): void { this.captions.push({ cue: caption.cue, text: caption.text, essential: caption.essential }); }
  confirmation(): void {}
  cancelConfirmation(): void {}
  showMenu(_hasSession: boolean, reason = ""): void {
    this.screen = "menu";
    this.reason = reason;
  }
  closePanel(): void { this.currentPanel = null; }
  openPanel(kind: string, _state: GameState, targetId?: string): void {
    this.currentPanel = kind;
    this.targetId = targetId ?? null;
    this.screen = "panel";
  }
  refreshPanel(): void {}
  showGame(): void {
    this.screen = "playing";
  }
  update(state: GameState): void {
    this.state = structuredClone(state);
  }
  notify(message: string, error = false, options: NoticeOptions = {}): void {
    this.notices.push(message);
    this.noticeRecords.push({ message, error, options: { ...options } });
    this.observations.push({ kind: "notice", tick: null });
  }
  graphicsError(message: string): void {
    throw new Error(message);
  }
  dispose(): void {
    this.disposed = true;
  }
}
export class PlayerInput {
  /** Controls every sample returns while set (UX-1's helm tests); none by default. */
  static scripted: GameCommand[] | null = null;
  cruise = false;
  settings = { sensitivity: 1, invertY: false, keyTurnSpeed: 1 };
  clear(): void {
    this.cruise = false;
  }
  sample(): GameCommand[] {
    return PlayerInput.scripted ? PlayerInput.scripted.map((c) => ({ ...c })) : [];
  }
  dispose(): void {}
}
export class TestRenderer {
  static current: TestRenderer;
  presents = 0;
  disposed = false;
  constructor(
    private readonly canvas: TestCanvas,
    private readonly availability?: (available: boolean) => void,
  ) {
    TestRenderer.current = this;
  }
  /** The helm head look of the latest present (UX-1). */
  look: { yaw: number; pitch: number } | null = null;
  present(_state?: unknown, overlay?: { look?: { yaw: number; pitch: number } }): void {
    this.presents++;
    this.look = overlay?.look ? { ...overlay.look } : null;
    this.canvas.dataset.ready = "true";
  }
  /** Idle preparation calls; ticks with an active session must never prepare. */
  prepares: number[] = [];
  prepare(): boolean {
    this.prepares.push(this.presents);
    return false;
  }
  setQuality(): void {}
  resize(): void {}
  dispose(): void {
    this.disposed = true;
  }
  lose(): void {
    this.canvas.dispatchEvent(
      new Event("webglcontextlost", { cancelable: true }),
    );
    this.availability?.(false);
  }
  nativeRestore(): void {
    this.canvas.dispatchEvent(new Event("webglcontextrestored"));
  }
  finishRestore(): void {
    this.availability?.(true);
  }
}
export function createRenderer(
  canvas: TestCanvas,
  availability?: (available: boolean) => void,
): TestRenderer {
  return new TestRenderer(canvas, availability);
}

/** Task-owned DOM/event and RAF scheduler; no wall-clock sleeps or state setters. */
export function browserFixture() {
  const storage = new MemoryStorage(),
    lock = new TestWriterLock();
  const window = Object.assign(new EventTarget(), { localStorage: storage });
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    pointerLockElement: null as TestCanvas | null,
    activeElement: null as TestCanvas | null,
    exitPointerLock: () => {
      document.pointerLockElement = null;
    },
  });
  let nextId = 0,
    now = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const values = {
    window,
    document,
    localStorage: storage,
    navigator: {
      userActivation: { isActive: false },
      locks: {
        request: (
          name: string,
          options: LockOptions,
          callback: () => unknown,
        ) => lock.runExclusive(name, options.signal!, callback),
      },
    },
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(++nextId, callback);
      return nextId;
    },
    cancelAnimationFrame: (id: number) => {
      frames.delete(id);
    },
  };
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  for (const [key, value] of Object.entries(values))
    Object.defineProperty(globalThis, key, { configurable: true, value });
  return {
    storage,
    lock,
    window,
    document,
    activation: values.navigator.userActivation,
    key(code: string, type = "keydown", repeat = false): void {
      window.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { code, repeat }));
    },
    locked(locked: boolean): void {
      document.pointerLockElement = locked ? GameView.current.canvas : null;
      document.dispatchEvent(new Event("pointerlockchange"));
    },
    frames(count = 12): void {
      for (let i = 0; i < count; i++) {
        now += 1000 / 60;
        const callbacks = [...frames.values()];
        frames.clear();
        for (const callback of callbacks) callback(now);
      }
    },
    escape(): void {
      window.dispatchEvent(
        Object.assign(new Event("keydown"), { code: "Escape" }),
      );
    },
    hidden(hidden: boolean): void {
      document.hidden = hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    },
    restore(): void {
      for (const [key, descriptor] of Object.entries(previous)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}
