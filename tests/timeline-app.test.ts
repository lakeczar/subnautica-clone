/** SIM-1a: the play timeline through the real app, stored as root stores it
 * (the whole export under one key, in one write): a note is acknowledged only
 * once that write returns, and Continue resumes the timeline whole, rotated
 * history included. */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { GameView, browserFixture } from "./app-browser-support.js";
import { settled } from "./persistence-support.js";
import { addNote, exportTimeline, exportTimelineText, recordEvent, TIMELINE_CHUNK_EVENTS, TIMELINE_STORAGE_KEY } from "../src/sim/timeline/recorder.js";
import { analyseTimeline } from "../src/sim/timeline/report.js";
import type { TimelineRecorder } from "../src/sim/timeline/recorder.js";
import type { GameState } from "../src/sim/types.js";
import type { SaveEnvelope } from "../src/save/codec.js";

register("./app-loader.js", import.meta.url);
const { SiltwakeApp } = await import("../src/runtime/app.js");

/** The app's own timeline seams (private in the source). */
interface AppSeams { timeline: TimelineRecorder; state: GameState; saveTimeline(): boolean; dispose(): void; session: { envelope(): SaveEnvelope | null } }
const seams = (app: unknown) => app as AppSeams;
const notes = (rec: TimelineRecorder, s: GameState) => {
  const t = exportTimeline(rec, s);
  return [...(t.rotated ?? []).flatMap((r) => r.kept), ...t.events].filter((e) => e.kind === "note").map((e) => e.text!);
};
async function newGame(f: ReturnType<typeof browserFixture>): Promise<AppSeams> {
  const app = seams(new SiltwakeApp({} as HTMLElement));
  f.frames();
  GameView.current.actions.newGame(); await settled(); f.frames();
  return app;
}
/** The N key's path: the app's feedback note, with the note entry answered at once. */
function writeNote(app: AppSeams, text: string): void {
  (GameView.current as unknown as { noteEntry(done: (text: string) => void): void }).noteEntry = (done) => done(text);
  (app as unknown as { feedbackNote(): void }).feedbackNote();
}

test("SIM-1a: a note says Note saved only once its write returns; a refused write says it is in memory only", async () => {
  const f = browserFixture(), app = await newGame(f);
  try {
    writeNote(app, "kept");
    assert.ok(GameView.current.notices.includes("Note saved to the play timeline."));
    assert.ok(f.storage.getItem(TIMELINE_STORAGE_KEY)?.includes("kept"), "the write had returned");
    f.storage.failWrite = true;
    const before = GameView.current.notices.length;
    writeNote(app, "refused");
    const said = GameView.current.notices.slice(before);
    assert.ok(said.some((n) => /^Note kept in memory only/.test(n)), said.join(" | "));
    assert.ok(!said.includes("Note saved to the play timeline."));
    assert.deepEqual(notes(app.timeline, app.state), ["kept", "refused"], "in memory, for export");
  } finally { app.dispose(); f.restore(); }
});

test("SIM-1a: Continue resumes the stored timeline whole, rotated history and every note included", async () => {
  const f = browserFixture();
  let app = await newGame(f);
  try {
    const aid = app.session.envelope()!.meta.sessionId;
    for (let i = 0; i < TIMELINE_CHUNK_EVENTS * 23; i++) addNote(app.timeline, app.state, `note ${i}`);
    assert.ok(app.timeline.rotated.length > 0, "old chunks rotated");
    assert.equal(app.saveTimeline(), true);
    const written = notes(app.timeline, app.state);
    app.dispose();
    app = seams(new SiltwakeApp({} as HTMLElement)); f.frames();
    GameView.current.actions.continueGame(); f.frames();
    assert.equal(app.session.envelope()?.meta.sessionId, aid);
    assert.deepEqual(notes(app.timeline, app.state), written);
  } finally { app.dispose(); f.restore(); }
});

test("SIM-1a: on a full quota the stored copy folds its oldest chunks and fits; every note reloads and the analysis matches", async () => {
  for (const tight of [false, true]) {
    const f = browserFixture();
    let app = await newGame(f);
    try {
      const aid = app.session.envelope()!.meta.sessionId, s = app.state, rec = app.timeline;
      for (let i = 0; i < TIMELINE_CHUNK_EVENTS * 16; i++) {
        s.tick += 30; rec.playTicks += 30;
        if (i % 41 === 0) addNote(rec, s, `note ${i}`);
        else recordEvent(rec, s, { kind: "gather", what: "silica_glass", id: "src", quantity: 1 });
      }
      const sealed = rec.sealed.length, unfolded = analyseTimeline(exportTimeline(rec, s)), allNotes = notes(rec, s);
      // A quota between the half-window and quarter-window exports: two folds are needed.
      const half = exportTimelineText(rec, s, Math.floor(sealed / 2)).length, quarter = exportTimelineText(rec, s, Math.floor(sealed / 4)).length;
      const limit = tight ? 1_000 : Math.floor((half + quarter) / 2);
      const write = f.storage.setItem.bind(f.storage);
      f.storage.setItem = (key: string, value: string) => {
        if (key === TIMELINE_STORAGE_KEY && value.length > limit) { const e = new Error("quota"); e.name = "QuotaExceededError"; throw e; }
        write(key, value);
      };
      const before = GameView.current.notices.length;
      writeNote(app, "under pressure");
      allNotes.push("under pressure");
      const said = GameView.current.notices.slice(before);
      if (tight) {
        assert.ok(said.some((n) => /^Note kept in memory only/.test(n)), "below the floor: memory only");
        continue;
      }
      assert.ok(said.includes("Note saved to the play timeline."), said.join(" | "));
      assert.equal(rec.sealed.length, sealed, "the timeline in memory keeps its window");
      app.dispose();
      app = seams(new SiltwakeApp({} as HTMLElement)); f.frames();
      GameView.current.actions.continueGame(); f.frames();
      assert.equal(app.session.envelope()?.meta.sessionId, aid);
      assert.deepEqual(notes(app.timeline, app.state).sort(), allNotes.sort(), "every note");
      const back = analyseTimeline(exportTimeline(app.timeline, app.state));
      for (const key of ["newCount", "gathering", "deaths"] as const) assert.deepEqual(back[key], unfolded[key], key);
      assert.equal(back.notes.length, unfolded.notes.length + 1);
      assert.ok(app.timeline.rotated.length > rec.rotated.length, "the reloaded timeline holds the folded summaries");
    } finally { app.dispose(); f.restore(); }
  }
});
