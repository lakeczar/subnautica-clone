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
type Ticket = { id: string; seq: number; worktree: string; state: string; submittedAt: number; express?: boolean | undefined; req: { class: string; tokens: number; memMiB: number; gpu: boolean; exclusive: boolean; basePriority: number }; goal: { soak: boolean } };
function ticket(id: string, cls: string, opts: { at?: number; state?: string; review?: boolean; worktree?: string; express?: boolean; mode?: string; cpus?: number; memMiB?: number; gpu?: boolean } = {}): Ticket {
  const { goal, ...req } = P.resolveRequest({ class: cls, review: opts.review, cpus: opts.cpus, memMiB: opts.memMiB, gpu: opts.gpu }, { T: 4, M: cfg.poolMiB, mode: opts.mode ?? "normal" });
  assert.equal(req.error, undefined, req.error);
  // As the supervisor stores it: the goal beside req, not in it.
  return { id, seq: ++seq, worktree: opts.worktree ?? `wt-${id}`, state: opts.state ?? "queued", submittedAt: opts.at ?? 0, express: opts.express, req, goal };
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

test("class reservations, runaway ceilings and stall windows match the SCHED-2 table", () => {
  const r = (c: string) => { const x = P.resolveRequest({ class: c }, { T: 4, M: 6144 }); return [x.tokens, x.memMiB, x.gpu, x.goal.limitS, x.goal.stallS, x.basePriority]; };
  const H = 3600;
  assert.deepEqual(r("quick"), [1, 2048, false, 2 * H, 600, 1]);
  assert.deepEqual(r("standard"), [2, 3072, false, 4 * H, 900, 2]);
  assert.deepEqual(r("heavy-suite"), [2, 3072, false, 4 * H, 900, 2]);
  assert.deepEqual(r("gpu"), [2, 3072, true, 4 * H, 900, 2]);
  assert.deepEqual(r("playthrough"), [2, 2048, false, 6 * H, 900, 3]);
  assert.deepEqual(r("bake"), [2, 3072, false, 2 * H, 900, 2]);
  assert.deepEqual(r("soak"), [1, 3072, false, 6 * H, 900, 9]);
  assert.deepEqual(r("exclusive"), [4, 6144, true, 1800, 600, 3]); // the one real cap: it blocks everything
  const g = P.resolveRequest({ class: "standard" }, { T: 4, M: 6144 }).goal;
  assert.equal(g.explicitDeadline, false);
  assert.equal(P.resolveRequest({ class: "soak", gpu: true }, { T: 4, M: 6144 }).gpu, true);
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
  const chosen = P.resolveRequest({ class: "standard", deadline: 1740 }, { T, M });
  assert.deepEqual([chosen.goal.limitS, chosen.goal.explicitDeadline, chosen.notes.length], [1740, true, 0]); // the caller's own limit
  const clamped = P.resolveRequest({ class: "standard", deadline: 20000 }, { T, M });
  assert.equal(clamped.goal.limitS, 14400);
  assert.match(clamped.notes[0], /clamped to standard's runaway ceiling/);
  assert.match(P.resolveRequest({ class: "exclusive", deadline: 3600 }, { T, M }).notes[0], /cap 1800s/);
  assert.match(P.resolveRequest({ class: "standard", stallS: 30 }, { T, M }).error, /--stall/);
  assert.equal(P.resolveRequest({ class: "standard", stallS: 30 }, { T, M, minStallS: 5 }).goal.stallS, 30);
  assert.equal(P.resolveRequest({ class: "standard", stallS: 900, deadline: 600 }, { T, M }).goal.stallS, 600);
  assert.match(P.resolveRequest({ class: "standard", gpu: true }, { T, M }).error, /--gpu is for --class soak/);
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
  assert.ok(started <= 10 + 3, `started at minute ${started}`); // the reservation, then the longest running job's remaining time
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

// SCHED-2 -------------------------------------------------------------------

test("soak: admitted only when nothing else waits; never ages; its CPU takes no pool token", () => {
  const soak = ticket("S", "soak", { at: 0 });
  assert.deepEqual(admitted(P.plan(stateOf(soak), 0, idle(), cfg)), ["S"]);
  // Something waiting for CPU (it can't fit): the soak waits too, even though memory is free.
  const full = [ticket("x", "standard", { state: "running" }), ticket("y", "standard", { state: "running", memMiB: 1024 })];
  const waiting = ticket("w", "standard", { at: 1, memMiB: 1024 });
  const p = P.plan(stateOf(...full, waiting, soak), 2 * 3600 * 1000, idle(), cfg);
  assert.deepEqual(admitted(p), []);
  assert.equal(p.blocked.S, "leftover");
  assert.deepEqual(p.order, ["w", "S"]); // two hours waited, still last
  assert.equal(P.effectivePriority(soak, 10 * 3600 * 1000, cfg), 9);
  // A ticket waiting only for its own worktree does not hold the soak back.
  const same = ticket("z", "quick", { at: 1, worktree: "wt-x" });
  assert.deepEqual(admitted(P.plan(stateOf(ticket("x", "standard", { state: "running" }), same, soak), 2, idle(), cfg)), ["S"]);
  // A running soak takes no token: four tokens stay for the pool.
  const running = ticket("S", "soak", { state: "running" });
  const p2 = P.plan(stateOf(running, ticket("a", "standard", { at: 1 }), ticket("b", "standard", { at: 2, memMiB: 1024 })), 3, idle(), cfg);
  assert.deepEqual(admitted(p2), ["a"]);
  assert.equal(p2.blocked.b, "memory"); // 3 + 3 GiB booked: the soak's memory does count
  assert.deepEqual(p2.preempt, ["S"]); // and b would start without it
  assert.equal(p2.used.tokens, 2);
  // An old soak never takes the 10-minute reservation: the newer quick is not
  // held back by it (and the soak then fits beside it).
  const old = ticket("S2", "soak", { at: 0 });
  const p3 = P.plan(stateOf(old, ticket("q", "quick", { at: 11 * MIN })), 12 * MIN, idle(), cfg);
  assert.deepEqual(admitted(p3), ["q", "S2"]);
  // Pool full and only the express slot free: a soak never takes it.
  const p4 = P.plan(stateOf(ticket("x", "standard", { state: "running" }), ticket("y", "standard", { state: "running" }), old), 12 * MIN, idle(), cfg);
  assert.equal(p4.blocked.S2, "memory");
});

test("soak yield: preempt only when the soak's memory or GPU is what blocks a waiting job", () => {
  const S = ticket("S", "soak", { state: "running", gpu: true });
  // CPU shortage is not the soak's doing: no preemption.
  const busy = [ticket("x", "standard", { state: "running", memMiB: 1024 }), ticket("y", "standard", { state: "running", memMiB: 1024 })];
  const cpuWait = P.plan(stateOf(S, ...busy, ticket("c", "standard", { at: 1, memMiB: 1024 })), 2, idle(), cfg);
  assert.equal(cpuWait.blocked.c, "cpu");
  assert.deepEqual(cpuWait.preempt, []);
  // The soak holds the GPU a gpu job needs.
  const gpuWait = P.plan(stateOf(S, ticket("g", "gpu", { at: 1 })), 2, idle(), cfg);
  assert.equal(gpuWait.blocked.g, "gpu");
  assert.deepEqual(gpuWait.preempt, ["S"]);
  // An exclusive drain with only a soak left in the lane.
  const drain = P.plan(stateOf(S, ticket("X", "exclusive", { at: 1 })), 2, idle(), cfg);
  assert.equal(drain.blocked.X, "lane");
  assert.deepEqual(drain.preempt, ["S"]);
  // R1-F8: a job queued in the soak's own worktree is blocked by `worktree`; the soak yields to it too.
  const same = P.plan(stateOf(S, ticket("rev", "quick", { at: 1, review: true, worktree: "wt-S" })), 2, idle(), cfg);
  assert.equal(same.blocked.rev, "worktree");
  assert.deepEqual(same.preempt, ["S"]);
  // ... but not to a job waiting on another busy worktree.
  const other = P.plan(stateOf(S, ticket("x", "standard", { state: "running", worktree: "wt-o" }), ticket("o", "quick", { at: 1, worktree: "wt-o" })), 2, idle(), cfg);
  assert.deepEqual(other.preempt, []);
  // Nobody waiting: the soak keeps running.
  assert.deepEqual(P.plan(stateOf(S), 2, idle(), cfg).preempt, []);
});

test("exclusive turns: a series of exclusive tickets interleaves with the work that waited through each", () => {
  const X1 = ticket("X1", "exclusive", { at: 0 }), X2 = ticket("X2", "exclusive", { at: 1 });
  const a = ticket("a", "standard", { at: 5 * MIN }); // arrived while X1 ran
  const p = P.plan({ ...stateOf(X2, a), lastExclusiveEnd: 20 * MIN }, 20 * MIN, idle(), cfg);
  assert.deepEqual(admitted(p), ["a"]); // X2 is older and aged further, but a waited through X1
  assert.equal(p.blocked.X2, "turn");
  a.state = "running";
  const next = P.plan({ ...stateOf(X2, a, ticket("late", "quick", { at: 21 * MIN })), lastExclusiveEnd: 20 * MIN }, 21 * MIN, idle(), cfg);
  assert.equal(next.blocked.X2, "lane"); // a's turn taken: X2 drains now, later arrivals wait
  assert.equal(next.blocked.late, "exclusive");
  void X1;
});

test("serial mode turns a soak into an ordinary exclusive job", () => {
  const s = ticket("S", "soak", { mode: "serial" });
  assert.equal(s.req.exclusive, true);
  assert.deepEqual(admitted(P.plan(stateOf(s), 0, idle(), cfg)), ["S"]);
});

test("coalescing: a snapshot or GPU soak is different work from the plain request", () => {
  const base = { worktree: "/w", cwd: "/w", argv: ["x"], class: "soak", head: "abc", dirty: "clean" };
  assert.notEqual(P.coalesceKey(base), P.coalesceKey({ ...base, snapshot: true }));
  assert.notEqual(P.coalesceKey(base), P.coalesceKey({ ...base, gpu: true }));
  assert.equal(P.coalesceKey(base), JSON.stringify(["/w", "/w", ["x"], "soak", null, null, false, "abc", "clean"])); // SCHED-1 keys unchanged
});

test("GPU lease: the environment alone is no proof; the second worker's siltwake-job scope is its lease", async () => {
  const L = await import(pathToFileURL(resolve("scripts/heavy/gpu-lease.mjs")).href);
  const env = { SILTWAKE_SCHED_DIR: "/nonexistent-sched" };
  assert.match(L.leaseProblem(env, "0::/user.slice/x.scope"), /not set/);
  assert.match(L.leaseProblem({ ...env, SILTWAKE_GPU_LEASE: "261023-000000-abcd" }, "0::/user.slice/x.scope"), /names no admitted ticket/);
  assert.match(L.leaseProblem({ ...env, SILTWAKE_GPU_LEASE: "v1-123" }, "0::/user.slice/other.scope"), /not inside a heavy-check scope/);
  assert.equal(L.leaseProblem({ ...env, SILTWAKE_GPU_LEASE: "v1-123" }, "0::/user.slice/user@1000.service/app.slice/siltwake-heavy-wt-123.scope"), null);
  // CW-1's run-4070.sh sets SILTWAKE_GPU_LEASE=alickers-job inside the sandbox's job scope.
  assert.equal(L.leaseProblem({ ...env, SILTWAKE_GPU_LEASE: "alickers-job" }, "0::/system.slice/siltwake-job-42.scope"), null);
  assert.equal(L.leaseProblem(env, "0::/system.slice/siltwake-job-42.scope/sub"), null);
});

// SCHED-2b: machine tags and the remote lane -----------------------------------

test("lane eligibility: local paths outside the tree and uncommitted build outputs keep a job here", async () => {
  const R = await import(pathToFileURL(resolve("scripts/heavy/remote.mjs")).href);
  const wt = "/home/worker/wt";
  assert.deepEqual(R.externalPaths(["node", "/work/tmp/x/derive.mjs", "--json=/work/results/pt.json"], wt), ["/work/tmp/x/derive.mjs", "/work/results/pt.json"]);
  assert.deepEqual(R.externalPaths(["node", "/home/worker/wt/scripts/a.mjs", "sh", "-c", "cat /tmp/in > out"], wt), ["/tmp/in"]);
  assert.deepEqual(R.externalPaths(["sh", "-c", "echo > /work/results/pack/a"], wt, ["/work/results/pack"]), [], "a declared --artifact is an output");
  assert.deepEqual(R.builtOutputs(["node", ".test-build/scripts/playthrough/run.js"]), [".test-build"]);
  assert.deepEqual(R.builtOutputs(["node", "scripts/soak/run.mjs", "tour", "--dist", "dist"]), ["dist"]);
  assert.deepEqual(R.builtOutputs(["sh", "-c", "node scripts/test-build.mjs && node scripts/test-tier.mjs heavy"]), [], "compiling inside the job is fine");
  assert.deepEqual(R.builtOutputs(["npm", "run", "playthrough", "--", "--jobs", "3"]), []);
});

test("machine tags (SCHED-3): any by default, except quick, bake and exclusive (here) and soak; an explicit tag wins; unknown tags refused", () => {
  const m = (cls: string, extra = {}) => P.resolveRequest({ class: cls, ...extra }, { T: 4, M: 6144 }).goal?.machine;
  const classes = ["standard", "gpu", "playthrough", "heavy-suite", "quick", "bake", "exclusive", "soak"];
  assert.deepEqual(classes.map((c) => m(c)), ["any", "any", "any", "any", "3090", "3090", "3090", "soak"]);
  assert.deepEqual(classes.map((c) => P.defaultMachine(c)), classes.map((c) => m(c)), "the request uses the table");
  assert.equal(m("gpu", { machine: "4070" }), "4070");
  assert.equal(m("standard", { machine: "3090" }), "3090", "explicit --machine 3090 wins");
  assert.equal(m("quick", { machine: "any" }), "any", "explicit --machine any wins for a local class");
  assert.match(P.resolveRequest({ class: "exclusive", machine: "4070" }, { T: 4, M: 6144 }).error, /exclusive measures the RTX 3090/);
  assert.match(P.resolveRequest({ class: "quick", machine: "mars" }, { T: 4, M: 6144 }).error, /unknown machine/);
});

test("routing (SCHED-3): an any request that can't run on alickers goes to the 3090 with the reason; 4070 is refused; 3090 and soak stand", () => {
  const why = "uncommitted changes (alickers runs a commit)", declared = { explicit: true, portable: null };
  assert.deepEqual(P.resolveMachine("any", null, declared), { machine: "any" });
  assert.deepEqual(P.resolveMachine("any", why, declared), { machine: "3090", routed: { from: "any", reason: why } });
  assert.deepEqual(P.resolveMachine("3090", why, declared), { machine: "3090" }, "no routing record for a job that asked for here");
  assert.deepEqual(P.resolveMachine("soak", why, declared), { machine: "soak" }, "soak keeps its own rule");
  assert.match(P.resolveMachine("4070", why, declared).error, /--machine 4070 runs on alickers, but uncommitted changes/);
  assert.deepEqual(P.resolveMachine("4070", null, declared), { machine: "4070" });
});

test("portability is declared (SCHED-3 R1-F1): a default any goes to alickers only for a registered command; an explicit --machine is the caller's declaration", () => {
  const und = { explicit: false, portable: null };
  assert.deepEqual(P.resolveMachine("any", null, und), { machine: "3090", routed: { from: "any", reason: P.UNDECLARED } });
  assert.match(P.UNDECLARED, /portability not declared: pass --machine any and --artifact for its outputs/);
  assert.deepEqual(P.resolveMachine("any", null, { explicit: false, portable: "the fast tier" }), { machine: "any" });
  assert.deepEqual(P.resolveMachine("any", null, { explicit: true, portable: null }), { machine: "any" });
  assert.deepEqual(P.resolveMachine("soak", null, und), { machine: "soak" });
  // The registry: exact commands only (Sol R1's R6 commands included).
  for (const argv of [["npm", "test"], ["npm", "run", "test:fast"], ["sh", "-c", "node scripts/test-build.mjs && node scripts/test-tier.mjs heavy"],
    ["npm", "run", "playthrough"], ["npm", "run", "playthrough", "--", "--jobs", "3", "--quiet"]])
    assert.ok(P.portableCommand(argv), argv.join(" "));
  for (const argv of [["node", "scripts/write-local.mjs"], ["node", "tools/cave-gpu-check.mjs"], ["node", "tools/cave-deep-shots.mjs"], ["node", "tools/large-cave-lab.gpu.mjs"],
    ["node", "scripts/build-wrapper.mjs"], ["sh", "-c", 'cat "$REVIEW_INPUT"'], ["sh", "-c", 'printf done > "$REVIEW_OUTPUT"'], ["npm", "run", "test:build"],
    ["npm", "run", "build"], ["sh", "-c", "npm run build && true"], ["sh", "-c", "npm test && cp x /tmp"],
    ["npm", "run", "playthrough", "--", "--jobs", "3", "--json", "pt.json"], ["npm", "run", "test:heavy"], ["node", "scripts/check-m1-economy.mjs"]])
    assert.equal(P.portableCommand(argv), null, argv.join(" "));
});

test("build-only commands stay here unless an --artifact brings their output back (SCHED-3 R1-F2); one command line only", async () => {
  const R = await import(pathToFileURL(resolve("scripts/heavy/remote.mjs")).href);
  assert.deepEqual(R.buildOnly(["npm", "run", "build"]), { command: "npm run build", output: "dist" });
  assert.deepEqual(R.buildOnly(["npm", "run", "test:build"]), { command: "npm run test:build", output: ".test-build" });
  for (const argv of [["sh", "-c", "npm run build"], ["npx", "vite", "build", "--mode", "production"], ["node", "scripts/test-build.mjs", "--typecheck"]])
    assert.ok(R.buildOnly(argv), argv.join(" "));
  for (const art of [["dist"], ["./dist/"], ["."]]) assert.equal(R.buildOnly(["npm", "run", "build"], art), null, `--artifact ${art}`);
  assert.ok(R.buildOnly(["npm", "run", "build"], ["dist/sub"]), "part of the output doesn't bring it back");
  assert.ok(R.buildOnly(["npm", "run", "test:build"], ["dist"]), "another output doesn't either");
  for (const argv of [["npm", "test"], ["sh", "-c", "npm run build && node scripts/check-dist.mjs"], ["sh", "-c", "npm run build\nnode scripts/use-build.mjs"],
    ["sh", "-c", "node scripts/test-build.mjs; node scripts/test-tier.mjs heavy"], ["npm", "run", "build:terrain"], ["npm", "run", "playthrough"]])
    assert.equal(R.buildOnly(argv), null, JSON.stringify(argv));
});

const remote = (state: string) => idle({ remote: { state } });
function rt(id: string, cls: string, machine: string, opts: { at?: number; state?: string; remote?: boolean; ok?: boolean; fellBack?: boolean; worktree?: string } = {}) {
  const t = ticket(id, cls, { ...(opts.at != null ? { at: opts.at } : {}), ...(opts.state ? { state: opts.state } : {}), ...(opts.worktree ? { worktree: opts.worktree } : {}) }) as Ticket & { remote?: boolean; fellBack?: object; goal: { machine: string; remoteOk: boolean; soak: boolean } };
  t.goal = { ...t.goal, machine, remoteOk: opts.ok ?? true };
  if (opts.remote) t.remote = true;
  if (opts.fellBack) t.fellBack = { reason: "paused" };
  return t;
}
const routed = (p: { admit: { id: string; remote?: boolean }[] }) => p.admit.map((a) => a.id + (a.remote ? "@4070" : ""));

test("routing: any prefers alickers when its slot is free and runs here otherwise; 3090 never leaves", () => {
  const s = stateOf(rt("a", "playthrough", "any"), rt("b", "playthrough", "any", { at: 1 }), rt("c", "gpu", "3090", { at: 2 }));
  const sorted = (p: { admit: { id: string; remote?: boolean }[] }) => routed(p).sort();
  assert.deepEqual(sorted(P.plan(s, 3, remote("up"), cfg)), ["a@4070", "b", "c"]); // one remote slot; b and c fit the 4 tokens here
  const busy = P.plan(s, 3, remote("busy"), cfg); // another agent's direct call holds it
  assert.deepEqual(sorted(busy), ["a", "c"]);
  assert.equal(busy.blocked.b, "cpu", "b waits here like any local job");
  assert.deepEqual(sorted(P.plan(s, 3, remote("unreachable"), cfg)), ["a", "c"]);
  // A dirty tree can't be sent: any runs here.
  assert.deepEqual(routed(P.plan(stateOf(rt("d", "playthrough", "any", { ok: false })), 3, remote("up"), cfg)), ["d"]);
});

test("routing: 4070 waits for alickers through busy, pause and outage, and is never run here", () => {
  for (const [st, why] of [["busy", "remote"], ["paused", "remote-paused"], ["unreachable", "remote-down"], ["unknown", "remote-unknown"]]) {
    const p = P.plan(stateOf(rt("g", "gpu", "4070")), 3, remote(st!), cfg);
    assert.deepEqual(p.admit, [], st);
    assert.equal(p.blocked.g, why);
  }
  const running = rt("r", "playthrough", "any", { state: "running", remote: true });
  const p = P.plan(stateOf(running, rt("g", "gpu", "4070", { at: 1 })), 3, remote("up"), cfg);
  assert.equal(p.blocked.g, "remote"); // our own job holds the slot
  assert.equal(p.used.remote, 1);
  assert.equal(p.used.tokens, 0, "a remote job takes nothing here");
  assert.deepEqual(routed(P.plan(stateOf(rt("g", "gpu", "4070", { fellBack: true })), 3, remote("up"), cfg)), ["g@4070"], "a 4070 job goes back to alickers");
});

test("routing: soak goes to alickers first, here only while it is paused or unreachable; a fallen-back soak stays here", () => {
  assert.deepEqual(routed(P.plan(stateOf(rt("s", "soak", "soak")), 3, remote("up"), cfg)), ["s@4070"]);
  assert.equal(P.plan(stateOf(rt("s", "soak", "soak")), 3, remote("busy"), cfg).blocked.s, "remote");
  assert.deepEqual(routed(P.plan(stateOf(rt("s", "soak", "soak")), 3, remote("paused"), cfg)), ["s"]);
  assert.deepEqual(routed(P.plan(stateOf(rt("s", "soak", "soak", { fellBack: true })), 3, remote("up"), cfg)), ["s"]);
});

test("routing: the remote lane ignores local legacy, exclusive and memory states; a remote soak yields to a waiting 4070 job", () => {
  const ex = ticket("x", "exclusive", { state: "running" });
  const p = P.plan(stateOf(ex, rt("a", "playthrough", "any", { at: 1 }), ticket("q", "quick", { at: 2 })), 3, idle({ remote: { state: "up" }, legacy: { holder: true, waiter: false } }), cfg);
  assert.deepEqual(routed(p), ["a@4070"]);
  assert.equal(p.blocked.q, "legacy");
  const soak = rt("s", "soak", "soak", { state: "running", remote: true });
  const y = P.plan(stateOf(soak, rt("g", "gpu", "4070", { at: 1 })), 3, remote("up"), cfg);
  assert.equal(y.blocked.g, "remote");
  assert.deepEqual(y.preempt, ["s"]);
  assert.deepEqual(P.plan(stateOf(soak, rt("a", "playthrough", "any", { at: 1 })), 3, remote("up"), cfg).preempt, [], "an any job just runs here");
});

test("config stalls: a class's default stall window, below its limit; an explicit --stall still wins", () => {
  const r = (o: object, stalls: object) => P.resolveRequest({ class: "playthrough", ...o }, { T: 4, M: 6144, stalls }).goal.stallS;
  assert.equal(r({}, {}), 900);
  assert.equal(r({}, { playthrough: 2700 }), 2700);
  assert.equal(r({ deadline: 1200 }, { playthrough: 2700 }), 2700, "a default is not clamped: the deadline still ends a silent job first, as 'deadline'");
  assert.equal(r({ stallS: 600 }, { playthrough: 2700 }), 600);
  assert.equal(P.resolveRequest({ class: "quick" }, { T: 4, M: 6144, stalls: { playthrough: 2700 } }).goal.stallS, 600, "other classes unchanged");
});

test("routing (R1-F5): a 4070 ticket backing off waits (remote-retry) and is never dropped or run here", () => {
  const g = rt("g", "gpu", "4070", { fellBack: true }) as ReturnType<typeof rt> & { notBefore?: number };
  g.notBefore = 10_000;
  const p = P.plan(stateOf(g), 5_000, remote("up"), cfg);
  assert.deepEqual([p.admit, p.blocked.g], [[], "remote-retry"]);
  assert.deepEqual(routed(P.plan(stateOf(g), 10_001, remote("up"), cfg)), ["g@4070"]);
});

test("maintenance (install.sh changing the exclusive slice's unit, TST-16 R9): nothing is admitted; every queued ticket waits as 'maintenance'", () => {
  const s = { ...stateOf(ticket("a", "quick"), ticket("x", "exclusive", { at: 1 })), maintenance: { since: 0, reason: "exclusive unit update (write)" } };
  const p = P.plan(s, 10, idle(), cfg);
  assert.deepEqual([admitted(p), p.blocked], [[], { a: "maintenance", x: "maintenance" }]);
  assert.deepEqual(admitted(P.plan(stateOf(ticket("a", "quick")), 10, idle(), cfg)), ["a"], "and admits again once cleared");
});
