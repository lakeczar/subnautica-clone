# Codebase steward verdict (Opus 5.5)

2026-10-23. The decision on Sol's [codebase health audit](CODEBASE-HEALTH-SOL.md) (`c912151`, 28 findings).

**What I read:** the audit in full; STATUS, DIRECTION (including *Codebase stewardship*), GAME-DIRECTION, the end of STREAMS (through `eb922b1`); and the compromise verdict, whose plan is being executed.

**What I checked in source:**
- the two REC defects (`b65dfbb`);
- the yaw convention in both `RecipeBuilder`s;
- both region lookups, the temporary ledger, the three unused exports and the cache-budget test;
- the panel refresh cadence;
- SIM-1's corridor search at Sol's frozen SHA and at its tip;
- REC's light selection at its tip.

**What I measured:** two light runs, listed at the end. No game code was changed, no browser was used, and no spoiler files were read.

## Verdict

**Is the codebase curated to be fast, obvious and reused? Mostly sound underneath, but not curated. The drift has four causes, and each has a cheap standing fix.** The foundations Sol credits are real, and I confirm them:
- one typed `WorldQueries` seam;
- one composed content registry;
- strict TypeScript;
- the bounded scene geometry cache;
- deterministic streaming clocks;
- the save library;
- the heavy-job queue.

What went wrong is that **parallel streams were told to write new modules beside the shared ones, and nobody was told to delete the interim copy once the real one was composed.** So there are two inventory ledgers, two mesh builders, two collision paths, two region maps, a dozen copied browser drivers and six economy scripts that nobody agrees are "the five".

**What actually matters to the player, in order:**
1. **A live audio bug.** Sol found one disagreeing point between the two region maps. I ran both maps across the world, and it's much wider than that. **The audio picks its region from the old four-region map, so three of the seven regions never play their own soundscape.** The Thermal Rift plays the Refuge Reef's ambience, the Brine Divide and the Deep District play the Basin's, and the eastern Isles play the Reef's. The Rift, Divide and Deep profiles exist in `src/audio/profiles.ts` but can never be selected. It's a small fix and must land before the owner's playtest.
2. **Two evidence defects in the recorder.** A view that never stops changing gets certified "stable", and a re-accepted baseline can keep its old picture under a new hash. Both are confirmed in source. REC-1 is already fixing them in its R1 round.
3. **One test that can pass while testing nothing:** the terrain cache-budget test passes with an empty cache.
4. **Per-frame costs:**
   - **Real, and already being fixed:**
     - the per-tick state copy (SIM-1);
     - light sorting and query allocations (CW-1, already fixed on its branch);
     - the old diagnostic counters, which scan every mesh every frame (0.13 ms a frame on the 3090).
   - **Not real problems, by measurement:**
     - the targeting scan costs about 30 µs a frame;
     - the craft profiles cost 1–5 µs for the whole fleet;
     - the panel "dry runs" happen on a click, not every frame.

     I'm not spending builder time on these.

**What I'm deciding:**
- **No big refactor.** Most findings fold into streams that already own the code: SIM-1, CW-1, COL-1 B, REC-1, WK-1 and SIG-1.
- **Two short streams, both continuations of an existing slot:**
  - **STEW-1:** guard rails and small fixes. The audio bug, the empty test, one declared merge gate, an automatic architecture check, a one-page "core helpers" index and a handful of deletions.
  - **REC-2:** one evidence driver. The recorder's harness becomes the only browser, server, steering and save-fixture layer. Soak and the cave traversal move onto it, and the per-frame diagnostic counters are deleted.
- **Accepted as they are, with reasons:**
  - the large shared root files (split by need, not by line count);
  - the legacy terrain, which still owns the accepted opening terrain;
  - the four random-number generators (changing one moves the art);
  - the mixed feedback model, until after the playtest, with new code following the typed-outcome convention.
- **Standing practices:**
  - a register for interim copies, so every copy names the stream that deletes it;
  - one evidence driver library;
  - a short performance convention list for every builder brief;
  - a cheap, fixed per-wave architecture review.

