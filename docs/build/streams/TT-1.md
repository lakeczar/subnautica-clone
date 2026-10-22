# TT-1: the fast tier is fast again

Opus 5.5 high. Branch `feat/tt-1-test-speed` from `48612f5`, with root merged at `c649b11` (CA-3, CB-2), `1ccce66` (HUB-2) and `86e2ff1` (DISH-1). R1 responses are at the end. Scope: test files and tiering mechanics, plus pure caching hooks in production code (listed below). No assertion was deleted or weakened; every test that left the fast tier runs unchanged in the heavy tier.

## Result

Times on the shared 6-vCPU VM; other agents were running, so each pair was measured back to back.

| | Before (root `c649b11`) | After |
| --- | --- | --- |
| `npm test` (load 11–15) | **512 s** (typecheck 17 s + clean compile 30 s + tier 480 s), 1,256 tests | **99 s** (typecheck and compile 12 s incremental + tier 92 s), 1,254 tests |
| fast tier alone, quieter VM | 352 s (load 12 falling to 6), 1,128 s CPU | **56–61 s** (load 4–9), 253–260 s CPU |
| `npm run test:heavy` (through `heavy-check.sh`) | **955 s**: 33 files, 394 tests, one at a time | **293 s**: 57 files, 434 tests (850 s of file time, up to 3 at once) |
| `npm test` after merging HUB-2 (load 14–18; HUB-2's source changes refill part of the cache) | | 220 s, 1,255 tests |

Counts as of R1: 41 tests moved to heavy (40 byte-identical, 1 helper refactor); 34 smokes and the new cache and budget tests stay in the fast tier.

`npm test` reaches about 60 s when the VM is not saturated. When six agents load it, the tier stays CPU-bound at roughly 250 s CPU over 5 workers.

## What changed

1. **Build cache** (`src/content/buildCache.ts`, `scripts/test-build-cache.mjs`). Deterministic world data is built once and reused by every test process: cave definitions and volumes, both cave shells, cave light fields, cave collar columns, the passages' and tethers' draped keel lines, and large-cave layouts and chunk meshes. It was rebuilt in each of about 40 processes (`gameWorld()` alone cost 8–20 s, and every import of `passages.ts` and `rescue.ts` cost 1.7 s of draping).
   - **Keys:** each entry is filed under the entry's own key (the source data, as JSON) and a hash of the compiled text of the *import closure* of the modules it names: the module that builds it and the module defining its floor. Editing cave or terrain code, or content they import, misses. Editing anything else keeps it warm.
   - **Unnamed floors** (a test's synthetic floor) are never cached. Floors opt in with `nameFloor(fn, name, [import.meta.url])`.
   - **The game installs no store:** `cachedBuild` just calls the builder, and `floorKey` returns before serialising anything.
   - **Safety:** writes are atomic (temporary file, then rename). An entry is used only when its stored key matches. Time spent filling the cache is not charged to a file's budget. Directories unused for 24 h, or beyond the newest 24, are pruned. `SILTWAKE_BUILD_CACHE=off` disables it.
   - **Fidelity:** `tests/build-cache.test.ts` checks that a store-served cave equals a fresh build in its definition, volume, both shells and light field. The Fanvault determinism test now builds fresh (`withoutBuildCache`), so it compares a fresh build with a cached one.
2. **Incremental compile** (`scripts/test-build.mjs`). `tsc --incremental` for the test build and the whole-project typecheck, run in parallel, with build info in `.test-build`. Compiled files whose source is gone are pruned, so a renamed or deleted test can't keep running. If a test lost its output, the build reruns clean, and `--clean` forces one. A no-change rebuild takes 5–9 s, against 47 s before.
3. **Fast-file budget** (`scripts/test-tier.mjs`, `scripts/test-file-timing.mjs`).
   - **What's measured:** each fast file's main-thread CPU, less cache fills.
   - **Thresholds:** **over 5 s, a warning; over 10 s, the tier fails.** The gap is headroom, because CPU per file inflates up to about 1.8× when the VM is loaded. Files run alone measure 0.1–5 s.
   - **Output:** every run prints the 8 slowest files and writes them all to `.test-build/fast-timing.json`.
   - **Overrides:** `SILTWAKE_FAST_FILE_WARN_S` and `SILTWAKE_FAST_FILE_BUDGET_S` (0 turns a check off). `tests/tier-guard.test.ts` probes both the warning and the failure.
   - **Concurrency:** `min(5, cores − 1)`, so 5 on this VM (was 4). Fast files peak at 140–600 MiB inside their 1 GiB heaps.
4. **Heavy pool, with per-file containment** (since R1; see R1-1 below). Each heavy file's budget covers its whole process tree, enforced by its own child cgroup in the delegated `heavy-check.sh` scope. Files share a pool of up to 3, within three quarters of the job's memory (at most 4.5 GiB), largest first. Elapsed-time files run alone. Without delegation, files run one at a time. Each file's output is printed whole when it ends. Overrides: `SILTWAKE_JOB_CPUS`, `SILTWAKE_HEAVY_CONCURRENCY`, `SILTWAKE_HEAVY_POOL_MIB`. *DIRECTION's "Tests" line, which says heavy runs one file at a time, folds into SCHED-1's DIRECTION edit.*
5. **Cheaper tests, same assertions:**
   - **CA-1 and Fanvault rock queries** (`caves-reef-isles-support.ts`, `cave-support.ts`): rock solids in cells rather than X/Z columns (2 × 8 × 2 m for CA-1, 2 m for the single Fanvault).
     - `inRock` returns the same boolean.
     - `rockDistance` is exact within `reach`, and every caller compares against a threshold at or below `reach`.
     - The CA-1 source sweep remembers the last column's floor.
     - Results: the Reef shell check dropped from 13 s to 1.7 s, the Fanvault one from 4.4 s to 1.3 s, and the heavy full-stride versions speed up the same way.
     - The same change in `caves-canopy-basin-support.ts` was reverted. With 2 m cells its index held 56 million entries and pushed `caves-basin.heavy` over its memory budget, and that support only serves heavy files.
   - **`c4-cave-bake`:** the neighbour-edge test computes each chunk's live recipe once per LOD instead of once per pairing (5.2 → 1.4 s).
   - **Named test floors** for the cache: `cave-support.ts` (`shiftedFloor`) and `large-cave-support.ts` (`vaultFloor`).

## Moved to the heavy tier (verbatim) and their fast smokes

Of the 41 moved tests, 40 are byte-identical to root's and one is the `regions-bake` refactor below. `/work/tmp/tt1/verbatim.py` checks every root test against `86e2ff1`. Each fast file keeps a smoke: the same checks on a subset (fewer starts, points, cuts or poses, or a shorter run), or the cheap half of the test.

| Heavy file (new) | Moved from | Tests moved | Fast smoke left behind |
| --- | --- | --- | --- |
| `hub-caves.heavy` | `hub-caves` | shell vs rock (every point), roofs and collar (every edge), lamp-off retreat (every start), sealed-crown control | every 64th shell point and room cell; collar every 8 m; spur-cave retreat from every 4th start; sealed step-arch control |
| `regions-world.heavy` | `regions-world` | first access, sealed-deposit control, rescue proof, wrong-mooring controls, continuous-sweep regression | the checkers aren't vacuous; stages breathable; analytic sweep cases |
| `large-cave-canopy.heavy` | `large-cave-canopy` | sampling (two chunks), LC-01 collar poses, diver spurs | one R1 collar point; the hall chunk's sampling |
| `large-cave-vault.heavy` | `large-cave` | every-chunk sampling, 120 mouth trials | every 4th chunk; the first 20 trials (same seed) |
| `enc-1-readable-threats.heavy` | `enc-1-readable-threats` | disengagement, silhouette pass, cue events, bump beside rock (18 cases) | quiet and dark for every hull; a 24 s Dart flight; one bump case plus powered collision |
| `c4-systems.heavy` | `c4-systems` | ADVERSE decode and crop death (18 game-minutes) | the death half; both jobs resume after reload |
| `world-journey.heavy` (renamed) | `world-journey` | both journeys | `world-journey-smoke`: first leg plus helm service; station restore and breathe |
| `regions-bake-decode.heavy` | `regions-bake` | decode equals live, six chunks | two chunks (the legacy seam's skirt, the Divide brine's mirror mesh) |
| `m2-hunter-reconciliation.heavy` | `m2-hunter-reconciliation` | 1,800-step stall, level fallback at three poses | the first 300 steps; one pose until contact |
| `ecology-composed.heavy` | `ecology-composed` | split-chimney vent, bare and shrouded | shroud fabricated and fitted; mapper call |
| `ecology-hazards.heavy` | `ecology-hazards` | warning before harm, every field × actor × phase × resumed load | phase 0, resumed at 0 and 99.9 |
| `c3-save-integrity.heavy` | `c3-save-integrity` | C3-R1-2 plume disables the Creel (up to 12,000 steps) | exposure, disable, salvage, saves |
| `c4b-fixes.heavy` | `c4b-fixes` | C4B-07, two whole watched periods | logged without gathering; out-of-view phase untimed; reload |
| `cave-light-retreat.heavy` | `cave-light` | sealed-cave retreat, every start | every 12th start |
| `vistas.heavy` | `vistas` | vista solids against every route, first access and rescue | keep-outs and pose clearance |
| `carrier-boundary.heavy` | `carrier-boundary` | 2,000-tick ascent and reverse; interruptions at 8 edges × 2 configurations | 500 ticks; one corner, medium |
| `rib-surface-trap.heavy` | `rib-surface-trap` | 72 export replays; Dart traps at 12 yaw/pitch | level replays in six directions |
| `expedition.heavy` | `expedition` | tow resumed from 13 saved cuts | the ready cut and the last tow cut |
| `c4-world.heavy` | `c4-world` | powerless diver from 16 shelf-race starts | two starts |
| `currents.heavy` | `currents` | powerless escape from a grid of starts in every lab current | one grid start per current, all six tries |
| `m2-route-recovery.heavy` | `m2-route-recovery` | every loss endpoint towed home | the first and last endpoints |
| `world-queries.heavy` | `world-queries` | 120 random queries per hotspot, indexed vs full scan | 20 per hotspot |
| `poi.heavy` | `poi` | dish bands, every 5th vertex | every 25th vertex |
| `dishes.heavy` (R1) | `dishes` | dish collision against every passage, rescue tether, first access and carrier lane | routes and carrier lanes only |

The only heavy change that is not a verbatim move: `regions-bake`'s six-chunk decode check now lives in `regions-bake-support.ts` as `assertDecodedMatchesLive(c)` (the same statements), run over all six chunks in `regions-bake-decode.heavy.test.ts` and over two in the fast smoke.

**Heavy budgets** (`tests/heavy-budgets.json`):
- **New heavy files:** all peak at 107–492 MiB, under the 1,024 MiB default.
- **Since R1, peaks are whole process trees** (cgroup `memory.peak`, which includes page cache the kernel can reclaim). `regions-bake` measured 1,469 MiB as a tree, so its budget is **1,920 MiB**.
- **Two raised before R1:**
  - `world-stream` to **1,536 MiB** (from 1,280). It peaked at 1,286 MiB with two other files running beside it. Root runs it at 1,216 MiB alone, and the cache lowers it: 1,171 MiB on, 1,200 MiB off.
  - `caves-reef-isles-retreat` to **1,280 MiB** (from 1,024). Root runs it at 1,009 MiB, 98% of its budget.
- **Still close:** `regions-stream` (933 of 1,024 MiB) and `caves-deep-perf` (875) are the nearest to their budgets.

## Production code touched (pure caching only)
- `src/content/buildCache.ts` (new): the cache hook.
- `caveGeometry.ts`: `buildCave` and `caveShell` go through the cache; `derivedCacheKey` added.
- `caves/authored.ts`: `groupDef` names its derived cave floor.
- `drape.ts`: `drape` goes through the cache.
- `worldFloor.ts`: names `worldFloor`.
- `sim/world.ts`: names `surfaceHeight`; caches `collarColumns`.
- `render/caves/lightField.ts`: `caveLightField` goes through the cache.
- `world/caves/large/build.ts`: an unbaked cave's validated layout and chunk meshes go through the cache.

## For merges (other builders' files)
- **Pure renames:** `world-journey.test.ts` → `world-journey.heavy.test.ts`, with a new `world-journey-smoke.test.ts`.
- **Moved tests:** test blocks moved out, plus helpers into new `*-support.ts` modules:
  - CW-1: `hub-caves`, `regions-world`, `large-cave`, `large-cave-canopy`, `cave-light`, `c4-world`, `c4-cave-bake`;
  - CR-1: `ecology-composed`, `ecology-hazards`, `enc-1-readable-threats`;
  - HUB-2: `c4-systems`, `c4b-fixes`, `carrier-boundary`;
  - dish/vistas: `vistas`, `poi`;
  - others: `rib-surface-trap`, `m2-hunter-reconciliation`, `m2-route-recovery`, `currents`, `c3-save-integrity`, `regions-bake`, `world-queries`, `expedition`.
- **Small in-place edits:**
  - `expedition`, `world-queries`, `m2-route-recovery` and `poi`: the smoke replaced the moved test in place, changing two or three lines;
  - `caves.test.ts`: the determinism test;
  - `c4-cave-bake.test.ts`: the memo.
- **If an incoming change edits a moved test,** apply it to the `.heavy.test.ts` copy, and to the smoke where it applies.

## Not done, and recommendations
- **Remaining cost is production hot paths**, out of TT-1's scope:
  - `stepGame` deep-clones the whole state every tick (`structuredClone`, about 70% of every simulation test);
  - `authoredFloor`/`nearestOnPolyline` (terrain sampling);
  - world-query `moveCapsule` loops.

  Speeding these up would help the game as well as the tests.
- **Warnings:** under load, about half a dozen files exceed the 5 s warning (`caves-reef`, `enc-1-readable-threats`, `large-cave-streaming`, `ecology-composed`, `regions-bake`, `hub`, `playthrough`). Run alone, all are under 6 s.
- **Tried and dropped:** Node's compile cache (no gain); `--single-threaded` V8 (17% less CPU, but no wall-time gain under load, and it charges GC to the main thread).

## Checks
- Before R1: `npm test` passed 1,255 fast tests after merging HUB-2 (1,254 before it); `npm run test:heavy` passed 56 files and 434 tests in 293 s. The R1 checks are at the end.
- The fast tier also passes with `SILTWAKE_BUILD_CACHE=off`, cold.
- Evidence and probe scripts are in `/work/tmp/tt1/` (timing runs, profiles, `verbatim.py`).

## R1 review (Sol xhigh, `3f2dc27`): responses

Root merged at `86e2ff1` (DISH-1). All four P2s and the P3 are fixed.

- **R1-1 · P2 — heavy budgets now cover the whole process tree.**
  - **Delegated scope:** `scripts/heavy-check.sh` starts its scope with `Delegate=yes` and exports `SILTWAKE_HEAVY_CGROUP=delegated`. The runner (`scripts/heavy-containment.mjs`) then moves the job's own processes into a leaf and gives each heavy file its own child cgroup: `memory.max` at the file's budget, swap off, and `memory.oom.group`.
    - The kernel enforces the budget over the file's whole tree and kills only that tree.
    - `memory.peak` is reported as the file's peak.
    - `cgroup.kill` clears stragglers when the file ends.
    - Only OOMs caused by the file's own limit count against it (`memory.events.local`), so a nested runner's file isn't charged to its parent.
  - **Fallback:** without delegation, files run **one at a time** with their process group watched (resident memory summed every 100 ms, the group killed over budget). Sampling isn't sound containment, so files don't share.
  - **Pool:** follows the job's grant. `SILTWAKE_JOB_CPUS` sets concurrency (1–3), and three quarters of the scope's `memory.max` caps the budgets reserved at once (at most 4.5 GiB). The explicit `SILTWAKE_HEAVY_CONCURRENCY` and `SILTWAKE_HEAVY_POOL_MIB` overrides still win.
  - **Regression:** `tests/heavy-tier.heavy.test.ts` runs the real runner on two probe files whose child processes allocate memory. The one over budget fails alone; the one under budget passes, and its peak includes its child. It passes in both modes through `heavy-check.sh`.
  - **Bake measured:** the terrain bake in `regions-bake.heavy` peaks at **1,469 MiB as a tree**; the old per-PID watchdog saw 54 MiB. Its budget is now 1,920 MiB.
  - **For SCHED-1:** heavy-check v2 must keep `Delegate=yes` and `SILTWAKE_HEAVY_CGROUP=delegated`, or the runner falls back to one file at a time.
- **R1-2 · P2 — the deep-cave cost test times generation.** `caves-deep-perf.heavy` wraps its measured `buildCave` in `withoutBuildCache`; its other fixtures stay cached.
  - **Audit of every elapsed-time assertion:** this was the only measured operation that ran through the cache. The others time world queries (`moveCapsule`, `supportHeight`) or terrain decode steps, which the cache doesn't touch.
  - **Contention policy:** files asserting elapsed time are listed under `exclusive` in `tests/heavy-budgets.json` (`caves-deep-perf`, `caves-canopy-basin`, `caves-reef-isles-game`, `large-cave-canopy`). The runner starts them with no other heavy file running.
- **R1-3 · P2 — cache fills are charged on the same clock.** The browser-side hook no longer times anything. Instead, a store may wrap a miss's build (`fill`). The Node store measures fills with `process.threadCpuUsage()`, the clock the budget reads, and counts only the outermost of nested fills.
  - **Test:** a `tier-guard` probe holds a fill that waits 1 s without CPU, burns 200 ms, and nests a 100 ms fill. The file then burns 300 ms outside the fill. Cold and warm runs both charge the outside 300 ms. The cold fill counts about 300 ms, not 1.3 s, and the nested fill counts once.
- **R1-4 · P2 — the budget probe burns measured CPU.** It burns 300 ms of `threadCpuUsage()`, bounded at 30 s of wall time, against a 0.1 s budget. Under the reviewer's 10% CPU scope command it passes, and so does the new fill test (15 s with a 90 s limit).
- **R1-5 · P3 — runtime in the namespace.** Every cache directory hash now includes a format salt (`siltwake-build-cache/1`), the Node and V8 versions, and the platform and architecture. `build-cache.test.ts` checks that another runtime gets another namespace.
- **Counts corrected:**
  - At R1, 40 tests had moved: 39 byte-identical and 1 helper refactor (`regions-bake`'s decode check). Since then DISH-1's whole-world access test also moved (below), so **41 moved: 40 byte-identical and 1 refactor**. The other fast-tier changes are 33 smokes and 5 new tests before DISH-1, plus the dishes smoke.
  - The heavy tier has **59 files**: root's 34 (with DISH-1's `dishes-envelope`) and 25 new.
  - Three root tests changed in place by design: the `c4-cave-bake` memo, the Fanvault determinism oracle, and the `caves-deep-perf` bypass above.
- **DISH-1 merge:** its new `dishes.test.ts` used 10.3 s of CPU alone, over the new 10 s budget. Its whole-world access test ("dish collision leaves every passage, rescue tether, first access and carrier lane clear") moved verbatim to `dishes.heavy.test.ts`. A routes-only smoke stays, and the fast file now takes 3.2 s.

**Checks after the R1 fixes** (8-vCPU VM):
- `npm test`: **57 s**, 1,264 of 1,264 pass (load 6–8, 284 s CPU); five files warned, none failed.
- `npm run test:heavy` through `heavy-check.sh`: HEAVY_R1.
