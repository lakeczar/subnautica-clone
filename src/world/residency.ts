import type { ChunkDescriptor, ChunkId, LodLevel, RegionId, Vec3, WorldMap } from "./types.js";

/** Art the loader finished building on the CPU but has not uploaded. */
export interface PreparedArt {
  readonly cpuBytes: number;
  /** Bytes the upload will put on the GPU. Reserved against the budget from
   * the moment the recipe exists. */
  readonly gpuBytes: number;
  /** Atomic upload. Used when `beginUpload` is absent. */
  upload(): ResidentArt;
  /** Incremental upload in bounded parts. Preferred when present. */
  beginUpload?(): UploadJob;
  discard(): void;
}
/** An upload in progress. Parts already uploaded stay hidden until `finish`. */
export interface UploadJob {
  /** Upload whole parts while they fit in `maxBytes`; when `force`, upload at
   * least one part regardless. Returns the bytes uploaded by this call. */
  step(maxBytes: number, force: boolean): number;
  readonly done: boolean;
  readonly uploadedBytes: number;
  /** The finished art (only once `done`). */
  finish(): ResidentArt;
  /** Dispose every part uploaded so far. The residency then discards the
   * recipe; a finished job's recipe is consumed by its art instead. */
  cancel(): void;
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
  /** CPU bytes: build reservations, prepared recipes and resident copies. */
  readonly cpuBytes: number;
  /** GPU bytes: resident art plus reservations for recipes awaiting upload. */
  readonly gpuBytes: number;
  /** Upload cap per frame. With incremental uploads only a single part larger
   * than the cap can exceed it (reported as `uploadOverrunBytes`). */
  readonly uploadBytesPerFrame: number;
  /** Time cap on uploads per frame, alongside the byte cap (always one part). */
  readonly uploadMsPerFrame: number;
  readonly buildMsPerFrame: number;
  /** Partially built units allowed at once. */
  readonly maxInFlight: number;
  /** Hidden units kept for warm returns, within the byte budget. */
  readonly retainedUnits: number;
  /** CPU reserved for a unit under construction, as a multiple of its
   * expected recipe bytes (staging arrays exist while it builds). */
  readonly constructionFactor: number;
}
export const DEFAULT_BUDGET: ResidencyBudget = {
  cpuBytes: 256 * 1024 * 1024,
  gpuBytes: 256 * 1024 * 1024,
  uploadBytesPerFrame: 4 * 1024 * 1024,
  uploadMsPerFrame: 4,
  buildMsPerFrame: 4,
  maxInFlight: 2,
  retainedUnits: 48,
  constructionFactor: 1,
};
/** Cost guesses before a chunk/LOD has been built once. After that its exact
 * cost is known: recipes are deterministic per descriptor. */
export const DEFAULT_ESTIMATE: Record<LodLevel, { cpu: number; gpu: number }> = {
  fine: { cpu: 1024 * 1024, gpu: 1024 * 1024 },
  coarse: { cpu: 256 * 1024, gpu: 256 * 1024 },
};

