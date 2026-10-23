// REC-1 driver-side recording: drains the game's flight recorder through the
// test hook into `<out>/recording/` (the same files the in-game export holds),
// records the 12 fps 720p video from a CDP screencast (never inside the game in
// test runs), and samples what only the driver can see: the browser's process
// memory and the GPU's. Each consumer of the hook keeps its own cursors, so a
// soak probe can read the same recorder alongside.
//
//   const rec = await startRecording({ page, cdp, pid, out, video: true, meta })
//   …drive…
//   await rec.stop()   // flushes, closes the video, writes header.json
import { spawn, execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import { cdpHeap, processRss } from "../soak/probe.mjs";

export const VIDEO_FPS = 12;
export const VIDEO_SIZE = { width: 1280, height: 720 };
const DRAIN_MS = 1000, SYSTEM_MS = 1000, GPU_MS = 5000, SNAPSHOT_WAIT_MS = 5000;

/** An ffmpeg that encodes MJPEG → VP9 WebM and decodes it back to PNG: the
 * system's, else Playwright's own build (the same binary on both machines). */
export function findFfmpeg() {
  if (process.env.REC_FFMPEG) return process.env.REC_FFMPEG;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? `${process.env.HOME}/.cache/ms-playwright`;
  const pw = existsSync(root) ? readdirSync(root).filter((d) => d.startsWith("ffmpeg-")).sort().reverse().map((d) => path.join(root, d, "ffmpeg-linux")).find(existsSync) : null;
  if (pw) return pw;
  try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return "ffmpeg"; } catch { /* none */ }
  return null;
}

/** GPU name, driver and memory in use (whole GPU, every process), from nvidia-smi where present. */
export function gpuInfo() {
  for (const bin of ["nvidia-smi", "/usr/lib/wsl/lib/nvidia-smi"]) {
    try {
      const [name, driver, used, total] = execFileSync(bin, ["--query-gpu=name,driver_version,memory.used,memory.total", "--format=csv,noheader,nounits"], { encoding: "utf8", timeout: 5000 }).trim().split("\n")[0].split(",").map((s) => s.trim());
      return { name, driver, usedMiB: Number(used), totalMiB: Number(total), tool: bin };
    } catch { /* next */ }
  }
  return null;
}

/** VRAM held by the browser's children (its GPU process): nvidia-smi's
 * per-process table, matched by parent PID. Linux drivers list graphics
 * processes; WSL's lists none (null there). */
export function processVram(browserPid) {
  const parent = (pid) => { try { const st = readFileSync(`/proc/${pid}/stat`, "utf8"); return Number(st.slice(st.lastIndexOf(")") + 2).split(" ")[1]); } catch { return null; } };
  for (const bin of ["nvidia-smi", "/usr/lib/wsl/lib/nvidia-smi"]) {
    let xml;
    try { xml = execFileSync(bin, ["-q", "-x"], { encoding: "utf8", timeout: 5000, maxBuffer: 16 << 20 }); } catch { continue; }
    const procs = [...xml.matchAll(/<process_info>[\s\S]*?<pid>(\d+)<\/pid>[\s\S]*?<used_memory>(\d+) MiB<\/used_memory>/g)].map((m) => ({ pid: Number(m[1]), mib: Number(m[2]) }));
    if (!procs.length) return null;
    const ours = procs.filter((p) => p.pid === browserPid || parent(p.pid) === browserPid);
    return ours.length ? ours.reduce((a, p) => a + p.mib, 0) : null;
  }
  return null;
}

/**
 * opts: { page, cdp, pid (browser), out, video (bool), meta: { machine label,
 * commit, … }, gpuBaseline (gpuInfo before launch) }
 */
