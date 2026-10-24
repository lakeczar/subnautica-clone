// CW-1: Markdown tables from traverse.mjs results (one segment-k.json per run).
// usage: node summarize.mjs <dir> [<dir> ...]
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { classify, OURS } from "./frame-class.mjs";

const runs = process.argv.slice(2).flatMap(dir => readdirSync(dir).filter(f => /^segment-\d+\.json$/.test(f))
  .map(f => ({ dir, ...JSON.parse(readFileSync(path.join(dir, f), "utf8")) })))
  .sort((a, b) => a.dir.localeCompare(b.dir) || a.segment - b.segment);
const s = (v) => v == null ? "–" : String(v);
// Long frames reclassified by the shared rule (frame-class.mjs); recorded runs predate result.ncpu (factory-worker: 8).
const cls = (r) => {
  if (!(r.long ?? []).some(l => l.thread?.stolenMs !== undefined)) return "–";
  const n = { host: 0, "host-stopped": 0, mixed: 0, clean: 0, unsampled: 0 }; let ours = 0, legacy = false;
  for (const l of r.long) if (l.gap > 34) { const c = classify(l, r.ncpu ?? 8); legacy ||= c.rule === "legacy"; n[c.cause]++; if (l.streaming && OURS.has(c.cause)) ours++; }
  return `${n.host} / ${n["host-stopped"]} / ${n.mixed} / ${n.clean}${n.unsampled ? ` (+${n.unsampled} unsampled)` : ""} (${ours})${legacy ? " legacy rule (upper bound)" : ""}`;
};
console.log("| Run | Commit | Caves reached | Minutes | Frames | p50 / p95 / p99 / max ms | Gaps > 33 ms | Streaming > 34 ms (GC-shaped) | Over 34 ms: host / host-stopped label / mixed / clean (streaming ours; labels are ours, R4-1) | Holds | Unsliced in travel (at load) | Dark cave frames | Gate |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of runs) {
  const f = r.frames ?? {}, l = r.longByCause ?? {}, g = r.gate ?? {};
  console.log(`| ${path.basename(r.dir)} #${r.segment} | ${r.commit} | ${r.reached.length}/${r.reached.length + r.skipped.length} | ${s(r.seconds && (r.seconds / 60).toFixed(1))} | ${s(f.count)} | ` +
    `${s(f.p50)} / ${s(f.p95)} / ${s(f.p99)} / ${s(f.max)} | ${s(f.over33)} | ${s(l.streamingOver34)}${l.streamingGcShaped != null ? ` (${l.streamingGcShaped})` : ""} | ` +
    `${cls(r)} | ${s(r.holdFrames)} | ` +
    `${s(g.travelSync)} (${s(g.loadSync)}) | ${s(g.travelLightPending)} | ${g.pass ? "pass" : "**fail**"} |`);
}
// Every streaming sub-part, separately: the worst p99 and max over the runs (ms).
const names = [...new Set(runs.flatMap(r => Object.keys(r.parts ?? {})))];
if (names.length) {
  console.log("\n| Part | Worst p99 ms | Max ms | Run with the max |");
  console.log("|---|---|---|---|");
  for (const n of names) {
    const with_ = runs.filter(r => r.parts?.[n]), top = with_.reduce((b, r) => !b || (r.parts[n].max ?? 0) > (b.parts[n].max ?? 0) ? r : b, null);
    console.log(`| ${n} | ${s(Math.max(...with_.map(r => r.parts[n].p99 ?? 0)))} | ${s(top?.parts[n].max)} | ${top ? `${path.basename(top.dir)} #${top.segment}` : "–"} |`);
  }
}
// Power: service calls and cell swaps, and the ledger at the end.
for (const r of runs) if (r.power?.length || r.powerEnd)
  console.log(`\n${path.basename(r.dir)} #${r.segment} power: ${(r.power ?? []).map(p => `${p.action} (${p.why}, ${p.pressed ? "done" : "NOT PRESSED"})`).join("; ") || "no calls"}; end ${r.powerEnd?.charge ?? "–"}% with ${r.powerEnd?.cellsLeft ?? "–"} cells, home ${r.powerEnd?.homeOk ? "covered" : r.powerEnd?.homeOk === false ? "**not covered**" : "–"}`);
const stalls = runs.flatMap(r => (r.stalls ?? []).map(x => ({ run: `${path.basename(r.dir)} #${r.segment}`, ...x })));
if (stalls.length) console.log(`\nStalls (${stalls.length}): ${stalls.slice(0, 12).map(x => `${x.run} ${x.label} at ${x.at} (${x.short} m short, ${x.vitals})`).join("; ")}`);
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
    console.log(`- ${l.run}${l.camera ? ` at ${l.camera.split(",").map(v => Math.round(+v)).join(", ")}` : ""}: ${l.gap} ms gap, ${l.frame?.total} ms of work (${top})${l.gcs?.length ? `, GC in it: ${l.gcs.join(" + ")}` : l.gcs ? ", no GC traced" : l.gc ? `, gc (${l.heapFreedMiB} MiB freed)` : ""}` +
      (p.jump ? `, camera jumped ${p.jump.slice(0, 3).join(",")} → ${p.jump.slice(3).join(",")}` : ""));
  }
}
