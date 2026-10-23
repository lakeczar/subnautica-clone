// A1 vistas, heavy tier (TT-1): every route, first access and rescue re-checked against
// the vista solids. tests/vistas.test.ts keeps the rest and a fast smoke.
import assert from "node:assert/strict";
import test from "node:test";
import { firstAccessProblems, parkPose, rescueProblems, routeProblems, workPose } from "../src/content/regions/access.js";
import { CRAFT_PROFILES, ROUTES } from "../src/content/regions/passages.js";
import { SITES } from "../src/content/regions/sites.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { VISTA_SOLIDS } from "../src/content/vistas.js";
import type { Vec3 } from "../src/world/types.js";
import { blockedBox } from "../src/render/biomes/scatter.js";
import { ctx, none } from "./vistas-support.js";

test("vista solids stay out of the keep-outs and pass the authoritative access checks", () => {
  for (const s of VISTA_SOLIDS) {
    assert.ok(s.bounds.max.x - s.bounds.min.x > 0 && s.bounds.max.y - s.bounds.min.y > 0 && s.bounds.max.z - s.bounds.min.z > 0, `${s.id} is degenerate`);
    assert.ok(!blockedBox(s.bounds.min, s.bounds.max), `${s.id} enters a passage, tether, mooring or structure keep-out`);
  }
  // Only the vista solids: the regions suite already proves floor and
  // structures clear, so any problem here is one the vistas add.
  for (const r of ROUTES) if (!r.legacy) none(routeProblems(r, ctx), r.id);
  none(firstAccessProblems(ctx), "first access");
  none(rescueProblems(ctx), "rescue");
  const dist = (p: Vec3, k: { min: Vec3; max: Vec3 }): number => Math.hypot(Math.max(k.min.x - p.x, 0, p.x - k.max.x),
    Math.max(k.min.y - p.y, 0, p.y - k.max.y), Math.max(k.min.z - p.z, 0, p.z - k.max.z));
  for (const site of SITES) {
    const work = workPose(site, worldFloor), park = parkPose(site, worldFloor);
    for (const s of VISTA_SOLIDS) {
      assert.ok(dist(work, s.bounds) > 2, `${s.id} crowds ${site.id}'s work pose`);
      assert.ok(dist(park, s.bounds) > CRAFT_PROFILES.medium.radius + 1, `${s.id} crowds ${site.id}'s park pose`);
    }
  }
});