export type UnitState = "building" | "prepared" | "uploading" | "shown" | "hidden";
export interface UnitView {
  readonly key: string;
  readonly chunk: ChunkId;
  readonly region: RegionId;
  readonly lod: LodLevel;
  readonly state: UnitState;
  /** Accounted bytes: reservation, recipe or resident art. */
  readonly cpuBytes: number;
  readonly gpuBytes: number;
}
export interface RefusedUnit {
  readonly chunk: ChunkId;
  readonly lod: LodLevel;
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
  readonly uploading: number;
  readonly shown: number;
  readonly hidden: number;
  /** Accounted bytes (always >= what is allocated): the budget applies here. */
  readonly cpuBytes: number;
  readonly gpuBytes: number;
  /** GPU bytes actually allocated: resident art plus uploaded parts. */
  readonly gpuAllocatedBytes: number;
  readonly shownGpuBytes: number;
  readonly hiddenGpuBytes: number;
  /** True if accounted bytes exceeded the budget at the end of this frame. */
  readonly overBudget: boolean;
  /** Chunks whose fine unit alone exceeds the share and were shown coarse. */
  readonly demoted: number;
  /** Chunks kept at their drawn LOD because the swap to the wanted LOD does
   * not fit beside it: degraded, not a hole. */
  readonly held: number;
  /** Wanted chunks beyond the budget frontier (or not fitting the share left
   * by external owners): not drawn this frame. */
  readonly cut: number;
  /** All admitted work is done, nothing is over budget and no retention
   * eviction is pending: nothing changes until the viewer, the budget or the
   * external share does. True in a stable degraded state (held/cut/refused);
   * `isReady` is not. */
  readonly settled: boolean;
  /** Chunks whose measured coarse (or only) LOD exceeds the whole budget:
   * not rebuilt, not drawn. */
  readonly refused: readonly RefusedUnit[];
  /** Builds not started this frame because their reservation did not fit. */
  readonly deferred: number;
  readonly buildMs: number;
  readonly buildSteps: number;
  /** Longest single build step this frame: a factory that overruns its
   * slice shows up here, not as a mystery hitch. */
  readonly maxStepMs: number;
  /** The unit (chunk and LOD) whose build step was `maxStepMs`. */
  readonly maxStepUnit: string | null;
  readonly uploadMs: number;
  readonly uploads: number;
  readonly uploadedBytes: number;
  readonly uploadOverrunBytes: number;
  /** Desired units not yet shown at their desired LOD. */
  readonly pending: number;
  readonly totals: { readonly built: number; readonly uploaded: number; readonly cancelled: number;
    readonly evicted: number; readonly discarded: number; readonly overBudgetDiscards: number };
}

/** Metres of rank a priority point is worth: a refuge (priority 1) loads as
 * if it were this much closer, and is evicted as if it were that much nearer. */
const PRIORITY_METRES = 64;
/** Hidden units released per frame when only the retained count is over. */
const MAX_TRIMS_PER_FRAME = 1;

interface Bytes { cpu: number; gpu: number }
interface Unit {
  readonly key: string;
  readonly chunk: ChunkDescriptor;
  readonly lod: LodLevel;
  state: UnitState;
  build: Generator<void, PreparedArt> | null;
  /** CPU/GPU reserved while building. */
  reserve: Bytes;
  prepared: PreparedArt | null;
  job: UploadJob | null;
  art: ResidentArt | null;
  rank: number;
  lastUsed: number;
}
interface Want { readonly chunk: ChunkDescriptor; readonly lod: LodLevel; readonly rank: number; readonly distance: number }
const other = (lod: LodLevel): LodLevel => (lod === "fine" ? "coarse" : "fine");

/** Byte-budgeted chunk residency. Every unit is accounted from the moment it
 * exists: a reservation while it builds, its recipe once prepared (CPU, plus
 * the GPU bytes its upload will take), its art once resident. Each `update`:
 * 1. picks the wanted chunk/LOD pairs (distance bands with hysteresis), then
 *    walks them nearest first, adding each unit's cost (exact once built
 *    before; a conservative estimate otherwise) and the outgoing LOD a swap
 *    keeps drawn, and stops where the budget is full. A unit too large for
 *    the whole budget falls back to coarse, or is refused and reported;
 * 2. cancels builds, uploads and recipes that are no longer wanted;
 * 3. starts builds only if their reservation fits (evicting hidden art
 *    first), and re-checks the actual recipe when a build completes;
 * 4. uploads within `uploadBytesPerFrame`/`uploadMsPerFrame` in parts;
 * 5. shows each wanted chunk at its LOD, keeping the previous LOD visible
 *    until the new one is ready;
 * 6. evicts hidden units least recently used first, over the byte budget or
 *    the retained count, and as a last resort drops the farthest shown units.
 * At the end of every update, accounted bytes are within budget unless
 * `overBudget` says otherwise. Presentation only: never touches simulation. */
