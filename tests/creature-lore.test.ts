import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ITEMS, MATERIALS, PLACES, SOURCES } from "../src/content/registry.js";
import { CYCLES } from "../src/content/currents/cycles.js";
import { AUTHORED_CAVE_SOURCES } from "../src/content/regions/caves.js";
import { CANOPY_BASIN_SOURCES } from "../src/content/regions/caves/index.js";
import { regionAtPoint } from "../src/content/regions/layout.js";
import { ROUTES } from "../src/content/regions/passages.js";
import { SITES } from "../src/content/regions/sites.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { AREAS, CAVE_BIOMES, CR1_INTERFACE, FAUNA_SITES, FIELD_GUIDE, FOUND_NOTES, HINT_RADIUS, SPECIES } from "../src/content/proposals/index.js";
import type { FaunaSite, Point, Ref } from "../src/content/proposals/index.js";

// CB-2 creature lore: the field guide, found notes and creature-ground placements
// checked against the registry, CR-1's published IDs, the world and each other.

const resources = AREAS.flatMap(a => a.resources), landmarks = AREAS.flatMap(a => a.landmarks), lost = AREAS.flatMap(a => a.lostSites);
const caves = AREAS.flatMap(a => a.caves), decodes = lost.flatMap(l => l.decodes);
const fauna = new Map(FAUNA_SITES.map(f => [f.id, f]));
const guide = new Map(FIELD_GUIDE.map(e => [e.species, e]));
const cr1Grounds = CR1_INTERFACE.grounds as Readonly<Record<string, { region: string; item: string }>>;
const cr1Falls = CR1_INTERFACE.falls as Readonly<Record<string, { region: string; salvage: Readonly<Record<string, string>> }>>;
const cr1Cycles = CR1_INTERFACE.cycles as Readonly<Record<string, string>>;
const salvage = new Map(Object.values(cr1Falls).flatMap(f => Object.entries(f.salvage)));
const knownItem = (item: string) => Object.hasOwn(MATERIALS, item) || (CR1_INTERFACE.items as readonly string[]).includes(item);

const positionOf = (r: Ref): { x: number; z: number } | null => {
  switch (r.kind) {
    case "site": { const s = SITES.find(s => s.id === r.id); return s ? s.at : null; }
    case "place": { const s = (PLACES as Record<string, { position: Point }>)[r.id]; return s ? s.position : null; }
    case "source": { const s = (SOURCES as Record<string, { position: Point }>)[r.id]; return s ? s.position : null; }
    case "proposal": {
      const x = [...landmarks, ...lost, ...resources].find(x => x.id === r.id), c = caves.find(c => c.id === r.id);
      return x ? x.at : c ? c.mouth : null;
    }
    default: return null;
  }
};

test("every species in every roster, and every new one, has exactly one field-guide entry", () => {
  const needed = new Set([...SPECIES.map(s => s.id), ...AREAS.flatMap(a => a.creatures.map(c => c.species)), ...FAUNA_SITES.flatMap(f => f.species)]);
  assert.equal(guide.size, FIELD_GUIDE.length, "duplicate field-guide species");
  for (const id of needed) assert.ok(guide.has(id), `${id} has no field-guide entry`);
  for (const e of FIELD_GUIDE) {
    assert.ok(SPECIES.some(s => s.id === e.species), `${e.species} is not a known species`);
    for (const k of ["title", "hint", "eats", "leaves", "spawns", "behaviour", "protectionText"] as const) assert.ok(e[k].trim().length > 0, `${e.species}: empty ${k}`);
  }
});

const HARVEST = /\b(edible|cook\w*|harvest\w*|catch\w*|nets?|netted|gather\w*|collect\w*|good eating|meal|food|roe|tasty|pan)\b/i;
const THREATS = new Set(SPECIES.filter(s => s.role === "threat").map(s => s.id));

