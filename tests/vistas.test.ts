import assert from "node:assert/strict";
import test from "node:test";
import { firstAccessProblems, parkPose, rescueProblems, routeProblems, workPose, type CheckContext } from "../src/content/regions/access.js";
import { HAZARDS } from "../src/content/regions/hazards.js";
import { CRAFT_PROFILES, ROUTES } from "../src/content/regions/passages.js";
import { SITES } from "../src/content/regions/sites.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { BASIN_GEOMETRY, CANOPY_BASIN_ROUTE, RECOVERY_ROUTES } from "../src/content/routes.js";
import { BASIN_YARD, VISTA_SETS, VISTA_SOLIDS } from "../src/content/vistas.js";
import type { Vec3 } from "../src/world/types.js";
import { blocked, blockedBox, prewarmScatter } from "../src/render/biomes/scatter.js";
import { RecipeBuilder } from "../src/render/biomes/recipe.js";
import { drawSolidSet, VISTA_DRESSING } from "../src/render/biomes/vistas.js";

/** Composed vistas (A1). Solid-looking pieces are drawn only from the shapes
 * that are also their collision (`VISTA_SOLIDS`); everything else is thin,
 * visual-only dressing. Neither may cost a passage, tether, mooring, park or
 * work pose. */
prewarmScatter();
const ctx: CheckContext = { floor: worldFloor, hazards: HAZARDS, solids: VISTA_SOLIDS };
const none = (problems: readonly string[], what: string): void =>
  assert.equal(problems.length, 0, `${what}:\n- ${problems.slice(0, 12).join("\n- ")}`);

/** Collision hugs the art: no art outside its set's solids (sampled over
 * every triangle), and both faces across each box's thin axis touch the art
 * or stand at most GAP off it at their centres — a diver may bump just before
 * contact, never swim through and never meet an invisible wall. */
const GAP = 0.35;
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
/** Point to triangle distance (closest point by Voronoi region). */
function pointTriangle(p: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  const len = (q: Vec3): number => Math.sqrt(dot(q, q)), along = (o: Vec3, d: Vec3, t: number): Vec3 => ({ x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t });
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return len(ap);
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return len(bp);
  if (d1 * d4 - d3 * d2 <= 0 && d1 >= 0 && d3 <= 0) return len(sub(p, along(a, ab, d1 / (d1 - d3))));
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return len(cp);
  if (d5 * d2 - d1 * d6 <= 0 && d2 >= 0 && d6 <= 0) return len(sub(p, along(a, ac, d2 / (d2 - d6))));
  if (d3 * d6 - d5 * d4 <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return len(sub(p, along(b, sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6)))));
  const n = cross(ab, ac);
  return Math.abs(dot(n, ap)) / len(n);
}
/** Inside a set's convex parts: a block, a tube segment or a closed piece. */
function insideArt(set: (typeof VISTA_SETS)[number], p: Vec3): boolean {
  const e = 1e-3;
  if (set.blocks.some(k => p.x >= k.min.x - e && p.x <= k.max.x + e && p.y >= k.min.y - e && p.y <= k.max.y + e && p.z >= k.min.z - e && p.z <= k.max.z + e)) return true;
  for (const t of set.tubes) for (let i = 0; i < t.points.length - 1; i++) {
    const a = t.points[i]!, d = sub(t.points[i + 1]!, a), l2 = dot(d, d), s = dot(sub(p, a), d) / l2;
    if (s < 0 || s > 1) continue;
    const r = sub(p, { x: a.x + d.x * s, y: a.y + d.y * s, z: a.z + d.z * s });
    if (Math.sqrt(dot(r, r)) <= t.radius * Math.cos(Math.PI / Math.max(3, t.sides - 2))) return true;
  }
  return set.pieces.some(piece => piece.closed && piece.facets.every(f => {
    const n = cross(sub(f.pts[1]!, f.pts[0]!), sub(f.pts[2]!, f.pts[0]!));
    return dot(n, sub(p, f.pts[0]!)) <= e * Math.sqrt(dot(n, n));
  }));
}

