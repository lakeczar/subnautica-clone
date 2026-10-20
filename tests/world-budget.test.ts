// FAST TIER: residency byte-budget enforcement (S1-01), no Babylon.
import test from "node:test";
import assert from "node:assert/strict";
import { createWorldMap } from "../src/world/map.js";
import { createResidency, type ChunkLoader, type ResidencyBudget, type UploadJob } from "../src/world/residency.js";
import { createSliceLayout } from "../src/world/sliceLayout.js";
import type { ChunkDescriptor, LodLevel, Vec3, WorldMap } from "../src/world/types.js";

const MiB = 1024 * 1024;
type Cost = (chunk: ChunkDescriptor, lod: LodLevel) => number;

/** Fake loader whose ledger records what is really allocated: recipes on the
 * CPU from build completion, GPU bytes per uploaded part. */
function ledgered(map: WorldMap, cost: Cost, budget: Partial<ResidencyBudget>,
  options: { partBytes?: number; estimate?: Partial<Record<LodLevel, { cpu: number; gpu: number }>> } = {}) {
  let clock = 0;
  const ledger = { cpu: 0, gpu: 0 };
  const builds = new Map<string, number>();
  const loader: ChunkLoader = {
    *build(chunk, lod) {
      const k = `${chunk.id}@${lod}`;
      builds.set(k, (builds.get(k) ?? 0) + 1);
      for (let i = 0; i < 3; i++) { clock += 0.5; yield; }
      const bytes = Math.round(cost(chunk, lod));
      ledger.cpu += bytes;
      let consumed = false;
      const art = (gpu: number) => {
        let alive = true;
        return { cpuBytes: bytes, gpuBytes: gpu, setVisible() {},
          dispose() { if (alive) { alive = false; ledger.cpu -= bytes; ledger.gpu -= gpu; } } };
      };
      const prepared = {
        cpuBytes: bytes, gpuBytes: bytes,
        discard() { if (!consumed) { consumed = true; ledger.cpu -= bytes; } },
        upload() { consumed = true; ledger.gpu += bytes; return art(bytes); },
        ...(options.partBytes ? {
          beginUpload(): UploadJob {
            const part = options.partBytes!;
            let uploaded = 0, finished = false;
            return {
              get done() { return uploaded >= bytes; },
              get uploadedBytes() { return uploaded; },
              step(max, force) {
                let now = 0;
                while (uploaded < bytes) {
                  const next = Math.min(part, bytes - uploaded);
                  if (now + next > max && !(force && now === 0)) break;
                  uploaded += next; now += next; ledger.gpu += next;
                }
                return now;
              },
              finish() { finished = true; consumed = true; return art(bytes); },
              cancel() { if (!finished) { ledger.gpu -= uploaded; uploaded = 0; } },
            };
          },
        } : {}),
      };
      return prepared;
    },
  };
  const residency = createResidency({ map, loader, budget, now: () => clock, ...(options.estimate ? { estimate: options.estimate } : {}) });
  const cap = { cpu: budget.cpuBytes ?? Infinity, gpu: budget.gpuBytes ?? Infinity };
  /** One frame, then the invariants every frame must keep. */
  const frame = (p: Vec3) => {
    clock += 16;
    const s = residency.update(p);
    assert.ok(ledger.cpu <= cap.cpu, `frame ${s.frame}: ${ledger.cpu} CPU bytes allocated > ${cap.cpu}`);
    assert.ok(ledger.gpu <= cap.gpu, `frame ${s.frame}: ${ledger.gpu} GPU bytes allocated > ${cap.gpu}`);
    assert.ok(s.cpuBytes >= ledger.cpu && s.gpuBytes >= ledger.gpu, "accounting never under-counts");
    assert.equal(s.overBudget, false, "never over budget at frame end");
    if (residency.isReady()) assert.ok(s.cpuBytes <= cap.cpu && s.gpuBytes <= cap.gpu, "ready implies within budget");
    return s;
  };
  return { residency, ledger, builds, frame };
}

