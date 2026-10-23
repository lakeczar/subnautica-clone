#!/usr/bin/env node
// Goal-based soaks (goals.mjs, soak.mjs) in the real game in a GPU browser.
//
//   node scripts/soak/run.mjs tour  --dist DIST --save SAVE --plan PLAN --out DIR [--laps N]
//   node scripts/soak/run.mjs dwell --dist DIST --save SAVE --out DIR [--at PLACE|X,Y,Z] [--autosaves N]
//     PLACE: crown-station, dish-field (large-cave reports "not placed yet")
//   common: [--thresholds FILE] [--port N] [--sample-s 10] [--software] [--gpu REGEX]
//
// Run it in the queue: `--class soak --gpu` (yields to waiting work) or
// `--class gpu`. The soak ends when its goal is met (tour: laps in one game
// lifetime; dwell: autosaves and the leak window), or early, with a report,
// the moment a rule breaks.
//
// PLAN: { segments: [[{ x, y, z, cave?, region? }, …], …] } (CW-1's traversal
// plan) or { points: [...] }. A lap follows every point in order and returns
// to the first; the save should start at or near it, with the craft and gear
// the route needs (SAVE-1's library saves, once built).
//
// Writes DIR/samples.jsonl, DIR/report.json, DIR/report.md and DIR/saves/.
// Exit: 0 pass (goal met, every rule measured and passed), 5 partial (goal
// met, nothing broke, some rules unproven), 1 a rule broke, 4 incomplete
// (travel blocked), 75 yielded to waiting work, 2 setup error. Touches
// $SILTWAKE_JOB_HEARTBEAT on every sample; watches $SILTWAKE_JOB_YIELD.
import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadThresholds } from "./goals.mjs";
import { cdpHeap, collectGarbage, createProbe, frames, jobCgroup, oceanDataset, processRss, saveJournal } from "./probe.mjs";
import { Blocked, goto, openGame, read, releaseAll, saveAndCheck } from "./browser.mjs";
import { EXIT, readJsonFile, runSoak } from "./soak.mjs";

const [kind, ...rest] = process.argv.slice(2);
const arg = (name, dflt) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : dflt; };
const flag = (name) => rest.includes(`--${name}`);
if (!["tour", "dwell"].includes(kind) || !arg("dist") || !arg("save") || !arg("out") || (kind === "tour" && !arg("plan"))) {
  console.error("usage: run.mjs tour|dwell --dist DIST --save SAVE --out DIR [--plan PLAN] [--laps N] [--at PLACE|X,Y,Z] [--autosaves N] [--thresholds FILE]");
  process.exit(2);
}
const t = loadThresholds(arg("thresholds"));
if (arg("laps")) t.tour.laps = Number(arg("laps"));
if (arg("autosaves")) t.dwell.autosaves = Number(arg("autosaves"));

// Frame times are evidence only from an isolated run: an exclusive grant, or a
// host running the soak alone (the remote lane sets SILTWAKE_SOAK_DEDICATED).
const ticket = process.env.SILTWAKE_JOB_TICKET;
const grant = ticket ? JSON.parse(readFileSync(join(process.env.SILTWAKE_SCHED_DIR || "/work/tmp/siltwake-sched", "jobs", ticket, "grant.json"), "utf8")) : null;
const commit = (() => { try { return readFileSync(join(arg("dist"), "COMMIT"), "utf8").trim(); } catch { return spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim() || null; } })();
const started = Date.now();
const log = (...a) => console.log(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${a.join(" ")}`);

let result;
try {
  result = await runSoak({
    kind, out: arg("out"), thresholds: t, plan: readJsonFile(arg("plan")), at: arg("at"), sampleS: Number(arg("sample-s", 10)),
    judged: Boolean(grant?.exclusive) || process.env.SILTWAKE_SOAK_DEDICATED === "1",
    browser: { dist: arg("dist"), save: arg("save"), port: Number(arg("port", 4100 + (process.pid % 800) * 2)), software: flag("software"), gpu: arg("gpu"), log },
    meta: { commit, machine: `${hostname()}${process.env.SILTWAKE_SOAK_MACHINE ? ` (${process.env.SILTWAKE_SOAK_MACHINE})` : ""}`, ticket: ticket ?? "none",
      class: grant?.class ?? "outside the queue", save: arg("save"), plan: arg("plan") ?? null },
  }, {
    openGame, goto, read, releaseAll, saveAndCheck, Blocked, createProbe, collectGarbage, log,
    providers: (g) => ({
      full: [processRss(g.browserPid), jobCgroup(), oceanDataset(g.page), cdpHeap(g.cdp)],
      tick: [frames(g.page, { overMs: kind === "tour" ? t.tour.streamingFrameMs : t.dwell.autosaveHitchMs }), saveJournal(g.page), oceanDataset(g.page)],
    }),
  });
} catch (e) {
  console.error(`soak setup failed: ${e.message}`);
  process.exit(2);
}
const v = result.verdict;
log(`${kind} soak ${v.status}${v.reason ? `: ${v.reason}` : ""}${v.unproven.length ? `; unproven: ${v.unproven.join(", ")}` : ""}; report ${join(arg("out"), "report.md")}`);
process.exit(EXIT[v.status] ?? 4);