export function createResidency(options: {
  map: WorldMap;
  loader: ChunkLoader;
  budget?: Partial<ResidencyBudget>;
  now?: () => number;
  /** Cost guesses per LOD before any unit of that LOD has been measured. */
  estimate?: Partial<Record<LodLevel, { cpu: number; gpu: number }>>;
}) {
  const { map, loader } = options;
  const budget: ResidencyBudget = { ...DEFAULT_BUDGET, ...options.budget };
  const now = options.now ?? (() => performance.now());
  const units = new Map<string, Unit>();
  const reach = Math.max(0, ...map.layout.chunks.map(c => c.lod.coarse + c.lod.hysteresis));
  // Per-LOD guess for units never built: the configured estimate, then the
  // running mean of measured units. Only a probe's reservation uses it; the
  // budget itself is enforced by the post-build re-check, so one heavy chunk
  // must not make every unknown chunk look too big to try.
  const guess: Record<LodLevel, Bytes & { n: number }> = {
    fine: { ...DEFAULT_ESTIMATE.fine, ...options.estimate?.fine, n: 0 },
    coarse: { ...DEFAULT_ESTIMATE.coarse, ...options.estimate?.coarse, n: 0 },
  };
  const known = new Map<string, Bytes>();
  /** Bytes held outside this residency against the same budget (e.g. the
   * interim legacy region owners). Counted first, before any chunk. */
  let external: Bytes = { cpu: 0, gpu: 0 };
  const totals = { built: 0, uploaded: 0, cancelled: 0, evicted: 0, discarded: 0, overBudgetDiscards: 0 };
  let frame = 0, disposed = false;
  let last: ResidencyStats | null = null;
  /** Every wanted chunk this frame with the LOD it should show (after
   * demotion), or null when refused. `isReady` checks these, not only the
   * admitted set, so a cut or held chunk is never reported ready. */
  let lastTargets: { readonly chunk: ChunkId; readonly lod: LodLevel | null; readonly distance: number }[] = [];
  const key = (id: ChunkId, lod: LodLevel): string => `${id}@${lod}`;
  const resident = (u: Unit | undefined): boolean => u?.state === "shown" || u?.state === "hidden";
  const shownOf = (id: ChunkId): Unit | undefined => {
    for (const lod of ["fine", "coarse"] as const) {
      const u = units.get(key(id, lod));
      if (u?.state === "shown") return u;
    }
    return undefined;
  };
  /** Room left for chunks once external owners are counted. */
  const share = (): Bytes => ({ cpu: budget.cpuBytes - external.cpu, gpu: budget.gpuBytes - external.gpu });
  /** Exact cost once built before; otherwise the guess clamped to the share
   * left after external owners, so an unmeasured unit is built once to learn
   * its size and never refused on a guess. Refusal only ever acts on measured
   * costs, and only against the whole budget (a permanent condition). */
  const estimate = (id: ChunkId, lod: LodLevel): Bytes & { exact: boolean } => {
    const k = known.get(key(id, lod));
    if (k) return { ...k, exact: true };
    const room = share();
    return { cpu: Math.max(0, Math.min(guess[lod].cpu, room.cpu / budget.constructionFactor)),
      gpu: Math.max(0, Math.min(guess[lod].gpu, room.gpu)), exact: false };
  };
  /** What admitting this chunk/LOD costs now: the live unit's accounting if
   * it exists, else the (scaled) reservation a build would take. */
  const need = (id: ChunkId, lod: LodLevel): Bytes => {
    const u = units.get(key(id, lod));
    if (u) return cost(u);
    const e = estimate(id, lod);
    return { cpu: e.cpu * budget.constructionFactor, gpu: e.gpu };
  };
  const learn = (u: Unit, b: Bytes): void => {
    const k = known.get(u.key);
    const m = { cpu: Math.max(b.cpu, k?.cpu ?? 0), gpu: Math.max(b.gpu, k?.gpu ?? 0) };
    if (!k) {
      const g = guess[u.lod], n = g.n + 1;
      guess[u.lod] = { cpu: g.n ? g.cpu + (m.cpu - g.cpu) / n : m.cpu, gpu: g.n ? g.gpu + (m.gpu - g.gpu) / n : m.gpu, n };
    }
    known.set(u.key, m);
  };
  /** What a unit counts against the budget right now. */
  const cost = (u: Unit): Bytes => {
    if (u.art) return { cpu: u.art.cpuBytes, gpu: u.art.gpuBytes };
    if (u.prepared) return { cpu: u.prepared.cpuBytes, gpu: u.prepared.gpuBytes };
    return { cpu: u.reserve.cpu * budget.constructionFactor, gpu: u.reserve.gpu };
  };
  const accounted = (): Bytes => {
    let cpu = external.cpu, gpu = external.gpu;
    for (const u of units.values()) { const c = cost(u); cpu += c.cpu; gpu += c.gpu; }
    return { cpu, gpu };
  };
  const fits = (b: Bytes, extra: Bytes = { cpu: 0, gpu: 0 }): boolean =>
    b.cpu + extra.cpu <= budget.cpuBytes && b.gpu + extra.gpu <= budget.gpuBytes;
  const release = (u: Unit, counter: keyof typeof totals): void => {
    if (u.build) { u.build.return(undefined as never); u.build = null; }
    if (u.job) { u.job.cancel(); u.job = null; }
    if (u.prepared) { u.prepared.discard(); u.prepared = null; }
    if (u.art) { u.art.dispose(); u.art = null; }
    units.delete(u.key);
    totals[counter]++;
  };
  /** Evict hidden, unprotected units (LRU) until `need` more bytes fit. */
  const makeRoom = (need: Bytes, protectedKeys: ReadonlySet<string>): boolean => {
    if (fits(accounted(), need)) return true;
    const hidden = [...units.values()].filter(u => u.state === "hidden" && !protectedKeys.has(u.key))
      .sort((a, b) => a.lastUsed - b.lastUsed || b.rank - a.rank);
    for (const u of hidden) {
      release(u, "evicted");
      if (fits(accounted(), need)) return true;
    }
    return false;
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
    /** Declare bytes held outside this residency under the same budget. The
     * next update leaves that room: the frontier starts from it, admission
     * and eviction count it. Shown chunks are dropped farthest first if the
     * external share grows past what remains. */
    setExternalBytes(bytes: { cpu: number; gpu: number }): void { external = { cpu: bytes.cpu, gpu: bytes.gpu }; },
    update(viewer: Readonly<Vec3>): ResidencyStats {
      if (disposed) throw new Error("Residency is disposed.");
      frame++;
      const all = wants(viewer);
      const swapping = new Set<string>();
      const reserveFor = new Map<string, Bytes>();
      // 1. Frontier, nearest first. Per chunk: pick the target LOD (demoting
      //    a fine unit whose cost exceeds the share to coarse; refusing a
      //    chunk only when a measured cost exceeds the whole budget), then
      //    admit what fits:
      //    - target already resident: its cost;
      //    - other LOD drawn and resident: target + outgoing if the swap
      //      fits; else keep the outgoing LOD drawn ("held", degraded but
      //      never a hole); else, if the target alone fits, replace it (the
      //      outgoing art becomes evictable, a brief hole is unavoidable);
      //    - nothing resident: the target's reservation.
      //    The first chunk that cannot be admitted at all ends admission
      //    ("cut"); later chunks are only classified, so the drawn set stays
      //    the nearest set that fits.
      const desired = new Map<string, Want>();
      const refused: RefusedUnit[] = [];
      const targets: typeof lastTargets = [];
      let demoted = 0, held = 0, cut = 0, full = false;
      const sum: Bytes = { ...external };
      const room = share();
      // No share left (external owners take it all): nothing is admitted.
      const inShare = (c: Bytes): boolean => room.cpu > 0 && room.gpu > 0 && c.cpu <= room.cpu && c.gpu <= room.gpu;
      const inBudget = (c: Bytes): boolean => c.cpu <= budget.cpuBytes && c.gpu <= budget.gpuBytes;
      for (const want of all) {
        let w = want;
        let c = need(w.chunk.id, w.lod);
        if (!inShare(c)) {
          const coarse = need(w.chunk.id, "coarse");
          if (w.lod === "fine" && inShare(coarse)) { w = { ...w, lod: "coarse" }; c = coarse; demoted++; }
          else {
            const tried = w.lod === "fine" ? "coarse" as const : w.lod;
            const t = estimate(w.chunk.id, tried), tc = need(w.chunk.id, tried);
            if (t.exact && !inBudget(tc)) {
              refused.push({ chunk: w.chunk.id, lod: tried, cpuBytes: t.cpu, gpuBytes: t.gpu });
              targets.push({ chunk: w.chunk.id, lod: null, distance: w.distance });
              continue;
            }
            // Fits the budget but not what external owners leave: wait.
            targets.push({ chunk: w.chunk.id, lod: tried, distance: w.distance });
            cut++; full = true;
            continue;
          }
        }
        targets.push({ chunk: w.chunk.id, lod: w.lod, distance: w.distance });
        if (full) { cut++; continue; }
        const tk = key(w.chunk.id, w.lod);
        const target = units.get(tk), outgoing = units.get(key(w.chunk.id, other(w.lod)));
        // A unit never measured is probed with whatever room remains here
        // (never the largest unit seen elsewhere): built once, re-checked
        // when its recipe exists, then costed exactly.
        const probing = !target && !known.has(tk);
        const none = { cpu: 0, gpu: 0 };
        /** Admit `b` for the target (clamped when probing) plus `extra`
         * bytes of already-resident art, which are never clamped. */
        const add = (b: Bytes, extra: Bytes = none, forTarget = true): boolean => {
          let t = b;
          if (probing && forTarget) {
            const left = { cpu: budget.cpuBytes - sum.cpu - extra.cpu, gpu: budget.gpuBytes - sum.gpu - extra.gpu };
            if (left.cpu <= 0 || left.gpu <= 0) return false;
            t = { cpu: Math.min(b.cpu, left.cpu), gpu: Math.min(b.gpu, left.gpu) };
          }
          if (!fits({ cpu: sum.cpu + t.cpu + extra.cpu, gpu: sum.gpu + t.gpu + extra.gpu })) return false;
          sum.cpu += t.cpu + extra.cpu; sum.gpu += t.gpu + extra.gpu;
          if (probing && forTarget) reserveFor.set(tk, { cpu: t.cpu / budget.constructionFactor, gpu: t.gpu });
          return true;
        };
        if (resident(target) || !resident(outgoing)) {
          if (add(c)) desired.set(tk, w);
          else { cut++; full = true; }
          continue;
        }
        const o = cost(outgoing!);
        if (add(c, o)) {
          desired.set(tk, w);
          swapping.add(key(w.chunk.id, other(w.lod)));
        } else if (add(none, o, false)) {
          desired.set(key(w.chunk.id, other(w.lod)), { ...w, lod: other(w.lod) });
          held++;
        } else if (add(c)) desired.set(tk, w);
        else { cut++; full = true; }
      }
      lastTargets = targets;
      const desiredChunks = new Set([...desired.values()].map(w => w.chunk.id));
      // Protected this frame: admitted units and the outgoing LODs whose
      // swap headroom was paid for. A replaced outgoing LOD is not protected.
      const protectedKeys = new Set<string>([...desired.keys(), ...swapping]);
      // 2. Drop unwanted work; ranks refresh for what remains.
      for (const u of [...units.values()]) {
        const w = desired.get(u.key);
        if (w) { u.rank = w.rank; u.lastUsed = frame; continue; }
        if (u.state === "building") release(u, "cancelled");
        else if (u.state === "prepared" || u.state === "uploading") release(u, "discarded");
        else if (u.state === "shown" && !(desiredChunks.has(u.chunk.id) && protectedKeys.has(u.key))) {
          u.art!.setVisible(false); u.state = "hidden"; u.lastUsed = frame;
        }
      }
      // 3. Builds, nearest first, within the time slice. A new build starts
      //    only when its reservation fits; a finished one is re-checked.
      const start = now();
      let steps = 0, maxStepMs = 0, deferred = 0, maxStepUnit: string | null = null;
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
          const reserve = reserveFor.get(k) ?? estimate(w.chunk.id, w.lod);
          if (!makeRoom({ cpu: reserve.cpu * budget.constructionFactor, gpu: reserve.gpu }, protectedKeys)) { deferred++; continue; }
          u = { key: k, chunk: w.chunk, lod: w.lod, state: "building", build: loader.build(w.chunk, w.lod), reserve,
            prepared: null, job: null, art: null, rank: w.rank, lastUsed: frame };
          units.set(k, u);
        }
        while (u.build) {
          const before = now();
          const r = u.build.next();
          const stepMs = now() - before;
          if (stepMs > maxStepMs) { maxStepMs = stepMs; maxStepUnit = u.key; }
          steps++;
          if (r.done) {
            u.build = null; u.prepared = r.value; u.state = "prepared"; totals.built++;
            learn(u, { cpu: r.value.cpuBytes, gpu: r.value.gpuBytes });
            // Actual cost replaces the reservation: if it no longer fits,
            // make room from hidden art or drop the recipe (cost now known).
            if (!fits(accounted()) && !makeRoom({ cpu: 0, gpu: 0 }, protectedKeys)) {
              release(u, "overBudgetDiscards");
            }
          } else if (now() - start >= budget.buildMsPerFrame) break;
        }
      }
      const buildMs = now() - start;
      const discardsBefore = totals.overBudgetDiscards;
      // 4. Uploads, nearest first, in parts within the byte and time caps.
      //    Their GPU bytes are already reserved, so admission held at step 3.
      let uploads = 0, uploadedBytes = 0, uploadOverrunBytes = 0;
      const uploadStart = now();
      const ready = [...units.values()].filter(u => u.state === "prepared" || u.state === "uploading")
        .sort((a, b) => a.rank - b.rank);
      for (const u of ready) {
        const first = uploadedBytes === 0;
        const room = budget.uploadBytesPerFrame - uploadedBytes;
        if (!first && (room <= 0 || now() - uploadStart >= budget.uploadMsPerFrame)) break;
        const prepared = u.prepared!;
        if (prepared.beginUpload) {
          u.job ??= prepared.beginUpload();
          u.state = "uploading";
          const bytes = u.job.step(Math.max(0, room), first);
          uploadedBytes += bytes;
          if (!u.job.done) { if (bytes === 0) break; continue; }
          u.art = u.job.finish(); u.job = null;
        } else {
          if (!first && prepared.gpuBytes > room) break;
          u.art = prepared.upload();
          uploadedBytes += prepared.gpuBytes;
        }
        // An uploaded recipe is consumed by its art: no discard.
        u.prepared = null;
        u.art.setVisible(false);
        u.state = "hidden";
        uploads++; totals.uploaded++;
        learn(u, { cpu: u.art.cpuBytes, gpu: u.art.gpuBytes });
      }
      uploadOverrunBytes = Math.max(0, uploadedBytes - budget.uploadBytesPerFrame);
      const uploadMs = now() - uploadStart;
      // 5. Display: the desired LOD once it exists; until then keep whatever
      //    this chunk already shows, or bring back a hidden other LOD.
      let pending = 0;
      for (const w of desired.values()) {
        const target = units.get(key(w.chunk.id, w.lod));
        const fallback = units.get(key(w.chunk.id, other(w.lod)));
        if (target?.art) {
          if (target.state !== "shown") { target.art.setVisible(true); target.state = "shown"; }
          target.lastUsed = frame;
          if (fallback?.state === "shown") { fallback.art!.setVisible(false); fallback.state = "hidden"; fallback.lastUsed = frame; }
          continue;
        }
        pending++;
        if (!fallback || !protectedKeys.has(fallback.key)) continue;
        if (fallback.art && fallback.state === "hidden") { fallback.art.setVisible(true); fallback.state = "shown"; }
        fallback.lastUsed = frame;
      }
      // 6. Evict hidden units (LRU) over the budget or retained count. Units
      //    shown or hidden this frame wait one frame unless bytes force it.
      const hidden = [...units.values()].filter(u => u.state === "hidden")
        .sort((a, b) => a.lastUsed - b.lastUsed || b.rank - a.rank);
      let kept = hidden.length, trimmed = 0;
      for (const u of hidden) {
        const overBytes = !fits(accounted());
        if (!overBytes && (kept <= budget.retainedUnits || u.lastUsed >= frame)) break;
        if (!overBytes && protectedKeys.has(u.key)) continue;
        // Trimming retention past the count is spread over frames (CW-1: a
        // fast traversal dropped several chunks' meshes in one 100 ms frame);
        // bytes over budget still evict at once.
        if (!overBytes && trimmed >= MAX_TRIMS_PER_FRAME) break;
        release(u, "evicted"); kept--;
        if (!overBytes) trimmed++;
      }
      // Last resort (art larger than its recipe said): drop the farthest
      // shown and in-progress units until the budget holds again.
      if (!fits(accounted())) {
        const far = [...units.values()].filter(u => u.state !== "hidden").sort((a, b) => b.rank - a.rank);
        for (const u of far) {
          if (fits(accounted())) break;
          release(u, "overBudgetDiscards");
        }
      }
      const bytes = accounted();
      // Hidden units over the retained count that waited this frame are
      // evicted next frame: until then the state is still changing.
      let evictable = 0;
      for (const u of units.values()) if (u.state === "hidden" && !protectedKeys.has(u.key)) evictable++;
      let building = 0, prepared = 0, uploading = 0, shown = 0, hiddenCount = 0;
      let gpuAllocatedBytes = 0, shownGpuBytes = 0, hiddenGpuBytes = 0;
      for (const u of units.values()) {
        if (u.state === "building") building++;
        else if (u.state === "prepared") prepared++;
        else if (u.state === "uploading") uploading++;
        else if (u.state === "shown") shown++;
        else hiddenCount++;
        if (u.art) gpuAllocatedBytes += u.art.gpuBytes;
        if (u.job) gpuAllocatedBytes += u.job.uploadedBytes;
        if (u.state === "shown") shownGpuBytes += u.art!.gpuBytes;
        if (u.state === "hidden") hiddenGpuBytes += u.art!.gpuBytes;
      }
      last = {
        frame, desired: all.length, withinBudget: desired.size, building, prepared, uploading, shown, hidden: hiddenCount,
        cpuBytes: bytes.cpu, gpuBytes: bytes.gpu, gpuAllocatedBytes, shownGpuBytes, hiddenGpuBytes,
        overBudget: !fits(bytes), demoted, held, cut, refused, deferred,
        // Nothing in flight and nothing learned this frame: a build that
        // completed may still reveal room for chunks cut this frame.
        settled: fits(bytes) && building + prepared + uploading === 0 && pending === 0 && steps === 0 && uploads === 0 &&
          totals.overBudgetDiscards === discardsBefore && evictable <= budget.retainedUnits,
        buildMs, buildSteps: steps, maxStepMs, maxStepUnit, uploadMs, uploads, uploadedBytes, uploadOverrunBytes, pending,
        totals: { ...totals },
      };
      return last;
    },
    /** True when, as of the last update, the accounted bytes are within
     * budget and every wanted chunk within `radius` shows its target LOD. A
     * chunk demoted to coarse is ready at coarse. A refused, cut (no room) or
     * held (kept at its old LOD) chunk is never ready: under byte pressure
     * pass the radius that must be complete, or read `stats.settled`. */
    isReady(radius = Infinity): boolean {
      if (frame === 0 || !last || last.overBudget) return false;
      return lastTargets.every(t => t.distance > radius ||
        (t.lod !== null && units.get(key(t.chunk, t.lod))?.state === "shown"));
    },
    units(): UnitView[] {
      return [...units.values()].map(u => ({ key: u.key, chunk: u.chunk.id, region: u.chunk.region, lod: u.lod,
        state: u.state, ...(({ cpu, gpu }) => ({ cpuBytes: cpu, gpuBytes: gpu }))(cost(u)) }));
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
