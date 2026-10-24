/** SIM-PERF-1: what each fixed step costs in ordinary play, phase by phase,
 * and what the slow ones were doing. Every step runs as the app runs it: the
 * guard's step, then the app's own per-step work (the play timeline's
 * observation and its 600-tick journal commit (SIM-1b's `TimelineJournal`, on an
 * in-memory store), and the 1,800-tick autosave through the
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
 * `--verify` re-executes every slow step three times from its own pre-step
 * state (a checkpoint every 60 ticks and a journal, as StepGuard keeps): a step
 * that is fast again was not the game's work (a collection, the host, or a
 * first use), and one that is slow again is.
 * `--alloc` (held runs) reports allocation by function per step: V8's sampling
 * heap profiler, collected objects included, over every kind's held steps.
 * `--host` tags each slow step with the host's disturbance inside it
 * (`hostSampler.js`: each vCPU's steal, and a canary thread's late wake-ups),
 * so a step the hypervisor paused is told apart from the game's own work.
 * Timings count only from `heavy-check.sh --class exclusive`. */
import fs from "node:fs";
import inspector from "node:inspector/promises";
import path from "node:path";
import v8 from "node:v8";
import { PerformanceObserver } from "node:perf_hooks";
import { Worker } from "node:worker_threads";
import { createEnvelope, encodeSave } from "../../src/save/codec.js";
import { SaveRepository, warmCommit } from "../../src/save/repository.js";
import type { WriterLockPort } from "../../src/save/writer-lock.js";
import { PHASE, SLOW_STEP_MS, StepCosts, stepMeter } from "../../src/sim/stepCosts.js";
import type { StepRecord } from "../../src/sim/stepCosts.js";
import { StepGuard } from "../../src/sim/stepGuard.js";
import { executeCommand, stepGameInPlace } from "../../src/sim/step.js";
import { warmSimulation } from "../../src/sim/warmup.js";
import { gameWorld } from "../../src/sim/world.js";
import { regionAtPoint } from "../../src/content/regions/layout.js";
import { controlsActive } from "../../src/sim/timeline/activity.js";
import * as timeline from "../../src/sim/timeline/recorder.js";
import { TimelineJournal } from "../../src/sim/timeline/store.js";
import type { TimelineStoragePort } from "../../src/sim/timeline/store.js";
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
/** Every collection by kind (1 minor, 4 major, 8 incremental, 16 weak callbacks): count and total ms. */
const gcAll = new Map<number, { count: number; ms: number }>();
const gcObserver = new PerformanceObserver((list) => {
  for (const e of list.getEntries()) {
    const kind = ((e as { detail?: { kind?: number } }).detail)?.kind ?? 0, k = gcAll.get(kind) ?? gcAll.set(kind, { count: 0, ms: 0 }).get(kind)!;
    k.count++; k.ms += e.duration;
  }
  for (const e of list.getEntries()) if (e.duration > 1)
    gcs.push({ at: e.startTime, ms: e.duration, kind: ((e as { detail?: { kind?: number } }).detail)?.kind ?? 0 });
});
gcObserver.observe({ entryTypes: ["gc"] });

