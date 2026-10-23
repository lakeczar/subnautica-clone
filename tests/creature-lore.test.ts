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
import { createWorldQueries } from "../src/sim/world.js";
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

/** Every player-facing text of an entry, its window included. */
const guideTexts = (e: (typeof FIELD_GUIDE)[number]): [string, string][] => [
  ...(["title", "hint", "eats", "leaves", "spawns", "behaviour", "protectionText"] as const).map(k => [k, e[k]] as [string, string]),
  ...(e.window ? [["window", e.window.text] as [string, string]] : []),
];
const HARVEST = /\b(edible|cook\w*|harvest\w*|catch\w*|nets?|netted|gather\w*|collect\w*|good eating|meal|food|roe|tasty|pan)\b/i;
const THREATS = new Set(SPECIES.filter(s => s.role === "threat").map(s => s.id));

test("protected and observed animals never read as harvestable; threats, rare residents and their eggs are protected", () => {
  for (const id of THREATS) assert.equal(guide.get(id)?.protection, "protected", `${id}: a threat must be protected`);
  for (const id of ["crown_rays", "brine_sails", "knot_eel", "canopy_floaters"] as const) assert.equal(guide.get(id)?.protection, "protected", `${id}: a rare resident must be protected`);
  for (const e of FIELD_GUIDE) {
    if (e.protection !== "protected" && e.protection !== "observe") continue;
    assert.deepEqual(e.yields, [], `${e.species}: nothing is taken from a ${e.protection} animal`);
    for (const [k, text] of guideTexts(e)) {
      const hit = text.match(HARVEST);
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
    assert.ok(!Object.hasOwn(SOURCES, f.id) || (SOURCES as Record<string, { item: string }>)[f.id]!.item === f.item ||
      // CR-1 composes protected egg sites as scan-only sources: they name an item but hold none.
      (f.kind === "protected_spawn" && (SOURCES as Record<string, { stock: number; reserve: number }>)[f.id]!.stock +
        (SOURCES as Record<string, { stock: number; reserve: number }>)[f.id]!.reserve === 0), `${f.id}: collides with a different registry source`);
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

const SIGHT = createWorldQueries([], worldFloor);

test("placements sit on the floor or in water, in their region, outside caves unless declared, and falls stay off routes", () => {
  for (const f of FAUNA_SITES) {
    const { x, y, z } = f.at, floor = worldFloor(x, z);
    // A visible datum clears terrain: ground datums sit 0.3–1.5 m above the floor (CR-1 uses
    // +0.8), water datums at least a metre up, and production sight reaches each from above.
    if (f.anchor === "floor") assert.ok(y - floor >= 0.3 && y - floor <= 1.5, `${f.id}: y ${y} is ${(y - floor).toFixed(2)} m from the floor (want 0.3–1.5)`);
    if (f.anchor === "water") assert.ok(y >= floor + 1 && y <= 0, `${f.id}: water at ${y}, floor ${floor.toFixed(1)}`);
    if (f.anchor === "floor" || f.anchor === "water")
      assert.ok(SIGHT.lineOfSight({ x, y: Math.max(y, floor) + 2, z }, f.at), `${f.id}: not visible from 2 m above (production lineOfSight)`);
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

// Threat-window prose safety (CB-2-03). Any sentence about a threat that tells the player
// to act, or says the way is clear, must sit in that threat's safe phase; the clause that
// gives the go-ahead must not name the dangerous phase. Structural: human review still
// judges the advice itself.
const ACT = /\b(work|gather|take|cross|pass|go|sweep|collect|walk|swim)\b|\b(is|are|stays?|lies?) (clear|empty|yours|safe|quiet)\b/i;
const WINDOW_RULES: Readonly<Record<string, { name: RegExp; safe: RegExp; danger: RegExp }>> = {
  "cycle.canopy.hunter_feeding": { name: /\b(singer|sound hunter|hunter)\b|^Watch which way it goes/i,
    safe: /\b(gone|away|out east|leaves|feeding east|feeds east|feed east)\b/i,
    danger: /\b(it'?s home|it is home|at home|is back|on its way back|coming back|returns?|returning)\b/i },
  "cycle.rift.stalker_feeding": { name: /\bstalkers?\b|\bchimney\b/i,
    safe: /\b(vents?|venting|blows|in the wash|plume'?s rising wash)\b/i,
    danger: /\b(stops?|stopped|between vents|come down|coming down|quiet chimney)\b/i },
  "cycle.divide.skate_rest": { name: /\bskates?\b|\bcrest\b/i,
    safe: /\bslack\b/i,
    danger: /\b(running|runs|downwelling is on|current is on|rising)\b/i },
  "cycle.meridian.choir_rest": { name: /\b(bells?|choir)\b/i,
    safe: /\b(close|closed|closes|rest|resting)\b/i,
    danger: /\b(humming|hum rises|swell\w*|while (they|the bells) sing|as they sing|singing)\b/i },
};
/** `about`: the text is about this threat (its notes and its own entry), so sentences that
 * refer to it by pronoun or by phase count too; otherwise only sentences that name it. */
function windowProseProblems(cycle: string, text: string, about = true): string[] {
  const rule = WINDOW_RULES[cycle]!, out: string[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    // In a text about the threat, a sentence counts when it names it, its phases, or "it/they".
    const relevant = rule.name.test(sentence) || (about && (rule.safe.test(sentence) || rule.danger.test(sentence) || /\b(it|its|it's|they|them)\b/i.test(sentence)));
    if (!relevant) continue;
    for (const clause of sentence.split(/;\s*/)) {
      if (!ACT.test(clause)) continue;
      if (!rule.safe.test(sentence)) out.push(`no safe phase: "${clause}"`);
      if (rule.danger.test(clause)) out.push(`go-ahead in the dangerous phase: "${clause}"`);
    }
  }
  return out;
}
/** The texts that speak about a window: its notes and the threat's own entry,
 * and any other entry that names the threat. */
function windowTexts(cycle: string): [string, string, boolean][] {
  const species = cr1Cycles[cycle]!, rule = WINDOW_RULES[cycle]!;
  const notes = FOUND_NOTES.filter(n => n.hints.some(h => h.target === cycle)).map(n => [n.id, n.text, true] as [string, string, boolean]);
  const own = guideTexts(guide.get(species as never)!).filter(([k]) => k === "hint" || k === "window").map(([k, t]) => [`${species}.${k}`, t, true] as [string, string, boolean]);
  const others = FIELD_GUIDE.filter(e => e.species !== species).flatMap(e => guideTexts(e).filter(([, t]) => rule.name.test(t))
    .map(([k, t]) => [`${e.species}.${k}`, t, false] as [string, string, boolean]));
  return [...notes, ...own, ...others];
}

test("threat-window advice only gives a go-ahead in the safe phase", () => {
  for (const cycle of Object.keys(cr1Cycles)) {
    assert.ok(WINDOW_RULES[cycle], `${cycle}: no prose rule`);
    const texts = windowTexts(cycle);
    assert.ok(texts.some(([, t]) => windowProseProblems(cycle, t).length === 0 && ACT.test(t) && WINDOW_RULES[cycle]!.safe.test(t)), `${cycle}: no text gives the safe go-ahead`);
    for (const [where, text, about] of texts) assert.deepEqual(windowProseProblems(cycle, text, about), [], `${where}`);
  }
});

test("the window-prose and protection checks catch the review's mutations", () => {
  const lab = FOUND_NOTES.find(n => n.id === "note_lab_feeding_card")!.text;
  const reversed = lab.replace("While it's gone, work the home crowns.", "While it's home, work the home crowns.");
  assert.notEqual(reversed, lab);
  assert.ok(windowProseProblems("cycle.canopy.hunter_feeding", reversed).length > 0, "reversed hunter advice passes");
  assert.ok(windowProseProblems("cycle.rift.stalker_feeding", "When it stops, the passage is empty.").length > 0, "stalker advice in the wrong phase passes");
  assert.ok(windowProseProblems("cycle.divide.skate_rest", "Cross while the crest is running.").length > 0, "skate advice in the wrong phase passes");
  assert.ok(windowProseProblems("cycle.meridian.choir_rest", "Pass the bells while they are humming.").length > 0, "choir advice in the wrong phase passes");
  assert.match("Take its young as food.", HARVEST, "harvest wording in a window is caught by the protection scan");
  const hunter = guide.get("canopy_sound_hunter")!;
  assert.ok(guideTexts({ ...hunter, window: { ...hunter.window!, text: "Take its young as food." } }).some(([k, t]) => k === "window" && HARVEST.test(t)),
    "window text is part of the protection scan");
});
