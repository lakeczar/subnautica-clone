#!/usr/bin/env node
// Does an isolated Chromium on this machine render WebGL2 on the RTX 3090, and does the
// production game render in it?
//
//   TMPDIR=/work/tmp node webgl-probe.mjs --out DIR --playwright DIR/node_modules/playwright-core
//       [--chrome PATH] [--dist GAME/dist --commit SHA [--port 5192] [--size 1920x1080]]
//       [--expect 'RTX 3090'] [--candidate NAME] [--allow-software]
//   node webgl-probe.mjs --validate DIR/report.json [--commit SHA] [--boot-id ID] [--host NAME] [--max-age-min 360]
//   node webgl-probe.mjs --self-test
//
// Context probe: for each fixed candidate below it launches its own headless browser
// (fresh temporary profile, closed at the end), reads the unmasked WebGL2 renderer and
// draws three solid colours with a real shader, reading the pixels back. A candidate is
// accelerated only if the renderer is the expected NVIDIA card (never SwiftShader,
// llvmpipe or another GPU) and the draw reads back exactly, with no GL error or context loss.
//
// Game smoke (--dist): the probe serves the built game itself on 127.0.0.1:PORT and tries the
// accelerated candidates in order (gl-egl first: on factory-worker ANGLE-Vulkan loses the
// context once during game startup). A failure in one candidate, a context loss included,
// fails that candidate and moves on to the next; the first candidate whose smoke passes is
// "chosen", and every attempt is kept in report.smokes. --candidate NAME pins one candidate
// (probe and smoke only that one). Each smoke starts a new expedition and waits for the game's own
// readiness (canvas data-ready/data-graphics, HUD shown). It then counts frames rendered by
// the game's render loop (canvas data-frames, incremented per scene.render()), checks the
// canvas image is a real scene, and fails on page errors, console errors, relevant WebGL
// warnings and context loss. The frame rate is from headless Chromium and is not a
// representative performance measurement.
//
// --validate re-checks a report from its raw observations (it does not trust its booleans):
// schema, mode, renderer, draw, smoke, source commit, this boot, this host and its age.
// --allow-software runs the smoke on a software renderer too (to check this harness without
// a GPU); the verdict still fails. Exit: 0 accelerated (and smoke passed), 1 not accelerated
// or invalid report, 2 usage or launch error, 3 smoke failed.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { inflateSync, deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { requireGpuLease } from "../../../scripts/heavy/gpu-lease.mjs";

export const SCHEMA = "siltwake-gpu-probe/2";
// Per-process switches for this probe's own browser only; the report records every result.
// Order matters: the smoke tries accelerated candidates in this order. ANGLE GL-EGL comes first:
// on factory-worker (RTX 3090, driver 550.163.01, Chrome 156) ANGLE-Vulkan lost the WebGL context
// once during game startup in 4 of 4 runs, GL-EGL in 0 of 2 (2026-10-20).
export const CANDIDATES = [
  { name: "angle-gl-egl", args: ["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist"] },
  { name: "angle-vulkan", args: ["--use-angle=vulkan", "--enable-features=Vulkan", "--disable-vulkan-surface", "--ignore-gpu-blocklist"] },
  { name: "chrome-default", args: [] },
];

// Which candidates the smoke tries, in order: the accelerated ones; without any, under
// --allow-software, the first that drew correctly (a functional harness check only).
export function smokeOrder(results, allowSoftware = false) {
  const acc = results.filter((r) => r.verdict?.accelerated).map((r) => r.name);
  if (acc.length || !allowSoftware) return { names: acc, software: false };
  const fb = results.find((r) => r.info?.webgl2 && r.drawJudgement?.passed);
  return { names: fb ? [fb.name] : [], software: !!fb };
}

// Runs the smoke in each name until one passes. runOne(name) resolves to a smoke record with
// .passed (or throws, which is a failed attempt). Returns every attempt and the passing one.
export async function selectSmoke(names, runOne) {
  const attempts = [];
  for (const name of names) {
    let a;
    try { a = await runOne(name); } catch (e) { a = { candidate: name, error: String(e?.message ?? e).split("\n")[0], passed: false }; }
    attempts.push(a);
    if (a.passed) return { attempts, passed: a };
  }
  return { attempts, passed: null };
}
const SOFTWARE = /SwiftShader|Subzero|llvmpipe|lavapipe|softpipe|Software|Microsoft Basic Render/i;
export const SMOKE_LIMITS = { minFrames: 10, minBuckets: 64, minLumaStd: 8, maxDominant: 0.85 };

export function classify(info, expect = /RTX 3090/) {
  if (!info || !info.webgl2) return { accelerated: false, reason: "no WebGL2 context" };
  const r = `${info.unmaskedRenderer ?? ""} ${info.unmaskedVendor ?? ""}`;
  if (!info.unmaskedRenderer) return { accelerated: false, reason: "renderer not exposed" };
  if (SOFTWARE.test(r)) return { accelerated: false, reason: `software renderer: ${info.unmaskedRenderer}` };
  if (!/NVIDIA/i.test(r)) return { accelerated: false, reason: `not NVIDIA: ${info.unmaskedRenderer}` };
  if (!expect.test(r)) return { accelerated: false, reason: `NVIDIA but not ${expect}: ${info.unmaskedRenderer}` };
  return { accelerated: true, reason: info.unmaskedRenderer };
}