test("protected and observed animals never read as harvestable; threats, rare residents and their eggs are protected", () => {
  for (const id of THREATS) assert.equal(guide.get(id)?.protection, "protected", `${id}: a threat must be protected`);
  for (const id of ["crown_rays", "brine_sails", "knot_eel", "canopy_floaters"] as const) assert.equal(guide.get(id)?.protection, "protected", `${id}: a rare resident must be protected`);
  for (const e of FIELD_GUIDE) {
    if (e.protection !== "protected" && e.protection !== "observe") continue;
    assert.deepEqual(e.yields, [], `${e.species}: nothing is taken from a ${e.protection} animal`);
    for (const k of ["title", "hint", "eats", "leaves", "spawns", "behaviour", "protectionText"] as const) {
      const hit = e[k].match(HARVEST);
      assert.equal(hit, null, `${e.species}.${k} reads as harvestable: "${hit?.[0]}"`);
    }
    assert.match(e.protectionText, /\b(leave|nothing|not|never)\b/i, `${e.species}: say plainly that it is left alone`);
  }
  for (const f of FAUNA_SITES) {
    const prot = f.species.map(s => guide.get(s)!.protection);
    if (f.kind === "protected_spawn") {
      assert.equal(f.item, null, `${f.id}: protected eggs are never an item`);
      assert.ok(prot.every(p => p === "protected"), `${f.id}: protected spawn belongs to protected animals`);
      continue;
    }
    if (f.item === null && !f.salvage) continue;
    assert.ok(prot.every(p => p !== "protected" && p !== "observe"), `${f.id}: a protected or observed animal is a source`);
    if (f.kind === "carcass_fall") assert.ok(prot.every(p => p === "remains"), `${f.id}: falls are remains, never a protected animal`);
    if (f.kind === "fish") assert.ok(prot.every(p => p === "food"), `${f.id}: only common fish are caught`);
    if (f.kind === "spawning") assert.ok(prot.every(p => p === "food" || p === "spawn_only"), `${f.id}: only common fish spawn is gathered`);
    if (f.kind === "moult" || f.kind === "shed") assert.ok(prot.every(p => p === "shed_only"), `${f.id}: sheds come from shed-only animals`);
  }
});

test("field-guide yields and threat windows match the grounds, CR-1's IDs and the registry", () => {
  for (const e of FIELD_GUIDE) {
    for (const y of e.yields) {
      assert.ok(knownItem(y.item), `${e.species}: unknown item ${y.item}`);
      assert.ok(y.grounds.length > 0, `${e.species}: ${y.item} has no ground`);
      for (const g of y.grounds) {
        const f = fauna.get(g), res = resources.find(r => r.id === g), src = (SOURCES as Record<string, { item: string }>)[g], salv = salvage.get(g);
        const item = f?.item ?? res?.item ?? src?.item ?? salv;
        assert.ok(item, `${e.species}: ground ${g} does not exist`);
        assert.equal(item, y.item, `${e.species}: ground ${g} yields ${item}, not ${y.item}`);
        if (f) assert.ok(f.species.includes(e.species), `${g} does not list ${e.species} as its animal`);
      }
    }
    const isThreat = THREATS.has(e.species);
    assert.equal(!!e.window, isThreat, `${e.species}: threats, and only threats, have a natural window`);
    if (e.window) assert.equal(cr1Cycles[e.window.cycle], e.species, `${e.species}: window ${e.window.cycle} is not CR-1's cycle for it`);
  }
  for (const [cycle, species] of Object.entries(cr1Cycles)) assert.equal(guide.get(species as never)?.window?.cycle, cycle, `${cycle} has no field-guide window`);
  for (const f of FAUNA_SITES) if (f.item || f.salvage)
    assert.ok(f.species.some(s => guide.get(s)!.yields.some(y => y.grounds.includes(f.id) || Object.keys(f.salvage ?? {}).some(k => y.grounds.includes(k)))),
      `${f.id}: no field-guide entry tells the player what it yields`);
});

test("placements agree with CR-1's published IDs, and with its composed rows when present", () => {
  for (const [id, g] of Object.entries(cr1Grounds)) {
    const f = fauna.get(id);
    assert.ok(f && f.owner === "CR-1", `${id}: CR-1 ground has no proposed position`);
    assert.equal(f!.item, g.item, `${id}: item differs from CR-1's`);
    assert.equal(f!.area, g.region, `${id}: region differs from CR-1's`);
  }
  for (const [id, fall] of Object.entries(cr1Falls)) {
    const f = fauna.get(id);
    assert.ok(f && f.kind === "carcass_fall" && f.area === fall.region, `${id}: CR-1 fall missing or misplaced`);
    assert.deepEqual(f!.salvage, fall.salvage, `${id}: salvage differs from CR-1's`);
  }
  for (const id of Object.keys(CR1_INTERFACE.protectedGrounds)) assert.equal(fauna.get(id)?.kind, "protected_spawn", `${id}: CR-1 protected ground`);
  for (const f of FAUNA_SITES) if (f.owner === "CR-1")
    assert.ok(Object.hasOwn(cr1Grounds, f.id) || Object.hasOwn(cr1Falls, f.id) || Object.hasOwn(CR1_INTERFACE.protectedGrounds, f.id), `${f.id}: owner CR-1 but not in its interface`);
  for (const f of FAUNA_SITES) if (f.owner === "CB-2")
    assert.ok(!Object.hasOwn(SOURCES, f.id) || (SOURCES as Record<string, { item: string }>)[f.id]!.item === f.item, `${f.id}: collides with a different registry source`);
  // Once CR-1 composes, its rows must carry these IDs and items.
  const composed = Object.keys(cr1Grounds).filter(id => Object.hasOwn(SOURCES, id));
  for (const id of composed) assert.equal((SOURCES as Record<string, { item: string }>)[id]!.item, cr1Grounds[id]!.item, `${id}: composed item differs`);
  const items = (CR1_INTERFACE.items as readonly string[]).filter(i => Object.hasOwn(ITEMS, i));
  if (items.length) assert.deepEqual(items, CR1_INTERFACE.items, "CR-1's items are only partly composed");
  const cycles = Object.keys(cr1Cycles).filter(id => CYCLES.some(c => c.id === id));
  if (cycles.length) assert.deepEqual(cycles, Object.keys(cr1Cycles), "CR-1's cycles are only partly composed");
});

