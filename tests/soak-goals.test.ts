import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Soak goals and pass rules (scripts/soak/goals.mjs), pure. The browser runner
// that feeds them is scripts/soak/run.mjs.
const G = await import(pathToFileURL(resolve("scripts/soak/goals.mjs")).href);
const T = G.DEFAULTS.tour, D = G.DEFAULTS.dwell;
const lap = (n: number, rss: number, meshes = 900) => ({ lap: n, memory: { rendererRssMiB: rss, gpuRssMiB: 400, jsHeapAfterGcMiB: 120 }, graphics: { meshes, materials: 80, textures: 60, geometries: 700 } });
const status = (v: { rules: { id: string; status: string }[] }, id: string) => v.rules.find((r) => r.id === id)?.status;

test("tour: three laps with flat memory and graphics pass; the goal is laps, not time", () => {
  const frames = { judged: true, attributed: true, streamingOver: [] };
  const holds = { available: true, list: [] };
  assert.equal(G.evaluateTour({ laps: [lap(1, 1000), lap(2, 1020)], frames, holds, saves: [{ ok: true }] }, T).status, "running");
  const v = G.evaluateTour({ laps: [lap(1, 1000), lap(2, 1020), lap(3, 1040)], frames, holds, saves: [{ ok: true }, { ok: true }] }, T);
  assert.equal(v.status, "pass", JSON.stringify(v.rules));
  assert.equal(status(v, "memory-growth:rendererRssMiB"), "pass");
  assert.equal(status(v, "save-reload"), "pass");
});

test("tour: each rule breaks the soak early, with a reason", () => {
  const ok = { frames: { judged: true, attributed: true, streamingOver: [] }, holds: { available: true, list: [] }, saves: [] };
  const grown = G.evaluateTour({ ...ok, laps: [lap(1, 1000), lap(2, 1060)] }, T);
  assert.equal(grown.status, "fail"); // already over 5% at lap 2: stop now
  assert.match(grown.reason, /memory-growth:rendererRssMiB: lap 1 1000 MiB → lap 2 1060 MiB \(6%\)/);
  assert.equal(G.evaluateTour({ ...ok, laps: [lap(1, 1000), lap(2, 1000, 950)] }, T).broken[0], "graphics-growth:meshes");
  const hitch = G.evaluateTour({ ...ok, frames: { judged: true, attributed: true, streamingOver: [{ ms: 48, where: "basin seam" }] } }, T);
  assert.match(hitch.reason, /streaming-frame: 1 streaming frames over 33 ms, worst 48 ms at basin seam/);
  assert.equal(G.evaluateTour({ ...ok, holds: { available: true, list: [{ where: "fanvault", state: "waiting" }] } }, T).broken[0], "loading-hold");
  assert.match(G.evaluateTour({ ...ok, saves: [{ ok: false, label: "lap 1", error: "tick went back" }] }, T).reason, /save-reload: save at lap 1 did not reload: tick went back/);
  assert.equal(G.evaluateTour({ ...ok, crash: "Target crashed" }, T).broken[0], "renderer");
  assert.equal(G.evaluateTour({ ...ok, travel: { blocked: "stalled 12 m short of fanvault" } }, T).status, "incomplete");
});

test("tour: shared-run frame times are recorded, not judged; missing measurements are listed, not proxied", () => {
  const v = G.evaluateTour({ laps: [lap(1, 1000)], frames: { judged: false, attributed: true, streamingOver: [{ ms: 90 }] }, holds: { available: false } }, T);
  assert.equal(status(v, "streaming-frame"), "recorded");
  assert.notEqual(v.status, "fail");
  const u = G.evaluateTour({ laps: [lap(1, 1000)], frames: { judged: true, attributed: false, streamingOver: [] }, holds: { available: false } }, T);
  assert.equal(status(u, "streaming-frame"), "unavailable");
  assert.equal(status(u, "loading-hold"), "unavailable");
  assert.equal(u.unavailable.length, 2);
});

test("dwell: flat memory over the autosave goal passes; a slow leak or a jump fails; day–night is missing", () => {
  const flat = Array.from({ length: 40 }, (_, i) => ({ at: i * 30, memory: { rendererRssMiB: 1000 + (i % 3), gpuRssMiB: 400, jsHeapAfterGcMiB: 120 } }));
  const saves = Array.from({ length: 20 }, (_, i) => ({ at: 30 + i * 30, frameMs: 18 }));
  const v = G.evaluateDwell({ samples: flat, autosaves: saves, frames: { judged: true }, now: 620 }, D);
  assert.equal(v.status, "pass", JSON.stringify(v.rules));
  assert.equal(status(v, "day-night"), "unavailable");
  assert.equal(status(v, "leak:rendererRssMiB"), "pass");
  const leaking = flat.map((s, i) => ({ ...s, memory: { ...s.memory, jsHeapAfterGcMiB: 120 + i * 0.4 } })); // 48 MiB/h, inside 5% for a while
  const lv = G.evaluateDwell({ samples: leaking.slice(0, 25), autosaves: saves.slice(0, 10), frames: { judged: true }, now: 750 }, D);
  assert.equal(lv.broken.includes("leak:jsHeapAfterGcMiB"), true, JSON.stringify(lv.rules));
  const hitch = G.evaluateDwell({ samples: flat, autosaves: [...saves.slice(0, 5), { at: 180, frameMs: 70 }], frames: { judged: true }, now: 200 }, D);
  assert.match(hitch.reason, /autosave-hitch: 1 autosave frames over 33 ms, worst 70 ms/);
  assert.equal(G.evaluateDwell({ samples: flat, autosaves: saves.slice(0, 2), frames: { judged: true }, now: 400 }, D).broken[0], "autosave");
});

test("thresholds are config: a file overrides the defaults", () => {
  const t = G.loadThresholds(resolve("scripts/soak/thresholds.json"));
  assert.deepEqual(t, { tour: G.DEFAULTS.tour, dwell: G.DEFAULTS.dwell });
  assert.equal(G.slopePerHour([[0, 0], [3600, 10]]), 10);
});
