# SCHED-2b design: the remote lane (draft, before building)

Status: **built** on `t3/sched-2b-remote-lane`; see SCHED-2.md, "SCHED-2b". This was the design before building. Owner rules: [DIRECTION](../../DIRECTION.md), "Two test machines". Transport: `scripts/alickers-job.sh`. The sandbox: `/work/tmp/siltwake-alickers-handoff/SANDBOX-HANDOFF.md` and its `/usr/local/bin/siltwake-job` (read 2026-10-23).

## What the sandbox gives us (facts)

- **One job at a time:** `siltwake-job` takes `flock` on `/work/tmp/siltwake-sandbox-job.lock`, waiting up to 3,600 s, then exits 75.
- **Pause:** the owner's flag (`~/.local/state/siltwake/paused`) is checked only at admission. A running job may finish, and a paused admission exits 75.
- **Limits:** each job runs in user scope `siltwake-job-<pid>` with a `MemoryMax` (1–12 GiB, default 8), `MemoryHigh` at 85% and no swap, a 600% CPU quota, `Delegate=yes`, and a hard `timeout --deadline` (default 1,800 s).
- **Transport:** `alickers-job.sh` pins a SHA (fetched from GitHub, or sent as a bundle) and moves the shared checkout. It runs `npm ci` when the lockfile changed and prints `alickers-job: testing <sha>` first and `tested <sha> exit N` last. Exit 255 means unreachable.
- **Today, other agents call `alickers-job.sh` directly.** Their jobs wait inside the sandbox lock, invisible to factory-worker: three were waiting at 22:35 local time.

## Design

**1. Machine tags.** Each ticket carries `--machine any|3090|4070|soak`. The default comes from the class:
- `playthrough` and `heavy-suite` → `any`;
- `soak` → `soak`;
- `gpu`, `exclusive` and everything else → `3090`.

Routing (pure, in `policy.mjs`):
- `any`: alickers if its slot is free and it is healthy; otherwise a local pool admission as today. "Prefers alickers when free" never waits for it.
- `3090`: local only (today's behaviour).
- `4070`: alickers only. It waits for the slot, keeps waiting through pause or outage until its queue timeout, and is never run locally.
- `soak`: alickers first. It waits for the alickers slot while the sandbox is healthy, and runs as a local soak (the leftover rules) only while the sandbox is paused or unreachable.

**2. The alickers slot is a pool resource.** One remote token sits beside the CPU, memory and GPU pools, and a running remote ticket takes no local tokens or memory. Health is cached in state (`remote: { state: up|paused|unreachable, since, nextProbe }`):
- a paused or unreachable sandbox is probed again with backoff (1, 2, then 5 min);
- a probe is one `ssh … true` plus a non-blocking check of the sandbox lock.

**3. Other agents' direct calls.** The lane's own jobs are counted exactly. A direct `alickers-job.sh` call shows up as "slot busy" in the lock probe. The lane then routes `any` locally, and `4070` and `soak` keep waiting. A lane ticket that is already dispatched and waiting in the sandbox lock is `remote-queued`, not running: it holds the slot but has no stall clock. Once every agent's brief uses the lane (cut-over), direct calls go away.

**4. The remote holder** (`remote-holder.mjs`, its own scope, like `holder.mjs`). It owns a remote ticket's life:
- **Run:** `alickers-job.sh --sha <sha> --deadline <class ceiling> -- <lane-wrapper> <ticket> COMMAND`, with the output streamed into the ticket's `output.log`.
- **The lane wrapper (on the sandbox):**
  - it writes `/work/tmp/lane/<ticket>/{pid,start}`;
  - it sets `SILTWAKE_JOB_HEARTBEAT` (and `SILTWAKE_JOB_YIELD` for soaks), and `SILTWAKE_SOAK_DEDICATED=1` with the machine label;
  - it prints a marker line whenever the heartbeat moves, so the factory side sees progress without polling.
- **Goals:** the same stall rule as local jobs, counted from the `testing <sha>` line; before that, the job is in the sandbox lock or `npm ci`. A stall, cancel or ceiling stops the job with `ssh kill -TERM <pid>`, checked against the recorded start time. `siltwake-job`'s trap then stops its scope.
- **Exit codes:** a 75 or 255 *before* the `testing` line is the sandbox's: pause, lock timeout or unreachable. After it, the code is the job's own. That is the only way to tell a job's own 75 from the sandbox's.
- **Fallback:** for `any` and `soak`, a sandbox-level 75 or 255 re-queues the same ticket locally with `fellBack: {reason, at}`, keeping its place (its `submittedAt`). A `4070` ticket goes back to waiting.
- **Recovery:** if the remote holder dies, reconcile probes the sandbox for `/work/tmp/lane/<ticket>/pid`. It stops the job if it's still running there, collects the exit, and frees the slot.

**5. Artifacts.** `--artifact PATH` (repeatable) names remote paths, such as REC-1's evidence-pack directory or `/work/results/<file>`. After the job, each one is fetched whole into `/work/tmp/<ticket>/` with `ssh tar -c | tar -x`, and the ledger records `artifacts: [{remote, local, bytes}]`. Evidence packs are first-class: a directory, never a single file. A failed fetch is reported (`artifacts: unavailable …`), never silently dropped.

**6. Evidence binding.** A remote job always tests a commit: the transport sends commits only. A dirty tree with an `any` or `soak` tag runs locally with the usual "not evidence" line. A dirty `4070` ticket is refused at submit ("commit first"). The ledger and the result record `machine` ("RTX 3090 (factory-worker)" or "RTX 4070 Laptop (alickers, shared desktop host)") and `sha`. `status` gains a MACHINE column.

**7. Frame times on the 4070.** The owner flags 4070 frame-rate numbers as possibly disturbed (it's a desktop PC in use). Proposal: soak frame rules on alickers are `recorded` with that label, not judged. Memory, graphics, hold and save rules are judged. That leaves frame judgement to exclusive runs on the 3090, PT-0's no-pause traversal included. **Needs your call.**

## Open points for the coordinator

1. **Sandbox `MemoryHigh` at 85% with no swap.** SCHED-1 measured that such a job is throttled rather than killed and crawls to its deadline. With hours-long ceilings, that could hold the slot for hours. Fleet owns `siltwake-job`, so I propose the change to them rather than make it. Meanwhile the remote holder could watch `memory.events` `high` on the sandbox and report a `throttled` stall.
2. **Direct `alickers-job.sh` callers:** keep the script as the transport, but after cut-over route callers through `heavy-check --machine …`. The script itself stays the documented fallback.
3. Frame-rule judgement on the 4070 (above).
4. **The sandbox's `npm ci`** runs inside the job's time. It's excluded from the stall clock until the `testing` line.

## Tests planned

- **Policy units** for routing every tag against every slot and health state, fallback ordering, and a `4070` ticket that never runs locally.
- **A private-state acceptance test against a fake sandbox:** an ssh stand-in script implementing `siltwake-job` semantics (lock, pause flag, 75 and 255) in a private directory. It covers stall, cancel, artifacts, fallback and recovery without touching the real sandbox.
- **One real canary on alickers** at handoff: a short `any` job, a `4070` probe and an evidence-pack fetch, recorded with the SHA.
