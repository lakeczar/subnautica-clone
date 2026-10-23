import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// heavy-check v2 admission policy (scripts/heavy/policy.mjs), pure: classes,
// pools, the express slot, aging, head reservation, exclusive drain, one job
// per worktree, impossible requests, coalescing and the serial switch. The
// systemd and process behaviour is covered by scripts/heavy/acceptance.test.mjs.
const P = await import(pathToFileURL(resolve("scripts/heavy/policy.mjs")).href);

const MIN = 60000;
const cfg = P.DEFAULTS;
const idle = (over: object = {}) => ({ nproc: 6, memAvailableMiB: 12000, memFullAvg10: 0, charges: {}, legacy: { holder: false, waiter: false }, ...over });
let seq = 0;
type Ticket = { id: string; seq: number; worktree: string; state: string; submittedAt: number; express?: boolean | undefined; req: { class: string; tokens: number; memMiB: number; gpu: boolean; exclusive: boolean; basePriority: number } };
function ticket(id: string, cls: string, opts: { at?: number; state?: string; review?: boolean; worktree?: string; express?: boolean; mode?: string; cpus?: number; memMiB?: number } = {}): Ticket {
  const req = P.resolveRequest({ class: cls, review: opts.review, cpus: opts.cpus, memMiB: opts.memMiB }, { T: 4, M: cfg.poolMiB, mode: opts.mode ?? "normal" });
  assert.equal(req.error, undefined, req.error);
  return { id, seq: ++seq, worktree: opts.worktree ?? `wt-${id}`, state: opts.state ?? "queued", submittedAt: opts.at ?? 0, express: opts.express, req };
}
const stateOf = (...ts: Ticket[]) => ({ tickets: Object.fromEntries(ts.map((t) => [t.id, t])) });
const admitted = (p: { admit: { id: string; express: boolean }[] }) => p.admit.map((a) => a.id + (a.express ? "*" : ""));

test("tokens follow nproc − 2, so 6 vCPU gives 4 and 8 vCPU gives 6 with no redeploy", () => {
  assert.equal(P.tokensFor(6), 4);
  assert.equal(P.tokensFor(8), 6);
  assert.equal(P.tokensFor(2), 1);
  const at8 = P.resolveRequest({ class: "heavy-suite" }, { T: 6, M: 6144 });
  const at6 = P.resolveRequest({ class: "heavy-suite" }, { T: 4, M: 6144 });
  assert.deepEqual([at6.tokens, at8.tokens], [2, 3]);
  assert.deepEqual(P.sliceLimits(8), { cpuQuotaPct: 700, memoryMaxMiB: 8192 });
  assert.deepEqual(P.sliceLimits(6), { cpuQuotaPct: 500, memoryMaxMiB: 8192 });
});

test("class reservations match the decision's table", () => {
  const r = (c: string) => { const x = P.resolveRequest({ class: c }, { T: 4, M: 6144 }); return [x.tokens, x.memMiB, x.gpu, x.deadline, x.basePriority]; };
  assert.deepEqual(r("quick"), [1, 2048, false, 600, 1]);
  assert.deepEqual(r("standard"), [2, 3072, false, 1200, 2]);
  assert.deepEqual(r("heavy-suite"), [2, 3072, false, 1500, 2]);
  assert.deepEqual(r("gpu"), [2, 3072, true, 1500, 2]);
  assert.deepEqual(r("playthrough"), [2, 2048, false, 1800, 3]);
  assert.deepEqual(r("bake"), [2, 3072, false, 900, 2]);
  assert.deepEqual(r("exclusive"), [4, 6144, true, 1800, 3]);
  assert.equal(P.resolveRequest({ class: "quick", review: true }, { T: 4, M: 6144 }).basePriority, 0);
});

