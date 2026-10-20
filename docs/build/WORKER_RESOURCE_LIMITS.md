# Factory-worker test limits

The 16 GiB worker also hosts T3, agents and Fleet. On 2026-10-19, B1's `failures.sh` full suite exhausted RAM and swap. The owner supplied the first incident report. Root independently stopped a rerun at 23:58 UTC: `render-lifecycle.test.js` PID443037 held 7,574,680 KiB RSS and 3,935,200 KiB swap; parallel `m2-region-render` held another 1,634,212 KiB RSS. Root terminated only the verified B1 test descendants of437409, leaving the author and shared services alive. Memory returned to approximately2 GiB used/13 GiB available, swap147 MiB and full memory-pressure avg10 0.20%. The exact allocation cause remains under investigation by the B1 author.

## Before running tests

1. Coordinate one heavy render/full-suite job at a time across this project. Other agents may continue editing or light checks. Use disk-backed `/work/tmp` or persistent home for large artifacts.
2. Wrap the entire test process tree in a user-systemd scope with a total-memory limit and no swap. Verify the child cgroup's limits before the heavy command. A V8 heap flag does not cap native allocations or ArrayBuffers.
3. For the current incident, isolate `render-lifecycle` with one test worker and a three-minute diagnostic deadline. Preserve timeout/OOM logs; investigate before retrying. Keep assertions and coverage meaningful.
4. After diagnosis, run required full checks with bounded concurrency and an explicit justified deadline. Record capped failures honestly. Raising the cap or retrying the same failing workload is not a fix.

Verified scope prefix on this worker:

```sh
systemd-run --user --scope --quiet --unit=siltwake-UNIQUE-TEST \
  -p MemoryHigh=5G -p MemoryMax=6G -p MemorySwapMax=0 \
  timeout --kill-after=10s 180s COMMAND ARGUMENTS
```

Replace the unit name with a unique job name and COMMAND with the intended isolated test. The 180s deadline is for diagnosis; choose a bounded full-suite deadline from measured healthy runs. Heavy jobs share the6 GiB budget, rather than each overlapping with its own6 GiB allowance. The GPU author's lightweight shell correction suite has a separate1 GiB cap and runs sequentially.

A harmless child probe read `/proc/self/cgroup`, then the corresponding files under `/sys/fs/cgroup`, and verified `memory.high=5368709120`, `memory.max=6442450944`, `memory.swap.max=0`. `MemoryOOMGroup` is unsupported by this systemd; omit that property. On timeout, inspect the exact owned scope for lingering descendants and stop that scope if necessary. Keep the parent agent and shared browser/services alive.

## GPU scope

The affected test uses Babylon `NullEngine`; it does not rasterize using a GPU. Attaching the3090 will not move its Node allocations or test orchestration into VRAM. Actual browser WebGL drawing can benefit once passthrough/driver setup is accepted and executed. At incident recovery, PCI inventory still showed only QXL and `nvidia-smi` was absent. Do not claim NVIDIA acceleration yet. QXL driver loading was not implicated by this incident.

## Shared heavy-check lock (2026-10-20, Opus coordinator)

All builders and reviewers run render tests, full suites and other heavy jobs through `scripts/heavy-check.sh` (absolute path `/home/worker/.t3/projects/subnautica-clone/scripts/heavy-check.sh` works from any worktree):

```sh
/home/worker/.t3/projects/subnautica-clone/scripts/heavy-check.sh --deadline 900 npm test
```

It takes a machine-wide `flock` on `/work/tmp/siltwake-heavy-check.lock`, so only one heavy job runs at a time, and waits for it rather than overlapping. It then runs the command in a 6 GiB, zero-swap user scope with a deadline. `HEAVY_MEMORY_MAX` takes whole gigabytes, for example `2G`. Exit 124 means the deadline passed, and 137 usually means the job hit the cap. Light work (typecheck, build, focused non-render tests) doesn't need the lock.
