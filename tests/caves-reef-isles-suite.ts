// The CA-1 per-region cave suite (not a test file itself): tests/caves-reef.test.ts
// and tests/caves-isles.test.ts each run it over their region's caves.
import test from "node:test";
import assert from "node:assert/strict";
import { assertDisjointFootprints, AUTHORED_CAVE_SOURCES, type CaveSource } from "../src/content/regions/caves.js";
import { caveNeighbours, sharedSpans, sharesEdge } from "../src/content/regions/caveGeometry.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { CAVE_CONTENTS, type CaveContent } from "../src/content/regions/caves/contents.js";
import { CAVE_NETWORKS, MEDIUM_CAVE_GRAPHS } from "../src/content/regions/caves/networks.js";
import type { AreaProposal } from "../src/content/proposals/types.js";
import { SOURCES } from "../src/content/registry.js";
import { CRAFT_PROFILES } from "../src/content/regions/passages.js";
import type { Vec3 } from "../src/sim/types.js";
import { caveShell } from "../src/content/regions/caveGeometry.js";
import {
  collarFailures, contractFailures, droppedVoxels, frame, kit, lodFailures, openingFailures, ownerAt, rockDistance, roofFailures,
  roomAt, routeFailures, seamFailures, shellRockFailures, sourceOf, SMALL,
} from "./caves-reef-isles-support.js";

const all = (ids: readonly string[], check: (id: string) => string[]): string[] => ids.flatMap(id => check(id));
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Horizontal extent of a cave's own water, leaving out rooms that belong to
 * crawls joining it to another cave. */
export function waterExtent(id: string, withLinks = false): { x: number; z: number; y: number } {
  const { volume: v } = kit(id), g = v.grid;
  const linkRooms = new Set(withLinks ? [] : CAVE_NETWORKS.flatMap(n => n.links.flatMap(l => l.rooms)));
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let k = 0; k < g.nz; k++) for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const at = i + g.nx * (j + g.ny * k), r = v.room[at]!;
    if (!r || v.solid[at] || !v.owned[at] || linkRooms.has(v.roomIds[r - 1]!)) continue;
    x0 = Math.min(x0, i); x1 = Math.max(x1, i); z0 = Math.min(z0, k); z1 = Math.max(z1, k); y0 = Math.min(y0, j); y1 = Math.max(y1, j);
  }
  return { x: (x1 - x0 + 1) * g.voxel, z: (z1 - z0 + 1) * g.voxel, y: (y1 - y0 + 1) * g.voxel };
}

