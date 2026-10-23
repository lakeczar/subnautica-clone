#!/usr/bin/env node
// REC-1 fixed-view compare: each captured view against the last accepted
// baseline for that view on that machine class (3090 or 4070: their GPU
// paths differ slightly). Perceptual: SSIM on luminance (8×8 windows at
// 640×360) against a per-view threshold. A changed view goes on the attention
// list with a strip: baseline | new | difference. Unchanged views cost nothing
// to read. Writes into the capture directory:
//   report.md (text first), report.json, strips/<id>.jpg (changed views only),
//   contact-sheet.jpg (every view, one image, for the once-per-wave taste review)
//
//   node scripts/rec/views/compare.mjs CAPTURE_DIR [--store DIR] [--index FILE] [--pw DIR] [--chrome BIN]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadViewSet } from "./stable.mjs";
import { fileURLToPath } from "node:url";
import { composer, composeStrip, dataUrl } from "../imaging.mjs";
import { createHash } from "node:crypto";

const sha256 = (b) => createHash("sha256").update(b).digest("hex");

const here = path.dirname(fileURLToPath(import.meta.url));
export const STORE = process.env.REC_VIEW_STORE ?? `${process.env.HOME}/.local/share/siltwake-views`;
export const INDEX = path.join(here, "baselines.json");
export const readIndex = (file = INDEX) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { version: 1, note: "Accepted fixed-view baselines (REC-1). Images live in the store (REC_VIEW_STORE), keyed <class>/<view>/<commit>.png; accept with accept.mjs.", classes: {} });

