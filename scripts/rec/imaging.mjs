// REC-1 pack imaging: frames out of the recording's video (ffmpeg: the
// system's or Playwright's own build), and every composed image (strips,
// charts, the contact sheet) laid out as HTML in a task-owned headless Chrome
// and screenshotted as JPEG/PNG. Chrome and that ffmpeg exist on both test
// machines, so a pack looks the same from either. No GPU is needed: the page
// only draws images and text.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { findFfmpeg } from "./record.mjs";
import { launch } from "./browser.mjs";

/** One Chrome page for composing; close() when done. */
export async function composer(opts = {}) {
  const b = await launch({ ...opts, label: "rec1-pack", software: !opts.chrome || opts.chrome.includes("ms-playwright"), width: 1280, height: 800 });
  return { page: b.page, close: b.close };
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const dataUrl = (file) => `data:image/${file.endsWith(".png") ? "png" : "jpeg"};base64,${readFileSync(file).toString("base64")}`;

/** Re-muxes a MediaRecorder/ffmpeg WebM so it has a duration and seeks (a stream copy). */
export function remux(file, out) {
  const ff = findFfmpeg();
  if (!ff) return false;
  try { execFileSync(ff, ["-hide_banner", "-loglevel", "error", "-i", file, "-c", "copy", "-y", out], { stdio: "pipe", timeout: 600000 }); return true; } catch { return false; }
}
/** Video duration in seconds, from ffmpeg's stderr. */
export function videoSeconds(file) {
  const ff = findFfmpeg();
  if (!ff) return null;
  let text = "";
  try { execFileSync(ff, ["-hide_banner", "-i", file], { stdio: "pipe" }); } catch (e) { text = String(e.stderr ?? ""); }
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(text);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

/**
 * Frames from `video` starting at `from` seconds for `seconds`, at `fps`,
 * scaled to w×h PNGs. Returns [{ file, vt }] (vt: video seconds).
 */
export function extractFrames(video, from, seconds, fps, w, h) {
  const ff = findFfmpeg();
  if (!ff) throw new Error("no ffmpeg (system or Playwright's: npx playwright-core install ffmpeg)");
  const dir = mkdtempSync(path.join(tmpdir(), "rec1-frames-"));
  const start = Math.max(0, from);
  execFileSync(ff, ["-hide_banner", "-loglevel", "error", "-ss", start.toFixed(3), "-i", video, "-t", seconds.toFixed(3),
    "-vf", `scale=${w}:${h}`, "-r", String(fps), "-f", "image2", path.join(dir, "%05d.png")], { stdio: "pipe", timeout: 300000 });
  const files = readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
  return { dir, frames: files.map((f, i) => ({ file: path.join(dir, f), vt: start + i / fps })), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/**
 * A frame strip: tiles in a grid, each with its label burned in, the event's
 * own tile outlined. tiles: [{ file, lines: [string, string], mark }].
 */
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
  </style><div id=s><h1>${esc(title)}</h1><div class=g>${tiles.map((t) => `<div class="t${t.mark ? " m" : ""}">${t.file ? `<img src="${dataUrl(t.file)}">` : `<div class=none>no frame</div>`}<div class=l>${t.lines.map(esc).join("<br>")}</div></div>`).join("")}</div></div>`;
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
