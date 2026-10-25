/** SAVE-1: the standard save kinds the library exports at every root merge.
 * Each names the scenario save that provides it (a phase milestone, or a
 * mid-phase capture taken by a watcher) and, for adverse, gear and tour kinds,
 * the facts the state must show. Every kind is earned by the bot through real
 * commands; nothing here edits a state. */
import { regionAtPoint } from "../../src/content/regions/layout.js";
import { personalLimit } from "../../src/sim/capabilities.js";
import { cabinHull } from "../../src/sim/fleet.js";
import { airSupply } from "../../src/sim/survival.js";
import type { GameState, VehicleState } from "../../src/sim/types.js";

export type KindGroup = "milestone" | "adverse" | "gear" | "tour";
export interface KindSpec {
  kind: string;
  group: KindGroup;
  /** The scenario save that provides it: `scenario@label` (label = phase ID or capture name). */
  source: string;
  description: string;
  /** What the state must show; each string is a problem. Milestone kinds rely on the phase's own verify. */
  facts?: (s: GameState) => string[];
}

/** Below this the air is low: the game's own 20% oxygen warning (survival.ts). */
export const LOW_AIR_PERCENT = 20;
/** At or below this a hull is damaged, short of disabled. */
export const DAMAGED_HULL_PERCENT = 50;
/** The Canopy's region (the Suspended Garden), visited first with the minimum gear. */
export const GEAR_REGION = "suspended_garden";

const controlled = (s: GameState): VehicleState | null =>
  s.fleet.vehicles.find((v) => v.id === s.player.controlledVehicleId) ?? cabinHull(s) ?? null;
const regionOf = (s: GameState): string | null => regionAtPoint(s.player.pose.position.x, s.player.pose.position.z);
const fitted = (s: GameState, v: VehicleState, kind: string): boolean =>
  s.inventory.items.some((i) => v.modules.includes(i.id) && i.kind === kind);
const check = (ok: boolean, problem: string): string[] => ok ? [] : [problem];

