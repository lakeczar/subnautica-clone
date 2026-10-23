#!/usr/bin/env node
// Goal-based soaks (goals.mjs) in the real game in a GPU browser.
//
//   node scripts/soak/run.mjs tour  --dist DIST --save SAVE --plan PLAN --out DIR [--laps N]
//   node scripts/soak/run.mjs dwell --dist DIST --save SAVE --out DIR [--at PLACE|X,Y,Z] [--autosaves N]
//     PLACE: crown-station, dish-field (large-cave once it is placed)
//   common: [--thresholds FILE] [--port N] [--sample-s 10] [--software] [--gpu REGEX]
//
// Run it in the queue: `--class soak --gpu` (yields to waiting work) or
// `--class gpu`. The soak ends when its goal is met (tour: laps; dwell:
// autosaves), or early, with a report, the moment a rule breaks.
//
// PLAN: { segments: [[{ x, y, z, cave?, region? }, …], …] } (CW-1's traversal
// plan) or { points: [...] }. A lap follows every point in order and returns
// to the first; the save should start at or near it, with the craft and gear
// the route needs (SAVE-1's library saves, once built).
//
// Writes DIR/samples.jsonl, DIR/report.json and DIR/report.md. Exit: 0 pass,
// 1 a rule broke, 4 incomplete (travel blocked), 75 yielded to waiting work,
// 2 setup error. Touches $SILTWAKE_JOB_HEARTBEAT on every sample; watches
// $SILTWAKE_JOB_YIELD.
import { appendFileSync, existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { evaluateDwell, evaluateTour, loadThresholds, reportMarkdown } from "./goals.mjs";
import { cdpHeap, createProbe, frames, jobCgroup, oceanDataset, processRss, saveJournal } from "./probe.mjs";
import { Blocked, goto, openGame, read, releaseAll, saveAndReload } from "./browser.mjs";

const [kind, ...rest] = process.argv.slice(2);
const arg = (name, dflt) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : dflt; };
const flag = (name) => rest.includes(`--${name}`);
if (!["tour", "dwell"].includes(kind) || !arg("dist") || !arg("save") || !arg("out") || (kind === "tour" && !arg("plan"))) {
  console.error("usage: run.mjs tour|dwell --dist DIST --save SAVE --out DIR [--plan PLAN] [--laps N] [--at X,Y,Z] [--autosaves N] [--thresholds FILE]");
  process.exit(2);
}
const out = arg("out");
mkdirSync(out, { recursive: true });
const t = loadThresholds(arg("thresholds"));
if (arg("laps")) t.tour.laps = Number(arg("laps"));
if (arg("autosaves")) t.dwell.autosaves = Number(arg("autosaves"));
const sampleS = Number(arg("sample-s", 10));
const started = Date.now(), now = () => (Date.now() - started) / 1000;
const log = (...a) => console.log(`[${now().toFixed(0)}s] ${a.join(" ")}`);

// Frame times are evidence only from an isolated run: an exclusive grant, or a
// host running the soak alone (the remote lane sets SILTWAKE_SOAK_DEDICATED).
const ticket = process.env.SILTWAKE_JOB_TICKET;
const grant = ticket ? JSON.parse(readFileSync(join(process.env.SILTWAKE_SCHED_DIR || "/work/tmp/siltwake-sched", "jobs", ticket, "grant.json"), "utf8")) : null;
const judged = Boolean(grant?.exclusive) || process.env.SILTWAKE_SOAK_DEDICATED === "1";
const commit = (() => { try { return readFileSync(join(arg("dist"), "COMMIT"), "utf8").trim(); } catch { return spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim() || null; } })();

const run = { startedAt: 0, laps: [], samples: [], autosaves: [], saves: [], frames: { judged, attributed: true, streamingOver: [], longOver: [] }, holds: { available: true, list: [] }, crash: null, travel: {}, yielded: false };
let verdict = null, stopping = false;
const evaluate = () => (verdict = kind === "tour" ? evaluateTour(run, t.tour) : evaluateDwell({ ...run, now: now() }, t.dwell));
const shouldStop = () => stopping;

