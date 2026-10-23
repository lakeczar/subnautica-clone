#!/usr/bin/env node
// REC-1 fixed-view capture: one game load, then every view in views.json in
// turn: the diver staged at its pose with the simulation clock frozen (no
// animation advances: water, sky, creatures and particles all run on the
// frozen tick), streaming settled (ready, not settling, the cave hold clear,
// nothing pending), then the canvas itself captured twice (no HUD) at the
// fixed size. Minutes, not hours: run it as `--class gpu`.
//
//   node scripts/rec/views/capture.mjs --dist DIST --save SAVE --out DIR
//     [--views FILE] [--only id,id] [--class 3090|4070] [--chrome BIN --pw DIR --gpu REGEX --machine LABEL]
// Then: node scripts/rec/views/compare.mjs DIR
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { hostname } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, openGame, serve } from "../browser.mjs";
import { gpuInfo } from "../record.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const dist = arg("dist"), save = arg("save"), out = arg("out");
if (!dist || !save || !out) { console.error("usage: capture.mjs --dist DIST --save SAVE --out DIR [--views FILE] [--only ids] [--class 3090|4070]"); process.exit(2); }
if (process.env.SILTWAKE_GPU_LEASE === undefined) { const { requireGpuLease } = await import("../../heavy/gpu-lease.mjs"); requireGpuLease("REC-1's fixed-view capture"); }
const set = JSON.parse(readFileSync(arg("views", path.join(here, "views.json")), "utf8"));
const only = arg("only") ? new Set(arg("only").split(",")) : null;
const views = set.views.filter((v) => !only || only.has(v.id));
const [width, height] = (set.defaults?.size ?? "1280x720").split("x").map(Number);
mkdirSync(path.join(out, "views"), { recursive: true });
const started = Date.now(), log = (...a) => console.log(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${a.join(" ")}`);
const SETTLE_MS = set.defaults?.settleMs ?? 1500, TIMEOUT_MS = 25000;

const server = await serve(dist, Number(arg("port", 0)));
const b = await launch({ chrome: arg("chrome"), pw: arg("pw"), label: "rec1-views", width, height });
const result = { format: "siltwake.views-capture", viewsVersion: set.version, commit: (() => { try { return readFileSync(path.join(dist, "COMMIT"), "utf8").trim(); } catch { return null; } })(),
  machine: arg("machine", hostname()), chrome: b.version, views: [], pending: set.pending ?? [], errors: [] };
try {
  b.page.on("pageerror", (e) => result.errors.push(e.message.slice(0, 300)));
  const open = await openGame(b.page, `http://127.0.0.1:${server.port}/?rec=driver`, save, { gpu: arg("gpu") });
  result.renderer = open.renderer;
  result.class = arg("class", /3090/.test(open.renderer) ? "3090" : /4070/.test(open.renderer) ? "4070" : "other");
  const g = gpuInfo(); result.gpu = g ? `${g.name} ${g.driver}` : open.renderer;
  result.build = await b.page.evaluate(() => window.__siltwake.recorder?.header().build ?? null);
  await b.page.evaluate(() => window.__siltwake.freeze(true));
  for (const v of views) {
    const t0 = Date.now();
    const ok = await b.page.evaluate((x) => window.__siltwake.stage({ position: x.pos, yaw: x.yaw, pitch: x.pitch, lamp: x.lamp, ...(x.tick != null ? { tick: x.tick } : {}) }), v);
    if (!ok) { result.views.push({ id: v.id, error: "stage refused (is the recorder in driver mode?)" }); continue; }
    // Settled: drawn, not settling, the hold clear, nothing pending, for SETTLE_MS on end.
    let since = null, last = null;
    for (;;) {
      const s = await b.page.evaluate(() => { const r = window.__siltwake.read(), sc = window.__siltwake.scene(); return { ready: r?.ready, settling: r?.settling, hold: r?.hold, pending: sc?.caveStream.pending, missing: sc?.caveStream.missing }; });
      last = s;
      const calm = s.ready && !s.settling && (s.hold == null || ["clear", "admitted", "away"].includes(s.hold)) && (s.pending ?? 0) <= 0 && (s.missing ?? 0) === 0;
      since = calm ? since ?? Date.now() : null;
      if (since && Date.now() - since >= SETTLE_MS) break;
      if (Date.now() - t0 > TIMEOUT_MS) break;
      await b.page.waitForTimeout(100);
    }
    const settled = since !== null && Date.now() - since >= SETTLE_MS;
    const a = await b.page.evaluate(() => window.__siltwake.capture());
    await b.page.waitForTimeout(400);
    const c = await b.page.evaluate(() => window.__siltwake.capture());
    const file = `views/${v.id}.png`, png = Buffer.from(a, "base64");
    writeFileSync(path.join(out, file), png);
    const sha = createHash("sha256").update(png).digest("hex");
    result.views.push({ id: v.id, group: v.group, label: v.label, file, sha256: sha, settled, settleMs: Date.now() - t0, hold: last?.hold ?? null,
      // A frozen view draws the same pixels twice; anything else animates outside the sim clock.
      stable: a === c, ...(settled ? {} : { unsettled: last }) });
    log(v.id, settled ? "settled" : "UNSETTLED", `${Date.now() - t0} ms`, a === c ? "stable" : "ANIMATES");
  }
} catch (e) {
  result.errors.push(String(e?.stack ?? e).slice(0, 1000));
  log("error", String(e));
} finally {
  await b.close();
  await server.close();
}
result.seconds = Math.round((Date.now() - started) / 1000);
writeFileSync(path.join(out, "capture.json"), JSON.stringify(result, null, 1));
log(`${result.views.length} views captured (${result.views.filter((v) => !v.settled).length} unsettled, ${result.views.filter((v) => v.stable === false).length} animating), ${result.pending.length} pending`);
process.exit(result.errors.length && !result.views.length ? 1 : 0);
