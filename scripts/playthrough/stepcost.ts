/** SIM-PERF-1: what each fixed step costs in ordinary play, phase by phase,
 * and what the slow ones were doing. Every step runs as the app runs it: the
 * guard's step, then the app's own per-step work (the play timeline's
 * observation and its 600-tick export, and the 1,800-tick autosave through the
 * real repository on an in-memory slot, lock body included). Only the HUD's
 * presentation step is left out (it needs a DOM): it's measured in the browser.
 *
 *   node .test-build/scripts/playthrough/stepcost.js [--scenario a,b] [--from-library] [--heap] [--json out.json]
 *   node .test-build/scripts/playthrough/stepcost.js --save KIND[,KIND] [--minutes M] [--heap] [--json out.json]
 *
 * The first form plays the scenarios (all by default). The second steps from
 * each library save (SAVE-1) with held controls for M minutes of game time
 * (default 10). `--heap` also reads the heap at every phase mark (allocation by
 * phase; it adds about 10 µs a step, so time a run without it).
 * `--capture RUN:TICK[,RUN:TICK]` CPU-profiles that one step in context and
 * writes the save before it, its controls and the profile to `--out DIR`
 * (default /work/tmp/simperf1/captures), for `stepreplay.js`.
 * Timings count only from `heavy-check.sh --class exclusive`. */
import fs from "node:fs";
import inspector from "node:inspector/promises";
import path from "node:path";
import v8 from "node:v8";
import { PerformanceObserver } from "node:perf_hooks";
import { createEnvelope, encodeSave } from "../../src/save/codec.js";
import { SaveRepository } from "../../src/save/repository.js";
import type { WriterLockPort } from "../../src/save/writer-lock.js";
import { PHASE, SLOW_STEP_MS, StepCosts, stepMeter } from "../../src/sim/stepCosts.js";
import type { StepRecord } from "../../src/sim/stepCosts.js";
import { StepGuard } from "../../src/sim/stepGuard.js";
import { gameWorld } from "../../src/sim/world.js";
import { regionAtPoint } from "../../src/content/regions/layout.js";
import { controlsActive } from "../../src/sim/timeline/activity.js";
import * as timeline from "../../src/sim/timeline/recorder.js";
import type { GameCommand, GameEvent, GameState, WorldQueries } from "../../src/sim/types.js";
import { loadCampaign } from "./content.js";
import { driverHooks } from "./driver.js";
import type { Driver } from "./driver.js";
import { librarySave } from "./library.js";
import { loadSnapshot, MemoryStorage } from "./persistence.js";
import { playScenarios, SCENARIOS } from "./scenarios.js";

const args = process.argv.slice(2);
const value = (flag: string): string | undefined => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const heap = args.includes("--heap");
const costs = new StepCosts({ ...(heap ? { heap: () => v8.getHeapStatistics().used_heap_size } : {}), keep: 64 });
stepMeter.active = costs;

/** V8 collections over 1 ms, on the step clock (matched to slow steps afterwards). */
const gcs: { at: number; ms: number; kind: number }[] = [];
const gcObserver = new PerformanceObserver((list) => {
  for (const e of list.getEntries()) if (e.duration > 1)
    gcs.push({ at: e.startTime, ms: e.duration, kind: ((e as { detail?: { kind?: number } }).detail)?.kind ?? 0 });
});
gcObserver.observe({ entryTypes: ["gc"] });

interface Slow extends StepRecord {
  run: string; phase: string; mode: string; hull: string | null; region: string | null; position: [number, number, number]; gc?: number;
  /** Cave clusters built unsliced inside the step (CW-1's world; headless has no streamer to build them ahead). */
  caveBuilds?: number;
}
/** CW-1's unsliced cave-cluster builds so far, when the world has kit caves. */
const caveBuilds = (world: WorldQueries): number => (world as { kitCaves?: { stats: { syncBuilds: number } } }).kitCaves?.stats.syncBuilds ?? 0;
let buildsAtOpen = 0;
const slow: Slow[] = [];
const SLOW_KEEP = 2000;
const pending: Promise<void>[] = [];