interface Slow extends StepRecord {
  /** `--verify`: the same step again from its own pre-step state, three times, ms. */
  replay?: number[];
  /** `--host`: steal jiffies (10 ms each) by vCPU inside the step, the vCPU the step ended on, and canary stalls (ms). */
  host?: { steal: Record<number, number>; cpu: number | null; canary: number[] };
  run: string; phase: string; mode: string; hull: string | null; region: string | null; position: [number, number, number]; gc?: number;
  /** Cave clusters built unsliced inside the step (CW-1's world; headless has no streamer to build them ahead). */
  caveBuilds?: number;
}
/** `--verify`: the live state's checkpoint (every 60 ticks) and everything applied since. */
class Replayer {
  private checkpoint: GameState | null = null;
  private of: GameState | null = null;
  private journal: ({ step: GameCommand[] } | { command: GameCommand })[] = [];
  /** Before a step of `s`: a new object (a load) or a full journal starts a new checkpoint. */
  before(s: GameState): void {
    if (s !== this.of || this.journal.length >= 60) { this.checkpoint = structuredClone(s); this.of = s; this.journal = []; }
  }
  stepped(controls: readonly GameCommand[]): void { this.journal.push({ step: controls.map((c) => ({ ...c })) }); }
  /** An accepted command replaced the state with `next`. */
  commanded(command: GameCommand, next: GameState): void { this.journal.push({ command: { ...command } }); this.of = next; }
  /** The last step again, `n` times, each from a fresh copy of its pre-step state; ms each. */
  replayLast(world: WorldQueries, n = 3): number[] {
    const last = this.journal.at(-1);
    if (!this.checkpoint || !last || !("step" in last)) return [];
    let s = structuredClone(this.checkpoint);
    for (const e of this.journal.slice(0, -1))
      if ("step" in e) stepGameInPlace(s, e.step, world); else s = executeCommand(s, e.command, world).state;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const copy = structuredClone(s), t = performance.now();
      stepGameInPlace(copy, last.step, world);
      out.push(+(performance.now() - t).toFixed(3));
    }
    return out;
  }
}
const replayer = args.includes("--verify") ? new Replayer() : null;

/** CW-1's unsliced cave-cluster builds so far, when the world has kit caves. */
const caveBuilds = (world: WorldQueries): number => (world as { kitCaves?: { stats: { syncBuilds: number } } }).kitCaves?.stats.syncBuilds ?? 0;
let buildsAtOpen = 0;
const slow: Slow[] = [];
const SLOW_KEEP = 2000;
const pending: Promise<void>[] = [];
const allocProfiles: unknown[] = [];

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
  /** The timeline's journal (SIM-1b), as `LiveTimeline.save` commits it every 600 ticks. */
  private readonly journal: TimelineJournal;
  private readonly timelineStore = new MemoryTimelineStorage();
  private timelineSaved: number;
  private lastAutosave: number;
  private activity = false;
  constructor(readonly run: string, s: GameState, world: WorldQueries) {
    // The app's entry warm-up (SiltwakeApp.warm), outside any measured step.
    warmSimulation(s, world);
    warmCommit(createEnvelope(structuredClone(s), { sessionId: "stepcost-warm", createdAt: "2026-10-24T00:00:00.000Z", savedAt: "2026-10-24T00:00:00.000Z" }));
    const session = `stepcost-${run}`.slice(0, 64);
    this.rec = timeline.createRecorder({ id: session, started: "2026-10-24T00:00:00.000Z" }, { regionAt: regionAtPoint });
    this.journal = new TimelineJournal(this.timelineStore, LOCK, session);
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
      void this.journal.commit(this.rec, s, NEVER);
      timelineSize.events = Math.max(timelineSize.events, this.rec.seq);
      timelineSize.chars = Math.max(timelineSize.chars, this.timelineStore.chars());
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
/** localStorage for the timeline journal, in memory. */
class MemoryTimelineStorage implements TimelineStoragePort {
  private readonly data = new Map<string, string>();
  get length(): number { return this.data.size; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
  removeItem(key: string): void { this.data.delete(key); }
  /** Everything stored, in characters. */
  chars(): number { let n = 0; for (const [k, v] of this.data) n += k.length + v.length; return n; }
}
const NEVER = new AbortController().signal;
/** The largest play timeline any run reached (its export grows with it). */
const timelineSize = { events: 0, chars: 0, playHours: 0 };

function close(run: string, phase: string, s: GameState, world: WorldQueries): void {
  costs.close(s.tick);
  if (costs.lastMs <= SLOW_STEP_MS || slow.length >= SLOW_KEEP) return;
  const built = caveBuilds(world) - buildsAtOpen;
  const v = s.fleet.vehicles.find((x) => x.id === s.player.controlledVehicleId) ?? null, p = s.player.pose.position;
  slow.push({ ...costs.lastStep(s.tick), ...(hostSampler ? { host: { steal: {}, cpu: threadCpu(), canary: [] } } : {}), run, phase, mode: s.player.mode, hull: v?.hull ?? null,
    region: regionAtPoint(p.x, p.z), position: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)], ...(built ? { caveBuilds: built } : {}),
    ...(replayer ? { replay: replayer.replayLast(world) } : {}) });
}

