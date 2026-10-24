/** ENV-1 test support: fixture interiors, fixture states and fixture worlds. */
import type { InteriorDef } from "../src/content/interiors/types.js";
import type { HullId } from "../src/content/registry.js";
import { completeOpening } from "../src/sim/progression.js";
import { createGame, makeVehicle } from "../src/sim/state.js";
import type { GameState, WorldQueries } from "../src/sim/types.js";
import { createWorldQueries } from "../src/sim/world.js";
import type { ResolvedAccess } from "../src/sim/interiors/validate.js";

/** A game past the opening with one suit fitted and, optionally, one craft. */
export function fixtureState(suit: "suit_150" | "suit_350" | "suit_450" | "suit_800", hull: HullId | null = null): GameState {
  const s = createGame(); completeOpening(s);
  s.inventory.items = s.inventory.items.filter((i) => !(i.containerId === "equipment" && i.fitted === "suit"));
  s.inventory.items.push({ id: "fixture.suit", kind: suit, quantity: 1, containerId: "equipment", fitted: "suit", charge: null, provenance: "public" } as never);
  s.fleet.vehicles = hull ? [makeVehicle(`fixture.${hull}`, hull, { x: 0, y: -5, z: 0 }, `fixture.${hull}.hold`)] : [];
  return s;
}

/** An open-water world with a flat floor (no structures). */
export const flatWorld = (floor: number): WorldQueries => createWorldQueries([], () => floor);

/** Every declared first visit of `def`, played from the same stand-in state. */
export const accesses = (def: InteriorDef, state: GameState): ResolvedAccess[] => def.firstAccess.map((access) => ({ access, state }));

export const codes = (problems: readonly { code: string }[]): string[] => [...new Set(problems.map((p) => p.code))].sort();
