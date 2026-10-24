/** LS-1 stage 1a: the lost-site records. Every reveal, door and note resolves to
 * something real or stays withheld; placed sites sit on the floor; the chain reaches
 * every off-route site; player text stays dated before the disaster and clear of the
 * lore owner's lint list (read from the spoiler appendix, so this file names none of it). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { BLUEPRINTS, FUTURE_BLUEPRINTS, PLACES, SOURCES } from "../src/content/registry.js";
import { SITES } from "../src/content/regions/sites.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { CAVE_SOURCES, AUTHORED_CAVE_SOURCES } from "../src/content/regions/caves.js";
import { CANOPY_CAVES } from "../src/content/regions/caves/canopy.js";
import { BASIN_CAVES } from "../src/content/regions/caves/basin.js";
import { DEEP_CAVE_SOURCES } from "../src/content/regions/caves/deep.js";
import { SYS2_BLUEPRINTS } from "../src/content/systems/items.js";
import { CODED_DOORS, DECODABLE_IDS, DECODABLES, DECODE_LOGS, LOST_SITES, placedReveals, revealPlaced, WORLD_LOST_SITES } from "../src/content/systems/decodes.js";
import { DEFERRED_LOST_SITES } from "../src/content/systems/lostSites.js";
import type { RevealDefinition } from "../src/content/systems/lostSites.js";
import { FOUND_NOTE_TEXTS } from "../src/content/systems/notes.js";
import { doorCodes, discoverSite } from "../src/sim/systems/decoder.js";
import { noteHostPosition, noteReadable, readableNotes } from "../src/sim/systems/notes.js";
import { buildJournal } from "../src/sim/systems/journal.js";
import { cellOf } from "../src/sim/systems/navigation.js";
import { createSystems } from "../src/sim/systems/state.js";
import { opened } from "./systems-support.js";

const AUTHORED_CAVES = [...AUTHORED_CAVE_SOURCES, ...CANOPY_CAVES.map((g) => g.source), ...BASIN_CAVES.map((g) => g.source), ...DEEP_CAVE_SOURCES];
const reveals = DECODABLE_IDS.flatMap((d) => (DECODABLES[d].reveals as readonly RevealDefinition[]).map((r) => ({ d, r })));

test("every placed lost site stands on the composed floor and has a plate, a path and a tell", () => {
  for (const id of WORLD_LOST_SITES) {
    const s = LOST_SITES[id], floor = worldFloor(s.position.x, s.position.z);
    assert.ok(Math.abs(s.position.y - floor) <= 4, `${id}: y ${s.position.y} vs floor ${floor.toFixed(1)}`);
    assert.ok(s.plate.length > 0 && s.see.length > 0, `${id} reads before decoding`);
    assert.ok(["main", "near", "off"].includes(s.path), id);
    assert.ok(s.tell.range > 0 && (s.tell.kind !== "sound" || !!s.tell.sound), `${id}: a sound tell describes its sound`);
    if ("sound" in s.tell && s.tell.sound) assert.ok(!s.tell.sound.toLowerCase().includes(s.label.toLowerCase()), `${id}: the sound cue never names the site`);
    assert.ok(DECODABLE_IDS.some((d) => DECODABLES[d].site === id), `${id} holds a decodable`);
  }
});

test("every reveal names a real target; one not in the world yet is withheld", () => {
  for (const { d, r } of reveals) {
    const t = r.target;
    if (t.kind === "lost-site") assert.ok(Object.hasOwn(LOST_SITES, t.id), `${d}: ${t.id}`);
    if (t.kind === "site") assert.ok(SITES.some((x) => x.id === t.id), `${d}: ${t.id}`);
    if (t.kind === "source") assert.ok(Object.hasOwn(SOURCES, t.id), `${d}: ${t.id}`);
    if (t.kind === "cave") {
      const c = AUTHORED_CAVES.find((x) => x.id === t.id);
      assert.ok(c, `${d}: cave ${t.id} is authored`);
      const f = c!.footprint, near = 40;
      assert.ok(r.position.x >= f.minX - near && r.position.x <= f.maxX + near && r.position.z >= f.minZ - near && r.position.z <= f.maxZ + near,
        `${d}: ${t.id}'s mouth point is at its footprint`);
      assert.equal(revealPlaced(t), CAVE_SOURCES.some((x) => x.id === t.id), `${d}: ${t.id} shows exactly when its cave is in the world`);
    }
    assert.ok(r.radius > 0 && r.label.length > 0, `${d}: ${r.id}`);
  }
  for (const d of DECODABLE_IDS)
    assert.deepEqual(placedReveals(d).map((r) => r.id), (DECODABLES[d].reveals as readonly RevealDefinition[]).filter((r) => revealPlaced(r.target)).map((r) => r.id), d);
  assert.equal(new Set(reveals.map(({ r }) => r.id)).size, reveals.length, "reveal IDs are unique");
});

test("the chain: every off-route site is reachable by a decoded map or its own tell; decodes only ever grant real optional plans", () => {
  for (const id of WORLD_LOST_SITES.filter((x) => LOST_SITES[x].path === "off")) {
    const revealed = reveals.some(({ r }) => r.target.kind === "lost-site" && r.target.id === id);
    assert.ok(revealed || LOST_SITES[id].tell.range >= 50, `${id} can be found`);
  }
  assert.ok(reveals.some(({ r }) => r.target.kind === "lost-site"), "decoded maps lead to further lost sites");
  const plans = new Set([...Object.keys(BLUEPRINTS), ...Object.keys(FUTURE_BLUEPRINTS), ...Object.keys(SYS2_BLUEPRINTS)]);
  for (const d of DECODABLE_IDS) for (const bp of DECODABLES[d].blueprints) assert.ok(plans.has(bp), `${d}: ${bp} is a known plan`);
});

test("deferred rows stay out of the world until placed", () => {
  for (const [id, row] of Object.entries(DEFERRED_LOST_SITES)) {
    assert.ok(!Object.hasOwn(LOST_SITES, id), id);
    assert.ok(row.blockedBy.length > 0, id);
    for (const d of row.decodes) assert.ok(!Object.hasOwn(DECODABLES, d.id), `${d.id} is not findable yet`);
  }
});

test("found notes: every note resolves, is dated before the disaster, and reads by its rule", () => {
  const gated = new Map<string, string>();
  for (const d of DECODABLE_IDS) for (const g of DECODABLES[d].gates) gated.set(g, d);
  const deferredGates = new Map<string, string>(Object.values(DEFERRED_LOST_SITES).flatMap((row) => row.decodes.flatMap((d) => d.gates.map((g) => [g, d.id] as const))));
  for (const n of FOUND_NOTE_TEXTS) {
    assert.match(n.dated, /^(Season \d+|D−\d+)$/, `${n.id} is dated before the disaster`);
    if (n.readable.kind === "decode") {
      const by = gated.get(n.id) ?? deferredGates.get(n.id);
      assert.equal(by, n.readable.decode, `${n.id} is gated by ${n.readable.decode}`);
    } else {
      assert.ok(noteHostPosition(n.host), `${n.id}: its host is in the world`);
      assert.ok(n.host.kind === "place" ? Object.hasOwn(PLACES, n.host.id) : n.host.kind === "site", `${n.id} is posted on the main path`);
    }
  }
  const sys = createSystems();
  assert.deepEqual(readableNotes(sys), []);
  const galley = FOUND_NOTE_TEXTS.find((n) => n.id === "note_yard_galley")!, at = noteHostPosition(galley.host)!;
  sys.chart.push(cellOf(at.x, at.z));
  assert.ok(noteReadable(sys, galley), "an always note reads once you have been there");
  const season = FOUND_NOTE_TEXTS.find((n) => n.id === "note_reef_season")!;
  assert.equal(noteReadable(sys, season), false);
  sys.found.push("reef_pumphouse_log");
  sys.decoded.push("reef_pumphouse_log");
  assert.ok(noteReadable(sys, season), "a decode note reads once decoded");
  const { s } = opened();
  const j = buildJournal(s, sys, {});
  const notes = j.tabs.find((t) => t.id === "notebook")!.sections.find((x) => x.id === "notes")!;
  assert.deepEqual(notes.entries.map((e) => e.id).sort(), ["note:note_reef_season", "note:note_yard_galley"]);
});

test("door codes: each coded door's record is one placed decode's, and its code shows only once the door is placed", () => {
  for (const [id, door] of Object.entries(CODED_DOORS)) {
    const by = DECODABLE_IDS.filter((d) => (DECODABLES[d].gates as readonly string[]).includes(door.record));
    assert.equal(by.length, 1, `${id}: one decode holds its code`);
    const dashed = door.code.split("").join("-");
    assert.ok(DECODE_LOGS[by[0]!]!.some((l) => l.includes(dashed)), `${id}: the decoded log gives ${dashed}`);
  }
  const sys = createSystems();
  for (const d of ["isles_strain_gauge_log", "divide_mixing_log"] as const) { discoverSite(sys, DECODABLES[d].site); sys.decoded.push(d); }
  assert.deepEqual(doorCodes(sys), [], "neither door is in the world yet, so no code shows");
  const placed = { "island.cold_store_hatch": { ...CODED_DOORS["island.cold_store_hatch"], placed: true } };
  assert.deepEqual(doorCodes(sys, placed), [{ door: "island.cold_store_hatch", label: "Cold store hatch", code: "4417" }]);
  const undecoded = createSystems();
  assert.deepEqual(doorCodes(undecoded, placed), [], "no code before the decode");
});

test("player text is clear of the lore owner's lint list", () => {
  const appendix = fs.readFileSync("docs/spoilers/LS-1-LORE.md", "utf8");
  const block = /```ls1-lint\n([\s\S]*?)```/.exec(appendix);
  assert.ok(block, "the appendix holds the lint list");
  const words = block![1]!.split("\n").map((w) => w.trim()).filter(Boolean);
  assert.ok(words.length >= 10);
  const texts: [string, string][] = [
    ...WORLD_LOST_SITES.flatMap((id) => { const s = LOST_SITES[id]; return [s.label, s.see, s.plate, s.tell.kind === "sound" ? (s.tell as { sound?: string }).sound ?? "" : ""].map((t) => [id, t] as [string, string]); }),
    ...DECODABLE_IDS.flatMap((d) => [DECODABLES[d].label, ...DECODE_LOGS[d]!, ...(DECODABLES[d].reveals as readonly RevealDefinition[]).map((r) => r.label)].map((t) => [d, t] as [string, string])),
    ...Object.entries(CODED_DOORS).map(([id, door]) => [id, door.label] as [string, string]),
    ...Object.entries(DEFERRED_LOST_SITES).map(([id, row]) => [id, row.label] as [string, string]),
    ...FOUND_NOTE_TEXTS.flatMap((n) => [[n.id, n.label], [n.id, n.text]] as [string, string][]),
  ];
  for (const [where, text] of texts)
    for (const w of words) {
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}\\p{N}]|$)`, "iu");
      assert.ok(!re.test(text), `${where}: player text uses a lint word`);
    }
});
