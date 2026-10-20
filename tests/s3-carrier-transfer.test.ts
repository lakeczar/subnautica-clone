import test from "node:test";
import assert from "node:assert/strict";
import { BERTH_ENVELOPES, HULL_COLLIDERS } from "../src/content/registry.js";
import { BERTH_LOCAL } from "../src/sim/carrier.js";
import { HUSH, SPINDLE } from "../src/content/fleet/hulls.js";
import { DART_BERTH } from "../src/content/fleet/dart.js";
import { refused, transferMatrix } from "./s3-carrier-transfer-support.js";

/** S3's adopted hull proposals (Hush, Spindle), applied in memory. */
const S3_ENVELOPES = {
  envelopes: { hush: HUSH.berth!.envelope, spindle: SPINDLE.berth!.envelope },
  colliders: { spindle: { height: SPINDLE.collider.height } },
} as const;

test("characterizes today's geometry: the Dart and Hush cannot use the starboard compact berth", () => {
  const before = structuredClone({ e: BERTH_ENVELOPES, c: HULL_COLLIDERS, b: BERTH_LOCAL });
  const failures = refused(transferMatrix());
  assert.deepEqual(failures.map((f) => f.split(":")[0]), [
    "dart slot 1 launch", "dart slot 1 capture", "hush slot 1 launch", "hush slot 1 capture",
  ], failures.join("\n"));
  assert.ok(failures.every((f) => f.includes("Transfer corridor obstructed")));
  assert.deepEqual({ e: BERTH_ENVELOPES, c: HULL_COLLIDERS, b: BERTH_LOCAL }, before, "the helper restores every patched value");
});

test("S3's hull envelopes alone fix Hush but not the Dart", () => {
  assert.deepEqual(refused(transferMatrix(S3_ENVELOPES)).map((f) => f.split(":")[0]), ["dart slot 1 launch", "dart slot 1 capture"]);
});

test("proposal A (recommended): starboard berth datum at x = 3.1 clears every hull in both slots", () => {
  const failures = refused(transferMatrix({ ...S3_ENVELOPES, berthLocal: { 1: { ...BERTH_LOCAL[1]!, x: DART_BERTH.proposedStarboardX } } }));
  assert.deepEqual(failures, []);
});

test("proposal B (alternative): a 2.45 m Dart envelope also clears, but needs its fin tips trimmed", () => {
  const failures = refused(transferMatrix({ ...S3_ENVELOPES, envelopes: { ...S3_ENVELOPES.envelopes, dart: { halfWidth: DART_BERTH.trimmedHalfWidth } } }));
  assert.deepEqual(failures, []);
  // The current art reaches the old envelope exactly: trimming is required.
  assert.ok(DART_BERTH.measured.halfWidth > DART_BERTH.trimmedHalfWidth);
});
