import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { BLUEPRINTS, FUTURE_BLUEPRINTS, MATERIALS, PLACES, RECIPES, SOURCES, TECH_RECORDS } from "../src/content/registry.js";
import type { CostKind } from "../src/content/registry.js";
import { ACCESS_TIERS, CRAFT_PROFILES } from "../src/content/regions/passages.js";
import { CAVE_SOURCES } from "../src/content/regions/caves.js";
import { regionAtPoint } from "../src/content/regions/layout.js";
import { SITES } from "../src/content/regions/sites.js";
import { STRUCTURES } from "../src/content/regions/structures.js";
import { LEGACY_PRESERVE } from "../src/content/regions/terrain.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { STORY_SITES } from "../src/content/story/sites.js";
import { VISTA_SETS } from "../src/content/vistas.js";
import { AREAS, CAVE_BIOMES, DOCS, NEW_PLANS, PROPOSED_PLAN_IDS, RECIPE_SNAPSHOTS, REQUIRED_CLUES, REQUIRED_SOURCES, SEEDS, SOURCE_CHANGES, SPECIES,
  STORY_SITE_PLACEMENTS, TIER_STEPS, TRANSITIONS } from "../src/content/proposals/index.js";
import type { AreaId, Point, Ref } from "../src/content/proposals/index.js";
import type { Rect } from "../src/world/types.js";

// CB content-bible proposals: typed data checked against today's registry and
// world so they cannot drift silently. The game must not import them.

const landmarks = AREAS.flatMap(a => a.landmarks), caves = AREAS.flatMap(a => a.caves);
const resources = AREAS.flatMap(a => a.resources), rewards = AREAS.flatMap(a => a.sideRewards);
const lost = AREAS.flatMap(a => a.lostSites), decodes = lost.flatMap(l => l.decodes), cycles = AREAS.flatMap(a => a.cycles);
const reveals = decodes.flatMap(d => d.reveals);
const zones = CAVE_BIOMES.flatMap(b => b.zones), entrances = CAVE_BIOMES.flatMap(b => b.entrances);
const proposalIds = [
  ...landmarks, ...caves, ...resources, ...rewards, ...lost, ...decodes, ...reveals, ...cycles, ...CAVE_BIOMES, ...zones, ...entrances,
].map(x => x.id);
const proposalSet = new Set(proposalIds);
const caveIds = new Set([...caves.map(c => c.id), ...CAVE_BIOMES.map(b => b.id), ...CAVE_SOURCES.map(c => c.id)]);

/** World position of a reference, y included where it is known. Story sites go
 * through STORY_SITE_PLACEMENTS; unplaced ones (story structure) return null. */
const positionOf = (r: Ref): { x: number; y: number; z: number } | null => {
  switch (r.kind) {
    case "site": {
      const s = SITES.find(s => s.id === r.id);
      return s ? { x: s.at.x, y: typeof s.at.y === "number" ? s.at.y : worldFloor(s.at.x, s.at.z) + (s.lift ?? 0), z: s.at.z } : null;
    }
    case "source": { const s = (SOURCES as Record<string, { position: Point }>)[r.id]; return s ? s.position : null; }
    case "place": { const s = (PLACES as Record<string, { position: Point }>)[r.id]; return s ? s.position : null; }
    case "tech_record": { const s = (TECH_RECORDS as Record<string, { position: Point }>)[r.id]; return s ? s.position : null; }
    case "story_site": { const p = STORY_SITE_PLACEMENTS[r.id]; return p ? positionOf(p) : null; }
    case "proposal": { const x = [...resources, ...landmarks, ...lost, ...rewards].find(x => x.id === r.id); return x ? x.at : null; }
    default: return null;
  }
};
const resolves = (r: Ref): boolean => {
  switch (r.kind) {
    case "site": return SITES.some(s => s.id === r.id);
    case "source": return Object.hasOwn(SOURCES, r.id);
    case "place": return Object.hasOwn(PLACES, r.id);
    case "story_site": return Object.hasOwn(STORY_SITES, r.id);
    case "tech_record": return Object.hasOwn(TECH_RECORDS, r.id);
    case "vista": return VISTA_SETS.some(v => v.id === r.id);
    case "cave": return CAVE_SOURCES.some(c => c.id === r.id);
    case "proposal": return proposalSet.has(r.id);
  }
};
const inRect = (r: Rect, x: number, z: number, pad = 0) => x >= r.minX - pad && x <= r.maxX + pad && z >= r.minZ - pad && z <= r.maxZ + pad;
const overlaps = (a: Rect, b: Rect) => a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
const domainRect = (d: { min: Point; max: Point }): Rect => ({ minX: d.min.x, maxX: d.max.x, minZ: d.min.z, maxZ: d.max.z });
const regionOk = (area: AreaId, x: number, z: number) => area === "hub_spur" || regionAtPoint(x, z) === area;

