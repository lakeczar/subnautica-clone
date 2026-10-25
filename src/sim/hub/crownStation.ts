/** HUB-2: the crown station's own rules. Everything else the station does
 * runs through C4's composed paths, gated by its stages: the stop row in
 * `content/stops.ts` (air, mooring service, bench, lockers), the fixed host in
 * `content/systems/hosts.ts` (sockets, the built-in survey), the rest base in
 * `content/bases.ts` (waking) and the bench rule in `progression.ts`. */
import { CROWN_FACILITIES, CROWN_STATION } from "../../content/hub/crownStation.js";
import { atAirStop, facility } from "../inventory.js";
import type { GameState } from "../types.js";

/** Health per second in any other refuge (survival's rate). */
export const REFUGE_HEAL_RATE = 1.8;

/** Stages restored, counted in order (the recipes' `needs` keep that order). */
export function crownStage(s: GameState): 0 | 1 | 2 | 3 {
  let n = 0;
  for (const id of CROWN_FACILITIES) { if (!facility(s, id)) break; n++; }
  return n as 0 | 1 | 2 | 3;
}

/** Health per second for a diver resting in a refuge: three times as fast in
 * the crown station's bunk, which works once power and air are restored. */
export function bunkHealRate(s: GameState): number {
  return atAirStop(s) === "crown_station" ? CROWN_STATION.bunkHealRate : REFUGE_HEAL_RATE;
}
