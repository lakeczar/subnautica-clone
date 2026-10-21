import test from "node:test";
import assert from "node:assert/strict";
import { BERTH_ENVELOPES, HULL_COLLIDERS } from "../src/content/registry.js";
import { BERTH_LOCAL } from "../src/sim/carrier.js";
import { HUSH, MANTLE, SPINDLE } from "../src/content/fleet/hulls.js";
import { DART_BERTH } from "../src/content/fleet/dart.js";
import { refused, transferMatrix } from "./s3-carrier-transfer-support.js";

/** Composition adopted S3's envelopes and S3-02 option B (the Dart's fins
 * trimmed to ½W 2.45, berth datums unchanged). The unpatched registry is the proof. */
test("every compact hull launches and captures in both slots, and both medium hulls in theirs, with no patch", () => {
  const results = transferMatrix();
  assert.deepEqual(refused(results), []);
  assert.deepEqual(results.map((r) => `${r.hull}/${r.slot}/${r.type}`), [
    "dart/0/launch", "dart/0/capture", "dart/1/launch", "dart/1/capture",
    "hush/0/launch", "hush/0/capture", "hush/1/launch", "hush/1/capture",
    "spindle/0/launch", "spindle/0/capture", "spindle/1/launch", "spindle/1/capture",
    "creel/0/launch", "creel/0/capture", "mantle/0/launch", "mantle/0/capture",
  ], "the matrix covered every hull in every slot");
});

test("the registry carries S3's hull data and the trimmed Dart envelope, with C3's widened walkway datums", () => {
  assert.equal(BERTH_ENVELOPES.dart.halfWidth, DART_BERTH.trimmedHalfWidth);
  for (const [hull, spec] of [["hush", HUSH], ["spindle", SPINDLE], ["mantle", MANTLE]] as const) {
    const e = BERTH_ENVELOPES[hull], s = spec.berth!.envelope;
    assert.deepEqual([e.halfWidth, e.halfLength, e.height], [s.halfWidth, s.halfLength, s.height], hull);
    assert.deepEqual([HULL_COLLIDERS[hull].radius, HULL_COLLIDERS[hull].height], [spec.collider.radius, spec.collider.height], hull);
  }
  // C3 (P1): the starboard berth moved 0.2 m outboard with its room, widening the walkway.
  assert.deepEqual(BERTH_LOCAL.map((p) => p.x), [-3, 3.2]);
});

test("adverse: the pre-composition envelopes still refuse exactly the Dart and Hush transfers", () => {
  const before = structuredClone({ e: BERTH_ENVELOPES, c: HULL_COLLIDERS, b: BERTH_LOCAL });
  const failures = refused(transferMatrix({
    envelopes: { dart: { halfWidth: DART_BERTH.current.halfWidth }, hush: { halfWidth: 2.5 }, spindle: { halfWidth: 2.4, height: 1.7 } },
    colliders: { spindle: { height: 1.7 } },
  }));
  // C3's walkway puts both inboard walls at the trimmed envelope, so the untrimmed
  // ½W 2.5 now crosses a wall in both slots (before, only starboard).
  assert.deepEqual(failures.map((f) => f.split(":")[0]), [
    "dart slot 0 launch", "dart slot 0 capture", "dart slot 1 launch", "dart slot 1 capture",
    "hush slot 0 launch", "hush slot 0 capture", "hush slot 1 launch", "hush slot 1 capture",
  ], failures.join("\n"));
  assert.ok(failures.every((f) => f.includes("Transfer corridor obstructed")));
  assert.deepEqual({ e: BERTH_ENVELOPES, c: HULL_COLLIDERS, b: BERTH_LOCAL }, before, "the helper restores every patched value");
});