test("proposal IDs are unique and never reuse an existing site, source or cave ID", () => {
  const seen = new Set<string>();
  for (const id of proposalIds) { assert.ok(!seen.has(id), `duplicate proposal ID ${id}`); seen.add(id); }
  for (const id of proposalIds) {
    assert.ok(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/.test(id), `${id}: IDs are lower snake_case, dot-separated`);
    // C4 lifted CB's frontier deposits into the registry under their proposal IDs, at
    // the same datum or within a few metres (the rim frames sit where the bed lies 0.8 m below).
    if (LIFTED.has(id)) {
      const src = SOURCES[id as keyof typeof SOURCES], prop = resources.find(r => r.id === id)!;
      assert.ok(src && Math.hypot(src.position.x - prop.at.x, src.position.z - prop.at.z) <= 5, `${id}: lifted source moved`);
      continue;
    }
    assert.ok(!collides(id), `${id} collides with existing content`);
  }
});
/** An existing ID equal to a proposal's is that proposal built (W2's hub),
 * allowed only where it stands near where the proposal put it: a site within
 * 25 m, a cave whose footprint lies within 80 m of the proposed mouth. */
function collides(id: string): boolean {
  if (Object.hasOwn(SOURCES, id)) return true;
  const site = SITES.find(s => s.id === id), cave = CAVE_SOURCES.find(c => c.id === id);
  if (!site && !cave) return false;
  const proposal = [...landmarks, ...lost].find(l => l.id === id), planned = caves.find(c => c.id === id);
  if (site) return !proposal || Math.hypot(site.at.x - proposal.at.x, site.at.z - proposal.at.z) > 25;
  const f = cave!.footprint;
  return !planned || Math.hypot(Math.max(f.minX - planned.mouth.x, 0, planned.mouth.x - f.maxX), Math.max(f.minZ - planned.mouth.z, 0, planned.mouth.z - f.maxZ)) > 80;
}

test("every reference resolves against the registry, world sites, story sites, vistas, caves or proposals", () => {
  const refs: [string, Ref][] = [
    ...landmarks.flatMap(l => l.near.map(r => [l.id, r] as [string, Ref])),
    ...caves.flatMap(c => [...c.near, ...c.links].map(r => [c.id, r] as [string, Ref])),
    ...resources.flatMap(r => r.near.map(n => [r.id, n] as [string, Ref])),
    ...rewards.flatMap(r => r.near.map(n => [r.id, n] as [string, Ref])),
    ...lost.flatMap(l => l.near.map(n => [l.id, n] as [string, Ref])),
    ...reveals.map(r => [r.id, r.target] as [string, Ref]),
    ...CAVE_BIOMES.flatMap(b => b.near.map(n => [b.id, n] as [string, Ref])),
    ...AREAS.flatMap(a => a.pacing.flatMap(b => b.ref ? [[`${a.area} pacing`, b.ref] as [string, Ref]] : [])),
    ...REQUIRED_SOURCES.flatMap(s => s.exterior.map(r => [s.item, r] as [string, Ref])),
    ...REQUIRED_CLUES.map(c => [c.id, c.site] as [string, Ref]),
  ];
  for (const [owner, r] of refs) assert.ok(resolves(r), `${owner}: ${r.kind} ${r.id} does not exist`);
  for (const r of [...resources, ...lost]) if (r.inCave) assert.ok(caveIds.has(r.inCave), `${r.id}: unknown cave ${r.inCave}`);
  for (const c of caves) if (c.backEntranceTo) assert.ok(CAVE_BIOMES.some(b => b.id === c.backEntranceTo), `${c.id}: unknown biome`);
});

test("items, seeds, species and plans are known; new plans do not collide with the registry", () => {
  const seedIds = new Set(SEEDS.map(s => s.id));
  for (const r of resources)
    assert.ok(Object.hasOwn(MATERIALS, r.item) || seedIds.has(r.item as never) || r.item === "meal" || r.item === "tagged_frame", `${r.id}: unknown item ${r.item}`);
  const species = new Map(SPECIES.map(s => [s.id, s]));
  assert.equal(species.size, SPECIES.length, "duplicate species");
  for (const a of AREAS) {
    for (const c of a.creatures) {
      const s = species.get(c.species);
      assert.ok(s, `${a.area}: unknown species ${c.species}`);
      assert.ok(s!.areas.includes(a.area), `${c.species} does not list ${a.area}`);
    }
    for (const c of a.caves) if (c.resident) assert.ok(a.creatures.some(k => k.species === c.resident), `${c.id}: resident not in the area roster`);
  }
  const registry = new Set<string>([...BLUEPRINTS, ...Object.keys(FUTURE_BLUEPRINTS)]);
  for (const plan of NEW_PLANS) assert.ok(!registry.has(plan.id), `${plan.id} already exists in the registry`);
  for (const d of decodes) for (const bp of d.blueprints)
    assert.ok(registry.has(bp) || PROPOSED_PLAN_IDS.includes(bp), `${d.id}: unknown plan ${bp}`);
  for (const step of TIER_STEPS) {
    for (const bp of step.outposts) assert.ok(registry.has(bp) || PROPOSED_PLAN_IDS.includes(bp), `${step.id}: unknown plan ${bp}`);
    for (const d of step.decodes) assert.ok(decodes.some(x => x.id === d), `${step.id}: unknown decode ${d}`);
  }
  for (const d of decodes) assert.equal(d.story, false, `${d.id}: lost-site decodes never gate the story`);
});

