import test from "node:test";
import assert from "node:assert/strict";
import { AUTHORED_CAVE_SOURCES, CAVE_SOURCES, type CaveSource } from "../src/content/regions/caves.js";
import { assertGroupsDisjoint, caveFloor, EDGE_SHELF, openProfile, BASIN_CAVES, CANOPY_CAVES, CANOPY_BASIN_GROUPS,
  type CaveGroup } from "../src/content/regions/caves/index.js";
import { layWake, oldestVisible, swimWake, wakeGlow, wakeTrail, WAKE_FADE_SECONDS } from "../src/content/regions/caves/wakeglow.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { LEGACY_PRESERVE } from "../src/content/regions/terrain.js";
import { regionAtPoint } from "../src/content/regions/layout.js";
import { SITES } from "../src/content/regions/sites.js";
import { STRUCTURE_SOLIDS } from "../src/content/regions/structures.js";
import { MATERIALS, PLACES, SOURCES } from "../src/content/registry.js";
import { AREAS, CAVE_BIOMES, REQUIRED_SOURCES } from "../src/content/proposals/index.js";
import type { CaveProposal, Ref } from "../src/content/proposals/index.js";
import type { Rect } from "../src/world/types.js";

// CA-2: the Lantern Canopy's and Pale Basin's small and medium caves as data,
// held to the content bible (src/content/proposals/*, accepted at ac40de9) and
// to the world. Geometry, swims and the lamp-off retreats are in
// tests/caves-canopy.heavy.test.ts and tests/caves-basin.heavy.test.ts.

const AREA = { suspended_garden: CANOPY_CAVES, silt_basin: BASIN_CAVES } as const;
const bible = (area: keyof typeof AREA): readonly CaveProposal[] => AREAS.find(a => a.area === area)!.caves;
const bibleCaves = [...bible("suspended_garden"), ...bible("silt_basin")];
const caveIn = (id: string): { group: CaveGroup; cave: CaveGroup["caves"][number] } => {
  for (const group of CANOPY_BASIN_GROUPS) { const cave = group.caves.find(c => c.id === id); if (cave) return { group, cave }; }
  throw new Error(`no authored cave ${id}`);
};
const overlaps = (a: Rect, b: Rect): boolean => a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
const inRect = (r: Rect, x: number, z: number): boolean => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
const BAND = 2 * 4.5 + 0.5 + 0.5;

/** Where a footprint moved off the bible's, and why. Every other cave owns
 * columns overlapping its bible footprint. */
const MOVED: Readonly<Record<string, string>> = {
  basin_fracture_pocket: "route.basin.legacy_anchorage (half-width 8) crosses the bible footprint; moved 34 m east onto the same fractured slope",
  canopy_fin_cleft: "route.isles.canopy_east (a carrier corridor) runs right over it and the world refuses the carrier's box over any footprint; moved 69 m north-east",
};

test("every Canopy and Basin bible cave is authored once, with its size, exits, chambers, passages and closing passage", () => {
  const authored = CANOPY_BASIN_GROUPS.flatMap(g => g.caves.map(c => c.id));
  assert.equal(new Set(authored).size, authored.length, "a bible cave is authored twice");
  assert.deepEqual([...authored].sort(), bibleCaves.map(c => c.id).sort());
  for (const b of bibleCaves) {
    const { group, cave } = caveIn(b.id);
    assert.equal(cave.size, b.size, `${b.id}: size`);
    assert.equal(group.source.region, b.area, `${b.id}: region`);
    assert.deepEqual(cave.exits.map(e => e.exit).sort(), [...b.exits].sort(), `${b.id}: exits`);
    // An exit is a mouth, or (in a network) the throat where this cave's crawl opens into a linked one.
    const linkRooms = new Set(group.links.flatMap(l => l.rooms));
    for (const e of cave.exits) {
      const portal = group.source.portals.find(p => p.id === e.portal)!;
      assert.ok(portal.kind === "mouth" || (portal.kind === "throat" && portal.between.some(r => linkRooms.has(r))), `${b.id}: exit ${e.exit} opens nowhere`);
    }
    assert.ok(cave.exits.some(e => group.source.portals.find(p => p.id === e.portal)!.kind === "mouth"), `${b.id}: no mouth to open water`);
    if (b.size === "small") continue;
    assert.deepEqual(cave.chambers!.map(c => c.name).sort(), [...b.chambers!].sort(), `${b.id}: chambers`);
    assert.deepEqual(cave.passages!.map(p => p.id).sort(), b.passages!.map(p => p.id).sort(), `${b.id}: passages`);
    assert.equal(cave.loopCloser, b.loopCloser, `${b.id}: closing passage`);
    const rank = { diver: 0, small: 1, medium: 2, carrier: 3 } as const;
    assert.ok(rank[cave.hall!.admits] >= rank[b.admits], `${b.id}: the hall takes ${cave.hall!.admits}, the bible asks ${b.admits}`);
    // Each bible passage is a real aperture between the right rooms.
    const room = (name: string): string => name === "exterior" ? "exterior"
      : cave.chambers!.find(c => c.name === name)?.room ?? (b.exits.includes(name) ? "exterior" : `?${name}`);
    for (const bp of b.passages!) {
      const mine = cave.passages!.find(p => p.id === bp.id)!, portal = group.source.portals.find(p => p.id === mine.portal)!;
      const ends = [room(bp.from), room(bp.to)].sort(), via = mine.via;
      const joined = via ? [...portal.between].includes(via) && ends.some(e => portal.between.includes(e)) : [...portal.between].sort().join() === ends.join();
      assert.ok(joined, `${b.id}.${bp.id}: portal ${portal.id} joins ${portal.between.join(" and ")}, not ${ends.join(" and ")}`);
    }
  }
});

