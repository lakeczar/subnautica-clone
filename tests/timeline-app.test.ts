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

// The real HUD, loaded before the loader redirects app.ts's view imports to the test double.
import { HudView } from "../src/ui/hud.js";
import { EncounterPresentation, NOTICE_SECONDS } from "../src/ui/notices.js";
import { cueHome, miteScatter } from "../src/sim/ecology/cues.js";
import { completeOpening } from "../src/sim/progression.js";
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
    await settled();
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

/** The fixture's view, wired to a real HudView's notify and reset (DOM rendering stubbed), so
 * the test sees what the player would. Returns the real presentation and a restore. */
function realHud(): { presentation: EncounterPresentation; restore(): void } {
  const notify = GameView.prototype.notify, reset = GameView.prototype.resetPresentation, presentation = new EncounterPresentation();
  const nodes = new Map<string, object>(), hud = Object.create(HudView.prototype) as Record<string, unknown>;
  Object.assign(hud, { presentation, current: null, announcedContexts: new Set(), threatEdge: { reset() {} }, cancelFeedback() {},
    get(id: string) { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id); }, renderNotices() {} });
  const real = HudView.prototype as unknown as { notify(m: string, e: boolean, o: unknown, s: null): void; resetPresentation(): void };
  GameView.prototype.notify = function (this: GameView, m: string, e = false, o = {}) { notify.call(this, m, e, o); real.notify.call(hud, m, e, o, null); };
  GameView.prototype.resetPresentation = function () { real.resetPresentation.call(hud); };
  return { presentation, restore: () => { GameView.prototype.notify = notify; GameView.prototype.resetPresentation = reset; } };
}

