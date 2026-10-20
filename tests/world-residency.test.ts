import test from "node:test";
import assert from "node:assert/strict";
import { createWorldMap } from "../src/world/map.js";
import { createResidency, type ChunkLoader, type ResidencyBudget } from "../src/world/residency.js";
import { createSliceLayout } from "../src/world/sliceLayout.js";
import type { LodLevel, Vec3 } from "../src/world/types.js";

const map = createWorldMap(createSliceLayout());
const MiB = 1024 * 1024;
const BYTES: Record<LodLevel, number> = { fine: 3 * MiB, coarse: 256 * 1024 };
const STEPS: Record<LodLevel, number> = { fine: 12, coarse: 3 };
const STEP_MS = 0.5;

/** A loader with a fake clock and a ledger of everything it allocated. */
function harness(budget: Partial<ResidencyBudget>) {
  let clock = 0;
  const live = { partial: 0, prepared: 0, resident: 0, visible: 0 };
  const counts = { started: 0, cancelled: 0, built: 0 };
  const builds = new Map<string, number>();
  const loader: ChunkLoader = {
    *build(chunk, lod) {
      counts.started++; live.partial++;
      builds.set(`${chunk.id}@${lod}`, (builds.get(`${chunk.id}@${lod}`) ?? 0) + 1);
      let done = false;
      try {
        for (let i = 0; i < STEPS[lod]; i++) { clock += STEP_MS; yield; }
        done = true;
      } finally {
        live.partial--;
        if (!done) counts.cancelled++;
      }
      counts.built++; live.prepared++;
      const bytes = BYTES[lod];
      return {
        cpuBytes: bytes, gpuBytes: bytes,
        discard() { live.prepared--; },
        upload() {
          live.prepared--; live.resident++;
          let visible = false;
          return {
            cpuBytes: bytes, gpuBytes: bytes,
            setVisible(v: boolean) { if (v !== visible) { live.visible += v ? 1 : -1; visible = v; } },
            dispose() { if (visible) live.visible--; live.resident--; },
          };
        },
      };
    },
  };
  const residency = createResidency({ map, loader, budget, now: () => clock,
    estimate: { fine: { cpu: BYTES.fine, gpu: BYTES.fine }, coarse: { cpu: BYTES.coarse, gpu: BYTES.coarse } } });
  /** Ledger agrees with the manager: nothing exists that it does not track. */
  const consistent = (): void => {
    const units = residency.units();
    const count = (s: string) => units.filter(u => u.state === s).length;
    assert.equal(live.partial, count("building"), "partial builds");
    assert.equal(live.prepared, count("prepared"), "prepared recipes");
    assert.equal(live.resident, count("shown") + count("hidden"), "resident art");
    assert.equal(live.visible, count("shown"), "visible art");
    const shownChunks = units.filter(u => u.state === "shown").map(u => u.chunk);
    assert.equal(new Set(shownChunks).size, shownChunks.length, "one LOD visible per chunk");
  };
  const frame = (p: Vec3) => { clock += 16; const s = residency.update(p); consistent(); return s; };
  return { residency, live, counts, builds, frame, consistent, get clock() { return clock; } };
}

const budget: Partial<ResidencyBudget> = { cpuBytes: 96 * MiB, gpuBytes: 96 * MiB,
  uploadBytesPerFrame: 4 * MiB, buildMsPerFrame: 4, maxInFlight: 2, retainedUnits: 24 };
const pod = { x: 0, y: -2, z: 14 };

test("a stationary viewer converges to its nearby set within the budget", () => {
  const h = harness(budget);
  let s = h.frame(pod), frames = 1;
  while (!h.residency.isReady() && frames < 400) { s = h.frame(pod); frames++; }
  assert.ok(h.residency.isReady(), `not ready after ${frames} frames`);
  assert.ok(s.shown > 0 && s.pending === 0);
  assert.ok(s.gpuBytes <= 96 * MiB && s.cpuBytes <= 96 * MiB);
  assert.equal(s.withinBudget, s.shown);
  const near = map.chunkAt(pod)!;
  assert.ok(h.residency.units().some(u => u.chunk === near.id && u.lod === "fine" && u.state === "shown"));
  h.residency.dispose();
  assert.deepEqual(h.live, { partial: 0, prepared: 0, resident: 0, visible: 0 });
});

test("each frame's build work and uploads stay within their slices", () => {
  const h = harness(budget);
  for (let i = 0; i < 120; i++) {
    const s = h.frame({ x: pod.x + i * 6, y: pod.y - i, z: pod.z - i * 6 });
    assert.ok(s.buildMs <= budget.buildMsPerFrame! + STEP_MS, `frame ${i}: ${s.buildMs} ms of builds`);
    assert.ok(s.uploads <= 1 || s.uploadedBytes <= budget.uploadBytesPerFrame!, `frame ${i}: ${s.uploadedBytes} B uploaded`);
    assert.ok(s.building <= budget.maxInFlight!);
  }
});