/** The chamber graph: chambers as nodes, inter-chamber passages as edges. */
function chamberCycle(b: CaveProposal, without?: string): boolean {
  const parent = new Map(b.chambers!.map(c => [c, c]));
  const find = (n: string): string => { while (parent.get(n) !== n) n = parent.get(n)!; return n; };
  for (const p of b.passages!) {
    if (p.id === without || !parent.has(p.from) || !parent.has(p.to)) continue;
    const a = find(p.from), c = find(p.to);
    if (a === c) return true;
    parent.set(a, c);
  }
  return false;
}
test("medium caves: a real loop through the bible's closing passage, two or more exits, 2-5 chambers", () => {
  for (const b of bibleCaves.filter(c => c.size === "medium")) {
    assert.ok(b.chambers!.length >= 2 && b.chambers!.length <= 5, `${b.id}: ${b.chambers!.length} chambers`);
    assert.ok(b.exits.length >= 2, `${b.id}: ${b.exits.length} exits`);
    assert.ok(chamberCycle(b), `${b.id}: the chambers only chain`);
    assert.ok(!chamberCycle(b, b.loopCloser), `${b.id}: ${b.loopCloser} does not close the loop`);
  }
});

test("footprints: disjoint from each other and the kit's, outside the opening's preserve and band, in their region, near the bible's", () => {
  assert.doesNotThrow(() => assertGroupsDisjoint(CANOPY_BASIN_GROUPS, CAVE_SOURCES));
  const at = (s: CaveSource, minX: number): CaveSource => ({ ...s, footprint: { ...s.footprint, minX, maxX: minX + (s.footprint.maxX - s.footprint.minX) } });
  const first = CANOPY_BASIN_GROUPS[0]!;
  assert.throws(() => assertGroupsDisjoint([first, { ...first, source: { ...at(first.source, first.source.footprint.minX + 1), id: "test.copy" } }]), /no union policy/,
    "control: an overlapping footprint must be refused");
  for (const g of CANOPY_BASIN_GROUPS) {
    const f = g.source.footprint, p = LEGACY_PRESERVE;
    assert.ok(f.minX - BAND >= p.maxX || f.maxX + BAND <= p.minX || f.minZ - BAND >= p.maxZ || f.maxZ + BAND <= p.minZ, `${g.source.id}: collar band reaches the legacy preserve`);
    for (const [x, z] of [[f.minX, f.minZ], [f.maxX, f.minZ], [f.minX, f.maxZ], [f.maxX, f.maxZ]] as const)
      assert.equal(regionAtPoint(x, z), g.source.region, `${g.source.id}: corner ${x}, ${z} is not in ${g.source.region}`);
    for (const c of g.caves) {
      const b = bibleCaves.find(b => b.id === c.id)!;
      assert.ok(overlaps(f, b.footprint) || MOVED[c.id], `${c.id}: moved off its bible footprint without a recorded reason`);
    }
  }
});

