import test from "node:test";
import assert from "node:assert/strict";
import { BoundedMemo, simCaches } from "../src/sim/caches.js";
import { sitePosition } from "../src/content/ecology/sites.js";
import { HAZARD_FIELDS } from "../src/content/ecology/hazards.js";
import type { HazardShape } from "../src/content/ecology/hazards.js";
import { shapeWeight } from "../src/sim/ecology/hazards.js";
import { craftProfile } from "../src/sim/upgrades/effects.js";

// SIM-PERF-1 R1-F2: every sim cache has an owner, an entry and a byte ceiling, an eviction rule
// and a place in the ledger (performance convention 8).

test("a bounded memo keeps both ceilings, evicting the oldest first, and counts what it does", () => {
  const memo = new BoundedMemo<string>("test memo", 3, 100, (key) => 30 + key.length);
  let made = 0;
  const get = (k: string) => memo.get(k, () => { made++; return `v:${k}`; });
  for (const k of ["a", "b", "c"]) assert.equal(get(k), `v:${k}`);
  assert.equal(get("a"), "v:a");
  assert.equal(made, 3, "a hit doesn't make the value again");
  get("d"); // entry ceiling: "a" (oldest inserted) goes, though it was just read (FIFO)
  get("a");
  assert.equal(made, 5);
  let s = memo.stats();
  assert.equal(s.entries, 3);
  assert.ok(s.bytes <= s.maxBytes, JSON.stringify(s));
  get("a-very-long-key-that-weighs-more"); // byte ceiling: evicts until it fits
  s = memo.stats();
  assert.ok(s.bytes <= 100 && s.entries >= 1, JSON.stringify(s));
  assert.equal(s.hits, 1);
  assert.ok(s.evictions >= 3);
  assert.ok(simCaches().some((c) => c.owner === "test memo"), "registered in the ledger");
});

test("the ledger holds the craft-profile memo and the hazard field centres, each within its ceilings", () => {
  const first = structuredClone(craftProfile("dart", 300, []));
  for (let rating = 0; rating < 300; rating++) craftProfile("creel", rating, []);
  const ledger = simCaches(), profiles = ledger.find((c) => c.owner.includes("craftProfile"))!, centres = ledger.find((c) => c.owner.includes("field centres"))!;
  assert.ok(profiles && centres, JSON.stringify(ledger.map((c) => c.owner)));
  assert.ok(profiles.entries <= profiles.maxEntries && profiles.bytes <= profiles.maxBytes, JSON.stringify(profiles));
  assert.ok(profiles.evictions > 0, "300 ratings passed the ceiling");
  assert.deepEqual(craftProfile("dart", 300, []), first, "a profile made again after eviction is the same profile");
  assert.equal(centres.entries, Object.keys(HAZARD_FIELDS).length);
  assert.ok(centres.bytes <= centres.maxBytes);
});

test("a shape outside the centre table is answered the same, uncached", () => {
  const f = Object.values(HAZARD_FIELDS)[0]!, copy = structuredClone(f.shape) as HazardShape, c = sitePosition(f.shape.center);
  for (const p of [c, { x: c.x + 7, y: c.y - 3, z: c.z + 11 }, { x: c.x + 90, y: c.y, z: c.z }])
    assert.equal(shapeWeight(copy, f.edge, p), shapeWeight(f.shape, f.edge, p));
});

test("a value alone over the byte ceiling is returned uncached and declined; what was kept stays (R2-F1)", () => {
  const memo = new BoundedMemo<string>("test oversize", 8, 100, (key) => (key === "big" ? 101 : 40));
  let made = 0;
  const get = (k: string) => memo.get(k, () => { made++; return `v:${k}`; });
  get("a"); get("b");
  assert.equal(get("big"), "v:big");
  assert.equal(get("big"), "v:big");
  assert.equal(made, 4, "an uncached value is made again on every call");
  const s = memo.stats();
  assert.deepEqual([s.entries, s.bytes, s.declined, s.evictions], [2, 80, 2, 0], JSON.stringify(s));
  get("a"); get("b");
  assert.equal(made, 4, "the entries already kept are still there");
});

test("a memo's ceilings must admit something: zero, negative, fractional or unbounded ceilings are refused (R2-F1)", () => {
  const bytes = () => 1;
  for (const [entries, max] of [[0, 100], [-1, 100], [1.5, 100], [NaN, 100], [1, 0], [1, -5], [1, NaN], [1, Infinity]] as const)
    assert.throws(() => new BoundedMemo("test bad ceilings", entries, max, bytes), RangeError, `${entries} entries, ${max} bytes`);
  const one = new BoundedMemo<number>("test one entry", 1, 10, bytes);
  one.get("a", () => 1); one.get("b", () => 2);
  assert.deepEqual([one.stats().entries, one.stats().evictions], [1, 1]);
});