// The draw check's raw samples are judged here, outside the page.
export function judgeDraw(draw) {
  const reasons = [];
  if (!draw) return { passed: false, reasons: ["no draw result"] };
  if (!draw.linked) reasons.push(`shader program did not link: ${draw.log || "no log"}`);
  if (draw.glError !== 0) reasons.push(`GL error 0x${(draw.glError ?? -1).toString(16)}`);
  if (draw.contextLost) reasons.push("context lost");
  const samples = draw.samples ?? [];
  if (samples.length < 15) reasons.push(`only ${samples.length} pixel samples`);
  for (const s of samples) {
    if (!s.want || !s.got || s.want.some((w, i) => Math.abs(w - s.got[i]) > 2)) {
      reasons.push(`pixel ${s.x},${s.y} read ${JSON.stringify(s.got)}, drew ${JSON.stringify(s.want)}`);
      break;
    }
  }
  return { passed: reasons.length === 0, reasons };
}

// Console messages that mean the rendering is wrong. ANGLE's "GL Driver Message
// (..., Performance, ...)" notes (for example "GPU stall due to ReadPixels") are not errors.
export function relevantConsole(m) {
  if (m.type === "error") return true;
  if (m.type !== "warning" && m.type !== "warn") return false;
  if (/GL Driver Message \([^)]*Performance/.test(m.text)) return false;
  return /INVALID_(ENUM|VALUE|OPERATION|FRAMEBUFFER_OPERATION)|GL_INVALID|OUT_OF_MEMORY|CONTEXT_LOST|context lost|shader|compil|link(ing)? (error|fail)|WebGL: /i.test(m.text);
}

// obs: the smoke's raw observations; returns pass/fail with every reason.
export function judgeSmoke(obs, limits = SMOKE_LIMITS) {
  const reasons = [];
  if (!obs) return { passed: false, reasons: ["no smoke observations"] };
  const [a, b] = [obs.first ?? {}, obs.second ?? {}];
  for (const [label, s] of [["first", a], ["second", b]]) {
    if (s.graphics !== "available") reasons.push(`graphics '${s.graphics}' at the ${label} sample`);
    if (s.ready !== "true") reasons.push(`game not ready at the ${label} sample`);
    if (!s.hud) reasons.push(`HUD not shown at the ${label} sample`);
  }
  const frames = Number(b.frames) - Number(a.frames);
  if (!(frames >= limits.minFrames)) reasons.push(`the game rendered ${Number.isFinite(frames) ? frames : "no"} frames in the sample window (need ${limits.minFrames})`);
  if (!(Number(b.draws) > 0 && Number(b.meshes) > 0 && Number(b.triangles) > 0)) reasons.push("no draw calls, meshes or triangles reported");
  const img = obs.image;
  if (!img) reasons.push("no canvas image");
  else {
    if (!(img.distinctBuckets >= limits.minBuckets)) reasons.push(`canvas image has ${img.distinctBuckets} colour buckets (need ${limits.minBuckets})`);
    if (!(img.lumaStd >= limits.minLumaStd)) reasons.push(`canvas image is flat (luma std ${img.lumaStd})`);
    if (!(img.dominantFraction <= limits.maxDominant)) reasons.push(`canvas image is ${Math.round(img.dominantFraction * 100)}% one colour`);
  }
  for (const e of obs.pageErrors ?? []) reasons.push(`page error: ${e}`);
  for (const m of (obs.console ?? []).filter(relevantConsole)) reasons.push(`console ${m.type}: ${m.text}`);
  if (obs.contextLostEvents) reasons.push(`${obs.contextLostEvents} WebGL context-lost events`);
  return { passed: reasons.length === 0, reasons };
}

