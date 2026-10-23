# STEW-1: guard rails and small fixes (handoff)

Opus 5.5 high. Branch `t3/stew-1-guard-rails`, on root `f0dc680` (SAVE-1 merged). Head: see the report. Story-neutral; `docs/spoilers/*` not read. The scope follows the [steward verdict](https://github.com/lakeczar/subnautica-clone/blob/research/codebase-health/docs/build/audits/CODEBASE-STEWARD-VERDICT-OPUS.md) (`cc718962`), "STEW-1".

## Outcome
- **Each region sounds like itself (F11).** Audio resolved regions with the legacy four-owner art map, so the Ember Rift, the Mirror Divide and the Meridian District resolved to the Reef and the Basin, and their ambience never played. On a 20 m grid over the world the two maps disagreed at 6,632 of 9,858 points.
  - Audio now uses `regionAtPosition`, beside `regionAtPoint` in `content/regions/layout.ts`: the same answer optics, the timeline and now the HUD use.
  - `worldRegionAt` is renamed `legacyArtRegionAt`, for art residency only, and documented as not semantic.
  - **The HUD's region name** follows the map everywhere, and keeps the last region outside every footprint, as audio does.
- **The merge gate is one command (F28):** `npm run gate`. Its manifest (`scripts/gate.mjs`, `GATE`) *is* the gate:
  - the fast tier, with the guard;
  - the terrain bake, queued;
  - the build;
  - the six economy checks;
  - every playthrough scenario as a queued `--machine any` job.

  `--list` prints the manifest. `POST_MERGE` lists `scripts/saves-export.sh`, and the gate prints it as a reminder. DIRECTION's stewardship section points at it.
- **Drift is caught automatically:** `scripts/guard-architecture.mjs` runs first in `test:fast`, in about 0.9 s with the TypeScript compiler API and no new dependency. It fails on:
  - layering;
  - a new cycle or a new cycle member (ratcheted);
  - new driver plumbing;
  - a third `RecipeBuilder`;
  - a region lookup outside `layout.ts`.

  It prints the FORK markers, the shared roots' line counts and unreferenced value exports.
- **[CORE-HELPERS](../CORE-HELPERS.md):** "the one way to do it" table, the layering and cycle rule, the `// FORK(<id>)` convention and the *Open forks* register, seeded with five forks. Each fork also carries the marker in its module.
- **DIRECTION:** the gate, fork and guard lines, and the ten performance conventions, under "Codebase stewardship".

## Changes, item by item
1. **F11.**
   - `src/audio/director.ts` defaults to `regionAtPosition` and exposes a read-only `region`.
   - `src/runtime/app.ts`: the `regionAt` line, the import beside it and its comment. The render import goes.
   - `src/render/regions.ts`: the rename.
   - `src/ui/hud.ts`: the region-name lines and `lastRegion`. B1's context hints keep their own area test (`legacy`), since they are hints, not names.
   - **Tests** (`tests/audio-composed.test.ts`):
     - one point per region gets its own scene region and ambience profile;
     - the director's default resolver;
     - two points exactly on boundaries (x 64 and z −1000), resolved by footprint order;
     - outside every footprint, the previous region holds.
2. **F23** (`tests/regions-bake.test.ts`). Twelve mutually non-adjacent chunks are requested, and only their files ever arrive. The test waits for all twelve to settle. It then requires:
   - twelve full admissions and zero failures;
   - exactly 4 files and 4 × 300 kB kept, so eight were evicted;
   - those four served without a fetch, and only the evicted eight fetched again.

   The absent-file test waits on a condition instead of sleeping.
3. **F28.** `scripts/gate.mjs`, `npm run gate`. The six economy CLIs are classified:

   | Script | Class | Why |
   | --- | --- | --- |
   | `check-campaign-economy.mjs` | current invariant | both strategies' finite-stock ledger and real refits |
   | `check-m1-economy.mjs` | current invariant, after a split | its runtime check that the opening is solvent stays. Its adoption receipt is retired by DIRECTION's no-hash-inventory rule: the historical proposal's hash, the literal `expedition.3`/`expedition.7` tags, the hand-listed recipe roster (which broke on every new recipe) and the per-recipe reconciliation with `economy-candidate.json`. Git history keeps it. |
   | `check-m2-a-economy.mjs` | current invariant | predecessor payability, Basin reach |
   | `check-m2-b1-economy.mjs` | current invariant | the Creel's runtime economy |
   | `check-progression-curve.mjs` | current invariant | zero-renewal solvency of the implemented curve |
   | `upgrade-economy.mjs` | current invariant | upgrades payable at their tiers |
4. **The guard,** with today's allowlists:
   - **cycles:** Sol's 3 render and 13 sim modules, matched exactly by the guard's own Tarjan pass;
   - **drivers:** 21 archived drivers, including `cw1/traverse.mjs` and `col1/r6-shots.mjs` from CW-1 and COL-1, which are in flight, so their merges don't trip it;
   - **builders:** the two `RecipeBuilder`s;
   - **region lookups:** the WorldMap interface and implementation, and `legacyArtRegionAt`.

   An adapter that only delegates to `regionAtPoint`, and a function-typed option such as the timeline's injected `regionAt`, aren't lookups. **F14:** `TERRAIN_EXTENT` moved into `content/regions/terrain.ts`, and `render/terrainSurface.ts` re-exports it, so content no longer imports render. **Test:** `tests/guard-architecture.test.ts` runs the real repository (clean, two groups), then plants one of every violation into a copy of it and requires the exact nine failures, while the near misses pass:
   - a type-only import;
   - plumbing in `scripts/rec`;
   - a delegating region adapter.
5. **CORE-HELPERS and the fork markers:** `ledger` (SIG-1), `biome-recipe-builder` (WK-1), `lc-box-collider` (COL-1 B), `legacy-terrain` (TER-09: both `legacy*` modules get the header) and `stream-drivers` (REC-2, as the guard's allowlist).
6. **Small deletions and moves:**
   - **F20:** `flareLights`, `pilotMotion` and `upgradeLabel` deleted, with the imports they used.
   - **F18:** one duration formatter, `formatDuration` in `sim/clock.ts`, re-exported as `ui/format.ts` `duration`. `ui/systemsPanels.ts` and `sim/systems/journal.ts` use it. It sits in `sim/` because the journal is sim code, and sim may not import UI. The journal's `intervalSteps / 60` is now `* FIXED_SECONDS`.
   - **F19:** `survival.ts`, `recovery.ts` and `hunterEncounter.ts` import `FIXED_SECONDS`.
   - **F24:** the dormant `ca-1/ca1-bake-probe.heavy.test.ts` deleted, with `CA-1.md` updated. One `drain`, `rectOf` and `waitUntil` live in `tests/shared-support.ts`; four copies of `drain` and `rectOf` now import it.
   - **F25:** a scope line in the three app-loader test files and the browser support stub.

## Checks
- **`npm run gate` at `666fb71`, end to end, exit 0:**

  | Step | Result | Seconds |
  | --- | --- | ---: |
  | `fast` (1,402 tests and the guard) | pass | 79 |
  | `bake` (queued, cold after F14's source move) | pass | 515 (7 min of it queued) |
  | `build` | pass | 36 |
  | `economy:campaign`, `m1`, `m2-a`, `m2-b1`, `progression`, `upgrade` | pass | 1, 1, 2, 4, 6, 1 |
  | `playthrough` (queued `--machine any`; it ran here, ticket `261023-173955-d07b`) | 8 of 8 complete, no blockers | 1,478 |

- **`npm test`:** 1,402 of 1,402 at `9fe3f07`. The guard runs first: ok in 850 ms, 332 sources, 5 FORK markers, 30 unreferenced exports.
- **The guard's planted violations** (`tests/guard-architecture.test.ts`), each expected by name, and all fail:
  - a sim → render value import;
  - a DOM global in content;
  - a new two-module cycle;
  - a new member of the sim cycle;
  - `chromium.launch` and `createServer` in a new stream driver;
  - a `gpu-prep` require in `tools/`;
  - a third `RecipeBuilder`;
  - a `regionOf` outside `layout.ts`.

  A type-only import, `chromium.launch` in `scripts/rec`, and a delegating region adapter all pass.
- **F11 tests:** the four in `audio-composed`, plus the HUD's C3 region-name test, `ecology-composed` and `region-selection` (98 of 98 in that set).
- **F23:** the new test fails on an empty cache (files 0 ≠ 4), on no eviction (12 ≠ 4) and on a refetch of kept files.
- **One adverse case:** a point exactly on the Reef–Canopy edge (x 64) resolves to the Canopy by footprint order, in the map and in the audio scene alike. Outside every footprint (5000, 5000) the scene keeps its previous region.


## R1 fixes (Sol 6.1 xhigh R1, `1805c3dd`: four P2s and two P3s)
- **R1, the gate trusted exit codes.**
  - A queued step is now `heavy-check submit … --review -- <command>`, then `wait --json`. It counts only when its receipt has exit 0, no stop reason, no DISTURBED context, and evidence bound to the commit the gate pinned at its start (`receiptProblems`).
  - Every step also fails if HEAD or the tracked tree changed while it ran.
  - A dirty start is refused (exit 2); with `--allow-dirty` the gate runs, but its verdict is always FAILED.
  - The partial-gate label stays.
  - **Tests** (`tests/gate.test.ts`):
    - success, nonzero, cancelled, stopped-with-0, DISTURBED, unbound, wrong commit, pending and no receipt;
    - the real gate against a stand-in queue for five of those receipts;
    - a throwaway repository where the queued job edits a tracked file, and a dirty start.
- **R2, lazy imports and other extensions bypassed layering.**
  - Literal `import()`, `require()` and `import x = require()` are now layering edges.
  - A computed load in sim or content is refused outright.
  - `.mts`, `.cts` and `.tsx` sources are analysed, with `.mjs` and `.cjs` specifiers resolved to them.
  - Static edges alone form the cycle graph, since lazy ones can't make an initialization cycle.
  - Type positions (`typeof import(…)`, `import type`) stay exempt. Each form has a case.
- **R3, the cycle allowances didn't ratchet.**
  - Every cycle must now be exactly an allowance, and every allowance exactly a cycle. A shrink, a split or a retirement fails, naming the allowance to set, until the same change lowers it; after that a regrowth is a new member or a new cycle.
  - Stale driver allowances fail the same way.
  - The repository test checks that contract (cycles equal allowances), not a count. Shrink, retire and regrow have their own cases.
- **R4, the DOM check got bindings wrong.** I took the root fix.
  - `tsconfig.headless.json` (`lib: ["ES2022"]`, `types: []`, and `scripts/headless-platform.d.ts` declaring `ImportMeta.url`, `performance.now` and `structuredClone`) typechecks sim, content and everything they reach. It runs in `test:fast` (beside the normal typecheck, incrementally), in `npm run typecheck` and in the build. It passes today, with no SIM-1 changes.
  - The guard's DOM name list is deleted.
  - **Test:** `window` and `localStorage` fail under those options, while a parameter named `window`, an import aliased `window` and the three declared APIs pass.
- **R5:** both queued gate steps carry `--review`.
- **R6:** `// FORK(stream-drivers)` marks the driver allowlist. The guard reports distinct fork IDs separately from markers: 5 forks in 6 markers, because `legacy-terrain` heads both legacy modules. A test ties the marker IDs to the register's rows.
- **Optional, done:** the region-lookup exemption needs a real delegation shape: the whole body one call to `regionAtPoint` or `regionAtPosition`. A comment mentioning it, or a call plus a fallback, is a lookup again.
- **R1 evidence:**
  - **The fixed `npm run gate` at `14136e8`: exit 0, all 10 steps.** Both queued steps were judged on their receipts, each "evidence for `14136e89bd`" with `--review`:
    - bake (`261023-183508-165d`, 3090; queued 20 min behind an exclusive series, ran 0 s, warm);
    - playthrough (`261023-185606-d011`, routed by `--machine any` to the RTX 4070 on alickers, 19 min, 8 of 8 complete, no blockers).
  - `npm test`: 1,410 of 1,410.
  - Guard 838 ms; headless typecheck 0.9 s incremental, 4.7 s cold.
- **Docs:** WORKER_RESOURCE_LIMITS states that `--class exclusive` is refused off the 3090 (use `--class gpu --machine 4070`), and that commands reading `.test-build*` or `dist` can't go to alickers (compile inside the job).

## R2 fixes (Sol 6.1 xhigh R2, `b6a03882`: two P2s and one P3)
- **R2-1, extensions dropped from collection and headless roots.**
  - One set, `TS_EXTENSIONS`, built from TypeScript's own `ts.Extension` values (`.ts`, `.tsx`, `.mts`, `.cts`; declaration files excluded), now drives collection, source analysis and the driver scan.
  - `tsconfig.headless.json` roots sim and content with recursive includes (`src/sim/**/*`), so the compiler's own discovery picks every supported extension.
  - **Tests:** a disk-backed scratch repository whose `.mts`, `.cts` and `.tsx` sources are collected (a `.d.mts` is not) and each fails as planted. The real headless config, copied into a scratch repository, roots a `.mts`, `.cts` and `.tsx` plant (one imported by an upper-layer `src/runtime/app.ts`) and rejects their `window`, `localStorage` and `document`.
- **R2-2, a barrel outside sim and content laundered a forbidden value.**
  - The layering check now follows value edges (static and lazy, never type-only) through every module outside sim and content. Any path to render, UI, audio or Babylon fails, naming the chain.
  - It is a fixed point over the whole graph: each outside module's next hop toward a forbidden target. Cycles are handled, so the guard stays at about 0.9 s.
  - **Tests:** a render barrel, a Babylon barrel, an `export *` two-hop chain, a loop of barrels where only one member touches render, and a type-only barrel that stays exempt.
  - **No false positives:** root and the merge trees of CW-1, REC-1, COL-1, SIM-1 and TST-16 with this branch all pass.
- **R2-3, the waiter's own status was ignored.** A queued step also fails when its waiter exits nonzero, is killed or fails to start, even after printing a good receipt. Tested with exit 7 and SIGTERM.
- **R2 evidence:**
  - **`npm run gate` at `0c9b2ff`: exit 0, all 10 steps.** Both queued receipts were "evidence for `0c9b2ffde3`", with `--review` and a clean waiter:
    - bake `261023-220139-8523` (3090, warm);
    - playthrough `261023-220215-732b` (`any` ran here on the 3090 this time; 21 min, 8 of 8 complete, no blockers).
  - `npm test`: 1,415 of 1,415. Guard about 0.9 s.
- **Composition (coordinator's decision):**
  - `scripts/headless-platform.d.ts` now declares `TextEncoder`, `TextDecoder` and `AbortSignal`: real in Node ≥ 22 and workers, with only the members code uses. `LockManager` is deliberately not declared.
  - **Codec check:** CW-1's kit-codec pattern and SIM-1's cancellation pattern typecheck under the real headless config, and a UTF-8 round trip, `AbortSignal.abort`, `reason` and `throwIfAborted` behave so at runtime.
  - With this branch, CW-1's merge tree passes the headless typecheck. SIM-1's fails only on `LockManager` in `src/save/writer-lock.ts`, which SIM-1 splits into a portable port and a browser adapter.

## R3 fixes (Sol 6.1 xhigh R3, `763cbcc5`: two P2s)
- **R3-1, inline type specifiers.**
  - Under `verbatimModuleSyntax`, `import { type X } from` and `export { type X } from` still emit `import {}`/`export {}` and run their target. They are now runtime edges, for layering and cycles; only statement-level `import type`/`export type` are erased.
  - Root's cycles are unchanged by this (still exactly the two allowances).
  - **Tests:** a direct import, a direct re-export and a barrel case fail; statement-level types pass. Under the project's own compiler options, `transpileModule` shows the empty import and re-export emitted, and the statement-level forms erased.
- **R3-2, the closure failed open at unanalysed edges** (the coordinator's fail-closed design).
  - The layering rule follows sim and content's runtime closure through reachable modules in **any directory**, parsing reachable TypeScript lazily.
  - Every path must end in JSON data, a package on `PORTABLE_PACKAGES`, or TypeScript the guard analyses. Each `PORTABLE_PACKAGES` entry needs a one-line reason; the list is empty, because sim and content reach no package today.
  - Anything else fails, naming the chain: render, UI, audio or Babylon; any other package or Node builtin; JavaScript (which the headless typecheck doesn't check); a module the guard can't find; a computed `import()`/`require()` in any reachable module.
  - **Tests** (disk-backed scratch repositories):
    - Sol's four probes: a Babylon barrel in `tools/`; a side-effect import of a `.js` module using `document`; a computed load in a reachable `src/world` helper, plus two hops up through a relay; `vite/dist/client/client.mjs`.
    - Also `node:fs` and a missing module, all failing as expected.
    - JSON data and a TypeScript helper in `tools/` reached through `src/world` pass.
- **Gate:** `--machine M` sends every queued step to one machine, replacing its own tag (used for this round's gate while CW-1 holds the 3090). Tested.
  - **What fails today:** nothing. Root and the merge trees of CW-1, REC-1, COL-1, SIM-1 and TST-16 with this branch pass, with no allowlist entry added.

## Compromises (each with its root fix and cost)
1. **The guard's region-lookup and driver rules are name and text patterns,** not semantics. A lookup named otherwise (`whereIs`), or a driver hidden behind a helper, passes; a delegating adapter must have the exact delegation shape.
   - **Root fix:** the per-wave review, and REC-2 moving every driver onto `scripts/rec`, which leaves nothing to hide.
   - **Cost:** none now. A semantic check (data flow into `FOOTPRINTS`) would cost M and still guess.
2. **Fixed in R1 (R4):** the DOM name list is replaced by the headless typecheck.
3. **The recorder's `STEPS = 60` is left** (F19). `sim/timeline/recorder.ts` is being rewritten on SIM-1's branch.
   - **Root fix:** SIM-1 imports `FIXED_SECONDS` there. **Cost:** S, in SIM-1.
4. **CW-1's `tests/cw1-bake.heavy.test.ts` keeps its own `drain`/`rectOf`** until it merges, since it isn't on root.
   - **Root fix:** import `tests/shared-support.ts` at its merge. **Cost:** S, for the coordinator or CW-1.
5. **The HUD's region names changed** where B1's hand-drawn split disagreed with the map. Inside B1's area it said "Upper Lantern Canopy" and "Splitspine shore"; now it says "Lantern Canopy" and "Splitspine Isles". The B1 lines put about 1,640 sample points in "Splitspine shore" that the map calls Hearth Reef.
   - This is a visible text change I chose for consistency, because the sub-area names had no recorded design. If the owner wants sub-area names, the root fix is a sub-area layer on the map, not a second geography in the HUD. **Cost:** S/M.

## Missing evidence
- **No in-browser listen** to the Rift, Divide and Meridian ambiences, or look at the HUD names; these are headless tests only. The owner's playtest is the judge of the mix.

## Known limits
- **The guard's unreferenced-export list** (30 at the head) is a report, not a verdict. Several are planned content or tool APIs (Sol's F20 caution). The per-wave review decides.
- **The gate is serial:** about 35 minutes end to end at `666fb71`, most of it the queued playthrough (25 min on factory-worker, 3 CPUs) and the queued cold bake.
