import test from "node:test";
import assert from "node:assert/strict";
import { HULL_COLLIDERS } from "../src/content/registry.js";
import { stepGame } from "../src/sim/step.js";
import { hullClearance, RIB_SEGMENTS } from "../src/sim/world.js";
import { input, pilot, swim, swimmer, world } from "./rib-support.js";

// Exhaustive collider conformance around both reef arches. The fast tier keeps the
// real trapped export, the generated Dart traps and the targeted overlaps.
test("reduced deterministic surface grid covers both arches from swimmer-clear and full hull-clear starts", t => {
  let divers = 0, hulls = 0, invalidHullSeeds = 0;
  for (const segment of [0, 4, 8, 12, 16, 20, 24, 28, 32]) {
    const r = RIB_SEGMENTS[segment]!, dx = r.b.x - r.a.x, dy = r.b.y - r.a.y, dz = r.b.z - r.a.z;
    const length = Math.hypot(dx, dy, dz), n1 = { x: -dz / Math.hypot(dx, dz), y: 0, z: dx / Math.hypot(dx, dz) };
    const n2 = { x: dy / length * n1.z, y: dz / length * n1.x - dx / length * n1.z, z: -dy / length * n1.x };
    for (const hull of [false, true]) for (const t of [0.25, 0.75]) for (const k of [0, 2, 4, 6]) {
      const shape = hull ? HULL_COLLIDERS.dart : swimmer, angle = k * Math.PI / 4, offset = r.radius + (hull ? 4.2 : 0.9);
      const start = { x: r.a.x + dx * t + (n1.x * Math.cos(angle) + n2.x * Math.sin(angle)) * offset,
        y: r.a.y + dy * t + n2.y * Math.sin(angle) * offset - shape.height / 2,
        z: r.a.z + dz * t + (n1.z * Math.cos(angle) + n2.z * Math.sin(angle)) * offset };
      if (hull) start.y = Math.min(-0.9, start.y);
      if (!world.clearance(start, shape)) continue;
      if (hull && !hullClearance(world, start, shape)) { invalidHullSeeds++; continue; }
      const yaw = Math.atan2(r.a.x + dx * t - start.x, -(r.a.z + dz * t - start.z));
      for (const pitch of [0.3, 0.8]) for (const vertical of [0, 1]) {
        let s = hull ? pilot("dart", start, yaw, pitch) : swim(start, yaw, pitch);
        if (hull) hulls++; else divers++;
        for (let i = 0; i < 50; i++) {
          s = stepGame(s, [input(1, 0, vertical)], world).state;
          const proxy = hull ? shape : { ...shape, height: s.player.mode === "walking" ? 1.75 : 0.95 };
          assert.ok(hull ? hullClearance(world, s.player.pose.position, proxy) : world.clearance(s.player.pose.position, proxy),
            JSON.stringify({ segment, hull, t, k, pitch, vertical, tick: i + 1, p: s.player.pose.position }));
        }
      }
    }
  }
  t.diagnostic(JSON.stringify({ divers, hulls, excludedInvalidHullSeeds: invalidHullSeeds }));
  assert.ok(divers > 100 && hulls > 30);
});
