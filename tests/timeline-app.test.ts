/** SIM-1 R3: through the real app, session and save repository, returning to
 * an earlier expedition brings back its whole play timeline, however another
 * expedition saved its own in between. */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { GameView, browserFixture } from "./app-browser-support.js";
import { encoded, sample, settled } from "./persistence-support.js";
import { addNote, exportTimeline } from "../src/sim/timeline/recorder.js";
import type { TimelineRecorder } from "../src/sim/timeline/recorder.js";
import { analyseTimeline } from "../src/sim/timeline/report.js";
import { TimelineStore } from "../src/sim/timeline/store.js";
import type { GameState } from "../src/sim/types.js";
import type { SaveSlot } from "../src/save/repository.js";
import type { SaveEnvelope } from "../src/save/codec.js";

register("./app-loader.js", import.meta.url);
const { SiltwakeApp } = await import("../src/runtime/app.js");

/** The app's own timeline seams (private in the source). */
interface AppSeams {
  timeline: TimelineRecorder; state: GameState; saveTimeline(): void; dispose(): void;
  session: { envelope(): SaveEnvelope | null; importFile(f: { size: number; text(): Promise<string> }): Promise<void>; confirmation: { title: string } | null; autoSaveAllowed: boolean };
  repository: { status: SaveSlot };
}
const seams = (app: unknown) => app as AppSeams;
const notes = (rec: TimelineRecorder, s: GameState) => {
  const t = exportTimeline(rec, s);
  return [...(t.rotated ?? []).flatMap((r) => r.kept), ...t.events].filter((e) => e.kind === "note").map((e) => e.text);
};
/** Saves the timeline and lets the (asynchronous) save finish. */
async function saveTimeline(app: AppSeams): Promise<void> { app.saveTimeline(); await settled(); }

for (const flow of ["export, new expedition, import the first back", "session-only replacement, then Continue"] as const)
  test(`R3-F1: ${flow}: the first expedition's whole timeline comes back`, async () => {
    const f = browserFixture();
    let app = seams(new SiltwakeApp({} as HTMLElement));
    f.frames();
    try {
      let view = GameView.current;
      view.actions.newGame(); await settled(); f.frames();
      const a = app.session.envelope()!, aid = a.meta.sessionId, atext = encoded(a);
      for (let i = 0; i < 1200; i++) addNote(app.timeline, app.state, `A note ${i}`);
      await saveTimeline(app);
      const before = analyseTimeline(exportTimeline(app.timeline, app.state)), aNotes = notes(app.timeline, app.state);
      assert.equal(aNotes.length, 1200);
      if (flow === "export, new expedition, import the first back") {
        view.actions.newGame(); view.actions.confirm(); await settled(); f.frames();
        assert.equal(app.repository.status.backup?.meta.sessionId, aid, "A is the repository's backup");
      } else {
        await app.session.importFile({ size: encoded(sample(900)).length, text: async () => encoded(sample(900)) });
        f.storage.failWrite = true; view.actions.confirm(); await settled();
        assert.match(app.session.confirmation?.title ?? "", /without local saving/);
        view.actions.confirm(); f.frames(); f.storage.failWrite = false;
        assert.equal(app.repository.status.save?.meta.sessionId, aid, "Continue still holds A");
      }
      // The other expedition records and saves its own timeline, repeatedly, an hour later
      // (the 8eb5e374 store expired other sessions' timelines after ten minutes).
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
      assert.deepEqual(notes(app.timeline, app.state).slice(0, aNotes.length), aNotes, "every A note, exactly once, in the resumed timeline");
      assert.equal(new Set(notes(app.timeline, app.state)).size, notes(app.timeline, app.state).length);
      // What is stored for A analyses exactly as A did at its last save.
      const stored = new TimelineStore(f.storage).load(aid);
      assert.equal(stored.kind, "loaded");
      const back = (stored as { recorder: TimelineRecorder }).recorder;
      assert.deepEqual(notes(back, app.state), aNotes);
      const after = analyseTimeline(exportTimeline(back, app.state));
      for (const key of ["newCount", "notes", "gathering", "deaths", "travel", "idle"] as const) assert.deepEqual(after[key], before[key], key);
      assert.ok(!GameView.current.notices.some((n) => /timeline can't/.test(n)), "no timeline failure");
    } finally { app.dispose(); f.restore(); }
  });
