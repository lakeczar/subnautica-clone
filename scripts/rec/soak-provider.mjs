// REC-1 providers for SCHED-2's soak probe (scripts/soak/probe.mjs:
// `{ name, async sample(ctx) → partial sample }`, validated by measure.mjs).
// The game must run with the recorder in driver mode (`?rec=driver`).
//
// - flightFrames(page): a drop-in for probe.mjs `frames(page)`. Per-frame
//   records come from the flight recorder through this provider's own cursor
//   (no reader takes another's data): { total: the game's frame work,
//   parts: { chunks, caves, regions, lights }, hold: CaveHold.state | null }.
//   rAF gaps stay the soak's own (`window.__soakGaps`, tagged by its excluded
//   windows); where that script is absent, the recorder's gaps are used,
//   untagged (`excluded: false`).
// - flightRecorder(page): graphics counts, the game's streamed-byte estimate,
//   the polled hold state, where the player is, and the recorder's own
//   overhead and lost-row counts (`recorder`), from its samples.
//
// - soakRecording(out, meta): the soak's video (CDP screencast, 12 fps 720p)
//   and an evidence pack of the whole soak in `out`, started on the first sample.
// Wiring (scripts/soak/run.mjs): `flightFrames` in `tick` (in place of
// `frames`), `flightRecorder` and the recording's provider in `full`, and
// `finish()` after the soak. An automated browser runs the recorder in
// driver mode unless the URL names another.
export function flightFrames(page, { overMs = 33 } = {}) {
  let cursor = 0;
  /** A build without the recorder: CW-1's per-frame array, as probe.mjs frames() reads it. */
  const legacy = async () => {
    const raw = await page.evaluate(() => {
      const gaps = (window.__soakGaps ?? []).splice(0);
      const perf = Array.isArray(window.__siltwakePerf) ? window.__siltwakePerf.splice(0) : null;
      return { gaps, records: perf && perf.map((e) => ({ total: e?.total, hold: e?.hold, parts: e?.parts && { chunks: e.parts.chunks, caves: e.parts.caves, regions: e.parts.regions, lights: e.parts.lights } })) };
    });
    return { frames: { overMs, ...raw }, unavailable: ["flight-frames: no flight recorder in this build; read the legacy per-frame array"] };
  };
  return {
    name: "flight-frames",
    async sample() {
      const got = await page.evaluate((c) => {
        const r = window.__siltwake?.recorder;
        if (!r) return null;
        // The legacy per-frame array (CW-1's) is not this provider's source; keep it from growing.
        if (Array.isArray(window.__siltwakePerf)) window.__siltwakePerf.length = 0;
        const f = r.frames(c, 100000);
        const gaps = Array.isArray(window.__soakGaps) ? window.__soakGaps.splice(0) : null;
        return { f, gaps };
      }, cursor);
      if (!got) return legacy();
      const { f, gaps } = got, col = Object.fromEntries(f.columns.map((c, i) => [c, i]));
      const HOLD = f.holdCodes ?? [null, "clear", "loading", "rescue", "refuge", "waiting", "away", "admitted"];
      cursor = f.next;
      const records = f.rows.map((row) => ({ total: row[col.work], hold: HOLD[row[col.hold]] ?? null,
        parts: { chunks: row[col.chunks], caves: row[col.caves], regions: row[col.regions], lights: row[col.lights] } }));
      const unavailable = f.lost ? [`flight-frames: ${f.lost} frame rows were overwritten before this provider read them`] : [];
      return { frames: { overMs, gaps: gaps ?? f.rows.filter((row) => row[col.gap] > 0).map((row) => ({ ms: row[col.gap], excluded: false })), records }, unavailable };
    },
  };
}

export function flightRecorder(page) {
  let cursor = 0;
  return {
    name: "flight-recorder",
    async sample() {
      const got = await page.evaluate((c) => {
        const r = window.__siltwake?.recorder;
        if (!r) return null;
        const s = r.samples(c, 100000);
        return { s, overhead: r.overhead(), read: window.__siltwake.read() };
      }, cursor);
      if (!got) return { unavailable: ["flight-recorder: the game's flight recorder is off (open it with ?rec=driver)"] };
      cursor = got.s.next;
      const last = got.s.items.at(-1);
      const out = { recorder: { overheadMs: got.overhead.meanMs, worstMs: got.overhead.worstMs, lostSamples: got.s.lost }, unavailable: [] };
      if (last) {
        out.graphics = { draws: last.draws, triangles: last.triangles, meshes: last.meshes, textures: last.textures, materials: last.materials, geometries: last.geometries };
        out.memory = { residentGpuMiB: last.residentGpuMiB, residentCpuMiB: last.residentCpuMiB };
        out.where = { camera: last.pos.join(","), cave: last.cave, region: last.region };
        out.unsliced = last.unsliced ?? null;
      }
      out.holds = { state: got.read?.hold ?? null };
      return out;
    },
  };
}

/** The soak's own recording: started lazily from the first full sample (the
 * page is open by then), finished after the soak with a pack. */
export function soakRecording(out, meta = {}) {
  let rec = null, starting = null, why = null;
  return {
    provider(g) {
      return {
        name: "flight-recording",
        async sample() {
          if (!rec && !starting && !why) {
            const { startRecording, gpuInfo } = await import("./record.mjs");
            starting = startRecording({ page: g.page, cdp: g.cdp, pid: g.browserPid, out, video: true, gpuBaseline: gpuInfo(), meta: { ...meta, mode: "soak" } })
              .then((r) => { rec = r; }, (e) => { why = e.message; });
            await starting;
          }
          return why ? { unavailable: [`flight-recording: ${why}`] } : {};
        },
      };
    },
    /** Stops the video, writes the header and builds the pack (the page may already be closed: the last second is lost then). */
    async finish(opts = {}) {
      if (!rec) return { missing: why ?? "never started" };
      const header = await rec.stop();
      const { buildPack } = await import("./pack.mjs");
      return { header, pack: await buildPack(out, opts) };
    },
  };
}
