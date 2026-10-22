import assert from "node:assert/strict";
import test from "node:test";
import { corridorProblems, firstAccessProblems, parkPose, rescueProblems, routeProblems, workPose, type CheckContext } from "../src/content/regions/access.js";
import { STRUCTURE_SOLIDS } from "../src/content/regions/structures.js";
import { HAZARDS } from "../src/content/regions/hazards.js";
import { CRAFT_PROFILES, ROUTES } from "../src/content/regions/passages.js";
import { SITES } from "../src/content/regions/sites.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { BASIN_GEOMETRY, CANOPY_BASIN_ROUTE, RECOVERY_ROUTES } from "../src/content/routes.js";
import { BASIN_YARD, VISTA_SETS, VISTA_SOLIDS } from "../src/content/vistas.js";
import { worldLayout } from "../src/content/regions/layout.js";
import { WORLD_ENVELOPE } from "../src/world/frame.js";
import type { Vec3 } from "../src/world/types.js";
import { blocked, blockedBox, prewarmScatter } from "../src/render/biomes/scatter.js";
import { RecipeBuilder } from "../src/render/biomes/recipe.js";
import { drawSolidSet, VISTA_DRESSING, vistaMesh } from "../src/render/biomes/vistas.js";
import { LANDMARK_LIGHTS } from "../src/render/poi/landmarks.js";

/** Composed vistas (A1). Solid-looking pieces are drawn only from the shapes
 * that are also their collision (`VISTA_SOLIDS`); everything else is thin,
 * visual-only dressing. Neither may cost a passage, tether, mooring, park or
 * work pose. */
prewarmScatter();
const ctx: CheckContext = { floor: worldFloor, hazards: HAZARDS, solids: VISTA_SOLIDS };
const none = (problems: readonly string[], what: string): void =>
  assert.equal(problems.length, 0, `${what}:\n- ${problems.slice(0, 12).join("\n- ")}`);

test("REGRESSION (A1-R2-01): no false diver contact beside the arch and the ring", () => {
  // The reviewer's stationary diver poses, beside but clear of the drawn rock.
  const all = { floor: worldFloor, solids: [...STRUCTURE_SOLIDS, ...VISTA_SOLIDS] };
  for (const pose of [{ x: -211.9245, y: -25.3824, z: -118.7396 }, { x: 1355.3629, y: -454.3530, z: -691.4400 }])
    none(corridorProblems("diver", [pose, pose], all, { profile: "diver" }), `diver at ${JSON.stringify(pose)}`);
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
    // Unlit (-1), faintly luminous (-0.3, ATM-1's crystal glow) or plain.
    for (let i = 3; i < mesh.colors.length; i += 4) assert.ok(mesh.colors[i] === -1 || Math.abs(mesh.colors[i]! + 0.3) < 1e-6 || mesh.colors[i]! >= 1, `${id} alpha ${mesh.colors[i]}`);
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

test("INVARIANT (A1-R3-01): every vista set is drawn exactly once by a real chunk, its solids inside the world", () => {
  const chunks = worldLayout().chunks.filter(c => c.art.some(a => a.factory === "s2.scatter"));
  const owners = (x: number, z: number): number =>
    chunks.filter(c => x >= c.bounds.min.x && x < c.bounds.max.x && z >= c.bounds.min.z && z < c.bounds.max.z).length;
  // Control: the old pipe anchor lay past the world's east edge.
  assert.equal(owners(1478, -1590), 0, "an anchor outside the world has no owning chunk");
  for (const s of VISTA_SETS) assert.equal(owners(s.anchor.x, s.anchor.z), 1, `${s.id}: anchor must be owned by exactly one scatter chunk`);
  for (const p of [...VISTA_DRESSING, ...LANDMARK_LIGHTS]) assert.equal(owners(p.x, p.z), 1, `${p.id}: anchor must be owned by exactly one scatter chunk`);
  const E = WORLD_ENVELOPE;
  for (const s of VISTA_SOLIDS) assert.ok(s.bounds.min.x >= E.min.x && s.bounds.max.x <= E.max.x && s.bounds.min.z >= E.min.z && s.bounds.max.z <= E.max.z,
    `${s.id} lies outside the world envelope`);
  // No invisible solids and no swim-through art: every set with solids draws
  // art and every drawn set has solids...
  const own = (lod: "fine" | "coarse"): number => {
    let n = 0;
    for (const s of VISTA_SETS) {
      const b = new RecipeBuilder();
      drawSolidSet(b, s, lod === "fine");
      const solids = VISTA_SOLIDS.filter(k => k.id.startsWith(`vista.${s.id}.`)).length;
      assert.ok((b.vertexCount > 0) === (solids > 0), `${s.id}: ${b.vertexCount} art vertices but ${solids} solids`);
      n += b.vertexCount;
    }
    for (const p of [...VISTA_DRESSING, ...LANDMARK_LIGHTS]) { const b = new RecipeBuilder(); p.draw(b, worldFloor, lod === "fine"); n += b.vertexCount; }
    return n;
  };
  // ...and through the real chunk path, the chunks emit exactly that art once.
  for (const lod of ["fine", "coarse"] as const) {
    let emitted = 0;
    for (const c of chunks) {
      const g = vistaMesh(c, lod, worldFloor, () => false);
      let r = g.next();
      while (!r.done) r = g.next();
      emitted += r.value ? r.value.positions.length / 3 : 0;
    }
    assert.equal(emitted, own(lod), `${lod}: chunks emit every vista set's art exactly once`);
  }
});