test("placements sit on today's floor, in the right region", () => {
  const placed: { id: string; area: AreaId; at: Point; anchor: string }[] = [
    ...landmarks, ...rewards, ...lost, ...resources,
    ...caves.map(c => ({ id: c.id, area: c.area, at: c.mouth, anchor: c.anchor })),
    ...CAVE_BIOMES.flatMap(b => b.entrances.map(e => ({ id: e.id, area: e.region ?? b.area, at: e.at, anchor: e.anchor }))),
  ];
  for (const { id, area, at, anchor } of placed) {
    const floor = worldFloor(at.x, at.z);
    if (anchor === "floor") assert.ok(Math.abs(at.y - floor) <= 4, `${id}: y ${at.y} vs floor ${floor.toFixed(1)}`);
    if (anchor === "land") assert.ok(floor > 0 && Math.abs(at.y - floor) <= 4, `${id}: land at ${at.y}, floor ${floor.toFixed(1)}`);
    if (anchor === "water") assert.ok(at.y >= floor - 0.5 && at.y <= 0.5, `${id}: water at ${at.y}, floor ${floor.toFixed(1)}`);
    if (anchor !== "reshape" || area !== "hub_spur") assert.ok(regionOk(area, at.x, at.z), `${id}: ${regionAtPoint(at.x, at.z)} is not ${area}`);
  }
});

test("caves: size classes, footprints disjoint, outside the opening's preserve, clear of existing datums", () => {
  const P = LEGACY_PRESERVE;
  // A proposal built as a real cave (W2's hub caves) is checked by its own
  // cave tests; the proposal stands in for nothing once the source exists.
  const built = new Set(CAVE_SOURCES.map(c => c.id)), planned = caves.filter(c => !built.has(c.id));
  const rects = [...planned.map(c => ({ id: c.id, r: c.footprint })), ...CAVE_SOURCES.map(c => ({ id: c.id, r: c.footprint }))];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++)
    assert.ok(!overlaps(rects[i]!.r, rects[j]!.r), `${rects[i]!.id} overlaps ${rects[j]!.id}`);
  const datums = [...SITES.map(s => ({ id: s.id, ...s.at })), ...Object.entries(SOURCES).map(([id, s]) => ({ id, ...s.position })),
    ...Object.entries(PLACES).map(([id, s]) => ({ id, ...s.position })), ...VISTA_SETS.map(v => ({ id: v.id, ...v.anchor })),
    ...STRUCTURES.map(s => ({ id: s.id, x: s.x, z: s.z }))];
  for (const c of planned) {
    const f = c.footprint, w = f.maxX - f.minX, d = f.maxZ - f.minZ, long = Math.max(w, d);
    if (c.size === "small") { assert.ok(long >= 10 && long <= 40, `${c.id}: small footprint ${w}×${d}`); assert.equal(c.admits, "diver", `${c.id}: small caves are diver-only`); }
    else { assert.ok(long >= 40 && long <= 100, `${c.id}: medium footprint ${w}×${d}`); assert.notEqual(c.admits, "diver", `${c.id}: a medium hall takes small craft`); }
    assert.ok(c.depth[0] < c.depth[1], `${c.id}: depth range`);
    assert.ok(inRect(f, c.mouth.x, c.mouth.z, 2), `${c.id}: mouth outside its footprint`);
    const mouthDepth = -c.mouth.y;
    assert.ok(mouthDepth >= c.depth[0] - 6 && mouthDepth <= c.depth[1] + 6, `${c.id}: mouth at ${mouthDepth} m outside ${c.depth}`);
    assert.ok(!overlaps(f, { minX: P.minX, maxX: P.maxX, minZ: P.minZ, maxZ: P.maxZ }), `${c.id}: inside the legacy preserve`);
    for (const [x, z] of [[f.minX, f.minZ], [f.maxX, f.minZ], [f.minX, f.maxZ], [f.maxX, f.maxZ]] as const)
      assert.ok(regionOk(c.area, x, z), `${c.id}: corner ${x},${z} is ${regionAtPoint(x, z)}`);
    for (const dt of datums) assert.ok(!inRect(f, dt.x, dt.z), `${c.id}: footprint contains existing ${dt.id}`);
  }
});

test("cave biomes: 150–300 m, 3–5 zones, front and back entrances, buried zones, path per GAME-DIRECTION", () => {
  const path: Record<string, "main" | "optional"> = { isles_undercroft: "main", canopy_rootways: "optional", basin_ridge_vaults: "main", rift_divide_seam: "main" };
  assert.deepEqual(CAVE_BIOMES.map(b => b.id).sort(), Object.keys(path).sort());
  for (const b of CAVE_BIOMES) {
    assert.equal(b.path, path[b.id], `${b.id}: path`);
    const long = Math.max(b.domain.max.x - b.domain.min.x, b.domain.max.z - b.domain.min.z);
    assert.ok(long >= 150 && long <= 300, `${b.id}: longest side ${long} m`);
    assert.ok(b.zones.length >= 3 && b.zones.length <= 5, `${b.id}: ${b.zones.length} zones`);
    assert.ok(b.entrances.some(e => e.role === "front") && b.entrances.some(e => e.role === "back"), `${b.id}: needs front and back entrances`);
    const D = domainRect(b.domain);
    for (const z of b.zones) {
      assert.ok(inRect(D, z.centre.x, z.centre.z) && z.centre.y >= b.domain.min.y && z.centre.y <= b.domain.max.y, `${z.id}: centre outside domain`);
      assert.ok(z.depth[0] < z.depth[1] && -z.centre.y >= z.depth[0] - 1 && -z.centre.y <= z.depth[1] + 1, `${z.id}: centre depth`);
    }
    const buried = b.zones.filter(z => z.depth[0] >= -worldFloor(z.centre.x, z.centre.z) + 6);
    assert.ok(buried.length >= 2, `${b.id}: at least two zones lie under 6 m of rock`);
    for (const e of b.entrances) {
      // The admitted craft's whole envelope at the entrance datum lies inside the carve domain.
      const prof = CRAFT_PROFILES[e.admits];
      assert.ok(inRect(D, e.at.x, e.at.z, -prof.radius), `${e.id}: a ${e.admits} at the entrance leaves the domain horizontally`);
      assert.ok(e.at.y + prof.bottom >= b.domain.min.y && e.at.y + prof.height <= b.domain.max.y,
        `${e.id}: a ${e.admits} at y ${e.at.y} (height ${prof.height}) is outside the domain's y ${b.domain.min.y}..${b.domain.max.y}`);
    }
    assert.ok(caves.some(c => c.backEntranceTo === b.id), `${b.id}: no small cave links to its back entrance`);
  }
});

