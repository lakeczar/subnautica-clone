/** LS-1 1b: the coded-door keypad (docs/build/streams/LS-1.md, *Keypad contract*;
 * access research barrier #2). A game panel: `App.openPanel` and pause already clear
 * held keys, cruise and gestures and release capture, and the game panel's Tab
 * containment applies. This module is the panel itself, behind a seam the app drives:
 * the model, the markup (a labelled code field) and the key handling with explicit
 * precedence. The app wiring (`runtime/app.ts`) lands after CW-1 merges.
 *
 * Keys while the keypad owns input:
 * - characters, number row and numpad digits: typed text (the key's character, never a
 *   physical movement code);
 * - Backspace edits, Enter submits (`enter-code`), Escape closes the keypad only;
 * - Tab moves focus inside the panel (the game panel's containment);
 * - everything else is consumed: F5 never saves while typing, and E, Q, J, K and the
 *   craft digits never act. */
import { CODED_DOORS } from "../content/systems/decodes.js";
import type { DoorId } from "../content/systems/decodes.js";
import { doorCodes } from "../sim/systems/decoder.js";
import type { GameCommand, GameState } from "../sim/types.js";
import { escapeHtml as esc } from "./format.js";

/** The longest code the field takes. */
export const KEYPAD_MAX = 8;
export interface KeypadModel {
  door: DoorId;
  label: string;
  /** A deduction door's own part of the code, as stencilled on it (`·` for the rest). */
  atDoor: string | null;
  /** What the journal keeps for this door: a code, or a deduction clue. Nothing to memorise. */
  journal: string | null;
  open: boolean;
}
export function keypadModel(s: GameState, door: DoorId): KeypadModel {
  const d = CODED_DOORS[door], kept = doorCodes(s.systems).find((c) => c.door === door);
  return { door, label: d.label, atDoor: d.atDoor ?? null, open: s.systems.opened.includes(door),
    journal: kept ? (kept.code ? `Code ${kept.code.split("").join("-")}` : kept.clue) : null };
}

export interface KeypadState { door: DoorId; text: string }
export type KeypadAction = "edit" | "submit" | "cancel" | "focus" | "consumed";
export interface KeypadKeyResult { state: KeypadState; action: KeypadAction; command?: GameCommand }
/** One key while the keypad owns input. `key` is `KeyboardEvent.key` (the character typed). */
export function keypadKey(st: KeypadState, key: string): KeypadKeyResult {
  if (key === "Escape") return { state: st, action: "cancel" };
  if (key === "Enter") return { state: st, action: "submit", command: { type: "enter-code", door: st.door, code: st.text } };
  if (key === "Backspace") return { state: { ...st, text: st.text.slice(0, -1) }, action: "edit" };
  if (key === "Tab") return { state: st, action: "focus" };
  if (/^[0-9]$/.test(key)) return { state: { ...st, text: (st.text + key).slice(0, KEYPAD_MAX) }, action: "edit" };
  return { state: st, action: "consumed" };
}
/** The panel's markup: the door, its stencil, what the journal keeps, and a labelled field. */
export function renderKeypad(m: KeypadModel, st: KeypadState, feedback: string | null = null): string {
  const field = `Door code, ${m.label}`;
  return `<section class="keypad" aria-label="Keypad, ${esc(m.label)}"><h3>${esc(m.label)}</h3>${
    m.open ? `<p>Open.</p>` : ""}${
    m.atDoor ? `<p class="door-stencil">Stencilled on the door: <b>${esc([...m.atDoor].join(" "))}</b></p>` : ""}${
    m.journal ? `<p class="journal-hint">From your journal: ${esc(m.journal)}</p>` : ""}<label for="keypad-code">${esc(field)}</label><input id="keypad-code" class="keypad-code" data-focus-key="keypad-code" inputmode="numeric" autocomplete="off" maxlength="${KEYPAD_MAX}" aria-label="${esc(field)}" value="${esc(st.text)}"${
    m.open ? " disabled" : ""}><p class="keypad-keys"><kbd>Enter</kbd> try · <kbd>Backspace</kbd> delete · <kbd>Esc</kbd> close</p>${
    feedback ? `<p class="keypad-feedback" role="status">${esc(feedback)}</p>` : ""}</section>`;
}

/** What the app gives the keypad (wired in `runtime/app.ts` after CW-1): send a command
 * through the step, close the panel (restoring a valid focus target without reviving
 * held input or recapturing), show the markup, and focus the code field. */
export interface KeypadSeam {
  dispatch(command: GameCommand): { feedback: string | null };
  close(): void;
  render(html: string): void;
  focusField(): void;
}
/** The keypad panel: one door, its typed text, and the last attempt's feedback. */
export class KeypadPanel {
  private st: KeypadState | null = null;
  private feedback: string | null = null;
  constructor(private readonly seam: KeypadSeam) {}
  get door(): DoorId | null { return this.st?.door ?? null; }
  open(s: GameState, door: DoorId): void {
    this.st = { door, text: "" };
    this.feedback = null;
    this.seam.render(renderKeypad(keypadModel(s, door), this.st));
    this.seam.focusField();
  }
  /** A key while the panel owns input; true when the keypad handled it (always, while open). */
  key(s: GameState, key: string): boolean {
    if (!this.st) return false;
    const r = keypadKey(this.st, key);
    this.st = r.state;
    if (r.action === "cancel") { this.st = null; this.seam.close(); return true; }
    if (r.action === "submit" && r.command) {
      this.feedback = this.seam.dispatch(r.command).feedback;
      this.st = { ...this.st, text: "" };
    }
    if (r.action === "edit" || r.action === "submit") this.seam.render(renderKeypad(keypadModel(s, this.st.door), this.st, this.feedback));
    return true;
  }
}
