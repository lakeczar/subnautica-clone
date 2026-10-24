/** Shared SYS-2 test fixtures: an opened game, a site table for the world query,
 * placement helpers and an inventory ledger for conservation checks. */
import { completeOpening } from "../src/sim/progression.js";
import { addItem } from "../src/sim/inventory.js";
import { createGame } from "../src/sim/state.js";
import type { ItemKind } from "../src/content/registry.js";
import type { GameState, Vec3 } from "../src/sim/types.js";
import type { OutpostSiteQuery, SiteSample } from "../src/sim/systems/outposts.js";
import { createSystems } from "../src/sim/systems/state.js";
import type { SystemsState } from "../src/sim/systems/state.js";

/** Spots at least 40 m from every fixed host and from each other. */
export const SPOTS = {
  a: { x: -60, y: -20, z: -40 },
  b: { x: -60, y: -20, z: 50 },
  c: { x: 60, y: -20, z: 60 },
  d: { x: -130, y: -30, z: 0 },
  e: { x: 80, y: -30, z: -90 },
} as const satisfies Record<string, Vec3>;

export function opened(): { s: GameState; sys: SystemsState } {
  const s = createGame();
  completeOpening(s);
  addItem(s, "essential_tools", 1, "equipment", "tools");
  return { s, sys: createSystems() };
}
export function give(s: GameState, kind: string, quantity = 1, container = "diver"): string {
  if (kind.startsWith("mod_") || kind.startsWith("outpost_kit_") || kind === "bio_cell") {
    let last = "";
    for (let n = 0; n < quantity; n++) last = addItem(s, kind as ItemKind, 1, container).id;
    return last;
  }
  return addItem(s, kind as ItemKind, quantity, container).id;
}
export function swimTo(s: GameState, p: Vec3): void {
  s.player.pose.position = { ...p };
  s.player.mode = "swimming";
  s.player.controlledVehicleId = null;
  s.player.interiorId = null;
}
export function diverCapacity(s: GameState, cu: number): void {
  s.inventory.containers.find((c) => c.id === "diver")!.capacity = cu;
}
export const LEDGE: SiteSample = { ground: "ledge", slope: 6, clear: true, depth: 60, ventDistance: null, covered: false, region: "refuge_reef" };
/** One sample everywhere, or per-spot overrides keyed by "x,z". */
export function siteTable(base: Partial<SiteSample> = {}, overrides: Record<string, Partial<SiteSample>> = {}): OutpostSiteQuery {
  return { sample: (p) => ({ ...LEDGE, ...base, ...(overrides[`${p.x},${p.z}`] ?? {}) }) };
}
/** Every stack as (id, kind, container, quantity), sorted: the full ledger. */
export function ledger(s: GameState): string[] {
  return s.inventory.items.map((i) => `${i.id}|${i.kind}|${i.containerId}|${i.quantity}`).sort();
}
export const snapshot = (s: GameState, sys: SystemsState): string => JSON.stringify({ s, sys });
