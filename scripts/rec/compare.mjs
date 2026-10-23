#!/usr/bin/env node
// REC-1 side-by-side: two packs of the same run (the RTX 3090 and the RTX
// 4070, or before and after a change) → one directory: compare.md (text
// first), compare.png (frame time and memory, same scales, stacked) and the
// two contact sheets side by side.
//
//   node scripts/rec/compare.mjs PACK_A PACK_B OUT [--pw DIR] [--chrome BIN]
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { analyse, loadRecording, summaryJson } from "./analyse.mjs";
import { composer, dataUrl, renderHtml } from "./imaging.mjs";
import { frameTimeSvg, memorySvg } from "./charts.mjs";

const args = process.argv.slice(2), arg = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const [A, B, out] = args.filter((x, i) => !x.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!A || !B || !out) { console.error("usage: compare.mjs PACK_A PACK_B OUT"); process.exit(2); }
mkdirSync(out, { recursive: true });
const packs = [A, B].map((dir) => { const r = loadRecording(dir), a = analyse(r); return { dir, r, a, s: summaryJson(a, r.header), label: r.header.machine?.label ?? path.basename(dir) }; });
const [p, q] = packs;

// Driver marks ("at <cave>") line the runs up by place, not by clock.
const marks = (x) => new Map(x.r.events.filter((e) => e.kind === "mark").map((e) => [e.text, +((e.t - x.a.t0) / 1000).toFixed(1)]));
const mp = marks(p), mq = marks(q);
const row = (name, f) => `| ${name} | ${f(p)} | ${f(q)} |`;
const pair = (v) => (v ? `${v[0]} → ${v[1]}` : "n/a");
const byKind = (x) => Object.entries(x.a.attention.reduce((m, e) => ({ ...m, [e.kind]: (m[e.kind] ?? 0) + 1 }), {})).map(([k, n]) => `${k} ${n}`).join(", ") || "none";
const md = [
  `# Side by side: ${p.label} | ${q.label}`, "",
  `| | ${p.label} | ${q.label} |`, "| --- | --- | --- |",
  row("verdict", (x) => `${x.s.verdict}${x.s.failed.length ? ` (failed: ${x.s.failed.join(", ")})` : ""}`),
  row("GPU · browser", (x) => `${x.s.gpu ?? "?"} · ${x.s.browser ?? "?"}`),
  row("commit · build", (x) => `${x.s.commit} · ${x.s.build}`),
  row("minutes · frames", (x) => `${x.s.minutes} · ${x.s.frame.frames}`),
  row("frame gap p50 / p99 / max (ms)", (x) => `${x.s.frame.p50} / ${x.s.frame.p99} / ${x.s.frame.max}`),
  row("frames over 33 ms", (x) => x.s.frame.over33),
  row("game work p50 / p99 (ms)", (x) => `${x.s.work.p50} / ${x.s.work.p99}`),
  row("recorder mean / p99 (ms)", (x) => `${x.s.rec.mean} / ${x.s.rec.p99}`),
  row("hold frames", (x) => x.s.holds),
  row("tab MiB", (x) => pair(x.s.memory.tab)), row("heap MiB", (x) => pair(x.s.memory.heap)), row("VRAM MiB (this browser where listed, else whole GPU)", (x) => pair(x.s.memory.vram)),
  row("draw calls p50 / max", (x) => `${x.s.draws.p50} / ${x.s.draws.max}`),
  row("errors · warnings", (x) => `${x.s.errors} · ${x.s.warnings}`),
  row("attention", (x) => byKind(x)), "",
  "## Where each run was when (driver marks, seconds from start)", "", `| Mark | ${p.label} | ${q.label} | Δ |`, "| --- | --- | --- | --- |",
  ...[...new Set([...mp.keys(), ...mq.keys()])].map((k) => `| ${k} | ${mp.get(k) ?? "—"} | ${mq.get(k) ?? "—"} | ${mp.has(k) && mq.has(k) ? (mq.get(k) - mp.get(k)).toFixed(1) : ""} |`), "",
  "## Checks", "", `| Check | ${p.label} | ${q.label} |`, "| --- | --- | --- |",
  ...p.a.checks.map((c) => `| ${c.name} | ${c.status} | ${q.a.checks.find((d) => d.name === c.name)?.status ?? "—"} |`), "",
  "Images: `compare.png` (frame time and memory, both runs, same scales), `contact-sheets.jpg`. Each pack's own story.md lists its attention entries and strips.",
];
writeFileSync(path.join(out, "compare.md"), md.join("\n") + "\n");
writeFileSync(path.join(out, "compare.json"), JSON.stringify({ a: { dir: A, ...p.s }, b: { dir: B, ...q.s } }, null, 1));

const c = await composer({ pw: arg("pw"), chrome: arg("chrome") });
try {
  const end = Math.max(p.a.durationS, q.a.durationS);
  const mem = (x) => [["tab", x.a.series.tab], ["heap", x.a.series.heap], [x.a.series.vram.length ? "VRAM (browser)" : "GPU (whole)", x.a.series.vram.length ? x.a.series.vram : x.a.series.gpuUsed]].filter(([, xs]) => xs.length)
    .map(([label, xs]) => ({ label, points: xs.map((v) => ({ s: (v.t - x.a.t0) / 1000, v: v.v })) }));
  const block = (x) => `<div style="font:600 14px system-ui;margin:8px 4px">${x.label}</div>${frameTimeSvg({ frames: x.r.frames, t0: x.a.t0, attention: x.a.attention, w: 1200, h: 240 })}${memorySvg({ series: mem(x), end, w: 1200, h: 200 })}`;
  await renderHtml(c.page, block(p) + block(q), path.join(out, "compare.png"));
  const sheets = packs.map((x) => path.join(x.dir, "contact-sheet.jpg"));
  if (sheets.every(existsSync)) await renderHtml(c.page, `<div style="display:flex;gap:8px;background:#0b1418;padding:6px">${sheets.map((f, i) => `<div><div style="color:#fff;font:600 13px system-ui;margin:2px">${packs[i].label}</div><img src="${dataUrl(f)}" style="width:900px"></div>`).join("")}</div>`, path.join(out, "contact-sheets.jpg"), { type: "jpeg", quality: 72 });
} finally { await c.close(); }
console.log(`compare: ${path.join(out, "compare.md")}`);
