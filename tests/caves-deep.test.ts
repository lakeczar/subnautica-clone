// CA-3: the Ember Rift, Mirror Divide and Meridian small and medium caves as
// data. No geometry is built here (that is caves-deep*.heavy.test.ts); these
// hold every cave to the content bible, the world's datums and the hazard
// rules, cheaply.
import test from "node:test";
import assert from "node:assert/strict";
import { assertDisjointFootprints, AUTHORED_CAVE_SOURCES, EXTERIOR } from "../src/content/regions/caves.js";
import { CANOPY_BASIN_SOURCES } from "../src/content/regions/caves/index.js";
import { DEEP_CAVES, DEEP_CAVE_HAZARDS, DEEP_CAVE_SOURCES, caveFieldLevel, sampleDeepHazards } from "../src/content/regions/caves/deep.js";
import { EXTERIOR as DEEP_EXTERIOR, KILN_BREATH, type DeepCave } from "../src/content/regions/caves/deepKit.js";
import { readFileSync } from "node:fs";
import { AREAS, REQUIRED_SOURCES } from "../src/content/proposals/index.js";
import type { CaveProposal } from "../src/content/proposals/index.js";
import { SITES } from "../src/content/regions/sites.js";
import { STRUCTURE_SOLIDS } from "../src/content/regions/structures.js";
import { ROUTES, CRAFT_PROFILES } from "../src/content/regions/passages.js";
import { BRINE_Y, LEGACY_PRESERVE } from "../src/content/regions/terrain.js";
import { regionAtPoint } from "../src/content/regions/layout.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { STORY_PLACEMENTS } from "../src/content/story/placements.js";
import { sitePosition } from "../src/content/ecology/sites.js";
import { HULL_COLLIDERS, HULLS, SOURCES } from "../src/content/registry.js";
import { UNPROTECTED } from "../src/content/ecology/hazards.js";
import type { Rect } from "../src/world/types.js";

const AREA_IDS = ["thermal_rift", "brine_divide", "deep_district"] as const;
const areas = AREAS.filter(a => (AREA_IDS as readonly string[]).includes(a.area));
const proposals = areas.flatMap(a => a.caves);
const proposal = (id: string): CaveProposal => {
  const p = proposals.find(p => p.id === id);
  assert.ok(p, `no bible cave ${id}`);
  return p;
};
const inRect = (r: Rect, x: number, z: number, pad = 0): boolean => x >= r.minX - pad && x <= r.maxX + pad && z >= r.minZ - pad && z <= r.maxZ + pad;
const rectDistance = (r: Rect, x: number, z: number): number => Math.hypot(Math.max(r.minX - x, 0, x - r.maxX), Math.max(r.minZ - z, 0, z - r.maxZ));
const portal = (c: DeepCave, id: string) => c.source.portals.find(p => p.id === id);

test("the deep sources import nothing but types from caves.ts, so the cave lists can include them without a cycle", () => {
  assert.equal(DEEP_EXTERIOR, EXTERIOR);
  for (const f of ["deepKit", "deep", "rift", "divide", "meridian"]) {
    const text = readFileSync(new URL(`../../src/content/regions/caves/${f}.ts`, import.meta.url), "utf8");
    for (const m of text.matchAll(/import ([^;]*) from "\.\.\/caves\.js";/g)) assert.ok(m[1]!.startsWith("type "), `${f}.ts imports values from caves.ts: ${m[0]}`);
  }
});