// validateReport: a successful production-game smoke on the expected card, in this boot and
// on this host, re-derived from the report's raw data.
export function validateReport(r, ctx = {}) {
  const reasons = [];
  const expect = new RegExp(ctx.expect ?? r?.expect ?? "RTX 3090");
  if (!r || typeof r !== "object") return { ok: false, reasons: ["not a JSON object"] };
  if (r.schema !== SCHEMA) reasons.push(`schema '${r.schema}', expected '${SCHEMA}'`);
  if (r.mode !== "game-smoke") reasons.push(`mode '${r.mode}': a context probe alone is not a game smoke`);
  if (r.verdict !== "accelerated-game-smoke-passed" || r.exitCode !== 0) reasons.push(`top-level verdict '${r.verdict}', exit ${r.exitCode}`);
  const cand = (r.candidates ?? []).find((c) => c.name === r.chosen);
  if (!cand) reasons.push(`chosen candidate '${r.chosen}' is not in the report`);
  else {
    const v = classify(cand.info, expect);
    if (!v.accelerated) reasons.push(`chosen candidate: ${v.reason}`);
    const d = judgeDraw(cand.draw);
    if (!d.passed) reasons.push(`chosen candidate's draw check: ${d.reasons.join("; ")}`);
  }
  const s = r.smoke;
  if (Array.isArray(r.smokes) && r.smokes.length) {
    const last = r.smokes[r.smokes.length - 1];
    if (last.candidate !== r.chosen || !last.passed) reasons.push(`the last smoke attempt ('${last.candidate}') is not the chosen, passing one`);
    if (r.smokes.slice(0, -1).some((a) => a.passed)) reasons.push("an earlier smoke attempt passed but was not chosen");
  }
  if (!s) reasons.push("no smoke section");
  else {
    if (s.candidate !== r.chosen) reasons.push(`smoke ran in '${s.candidate}', not the chosen '${r.chosen}'`);
    const v = classify(s.info, expect);
    if (!v.accelerated) reasons.push(`smoke renderer: ${v.reason}`);
    if (cand && s.info?.unmaskedRenderer !== cand.info?.unmaskedRenderer) reasons.push("smoke and probe renderers differ");
    if (cand && s.browserVersion !== cand.browserVersion) reasons.push("smoke and probe browser versions differ");
    const j = judgeSmoke(s.observations);
    if (!j.passed) reasons.push(`smoke: ${j.reasons.join("; ")}`);
    if (!s.build?.distSha256 || !s.build?.commit) reasons.push("smoke has no build identity");
    if (ctx.commit && s.build?.commit !== ctx.commit) reasons.push(`smoke built from '${s.build?.commit}', expected '${ctx.commit}'`);
  }
  if (!/RTX 3090/.test(r.device?.nvidiaSmi ?? "")) reasons.push(`nvidia-smi in the report: '${r.device?.nvidiaSmi ?? "none"}'`);
  if (ctx.bootId && r.device?.bootId !== ctx.bootId) reasons.push(`report is from boot '${r.device?.bootId}', not this boot`);
  if (ctx.host && r.host !== ctx.host) reasons.push(`report is from host '${r.host}', not '${ctx.host}'`);
  const age = ((ctx.now ?? Date.now()) - Date.parse(r.finishedAt)) / 60000;
  if (!(age >= 0 && age <= (ctx.maxAgeMin ?? 360))) reasons.push(`report age ${Number.isFinite(age) ? Math.round(age) + " min" : "unknown"}`);
  return { ok: reasons.length === 0, reasons };
}

// --- PNG (8-bit RGB/RGBA, not interlaced: what Chromium's screenshots are)

export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let off = 8, width = 0, height = 0, type = 0, depth = 0, interlace = 0; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), name = buf.toString("latin1", off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (name === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (name === "IDAT") idat.push(data);
    else if (name === "IEND") break;
    off += 12 + len;
  }
  if (depth !== 8 || (type !== 2 && type !== 6) || interlace) throw new Error(`unsupported PNG (depth ${depth}, type ${type}, interlace ${interlace})`);
  const ch = type === 6 ? 4 : 3, stride = width * ch, raw = inflateSync(Buffer.concat(idat)), out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[row + x - ch] : 0, b = y ? out[row - stride + x] : 0, c = x >= ch && y ? out[row - stride + x - ch] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      if (pred === undefined) throw new Error(`bad PNG filter ${f}`);
      out[row + x] = (src[x] + pred) & 255;
    }
  }
  return { width, height, channels: ch, data: out };
}

