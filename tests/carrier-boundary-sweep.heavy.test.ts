import test from "node:test";
import assert from "node:assert/strict";
import { stepGame } from "../src/sim/step.js";
import { coherent, command, edges, staged, world, worldMove } from "./carrier-boundary-support.js";

// Exhaustive collider conformance: 416 loaded carrier assemblies at every world
// edge and corner, saveable at every step. The fast tier keeps the targeted cases.
test("loaded compact/medium assemblies at every edge/corner preserve turns, outward contact and inward/tangential escape", () => {
  let cases = 0;
  for (const configuration of ["compact", "medium"] as const) for (const edge of edges)
    for (const yaw of [...Array.from({ length: 24 }, (_, n) => n * Math.PI / 12), 0.31, 0.83]) {
      let s = staged(configuration, { x: edge.x, y: -0.9, z: edge.z }, yaw);
      const items = structuredClone(s.inventory.items), before = { ...s.fleet.vehicles[0]!.pose.position };
      for (let i = 0; i < 8; i++) {
        const result = stepGame(s, [worldMove(s, edge.dx, edge.dz)], world);
        s = result.state;
        coherent(s);
        assert.ok(result.events.some((e) => e.type === "foundation-boundary"));
      }
      assert.ok(Math.hypot(s.fleet.vehicles[0]!.pose.position.x - before.x,
        s.fleet.vehicles[0]!.pose.position.z - before.z) < 1e-10);
      // Stationary turning must work even at corners, without accumulating a
      // rejected view heading that suddenly rotates the hull on a later step.
      for (let i = 0; i < 8; i++) {
        s = stepGame(s, [{ type: "look", yawDelta: 0.8, pitchDelta: 0 }], world).state;
        coherent(s);
        assert.equal(s.player.pose.yaw, s.fleet.vehicles[0]!.pose.yaw);
      }
      s = command(s, "station-keep");
      for (let i = 0; i < 30; i++) {
        s = stepGame(s, [worldMove(s, 0, 0)], world).state;
        coherent(s);
      }
      // Remove the ordinary damping's outward residual via station keeping.
      s = command(s, "helm");
      for (let i = 0; i < 25; i++) {
        s = stepGame(s, [worldMove(s, -edge.dx, -edge.dz)], world).state;
        coherent(s);
      }
      assert.ok(Math.hypot(s.fleet.vehicles[0]!.pose.position.x - before.x,
        s.fleet.vehicles[0]!.pose.position.z - before.z) > 0.1);
      assert.deepEqual(s.inventory.items, items);
      cases++;
    }
  assert.equal(cases, 416);
  for (const edge of edges.slice(0, 4)) {
    let s = staged("compact", { x: edge.x, y: -0.9, z: edge.z }, 0.31);
    const before = { ...s.fleet.vehicles[0]!.pose.position };
    for (let i = 0; i < 40; i++) {
      s = stepGame(s, [worldMove(s, edge.dx || 1, edge.dz || 1)], world).state;
      coherent(s);
    }
    assert.ok(Math.hypot(s.fleet.vehicles[0]!.pose.position.x - before.x,
      s.fleet.vehicles[0]!.pose.position.z - before.z) > 0.2, "diagonal contact retains its tangential component");
  }
});
