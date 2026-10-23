// The soak loop: it measures and drives, and records what it sees as facts
// (facts.mjs). The verdict is facts.mjs's pure reducer over that log, called
// at every early-stop check and once at the end; nothing here decides or
// rewrites one, so no later step can mask an earlier measured failure.
// The browser and the probe providers are injected, so the same loop runs
// against the real game (run.mjs) and a fake one (tests/soak-runner.test.ts).
//
// - Tour: every lap in ONE game lifetime (R1-F2): the lap sample is taken at
//   the lap's start point after a GC, then the lap's save is exported and
//   loaded in a separate browser; the measured page is never reloaded.
// - Dwell: holds station until the reducer says the goal is met (autosaves
//   and the leak window), or a rule breaks.
// - Every tick a cheap sample reads frames, holds and saves; every sampleS a
//   full one. Every probe result goes through one observation path (observe).
// - All sampling, the terminal one and the closing drain included, runs on one
//   serialized chain, so no two samples interleave (R6-F1).
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { factLog, verdict as reduce } from "./facts.mjs";
import { reportMarkdown } from "./goals.mjs";

/** The heaviest places (DIRECTION: dwell soaks). null: not in the game yet. */
export const PLACES = Object.freeze({
  "crown-station": [319, -56.4, -542.4], // CROWN_STATION work pose (src/content/hub/crownStation.ts)
  "dish-field": [508, -40, -572], // above basin.dish_centre (src/content/regions/structures.ts)
  "large-cave": null, // canopy_roots (LC) is not placed in the world yet
});

/**
 * opts: { kind, out, thresholds: { tour, dwell }, plan (tour), at (dwell),
 *   sampleS, tickMs, judged, machine, browser (openGame options), meta }
 * deps: { openGame, goto, read, releaseAll, saveAndCheck, Blocked, collectGarbage, exclude?,
 *   providers(g) → { full: [provider], tick: [provider] }, createProbe, env, log, clock? }
 * Returns { verdict, run, facts, meta }; `run` is a report view, `facts` the log.
 */