/** `--capture`: the steps to profile, by run and tick (the tick the step makes). */
const captures = new Set(value("--capture")?.split(",") ?? []);
const captureDir = value("--out") ?? "/work/tmp/simperf1/captures";
const profiler = captures.size ? new inspector.Session() : null;
if (profiler) { profiler.connect(); await profiler.post("Profiler.enable"); await profiler.post("Profiler.setSamplingInterval", { interval: 50 }); }
let capturing: { name: string; save: string } | null = null;
/** Before a step: start the profiler if this is a captured one (the save is the state it starts from). */
function captureBefore(run: string, s: GameState): void {
  const name = `${run}:${s.tick + 1}`;
  if (!captures.has(name)) return;
  const encoded = encodeSave(createEnvelope(structuredClone(s), { sessionId: "stepcost-capture", createdAt: "2026-10-24T00:00:00.000Z", savedAt: "2026-10-24T00:00:00.000Z" }));
  if (!encoded.ok) throw new Error(`capture ${name}: ${encoded.error}`);
  capturing = { name, save: encoded.value };
  void profiler!.post("Profiler.start");
}
/** After it: its controls, the profile and the step's own phases. */
async function captureAfter(controls: readonly GameCommand[]): Promise<void> {
  if (!capturing) return;
  const name = capturing.name, save = capturing.save, ms = costs.lastMs;
  capturing = null;
  const { profile } = await profiler!.post("Profiler.stop");
  const file = path.join(captureDir, name.replace(/[^a-z0-9-]/gi, "_"));
  fs.mkdirSync(captureDir, { recursive: true });
  fs.writeFileSync(`${file}.save.json`, save);
  fs.writeFileSync(`${file}.controls.json`, JSON.stringify(controls));
  fs.writeFileSync(`${file}.cpuprofile`, JSON.stringify(profile));
  console.log(`captured ${name}: ${ms.toFixed(2)} ms → ${file}.*`);
}

/** The app's per-step work around the guard's step (`SiltwakeApp.frame`). */
class AppWork {
  private readonly rec: ReturnType<typeof timeline.createRecorder>;
  private readonly repository = new SaveRepository(new MemoryStorage(), LOCK);
  private timelineSaved: number;
  private lastAutosave: number;
  private activity = false;
  constructor(readonly run: string, s: GameState) {
    this.rec = timeline.createRecorder({ id: `stepcost-${run}`.slice(0, 64), started: "2026-10-24T00:00:00.000Z" }, { regionAt: regionAtPoint });
    this.timelineSaved = this.lastAutosave = s.tick;
    this.repository.load();
  }
  commanded(): void { this.activity = true; }
  /** Everything the app does after the guard's step, marked as the app marks it. */
  after(s: GameState, controls: readonly GameCommand[], events: readonly GameEvent[]): void {
    costs.mark(PHASE.events);
    const input = controlsActive(controls) || this.activity;
    this.activity = false;
    const waiting = [...(s.systems.decodes.length ? ["decode"] : []), ...(s.systems.planters.length ? ["growth"] : [])];
    timeline.observe(this.rec, s, { input, waiting });
    const systems = events.flatMap((e) => e.type === "systems" ? [e.event] : []);
    if (systems.length) timeline.recordSystemsEvents(this.rec, s, systems);
    costs.mark(PHASE.timeline);
    if (s.tick - this.timelineSaved >= 600) {
      this.timelineSaved = s.tick;
      sink.length = 0;
      sink.push(timeline.exportTimelineText(this.rec, s, this.rec.sealed.length));
      timelineSize.events = Math.max(timelineSize.events, this.rec.seq);
      timelineSize.chars = Math.max(timelineSize.chars, sink[0]!.length);
      timelineSize.playHours = Math.max(timelineSize.playHours, this.rec.playTicks / 216_000);
    }
    costs.mark(PHASE.timelineSave);
    if (s.tick - this.lastAutosave >= 1800) {
      this.lastAutosave = s.tick;
      // ExpeditionSession.envelope then SaveRepository.commit (its lock body runs inline here).
      void this.repository.commit(createEnvelope(structuredClone(s), { sessionId: `stepcost-${this.run}`.slice(0, 64),
        createdAt: "2026-10-24T00:00:00.000Z", savedAt: new Date(Date.parse("2026-10-24T00:00:00.000Z") + s.tick * 1000 / 60).toISOString() }));
    }
    costs.mark(PHASE.autosave);
  }
}
const LOCK: WriterLockPort = { runExclusive: async (_name, _signal, action) => action() };
/** Keeps the latest timeline export reachable, as storage would. */
const sink: string[] = [];
/** The largest play timeline any run reached (its export grows with it). */
const timelineSize = { events: 0, chars: 0, playHours: 0 };

