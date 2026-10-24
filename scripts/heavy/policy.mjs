// heavy-check v2 admission policy. Pure: no I/O, no clock, no process state.
// See docs/build/perf/DECISION-OPUS.md §1 and docs/build/streams/SCHED-1.md.
//
// A ticket asks for CPU tokens, a memory reservation (MiB) and maybe the GPU.
// Pools: T = nproc − 2 tokens, M MiB (config), one GPU, plus one express slot
// (1 token, 2 GiB) that only a `quick` job may use. plan() decides which queued
// tickets start now; every supervisor runs it under the state lock and admits
// only itself, so the plan must be deterministic for a given (state, now, host).

export const PROTOCOL = 1;
export const MIB = 1;
export const GIB = 1024;

export const DEFAULTS = Object.freeze({
  poolMiB: 6 * GIB,          // M: sum of pool reservations
  soakSlots: 1,              // soak jobs running at once
  soakYieldS: 300,           // a soak blocking someone is stopped this long after its yield notice
  expressTokens: 1,
  expressMiB: 2 * GIB,
  hostFloorMiB: 2 * GIB,     // MemAvailable that must remain after admission
  psiFullMax: 1,             // memory PSI full avg10 (%) at or above which nothing starts
  agingMin: 5,               // one priority level per 5 minutes waited
  reserveAfterMin: 10,       // a ticket waiting this long reserves the pools
  queueTimeoutS: 2 * 3600,
  runnerHeadroomMiB: 512,    // reservation − this = TT-1 heavy pool budget
});

export const tokensFor = (nproc) => Math.max(1, nproc - 2);

// maxCpus/maxMiB: how far --cpus/--mem may raise a request. "T"/"M" mean the pool.
// A job has a goal, not a time limit (owner, 2026-10-23): it runs until its
// command ends. The queue stops it only when it stalls (no output and no
// heartbeat for stallS) or at its class's runaway ceiling (ceilingS, hours).
// Exclusive jobs block everything, so theirs is a real cap (30 min).
const H = 3600;
const CLASSES = {
  quick:         { cpus: () => 1,              mem: 2 * GIB, maxCpus: () => 1, maxMiB: 2 * GIB, ceilingS: 2 * H, stallS: 600, base: 1 },
  standard:      { cpus: () => 2,              mem: 3 * GIB, maxCpus: (T) => T, maxMiB: "M",   ceilingS: 4 * H, stallS: 900, base: 2 },
  "heavy-suite": { cpus: (T) => (T >= 6 ? 3 : 2), mem: 3 * GIB, maxCpus: (T) => T, maxMiB: 5 * GIB, ceilingS: 4 * H, stallS: 900, base: 2 },
  gpu:           { cpus: () => 2, gpu: true,   mem: 3 * GIB, maxCpus: (T) => T, maxMiB: "M",   ceilingS: 4 * H, stallS: 900, base: 2 },
  playthrough:   { cpus: (T) => (T >= 6 ? 3 : 2), mem: 2 * GIB, maxCpus: (T) => T, maxMiB: 3 * GIB, ceilingS: 6 * H, stallS: 900, base: 3 },
  bake:          { cpus: () => 2,              mem: 3 * GIB, maxCpus: (T) => T, maxMiB: "M",   ceilingS: 2 * H, stallS: 900, base: 2 },
  // Leftover capacity only: admitted when nothing else waits, its CPU runs at
  // idle weight and takes no pool token, and it is stopped (after a yield
  // notice) when its memory or GPU blocks anyone. --gpu adds the GPU lease.
  soak:          { cpus: () => 1, soak: true,  mem: 3 * GIB, maxCpus: () => 2, maxMiB: "M",   ceilingS: 6 * H, stallS: 900, base: 9, optionalGpu: true },
  exclusive:     { cpus: (T) => T, gpu: true, exclusive: true, mem: "M", maxCpus: (T) => T, maxMiB: "M", ceilingS: 1800, stallS: 600, base: 3 },
};
export const CLASS_NAMES = Object.keys(CLASSES);