test("every bible small and medium cave for the Rift, Divide and Meridian is realised exactly once", () => {
  const realised = DEEP_CAVES.flatMap(c => c.bible);
  assert.deepEqual([...realised].sort(), proposals.map(p => p.id).sort());
  assert.equal(new Set(DEEP_CAVE_SOURCES.map(s => s.id)).size, DEEP_CAVE_SOURCES.length);
  for (const c of DEEP_CAVES) {
    const ps = c.bible.map(proposal);
    for (const p of ps) {
      assert.equal(p.size, c.size, `${c.source.id}: size`);
      assert.equal(p.area, c.source.region, `${c.source.id}: region`);
    }
    // Every bible exit is a real opening (mouth or skylight) of this cave.
    assert.deepEqual(Object.keys(c.exits).sort(), ps.flatMap(p => p.exits).sort(), `${c.source.id}: exits`);
    for (const [name, id] of Object.entries(c.exits)) {
      const o = portal(c, id);
      assert.ok(o && (o.kind === "mouth" || o.kind === "skylight") && o.between.includes(EXTERIOR), `${c.source.id}: exit ${name} is not an opening`);
    }
    const openings = c.source.portals.filter(o => o.kind !== "throat");
    assert.ok(openings.every(o => Object.values(c.exits).includes(o.id)), `${c.source.id}: an opening the bible doesn't list`);
    if (c.size === "medium") {
      const p = ps[0]!;
      assert.ok(openings.length >= 2, `${c.source.id}: a medium cave needs two exits`);
      assert.deepEqual(Object.keys(c.graph!.chambers).sort(), [...p.chambers!].sort(), `${c.source.id}: chambers`);
      assert.equal(c.graph!.loopCloser.passage, p.loopCloser, `${c.source.id}: loop closer`);
      const rooms = new Set(c.source.rooms.map(r => r.id));
      for (const r of [...Object.values(c.graph!.chambers).flat(), ...c.graph!.loopCloser.rooms]) assert.ok(rooms.has(r), `${c.source.id}: graph names ${r}`);
    } else assert.ok(!c.graph && !c.hall, `${c.source.id}: a small cave has no hall`);
  }
});

test("caves own disjoint footprints in their region, clear of the preserve, datums, structures, routes and story sites", () => {
  // CW-1: the registry lists every cave once (root's, CA-2's and these).
  assert.ok(DEEP_CAVE_SOURCES.every(s => AUTHORED_CAVE_SOURCES.includes(s)) && CANOPY_BASIN_SOURCES.every(s => AUTHORED_CAVE_SOURCES.includes(s)));
  assert.doesNotThrow(() => assertDisjointFootprints(AUTHORED_CAVE_SOURCES));
  const storySites = Object.values(STORY_PLACEMENTS).map(p => SITES.find(s => s.id === p.s2)).filter(s => !!s);
  for (const s of DEEP_CAVE_SOURCES) {
    const f = s.footprint;
    for (const [x, z] of [[f.minX, f.minZ], [f.maxX, f.minZ], [f.minX, f.maxZ], [f.maxX, f.maxZ]] as const)
      assert.equal(regionAtPoint(x, z), s.region, `${s.id}: corner ${x}, ${z}`);
    const P = LEGACY_PRESERVE;
    assert.ok(f.maxX <= P.minX || f.minX >= P.maxX || f.maxZ <= P.minZ || f.minZ >= P.maxZ, `${s.id}: inside the legacy preserve`);
    for (const site of SITES) assert.ok(!inRect(f, site.at.x, site.at.z), `${s.id}: footprint contains site ${site.id}`);
    for (const [id, src] of Object.entries(SOURCES)) assert.ok(!inRect(f, src.position.x, src.position.z), `${s.id}: footprint contains source ${id}`);
    for (const { id, bounds: b } of STRUCTURE_SOLIDS)
      assert.ok(b.max.x < f.minX || b.min.x > f.maxX || b.max.z < f.minZ || b.min.z > f.maxZ, `${s.id}: overlaps ${id}`);
    // Route corridors: no route runs through a footprint, and no built-up
    // rock (a terrace at its battered base, wobble included) enters a route's
    // half-width. Replacing flat seabed with the same seabed is harmless; the
    // composed sweeps are held in the heavy test.
    for (const r of ROUTES) for (const p of r.path) {
      assert.ok(rectDistance(f, p.x, p.z) > 2, `${r.id} passes through ${s.id}`);
      for (const t of s.terraces) {
        const reach = Math.max(...t.radii) + t.batter * Math.max(0, t.level - worldFloor(t.center[0], t.center[1])) + t.wobble;
        assert.ok(Math.hypot(p.x - t.center[0], p.z - t.center[1]) > reach + r.minHalfWidth, `${r.id} passes within its half-width of ${t.id}`);
      }
    }
    // Story-neutral: 30 m or more from every placed story site.
    for (const site of storySites) assert.ok(rectDistance(f, site!.at.x, site!.at.z) >= 30, `${s.id} is ${rectDistance(f, site!.at.x, site!.at.z).toFixed(1)} m from story site ${site!.id}`);
    // Every opening and every staging pad sits in or at the footprint.
    for (const o of s.portals) assert.ok(inRect(f, o.center.x, o.center.z), `${o.id} is outside ${s.id}`);
    for (const st of s.staging) assert.ok(!inRect(f, st.position.x, st.position.z), `${st.id} parks inside ${s.id}`);
  }
});