test("vista collision hugs its art: nothing pokes out, no face stands off more than 0.35 m", () => {
  const tol = 0.02;
  for (const set of VISTA_SETS) for (const fine of [true, false]) {
    const b = new RecipeBuilder();
    drawSolidSet(b, set, fine);
    const boxes = VISTA_SOLIDS.filter(s => s.id.startsWith(`vista.${set.id}.`)).map(s => s.bounds);
    assert.ok(boxes.length > 0 && b.vertexCount > 0, set.id);
    const P = b.positions, I = b.indices, at = (i: number): Vec3 => ({ x: P[i * 3]!, y: P[i * 3 + 1]!, z: P[i * 3 + 2]! });
    for (let t = 0; t < I.length; t += 3) {
      const A = at(I[t]!), B = at(I[t + 1]!), Cc = at(I[t + 2]!);
      const n = Math.max(1, Math.ceil(Math.max(Math.sqrt(dot(sub(A, B), sub(A, B))), Math.sqrt(dot(sub(B, Cc), sub(B, Cc))), Math.sqrt(dot(sub(A, Cc), sub(A, Cc)))) / 0.25));
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
        const u = i / n, v = j / n, w = 1 - u - v;
        const x = A.x * w + B.x * u + Cc.x * v, y = A.y * w + B.y * u + Cc.y * v, z = A.z * w + B.z * u + Cc.z * v;
        assert.ok(boxes.some(k => x >= k.min.x - tol && x <= k.max.x + tol && y >= k.min.y - tol && y <= k.max.y + tol && z >= k.min.z - tol && z <= k.max.z + tol),
          `${set.id} (${fine ? "fine" : "coarse"}) draws outside its collision at ${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`);
      }
    }
    if (!fine) continue;
    for (const k of boxes) {
      const ext = { x: k.max.x - k.min.x, y: k.max.y - k.min.y, z: k.max.z - k.min.z };
      const axis = (["x", "y", "z"] as const).reduce((m, a) => ext[a] < ext[m] ? a : m);
      const c = { x: (k.min.x + k.max.x) / 2, y: (k.min.y + k.max.y) / 2, z: (k.min.z + k.max.z) / 2 };
      for (const side of [-1, 1]) {
        // The face centre is inside the art, or no farther than GAP from it.
        const o = { ...c, [axis]: side < 0 ? k.min[axis] : k.max[axis] };
        let gap = insideArt(set, o) ? 0 : Infinity;
        for (let t = 0; t < I.length && gap > GAP; t += 3) gap = Math.min(gap, pointTriangle(o, at(I[t]!), at(I[t + 1]!), at(I[t + 2]!)));
        assert.ok(gap <= GAP + 0.02, `${set.id}: a solid stands ${gap.toFixed(2)} m off the art along ${axis} at ${o.x.toFixed(1)}, ${o.y.toFixed(1)}, ${o.z.toFixed(1)}`);
      }
    }
  }
});

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

test("ADVERSE controls: a solid on a passage and a vertical tether's midpoint are both caught", () => {
  const route = ROUTES.find(r => r.id === "route.basin.wreck_south")!, p = route.path[Math.floor(route.path.length / 2)]!;
  const box = { min: { x: p.x - 1, y: p.y - 1, z: p.z - 1 }, max: { x: p.x + 1, y: p.y + 1, z: p.z + 1 } };
  assert.ok(routeProblems(route, { ...ctx, solids: [...VISTA_SOLIDS, { id: "control", bounds: box }] }).length > 0, "routeProblems sees a planted solid");
  assert.ok(blockedBox(box.min, box.max), "blockedBox sees a box on the route");
  // Halfway down rescue.basin_west's vertical drop (the R1 reproduction).
  assert.ok(blocked(-228, -318, -78.25, 0, -78.25), "a vertical tether is kept clear along its whole length");
});

