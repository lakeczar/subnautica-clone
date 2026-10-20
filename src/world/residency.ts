import type { ChunkDescriptor, ChunkId, LodLevel, RegionId, Vec3, WorldMap } from "./types.js";

/** Art the loader finished building on the CPU but has not uploaded. */
export interface PreparedArt {
  readonly cpuBytes: number;
  /** Bytes `upload` will put on the GPU; spent against the per-frame upload cap. */
  readonly gpuBytes: number;
  upload(): ResidentArt;
  discard(): void;
}
/** Uploaded art. `cpuBytes` counts CPU copies it still retains (Babylon keeps
 * vertex data for context restoration), `gpuBytes` its GPU buffers. */
export interface ResidentArt {
  readonly cpuBytes: number;
  readonly gpuBytes: number;
  setVisible(visible: boolean): void;
  dispose(): void;
}
/** Builds one chunk at one LOD. Yield between bounded units of work; a
 * `return()` on the generator cancels it and must release partial work. */
export interface ChunkLoader {
  build(chunk: ChunkDescriptor, lod: LodLevel): Generator<void, PreparedArt>;
}

export interface ResidencyBudget {
  /** Total CPU bytes held by prepared and resident art. */
  readonly cpuBytes: number;
  /** Total GPU bytes of resident art, shown or hidden. */
  readonly gpuBytes: number;
  readonly uploadBytesPerFrame: number;
  readonly buildMsPerFrame: number;
  /** Partially built units allowed at once. */
  readonly maxInFlight: number;
  /** Hidden units kept for warm returns, on top of the byte budget. */
  readonly retainedUnits: number;
}
export const DEFAULT_BUDGET: ResidencyBudget = {
  cpuBytes: 256 * 1024 * 1024,
  gpuBytes: 256 * 1024 * 1024,
  uploadBytesPerFrame: 4 * 1024 * 1024,
  buildMsPerFrame: 4,
  maxInFlight: 2,
  retainedUnits: 48,
};

export type UnitState = "building" | "prepared" | "shown" | "hidden";
export interface UnitView {
  readonly key: string;
  readonly chunk: ChunkId;
  readonly region: RegionId;
  readonly lod: LodLevel;
  readonly state: UnitState;
  readonly cpuBytes: number;
  readonly gpuBytes: number;
}
export interface ResidencyStats {
  readonly frame: number;
  /** Chunk/LOD pairs the viewer wants this frame, and how many fit the budget. */
  readonly desired: number;
  readonly withinBudget: number;
  readonly building: number;
  readonly prepared: number;
  readonly shown: number;
  readonly hidden: number;
  readonly cpuBytes: number;
  readonly gpuBytes: number;
  readonly shownGpuBytes: number;
  readonly hiddenGpuBytes: number;
  readonly buildMs: number;
  readonly buildSteps: number;
  readonly uploads: number;
  readonly uploadedBytes: number;
  /** Desired units not yet shown at their desired LOD. */
  readonly pending: number;
  readonly totals: { readonly built: number; readonly uploaded: number; readonly cancelled: number;
    readonly evicted: number; readonly discarded: number };
}

/** Metres of rank a priority point is worth: a refuge (priority 1) loads as
 * if it were this much closer, and is evicted as if it were that much nearer. */
const PRIORITY_METRES = 64;

interface Unit {
  readonly key: string;
  readonly chunk: ChunkDescriptor;
  readonly lod: LodLevel;
  state: UnitState;
  build: Generator<void, PreparedArt> | null;
  prepared: PreparedArt | null;
  art: ResidentArt | null;
  rank: number;
  lastUsed: number;
}
interface Want { readonly chunk: ChunkDescriptor; readonly lod: LodLevel; readonly rank: number; readonly distance: number }

/** Byte-budgeted chunk residency. Each `update(viewer)`:
 * 1. picks the wanted chunk/LOD pairs from distance bands with hysteresis,
 *    nearest (by rank) first, and cuts the list where estimated bytes exceed
 *    the budget, so the resident set is the nearest set that fits;
 * 2. cancels builds and discards prepared art that are no longer wanted;
 * 3. steps builds, nearest first, within `buildMsPerFrame`;
 * 4. uploads prepared art within `uploadBytesPerFrame` (at least one);
 * 5. shows each wanted chunk at its LOD, keeping the previous LOD visible
 *    until the new one is ready so traversal never opens holes;
 * 6. evicts hidden units least recently used first, over the byte budget or
 *    the retained count.
 * Presentation only: never reads or writes simulation state. */