// Machine tags (SCHED-2b; DIRECTION, "Two test machines"). `any`: the second
// worker (siltwake-alickers, RTX 4070 Laptop) when its slot is free, else here;
// `3090`: here only; `4070`: alickers only, waiting for it through pauses and
// outages, never faked here; `soak`: alickers first, here only while alickers
// is paused or unreachable.
export const MACHINES = ["any", "3090", "4070", "soak"];
// SCHED-3 (DIRECTION, "Balance the two GPUs"): work goes to whichever machine
// frees first unless the question needs one. Kept here by default: quick (the
// express slot; shipping a commit costs more than the job), bake (it writes
// local artifacts) and exclusive (it measures the 3090). Soak has its own tag.
const LOCAL_CLASSES = new Set(["quick", "bake", "exclusive"]);
export const defaultMachine = (cls) => (cls === "soak" ? "soak" : LOCAL_CLASSES.has(cls) ? "3090" : "any");

// Portability is declared, never inferred (SCHED-3 R1-F1): a command's argv
// can't show what its scripts import, read from the environment or write. An
// `any` job goes to alickers only if its command is one of ours proven
// self-contained (it compiles and consumes its builds inside the job, writes
// nothing the caller needs back, and a suite or the gate runs it there), or
// its caller asked for `--machine any|4070` and so declares it, with its
// outputs as --artifact. Add a command here only once a suite proves it.
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const PORTABLE = [
  { name: "the fast tier", match: (a) => same(a, ["npm", "test"]) || same(a, ["npm", "run", "test:fast"]) },
  // test:heavy's own queued command (package.json); `npm run test:heavy` queues itself.
  { name: "the heavy tier", match: (a) => same(a, ["sh", "-c", "node scripts/test-build.mjs && node scripts/test-tier.mjs heavy"]) },
  // The gate's playthrough (scripts/gate.mjs): it compiles first and writes nothing back.
  { name: "the playthrough", match: (a) => same(a.slice(0, 3), ["npm", "run", "playthrough"]) &&
    (a.length === 3 || (a[3] === "--" && a.slice(4).every((x, i, r) => x === "--quiet" || x === "--jobs" || (r[i - 1] === "--jobs" && /^\d+$/.test(x))))) },
];
/** The registered portable command `argv` is, by name, or null. */
export const portableCommand = (argv) => PORTABLE.find((p) => p.match(argv.map(String)))?.name ?? null;
export const UNDECLARED = "portability not declared: pass --machine any and --artifact for its outputs";

/**
 * The machine a request resolves to. `why`: a reason it can't run on alickers
 * (the lane's eligibility), or null. `explicit`: the caller passed --machine.
 * `portable`: the command is registered (portableCommand).
 * - with a reason, `any` goes to the 3090, recording why (`routed`, on the
 *   ticket and its result), and `4070` is refused;
 * - an `any` the caller didn't ask for, on an unregistered command, goes to
 *   the 3090 too (UNDECLARED);
 * - every other tag stands (`soak` runs here by its own rule).
 * Returns { machine, routed? } or { error }.
 */
export function resolveMachine(machine, why, { explicit, portable }) {
  if (why) {
    if (machine === "4070") return { error: `--machine 4070 runs on alickers, but ${why}` };
    if (machine === "any") return { machine: "3090", routed: { from: "any", reason: why } };
    return { machine };
  }
  if (machine === "any" && !explicit && !portable) return { machine: "3090", routed: { from: "any", reason: UNDECLARED } };
  return { machine };
}
/** What a ticket that never ran was planned for (its result's `planned`; R1-F3). */
export const plannedFor = (goal) => ({ any: "any machine", "3090": "RTX 3090 (factory-worker)", "4070": "RTX 4070 Laptop (alickers)", soak: "alickers first (soak)" })[goal?.machine] ?? "RTX 3090 (factory-worker)";
export const MACHINE_LABELS = Object.freeze({
  local: "RTX 3090 (factory-worker)",
  remote: "RTX 4070 Laptop (alickers, shared desktop host)",
});
export const classInfo = (name) => CLASSES[name];

/** Known commands get their class without --class, so v1-style calls of the
 * big jobs are not squeezed into `standard`'s 20-minute, 3 GiB reservation. */
export function classifyCommand(argv) {
  const text = argv.join(" ");
  if (/large-cave-lab\.bake/.test(text)) return "exclusive"; // 5.5 GiB peak; exclusive until re-profiled
  if (/\bplaythrough\b/.test(text)) return "playthrough";
  if (/test-tier\.mjs\s+heavy\b|\btest:heavy\b/.test(text)) return "heavy-suite";
  if (/bake-terrain\.mjs|\bbake:terrain\b/.test(text)) return "bake";
  return "standard";
}

