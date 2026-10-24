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

test("R5: a note says Saving note…, then Note saved only once its commit succeeds; a pending commit is said promptly", async (t) => {
  const f = browserFixture(), app = await newGame(f);
  try {
    const seen = () => GameView.current.notices;
    assert.equal(app.live.note(app.state, "first"), null);
    assert.ok(seen().includes("Saving note…"));
    await settled();
    assert.ok(seen().includes("Note saved to the play timeline."));
    // The lock is held: the note is pending, said within about two seconds, and never called saved.
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const gate = deferred();
    f.lock.gate = gate.promise;
    const before = seen().filter((n) => n === "Note saved to the play timeline.").length;
    assert.equal(app.live.note(app.state, "second"), null);
    await settled();
    t.mock.timers.tick(2_000);
    assert.ok(seen().some((n) => /^Waiting to save the play timeline/.test(n)), "the wait is said");
    assert.equal(seen().filter((n) => n === "Note saved to the play timeline.").length, before, "not saved yet");
    gate.resolve(); f.lock.gate = null;
    await settled();
    assert.equal(seen().filter((n) => n === "Note saved to the play timeline.").length, before + 1, "saved once it is");
  } finally { app.dispose(); f.restore(); }
});

test("R5: closing the page during a pending note commit can lose that note, and the notices never claimed it saved", async () => {
  const f = browserFixture();
  let app = await newGame(f);
  try {
    const aid = app.session.envelope()!.meta.sessionId;
    assert.equal(app.live.note(app.state, "committed"), null); await settled();
    f.lock.gate = new Promise(() => {});   // the lock never comes while this page lives
    const notices = GameView.current.notices.length;
    assert.equal(app.live.note(app.state, "pending at close"), null);
    assert.deepEqual(GameView.current.notices.slice(notices), ["Saving note…"]);
    f.window.dispatchEvent(Object.assign(new Event("pagehide"), { persisted: false }));
    f.lock.gate = null;
    app = seams(new SiltwakeApp({} as HTMLElement)); f.frames();
    GameView.current.actions.continueGame(); f.frames();
    assert.equal(app.session.envelope()?.meta.sessionId, aid);
    assert.deepEqual(notes(app.timeline, app.state), ["committed"], "the honest bound: durable once its commit returns");
  } finally { app.dispose(); f.restore(); }
});

test("R5: a conflicting note is said to be in memory only, with export", async () => {
  const f = browserFixture(), app = await newGame(f);
  try {
    assert.equal(app.live.note(app.state, "first"), null); await settled();
    // Another tab commits newer history for this expedition.
    const other = new TimelineJournal(f.storage, f.lock, app.timeline.session.id), l = other.load();
    const rec = (l as { recorder: TimelineRecorder }).recorder;
    addNote(rec, app.state, "other tab");
    assert.ok((await other.commit(rec, app.state, new AbortController().signal)).ok);
    assert.equal(app.live.note(app.state, "this tab"), null); await settled();
    assert.ok(GameView.current.notices.some((n) => /another tab.*memory only\. The note is in memory only\. Export the timeline/.test(n)), GameView.current.notices.join(" | "));
  } finally { app.dispose(); f.restore(); }
});