function close(run: string, phase: string, s: GameState, world: WorldQueries): void {
  costs.close(s.tick);
  if (costs.lastMs <= SLOW_STEP_MS || slow.length >= SLOW_KEEP) return;
  const built = caveBuilds(world) - buildsAtOpen;
  const v = s.fleet.vehicles.find((x) => x.id === s.player.controlledVehicleId) ?? null, p = s.player.pose.position;
  slow.push({ ...costs.lastStep(s.tick), run, phase, mode: s.player.mode, hull: v?.hull ?? null,
    region: regionAtPoint(p.x, p.z), position: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)], ...(built ? { caveBuilds: built } : {}) });
}

await loadCampaign();
const t0 = performance.now();
const runs: { run: string; ticks: number; outcome: string }[] = [];
const saves = value("--save");
if (saves) {
  const world = gameWorld(), minutes = Number(value("--minutes") ?? 10);
  for (const kind of saves.split(",")) {
    const picked = librarySave(kind);
    console.log(picked.describe);
    const s = loadSnapshot(picked.text), guard = new StepGuard(), app = new AppWork(kind, s);
    const start = s.tick;
    for (let t = 0; t < minutes * 3600; t++) {
      // Held travel: ahead, a slow turn, a gentle dive and rise (scripts/sim-bench.mjs).
      const controls: GameCommand[] = [{ type: "look", yawDelta: 0.004, pitchDelta: t % 240 < 120 ? 0.002 : -0.002 },
        { type: "move", forward: 1, right: 0, vertical: 0, sprint: false }];
      captureBefore(kind, s);
      costs.open();
      buildsAtOpen = caveBuilds(world);
      costs.mark(PHASE.input);
      const events = guard.step(s, controls, world);
      app.after(s, controls, events);
      close(kind, "held", s, world);
      await captureAfter(controls);
    }
    runs.push({ run: kind, ticks: s.tick - start, outcome: "held" });
  }
} else {
  const ids = value("--scenario")?.split(",") ?? SCENARIOS.map((s) => s.id);
  let library: ((scenario: string, milestone: string) => { text: string; commands: number; detail: string }) | undefined;
  if (args.includes("--from-library")) {
    library = (scenario, milestone) => {
      const p = librarySave(`${scenario}@${milestone}`);
      return { text: p.text, commands: p.entry.commands, detail: p.describe };
    };
  }
  driverHooks.attach = (d: Driver) => {
    let app = new AppWork(d.run.scenario, d.state), seen = d.state;
    return {
      before() {
        // A milestone reload hands the driver a new state: the app's session starts over too.
        if (d.state !== seen) { seen = d.state; app = new AppWork(d.run.scenario, d.state); }
        captureBefore(d.run.scenario, d.state);
        costs.open();
        buildsAtOpen = caveBuilds(d.world);
        costs.mark(PHASE.input);
      },
      tick(_d, controls, events) {
        costs.skip(); // the driver's own bookkeeping
        app.after(d.state, controls, events);
        close(d.run.scenario, d.phase, d.state, d.world);
        if (capturing) pending.push(captureAfter(controls));
      },
      command() { app.commanded(); },
    };
  };
  for (const r of await playScenarios(ids, args.includes("--verbose"), library ? { fromLibrary: library } : {}))
    runs.push({ run: r.scenario, ticks: r.ticks, outcome: r.outcome });
  await Promise.all(pending);
}
await new Promise((resolve) => setTimeout(resolve, 50));
gcObserver.disconnect();
for (const s of slow) {
  const gc = gcs.filter((g) => g.at < s.at + s.ms && g.at + g.ms > s.at).reduce((n, g) => n + g.ms, 0);
  if (gc) s.gc = +gc.toFixed(2);
}
const snapshot = costs.snapshot();
for (const w of snapshot.worst) {
  const gc = gcs.filter((g) => g.at < w.at + w.ms && g.at + g.ms > w.at).reduce((n, g) => n + g.ms, 0);
  if (gc) (w as StepRecord & { gc?: number }).gc = +gc.toFixed(2);
}
const seconds = (performance.now() - t0) / 1000;
const r2 = (x: number): number => +x.toFixed(3);
console.log(`${runs.map((r) => `${r.run} ${r.outcome} ${r.ticks}`).join("; ")} in ${seconds.toFixed(0)} s`);
console.log(`largest play timeline: ${timelineSize.events} events, ${timelineSize.chars} chars exported, ${timelineSize.playHours.toFixed(2)} h of play`);
console.log(`steps ${snapshot.steps}; mean ${r2(snapshot.step.mean)} ms, p50 ${r2(snapshot.step.p50)}, p99 ${r2(snapshot.step.p99)}, ` +
  `p99.9 ${r2(snapshot.step.p999)}, max ${r2(snapshot.step.max)}; over ${SLOW_STEP_MS} ms: ${snapshot.slow}; GC over 1 ms: ${gcs.length} (max ${r2(Math.max(0, ...gcs.map((g) => g.ms)))} ms)`);