test("SIM-1b R1-F5: the protection warning survives expedition entry: New, Continue, import and session-only", async () => {
  for (const entry of ["new", "continue", "import", "session-only"] as const) {
    const f = browserFixture();
    let app: AppSeams | null = null;
    // An expedition to Continue or import, made before the store is damaged.
    app = await newGame(f);
    const saved = encoded(app.session.envelope()!);
    app.dispose(); app = null;
    f.storage.setItem(TIMELINE_JOURNAL_KEY, "{bad");
    const hud = realHud();
    try {
      app = seams(new SiltwakeApp({} as HTMLElement)); f.frames();
      const view = GameView.current;
      if (entry === "new") { view.actions.newGame(); view.actions.confirm(); await settled(); }
      else if (entry === "continue") view.actions.continueGame();
      else {
        await app.session.importFile({ size: saved.length, text: async () => saved });
        if (entry === "session-only") f.storage.failWrite = true;
        view.actions.confirm(); await settled();
        if (entry === "session-only") { assert.match(app.session.confirmation?.title ?? "", /without local saving/); view.actions.confirm(); f.storage.failWrite = false; }
      }
      await settled(); f.frames();
      assert.equal(app.live.protected, true, entry);
      const shown = [hud.presentation.central?.message, hud.presentation.status?.message].filter(Boolean).join(" | ");
      assert.match(shown, /play-timeline store can't be read.*memory only/, `${entry}: the warning is still shown (${shown})`);
      assert.equal(GameView.current.repairVisible, true, entry);
    } finally { hud.restore(); app?.dispose(); f.restore(); }
  }
});

test("SIM-1b R1-F2: Continue onto a hostile version 1 record offers the repair rather than throwing", async () => {
  const f = browserFixture();
  let app = await newGame(f);
  try {
    assert.equal(app.live.note(app.state, "base"), null); await settled();
    app.dispose();
    f.storage.setItem(TIMELINE_JOURNAL_KEY, "{bad");
    f.storage.setItem("siltwake.timeline.v1", '{"format":"siltwake.timeline","version":{"toString":null}}');
    app = seams(new SiltwakeApp({} as HTMLElement)); f.frames();
    assert.doesNotThrow(() => { GameView.current.actions.continueGame(); f.frames(); });
    assert.equal(app.live.protected, true);
    assert.equal(GameView.current.repairVisible, true);
  } finally { app.dispose(); f.restore(); }
});

test("SIM-1b R1-F1: a refused repair keeps the version 1 record and says nothing was changed, truthfully", async () => {
  const f = browserFixture();
  withDownloads(f);
  f.storage.setItem(TIMELINE_JOURNAL_KEY, "{bad");
  const v1 = JSON.stringify({ format: "siltwake.timeline", version: 1, dropped: 0, session: { id: "legacy", started: "2026-10-01T00:00:00.000Z", end: { tick: 10, play: 1, idle: 0 } },
    events: [{ kind: "note", tick: 1, play: 0, text: "legacy note" }] });
  f.storage.setItem("siltwake.timeline.v1", v1);
  const app = await newGame(f);
  try {
    GameView.current.actions.repairTimeline();
    const write = f.storage.setItem.bind(f.storage);
    f.storage.setItem = (k: string, v: string) => { if (k === TIMELINE_JOURNAL_KEY) throw new Error("denied"); write(k, v); };
    GameView.current.actions.confirm(); await settled();
    f.storage.setItem = write;
    assert.equal(f.storage.getItem("siltwake.timeline.v1"), v1, "the version 1 record is kept");
    assert.equal(f.storage.getItem(TIMELINE_JOURNAL_KEY), "{bad");
    assert.ok(GameView.current.notices.some((n) => /Nothing was changed/.test(n)));
    assert.equal(GameView.current.repairVisible, true);
  } finally { app.dispose(); f.restore(); }
});

test("SIM-1b R1-F5: a game save's success resolves its own failure notice, never the play timeline's", () => {
  const p = new EncounterPresentation();
  p.notify("The play timeline is kept in memory only.", true, { channel: "persistence", context: "timeline" }, 0);
  p.notify("Saved locally", false, { channel: "persistence" }, 1);
  assert.equal(p.central?.message, "The play timeline is kept in memory only.");
  p.notify("Saving failed.", true, { channel: "persistence" }, 2);
  assert.equal(p.status?.message, "The play timeline is kept in memory only.", "the displaced timeline warning stays readable");
  p.notify("Saved locally", false, { channel: "persistence" }, 3);
  assert.equal(p.central, null, "a game save's own failure is resolved");
  assert.equal(p.status?.message, "The play timeline is kept in memory only.", "the timeline's is not");
});

const TIMELINE_WARNING = { channel: "persistence", context: "timeline" } as const;
const PLUME = { channel: "hazard", context: "ecology" } as const;
const PLUME_CAPTION = "Ember mites are leaving the chimney lip. The plume vents within seconds; stay clear of the column.";

for (const order of ["warning first", "hazard first"] as const)
  test(`SIM-1b R2-F3: a timeline warning never suppresses an urgent hazard caption (${order}); both stay readable`, () => {
    const p = new EncounterPresentation();
    const warn = (now: number) => p.notify("The play timeline is in memory only for now.", true, TIMELINE_WARNING, now);
    const plume = (now: number) => p.notify(PLUME_CAPTION, false, PLUME, now);
    if (order === "warning first") { warn(0); plume(1); } else { plume(0); warn(1); }
    assert.equal(p.central?.message, PLUME_CAPTION);
    assert.equal(p.status?.message, "The play timeline is in memory only for now.");
    assert.equal(p.status?.error, true);
    // A routine confirmation doesn't push the warning off the status line; expiry does.
    p.notify("Exported.", false, { channel: "system" }, 2);
    assert.equal(p.status?.message, "The play timeline is in memory only for now.");
    p.expire(1 + NOTICE_SECONDS.error * 1000);
    assert.equal(p.status, null);
  });

for (const order of ["timeline first", "game save first"] as const)
  test(`SIM-1b R2-F3: game-save and timeline warnings are both readable (${order}); each success resolves only its own`, () => {
    const p = new EncounterPresentation();
    const game = (now: number) => p.notify("Game progress could not be saved. Export save before closing.", true, { channel: "persistence" }, now);
    const timeline = (now: number) => p.notify("The play timeline couldn't be saved.", true, TIMELINE_WARNING, now);
    if (order === "timeline first") { timeline(0); game(1); } else { game(0); timeline(1); }
    assert.equal(p.central?.message, "Game progress could not be saved. Export save before closing.");
    assert.equal(p.status?.message, "The play timeline couldn't be saved.");
    // R2-F4: the timeline's success resolves the timeline warning only.
    p.notify("The play timeline is saved again.", false, TIMELINE_WARNING, 2);
    assert.equal(p.central?.message, "Game progress could not be saved. Export save before closing.");
    assert.equal(p.status?.message, "The play timeline is saved again.");
    p.notify("Saved locally", false, { channel: "persistence" }, 3);
    assert.equal(p.central, null);
  });

test("SIM-1b R2-F4: a timeline success resolves its central failure warning, by context, not by wording", () => {
  const p = new EncounterPresentation();
  p.notify("The play timeline is in memory only for now.", true, TIMELINE_WARNING, 0);
  p.notify("Note saved to the play timeline.", false, { channel: "system" }, 1);
  assert.equal(p.central?.message, "The play timeline is in memory only for now.", "a system notice resolves nothing");
  p.notify("Note saved to the play timeline.", false, TIMELINE_WARNING, 2);
  assert.equal(p.central, null);
  assert.equal(p.status?.message, "Note saved to the play timeline.");
});

/** Steps the app at the chimney lip until the live ecology cue is delivered. */
function plumeCue(f: ReturnType<typeof browserFixture>, app: AppSeams, hud: ReturnType<typeof realHud>): void {
  const s = app.state;
  if (s.opening.phase < 4) completeOpening(s);
  s.player.pose.position = { ...cueHome("rift_mites_lip") };
  let t = s.tick + 1;
  while (!(miteScatter(t).scatter >= 0.5 && miteScatter(t - 1).scatter < 0.5)) t++;
  s.tick = t - 4;
  for (let i = 0; i < 30 && hud.presentation.central?.context !== "ecology"; i++) f.frames(1);
  assert.equal(hud.presentation.central?.message, PLUME_CAPTION, "the live cue is delivered");
}

for (const order of ["warning first", "cue first"] as const)
  test(`SIM-1b R2-F3/F4: the live chimney-lip cue and a timeline warning in the app (${order}); a later commit resolves the warning`, async () => {
    const f = browserFixture();
    const hud = realHud();
    const app = await newGame(f);
    try {
      const fail = async () => {
        const write = f.storage.setItem.bind(f.storage);
        f.storage.setItem = (k: string, v: string) => { if (k === TIMELINE_JOURNAL_KEY) throw new DOMException("full", "QuotaExceededError"); write(k, v); };
        await saveTimeline(app);
        f.storage.setItem = write;
      };
      if (order === "warning first") { await fail(); plumeCue(f, app, hud); } else { plumeCue(f, app, hud); await fail(); }
      assert.equal(hud.presentation.central?.message, PLUME_CAPTION);
      assert.match(hud.presentation.status?.message ?? "", /play timeline couldn't be saved.*in memory only for now/);
      await saveTimeline(app);
      assert.equal(hud.presentation.central?.message, PLUME_CAPTION, "the hazard is untouched");
      assert.equal(hud.presentation.status?.message, "The play timeline is saved again.");
    } finally { hud.restore(); app.dispose(); f.restore(); }
  });

test("SIM-1b R2-F4: a successful repair resolves the protection warning in the app", async () => {
  const f = browserFixture();
  withDownloads(f);
  f.storage.setItem(TIMELINE_JOURNAL_KEY, "{bad");
  const hud = realHud();
  const app = await newGame(f);
  try {
    assert.match(hud.presentation.central?.message ?? "", /play-timeline store can't be read/);
    GameView.current.actions.repairTimeline();
    GameView.current.actions.confirm(); await settled();
    assert.equal(app.live.protected, false);
    assert.equal(hud.presentation.central, null, "the obsolete warning is resolved");
    assert.equal(hud.presentation.status?.message, "The local play-timeline store was replaced. This expedition's timeline is saved again.");
  } finally { hud.restore(); app.dispose(); f.restore(); }
});
