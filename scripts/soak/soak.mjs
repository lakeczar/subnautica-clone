// The soak loop (goals.mjs decides; this measures and drives). The browser and
// the probe providers are injected, so the same loop runs against the real
// game (run.mjs) and against a fake one in tests/soak-runner.test.ts.
//
// - Tour: every lap in ONE game lifetime (R1-F2): the lap sample is taken at
//   the lap's start point after a GC, then the lap's save is exported and
//   loaded in a separate browser; the measured page is never reloaded.
// - Dwell: holds station until the evaluator says the goal is met (autosaves
//   and the leak window, R1-F7), or a rule breaks.
// - Every second a cheap tick reads frames, holds and saves; every sampleS a
//   full sample. Availability starts unknown: only an observation makes a rule
//   measurable, and provider errors are carried into the report (R1-F3).
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateDwell, evaluateTour, reportMarkdown } from "./goals.mjs";

/** The heaviest places (DIRECTION: dwell soaks). null: not in the game yet. */
export const PLACES = Object.freeze({
  "crown-station": [319, -56.4, -542.4], // CROWN_STATION work pose (src/content/hub/crownStation.ts)
  "dish-field": [508, -40, -572], // above basin.dish_centre (src/content/regions/structures.ts)
  "large-cave": null, // canopy_roots (LC) is not placed in the world yet
});

/**
 * opts: { kind, out, thresholds: { tour, dwell }, plan (tour), at (dwell),
 *   sampleS, tickMs, judged, browser (openGame options), meta }
 * deps: { openGame, goto, read, releaseAll, saveAndCheck, Blocked,
 *   providers(g) → { full: [provider], tick: [provider] }, createProbe, env, log }
 * Returns { verdict, run, meta }.
 */
