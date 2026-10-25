// Per-file memory containment for the heavy tier (scripts/test-tier.mjs).
//
// A heavy test file may start its own child processes (the terrain bake runs a
// separate node process with worker threads), so a file's memory is the whole
// process tree it starts, and that tree is what gets reserved, measured and,
// on failure, killed. Nothing outside the tree is ever signalled.
//
// - **cgroup** (sound; files may share the pool). When heavy-check.sh starts the
//   job in a delegated scope (`Delegate=yes`, announced by
//   SILTWAKE_HEAVY_CGROUP=delegated), the runner moves the job's own processes
//   into a leaf, enables the memory controller, and gives each file a child
//   cgroup with `memory.max` at its budget, no swap and `memory.oom.group`, so
//   the kernel enforces the budget over the whole tree and kills only that
//   tree. `memory.peak` is the tree's peak; `cgroup.kill` clears stragglers.
// Teardown (`finish`, once per file) runs when the file's process exits, so a
// straggler holding the file's stdout or stderr cannot hold up its own removal.
// - **process group** (fallback; one file at a time). Each file leads its own
//   process group; a watcher sums the resident memory of every process in the
//   group every 100 ms and kills the group over budget. Sampling can miss a
//   short spike, so containment is not claimed and files never share.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ownCgroup = () => join("/sys/fs/cgroup", readFileSync("/proc/self/cgroup", "utf8").trim().split(":").pop());
const readNumber = (path) => { try { const t = readFileSync(path, "utf8").trim(); return t === "max" ? Infinity : Number(t); } catch { return NaN; } };

/** The nearest finite `memory.max` at or above this process's cgroup, in MiB (Infinity if none). */
export function grantedMemoryMiB() {
  try {
    for (let dir = ownCgroup(); dir.startsWith("/sys/fs/cgroup/") ; dir = join(dir, "..")) {
      const max = readNumber(join(dir, "memory.max"));
      if (Number.isFinite(max)) return Math.floor(max / 1048576);
    }
  } catch { /* no cgroup v2 */ }
  return Infinity;
}

/** Removes an emptied cgroup and any nested ones (a nested runner's), deepest first. */
function removeTree(dir) {
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) removeTree(join(dir, e.name));
    rmdirSync(dir);
  } catch { /* still populated: the scope clears it when the job ends */ }
}

/** Sets up delegated per-file cgroups, or returns null when the job is not delegated. */
function cgroupMode() {
  if (process.env.SILTWAKE_HEAVY_CGROUP !== "delegated") return null;
  try {
    const base = ownCgroup();
    if (!readFileSync(join(base, "cgroup.controllers"), "utf8").split(/\s+/).includes("memory")) return null;
    // cgroup v2 forbids processes in a cgroup that hands controllers to children,
    // so the job's own processes (timeout, this runner) move to a leaf first.
    const leaf = join(base, "tt1-runner");
    if (!existsSync(leaf)) mkdirSync(leaf);
    for (const pid of readFileSync(join(base, "cgroup.procs"), "utf8").split("\n").filter(Boolean)) {
      try { writeFileSync(join(leaf, "cgroup.procs"), pid); } catch { /* exited meanwhile */ }
    }
    writeFileSync(join(base, "cgroup.subtree_control"), "+memory +pids");
    let n = 0;
    return {
      kind: "cgroup", shares: true,
      start(command, args, options, budgetMiB) {
        const dir = join(base, `tt1-file-${process.pid}-${n++}`);
        mkdirSync(dir);
        writeFileSync(join(dir, "memory.max"), `${budgetMiB}M`);
        writeFileSync(join(dir, "memory.swap.max"), "0");
        writeFileSync(join(dir, "memory.oom.group"), "1");
        // The child joins its cgroup before it execs the test, so every descendant is inside.
        const child = spawn("/bin/sh", ["-c", 'echo $$ > "$0/cgroup.procs" && exec "$@"', dir, command, ...args], options);
        let ended = null;
        return {
          child,
          finish() {
            if (ended) return ended;
            // `.local`: OOMs this file's own budget caused, not ones inside a nested
            // cgroup with its own limit (a nested runner's file).
            const events = readFileSync(join(dir, "memory.events.local"), "utf8");
            const ooms = Number(/^oom (\d+)/m.exec(events)?.[1] ?? 0);
            const peakMiB = Math.round(readNumber(join(dir, "memory.peak")) / 1048576);
            // For the stored result (STEW-3): the whole tree's CPU, and processes the OOM
            // killer took, at this file's own budget and in nested cgroups below it.
            const count = (text, key) => Number(new RegExp(`^${key} (\\d+)`, "m").exec(text)?.[1] ?? NaN);
            let all = "", cpu = "";
            try { all = readFileSync(join(dir, "memory.events"), "utf8"); } catch { /* unmeasured */ }
            try { cpu = readFileSync(join(dir, "cpu.stat"), "utf8"); } catch { /* unmeasured */ }
            const own = count(events, "oom_kill"), total = count(all, "oom_kill"), usec = count(cpu, "usage_usec");
            try { writeFileSync(join(dir, "cgroup.kill"), "1"); } catch { /* already empty */ }
            for (let i = 0; i < 50 && readFileSync(join(dir, "cgroup.procs"), "utf8").trim(); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
            removeTree(dir);
            return ended = { peakMiB, killed: ooms > 0, cpuS: Number.isFinite(usec) ? usec / 1e6 : null,
              oomKillsOwn: Number.isFinite(own) ? own : null, oomKillsNested: Number.isFinite(total - own) ? total - own : null };
          },
        };
      },
    };
  } catch { return null; }
}

/** Resident KiB of every process whose process group is `pgid`. */
function groupRssKiB(pgid) {
  let total = 0;
  for (const pid of readdirSync("/proc")) {
    if (!/^\d+$/.test(pid)) continue;
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8"), fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      if (Number(fields[2]) !== pgid) continue; // field 5 of stat: pgrp
      total += Number(/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, "utf8"))?.[1] ?? 0);
    } catch { /* exited meanwhile */ }
  }
  return total;
}

function processGroupMode() {
  return {
    kind: "process group", shares: false,
    start(command, args, options, budgetMiB) {
      const child = spawn(command, args, { ...options, detached: true });
      let peakKiB = 0, killed = false;
      const kill = () => { try { process.kill(-child.pid, "SIGKILL"); } catch { /* gone */ } };
      const timer = setInterval(() => {
        peakKiB = Math.max(peakKiB, groupRssKiB(child.pid));
        if (peakKiB > budgetMiB * 1024 && !killed) { killed = true; kill(); }
      }, 100);
      return {
        child,
        // CPU and OOM kills aren't measurable for a process group: null, never 0.
        finish() { clearInterval(timer); kill(); return { peakMiB: Math.round(peakKiB / 1024), killed, cpuS: null, oomKillsOwn: null, oomKillsNested: null }; }, // idempotent
      };
    },
  };
}

/** The strongest containment this job allows. */
export function heavyContainment() {
  return cgroupMode() ?? processGroupMode();
}
