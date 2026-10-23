// Shared by tests/rib-surface-trap.test.ts and its heavy tier file (TT-1); not a test file itself.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeSave } from "../src/save/codec.js";

// The real trapped export, converted once to the current schema. The original is
// archived; save-bridge.test.ts checks the conversion kept its pose and ownership.
export function trappedExport() {
  const text = readFileSync("tests/fixtures/reef-rib-trap.json", "utf8");
  const decoded = decodeSave(text); assert.ok(decoded.ok); return { text, envelope: decoded.value };
}

// Frozen first-overlap poses and velocities produced by d9aaf63 from hullClearance-true
// starts (full traces and input provenance retained in the author's evidence archive).
export const hullTraps = [
  { p: { x: -4.179157081725582, y: -0.9, z: -10.032405071654868 },
    velocity: { x: -4.1108372764481125, y: 7.829451676105529, z: -1.0182155487614462 } },
  { p: { x: -4.821035219680587, y: -0.9, z: -11.733421160497922 },
    velocity: { x: -0.9746026806911983, y: 7.856048095364841, z: 2.28126303541549 } },
];
