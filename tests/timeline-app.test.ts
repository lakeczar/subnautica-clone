/** SIM-1 R3/R4: the play timeline through the real app, session and save
 * repository: returning to the previous expedition brings its timeline back;
 * a replaced or closed generation never writes; a note outlives a close. */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { GameView, browserFixture } from "./app-browser-support.js";
import { deferred, encoded, sample, settled } from "./persistence-support.js";
import { addNote, exportTimeline } from "../src/sim/timeline/recorder.js";
import type { TimelineRecorder } from "../src/sim/timeline/recorder.js";
import { analyseTimeline } from "../src/sim/timeline/report.js";
import { TIMELINE_JOURNAL_KEY, TimelineJournal } from "../src/sim/timeline/store.js";
import type { LiveTimeline } from "../src/runtime/liveTimeline.js";
import type { GameState } from "../src/sim/types.js";
import type { SaveSlot } from "../src/save/repository.js";
import type { SaveEnvelope } from "../src/save/codec.js";
import type { WriterLockPort } from "../src/save/writer-lock.js";

register("./app-loader.js", import.meta.url);
const { SiltwakeApp } = await import("../src/runtime/app.js");

/** The app's own timeline seams (private in the source). */
interface AppSeams {
  timeline: TimelineRecorder; live: LiveTimeline; state: GameState; saveTimeline(): void; dispose(): void;
  session: { envelope(): SaveEnvelope | null; importFile(f: { size: number; text(): Promise<string> }): Promise<void>; confirmation: { title: string } | null };
  repository: { status: SaveSlot };
}
const seams = (app: unknown) => app as AppSeams;
const notes = (rec: TimelineRecorder, s: GameState) => {
  const t = exportTimeline(rec, s);
  return [...(t.rotated ?? []).flatMap((r) => r.kept), ...t.events].filter((e) => e.kind === "note").map((e) => e.text!).sort();
};
async function saveTimeline(app: AppSeams): Promise<void> { app.saveTimeline(); await settled(); }
const stored = (f: ReturnType<typeof browserFixture>, id: string): TimelineRecorder => {
  const l = new TimelineJournal(f.storage, f.lock, id).load();
  assert.equal(l.kind, "loaded", `stored timeline of ${id}`);
  return (l as { recorder: TimelineRecorder }).recorder;
};
async function newGame(f: ReturnType<typeof browserFixture>): Promise<AppSeams> {
  const app = seams(new SiltwakeApp({} as HTMLElement));
  f.frames();
  GameView.current.actions.newGame(); await settled(); f.frames();
  return app;
}

for (const flow of ["export, new expedition, import the first back", "session-only replacement, then Continue"] as const)
  test(`R3-F1/R4: ${flow}: the previous expedition's whole timeline comes back`, async () => {
    const f = browserFixture();
    let app = await newGame(f);
    try {
      let view = GameView.current;
      const a = app.session.envelope()!, aid = a.meta.sessionId, atext = encoded(a);
      for (let i = 0; i < 1200; i++) addNote(app.timeline, app.state, `A note ${i}`);
      await saveTimeline(app);
      const before = analyseTimeline(exportTimeline(app.timeline, app.state)), aNotes = notes(app.timeline, app.state);
      if (flow === "export, new expedition, import the first back") {
        view.actions.newGame(); view.actions.confirm(); await settled(); f.frames();
      } else {
        await app.session.importFile({ size: encoded(sample(900)).length, text: async () => encoded(sample(900)) });
        f.storage.failWrite = true; view.actions.confirm(); await settled();
        assert.match(app.session.confirmation?.title ?? "", /without local saving/);
        view.actions.confirm(); f.frames(); f.storage.failWrite = false;
      }
      // The other expedition records and saves its own timeline, an hour later.
      assert.notEqual(app.timeline.session.id, aid);
      const realNow = Date.now;
      Date.now = () => realNow() + 3_600_000;
      try { for (let k = 0; k < 3; k++) { addNote(app.timeline, app.state, `B note ${k}`); await saveTimeline(app); } }
      finally { Date.now = realNow; }
      if (flow === "export, new expedition, import the first back") {
        await app.session.importFile({ size: atext.length, text: async () => atext }); view.actions.confirm(); await settled(); f.frames();
      } else {
        app.dispose(); app = seams(new SiltwakeApp({} as HTMLElement)); f.frames();
        view = GameView.current; view.actions.continueGame(); f.frames();
      }
      assert.equal(app.session.envelope()?.meta.sessionId, aid);
      assert.deepEqual(notes(app.timeline, app.state).filter((n) => n.startsWith("A")), aNotes, "every A note, exactly once");
      const back = stored(f, aid);
      assert.deepEqual(notes(back, app.state), aNotes);
      const after = analyseTimeline(exportTimeline(back, app.state));
      for (const key of ["newCount", "gathering", "deaths", "travel", "idle"] as const) assert.deepEqual(after[key], before[key], key);
      assert.ok(!GameView.current.notices.some((n) => /timeline can't|couldn't be saved/.test(n)), "no timeline failure");
    } finally { app.dispose(); f.restore(); }
  });

