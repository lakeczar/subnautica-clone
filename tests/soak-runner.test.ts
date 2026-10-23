import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// The soak loop (scripts/soak/soak.mjs) end to end against a fake game: the
// real loop, real probe aggregation and real goals, with the browser and the
// measurements replaced. Covers the SCHED-2a R1 findings F2 (one game
// lifetime), F3 (failed providers are unavailable, never passes), F6 (dwell
// places) and F7 (the leak window gates a dwell pass).
const S = await import(pathToFileURL(resolve("scripts/soak/soak.mjs")).href);
const G = await import(pathToFileURL(resolve("scripts/soak/goals.mjs")).href);
const P = await import(pathToFileURL(resolve("scripts/soak/probe.mjs")).href);

type World = { heap: number; meshes: number; cam: number[]; calls: number; gotos: number[][]; leak: number; leakMeshes: number; holdOnce: number; heapMetric: boolean };
/** One valid per-frame record, as CW-1's __siltwakePerf keeps it. */
const rec = (total: number, over: Record<string, unknown> = {}) => ({ total, parts: { chunks: 0, caves: 0, regions: 0, lights: 0 }, hold: false, ...over });
type Provider = { name: string; sample: () => Promise<Record<string, unknown>> };
class Blocked extends Error {}

function fake(over: Partial<World> = {}, { failing = [] as string[], attributed = true } = {}) {
  const w: World = { heap: 100, meshes: 900, cam: [0, 0, 0], calls: 0, gotos: [], leak: 0, leakMeshes: 0, holdOnce: 0, heapMetric: true, ...over };
  const provider = (name: string, fn: () => Record<string, unknown>): Provider => ({ name, sample: async () => { if (failing.includes(name)) throw new Error(`${name} broke`); return fn(); } });
  const deps = {
    Blocked, createProbe: P.createProbe, collectGarbage: async () => {},
    // The fake page has no excluded windows to tag (its gaps are the game's).
    exclude: async (_g: unknown, _on: boolean): Promise<boolean> => true,
    openGame: async () => ({ page: {}, cdp: {}, errors: [], crash: null, renderer: "fake", close: async () => {} }),
    goto: async (_g: unknown, p: { x: number; y: number; z: number }) => {
      w.gotos.push([p.x, p.y, p.z]); w.cam = [p.x, p.y, p.z];
      w.heap += w.leak; w.meshes += w.leakMeshes; // what a traversal leaks stays in this one page
      await new Promise((r) => setTimeout(r, 2));
      return true;
    },
    read: async () => ({ cam: w.cam, tick: 1000 }),
    releaseAll: async () => {},
    saveAndCheck: async (_g: unknown, _o: unknown, file: string, label: string) => ({ ok: true, label, file }),
    providers: () => ({
      full: [provider("memory", () => ({ memory: { rendererRssMiB: w.heap, gpuRssMiB: 400, jsHeapAfterGcMiB: w.heap }, graphics: { meshes: w.meshes, materials: 80, textures: 60, geometries: 700 } }))],
      tick: [
        // Raw observations, as the real provider reports them (measure.mjs derives the rest).
        provider("frames", () => ({ frames: { overMs: 33, gaps: Array(10).fill(16), records: attributed ? Array.from({ length: 10 }, (_, i) => rec(16, { hold: i === 0 && w.holdOnce-- > 0 })) : null } })),
        provider("ocean-dataset", () => ({ holds: { available: true, held: false } })),
        provider("save-journal", () => { w.calls++; return { lastSave: { savedAt: String(Math.floor(w.calls / 3)), tick: w.calls } }; }),
      ],
    }),
    env: {},
  };
  return { w, deps };
}
const plan = { points: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 0, z: 10 }] };
const dir = mkdtempSync(join(tmpdir(), "soak-runner-"));
test.after(() => rmSync(dir, { recursive: true, force: true }));
let n = 0;
const opts = (kind: string, extra: Record<string, unknown> = {}) => ({
  kind, out: join(dir, `${n++}`), plan, sampleS: 0.04, tickMs: 10, settleMs: 0, gcSettleMs: 0, gcEveryS: 0.05, judged: true, browser: {}, meta: {},
  thresholds: { tour: { ...G.DEFAULTS.tour }, dwell: { ...G.DEFAULTS.dwell, autosaves: 4, warmupS: 0.05, leakMinWindowS: 0.4, autosaveMissingS: 30 } },
  ...extra,
});