**Owner decisions: none required.** One thing to know: REC-2 delays the next content stream in its slot (BIO-1 or SIG-1) by one short stream. I recommend it anyway, because MEM-1, the soaks and PT-0 all run on those drivers.

## Root causes of drift, and the practice that stops each

| # | Root cause | Evidence | Standing practice |
| --- | --- | --- | --- |
| 1 | **Composition wired things in, but nothing retired the interim copy.** DIRECTION told streams to write new modules beside B1's roots, which was right at the time. But "the coordinator composes" never included "and deletes the fork". | `systems/ledger.ts:1` still says "temporary until composed" after composition (F12); the TER-06 builder (F08); LC's box collider beside the kit path (F09); `worldRegionAt` serving audio from the legacy map (F11); COL's oracle copying a production builder (F24). | **The fork register.** An interim parallel implementation carries `// FORK(<id>): <what it duplicates>; retire in <stream>` and a row in [CORE-HELPERS](../CORE-HELPERS.md)' *Open forks* table. A stream that composes or replaces something deletes the fork in the same merge, or names the stream that will. The architecture guard prints the count, and the per-wave review fails any fork whose retiring stream has merged. |
| 2 | **Evidence tooling was disposable per-stream code that became permanent.** Each stream needed a browser and copied the last stream's. | 14 `chromium.launch` and 16 `createServer` sites in `docs/build/streams`; three servers sharing 144 of 147 lines; 13 hardcoded `/work/tmp/gpu-prep/pw/` requires; three active browser layers (soak, CW traverse, REC); 12 save-derive scripts with different semantics (F26). | **One driver library: `scripts/rec/`** (REC-2 makes it so). Streams write a *scenario* (route, provenance, what to record) and never browser, server, GPU or save plumbing. The guard bans new `chromium.launch`, `createServer` and `gpu-prep` requires outside `scripts/rec`, `scripts/heavy` and `scripts/soak`; existing archived files are allowlisted. Test fixtures come from the SAVE-1 library; seeded diagnostic saves are labelled as such. |
| 3 | **Performance was found by profiling afterwards, not built in.** No written hot-path conventions, so each stream chose its own: a full sort for 12 lights, allocating spatial gathers, every-frame DOM counters, every-frame streaming rankings. | F03, F04 and F07; the GC correction at STREAMS `:562` (24–50 ms pauses from game allocation). | **The performance conventions below,** quoted in every builder brief and checked in every review. A handoff that touches a hot path states its per-call cost and allocations. |
| 4 | **Contracts lived in shorthand and memory, not in code.** "All five economy scripts", "stable", `legacy*`, "temporary until…". Each meant something different by the time the next agent read it. | F28: COL's and SIM's "all five" are different sets, from six scripts; F21: "stable" was always true; F10/F11: names that no longer say what the code does. | **Declared, not remembered:** one `npm run gate` command whose manifest *is* the merge gate; a name changes when its role changes; a "temporary" comment names its retiring stream (the FORK marker), or it isn't allowed. |

### What the guard rails are, concretely
- **`scripts/guard-architecture.mjs`** (STEW-1), with no new dependency. It uses the TypeScript compiler API already in `devDependencies`, the same method Sol used for its import graph. It runs inside `test:fast` in about a second and fails on:
  - a value import from `src/sim/**` or `src/content/**` into `src/render/**`, `src/ui/**`, `src/audio/**`, Babylon or the DOM;
  - **a ratchet on value-import cycles:** today's two strongly connected groups (3 render modules and 13 sim modules) are allowlisted by membership. A new cycle, or a new member, fails;
  - the banned driver patterns from root cause 2, outside their owning directories;
  - a second exported `class RecipeBuilder`, or a new region lookup outside `content/regions/layout.ts`.

  It also prints, without failing: the FORK count, the LOC of the shared roots (`app.ts`, `step.ts`, `world.ts`, `panels.ts`, `renderer.ts`, `caveGeometry.ts`, `registry.ts`), and exported names with zero references. The per-wave review reads these.
