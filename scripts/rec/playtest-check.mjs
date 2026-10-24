#!/usr/bin/env node
// REC-1: the owner's playtest path, end to end, as a player would use it,
// and the R1 checks of it:
// - the recorder in playtest mode (spooled to the browser's private storage,
//   with the in-game 12 fps video), a stretch of play;
// - F7: a feedback note (N) and an export straight away, then more play and a
//   second export: each archive reconciled against its own index (every
//   picture named is in it; the note's picture is in it) and its video's
//   coverage up to the note;
// - F8: Settings → Flight recorder off mid-play: the next export holds
//   nothing after the moment it was turned off;
// - S2 (with --budget-mib / --segment-ms): video in independent segments,
//   the oldest removed to stay within the budget, each removal recorded.
// The first archive is built into a pack like any other recording.
//
//   node scripts/rec/playtest-check.mjs --dist DIST --save SAVE --plan PLAN --segment N --seconds S --out DIR
//     [--budget-mib M --segment-ms MS] [--gpu REGEX]
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { Blocked, goto, openGame, releaseAll } from "../soak/browser.mjs";
import { unzip } from "./unzip.mjs";
import { buildPack } from "./pack.mjs";
import { remux, videoSeconds } from "./imaging.mjs";
import { latestPictures, videoSegments } from "./analyse.mjs";

const args = process.argv.slice(2), arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const out = arg("out"), seconds = Number(arg("seconds", 60));
if (!out || !arg("dist") || !arg("save")) { console.error("usage: playtest-check.mjs --dist DIST --save SAVE --out DIR [--plan PLAN --segment N --seconds S --budget-mib M --segment-ms MS]"); process.exit(2); }
mkdirSync(out, { recursive: true });
const plan = arg("plan") ? JSON.parse(readFileSync(arg("plan"), "utf8")) : null, points = plan ? plan.segments[Number(arg("segment", 0))] : [];
// A person's browser is not automated, so this one names the player's default; as a static host serves it (no isolation).
const query = `?rec=playtest${arg("budget-mib") ? `&recbudget=${arg("budget-mib")}` : ""}${arg("segment-ms") ? `&recsegment=${arg("segment-ms")}` : ""}`;
const result = { query, errors: [], exports: [] };
const pageNow = (g) => g.page.evaluate(() => performance.now());
let exit = 0, g = null;