const segDist = (x: number, z: number, a: Point, b: Point) => {
  const dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz;
  const t = L ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L)) : 0;
  return Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
};
const routeDistance = (x: number, z: number) => Math.min(...ROUTES.flatMap(r => r.path.slice(1).map((b, i) => segDist(x, z, r.path[i]!, b))));
const caveRects = [...AUTHORED_CAVE_SOURCES, ...CANOPY_BASIN_SOURCES].map(c => ({ id: c.id, r: c.footprint }))
  .concat(caves.map(c => ({ id: c.id, r: c.footprint })));
const inRect = (r: { minX: number; maxX: number; minZ: number; maxZ: number }, x: number, z: number) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

test("placements sit on the floor or in water, in their region, outside caves unless declared, and falls stay off routes", () => {
  for (const f of FAUNA_SITES) {
    const { x, y, z } = f.at, floor = worldFloor(x, z);
    if (f.anchor === "floor") assert.ok(Math.abs(y - floor) <= 4, `${f.id}: y ${y} vs floor ${floor.toFixed(1)}`);
    if (f.anchor === "water") assert.ok(y > floor + 1 && y <= 0, `${f.id}: water at ${y}, floor ${floor.toFixed(1)}`);
    assert.notEqual(f.anchor, "land", `${f.id}: creature grounds are under water`);
    const region = regionAtPoint(x, z);
    assert.equal(region, f.area === "hub_spur" ? "silt_basin" : f.area, `${f.id}: lies in ${region}`);
    const hits = caveRects.filter(c => inRect(c.r, x, z)).map(c => c.id);
    const biomes = CAVE_BIOMES.filter(b => inRect({ minX: b.domain.min.x, maxX: b.domain.max.x, minZ: b.domain.min.z, maxZ: b.domain.max.z }, x, z)
      && y >= b.domain.min.y && y <= b.domain.max.y).map(b => b.id);
    if (f.inCave) {
      assert.equal(f.anchor, "reshape", `${f.id}: an underground point is not on today's floor`);
      assert.ok(hits.includes(f.inCave) || biomes.includes(f.inCave as never), `${f.id}: not inside ${f.inCave}`);
      const c = [...AUTHORED_CAVE_SOURCES, ...CANOPY_BASIN_SOURCES].find(c => c.id === f.inCave);
      if (c) assert.ok(y > c.baseY && y < c.topY, `${f.id}: y ${y} outside ${c.id}'s envelope`);
    } else {
      assert.deepEqual(hits, [], `${f.id}: inside cave ${hits.join(", ")} without saying so`);
      assert.deepEqual(biomes, [], `${f.id}: inside cave biome ${biomes.join(", ")}`);
    }
    if (f.kind === "carcass_fall") {
      assert.ok(routeDistance(x, z) >= 30, `${f.id}: ${routeDistance(x, z).toFixed(0)} m from a route`);
      assert.ok(f.area === "silt_basin" || f.area === "brine_divide", `${f.id}: falls are in the Basin and the Divide`);
    }
  }
  const ids = FAUNA_SITES.map(f => f.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate placement IDs");
  for (const id of ids) assert.ok(!SITES.some(s => s.id === id) && !caves.some(c => c.id === id) && !resources.some(r => r.id === id), `${id} collides with existing content`);
  for (const f of FAUNA_SITES) {
    if (f.item) assert.ok(knownItem(f.item), `${f.id}: unknown item ${f.item}`);
    for (const r of f.near) assert.ok(positionOf(r), `${f.id}: near ${r.kind} ${r.id} does not resolve`);
  }
});

test("found notes: hosts, decodes and hints resolve; every hint names a nearby landmark in its own words", () => {
  const ids = FOUND_NOTES.map(n => n.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate note IDs");
  for (const n of FOUND_NOTES) {
    assert.ok(positionOf(n.host), `${n.id}: host ${n.host.kind} ${n.host.id} does not resolve`);
    if (n.readable.kind === "decode") {
      const d = decodes.find(d => d.id === (n.readable as { decode: string }).decode);
      assert.ok(d, `${n.id}: unknown decode`);
      assert.ok(d!.gates.includes(n.id), `${n.id}: ${d!.id} does not gate it`);
      const owner = lost.find(l => l.decodes.includes(d!));
      assert.ok(n.host.kind === "proposal" && n.host.id === owner!.id, `${n.id}: hosted away from its decode's lost site ${owner!.id}`);
    }
    assert.ok(n.hints.length > 0, `${n.id}: a found note hints at something`);
    for (const h of n.hints) {
      assert.ok(n.text.includes(h.words), `${n.id}: "${h.words}" is not in its text`);
      if (Object.hasOwn(cr1Cycles, h.target)) continue;
      const f = fauna.get(h.target);
      assert.ok(f, `${n.id}: hint target ${h.target} is neither a placement nor a CR-1 cycle`);
      const at = positionOf(h.via);
      assert.ok(at, `${n.id}: landmark ${h.via.id} does not resolve`);
      const d = Math.hypot(at!.x - f!.at.x, at!.z - f!.at.z);
      assert.ok(d <= HINT_RADIUS, `${n.id}: ${h.via.id} is ${d.toFixed(0)} m from ${h.target}`);
    }
  }
});

test("found notes: no map markers or coordinates, dated before the disaster, practical first", () => {
  for (const n of FOUND_NOTES) {
    assert.doesNotMatch(n.text, /-?\d+(\.\d+)?\s*,\s*-?\d+|\b[xyz]\s*[:=]|\b\d+\s*m\b|metres|meters|bearing\s*\d/i, `${n.id}: reads like a map marker`);
    assert.match(n.dated, /^(Season \d+|D−\d+)$/, `${n.id}: dated "${n.dated}"`);
    assert.doesNotMatch(n.text + n.dated, /D\s*\+|D0\b/, `${n.id}: nobody wrote after the disaster`);
    // Practical first: the first sentence carries a hint.
    const first = n.text.split(/(?<=[.!?:])\s/)[0]!;
    assert.ok(n.hints.some(h => first.includes(h.words) || first.toLowerCase().includes(h.words.toLowerCase().split(" ")[0]!)) || /^(Fish|Roe|Casts|Grit|Slack)/.test(first),
      `${n.id}: the first sentence should carry a practical hint`);
  }
});

test("coverage: every ground, fall, protected spawn, trap spot and threat window is hinted, and windows on the main path", () => {
  const hinted = new Set(FOUND_NOTES.flatMap(n => n.hints.map(h => h.target)));
  for (const f of FAUNA_SITES) assert.ok(hinted.has(f.id), `${f.id}: no note hints at it`);
  const always = new Set(FOUND_NOTES.filter(n => n.readable.kind === "always").flatMap(n => n.hints.map(h => h.target)));
  for (const cycle of Object.keys(cr1Cycles)) assert.ok(always.has(cycle), `${cycle}: no always-readable note teaches it`);
  for (const kind of ["cook", "trapper", "season_log", "spawning_record", "survey"] as const)
    assert.ok(FOUND_NOTES.some(n => n.kind === kind), `no ${kind} note`);
  const byKind = (k: FaunaSite["kind"]) => FAUNA_SITES.filter(f => f.kind === k).length;
  assert.ok(byKind("spawning") >= 3 && byKind("carcass_fall") >= 2 && byKind("trap_spot") >= 3 && byKind("protected_spawn") >= 2, "placement counts");
});

test("the field guide and notes are written up for builders", () => {
  const doc = readFileSync("docs/content/FIELD-GUIDE.md", "utf8"), bible = readFileSync("docs/content/BIBLE.md", "utf8");
  for (const e of FIELD_GUIDE) assert.ok(doc.includes(`\`${e.species}\``), `FIELD-GUIDE.md does not cover ${e.species}`);
  for (const id of [...FOUND_NOTES.map(n => n.id), ...FAUNA_SITES.map(f => f.id)]) assert.ok(doc.includes(id), `FIELD-GUIDE.md does not mention ${id}`);
  assert.ok(bible.includes("FIELD-GUIDE.md"), "BIBLE.md links the field guide");
});