test("tour: all laps run in one game lifetime, so a per-visit leak shows at lap 2 and stops the soak (R1-F2)", async () => {
  const { w, deps } = fake({ leak: 10 });
  const r = await S.runSoak(opts("tour"), deps);
  assert.equal(r.verdict.status, "fail");
  assert.match(r.verdict.reason, /memory-growth:rendererRssMiB: lap 1 140 MiB → lap 2 180 MiB/);
  assert.equal(r.run.laps.length, 2, "stopped at the lap that broke the rule");
  assert.equal(w.heap, 180, "nothing reset the measured page");
  assert.equal(r.run.saves.length, 1, "lap 1's save was checked separately; lap 2 stopped at its own sample, before its save");
});

test("tour: flat memory, fully measured on an isolated run, passes; on a shared run it is only partial", async () => {
  const pass = await S.runSoak(opts("tour"), fake().deps);
  assert.equal(pass.verdict.status, "pass", JSON.stringify(pass.verdict.rules));
  assert.equal(S.EXIT.pass, 0);
  const o = opts("tour", { judged: false });
  const shared = await S.runSoak(o, fake().deps);
  assert.equal(shared.verdict.status, "partial");
  assert.deepEqual(shared.verdict.unproven, ["streaming-frame"]);
  assert.equal(S.EXIT.partial, 5);
  const md = readFileSync(join(o.out, "report.md"), "utf8");
  assert.match(md, /^# tour soak: PARTIAL/);
});

test("tour: failed frame and hold providers are unavailable and reported, never passes (R1-F3)", async () => {
  const r = await S.runSoak(opts("tour"), fake({}, { failing: ["frames", "ocean-dataset"] }).deps);
  assert.equal(r.verdict.status, "partial", JSON.stringify(r.verdict.rules));
  const rule = (id: string) => r.verdict.rules.find((x: { id: string }) => x.id === id);
  assert.equal(rule("streaming-frame").status, "unavailable");
  assert.match(rule("streaming-frame").detail, /no frames were measured/);
  assert.equal(rule("loading-hold").status, "unavailable");
  assert.match(rule("providers").detail, /frames: frames broke.*ocean-dataset: ocean-dataset broke/);
  // A build without per-frame attribution: unavailable too, with the reason.
  const u = await S.runSoak(opts("tour"), fake({}, { attributed: false }).deps);
  assert.match(u.verdict.rules.find((x: { id: string }) => x.id === "streaming-frame").detail, /no streaming attribution \(this build keeps no per-frame record\)/);
});

test("dwell: named places, coordinates and the unplaced large cave reach their outcomes (R1-F6)", async () => {
  const a = fake();
  await S.runSoak(opts("dwell", { at: "dish-field" }), a.deps);
  assert.deepEqual(a.w.gotos[0], [508, -40, -572]);
  const b = fake();
  await S.runSoak(opts("dwell", { at: "12,-3,40" }), b.deps);
  assert.deepEqual(b.w.gotos[0], [12, -3, 40]);
  const c = await S.runSoak(opts("dwell", { at: "large-cave" }), fake().deps);
  assert.equal(c.verdict.status, "incomplete");
  assert.match(c.verdict.reason, /large-cave is not placed in the game yet/);
  const d = await S.runSoak(opts("dwell", { at: "nowhere" }), fake().deps);
  assert.match(d.verdict.reason, /a place \(crown-station, dish-field, large-cave\) or X,Y,Z/);
});

test("dwell: the goal needs the leak window, so a slow leak is judged before any pass; day–night stays unproven (R1-F7)", async () => {
  const leaking = fake();
  const timer = setInterval(() => { leaking.w.heap += 0.05; }, 10); // grows steadily while it dwells
  const r = await S.runSoak(opts("dwell"), leaking.deps);
  clearInterval(timer);
  assert.equal(r.verdict.status, "fail", JSON.stringify(r.verdict.rules));
  assert.ok(r.verdict.broken.some((id: string) => id.startsWith("leak:")), r.verdict.reason);
  const flat = await S.runSoak(opts("dwell"), fake().deps);
  assert.equal(flat.verdict.status, "partial", JSON.stringify(flat.verdict.rules));
  assert.deepEqual(flat.verdict.unproven, ["day-night"]);
  assert.ok(flat.run.autosaves.length >= 4);
  const span = flat.run.samples.at(-1).at - flat.facts.find((f: { t: string }) => f.t === "start").at;
  assert.ok(span >= 0.4, `observed ${span} s of the 0.4 s leak window`);
  // Stopped short of the window: the leak rule is listed as unmeasured, not passed.
  const short = G.evaluateDwell({ samples: [{ at: 0, memory: { rendererRssMiB: 1 } }, { at: 1, memory: { rendererRssMiB: 1 } }, { at: 2, memory: { rendererRssMiB: 1 } }],
    autosaves: [], frames: { judged: true }, now: 2 }, { ...G.DEFAULTS.dwell, warmupS: 0 });
  assert.match(short.unavailable.join("\n"), /leak:rendererRssMiB: settled samples of rendererRssMiB span 0 s of the 600 s the trend needs/);
});

// SCHED-2a R2 ---------------------------------------------------------------

test("R2-F1: a CDP heap metric that is missing is unavailable through the real provider, so the tour is partial, never pass", async () => {
  const { deps } = fake();
  const base = deps.providers;
  const cdp = { send: async (m: string) => (m === "Performance.getMetrics" ? { metrics: [] } : {}) };
  deps.providers = () => {
    const ps = base();
    const mem = ps.full[0]!;
    return { ...ps, full: [{ name: "memory", sample: async () => { const s = await mem.sample() as { memory: Record<string, number> }; delete s.memory.jsHeapAfterGcMiB; return s; } }, P.cdpHeap(cdp)] };
  };
  const r = await S.runSoak(opts("tour"), deps);
  assert.equal(r.verdict.status, "partial", JSON.stringify(r.verdict.rules));
  const heap = r.verdict.rules.find((x: { id: string }) => x.id === "memory-growth:jsHeapAfterGcMiB");
  assert.equal(heap.status, "unavailable");
  assert.match(JSON.stringify(r.run.providerErrors), /cdp-heap/);
  // And defensively in the goals: a NaN that got through is no measurement.
  const lapN = (n: number, heap: number) => ({ lap: n, memory: { rendererRssMiB: 100, gpuRssMiB: 100, jsHeapAfterGcMiB: heap }, graphics: { meshes: 1, materials: 1, textures: 1, geometries: 1 } });
  const v = G.evaluateTour({ laps: [lapN(1, NaN), lapN(2, NaN)], frames: { judged: true, attributed: true, observed: 9, streamingOver: [] }, holds: { covered: true, list: [] } }, G.DEFAULTS.tour);
  assert.equal(v.rules.find((x: { id: string }) => x.id === "memory-growth:jsHeapAfterGcMiB").status, "unavailable");
});

test("R2-F2: a hold the per-frame record saw between two state polls fails the tour (the real frames provider)", async () => {
  const { w, deps } = fake();
  const base = deps.providers;
  const g = globalThis as unknown as { window: Record<string, unknown> };
  const page = { evaluate: async (fn: (a: unknown) => unknown, arg: unknown) => {
    // One recorded hold frame, entirely between polls: the current state is clear.
    g.window = { __soakGaps: [16, 16, 16], __siltwakePerf: [{ total: 16, parts: {}, hold: w.holdOnce-- > 0 }, { total: 16, parts: {} }] };
    return fn(arg);
  } };
  w.holdOnce = 1;
  deps.providers = () => { const ps = base(); return { ...ps, tick: [P.frames(page), ...ps.tick.slice(1)] }; };
  const r = await S.runSoak(opts("tour"), deps);
  assert.equal(r.verdict.status, "fail", JSON.stringify(r.verdict.rules));
  assert.match(r.verdict.reason, /loading-hold: hold at .* \(1 frames recorded\)/);
  // No hold recorded: pass; without a per-frame record, the rule is unproven.
  const clear = await S.runSoak(opts("tour"), fake().deps);
  assert.equal(clear.verdict.rules.find((x: { id: string }) => x.id === "loading-hold").status, "pass");
  const polled = await S.runSoak(opts("tour"), fake({}, { attributed: false }).deps);
  assert.equal(polled.verdict.rules.find((x: { id: string }) => x.id === "loading-hold").status, "unavailable");
});

test("R2-F3: an autosave with no frame time, then a measured 70 ms autosave hitch: the dwell fails and stops", async () => {
  const { deps } = fake();
  const base = deps.providers;
  let k = 0;
  deps.providers = () => {
    const ps = base();
    return { ...ps, tick: [
      { name: "frames", sample: async () => { k++; return { frames: k < 6 ? { overMs: 33, gaps: [], records: [] } : { overMs: 33, gaps: [16, 70], records: [rec(16), rec(70)] } }; } },
      { name: "save-journal", sample: async () => ({ lastSave: { savedAt: String(Math.floor(k / 3)), tick: k } }) },
      ps.tick[1]!,
    ] };
  };
  const r = await S.runSoak(opts("dwell"), deps);
  assert.equal(r.verdict.status, "fail", JSON.stringify(r.verdict.rules));
  assert.match(r.verdict.reason, /autosave-hitch: 1 autosave frames over 33 ms, worst 70 ms/);
  assert.equal(r.run.autosaves[0].frameMs, null, "the first autosave had no frame time");
  // The same on a streaming rule: a measured violation stands after attribution is lost.
  const v = G.evaluateTour({ laps: [], frames: { judged: true, attributed: false, observed: 0, streamingOver: [{ ms: 48, where: "seam" }] }, holds: { covered: true, list: [] } }, G.DEFAULTS.tour);
  assert.equal(v.status, "fail");
});

// SCHED-2a R3: the reviewer's reproductions, through the real loop and contract -------

/** The fake game with its memory and graphics read through a function of the lap. */
function lapped(at: (lap: number) => { rss?: unknown; meshes?: unknown }) {
  const f = fake();
  let lap = 1;
  const goto0 = f.deps.goto;
  f.deps.goto = async (g: unknown, p: { x: number; y: number; z: number }, o?: { label?: string }) => { if (o?.label === "lap start") lap++; return goto0(g, p); };
  const base = f.deps.providers;
  f.deps.providers = () => {
    const ps = base();
    return { ...ps, full: [{ name: "memory", sample: async () => {
      const v = at(lap - 1);
      return { memory: { rendererRssMiB: v.rss ?? 400, gpuRssMiB: 230, jsHeapAfterGcMiB: 90 }, graphics: { meshes: v.meshes ?? 900, materials: 80, textures: 60, geometries: 700 } };
    } }] };
  };
  return f;
}
const ruleOf = (v: { rules: { id: string; status: string; detail?: string }[] }, id: string) => v.rules.find((x) => x.id === id)!;

test("R3-F1: a final RSS of 0 or −1, or a −1 mesh count, is no measurement: the tour is partial, never a pass", async () => {
  for (const [what, at] of [["rss 0", (l: number) => (l >= 3 ? { rss: 0 } : {})], ["rss −1", (l: number) => (l >= 3 ? { rss: -1 } : {})], ["meshes −1", (l: number) => (l >= 3 ? { meshes: -1 } : {})]] as const) {
    const r = await S.runSoak(opts("tour"), lapped(at).deps);
    assert.equal(r.verdict.status, "partial", `${what}: ${JSON.stringify(r.verdict.rules)}`);
    assert.match(JSON.stringify(r.run.providerErrors), /(memory\.rendererRssMiB|graphics\.meshes) \S+ is outside (memoryMiB|count)/, what);
  }
  // A valid zero count growing is still growth, and fails.
  const grow = await S.runSoak(opts("tour"), lapped((l) => ({ meshes: l >= 2 ? 5 : 0 })).deps);
  assert.equal(grow.verdict.status, "fail");
  assert.equal(grow.verdict.broken[0], "graphics-growth:meshes");
});

test("R3-F1: garbled per-frame records (total NaN, ±Infinity, −1, 0, absent) and a missing split make the tour partial (the real frames provider)", async () => {
  const g = globalThis as unknown as { window: Record<string, unknown> };
  const run = async (record: Record<string, unknown>, gaps = [16, 16]) => {
    const f = fake();
    const page = { evaluate: async (fn: () => unknown) => { g.window = { __soakGaps: [...gaps], __siltwakePerf: [{ ...record }] }; return fn(); } };
    const base = f.deps.providers;
    f.deps.providers = () => { const ps = base(); return { ...ps, tick: [P.frames(page), ...ps.tick.slice(1)] }; };
    return S.runSoak(opts("tour"), f.deps);
  };
  for (const total of [NaN, Infinity, -Infinity, -1, 0, undefined]) {
    const r = await run({ total, parts: { chunks: NaN, caves: NaN, regions: 0, lights: 0 }, hold: false });
    assert.equal(r.verdict.status, "partial", `total ${total}: ${JSON.stringify(r.verdict.rules)}`);
    assert.equal(ruleOf(r.verdict, "streaming-frame").status, "unavailable");
  }
  const missing = await run({ total: 70, hold: false }, [70]);
  assert.equal(missing.verdict.status, "partial", JSON.stringify(missing.verdict.rules));
  assert.match(ruleOf(missing.verdict, "streaming-frame").detail ?? "", /lack a valid total or split/);
});

test("R3-F2: gaps [70, NaN] around each autosave with a valid 70 ms record: the judged dwell fails and stops on the known hitch", async () => {
  const g = globalThis as unknown as { window: Record<string, unknown> };
  const f = fake();
  const page = { evaluate: async (fn: () => unknown) => { g.window = { __soakGaps: [70, NaN], __siltwakePerf: [rec(70)] }; return fn(); } };
  const base = f.deps.providers;
  f.deps.providers = () => { const ps = base(); return { ...ps, tick: [P.frames(page), ...ps.tick.slice(1)] }; };
  const r = await S.runSoak(opts("dwell"), f.deps);
  assert.equal(r.verdict.status, "fail", JSON.stringify(r.verdict.rules));
  assert.match(r.verdict.reason, /autosave-hitch: 1 autosave frames over 33 ms, worst 70 ms/);
  assert.equal(r.run.autosaves.length, 1, "it stopped at the first hitch");
  assert.equal(r.run.autosaves[0].complete, false, "and knew that interval was incomplete");
});

test("R3-F3: elapsed time is monotonic: a 300 s wall-clock step changes neither the leak window nor the verdict", async () => {
  // Simulated seconds 200× faster than real time, from the injected monotonic clock.
  const run = async (stepWallClock: boolean) => {
    const f = fake();
    const t0 = performance.now(), sim = () => ((performance.now() - t0) / 1000) * 200;
    const base = f.deps.providers;
    f.deps.providers = () => {
      const ps = base();
      return { ...ps, full: [{ name: "memory", sample: async () => ({ memory: { rendererRssMiB: 400 + (40 / 3600) * sim(), gpuRssMiB: 230, jsHeapAfterGcMiB: 90 }, graphics: { meshes: 900, materials: 80, textures: 60, geometries: 700 } }) }] };
    };
    (f.deps as Record<string, unknown>).clock = sim;
    const realNow = Date.now;
    if (stepWallClock) Date.now = () => realNow() + (sim() > 300 ? 300000 : 0);
    try {
      return await S.runSoak({ ...opts("dwell"), sampleS: 0.04, tickMs: 10, gcEveryS: 60, thresholds: { tour: G.DEFAULTS.tour, dwell: { ...G.DEFAULTS.dwell, autosaveMissingS: 1e9 } } }, f.deps);
    } finally { Date.now = realNow; }
  };
  for (const step of [false, true]) {
    const r = await run(step);
    assert.equal(r.verdict.status, "fail", `${step ? "stepped" : "steady"}: ${JSON.stringify(r.verdict.rules)}`);
    const leak = ruleOf(r.verdict, "leak:rendererRssMiB") as unknown as { value: number };
    assert.ok(leak.value > 35 && leak.value < 45, `${step ? "stepped" : "steady"} trend ${leak.value} MiB/h`);
  }
  // And the evaluator refuses time evidence that is not monotonic seconds.
  const xs = (ts: number[]) => ts.map((at, i) => ({ at, afterGc: true, memory: { rendererRssMiB: 400 + i, gpuRssMiB: 230, jsHeapAfterGcMiB: 90 } }));
  for (const ts of [[60, 3960, 3900, 4260], [60, Infinity, 700]]) {
    const v = G.evaluateDwell({ samples: xs(ts), autosaves: [], frames: { judged: true }, dayNight: { available: true, cycles: 1 }, now: 5000 }, { ...G.DEFAULTS.dwell, autosaves: 0, autosaveMissingS: 1e9 });
    assert.notEqual(v.status, "pass", JSON.stringify(ts));
    assert.equal(ruleOf(v, "memory-flat:rendererRssMiB").status, "unavailable");
  }
});

// SCHED-2a R4 -----------------------------------------------------------------

/** A page whose evaluate() runs the callback here, against `g.window`. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const gw = globalThis as unknown as { window: Record<string, unknown>; requestAnimationFrame?: (cb: (t: number) => void) => unknown };
const nodePage = () => ({ evaluate: async (fn: (a?: unknown) => unknown, arg?: unknown) => fn(arg) });

test("R4-F1: CW-1's real per-frame hold states through the real frames provider: clear passes, a loading frame fails, a missing or null field is unproven", async () => {
  const run = async (hold: (i: number) => unknown, pollState = "clear") => {
    const f = fake();
    let i = 0;
    const page = { evaluate: async (fn: () => unknown) => {
      gw.window = { __soakGaps: [16, 16], __siltwakePerf: [0, 1].map(() => ({ at: i, total: 16, sim: 2, steps: 1, save: 0, present: 10, hud: 1, parts: { chunks: 0, caves: 0, regions: 0, lights: 0, render: 9 }, ...(hold(i) === "OMIT" ? {} : { hold: hold(i) }) })) };
      i++;
      return fn();
    } };
    const base = f.deps.providers;
    f.deps.providers = () => {
      const ps = base();
      // ps.tick: [frames, ocean-dataset, save-journal]; the frames and the poll are replaced.
      return { ...ps, tick: [P.frames(page), ps.tick[2]!, { name: "ocean-dataset", sample: async () => ({ holds: { state: pollState } }) }] };
    };
    return S.runSoak(opts("tour"), f.deps);
  };
  const clear = await run(() => "clear");
  assert.equal(clear.verdict.status, "pass", JSON.stringify(clear.verdict.rules));
  const loading = await run((i) => (i === 1 ? "loading" : "clear"));
  assert.equal(loading.verdict.status, "fail");
  assert.match(loading.verdict.reason, /loading-hold/);
  for (const absent of ["OMIT", null]) {
    const r = await run(() => absent);
    assert.equal(r.verdict.status, "partial", `${absent}: ${JSON.stringify(r.verdict.rules)}`);
    assert.equal(r.verdict.rules.find((x: { id: string }) => x.id === "loading-hold").status, "unavailable");
  }
});

test("R4-F2: a hold the #ocean poll sees only inside a save check fails and stops, with no per-frame record at all", async () => {
  const f = fake({}, { attributed: false });
  let inCheck = false;
  const check0 = f.deps.saveAndCheck;
  f.deps.saveAndCheck = async (...a: Parameters<typeof check0>) => { inCheck = true; await sleep(60); try { return await check0(...a); } finally { inCheck = false; } };
  const base = f.deps.providers;
  const page = { evaluate: async () => ({ caveHold: inCheck ? "loading" : "clear" }) };
  f.deps.providers = () => { const ps = base(); return { ...ps, tick: [ps.tick[0]!, ps.tick[2]!, P.oceanDataset(page)] }; };
  const r = await S.runSoak(opts("tour"), f.deps);
  assert.equal(r.verdict.status, "fail", JSON.stringify(r.verdict.rules));
  assert.match(r.verdict.reason, /loading-hold: hold at/);
  assert.equal(r.run.laps.length, 1, "it stopped at the first lap's save check");
});

test("R4-F3: the real recorder tags gaps by interval: a GC pause before, during and after a save tick is never an autosave hitch; a real game pause is", async () => {
  const busy = (ms: number) => { const t = performance.now(); while (performance.now() - t < ms) { /* a real stall of the event loop */ } };
  const saved = { window: gw.window };
  // An rAF shim for the real recorder; `live` ends a run's frame loop, and the
  // shim stays installed so a frame already scheduled ends quietly.
  let live = 0;
  const run = async (gamePauseAt: number | null) => {
    gw.window = {};
    const mine = ++live;
    gw.requestAnimationFrame = (cb) => setTimeout(() => { if (live === mine) cb(performance.now()); }, 8);
    P.frameRecorderScript.call(null);
    const f = fake();
    let saves = 0, gcRan = false, ticks = 0;
    f.deps.collectGarbage = async () => { busy(120); gcRan = true; };
    f.deps.exclude = async (_g: unknown, on: boolean): Promise<boolean> => P.excludeTiming({ page: nodePage() } as never, on);
    const base = f.deps.providers;
    f.deps.providers = () => {
      const ps = base();
      return { ...ps, tick: [
        // The game pauses right after this tick's drain, so its long gap lands in the next interval.
        { name: "frames", sample: async () => { ticks++; const r = await P.frames(nodePage() as never).sample(); if (ticks === gamePauseAt) busy(150); return r; } },
        // A save is seen on the first poll after each GC (the reviewer's ordering), and in the paused run on the tick after the pause.
        { name: "save-journal", sample: async () => { if (gcRan || (gamePauseAt != null && ticks === gamePauseAt + 1)) { gcRan = false; saves++; } return { lastSave: { savedAt: String(saves), tick: saves } }; } },
        ps.tick[1]!, // ocean-dataset
      ] };
    };
    try {
      return await S.runSoak({ ...opts("dwell"), gcEveryS: 0.15, thresholds: { tour: G.DEFAULTS.tour, dwell: { ...G.DEFAULTS.dwell, autosaves: 6, warmupS: 0.05, leakMinWindowS: 0.4, autosaveMissingS: 30, autosaveHitchMs: 100 } } }, f.deps);
    } finally { live++; }
  };
  try {
    const healthy = await run(null);
    const hitch = healthy.verdict.rules.find((x: { id: string }) => x.id === "autosave-hitch");
    assert.notEqual(hitch.status, "fail", `the harness's GC was blamed on autosaving: ${JSON.stringify(healthy.run.autosaves)}`);
    assert.ok(healthy.run.autosaves.length >= 4);
    assert.ok(healthy.run.autosaves.every((a: { frameMs: number | null }) => a.frameMs == null || a.frameMs < 100), JSON.stringify(healthy.run.autosaves));
    // A real game pause outside any window, in the interval of a save: it fails and stops.
    const paused = await run(6);
    assert.equal(paused.verdict.status, "fail", JSON.stringify(paused.run.autosaves));
    assert.match(paused.verdict.reason ?? "", /autosave-hitch|over 100 ms/);
  } finally { live++; gw.window = saved.window; }
});

