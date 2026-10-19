#!/usr/bin/env node
// Does an isolated Chromium on this machine render WebGL2 on the RTX 3090?
//
//   TMPDIR=/work/tmp node webgl-probe.mjs --out DIR --playwright DIR/node_modules/playwright-core
//       [--chrome PATH] [--url http://127.0.0.1:5192/] [--expect 'RTX 3090'] [--allow-software]
//   node webgl-probe.mjs --self-test
//
// It launches its own headless browser (fresh temporary profile, closed at the end)
// once per fixed candidate below and reads the unmasked WebGL2 renderer. Nothing is
// shared with T3's preview browser, which pins its own build with --disable-gpu.
// With --url it then loads the game in the first accelerated candidate, starts a new
// expedition, measures frames for 5 s and saves a screenshot. --allow-software runs
// the smoke on a software renderer too (to check this harness without a GPU); the
// verdict still fails. Exit: 0 accelerated (and smoke passed), 1 not accelerated,
// 2 usage or launch error, 3 smoke failed.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Per-process switches for this probe's own browser only. Which one works is what
// the probe finds out; the report records every result.
export const CANDIDATES = [
  { name: "angle-vulkan", args: ["--use-angle=vulkan", "--enable-features=Vulkan", "--disable-vulkan-surface", "--ignore-gpu-blocklist"] },
  { name: "angle-gl-egl", args: ["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist"] },
  { name: "chrome-default", args: [] },
];
const SOFTWARE = /SwiftShader|Subzero|llvmpipe|lavapipe|softpipe|Software|Microsoft Basic Render/i;

export function classify(info, expect = /RTX 3090/) {
  if (!info || !info.webgl2) return { accelerated: false, reason: "no WebGL2 context" };
  const r = `${info.unmaskedRenderer ?? ""} ${info.unmaskedVendor ?? ""}`;
  if (!info.unmaskedRenderer) return { accelerated: false, reason: "renderer not exposed" };
  if (SOFTWARE.test(r)) return { accelerated: false, reason: `software renderer: ${info.unmaskedRenderer}` };
  if (!/NVIDIA/i.test(r)) return { accelerated: false, reason: `not NVIDIA: ${info.unmaskedRenderer}` };
  if (!expect.test(r)) return { accelerated: false, reason: `NVIDIA but not ${expect}: ${info.unmaskedRenderer}` };
  return { accelerated: true, reason: info.unmaskedRenderer };
}

// Runs in the page.
function readContext(gl) {
  if (!gl) return { webgl2: false };
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  return {
    webgl2: typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext,
    vendor: gl.getParameter(gl.VENDOR),
    renderer: gl.getParameter(gl.RENDERER),
    version: gl.getParameter(gl.VERSION),
    unmaskedVendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null,
    unmaskedRenderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
  };
}

function selfTest() {
  const cases = [
    ["ANGLE (NVIDIA, Vulkan 1.3.277 (NVIDIA NVIDIA GeForce RTX 3090 (0x00002204)), NVIDIA)", true],
    ["ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 3090/PCIe/SSE2, OpenGL ES 3.2 NVIDIA 550.163.01)", true],
    ["ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)", false],
    ["llvmpipe (LLVM 19.1.7, 256 bits)", false],
    ["ANGLE (NVIDIA, Vulkan 1.3.277 (NVIDIA NVIDIA GeForce RTX 3080 (0x00002206)), NVIDIA)", false],
    ["ANGLE (Mesa, Vulkan 1.3 (AMD Radeon), Mesa)", false],
  ];
  let failed = 0;
  for (const [renderer, want] of cases) {
    const got = classify({ webgl2: true, unmaskedRenderer: renderer, unmaskedVendor: "" }).accelerated;
    console.log(`${got === want ? "ok  " : "FAIL"} classify ${want ? "accepts" : "rejects"}: ${renderer}`);
    if (got !== want) failed++;
  }
  for (const [label, info] of [["no WebGL2", { webgl2: false }], ["renderer hidden", { webgl2: true, unmaskedRenderer: null }]]) {
    const got = classify(info).accelerated;
    console.log(`${got ? "FAIL" : "ok  "} classify rejects: ${label}`);
    if (got) failed++;
  }
  console.log(`classifier failed ${failed}`);
  return failed ? 1 : 0;
}