for (const [name, p] of Object.entries(snapshot.phases).sort((a, b) => b[1].max - a[1].max))
  console.log(`  ${name.padEnd(13)} mean ${(p.mean * 1000).toFixed(1).padStart(7)} µs  p99 ${(p.p99 * 1000).toFixed(0).padStart(6)} µs  max ${p.max.toFixed(2).padStart(7)} ms` +
    `  >1 ms ${String(p.over1).padStart(5)}  >4 ms ${String(p.over4).padStart(4)}` +
    (p.heap !== undefined ? `  heap ${(p.heap / 1024).toFixed(2)} KiB/step` : ""));
console.log("worst steps:");
for (const w of snapshot.worst.slice(0, 16)) {
  const top = Object.entries(w.phases).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(", ");
  const ctx = slow.find((s) => s.at === w.at);
  console.log(`  ${w.ms.toFixed(2).padStart(7)} ms tick ${w.tick} ${ctx ? `${ctx.run}/${ctx.phase} ${ctx.mode}${ctx.hull ? `/${ctx.hull}` : ""} ${ctx.region} ` : ""}` +
    `[${top}]${(w as { gc?: number }).gc ? ` gc ${(w as { gc?: number }).gc} ms` : ""}${ctx?.caveBuilds ? ` cave builds ${ctx.caveBuilds}` : ""}`);
}
const json = value("--json");
if (json) fs.writeFileSync(json, JSON.stringify({ generated: new Date().toISOString(), heap, seconds, runs, timelineSize, snapshot, slow, gcs }, null, 1) + "\n");
process.exit(runs.some((r) => r.outcome === "blocked") ? 1 : 0);
