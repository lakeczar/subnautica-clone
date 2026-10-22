/** W2 phase 2: the crown station's rules as pure functions over GameState.
 * The stages are ordinary facilities (`world.facilities`), so these read the
 * same `facility()` check every stop uses and need no saved field of their
 * own. C4 stage B composes them: survival reads `bunkHealRate`, fabrication
 * reads `crownBenchServes`, service reads `crownDockServes`, and the wake rule
 * reads the REST_BASES row (see `content/hub/crownStation.ts`). */
import { CROWN_BENCH_SITES, CROWN_STAGES, CROWN_STATION, type CrownService, type CrownStageId } from "../../content/hub/crownStation.js";
import { facility } from "../inventory.js";
import type { GameState, Vec3 } from "../types.js";

const dist = (a: Readonly<Vec3>, b: Readonly<Vec3>): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Stages restored, counted in order: a later stage without the one before it
 * counts for nothing (the recipes' `needs` already forbid that). */
export function crownStage(s: GameState): 0 | 1 | 2 | 3 {
  let n = 0;
  for (const stage of CROWN_STAGES) { if (!facility(s, stage.id)) break; n++; }
  return n as 0 | 1 | 2 | 3;
}
export const crownStageRestored = (s: GameState, id: CrownStageId): boolean =>
  crownStage(s) > CROWN_STAGES.findIndex(x => x.id === id);

/** Every service the restored stages provide. */
export function crownServices(s: GameState): ReadonlySet<CrownService> {
  return new Set(CROWN_STAGES.slice(0, crownStage(s)).flatMap(x => x.services));
}

/** The diver is at the station's door, on foot or swimming, out of any craft. */
export function atCrownStation(s: GameState): boolean {
  const p = s.player;
  return dist(p.pose.position, CROWN_STATION.work) < CROWN_STATION.workRadius && !p.controlledVehicleId && !p.interiorId;
}
/** Breathing and resting at the station: a refuge once power and air work. */
export const crownRefuge = (s: GameState): boolean => atCrownStation(s) && crownServices(s).has("air");

/** Health per second for a diver resting in a refuge: the crown's bunk heals
 * three times as fast as any other refuge once restored. */
export function bunkHealRate(s: GameState): number {
  return crownRefuge(s) && crownServices(s).has("fast_heal") ? CROWN_STATION.bunkHealRate : CROWN_STATION.refugeHealRate;
}

/** A craft is moored at the dock: unberthed and within the dock's radius. */
export function crownDockServes(s: GameState, vehicleId: string): boolean {
  if (!crownServices(s).has("dock")) return false;
  const v = s.fleet.vehicles.find(x => x.id === vehicleId);
  return !!v && dist(v.pose.position, CROWN_STATION.dock) <= CROWN_STATION.dockRadius;
}

/** The station's bench crafts `site`'s recipes: its own restorations from the
 * start; once the dock stage works, the workshop's refits and upgrades and the
 * pod's basic fabrication too (never the yard's hull builds). */
export function crownBenchServes(s: GameState, site: string): boolean {
  if (!atCrownStation(s)) return false;
  if (site === "crown_station") return true;
  return crownServices(s).has("refit_bench") && (CROWN_BENCH_SITES as readonly string[]).includes(site);
}

/** Locker capacity at the station now, CU. */
export function crownLockerCu(s: GameState): number {
  const on = crownServices(s);
  return on.has("large_lockers") ? CROWN_STATION.largeLockerCu : on.has("locker") ? CROWN_STATION.lockerCu : 0;
}
/** Module sockets that work now. */
export const crownSockets = (s: GameState): number => crownServices(s).has("sockets") ? CROWN_STATION.sockets : 0;

/** The survey array marks scanned materials within range of the station. */
export function crownSurveyReaches(s: GameState, at: { readonly x: number; readonly z: number }): boolean {
  return crownServices(s).has("survey") &&
    Math.hypot(at.x - CROWN_STATION.work.x, at.z - CROWN_STATION.work.z) <= CROWN_STATION.surveyRange;
}
/** The summit beacon is lit (presentation reads this once composed). */
export const crownBeaconLit = (s: GameState): boolean => crownServices(s).has("beacon");

/** Where an incapacitated diver wakes, by C4's rule with the crown's row:
 * the base rested at last if it still works, otherwise the pod. The pod never
 * depends on the crown's power. */
export function wakeBase(s: GameState, restedAt: string): "crown_station" | "home_pod" | string {
  if (restedAt === "crown_station") return crownServices(s).has("rest") ? "crown_station" : "home_pod";
  return restedAt;
}
