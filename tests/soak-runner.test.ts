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
  assert.equal(r.run.saves.length, 2, "each lap's save was checked separately");
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
  assert.match(rule("providers").detail, /frames failed \d+× \(frames broke\).*ocean-dataset failed/);
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
  const span = flat.run.samples.at(-1).at - flat.run.startedAt;
  assert.ok(span >= 0.4, `observed ${span} s of the 0.4 s leak window`);
  // Stopped short of the window: the leak rule is listed as unmeasured, not passed.
  const short = G.evaluateDwell({ samples: [{ at: 0, memory: { rendererRssMiB: 1 } }, { at: 1, memory: { rendererRssMiB: 1 } }, { at: 2, memory: { rendererRssMiB: 1 } }],
    autosaves: [], frames: { judged: true }, now: 2 }, { ...G.DEFAULTS.dwell, warmupS: 0 });
  assert.match(short.unavailable.join("\n"), /leak: settled samples span 0 of the 10 min/);
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
