import assert from "node:assert/strict";
import test from "node:test";
import { beam, pieceSolids, prism, v } from "../src/content/vistaKit.js";
import { artMembers } from "../src/world/collision/bake.js";
import { buildBoxes, createStaticCollider } from "../src/world/collision/collider.js";
import { coverReport } from "../src/world/collision/cover.js";
import { buildShape } from "../src/world/collision/shape.js";

/** COL-1 stage A: the interim rule's cover check, and TST-05's cliff. */

test("cover: A1's slab cover holds its prism's art, standing off it by at most about 0.35 m", () => {
  // A leaning rounded tube, as A1's ribs are built.
  const pieces = beam([v(0, 0, 0), v(6, 3, 1), v(10, 7, 1.5)], () => [0.38, 0.38, 0.16], () => "rust");
  const art = createStaticCollider("tube", artMembers("tube", [], pieces));
  const boxes = pieces.flatMap(pieceSolids), points = pieces.flatMap(p => p.facets.flatMap(f => f.pts));
  const r = coverReport(art, boxes, points);
  assert.equal(r.artOutside, 0, JSON.stringify(r));
  assert.ok(r.standOffMax > 0.05 && r.standOffMax < 0.4, JSON.stringify(r));
});

test("ADVERSE cover: a cover that misses part of the art reports it, with the gap", () => {
  const piece = prism(v(0, 0, 0), v(8, 0, 0), 1, 1, 0.3, () => "rust");
  const art = createStaticCollider("bar", artMembers("bar", [], [piece]));
  // A cover that stops a metre short of the bar's far end.
  const r = coverReport(art, [{ min: { x: -0.01, y: -1.01, z: -1.01 }, max: { x: 7, y: 1.01, z: 1.01 } }], piece.facets.flatMap(f => f.pts));
  assert.ok(r.artOutside > 0 && Math.abs(r.artOutsideMax - 1) < 0.01, JSON.stringify(r));
});

test("TST-05: size follows triangles and boxes, never extent: a 2 km plate and 20,000 small boxes", () => {
  const small = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `b${i}`, min: { x: (i % 200) * 3, y: 0, z: Math.floor(i / 200) * 3 }, max: { x: (i % 200) * 3 + 1, y: 1, z: Math.floor(i / 200) * 3 + 1 } }));
  const plate = (span: number) => buildShape("plate", new Float32Array([0, -5, 0, span, -5, 0, span, -5, span, 0, -5, span]), [0, 1, 2, 0, 2, 3]);
  const near = createStaticCollider("near", [plate(20), buildBoxes("b", small(20000))]);
  const far = createStaticCollider("far", [plate(2000), buildBoxes("b", small(20000))]);
  assert.equal(far.bytes, near.bytes, "a wider plate cost more");
  // Exact Float64 boxes (48 B) plus their hierarchy: under 90 B a box.
  assert.ok(far.bytes < 20000 * 90, `${far.bytes} B for 20,000 boxes`);
  // And a query over the whole 2 km sees each primitive once.
  assert.equal(far.segmentClear({ x: -1, y: 0.5, z: 0.5 }, { x: 2001, y: 0.5, z: 0.5 }), false);
  assert.equal(far.support(1500, 1500, 0), -5);
});