async function play(sec) {
  const end = Date.now() + sec * 1000;
  for (const pt of points.slice(1)) {
    if (Date.now() > end) break;
    try { await goto(g, pt, { tol: pt.cave ? 4 : 7, timeoutS: 60, stop: () => Date.now() > end }); } catch (e) { if (!(e instanceof Blocked)) throw e; }
  }
  while (Date.now() < end) await g.page.waitForTimeout(500);
  await releaseAll(g);
}
async function settings() {
  await g.page.keyboard.press("Escape");
  await g.page.locator("#open-settings").click();
}
async function resume() {
  await g.page.keyboard.press("Escape"); // settings → menu
  await g.page.locator('[data-action="resume"]').first().click().catch(() => {});
  await g.page.locator("#ocean").click().catch(() => {});
}
async function exportNow(label) {
  const [download] = await Promise.all([g.page.waitForEvent("download", { timeout: 180000 }), g.page.locator('[data-action="flight"]').click()]);
  const zip = path.join(out, `${label}.zip`);
  await download.saveAs(zip);
  return zip;
}
/** An archive against its own index: every picture named is present, the note's picture too, and the video covers up to `until`. */
function reconcile(zip, label, { noteText, until, after } = {}) {
  const dir = path.join(out, label);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const entries = unzip(zip, dir);
  const read = (f) => (existsSync(path.join(dir, f)) ? readFileSync(path.join(dir, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
  const header = JSON.parse(readFileSync(path.join(dir, "header.json"), "utf8"));
  const snaps = latestPictures(read("snapshots.ndjson")), events = read("events.ndjson"), frames = read("frames.ndjson");
  const absent = snaps.filter((s) => !s.missing && !existsSync(path.join(dir, s.file))).map((s) => s.file);
  const declaredMissing = snaps.filter((s) => s.missing).map((s) => `${s.file}: ${s.missing}`);
  const note = noteText ? events.find((e) => e.kind === "note" && e.text.includes(noteText)) : null;
  const noteSnap = note?.snap ? snaps.find((s) => s.seq === note.snap) : null;
  // A live WebM (the in-game writer's) has no duration until it is remuxed (as the pack does).
  const duration = (file) => { if (!existsSync(file)) return null; if (remux(file, `${file}.tmp.webm`)) renameSync(`${file}.tmp.webm`, file); return videoSeconds(file); };
  const segs = videoSegments(header).map((s) => ({ ...s, seconds: duration(path.join(dir, s.file)) }));
  const videoEnd = segs.reduce((m, s) => (s.seconds != null ? Math.max(m, s.start + s.seconds * 1000) : m), -Infinity);
  const lastFrameT = frames.length ? frames.at(-1)[0] : null;
  const facts = {
    label, bytes: statSync(zip).size, entries, pictures: snaps.length, absent, declaredMissing,
    note: noteText ? { found: !!note, t: note?.t ?? null, picture: noteSnap ? { file: noteSnap.file, present: existsSync(path.join(dir, noteSnap.file)) } : null } : undefined,
    video: { segments: segs.map((s) => ({ file: s.file, start: s.start, seconds: s.seconds })), endsAt: Number.isFinite(videoEnd) ? Math.round(videoEnd) : null, coversUntil: until ?? null },
    retention: header.retention ?? null, lastFrameT, offAfter: after ?? null,
  };
  facts.ok = absent.length === 0 && (!noteText || (facts.note.found && facts.note.picture?.present === true))
    && (until == null || (facts.video.endsAt ?? -Infinity) >= until - 1000) && (after == null || (lastFrameT ?? 0) <= after + 1000);
  return facts;
}

try {
  g = await openGame({ dist: arg("dist"), save: arg("save"), port: 0, gpu: arg("gpu"), chrome: arg("chrome"), pw: arg("pw"), label: "rec1-playtest", query, isolate: false });
  g.page.on("pageerror", (e) => result.errors.push(e.message.slice(0, 300)));
  result.renderer = g.renderer;
  result.mode = await g.page.evaluate(() => window.__siltwake.recorder?.mode ?? "off");
  if (result.mode !== "playtest") throw new Error(`the recorder is ${result.mode}, not playtest`);
  await play(seconds);
  // F7: a note, then an export straight away.
  const noteText = `REC-1 check note ${Date.now()}`;
  await g.page.keyboard.press("KeyN");
  await g.page.locator("#note-text").fill(noteText);
  await g.page.keyboard.press("Enter");
  const noteAt = await pageNow(g);
  await settings();
  const first = await exportNow("export-1");
  result.exports.push(reconcile(first, "export-1", { noteText, until: noteAt }));
  // More play, a second export: recording carried on across the first.
  await resume();
  await play(20);
  await settings();
  const secondAt = await pageNow(g);
  const second = await exportNow("export-2");
  result.exports.push(reconcile(second, "export-2", { noteText, until: secondAt - 1500 }));
  // F8: off, more play, an export: nothing recorded after the switch.
  await g.page.locator("#flight-enabled").uncheck();
  const offAt = await pageNow(g);
  result.offMode = await g.page.evaluate(() => window.__siltwake.recorder?.mode ?? "off");
  await resume();
  await play(10);
  await settings();
  const third = await exportNow("export-3");
  result.exports.push(reconcile(third, "export-3", { after: offAt }));
} catch (e) {
  result.errors.push(String(e?.stack ?? e).slice(0, 1000));
  exit = 1;
} finally {
  await g?.close();
}
if (result.exports[0]) {
  const packDir = path.join(out, "export-1-pack");
  rmSync(packDir, { recursive: true, force: true });
  mkdirSync(path.join(packDir, "recording"), { recursive: true });
  unzip(path.join(out, "export-1.zip"), path.join(packDir, "recording"));
  const s = await buildPack(packDir, { chrome: arg("chrome"), pw: arg("pw") });
  result.pack = s.summary;
}
result.ok = !exit && result.exports.length === 3 && result.exports.every((x) => x.ok) && result.offMode === "off";
writeFileSync(path.join(out, "playtest-check.json"), JSON.stringify(result, null, 1));
console.log(JSON.stringify({ ok: result.ok, mode: result.mode, offMode: result.offMode, exports: result.exports.map((x) => ({ label: x.label, ok: x.ok, bytes: x.bytes, absent: x.absent.length, note: x.note, videoEndsAt: x.video.endsAt, coversUntil: x.video.coversUntil, segments: x.video.segments.length, lost: x.retention?.lost?.length ?? 0 })), verdict: result.pack?.verdict, errors: result.errors.length }));
process.exit(result.ok ? 0 : 1);
