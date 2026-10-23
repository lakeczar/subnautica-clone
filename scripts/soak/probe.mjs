// The soak's measurement interface. A probe merges what its providers can
// measure into one sample; the soak logic (goals.mjs, run.mjs) only ever reads
// samples, so REC-1's flight recorder plugs in as one more provider without
// changing it.
//
//   provider: { name, async sample(ctx) → partial sample }
//   sample:   { at, memory: { MiB… }, graphics: { counts… }, frames: { count,
//               worstMs, over: [{ ms, where }], attributed, streamingOver: […] },
//               holds: { available, list }, saves: [{ at, savedAt }], unavailable: [] }
//
// Providers available now: CDP heap (before and after a GC), /proc RSS of the
// browser's renderer and GPU processes, the job scope's memory.current and
// memory.peak, the game's #ocean scene counts and residency, rAF gaps, and
// CW-1's per-frame split (window.__siltwakePerf) and cave-hold state where
// the build has them.
import { readdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

const MiB = 1048576;
const merge = (a, b) => {
  for (const [k, v] of Object.entries(b)) {
    if (k === "unavailable") a.unavailable.push(...v);
    else if (v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object") Object.assign(a[k], v);
    else a[k] = v;
  }
  return a;
};

/** A provider's memory and graphics values must be finite numbers: anything
 * else (a missing metric divided into NaN, an absent counter) is dropped and
 * reported as unavailable, never passed on as a measurement (R2-F1). */
function finite(name, part) {
  for (const group of ["memory", "graphics"]) {
    for (const [k, v] of Object.entries(part?.[group] ?? {})) {
      if (typeof v === "number" && Number.isFinite(v)) continue;
      delete part[group][k];
      if (v !== null) (part.unavailable ??= []).push(`${name}: ${k} not measured (got ${String(v)})`);
    }
  }
  return part;
}

export function createProbe(providers) {
  return {
    providers: providers.map((p) => p.name),
    async sample(ctx = {}) {
      const s = { at: ctx.at ?? null, memory: {}, graphics: {}, frames: {}, holds: {}, saves: [], unavailable: [] };
      for (const p of providers) {
        try { merge(s, finite(p.name, await p.sample(ctx))); } catch (e) { s.unavailable.push(`${p.name}: ${e.message.split("\n")[0]}`); }
      }
      return s;
    },
  };
}

/** JS heap from CDP Performance.getMetrics. In a sample taken just after a
 * forced, settled GC (ctx.afterGc; soak.mjs), the heap is the post-GC floor. */
export function cdpHeap(cdp) {
  const heap = async () => (await cdp.send("Performance.getMetrics")).metrics.find((m) => m.name === "JSHeapUsedSize")?.value;
  return {
    name: "cdp-heap",
    async sample(ctx) {
      const bytes = await heap();
      if (!(typeof bytes === "number" && Number.isFinite(bytes) && bytes > 0)) return { unavailable: ["cdp-heap: Performance.getMetrics reported no JSHeapUsedSize"] };
      const v = bytes / MiB;
      return { memory: { jsHeapMiB: v, ...(ctx.afterGc ? { jsHeapAfterGcMiB: v } : {}) } };
    },
  };
}

/** Forces a full GC in the measured page (soak.mjs then settles before sampling). */
export const collectGarbage = (g) => g.cdp.send("HeapProfiler.collectGarbage");

/** Resident memory of the browser's processes: the largest renderer, the GPU
 * process and the whole tree, found from the browser's PID. */
export function processRss(browserPid) {
  const kib = (pid) => { try { return Number(/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, "utf8"))[1]); } catch { return null; } };
  const cmd = (pid) => { try { return readFileSync(`/proc/${pid}/cmdline`, "utf8"); } catch { return ""; } };
  const parent = (pid) => { try { const st = readFileSync(`/proc/${pid}/stat`, "utf8"); return Number(st.slice(st.lastIndexOf(")") + 2).split(" ")[1]); } catch { return null; } };
  return {
    name: "process-rss",
    async sample() {
      const all = readdirSync("/proc").filter((p) => /^\d+$/.test(p)).map(Number);
      const tree = new Set([browserPid]);
      for (let grew = true; grew;) { grew = false; for (const p of all) if (!tree.has(p) && tree.has(parent(p))) { tree.add(p); grew = true; } }
      const procs = [...tree].map((p) => ({ p, c: cmd(p), r: kib(p) })).filter((x) => x.r != null);
      const renderer = procs.filter((x) => x.c.includes("--type=renderer")).map((x) => x.r);
      const gpu = procs.filter((x) => x.c.includes("--type=gpu-process")).map((x) => x.r);
      return { memory: {
        rendererRssMiB: renderer.length ? Math.max(...renderer) / 1024 : null,
        gpuRssMiB: gpu.length ? Math.max(...gpu) / 1024 : null,
        browserTreeRssMiB: procs.reduce((a, x) => a + x.r, 0) / 1024,
      } };
    },
  };
}