test("small caves are diver-only; medium halls admit their profile, and every listed craft fits it and is rated for the hall's deepest keel", () => {
  for (const c of DEEP_CAVES) {
    const s = c.source;
    if (c.size === "small") {
      for (const o of s.portals) assert.deepEqual(o.admits, ["diver"], `${o.id}: a small cave admits only divers`);
      for (const r of s.routes) assert.equal(r.profile, "diver", `${r.id}: a small cave has only diver routes`);
      for (const p of s.staging) assert.ok(p.profiles.every(q => q !== "diver"));
      continue;
    }
    const hall = c.hall!, shape = CRAFT_PROFILES[hall.profile];
    const routes = s.routes.filter(r => r.profile === hall.profile);
    assert.ok(routes.length >= 1, `${s.id}: no ${hall.profile} route through the hall`);
    assert.ok(s.portals.some(o => o.kind !== "throat" && o.admits.includes(hall.profile)), `${s.id}: no opening admits ${hall.profile}`);
    const deepest = -Math.min(...routes.flatMap(r => r.path.map(p => p.y)));
    assert.ok(hall.craft.length >= 1);
    for (const h of hall.craft) {
      const collider = HULL_COLLIDERS[h];
      assert.ok(collider.radius <= shape.radius + 1e-9 && collider.height <= shape.height + 1e-9, `${s.id}: ${h} does not fit the ${hall.profile} profile`);
      assert.ok(HULLS[h].maximumDepth >= deepest, `${s.id}: ${h} (${HULLS[h].maximumDepth} m) is not rated for ${deepest.toFixed(1)} m`);
    }
    // And no rated hull of the profile is left off the list.
    for (const [h, col] of Object.entries(HULL_COLLIDERS) as [keyof typeof HULLS, { radius: number; height: number }][])
      if (h !== "hearthline" && HULLS[h].maximumDepth >= deepest && col.radius <= shape.radius && col.height <= shape.height && HULLS[h].maximumDepth > 0)
        assert.ok(hall.craft.includes(h), `${s.id}: ${h} fits and is rated but is not listed`);
  }
});

test("contents name the bible's IDs, keep its items and stock, and cover every listed content", () => {
  const resources = areas.flatMap(a => a.resources), rewards = areas.flatMap(a => a.sideRewards);
  for (const c of DEEP_CAVES) {
    const rooms = new Set([...c.source.rooms.map(r => r.id), EXTERIOR]);
    const covered = new Set<string>();
    for (const item of c.contents) {
      assert.ok(rooms.has(item.room), `${item.id}: room ${item.room}`);
      const b = item.bible;
      if (b.kind === "resource") {
        const r = resources.find(r => r.id === b.id);
        assert.ok(r, `${item.id}: unknown resource ${b.id}`);
        assert.ok(r.inCave && c.bible.includes(r.inCave), `${item.id}: ${b.id} belongs to ${r.inCave}`);
        assert.equal(item.item, r.item, `${item.id}: item`);
        assert.equal(item.stock, r.stock[0], `${item.id}: stock`);
        // Depth-tiered materials keep their bible depth band: never shallower.
        if (r.item === "brine_lattice") assert.ok(-item.at.y >= 450, `${item.id}: lattice above 450 m`);
        covered.add(`resource:${b.id}`);
      } else if (b.kind === "reward") {
        assert.ok(rewards.some(w => w.id === b.id), `${item.id}: unknown reward ${b.id}`);
        covered.add(`reward:${b.id}`);
      } else if (b.kind === "line") {
        assert.ok(c.bible.includes(b.cave) && proposal(b.cave).contents.includes(b.line), `${item.id}: "${b.line}" is not in ${b.cave}'s contents`);
        covered.add(`line:${b.line}`);
      } else {
        assert.ok(c.bible.includes(b.cave) && proposal(b.cave).links.some(l => l.id === b.id), `${item.id}: ${b.id} is not a link of ${b.cave}`);
      }
    }
    // Every bible resource in this cave is realised.
    for (const r of resources.filter(r => r.inCave && c.bible.includes(r.inCave)))
      assert.ok(covered.has(`resource:${r.id}`), `${c.source.id}: bible resource ${r.id} not placed`);
    // Each content line is realised by a line, or by the resource or reward it describes.
    const items = c.contents.length;
    assert.ok(items >= c.bible.reduce((n, id) => n + Math.min(1, proposal(id).contents.length), 0), `${c.source.id}: ${items} content items`);
  }
});