test("footprints hold no existing datum: sites, structures, registry sources and places, bible exterior points", () => {
  const ours = new Set(CANOPY_BASIN_GROUPS.flatMap(g => [...g.finds.map(f => f.id), ...g.pockets.map(p => p.id)]));
  const datums: { id: string; x: number; z: number }[] = [
    ...SITES.map(s => ({ id: s.id, x: s.at.x, z: s.at.z })),
    ...Object.entries(SOURCES as Record<string, { position: { x: number; z: number } }>).map(([id, s]) => ({ id, ...s.position })),
    ...Object.entries(PLACES as Record<string, { position: { x: number; z: number } }>).map(([id, s]) => ({ id, ...s.position })),
    ...AREAS.flatMap(a => [...a.resources.filter(r => !r.inCave), ...a.landmarks, ...a.sideRewards, ...a.lostSites.filter(l => !l.inCave)])
      // A cave's own side reward (its view, shortcut) names it in `near`.
      .filter(x => !ours.has(x.id) && !x.near.some(n => bibleCaves.some(c => c.id === n.id))).map(x => ({ id: x.id, x: x.at.x, z: x.at.z })),
    ...CAVE_BIOMES.flatMap(b => b.entrances).filter(e => e.role !== "back").map(e => ({ id: e.id, x: e.at.x, z: e.at.z })),
  ];
  for (const g of CANOPY_BASIN_GROUPS) {
    const f = g.source.footprint;
    for (const d of datums) assert.ok(!inRect(f, d.x, d.z), `${g.source.id}: footprint holds ${d.id}`);
    for (const s of STRUCTURE_SOLIDS) assert.ok(!overlaps(f, { minX: s.bounds.min.x, maxX: s.bounds.max.x, minZ: s.bounds.min.z, maxZ: s.bounds.max.z }),
      `${g.source.id}: overlaps structure ${s.id}`);
  }
});

test("no footprint or collar-band overlap with any authored cave, CA-1's Reef and Isles caves included", () => {
  assert.ok(["reef_archlet", "isles_storm_arch", "hub_crown_shaft"].every(id => CAVE_SOURCES.some(s => s.id === id)), "CA-1's and the hub's caves are present");
  for (const g of CANOPY_BASIN_GROUPS) for (const s of [...AUTHORED_CAVE_SOURCES, ...CANOPY_BASIN_GROUPS.map(x => x.source)]) {
    if (s === g.source) continue;
    const f = g.source.footprint, grown = { minX: f.minX - 2 * BAND, maxX: f.maxX + 2 * BAND, minZ: f.minZ - 2 * BAND, maxZ: f.maxZ + 2 * BAND };
    assert.ok(!overlaps(f, s.footprint), `${g.source.id} overlaps ${s.id}`);
    // Bands between two CA-2 groups may meet in exterior terrain (Knot and the east crown).
    if (!CANOPY_BASIN_GROUPS.some(x => x.source === s)) assert.ok(!overlaps(grown, s.footprint), `${g.source.id}'s collar band meets ${s.id}'s`);
  }
});

test("links: every bible crawlway and back entrance has one rock owner and a swept rescue route, or is recorded as omitted", () => {
  const pairs = bibleCaves.flatMap(b => b.links.filter((l: Ref) => l.kind === "proposal").map(l => [b.id, l.id] as const));
  for (const [a, b] of pairs) {
    const target = b.split(".")[0]!, isBiome = CAVE_BIOMES.some(x => x.id === target);
    const owner = CANOPY_BASIN_GROUPS.find(g => g.links.some(l => l.between.includes(a) && l.between.includes(isBiome ? target : b)));
    assert.ok(owner, `${a} -> ${b}: no authored link`);
    const link = owner.links.find(l => l.between.includes(a))!;
    assert.equal(link.owner, owner.source.id, `${link.id}: owned by ${link.owner}, authored in ${owner.source.id}`);
    // One owner: both caves (or the cave and its crawl) are in the owning footprint.
    for (const id of link.between) if (!CAVE_BIOMES.some(x => x.id === id)) assert.ok(owner.caves.some(c => c.id === id), `${link.id}: ${id} is outside its owner`);
    assert.ok(link.rescue.length >= 1, `${link.id}: no rescue route`);
    for (const r of link.rescue) assert.ok(owner.source.routes.some(x => x.id === r && x.profile === "diver"), `${link.id}: rescue ${r} is not a diver route`);
    for (const r of link.rooms) assert.ok(owner.source.rooms.some(x => x.id === r), `${link.id}: room ${r}`);
    if (isBiome) {
      const entrance = CAVE_BIOMES.find(x => x.id === target)!.entrances.find(e => e.id === b)!;
      assert.equal(entrance.role, "back");
      const h = owner.handoffs.find(h => h.entrance === b);
      assert.ok(h, `${link.id}: no hand-off face for ${b}`);
      assert.ok(owner.source.rooms.some(r => r.id === h.room), `${h.id}: room`);
      const f = owner.source.footprint;
      assert.ok(inRect(f, h.center.x, h.center.z), `${h.id}: the hand-off face is outside the owner`);
    }
  }
  assert.ok(pairs.length >= 4, `${pairs.length} links`);
});