// SCHED-2a R5 -----------------------------------------------------------------

test("R5-F1: the closing interval is drained before the verdict: a tail hold or streaming frame fails, an unknown tail hold is unproven, a clear tail passes", async () => {
  const cw1 = (over: Record<string, unknown>) => ({ at: 1, total: 16, sim: 2, steps: 1, save: 0, present: 10, hud: 1, parts: { chunks: 0, caves: 0, regions: 0, lights: 0, render: 9 }, hold: "clear", ...over });
  const run = async (tail: Record<string, unknown>) => {
    gw.window = { __soakGaps: [], __siltwakePerf: [] };
    const f = fake();
    const check0 = f.deps.saveAndCheck;
    let checks = 0;
    // Just before the last save check returns, the page records one more frame.
    f.deps.saveAndCheck = async (...a: Parameters<typeof check0>) => {
      const res = await check0(...a);
      if (++checks === 3) { (gw.window.__soakGaps as unknown[]).push({ ms: Number(tail.total ?? 16), excluded: true }); (gw.window.__siltwakePerf as unknown[]).push(cw1(tail)); }
      return res;
    };
    const base = f.deps.providers;
    f.deps.providers = () => { const ps = base(); return { ...ps, tick: [P.frames(nodePage() as never), ps.tick[1]!, ps.tick[2]!] }; };
    // No periodic tick runs: only the closing drain can see the tail.
    return S.runSoak({ ...opts("tour"), tickMs: 1e7, sampleS: 1e5 }, f.deps);
  };
  const hold = await run({ hold: "loading" });
  assert.equal(hold.verdict.status, "fail", JSON.stringify(hold.verdict.rules));
  assert.match(hold.verdict.reason, /loading-hold/);
  const streaming = await run({ total: 70, parts: { chunks: 0, caves: 70, regions: 0, lights: 0, render: 0 } });
  assert.equal(streaming.verdict.status, "fail", JSON.stringify(streaming.verdict.rules));
  assert.match(streaming.verdict.reason, /streaming-frame/);
  const unknown = await run({ hold: null });
  assert.notEqual(unknown.verdict.status, "pass", JSON.stringify(unknown.verdict.rules));
  assert.equal(unknown.verdict.rules.find((x: { id: string }) => x.id === "loading-hold").status, "unavailable");
  const clear = await run({});
  assert.equal(clear.verdict.rules.find((x: { id: string }) => x.id === "loading-hold").status, "pass", "the closing interval itself is covered");
});