test("required materials are never cave-only: every required item placed in these caves keeps exterior sources outside them", () => {
  const required = new Map(REQUIRED_SOURCES.map(r => [r.item as string, r]));
  const proposed = areas.flatMap(a => [...a.resources, ...a.landmarks]);
  const where = (ref: { kind: string; id: string }): { x: number; z: number } | null => {
    if (ref.kind === "proposal") { const r = AREAS.flatMap(a => [...a.resources, ...a.landmarks]).find(r => r.id === ref.id) ?? proposed.find(r => r.id === ref.id); return r ? r.at : null; }
    if (ref.kind === "source") { const s = (SOURCES as Record<string, { position: { x: number; z: number } }>)[ref.id]; return s ? s.position : null; }
    if (ref.kind === "site") { const s = SITES.find(s => s.id === ref.id); return s ? s.at : null; }
    return null;
  };
  let checked = 0;
  for (const c of DEEP_CAVES) for (const item of c.contents) {
    const req = item.item && required.get(item.item);
    if (!req) continue;
    checked++;
    const outside = req.exterior.map(where).filter(p => !!p && !DEEP_CAVE_SOURCES.some(s => inRect(s.footprint, p.x, p.z)));
    assert.ok(outside.length >= 2, `${item.id}: ${item.item} has ${outside.length} exterior sources outside the deep caves`);
  }
  assert.ok(checked >= 4, `${checked} required-material contents checked`);
});

test("darkness: every exit has an unlit cue, a cave's exits never share a colour, and each bible resident is present", () => {
  const lit = new Set(SITES.map(s => s.id));
  for (const c of DEEP_CAVES) {
    const rooms = new Set(c.source.rooms.map(r => r.id));
    const colours = new Map<string, string>();
    for (const exit of Object.values(c.exits)) {
      const cues = c.cues.filter(q => q.meaning === "exit" && q.exit === exit);
      assert.ok(cues.length >= 1, `${c.source.id}: exit ${exit} has no lamp-off cue`);
      for (const q of cues) {
        const key = q.color.join(",");
        assert.ok(!colours.has(key) || colours.get(key) === exit, `${c.source.id}: ${exit} and ${colours.get(key)} share a cue colour`);
        colours.set(key, exit);
      }
    }
    for (const q of c.cues) {
      assert.ok(rooms.has(q.room), `${q.id}: room ${q.room}`);
      assert.ok(q.points.length >= 2, `${q.id}: a cue is a short line`);
      if (q.exit) assert.ok(Object.values(c.exits).includes(q.exit), `${q.id}: names ${q.exit}`);
      if (q.meaning === "live_line") assert.ok(q.species === "cable_tender" && q.feeds && lit.has(q.feeds), `${q.id}: a live line must name the lit site it feeds`);
    }
    for (const id of c.bible) {
      const resident = proposal(id).resident;
      if (resident) assert.ok(c.cues.some(q => q.species === resident), `${c.source.id}: bible resident ${resident} missing`);
    }
  }
});