test("REVIEW S1-01 probe: four 4 MiB units against a 6 MiB budget never exceed it", () => {
  // The reviewer's stub map: four chunks at distance 0..3, all wanted fine.
  const chunks = Array.from({ length: 4 }, (_, i) => ({ id: `c${i}`, region: "refuge_reef", priority: 0,
    lod: { fine: 112, coarse: 400, hysteresis: 16 }, bounds: { min: { x: i, y: 0, z: 0 }, max: { x: i + 1, y: 1, z: 1 } } }));
  const map = { layout: { chunks }, chunksWithin: () => chunks.map((chunk, i) => ({ chunk, distance: i })) } as unknown as WorldMap;
  const h = ledgered(map, () => 4 * MiB, { cpuBytes: 6 * MiB, gpuBytes: 6 * MiB, uploadBytesPerFrame: MiB, buildMsPerFrame: 4 });
  for (let i = 0; i < 40; i++) h.frame({ x: 0, y: 0, z: 0 });
  const s = h.residency.stats!;
  assert.equal(s.shown, 1, "only the nearest fits");
  assert.equal(s.withinBudget, 1);
  assert.equal(h.residency.isReady(), true);
  assert.ok(h.ledger.cpu <= 6 * MiB && h.ledger.gpu <= 6 * MiB);
});

const map = createWorldMap(createSliceLayout());
const hash = (c: ChunkDescriptor): number => ((c.cell.ix * 73856093) ^ (c.cell.iz * 19349663)) >>> 0;
const tour: Vec3[] = [{ x: 0, y: -3, z: 14 }, { x: 160, y: -120, z: -140 }, { x: 300, y: -260, z: -500 },
  { x: -240, y: -420, z: -880 }, { x: 1060, y: -700, z: -1180 }, { x: 0, y: -3, z: 14 }];