test("R5-F2: a hold seen only by the full probe's dataset read, in a GC sample, fails and stops at once", async () => {
  const f = fake({}, { attributed: false });
  let inGc = false;
  const gc0 = f.deps.collectGarbage;
  f.deps.collectGarbage = async () => { inGc = true; await gc0(); };
  const page = { evaluate: async () => ({ caveHold: inGc ? "loading" : "clear" }) };
  const base = f.deps.providers;
  f.deps.providers = () => {
    const ps = base();
    // The full probe reads #ocean too (as run.mjs wires it); the tick poll always sees clear.
    return { full: [...ps.full, { ...P.oceanDataset(page as never), sample: async () => { const s = await P.oceanDataset(page as never).sample(); inGc = false; return s; } }],
      tick: [ps.tick[0]!, ps.tick[2]!, P.oceanDataset({ evaluate: async () => ({ caveHold: "clear" }) } as never)] };
  };
  const r = await S.runSoak(opts("tour"), f.deps);
  assert.equal(r.verdict.status, "fail", JSON.stringify(r.verdict.rules));
  assert.match(r.verdict.reason, /loading-hold/);
  assert.equal(r.run.laps.length, 1, "stopped in lap 1's GC sample");
  assert.equal(r.run.saves.length, 0, "before that lap's save check");
});