test("R5: Repair play timeline exports the unreadable records, confirms, then replaces the store; a change meanwhile is a conflict", async () => {
  for (const conflict of [false, true]) {
    const f = browserFixture();
    const downloads: { href: string; download: string }[] = [];
    Object.assign(f.document, {
      body: { append: (anchor: { href: string; download: string }) => downloads.push(anchor) },
      createElement: () => ({ href: "", download: "", click() {}, remove() {} }),
    });
    Object.assign(f.window, { setTimeout: (callback: () => void) => { callback(); return 0; } });
    f.storage.setItem(TIMELINE_JOURNAL_KEY, "{unreadable");
    const app = await newGame(f);
    try {
      assert.equal(GameView.current.repairVisible, true, "the menu offers the repair");
      assert.ok(GameView.current.notices.some((n) => /local play-timeline store can't be read/.test(n)));
      GameView.current.actions.repairTimeline();
      assert.deepEqual(downloads.map((d) => d.download), ["siltwake-timeline-record.json"], "exported first");
      assert.match(app.session.confirmation?.title ?? "", /Replace the local play-timeline store/);
      if (conflict) f.storage.setItem(TIMELINE_JOURNAL_KEY, "{changed in another tab");
      GameView.current.actions.confirm();
      await settled();
      if (conflict) {
        assert.equal(f.storage.getItem(TIMELINE_JOURNAL_KEY), "{changed in another tab", "nothing replaced");
        assert.equal(GameView.current.repairVisible, true);
      } else {
        assert.equal(GameView.current.repairVisible, false);
        assert.ok(GameView.current.notices.some((n) => /store was replaced/.test(n)));
        assert.equal(stored(f, app.timeline.session.id).session.id, app.timeline.session.id);
        assert.equal(app.live.note(app.state, "after the repair"), null); await settled();
        assert.deepEqual(notes(stored(f, app.timeline.session.id), app.state), ["after the repair"]);
      }
    } finally { app.dispose(); f.restore(); }
  }
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

// ---- SIM-1b: the R6 regressions through the real app -------------------------

/** Downloads land here instead of a page; the repair's notices run without timers. */
function withDownloads(f: ReturnType<typeof browserFixture>): string[] {
  const downloads: string[] = [];
  Object.assign(f.document, {
    body: { append: (anchor: { download: string }) => downloads.push(anchor.download) },
    createElement: () => ({ href: "", download: "", click() {}, remove() {} }),
  });
  Object.assign(f.window, { setTimeout: (callback: () => void) => { callback(); return 0; } });
  return downloads;
}

test("R6-F2: Continue onto a head with malformed events protects, never throws, and offers the repair", async () => {
  const f = browserFixture();
  let app = await newGame(f);
  try {
    assert.equal(app.live.note(app.state, "before the damage"), null); await settled();
    const j = JSON.parse(f.storage.getItem(TIMELINE_JOURNAL_KEY)!);
    j.current.events = null;
    f.storage.setItem(TIMELINE_JOURNAL_KEY, JSON.stringify(j));
    app.dispose();
    app = seams(new SiltwakeApp({} as HTMLElement)); f.frames();
    assert.doesNotThrow(() => { GameView.current.actions.continueGame(); f.frames(); });
    assert.equal(app.live.protected, true);
    assert.equal(GameView.current.repairVisible, true, "the repair is offered");
    assert.ok(GameView.current.notices.some((n) => /local play-timeline store can't be read/.test(n)));
  } finally { app.dispose(); f.restore(); }
});

test("R6-F3: a refused repair stays offered and works when tried again, keeping every note in memory", async () => {
  const f = browserFixture(), downloads = withDownloads(f);
  f.storage.setItem(TIMELINE_JOURNAL_KEY, "{unreadable");
  const app = await newGame(f);
  try {
    assert.equal(app.live.note(app.state, "kept through the refusal"), null);
    GameView.current.actions.repairTimeline();
    f.storage.failWrite = true;
    GameView.current.actions.confirm(); await settled();
    f.storage.failWrite = false;
    assert.equal(f.storage.getItem(TIMELINE_JOURNAL_KEY), "{unreadable", "nothing replaced");
    assert.equal(GameView.current.repairVisible, true, "still offered");
    assert.ok(GameView.current.notices.some((n) => /wasn't replaced.*can be tried again/.test(n)));
    GameView.current.actions.repairTimeline();
    assert.match(app.session.confirmation?.title ?? "", /Replace the local play-timeline store/, "the retry asks again");
    GameView.current.actions.confirm(); await settled();
    assert.equal(GameView.current.repairVisible, false);
    assert.deepEqual(notes(stored(f, app.timeline.session.id), app.state), ["kept through the refusal"]);
    assert.equal(downloads.length, 2, "each attempt exported the record first");
  } finally { app.dispose(); f.restore(); }
});

test("R6-F5: an unreadable journal during a live commit offers the repair; once reads recover, it repairs in the same expedition", async () => {
  const f = browserFixture();
  withDownloads(f);
  const app = await newGame(f);
  try {
    assert.equal(app.live.note(app.state, "base"), null); await settled();
    f.storage.failRead = true;
    assert.equal(app.live.note(app.state, "while unreadable"), null); await settled();
    f.storage.failRead = false;
    assert.equal(app.live.protected, true);
    assert.equal(GameView.current.repairVisible, true);
    GameView.current.actions.repairTimeline();
    GameView.current.actions.confirm(); await settled();
    assert.equal(GameView.current.repairVisible, false);
    assert.deepEqual(notes(stored(f, app.timeline.session.id), app.state), ["base", "while unreadable"]);
  } finally { app.dispose(); f.restore(); }
});

test("R6-F6: a refused lock or a full quota keeps the note in memory for now, and the next scheduled save commits it", async () => {
  for (const cause of ["lock", "quota"] as const) {
    const f = browserFixture(), app = await newGame(f);
    try {
      const lock = f.lock.runExclusive.bind(f.lock), write = f.storage.setItem.bind(f.storage);
      if (cause === "lock") (f.lock as WriterLockPort).runExclusive = () => Promise.reject(new Error("refused"));
      else f.storage.setItem = (k: string, v: string) => { if (k === TIMELINE_JOURNAL_KEY) throw Object.assign(new Error("full"), { name: "QuotaExceededError" }); write(k, v); };
      const before = GameView.current.notices.length;
      assert.equal(app.live.note(app.state, `${cause} note`), null); await settled();
      const said = GameView.current.notices.slice(before);
      assert.ok(said.some((n) => /in memory only for now\. The note is in memory only\. Saving is tried again at the next save/.test(n)), `${cause}: ${said.join(" | ")}`);
      assert.ok(!said.includes("Note saved to the play timeline."));
      (f.lock as WriterLockPort).runExclusive = lock; f.storage.setItem = write;
      await saveTimeline(app);   // the periodic save, with no player retry
      assert.ok(GameView.current.notices.includes("Note saved to the play timeline."), `${cause}: saved by the next save`);
      assert.deepEqual(notes(stored(f, app.timeline.session.id), app.state), [`${cause} note`]);
    } finally { app.dispose(); f.restore(); }
  }
});

test("R6-F7: a note queued behind a long-pending commit gets its own waiting notice", async (t) => {
  const f = browserFixture(), app = await newGame(f);
  try {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    f.lock.gate = new Promise(() => {});
    await saveTimeline(app);   // a periodic save, pending
    t.mock.timers.tick(2_000);
    const waiting = () => GameView.current.notices.filter((n) => /^Waiting to save the play timeline/.test(n)).length;
    assert.equal(waiting(), 1);
    t.mock.timers.tick(5_000);
    assert.equal(app.live.note(app.state, "queued"), null);
    t.mock.timers.tick(2_000);
    assert.equal(waiting(), 2, "the queued note's own waiting notice");
  } finally { f.lock.gate = null; app.dispose(); f.restore(); }
});