let g;
try {
  g = await openGame({ dist: arg("dist"), save: arg("save"), port: Number(arg("port", 4100 + (process.pid % 800))), software: flag("software"), gpu: arg("gpu"), label: `soak-${kind}`, log });
} catch (e) {
  console.error(`soak setup failed: ${e.message}`);
  process.exit(2);
}
const probe = createProbe([cdpHeap(g.cdp), processRss(g.browserPid), jobCgroup(), oceanDataset(g.page)]);
const tick = createProbe([frames(g.page, { overMs: kind === "tour" ? t.tour.streamingFrameMs : t.dwell.autosaveHitchMs }), saveJournal(g.page), oceanDataset(g.page)]);
let lastSave = null, where = "start";

/** Every second: frames, holds and saves (cheap). Every sampleS: the full probe. */
async function heartbeatTick() {
  const s = await tick.sample({ at: now() });
  where = s.where?.cave || s.where?.region || where;
  if (s.frames.attributed === false) run.frames.attributed = false;
  for (const ms of s.frames.streaming ?? []) run.frames.streamingOver.push({ ms, where });
  if (!s.frames.attributed) for (const ms of s.frames.over ?? []) run.frames.longOver.push({ ms, where });
  if (s.holds.available === false) run.holds.available = false;
  else if (s.holds.held) run.holds.list.push({ where, state: s.holds.state, at: now() });
  if (s.lastSave?.savedAt && s.lastSave.savedAt !== lastSave?.savedAt) {
    if (lastSave) run.autosaves.push({ at: now(), tick: s.lastSave.tick, frameMs: s.frames.worstMs }); // the frame around the save
    lastSave = s.lastSave;
  }
  if (g.crash) run.crash = g.crash;
  if (process.env.SILTWAKE_JOB_YIELD && existsSync(process.env.SILTWAKE_JOB_YIELD)) run.yielded = true;
}
async function fullSample(extra = {}) {
  const s = await probe.sample({ at: now(), ...extra });
  run.samples.push({ at: s.at, memory: s.memory, graphics: s.graphics });
  appendFileSync(join(out, "samples.jsonl"), `${JSON.stringify({ ...s, ...extra.mark })}\n`);
  if (process.env.SILTWAKE_JOB_HEARTBEAT) { try { writeFileSync(process.env.SILTWAKE_JOB_HEARTBEAT, ""); utimesSync(process.env.SILTWAKE_JOB_HEARTBEAT, new Date(), new Date()); } catch { /* best effort */ } }
  return s;
}
let ticking = Promise.resolve(), sinceFull = 0;
const timer = setInterval(() => {
  ticking = ticking.then(async () => {
    if (stopping) return;
    await heartbeatTick();
    if (++sinceFull >= sampleS) { sinceFull = 0; await fullSample(); }
    evaluate();
    if (verdict.status === "fail" || run.yielded) { stopping = true; log(verdict.status === "fail" ? `rule broken: ${verdict.reason}` : "yield notice: stopping"); }
  }).catch((e) => { run.crash ??= `measurement failed: ${e.message.split("\n")[0]}`; stopping = true; });
}, 1000);

try {
  await fullSample({ mark: { mark: "start" } });
  if (kind === "tour") await tour();
  else await dwell();
} catch (e) {
  if (e instanceof Blocked) run.travel.blocked = e.message;
  else run.crash ??= e.message.split("\n")[0];
} finally {
  clearInterval(timer);
  await ticking.catch(() => {});
  await releaseAll(g).catch(() => {});
}
evaluate();
const meta = {
  commit, machine: `${hostname()}${process.env.SILTWAKE_SOAK_MACHINE ? ` (${process.env.SILTWAKE_SOAK_MACHINE})` : ""}`, renderer: g.renderer,
  ticket: ticket ?? "none", class: grant?.class ?? "outside the queue", frames: judged ? "judged (isolated run)" : "recorded only (shared run: not frame-time evidence)",
  ranS: Math.round(now()), save: arg("save"), plan: arg("plan") ?? null, pageErrors: g.errors.length,
};
writeFileSync(join(out, "report.json"), JSON.stringify({ kind, meta, thresholds: t[kind], verdict, laps: run.laps, autosaves: run.autosaves, saves: run.saves,
  longFrames: run.frames.longOver.slice(0, 200), streamingFrames: run.frames.streamingOver.slice(0, 200), holds: run.holds, errors: g.errors.slice(0, 50) }, null, 1));