/** SSIM and a difference image for two PNGs, computed in the page. */
async function ssim(page, a, b) {
  return page.evaluate(async ([ua, ub]) => {
    const W = 640, H = 360;
    const load = (u) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = u; });
    const [ia, ib] = await Promise.all([load(ua), load(ub)]);
    const grab = (img) => { const c = new OffscreenCanvas(W, H), x = c.getContext("2d"); x.drawImage(img, 0, 0, W, H); return x.getImageData(0, 0, W, H).data; };
    const pa = grab(ia), pb = grab(ib), la = new Float32Array(W * H), lb = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) { la[i] = 0.299 * pa[i * 4] + 0.587 * pa[i * 4 + 1] + 0.114 * pa[i * 4 + 2]; lb[i] = 0.299 * pb[i * 4] + 0.587 * pb[i * 4 + 1] + 0.114 * pb[i * 4 + 2]; }
    const C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2, N = 8;
    let sum = 0, n = 0, worst = 1;
    for (let y = 0; y + N <= H; y += 4) for (let x = 0; x + N <= W; x += 4) {
      let ma = 0, mb = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = (y + j) * W + x + i; ma += la[k]; mb += lb[k]; }
      ma /= N * N; mb /= N * N;
      let va = 0, vb = 0, cov = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = (y + j) * W + x + i, da = la[k] - ma, db = lb[k] - mb; va += da * da; vb += db * db; cov += da * db; }
      va /= N * N - 1; vb /= N * N - 1; cov /= N * N - 1;
      const s = ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      sum += s; n++; if (s < worst) worst = s;
    }
    // Difference: amplified absolute luminance change over a dimmed copy of the new view.
    const d = new OffscreenCanvas(W, H), dx = d.getContext("2d"), img = dx.createImageData(W, H);
    let changed = 0;
    for (let i = 0; i < W * H; i++) {
      const v = Math.min(255, Math.abs(la[i] - lb[i]) * 4), base = lb[i] * 0.25;
      if (v > 40) changed++;
      img.data[i * 4] = Math.max(base, v); img.data[i * 4 + 1] = base; img.data[i * 4 + 2] = base; img.data[i * 4 + 3] = 255;
    }
    dx.putImageData(img, 0, 0);
    const blob = await d.convertToBlob({ type: "image/png" }), buf = new Uint8Array(await blob.arrayBuffer());
    let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { ssim: sum / n, worstWindow: worst, changedPct: (100 * changed) / (W * H), diff: btoa(s) };
  }, [a, b]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
  const dir = args[0];
  if (!dir || dir.startsWith("--")) { console.error("usage: compare.mjs CAPTURE_DIR [--store DIR] [--index FILE]"); process.exit(2); }
  const cap = JSON.parse(readFileSync(path.join(dir, "capture.json"), "utf8"));
  const set = loadViewSet(arg("views", path.join(here, "views.json")));
  const store = arg("store", STORE), index = readIndex(arg("index", INDEX)), base = index.classes[cap.class] ?? {};
  const byId = new Map(set.views.map((v) => [v.id, v]));
  mkdirSync(path.join(dir, "strips"), { recursive: true });
  const rows = [], attention = [];
  const c = await composer({ pw: arg("pw"), chrome: arg("chrome") });
  try {
    for (const v of cap.views.filter((x) => x.file)) {
      const b = base[v.id], file = path.join(dir, v.file), threshold = byId.get(v.id)?.ssim ?? set.defaults?.ssim ?? 0.97;
      const flags = [...(v.settled ? [] : ["unsettled"]), ...(v.stable === false ? ["unstable"] : [])];
      // Quarantined, unsettled or unstable views are reported apart and never judged (R1-F2).
      const quarantine = byId.get(v.id)?.quarantine ?? v.quarantine;
      if (quarantine) { rows.push({ id: v.id, status: "quarantined", reason: quarantine, flags }); continue; }
      if (flags.length) { rows.push({ id: v.id, status: "not judged", reason: flags.join(", "), flags }); continue; }
      if (!b) { rows.push({ id: v.id, status: "no baseline", flags }); continue; }
      // Hashes from the bytes on disk on both sides (audit F22): the stored baseline must
      // still be what its index entry names, and the capture's picture is hashed afresh.
      const bf = path.join(store, b.file);
      if (!existsSync(bf)) { rows.push({ id: v.id, status: "baseline missing from the store", flags, baseline: b.file }); attention.push({ id: v.id, reason: `baseline ${b.file} is not in the store ${store}` }); continue; }
      const storedSha = sha256(readFileSync(bf)), newSha = sha256(readFileSync(file));
      if (storedSha !== b.sha256) { rows.push({ id: v.id, status: "baseline corrupt", flags, baseline: b.file }); attention.push({ id: v.id, reason: `the stored baseline ${b.file} no longer holds the bytes its index entry names` }); continue; }
      if (storedSha === newSha) { rows.push({ id: v.id, status: "identical", ssim: 1, flags }); continue; }
      const s = await ssim(c.page, dataUrl(bf), dataUrl(file));
      const changed = s.ssim < threshold;
      rows.push({ id: v.id, status: changed ? "changed" : "unchanged", ssim: +s.ssim.toFixed(4), changedPct: +s.changedPct.toFixed(2), threshold, flags, baseline: b.commit });
      if (changed) {
        const diffFile = path.join(dir, "strips", `${v.id}.diff.png`);
        writeFileSync(diffFile, Buffer.from(s.diff, "base64"));
        const strip = `strips/${v.id}.jpg`;
        await composeStrip(c.page, { title: `${v.id} · SSIM ${s.ssim.toFixed(3)} < ${threshold} · ${s.changedPct.toFixed(1)}% of pixels changed · baseline ${b.commit.slice(0, 8)} (${b.acceptedBy}: ${b.why}) | new ${cap.commit?.slice(0, 8)} | difference`,
          cols: 3, tileW: 420, tileH: 236, out: path.join(dir, strip),
          tiles: [{ file: bf, lines: [`baseline ${b.commit.slice(0, 8)}`, b.at ?? ""] }, { file, lines: [`new ${cap.commit?.slice(0, 8) ?? ""}`, cap.class] }, { file: diffFile, lines: ["difference ×4", `SSIM ${s.ssim.toFixed(3)}`], mark: true }] });
        attention.push({ id: v.id, reason: `SSIM ${s.ssim.toFixed(3)} below ${threshold} (${s.changedPct.toFixed(1)}% of pixels changed)`, strip });
      }
    }
    // One image of every view, for the taste review.
    const shots = cap.views.filter((v) => v.file);
    const cols = 8, tileW = Math.floor((1920 - 12 - (cols - 1) * 4) / cols);
    await composeStrip(c.page, { title: `Fixed views · ${cap.class} · ${cap.gpu} · ${cap.commit?.slice(0, 10)} · ${shots.length} views${cap.pending.length ? ` · ${cap.pending.length} pending` : ""}`,
      cols, tileW, tileH: Math.round((tileW * 9) / 16), out: path.join(dir, "contact-sheet.jpg"), quality: 70,
      tiles: shots.map((v) => ({ file: path.join(dir, v.file), lines: [v.id.replace(/^cave\./, "").slice(0, 34), rows.find((r) => r.id === v.id)?.status ?? ""], mark: attention.some((a) => a.id === v.id) })) });
  } finally { await c.close(); }
  const count = (st) => rows.filter((r) => r.status === st).length;
  const md = [
    `# Fixed views: ${attention.length ? `${attention.length} need attention` : "nothing changed"}`, "",
    `${cap.class} · ${cap.gpu} · ${cap.chrome} · commit \`${cap.commit?.slice(0, 12)}\` · views v${cap.viewsVersion} · ${cap.seconds} s`, "",
    `${rows.length} captured: ${count("unchanged") + count("identical")} unchanged (${count("identical")} pixel-identical), ${count("changed")} changed, ${count("no baseline")} without a baseline; ${count("quarantined")} quarantined and ${count("not judged")} not judged (unsettled or unstable), none of them part of the verdict.`, "",
    "## Attention", "", ...(attention.length ? attention.map((a) => `- **${a.id}** · ${a.reason}${a.strip ? ` → [${a.strip}](${a.strip})` : ""}`) : ["Nothing changed beyond its threshold."]), "",
    "## Not judged (pictures kept for the taste review)", "", ...rows.filter((r) => r.status === "quarantined" || r.status === "not judged").map((r) => `- ${r.id}: ${r.status}: ${r.reason}`), "",
    "## Pending views (missing, with why)", "", ...cap.pending.map((p) => `- ${p.id}: ${p.reason}`), "",
    "## Every view", "", "| View | Status | SSIM | Flags |", "| --- | --- | --- | --- |", ...rows.map((r) => `| ${r.id} | ${r.status} | ${r.ssim ?? ""} | ${r.flags.join(", ")} |`), "",
    "One image of all views: `contact-sheet.jpg`. Accept a change deliberately: `node scripts/rec/views/accept.mjs <dir> --views <id,…> --by <who> --why <reason>`.",
  ];
  writeFileSync(path.join(dir, "report.md"), md.join("\n") + "\n");
  writeFileSync(path.join(dir, "report.json"), JSON.stringify({ class: cap.class, commit: cap.commit, rows, attention }, null, 1));
  console.log(md.slice(0, 5).join("\n"));
}
