/** Playthrough timeline: what one run did, phase by phase and leg by leg.
 * Plain JSON so a run can be diffed between milestones. */

export type PhaseStatus =
  /** Played to completion through real commands. */
  | "pass"
  /** Declared content the phase needs is not in this build yet (C3 wiring). */
  | "pending-c3"
  /** The game refused or trapped the harness: a finding to report, not to work around. */
  | "blocked"
  /** An earlier phase did not pass, so this one was not attempted. */
  | "skipped";

export interface Minima {
  oxygen: number;
  food: number;
  health: number;
  /** Lowest charge of the craft being piloted (or occupied) during the leg; null if none. */
  power: number | null;
  /** Lowest health of that craft; null if none. */
  hull: number | null;
}

export interface LegRecord {
  phase: string;
  leg: string;
  /** "travel" legs are the labelled travel helper; everything else is direct commands. */
  kind: "travel" | "work";
  startTick: number;
  ticks: number;
  /** Straight-line metres from start to end of the leg (travel only). */
  metres?: number;
  minima: Minima;
}

export interface SaveRecord {
  phase: string;
  label: string;
  tick: number;
  bytes: number;
  hash: string;
  /** Reloaded through a fresh repository and matched the live state exactly. */
  equal: boolean;
}

export interface DiscoveryRecord {
  id: string;
  tick: number;
  phase: string;
}

export interface PhaseRecord {
  id: string;
  title: string;
  status: PhaseStatus;
  startTick: number;
  ticks: number;
  gathered: Record<string, number>;
  spent: Record<string, number>;
  crafted: string[];
  discoveries: string[];
  minima: Minima;
  /** Missing content IDs for pending phases, the refusal or trap for blocked ones. */
  detail?: string[];
  /** Story reads this phase would make whose hosts the build has not placed yet. */
  deferred?: string[];
}

export interface RunRecord {
  scenario: string;
  strategy: string;
  outcome: "complete" | "pending-c3" | "blocked";
  ticks: number;
  /** Ticks at 60 per second, as minutes of active play. */
  minutes: number;
  wallMs: number;
  phases: PhaseRecord[];
  legs: LegRecord[];
  saves: SaveRecord[];
  discoveries: DiscoveryRecord[];
  gathered: Record<string, number>;
  spent: Record<string, number>;
  refusals: { tick: number; phase: string; message: string }[];
  failures: number;
  checks: { name: string; ok: boolean; detail: string }[];
  /** Friction a player would work around (and the harness did, by ordinary play). */
  notes: string[];
}

export const freshMinima = (): Minima => ({ oxygen: 100, food: 100, health: 100, power: null, hull: null });

export function lowerMinima(into: Minima, from: Minima): void {
  into.oxygen = Math.min(into.oxygen, from.oxygen);
  into.food = Math.min(into.food, from.food);
  into.health = Math.min(into.health, from.health);
  if (from.power !== null) into.power = Math.min(into.power ?? 100, from.power);
  if (from.hull !== null) into.hull = Math.min(into.hull ?? 100, from.hull);
}

export function addCounts(into: Record<string, number>, from: Readonly<Record<string, number>>): void {
  for (const [k, n] of Object.entries(from)) into[k] = (into[k] ?? 0) + n;
}