export async function startRecording(opts) {
  const { page, cdp, out } = opts, dir = path.join(out, "recording");
  mkdirSync(path.join(dir, "snapshots"), { recursive: true });
  const header = await page.evaluate(() => window.__siltwake.recorder?.header() ?? null);
  if (!header) throw new Error("the game's flight recorder is off (open it with ?rec=driver)");
  const pageOrigin = header.pageOrigin, pageNow = () => Date.now() - pageOrigin;
  const cursors = { frames: 0, samples: 0, events: 0, snapshots: 0 }, lost = { frames: 0, samples: 0, events: 0, snapshots: 0 };
  const append = (file, items) => { if (items.length) appendFileSync(path.join(dir, file), items.map((x) => JSON.stringify(x)).join("\n") + "\n"); };
  let draining = Promise.resolve(), stopped = false, snapshotsWritten = 0, snapshotsMissing = 0;

  async function drain(final = false) {
    const got = await page.evaluate((c) => {
      const r = window.__siltwake.recorder;
      return { frames: r.frames(c.frames), samples: r.samples(c.samples), events: r.events(c.events), snapshots: r.snapshots(c.snapshots) };
    }, cursors);
    for (const k of ["frames", "samples", "events"]) { cursors[k] = got[k].next; lost[k] += got[k].lost; }
    lost.snapshots += got.snapshots.lost;
    append("frames.ndjson", got.frames.rows);
    append("samples.ndjson", got.samples.items);
    append("events.ndjson", got.events.items);
    // A snapshot still being encoded is read on a later drain; one still absent after SNAPSHOT_WAIT_MS is missing.
    let done = got.snapshots.next - got.snapshots.items.length, last = null;
    // A failed picture is recorded as missing at once (R1-S4); a pending one waits for a later drain.
    for (const s of got.snapshots.items) {
      const { data, state } = await page.evaluate(async (seq) => ({ data: await window.__siltwake.recorder.snapshot(seq), state: window.__siltwake.recorder.snapshotState?.(seq) }), s.seq);
      if (!data && state === "pending" && final !== true && pageNow() - s.t < SNAPSHOT_WAIT_MS) break;
      if (data) { writeFileSync(path.join(dir, s.file), Buffer.from(data, "base64")); snapshotsWritten++; } else snapshotsMissing++;
      append("snapshots.ndjson", [{ ...s, ...(data ? {} : { missing: state === "failed" ? "encoding failed" : state === "pending" ? "not encoded within the wait" : "released before the driver read it" }) }]);
      done++; last = s.seq;
    }
    cursors.snapshots = done;
    if (last !== null) await page.evaluate((seq) => window.__siltwake.recorder.release(seq), last);
  }

  // System: the tab's and the GPU's memory, on the page clock, through the
  // soak's own providers (scripts/soak/probe.mjs), not a second copy of them.
  const gpu0 = opts.gpuBaseline ?? null;
  const rss = processRss(opts.pid), heapProvider = cdpHeap(cdp);
  let lastGpu = 0;
  async function system() {
    const row = { t: Math.round(pageNow()) };
    if (opts.pid) Object.assign(row, (await rss.sample()).memory);
    try { Object.assign(row, (await heapProvider.sample({})).memory ?? {}); } catch { /* closed */ }
    if (Date.now() - lastGpu >= GPU_MS) {
      lastGpu = Date.now();
      const g = gpuInfo(); if (g) row.gpuUsedMiB = g.usedMiB;
      // This browser's own VRAM, where the driver lists processes (not under WSL).
      const v = opts.pid ? processVram(opts.pid) : null; if (v != null) row.browserVramMiB = v;
    }
    append("system.ndjson", [row]);
  }

  // Video: screencast frames onto a fixed 12 fps grid (the latest frame at or
  // before each slot), piped as MJPEG into ffmpeg → VP9 WebM.
  let video = null;
  if (opts.video) {
    const ffmpeg = findFfmpeg();
    if (!ffmpeg) video = { missing: "no ffmpeg (system or Playwright's: `npx playwright-core install ffmpeg`)" };
    else {
      const proc = spawn(ffmpeg, ["-hide_banner", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(VIDEO_FPS), "-i", "pipe:0",
        "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1", "-b:v", "900k", "-pix_fmt", "yuv420p", "-y", path.join(dir, "video.webm")],
      { stdio: ["pipe", "ignore", "pipe"] });
      let err = "";
      proc.stderr.on("data", (d) => { err += d; });
      const done = new Promise((r) => proc.on("close", (code) => r(code)));
      video = { proc, done, err: () => err, t0: null, slot: 0, last: null, frames: 0, written: 0, dropped: 0 };
      const step = 1000 / VIDEO_FPS;
      cdp.on("Page.screencastFrame", (f) => {
        cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
        if (stopped) return;
        const t = f.metadata.timestamp * 1000 - pageOrigin, jpeg = Buffer.from(f.data, "base64");
        video.frames++;
        if (video.t0 === null) video.t0 = t;
        // Fill every slot up to this frame's time with the previous frame.
        while (video.last && video.t0 + video.slot * step < t) { if (!proc.stdin.write(video.last)) video.dropped++; video.slot++; video.written++; }
        video.last = jpeg;
      });
      await cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, maxWidth: VIDEO_SIZE.width, maxHeight: VIDEO_SIZE.height, everyNthFrame: 5 });
    }
  }

  const drainTimer = setInterval(() => { draining = draining.then(drain).catch(() => {}); }, DRAIN_MS);
  const systemTimer = setInterval(() => { draining = draining.then(system).catch(() => {}); }, SYSTEM_MS);
  const started = { at: new Date().toISOString(), page: pageNow() };

  return {
    dir, header,
    /** A driver's own event on the recording (a segment start, a cave reached). */
    mark: (text, detail) => page.evaluate(([t, d]) => window.__siltwake.recorder.mark(t, d), [text, detail ?? null]),
    async stop(extra = {}) {
      clearInterval(drainTimer); clearInterval(systemTimer);
      await draining;
      if (video?.proc) {
        await cdp.send("Page.stopScreencast").catch(() => {});
        stopped = true;
        if (video.last) { video.proc.stdin.write(video.last); video.written++; }
        video.proc.stdin.end();
      }
      try { await new Promise((r) => setTimeout(r, 1500)); await drain(true); await system(); } catch { /* the page may be gone */ }
      const code = video?.proc ? await video.done : null;
      const overhead = await page.evaluate(() => window.__siltwake.recorder.overhead()).catch(() => null);
      const g = gpuInfo();
      const full = {
        ...header,
        machine: { host: hostname(), label: opts.meta?.machine ?? hostname(), ...(opts.meta?.machineNote ? { note: opts.meta.machineNote } : {}) },
        gpuDevice: g ? { name: g.name, driver: g.driver, totalMiB: g.totalMiB, baselineUsedMiB: gpu0?.usedMiB ?? null, tool: g.tool } : null,
        chrome: opts.meta?.chrome ?? null, commit: opts.meta?.commit ?? header.build?.commit ?? null,
        run: { ...opts.meta, startedAt: started.at, pageStart: Math.round(started.page), pageEnd: Math.round(pageNow()), ...extra },
        video: video?.proc ? { source: "cdp-screencast", fps: VIDEO_FPS, size: VIDEO_SIZE, file: "video.webm", start: video.t0 === null ? null : Math.round(video.t0),
          screencastFrames: video.frames, writtenFrames: video.written, ffmpegExit: code, ...(code ? { error: video.err().slice(0, 500) } : {}) }
          : video?.missing ? { missing: video.missing } : header.video ?? null,
        drained: { cursors, lost, snapshotsWritten, snapshotsMissing },
        recorderOverhead: overhead,
      };
      writeFileSync(path.join(dir, "header.json"), JSON.stringify(full, null, 1));
      return full;
    },
  };
}
