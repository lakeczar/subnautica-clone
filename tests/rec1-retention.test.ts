import test from "node:test";
import assert from "node:assert/strict";
import { budgetFor, DEFAULT_BUDGET_BYTES, MIN_VIDEO_BUDGET_BYTES, planRetention, videoAllowed, type StoredFile } from "../src/runtime/flight/retention.js";

// REC-1 R1-S2: the default playtest records within one storage budget, the
// current recording included. An accelerated session drives the same policy
// the capture applies after every flush.
const MiB = 1048576;

/** Two hours at 900 kbit/s in 10-minute segments, telemetry and pictures growing alongside, older recordings on disk. */
function session(budget: number, older: StoredFile[] = []) {
  let disk: StoredFile[] = [...older];
  const removed: { file: string | null; session: string; why: string }[] = [];
  let peak = 0;
  const videoPerMinute = (900_000 / 8) * 60;
  for (let minute = 1; minute <= 120; minute++) {
    const seg = `video/${String(Math.floor((minute - 1) / 10)).padStart(3, "0")}.webm`;
    const add = (file: string, kind: StoredFile["kind"], bytes: number) => {
      const f = disk.find((x) => x.session === "now" && x.file === file);
      if (f) f.bytes += bytes; else disk.push({ session: "now", file, kind, bytes });
    };
    add(seg, "video", videoPerMinute);
    add("frames.ndjson", "telemetry", 60 * 60 * 100);
    add("events.ndjson", "telemetry", 20_000);
    add(`snapshots/${String(minute).padStart(5, "0")}.jpg`, "snapshot", 25_000);
    const plan = planRetention(disk, "now", [seg, "frames.ndjson", "events.ndjson"], budget);
    for (const r of plan.remove) {
      removed.push(r);
      disk = disk.filter((f) => !(f.session === r.session && (r.file === null || f.file === r.file)));
    }
    const total = disk.reduce((a, f) => a + f.bytes, 0);
    peak = Math.max(peak, total);
    assert.ok(disk.some((f) => f.file === seg), `minute ${minute}: the segment being written is never removed`);
    assert.ok(disk.some((f) => f.file === "frames.ndjson"), `minute ${minute}: telemetry is kept`);
  }
  return { disk, removed, peak };
}

test("an accelerated two-hour session stays within the budget: oldest video goes first, the live segment and telemetry stay", () => {
  const budget = 300 * MiB;
  const { disk, removed, peak } = session(budget);
  assert.ok(peak <= budget + 10 * MiB, `peak ${Math.round(peak / MiB)} MiB within a budget of 300 MiB plus one minute's growth`);
  assert.ok(removed.length > 0, "two hours of video exceed it, so some went");
  const goneVideo = removed.filter((r) => r.file?.startsWith("video/")).map((r) => r.file);
  assert.deepEqual(goneVideo, [...goneVideo].sort(), "oldest segments first");
  assert.ok(disk.filter((f) => f.kind === "video").length >= 2, "the newest video is kept");
  assert.ok(removed.every((r) => r.why.length > 0), "every removal says why");
});

test("older recordings give way before the current one: their video, then the recordings themselves", () => {
  const older: StoredFile[] = [
    { session: "a", file: "video/000.webm", kind: "video", bytes: 200 * MiB },
    { session: "a", file: "frames.ndjson", kind: "telemetry", bytes: 5 * MiB },
    { session: "b", file: "video/000.webm", kind: "video", bytes: 200 * MiB },
    { session: "b", file: "frames.ndjson", kind: "telemetry", bytes: 5 * MiB },
  ];
  const { removed } = session(600 * MiB, older);
  const order = removed.map((r) => `${r.session}:${r.file ?? "*"}`);
  assert.equal(order[0], "a:video/000.webm");
  assert.equal(order[1], "b:video/000.webm");
  const firstCurrent = order.findIndex((x) => x.startsWith("now:"));
  assert.ok(firstCurrent > order.indexOf("b:video/000.webm"), "the current recording's video only after the older recordings' video");
});

test("a low quota: the budget is a share of it, and below the video minimum there is no video", () => {
  assert.equal(budgetFor(undefined), DEFAULT_BUDGET_BYTES);
  assert.equal(budgetFor(10 * 1024 * MiB), DEFAULT_BUDGET_BYTES, "a large quota: the default budget");
  const low = budgetFor(100 * MiB);
  assert.equal(low, 50 * MiB);
  assert.deepEqual(videoAllowed("playtest", true, low).ok, false);
  assert.match(videoAllowed("playtest", true, low).why!, /no room for video/);
  assert.equal(videoAllowed("playtest", true, MIN_VIDEO_BUDGET_BYTES).ok, true);
  // Telemetry alone over a tiny budget: the plan says it is still over, and the capture stops the video.
  const plan = planRetention([{ session: "now", file: "frames.ndjson", kind: "telemetry", bytes: 2 * MiB }], "now", ["frames.ndjson"], MiB);
  assert.equal(plan.overAfter, true);
  assert.equal(plan.remove.length, 0, "telemetry is never removed by the plan");
});

test("no private file storage: no video in a playtest (it could not be bounded); a driver's in-memory video is capped by the capture", () => {
  const v = videoAllowed("playtest", false, DEFAULT_BUDGET_BYTES);
  assert.equal(v.ok, false);
  assert.match(v.why!, /no private file storage/);
  assert.equal(videoAllowed("driver", false, DEFAULT_BUDGET_BYTES).ok, true);
});
