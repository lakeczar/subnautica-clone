// CW-1: Markdown tables from traverse.mjs results (one segment-k.json per run).
// usage: node summarize.mjs <dir> [<dir> ...]
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const runs = process.argv.slice(2).flatMap(dir => readdirSync(dir).filter(f => /^segment-\d+\.json$/.test(f))
  .map(f => ({ dir, ...JSON.parse(readFileSync(path.join(dir, f), "utf8")) })))
  .sort((a, b) => a.dir.localeCompare(b.dir) || a.segment - b.segment);
const s = (v) => v == null ? "–" : String(v);
console.log("| Run | Commit | Caves reached | Minutes | Frames | p50 / p95 / p99 / max ms | Gaps > 33 ms | Streaming > 34 ms (GC-shaped) | Holds | Unsliced in travel (at load) | Gate |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of runs) {
  const f = r.frames ?? {}, l = r.longByCause ?? {}, g = r.gate ?? {};
  console.log(`| ${path.basename(r.dir)} #${r.segment} | ${r.commit} | ${r.reached.length}/${r.reached.length + r.skipped.length} | ${s(r.seconds && (r.seconds / 60).toFixed(1))} | ${s(f.count)} | ` +
    `${s(f.p50)} / ${s(f.p95)} / ${s(f.p99)} / ${s(f.max)} | ${s(f.over33)} | ${s(l.streamingOver34)}${l.streamingGcShaped != null ? ` (${l.streamingGcShaped})` : ""} | ${s(r.holdFrames)} | ` +
    `${s(g.travelSync)} (${s(g.loadSync)}) | ${g.pass ? "pass" : "**fail**"} |`);
}
console.log("\n| Run | Title ms | Playable ms | Collision pack ms | CPU MiB | GPU MiB | Regions MiB | Heap MiB | Boxes | Built / evicted | Light uploads |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of runs) {
  const c = r.coldStart ?? {}, m = r.memory ?? {}, st = r.stream ?? {};
  console.log(`| ${path.basename(r.dir)} #${r.segment} | ${s(c.titleMs)} | ${s(c.playableMs)} | ${s(c.collisionPackMs && Math.round(c.collisionPackMs))} | ${s(m.residentCpuMiB)} | ${s(m.residentGpuMiB)} | ` +
    `${s(m.regionMiB)} | ${s(m.heapMiB)} | ${s(st.boxes)} | ${s(st.built)} / ${s(st.evicted)} | ${s(st.uploads)} |`);
}
const skipped = runs.flatMap(r => r.skipped.map(k => `${k.cave} (${k.metres} m short, ${path.basename(r.dir)} #${r.segment})`));
console.log(`\nNot reached: ${skipped.length ? skipped.join("; ") : "none"}.`);
const longs = runs.flatMap(r => (r.long ?? []).filter(l => l.streaming && l.gap > 34).map(l => ({ run: `${path.basename(r.dir)} #${r.segment}`, ...l })));
if (longs.length) {
  console.log("\nStreaming-attributed frames over 34 ms (the part that ran long; gc = the heap shrank across the gap):\n");
  for (const l of longs) {
    const p = l.frame?.parts ?? {}, top = Object.entries(p).filter(([k, v]) => typeof v === "number" && !["lightCount", "evicted", "uploads", "buildMs", "maxStepMs", "caveBuildMs", "uploadMs"].includes(k))
      .sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(", ");
    console.log(`- ${l.run}${l.camera ? ` at ${l.camera.split(",").map(v => Math.round(+v)).join(", ")}` : ""}: ${l.gap} ms gap, ${l.frame?.total} ms of work (${top})${l.gc ? `, gc (${l.heapFreedMiB} MiB freed)` : l.heapFreedMiB != null ? ", no collection" : ""}` +
      (p.jump ? `, camera jumped ${p.jump.slice(0, 3).join(",")} → ${p.jump.slice(3).join(",")}` : ""));
  }
}
