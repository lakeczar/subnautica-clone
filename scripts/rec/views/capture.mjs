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
import { loadViewSet } from "./stable.mjs";
import { fileURLToPath } from "node:url";
import { openGame } from "../../soak/browser.mjs";
import { gpuInfo } from "../record.mjs";
import { untilStable } from "./stable.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const dist = arg("dist"), save = arg("save"), out = arg("out");
if (!dist || !save || !out) { console.error("usage: capture.mjs --dist DIST --save SAVE --out DIR [--views FILE] [--only ids] [--class 3090|4070]"); process.exit(2); }
const set = loadViewSet(arg("views", path.join(here, "views.json")));
const only = arg("only") ? new Set(arg("only").split(",")) : null;
const views = set.views.filter((v) => !only || only.has(v.id));
// Every view at a fixed sim tick (its own, else the save's): water, sky, creatures and
// particles all run on it, so the clock reached after loading never shows in a view.
const saveTick = (() => { try { return JSON.parse(readFileSync(save, "utf8")).state.tick; } catch { return null; } })();
mkdirSync(path.join(out, "views"), { recursive: true });
const started = Date.now(), log = (...a) => console.log(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${a.join(" ")}`);
const SETTLE_MS = set.defaults?.settleMs ?? 1500, TIMEOUT_MS = 25000, STABLE_MS = 500, STABLE_TRIES = 12;

const result = { format: "siltwake.views-capture", viewsVersion: set.version, commit: (() => { try { return readFileSync(path.join(dist, "COMMIT"), "utf8").trim(); } catch { return null; } })(),
  machine: arg("machine", hostname()), views: [], pending: set.pending ?? [], errors: [] };
let b = null;
try {
  // The soak's own browser session (scripts/soak/browser.mjs), the recorder in driver mode (stage and capture need it).
  b = await openGame({ dist, save, port: Number(arg("port", 0)), gpu: arg("gpu"), chrome: arg("chrome"), pw: arg("pw"), label: "rec1-views", query: "?rec=driver", isolate: true, log });
  result.chrome = b.chrome;
  result.renderer = b.renderer;
  result.class = arg("class", /3090/.test(b.renderer) ? "3090" : /4070/.test(b.renderer) ? "4070" : "other");
  const g = gpuInfo(); result.gpu = g ? `${g.name} ${g.driver}` : b.renderer;
  result.build = await b.page.evaluate(() => window.__siltwake.recorder?.header().build ?? null);
  await b.page.evaluate(() => window.__siltwake.freeze(true));
  for (const v of views) {
    const t0 = Date.now();
    const tick = v.tick ?? saveTick;
    const ok = await b.page.evaluate((x) => window.__siltwake.stage({ position: x.pos, yaw: x.yaw, pitch: x.pitch, lamp: x.lamp, ...(x.tick != null ? { tick: x.tick } : {}) }), { ...v, tick });
    if (!ok) { result.views.push({ id: v.id, error: "stage refused (is the recorder in driver mode?)" }); continue; }
    // Settled: drawn, not settling, the hold clear, nothing pending, for SETTLE_MS on end.
    let since = null, last = null;
    for (;;) {
      const s = await b.page.evaluate(() => {
        const r = window.__siltwake.read(), sc = window.__siltwake.scene();
        return { ready: r?.ready, settling: r?.settling, hold: r?.hold, feet: r?.feet, pending: sc?.caveStream.pending, lightsPending: sc?.lights?.pending,
          // Everything streaming or time-sliced work changes; settled when none of it moves.
          scene: sc && JSON.stringify([sc.meshes, sc.active, sc.triangles, sc.geometries, sc.textures, sc.regions, sc.cave, sc.caveStream, sc.lights, sc.residentGpu]) };
      });
      const calm = s.ready && !s.settling && (s.hold == null || ["clear", "admitted", "away"].includes(s.hold)) && (s.pending ?? 0) <= 0 && (s.lightsPending ?? 0) === 0
        && s.scene === last?.scene;
      last = s;
      since = calm ? since ?? Date.now() : null;
      if (since && Date.now() - since >= SETTLE_MS) break;
      if (Date.now() - t0 > TIMEOUT_MS) break;
      await b.page.waitForTimeout(100);
    }
    // A hold that outlasted LC-07's 12 s moves the diver to safety: then this is not the view.
    const moved = last?.feet ? Math.hypot(last.feet[0] - v.pos.x, last.feet[1] - v.pos.y, last.feet[2] - v.pos.z) : 0;
    const settled = since !== null && Date.now() - since >= SETTLE_MS && moved < 1;
    // Settled for the picture itself: two captures STABLE_MS apart are the same pixels
    // (content still activating or fading in shows here even when no counter moves).
    const shot = await untilStable(() => b.page.evaluate(() => window.__siltwake.capture()), () => b.page.waitForTimeout(STABLE_MS), STABLE_TRIES);
    const file = `views/${v.id}.png`, png = Buffer.from(shot.image, "base64");
    writeFileSync(path.join(out, file), png);
    // An unstable view keeps its last two different pictures (R1-F2).
    if (!shot.stable && shot.previous) writeFileSync(path.join(out, `views/${v.id}.previous.png`), Buffer.from(shot.previous, "base64"));
    const sha = createHash("sha256").update(png).digest("hex");
    result.views.push({ id: v.id, group: v.group, label: v.label, file, sha256: sha, tick, settled, settleMs: Date.now() - t0, hold: last?.hold ?? null,
      // A frozen view draws the same pixels twice; anything else animates outside the sim clock.
      stable: shot.stable, stableAfterMs: shot.tries * STABLE_MS, ...(shot.stable ? {} : { previous: `views/${v.id}.previous.png` }),
      ...(v.quarantine ? { quarantine: v.quarantine } : {}),
      ...(moved >= 1 ? { relocatedM: Math.round(moved * 10) / 10 } : {}), ...(settled ? {} : { unsettled: last }) });
    log(v.id, settled ? "settled" : `UNSETTLED ${JSON.stringify({ ...last, scene: undefined })}${moved >= 1 ? ` moved ${moved.toFixed(1)} m` : ""}`, `${Date.now() - t0} ms`,
      shot.stable ? `stable after ${shot.tries * STABLE_MS} ms` : "UNSTABLE (never the same picture twice)", v.quarantine ? "(quarantined)" : "");
  }
} catch (e) {
  result.errors.push(String(e?.stack ?? e).slice(0, 1000));
  log("error", String(e));
} finally {
  if (b) { result.errors.push(...b.errors); await b.close(); }
}
result.seconds = Math.round((Date.now() - started) / 1000);
writeFileSync(path.join(out, "capture.json"), JSON.stringify(result, null, 1));
log(`${result.views.length} views captured (${result.views.filter((v) => !v.settled).length} unsettled, ${result.views.filter((v) => v.stable === false).length} animating), ${result.pending.length} pending`);
process.exit(result.errors.length && !result.views.length ? 1 : 0);