test("the heavy suite's inner pool sizes from its grant (TT-1 reads these), so it is limited once", () => {
  const req = P.resolveRequest({ class: "heavy-suite" }, { T: 4, M: 6144 });
  const env = P.jobEnv({ id: "t1" }, req);
  assert.equal(env.SILTWAKE_HEAVY_CONCURRENCY, "2");
  assert.equal(env.SILTWAKE_HEAVY_POOL_MIB, "2560"); // 3 GiB scope − 512 MiB for the runner
  assert.equal(env.SILTWAKE_JOB_CPUS, "2");
  assert.equal(env.BAKE_WORKERS, "2");
  assert.equal(env.SILTWAKE_HEAVY_LOCK_HELD, "1");
  assert.equal(env.SILTWAKE_GPU_LEASE, undefined);
  const burst = P.resolveRequest({ class: "heavy-suite", cpus: 3, memMiB: 5120 }, { T: 4, M: 6144 });
  assert.equal(P.jobEnv({ id: "t2" }, burst).SILTWAKE_HEAVY_POOL_MIB, "4608"); // TT-1's own 4.5 GiB pool
  assert.equal(P.jobEnv({ id: "g" }, P.resolveRequest({ class: "gpu" }, { T: 4, M: 6144 })).SILTWAKE_GPU_LEASE, "g");
  // Serial mode is v1: the job sees only the v1 variables and TT-1's defaults apply.
  const serial = P.jobEnv({ id: "s" }, P.resolveRequest({ class: "heavy-suite" }, { T: 4, M: 6144, mode: "serial" }));
  assert.equal(serial.SILTWAKE_HEAVY_CONCURRENCY, undefined);
  assert.equal(serial.SILTWAKE_HEAVY_LOCK_HELD, "1");
});