export function regionSuite(name: string, sources: readonly CaveSource[], bible: AreaProposal): void {
  const ids = sources.map(s => s.id);
  const style = name === "Reef" ? { rock: "limestone", resident: "vault_glimmer" } : { rock: "basalt", resident: "tide_clapper" };

  test(`${name} caves: every small and medium cave in the bible is authored with the kit`, () => {
    const authored = new Set(AUTHORED_CAVE_SOURCES.map(s => s.id));
    for (const c of bible.caves) assert.ok(authored.has(c.id), `${c.id} is not authored`);
    for (const s of sources) {
      assert.ok(bible.caves.some(c => c.id === s.id), `${s.id} is not a bible cave`);
      assert.deepEqual(s.style, style, `${s.id} wears the ${name} style`);
      assert.equal(s.region, bible.area);
    }
  });

  test(`${name} caves: footprints are clear of the opening's protected area, routes, sites and structures, and never overlap`, () => {
    assert.doesNotThrow(() => assertDisjointFootprints(AUTHORED_CAVE_SOURCES));
    assert.deepEqual(all(ids, contractFailures), []);
    // Neighbours are exactly the caves a link names; nothing else touches.
    for (const s of sources) for (const o of AUTHORED_CAVE_SOURCES) if (o !== s && sharesEdge(s.footprint, o.footprint))
      assert.ok(CAVE_NETWORKS.some(n => n.links.some(l => l.between.includes(s.id) && l.between.includes(o.id))), `${s.id} touches ${o.id} without a link`);
  });

  test(`${name} caves: the shell and the rock agree (every 8th shell point; all of them in the heavy tier)`, () => {
    assert.deepEqual(all(ids, id => shellRockFailures(id, 8)), []);
    assert.deepEqual(all(ids, collarFailures), []);
  });

  test(`${name} caves: every opening keeps its clear size, diver-only mouths stop a hull, and every route sweeps`, () => {
    assert.deepEqual(all(ids, openingFailures), []);
    assert.deepEqual(all(ids, routeFailures), []);
    for (const s of sources) {
      const exits = s.portals.filter(p => p.kind === "mouth" || p.kind === "skylight");
      assert.ok(exits.length >= 1, `${s.id} has no exit`);
      assert.ok(s.routes.length >= 1, `${s.id} has no route`);
    }
  });

  test(`${name} caves: roofs are real rock at least 2 m thick, drawn at both LODs, with no holes`, () => {
    assert.deepEqual(all(ids, roofFailures), []);
  });

  test(`${name} caves: coarse LOD never closes an opening or a route`, () => {
    assert.deepEqual(all(ids, lodFailures), []);
  });

  test(`${name} caves: small caves are 10-25 m of their own water, medium 30-80 m`, () => {
    for (const s of sources) {
      const b = bible.caves.find(c => c.id === s.id)!, e = waterExtent(s.id), longest = Math.max(e.x, e.z);
      if (b.size === "small") {
        // Its own water is at most 25 m; at least 10 m counting the crawls it
        // owns (a crawl cave such as the Cove crawl is mostly crawl).
        const w = waterExtent(s.id, true);
        assert.ok(Math.max(w.x, w.z) >= 10 && e.x <= 25 && e.z <= 25, `${s.id}: ${e.x} x ${e.z} m, ${w.x} x ${w.z} m with its crawls`);
        assert.ok(s.portals.filter(p => p.kind === "mouth").every(p => !p.admits.includes("small")), `${s.id} is diver-only`);
      } else assert.ok(longest >= 30 && longest <= 80, `${s.id}: ${e.x} x ${e.z} m`);
    }
  });

  test(`${name} caves: crawl links share a seam, both sources list the crawl, and each has swept link and rescue routes`, () => {
    for (const n of CAVE_NETWORKS) for (const l of n.links) {
      if (!l.between.some(id => ids.includes(id))) continue;
      const [a, b] = l.between.map(sourceOf) as [CaveSource, CaveSource];
      assert.ok(sharesEdge(a.footprint, b.footprint), `${l.id}: no shared edge`);
      assert.ok(sharedSpans(a.footprint, [b]).some(s => s.axis === l.seam.axis && s.at === l.seam.at), `${l.id}: seam`);
      assert.ok(caveNeighbours(kit(a.id).def).includes(b) && caveNeighbours(kit(b.id).def).includes(a), `${l.id}: not built as neighbours`);
      const shared = a.carves.filter(c => b.carves.some(d => d.id === c.id));
      assert.ok(shared.length >= 1, `${l.id}: no carve listed in both sources`);
      for (const r of l.rooms) assert.ok(AUTHORED_CAVE_SOURCES.some(s => s.rooms.some(x => x.id === r)), `${l.id}: room ${r}`);
      const route = [...a.routes, ...b.routes].find(r => r.id === l.route);
      assert.ok(route && route.role === "link", `${l.id}: link route ${l.route}`);
      const owners = new Set(route.path.map(p => ownerAt(p.x, p.z)?.id).filter(Boolean));
      assert.ok(owners.has(a.id) && owners.has(b.id), `${l.id}: the link route stays in one cave`);
      for (const r of l.rescue) assert.ok(AUTHORED_CAVE_SOURCES.some(s => s.routes.some(x => x.id === r && x.role === "exit")), `${l.id}: rescue ${r}`);
      assert.deepEqual([...seamFailures(a.id), ...seamFailures(b.id)], []);
    }
  });

  test(`${name} caves: medium caves contain a cycle, two or more exits, and a hall a small craft can turn in`, () => {
    for (const s of sources.filter(s => bible.caves.find(c => c.id === s.id)!.size === "medium")) {
      const g = MEDIUM_CAVE_GRAPHS.find(m => m.cave === s.id)!, b = bible.caves.find(c => c.id === s.id)!;
      assert.ok(g, `${s.id} has no chamber graph`);
      // The bible's chambers, exits and passages, one for one.
      assert.deepEqual(Object.keys(g.chambers).sort(), [...b.chambers!].sort());
      assert.deepEqual(Object.keys(g.exits).sort(), [...b.exits].sort());
      assert.deepEqual(Object.keys(g.passages).sort(), b.passages!.map(p => p.id).sort());
      assert.equal(g.loopCloser, b.loopCloser);
      // Each passage is a chain of real portals from its `from` to its `to`.
      const roomsOf = (end: string): Set<string> => new Set(g.chambers[end] ?? (g.exits[end] ? ["exterior"] : []));
      for (const p of b.passages!) {
        const chain = g.passages[p.id]!.map(id => s.portals.find(q => q.id === id)!);
        assert.ok(chain.every(Boolean), `${s.id}.${p.id}: unknown portal`);
        const from = roomsOf(p.from), to = roomsOf(p.to);
        assert.ok(chain[0]!.between.some(r => from.has(r) || to.has(r)) && chain[chain.length - 1]!.between.some(r => from.has(r) || to.has(r)),
          `${s.id}.${p.id}: does not join ${p.from} and ${p.to}`);
        for (let i = 1; i < chain.length; i++)
          assert.ok(chain[i]!.between.some(r => chain[i - 1]!.between.includes(r)), `${s.id}.${p.id}: portals do not chain`);
        if (g.exits[p.from] || g.exits[p.to]) assert.ok(chain.some(q => q.id === g.exits[p.from] || q.id === g.exits[p.to]), `${s.id}.${p.id}: exit portal`);
      }
      // A cycle among the chambers alone: chamber-to-chamber passages >= chambers, connected.
      const chambers = Object.keys(g.chambers), inner = b.passages!.filter(p => chambers.includes(p.from) && chambers.includes(p.to));
      const parent = new Map(chambers.map(c => [c, c]));
      const root = (c: string): string => parent.get(c) === c ? c : root(parent.get(c)!);
      let cycle = false;
      for (const p of inner) { const [x, y] = [root(p.from), root(p.to)]; if (x === y) cycle = true; else parent.set(x, y); }
      assert.ok(cycle, `${s.id}: the chambers only chain`);
      assert.ok(Object.keys(g.exits).length >= 2, `${s.id}: fewer than two exits`);
      // The swept loop route visits every chamber; the hull route crosses the hall mouth to mouth.
      const loop = s.routes.find(r => r.id === g.loopRoute)!, visited = new Set(loop.path.map(p => roomAt({ ...p, y: p.y + 0.5 })));
      for (const c of chambers) assert.ok(g.chambers[c]!.some(r => visited.has(r)), `${s.id}: the loop route misses the ${c}`);
      const hull = s.routes.find(r => r.id === g.hullRoute)!;
      assert.ok(hull.profile === "small" && hull.role === "loop", `${s.id}: hull route`);
      const bay = s.staging.find(t => t.profiles.includes("small") && t.id.endsWith("turning_bay"))!;
      const fr = frame([s.id]);
      assert.ok(bay && fr.world.clearance(fr.at(bay.position), SMALL), `${s.id}: no room to hold a small craft in the hall`);
      assert.ok(s.portals.some(p => p.kind === "mouth" && p.admits.includes("small")) && b.admits === "small");
    }
  });

  test(`${name} caves: staging spots outside the caves clear their craft`, () => {
    for (const s of sources) for (const t of s.staging) {
      const fr = frame([s.id]);
      for (const prof of t.profiles) assert.ok(fr.world.clearance(fr.at(t.position), CRAFT_PROFILES[prof]), `${t.id}: ${prof} has no room`);
      assert.ok(t.position.y >= worldFloor(t.position.x, t.position.z) - 0.01 || roomAt(t.position) !== "", `${t.id} is under the seabed`);
    }
  });

  test(`${name} caves: contents sit in their rooms on real surfaces, name bible proposals, and no required material is cave-only`, () => {
    const contents = CAVE_CONTENTS.filter(c => ids.includes(c.cave) || (name === "Reef" && c.cave === "fanvault"));
    const refs = new Set<string>([...bible.caves.map(c => c.id), ...bible.resources.map(r => r.id), ...bible.sideRewards.map(r => r.id),
      ...bible.lostSites.map(l => l.id), ...bible.creatures.map(c => c.species)]);
    const ofKind = (k: CaveContent["kind"]): number => contents.filter(c => c.kind === k).length;
    assert.ok(ofKind("resource") >= 3 && ofKind("resident") >= 5 && ofKind("find") >= 4, "too few contents");
    assert.equal(new Set(CAVE_CONTENTS.map(c => c.id)).size, CAVE_CONTENTS.length);
    for (const c of contents) {
      assert.ok(refs.has(c.ref), `${c.id}: ${c.ref} is not a ${name} bible proposal`);
      const lift = c.on === "floor" ? 0.3 : c.on === "ceiling" ? -0.3 : 0;
      assert.equal(roomAt({ ...c.at, y: c.at.y + lift }), c.room, `${c.id} is not in ${c.room}`);
      if (c.on !== "water") assert.ok(rockDistance(c.at, 2) <= 0.6, `${c.id} floats ${rockDistance(c.at, 2).toFixed(2)} m off its ${c.on}`);
      if (c.kind === "resident") assert.equal(c.ref, style.resident, `${c.id} is not the ${name} resident`);
      if (c.kind === "resource") {
        const r = bible.resources.find(x => x.id === c.ref)!;
        assert.ok(r && r.item === c.item && r.inCave === c.cave, `${c.id}: bible resource ${c.ref}`);
        // Required materials always have a registry source outside every cave.
        const outside = Object.values(SOURCES).filter(s => (s as { item: string }).item === c.item &&
          !ownerAt((s as { position: Vec3 }).position.x, (s as { position: Vec3 }).position.z));
        assert.ok(outside.length >= 2, `${c.item} is cave-only`);
      }
      // A diver can reach it: a clear pose within 2.5 m on a swept route or in its room.
      const fr = frame([c.cave]);
      let reach = false;
      for (let dx = -2; dx <= 2 && !reach; dx += 0.5) for (let dy = -2; dy <= 2 && !reach; dy += 0.5) for (let dz = -2; dz <= 2 && !reach; dz += 0.5) {
        const p = { x: c.at.x + dx, y: c.at.y + dy, z: c.at.z + dz };
        if (dist(p, c.at) <= 2.5 && roomAt({ ...p, y: p.y + 0.5 }) === c.room && fr.world.clearance(fr.at(p), CRAFT_PROFILES.diver)) reach = true;
      }
      assert.ok(reach, `${c.id}: no diver pose within 2.5 m`);
    }
    // Every bible resource held in one of these caves is placed.
    for (const r of bible.resources.filter(r => r.inCave && (ids.includes(r.inCave) || r.inCave === "fanvault")))
      assert.ok(contents.some(c => c.ref === r.id), `${r.id} is not placed`);
  });

  test(`${name} caves: the shell wears the region's stone and resident`, () => {
    for (const s of sources) {
      const m = caveShell(kit(s.id).def, "fine");
      let unlitCeiling = 0, ceilings = 0, clapper = 0, walls = 0;
      for (let v = 0; v < m.positions.length / 3; v++) {
        const ny = m.normals[v * 3 + 1]!, a = m.colors[v * 4 + 3]!, r = m.colors[v * 4]!, gr = m.colors[v * 4 + 1]!, bl = m.colors[v * 4 + 2]!;
        if (ny < -0.45) { ceilings++; if (a === -1) unlitCeiling++; }
        if (Math.abs(ny) < 0.5) { walls++; if (r > 0.75 && gr > 0.7 && bl > 0.6 && r > bl) clapper++; }
      }
      if (style.resident === "vault_glimmer") assert.ok(unlitCeiling > ceilings * 0.05, `${s.id}: ${unlitCeiling} of ${ceilings} ceiling vertices glimmer`);
      else assert.ok(clapper > walls * 0.02, `${s.id}: ${clapper} of ${walls} wall vertices carry clappers`);
      const d = droppedVoxels(s.id);
      assert.ok(d.wall <= d.rock * 0.002, `${s.id}: ${d.wall} thin wall voxels`);
    }
  });
}