function walk(frame: (p: Vec3) => unknown, steps = 50): void {
  for (let leg = 1; leg < tour.length; leg++) {
    const a = tour[leg - 1]!, b = tour[leg]!;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      frame({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
    }
    for (let i = 0; i < 60; i++) frame(b);
  }
}

test("mixed unit costs (0.25..6 MiB fine) stay within a 24 MiB budget on every frame of a tour", () => {
  const cost: Cost = (c, lod) => { const fine = (0.25 + (hash(c) % 1000) / 1000 * 5.75) * MiB; return lod === "fine" ? fine : fine / 8; };
  const h = ledgered(map, cost, { cpuBytes: 24 * MiB, gpuBytes: 24 * MiB, uploadBytesPerFrame: 4 * MiB, retainedUnits: 64 });
  walk(h.frame);
  const s = h.residency.stats!;
  assert.ok(s.totals.evicted > 0 && s.shown > 0);
  assert.equal(h.residency.isReady(), true);
});

test("LOD-swap pressure: the outgoing LOD counts until the new one replaces it", () => {
  // Fine is 3x coarse; walking in turns coarse chunks fine. A budget that
  // fits the coarse ring only just must never hold both LODs over budget.
  const cost: Cost = (_c, lod) => (lod === "fine" ? 3 * MiB : MiB);
  const h = ledgered(map, cost, { cpuBytes: 14 * MiB, gpuBytes: 14 * MiB, uploadBytesPerFrame: 8 * MiB, maxInFlight: 4 },
    { estimate: { fine: { cpu: 3 * MiB, gpu: 3 * MiB }, coarse: { cpu: MiB, gpu: MiB } } });
  const far = { x: 600, y: -100, z: -300 }, near = { x: 360, y: -150, z: -500 };
  for (let i = 0; i < 80; i++) h.frame(far);
  let swaps = 0;
  for (let i = 1; i <= 60; i++) {
    const t = i / 60, before = h.residency.units().filter(u => u.state === "shown" && u.lod === "coarse").length;
    h.frame({ x: far.x + (near.x - far.x) * t, y: far.y + (near.y - far.y) * t, z: far.z + (near.z - far.z) * t });
    swaps += Math.max(0, before - h.residency.units().filter(u => u.state === "shown" && u.lod === "coarse").length);
  }
  for (let i = 0; i < 80; i++) h.frame(near);
  assert.ok(swaps > 0, "coarse units were swapped for fine ones");
  assert.ok(h.residency.units().some(u => u.state === "shown" && u.lod === "fine"));
});

test("an oversized fine unit is shown coarse; an oversized coarse unit is refused and reported", () => {
  const home = map.chunkAt({ x: 0, y: -3, z: 14 })!;
  const sizes = { fine: 8 * MiB, coarse: MiB };
  const cost: Cost = (c, lod) => (c.id === home.id ? sizes[lod] : lod === "fine" ? 512 * 1024 : 64 * 1024);
  const h = ledgered(map, cost, { cpuBytes: 6 * MiB, gpuBytes: 6 * MiB });
  for (let i = 0; i < 200 && !h.residency.isReady(); i++) h.frame({ x: 0, y: -3, z: 14 });
  assert.equal(h.residency.isReady(), true);
  assert.ok(h.residency.stats!.demoted >= 1);
  assert.ok(h.residency.units().some(u => u.chunk === home.id && u.lod === "coarse" && u.state === "shown"));
  assert.equal(h.builds.get(`${home.id}@fine`), 1, "measured once, then not retried");

  sizes.coarse = 7 * MiB;
  const r = ledgered(map, cost, { cpuBytes: 6 * MiB, gpuBytes: 6 * MiB });
  for (let i = 0; i < 200; i++) r.frame({ x: 0, y: -3, z: 14 });
  const s = r.residency.stats!;
  assert.deepEqual(s.refused.map(u => u.chunk), [home.id], "the refusal is reported");
  assert.equal(r.residency.isReady(), false, "a refused chunk is never ready");
  assert.ok(!r.residency.units().some(u => u.chunk === home.id), "nothing of it stays resident");
  assert.equal(r.builds.get(`${home.id}@coarse`), 1);
  assert.ok(s.shown > 0, "the rest of the view still loads");
});

test("a chunk far heavier than every chunk measured so far is caught when its recipe exists", () => {
  // Its first build is reserved at the 1 MiB seen so far, but costs 11 MiB.
  const heavy = map.chunkAt({ x: 160, y: -120, z: -140 })!;
  const cost: Cost = (c, lod) => (c.id === heavy.id && lod === "fine" ? 11 * MiB : lod === "fine" ? MiB : 128 * 1024);
  const h = ledgered(map, cost, { cpuBytes: 12 * MiB, gpuBytes: 12 * MiB, maxInFlight: 3 },
    { estimate: { fine: { cpu: 64 * 1024, gpu: 64 * 1024 }, coarse: { cpu: 16 * 1024, gpu: 16 * 1024 } } });
  for (let i = 0; i < 120; i++) h.frame({ x: 0, y: -3, z: 14 });
  for (let i = 1; i <= 40; i++) h.frame({ x: 160 * i / 40, y: -3 - 117 * i / 40, z: 14 - 154 * i / 40 });
  for (let i = 0; i < 200 && !h.residency.isReady(); i++) h.frame({ x: 160, y: -120, z: -140 });
  assert.equal(h.residency.isReady(), true);
  assert.ok(h.residency.stats!.totals.overBudgetDiscards >= 1, "the underestimated recipe was re-checked and dropped");
  assert.ok(h.residency.units().some(u => u.chunk === heavy.id && u.lod === "fine" && u.state === "shown"),
    "the heavy chunk is shown once room is made");
});

test("incremental uploads stay within the per-frame upload cap", () => {
  const h = ledgered(map, (_c, lod) => (lod === "fine" ? 2 * MiB : 512 * 1024),
    { cpuBytes: 64 * MiB, gpuBytes: 64 * MiB, uploadBytesPerFrame: 512 * 1024 }, { partBytes: 256 * 1024 });
  let maxUpload = 0, sawUploading = false;
  for (let i = 0; i < 400; i++) {
    const s = h.frame({ x: 0, y: -3, z: 14 });
    maxUpload = Math.max(maxUpload, s.uploadedBytes);
    assert.equal(s.uploadOverrunBytes, 0);
    sawUploading ||= s.uploading > 0;
    if (h.residency.isReady()) break;
  }
  assert.ok(maxUpload <= 512 * 1024 && maxUpload > 0, `max ${maxUpload} B per frame`);
  assert.ok(sawUploading, "units spanned several frames of upload");
  assert.equal(h.residency.isReady(), true);
  // Leaving mid-upload cancels the parts already uploaded.
  for (let i = 0; i < 3; i++) h.frame({ x: 900, y: -600, z: -1200 });
  h.residency.dispose();
  assert.deepEqual(h.ledger, { cpu: 0, gpu: 0 });
});

test("bytes held outside the residency (legacy owners) shrink its share of the budget", () => {
  const h = ledgered(map, (_c, lod) => (lod === "fine" ? MiB : 256 * 1024), { cpuBytes: 16 * MiB, gpuBytes: 16 * MiB });
  for (let i = 0; i < 200 && !h.residency.isReady(); i++) h.frame({ x: 0, y: -3, z: 14 });
  const before = h.residency.stats!.gpuBytes;
  assert.ok(before > 8 * MiB, `fills the budget first (${before} B)`);
  h.residency.setExternalBytes({ cpu: 8 * MiB, gpu: 8 * MiB });
  for (let i = 0; i < 5; i++) {
    const s = h.frame({ x: 0, y: -3, z: 14 });
    assert.ok(h.ledger.gpu + 8 * MiB <= 16 * MiB, `frame ${s.frame}: chunk art ${h.ledger.gpu} B + 8 MiB external`);
    assert.equal(s.overBudget, false);
  }
  assert.equal(h.residency.isReady(), true);
});