/** "3G", "512M", "2048" (MiB) → MiB, or NaN. */
export function parseMiB(value) {
  const m = /^(\d+(?:\.\d+)?)\s*([GgMm])?i?[Bb]?$/.exec(String(value ?? "").trim());
  if (!m) return NaN;
  const n = Number(m[1]);
  return Math.round(/[Gg]/.test(m[2] ?? "") ? n * GIB : n);
}

/**
 * Turns options into a reservation, or { error } for a request that can never
 * fit (exit 2 at submit). `mode` "serial" makes every request exclusive (v1).
 */
export function resolveRequest(opts, { T, M, mode = "normal", minStallS = 60, ceilings = {}, stalls = {} }) {
  const name = opts.class ?? "standard";
  const c = CLASSES[name];
  if (!c) return { error: `unknown class ${name} (${CLASS_NAMES.join(", ")})` };
  const pool = (v) => (v === "M" ? M : v);
  const notes = [];
  let tokens = c.cpus(T), memMiB = pool(c.mem);
  if (opts.cpus != null) {
    if (!(Number.isInteger(opts.cpus) && opts.cpus >= 1)) return { error: `--cpus must be a whole number ≥ 1` };
    if (opts.cpus > c.maxCpus(T)) return { error: `--cpus ${opts.cpus} is over ${name}'s maximum of ${c.maxCpus(T)} (T=${T} tokens)` };
    tokens = opts.cpus;
  }
  if (opts.memMiB != null) {
    if (!(opts.memMiB >= 256)) return { error: `--mem must be at least 256M` };
    if (opts.memMiB > pool(c.maxMiB)) return { error: `--mem ${opts.memMiB} MiB is over ${name}'s maximum of ${pool(c.maxMiB)} MiB` };
    memMiB = opts.memMiB;
  }
  if (!c.exclusive && memMiB > M) return { error: `${memMiB} MiB is over the ${M} MiB pool; use --class exclusive` };
  if (opts.gpu && !c.optionalGpu && !c.gpu) return { error: `--gpu is for --class soak; use --class gpu` };
  const machine = opts.machine ?? defaultMachine(name);
  if (!MACHINES.includes(machine)) return { error: `unknown machine ${machine} (${MACHINES.join(", ")})` };
  if (c.exclusive && machine !== "3090") return { error: `--class exclusive measures the RTX 3090; for the 4070 use --class gpu --machine 4070 (its frame times are recorded, not judged)` };
  // --deadline is a hard limit the caller chooses; without it the job runs to
  // its goal, bounded only by the stall window and the class ceiling.
  // config.json `ceilings` ({ class: seconds }) can retune a class's ceiling.
  const ceilingS = ceilings[name] ?? c.ceilingS;
  let deadline = ceilingS;
  if (opts.deadline != null) {
    if (!(opts.deadline > 0)) return { error: `--deadline must be positive seconds` };
    if (opts.deadline > ceilingS) notes.push(`deadline ${opts.deadline}s clamped to ${name}'s ${c.exclusive ? "cap" : "runaway ceiling"} ${ceilingS}s`);
    deadline = Math.min(opts.deadline, ceilingS);
  }
  // config.json `stalls` ({ class: seconds }) sets a class's default stall
  // window: a migration bridge for jobs whose code predates their heartbeat
  // (an unmerged worktree's playthrough is silent for its whole run). --stall wins.
  // A default window is not clamped to the deadline (as before this setting):
  // a silent job with a short --deadline still ends as "deadline", not "stalled".
  let stallS = stalls[name] ?? c.stallS;
  if (opts.stallS != null) {
    if (!(Number.isInteger(opts.stallS) && opts.stallS >= minStallS)) return { error: `--stall must be whole seconds ≥ ${minStallS}` };
    stallS = Math.min(opts.stallS, deadline);
  }
  const serial = mode === "serial";
  const exclusive = Boolean(c.exclusive) || serial;
  const soak = Boolean(c.soak) && !serial;
  return {
    class: name,
    tokens: exclusive ? T : tokens,
    memMiB: exclusive ? M : memMiB,
    gpu: Boolean(c.gpu) || Boolean(c.optionalGpu && opts.gpu) || exclusive,
    exclusive,
    serial,
    review: Boolean(opts.review),
    basePriority: c.base - (opts.review ? 1 : 0),
    deadline,
    notes,
    // SCHED-2. Kept out of `req` in the ticket (see goalOf): SCHED-1 supervisors
    // still queued during a migration re-resolve every queued `req` with their
    // own code, which would clamp it to their 10–30 minute maxima.
    goal: { v: 2, limitS: deadline, explicitDeadline: opts.deadline != null, ceilingS, stallS, soak, snapshot: Boolean(opts.snapshot), machine },
  };
}

