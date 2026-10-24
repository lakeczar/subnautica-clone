// Shared by tests/c4b-fixes.test.ts and its heavy tier file (TT-1); not a test file itself.
import assert from "node:assert/strict";
import { createEnvelope, decodeSave, encodeSave } from "../src/save/codec.js";
import { validState } from "../src/save/validation.js";
import type { GameState } from "../src/sim/types.js";
import { gameWorld } from "../src/sim/world.js";
import { meta } from "./b1-support.js";

export const world = gameWorld();

export function roundTrip(s: GameState): GameState {
  assert.ok(validState(s), "valid before saving");
  const e = encodeSave(createEnvelope(s, meta)); assert.ok(e.ok, e.ok ? "" : e.error);
  const d = decodeSave(e.value); assert.ok(d.ok, d.ok ? "" : d.error);
  assert.deepEqual(d.value.state, JSON.parse(JSON.stringify(s)));
  return d.value.state;
}
