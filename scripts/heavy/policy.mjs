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
const CLASSES = {
  quick:         { cpus: () => 1,              mem: 2 * GIB, maxCpus: () => 1, maxMiB: 2 * GIB, maxRunS: 600,  base: 1 },
  standard:      { cpus: () => 2,              mem: 3 * GIB, maxCpus: (T) => T, maxMiB: "M",   maxRunS: 1200, base: 2 },
  "heavy-suite": { cpus: (T) => (T >= 6 ? 3 : 2), mem: 3 * GIB, maxCpus: (T) => T, maxMiB: 5 * GIB, maxRunS: 1500, base: 2 },
  gpu:           { cpus: () => 2, gpu: true,   mem: 3 * GIB, maxCpus: (T) => T, maxMiB: "M",   maxRunS: 1500, base: 2 },
  playthrough:   { cpus: (T) => (T >= 6 ? 3 : 2), mem: 2 * GIB, maxCpus: (T) => T, maxMiB: 3 * GIB, maxRunS: 1800, base: 3 },
  bake:          { cpus: () => 2,              mem: 3 * GIB, maxCpus: (T) => T, maxMiB: "M",   maxRunS: 900,  base: 2 },
  exclusive:     { cpus: (T) => T, gpu: true, exclusive: true, mem: "M", maxCpus: (T) => T, maxMiB: "M", maxRunS: 1800, base: 3 },
};
export const CLASS_NAMES = Object.keys(CLASSES);
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
export function resolveRequest(opts, { T, M, mode = "normal" }) {
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
  let deadline = c.maxRunS;
  if (opts.deadline != null) {
    if (!(opts.deadline > 0)) return { error: `--deadline must be positive seconds` };
    if (opts.deadline > c.maxRunS) notes.push(`deadline ${opts.deadline}s clamped to ${name}'s maximum ${c.maxRunS}s`);
    deadline = Math.min(opts.deadline, c.maxRunS);
  }
  const serial = mode === "serial";
  const exclusive = Boolean(c.exclusive) || serial;
  return {
    class: name,
    tokens: exclusive ? T : tokens,
    memMiB: exclusive ? M : memMiB,
    gpu: Boolean(c.gpu) || exclusive,
    exclusive,
    serial,
    review: Boolean(opts.review),
    basePriority: c.base - (opts.review ? 1 : 0),
    deadline,
    notes,
  };
}

/** Environment a job sees so its worker counts match its reservation. In serial
 * mode the job holds the whole lane, as in v1, so only the v1 variables are set
 * and TT-1's own defaults apply. */
export function jobEnv(ticket, req, cfg = DEFAULTS) {
  const env = { SILTWAKE_JOB_TICKET: ticket.id, SILTWAKE_HEAVY_LOCK_HELD: "1" };
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
  const waitedMin = Math.max(0, now - t.submittedAt) / 60000;
  return t.req.basePriority - Math.floor(waitedMin / cfg.agingMin);
}

const byOrder = (now, cfg) => (a, b) =>
  effectivePriority(a, now, cfg) - effectivePriority(b, now, cfg) || a.submittedAt - b.submittedAt || a.seq - b.seq;

/**
 * state.tickets: { id: { id, seq, worktree, state: "queued"|"running", express?,
 *   submittedAt, req } }
 * host: { nproc, memAvailableMiB, memFullAvg10, charges: { id: MiB },
 *   legacy: { holder, waiter } }
 * Returns { admit: [{ id, express }], blocked: { id: reason }, order: [id], T, used }.
 * Reasons: legacy, exclusive (draining for one), lane (exclusive waiting for
 * the lane to empty), worktree, head (pools reserved for an old ticket), cpu,
 * memory, gpu, host-memory.
 */
export function plan(state, now, host, cfg = DEFAULTS) {
  const T = tokensFor(host.nproc), M = cfg.poolMiB;
  const tickets = Object.values(state.tickets ?? {});
  const running = tickets.filter((t) => t.state === "running");
  const queue = tickets.filter((t) => t.state === "queued").sort(byOrder(now, cfg));
  const used = { tokens: 0, memMiB: 0, gpu: 0, express: false, exclusive: false };
  const busy = new Set();
  let unreserved = 0;
  for (const t of running) {
    busy.add(t.worktree);
    if (t.req.exclusive) used.exclusive = true;
    if (t.express) used.express = true;
    else { used.tokens += t.req.tokens; used.memMiB += t.req.memMiB; used.gpu += t.req.gpu ? 1 : 0; }
    unreserved += Math.max(0, t.req.memMiB - (host.charges?.[t.id] ?? 0));
  }
  const result = { admit: [], blocked: {}, order: queue.map((t) => t.id), T, used };
  const blockAll = (reason, except) => { for (const t of queue) if (t !== except && !result.blocked[t.id]) result.blocked[t.id] = reason; };

  if (host.legacy?.holder || host.legacy?.waiter) { blockAll("legacy"); return result; }
  if (used.exclusive) { blockAll("exclusive"); return result; }

  let hostFree = host.memAvailableMiB - unreserved - cfg.hostFloorMiB;
  const psiBlocked = (host.memFullAvg10 ?? 0) >= cfg.psiFullMax;
  const hostOk = (mem) => !psiBlocked && hostFree - mem >= 0;

  const eligible = queue.filter((t) => !busy.has(t.worktree));
  for (const t of queue) if (busy.has(t.worktree)) result.blocked[t.id] = "worktree";
  const head = eligible[0];
  const reserveMs = cfg.reserveAfterMin * 60000;
  const reserved = eligible.filter((t) => now - t.submittedAt >= reserveMs)
    .sort((a, b) => a.submittedAt - b.submittedAt || a.seq - b.seq)[0];

  // An exclusive ticket at the head (or holding the reservation) drains the lane:
  // nothing new starts, express included, and it starts once the lane is empty.
  const drain = head?.req.exclusive ? head : reserved?.req.exclusive ? reserved : null;
  if (drain) {
    if (running.length === 0 && hostOk(drain.req.memMiB)) result.admit.push({ id: drain.id, express: false });
    else result.blocked[drain.id] = running.length ? "lane" : "host-memory";
    blockAll("exclusive", drain);
    return result;
  }

  for (const t of eligible) {
    if (busy.has(t.worktree)) { result.blocked[t.id] = "worktree"; continue; }
    if (t.req.exclusive) { result.blocked[t.id] = "lane"; continue; } // not at head: waits its turn
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
  return result;
}

/** Same command, same worktree, same tree, same request: the same work. */
export function coalesceKey(r) {
  return JSON.stringify([r.worktree, r.cwd, r.argv, r.class, r.cpus ?? null, r.memMiB ?? null, Boolean(r.review), r.head ?? null, r.dirty ?? null]);
}

/** Slice limits for the current machine: tokens + express, pool + express. */
export function sliceLimits(nproc, cfg = DEFAULTS) {
  const T = tokensFor(nproc);
  return { cpuQuotaPct: (T + cfg.expressTokens) * 100, memoryMaxMiB: cfg.poolMiB + cfg.expressMiB };
}