- **`docs/build/CORE-HELPERS.md`** (STEW-1, one page, owned by the coordinator, updated by each per-wave review). Its *The one way to do it* table maps each job to its owner module:

  | Job | Owner module | Notes |
  | --- | --- | --- |
  | Region at a point | `content/regions/layout.ts` `regionAtPoint` | The only semantic lookup |
  | World queries | `WorldQueries`, `dataInBox` with a caller buffer | For hot callers |
  | Static collision | COL-1's `StaticCollider` | After stage B |
  | Babylon-free meshes | the kit `RecipeBuilder` | After WK-1 |
  | Inventory and spending | `sim/inventory.ts`, with a plan-then-apply spend | After SIG-1 stage 0 |
  | Seeded random | `render/geometry.ts` `seeded` | New code only |
  | Tick time | `sim/clock.ts` `FIXED_SECONDS` | |
  | Formatting | `ui/format.ts` | |
  | Panel sections | `ui/panels.ts` `SectionKit` | |
  | A bounded cache | modelled on `render/geometryCache.ts` | |
  | Test clocks and waits | the deterministic `workClock` and a shared condition wait | |
  | Test saves | the SAVE-1 library | |
  | Browser evidence | `scripts/rec/` | |
  | Heavy and GPU work | `scripts/heavy-check.sh` | With a machine tag |
  | The merge gate | `npm run gate` | |

  The page also holds the *Open forks* register. It's an index of where things live, not a utility bag: nothing moves into a shared "utils" module because of it.

## Performance conventions (quote in every builder brief)

1. **Loops that run every frame, every stream tick or every fixed step** (the render frame, `kitStream` and the residency arbiter, `stepGame`, collision sweeps) **don't allocate in proportion to world content.**
   - Reuse caller-owned scratch: module-level `Vector3` and `Matrix` for Babylon, typed arrays, output arrays cleared with `out.length = 0`.
   - A small constant allocation needs a reason in the handoff.
   - Allocation that grows with a roster is a defect.