test("R4-F2: a disposed app's save still waiting for the lock never writes", async () => {
  const f = browserFixture(), app = await newGame(f);
  try {
    addNote(app.timeline, app.state, "base");
    await saveTimeline(app);
    const before = f.storage.getItem(TIMELINE_JOURNAL_KEY);
    const gate = deferred();
    f.lock.gate = gate.promise;
    app.saveTimeline();
    app.dispose();
    gate.resolve(); f.lock.gate = null;
    await settled();
    assert.equal(f.storage.getItem(TIMELINE_JOURNAL_KEY), before, "the journal is untouched");
  } finally { app.dispose(); f.restore(); }
});

test("R4-F2: importing the same expedition while a save waits: every note once", async () => {
  const f = browserFixture(), app = await newGame(f);
  try {
    const a = app.session.envelope()!, atext = encoded(a);
    addNote(app.timeline, app.state, "base"); await saveTimeline(app);
    const gate = deferred();
    f.lock.gate = gate.promise;
    assert.equal(app.live.note(app.state, "old pending"), null);
    await app.session.importFile({ size: atext.length, text: async () => atext });
    GameView.current.actions.confirm();
    gate.resolve(); f.lock.gate = null;
    await settled(); f.frames();
    assert.equal(app.live.note(app.state, "new recorder"), null);
    await settled();
    const back = stored(f, a.meta.sessionId);
    for (const n of ["base", "old pending", "new recorder"]) assert.equal(notes(back, app.state).filter((m) => m === n).length, 1, n);
  } finally { app.dispose(); f.restore(); }
});

test("R4-F2: closing the page while the lock is delayed loses no note", async () => {
  const f = browserFixture();
  let app = await newGame(f);
  try {
    const aid = app.session.envelope()!.meta.sessionId;
    addNote(app.timeline, app.state, "committed"); await saveTimeline(app);
    f.lock.gate = new Promise(() => {});   // the lock never comes while this page lives
    assert.equal(app.live.note(app.state, "written just before closing"), null);
    f.window.dispatchEvent(Object.assign(new Event("pagehide"), { persisted: false }));
    f.lock.gate = null;
    app = seams(new SiltwakeApp({} as HTMLElement)); f.frames();
    GameView.current.actions.continueGame(); f.frames();
    assert.equal(app.session.envelope()?.meta.sessionId, aid);
    assert.deepEqual(notes(app.timeline, app.state), ["committed", "written just before closing"]);
  } finally { app.dispose(); f.restore(); }
});

test("R4-F5: a refused lock is said, and the timeline stays whole in memory", async () => {
  const f = browserFixture(), app = await newGame(f);
  try {
    const original = f.lock.runExclusive.bind(f.lock);
    (f.lock as WriterLockPort).runExclusive = () => Promise.reject(new Error("refused"));
    addNote(app.timeline, app.state, "kept in memory");
    await saveTimeline(app);
    assert.ok(GameView.current.notices.some((n) => /couldn't be saved/.test(n)), "said");
    assert.deepEqual(notes(app.timeline, app.state), ["kept in memory"]);
    (f.lock as WriterLockPort).runExclusive = original;
    await saveTimeline(app);
    assert.deepEqual(notes(stored(f, app.timeline.session.id), app.state), ["kept in memory"], "a later save commits it");
  } finally { app.dispose(); f.restore(); }
});