writeFileSync(join(out, "report.md"), reportMarkdown(kind, verdict, meta));
log(`${kind} soak ${verdict.status}${verdict.reason ? `: ${verdict.reason}` : ""}; report ${join(out, "report.md")}`);
await g.close();
process.exit({ pass: 0, fail: 1, incomplete: 4, yielded: 75 }[verdict.status] ?? 4);

async function tour() {
  const plan = JSON.parse(readFileSync(arg("plan"), "utf8"));
  const points = plan.points ?? plan.segments.flat();
  for (let lap = 1; lap <= t.tour.laps && !stopping; lap++) {
    log(`lap ${lap} of ${t.tour.laps}: ${points.length} points`);
    for (const [i, p] of points.entries()) {
      if (!(await goto(g, p, { tol: p.cave ? 4 : 3, label: p.cave ?? p.region ?? `point ${i}`, boost: true, stop: shouldStop }))) return;
    }
    if (!(await goto(g, points[0], { label: "lap start", stop: shouldStop }))) return;
    await g.page.waitForTimeout(3000); // settle at the same place every lap before measuring
    const s = await fullSample({ gc: true, mark: { mark: `lap ${lap}` } });
    run.laps.push({ lap, at: s.at, memory: s.memory, graphics: s.graphics });
    const saved = await saveAndReload(g, `lap ${lap}`);
    run.saves.push(saved);
    log(`lap ${lap} done: renderer ${s.memory.rendererRssMiB?.toFixed(0)} MiB, heap ${s.memory.jsHeapAfterGcMiB?.toFixed(0)} MiB after GC, ${s.graphics.meshes} meshes; save ${saved.ok ? "reloaded" : `FAILED: ${saved.error}`}`);
    evaluate();
    if (verdict.status === "fail") { stopping = true; log(`rule broken: ${verdict.reason}`); }
  }
}

/** The heaviest places (DIRECTION: dwell soaks). null: not in the game yet. */
const PLACES = {
  "crown-station": [319, -56.4, -542.4], // CROWN_STATION work pose (src/content/hub/crownStation.ts)
  "dish-field": [508, -40, -572], // above basin.dish_centre (src/content/regions/structures.ts)
  "large-cave": null, // canopy_roots (LC) is not placed in the world yet
};

async function dwell() {
  const name = arg("at");
  if (name && PLACES[name] === null) { run.travel.blocked = `${name} is not placed in the game yet`; return; }
  const at = name ? (PLACES[name] ?? name.split(",").map(Number)) : null;
  const anchor = at ? { x: at[0], y: at[1], z: at[2] } : null;
  if (anchor && !(await goto(g, anchor, { label: "dwell place", stop: shouldStop }))) return;
  const s0 = await read(g), home = anchor ?? { x: s0.cam[0], y: s0.cam[1], z: s0.cam[2] };
  log(`dwelling at ${home.x.toFixed(0)},${home.y.toFixed(0)},${home.z.toFixed(0)} for ${t.dwell.autosaves} autosaves`);
  while (!stopping && run.autosaves.length < t.dwell.autosaves) {
    const s = await read(g), off = Math.hypot(s.cam[0] - home.x, s.cam[1] - home.y, s.cam[2] - home.z);
    if (off > 6) await goto(g, home, { label: "dwell place", stop: shouldStop }); // drifted in a current: hold station
    await g.page.waitForTimeout(1000);
  }
  if (!stopping) { await fullSample({ gc: true, mark: { mark: "dwell end" } }); run.saves.push(await saveAndReload(g, "dwell end")); }
}
