1. Siltwake has useful shared foundations, but reuse and performance have not been curated systematically across streams.
2. Two confirmed REC-1 defects can falsely certify stable images or separate a baseline hash from its stored PNG.
3. The live simulation clones the whole state each tick; SIM-1 replaces that path while preserving pure stepping.
4. Target selection, light selection, spatial queries, profiles and UI previews still repeat scans or allocate avoidable intermediate data.
5. CW-1 fixes important light and query costs; REC-1's frozen branch lacks CW-1's latest top-k selection fix.
6. Kit and large-cave collision remain separate; COL-1 supplies a common seam but has not replaced the live implementations.
7. Legacy terrain remains necessary, while legacy geography already disagrees with the seven-region semantic map.
8. Duplicated inventory ledgers, mesh builders, drivers and fixtures increase change cost and invite inconsistent behavior.
9. Tests have improved substantially, but a cache-budget assertion can pass empty and evidence drivers lack a single maintained path.
10. Prioritize small evidence-integrity fixes and existing optimization integration, then consolidate by behavior with explicit ownership.

# Codebase health evidence — Sol 6.1 xhigh

Audit date: 2026-10-23. Audience: the Opus coordinator deciding the refactor plan. This is an evidence inventory and value/cost recommendation, not an implementation or acceptance verdict.

## Scope and reproducibility

The gameplay baseline is `feat/siltwake-first-expedition` at **4a9d194**. All line references are to the frozen commits below, not moving branch tips. `B:path:line` means the baseline; the other prefixes identify the relevant candidate. Paths are relative to the repository root. Selected primary anchors link directly to immutable source.

| Prefix | Ref inspected | Frozen SHA |
| --- | --- | --- |
| B | `feat/siltwake-first-expedition` | `4a9d194afa0550b0b8c5b5419982552921b158f6` |
| CW | `origin/t3/enable-authored-cave-streaming` | `4a169850a850e779a32ab4b016087de2292b2b4d` |
| COL | `origin/t3/col-1-static-collider` | `031462ee74570e30572049e63ead955cabf0c8f5` |
| REC | `origin/t3/rec-1-flight-recorder` | `b65dfbbc3a87dd4d9b47e17a6928255be84de29b` |
| SIM | `origin/t3/sim-1-inplace-step` | `950d8796654ab18f12881da879dbb69fc97cc370` |

Read first: `AGENTS.md`, `docs/build/STATUS.md`, `DIRECTION.md` and `GAME-DIRECTION.md`; model/resource instructions informed the work. No `docs/spoilers/*` files were read. No source was changed. Only this report is delivered. No browser, builds, test suites or heavy jobs were run. One bounded research helper inspected tests and tooling; the primary auditor checked the two REC defects and the cache assertion directly.

Measurements are lightweight source counts, AST import/call scans, exact-line comparisons and frozen branch diffs. LOC means physical text lines, including comments and blanks. A module's LOC is context, **not an estimate of deletable lines**. Callsites count syntactic calls in `src` unless another population is named; importer counts distinguish value from type-only edges. Dynamic imports, implicit engine behavior and wall-time costs are not established by this static graph. Unused-name searches also covered tests, scripts, tools and HTML/MJS entrypoints before identifying the small confirmed set below.

All millisecond, memory and suite-duration figures below are **historical reports**, with their source/run limitations stated. This audit does not establish a fresh performance ranking by measured CPU time, an allocation rate, bundle-size savings, or a leak.

## Top 15 by value against cost

Rank favors confidence, correctness/evidence integrity, frequency of paid work, and changes already built in candidates. S is a focused local change with targeted validation; M spans a coherent subsystem or several consumers; L needs staged world/behavior migration. These are relative effort classes, not day estimates. Integration checks belong in the cost. A low rank for a large change does not mean its player impact is small.

