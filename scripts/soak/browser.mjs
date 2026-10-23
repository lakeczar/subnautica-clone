// The soak's browser session: one task-owned headless Chrome on the GPU
// (ANGLE GL-EGL, inside a gpu or soak --gpu job, which holds the GPU lease),
// the built game served from `dist` on a loopback port, a save imported
// through the menu like a player's backup, and ordinary keys only (W, Shift,
// arrows, Space, C, F5), steered closed-loop from the HUD bearing and pitch
// and the canvas camera position, as the C3 and CW-1 drivers do.
// Follows docs/BROWSER_RULES.md: own profile, own port, closes what it opens.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { requireGpuLease } from "../heavy/gpu-lease.mjs";
import { frameRecorderScript } from "./probe.mjs";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".wasm": "application/wasm", ".bin": "application/octet-stream" };
const wrap = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

export class Blocked extends Error {}

/**
 * opts: { dist, save, port, software (SwiftShader, functional only, no lease),
 *   chrome (binary), pw (where playwright-core is installed), gpu (regex the
 *   renderer must match), label, log,
 *   query (the URL's search, e.g. "?rec=driver"), isolate (serve COOP/COEP:
 *   5 µs timers and the memory API; REC-1's drivers), initScripts (run before
 *   the game loads, after the soak's own frame recorder) }
 */
export async function openGame(opts) {
  const { dist, save, port, software = false, log = () => {} } = opts;
  if (!software) requireGpuLease("the soak's browser");
  // On the second worker (siltwake-alickers) the browser is its Linux-only
  // wrapper, which sets its own GPU flags (WORKER_RESOURCE_LIMITS, "Second
  // worker"), and playwright-core is in /work/tmp/pw.
  const sandboxChrome = "/usr/local/bin/siltwake-chrome";
  const onSandbox = !opts.chrome && !software && existsSync(sandboxChrome);
  const pw = opts.pw ?? process.env.SOAK_PW ?? ["/work/tmp/gpu-prep/pw/", "/work/tmp/pw/"].find((d) => existsSync(path.join(d, "node_modules", "playwright-core"))) ?? "/work/tmp/gpu-prep/pw/";
  const { chromium } = createRequire(pw)("playwright-core");
  const root = path.resolve(dist);
  const server = createServer((req, res) => {
    const rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const file = path.resolve(root, "." + (rel.endsWith("/") ? rel + "index.html" : rel));
    if (!file.startsWith(root + path.sep) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store",
      ...(opts.isolate ? { "cross-origin-opener-policy": "same-origin", "cross-origin-embedder-policy": "require-corp" } : {}) });
    res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(Number(port), "127.0.0.1", r));
  const bound = server.address().port; // port 0: any free port
  const label = `${opts.label ?? "soak"}-${process.pid}`;
  const browser = await chromium.launch({
    executablePath: opts.chrome ?? (onSandbox ? sandboxChrome : `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`), headless: true, timeout: 30000,
    args: [...(software ? ["--use-angle=swiftshader"] : onSandbox ? [] : ["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist"]), "--enable-precise-memory-info", `--siltwake-soak=${label}`],
  });
  const g = { browser, server, errors: [], crash: null, label, held: new Set(), eye: 0, port: bound, chrome: browser.version() };
  g.browserPid = readdirSync("/proc").filter((d) => /^\d+$/.test(d)).map(Number).find((p) => {
    try { const c = readFileSync(`/proc/${p}/cmdline`, "utf8"); return c.includes(`--siltwake-soak=${label}`) && !c.includes("--type="); } catch { return false; }
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = g.page = await context.newPage();
  g.cdp = await context.newCDPSession(page);
  await g.cdp.send("Performance.enable");
  page.on("pageerror", (e) => g.errors.push(e.message.slice(0, 300)));
  page.on("crash", () => { g.crash = "the renderer crashed"; });
  page.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) g.errors.push(m.text().slice(0, 300)); });
  page.on("response", (r) => { if (r.status() >= 400) g.errors.push(`HTTP ${r.status()} ${r.url().slice(0, 200)}`); }); // which resource, not just that one failed
  await page.addInitScript(frameRecorderScript);
  for (const script of opts.initScripts ?? []) await page.addInitScript(script);
  await page.goto(`http://127.0.0.1:${bound}/${opts.query ?? ""}`, { waitUntil: "load", timeout: 60000 });
  g.renderer = await page.evaluate(() => { const c = document.createElement("canvas").getContext("webgl2"); const e = c.getExtension("WEBGL_debug_renderer_info"); return c.getParameter(e.UNMASKED_RENDERER_WEBGL); });
  log("renderer", g.renderer);
  if (opts.gpu && !new RegExp(opts.gpu).test(g.renderer)) throw new Error(`renderer ${g.renderer} is not ${opts.gpu}`);
  await page.waitForFunction(() => document.querySelector("#ocean")?.dataset.graphics === "available", null, { timeout: 60000 });
  await page.locator("#new-game").waitFor({ state: "visible", timeout: 30000 });
  await page.locator("#import-file").setInputFiles(save);
  await page.waitForTimeout(500);
  if (await page.locator("#confirmation").isVisible().catch(() => false)) await page.locator("#confirm-accept").click();
  await waitPlayable(page);
  g.close = async () => { await browser.close().catch(() => {}); await new Promise((r) => server.close(r)); };
  return g;
}

