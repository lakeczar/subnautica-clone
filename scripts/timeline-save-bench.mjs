#!/usr/bin/env node
/** SIM-1b: what one play-timeline save costs at the full 20,000-event window.
 *
 *   node scripts/timeline-save-bench.mjs --tree DIR [--saves 60]
 *
 * DIR is a compiled tree root (with src/sim/...). A timeline is filled to the
 * full rotation window (gathers, points of interest, travel, a note every 50
 * events), then saved --saves times, about 10 s of play apart, two ways:
 *   - root's model: the whole export, stringified, as `setItem` would receive it;
 *   - the journal: `TimelineJournal.commit` into an in-memory storage.
 * One save in the run seals a chunk. Characters written are exact; times are
 * the median and maximum of the run (indicative on a shared host). */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { guardLocalRun } from "./local-guard.mjs";

guardLocalRun();

const args = process.argv.slice(2);
const value = (flag, fallback) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : fallback; };
const tree = value("--tree"), saves = Number(value("--saves", 60));
if (!tree) { console.error("usage: timeline-save-bench.mjs --tree DIR [--saves 60]"); process.exit(2); }
const load = (file) => import(pathToFileURL(path.resolve(tree, file)).href);
const R = await load("src/sim/timeline/recorder.js"), S = await load("src/sim/state.js"), P = await load("src/sim/progression.js");
const { TimelineJournal } = await load("src/sim/timeline/store.js");

class Memory {
  data = new Map(); written = 0; keys = 0;
  get length() { return this.data.size; }
  key(i) { return [...this.data.keys()][i] ?? null; }
  getItem(k) { return this.data.get(k) ?? null; }
  setItem(k, v) { this.data.set(k, v); this.written += v.length; this.keys++; }
  removeItem(k) { this.data.delete(k); }
}
const lock = { runExclusive: async (_name, _signal, action) => action() };
const s = S.createGame(); P.completeOpening(s);
const rec = R.createRecorder({ id: "bench", started: "2026-10-24T00:00:00.000Z" });
let i = 0;
const items = ["silica_glass", "structural_alloy", "meal"];
const add = (n) => {
  for (const end = i + n; i < end; i++) {
    s.tick += 30; rec.playTicks += 30;
    if (i % 50 === 0) R.addNote(rec, s, `note ${i}: what the player thought about this moment`);
    else if (i % 11 === 0) R.recordEvent(rec, s, { kind: "travel", seconds: 40, stationary: 2, metres: 120, hull: "dart", id: "dart_1" });
    else R.recordEvent(rec, s, { kind: i % 3 ? "gather" : "poi", what: items[i % 3], id: "reef_glass_ridge_north", quantity: 2 });
  }
};
add(R.TIMELINE_CHUNK_EVENTS * (R.TIMELINE_RETAINED_CHUNKS + 1) + 300);   // the full window, rotating
const storage = new Memory(), journal = new TimelineJournal(storage, lock, "bench");
journal.load();
const first = await journal.commit(rec, s, new AbortController().signal);
if (!first.ok) throw new Error(first.error);

const root = [], commits = [];
let rootChars = 0, sealed = null;
for (let k = 0; k < saves; k++) {
  add(k === Math.floor(saves / 2) ? R.TIMELINE_CHUNK_EVENTS : 5);   // ~10 s of play; one save seals a chunk
  let t0 = performance.now();
  rootChars = R.exportTimelineText(rec, s).length;
  root.push(performance.now() - t0);
  const before = storage.written, keys = storage.keys;
  t0 = performance.now();
  const r = await journal.commit(rec, s, new AbortController().signal);
  const ms = performance.now() - t0;
  if (!r.ok) throw new Error(r.error);
  const row = { ms, chars: storage.written - before, keys: storage.keys - keys };
  if (row.keys > 1) sealed = row; else commits.push(row);
}
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const max = (xs) => Math.max(...xs);
console.log(`timeline-save-bench: ${rec.seq} events recorded, ${rec.sealed.length} sealed chunks + ${rec.events.length} open, ${rec.rotated.length} folded`);
console.log(`  root model (whole export): ${rootChars} chars per save; stringify median ${median(root).toFixed(2)} ms, max ${max(root).toFixed(2)} ms`);
console.log(`  journal, steady commit: ${median(commits.map((c) => c.chars))} chars per save (journal only); median ${median(commits.map((c) => c.ms)).toFixed(2)} ms, max ${max(commits.map((c) => c.ms)).toFixed(2)} ms`);
if (sealed) console.log(`  journal, sealing commit: ${sealed.chars} chars in ${sealed.keys} keys; ${sealed.ms.toFixed(2)} ms`);
