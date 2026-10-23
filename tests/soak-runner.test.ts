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

type World = { heap: number; meshes: number; cam: number[]; calls: number; gotos: number[][]; leak: number; leakMeshes: number };
type Provider = { name: string; sample: () => Promise<Record<string, unknown>> };
class Blocked extends Error {}

function fake(over: Partial<World> = {}, { failing = [] as string[], attributed = true } = {}) {
  const w: World = { heap: 100, meshes: 900, cam: [0, 0, 0], calls: 0, gotos: [], leak: 0, leakMeshes: 0, ...over };
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
        provider("frames", () => ({ frames: { count: 10, worstMs: 16, over: [], attributed, streaming: attributed ? [] : null } })),
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
  assert.equal(r.verdict.status, "partial");
  const rule = (id: string) => r.verdict.rules.find((x: { id: string }) => x.id === id);
  assert.equal(rule("streaming-frame").status, "unavailable");
  assert.match(rule("streaming-frame").detail, /no frames were measured/);
  assert.equal(rule("loading-hold").status, "unavailable");
  assert.match(rule("providers").detail, /frames failed \d+× \(frames broke\).*ocean-dataset failed/);
  // A build without per-frame attribution: unavailable too, with the reason.
  const u = await S.runSoak(opts("tour"), fake({}, { attributed: false }).deps);
  assert.match(u.verdict.rules.find((x: { id: string }) => x.id === "streaming-frame").detail, /no streaming attribution yet/);
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