export function imageStats(img) {
  const hist = new Uint32Array(4096); let n = 0, sum = 0, sum2 = 0;
  for (let i = 0; i < img.data.length; i += img.channels) {
    const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
    hist[((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)]++;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b; sum += l; sum2 += l * l; n++;
  }
  let distinct = 0, top = 0;
  for (const c of hist) { if (c) distinct++; if (c > top) top = c; }
  const mean = sum / n;
  return { width: img.width, height: img.height, distinctBuckets: distinct, lumaMean: +mean.toFixed(1), lumaStd: +Math.sqrt(Math.max(0, sum2 / n - mean * mean)).toFixed(1), dominantFraction: +(top / n).toFixed(4) };
}

function encodePng(width, height, rgb) { // for the self-test only
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (name, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const nd = Buffer.concat([Buffer.from(name, "latin1"), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(nd)); return Buffer.concat([len, nd, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  // Each row uses filter (row % 5), so decoding exercises all five.
  const stride = width * 3, enc = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const f = y % 5; enc[y * (stride + 1)] = f;
    for (let x = 0; x < stride; x++) {
      const cur = rgb[y * stride + x], a = x >= 3 ? rgb[y * stride + x - 3] : 0, b = y ? rgb[(y - 1) * stride + x] : 0, c = x >= 3 && y ? rgb[(y - 1) * stride + x - 3] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      enc[y * (stride + 1) + 1 + x] = (cur - pred) & 255;
    }
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(enc)), chunk("IEND", Buffer.alloc(0))]);
}

// --- In the page

function readContext(gl) {
  if (!gl) return { webgl2: false };
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  return {
    webgl2: typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext,
    vendor: gl.getParameter(gl.VENDOR), renderer: gl.getParameter(gl.RENDERER), version: gl.getParameter(gl.VERSION),
    unmaskedVendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null,
    unmaskedRenderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
  };
}

// Draws three solid colours with a real shader into a 64x64 canvas and reads five pixels of each back.
function drawInPage() {
  const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 64;
  const gl = canvas.getContext("webgl2", { powerPreference: "high-performance", preserveDrawingBuffer: true, antialias: false });
  if (!gl) return { info: { webgl2: false }, draw: null };
  const info = READ_CONTEXT(gl);
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const vs = sh(gl.VERTEX_SHADER, "#version 300 es\nin vec2 p;\nvoid main() { gl_Position = vec4(p, 0.0, 1.0); }");
  const fs = sh(gl.FRAGMENT_SHADER, "#version 300 es\nprecision highp float;\nuniform vec4 c;\nout vec4 o;\nvoid main() { o = c; }");
  const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  const linked = !!gl.getProgramParameter(prog, gl.LINK_STATUS);
  const log = [gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs), gl.getProgramInfoLog(prog)].filter(Boolean).join(" ");
  const samples = [];
  if (linked) {
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.viewport(0, 0, 64, 64);
    for (const c of [[255, 0, 0], [0, 255, 0], [51, 102, 204]]) {
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform4f(gl.getUniformLocation(prog, "c"), c[0] / 255, c[1] / 255, c[2] / 255, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      for (const [x, y] of [[0, 0], [63, 0], [0, 63], [63, 63], [32, 32]]) {
        const px = new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        samples.push({ x, y, want: c, got: [px[0], px[1], px[2]] });
      }
    }
  }
  return { info, draw: { linked, log, samples, glError: gl.getError(), contextLost: gl.isContextLost() } };
}

// --- Running it

function parseArgs(argv) {
  const o = { chrome: path.join(os.homedir(), ".cache/ms-playwright/chromium-1248/chrome-linux64/chrome"), expect: "RTX 3090", port: 5192, size: "1920x1080", maxAgeMin: 360 };
  const flags = { "--self-test": "selfTest", "--allow-software": "allowSoftware" };
  const values = ["--out", "--chrome", "--playwright", "--dist", "--commit", "--port", "--size", "--expect", "--validate", "--boot-id", "--host", "--max-age-min", "--candidate"];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (flags[a]) o[flags[a]] = true;
    else if (values.includes(a) && i + 1 < argv.length) o[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
    else throw new Error(`unknown or incomplete option ${a}`);
  }
  return o;
}

function deviceFacts() {
  const read = (f) => { try { return readFileSync(f, "utf8").trim(); } catch { return null; } };
  let smi = null;
  try { smi = execFileSync("nvidia-smi", ["--query-gpu=name,pci.bus_id,driver_version", "--format=csv,noheader"], { timeout: 15000, encoding: "utf8" }).trim(); } catch { smi = null; }
  let dev = [];
  try { dev = readdirSync("/dev").filter((n) => n.startsWith("nvidia")); } catch { dev = []; }
  return { bootId: read("/proc/sys/kernel/random/boot_id"), nvidiaDriver: read("/proc/driver/nvidia/version")?.split("\n")[0] ?? null, nvidiaSmi: smi, devNodes: dev };
}

function distIdentity(dir) {
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d).sort()) { const p = path.join(d, n); if (statSync(p).isDirectory()) walk(p); else files.push(p); } };
  walk(dir);
  const lines = files.map((f) => `${path.relative(dir, f)}\t${createHash("sha256").update(readFileSync(f)).digest("hex")}`);
  return { files: files.length, distSha256: createHash("sha256").update(lines.join("\n")).digest("hex"), indexSha256: createHash("sha256").update(readFileSync(path.join(dir, "index.html"))).digest("hex") };
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".wasm": "application/wasm", ".webp": "image/webp", ".jpg": "image/jpeg", ".glb": "model/gltf-binary", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".woff2": "font/woff2" };
function serve(dir, port) { // the probe's own static server, bound to loopback
  const root = path.resolve(dir);
  const server = createServer((req, res) => {
    const rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const file = path.resolve(root, "." + (rel.endsWith("/") ? rel + "index.html" : rel));
    if (!file.startsWith(root + path.sep) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(readFileSync(file));
  });
  return new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", () => resolve(server)); });
}

async function withBrowser(chromium, opts, candidate, fn) {
  const browser = await chromium.launch({ executablePath: opts.chrome, headless: true, args: candidate.args, timeout: 30000 });
  try { return await fn(browser); } finally { await browser.close().catch(() => {}); }
}

async function probe(chromium, opts, candidate) {
  return withBrowser(chromium, opts, candidate, async (browser) => {
    const page = await browser.newPage();
    const res = await page.evaluate(`(${drawInPage.toString().replace("READ_CONTEXT", `(${readContext})`)})()`);
    let gpuPage = "";
    try {
      await page.goto("chrome://gpu", { timeout: 15000 });
      await page.waitForTimeout(1500);
      const text = await page.evaluate(() => document.querySelector("info-view")?.shadowRoot?.textContent || document.body.innerText);
      gpuPage = text.slice(Math.max(0, text.indexOf("Graphics Feature Status"))).replace(/[ \t]+/g, " ").slice(0, 8000);
    } catch (e) { gpuPage = `chrome://gpu unavailable: ${e.message}`; }
    return { browserVersion: browser.version(), info: res.info, draw: res.draw, gpuPage };
  });
}

async function smoke(chromium, opts, candidate, out, build) {
  const [width, height] = opts.size.split("x").map(Number);
  const server = await serve(opts.dist, Number(opts.port));
  try {
    return await withBrowser(chromium, opts, candidate, async (browser) => {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const obs = { console: [], pageErrors: [], contextLostEvents: 0 };
      page.on("pageerror", (e) => obs.pageErrors.push(e.message));
      page.on("console", (m) => { if (m.type() !== "log" && m.type() !== "debug" && m.type() !== "info") obs.console.push({ type: m.type(), text: m.text().slice(0, 500) }); });
      await page.addInitScript(() => { window.__probeLost = 0; document.addEventListener("webglcontextlost", () => { window.__probeLost++; }, true); });
      const url = `http://127.0.0.1:${opts.port}/`;
      await page.goto(url, { waitUntil: "load", timeout: 30000 });
      await page.waitForFunction(() => document.querySelector("#ocean")?.dataset.graphics === "available", null, { timeout: 30000 });
      await page.locator("#new-game").click({ timeout: 20000 });
      await page.waitForFunction(() => document.querySelector("#ocean")?.dataset.ready === "true" && document.querySelector("#hud")?.hidden === false, null, { timeout: 60000 });
      const sample = () => page.evaluate(() => { const d = document.querySelector("#ocean").dataset; return { at: performance.now(), frames: d.frames, draws: d.draws, meshes: d.meshes, triangles: d.triangles, ready: d.ready, graphics: d.graphics, hud: document.querySelector("#hud")?.hidden === false }; });
      obs.first = await sample();
      await page.waitForTimeout(5000);
      obs.second = await sample();
      // Only WebGL output counts: hide every DOM overlay (HUD, menus) above the canvas first.
      await page.addStyleTag({ content: "* { visibility: hidden !important; } #ocean { visibility: visible !important; }" });
      await page.waitForTimeout(300);
      const png = await page.locator("#ocean").screenshot({ type: "png" });
      writeFileSync(path.join(out, "game.png"), png);
      obs.image = imageStats(decodePng(png));
      obs.contextLostEvents = await page.evaluate(() => window.__probeLost);
      const info = await page.evaluate(`(${readContext})(document.querySelector("#ocean").getContext("webgl2"))`);
      const seconds = (obs.second.at - obs.first.at) / 1000, frames = Number(obs.second.frames) - Number(obs.first.frames);
      return {
        candidate: candidate.name, browserVersion: browser.version(), url, viewport: `${width}x${height}@1`, build, info, observations: obs,
        gameRenderedFrames: frames, gameRenderedFramesPerSecond: +(frames / seconds).toFixed(1),
        metricNote: "frames counted by the game's own render loop (canvas data-frames) in headless Chromium; not a representative performance measurement",
        screenshot: path.join(out, "game.png"), imageScope: "the game canvas only, DOM overlays hidden",
      };
    });
  } finally { await new Promise((r) => server.close(r)); }
}

// A complete passing report with synthetic data, for the self-test and the guest tests only.
export function fixtureReport({ bootId, host, commit, finishedAt }) {
  const NV = "ANGLE (NVIDIA, Vulkan 1.3.277 (NVIDIA NVIDIA GeForce RTX 3090 (0x00002204)), NVIDIA)";
  const info = { webgl2: true, unmaskedRenderer: NV, unmaskedVendor: "" };
  const draw = { linked: true, log: "", glError: 0, contextLost: false, samples: [[255, 0, 0], [0, 255, 0], [51, 102, 204]].flatMap((c) => [0, 1, 2, 3, 4].map((i) => ({ x: i, y: i, want: c, got: [...c] }))) };
  const s0 = { graphics: "available", ready: "true", hud: true, frames: "100", draws: "72", meshes: "92", triangles: "340439" };
  const observations = { first: s0, second: { ...s0, frames: "400" }, image: { distinctBuckets: 900, lumaStd: 40, dominantFraction: 0.2 }, pageErrors: [],
    console: [{ type: "warning", text: "[.WebGL-0x1]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels" }], contextLostEvents: 0 };
  return { schema: SCHEMA, mode: "game-smoke", verdict: "accelerated-game-smoke-passed", exitCode: 0, host, finishedAt, chosen: "angle-gl-egl", fixture: true,
    candidates: [{ name: "angle-gl-egl", browserVersion: "156.0.8078.4", info, draw }],
    device: { bootId, nvidiaSmi: "NVIDIA GeForce RTX 3090, 00000000:06:00.0, 550.163.01" },
    smoke: { candidate: "angle-gl-egl", browserVersion: "156.0.8078.4", info, observations, build: { commit, distSha256: "d" } } };
}

async function selfTest() {
  let failed = 0;
  const check = (label, got, want) => { const ok = got === want; console.log(`${ok ? "ok  " : "FAIL"} ${label}`); if (!ok) failed++; };
  const r = (u) => ({ webgl2: true, unmaskedRenderer: u, unmaskedVendor: "" });
  const NV = "ANGLE (NVIDIA, Vulkan 1.3.277 (NVIDIA NVIDIA GeForce RTX 3090 (0x00002204)), NVIDIA)";
  for (const [u, want] of [[NV, true], ["ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 3090/PCIe/SSE2, OpenGL ES 3.2 NVIDIA 550.163.01)", true],
    ["ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)", false], ["llvmpipe (LLVM 19.1.7, 256 bits)", false],
    ["ANGLE (NVIDIA, Vulkan 1.3.277 (NVIDIA NVIDIA GeForce RTX 3080 (0x00002206)), NVIDIA)", false], ["ANGLE (Mesa, Vulkan 1.3 (AMD Radeon), Mesa)", false]])
    check(`classify ${want ? "accepts" : "rejects"}: ${u}`, classify(r(u)).accelerated, want);
  check("classify rejects: no WebGL2", classify({ webgl2: false }).accelerated, false);
  check("classify rejects: renderer hidden", classify({ webgl2: true, unmaskedRenderer: null }).accelerated, false);

  const goodDraw = { linked: true, log: "", glError: 0, contextLost: false, samples: [[255, 0, 0], [0, 255, 0], [51, 102, 204]].flatMap((c) => [0, 1, 2, 3, 4].map((i) => ({ x: i, y: i, want: c, got: [...c] }))) };
  check("draw: exact readback passes", judgeDraw(goodDraw).passed, true);
  check("draw: wrong pixel fails", judgeDraw({ ...goodDraw, samples: goodDraw.samples.map((s, i) => (i === 7 ? { ...s, got: [0, 0, 0] } : s)) }).passed, false);
  check("draw: GL error fails", judgeDraw({ ...goodDraw, glError: 0x502 }).passed, false);
  check("draw: lost context fails", judgeDraw({ ...goodDraw, contextLost: true }).passed, false);
  check("draw: unlinked program fails", judgeDraw({ ...goodDraw, linked: false }).passed, false);
  check("draw: no samples fails", judgeDraw({ ...goodDraw, samples: [] }).passed, false);

  const s0 = { graphics: "available", ready: "true", hud: true, frames: "100", draws: "72", meshes: "92", triangles: "340439" };
  const goodObs = { first: s0, second: { ...s0, frames: "400" }, image: { distinctBuckets: 900, lumaStd: 40, dominantFraction: 0.2 }, pageErrors: [], console: [{ type: "warning", text: "[.WebGL-0x1]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels" }], contextLostEvents: 0 };
  check("smoke: rendering game with a performance note passes", judgeSmoke(goodObs).passed, true);
  check("smoke: console 'WebGL: shader compilation failed' fails (R1-07 case)", judgeSmoke({ ...goodObs, console: [{ type: "error", text: "WebGL: shader compilation failed" }] }).passed, false);
  check("smoke: WebGL INVALID_OPERATION warning fails", judgeSmoke({ ...goodObs, console: [{ type: "warning", text: "[.WebGL-0x1]GL_INVALID_OPERATION: glDrawElements: no buffer" }] }).passed, false);
  check("smoke: frames not advancing fails (frozen game)", judgeSmoke({ ...goodObs, second: { ...s0 } }).passed, false);
  check("smoke: game not ready fails", judgeSmoke({ ...goodObs, second: { ...goodObs.second, ready: "false" } }).passed, false);
  check("smoke: lost graphics fails", judgeSmoke({ ...goodObs, second: { ...goodObs.second, graphics: "lost" } }).passed, false);
  check("smoke: flat canvas fails", judgeSmoke({ ...goodObs, image: { distinctBuckets: 3, lumaStd: 1, dominantFraction: 0.99 } }).passed, false);
  check("smoke: page error fails", judgeSmoke({ ...goodObs, pageErrors: ["TypeError: x"] }).passed, false);
  check("smoke: context-lost event fails", judgeSmoke({ ...goodObs, contextLostEvents: 1 }).passed, false);
  check("smoke: missing observations fail", judgeSmoke(undefined).passed, false);

  const now = Date.parse("2026-10-20T12:00:00Z");
  const good = fixtureReport({ bootId: "boot-a", host: "factory-worker", commit: "abc", finishedAt: "2026-10-20T11:30:00Z" });
  const cand = good.candidates[0];
  const ctx = { commit: "abc", bootId: "boot-a", host: "factory-worker", now };
  const v = (rep) => validateReport(rep, ctx).ok;
  check("validate: complete current smoke passes", v(good), true);
  check("validate: context-only report fails (R1-06 case)", v({ ...good, mode: "context", verdict: "accelerated", smoke: undefined }), false);
  check("validate: failed document with a nested 'accelerated' string fails (R1-06 case)", v({ verdict: "NOT accelerated", exitCode: 1, note: { verdict: "accelerated" } }), false);
  check("validate: stored smoke 'passed' over failing observations fails", v({ ...good, smoke: { ...good.smoke, passed: true, observations: { ...goodObs, console: [{ type: "error", text: "WebGL: shader compilation failed" }] } } }), false);
  check("validate: software smoke renderer fails", v({ ...good, smoke: { ...good.smoke, info: r("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)") } }), false);
  check("validate: smoke in another candidate fails", v({ ...good, smoke: { ...good.smoke, candidate: "chrome-default" } }), false);
  check("validate: chosen candidate's draw failing fails", v({ ...good, candidates: [{ ...cand, draw: { ...goodDraw, glError: 0x502 } }] }), false);
  check("validate: other commit fails", v({ ...good, smoke: { ...good.smoke, build: { commit: "zzz", distSha256: "d" } } }), false);
  check("validate: other boot fails (stale, before the GPU)", v({ ...good, device: { ...good.device, bootId: "boot-old" } }), false);
  check("validate: other host fails", v({ ...good, host: "mac-mini" }), false);
  check("validate: too old fails", v({ ...good, finishedAt: "2026-10-19T00:00:00Z" }), false);
  check("validate: no nvidia-smi 3090 fails", v({ ...good, device: { ...good.device, nvidiaSmi: null } }), false);
  check("validate: wrong schema fails", v({ ...good, schema: "1" }), false);

  const w = 40, h = 30, rgb = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) { rgb[i * 3] = (i * 7) & 255; rgb[i * 3 + 1] = (i * 13) & 255; rgb[i * 3 + 2] = (i * 29) & 255; }
  const dec = decodePng(encodePng(w, h, rgb));
  check("png: decoding all five filters round-trips", dec.width === w && dec.height === h && Buffer.compare(dec.data, rgb) === 0, true);
  check("png: flat image stats show one colour", imageStats(decodePng(encodePng(8, 8, Buffer.alloc(8 * 8 * 3, 20)))).dominantFraction, 1);
  // Smoke order and fallback (2026-10-20: ANGLE-Vulkan loses the context at game startup).
  const res = (name, acc, draw = acc) => ({ name, verdict: { accelerated: acc }, info: { webgl2: true }, drawJudgement: { passed: draw } });
  check("order: gl-egl is tried before vulkan", CANDIDATES[0].name === "angle-gl-egl" && CANDIDATES[1].name === "angle-vulkan", true);
  check("order: accelerated candidates only, in list order", smokeOrder([res("angle-gl-egl", true), res("angle-vulkan", true), res("chrome-default", false)]).names.join(","), "angle-gl-egl,angle-vulkan");
  check("order: no accelerated candidate and no --allow-software: nothing to smoke", smokeOrder([res("angle-gl-egl", false)]).names.length, 0);
  check("order: --allow-software falls back to a drawing software candidate", smokeOrder([res("angle-vulkan", false, false), res("angle-gl-egl", false, true)], true).names.join(","), "angle-gl-egl");
  const lostObs = { ...goodObs, contextLostEvents: 1 };
  const runner = (table) => async (name) => { if (table[name] === "throw") throw new Error(`launch of ${name} failed`); return { candidate: name, passed: judgeSmoke(table[name]).passed }; };
  let sel = await selectSmoke(["angle-vulkan", "angle-gl-egl"], runner({ "angle-vulkan": lostObs, "angle-gl-egl": goodObs }));
  check("fallback: a context loss fails vulkan, gl-egl passes and is chosen", `${sel.attempts.map((a) => `${a.candidate}:${a.passed}`).join(",")}|${sel.passed?.candidate}`, "angle-vulkan:false,angle-gl-egl:true|angle-gl-egl");
  sel = await selectSmoke(["angle-gl-egl", "angle-vulkan"], runner({ "angle-gl-egl": goodObs, "angle-vulkan": lostObs }));
  check("selection: the first passing candidate is chosen and later ones are not run", `${sel.attempts.length}|${sel.passed?.candidate}`, "1|angle-gl-egl");
  sel = await selectSmoke(["angle-gl-egl", "angle-vulkan"], runner({ "angle-gl-egl": "throw", "angle-vulkan": lostObs }));
  check("fallback: a launch error is a failed attempt; nothing passes", `${sel.attempts.map((a) => a.passed).join(",")}|${sel.passed}|${!!sel.attempts[0].error}`, "false,false|null|true");
  const multi = { ...good, chosen: "angle-gl-egl", candidates: [{ ...cand, name: "angle-vulkan" }, { ...cand, name: "angle-gl-egl" }],
    smoke: { ...good.smoke, candidate: "angle-gl-egl" }, smokes: [{ candidate: "angle-vulkan", passed: false }, { ...good.smoke, candidate: "angle-gl-egl", passed: true }] };
  check("validate: fallback report (vulkan lost, gl-egl passed and chosen) passes", v(multi), true);
  check("validate: chosen is not the passing attempt fails", v({ ...multi, smokes: [{ ...good.smoke, candidate: "angle-gl-egl", passed: true }, { candidate: "angle-vulkan", passed: false }] }), false);
  check("validate: an earlier passing attempt that was not chosen fails", v({ ...multi, smokes: [{ candidate: "angle-vulkan", passed: true }, { ...good.smoke, candidate: "angle-gl-egl", passed: true }] }), false);
  check("validate: chosen with a context-lost smoke fails", v({ ...multi, smoke: { ...multi.smoke, observations: lostObs } }), false);
  console.log(`probe self-test failed ${failed}`);
  return failed ? 1 : 0;
}