export async function runSoak(opts, deps) {
  const { kind, out, thresholds: t } = opts, env = deps.env ?? process.env, log = deps.log ?? (() => {});
  mkdirSync(join(out, "saves"), { recursive: true });
  const started = Date.now(), now = () => (Date.now() - started) / 1000;
  const run = {
    startedAt: 0, laps: [], samples: [], autosaves: [], saves: [], crash: null, travel: {}, yielded: false, providerErrors: {},
    frames: { judged: Boolean(opts.judged), machine: opts.machine ?? null, attributed: null, observed: 0, streamingOver: [], longOver: [] },
    holds: { available: null, covered: null, list: [] },
  };
  let verdict = null, stopping = false, checking = false, where = "start", lastSave = null;
  const evaluate = () => (verdict = kind === "tour" ? evaluateTour(run, t.tour) : evaluateDwell({ ...run, now: now() }, t.dwell));
  const shouldStop = () => stopping;
  const noteErrors = (s) => {
    for (const u of s.unavailable ?? []) {
      const name = u.split(":")[0], e = (run.providerErrors[name] ??= { count: 0, last: "" });
      e.count++; e.last = u.slice(name.length + 2, name.length + 122);
    }
  };

  const g = await deps.openGame({ ...opts.browser, label: `soak-${kind}` });
  const ps = deps.providers(g);
  const probe = deps.createProbe(ps.full), tick = deps.createProbe(ps.tick);

  async function heartbeatTick() {
    const s = await tick.sample({ at: now() });
    noteErrors(s);
    if (checking) return; // frames while a save is being checked are not travel frames
    where = s.where?.cave || s.where?.region || where;
    const f = s.frames ?? {};
    if (f.count != null) {
      run.frames.observed += f.count;
      if (f.attributed === false) run.frames.attributed = false;
      else if (f.attributed === true && f.count > 0 && run.frames.attributed !== false) run.frames.attributed = true;
      for (const ms of f.streaming ?? []) run.frames.streamingOver.push({ ms, where });
      if (!f.attributed) for (const ms of f.over ?? []) run.frames.longOver.push({ ms, where });
      // Holds the per-frame record saw since the last tick, however short (R2-F2);
      // coverage holds only while every tick with frames had the record.
      if (f.count > 0) {
        if (Number.isFinite(f.holdFrames)) { if (run.holds.covered !== false) run.holds.covered = true; } else run.holds.covered = false;
      }
      if (f.holdFrames > 0) run.holds.list.push({ where, state: "recorded", frames: f.holdFrames, at: now() });
    }
    if (s.holds?.available === false) run.holds.available = false;
    else if (s.holds?.available === true) {
      if (run.holds.available === null) run.holds.available = true;
      if (s.holds.held) run.holds.list.push({ where, state: s.holds.state, at: now() });
    }
    if (s.lastSave?.savedAt && s.lastSave.savedAt !== lastSave?.savedAt) {
      if (lastSave) run.autosaves.push({ at: now(), tick: s.lastSave.tick, frameMs: f.count > 0 ? f.worstMs : null }); // the frame around the save
      lastSave = s.lastSave;
    }
    if (g.crash) run.crash = g.crash;
    if (env.SILTWAKE_JOB_YIELD && existsSync(env.SILTWAKE_JOB_YIELD)) run.yielded = true;
  }
  /** Memory compared over time must be read the same way each time: a forced
   * full GC, a settle (a GC transiently grows RSS, then returns pages), then
   * the sample, so RSS and heap are the post-GC floor. Frames meanwhile are
   * the GC's, not the game's, and are left out. */
  async function gcSample(mark) {
    checking = true;
    try {
      await deps.collectGarbage(g);
      await new Promise((r) => setTimeout(r, opts.gcSettleMs ?? 2000));
      return await fullSample({ afterGc: true, ...(mark ? { mark: { mark } } : {}) });
    } finally { checking = false; }
  }
  async function fullSample(extra = {}) {
    const s = await probe.sample({ at: now(), ...extra });
    noteErrors(s);
    run.samples.push({ at: s.at, memory: s.memory, graphics: s.graphics, afterGc: Boolean(extra.afterGc) });
    appendFileSync(join(out, "samples.jsonl"), `${JSON.stringify({ ...s, afterGc: Boolean(extra.afterGc), ...extra.mark })}\n`);
    if (env.SILTWAKE_JOB_HEARTBEAT) { try { writeFileSync(env.SILTWAKE_JOB_HEARTBEAT, ""); } catch { /* best effort */ } }
    return s;
  }
  let ticking = Promise.resolve(), sinceFull = 0, lastGc = -Infinity;
  const ticksPerSample = Math.max(1, Math.round((opts.sampleS ?? 10) * 1000 / (opts.tickMs ?? 1000)));
  const timer = setInterval(() => {
    ticking = ticking.then(async () => {
      if (stopping) return;
      await heartbeatTick();
      // Dwell: a GC'd heap sample on a fixed cadence, so the heap rules have a
      // series of like-for-like values (a heap without GC is a sawtooth).
      if (++sinceFull >= ticksPerSample) {
        sinceFull = 0;
        const gc = kind === "dwell" && now() - lastGc >= (opts.gcEveryS ?? 60);
        if (gc) { lastGc = now(); await gcSample(); } else await fullSample();
      }
      evaluate();
      if (verdict.status === "fail" || run.yielded) { stopping = true; log(verdict.status === "fail" ? `rule broken: ${verdict.reason}` : "yield notice: stopping"); }
    }).catch((e) => { run.crash ??= `measurement loop failed: ${e.message.split("\n")[0]}`; stopping = true; });
  }, opts.tickMs ?? 1000);

  try {
    await fullSample({ mark: { mark: "start" } });
    if (kind === "tour") await tour();
    else await dwell();
  } catch (e) {
    if (e instanceof deps.Blocked) run.travel.blocked = e.message;
    else run.crash ??= e.message.split("\n")[0];
  } finally {
    clearInterval(timer);
    await ticking.catch(() => {});
    await deps.releaseAll(g).catch(() => {});
  }
  evaluate();
  const meta = { ...opts.meta, renderer: g.renderer, frames: opts.judged ? "judged (isolated run)" : opts.machine ? `recorded only (${opts.machine}: possibly disturbed, not frame-time evidence)` : "recorded only (shared run: not frame-time evidence)",
    ranS: Math.round(now()), providers: [...new Set([...ps.full, ...ps.tick].map((p) => p.name))].join(", "), pageErrors: g.errors.length };
  writeFileSync(join(out, "report.json"), JSON.stringify({ kind, meta, thresholds: t[kind], verdict, laps: run.laps, autosaves: run.autosaves, saves: run.saves,
    providerErrors: run.providerErrors, longFrames: run.frames.longOver.slice(0, 200), streamingFrames: run.frames.streamingOver.slice(0, 200),
    framesObserved: run.frames.observed, holds: run.holds, errors: g.errors.slice(0, 50) }, null, 1));
  writeFileSync(join(out, "report.md"), reportMarkdown(kind, verdict, meta));
  await g.close();
  return { verdict, run, meta };

  /** A save made now, exported and loaded in a separate browser. */
  async function checkSave(label) {
    checking = true;
    try { run.saves.push(await deps.saveAndCheck(g, { ...opts.browser }, join(out, "saves", `${label.replace(/\W+/g, "-")}.json`), label)); }
    finally { checking = false; }
  }

  async function tour() {
    const points = opts.plan.points ?? opts.plan.segments.flat();
    for (let lap = 1; lap <= t.tour.laps && !stopping; lap++) {
      log(`lap ${lap} of ${t.tour.laps}: ${points.length} points`);
      for (const [i, p] of points.entries()) {
        if (!(await deps.goto(g, p, { tol: p.cave ? 4 : 3, label: p.cave ?? p.region ?? `point ${i}`, boost: true, stop: shouldStop }))) return;
      }
      if (!(await deps.goto(g, points[0], { label: "lap start", stop: shouldStop }))) return;
      await new Promise((r) => setTimeout(r, opts.settleMs ?? 3000)); // the same place every lap, settled, before measuring
      const s = await gcSample(`lap ${lap}`);
      run.laps.push({ lap, at: s.at, memory: s.memory, graphics: s.graphics });
      await checkSave(`lap ${lap}`);
      const sv = run.saves.at(-1);
      log(`lap ${lap}: renderer ${s.memory.rendererRssMiB?.toFixed?.(0)} MiB, heap ${s.memory.jsHeapAfterGcMiB?.toFixed?.(0)} MiB after GC, ${s.graphics.meshes} meshes; save ${sv.ok ? "loads" : `FAILED: ${sv.error}`}`);
      evaluate();
      if (verdict.status === "fail") { stopping = true; log(`rule broken: ${verdict.reason}`); }
    }
  }

  async function dwell() {
    const name = opts.at;
    if (name && PLACES[name] === null) { run.travel.blocked = `${name} is not placed in the game yet`; return; }
    const at = name ? (PLACES[name] ?? name.split(",").map(Number)) : null;
    if (at && (at.length !== 3 || at.some((v) => !Number.isFinite(v)))) { run.travel.blocked = `--at ${name}: a place (${Object.keys(PLACES).join(", ")}) or X,Y,Z`; return; }
    const anchor = at ? { x: at[0], y: at[1], z: at[2] } : null;
    if (anchor && !(await deps.goto(g, anchor, { label: `dwell place ${name}`, stop: shouldStop }))) return;
    const s0 = await deps.read(g), home = anchor ?? { x: s0.cam[0], y: s0.cam[1], z: s0.cam[2] };
    run.startedAt = now(); // "autosaves keep happening" counts from arrival, not from the trip there
    lastGc = -Infinity; // the first settled sample comes right after warm-up
    log(`dwelling at ${home.x.toFixed(0)},${home.y.toFixed(0)},${home.z.toFixed(0)} until the goal: ${t.dwell.autosaves} autosaves and ${Math.round(t.dwell.leakMinWindowS / 60)} min after warm-up`);
    for (;;) {
      if (stopping || ["pass", "partial", "fail"].includes(evaluate().status)) break;
      const s = await deps.read(g), off = Math.hypot(s.cam[0] - home.x, s.cam[1] - home.y, s.cam[2] - home.z);
      if (off > 6) await deps.goto(g, home, { label: "dwell place", stop: shouldStop }); // drifted in a current: hold station
      await new Promise((r) => setTimeout(r, opts.tickMs ?? 1000));
    }
    if (!stopping) { await gcSample("dwell end"); await checkSave("dwell end"); }
  }
}

/** Exit codes for a verdict. */
export const EXIT = Object.freeze({ pass: 0, fail: 1, incomplete: 4, partial: 5, yielded: 75, running: 4 });

/** Reads a JSON file or returns null (for plans). */
export const readJsonFile = (p) => (p ? JSON.parse(readFileSync(p, "utf8")) : null);