test("each area meets the bible's density targets", () => {
  for (const a of AREAS) {
    const hub = a.area === "hub_spur";
    const anchors = a.landmarks.filter(l => l.role === "anchor").length, all = a.landmarks.length;
    // Built caves the bible already lists (W2's hub caves) count once, as proposals.
    const existingSmall = a.area === "hub_spur" ? 0 : CAVE_SOURCES.filter(c => c.region === a.area && !caves.some(p => p.id === c.id)).length;
    const small = a.caves.filter(c => c.size === "small").length + existingSmall, medium = a.caves.filter(c => c.size === "medium").length;
    const roles = a.creatures.map(c => SPECIES.find(s => s.id === c.species)!.role);
    assert.ok(hub ? anchors >= 1 : anchors >= 2 && anchors <= 3, `${a.area}: ${anchors} anchors`);
    assert.ok(hub ? all >= 4 : all >= 8 && all <= 12, `${a.area}: ${all} discovery clusters`);
    assert.ok(hub ? small >= 2 : small >= 4 && small <= 8, `${a.area}: ${small} small caves`);
    assert.ok(hub ? medium >= 1 : medium >= 2 && medium <= 4, `${a.area}: ${medium} medium caves`);
    assert.ok(a.creatures.length >= 3 && a.creatures.length <= 6, `${a.area}: ${a.creatures.length} creature types`);
    assert.ok(roles.filter(r => r === "threat").length <= 1, `${a.area}: more than one threat`);
    assert.ok(roles.filter(r => r === "cue" || r === "benign" || r === "food").length >= 2, `${a.area}: needs two benign or cue animals`);
    assert.ok(SPECIES.find(s => s.id === a.caveResident)?.caveDweller, `${a.area}: cave resident must be a cave-dweller`);
    assert.ok(a.creatures.some(c => c.species === a.caveResident), `${a.area}: cave resident not in roster`);
    assert.ok(a.sideRewards.length >= 2, `${a.area}: side rewards`);
    assert.ok(a.lostSites.length >= 1, `${a.area}: lost site`);
    assert.ok(a.minutes.mainPath > 0 && a.minutes.full >= a.minutes.mainPath, `${a.area}: minutes`);
    const beats = a.pacing.map(b => b.at);
    assert.deepEqual(beats, [...beats].sort((x, y) => x - y), `${a.area}: pacing beats out of order`);
    for (let i = 1; i < beats.length; i++) assert.ok(beats[i]! - beats[i - 1]! <= 20, `${a.area}: ${beats[i]! - beats[i - 1]!} min without something new`);
    assert.ok(a.minutes.full - beats[beats.length - 1]! <= 20, `${a.area}: last beat leaves a long tail`);
  }
  const total = AREAS.reduce((n, a) => n + a.minutes.full, 0), main = AREAS.reduce((n, a) => n + a.minutes.mainPath, 0);
  // A blind first-timer cannot tell optional from required: expect the main path plus about half the rest.
  assert.ok((main + total) / 2 >= 600, `expected first playthrough ${(main + total) / 2} min is under the 10 h floor`);
  assert.ok(total >= main, `full ${total}`);
});