test("contents are typed and reference the bible; cave-only items are never required-only", () => {
  const bibleResources = AREAS.flatMap(a => a.resources), roster = (area: string) => AREAS.find(a => a.area === area)!.creatures.map(c => c.species);
  const required = new Set(REQUIRED_SOURCES.map(r => r.item as string));
  for (const g of CANOPY_BASIN_GROUPS) {
    const area = AREAS.find(a => a.area === g.source.region)!;
    for (const p of g.pockets) {
      assert.ok(Object.hasOwn(MATERIALS, p.item), `${p.id}: ${p.item} is not a registry material`);
      if (p.status === "bible") {
        const b = bibleResources.find(r => r.id === p.id);
        assert.ok(b, `${p.id}: not in the bible`);
        assert.equal(b.item, p.item); assert.equal(b.inCave, p.cave, `${p.id}: the bible puts it in ${b.inCave}`);
        assert.equal(b.renewable, p.renewable);
      } else {
        assert.ok(!bibleResources.some(r => r.id === p.id), `${p.id}: a proposed ID reuses a bible ID`);
        assert.ok(p.stock && p.stock[0] > 0 && p.stock[1] > 0, `${p.id}: proposed pockets carry a stock`);
      }
      // Never cave-only: two or more exterior sources outside every cave here.
      assert.ok(required.has(p.item), `${p.id}: ${p.item} has no exterior ledger`);
    }
    for (const f of g.finds) if (f.contents) for (const item of Object.keys(f.contents)) assert.ok(required.has(item), `${f.id}: ${item}`);
    // Every bible cave-favoured resource assigned to these caves is placed.
    for (const r of bibleResources.filter(r => g.caves.some(c => c.id === r.inCave))) assert.ok(g.pockets.some(p => p.id === r.id), `${r.id}: not placed`);
    for (const r of g.residents) {
      assert.ok(roster(g.source.region).includes(r.species), `${r.id}: ${r.species} is not in ${g.source.region}'s roster`);
      assert.ok(r.count > 0 && r.radius > 0);
    }
    assert.ok(g.residents.some(r => r.species === area.caveResident) || g.caves.every(c => !bibleCaves.find(b => b.id === c.id)!.resident),
      `${g.source.id}: the bible gives it the region's resident but none spawns`);
    for (const c of g.caves) {
      const b = bibleCaves.find(b => b.id === c.id)!;
      if (b.resident) assert.ok(g.residents.some(r => r.cave === c.id && r.species === b.resident), `${c.id}: bible resident ${b.resident} missing`);
    }
  }
  // Cave contents never carry a frontier material: the tier rule's samples stay the bible's.
  for (const g of CANOPY_BASIN_GROUPS) for (const p of g.pockets) assert.ok(!["pressure_ceramic", "thermal_core", "brine_lattice", "tagged_frame"].includes(p.item), p.id);
});

test("the required ledger keeps exterior sources outside every Canopy and Basin cave footprint", () => {
  const position = (r: Ref): { x: number; z: number } | null => {
    if (r.kind === "site") { const s = SITES.find(s => s.id === r.id); return s ? s.at : null; }
    if (r.kind === "source") return (SOURCES as Record<string, { position: { x: number; z: number } }>)[r.id]?.position ?? null;
    if (r.kind === "proposal") return AREAS.flatMap(a => a.resources).find(x => x.id === r.id)?.at ?? null;
    return null;
  };
  for (const req of REQUIRED_SOURCES) {
    let outside = 0;
    for (const r of req.exterior) {
      const at = position(r);
      assert.ok(at, `${r.id}: no position`);
      if (!CANOPY_BASIN_GROUPS.some(g => inRect(g.source.footprint, at.x, at.z))) outside++;
      else assert.fail(`${req.item}: exterior source ${r.id} lies inside a cave footprint`);
    }
    assert.ok(outside >= 2, `${req.item}: ${outside} exterior sources`);
  }
});