function parseArgs(argv) {
  const o = { chrome: path.join(os.homedir(), ".cache/ms-playwright/chromium-1248/chrome-linux64/chrome"), expect: "RTX 3090" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--self-test") o.selfTest = true;
    else if (a === "--allow-software") o.allowSoftware = true;
    else if (["--out", "--chrome", "--playwright", "--url", "--expect"].includes(a)) o[a.slice(2)] = argv[++i];
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

async function withBrowser(chromium, opts, candidate, fn) {
  const browser = await chromium.launch({ executablePath: opts.chrome, headless: true, args: candidate.args, timeout: 30000 });
  try { return await fn(browser); } finally { await browser.close().catch(() => {}); }
}

async function probe(chromium, opts, candidate) {
  return withBrowser(chromium, opts, candidate, async (browser) => {
    const page = await browser.newPage();
    const info = await page.evaluate(`(${readContext})(document.createElement("canvas").getContext("webgl2", { powerPreference: "high-performance" }))`);
    let gpuPage = "";
    try {
      await page.goto("chrome://gpu", { timeout: 15000 });
      await page.waitForTimeout(1500);
      // chrome://gpu renders inside the <info-view> shadow root.
      const text = await page.evaluate(() => document.querySelector("info-view")?.shadowRoot?.textContent || document.body.innerText);
      gpuPage = text.slice(Math.max(0, text.indexOf("Graphics Feature Status"))).replace(/[ \t]+/g, " ").slice(0, 8000);
    } catch (e) { gpuPage = `chrome://gpu unavailable: ${e.message}`; }
    return { browserVersion: browser.version(), info, gpuPage };
  });
}

async function smoke(chromium, opts, candidate, out) {
  return withBrowser(chromium, opts, candidate, async (browser) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        const ctx = original.call(this, type, ...rest);
        if (ctx && /webgl/.test(type)) (window.__probeContexts ||= []).push(ctx);
        return ctx;
      };
    });
    await page.goto(opts.url, { waitUntil: "load", timeout: 30000 });
    await page.locator("#new-game").click({ timeout: 20000 });
    await page.waitForTimeout(8000);
    const frames = await page.evaluate(() => new Promise((resolve) => {
      let n = 0; const end = performance.now() + 5000;
      const tick = (t) => { n++; if (t < end) requestAnimationFrame(tick); else resolve(n); };
      requestAnimationFrame(tick);
    }));
    const info = await page.evaluate(`(${readContext})((window.__probeContexts || [])[0])`);
    const screenshot = path.join(out, "game.png");
    await page.screenshot({ path: screenshot });
    return { url: opts.url, info, framesIn5s: frames, fps: Math.round(frames / 5), errors, screenshot };
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.selfTest) return selfTest();
  if (!opts.out || !opts.playwright) throw new Error("needs --out DIR and --playwright DIR (a playwright-core folder)");
  mkdirSync(opts.out, { recursive: true });
  const expect = new RegExp(opts.expect);
  const { chromium } = createRequire(import.meta.url)(path.resolve(opts.playwright));
  const report = { at: new Date().toISOString(), host: os.hostname(), platform: `${os.type()} ${os.release()}`, chrome: opts.chrome, expect: opts.expect, candidates: [] };
  let chosen = null, fallback = null;
  for (const c of CANDIDATES) {
    let r;
    try { r = { ...(await probe(chromium, opts, c)) }; } catch (e) { r = { error: e.message.split("\n")[0] }; }
    r.verdict = classify(r.info, expect);
    report.candidates.push({ name: c.name, args: c.args, ...r });
    console.log(`${c.name}: ${r.error ?? r.info?.unmaskedRenderer ?? "no renderer"} -> ${r.verdict.accelerated ? "ACCELERATED" : r.verdict.reason}`);
    if (r.verdict.accelerated && !chosen) chosen = c;
    if (r.info?.webgl2 && !fallback) fallback = c;
  }
  report.chosen = chosen?.name ?? null;
  let code = chosen ? 0 : 1;
  const smokeWith = chosen ?? (opts.allowSoftware ? fallback : null);
  if (opts.url && smokeWith) {
    try {
      const s = await smoke(chromium, opts, smokeWith, opts.out);
      s.candidate = smokeWith.name;
      s.verdict = classify(s.info, expect);
      s.passed = s.verdict.accelerated && s.framesIn5s > 0 && !s.errors.some((e) => e.startsWith("pageerror"));
      report.smoke = s;
      console.log(`smoke (${s.candidate}): ${s.info?.unmaskedRenderer ?? "no context"}, ${s.fps} fps, ${s.errors.length} errors -> ${s.passed ? "PASS" : "FAIL"}`);
      if (chosen && !s.passed) code = 3;
    } catch (e) {
      report.smoke = { candidate: smokeWith.name, error: e.message.split("\n")[0], passed: false };
      console.log(`smoke (${smokeWith.name}) failed: ${report.smoke.error}`);
      if (chosen) code = 3;
    }
  }
  report.exitCode = code;
  report.verdict = code === 0 ? "accelerated" : code === 3 ? "accelerated, smoke failed" : "NOT accelerated";
  writeFileSync(path.join(opts.out, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`verdict: ${report.verdict} (report ${path.join(opts.out, "report.json")})`);
  return code;
}

main().then((c) => process.exit(c), (e) => { console.error(`webgl-probe: ${e.message}`); process.exit(2); });