/** `--host`: the disturbance sampler, and the vCPU this thread is on (/proc/thread-self/stat's 39th field). */
const hostSampler = args.includes("--host") ? new Worker(new URL("./hostSampler.js", import.meta.url)) : null;
const threadCpu = (): number | null => {
  try { const t = fs.readFileSync("/proc/thread-self/stat", "utf8"); return Number(t.slice(t.lastIndexOf(")") + 2).split(" ")[36]); } catch { return null; }
};

await loadCampaign();
const t0 = performance.now();
const runs: { run: string; ticks: number; outcome: string }[] = [];
const saves = value("--save");
/** `--alloc`: the heap profiler's session over the held steps, and the steps it saw. */
const alloc = args.includes("--alloc") ? new inspector.Session() : null;
let allocSteps = 0;
if (alloc) { alloc.connect(); await alloc.post("HeapProfiler.enable"); }
if (saves) {
  const world = gameWorld(), minutes = Number(value("--minutes") ?? 10);
  for (const kind of saves.split(",")) {
    const picked = librarySave(kind);
    console.log(picked.describe);
    const s = loadSnapshot(picked.text), guard = new StepGuard(), app = new AppWork(kind, s, world);
    const start = s.tick;
    // Warm (60 steps), so first-use compilation isn't counted as allocation.
    if (alloc) for (let t = 0; t < 60; t++) guard.step(s, [{ type: "move", forward: 1, right: 0, vertical: 0, sprint: false }], world);
    if (alloc) await alloc.post("HeapProfiler.startSampling", { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    for (let t = 0; t < minutes * 3600; t++) {
      // Held travel: ahead, a slow turn, a gentle dive and rise (scripts/sim-bench.mjs).
      const controls: GameCommand[] = [{ type: "look", yawDelta: 0.004, pitchDelta: t % 240 < 120 ? 0.002 : -0.002 },
        { type: "move", forward: 1, right: 0, vertical: 0, sprint: false }];
      captureBefore(kind, s);
      replayer?.before(s);
      costs.open();
      buildsAtOpen = caveBuilds(world);
      costs.mark(PHASE.input);
      const events = guard.step(s, controls, world);
      replayer?.stepped(controls);
      app.after(s, controls, events);
      close(kind, "held", s, world);
      await captureAfter(controls);
    }
    runs.push({ run: kind, ticks: s.tick - start, outcome: "held" });
    if (alloc) { allocSteps += minutes * 3600; allocProfiles.push((await alloc.post("HeapProfiler.stopSampling")).profile); }
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
    let app = new AppWork(d.run.scenario, d.state, d.world), seen = d.state;
    return {
      before() {
        // A milestone reload hands the driver a new state: the app's session starts over too.
        // (A command's new state is the same session: `command` below follows it.)
        if (d.state !== seen) { seen = d.state; app = new AppWork(d.run.scenario, d.state, d.world); }
        captureBefore(d.run.scenario, d.state);
        replayer?.before(d.state);
        costs.open();
        buildsAtOpen = caveBuilds(d.world);
        costs.mark(PHASE.input);
      },
      tick(_d, controls, events) {
        costs.skip(); // the driver's own bookkeeping
        replayer?.stepped(controls);
        app.after(d.state, controls, events);
        close(d.run.scenario, d.phase, d.state, d.world);
        if (capturing) pending.push(captureAfter(controls));
      },
      command(_d, command, result) { seen = result.state; replayer?.commanded(command, result.state); app.commanded(); },
    };
  };
  for (const r of await playScenarios(ids, args.includes("--verbose"), library ? { fromLibrary: library } : {}))
    runs.push({ run: r.scenario, ticks: r.ticks, outcome: r.outcome });
  await Promise.all(pending);
}
await new Promise((resolve) => setTimeout(resolve, 50));
gcObserver.disconnect();
if (hostSampler) {
  // Steal is accounted when the vCPU next ticks after the pause: the window reaches past the step.
  const data = await new Promise<{ steal: { at: number; cpu: number; jiffies: number }[]; late: { at: number; ms: number }[] }>((resolve) => {
    hostSampler.once("message", resolve); hostSampler.postMessage("stop");
  });
  await hostSampler.terminate();
  for (const s of slow) {
    const from = performance.timeOrigin + s.at, to = from + s.ms;
    for (const x of data.steal) if (x.at >= from - 20 && x.at <= to + 30) s.host!.steal[x.cpu] = (s.host!.steal[x.cpu] ?? 0) + x.jiffies;
    s.host!.canary = data.late.filter((l) => l.at < to && l.at + l.ms > from).map((l) => +l.ms.toFixed(1));
  }
  const total = data.steal.reduce((n, x) => n + x.jiffies, 0);
  console.log(`host: ${total} steal jiffies over the run (${(total * 10 / 1000).toFixed(1)} s across vCPUs), ${data.late.length} canary stalls over ${4 + 2} ms`);
}
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
console.log(`largest play timeline: ${timelineSize.events} events, ${timelineSize.chars} chars stored, ${timelineSize.playHours.toFixed(2)} h of play`);
console.log(`collections: ${[...gcAll].sort((a, b) => a[0] - b[0]).map(([k, v]) => `kind ${k} ${v.count} (${v.ms.toFixed(0)} ms)`).join(", ")}; ` +
  `heap at the end ${(v8.getHeapStatistics().used_heap_size / 1048576).toFixed(0)} MiB`);
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
    `[${top}]${(w as { gc?: number }).gc ? ` gc ${(w as { gc?: number }).gc} ms` : ""}${ctx?.caveBuilds ? ` cave builds ${ctx.caveBuilds}` : ""}` +
    (ctx?.replay?.length ? ` replay ${ctx.replay.join("/")} ms` : "") +
    (ctx?.host ? ` host: steal ${JSON.stringify(ctx.host.steal)} on cpu ${ctx.host.cpu}, canary ${JSON.stringify(ctx.host.canary)}` : ""));
}
if (alloc) {
  // Self bytes by function over every kind's held steps (each run's app work included).
  type Node = { callFrame: { functionName: string; url: string; lineNumber: number }; selfSize: number; children: Node[] };
  const self = new Map<string, number>(), callers = new Map<string, Map<string, number>>(); let total = 0;
  const label = (n: Node): string => `${n.callFrame.functionName || "(anon)"} ${path.basename(n.callFrame.url)}:${n.callFrame.lineNumber + 1}`;
  const walk = (n: Node, parent: string): void => {
    const name = label(n);
    total += n.selfSize;
    if (n.selfSize) {
      self.set(name, (self.get(name) ?? 0) + n.selfSize);
      const by = callers.get(name) ?? callers.set(name, new Map()).get(name)!;
      by.set(parent, (by.get(parent) ?? 0) + n.selfSize);
    }
    for (const c of n.children) walk(c, name);
  };
  for (const p of allocProfiles) walk((p as unknown as { head: Node }).head, "");
  console.log(`allocation: ${(total / allocSteps / 1024).toFixed(1)} KiB per step over ${allocSteps} held steps; by function:`);
  for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    const top = [...callers.get(k)!].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, b]) => `${c} ${(b / allocSteps / 1024).toFixed(2)}`).join("; ");
    console.log(`  ${(v / allocSteps / 1024).toFixed(2).padStart(6)} KiB  ${k}  ← ${top}`);
  }
}
const json = value("--json");
if (json) fs.writeFileSync(json, JSON.stringify({ generated: new Date().toISOString(), heap, seconds, runs, timelineSize, gcAll: Object.fromEntries(gcAll), snapshot, slow, gcs }, null, 1) + "\n");
process.exit(runs.some((r) => r.outcome === "blocked") ? 1 : 0);