// SCHED-2a R6: one verdict over append-only facts ----------------------------------

test("R6-F1 (runner): a periodic sample can't overlap the terminal one; a leak it proved would stay failed", async () => {
  const f = fake();
  const t0 = performance.now(), sim = () => ((performance.now() - t0) / 1000) * 200;
  // The reviewer's window: the dwell's goal is met at its 4th settled sample
  // (900 s), so the 5th collection is the terminal one. It is held open for
  // 2.5 s (500 simulated s), during which a periodic GC sample (due at 1200 s)
  // would read 1018 MiB: a leak, which the flat terminal sample must not erase.
  let gcs = 0, inTerminal = false, periodicDuringTerminal = false;
  f.deps.collectGarbage = async () => { if (++gcs === 5) { inTerminal = true; await sleep(2500); inTerminal = false; } };
  const base = f.deps.providers;
  f.deps.providers = () => {
    const ps = base();
    return { ...ps, full: [{ name: "memory", sample: async (ctx?: { afterGc?: boolean }) => {
      const leakyRead = Boolean(ctx?.afterGc) && inTerminal;
      if (leakyRead) periodicDuringTerminal = true;
      return { memory: { rendererRssMiB: leakyRead ? 1018 : 1000, gpuRssMiB: 230, jsHeapAfterGcMiB: 90 }, graphics: { meshes: 900, materials: 80, textures: 60, geometries: 700 } };
    } }] };
  };
  (f.deps as Record<string, unknown>).clock = sim;
  const r = await S.runSoak({ ...opts("dwell"), gcEveryS: 300, thresholds: { tour: G.DEFAULTS.tour, dwell: { ...G.DEFAULTS.dwell, warmupS: 0, autosaves: 2, autosaveMissingS: 1e9, leakMinWindowS: 900 } } }, f.deps);
  assert.ok(gcs >= 5, `${gcs} collections`);
  // Either no sample ran inside the terminal one (serialized), or the leak it proved stands.
  assert.ok(!periodicDuringTerminal || (r.verdict.status === "fail" && r.verdict.broken.includes("leak:rendererRssMiB")),
    `a periodic sample overlapped the terminal one and its leak was erased: ${JSON.stringify(r.verdict.rules)}`);
  assert.equal(periodicDuringTerminal, false, "the samples are serialized");
});