test("requests that can never fit are refused at once, not queued forever", () => {
  const T = 4, M = 6144;
  assert.match(P.resolveRequest({ class: "standard", memMiB: 9216 }, { T, M }).error, /over standard's maximum/);
  assert.match(P.resolveRequest({ class: "playthrough", memMiB: 4096 }, { T, M }).error, /maximum of 3072/);
  assert.match(P.resolveRequest({ class: "quick", cpus: 2 }, { T, M }).error, /maximum of 1/);
  assert.match(P.resolveRequest({ class: "standard", cpus: 5 }, { T, M }).error, /maximum of 4/);
  assert.match(P.resolveRequest({ class: "nope" }, { T, M }).error, /unknown class/);
  const clamped = P.resolveRequest({ class: "standard", deadline: 1740 }, { T, M });
  assert.equal(clamped.deadline, 1200);
  assert.match(clamped.notes[0], /clamped/);
});

test("known commands get their class; anything else is standard", () => {
  assert.equal(P.classifyCommand(["npm", "run", "-s", "playthrough", "--", "--jobs", "2"]), "playthrough");
  assert.equal(P.classifyCommand(["node", "scripts/test-tier.mjs", "heavy"]), "heavy-suite");
  assert.equal(P.classifyCommand(["node", "scripts/bake-terrain.mjs", "--verify"]), "bake");
  assert.equal(P.classifyCommand(["node", "tools/large-cave-lab.bake.mjs"]), "exclusive");
  assert.equal(P.classifyCommand(["node", "--test", ".test-build/tests/x.heavy.test.js"]), "standard");
  assert.equal(P.parseMiB("3G"), 3072);
  assert.equal(P.parseMiB("512M"), 512);
  assert.equal(P.parseMiB("2048"), 2048);
  assert.ok(Number.isNaN(P.parseMiB("lots")));
});

test("1: two quick jobs start together", () => {
  const p = P.plan(stateOf(ticket("a", "quick"), ticket("b", "quick")), 0, idle(), cfg);
  assert.deepEqual(admitted(p), ["a", "b"]);
});

test("2: a GPU job does not block a CPU job; a second GPU job waits for the GPU", () => {
  const gpu = ticket("g", "gpu", { state: "running" });
  const p = P.plan(stateOf(gpu, ticket("p", "playthrough", { at: 1 }), ticket("g2", "gpu", { at: 2 })), 10, idle(), cfg);
  assert.deepEqual(admitted(p), ["p"]);
  assert.equal(p.blocked.g2, "gpu"); // ahead of the playthrough (priority 2 vs 3), but the GPU is leased
  const p2 = P.plan(stateOf(gpu, ticket("g2", "gpu", { at: 2 })), 10, idle(), cfg);
  assert.equal(p2.blocked.g2, "gpu");
});

test("3: a review quick jumps a queued playthrough, and takes the express slot while the pool is full", () => {
  const full = [ticket("x", "standard", { state: "running" }), ticket("y", "standard", { state: "running" })];
  const queued = [ticket("P", "playthrough", { at: 0 }), ticket("R", "quick", { at: 1000, review: true })];
  assert.deepEqual(P.plan(stateOf(...full, ...queued), 2000, idle(), cfg).order, ["R", "P"]);
  assert.deepEqual(admitted(P.plan(stateOf(...full, ...queued), 2000, idle(), cfg)), ["R*"]);
  // With the express slot busy, when 2 tokens free R still starts before P.
  const ex = ticket("e", "quick", { state: "running", express: true });
  const p = P.plan(stateOf(full[0]!, ex, ...queued), 2000, idle(), cfg);
  assert.deepEqual(admitted(p), ["R"]);
  assert.equal(p.blocked.P, "cpu");
});

test("4: no starvation: a playthrough under a steady stream of review quicks starts within 10 min + the longest running deadline", () => {
  // Simulate a minute-by-minute clock. A review quick arrives every minute and
  // runs 3 minutes; the pool is otherwise idle. Quicks need 1 token, so 3 of them
  // plus the express slot leave the playthrough's 2 tokens rarely free.
  const tickets: Record<string, Ticket> = {};
  const P0 = ticket("P", "playthrough", { at: 0 });
  tickets.P = P0;
  const ends: Record<string, number> = {};
  for (let k = 0; k < 4; k++) { tickets[`busy${k}`] = ticket(`busy${k}`, "quick", { state: "running" }); ends[`busy${k}`] = 3 * MIN; }
  let started: number | null = null;
  for (let m = 0; m <= 60 && started == null; m++) {
    const now = m * MIN;
    for (const [id, end] of Object.entries(ends)) if (end <= now) { delete tickets[id]; delete ends[id]; }
    for (let k = 0; k < 2; k++) tickets[`r${m}-${k}`] = ticket(`r${m}-${k}`, "quick", { at: now, review: true });
    const p = P.plan({ tickets }, now, idle(), cfg);
    for (const a of p.admit) {
      Object.assign(tickets[a.id]!, { state: "running", express: a.express });
      if (a.id === "P") started = m;
      else ends[a.id] = now + 3 * MIN;
    }
  }
  assert.ok(started != null, "the playthrough never started");
  assert.ok(started <= 10 + 10, `started at minute ${started}`); // quick's 10-minute maximum run
  assert.ok(started >= 10, `started at minute ${started}: before the reservation, the reviews should win`);
});

test("5: memory refuses overcommit, and the host brake holds when MemAvailable is low", () => {
  const running = [ticket("a", "standard", { state: "running" }), ticket("b", "playthrough", { state: "running", cpus: 1 })];
  const big = ticket("c", "quick", { memMiB: 2048 });
  // 3 + 2 GiB reserved of 6: a 2 GiB pool request does not fit (and the express slot is busy).
  const p = P.plan(stateOf(...running, ticket("e", "quick", { state: "running", express: true }), big), 0, idle({ nproc: 8 }), cfg);
  assert.equal(p.blocked.c, "memory");
  const low = P.plan(stateOf(ticket("d", "quick")), 0, idle({ memAvailableMiB: 3072 }), cfg);
  assert.equal(low.blocked.d, "host-memory");
  const pressure = P.plan(stateOf(ticket("d", "quick")), 0, idle({ memFullAvg10: 2.5 }), cfg);
  assert.equal(pressure.blocked.d, "host-memory");
  // Running jobs' unused reservations count against MemAvailable.
  const growing = P.plan(stateOf(ticket("a", "standard", { state: "running" }), ticket("d", "quick")), 0,
    idle({ memAvailableMiB: 6000, charges: { a: 500 } }), cfg);
  assert.equal(growing.blocked.d, "host-memory"); // 6000 − 2572 − 2048 < 2048
});

test("7: an exclusive job at the head drains the lane, express included, and runs alone", () => {
  const r1 = ticket("r1", "standard", { state: "running" }), r2 = ticket("r2", "quick", { state: "running", express: true });
  // X (a review measurement, base 2) has aged one level; q (quick, base 1) came later: X is the head.
  const X = ticket("X", "exclusive", { at: 0, review: true });
  const q = ticket("q", "quick", { at: 5 * MIN - 1000 });
  const draining = P.plan(stateOf(r1, r2, X, q), 5 * MIN, idle(), cfg);
  assert.deepEqual(draining.order, ["X", "q"]);
  assert.deepEqual(admitted(draining), []);
  assert.equal(draining.blocked.X, "lane");
  assert.equal(draining.blocked.q, "exclusive");
  const empty = P.plan(stateOf(X, q), 5 * MIN, idle(), cfg);
  assert.deepEqual(admitted(empty), ["X"]);
  X.state = "running";
  const beside = P.plan(stateOf(X, q), 5 * MIN, idle(), cfg);
  assert.deepEqual(admitted(beside), []);
  assert.equal(beside.blocked.q, "exclusive");
});

test("an exclusive job that is not yet at the head waits its turn without draining", () => {
  const X = ticket("X", "exclusive", { at: 0 }); // base 3
  const q = ticket("q", "quick", { at: 1 }); // base 1, so ahead
  const p = P.plan(stateOf(ticket("r", "standard", { state: "running" }), X, q), 2, idle(), cfg);
  assert.deepEqual(admitted(p), ["q"]);
  assert.equal(p.blocked.X, "lane");
});

test("14: one running job per worktree; a reviewer's worktree is separate", () => {
  const author = ticket("a", "standard", { state: "running", worktree: "builder" });
  const p = P.plan(stateOf(author, ticket("a2", "quick", { at: 1, worktree: "builder" }), ticket("rev", "quick", { at: 2, review: true, worktree: "reviewer" })), 3, idle(), cfg);
  assert.deepEqual(admitted(p), ["rev"]);
  assert.equal(p.blocked.a2, "worktree");
  // Two queued from one worktree: only the first starts.
  const p2 = P.plan(stateOf(ticket("b1", "quick", { at: 1, worktree: "w" }), ticket("b2", "quick", { at: 2, worktree: "w" })), 3, idle(), cfg);
  assert.deepEqual(admitted(p2), ["b1"]);
  assert.equal(p2.blocked.b2, "worktree");
});

test("aging: a waiting job gains one level per 5 minutes; equal priorities run in arrival order", () => {
  const P1 = ticket("P", "playthrough", { at: 0 });
  assert.equal(P.effectivePriority(P1, 4 * MIN, cfg), 3);
  assert.equal(P.effectivePriority(P1, 5 * MIN, cfg), 2);
  assert.equal(P.effectivePriority(P1, 15 * MIN, cfg), 0);
  const p = P.plan(stateOf(ticket("x", "standard", { state: "running" }), ticket("y", "standard", { state: "running" }),
    P1, ticket("s", "standard", { at: 5 * MIN })), 5 * MIN, idle(), cfg);
  assert.deepEqual(p.order, ["P", "s"]);
});

test("head reservation: after 10 minutes nothing else starts from the pools, but the express slot still does", () => {
  const big = ticket("big", "standard", { at: 0 });
  const r = ticket("r", "gpu", { state: "running" }), s = ticket("s", "standard", { state: "running", cpus: 1, memMiB: 1024 });
  const small = ticket("small", "quick", { at: 9 * MIN });
  const before = P.plan(stateOf(r, s, big, small), 9.5 * MIN, idle(), cfg);
  assert.deepEqual(admitted(before), ["small"]); // backfill
  const after = P.plan(stateOf(r, s, big, small, ticket("small2", "quick", { at: 9 * MIN })), 10 * MIN, idle(), cfg);
  assert.deepEqual(admitted(after), ["small*"]);
  assert.equal(after.blocked.small2, "head");
  assert.equal(after.blocked.big, "cpu");
});

test("12 (policy half): a v1 holder or waiter on the old lock pauses every v2 admission", () => {
  for (const legacy of [{ holder: true, waiter: false }, { holder: false, waiter: true }]) {
    const p = P.plan(stateOf(ticket("q", "quick")), 0, idle({ legacy }), cfg);
    assert.deepEqual(admitted(p), []);
    assert.equal(p.blocked.q, "legacy");
  }
});

test("15 (policy half): serial mode makes every request exclusive, so jobs run one at a time", () => {
  const a = ticket("a", "quick", { mode: "serial", at: 0 }), b = ticket("b", "quick", { mode: "serial", at: 1 });
  assert.equal(a.req.exclusive, true);
  assert.equal(a.req.memMiB, 6144);
  const p = P.plan(stateOf(a, b), 2, idle(), cfg);
  assert.deepEqual(admitted(p), ["a"]);
  a.state = "running";
  assert.deepEqual(admitted(P.plan(stateOf(a, b), 3, idle(), cfg)), []);
});

test("coalescing key: same command, worktree, tree and request; a changed tree is new work", () => {
  const base = { worktree: "/w", cwd: "/w", argv: ["npm", "run", "test:heavy"], class: "heavy-suite", head: "abc", dirty: "clean" };
  assert.equal(P.coalesceKey(base), P.coalesceKey({ ...base }));
  assert.notEqual(P.coalesceKey(base), P.coalesceKey({ ...base, dirty: "123" }));
  assert.notEqual(P.coalesceKey(base), P.coalesceKey({ ...base, review: true }));
});
