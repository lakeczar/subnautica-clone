import type { GameCommand } from "../sim/types.js";
import { FIXED_SECONDS } from "../sim/clock.js";

export interface InputSettings {
  sensitivity: number;
  invertY: boolean;
}
const GAME_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "Space",
  "KeyC",
  "ShiftLeft",
  "ShiftRight",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyR",
  "KeyZ",
]);

export class PlayerInput {
  private readonly abort = new AbortController();
  private readonly held = new Set<string>();
  private drag: number | null = null;
  private dx = 0;
  private dy = 0;
  cruise = false;
  settings: InputSettings = { sensitivity: 1, invertY: false };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly isActive: () => boolean,
  ) {
    const options = { signal: this.abort.signal };
    window.addEventListener(
      "keydown",
      (event) => {
        if (
          !this.isActive() ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          !GAME_KEYS.has(event.code)
        )
          return;
        event.preventDefault();
        if (event.code === "KeyR" && !event.repeat) this.cruise = !this.cruise;
        if (event.code === "KeyW" || event.code === "KeyS") this.cruise = false;
        this.held.add(event.code);
      },
      options,
    );
    window.addEventListener(
      "keyup",
      (event) => {
        this.held.delete(event.code);
      },
      options,
    );
    canvas.addEventListener(
      "pointerdown",
      (event) => {
        if (!this.isActive() || event.button !== 0) return;
        canvas.focus({ preventScroll: true });
        if (document.pointerLockElement !== canvas) {
          this.drag = event.pointerId;
          canvas.setPointerCapture(event.pointerId);
        }
      },
      options,
    );
    canvas.addEventListener(
      "pointerup",
      (event) => {
        if (this.drag === event.pointerId) {
          if (canvas.hasPointerCapture(event.pointerId))
            canvas.releasePointerCapture(event.pointerId);
          this.drag = null;
        }
      },
      options,
    );
    canvas.addEventListener("pointercancel", () => this.clear(), options);
    window.addEventListener(
      "pointermove",
      (event) => {
        if (
          !this.isActive() ||
          (document.pointerLockElement !== canvas && this.drag === null)
        )
          return;
        this.dx += event.movementX;
        this.dy += event.movementY;
      },
      options,
    );
  }

  sample(): GameCommand[] {
    const key = (code: string): number => (this.held.has(code) ? 1 : 0);
    const sensitivity = this.settings.sensitivity * 0.0025;
    const look: GameCommand = {
      type: "look",
      yawDelta:
        this.dx * sensitivity +
        (key("ArrowRight") - key("ArrowLeft")) * 1.5 * FIXED_SECONDS,
      pitchDelta:
        this.dy * sensitivity * (this.settings.invertY ? 1 : -1) +
        (key("ArrowUp") - key("ArrowDown")) * 1.2 * FIXED_SECONDS,
    };
    this.dx = 0;
    this.dy = 0;
    return [
      look,
      {
        type: "move",
        forward: key("KeyW") + (this.cruise ? 1 : 0) - key("KeyS"),
        right: key("KeyD") - key("KeyA"),
        vertical: key("Space") - key("KeyC"),
        sprint: key("ShiftLeft") + key("ShiftRight") > 0,
        quiet: key("KeyZ") > 0,
      },
    ];
  }

  clear(): void {
    this.held.clear();
    this.dx = 0;
    this.dy = 0;
    this.cruise = false;
    if (this.drag !== null && this.canvas.hasPointerCapture(this.drag))
      this.canvas.releasePointerCapture(this.drag);
    this.drag = null;
  }

  dispose(): void {
    this.clear();
    this.abort.abort();
  }
}