test("ADVERSE: a fast traversal across 6+ chunks while builds are pending neither stalls nor leaks", () => {
  const h = harness(budget);
  for (let i = 0; i < 4; i++) h.frame(pod);            // half-built start
  const before = h.residency.stats!;
  assert.ok(before.building + before.prepared > 0 || before.pending > 0, "construction pending at the start");
  const visited = new Set<string>();
  // 1100 m south-east and 600 m down in 40 frames: ~28 m and 15 m per frame.
  const end = { x: 780, y: -620, z: -1120 };
  for (let i = 1; i <= 40; i++) {
    const t = i / 40, p = { x: pod.x + (end.x - pod.x) * t, y: pod.y + (end.y - pod.y) * t, z: pod.z + (end.z - pod.z) * t };
    visited.add(map.chunkAt(p)!.id);
    const s = h.frame(p);
    assert.ok(s.buildMs <= budget.buildMsPerFrame! + STEP_MS, "no frame exceeds its build slice");
    assert.ok(s.cpuBytes <= 96 * MiB + BYTES.fine && s.gpuBytes <= 96 * MiB + BYTES.fine, "bytes stay bounded");
    assert.ok(s.building + s.prepared <= s.withinBudget + budget.maxInFlight!, "work never outgrows what is wanted");
  }
  assert.ok(visited.size >= 6, `crossed ${visited.size} chunks`);
  assert.ok(h.counts.cancelled > 0, "abandoned builds were cancelled");
  let frames = 0;
  while (!h.residency.isReady() && frames < 600) { h.frame(end); frames++; }
  assert.ok(h.residency.isReady(), "the destination converges");
  const s = h.residency.stats!;
  const start = map.chunkAt(pod)!.id;
  assert.ok(!h.residency.units().some(u => u.chunk === start && u.state === "shown"), "the start area is no longer drawn");
  assert.ok(s.gpuBytes <= 96 * MiB && s.hidden <= 24);
  h.residency.dispose();
  assert.deepEqual(h.live, { partial: 0, prepared: 0, resident: 0, visible: 0 }, "nothing outlives dispose");
});

test("a tour of all seven regions evicts by bytes while keeping a small resident set", () => {
  const h = harness({ ...budget, cpuBytes: 64 * MiB, gpuBytes: 64 * MiB });
  const tour: Vec3[] = [pod, { x: 10, y: -5, z: -40 }, { x: 160, y: -120, z: -140 }, { x: 300, y: -260, z: -500 },
    { x: -240, y: -420, z: -880 }, { x: 380, y: -560, z: -1240 }, { x: 1060, y: -700, z: -1180 }, pod];
  const seen = new Set<string>();
  let maxRegions = 0;
  for (let leg = 1; leg < tour.length; leg++) {
    const a = tour[leg - 1]!, b = tour[leg]!;
    for (let i = 1; i <= 60; i++) {
      const t = i / 60;
      h.frame({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
      for (const r of h.residency.shownRegions()) seen.add(r);
      maxRegions = Math.max(maxRegions, new Set(h.residency.units().map(u => u.region)).size);
    }
    for (let i = 0; i < 200 && !h.residency.isReady(); i++) h.frame(b);
    assert.ok(h.residency.isReady(), `leg ${leg} converges`);
    assert.ok(h.residency.stats!.gpuBytes <= 64 * MiB);
  }
  assert.equal(seen.size, 7, "all seven regions were shown");
  assert.ok(maxRegions < 7, `at most ${maxRegions} regions resident at once`);
  assert.ok(h.residency.stats!.totals.evicted > 10);
});

test("a viewer pacing across the fine boundary does not rebuild", () => {
  const h = harness(budget);
  const chunk = map.chunkAt(pod)!;
  // Stand just outside the fine band of the neighbouring column to the east.
  const edge = chunk.bounds.max.x + chunk.lod.fine;
  for (let i = 0; i < 300 && !h.residency.isReady(); i++) h.frame({ x: edge - 4, y: pod.y, z: pod.z });
  const before = new Map(h.builds);
  for (let i = 0; i < 60; i++) h.frame({ x: edge + (i % 2 ? 6 : -6), y: pod.y, z: pod.z });
  // New chunks may enter the coarse band; nothing already built is rebuilt.
  for (const [key, n] of before) assert.equal(h.builds.get(key), n, `${key} rebuilt`);
  assert.equal(h.builds.get(`${chunk.id}@fine`), 1);
});

test("a budget smaller than the view keeps the nearest chunks and discards hidden art on context loss", () => {
  const h = harness({ ...budget, cpuBytes: 12 * MiB, gpuBytes: 12 * MiB });
  for (let i = 0; i < 300 && !h.residency.isReady(); i++) h.frame(pod);
  const s = h.residency.stats!;
  assert.ok(s.withinBudget < s.desired, "the budget cuts the wanted list");
  assert.ok(s.gpuBytes <= 12 * MiB);
  const near = map.chunkAt(pod)!.id;
  assert.ok(h.residency.units().some(u => u.chunk === near && u.state === "shown"), "nearest chunk is kept");
  for (let i = 0; i < 80; i++) h.frame({ x: 400, y: -100, z: 0 });
  assert.ok(h.residency.stats!.hidden > 0 || h.residency.stats!.totals.evicted > 0);
  h.residency.discardHidden();
  assert.equal(h.residency.units().filter(u => u.state === "hidden").length, 0);
  h.consistent();
});