export const KINDS: readonly KindSpec[] = [
  { kind: "pod-start", group: "milestone", source: "creel@opening", description: "New Game through the pod opening: the diver ashore at the pod" },
  { kind: "dart", group: "milestone", source: "creel@isles", description: "Workshop restored and the 180 m Dart built" },
  { kind: "creel-basin-frames", group: "milestone", source: "creel@basin-frames", description: "The 240 m Creel back from the Basin frames (creel-loss branches here)" },
  { kind: "creel-350", group: "milestone", source: "creel@refits", description: "Creel and Dart refitted to 350 m, the outer-crown mooring restored (the carrier route branches here)" },
  { kind: "rift-450", group: "milestone", source: "creel@rift", description: "Rift station restored, 450 m suit and Creel, at the forward outpost" },
  { kind: "creel-800", group: "milestone", source: "creel@divide", description: "Divide dock restored; 800 m Creel and suit, home at the workshop" },
  { kind: "carrier-fitout", group: "milestone", source: "carrier@hearthline", description: "The Hearthline's keel and fit-out at the stack-yard berth" },
  { kind: "pre-ending", group: "milestone", source: "creel@works", description: "Creel route: the return-gate works done, before the ending" },
  { kind: "pre-ending-carrier", group: "milestone", source: "carrier@works", description: "Carrier route: the return-gate works done, before the ending" },
  {
    kind: "low-air", group: "adverse", source: "low-air@low-air",
    description: `The diver overstays on suit air at the reef until the game's ${LOW_AIR_PERCENT}% warning`,
    facts: (s) => [
      ...check(s.player.vitals.oxygen <= LOW_AIR_PERCENT, `oxygen ${s.player.vitals.oxygen.toFixed(1)}% is above ${LOW_AIR_PERCENT}%`),
      ...check(airSupply(s).kind === "suit", `breathing from ${airSupply(s).kind}, not the suit`),
      ...check(s.player.vitals.health > 0, "the diver is incapacitated"),
    ],
  },
  {
    kind: "hull-damaged", group: "adverse", source: "creel-loss@hull-damaged",
    description: `The 240 m Creel worked below its rating until its hull is at ${DAMAGED_HULL_PERCENT}% or less, still running`,
    facts: (s) => {
      const v = s.fleet.vehicles.find((x) => x.health <= DAMAGED_HULL_PERCENT && !x.disabled);
      return [...check(!!v, `no running craft at or below ${DAMAGED_HULL_PERCENT}% hull`),
        ...check(!!v && controlled(s)?.id === v.id, "the damaged craft is not the one being piloted")];
    },
  },
  {
    kind: "craft-lost", group: "adverse", source: "creel-loss@craft-lost",
    description: "The disabled Creel left at depth; the diver has escaped to the surface and needs a recovery",
    facts: (s) => {
      const lost = s.fleet.vehicles.find((v) => v.disabled);
      return [...check(!!lost, "no craft is disabled"),
        ...check(!!lost && controlled(s)?.id !== lost.id, "the diver is still aboard the lost craft"),
        ...check(!s.recovery.operation, "a recovery is already under way"),
        ...check(s.player.vitals.health > 0, "the diver is incapacitated")];
    },
  },
  {
    kind: "battery-depleted", group: "adverse", source: "tour@depleted",
    description: "The tour Dart flown on its own charge until empty: helm dead, on emergency air (TST-23)",
    facts: (s) => {
      const v = controlled(s);
      return [...check(!!v, "no craft is piloted"),
        ...check(!!v && v.charge === 0, `the piloted craft holds ${v?.charge.toFixed(2)}% charge`),
        ...check(!!v && !v.disabled, "the craft is disabled, not merely out of power"),
        ...check(airSupply(s).kind === "emergency", `breathing from ${airSupply(s).kind}, not the emergency supply`)];
    },
  },
  {
    kind: "canopy-min-gear", group: "gear", source: "creel@canopy-entry",
    description: "First entry into the Canopy with the gear the bot first goes there with",
    facts: (s) => {
      const v = controlled(s);
      return [...check(regionOf(s) === GEAR_REGION, `in ${regionOf(s)}, not ${GEAR_REGION}`),
        ...check(!!v && v.hull === "dart" && v.rating === 180, `piloting ${v ? `the ${v.rating} m ${v.hull}` : "nothing"}, not the 180 m Dart`),
        ...check(personalLimit(s) <= 150, `the suit is rated ${personalLimit(s)} m`)];
    },
  },
  {
    kind: "canopy-over-geared", group: "gear", source: "over-geared@canopy-entry",
    description: "Back into the Canopy in the 800 m Creel with the 800 m suit",
    facts: (s) => {
      const v = controlled(s);
      return [...check(regionOf(s) === GEAR_REGION, `in ${regionOf(s)}, not ${GEAR_REGION}`),
        ...check(!!v && v.hull === "creel" && v.rating >= 800, `piloting ${v ? `the ${v.rating} m ${v.hull}` : "nothing"}, not the 800 m Creel`),
        ...check(personalLimit(s) >= 800, `the suit is rated ${personalLimit(s)} m`)];
    },
  },
  {
    kind: "tour-ready", group: "tour", source: "tour@tour-fit",
    description: "The 350 m Dart with core cells and drive tuning, fully charged, two charged reserve cells aboard, at its cradle",
    facts: (s) => {
      const v = controlled(s);
      const cells = v ? s.inventory.items.filter((i) => i.kind === "reserve_cell" && i.containerId === v.cargoId && (i.charge ?? 0) >= 100).length : 0;
      return [...check(!!v && v.hull === "dart" && v.rating >= 350, `piloting ${v ? `the ${v.rating} m ${v.hull}` : "nothing"}, not the 350 m Dart`),
        ...check(!!v && v.charge >= 100, `charge ${v?.charge.toFixed(1)}%`),
        ...check(!!v && fitted(s, v, "cell_bank_2") && fitted(s, v, "drive_tuning_2"), "the core cell bank and drive controller are not both fitted"),
        ...check(cells >= 2, `${cells} charged reserve cells aboard`),
        ...check(s.player.vitals.oxygen >= 99, `oxygen ${s.player.vitals.oxygen.toFixed(0)}%`)];
    },
  },
];

/** Every scenario save is also a kind of its own: `scenario@label`. */
export const kindsOf = (scenario: string, label: string): string[] =>
  [...KINDS.filter((k) => k.source === `${scenario}@${label}`).map((k) => k.kind), `${scenario}@${label}`];

/** A few readable facts for the manifest: where, breathing what, in which craft. */
export function summarize(s: GameState): Record<string, string | number | boolean | null> {
  const v = controlled(s), p = s.player.pose.position, r = (n: number): number => Math.round(n * 10) / 10;
  return {
    region: regionOf(s), mode: s.player.mode, x: r(p.x), y: r(p.y), z: r(p.z), oxygen: r(s.player.vitals.oxygen),
    food: r(s.player.vitals.food), health: r(s.player.vitals.health), air: airSupply(s).kind, suit: personalLimit(s),
    craft: v ? `${v.hull} ${v.rating} m` : null, charge: v ? r(v.charge) : null, hull: v ? r(v.health) : null,
    fleet: s.fleet.vehicles.map((x) => `${x.hull} ${x.rating}${x.disabled ? " disabled" : ""}`).join(", "),
  };
}
