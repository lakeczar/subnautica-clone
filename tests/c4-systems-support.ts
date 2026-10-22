// Shared by tests/c4-systems.test.ts and its heavy tier file (TT-1); not a test file itself.
import assert from "node:assert/strict";
import type { RecipeId } from "../src/content/registry.js";
import { decodeSave, encodeSave, createEnvelope } from "../src/save/codec.js";
import { validState } from "../src/save/validation.js";
import { addItem } from "../src/sim/inventory.js";
import { executeCommand, stepGame } from "../src/sim/step.js";
import type { GameCommand, GameEvent, GameState } from "../src/sim/types.js";
import { gameWorld } from "../src/sim/world.js";
import { at, creelFirst, fund, meta } from "./b1-support.js";
import { faceTarget, NORMAL_VIEWS } from "./targeting-support.js";

export const world = gameWorld();

/** A real ledge 45 m west of the pod (siteQuery: level, clear, open sky). */
export const LEDGE = { x: -44, y: -8.09, z: 8 } as const;

export function run(s: GameState, c: GameCommand): { state: GameState; events: GameEvent[] } {
  const out = executeCommand(s, c, world);
  const error = out.events.find((e) => e.type === "notice" && e.error);
  assert.equal(error && "message" in error ? error.message : null, null, `${c.type} refused`);
  return out;
}

/** Read a host the way a player does: from its collision-checked view, aimed. */
export function read(s: GameState, id: string): GameState {
  const v = NORMAL_VIEWS.find((x) => x.id === id)!;
  at(s, v.position, v.mode); faceTarget(s, id);
  return run(s, { type: "interact" }).state;
}

export function roundTrip(s: GameState): GameState {
  assert.ok(validState(s), "valid before saving");
  const e = encodeSave(createEnvelope(s, meta)); assert.ok(e.ok, e.ok ? "" : e.error);
  const d = decodeSave(e.value); assert.ok(d.ok, d.ok ? "" : d.error);
  assert.deepEqual(d.value.state, JSON.parse(JSON.stringify(s)));
  return d.value.state;
}

export const idle = (seconds: number, s: GameState): GameState => {
  for (let i = 0; i < seconds * 60; i++) s = stepGame(s, [], world).state;
  return s;
};

/** Creel-first (B1) with the workshop's outpost and signal records read and a
 * basic outpost kit, a decoder and a planter made at their benches. */
export function systemsGame(): GameState {
  let s = creelFirst();
  for (const id of ["workshop_outpost_sheet", "workshop_decoder_rack", "canopy_lab_outpost_sheet"]) s = read(s, id);
  // Stow everything else from the diver hold in the pod locker, as a player would.
  const stow = () => { for (const i of s.inventory.items.filter((i) => i.containerId === "diver" && !/^(outpost_kit_basic|mod_)/.test(i.kind))) i.containerId = "pod_locker"; };
  for (const id of ["outpost_kit_basic", "mod_decoder", "mod_planter"] as RecipeId[]) { stow(); fund(s, id); }
  stow();
  return s;
}

export const kitId = (s: GameState): string => s.inventory.items.find((i) => i.kind === "outpost_kit_basic")!.id;

export const item = (s: GameState, kind: string): string => s.inventory.items.find((i) => i.kind === kind)!.id;

/** A standard outpost on the west ledge running a decode and growing staple cups. */
export function busyOutpost(): { s: GameState; outpost: string; decoder: string; planter: string } {
  let s = systemsGame();
  s = read(s, "lost:reef_pumphouse_site");
  assert.ok(s.systems.found.includes("reef_pumphouse_log"), "reading the site finds its log");
  s = read(s, "reef_staple_cuttings");
  const outpost = kitId(s), decoder = item(s, "mod_decoder"), planter = item(s, "mod_planter");
  at(s, { ...LEDGE, y: LEDGE.y + 0.6 }, "swimming");
  s = run(s, { type: "deploy-outpost", itemId: outpost, name: "West ledge" }).state;
  for (const [k, q] of [["structural_alloy", 3], ["silica_glass", 2], ["conductive_crust", 2]] as const) addItem(s, k, q, "diver");
  s = run(s, { type: "upgrade-outpost", outpostId: outpost }).state;
  s = run(s, { type: "install-host-module", hostId: outpost, socket: "s0", itemId: decoder }).state;
  s = run(s, { type: "install-host-module", hostId: outpost, socket: "s1", itemId: planter }).state;
  s = run(s, { type: "start-decode", hostId: outpost, socket: "s0", decodable: "reef_pumphouse_log" }).state;
  s = run(s, { type: "plant", hostId: outpost, socket: "s1", seed: "seed_staple_cup" }).state;
  s = idle(30, s);
  assert.equal(s.systems.decodes.length, 1); assert.ok(s.systems.decodes[0]!.progress > 0, "the decode runs");
  assert.ok(s.systems.planters[0]!.progress > 0, "the crop grows");
  return { s: roundTrip(s), outpost, decoder, planter };
}
