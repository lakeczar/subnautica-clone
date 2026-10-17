import type { GameState } from "../src/sim/types.js";
import type { SaveSlot } from "../src/save/repository.js";
import type { UiActions } from "../src/ui/view.js";
import { MemoryStorage, TestWriterLock } from "./persistence-support.js";

class TestCanvas extends EventTarget {
  dataset: Record<string, string> = {};
  focus(): void {}
}
export class GameView {
  static current: GameView;
  readonly canvas = new TestCanvas();
  screen = "menu";
  state: GameState | null = null;
  reason = "";
  notices: string[] = [];
  disposed = false;
  constructor(
    _root: HTMLElement,
    readonly actions: UiActions,
  ) {
    GameView.current = this;
  }
  slot(_slot: SaveSlot, _hasSession: boolean): void {}
  persistence(
    _message: string,
    _automatic: boolean,
    _hasSession: boolean,
    _busy: boolean,
  ): void {}
  settings(): void {}
  audioSettings(): void {}
  confirmation(): void {}
  cancelConfirmation(): void {}
  showMenu(_hasSession: boolean, reason = ""): void {
    this.screen = "menu";
    this.reason = reason;
  }
  closePanel(): void {}
  openPanel(): void {
    this.screen = "panel";
  }
  refreshPanel(): void {}
  showGame(): void {
    this.screen = "playing";
  }
  update(state: GameState): void {
    this.state = structuredClone(state);
  }
  notify(message: string): void {
    this.notices.push(message);
  }
  graphicsError(message: string): void {
    throw new Error(message);
  }
  dispose(): void {
    this.disposed = true;
  }
}
export class PlayerInput {
  cruise = false;
  settings = { sensitivity: 1, invertY: false };
  clear(): void {
    this.cruise = false;
  }
  sample(): [] {
    return [];
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
  present(): void {
    this.presents++;
    this.canvas.dataset.ready = "true";
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