export async function runSoak(opts, deps) {
  const { kind, out, thresholds } = opts, t = thresholds[kind], env = deps.env ?? process.env, log = deps.log ?? (() => {});
  mkdirSync(join(out, "saves"), { recursive: true });
  // Elapsed time is monotonic (R3-F3): a wall-clock step never lengthens a
  // leak window or a warm-up. deps.clock (seconds) is injectable for tests.
  const clock = deps.clock ?? (() => performance.now() / 1000), t0 = clock(), now = () => clock() - t0;
  const judged = Boolean(opts.judged), machine = opts.machine ?? null;
  const facts = factLog(), add = (f) => facts.add({ at: now(), ...f });
  const verdictNow = () => reduce(facts.list, kind, t, { judged, machine });
  // A report view of what was seen (laps, saves, autosaves …); never consulted for the verdict.
  const run = { laps: [], samples: [], autosaves: [], saves: [], providerErrors: {}, frames: { observed: 0, invalid: 0, streamingOver: [], longOver: [] }, holds: { list: [] } };
  let stopping = false, where = "start", lastSave = null, lastSaveAt = null, silenceFailed = false;
  const shouldStop = () => stopping;
  const check = () => {
    const v = verdictNow();
    if (!stopping && v.status === "fail") { stopping = true; log(`rule broken: ${v.reason}`); }
    return v;
  };

  const g = await deps.openGame({ ...opts.browser, label: `soak-${kind}` });
  const ps = deps.providers(g);
  const probe = deps.createProbe(ps.full), tick = deps.createProbe(ps.tick);

  /**
   * The one observation path every probe result goes through (R5-F2): tick,
   * full and GC samples alike. Holds and attributed streaming frames are the
   * game's whenever they happened, inside a GC or save-check window too: never
   * dropped, and hold coverage is kept apart from timing (R4-F2). A polled hold
   * proves a violation; polls never prove a hold-free run (only the per-frame
   * record's coverage does).
   */
  function observe(s) {
    for (const u of s.unavailable ?? []) {
      const name = u.split(":")[0], e = (run.providerErrors[name] ??= { count: 0, last: "" });
      e.count++; e.last = u.slice(name.length + 2, name.length + 122);
      add({ t: "unavailable", rule: "providers", reason: u.slice(0, 160) });
    }
    where = s.where?.cave || s.where?.region || where;
    const f = s.frames;
    if (f) {
      for (const ms of f.streaming) {
        run.frames.streamingOver.push({ ms, where });
        add(judged ? { t: "violation", rule: "streaming-frame", ms, value: ms, limit: t.streamingFrameMs, where, detail: `${ms} ms at ${where}` }
          : { t: "recorded", rule: "streaming-frame", ms, limit: t.streamingFrameMs, where });
      }
      if (f.holdFrames > 0) { run.holds.list.push({ where, state: "recorded", frames: f.holdFrames, at: now() }); add({ t: "violation", rule: "loading-hold", detail: `hold at ${where} (${f.holdFrames} frames recorded)` }); }
      if (f.count + f.excluded + f.invalidGaps > 0) {
        add(f.holdsCovered ? { t: "covered", rule: "loading-hold" } : { t: "unavailable", rule: "loading-hold", reason: f.holdIssue ?? f.attributionIssue ?? "no per-frame hold record" });
      }
    }
    if (s.holds?.available === true && s.holds.held) {
      run.holds.list.push({ where, state: s.holds.state, at: now() });
      add({ t: "violation", rule: "loading-hold", detail: `hold at ${where} (${s.holds.state}, polled)` });
    }
    if (g.crash) add({ t: "violation", rule: "renderer", detail: g.crash });
    check();
  }

  /** One tick: a cheap sample, then frame timing and autosaves. */
  async function heartbeatTick({ closing = false } = {}) {
    let s;
    try { s = await tick.sample({ at: now() }); } catch (e) { s = { unavailable: [`tick: ${e.message.split("\n")[0]}`] }; }
    // The run's last interval (R5-F1): unobservable means hold coverage has a gap.
    if (closing && !s.frames) add({ t: "unavailable", rule: "loading-hold", reason: "the closing interval could not be observed" });
    observe(s);
    const f = s.frames;
    // Timing: gaps that overlapped an excluded window were tagged in the page
    // and are already out of f.count (measure.mjs). Without page tagging, the
    // whole interval since the last tick is excluded when a window touched it.
    const untagged = taintedTick();
    if (f && !untagged && (f.count > 0 || f.invalidGaps > 0)) {
      run.frames.observed += f.count; run.frames.invalid += f.invalidGaps;
      if (judged) add(f.attributed === true && f.invalidGaps === 0 ? { t: "covered", rule: "streaming-frame" }
        : { t: "unavailable", rule: "streaming-frame", reason: f.attributed === false ? `no streaming attribution (${f.attributionIssue})` : f.invalidGaps ? `${f.invalidGaps} frame gaps were invalid` : "no frames were attributed" });
      if (f.attributed !== true) for (const ms of f.over) run.frames.longOver.push({ ms, where });
    }
    if (s.lastSave?.savedAt && s.lastSave.savedAt !== lastSave?.savedAt) {
      if (lastSave) {
        // The worst valid gap around the save; an invalid one in the same
        // interval leaves the save incomplete, but never hides a known hitch.
        const frameMs = untagged ? null : f?.worstMs ?? null, complete = Boolean(f && !untagged && f.count > 0 && f.invalidGaps === 0 && f.excluded === 0);
        run.autosaves.push({ at: now(), tick: s.lastSave.tick, frameMs, complete });
        add({ t: "autosave" });
        lastSaveAt = now();
        if (frameMs != null && frameMs > t.autosaveHitchMs)
          add(judged ? { t: "violation", rule: "autosave-hitch", ms: frameMs, value: frameMs, limit: t.autosaveHitchMs, where: `autosave at ${Math.round(now())} s`, detail: `${frameMs} ms` }
            : { t: "recorded", rule: "autosave-hitch", ms: frameMs, limit: t.autosaveHitchMs, where: `autosave at ${Math.round(now())} s` });
        add(complete && frameMs != null ? { t: "covered", rule: "autosave-hitch" } : { t: "unavailable", rule: "autosave-hitch", reason: frameMs == null ? "an autosave had no frame time" : "an autosave's interval was incomplete" });
      }
      lastSave = s.lastSave;
    }
    // Autosaves stopped (dwell): measured once, from arrival or the last save.
    if (kind === "dwell" && dwellStart != null && !silenceFailed && now() - (lastSaveAt ?? dwellStart) > t.autosaveMissingS) {
      silenceFailed = true;
      add({ t: "violation", rule: "autosave", detail: `no autosave for ${Math.round(now() - (lastSaveAt ?? dwellStart))} s` });
    }
    if (env.SILTWAKE_JOB_YIELD && existsSync(env.SILTWAKE_JOB_YIELD) && !facts.list.some((x) => x.t === "yielded")) { add({ t: "yielded" }); stopping = true; log("yield notice: stopping"); }
    check();
  }
  /** Excluded windows (R4-F3): the page tags the gaps that overlap them
   * (probe.mjs frameRecorderScript). If it can't (no recorder), every tick
   * whose interval a window touched is excluded instead. */
  let windows = 0, touchedSinceTick = false, tagging = Boolean(deps.exclude);
  async function exclude(on) {
    if (on) { windows++; touchedSinceTick = true; } else windows = Math.max(0, windows - 1);
    if (tagging) { try { if (!(await deps.exclude(g, on))) tagging = false; } catch { tagging = false; } }
  }
  function taintedTick() {
    const tainted = !tagging && (touchedSinceTick || windows > 0);
    touchedSinceTick = windows > 0;
    return tainted;
  }
  /** Memory compared over time must be read the same way each time: a forced
   * full GC, a settle (a GC transiently grows RSS, then returns pages), then
   * the sample, so RSS and heap are the post-GC floor. */
  async function gcSample(mark) {
    await exclude(true);
    try {
      await deps.collectGarbage(g);
      await new Promise((r) => setTimeout(r, opts.gcSettleMs ?? 2000));
      return await fullSample({ afterGc: true, ...(mark ? { mark: { mark } } : {}) });
    } finally { await exclude(false); }
  }
  async function fullSample(extra = {}) {
    let s;
    try { s = await probe.sample({ at: now(), ...extra }); } catch (e) { s = { at: now(), memory: {}, graphics: {}, unavailable: [`probe: ${e.message.split("\n")[0]}`] }; }
    observe(s);
    run.samples.push({ at: s.at, memory: s.memory, graphics: s.graphics, afterGc: Boolean(extra.afterGc) });
    add({ t: "sample", at: s.at, settled: Boolean(extra.afterGc), memory: s.memory ?? {}, graphics: s.graphics ?? {} });
    appendFileSync(join(out, "samples.jsonl"), `${JSON.stringify({ ...s, afterGc: Boolean(extra.afterGc), ...extra.mark })}\n`);
    if (env.SILTWAKE_JOB_HEARTBEAT) { try { writeFileSync(env.SILTWAKE_JOB_HEARTBEAT, ""); } catch { /* best effort */ } }
    check();
    return s;
  }
  /** Runs `job` on the one sampling chain, after everything queued before it. */
  let ticking = Promise.resolve();
  const onChain = (job) => (ticking = ticking.then(job, job));
  let sinceFull = 0, lastGc = -Infinity, dwellStart = null;
  const ticksPerSample = Math.max(1, Math.round((opts.sampleS ?? 10) * 1000 / (opts.tickMs ?? 1000)));
  const timer = setInterval(() => {
    onChain(async () => {
      if (stopping) return;
      await heartbeatTick();
      // Dwell: a GC'd sample on a fixed cadence, so the memory rules have a
      // series of like-for-like values (a heap without GC is a sawtooth).
      if (!stopping && ++sinceFull >= ticksPerSample) {
        sinceFull = 0;
        const gc = kind === "dwell" && now() - lastGc >= (opts.gcEveryS ?? 60);
        if (gc) { lastGc = now(); await gcSample(); } else await fullSample();
      }
    }).catch((e) => { add({ t: "violation", rule: "renderer", detail: `measurement loop failed: ${e.message.split("\n")[0]}` }); stopping = true; });
  }, opts.tickMs ?? 1000);

  try {
    await onChain(() => fullSample({ mark: { mark: "start" } }));
    if (kind === "tour") await tour();
    else await dwell();
  } catch (e) {
    if (e instanceof deps.Blocked) add({ t: "blocked", reason: e.message });
    else add({ t: "violation", rule: "renderer", detail: e.message.split("\n")[0] });
  } finally {
    clearInterval(timer);
    // Close the observation interval through the run's end (R5-F1), on the
    // same chain as every other sample, after all of them; then declare the end.
    await onChain(() => heartbeatTick({ closing: true })).catch((e) => add({ t: "unavailable", rule: "loading-hold", reason: `the closing interval could not be observed: ${e.message.split("\n")[0]}` }));
    add({ t: "end" });
    await deps.releaseAll(g).catch(() => {});
  }
  const v = verdictNow();
  const meta = { ...opts.meta, renderer: g.renderer, frames: judged ? "judged (isolated run)" : machine ? `recorded only (${machine}: possibly disturbed, not frame-time evidence)` : "recorded only (shared run: not frame-time evidence)",
    ranS: Math.round(now()), providers: [...new Set([...ps.full, ...ps.tick].map((p) => p.name))].join(", "), pageErrors: g.errors.length };
  writeFileSync(join(out, "report.json"), JSON.stringify({ kind, meta, thresholds: t, verdict: v, laps: run.laps, autosaves: run.autosaves, saves: run.saves,
    providerErrors: run.providerErrors, longFrames: run.frames.longOver.slice(0, 200), streamingFrames: run.frames.streamingOver.slice(0, 200),
    framesObserved: run.frames.observed, holds: run.holds, facts: facts.list.length, errors: g.errors.slice(0, 50) }, null, 1));
  writeFileSync(join(out, "facts.jsonl"), facts.list.map((f) => JSON.stringify(f)).join("\n") + "\n");
  writeFileSync(join(out, "report.md"), reportMarkdown(kind, v, meta));
  await g.close();
  return { verdict: v, run, facts: facts.list, meta };

  /** A save made now, exported and loaded in a separate browser. */
  async function checkSave(label) {
    await exclude(true);
    let res;
    try { res = await deps.saveAndCheck(g, { ...opts.browser }, join(out, "saves", `${label.replace(/\W+/g, "-")}.json`), label); }
    catch (e) { res = { ok: false, label, error: e.message.split("\n")[0] }; }
    finally { await exclude(false); }
    run.saves.push(res);
    add({ t: "save", ok: res.ok, label, error: res.error });
    if (!res.ok) add({ t: "violation", rule: "save-reload", detail: `save at ${label} did not reload: ${res.error}` });
    check();
  }

  async function tour() {
    const points = opts.plan.points ?? opts.plan.segments.flat();
    for (let lap = 1; lap <= t.laps && !stopping; lap++) {
      log(`lap ${lap} of ${t.laps}: ${points.length} points`);
      for (const [i, p] of points.entries()) {
        if (!(await deps.goto(g, p, { tol: p.cave ? 4 : 3, label: p.cave ?? p.region ?? `point ${i}`, boost: true, stop: shouldStop }))) return;
      }
      if (!(await deps.goto(g, points[0], { label: "lap start", stop: shouldStop }))) return;
      await new Promise((r) => setTimeout(r, opts.settleMs ?? 3000)); // the same place every lap, settled, before measuring
      const s = await onChain(() => gcSample(`lap ${lap}`));
      run.laps.push({ lap, at: s.at, memory: s.memory, graphics: s.graphics });
      add({ t: "lap", lap, at: s.at, memory: s.memory ?? {}, graphics: s.graphics ?? {} });
      if (check().status === "fail") return; // a rule broke in that sample: stop now
      await checkSave(`lap ${lap}`);
      const sv = run.saves.at(-1);
      log(`lap ${lap}: renderer ${s.memory?.rendererRssMiB?.toFixed?.(0)} MiB, heap ${s.memory?.jsHeapAfterGcMiB?.toFixed?.(0)} MiB after GC, ${s.graphics?.meshes} meshes; save ${sv.ok ? "loads" : `FAILED: ${sv.error}`}`);
    }
  }

  async function dwell() {
    const name = opts.at;
    if (name && PLACES[name] === null) { add({ t: "blocked", reason: `${name} is not placed in the game yet` }); return; }
    const at = name ? (PLACES[name] ?? name.split(",").map(Number)) : null;
    if (at && (at.length !== 3 || at.some((x) => !Number.isFinite(x)))) { add({ t: "blocked", reason: `--at ${name}: a place (${Object.keys(PLACES).join(", ")}) or X,Y,Z` }); return; }
    const anchor = at ? { x: at[0], y: at[1], z: at[2] } : null;
    if (anchor && !(await deps.goto(g, anchor, { label: `dwell place ${name}`, stop: shouldStop }))) return;
    const s0 = await deps.read(g), home = anchor ?? { x: s0.cam[0], y: s0.cam[1], z: s0.cam[2] };
    dwellStart = now();
    add({ t: "start" }); // warm-up and "autosaves keep happening" count from arrival
    lastGc = -Infinity; // the first settled sample comes right after warm-up
    log(`dwelling at ${home.x.toFixed(0)},${home.y.toFixed(0)},${home.z.toFixed(0)} until the goal: ${t.autosaves} autosaves and ${Math.round(t.leakMinWindowS / 60)} min after warm-up`);
    // The goal is met when the reducer, given an end now, would not call it incomplete.
    const goalMet = () => reduce([...facts.list, { t: "end", at: now() }], kind, t, { judged, machine }).status !== "incomplete";
    while (!stopping && !goalMet()) {
      const s = await deps.read(g), off = Math.hypot(s.cam[0] - home.x, s.cam[1] - home.y, s.cam[2] - home.z);
      if (off > 6) await deps.goto(g, home, { label: "dwell place", stop: shouldStop }); // drifted in a current: hold station
      await new Promise((r) => setTimeout(r, opts.tickMs ?? 1000));
    }
    // The terminal sample and save, on the sampling chain, each only if nothing broke meanwhile.
    if (!stopping) await onChain(() => (stopping ? null : gcSample("dwell end")));
    if (!stopping) await checkSave("dwell end");
  }
}

/** Exit codes for a verdict. */
export const EXIT = Object.freeze({ pass: 0, fail: 1, incomplete: 4, partial: 5, yielded: 75, running: 4 });

/** Reads a JSON file or returns null (for plans). */
export const readJsonFile = (p) => (p ? JSON.parse(readFileSync(p, "utf8")) : null);
