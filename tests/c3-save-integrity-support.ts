// Shared by tests/c3-save-integrity.test.ts and its heavy tier file (TT-1); not a test file itself.
import { createEnvelope, decodeSave, encodeSave } from "../src/save/codec.js";
import type { GameState } from "../src/sim/types.js";

export const meta = { sessionId: "c3-r1-save-integrity", createdAt: "2026-10-20T00:00:00.000Z", savedAt: "2026-10-20T00:00:00.000Z" };

/** Encodes, decodes and matches: the state can be written and read back. */
export function roundTrips(s: GameState): boolean {
  const e = encodeSave(createEnvelope(s, meta));
  if (!e.ok) return false;
  const d = decodeSave(e.value);
  return d.ok && JSON.stringify(d.value.state) === JSON.stringify(s);
}