test("thin dressing stays out of every keep-out and is deterministic", () => {
  const build = (fine: boolean) => VISTA_DRESSING.map(p => { const b = new RecipeBuilder(); p.draw(b, worldFloor, fine); return { id: p.id, mesh: b.finish(p.id, 0.22) }; });
  const a = build(true), again = build(true), coarse = build(false);
  for (const [k, { id, mesh }] of a.entries()) {
    assert.deepEqual(mesh.positions, again[k]!.mesh.positions, `${id} differs between builds`);
    assert.ok(mesh.positions.every(Number.isFinite) && mesh.normals.every(Number.isFinite), `${id} finite`);
    for (let i = 3; i < mesh.colors.length; i += 4) assert.ok(mesh.colors[i] === -1 || mesh.colors[i]! >= 1, `${id} alpha ${mesh.colors[i]}`);
    assert.ok(coarse[k]!.mesh.positions.length <= mesh.positions.length, `${id} coarse is not cheaper`);
  }
  for (const fine of [true, false]) for (const { id, mesh } of fine ? a : coarse) {
    const P = mesh.positions, I = mesh.indices;
    for (let t = 0; t < I.length; t += 3) {
      const ia = I[t]! * 3, ib = I[t + 1]! * 3, ic = I[t + 2]! * 3;
      const len = Math.max(Math.hypot(P[ia]! - P[ib]!, P[ia + 1]! - P[ib + 1]!, P[ia + 2]! - P[ib + 2]!),
        Math.hypot(P[ib]! - P[ic]!, P[ib + 1]! - P[ic + 1]!, P[ib + 2]! - P[ic + 2]!), Math.hypot(P[ia]! - P[ic]!, P[ia + 1]! - P[ic + 1]!, P[ia + 2]! - P[ic + 2]!));
      const n = Math.max(1, Math.ceil(len));
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
        const u = i / n, v = j / n, w = 1 - u - v;
        const x = P[ia]! * w + P[ib]! * u + P[ic]! * v, y = P[ia + 1]! * w + P[ib + 1]! * u + P[ic + 1]! * v, z = P[ia + 2]! * w + P[ib + 2]! * u + P[ic + 2]! * v;
        assert.ok(!blocked(x, z, y, 0, y), `${id} (${fine ? "fine" : "coarse"}) enters a keep-out at ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`);
      }
    }
  }
});

test("the Basin works yard stays off the legacy lanes, parking and work poses", () => {
  const lanes = [CANOPY_BASIN_ROUTE.upper, CANOPY_BASIN_ROUTE.quiet, CANOPY_BASIN_ROUTE.basin, CANOPY_BASIN_ROUTE.returnLoop,
    RECOVERY_ROUTES.basin.tow, RECOVERY_ROUTES.basin.approach];
  const poses = [BASIN_GEOMETRY.station.parking, BASIN_GEOMETRY.station.workPose, BASIN_GEOMETRY.dormitory.parking, BASIN_GEOMETRY.dormitory.workPose];
  const segDist = (p: Vec3, a: Vec3, b: Vec3): number => {
    const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, l = d.x * d.x + d.y * d.y + d.z * d.z;
    const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * d.x + (p.y - a.y) * d.y + (p.z - a.z) * d.z) / l)) : 0;
    return Math.hypot(p.x - a.x - d.x * t, p.y - a.y - d.y * t, p.z - a.z - d.z * t);
  };
  const points: [string, Vec3][] = [
    ...BASIN_YARD.lamps.flatMap((l, i): [string, Vec3][] => { const y = l.y ?? worldFloor(l.x, l.z); return [[`lamp ${i}`, { x: l.x, y, z: l.z }], [`lamp ${i} top`, { x: l.x, y: y + 4, z: l.z }]]; }),
    ...Array.from({ length: 11 }, (_, k): [string, Vec3] => ["mast", { x: BASIN_YARD.mast.x, y: worldFloor(BASIN_YARD.mast.x, BASIN_YARD.mast.z) + k * 5, z: BASIN_YARD.mast.z }]),
    ...BASIN_YARD.conduit.map(([x, y, z], i): [string, Vec3] => [`conduit ${i}`, { x, y, z }]),
  ];
  for (const [name, p] of points) {
    for (const lane of lanes) for (let i = 0; i < lane.length - 1; i++)
      assert.ok(segDist(p, lane[i]!, lane[i + 1]!) > 6, `yard ${name} crowds a Basin lane at ${JSON.stringify(lane[i])}`);
    for (const q of poses) assert.ok(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) > 4, `yard ${name} crowds a parking or work pose`);
  }
});