/** A ticket's SCHED-2 goal. A SCHED-1 ticket has none: it keeps its old deadline. */
export const goalOf = (t) => t.goal ?? null;
const isSoak = (t) => Boolean(t.goal?.soak) && !t.req.exclusive; // serial mode makes a soak exclusive too

/** Environment a job sees so its worker counts match its reservation. In serial
 * mode the job holds the whole lane, as in v1, so only the v1 variables are set
 * and TT-1's own defaults apply. */
export function jobEnv(ticket, req, cfg = DEFAULTS) {
  // The scope is delegated (Delegate=yes), so TT-1's heavy runner may give each
  // test file a child cgroup inside the job's reservation.
  const env = { SILTWAKE_JOB_TICKET: ticket.id, SILTWAKE_HEAVY_LOCK_HELD: "1", SILTWAKE_HEAVY_CGROUP: "delegated" };
  if (req.gpu) env.SILTWAKE_GPU_LEASE = ticket.id;
  if (req.serial) return env;
  Object.assign(env, {
    SILTWAKE_JOB_CPUS: String(req.tokens),
    SILTWAKE_JOB_MEM_MIB: String(req.memMiB),
    SILTWAKE_HEAVY_CONCURRENCY: String(req.tokens),
    SILTWAKE_HEAVY_POOL_MIB: String(Math.max(256, req.memMiB - cfg.runnerHeadroomMiB)),
    BAKE_WORKERS: String(req.tokens),
  });
  return env;
}

export function effectivePriority(t, now, cfg = DEFAULTS) {
  if (isSoak(t)) return t.req.basePriority; // a soak never ages past real work
  const waitedMin = Math.max(0, now - t.submittedAt) / 60000;
  return t.req.basePriority - Math.floor(waitedMin / cfg.agingMin);
}

const byOrder = (now, cfg) => (a, b) =>
  effectivePriority(a, now, cfg) - effectivePriority(b, now, cfg) || a.submittedAt - b.submittedAt || a.seq - b.seq;

/**
 * state.tickets: { id: { id, seq, worktree, state: "queued"|"running", express?,
 *   submittedAt, req, goal? } }; state.lastExclusiveEnd: when the last
 *   exclusive job ended (ms).
 * host: { nproc, memAvailableMiB, memFullAvg10, charges: { id: MiB },
 *   legacy: { holder, waiter }, remote: { state: up|busy|paused|unreachable|unknown|off } }
 * Returns { admit: [{ id, express, remote? }], blocked: { id: reason }, order: [id], T,
 *   used, preempt: [soak ids whose resources would let a waiting job start] }.
 *
 * Remote tickets (t.remote, SCHED-2b) run on the second worker: they take its
 * one slot and nothing here (no tokens, memory, GPU or worktree), and local
 * legacy, exclusive and memory states don't hold them back.
 * Reasons: legacy, exclusive (draining for one), lane (exclusive waiting for
 * the lane to empty), turn (exclusive waiting while the jobs that waited
 * through the last exclusive start), worktree, head (pools reserved for an old
 * ticket), cpu, memory, gpu, host-memory, leftover (a soak waiting for idle
 * capacity), remote (alickers' slot is busy: a lane job, or another agent's
 * direct alickers-job.sh call), remote-paused, remote-down, remote-unknown,
 * remote-retry (a 4070 ticket backing off after a failed dispatch).
 */
