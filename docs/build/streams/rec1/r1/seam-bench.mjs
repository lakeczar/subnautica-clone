// REC-1: the per-step timeline read before (recordTimeline with an index into timeline.events)
// and after (TimelineReader.read through the cursor seam), per call.
const [oldDir, newDir] = process.argv.slice(2);
const load = async (d) => ({ game: await import(`${d}/src/runtime/flight/game.js`), Rec: (await import(`${d}/src/runtime/flight/recorder.js`)).FlightRecorder,
  tl: await import(`${d}/src/sim/timeline/recorder.js`), state: await import(`${d}/src/sim/state.js`) });
const builds = { old: await load(oldDir), new: await load(newDir) };
const rounds = 7, out = {};
for (const caseName of ["nothing new", "one new entry every 30 calls"]) {
  for (const [name, b] of Object.entries(builds)) {
    const times = [];
    for (let round = 0; round < rounds; round++) {
      const rec = new b.Rec(), s = b.state.createGame(), t = b.tl.createRecorder({ id: "b", started: "" });
      for (let i = 0; i < 500; i++) b.tl.recordEvent(t, s, { kind: "gather", id: "x" });
      let cursor = t.events.length;
      const reader = name === "new" ? new b.game.TimelineReader() : null;
      reader?.start(t);
      const every = caseName === "nothing new" ? 0 : 30;
      // Within the timeline's 20,000-entry cap: 500 + 500,000 / 30.
      const N = every ? 500_000 : 2_000_000;
      const t0 = process.hrtime.bigint();
      for (let i = 0; i < N; i++) {
        if (every && i % every === 0) b.tl.recordEvent(t, s, { kind: "gather", id: "x" });
        if (reader) reader.read(rec, t); else cursor = b.game.recordTimeline(rec, t.events, cursor);
      }
      times.push(Number(process.hrtime.bigint() - t0) / N);
      if (every && rec.events.since(0).items.length === 0) throw new Error(`${name}: nothing was recorded`);
    }
    times.sort((a, b) => a - b);
    out[`${caseName} / ${name}`] = { medianNs: +times[3].toFixed(1), minNs: +times[0].toFixed(1), maxNs: +times[6].toFixed(1) };
  }
}
console.log(JSON.stringify(out, null, 1));
