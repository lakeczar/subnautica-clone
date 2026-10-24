#!/usr/bin/env node
/** SIM-1 per-tick simulation cost, comparable across commits.
 *
 *   node scripts/sim-bench.mjs --generate OUT --tree DIR
 *     plays the creel scenario with DIR's compiled playthrough and writes each
 *     milestone save to OUT/<label>.json (the bench's states).
 *   node scripts/sim-bench.mjs --states OUT --tree DIR [--tree DIR2 ...] [--ticks 600] [--rounds 7]
 *     from each state, steps --ticks fixed steps of held controls (swim or
 *     pilot ahead, turning) and reports the median µs per step over --rounds
 *     fresh loads, for every step entry the tree has: `stepGame` (pure: clone
 *     plus step), `stepGameInPlace` and `StepGuard.step`; plus the clone alone
 *     and the app's per-step timeline observation.
 *
 * DIR is a compiled tree root (`.test-build`). Trees are interleaved round by
 * round, so host drift hits them alike. Numbers count only from
 * `heavy-check.sh --class exclusive` (docs/build/WORKER_RESOURCE_LIMITS.md). */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { guardLocalRun } from "./local-guard.mjs";

guardLocalRun();

const args = process.argv.slice(2);
const all = (flag) => args.flatMap((a, i) => a === flag ? [args[i + 1]] : []);
const value = (flag) => all(flag)[0];
const trees = all("--tree");
if (!trees.length) { console.error("usage: sim-bench.mjs (--generate OUT | --states DIR) --tree DIR [--tree DIR2]"); process.exit(2); }
const load = (tree, file) => import(pathToFileURL(path.resolve(tree, file)).href);

if (value("--generate")) {
  const out = value("--generate"), tree = trees[0];
  fs.mkdirSync(out, { recursive: true });
  const { loadCampaign } = await load(tree, "scripts/playthrough/content.js");
  const { SCENARIOS } = await load(tree, "scripts/playthrough/scenarios.js");
  const { Driver } = await load(tree, "scripts/playthrough/driver.js");
  const { SaveSlot } = await load(tree, "scripts/playthrough/persistence.js");
  const { runPhases } = await load(tree, "scripts/playthrough/runner.js");
  await loadCampaign();
  const scenario = SCENARIOS.find((s) => s.id === "creel");
  const slot = new SaveSlot("creel"), run = await runPhases(new Driver("creel", "creel"), scenario.phases, scenario.options, slot);
  for (const [label, text] of slot.snapshots) fs.writeFileSync(path.join(out, `${label}.json`), text);
  console.log(`creel ${run.outcome}: ${slot.snapshots.size} milestone saves → ${out}`);
  process.exit(run.outcome === "blocked" ? 1 : 0);
}

const statesDir = value("--states"), ticks = Number(value("--ticks") ?? 600), rounds = Number(value("--rounds") ?? 7);
const files = fs.readdirSync(statesDir).filter((f) => f.endsWith(".json")).sort((a, b) =>
  JSON.parse(fs.readFileSync(path.join(statesDir, a), "utf8")).state.tick - JSON.parse(fs.readFileSync(path.join(statesDir, b), "utf8")).state.tick);
const setups = await Promise.all(trees.map(async (tree) => {
  const step = await load(tree, "src/sim/step.js"), codec = await load(tree, "src/save/codec.js");
  const world = (await load(tree, "src/sim/world.js")).gameWorld();
  const guard = fs.existsSync(path.resolve(tree, "src/sim/stepGuard.js")) ? await load(tree, "src/sim/stepGuard.js") : null;
  const timeline = await load(tree, "src/sim/timeline/recorder.js");
  const modes = { stepGame: (s, c) => step.stepGame(s, c, world).state };
  if (step.stepGameInPlace) modes.stepGameInPlace = (s, c) => { step.stepGameInPlace(s, c, world); return s; };
  if (guard) modes["StepGuard.step"] = (s, c, g) => { g.step(s, c, world); return s; };
  return { tree, step, codec, world, modes, guard, timeline };
}));
/** Held controls for tick t: ahead, with a slow turn and a gentle dive and rise. */
const controls = (t) => [{ type: "look", yawDelta: 0.004, pitchDelta: t % 240 < 120 ? 0.002 : -0.002 },
  { type: "move", forward: 1, right: 0, vertical: 0, sprint: false }];
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

const results = [];
for (const file of files) {
  const text = fs.readFileSync(path.join(statesDir, file), "utf8");
  const samples = new Map();
  for (let round = 0; round < rounds; round++)
    for (const setup of setups) {
      const fresh = () => { const d = setup.codec.decodeSave(text); if (!d.ok) throw new Error(`${file}: ${d.error}`); return d.value.state; };
      for (const [mode, run] of Object.entries(setup.modes)) {
        let s = fresh();
        const g = setup.guard ? new setup.guard.StepGuard() : null;
        for (let t = 0; t < 60; t++) s = run(s, controls(t), g);      // warm-up
        const t0 = performance.now();
        for (let t = 0; t < ticks; t++) s = run(s, controls(t + 60), g);
        const key = `${setup.tree}\t${mode}`;
        (samples.get(key) ?? samples.set(key, []).get(key)).push((performance.now() - t0) * 1000 / ticks);
      }
      const s = fresh(), n = 200, t0 = performance.now();
      for (let i = 0; i < n; i++) structuredClone(s);
      const key = `${setup.tree}\tclone alone`;
      (samples.get(key) ?? samples.set(key, []).get(key)).push((performance.now() - t0) * 1000 / n);
      // The app's per-step timeline observation of this state (input held, nothing changing).
      const rec = setup.timeline.createRecorder({ id: "bench", started: "2026-10-23T00:00:00.000Z" }), m = 2000;
      for (let i = 0; i < 100; i++) { s.tick++; setup.timeline.observe(rec, s, { input: true, waiting: [] }); }
      const t1 = performance.now();
      for (let i = 0; i < m; i++) { s.tick++; setup.timeline.observe(rec, s, { input: true, waiting: [] }); }
      const observeKey = `${setup.tree}\ttimeline observe`;
      (samples.get(observeKey) ?? samples.set(observeKey, []).get(observeKey)).push((performance.now() - t1) * 1000 / m);
    }
  const bytes = JSON.stringify(JSON.parse(text).state).length, tick = JSON.parse(text).state.tick;
  for (const [key, xs] of samples) {
    const [tree, mode] = key.split("\t");
    results.push({ state: file.replace(/\.json$/, ""), tick, bytes, tree, mode, usPerTick: median(xs), spread: [Math.min(...xs), Math.max(...xs)] });
  }
}
console.log(`sim-bench: ${ticks} ticks × ${rounds} rounds per state, median µs per step`);
for (const r of results)
  console.log(`  ${r.state.padEnd(14)} ${String(r.bytes).padStart(6)} B  ${path.basename(path.dirname(r.tree)).padEnd(26)} ${r.mode.padEnd(16)} ` +
    `${r.usPerTick.toFixed(1).padStart(7)} µs  (${r.spread[0].toFixed(1)}–${r.spread[1].toFixed(1)})`);
const out = value("--json");
if (out) fs.writeFileSync(out, JSON.stringify({ generated: new Date().toISOString(), ticks, rounds, results }, null, 2) + "\n");