| Rank | Finding | Value and concrete outcome | Cost | Principal risk / stream |
| --- | --- | --- | --- | --- |
| 1 | [F21](#f21-rec-image-stability-can-never-report-an-animating-pair) | Stop certifying continually changing captures as stable. | S | Low code risk; high current evidence risk. REC |
| 2 | [F22](#f22-rec-baseline-index-can-describe-different-bytes-from-the-stored-image) | Keep accepted PNG bytes and their indexed hash consistent. | S | Low; REC |
| 3 | [F04](#f04-old-ocean-instrumentation-is-still-paid-every-frame) | Remove measured permanent mesh scans after moving readers to on-demand snapshots. | S | Driver compatibility; REC, CW, soak |
| 4 | [F23](#f23-cache-budget-test-can-pass-with-no-successful-cache-admission) | Make the cache budget test require actual admission and eviction. | S | Low; terrain/CW |
| 5 | [F11](#f11-semantic-geography-has-two-authorities-and-a-concrete-disagreement) | Give audio, optics and timeline one semantic region answer. | S/M | Boundary/audio behavior; all retain |
| 6 | [F01](#f01-whole-state-copy-and-timeline-snapshots-in-the-fixed-step) | Integrate SIM's live step and reusable recorder data, preserving rollback and pure comparisons. | M, mostly built | State identity and exception semantics; SIM × CW/REC |
| 7 | [F02](#f02-one-frame-can-build-and-scan-the-interaction-roster-three-times) | Compute aim and reach preview once from shared static/dynamic candidates. | M | Target tie, visibility and knowledge rules; all retain |
| 8 | [F03](#f03-full-light-sort-and-streaming-light-discovery) / [F07](#f07-spatial-queries-and-cave-streaming-still-make-intermediate-rosters) | Preserve latest CW top-k and caller-buffer fixes when integrating REC; reduce remaining transient rosters. | M, partly built | Ordering, fading, query reentrancy; CW × REC |
| 9 | [F28](#f28-there-is-no-single-canonical-composed-game-gate) | One declared economy/composed gate eliminates observed selection drift. | S for command | Queue nesting and historical checks; COL/SIM/CW |
| 10 | [F26](#f26-active-play-gpu-and-save-drivers-repeat-infrastructure) | Maintain one active browser/server/steering layer and SAVE-1 fixture selection. | M | Evidence provenance and cleanup; CW × REC |
| 11 | [F12](#f12-temporary-inventory-ledger-survived-registry-composition) | One inventory policy/planner removes an obsolete integration fork. | M | Spend priority, stacking, charge/provenance; all retain |
| 12 | [F08](#f08-ter-06-kept-a-second-recipebuilder-with-different-semantics) | One mesh primitive implementation with explicit conventions. | M | Yaw, normals, cel alpha and art; no candidate fixes |
| 13 | [F05](#f05-panel-refusals-clone-and-execute-the-game-to-answer-a-query) | Share pure plans between preview and execution instead of full-state dry runs per row. | M | Refusal ordering and transaction equivalence; all retain |
| 14 | [F16](#f16-corridor-presentation-work-is-a-simulation-module-singleton) | Scope the corridor job per app and freeze its search inputs before SIM changes identity semantics. | M | Search consistency and stale status; SIM |
| 15 | [F09](#f09-kit-and-large-cave-paths-are-not-yet-unified-by-col-1) | Complete COL integration to retire object-heavy cave collision adapters. | L, stage A built | High geometry, movement, load/streaming risk; CW × COL × LC |

These can be organized by the coordinator into coherent outcomes. The table does not authorize concurrent edits to shared roots or prescribe an extra acceptance process.

## Runtime hot paths and allocation

This is a source-based offender list. Whole-state copying scales with all saved state; targeting and profiles scale with content/inventory; lights and collision scale with world density. Their actual relative CPU/GC contribution requires an admitted profile after integration.

| Path | Frequency / scaling | Evidence and disposition |
| --- | --- | --- |
| Whole-state clone; timeline snapshots | Every active fixed tick, nominally 60 Hz | F01; SIM addresses much of it. |
| Interaction roster and candidate sort | Every active presentation frame; up to three roster traversals when no in-reach target | F02; not addressed by the four candidates. |
| Light collection, scoring and sorting | Every rendered frame over the emissive roster | F03; latest CW removes score objects/full sort, REC does not contain that fix. |
| Collision candidate arrays, maps and slide scratch | Repeated movement/LOS/clearance queries per tick | F07; CW adds a hot-path buffer API. |
| Cave cluster/object construction and streaming rankings | Streaming admission, plus every-frame ranking | F07/F09; CW slices work but retains large object rosters; COL seam is not wired. |
| Profile rebuilding and ecology presentation mapping | Multiple calls per hull/tick and each rendered frame | F06; not broadly addressed. |
| UI refusal dry runs | Panel generation/refresh, scaling with hulls/buttons/recipes | F05; not a continuous frame claim. |
| Legacy `#ocean` counters | Every rendered frame, including two whole-mesh reductions | F04; historical mean 0.133 ms on the 3090, still present in REC. |

### F01. Whole-state copy and timeline snapshots in the fixed step

**Verified:** [B:src/sim/step.ts:579](https://github.com/lakeczar/subnautica-clone/blob/4a9d194afa0550b0b8c5b5419982552921b158f6/src/sim/step.ts#L579) starts `stepGame` with `structuredClone(state)` at 584. `B:src/runtime/app.ts:354–368` calls it from the fixed clock. The same tick constructs a moved-hull `Set` through `filter`, a nested fleet `find`, and `map` (`step.ts:1022–1023`). `B:src/sim/timeline/recorder.ts:94–112` constructs nested cache/resource maps for observation. These scale with accumulating game state even when most fields do not change.

**Size / reach:** `step.ts` 1,059 LOC; one production `stepGame` callsite. The command transaction is a distinct clone at `step.ts:560–565`, with one production caller at `app.ts:662`. Do not remove its atomicity merely because it also uses `structuredClone`.

**Consolidation / cost / risk:** Adopt the existing live mutation contract behind SIM's guard, retain detached stepping for forks, and share/reuse timeline stock buffers. **M integration; medium/high risk** around exceptions, external writers, stale snapshots and state aliases.

**In-flight:** SIM retains pure `stepGame` and adds `stepGameInPlace` (`SIM:src/sim/step.ts:579–618`); live app uses `StepGuard` (`SIM:src/runtime/app.ts:370–379`). Its 133-line guard checkpoints every 60 journal entries, copies commands, and replays on failure (`SIM:src/sim/stepGuard.ts:20–25,65–99,103–124`). The recorder reuses stock buffers/lazily reads cache contents (`SIM:src/sim/timeline/recorder.ts:148–170`). It is **not allocation-free**: `preStep` still builds a pose map, and the guard journals entries/copies commands. CW/REC touch the same app/step/recorder integration surfaces. The corridor alias issue in F16 deserves a focused cross-stream check.

### F02. One frame can build and scan the interaction roster three times

**Verified:** `B:src/runtime/app.ts:386–388` calls `aimedInteraction`, then `reachPreview` if no target exists. [B:src/sim/targeting.ts:98](https://github.com/lakeczar/subnautica-clone/blob/4a9d194afa0550b0b8c5b5419982552921b158f6/src/sim/targeting.ts#L98) rebuilds candidates from `interactions(s)` for each call, sorts them, then filters/sorts the angular tie set (`:119–128`). Preview repeats the in-reach query before querying the longer range (`:138–146`). `B:src/sim/progression.ts:79–167` recreates static source/evidence/record entries together with dynamic hulls, outposts, beacons and caches; cache inclusion also scans inventory. The ordinary no-target frame can therefore reconstruct/traverse the roster three times.

**Size / reach:** targeting 147 LOC; interaction construction approximately 89 LOC. Four production `aimedInteraction` callsites (app, two command checks, HUD), two `reachPreview` callsites (app/HUD); one syntactic `interactions` call sits inside the repeatedly invoked helper.

**Consolidation / cost / risk:** Return target and preview from one selection pass, keep a static content roster/spatial lookup with a dynamic overlay, and pass the computed result through presentation. **M; medium risk**: preserve centered intent, fresh-stock tie handling, body reach, host-center LOS, interior ownership, and unknown-label masking. Command-time checks must still use current state.

**In-flight:** All four retain this architecture. This is a consolidation opportunity independent of SIM's tick clone.

### F03. Full light sort and streaming light discovery

**Verified:** [B:src/render/lighting/localLights.ts:91](https://github.com/lakeczar/subnautica-clone/blob/4a9d194afa0550b0b8c5b5419982552921b158f6/src/render/lighting/localLights.ts#L91) creates a score object per candidate and sorts the full list to choose at most 12 lights. `:112–121` allocates two uniform arrays and `splice` results on every call. `B:src/render/lighting/sceneLights.ts:107–131,165–194` scans/places emissive instances and collects the frame's light roster before selection/upload.

**Size / reach:** local selection 162 LOC, scene manager 218 LOC; one production `selectLights` callsite and two `lightUniforms` calls (initialization and frame update). The relevant selection/uniform region is about 31 LOC, but discovery and object ownership are larger concerns.

**Consolidation / cost / risk:** Preserve CW's reusable top-k buffers, then reuse uniform/output buffers and avoid rebuilding stable light rosters unnecessarily. **M; medium risk** for stable tie ordering, reserved slots, distance fade, shader upload contracts and multiple owners.

**In-flight:** CW slices discovery/placement and replaces full scoring/sort with reusable top-k arrays (`CW:src/render/lighting/localLights.ts:109–140`). It still creates reserved/output arrays, faded light copies and uniform arrays (`:115,128–145`). REC contains earlier CW work but retains the old full score/sort (`REC:src/render/lighting/localLights.ts:108–125`). Merging REC must not silently regress CW's latest optimization. COL/SIM do not solve this.

**Historical performance context:** `CW:docs/build/streams/CW-1.md:25–26` reports earlier jump construction of 800–907 ms and light placement of 37–111 ms before slicing. These are historical triggering costs, not current per-frame measurements. See the GC reconciliation below before assigning residual spikes to this function.

### F04. Old `#ocean` instrumentation is still paid every frame

**Verified:** [B:src/render/renderer.ts:379](https://github.com/lakeczar/subnautica-clone/blob/4a9d194afa0550b0b8c5b5419982552921b158f6/src/render/renderer.ts#L379) writes scene diagnostics to the canvas each frame, including two complete `scene.meshes.reduce` passes at 385–386. The following attributes include serialized streaming/readiness counters. REC explicitly retains and times this compatibility path (`REC:src/render/renderer.ts:585–595`).

**Size / reach:** approximately 31 LOC in the base frame diagnostics block, one frame-loop site, two whole-mesh reductions, and multiple driver/provider readers. REC identifies three reader families: soak's `oceanDataset`, CW traversal, and older stream drivers (`REC:docs/build/streams/REC-1.md:80`). A complete reader migration count is not asserted here.

**Why it matters / consolidation:** This is permanent runtime work for diagnostic consumers. Move active consumers to REC's on-demand `__siltwake.scene()` snapshot, then remove the replaced diagnostic writes/scans. Preserve readiness/state signals still used by product loading behavior. **S; low code risk, medium compatibility risk** across drivers.

**In-flight / historical measurement:** REC's handoff `:57,80` reports **0.133 ms mean / 0.3 ms p99 per frame on the 3090**, 0.062 / 0.12 ms on the 4070, during its short shared functional runs. That is evidence of a paid cost, not an exclusive benchmark from this audit. REC removes the renderer's `canvas.dataset.tick`, but `B:src/ui/hud.ts:203` and `B:src/render/creatures/viewer.ts:180` have separate tick hooks. “`dataset.tick` is gone” is only true for the replaced main-renderer canvas hook; remove each remaining hook only after checking its own callers. CW and soak tools are the direct migration partners; COL/SIM do not retire the path.

### F05. Panel refusals clone and execute the game to answer a query

**Verified:** [B:src/ui/carrierPanel.ts:19](https://github.com/lakeczar/subnautica-clone/blob/4a9d194afa0550b0b8c5b5419982552921b158f6/src/ui/carrierPanel.ts#L19) clones the entire state and runs `carrierCommand` for a button's refusal. `B:src/ui/panels.ts:371` does the same for reserve use; `:394–398` does it for each offered recovery method. `B:src/sim/progression.ts:422–438` clones twice in alternative crafting-output paths to test capacity after spending, and `panels.ts:509–512` asks the block query for unlocked recipes.

**Size / reach:** three UI clone expressions and two recipe-preview clone expressions. Actual work scales with visible hulls, command buttons and recipe rows rather than those five source sites. Panels 765 LOC; carrier panel 121 LOC. These are panel-generation costs; this audit does not assert all run every rendered frame.

**Consolidation / cost / risk:** Extract pure transaction plans/refusal queries shared by execution and presentation, following existing `servicePreview`/storage-preview patterns. **M; medium/high risk** if prerequisite/refusal ordering, capacity after spending, or no-consumption-on-refusal changes. Preserve one authoritative rule implementation rather than copying it into UI predicates.

**In-flight:** SIM removes the live tick clone, not these dry runs. All four candidates retain these preview patterns; COL's world queries can affect the commands they call.

### F06. Derived profiles and ecology views are repeatedly rebuilt

**Verified:** `B:src/sim/fittings.ts:37–52` finds inventory items once per fitted module and folds a fresh craft profile. There are **17 production `vehicleProfile` callsites**, spanning movement, charging, systems, emissions, air-line construction and UI. `B:src/sim/upgrades/effects.ts:46–84` builds effect arrays and several result arrays/objects. `fittings.ts:287–303` reconstructs profiles and hazard summaries per active hull; air-line supply maps all hulls at `:318–323`. [B:src/sim/ecology/ecology.ts:112](https://github.com/lakeczar/subnautica-clone/blob/4a9d194afa0550b0b8c5b5419982552921b158f6/src/sim/ecology/ecology.ts#L112) maps threats/hazards/deterrents into a presentation view, called from `B:src/render/renderer.ts:374` each frame.

**Size / reach:** profile lookup is approximately 16 LOC plus its effects fold; ecology view approximately 10 LOC. The 17 callsites are static sites, not an exact per-tick count. Individual small allocations become repeated fleet/inventory scans as content grows.

**Consolidation / cost / risk:** Share per-step derived profiles, index item IDs, and cache immutable fitting/rating results by a real revision; use owned presentation buffers where consumers do not retain them. **M; medium risk** from stale caches after refit, rating, cargo or session changes. Start with a measured hot consumer rather than global memoization.

**In-flight:** No candidate broadly solves this; SIM makes state-identity-based memoization particularly unsafe because live state identity persists.

### F07. Spatial queries and cave streaming still make intermediate rosters

**Verified:** [B:src/world/spatialIndex.ts:41](https://github.com/lakeczar/subnautica-clone/blob/4a9d194afa0550b0b8c5b5419982552921b158f6/src/world/spatialIndex.ts#L41) allocates hit indices, visitor/filter closures, a sort and mapped output per gather (`:41–64`). `B:src/sim/world.ts:491–492` maps those entries again to solids. Slide movement (`world.ts:568–655`) creates contact/vector/closure scratch for repeated collision queries. These are repeated operations, not a claim that every array should be pooled.

**Size / reach:** base index 123 LOC, CW index 173 LOC; three `createSpatialIndex` source callsites (world, world map, LC composition). CW also has a footprint grid (`CW:src/sim/world.ts:925–955`); LC has a box bucket grid (`B:src/world/caves/large/boxCollider.ts:34`). They index different ownership/query units and are not interchangeable by name alone.

**Consolidation / cost / risk:** Extend the caller-owned scratch-buffer API where queries are hot, preserve deterministic ordering, and document scratch ownership/reentrancy. Share index primitives where contracts actually match. **M; medium risk** for nested queries, iteration order and accidental retained aliases.

**In-flight:** CW adds `dataInBox` (`CW:src/world/spatialIndex.ts:98–121`) and removes the hot entry-to-solid remap. It leaves the general allocating gather API. Its new 89-line `src/world/caves/kitStream.ts:56–84` maps/scorers clusters, filters/sorts wanted/eviction lists, constructs a `Set`, and separately maps/sorts cave footprints each frame. Slicing construction bounds individual work but does not eliminate these transient rosters. REC inherits earlier CW; preserve latest CW query fixes during integration. COL supplies separate compact collider technology, not this completed cleanup.

### Reconcile the GC and light-spike evidence

`B:docs/build/STREAMS.md:553` records a reviewer finding that main-thread spikes looked real; **`:562` corrects four run-A “contention” frames to 24–50 ms GC pauses caused by game allocation pressure**. That correction must not disappear from the audit.

The latest frozen CW handoff describes a **different historical run set**: `CW:docs/build/streams/CW-1.md:40–57`, 200,681 frames, 24 streaming-part frames over 34 ms, longest traced GC pause 16.4 ms, with much residual time attributed to contention/VM scheduling. Those observations neither erase the earlier GC finding nor prove every latest spike is GC. Its handoff still lists clean exclusive 3090 evidence as missing (`:97–100`). Light selection's static allocation problem and its top-k fix are verifiable separately from that unresolved attribution. No fresh GC trace or clean-machine performance measurement was obtained for this audit.

## World, content and duplicated domain implementations

### F08. TER-06 kept a second `RecipeBuilder` with different semantics

**Verified:** [B:src/render/biomes/recipe.ts:17](https://github.com/lakeczar/subnautica-clone/blob/4a9d194afa0550b0b8c5b5419982552921b158f6/src/render/biomes/recipe.ts#L17) and `B:src/render/kit/recipe.ts:15` independently accumulate vertices, normals, colors, indices, boxes and other primitives. This is the TER-06 clone identified in the [prior compromise audit at cd6993a6, line 76](https://github.com/lakeczar/subnautica-clone/blob/cd6993a684fc25711e6b87b66b65df7f0626590d/docs/build/audits/COMPROMISE-AUDIT-SOL.md#L76); the earlier ownership rationale is recorded in `B:docs/build/streams/S2.md:62,252`. The source confirms the overlap without relying on that attribution.

**Important difference:** biome box yaw at `biomes/recipe.ts:48–54` uses `x*cos − z*sin`, whereas kit box yaw at `kit/recipe.ts:33–36` uses `x*cos + z*sin`. They also expose RGB plus alpha versus RGBA and treat vertex normals differently. `writeInstance` (`biomes/recipe.ts:144`) and `writeMatrix` (`kit/recipe.ts:137`) overlap but have distinct scale/transform contracts. A rename-and-delete refactor can rotate accepted art or change cel shading.

**Size / reach:** 158 + 193 = **351 LOC**, eight importers of the biome builder module (seven value) and three value importers of the kit module; **12 constructor expressions** across `src`. These are two related implementations, not 351 removable lines.

**Consolidation / cost / risk:** One Babylon-free primitive/buffer implementation with explicit rotation, color and normal conventions; retain adapters while converting callers. Compare emitted geometry/bytes for asymmetric, rotated examples and representative art. **M; medium/high visual risk**. None of CW/COL/REC/SIM consolidates them; COL's intended art/collision agreement makes preserving conventions especially relevant.

### F09. Kit and large-cave paths are not yet unified by COL-1

**Verified:** `B:src/sim/world.ts:763–819` composes kit cave solids and `:827–828` owns the exterior singleton. `B:src/world/caves/large/boxCollider.ts:23–40` independently constructs kit-style rock/collar boxes and a bucket index for LC composition. LC also has its own compose/collision/streaming/render pipeline. [COL:src/world/collision/world.ts:12](https://github.com/lakeczar/subnautica-clone/blob/031462ee74570e30572049e63ead955cabf0c8f5/src/world/collision/world.ts#L12) explicitly says these new seams are **stage A, for the coordinator to wire in stage B**. `staticCaveCollider` at `:46` bridges W1 ownership into LC's interface; `COL:src/world/collision/biome.ts:40–51` supplies the compact biome adapter. The base live `sim/world.ts` is unchanged in COL.

**Size / reach:** **18 LC world/render files, 3,419 LOC** in B (13 world files, 2,813 LOC; five render files, 606 LOC). COL adds **10 collision modules, 2,584 LOC**. The canonical `gameWorld` accessor has eight source callsites. These are module families rather than interchangeable functions; the LC family is outside the base `src/main.ts` value-import closure, so this audit does **not** claim both complete pipelines run every gameplay frame.

**Why it matters:** Parallel movement/LOS/support/terrain-ownership behavior and streaming lifecycles multiply seam regressions and integration cost. CW still constructs object `Solid` rosters and a fresh index per cluster (`CW:src/sim/world.ts:966–978`). Its historical handoff reports up to 148,906 collision boxes and JS heap of 228–352 MiB (`CW-1.md:50`); compact storage is therefore a material opportunity, not just tidiness.

**Consolidation / cost / risk:** Complete the common static collider/storage/query seam, keeping authored cave ownership and content distinct. Retire superseded adapters only after equivalent movement, mouth/collar, LOS, support, load/depenetration and eviction behavior is demonstrated. **L; high geometry and save-load risk**. Direct coordination is CW × COL × LC; REC inherits CW consumers, SIM changes the simulation calling environment. Stage A must not be reported as completed deduplication.

### F10. `legacyTerrain` and `legacyWorld` are live migration debt

**Verified:** [B:src/render/worldArt.ts:29](https://github.com/lakeczar/subnautica-clone/blob/4a9d194afa0550b0b8c5b5419982552921b158f6/src/render/worldArt.ts#L29) registers `WORLD_ART = [LEGACY_ART, S2_ART]` at 36; composition stitches legacy chunks into the authored layout at `:55–56`. `B:src/content/regions/terrain.ts:23–42` explicitly preserves the old extent, with terrain skirts in `B:src/render/biomes/terrain.ts:111` onward. The old surface includes accepted opening/rescue geometry. These modules are not deletable just because their names say legacy.

**Size / reach:** `render/legacyTerrain.ts` 96 LOC, `legacyWorld.ts` 110, `terrainSurface.ts` 417: **623 LOC**, with three and two value importers of the first two. The newer generic `render/biomes/tessellate.ts` is 288 LOC and overlaps adaptive sampling/topology responsibilities with the old surface, but is not a drop-in replacement.

**Consolidation / cost / risk:** Migrate the accepted surface into the authored terrain contract, preserving ledges, seams, approaches, collision and saved poses; then remove the migration layer. **L; high terrain/route/save risk**. CW keeps it; COL does not retire it; REC/SIM also retain it. Record it as a planned migration rather than “dead code still paid for.” The semantic-geography misuse in F11 is separable and cheaper.

### F11. Semantic geography has two authorities and a concrete disagreement

**Verified:** `B:src/runtime/app.ts:3,85–86` gives audio `worldRegionAt` from `render/regions`. That function uses `legacyRegionMap` (`B:src/render/regions.ts:34–42`) and the four-footprint legacy render layout (`legacyWorld.ts:31–37`). The canonical seven-region map is [B:src/content/regions/layout.ts:34](https://github.com/lakeczar/subnautica-clone/blob/4a9d194afa0550b0b8c5b5419982552921b158f6/src/content/regions/layout.ts#L34), queried by `regionAtPoint` at 65.

At **x = 300, z = −1200**, the canonical footprint is **`brine_divide`**, while legacy render geography returns **`silt_basin`**. This follows directly from the two rectangle tables. Optics uses the canonical lookup (`B:src/render/biomes/optics.ts:21`); timeline receives it from `B:src/runtime/app.ts:474`. Audio can consequently receive a different semantic region at the same position. Legacy art lifetime/hysteresis is a legitimate separate concern, but its public name `worldRegionAt` obscures that distinction.

**Size / reach:** two geographic tables; three concrete semantic consumer families here (audio, optics, timeline), plus canonical users in systems/rendering. Modules containing the old selector/layout and canonical layout are 176, 110 and 217 LOC respectively. These are not all duplicate geography code.

**Consolidation / cost / risk:** Route semantic consumers through the content lookup; name the legacy selector for art residency and keep its lifetime hysteresis where needed. **S/M; medium boundary/audio regression risk**. All four frozen candidates retain this mismatch.

### F12. Temporary inventory ledger survived registry composition

**Verified:** [B:src/sim/systems/ledger.ts:1](https://github.com/lakeczar/subnautica-clone/blob/4a9d194afa0550b0b8c5b5419982552921b158f6/src/sim/systems/ledger.ts#L1) says its arithmetic is temporary until SYS-2 items join the registry. The registry already composes them (`B:src/content/registry.ts:17,257,599`). `inventory.ts:32–35` and `ledger.ts:21–23` independently compute used capacity; `inventory.ts:45–88` and `ledger.ts:34–43` independently merge/create item stacks. `inventory.ts:348–367` spends by inventory order, while `ledger.ts:58–72` plans by container order. That semantic difference must be made explicit, not erased accidentally. `B:src/sim/systems/journal.ts:49–53` also remerges raw SYS-2 recipes over composed `RECIPES`.

**Size / reach:** inventory 416 LOC versus ledger 78 LOC. **17 `usedCapacity` calls versus three `usedCu`; 13 `addItem` versus six `addStack`; four `spend` versus eight `planSpend`** source calls. Ledger has seven value importers and one type-only importer. Integration-era comments now direct a contributor toward an obsolete split.

**Consolidation / cost / risk:** One composed item/recipe authority and one inventory transaction planner, with explicit spending priorities, charged-cell rules, fitted/provenance handling and stackability. Adapt old convenience APIs rather than copying policy again. **M; medium/high economy and save-state risk**. All four candidates retain both ledgers; SIM mutation makes agreement between preview/execution more important.

### F13. Cache ownership and byte accounting are fragmented

**Verified:** `B:src/content/buildCache.ts:1–12,33–35,68–78` is an optional process-level test-construction store installed through a global property; the ordinary game does not install it. It has **seven production `cachedBuild` callsites**. Separately, cave definitions are cached per floor (`B:src/content/regions/caves.ts:331–338`), derived volumes and shells use WeakMaps (`caveGeometry.ts:263,899`), and light fields use a WeakMap (`render/caves/lightField.ts:151–159`). Long-lived floor/definition roots can keep these derived values reachable; a WeakMap does not make their bytes independently evictable.

**Counterexample worth preserving:** [B:src/render/geometryCache.ts:13](https://github.com/lakeczar/subnautica-clone/blob/4a9d194afa0550b0b8c5b5419982552921b158f6/src/render/geometryCache.ts#L13) is scene-owned, explicitly bounded at **256 entries / 32 MiB**, and disposable (`:24,60`). It is a useful ownership model, not a duplicate to remove.

**Size / reach:** build cache 85 LOC; geometry cache 61; at least four separate definition/derived-data memo tables above, with different lifetimes. This is an ownership inventory, **not a measured retention/leak finding**.

**Consolidation / cost / risk:** Document owner, bytes, eviction, invalidation and scene/session lifetime for each cache. Share bounded-store mechanics where the ownership contract matches, retaining separate build/runtime/GPU caches. **M; medium cache-integrity/eviction risk**. CW improves matters with `httpCaveStore`'s default 12 retained light fields (`CW:src/render/caves/caveStore.ts:48–50`) and bounded GPU light resources; REC inherits earlier CW. COL introduces compact data worth accounting explicitly; SIM does not solve cache lifetime.

## Module boundaries, state ownership and obviousness

### F14. Layering is mostly intact, with a render dependency and real value-import cycles

**Verified boundary:** No direct value import from `src/sim/*` into `src/render/*`, Babylon, DOM or storage was found. Rendering importing simulation views/types is expected. The exception is indirect: `B:src/content/regions/layout.ts:8` imports **`TERRAIN_EXTENT` from `render/terrainSurface.ts`**. The AST value-import closure of `sim/step.ts` contains 152 source modules and exactly that one render module. It is pure terrain math, so “sim imports Babylon” would be false; nevertheless a content extent belongs below the render boundary.

**Verified cycles:** The AST value-edge graph has **two nontrivial strongly connected components**:

- Three render modules: `biomes/scatter.ts:12` → `biomes/vistas.ts:8` → `poi/landmarks.ts:11` → scatter. [B:src/render/poi/landmarks.ts:9](https://github.com/lakeczar/subnautica-clone/blob/4a9d194afa0550b0b8c5b5419982552921b158f6/src/render/poi/landmarks.ts#L9) explicitly relies on calling the imported function only after loading.
- Thirteen simulation modules: carrier, carrierStations, ecology/stimulus, ecologyLink, fauna/catch, fittings, hunter, hunterEncounter, hunterQueries, progression, recovery, survival and vehicles. A minimal witness is `B:src/sim/carrier.ts:6` importing progression and `progression.ts:27` importing carrier.

**Size / reach:** 16 modules in the two value SCCs; the render cycle has three explicit edges and the sim graph includes a two-edge witness. Many additional **type-only** cycles were excluded and are not reported as runtime cycles. Base has 332 TS source files / 60,453 LOC; 256 modules lie in the static `main.ts` value closure.

**Consolidation / cost / risk:** Move the terrain extent to content/world configuration (**S**) and extract narrow pure query/refusal/placement seams for the real cycles (**M**). Avoid barrel rewiring that only hides edges. **Medium risk** around module initialization and behavior placement. All four candidates leave the identified base cycles; COL's dependency on `sim/world` for the `Solid` type is type-only and is not another runtime layering violation.

### F15. Shared roots accumulate responsibilities and integration conflicts

| Module | B LOC | CW | COL | REC | SIM | Responsibilities and base anchors |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `src/runtime/app.ts` | 876 | 1,015 | 876 | 1,181 | 903 | Settings/audio setup `:28–86`; lifecycle `:144+`; input `:235+`; frame/clock `:354+`; timeline `:452+`; session replacement `:501+`; commands `:650+`; gestures and view orchestration. |
| `src/sim/step.ts` | 1,059 | 1,102 | 1,059 | 1,102 | 1,089 | Action dispatcher `:119+`; menu transactions `:560+`; movement/fixed step `:579–1020`; systems/story/berth/recovery/survival integration `:1021+`. |
| `src/sim/world.ts` | 936 | 1,226 | 936 | 1,205 | 936 | Solid assembly `:113+`; collision math `:225+`; terrain guards `:329+`; query implementation `:484+`; kit composition `:763+`; hull/interior worlds `:831+`. |
| `src/ui/panels.ts` | 765 | 765 | 765 | 765 | 765 | Panel lifecycle and focus `:161+`; storage `:295+`; vessel service/recovery `:363+`; fabrication `:503+`; notebook `:614+`; resources `:673+`. |
| `src/content/regions/caveGeometry.ts` | 967 | 1,043 | 1,141 | 1,043 | 967 | Volume sampling, derived floors, collar/shell construction, caching and meshes. |

**Size / reach:** In B, value imports / incoming value importers are app **21/1**, step **34/1**, world **14/26**, panels **25/2** (panels also has seven type-only importers). Other large roots are registry 1,189 LOC, render/expedition 1,116 and save/validation 955. Size alone does not establish poor design; these roots combine policy, ownership and adapters that streams repeatedly need to modify.

**Why it matters / consolidation:** The owner-curated composition roots have done useful integration work, but knowing where a behavior belongs now requires reading several large dispatchers. Carve seams by coherent outcome: simulation command planning, movement, world/collider assembly, runtime session lifecycle, timeline ownership and panel presenters. Keep a short composition root calling those owners. **L as a whole; high conflict/regression risk**; narrower slices can be M. CW/REC/SIM directly grow app/step/world; COL grows cave geometry and deliberately defers root composition. Coordinate the seams before concurrent root edits. Do not mechanically split files by line count.

### F16. Corridor presentation work is a simulation-module singleton

**Verified:** [B:src/sim/carrierStations.ts:184](https://github.com/lakeczar/subnautica-clone/blob/4a9d194afa0550b0b8c5b5419982552921b158f6/src/sim/carrierStations.ts#L184) maintains module-global `job` and `done` (`:209–210`), advances a generator under a `performance.now()` budget, and returns the last completed status. This is presentation scheduling inside a simulation module. There are three `launchCorridorView` callsites (renderer, helm HUD, internal exact wrapper), two explicit reset callsites (app session replacement and exact wrapper), and one production `launchCorridorNow` caller (carrier panel).

**Integration hazard, not a reproduced bug:** The generator says it describes the state it was given, captures hull/state references, and yields during a remedy search (`carrierStations.ts:148–170`). `carrier.ts:195–212` reads the hull pose during that search. Base's clone-per-tick path usually leaves those old objects detached. SIM's live in-place path can mutate the same references between yields. A once-per-second cache restart does not by itself freeze search inputs. This is a source-established alias risk; no end-to-end incorrect launch advice was demonstrated here.

**Size / reach:** approximately 71 LOC for incremental view/cache ownership (`:148–218`), two global job slots and the caller counts above. Multiple app instances/tests share those slots unless resets intervene.

**Consolidation / cost / risk:** Make a per-app/presenter corridor job owner with an explicit immutable input snapshot or revisioned search inputs; keep exact command validation in simulation. **M; medium/high consistency risk**, with targeted tests for motion across yields and session replacement. **SIM is the direct integration trigger**; CW/COL change the world queried, REC changes app lifecycle. Do not claim this is already solved by the live-step guard.

### F17. Feedback strings and events overlap as command outcomes

**Verified:** The source contains **109 lines assigning `.feedback`**. `B:src/sim/step.ts:559–613` converts feedback/refusal changes into notices and sounds, while commands can also emit explicit notices/events. `:1029–1033` separately notices a berth feedback transition. `B:src/sim/systemsLink.ts:286–297` wraps nested event/notice results. `GameEvent` is typed (`B:src/sim/types.ts:300+`) and a central notice priority controller already exists (`B:src/ui/notices.ts:55–82`); those are strengths to build on.

**Size / reach:** 109 assignment lines is a lexical count, not 109 unique behaviors. At least three bridging sites above reconcile state strings, refusal strings and typed events. This raises the cost of changing feedback: an author must know which adapter infers a sound/notice, whether a command already supplied one, and what persists in the save.

**Consolidation / cost / risk:** A typed command outcome/refusal result should feed notice/audio presentation and any persisted last-feedback field. Migrate one command family at a time and preserve centralized notice priority. **M/L; high UX/audio/compatibility risk**. All candidates retain the mixed model; REC observes its events, so changing event attribution affects recordings as well as the HUD.

**Logging check:** Baseline `src` has no direct `console.log/warn/error/debug` callsites in the inspected scan, so there is no evidence for a separate base logger-sprawl finding. REC adds targeted console warnings (`REC:src/render/renderer.ts:350`, `REC:src/runtime/app.ts:561`) beside its structured flight data and the legacy DOM diagnostics. That is a migration/consumer-boundary issue (F04), not justification for another general logging framework.

### F18. UI extension and formatting patterns diverge

**Verified:** `B:src/ui/panels.ts:40–61,114` defines `PanelSection`, `SectionKit` and composition. Fauna and story/ecology sections use it (fauna registration at `B:src/ui/faunaPanels.ts:26–28`); systems/carrier also expose bespoke full-panel functions. `B:src/ui/systemsPanels.ts:40` declares its own `Group` signature rather than sharing the complete kit. [B:src/ui/systemsPanels.ts:44](https://github.com/lakeczar/subnautica-clone/blob/4a9d194afa0550b0b8c5b5419982552921b158f6/src/ui/systemsPanels.ts#L44) and `B:src/sim/systems/journal.ts:49` duplicate the same seconds/minutes formatter. Local item-label fallbacks similarly coexist with ledger/registry labels.

**Size / reach:** main panels 765 LOC, systems panels 216, carrier panel 121; one shared extension kit plus at least two bespoke presenter families. The systems `basePanel` and `carrierPanel` each have one production callsite in `panels.ts:222,226`; fauna has one registration caller. Two exact duration-format implementations are confirmed; this is not a claim that all panel HTML is duplicate.

**Consolidation / cost / risk:** Reuse typed presenter/section contracts and small formatters, preserving existing shared `ui/format.ts` escaping/headings. **S/M; medium focus/disclosure/accessibility risk**. Keep gameplay queries in their owner modules; avoid replacing these small patterns with a new general UI framework. All four retain the split; REC adds settings/export UI consumers.

### F19. Repeated math and time conventions need explicit semantics

**Verified:** Four LCG implementations appear in `B:src/render/geometry.ts:14–19`, `render/kit/factories.ts:13–15`, `content/regions/noise.ts:54–58` and `render/currentStreaks.ts:56`. The kit implementation maps seed 0 to 1; the others' zero behavior differs. Distance helpers overlap at `sim/inventory.ts:12` and `sim/ecology/vector.ts:8`; clamp helpers appear in step, runtime helm and rib collision. Fixed-rate constants are independently encoded in `sim/clock.ts:1`, timeline recorder `:15`, survival `:17`, recovery `:25` and hunterEncounter `:21`.

**Size / reach:** at least four RNG definitions (roughly 17 LOC together), two distance definitions, three clamp sites and six time-rate definitions in the examples. The shared render `seeded` has 11 direct source callsites; the other generators are also passed as callbacks, so direct-call counts alone would understate usage. These are small helpers; their primary cost is ambiguity and divergence rather than module size. Not every literal 60 is a simulation-rate conversion: some express minutes or a gameplay duration.

**Consolidation / cost / risk:** Small domain-level math/time/seed utilities with explicit units and seed compatibility, used where contracts match. **S/M; low/medium reproducibility risk**. Preserve authored randomness and angle/coordinate conventions; an apparently equivalent RNG can change world art. All four retain the examples. Avoid a global constants dump that makes local tuning harder to understand.

### F20. A small unused exported API set is confirmed; broad dead-code claims are not

**Verified:** `B:src/sim/fittings.ts:311–313` (`flareLights`), `:326–327` (`pilotMotion`) and `:328` (`upgradeLabel`) have **zero external name references/calls** across inspected source, tests, scripts, tools and HTML/MJS entrypoints. They are small candidates for deletion or deliberate API retention.

**Size / reach:** three exports, approximately nine lines including nearby comments, zero consumers. Tree shaking may already exclude them; a bundle win is not established. TypeScript's unused-local checks do not prove exported APIs have consumers.

**Do not misclassify:** LC modules/viewers, content proposals and campaign-economy tools outside the `main.ts` closure have legitimate tool/planned-content roles. `?dev` actively controls developer tools (`B:src/ui/carrierPanel.ts:1–6` and app/input wiring); rich/light quality options are consumed. **No confirmed abandoned production flag was found.** Legacy terrain and hooks are addressed separately in F04/F10.

**Consolidation / cost / risk:** Remove genuinely unconsumed exports after a whole-repo reference check, and identify owner/entrypoint for intentional labs. **S; low risk**, low runtime value. None of the four candidates removes this base set. Prefer this bounded result over inferring dead modules from the gameplay closure alone.

## Evidence integrity and test-suite health

Base inventory: **137 fast test entrypoints, 62 heavy entrypoints; 238 test/support code files totaling 41,166 LOC**. Entrypoint and code-file counts differ because support files are included in the latter. These counts describe maintenance surface, not coverage quality. No tests were run in this audit.

### F21. REC image stability can never report an animating pair

**Confirmed source defect:** [REC:scripts/rec/views/capture.mjs:75](https://github.com/lakeczar/subnautica-clone/blob/b65dfbbc3a87dd4d9b47e17a6928255be84de29b/scripts/rec/views/capture.mjs#L75) captures `a`, then repeatedly captures `c`. If they match it breaks; otherwise it assigns `a = c` (`:79–80`). On exhausting all 12 attempts with continuously different images, that final assignment still makes `a === c`. The recorded `stable: a === c` at `:89` is consequently true after either normal loop exit. The unequal diagnostic pair at `:85` is unreachable after a completed loop.

**Why it matters:** The baseline acceptance check trusts the flag (`REC:scripts/rec/views/accept.mjs:26`); comparison annotations trust it (`compare.mjs:72`); the capture summary counts unstable views from it (`capture.mjs:102`). A renderer that never produces the same pixels twice can be certified stable. This defect is separate from honest uncertainty about whether settled counters imply a fully rendered view.

**Size / reach:** one loop and **three downstream consumers**; capture/accept/compare files are 103 / 38 / 110 LOC. The flawed stability loop/flag occupies roughly 15 LOC. REC's synthetic pack tests do not exercise this loop (F25).

**Consolidation / cost / risk:** Track an explicit successful equal-pair comparison and preserve the last unequal pair for diagnostics. Exercise sequences that stabilize immediately, stabilize late and never stabilize through the limit. **S; low fix risk, high current evidence-integrity risk**. This affects REC only at the frozen candidates and should be resolved before relying on its fixed-view stability admission.

### F22. REC baseline index can describe different bytes from the stored image

**Confirmed source defect:** [REC:scripts/rec/views/accept.mjs:30](https://github.com/lakeczar/subnautica-clone/blob/b65dfbbc3a87dd4d9b47e17a6928255be84de29b/scripts/rec/views/accept.mjs#L30) addresses a baseline as `<class>/<view>/<commit>.png`. If that destination exists, copying is skipped (`:32`), but the index always receives the new capture's `sha256` (`:34–35`). Accepting a second, different image for the same view/commit therefore leaves old PNG bytes beside a new indexed hash. `REC:scripts/rec/views/compare.mjs:74` trusts that hash for the “identical” shortcut before loading baseline bytes.

**Why it matters:** The baseline's visual artifact and metadata can disagree, making later “identical” reports and visual comparisons refer to different evidence. This path is plausible: `REC:docs/build/streams/REC-1.md:70,90` historically reports **12 of 143 same-build views differed between runs**. It is not a purely hypothetical corrupt-disk scenario.

**Size / reach:** one destination/copy guard and one index assignment in a 38-line CLI; one downstream identical-hash shortcut in the 110-line comparison CLI.

**Consolidation / cost / risk:** Content-address the PNG, or atomically replace/verify the destination before publishing matching metadata. Verify the on-disk bytes when accepting, rather than relying only on capture metadata. Add a same-commit/different-image reacceptance regression. **S; low fix risk**, with care for the intentional acceptance history/store contract. REC is the affected candidate; the other three do not add this path.

### F23. Cache-budget test can pass with no successful cache admission

**Verified assertion gap:** [B:tests/regions-bake.test.ts:68](https://github.com/lakeczar/subnautica-clone/blob/4a9d194afa0550b0b8c5b5419982552921b158f6/tests/regions-bake.test.ts#L68) requests 12 chunks, waits fixed 5/50 ms periods, then asserts only `cachedBytes <= bound && files <= 4`. **Zero files and zero bytes satisfies the test.** It does not require a successful decompression, settlement without failures, or eviction. `B:src/render/biomes/terrainAssets.ts:63–65` performs asynchronous decompression and counts failures. Nearby absent-file checks use additional fixed sleeps (`regions-bake.test.ts:81–83`).

**Size / reach:** one approximately six-line budget test inside an 86-line file, 12 requested IDs and one upper-bound assertion. Nearby tests have useful positive content/reuse assertions; the whole terrain suite is not vacuous.

**Consolidation / cost / risk:** Await an observable terminal condition, require positive successful admission and no failures, then demonstrate eviction and retained-cache reuse under pressure. **S; low implementation risk**, high confidence value. This is a source-proven false-pass possibility, not a freshly observed failure. The base and candidate terrain path are affected; CW's expanded baked assets make the assurance more valuable.

### F24. Test construction helpers and bake probes have dormant/copy forks

**Verified:** `B:docs/build/streams/ca-1/ca1-bake-probe.heavy.test.ts` is **120 LOC**; `CW:tests/cw1-bake.heavy.test.ts` is **118 LOC**, with **65 exact matching lines**. The documentation probe is outside the test include at `B:tsconfig.test.json:12`; it is a dormant executable copy, not a second automatically scheduled test. At least four definitions each of generator draining and chunk-rectangle helpers occur across the probe, CW test, `B:tests/c4-cave-bake.test.ts:19` and `B:tests/regions-bake-support.ts:15`.

**COL qualification:** COL adds **19 test/support files, 2,526 LOC**. Its geometry probes are valuable independent assertions, not simply redundant test volume. However, `COL:tests/col1-oracle-support.ts:154–170` copies a private production collar builder, creating another synchronization point when CW/COL compose. `COL:docs/build/streams/COL-1.md:21–28` historically reports smooth fixtures missed **0.1–2.5 m collar errors** until cliff/step probes were added. Shared fixtures must not eliminate such adverse diversity.

**Size / reach:** one quantified copied pair, at least four instances each of two helper shapes, and one copied oracle composition. This audit did not compute a whole-suite clone percentage.

**Consolidation / cost / risk:** Share generator/chunk construction and fixture ownership, retire dormant executable copies, and keep independent numerical/geometry expectations. **S/M; medium risk** if sharing the production algorithm turns an oracle into a tautology. CW/COL are the direct integration partners; REC/SIM should consume shared support without weakening their separate behavior contracts.

### F25. Harness tests have useful but limited scope; timing history is not a fresh pass

**Verified scope:** `B:tests/app-loader.ts:5–8` replaces renderer, view and input for **three actual app-test consumers**. The 242-line `tests/app-browser-support.ts:123–132` sets renderer readiness directly. Those tests exercise real session/app/save wiring, but cannot establish actual rendered readiness, physical input or GPU behavior. Label that boundary; do not discard them as “only harness tests.” REC adds two files totaling **300 LOC and 16 syntactic test registrations**; `REC:tests/rec1-pack.test.ts:15–35,84–99` uses synthetic recordings/fake page providers and does not cover F21's capture loop.

**Flakiness assessment:** `B:docs/build/STREAMS.md:145` records historical host-load failures in two streaming suites. Both now use deterministic `workClock` functions (`tests/regions-stream.heavy.test.ts:48`, `tests/world-stream.heavy.test.ts:48`), at **six construction sites**. This establishes scheduling/residency/disposal semantics, not real frame time. `B:docs/build/streams/SCHED-2.md:429` separately records a 300 ms sleep flake fixed with condition waiting. There is **no fresh basis here to label those corrected suites currently flaky**. The fixed sleeps and false-pass assertion in F23 remain a specific source concern.

**Historical duration / accounting:** `B:docs/build/streams/TT-1.md:11–14` reports fast tests **512 → 99 seconds**, heavy **955 → 293 seconds**. `B:scripts/test-tier.mjs:162` subtracts cache-fill CPU from the fast budget, and four heavy timing files run alone within their suite (`tests/heavy-budgets.json:12–18`). Those are useful admission/accounting choices, not proof of an undisturbed machine-wide performance run. Keep wall time, measured CPU, cache warmth and admission class distinct.

**SIM safeguard:** Base has **245 literal `stepGame(` calls across 51 test files**. Some intentionally fork from a shared original (`B:tests/os2-refinements.test.ts:55–59`, `tests/expedition-decisions.test.ts:33–39`). SIM retains the pure API and adds a 15-line loop helper (`SIM:tests/step-support.ts`), rather than globally converting assertions to aliases of mutated state. Its 140-line differential loads the base simulation and world separately (`SIM:scripts/playthrough/differential.ts:38–43,63–114`); its handoff historically reports 68,856 state comparisons over five scenarios (`SIM-1.md:77–96`). The per-tick benchmark is explicitly disturbed and clean exclusive evidence is missing (`:107–110`). Preserve these qualifications.

**Consolidation / cost / risk:** Shared condition-wait and deterministic-clock helpers, explicit mocked/seeded/real-render coverage labels, and targeted regressions at the actual evidence boundary. **S/M; medium test-confidence risk**, high risk for blanket in-place test conversion. The counted sites above define the maintenance surface; no suite rerun or new flake-rate measurement was performed. REC/SIM directly touch this area; CW/COL expand the geometry/streaming fixtures.

## Build, scripts and evidence workflows

Base inventory: **72 script code files / 13,240 LOC**, plus **38 stream executable files / 3,759 LOC** under `docs/build/streams`. Counts exclude JSON and images. Some are valid one-off historical probes; others are active tools copied between streams. Historical evidence should remain attributed even if its driver is retired.

### F26. Active play, GPU and save drivers repeat infrastructure

**Verified duplication:** In base stream executables there are **14 `chromium.launch` callsites**, **16 `createServer` callsites across 13 files**, and **13 `goto` definitions**. The ATM-1, POI-1 and W2 servers are **147 LOC each**; ATM-1 shares **144 exact lines with POI-1 and 145 with W2**. See [B:docs/build/streams/atm1/server.mjs:14](https://github.com/lakeczar/subnautica-clone/blob/4a9d194afa0550b0b8c5b5419982552921b158f6/docs/build/streams/atm1/server.mjs#L14), `:29,111`. Thirteen files hardcode `createRequire("/work/tmp/gpu-prep/pw/")`. Readiness, preview hosting, GPU selection, steering, save installation and cleanup therefore have multiple maintenance sites.

**In-flight expansion:** CW adds a 329-line traverse driver (`CW:docs/build/streams/cw1/traverse.mjs`), beside base `scripts/soak/browser.mjs` (164 LOC) and REC's `scripts/rec/browser.mjs` (133 LOC). Scenario differences are real, but the browser/server/platform/recovery plumbing overlaps.

**Save-fixture divergence:** Base has **12 derive scripts / 619 LOC**. Some seed diagnostic state through test helpers (`B:docs/build/streams/c4b/derive-c.mjs:8–25` funds/stages a kit), while others play commands (`ux1/derive2.mjs:24–49`). Latest CW's 216-line derive driver selects a SAVE-1 library save and copies it unchanged (`CW:docs/build/streams/cw1/derive.mjs:30–37,210–212`). REC retains an older 227-line version that relocates the craft and resets charge, health and vitals (`REC:docs/build/streams/cw1/derive.mjs:207–214`); its handoff acknowledges those derived traversal saves (`REC-1.md:89`). Do not attribute the older REC traversal to the newer earned-save guarantee.

**Consolidation / cost / risk:** One maintained active server/browser/input/recording substrate with task-owned lifecycle and platform options; scenarios supply route behavior and provenance. Standardize active traversal fixture selection on SAVE-1 and clearly label seeded diagnostics. Archive old executable copies with their evidence rather than pretending all historical routes can be rerun identically. **M; medium cleanup/platform/evidence risk**. CW × REC × soak are the active seams; COL/SIM benefit from the common harness. This audit launched no browsers.

### F27. Bake, verify and cache helpers overlap, but their products differ

**Verified:** `B:scripts/test-build-cache.mjs` is **104 LOC** and installs the deterministic test-construction cache described in F13. `B:scripts/bake-terrain.mjs` is **151 LOC**, expanded to **197 LOC in CW**, and publishes shipping terrain/cave artifacts. These are not duplicate caches to collapse into one lifetime. The repeated generator/chunk conformance helpers are concrete overlap (F24); source hashing/publication mechanisms can also be reused where their invariants match.

**Existing consolidation to keep:** CW introduces a **28-line shared bake source-hash helper** (`CW:scripts/bake-source-hash.mjs:1–28`) and extends a single `bake-terrain --verify` invocation to terrain, collision and light artifacts (`CW:tests/regions-bake.heavy.test.ts:11–14`). Its handoff reports **276/276 files** equal live bytes (`CW:docs/build/streams/CW-1.md:89`), historically, not freshly checked here. Keep live-byte/uncached construction assertions: matching a source hash alone is not an oracle for correct output.

**Size / reach:** two main tools of different purpose, one shared hash helper, one combined verification invocation, plus F24's duplicated helper sites. This audit does not treat all their LOC as redundant.

**Consolidation / cost / risk:** Share source-identity, atomic publication and conformance primitives where appropriate; keep build-test cache, runtime asset cache and GPU ownership distinct. **S/M; medium stale-artifact/cache-integrity risk**. CW is already reducing verification sprawl; REC inherits earlier CW, COL adds future collider bake obligations, and SIM relies on deterministic test construction. Adopt the common verify path when composing them instead of adding another per-stream verifier.

### F28. There is no single canonical composed-game gate

**Verified:** Base contains **six economy/progression CLIs totaling 850 LOC**; none is in [B:package.json:17](https://github.com/lakeczar/subnautica-clone/blob/4a9d194afa0550b0b8c5b5419982552921b158f6/package.json#L17)'s `check`. Whole playthrough is a separate package command. SAVE-1 adds another manual merge-gate action (`B:docs/build/STREAMS.md:566`: run `scripts/saves-export.sh` after game-code merges).

The resulting selection drift is observable: “all five” in `COL:docs/build/streams/COL-1.md:71` includes **progression-curve**, whereas `SIM:docs/build/streams/SIM-1.md:143` includes **upgrade-economy**. Current checks also coexist with historical adoption receipts: `B:scripts/check-m1-economy.mjs:20–39` checks historical hashes, literal content versions and a manually enumerated recipe roster. Several tools already reuse production economy functions; their complete bodies are not duplication.

**Size / reach:** six separate CLIs / 850 LOC, at least two conflicting five-tool handoff lists, a package gate and additional documented post-merge commands. `scripts/`'s broader 72-file inventory includes useful queue, save, soak and test infrastructure, not 72 obsolete scripts.

**Consolidation / cost / risk:** Declare the current required checks once and expose one composed command for the coordinator, separating focused developer checks from merge/playtest gates. Distinguish historical adoption tests from current gameplay invariants; put the latter behind the canonical command. Route heavy/headless work through the queue with machine tags, and avoid nesting an already queue-wrapped heavy command inside another heavy job. **S for a manifest/command, M for historical-script cleanup; low/medium risk** from accidentally dropping an intended gate or changing admission semantics. COL/SIM/CW demonstrate the drift; REC should consume the same declared gate rather than another copied checklist.

## Branch integration disposition

| Candidate | Removes or improves | Retains / adds debt | Composition attention |
| --- | --- | --- | --- |
| CW | Sliced cave/light construction; baked collision/light assets; latest top-k lights and caller-buffer world queries; bounded light retention; SAVE-1 selection. | Object-heavy kit collision construction, per-frame stream ranking, legacy terrain/geography, targeting/profile/previews, extra driver copies. | Keep latest optimization commits; do not equate sliced work with zero allocation or clean 3090 evidence. |
| COL | Common static collider adapters, compact biome representation, adverse geometry probes. | Adds 2,584 LOC before replacing root paths; base `sim/world.ts` remains unchanged; copied oracle composition. | Stage B owns actual deduplication, collars/terrain ownership and CW bake/store composition. |
| REC | Typed recorder/on-demand scene snapshots; renderer canvas tick hook replacement; fixed views and pack workflow. | Old DOM counters, older full light sort and derived saves, two confirmed fixed-view integrity defects, another browser layer. | Fix F21/F22, migrate counters' readers, and merge forward CW fixes/provenance without rewriting historical evidence. |
| SIM | Live in-place step with exception guard; pure wrapper retained; timeline buffers and loop helpers; cross-commit differential. | Pre-step pose/journal allocations, preview clones, derived-view rebuilding; live alias/lifecycle risks. | Audit out-of-guard writers and retained state references, especially corridor jobs; preserve fork tests and compare against the proper old world. |

The favorable foundations are real: a typed shared `WorldQueries` seam, composed content registries, strict TypeScript, reusable recipe formats, bounded scene geometry cache, deterministic streaming clocks, SAVE-1 and queued heavy work. A useful health pass should deepen these owners and remove their temporary forks. It should not replace them with a single global utility bag, flatten distinct ownership contracts, or call historical evidence current.

## What a new contributor or agent will trip on

- `legacy*` looks dead while still owning accepted opening terrain (F10); `worldRegionAt` sounds semantic while selecting four-region render geography (F11).
- Two classes both named `RecipeBuilder` rotate boxes differently (F08); similar RNGs disagree about seed zero (F19).
- A “temporary until composed” ledger remains after composition; some systems remerge raw recipes over the registry (F12).
- State sometimes means a detached snapshot and, in SIM live play, sometimes a persistent mutable object; module-global presentation jobs retain it (F01/F16).
- A refusal may be returned text, persisted feedback, an explicit notice or inferred notice/sound; the bridge is in the large step root (F17).
- Passing mocked readiness or a cache upper bound does not prove visual readiness or successful caching (F23/F25).
- “All five economy checks,” “stable capture,” “legacy counters removed,” and “COL unified collision” each require inspecting the actual version/contract rather than trusting a shorthand handoff (F04/F09/F21/F28).

These are concrete naming/ownership inconsistencies, not a request for cosmetic renaming across the entire repository.

## Inspection recipe and limits

Representative read-only commands used (replace aliases with the frozen SHA table):

```bash
git show <sha>:<path> | nl -ba
git diff --numstat 4a9d194afa0550b0b8c5b5419982552921b158f6...<candidate> -- src scripts tests
rg -n 'chromium\.launch|createServer|function goto' docs/build/streams
rg -n 'structuredClone|dataset\.tick|vehicleProfile|usedCapacity|planSpend' src tests scripts tools
rg -n 'function workClock|now: workClock' tests/*stream.heavy.test.ts
git status --short
```

Lightweight Python scans counted lines/files and exact matching lines. An existing shared TypeScript API parsed static imports, excluding type-only edges for value SCCs/closures, and counted source call expressions. The analysis scripts and scan output lived in `/tmp`; they are not shipped as another permanent tool. No runtime profile, browser, build, test suite, deployment or source edit was performed. Proposed fixes require normal focused validation by their implementation owner; historical results above do not substitute for checking the composed candidate.