test("adverse case: every required material and clue has an exterior or main-path home outside optional caves", () => {
  // Small/medium caves own whole columns; cave biomes are buried, so a point is inside one only below its roof.
  type Volume = { r: Rect; y?: readonly [number, number] };
  const columns: Volume[] = [...caves.map(c => ({ r: c.footprint })), ...CAVE_SOURCES.map(c => ({ r: c.footprint }))];
  const buried = (path?: "main" | "optional"): Volume[] => CAVE_BIOMES.filter(b => !path || b.path === path)
    .map(b => ({ r: domainRect(b.domain), y: [b.domain.min.y, b.domain.max.y] as const }));
  const inside = (v: Volume, at: { x: number; y?: number | undefined; z: number }) =>
    inRect(v.r, at.x, at.z) && (!v.y || at.y === undefined || (at.y >= v.y[0] && at.y <= v.y[1]));
  const yOf = (r: Ref): number | undefined => {
    if (r.kind === "site") { const s = SITES.find(s => s.id === r.id)!; return typeof s.at.y === "number" ? s.at.y : worldFloor(s.at.x, s.at.z); }
    const at = positionOf(r) as { y?: number } | null; return at?.y;
  };
  for (const req of REQUIRED_SOURCES) {
    assert.ok(req.exterior.length >= 2, `${req.item}: needs two exterior patches`);
    for (const r of req.exterior) {
      const at = positionOf(r);
      assert.ok(at, `${req.item}: ${r.id} has no position`);
      const pt = { x: at!.x, y: yOf(r), z: at!.z };
      for (const v of [...columns, ...buried()]) assert.ok(!inside(v, pt), `${req.item}: ${r.id} lies inside a cave`);
      const item = r.kind === "source" ? (SOURCES as Record<string, { item: string }>)[r.id]!.item
        : r.kind === "proposal" ? resources.find(x => x.id === r.id)!.item : SITES.find(s => s.id === r.id)!.material;
      assert.ok(!SOURCE_CHANGES.some(ch => ch.ref.id === r.id), `${req.item}: ${r.id} is reduced to a taste or scan-only`);
      assert.equal(item, req.item, `${r.id} does not supply ${req.item}`);
    }
  }
  for (const m of Object.keys(MATERIALS)) assert.ok(REQUIRED_SOURCES.some(r => r.item === m), `${m} missing from the ledger`);
  assert.deepEqual(REQUIRED_CLUES.map(c => c.id), Array.from({ length: 15 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`));
  for (const c of REQUIRED_CLUES) if (c.site.kind === "story_site")
    assert.ok(Object.hasOwn(STORY_SITE_PLACEMENTS, c.site.id), `${c.id}: ${c.site.id} needs a placement or an explicit null`);
  for (const id of Object.keys(STORY_SITES)) assert.ok(Object.hasOwn(STORY_SITE_PLACEMENTS, id), `story site ${id} missing from STORY_SITE_PLACEMENTS`);
  for (const c of REQUIRED_CLUES) {
    const at = positionOf(c.site);
    if (at) for (const v of [...columns, ...buried("optional")]) assert.ok(!inside(v, { x: at.x, y: yOf(c.site), z: at.z }), `${c.id} lies inside an optional cave`);
    if (c.site.kind === "story_site") assert.ok(!caves.some(k => k.near.some(n => n.id === c.site.id)), `${c.id}'s site is attached to an optional cave`);
  }
  for (const r of resources) if (r.kind === "cave_favoured" || r.kind === "frontier_sample")
    assert.ok(!REQUIRED_SOURCES.some(q => q.exterior.some(e => e.id === r.id)), `${r.id} is a cave source in the required ledger`);
});

test("cave-interior resources and lost sites lie inside their cave", () => {
  for (const r of [...resources, ...lost]) {
    if (!r.inCave) continue;
    const c = caves.find(c => c.id === r.inCave), b = CAVE_BIOMES.find(b => b.id === r.inCave), s = CAVE_SOURCES.find(s => s.id === r.inCave);
    const f = c?.footprint ?? (b ? domainRect(b.domain) : s!.footprint);
    assert.ok(inRect(f, r.at.x, r.at.z, 1), `${r.id}: outside ${r.inCave}`);
    assert.equal(r.anchor, "reshape", `${r.id}: an underground point is not on today's floor`);
  }
});

test("caves: water extent and topology fit the size classes (GAME-DIRECTION caves)", () => {
  for (const c of caves) {
    const { length, width, height } = c.water, span = c.depth[1] - c.depth[0];
    const f = c.footprint, fw = f.maxX - f.minX, fd = f.maxZ - f.minZ;
    assert.equal(height, span, `${c.id}: water height ${height} is not its depth span ${span}`);
    assert.ok(length >= width && length <= Math.max(fw, fd) && width <= Math.min(fw, fd), `${c.id}: water ${length}×${width} does not fit its ${fw}×${fd} footprint`);
    const longest = Math.max(length, width, height);
    if (c.size === "small") {
      assert.ok(longest >= 10 && longest <= 25, `${c.id}: small cave's longest water extent ${longest} m`);
      assert.ok(c.exits.length >= 1 && new Set(c.exits).size === c.exits.length && !c.chambers && !c.passages, `${c.id}: a small cave has distinct exits and no chamber plan`);
    } else {
      assert.ok(longest >= 30 && longest <= 80, `${c.id}: medium cave's longest water extent ${longest} m`);
      assert.deepEqual(caveGraphProblems(c.chambers ?? [], c.exits, c.passages ?? []), [], `${c.id}: chamber graph`);
      // The declared closing passage is what makes it a loop: without it, the chambers only chain.
      assert.ok(c.loopCloser && (c.passages ?? []).some(p => p.id === c.loopCloser), `${c.id}: names no closing passage`);
      const opened = (c.passages ?? []).filter(p => p.id !== c.loopCloser);
      assert.ok(caveGraphProblems(c.chambers ?? [], c.exits, opened).some(p => p.startsWith("no loop")), `${c.id}: still loops without ${c.loopCloser}`);
    }
  }
});

/** Problems with a medium cave's chamber graph: distinct named chambers (2–5) and
 * exits (2+), passages joining known nodes (never exit to exit), every exit attached,
 * everything connected, and a cycle among the chambers alone. Parallel passages
 * between the same two chambers do not count as a loop. */
function caveGraphProblems(chambers: readonly string[], exits: readonly string[], passages: readonly { id: string; from: string; to: string }[]): string[] {
  const out: string[] = [];
  const ch = new Set(chambers), ex = new Set(exits);
  if (ch.size !== chambers.length) out.push("repeated chamber names");
  if (ex.size !== exits.length) out.push("repeated exit names");
  if (chambers.some(c => ex.has(c))) out.push("a chamber shares an exit's name");
  if (ch.size < 2 || ch.size > 5) out.push(`${ch.size} distinct chambers`);
  if (ex.size < 2) out.push(`${ex.size} distinct exits`);
  if (new Set(passages.map(p => p.id)).size !== passages.length) out.push("repeated passage ids");
  for (const p of passages) {
    if (![p.from, p.to].every(n => ch.has(n) || ex.has(n))) out.push(`${p.id} joins an unknown node`);
    if (ex.has(p.from) && ex.has(p.to)) out.push(`${p.id} joins two exits`);
    if (p.from === p.to) out.push(`${p.id} joins a node to itself`);
  }
  for (const e of ex) if (!passages.some(p => (p.from === e && ch.has(p.to)) || (p.to === e && ch.has(p.from)))) out.push(`exit ${e} is not attached`);
  // Connectivity over all nodes.
  const nodes = [...ch, ...ex], adj = new Map(nodes.map(n => [n, new Set<string>()]));
  for (const p of passages) if (adj.has(p.from) && adj.has(p.to)) { adj.get(p.from)!.add(p.to); adj.get(p.to)!.add(p.from); }
  const seen = new Set<string>(), stack = nodes.slice(0, 1);
  while (stack.length) { const n = stack.pop()!; if (seen.has(n)) continue; seen.add(n); stack.push(...adj.get(n)!); }
  if (nodes.length && seen.size !== nodes.length) out.push("not every chamber and exit is connected");
  // Cycle among chambers in the simple graph: edges > nodes - components.
  const pairs = new Set(passages.filter(p => ch.has(p.from) && ch.has(p.to) && p.from !== p.to).map(p => [p.from, p.to].sort().join("|")));
  const parent = new Map([...ch].map(n => [n, n])), find = (n: string): string => parent.get(n) === n ? n : find(parent.get(n)!);
  let components = ch.size;
  for (const pr of pairs) { const [x, y] = pr.split("|") as [string, string]; const a = find(x), b = find(y); if (a !== b) { parent.set(a, b); components--; } }
  if (pairs.size <= ch.size - components) out.push("no loop among the chambers: they only chain");
  return out;
}

test("the cave-graph check itself rejects chains, repeated rooms and exit-to-exit links", () => {
  const exits = ["a mouth", "b mouth"];
  const ring = [{ id: "ma", from: "a mouth", to: "one" }, { id: "mb", from: "b mouth", to: "two" },
    { id: "p1", from: "one", to: "two" }, { id: "p2", from: "two", to: "three" }, { id: "p3", from: "three", to: "one" }];
  assert.deepEqual(caveGraphProblems(["one", "two", "three"], exits, ring), []);
  assert.ok(caveGraphProblems(["one", "two", "three"], exits, ring.filter(p => p.id !== "p3")).some(p => p.startsWith("no loop")), "a chain is not a loop");
  assert.ok(caveGraphProblems(["only room", "only room"], exits, [{ id: "ma", from: "a mouth", to: "only room" }, { id: "mb", from: "b mouth", to: "only room" }])
    .includes("repeated chamber names"), "one repeated room is caught");
  assert.ok(caveGraphProblems(["one", "two"], exits, [...ring.slice(0, 3), { id: "p4", from: "one", to: "two" }]).some(p => p.startsWith("no loop")),
    "two parallel passages between the same pair do not make a loop");
  assert.ok(caveGraphProblems(["one", "two", "three"], exits, [...ring, { id: "x", from: "a mouth", to: "b mouth" }]).includes("x joins two exits"));
});

// Tier rule (CB-01). Costs: registry RECIPES live, S9/SYS-1 from the checked snapshot.
type Cost = Partial<Record<CostKind, number>>;
const rawCost = (id: string): Cost => (Object.hasOwn(RECIPES, id) ? (RECIPES as Record<string, { cost: Cost }>)[id]!.cost : RECIPE_SNAPSHOTS.costs[id])!;
/** CB's frontier deposits, lifted into the registry by C4. */
const LIFTED = new Set(["canopy_rim_frames", "rift_core_lower_north", "rift_core_lower_west", "divide_lattice_flank_north", "divide_lattice_flank_south"]);
/** Registry costs before C4 applied CB's deltas (S9 and SYS-1 ones are RECIPE_SNAPSHOTS). */
const PRE_C4: Record<string, Cost> = {
  creel_base: { structural_alloy: 10, silica_glass: 4, flex_membrane: 4, conductive_crust: 4, buoyant_resin: 2 },
  suit_350: { structural_alloy: 2, flex_membrane: 2, conductive_crust: 4, buoyant_resin: 4 },
};
const baseCost = (id: string): Cost => PRE_C4[id] ?? RECIPE_SNAPSHOTS.costs[id] ?? rawCost(id);
/** Which recipe carries a transition's delta once composed (the Hearthline's on its keel). */
const deltaRecipe = (tr: { recipes: readonly string[] }): string => tr.recipes.includes("hearthline_keel") ? "hearthline_keel" : tr.recipes[0]!;
const COST_KINDS = new Set<string>([...Object.keys(MATERIALS), "tagged_frame"]);
interface WorldSource { id: string; item: string; depth: number; units: number; cave: boolean; sample: boolean; exterior: boolean }
function worldSources(): WorldSource[] {
  const changes = new Map(SOURCE_CHANGES.map(c => [c.ref.id, c]));
  const inAnyCave = (x: number, y: number, z: number) => caves.some(c => inRect(c.footprint, x, z)) || CAVE_SOURCES.some(c => inRect(c.footprint, x, z))
    || CAVE_BIOMES.some(b => inRect(domainRect(b.domain), x, z) && y >= b.domain.min.y && y <= b.domain.max.y);
  const out: WorldSource[] = [];
  const add = (id: string, item: string, at: { x: number; y: number; z: number }, units: number, cave?: boolean) => {
    if (!COST_KINDS.has(item) || out.some(s => s.id === id)) return;
    const ch = changes.get(id), u = ch ? ch.stock : units;
    if (u <= 0) return;
    const inCave = cave ?? inAnyCave(at.x, at.y, at.z);
    out.push({ id, item, depth: -at.y, units: u, cave: inCave, sample: ch?.role === "sample", exterior: !inCave });
  };
  for (const [id, s] of Object.entries(SOURCES)) add(id, s.item, s.position, s.stock + s.reserve);
  for (const s of SITES) if (s.role === "source" && s.material && s.stock) add(s.id, s.material, positionOf({ kind: "site", id: s.id })!, s.stock[0] + s.stock[2]);
  for (const r of resources) {
    if (r.kind === "seed") continue;
    const sample = r.kind === "frontier_sample";
    if (!COST_KINDS.has(r.item)) continue;
    out.push({ id: r.id, item: r.item, depth: -r.at.y, units: r.stock[0] + r.stock[2], cave: !!r.inCave, sample, exterior: !r.inCave });
  }
  for (const w of rewards) for (const [item, n] of Object.entries(w.contents ?? {}))
    if (COST_KINDS.has(item) && n) out.push({ id: `${w.id}:${item}`, item, depth: -w.at.y, units: n, cave: false, sample: true, exterior: true });
  return out;
}

test("tier rule: every craft and suit transition needs a frontier material at or beyond the previous tier's limit, with no tolerance", t => {
  const world = worldSources();
  const sampleUnits = (item: string) => world.filter(s => s.sample && s.item === item).reduce((n, s) => n + s.units, 0);
  const common = new Set([...COST_KINDS].filter(k => world.some(s => s.item === k && !s.sample && s.exterior && s.depth <= ACCESS_TIERS.early.depth)));
  const ladder = Object.keys(ACCESS_TIERS);
  for (const tr of TRANSITIONS) {
    const cost: Cost = {}, live: Cost = {};
    for (const r of tr.recipes) {
      const c = baseCost(r), l = rawCost(r);
      assert.ok(c && l, `${tr.id}: no cost known for ${r}`);
      for (const [k, v] of Object.entries(c)) cost[k as CostKind] = (cost[k as CostKind] ?? 0) + v!;
      for (const [k, v] of Object.entries(l)) live[k as CostKind] = (live[k as CostKind] ?? 0) + v!;
    }
    for (const [k, v] of Object.entries(tr.delta)) cost[k as CostKind] = (cost[k as CostKind] ?? 0) + v!;
    for (const [k, v] of Object.entries(cost)) assert.ok(v! >= 0, `${tr.id}: delta leaves ${k} at ${v}`);
    // C4 composed every delta: the live recipes now cost exactly the proposal.
    for (const k of new Set([...Object.keys(cost), ...Object.keys(live)]) as Set<CostKind>)
      assert.equal(live[k] ?? 0, cost[k] ?? 0, `${tr.id}: composed ${k} differs from the proposed delta`);
    assert.ok(ladder.includes(tr.previous) && ladder.includes(tr.reach), `${tr.id}: unknown access tier`);
    const limit = ACCESS_TIERS[tr.previous].depth, reach = ACCESS_TIERS[tr.reach].depth;
    assert.ok(reach >= limit, `${tr.id}: reach ${reach} is shallower than the limit ${limit}`);
    // Samples never pay a transition's rare cost, in any rare material.
    for (const [k, v] of Object.entries(cost)) if (!common.has(k) && v)
      assert.ok(sampleUnits(k) < v, `${tr.id}: ${sampleUnits(k)} sampled ${k} across the world would pay its ${v}`);
    if (tr.baseline) { t.diagnostic(`${tr.id}: baseline exception (${tr.baseline.decision})`); continue; }
    const m = tr.frontier;
    assert.ok(m && (cost[m] ?? 0) >= 1, `${tr.id}: its cost carries no frontier material`);
    const regular = world.filter(s => s.item === m && !s.sample);
    const shallowest = Math.min(...regular.map(s => s.depth));
    assert.ok(shallowest >= limit, `${tr.id}: ${m} is found at ${shallowest} m (${regular.find(s => s.depth === shallowest)?.id}), shallower than the ${tr.previous} limit ${limit} m`);
    const reachable = regular.filter(s => s.exterior && s.depth <= reach);
    assert.ok(reachable.length >= 1, `${tr.id}: no exterior ${m} at ${limit}–${reach} m`);
    assert.ok(reachable.some(s => s.units >= cost[m]!), `${tr.id}: no single reachable ${m} patch holds ${cost[m]}`);
  }
  assert.deepEqual(TRANSITIONS.filter(x => x.baseline).map(x => x.id).sort(), ["dart_base", "suit_150"], "only the agreed baseline is exempt");
});

test("recipe snapshots match the composed S9 and SYS-1 files when present", async t => {
  const tryLoad = async (rel: string) => existsSync(new URL(rel, import.meta.url)) ? await import(new URL(rel, import.meta.url).href) : null;
  const s9 = await tryLoad("../src/content/campaign/recipes.js") as { CAMPAIGN_RECIPES: Record<string, { cost: Cost }> } | null;
  const sys1 = await tryLoad("../src/content/upgrades/catalogue.js") as { UPGRADES: Record<string, { cost: Cost }> } | null;
  if (!s9 && !sys1) t.diagnostic("S9 and SYS-1 are not composed on this branch yet; snapshot comparison deferred");
  // C4 applied CB's deltas: the composed cost is the snapshot plus its transition's delta.
  const deltas = new Map<string, Cost>();
  for (const tr of TRANSITIONS) if (Object.keys(tr.delta).length) deltas.set(deltaRecipe(tr), tr.delta);
  for (const [id, snapshot] of Object.entries(RECIPE_SNAPSHOTS.costs)) {
    const live = s9?.CAMPAIGN_RECIPES[id]?.cost ?? sys1?.UPGRADES[id]?.cost;
    const cost: Cost = { ...snapshot };
    for (const [k, v] of Object.entries(deltas.get(id) ?? {})) { cost[k as CostKind] = (cost[k as CostKind] ?? 0) + v!; if (!cost[k as CostKind]) delete cost[k as CostKind]; }
    if (live) assert.deepEqual(Object.fromEntries(Object.entries(live).sort()), Object.fromEntries(Object.entries(cost).sort()), `${id}: composed recipe differs from snapshot + CB delta`);
  }
});

test("pads and caches: cut ledges are cuttable, caches declare their contents", () => {
  for (const r of resources) if (r.pad) {
    let lo = Infinity, hi = -Infinity;
    for (let a = 0; a < 16; a++) for (const k of [0.5, 1]) {
      const f = worldFloor(r.at.x + Math.cos(a * Math.PI / 8) * r.pad.radius * k, r.at.z + Math.sin(a * Math.PI / 8) * r.pad.radius * k);
      lo = Math.min(lo, f); hi = Math.max(hi, f);
    }
    assert.ok(lo <= r.at.y && r.at.y <= hi, `${r.id}: floor ${lo.toFixed(1)}..${hi.toFixed(1)} within its pad does not span ${r.at.y}`);
  }
  for (const w of rewards) if (w.kind === "cache") assert.ok(w.contents, `${w.id}: a cache must declare its contents`);
});

// Spoiler guard for owner-facing text: data and docs/content stay twist-free.
const SPOILER = /suspension|surviv|sleeper|revival|reviv|awaken|stasis|cryo|\b19[128]\s+(people|beds|names|residents|lives|bodies)|six (workers|volunteers|names)|close the return|ordered the|refuge below/i;
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
}

test("no spoilers in proposal data or owner-facing content docs", () => {
  for (const file of [...walk("src/content/proposals"), ...walk("docs/content")]) {
    const text = readFileSync(file, "utf8");
    const hit = text.match(SPOILER);
    assert.equal(hit, null, `${file}: spoiler-shaped text "${hit?.[0]}"`);
  }
});

test("every proposal ID and species appears in its document", () => {
  const bible = readFileSync("docs/content/BIBLE.md", "utf8");
  for (const s of SPECIES) assert.ok(bible.includes(s.id), `BIBLE.md does not mention species ${s.id}`);
  for (const a of AREAS) {
    const doc = readFileSync(DOCS.areas[a.area], "utf8");
    const ids = [...a.landmarks, ...a.caves, ...a.resources, ...a.sideRewards, ...a.lostSites, ...a.lostSites.flatMap(l => l.decodes), ...a.cycles].map(x => x.id);
    for (const id of ids) assert.ok(doc.includes(id), `${DOCS.areas[a.area]} does not mention ${id}`);
  }
  for (const b of CAVE_BIOMES) {
    const doc = readFileSync(DOCS.biomes[b.id], "utf8");
    for (const id of [b.id, ...b.zones.map(z => z.id), ...b.entrances.map(e => e.id)]) assert.ok(doc.includes(id), `${DOCS.biomes[b.id]} does not mention ${id}`);
  }
});

test("the game never imports the proposals", () => {
  for (const file of walk("src").filter(f => f.endsWith(".ts") && !f.includes(join("content", "proposals"))))
    assert.ok(!/from\s+["'][^"']*proposals\//.test(readFileSync(file, "utf8")), `${file} imports content proposals`);
});

test("existing species IDs match the composed ecology once it lands", async t => {
  const path = new URL("../src/content/ecology/species.js", import.meta.url);
  if (!existsSync(path)) { t.diagnostic("src/content/ecology not on this branch yet (C3); check deferred"); return; }
  const eco = await import(path.href) as { THREATS: object; CUE_SPECIES: object };
  const known = new Set([...Object.keys(eco.THREATS), ...Object.keys(eco.CUE_SPECIES)]);
  for (const s of SPECIES) if (s.status === "existing" && s.source?.startsWith("S4")) assert.ok(known.has(s.id), `${s.id} is not in the composed ecology`);
});