/** The heavy-check job scope's memory (the whole soak: browser, driver,
 * server), from this process's cgroup up to its scope. */
export function jobCgroup() {
  return {
    name: "job-cgroup",
    async sample() {
      let dir = `/sys/fs/cgroup${readFileSync("/proc/self/cgroup", "utf8").trim().replace(/^0::/, "")}`;
      while (dir.includes(".scope/")) dir = dirname(dir);
      if (!dir.endsWith(".scope")) return { unavailable: ["job-cgroup: not inside a heavy-check job scope"] };
      const read = (f) => Number(readFileSync(`${dir}/${f}`, "utf8").trim());
      return { memory: { jobCurrentMiB: read("memory.current") / MiB, jobPeakMiB: read("memory.peak") / MiB } };
    },
  };
}

/** The game's own counters on #ocean (renderer.ts): scene objects, resident
 * bytes, the cave hold (CW-1 builds) and the camera position. */
export function oceanDataset(page) {
  return {
    name: "ocean-dataset",
    async sample() {
      const d = await page.evaluate(() => ({ ...document.querySelector("#ocean")?.dataset }));
      const n = (k) => (d[k] != null && d[k] !== "" ? Number(d[k]) : null);
      const out = {
        graphics: { meshes: n("meshes"), materials: n("materials"), textures: n("textures"), geometries: n("geometries"), draws: n("draws"), triangles: n("triangles") },
        memory: { residentCpuMiB: n("residentCpu") != null ? n("residentCpu") / MiB : null, residentGpuMiB: n("residentGpu") != null ? n("residentGpu") / MiB : null },
        where: { camera: d.cameraPosition ?? null, cave: d.cave || null, region: d.regions ?? null },
      };
      if (d.caveHold === undefined) out.holds = { available: false };
      else out.holds = { available: true, state: d.caveHold, held: ["waiting", "loading"].includes(d.caveHold) };
      return out;
    },
  };
}

/**
 * Frame times since the last sample. rAF gaps always (installFrameRecorder);
 * the cause of a long frame only where the build records a per-frame split
 * (CW-1's window.__siltwakePerf: a frame is streaming's when chunk, cave,
 * region and light work is at least half of it, as CW-1's traversal judges).
 */
export function frames(page, { overMs = 33 } = {}) {
  return {
    name: "frames",
    async sample() {
      const f = await page.evaluate((overMs) => {
        const gaps = (window.__soakGaps ?? []).splice(0);
        const perf = Array.isArray(window.__siltwakePerf) ? window.__siltwakePerf.splice(0) : null;
        const streaming = perf ? perf.filter((e) => { const p = e.parts ?? {}; const s = (p.chunks ?? 0) + (p.caves ?? 0) + (p.regions ?? 0) + (p.lights ?? 0); return e.total > overMs && s >= e.total / 2; }).map((e) => e.total) : null;
        // Attributed only if the build actually records its frames (CW-1 and later):
        // an opted-in but empty array while frames ran means it does not.
        const attributed = perf != null && (perf.length > 0 || gaps.length === 0);
        return { count: gaps.length, worstMs: gaps.length ? Math.max(...gaps) : null, over: gaps.filter((g) => g > overMs), attributed, streaming: attributed ? streaming : null, holdFrames: perf ? perf.filter((e) => e.hold).length : null };
      }, overMs);
      return { frames: f };
    },
  };
}

/** Install before navigation (page.addInitScript): records rAF gaps, and
 * opts in to the game's per-frame split where the build supports it. */
export function frameRecorderScript() {
  window.__soakGaps = [];
  window.__siltwakePerf = [];
  let last = 0;
  const loop = (now) => { if (last) window.__soakGaps.push(now - last); last = now; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}

/** The newest save the game committed (autosave or manual), from the save
 * journal in localStorage (src/save/repository.ts): its savedAt and tick. */
export function saveJournal(page) {
  return {
    name: "save-journal",
    async sample() {
      const savedAt = await page.evaluate(() => {
        const raw = localStorage.getItem("siltwake.save.journal.v1");
        if (!raw) return null;
        try {
          const env = JSON.parse(JSON.parse(raw).current); // { format: "siltwake.local", current: <encoded save> }
          return { savedAt: env.meta.savedAt, tick: env.state.tick };
        } catch { return null; }
      });
      return { lastSave: savedAt };
    },
  };
}