test("R6-F2: a 70 ms frame with 70 ms in caves is streaming's whatever an unrelated part says; an insufficient known part stays unproven", async () => {
  const g = globalThis as unknown as { window: Record<string, unknown> };
  const run = async (parts: Record<string, unknown>) => {
    const f = fake();
    const page = { evaluate: async (fn: () => unknown) => { g.window = { __soakGaps: [{ ms: 70, excluded: false }], __siltwakePerf: [{ total: 70, parts, hold: "clear" }] }; return fn(); } };
    const base = f.deps.providers;
    f.deps.providers = () => { const ps = base(); return { ...ps, tick: [P.frames(page as never), ps.tick[1]!, ps.tick[2]!] }; };
    return S.runSoak(opts("tour"), f.deps);
  };
  for (const chunks of [undefined, NaN]) {
    const r = await run({ chunks, caves: 70, regions: 0, lights: 0 });
    assert.equal(r.verdict.status, "fail", `chunks ${chunks}: ${JSON.stringify(r.verdict.rules)}`);
    assert.equal(r.verdict.broken[0], "streaming-frame");
    assert.ok(r.run.laps.length < 3, `it stopped early (${r.run.laps.length} laps)`);
  }
  const control = await run({ chunks: undefined, caves: 10, regions: 0, lights: 0 });
  assert.equal(control.verdict.status, "partial", JSON.stringify(control.verdict.rules));
  assert.equal(control.verdict.rules.find((x: { id: string }) => x.id === "streaming-frame").status, "unavailable");
  const valid = await run({ chunks: 0, caves: 10, regions: 0, lights: 0 });
  assert.equal(valid.verdict.rules.find((x: { id: string }) => x.id === "streaming-frame").status, "pass", "all valid zero-ish parts and a non-streaming 70 ms frame: no violation");
});