export function createResidency(options: {
  map: WorldMap;
  loader: ChunkLoader;
  budget?: Partial<ResidencyBudget>;
  now?: () => number;
  /** Starting byte estimates per LOD before any unit has been measured. */
  estimate?: Partial<Record<LodLevel, { cpu: number; gpu: number }>>;
}) {
  const { map, loader } = options;
  const budget: ResidencyBudget = { ...DEFAULT_BUDGET, ...options.budget };
  const now = options.now ?? (() => performance.now());
  const units = new Map<string, Unit>();
  const reach = Math.max(0, ...map.layout.chunks.map(c => c.lod.coarse + c.lod.hysteresis));
  const observed: Record<LodLevel, { cpu: number; gpu: number; n: number }> = {
    fine: { cpu: options.estimate?.fine?.cpu ?? 0, gpu: options.estimate?.fine?.gpu ?? 0, n: 0 },
    coarse: { cpu: options.estimate?.coarse?.cpu ?? 0, gpu: options.estimate?.coarse?.gpu ?? 0, n: 0 },
  };
  const totals = { built: 0, uploaded: 0, cancelled: 0, evicted: 0, discarded: 0 };
  let frame = 0, disposed = false;
  let last: ResidencyStats | null = null, lastDesired: Want[] = [];
  const key = (id: ChunkId, lod: LodLevel): string => `${id}@${lod}`;
  const shownOf = (id: ChunkId): Unit | undefined => {
    for (const lod of ["fine", "coarse"] as const) {
      const u = units.get(key(id, lod));
      if (u?.state === "shown") return u;
    }
    return undefined;
  };
  const bytesOf = (u: Unit): { cpu: number; gpu: number } =>
    u.art ? { cpu: u.art.cpuBytes, gpu: u.art.gpuBytes }
      : u.prepared ? { cpu: u.prepared.cpuBytes, gpu: 0 } : { cpu: 0, gpu: 0 };
  const expected = (u: Unit | undefined, lod: LodLevel): { cpu: number; gpu: number } => {
    if (u?.art) return { cpu: u.art.cpuBytes, gpu: u.art.gpuBytes };
    if (u?.prepared) return { cpu: u.prepared.cpuBytes, gpu: u.prepared.gpuBytes };
    return observed[lod];
  };
  const learn = (lod: LodLevel, cpu: number, gpu: number): void => {
    const o = observed[lod];
    // Running mean; the first measurement replaces the starting guess.
    o.n++; o.cpu += (cpu - o.cpu) / o.n; o.gpu += (gpu - o.gpu) / o.n;
  };
  const release = (u: Unit, counter: keyof typeof totals): void => {
    if (u.build) { u.build.return(undefined as never); u.build = null; }
    if (u.prepared) { u.prepared.discard(); u.prepared = null; }
    if (u.art) { u.art.dispose(); u.art = null; }
    units.delete(u.key);
    totals[counter]++;
  };
  const sum = (): { cpu: number; gpu: number; shownGpu: number; hiddenGpu: number } => {
    let cpu = 0, gpu = 0, shownGpu = 0, hiddenGpu = 0;
    for (const u of units.values()) {
      const b = bytesOf(u);
      cpu += b.cpu; gpu += b.gpu;
      if (u.state === "shown") shownGpu += b.gpu;
      if (u.state === "hidden") hiddenGpu += b.gpu;
    }
    return { cpu, gpu, shownGpu, hiddenGpu };
  };

  function wants(viewer: Readonly<Vec3>): Want[] {
    const out: Want[] = [];
    for (const { chunk, distance } of map.chunksWithin(viewer, reach)) {
      const { fine, coarse, hysteresis } = chunk.lod;
      const shown = shownOf(chunk.id)?.lod;
      let lod: LodLevel | null = distance < fine ? "fine" : distance < coarse ? "coarse" : null;
      if (shown === "fine" && distance < fine + hysteresis) lod = "fine";
      if (lod === null && shown && distance < coarse + hysteresis) lod = "coarse";
      if (lod) out.push({ chunk, lod, distance, rank: distance - (chunk.priority ?? 0) * PRIORITY_METRES });
    }
    return out.sort((a, b) => a.rank - b.rank || (a.chunk.id < b.chunk.id ? -1 : 1));
  }

  return {
    get budget() { return budget; },
    get stats(): ResidencyStats | null { return last; },
    update(viewer: Readonly<Vec3>): ResidencyStats {
      if (disposed) throw new Error("Residency is disposed.");
      frame++;
      const all = wants(viewer);
      // 1. Budget frontier: the nearest wanted units whose expected bytes fit.
      const desired = new Map<string, Want>();
      let cpu = 0, gpu = 0;
      for (const w of all) {
        const e = expected(units.get(key(w.chunk.id, w.lod)), w.lod);
        if (desired.size > 0 && (cpu + e.cpu > budget.cpuBytes || gpu + e.gpu > budget.gpuBytes)) break;
        cpu += e.cpu; gpu += e.gpu;
        desired.set(key(w.chunk.id, w.lod), w);
      }
      const desiredChunks = new Set([...desired.values()].map(w => w.chunk.id));
      // 2. Drop unwanted work in progress; ranks refresh for what remains.
      for (const u of [...units.values()]) {
        const w = desired.get(u.key);
        if (w) { u.rank = w.rank; u.lastUsed = frame; continue; }
        if (u.state === "building") release(u, "cancelled");
        else if (u.state === "prepared") release(u, "discarded");
        else if (u.state === "shown" && !desiredChunks.has(u.chunk.id)) {
          // Out of range, or in range but cut by the budget: the frontier is
          // what is drawn. A shown other LOD of a wanted chunk stays as fallback.
          u.art!.setVisible(false); u.state = "hidden"; u.lastUsed = frame;
        }
      }
      lastDesired = [...desired.values()];
      // 3. Builds, nearest first, within the time slice (always one step).
      const start = now();
      let steps = 0;
      const queue = [...desired.values()].filter(w => {
        const u = units.get(key(w.chunk.id, w.lod));
        return !u || u.state === "building";
      });
      for (const w of queue) {
        if (steps > 0 && now() - start >= budget.buildMsPerFrame) break;
        const k = key(w.chunk.id, w.lod);
        let u = units.get(k);
        if (!u) {
          let inFlight = 0;
          for (const x of units.values()) if (x.state === "building") inFlight++;
          if (inFlight >= budget.maxInFlight) continue;
          u = { key: k, chunk: w.chunk, lod: w.lod, state: "building", build: loader.build(w.chunk, w.lod),
            prepared: null, art: null, rank: w.rank, lastUsed: frame };
          units.set(k, u);
        }
        while (u.build) {
          const r = u.build.next();
          steps++;
          if (r.done) {
            u.build = null; u.prepared = r.value; u.state = "prepared"; totals.built++;
          } else if (now() - start >= budget.buildMsPerFrame) break;
        }
      }
      const buildMs = now() - start;
      // 4. Uploads, nearest first, within the byte cap (always one).
      let uploads = 0, uploadedBytes = 0;
      const ready = [...units.values()].filter(u => u.state === "prepared").sort((a, b) => a.rank - b.rank);
      for (const u of ready) {
        const bytes = u.prepared!.gpuBytes;
        if (uploads > 0 && uploadedBytes + bytes > budget.uploadBytesPerFrame) break;
        const prepared = u.prepared!;
        u.prepared = null;
        u.art = prepared.upload();
        u.art.setVisible(false);
        u.state = "hidden";
        uploads++; uploadedBytes += bytes; totals.uploaded++;
        learn(u.lod, u.art.cpuBytes, u.art.gpuBytes);
      }
      // 5. Display: the desired LOD once it exists; until then keep whatever
      //    this chunk already shows, or bring back a hidden other LOD.
      let pending = 0;
      for (const w of desired.values()) {
        const target = units.get(key(w.chunk.id, w.lod));
        const other = units.get(key(w.chunk.id, w.lod === "fine" ? "coarse" : "fine"));
        if (target?.art) {
          if (target.state !== "shown") { target.art.setVisible(true); target.state = "shown"; }
          target.lastUsed = frame;
          if (other?.state === "shown") { other.art!.setVisible(false); other.state = "hidden"; other.lastUsed = frame; }
          continue;
        }
        pending++;
        if (other?.art && other.state === "hidden") { other.art.setVisible(true); other.state = "shown"; }
        if (other) other.lastUsed = frame;
      }
      // 6. Evict hidden units, least recently used first.
      const hidden = [...units.values()].filter(u => u.state === "hidden" && u.lastUsed < frame)
        .sort((a, b) => a.lastUsed - b.lastUsed || b.rank - a.rank);
      let bytes = sum(), kept = hidden.length;
      for (const u of hidden) {
        if (bytes.cpu <= budget.cpuBytes && bytes.gpu <= budget.gpuBytes && kept <= budget.retainedUnits) break;
        release(u, "evicted"); kept--;
        bytes = sum();
      }
      let building = 0, prepared = 0, shown = 0, hiddenCount = 0;
      for (const u of units.values()) {
        if (u.state === "building") building++;
        else if (u.state === "prepared") prepared++;
        else if (u.state === "shown") shown++;
        else hiddenCount++;
      }
      last = {
        frame, desired: all.length, withinBudget: desired.size, building, prepared, shown, hidden: hiddenCount,
        cpuBytes: bytes.cpu, gpuBytes: bytes.gpu, shownGpuBytes: bytes.shownGpu, hiddenGpuBytes: bytes.hiddenGpu,
        buildMs, buildSteps: steps, uploads, uploadedBytes, pending, totals: { ...totals },
      };
      return last;
    },
    /** True when, as of the last update, every wanted chunk within `radius`
     * of the viewer shows its desired LOD. */
    isReady(radius = Infinity): boolean {
      return frame > 0 && lastDesired.every(w => w.distance > radius || units.get(key(w.chunk.id, w.lod))?.state === "shown");
    },
    units(): UnitView[] {
      return [...units.values()].map(u => ({ key: u.key, chunk: u.chunk.id, region: u.chunk.region, lod: u.lod,
        state: u.state, ...(({ cpu, gpu }) => ({ cpuBytes: cpu, gpuBytes: gpu }))(bytesOf(u)) }));
    },
    shownRegions(): RegionId[] {
      return [...new Set([...units.values()].filter(u => u.state === "shown").map(u => u.chunk.region))];
    },
    /** After a context loss, hidden buffers are not worth restoring. */
    discardHidden(): void {
      for (const u of [...units.values()]) if (u.state === "hidden") release(u, "evicted");
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const u of [...units.values()]) release(u, u.state === "building" ? "cancelled" : "discarded");
    },
  };
}
export type Residency = ReturnType<typeof createResidency>;