function cmdValidate(opts) {
  let report;
  try { report = JSON.parse(readFileSync(opts.validate, "utf8")); } catch (e) { console.log(`FAIL report ${opts.validate}: ${e.message}`); return 1; }
  const res = validateReport(report, { commit: opts.commit, bootId: opts.bootId, host: opts.host, maxAgeMin: Number(opts.maxAgeMin), expect: opts.expect });
  if (res.ok) console.log(`PASS ${opts.validate}: ${report.smoke.info.unmaskedRenderer} in ${report.chosen}; game rendered ${report.smoke.gameRenderedFrames} frames in the window (${report.smoke.gameRenderedFramesPerSecond}/s headless, not a performance figure); build ${report.smoke.build.commit} ${report.smoke.build.distSha256.slice(0, 12)}`);
  else for (const r of res.reasons) console.log(`FAIL ${r}`);
  return res.ok ? 0 : 1;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.selfTest) return selfTest();
  if (opts.validate) return cmdValidate(opts);
  if (!opts.out || !opts.playwright) throw new Error("needs --out DIR and --playwright DIR (a playwright-core folder)");
  if (opts.dist && !opts.commit) throw new Error("--dist needs --commit (the source commit the build came from)");
  requireGpuLease("webgl-probe.mjs");
  mkdirSync(opts.out, { recursive: true });
  const expect = new RegExp(opts.expect);
  const pw = createRequire(import.meta.url)(path.resolve(opts.playwright));
  const report = { schema: SCHEMA, mode: opts.dist ? "game-smoke" : "context", startedAt: new Date().toISOString(), host: os.hostname(), platform: `${os.type()} ${os.release()}`,
    chrome: opts.chrome, playwrightCore: createRequire(import.meta.url)(path.join(path.resolve(opts.playwright), "package.json")).version, expect: opts.expect,
    allowSoftware: !!opts.allowSoftware, device: deviceFacts(), candidates: [] };
  let list = CANDIDATES;
  if (opts.candidate) {
    list = CANDIDATES.filter((c) => c.name === opts.candidate);
    if (!list.length) throw new Error(`unknown --candidate '${opts.candidate}'; known: ${CANDIDATES.map((c) => c.name).join(", ")}`);
    report.pinned = opts.candidate;
  }
  for (const c of list) {
    let res;
    try { res = await probe(pw.chromium, opts, c); } catch (e) { res = { error: e.message.split("\n")[0] }; }
    res.classification = classify(res.info, expect);
    res.drawJudgement = judgeDraw(res.draw);
    res.verdict = { accelerated: res.classification.accelerated && res.drawJudgement.passed };
    report.candidates.push({ name: c.name, args: c.args, ...res });
    console.log(`${c.name}: ${res.error ?? res.info?.unmaskedRenderer ?? "no renderer"}; draw ${res.drawJudgement.passed ? "ok" : res.drawJudgement.reasons[0]} -> ${res.verdict.accelerated ? "ACCELERATED" : res.classification.accelerated ? "draw failed" : res.classification.reason}`);
  }
  const order = smokeOrder(report.candidates, !!opts.allowSoftware);
  const anyAccelerated = !order.software && order.names.length > 0;
  report.chosen = anyAccelerated ? order.names[0] : null;
  let code = anyAccelerated ? 0 : 1;
  if (opts.dist && order.names.length) {
    const build = { commit: opts.commit, dist: path.resolve(opts.dist), ...distIdentity(opts.dist) };
    const byName = (n) => CANDIDATES.find((c) => c.name === n);
    const { attempts, passed } = await selectSmoke(order.names, async (name) => {
      const sub = order.names.length > 1 ? path.join(opts.out, `smoke-${name}`) : opts.out;
      mkdirSync(sub, { recursive: true });
      try {
        const s = await smoke(pw.chromium, opts, byName(name), sub, build);
        s.classification = classify(s.info, expect);
        s.judgement = judgeSmoke(s.observations);
        s.passed = s.classification.accelerated && s.judgement.passed && s.info?.unmaskedRenderer === report.candidates.find((c) => c.name === name)?.info?.unmaskedRenderer;
        s.functionalOnly = order.software; // software run under --allow-software: proves the harness, not the GPU
        console.log(`smoke (${name}${s.functionalOnly ? ", SOFTWARE: functional check only" : ""}): ${s.info?.unmaskedRenderer ?? "no context"}; game rendered ${s.gameRenderedFrames} frames (${s.gameRenderedFramesPerSecond}/s headless); image ${s.observations.image?.distinctBuckets} buckets; ${s.judgement.passed ? "game checks pass" : s.judgement.reasons.join("; ")} -> ${s.passed ? "PASS" : "FAIL"}`);
        if (order.software) s.passed = false; // never a passing accelerated smoke
        return s;
      } catch (e) {
        console.log(`smoke (${name}) failed: ${e.message.split("\n")[0]}`);
        return { candidate: name, build, error: e.message.split("\n")[0], passed: false };
      }
    });
    report.smokes = attempts;
    if (passed) { report.chosen = passed.candidate; report.smoke = passed; }
    else { report.smoke = attempts[0]; if (anyAccelerated) code = 3; }
  } else if (opts.dist) report.smoke = { error: "no candidate to run the smoke in", passed: false };
  report.exitCode = code;
  report.verdict = code === 1 ? "not-accelerated" : code === 3 ? "accelerated-game-smoke-failed" : opts.dist ? "accelerated-game-smoke-passed" : "accelerated";
  report.finishedAt = new Date().toISOString();
  writeFileSync(path.join(opts.out, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`verdict: ${report.verdict} (report ${path.join(opts.out, "report.json")})`);
  return code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().then((c) => process.exit(c), (e) => { console.error(`webgl-probe: ${e.message}`); process.exit(2); });