test("hazards: heat breathes only in warm Rift tubes, never over a whole cave; brine pools sit a metre under every route", () => {
  for (const h of DEEP_CAVE_HAZARDS) {
    const c = DEEP_CAVES.find(c => c.source.id === h.cave)!;
    assert.ok(c, `${h.id}: unknown cave`);
    if (h.kind === "heat") {
      assert.equal(c.source.region, "thermal_rift", `${h.id}: heat outside the Rift`);
      if (h.cycle) {
        assert.equal(h.cycle, KILN_BREATH, `${h.id}: breathes on the kiln breath clock`);
        assert.ok(h.baseline! * h.intensity < UNPROTECTED.heat, `${h.id}: warm between breaths`);
        assert.ok(c.cues.some(q => q.species === "kiln_crawler" && q.meaning === "heat_breath"), `${h.id}: no crawler cue for the breath`);
      }
    } else {
      assert.equal(h.kind, "brine");
      assert.equal(c.source.region, "brine_divide", `${h.id}: brine outside the Divide`);
    }
  }
  for (const c of DEEP_CAVES) {
    if (!c.hazards.length) continue;
    // Never heat- or brine-only: every exit is clear at the field's peak.
    for (const exit of Object.values(c.exits)) {
      const o = portal(c, exit)!;
      for (let t = 0; t < KILN_BREATH.period * 60; t += 60) {
        const s = sampleDeepHazards({ x: o.center.x, y: o.center.y - o.clear.height / 2 + 0.3, z: o.center.z }, t);
        assert.ok(s.heat <= UNPROTECTED.heat + 1e-9 && s.brine <= 1e-9, `${c.source.id}: exit ${exit} is hot or in brine at tick ${t}`);
      }
    }
    // Brine: every route pose after the first is clear of every pool, feet to head.
    for (const r of c.source.routes) for (const p of r.path.slice(1)) for (const dy of [0, 0.95])
      for (const h of c.hazards.filter(h => h.kind === "brine"))
        assert.ok(caveFieldLevel(h, { ...p, y: p.y + dy }, 0) <= 1e-9, `${r.id}: pose ${JSON.stringify(p)} touches ${h.id}`);
    // The Divide's own interface: no route pose dips under BRINE_Y inside the brine field.
    for (const r of c.source.routes) for (const p of r.path)
      if (p.z <= -1280) assert.ok(p.y >= BRINE_Y + 1, `${r.id}: pose ${JSON.stringify(p)} under the interface`);
  }
});

test("positive danger controls: every hazard field is dangerous inside itself at its peak, and every breath eases at slack", () => {
  const peak = (KILN_BREATH.start + KILN_BREATH.ramp + 2) * 60, slack = (KILN_BREATH.start + KILN_BREATH.duration + 2 * KILN_BREATH.ramp + 8) * 60;
  let warm = 0, pools = 0;
  for (const h of DEEP_CAVE_HAZARDS) {
    const o = sitePosition(h.shape.center), s = h.shape;
    const inside = s.kind === "box" ? { x: o.x + (s.min.x + s.max.x) / 2, y: o.y + (s.min.y + s.max.y) / 2, z: o.z + (s.min.z + s.max.z) / 2 }
      : s.kind === "cylinder" ? { x: o.x, y: o.y + (s.bottom + s.top) / 2, z: o.z }
      : { x: o.x + (s.min.x + s.max.x) / 2, y: o.y + s.y - 0.4, z: o.z + (s.min.z + s.max.z) / 2 };
    const at = (tick: number) => sampleDeepHazards(inside, tick);
    if (h.kind === "brine") { pools++; assert.ok(at(peak).brine > 0.5, `${h.id}: no dense water inside its own pool`); continue; }
    if (h.intensity <= UNPROTECTED.heat) { assert.ok(at(peak).heat > 0.15 && at(peak).heat <= UNPROTECTED.heat, `${h.id}: a warm floor must read warm and stay under tolerance`); continue; }
    warm++;
    assert.ok(at(peak).heat > UNPROTECTED.heat + 0.2, `${h.id}: ${at(peak).heat.toFixed(2)} heat at its own peak`);
    if (h.cycle) assert.ok(caveFieldLevel(h, inside, slack) <= UNPROTECTED.heat, `${h.id}: still hot at slack`);
    else assert.ok(caveFieldLevel(h, inside, slack) > UNPROTECTED.heat, `${h.id}: a constant vent must stay hot`);
  }
  assert.ok(warm >= 3 && pools >= 7, `${warm} warm fields, ${pools} pools`);
});
