// The per-cave heavy checks for CA-2, registered for one region's caves by
// tests/caves-canopy.heavy.test.ts and tests/caves-basin.heavy.test.ts.
// Not a test file itself.
import test from "node:test";
import assert from "node:assert/strict";
import { EXTERIOR } from "../src/content/regions/caves.js";
import type { CaveGroup } from "../src/content/regions/caves/index.js";
import { CRAFT_PROFILES } from "../src/content/regions/passages.js";
import type { Vec3 } from "../src/sim/types.js";
import { caveExtent, checkLod, checkMouths, checkPortals, checkRock, checkRoof, checkRoutes, checkShellAgrees, checkTopology, collarSteps,
  deepestPose, defOf, dist, DIVER, frameOf, hasCycle, inRock, lightRetreat, plugs, retreatStarts, roomAt, roomGraph } from "./caves-canopy-basin-support.js";

/** Lamp-off retreats run sealed (every opening plugged) for these caves:
 * the control that the retreat can fail. */
export const SEALED_CONTROLS = new Set(["canopy_knot_hollow", "canopy_lantern_hall", "basin_culvert_north", "basin_dish_lee_vault"]);

export function registerCaveTests(groups: readonly CaveGroup[]): void {
  for (const g of groups) {
    const id = g.source.id;
    test(`${id}: thick rock in its own footprint and envelope`, () => assert.deepEqual(checkRock(g), []));
    test(`${id}: shell and rock agree`, () => assert.deepEqual(checkShellAgrees(g), []));
    test(`${id}: every opening keeps its clear size in rock and both shells; diver-only mouths stop a hull`, () => {
      assert.deepEqual([...checkPortals(g), ...checkMouths(g)], []);
    });
    test(`${id}: every route sweeps its profile, pose to pose, in the composed world`, () => assert.deepEqual(checkRoutes(g), []));
    test(`${id}: roof support: solid, 2 m thick, carries a diver, drawn in both shells, no holes`, () => assert.deepEqual(checkRoof(g), []));
    test(`${id}: coarse LOD never closes an opening or bridges a passage`, () => assert.deepEqual(checkLod(g), []));
    test(`${id}: the collar meets the heightfield at the footprint edge`, t => {
      const { failures, residuals } = collarSteps(g);
      assert.deepEqual(failures, []);
      for (const r of residuals) t.diagnostic(`corner ${r.corner.join(", ")}: ${r.step.toFixed(2)} m (bound ${r.bound.toFixed(2)} m)`);
    });
    test(`${id}: rooms touch exactly where the portals say`, () => assert.deepEqual(checkTopology(g), []));

    test(`${id}: size classes from the generated water`, () => {
      const def = defOf(g);
      for (const c of g.caves) {
        const e = caveExtent(def, c.rooms), span = [e.max.x - e.min.x, e.max.y - e.min.y, e.max.z - e.min.z], longest = Math.max(span[0]!, span[2]!);
        if (c.size === "small") {
          assert.ok(longest >= 10 && longest <= 25 && span.every(s => s <= 25), `${c.id}: small cave spans ${span.map(s => s.toFixed(1)).join(" x ")} m`);
          for (const e of c.exits) assert.ok(g.source.portals.find(p => p.id === e.portal)!.admits.every(a => a === "diver"), `${c.id}: ${e.exit} admits a hull`);
        } else assert.ok(longest >= 30 && longest <= 80 && span.every(s => s <= 80), `${c.id}: medium cave spans ${span.map(s => s.toFixed(1)).join(" x ")} m`);
      }
    });

    for (const c of g.caves.filter(c => c.size === "medium")) test(`${c.id}: a real loop in the voxels, swept through its closing passage; the hall takes ${c.hall!.admits}`, () => {
      const def = defOf(g), { pairs } = roomGraph(def), touch = (a: string, b: string): boolean => pairs.has([a, b].sort().join("|"));
      // Chamber graph from the generated rooms: an edge where two chambers touch,
      // or where one passage room touches both.
      const chambers = c.chambers!.map(k => k.room), passageRooms = c.rooms.filter(r => !chambers.includes(r));
      const edges = (skip?: string): [string, string][] => {
        const out: [string, string][] = [];
        for (let i = 0; i < chambers.length; i++) for (let j = i + 1; j < chambers.length; j++) {
          const a = chambers[i]!, b = chambers[j]!;
          if (touch(a, b) && skip !== `${a}|${b}` && skip !== `${b}|${a}`) out.push([a, b]);
          for (const p of passageRooms) if (p !== skip && touch(a, p) && touch(p, b)) out.push([a, b]);
        }
        return out;
      };
      assert.ok(hasCycle(chambers, edges()), `${c.id}: the generated chambers only chain`);
      const closer = c.passages!.find(p => p.id === c.loopCloser)!, portal = g.source.portals.find(p => p.id === closer.portal)!;
      const skip = closer.via ?? portal.between.join("|");
      assert.ok(!hasCycle(chambers, edges(skip)), `${c.id}: the loop survives without ${c.loopCloser}`);
      // A diver route swims through the closing passage's aperture.
      const through = (path: readonly Vec3[]): boolean => path.some((p, i) => i > 0 && (() => {
        const a = path[i - 1]!;
        for (let s = 0; s <= 20; s++) {
          const q = { x: a.x + (p.x - a.x) * s / 20, y: a.y + 0.5 + (p.y - a.y) * s / 20, z: a.z + (p.z - a.z) * s / 20 };
          if (dist(q, portal.center) < 1.5) return true;
        }
        return false;
      })());
      assert.ok(def.routes.some(r => r.profile === "diver" && through(r.path)), `${c.id}: no diver route through ${portal.id}`);
      // The hall: a route of its profile from one exit mouth to the other, through every hall room.
      const mouths = c.exits.map(e => g.source.portals.find(p => p.id === e.portal)!);
      const hall = def.routes.find(r => r.profile === c.hall!.admits && r.role === "loop");
      assert.ok(hall, `${c.id}: no ${c.hall!.admits} route`);
      const ends = [hall.path[0]!, hall.path[hall.path.length - 1]!];
      assert.ok(ends.every(p => roomAt(def, { ...p, y: p.y + 0.6 }) === "") && mouths.every(m => ends.some(p => dist(p, m.center) < 15)),
        `${hall.id}: does not run mouth to mouth outside`);
      for (const r of c.hall!.rooms) assert.ok(hall.path.some(p => roomAt(def, { ...p, y: p.y + 0.6 }) === r), `${hall.id}: misses ${r}`);
      for (const m of mouths) assert.ok(m.admits.includes(c.hall!.admits), `${m.id}: does not admit ${c.hall!.admits}`);
      assert.ok(CRAFT_PROFILES[c.hall!.admits].radius > DIVER.radius);
    });

    test(`${id}: lamp off, a diver anywhere on the routes swims the daylight glow out`, t => {
      const def = defOf(g), fr = frameOf(def), starts = retreatStarts(def);
      assert.ok(starts.length >= 10, `${starts.length} starts`);
      const r = lightRetreat(def, fr, starts);
      assert.deepEqual(r.failures, []);
      assert.ok(r.hops >= starts.length, "the retreat is a swim of hops, not a jump");
      const openings = def.portals.filter(p => p.kind === "mouth" && p.between.includes(EXTERIOR));
      if (openings.length >= 2) assert.ok(Object.keys(r.exits).length >= 2, `exits used: ${JSON.stringify(r.exits)}`);
      t.diagnostic(`${starts.length} starts, ${r.hops} hops, longest swim ${r.longest.toFixed(1)} m, exits ${JSON.stringify(r.exits)}`);
    });
    if (SEALED_CONTROLS.has(id)) test(`${id}: negative control: with every opening plugged the same retreat fails`, () => {
      const def = defOf(g), starts = retreatStarts(def).filter((_, i) => i % 3 === 0);
      const r = lightRetreat(def, frameOf(def, plugs(def)), starts);
      assert.ok(r.failures.length >= starts.length * 0.9, `${r.failures.length} of ${starts.length} escaped a sealed cave`);
    });

    test(`${id}: contents sit in their room's water`, () => {
      const def = defOf(g), near = (p: Vec3, room: string): boolean => {
        for (const d of [0, 0.25, 0.5, 0.75]) for (const o of [{ x: 0, y: 0, z: 0 }, { x: d, y: 0, z: 0 }, { x: -d, y: 0, z: 0 }, { x: 0, y: d, z: 0 },
          { x: 0, y: -d, z: 0 }, { x: 0, y: 0, z: d }, { x: 0, y: 0, z: -d }])
          if (roomAt(def, { x: p.x + o.x, y: p.y + o.y, z: p.z + o.z }) === room) return true;
        return false;
      };
      for (const x of [...g.pockets, ...g.finds]) {
        assert.ok(!inRock(def, x.at), `${x.id}: inside rock`);
        assert.ok(near(x.at, x.room), `${x.id}: not in ${x.room}'s water`);
      }
      for (const r of g.residents) {
        assert.ok(roomAt(def, r.at) === r.room, `${r.id}: spawn centre not in ${r.room}`);
        const around = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(([a, b, c]) => ({ x: r.at.x + a! * r.radius, y: r.at.y + b! * r.radius, z: r.at.z + c! * r.radius }));
        assert.ok(around.filter(p => roomAt(def, p) !== "").length >= 4, `${r.id}: its ${r.radius} m spread leaves the water`);
      }
    });

    for (const h of g.handoffs) test(`${h.id}: the back entrance stops sealed at its biome face, with room to turn`, () => {
      const def = defOf(g), f = def.replacementFootprints[0]!;
      assert.equal(roomAt(def, { x: h.center.x - h.normal.x * 1.2, y: h.center.y, z: h.center.z - h.normal.z * 1.2 }), h.room, `${h.id}: the bay is not behind the face`);
      const toEdge = h.normal.x > 0 ? f.maxX - h.center.x : h.normal.x < 0 ? h.center.x - f.minX : h.normal.z > 0 ? f.maxZ - h.center.z : h.center.z - f.minZ;
      assert.ok(toEdge > 0 && toEdge <= 3, `${h.id}: ${toEdge.toFixed(1)} m from the footprint edge`);
      for (let d = 0.3; d < toEdge; d += 0.25) {
        const p = { x: h.center.x + h.normal.x * d, y: h.center.y, z: h.center.z + h.normal.z * d };
        assert.ok(inRock(def, p) || roomAt(def, p) === "" && d > toEdge - 0.5, `${h.id}: open at ${d.toFixed(2)} m past the face`);
      }
      // A diver turns in the bay: clear facing both ways at its centre.
      const fr = frameOf(def), bay = deepestPose(def, h.room);
      assert.ok(bay && fr.world.clearance(bay, DIVER), `${h.id}: no room to turn`);
      // Turning room: the diver clears with its box grown to its full length (0.95 m) across.
      assert.ok(fr.world.clearance(bay!, { ...DIVER, radius: DIVER.height / 2 }), `${h.id}: too tight to turn round`);
    });
  }
}