2. **Pick the top k with a bounded selection, never a full sort.** CW-1's light selection (`localLights.ts`, `51ad6c9`) is the reference. Keep tie-breaks stable and deterministic.
3. **Spatial work goes through the index:** `WorldQueries`, with `dataInBox(box, out)` on hot paths. Never scan a world roster linearly per frame, and never index large shapes in a uniform fine grid (TST-05's 56M-entry cliff). New static shapes use COL-1's BVH or heightfield once stage B lands; no new box-set adapters.
4. **Main-thread work that can exceed about 2 ms is sliced:**
   - a generator under the stream budget, with deterministic `workClock` in tests;
   - every synchronous `Infinity` finish is counted and logged (CW-1's rule).
5. **The WK-1 worker boundary:**
   - only transferable typed arrays cross it (positions, normals, colours, indices, collider buffers), never Babylon objects, closures or `GameState`;
   - builders stay Babylon-free so they run in a worker;
   - the main thread only uploads, in bounded slices;
   - packs are content-addressed and bound to the build.
6. **Diagnostics are pulled, not pushed:** no per-frame DOM or `dataset` writes. Expose an on-demand snapshot (`__siltwake.scene()`) and REC events.
7. **Live state is mutated in place (after SIM-1):**
   - never keep a `GameState` or hull reference across frames or yields; snapshot explicitly, as the corridor search does;
   - memoize derived data only for a measured hot consumer, and only under an explicit revision, never under object identity.
8. **Every cache has an owner, a byte bound, an eviction rule and a ledger registration.** `geometryCache.ts` is the model. A `WeakMap` hung off a long-lived root is not a budget.
9. **Perf claims come from `--class exclusive` on the 3090, plus a 4070 check.** A hot-path change reports µs per call and allocations per call on a SAVE-1 save, bound to its SHA. Shared-host numbers are labelled indicative.
10. **A preview reuses the authority, it doesn't copy the rule.** A UI answer either calls a pure plan shared with execution (`planSpend`/`applySpend`, `servicePreview`) or dry-runs the real command on a clone. It never re-derives the rule in UI code. A dry run on a clone is fine on a click, but not every frame.

## Side by side: Sol's findings and my call

**Legend:**
- **Fold:** into the named stream's brief.
- **STEW-1 / REC-2:** the two new short streams.
- **Accept:** a deliberate keep.
- **Evidence:** measure before deciding.
- **Done:** already handled.

**≠** marks a disagreement with Sol, with the reason in bold.

| ID | Sol (rank, cost) | My call | Why |
| --- | --- | --- | --- |
| F01 whole-state clone per tick | 6, M | **Fold: SIM-1** (finishing) | Built. I measured 83–198 µs per clone and 150–310 µs per `stepGame` on library saves (indicative): real CPU for bots and soaks, about 1–2% of a frame for the player. The command transaction clone stays, as Sol says. |
| F02 targeting roster built up to 3× | 7, M | **≠ Accept** | **Measured 27–40 µs for a no-target frame (aim plus preview, a roster of 128–135), about 0.2% of a frame.** The real cost is the line-of-sight calls, not the rebuild. A one-pass "target and preview" API is a nice tidy-up for whoever next changes targeting, not a stream. |
| F03 full light sort | 8, M | **Fold: CW-1 (done at `51ad6c9`); REC-1 must merge it** | I confirmed REC's tip still sorts every light (`localLights.ts:109–118`). REC-1 has been told to merge CW-1's latest; its reviewer checks that the top-k selection survives. CW-1's GC profile decides whether the remaining uniform and output arrays matter. |
| F04 `#ocean` counters every frame | 3, S | **REC-2** | Agree on the value, at 0.13 ms a frame. It isn't S on its own: the readers (soak `oceanDataset`, CW traverse, old stream drivers) move to `__siltwake.scene()` first. That is exactly REC-2's driver migration, so both go together. `hud.ts:203` and `creatures/viewer.ts:180` are checked separately, as Sol says. |
| F05 panel refusals clone the game | 13, M | **≠ Accept** | **Panels rebuild on open, click and tab change (`view.ts:146,180,190,476`; `app.ts:668`), never per frame.** A clone dry run of the real command is a legitimate single-authority preview, and it's the safest one once state is mutated in place. Convention 10 covers new code. SIG-1 converts only the previews it touches to `planSpend`. |
| F06 profiles and ecology view rebuilt | not top 15, M | **≠ Accept** | **Measured 1–5 µs to rebuild every fleet profile on late saves.** No hot consumer exists. Sol itself says to start from a measured hot consumer; there isn't one. Revisit if a profile shows one. |
| F07 spatial gathers and stream rosters allocate | 8, M | **Fold: CW-1** (hot queries done at `51ad6c9`); the residual `kitStream` per-frame rankings go into **CW-1's GC profile**, otherwise **WK-1** | The general allocating `gather` stays for cold callers; hot callers use `dataInBox` (convention 3). Don't pool everything. |
| GC and light-spike reconciliation | — | **Agree** | Both facts stand: the 24–50 ms GC pauses were game allocation pressure, and the latest residuals are mixed. CW-1's profiling owns the attribution. |
| F08 two `RecipeBuilder`s | 12, M | **Fold: WK-1** ("one builder seam", TER-06, already assigned) | **≠ the risk level.** The yaw difference is a clean mirror: the biome `box(c, s, col, yaw)` equals the kit `box(c, s, col, −yaw)`; the kit's convention matches Babylon's `rotation.y`. So migrating is mechanical: convert the callers with negated yaw and RGB plus alpha mapped to RGBA, and prove it with a byte-for-byte geometry comparison on rotated, asymmetric parts. It's low value alone, so it rides on WK-1, which must make builders worker-safe anyway. |
| F09 kit and large-cave collision separate | 15, L | **Fold: COL-1 B** (as planned) | Already a stage-B acceptance condition. I add an explicit retirement list to the B brief: LC's `boxCollider.ts`, the object `Solid` kit composition in `sim/world.ts:763–819`, and CW's per-cluster object rosters. Stage A isn't reported as deduplication. |
| F10 legacy terrain live | not top 15, L | **Accept until the bigger-map re-evaluation** | Consistent with TER-09 in the compromise verdict. It owns the accepted opening terrain. STEW-1 adds a header to each `legacy*` module saying so. |
| F11 two region authorities | 5, S/M | **STEW-1, first item.** **≠ Sol understated it** | **It isn't one boundary point. I ran both lookups:** the Rift (−200, −1000) → `refuge_reef`; the Divide (300, −1200) and the Deep District (1200, −1300; 1300, −600) → `silt_basin`; the eastern Isles (400, 50) → `refuge_reef`. **The audio profiles for three regions can never play.** Fix: audio uses `regionAtPoint`; the legacy selector is renamed for art residency only (`legacyArtRegionAt`); the HUD's third geography (`LEGACY_PRESERVE` plus hand-written labels, `hud.ts:107–115`) collapses onto `regionAtPoint` unless a label differs by design, which is then written down. If boundary flicker shows, audio gets the link-hold hysteresis that `primaryRegion` already implements. |
| F12 temporary ledger survived | 11, M | **Fold: SIG-1, as stage 0** | SIG-1 wires host upgrades and outposts. Their modules (`systems/hosts.ts`, `systems/outposts.ts`) import the ledger today, so SIG-1 would otherwise build nine upgrades on the fork. Stage 0: one inventory authority with `planSpend`/`applySpend` as the single spend path, container priority made explicit, and `journal.ts`'s raw recipe remerge removed. The gate is all economy scripts plus both playthrough routes, unchanged. |
| F13 cache ownership fragmented | not top 15, M | **Fold: WK-1** (the complete memory ledger) | Same work as R3's ledger in the compromise verdict. Keep build, runtime and GPU caches distinct, as Sol says. |
| F14 a render import and two cycles | not top 15, S/M | **STEW-1:** move `TERRAIN_EXTENT` into content; **ratchet** the cycles in the guard. **Accept** the existing cycles. | Breaking the 13-module sim cycle is M with initialization risk and no player value. Freezing it stops it from growing. SIG-1 may break the `carrier` ↔ `progression` edge if it touches both. |
| F15 big shared roots | not top 15, L | **≠ Accept, with a rule** | **Split a root only when a stream needs the seam, and that stream carves it:** SIM-1 carved the step guard; COL-1 B carves world and collider assembly out of `sim/world.ts`. The guard prints root LOC, and the per-wave review flags a root that grows by more than about 150 lines in a wave with no seam. Never split by line count. |
| F16 corridor job singleton and alias | 14, M | **≠ Done (the alias)**; **Accept (the singleton)** | **Sol missed that SIM-1 already freezes the search inputs:** `launchCorridorSearch(structuredClone(s), world)` at SIM's frozen `950d879:src/sim/carrierStations.ts:197`, documented at `SIM-1.md:39`. The search can't see mutation between yields. The module-global slot is shared by tests and apps, but it's reset on session replacement, and one app runs per page. It's acceptable. SIM-1's reviewer should still add a test that moves the hull across yields. |
| F17 feedback strings and events overlap | not top 15, M/L | **Accept until after the playtest**; a convention for new code | High UX and audio risk, and the playtest will judge feedback anyway. New commands (SIG-1 onward) return a typed outcome or event and never rely on inferred `.feedback`. Migrate one command family at a time afterwards. |
| F18 UI patterns diverge | not top 15, S/M | **STEW-1:** the duplicated duration formatter goes into `ui/format.ts`; new panels use `SectionKit` (a convention) | No UI framework. Existing bespoke presenters stay until someone changes them. |
| F19 math and time conventions | not top 15, S/M | **STEW-1:** the three `const DT = 1 / 60` and `STEPS = 60` (recorder, survival, recovery, hunterEncounter) import `FIXED_SECONDS`. **Accept** the four LCGs. | Unifying the generators changes seeded art for zero player gain. CORE-HELPERS says which one new code uses. Clamp and distance helpers: leave them. |
| F20 three unused exports | not top 15, S | **STEW-1: delete** | I re-checked: zero references in `src`, tests, scripts or tools. |
| F21 REC "stable" always true | 1, S | **Fold: REC-1 R1** (in progress) | Confirmed at `b65dfbb:scripts/rec/views/capture.mjs:75–89`: after the loop runs out, `a = c` makes `stable` true. R1 found the same class ("false stable passes"). REC-1's reviewer checks the never-stabilizes case explicitly. |
| F22 REC baseline index and PNG disagree | 2, S | **Fold: REC-1 R1** (already instructed) | Confirmed at `accept.mjs:30–35`. Content-address the PNG. |
| F23 cache-budget test passes empty | 4, S | **STEW-1** | Confirmed at `tests/regions-bake.test.ts:68–74`. Await settlement, require positive admission and zero failures, then prove an eviction and a reuse. |
| F24 bake probe copy, helper forks | not top 15, S/M | **STEW-1:** delete the dormant `docs/build/streams/ca-1/ca1-bake-probe.heavy.test.ts`; one shared generator-drain and chunk-rectangle helper in `tests/`. **Fold: COL-1 B:** the oracle's copy of the production collar builder | **≠ The framing.** The bigger problem with the COL copy isn't synchronisation: **an oracle built from a copy of the production algorithm checks nothing independently.** Stage B replaces it with independent expectations (the cliff and step probes), or deletes it when the old path retires. |
| F25 harness test scope | not top 15, S/M | **STEW-1:** a shared condition-wait helper replaces fixed sleeps where touched. **Accept** the rest. | Sol is right that mocked-readiness app tests are legitimate. A one-line label in each such file's header says what it can't prove. |
| F26 drivers repeat infrastructure | 10, M | **REC-2** | Root cause 2. |
| F27 bake, verify and cache helpers | not top 15, S/M | **Fold: WK-1** (bake v2) | Adopt CW's `bake-source-hash.mjs` and the single `--verify` invocation; keep live-byte assertions. No new verifier. |
| F28 no canonical composed gate | 9, S | **STEW-1** | There are **six** economy CLIs, not five. STEW-1 sorts each into *current invariant* (in the gate) or *historical receipt* (archived, by DIRECTION's no-hash-inventory rule; for example, the hash and literal checks in `check-m1-economy.mjs:20–39`). It adds `npm run gate` = fast tests, the guard, the build, the current economy checks, and both playthrough routes as a queued `any` job. `saves-export.sh` stays a post-merge action, and the gate prints a reminder. |

## The two new streams

### STEW-1: guard rails and small fixes (one Opus builder, one short stream)
**Player outcome:** each region sounds like itself; the merge gate is one command; drift is caught automatically.

**Scope, in order:**
1. **F11 audio regions.** Audio uses `regionAtPoint`; rename `worldRegionAt` to `legacyArtRegionAt`; collapse the HUD's legacy branch where the labels agree. Add a test: one point per region returns that region's audio profile.
2. **F23,** the cache-budget test, made positive.
3. **F28:**
   - the economy scripts classified;
   - `npm run gate`;
   - DIRECTION's merge-gate line and the root-merge-gate memory point at it.
4. **`scripts/guard-architecture.mjs` in `test:fast`,** with today's allowlists.
5. **`docs/build/CORE-HELPERS.md`,** with the *Open forks* register seeded:
   - the ledger (SIG-1);
   - the biome builder (WK-1);
   - the LC box collider and kit object solids (COL-1 B);
   - the legacy terrain (the map re-evaluation);
   - the stream driver copies (REC-2).
6. **Small deletions and moves:**
   - the F20 exports;
   - the F14 `TERRAIN_EXTENT`;
   - the F19 tick constants;
   - the F18 formatter;
   - the F24 dormant probe and the shared test helpers;
   - `legacy*` headers.

**Owned:**
- `src/audio/director.ts`;
- `src/render/regions.ts`;
- the region lines of `src/ui/hud.ts`;
- the `regionAt` line of `src/runtime/app.ts` (one line; the coordinator agrees it with the builders touching `app.ts`);
- `scripts/guard-*` and the gate manifest;
- `tests/` support helpers;
- the files named above.

**Adverse case:** a point exactly on a region boundary, and the region outside every footprint (audio keeps its previous region).

**Not in scope:** anything owned by an in-flight stream.

**Review:** one Sol review. The review checks that the guard fails on a planted cycle and on a planted `chromium.launch`.

### REC-2: one evidence driver (the REC-1 builder, after REC-1 merges)
**Outcome:** one maintained way to drive the game in a browser for evidence. Soaks, traversals, fixed views, MEM-1 and PT-0 share it.

**Scope:**
1. `scripts/rec/` owns browser launch (GPU flags per machine class, the guard lease), the preview server, readiness, steering, SAVE-1 save installation and cleanup.
2. Move `scripts/soak/browser.mjs` and CW-1's `traverse.mjs` onto it as scenarios.
3. Move every `#ocean` reader to `__siltwake.scene()`, then **delete the per-frame diagnostic writes and mesh scans** (F04), keeping any readiness signal the product's loading uses.
4. Active fixtures come from the SAVE-1 library; seeded diagnostic saves are labelled.
5. `docs/build/streams/**` executables are archived with their evidence. They aren't rewritten, and they aren't claimed to be rerunnable.

**Adverse case:** a GPU job that loses its lease mid-run, and a save the library lacks.

**Acceptance:**
- one soak lap and one traversal segment run through the new path on both machines;
- the frame-time effect of removing the counters is measured on `--class exclusive`.

**Timing:** MEM-1 starts on REC-1's harness as merged. REC-2 extends that harness without breaking its interface, so MEM-1 doesn't wait.

## Plan

Five Opus builder slots. Sol reviews and MEM-1 use no slot. Each stream gets one Sol 6.1 xhigh review plus coordinator inspection, per DIRECTION. **The two new streams are continuations of an existing slot, not extra slots.**

**Folded into in-flight streams now** (the coordinator sends each a short note; none of these changes their merge conditions except where stated):

| Stream | Add to its brief or review |
| --- | --- |
| **REC-1** (R1 fixes) | F21 and F22 (in progress); merge CW-1's latest and keep its top-k selection (F03); the reviewer checks both, plus the never-stabilizes case. |
| **SIM-1** (finishing) | The reviewer adds a corridor test that moves the hull across yields (F16); convention 7 goes in its handoff as the rule for later streams. |
| **CW-1** (R1 fixes, GC profile) | The profile ranks the residual `kitStream` per-frame rankings and the light uniform and output arrays (F07, F03). Fix them in CW-1 if they rank; otherwise they go to WK-1. No new scope otherwise. |
| **COL-1** (A to B) | B brief: the retirement list for F09; replace or delete the oracle's copied collar builder (F24). |
| **SCHED-2 builder** (TST-16) | Nothing. |

**Queued streams gain these:**
- **WK-1:**
  - F08, one builder, using the mirror rule and a byte-compare test;
  - F13, the cache ledger;
  - F27, one verify path;
  - F07's residue if CW-1 leaves it.
- **SIG-1:**
  - stage 0 is F12, one inventory authority;
  - its new commands follow the typed-outcome convention (F17) and convention 10.

**Order, as slots free** (expected order; the coordinator adjusts):

| When | Slot | Stream | Depends on |
| --- | --- | --- | --- |
| Now | 1–5 | CW-1, COL-1 A, REC-1, SIM-1, SCHED-2 (TST-16) | — |
| CW-1 merges | CW-1's | **OP-1** (unchanged: the owner's queue) | CW-1 |
| SIM-1 merges | SIM-1's | **STEW-1** (same author: knows `app.ts`, `step.ts` and the tests), then **WK-1** | STEW-1: none. WK-1: CW-1 merged and MEM-1's profile, which STEW-1's length mostly overlaps. |
| REC-1 merges | REC-1's | **REC-2**, then **BIO-1** | REC-1 merged |
| TST-16 merges | SCHED-2's | **SIG-1** (stage 0 first) | UX-1 merged (done) |
| COL-1 A accepted | COL-1's | **COL-1 B–D** (continues) | CW-1 merged |
| Then | freed | LC-2 → BIO-2/3/4, NAV-1, lost sites, ATM-2 | as in the compromise verdict |
| Finally | — | PT-0 (Sol), then the owner's playtest | — |

**Rule:** **STEW-1 lands before PT-0 at the latest,** because of the audio bug. If SIM-1 stalls, STEW-1 takes the first free slot. It is short enough not to displace OP-1.

## The per-wave architecture review

It runs once per wave, when the coordinator posts the wave's roadmap update, alongside the taste review. The coordinator dispatches it; builders never dispatch it. It reads the code and the guard output only, with no browser and no test runs.

**1. Sol evidence pass (Sol 6.1 xhigh, read-only, one pass).**

**Inputs:** the root SHA at the last review and now, `git diff --stat`, `node scripts/guard-architecture.mjs --report`, the gate result already recorded at merge, and CORE-HELPERS.

**Fixed checks:**
1. **New parallel implementations:** a new module doing a job CORE-HELPERS already assigns; an exact-line clone scan of new files against existing ones (more than 30 shared lines).
2. **The fork register:**
   - new FORK markers without a row;
   - forks whose retiring stream has merged.
3. **Layering and cycles:** any allowlist change.
4. **Hot paths:**
   - changed files in the frame, stream or step loops;
   - new per-call allocations, sorts or roster scans, against the conventions.
5. **Roots:** LOC delta per shared root; new responsibilities added without a seam.
6. **Evidence tooling:**
   - new drivers or executables outside `scripts/rec`;
   - gate manifest changes.
7. **Dead code:**
   - zero-reference exports;
   - a legacy path whose replacement merged;
   - flags nobody reads.
8. **Test integrity:**
   - upper-bound-only assertions;
   - new fixed sleeps;
   - an oracle that imports or copies the production algorithm.

**Output:** `docs/build/audits/ARCH-W<n>-SOL.md`, at most 2 pages:

```
| ID | Check | Evidence (path:line@sha) | Cost S/M/L | Suggested owner |
```

Historical numbers are labelled. No essays, and no ranking beyond S/M/L.

**2. Opus steward ruling (a fresh Opus 5.5 high, one pass).**

**Output:** `ARCH-W<n>-VERDICT.md`, at most 1 page. Each row gets one of:
- **fix in the stream that caused it** (S only);
- **fold** into a named stream;
- **accept**, with a reason;
- **evidence**.

The steward also:
- updates CORE-HELPERS and the fork register;
- lists at most three standing-practice changes.

**At most one new cleanup stream per wave,** and only if it holds a correctness or player-facing defect, or its items demonstrably save more builder time than they cost.

**3. The coordinator** applies the rulings to briefs, and writes one line in STREAMS. **Budget:** two agent passes per wave. If the guard report shows no deltas, Sol writes "no change", and the steward pass is skipped.

**Every stream review** (already in DIRECTION) gets these lines in its brief:
- Is anything here a second way to do a job CORE-HELPERS assigns?
- Did this stream add or retire a FORK?
- Does any hot-path change follow the performance conventions, with per-call cost stated?
- Did the guard allowlists change, and why?

## Light measurements

These are indicative only. They ran on the shared factory-worker host at load average about 10 (other builders running), on root `b6b1e74` source and SAVE-1 library saves at `91dc1ab`. They used Node 24 and an esbuild bundle in `/work/tmp/steward/`, with 2,000 iterations after a 200-iteration warm-up.

| Save | Roster | Aim + preview, no-target frame | `interactions()` | All fleet profiles | `structuredClone(state)` | `stepGame` (no commands) |
| --- | --- | --- | --- | --- | --- | --- |
| creel@opening | 128 | 27.0 µs | 9.3 µs | 0.1 µs (0 hulls) | 83.5 µs | 180 µs |
| creel@canopy | 129 | 40.0 µs | 7.1 µs | 1.5 µs (1) | 106.9 µs | 154 µs |
| creel@divide | 130 | 35.8 µs | 7.9 µs | 4.1 µs (2) | 197.6 µs | 240 µs |
| carrier@works | 133 | 0.3 µs (piloting, no aim ray) | 7.6 µs | 5.1 µs (4) | 161.3 µs | 311 µs |
| carrier@ending | 135 | 0.3 µs | 7.0 µs | 3.2 µs (4) | 154.8 µs | 264 µs |

**Other observations:**
- **`gameWorld()` takes 4.7–6.5 s** in Node on this source. That's test and bot startup cost, already owned by CW-1 (sliced) and COL-1 B / WK-1 (CAV-03).
- **Region comparison:** both lookups bundled and run at nine points; the results are in the F11 row.
