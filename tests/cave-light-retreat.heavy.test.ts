// W1 cave light, heavy tier (TT-1): the sealed-cave retreat from every route start.
// tests/cave-light.test.ts keeps the rest and a fast smoke.
import test from "node:test";
import assert from "node:assert/strict";
import { def, worldWith } from "./cave-support.js";
import { retreat, retreatStarts } from "./cave-light-retreat-support.js";

test("negative control: with every opening plugged the same retreat fails", () => {
  const plugs = def.portals.filter(o => o.kind === "mouth" || o.kind === "skylight").map((o, i) => {
    const w = o.clear.width / 2 + 2, h = o.clear.height / 2 + 2, t = 1;
    const half = o.normal.y !== 0 ? { x: w, y: t, z: h } : o.normal.z !== 0 ? { x: w, y: h, z: t } : { x: t, y: h, z: w };
    return { id: `test.plug.${i}`, min: { x: o.center.x - half.x, y: o.center.y - half.y, z: o.center.z - half.z },
      max: { x: o.center.x + half.x, y: o.center.y + half.y, z: o.center.z + half.z } };
  });
  const { failures } = retreat(worldWith(plugs), retreatStarts);
  assert.ok(failures.length >= retreatStarts.length * 0.9, `${failures.length} of ${retreatStarts.length} still escaped a sealed cave`);
});
