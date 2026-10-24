/** LS-1 1b: coded doors and their keypad's command. A door is opened by typing its
 * code at its keypad; a guessed code works, a wrong one costs nothing (no lockout,
 * no penalty), and an open door stays open (`SystemsState.opened`, schema 8). What the
 * journal keeps for each door is `doorCodes` (decoder.ts). The keypad panel and its
 * input ownership are the UI's (`ui/keypad.ts`). */
import { CODED_DOORS, DOOR_IDS, doorPlaced } from "../../content/systems/decodes.js";
import type { DoorId } from "../../content/systems/decodes.js";
import { distance } from "../inventory.js";
import type { GameState } from "../types.js";

/** Metres from a door's keypad within which it takes a code. */
export const DOOR_REACH = 4;
export const isDoorId = (id: unknown): id is DoorId => typeof id === "string" && (DOOR_IDS as readonly string[]).includes(id);
/** The typed outcome of entering a code (steward F17): a refusal changes nothing; a
 * wrong code is an accepted attempt that changes nothing either. */
export type CodeOutcome =
  | { ok: true; outcome: "opened" | "wrong" | "already-open"; door: DoorId; message: string }
  | { ok: false; message: string };

/** The code as typed, digits only (spaces, dashes and dots are how people write it down). */
export const normaliseCode = (typed: string): string => typed.replace(/[^0-9]/g, "");

export function enterCode(s: GameState, door: string, typed: string): CodeOutcome {
  if (!isDoorId(door) || !doorPlaced(door)) return { ok: false, message: "Nothing here takes a code." };
  const d = CODED_DOORS[door];
  if (!d.position || distance(s.player.pose.position, d.position) > DOOR_REACH) return { ok: false, message: `Move to the ${d.label.toLowerCase()}'s keypad.` };
  if (s.systems.opened.includes(door)) return { ok: true, outcome: "already-open", door, message: `The ${d.label.toLowerCase()} is already open.` };
  if (normaliseCode(typed) !== d.code) return { ok: true, outcome: "wrong", door, message: `The keypad blinks red. That code doesn't open the ${d.label.toLowerCase()}.` };
  s.systems.opened.push(door);
  return { ok: true, outcome: "opened", door, message: `The ${d.label.toLowerCase()} unlocks.` };
}