export function plan(state, now, host, cfg = DEFAULTS, { counterfactual = false } = {}) {
  const T = tokensFor(host.nproc), M = cfg.poolMiB;
  const tickets = Object.values(state.tickets ?? {});
  const remoteRunning = tickets.filter((t) => t.state === "running" && t.remote);
  const running = tickets.filter((t) => t.state === "running" && !t.remote); // local
  const all = tickets.filter((t) => t.state === "queued").sort(byOrder(now, cfg));
  const used = { tokens: 0, memMiB: 0, gpu: 0, express: false, exclusive: false, soaks: 0, remote: remoteRunning.length };
  const result = { admit: [], blocked: {}, order: all.map((t) => t.id), T, used, preempt: [] };
  // Maintenance (install.sh changing the exclusive slice's unit, TST-16): nothing
  // is admitted; queued tickets wait, and run once it is cleared.
  if (state.maintenance) { for (const t of all) result.blocked[t.id] = "maintenance"; return result; }

  // The remote lane first: its slot is independent of everything local.
  const rstate = host.remote?.state ?? "off";
  let slotFree = rstate === "up" && remoteRunning.length < (cfg.remoteSlots ?? 1);
  const remoteHandled = new Set();
  for (const t of all) {
    const m = t.goal?.machine;
    if (!m || m === "3090") continue;
    // A commit only (the transport sends commits); an any or soak ticket that fell back runs here.
    if (!t.goal.remoteOk || (t.fellBack && m !== "4070")) continue;
    // A 4070 ticket backing off after a failed dispatch waits for its next try (R1-F5).
    if (t.notBefore && now < t.notBefore) { result.blocked[t.id] = "remote-retry"; remoteHandled.add(t.id); continue; }
    if (slotFree) { result.admit.push({ id: t.id, express: false, remote: true }); slotFree = false; remoteHandled.add(t.id); continue; }
    if (m === "any") continue; // prefers alickers, never waits for it
    if (m === "soak" && ["paused", "unreachable", "off"].includes(rstate)) continue; // here while alickers is away
    result.blocked[t.id] = { busy: "remote", up: "remote", paused: "remote-paused", unreachable: "remote-down", unknown: "remote-unknown", off: "remote-down" }[rstate];
    remoteHandled.add(t.id);
  }
  // A soak on alickers yields its slot to a 4070 job waiting for it.
  if (!counterfactual) {
    const remoteSoaks = remoteRunning.filter(isSoak).map((t) => t.id);
    if (remoteSoaks.length && all.some((t) => result.blocked[t.id] === "remote" && t.goal?.machine === "4070")) result.preempt.push(...remoteSoaks);
  }

  const local = all.filter((t) => !remoteHandled.has(t.id));
  const queue = local.filter((t) => !isSoak(t)), soaks = local.filter(isSoak);
  const busy = new Set();
  let unreserved = 0;
  for (const t of running) {
    busy.add(t.worktree);
    if (t.req.exclusive) used.exclusive = true;
    if (t.express) used.express = true;
    else if (isSoak(t)) { used.soaks++; used.memMiB += t.req.memMiB; used.gpu += t.req.gpu ? 1 : 0; } // idle CPU: no token
    else { used.tokens += t.req.tokens; used.memMiB += t.req.memMiB; used.gpu += t.req.gpu ? 1 : 0; }
    unreserved += Math.max(0, t.req.memMiB - (host.charges?.[t.id] ?? 0));
  }
  const blockAll = (reason, except) => { for (const t of local) if (t !== except && !result.blocked[t.id]) result.blocked[t.id] = reason; };
  const runningSoaks = running.filter(isSoak).map((t) => t.id);

  if (host.legacy?.holder || host.legacy?.waiter) { blockAll("legacy"); return result; }
  if (used.exclusive) { blockAll("exclusive"); return result; }

  let hostFree = host.memAvailableMiB - unreserved - cfg.hostFloorMiB;
  const psiBlocked = (host.memFullAvg10 ?? 0) >= cfg.psiFullMax;
  const hostOk = (mem) => !psiBlocked && hostFree - mem >= 0;

  const eligible = queue.filter((t) => !busy.has(t.worktree));
  for (const t of local) if (busy.has(t.worktree)) result.blocked[t.id] = "worktree";
  // Exclusive turns: the jobs that waited through the last exclusive run start
  // before the next exclusive may drain, so a series of exclusive tickets
  // (one measurement each) interleaves with everyone else.
  const passedOver = eligible.some((t) => !t.req.exclusive && t.submittedAt < (state.lastExclusiveEnd ?? 0));
  const mayDrain = (t) => t?.req.exclusive && !passedOver;
  const head = eligible[0];
  const reserveMs = cfg.reserveAfterMin * 60000;
  const reserved = eligible.filter((t) => now - t.submittedAt >= reserveMs && (!t.req.exclusive || !passedOver))
    .sort((a, b) => a.submittedAt - b.submittedAt || a.seq - b.seq)[0];

  // An exclusive ticket at the head (or holding the reservation) drains the lane:
  // nothing new starts, express included, and it starts once the lane is empty.
  // Soaks are what is left in the lane, so they are asked to yield.
  const drain = mayDrain(head) ? head : mayDrain(reserved) ? reserved : null;
  if (drain) {
    if (running.length === 0 && hostOk(drain.req.memMiB)) result.admit.push({ id: drain.id, express: false });
    else result.blocked[drain.id] = running.length ? "lane" : "host-memory";
    if (running.length && running.every(isSoak)) result.preempt.push(...runningSoaks);
    blockAll("exclusive", drain);
    return result;
  }

  for (const t of eligible) {
    if (busy.has(t.worktree)) { result.blocked[t.id] = "worktree"; continue; }
    if (t.req.exclusive) { result.blocked[t.id] = passedOver ? "turn" : "lane"; continue; } // not at head: waits its turn
    const r = t.req;
    const poolClosed = reserved && reserved !== t;
    const short = used.tokens + r.tokens > T ? "cpu" : used.memMiB + r.memMiB > M ? "memory" : r.gpu && used.gpu ? "gpu" : null;
    if (!poolClosed && !short && hostOk(r.memMiB)) {
      result.admit.push({ id: t.id, express: false });
      used.tokens += r.tokens; used.memMiB += r.memMiB; used.gpu += r.gpu ? 1 : 0;
    } else if (t.req.class === "quick" && !used.express && r.tokens <= cfg.expressTokens && r.memMiB <= cfg.expressMiB && hostOk(r.memMiB)) {
      result.admit.push({ id: t.id, express: true });
      used.express = true;
    } else {
      result.blocked[t.id] = poolClosed ? "head" : short ?? "host-memory";
      continue;
    }
    hostFree -= r.memMiB;
    busy.add(t.worktree);
  }

  // Soaks take only what is left over: nothing else may be waiting (a ticket
  // waiting only for its own worktree does not count).
  const waiting = queue.some((t) => !result.admit.some((a) => a.id === t.id) && result.blocked[t.id] !== "worktree");
  for (const t of soaks) {
    if (busy.has(t.worktree)) { result.blocked[t.id] = "worktree"; continue; }
    const r = t.req;
    const short = waiting || used.soaks >= cfg.soakSlots ? "leftover"
      : used.memMiB + r.memMiB > M ? "memory" : r.gpu && used.gpu ? "gpu" : !hostOk(r.memMiB) ? "host-memory" : null;
    if (short) { result.blocked[t.id] = short; continue; }
    result.admit.push({ id: t.id, express: false });
    used.memMiB += r.memMiB; used.gpu += r.gpu ? 1 : 0; used.soaks++;
    hostFree -= r.memMiB;
    busy.add(t.worktree);
  }

  // A running soak yields when its memory, its GPU or its worktree is what
  // keeps a waiting job out: the same plan without the soaks would admit
  // someone it does not. (The job then waits for the soak's cgroup to empty,
  // as for any worktree.)
  const soakTrees = new Set(running.filter(isSoak).map((t) => t.worktree));
  const soakBlocks = (t) => ["memory", "gpu", "host-memory"].includes(result.blocked[t.id]) || (result.blocked[t.id] === "worktree" && soakTrees.has(t.worktree));
  if (runningSoaks.length && !counterfactual && queue.some(soakBlocks)) {
    const without = { ...state, tickets: Object.fromEntries(tickets.filter((t) => !isSoak(t) || t.state !== "running").map((t) => [t.id, t])) };
    const freed = runningSoaks.reduce((n, id) => n + (host.charges?.[id] ?? 0), 0);
    const cf = plan(without, now, { ...host, memAvailableMiB: host.memAvailableMiB + freed }, cfg, { counterfactual: true });
    if (cf.admit.some((a) => !a.remote && !isSoak(state.tickets[a.id]) && !result.admit.some((b) => b.id === a.id))) result.preempt.push(...runningSoaks);
  }
  return result;
}

/** Same command, same worktree, same tree, same request: the same work. */
export function coalesceKey(r) {
  return JSON.stringify([r.worktree, r.cwd, r.argv, r.class, r.cpus ?? null, r.memMiB ?? null, Boolean(r.review), r.head ?? null, r.dirty ?? null,
    ...(r.snapshot || r.gpu || r.machine || r.artifacts?.length ? [Boolean(r.snapshot), Boolean(r.gpu)] : []),
    ...(r.machine || r.artifacts?.length ? [r.machine ?? null, r.artifacts ?? []] : [])]);
}

/** Slice limits for the current machine: tokens + express, pool + express. */
export function sliceLimits(nproc, cfg = DEFAULTS) {
  const T = tokensFor(nproc);
  return { cpuQuotaPct: (T + cfg.expressTokens) * 100, memoryMaxMiB: cfg.poolMiB + cfg.expressMiB };
}