test("the edge shelf floor: equal to the exterior outside and on every edge, a lip that rejoins it inside", () => {
  for (const g of CANOPY_BASIN_GROUPS) {
    const f = g.source.footprint, floor = caveFloor(g.source, worldFloor);
    for (let u = 0; u <= 1; u += 0.125) {
      const x = f.minX + (f.maxX - f.minX) * u, z = f.minZ + (f.maxZ - f.minZ) * u;
      for (const [px, pz] of [[x, f.minZ], [x, f.maxZ], [f.minX, z], [f.maxX, z], [x, f.minZ - 1], [f.maxX + 1, z]] as const)
        assert.equal(floor(px, pz), worldFloor(px, pz), `${g.source.id}: shelf floor moved the edge or the outside at ${px}, ${pz}`);
      // Never below the ground; back on the ground past the shelf and lip.
      const cx = (f.minX + f.maxX) / 2, cz = (f.minZ + f.maxZ) / 2;
      assert.ok(floor(x, cz) >= worldFloor(x, cz) - 1e-9);
      if (Math.min(cx - f.minX, f.maxX - cx, cz - f.minZ, f.maxZ - cz) > EDGE_SHELF + 2.5) assert.equal(floor(cx, cz), worldFloor(cx, cz));
    }
  }
  // The open profile: unchanged where monotone, a level window at a crest.
  // The open profile: never lower, every sample the lowest of some window,
  // a valley's slopes unchanged, a crest a level plateau a cube can sit on.
  const check = (p: number[], out: number[], k: number): void => {
    assert.ok(out.every((v, i) => v >= p[i]!));
    for (let i = 0; i < out.length; i++) {
      let ok = false;
      for (let a = Math.max(0, i - k + 1); a <= Math.min(i, out.length - k) && !ok; a++) ok = out.slice(a, a + k).every(v => v >= out[i]!);
      assert.ok(ok, `sample ${i} sits in no window it is the lowest of`);
    }
  };
  const valley = [5, 4, 3, 2, 1, 2, 3, 4, 5], open = openProfile(valley, 1, 2);
  check(valley, open, 3);
  assert.deepEqual(open.slice(3, 6), valley.slice(3, 6), "a valley's slopes are unchanged a window in from its ends");
  const ridge = [0, 1, 2, 5, 2, 1, 0], crest = openProfile(ridge, 1, 2);
  check(ridge, crest, 3);
  assert.ok(crest.filter(v => v === 5).length >= 3, "a crest becomes a plateau a cube can sit on");
});

test("wakeglow: a trail fades in a minute, open water carries none, and the oldest glowing wake is the way in", () => {
  const trail = wakeTrail(), path = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 20 }, { x: 10, y: 0, z: 20 }];
  const end = swimWake(trail, path, 2, 100);
  assert.equal(end, 115);
  assert.ok(trail.points.length >= 55, `${trail.points.length} points`);
  assert.ok(wakeGlow(trail.points[0]!, 100) === 1 && wakeGlow(trail.points[0]!, 100 + WAKE_FADE_SECONDS) === 0);
  const sees = () => true;
  const from = { x: 10, y: 0, z: 20 };
  const oldest = oldestVisible(trail, from, end + 1, sees);
  // Within 7 m of the end, the oldest glowing wake lies back towards the corner the diver came round.
  assert.ok(oldest && oldest.at.z === 20 && oldest.at.x <= 3.5, `the oldest visible wake ${JSON.stringify(oldest?.at)} does not point back along the way in`);
  assert.equal(oldestVisible(trail, from, end + WAKE_FADE_SECONDS + 1, sees), null, "a faded trail points nowhere");
  const open = wakeTrail();
  layWake(open, { x: 0, y: 0, z: 0 }, 0, 1, () => false);
  assert.equal(open.points.length, 0, "open water carries the drift away");
});
