import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// The remote lane's receipt grammar (SCHED-2b R2-F1, scripts/heavy/remote.mjs
// parseReceipt): every line carries the attempt's nonce, and the phases come
// once each, in one order. Anything else is invalid and binds nothing.
const R = await import(pathToFileURL(resolve("scripts/heavy/remote.mjs")).href);

const N = "0123456789abcdef0123456789abcdef", OTHER = "fedcba9876543210fedcba9876543210";
const SHA = "a".repeat(40);
const lines = (...xs: string[]) => xs.map((x) => `${N} ${x}\n`).join("");
const full = ["admitted 1792757191", `sha ${SHA}`, "setup ok clean", "started", "lane staged pack", "lane stage done", `after ${SHA} clean`, "exit 0"];

test("a complete receipt is valid and says what happened", () => {
  const rc = R.parseReceipt(lines(...full), N);
  assert.deepEqual([rc.valid, rc.complete, rc.admitted, rc.sha, rc.setup, rc.dirtyAtAdmit, rc.started, rc.exit], [true, true, true, SHA, "ok", "clean", true, 0]);
  assert.deepEqual(rc.after, { head: SHA, clean: true, changed: 0 });
  assert.deepEqual([rc.staged, rc.stageDone], [["pack"], true]);
  // Every prefix of it is valid and incomplete (the job is still running).
  for (let i = 1; i < full.length; i++) {
    const p = R.parseReceipt(lines(...full.slice(0, i)), N);
    assert.deepEqual([p.valid, p.complete], [true, false], full.slice(0, i).join(" | "));
  }
  assert.deepEqual([R.parseReceipt("", N).valid, R.parseReceipt("", N).admitted], [true, false]);
});

test("single-line endings: busy, abandoned, a setup failure; a restored and a changed tree", () => {
  for (const x of ["busy", "abandoned"]) {
    const rc = R.parseReceipt(lines(x), N);
    assert.deepEqual([rc.valid, rc.complete, rc.admitted, rc[x]], [true, true, false, true]);
  }
  const f = R.parseReceipt(lines("admitted 1", `sha ${SHA}`, "setup failed npm-ci 1"), N);
  assert.deepEqual([f.valid, f.complete, f.setup, f.setupFailed], [true, true, "failed", { step: "npm-ci", code: 1 }]);
  const r = R.parseReceipt(lines("admitted 1", `sha ${SHA}`, "setup ok restored:3", "started", `after ${"b".repeat(40)} changed:2`, "exit 7"), N);
  assert.deepEqual([r.valid, r.dirtyAtAdmit, r.after, r.exit], [true, "restored:3", { head: "b".repeat(40), clean: false, changed: 2 }, 7]);
});

test("contradictions, gaps, other nonces and truncation are invalid", () => {
  const bad: [string, string, RegExp][] = [
    // The reviewer's setup-write case: a success record, then the transport's genuine setup failure.
    ["started then setup failed", lines(...full, "setup failed npm-ci 1"), /"setup-failed" after "exit"/],
    ["setup failed after started", lines("admitted 1", `sha ${SHA}`, "setup ok clean", "started", "setup failed npm-ci 1"), /"setup-failed" after "started"/],
    ["a second exit", lines(...full, "exit 0"), /"exit" after "exit"/],
    ["a repeated admission", lines("admitted 1", "admitted 2"), /"admitted" after "admitted"/],
    ["started without setup", lines("admitted 1", `sha ${SHA}`, "started"), /"started" after "sha"/],
    ["exit without the tree check", lines("admitted 1", `sha ${SHA}`, "setup ok clean", "started", "exit 0"), /"exit" after "started"/],
    ["a lane line before started", lines("admitted 1", "lane staged x"), /"lane" after "admitted"/],
    ["work after busy", lines("busy", "admitted 1"), /"admitted" after "busy"/],
    ["no nonce", "admitted 1\nsha " + SHA + "\n", /line 1 does not carry this attempt's nonce/],
    ["a stale attempt's nonce", full.map((x) => `${OTHER} ${x}\n`).join(""), /line 1 does not carry/],
    ["one foreign line in the middle", lines(...full.slice(0, 3)) + `${OTHER} started\n` + lines(...full.slice(4)), /line 4 does not carry/],
    ["an unterminated exit", lines(...full).slice(0, -1), /unterminated/],
    ["a truncated line", lines(...full.slice(0, 2)) + `${N} setup o\n`, /line 3 is not a receipt phase/],
    ["a malformed sha", lines("admitted 1", "sha 1234"), /line 2 is not a receipt phase/],
    ["a malformed exit", lines(...full.slice(0, -1), "exit zero"), /is not a receipt phase/],
    ["an unknown phase", lines("admitted 1", "hello"), /line 2 is not a receipt phase/],
  ];
  for (const [what, text, why] of bad) {
    const rc = R.parseReceipt(text, N);
    assert.equal(rc.valid, false, what);
    assert.match(rc.problem, why, what);
  }
  assert.equal(R.parseReceipt(lines(...full), undefined).valid, false, "no nonce to check against");
});