async function waitPlayable(page) {
  await page.waitForFunction(() => !document.querySelector("#hud")?.hidden, null, { timeout: 120000 });
  const ready = () => page.waitForFunction(() => document.querySelector("#ocean").dataset.ready === "true", null, { timeout: 5000 }).then(() => true, () => false);
  // A save at the very start plays the pod opening; a player skips it by holding Space (as C4's driver does).
  if (!(await ready())) { await page.keyboard.down("Space"); await page.waitForTimeout(1300); await page.keyboard.up("Space"); }
  await page.waitForFunction(() => document.querySelector("#ocean").dataset.ready === "true", null, { timeout: 120000 });
  await page.waitForTimeout(1000);
  await page.locator("#ocean").click();
}

export async function read(g) {
  return g.page.evaluate(() => {
    const c = document.querySelector("#ocean").dataset, q = (s) => document.querySelector(s);
    const pitch = Number(/(-?\d+)/.exec(q("#pitch-cue")?.getAttribute("aria-label") ?? "Pitch 0")?.[1] ?? 0);
    return { cam: (c.cameraPosition ?? "0,0,0").split(",").map(Number), bearing: parseFloat(q("#bearing")?.textContent ?? "0"), pitch,
      tick: Number(q("#hud")?.dataset.tick ?? NaN), region: q("#region-name")?.innerText ?? "", cave: c.cave ?? "" };
  });
}
const pos = (g, s) => ({ x: s.cam[0], y: s.cam[1] - g.eye, z: s.cam[2] });

async function key(g, k, on) {
  if (on && !g.held.has(k)) { g.held.add(k); await g.page.keyboard.down(k); } else if (!on && g.held.has(k)) { g.held.delete(k); await g.page.keyboard.up(k); }
}
export async function releaseAll(g) { for (const k of [...g.held]) await key(g, k, false); }

/** Closed-loop travel to a point with the ordinary keys. Snagged: back off and
 * lift, as a player would, up to three times; no progress for 20 s: Blocked.
 * `stop()` true ends it early (a broken rule or a yield). */
export async function goto(g, t, { tol = 3, label = "", timeoutS = 300, boost = false, stop = () => false } = {}) {
  const start = performance.now();
  let best = Infinity, bestAt = start, recoveries = 0;
  for (;;) {
    if (stop()) { await releaseAll(g); return false; }
    const s = await read(g), p = pos(g, s), dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z, h = Math.hypot(dx, dz), d3 = Math.hypot(h, dy);
    if (d3 <= tol) break;
    if (d3 < best - 0.3) { best = d3; bestAt = performance.now(); }
    if (performance.now() - bestAt > 6000 && recoveries < 3) {
      recoveries++;
      await releaseAll(g); await key(g, "KeyS", true); await key(g, "Space", true); await g.page.waitForTimeout(1500); await releaseAll(g);
      bestAt = performance.now(); best = Infinity; continue;
    }
    if (performance.now() - bestAt > 20000 || performance.now() - start > timeoutS * 1000) {
      await releaseAll(g);
      throw new Blocked(`stalled ${d3.toFixed(1)} m short of ${label} (${t.x},${t.y},${t.z}) at ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`);
    }
    const yaw = s.bearing * Math.PI / 180, want = h > 1.2 ? Math.atan2(dx, -dz) : yaw, err = wrap(want - yaw);
    await key(g, "ArrowRight", err > 0.035); await key(g, "ArrowLeft", err < -0.035);
    await key(g, "ArrowUp", s.pitch < -2); await key(g, "ArrowDown", s.pitch > 2);
    await key(g, "KeyW", Math.abs(err) < (h > 8 ? 0.45 : 0.25) && h > tol * 0.6);
    await key(g, "ShiftLeft", boost && h > 30 && Math.abs(err) < 0.2);
    await key(g, "Space", dy > 0.7); await key(g, "KeyC", dy < -0.7);
    await g.page.waitForTimeout(40);
  }
  await releaseAll(g);
  return true;
}

/**
 * "Every save reloads", without disturbing the game being measured (R1-F2):
 * a manual save (F5) in the measured page, the committed save exported from
 * its journal to `file`, then loaded in a separate browser (its processes are
 * not the probe's), which must come back where the save was made, no earlier
 * than its tick. The measured page keeps its one lifetime across all laps.
 */
export async function saveAndCheck(g, opts, file, label) {
  const journal = () => g.page.evaluate(() => { try { return JSON.parse(localStorage.getItem("siltwake.save.journal.v1")).current; } catch { return null; } });
  const prior = await journal();
  const at = await read(g);
  await g.page.keyboard.press("F5");
  try {
    await g.page.waitForFunction((p) => { try { return JSON.parse(localStorage.getItem("siltwake.save.journal.v1")).current !== p; } catch { return false; } }, prior, { timeout: 15000 });
  } catch { return { ok: false, label, error: "the manual save never reached the journal" }; }
  const text = await journal();
  writeFileSync(file, text);
  const saved = JSON.parse(text);
  let check;
  try {
    check = await openGame({ ...opts, save: file, port: Number(opts.port) + 1, label: "save-check" });
    const back = await read(check);
    const moved = Math.hypot(back.cam[0] - at.cam[0], back.cam[1] - at.cam[1], back.cam[2] - at.cam[2]);
    if (!(back.tick >= saved.state.tick)) return { ok: false, label, file, error: `loaded at tick ${back.tick}, before the saved ${saved.state.tick}` };
    if (moved > 5) return { ok: false, label, file, error: `loaded ${moved.toFixed(1)} m from where it was saved` };
    return { ok: true, label, file, tick: saved.state.tick, movedM: Math.round(moved * 10) / 10, pageErrors: check.errors.length };
  } catch (e) {
    return { ok: false, label, file, error: `did not load: ${e.message.split("\n")[0]}` };
  } finally {
    await check?.close();
  }
}
