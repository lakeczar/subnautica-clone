// REC-1 pack imaging: frames out of the recording's video (ffmpeg: the
// system's or Playwright's own build), and every composed image (strips,
// charts, the contact sheet) laid out as HTML in a task-owned headless Chrome
// and screenshotted as JPEG/PNG. Chrome and that ffmpeg exist on both test
// machines, so a pack looks the same from either. No GPU is needed: the page
// only draws images and text.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { findFfmpeg } from "./record.mjs";
import { createRequire } from "node:module";

/** One Chrome page for composing (no game, no GPU: software rendering, or the
 * sandbox's own wrapper on alickers, as the soak's browser finds it); close() when done. */
export async function composer(opts = {}) {
  const sandbox = "/usr/local/bin/siltwake-chrome", playwright = `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
  const chrome = opts.chrome ?? (existsSync(playwright) ? playwright : existsSync(sandbox) ? sandbox : playwright);
  const wrapper = chrome === sandbox;
  const pw = opts.pw ?? process.env.REC_PW ?? ["/work/tmp/gpu-prep/pw/", "/work/tmp/pw/"].find((d) => existsSync(path.join(d, "node_modules", "playwright-core"))) ?? "/work/tmp/gpu-prep/pw/";
  const { chromium } = createRequire(pw)("playwright-core");
  // A label on the command line finds this browser's processes (/proc), for measurements that need them.
  const label = `--siltwake-composer=${process.pid}-${Date.now()}`;
  // opts.gpu: the run's GPU flags instead of software rendering (a GPU job's lease needed); opts.args: more flags.
  if (opts.gpu) { const { requireGpuLease } = await import("../heavy/gpu-lease.mjs"); requireGpuLease("a REC-1 GPU probe"); }
  const gl = wrapper ? [] : opts.gpu ? ["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist"] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
  const browser = await chromium.launch({ executablePath: chrome, headless: true, timeout: 30000,
    ...(wrapper ? { ignoreDefaultArgs: ["--enable-unsafe-swiftshader"] } : {}), args: [...gl, ...(opts.args ?? []), label] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })).newPage();
  const browserPid = readdirSync("/proc").filter((d) => /^\d+$/.test(d)).map(Number).find((p) => {
    try { const c = readFileSync(`/proc/${p}/cmdline`, "utf8"); return c.includes(label) && !c.includes("--type="); } catch { return false; }
  }) ?? null;
  return { page, browserPid, close: () => browser.close().catch(() => {}) };
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const dataUrl = (file) => `data:image/${file.endsWith(".png") ? "png" : "jpeg"};base64,${readFileSync(file).toString("base64")}`;

/** Re-muxes a live WebM (the in-game writer's, piped ffmpeg's) so it has a duration and seeks (a stream copy). */
export function remux(file, out) {
  // Playwright's ffmpeg remuxes WebM; H.264 (Matroska, MP4) wants the system's.
  for (const ff of [findFfmpeg(), "ffmpeg"].filter(Boolean)) {
    try { execFileSync(ff, ["-hide_banner", "-loglevel", "error", "-i", file, "-c", "copy", ...(out.endsWith(".mp4") ? ["-movflags", "+faststart"] : []), "-y", out], { stdio: "pipe", timeout: 600000 }); return true; } catch { /* the next */ }
  }
  return false;
}
/** A segment's seekable copy in place (its own container), and for H.264 in Matroska a playable .mp4 beside it (browsers do not play .mkv). */
export function remuxSegment(file) {
  const ext = path.extname(file), tmp = `${file}.tmp${ext}`;
  if (remux(file, tmp)) renameSync(tmp, file);
  if (ext === ".mkv") remux(file, file.replace(/\.mkv$/, ".mp4"));
}
/** Video duration in seconds, from ffmpeg's stderr. */
export function videoSeconds(file) {
  for (const ff of [findFfmpeg(), "ffmpeg"].filter(Boolean)) {
    let text = "";
    try { execFileSync(ff, ["-hide_banner", "-i", file], { stdio: "pipe" }); } catch (e) { text = String(e.stderr ?? ""); }
    const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(text);
    if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
  return null;
}

/**
 * Frames from `video` starting at `from` seconds for `seconds`, at `fps`,
 * scaled to w×h PNGs. Returns [{ file, vt }] (vt: video seconds).
 */
export function extractFrames(video, from, seconds, fps, w, h) {
  const ffs = [findFfmpeg(), "ffmpeg"].filter(Boolean);
  if (!ffs.length) throw new Error("no ffmpeg (system or Playwright's: npx playwright-core install ffmpeg)");
  const dir = mkdtempSync(path.join(tmpdir(), "rec1-frames-"));
  const start = Math.max(0, from);
  // Playwright's ffmpeg decodes VP8/VP9; H.264 (and AV1) want the system's.
  for (const [i, ff] of ffs.entries()) {
    try {
      execFileSync(ff, ["-hide_banner", "-loglevel", "error", "-ss", start.toFixed(3), "-i", video, "-t", seconds.toFixed(3),
        "-vf", `scale=${w}:${h}`, "-r", String(fps), "-f", "image2", path.join(dir, "%05d.png")], { stdio: "pipe", timeout: 300000 });
      if (readdirSync(dir).some((f) => f.endsWith(".png"))) break;
    } catch (e) { if (i === ffs.length - 1) throw e; }
  }
  const files = readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
  return { dir, frames: files.map((f, i) => ({ file: path.join(dir, f), vt: start + i / fps })), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/**
 * A frame strip: tiles in a grid, each with its label burned in, the event's
 * own tile outlined. tiles: [{ file, lines: [string, string], mark }].
 */
/** A strip of tiles: each { file, lines, mark?, held? } (`held`: the picture is not of this moment, and says so, R3-3). */
export async function composeStrip(page, { title, tiles, cols, tileW, tileH, out, quality = 72 }) {
  const html = `<!doctype html><meta charset=utf-8><style>
    body{margin:0;background:#0b1418;font:11px/1.25 system-ui,sans-serif;color:#d7e4e8}
    #s{display:inline-block;padding:6px}
    h1{font-size:13px;margin:0 0 5px;font-weight:600;color:#fff;max-width:${cols * (tileW + 4)}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .g{display:grid;grid-template-columns:repeat(${cols},${tileW}px);gap:4px}
    .t{position:relative;width:${tileW}px;height:${tileH}px;outline:1px solid #26363c}
    .t.m{outline:3px solid #ff4d3d;z-index:1}
    .t img{display:block;width:${tileW}px;height:${tileH}px;object-fit:contain;background:#000}
    .l{position:absolute;left:0;right:0;bottom:0;padding:1px 3px;background:rgba(0,0,0,.62);font:9.5px/1.15 ui-monospace,monospace;color:#fff;white-space:nowrap;overflow:hidden}
    .none{display:flex;align-items:center;justify-content:center;color:#678;height:100%}
    .t.held img{opacity:.35;filter:grayscale(1)}
    .h{position:absolute;top:28%;left:2px;right:2px;text-align:center;font:600 10.5px/1.2 system-ui,sans-serif;color:#ffd166;text-shadow:0 0 3px #000,0 0 3px #000}
  </style><div id=s><h1>${esc(title)}</h1><div class=g>${tiles.map((t) => `<div class="t${t.mark ? " m" : ""}${t.held ? " held" : ""}">${t.file ? `<img src="${dataUrl(t.file)}">` : `<div class=none>no frame</div>`}${t.held ? `<div class=h>${esc(t.held)}</div>` : ""}<div class=l>${t.lines.map(esc).join("<br>")}</div></div>`).join("")}</div></div>`;
  await page.setContent(html, { waitUntil: "load" });
  const box = await page.locator("#s").boundingBox();
  await page.setViewportSize({ width: Math.ceil(box.width) + 2, height: Math.ceil(box.height) + 2 });
  await page.locator("#s").screenshot({ path: out, type: "jpeg", quality });
}

/** An SVG (or any HTML) rendered to PNG at its own size. */
export async function renderHtml(page, html, out, { type = "png", quality } = {}) {
  await page.setContent(`<!doctype html><meta charset=utf-8><style>body{margin:0;background:#fff}#s{display:inline-block}</style><div id=s>${html}</div>`, { waitUntil: "load" });
  const box = await page.locator("#s").boundingBox();
  await page.setViewportSize({ width: Math.ceil(box.width) + 2, height: Math.ceil(box.height) + 2 });
  await page.locator("#s").screenshot({ path: out, type, ...(type === "jpeg" ? { quality: quality ?? 75 } : {}) });
}

export { dataUrl, esc };
export const ensureDir = (d) => { mkdirSync(d, { recursive: true }); return d; };
