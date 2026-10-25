# Siltwake direction audit

Independent Sol 6.1 / xhigh audit, 2026-10-19. Audited source: `f76ec48eba3feda55046616b86adc9b018c8006f`. Production source, tests, scripts and package inputs are identical to accepted `eb712f1`. M2-B1 is separate, unfinished work; observations of its checkout are explicitly identified below. This is a direction audit, not feature acceptance. No protected spoiler documents were read.

## Executive summary

1. **CHANGE — Optimize for a complete campaign.** There is a sound first-expedition prototype, not a nearly finished ten-hour game: one earnable craft, four benchmark habitats, six clues and no playable finale. The physical world is about 1/34 of the planned area. Finish a rough, connected beginning-to-ending game before another broad opening-polish cycle.
2. **STOP — Recursive acceptance bookkeeping.** At this HEAD, 484 of 681 reachable commits touch only Markdown or `docs/`; `docs/build` contains 643,078 words. Reviews caught serious defects, but hundreds of payload hashes and repeatedly reconciled historical receipts are consuming integration attention without demonstrating better play. Keep one fresh Sol review per coherent feature, coordinator inspection and focused reproductions.
3. **CHANGE — Establish world-production seams before multiplying content.** The renderer streams whole hardcoded regions while retaining all four current regions, and always retains one global terrain. There is no production instancing/LOD pipeline. Introduce chunk descriptors, bounded construction/upload, spatial queries and byte budgets, then prove a fifth-region eviction and a representative dense scene.
4. **CHANGE — Stop promising permanent compatibility with every development checkpoint.** Frozen old save domains alone occupy 2,745 lines. Keep strict current validation, atomic writes, corruption rejection and real invested saves; convert named development fixtures once and retain, at most, a temporary previous-version bridge.
5. **CHANGE — Separate behavioral checks from expensive art verification.** The default test command runs every test file with Node's default file concurrency. A stale Babylon-object assertion is the strongest static explanation for the 9 GB incident; B1 has now changed it. Serialize heavy jobs, make failure messages small, and retain meaningful lifecycle coverage. Browser memory does not presently establish a retained-region leak.
6. **CHANGE — Produce rich scenes and concise workflows, not more explanatory panels.** The palette and creatures have character. The opening vista remains sparse, broad caustic stripes dominate surfaces, and four initial fabrication rows already exceed an 800-pixel viewport. Review actual authored scenes and compact preparation/return flows as content is added.
7. **KEEP — The useful engineering foundation and honest limits.** Pure simulation, commands/events, physical/render datums, transactional recovery/docking and independent review have paid off. Keep Babylon/TypeScript, Opus builders and one fresh Sol reviewer. Obtain fresh-player and real-GPU evidence; agent transcripts cannot establish enjoyment, ten-hour pacing or 1080p/60 fps.

## Audit method and verified scale

I read the current build instructions, authoritative revised prompt, integration/world/fleet/story/graphics/delivery specifications, current build records and selected review reports/dispositions; inspected the production modules and tests; built the game; and used an isolated T3 preview for bounded play and memory observations. I did not run the test suite or a render test, modify production, delegate, touch B1's processes, push or create a PR.

Reproducible measurements before adding this report:

| Measure | Result / interpretation |
| --- | --- |
| Reachable commits | 681; earliest October 17, latest October 19, roughly 2.5 days |
| Documentation commits | 476 touch only `.md`; 484 touch only `.md` or paths under `docs/`; 466 touch only `docs/`. Merge commits with no ordinary diff are excluded from these classifications. The supplied 680/425 figures depend on an earlier checkpoint/definition. |
| `docs/build` | 398 files; 33,480 lines; 643,078 whitespace-delimited words; 5,287,593 bytes |
| `docs/build/reviews` | 85 files; 167,190 words. These include dispositions, not 85 independent feature reviews. |
| Production TypeScript | 56 files; 16,915 lines. Including CSS: 59 files / 17,729 lines. |
| `src/save` | 12 files / 3,969 lines, 23.5% of production TypeScript |
| Tests | 51 TypeScript files / 14,069 lines, including support files; not a count of test cases |
| Registered worktrees | 142. That verifies accumulation, not that every noncurrent worktree is safe to remove. |
| Existing external evidence | 1,251,331,644 bytes before this audit's additions, approximately 1.17 GiB |

Counts use Python `Path.rglob`, `splitlines` and whitespace `split`; commit classification uses `git rev-list HEAD` and `git diff-tree --root --no-commit-id --name-only -r <sha>`. `git diff eb712f1 f76ec48 -- src tests scripts package.json` is empty. Raw counts, check logs, screenshots and memory records are under `/home/worker/.local/share/siltwake-evidence/direction-audit/`. These are local evidence, not public delivery links.

## 1. Process economics: preserve adversarial review, remove ceremony

The independent gate has real value. The claim that the whole process produced only paperwork is false. Examples from actual dispositions:

| Review record under `docs/build/reviews/` | Defect or useful result | What earned its cost |
| --- | --- | --- |
| `FND-ECO-R1.md` | Quota/write failure prevented an exportable New/import session; compare-then-write lost a successful save generation. Both reviewers found these. Astra also identified the vulnerable Vite pin. | Actual browser quota behavior, a short interleaved-storage reproduction and dependency audit. The passing initial 18-test suite missed them. |
| `M1-BATCH-R1.md` | Boundary distraction made state unsaveable; New/import left stale recovery meshes; occupied tow/salvage broke player–vehicle persistence. Two findings overlapped; occupied recovery was additional. | Real command/state and production-factory reproductions. These protected progress and visible correctness. |
| `M1-BATCH-R2.md`, `M1-BATCH-R3.md` | Attached craft could leave bounds during carrier motion; an old carrier-room migration could successfully load an unsaveable pose. | Cross-system boundary inspection. The latter also shows the work created by supporting unpublished historical layouts. |
| `POLISH-1-SLICE1-R1.md`, `POLISH-1-SLICE2-R1.md` | Native Tab could close a panel/capture input; save retry left a false warning; departure retained stale storage intent. | Focus/interruption checks through the actual application boundary. |
| `POLISH-1-EXPERIENCE-R1.md`, `POLISH-1-EXPERIENCE-R2.md` | Save warning hid bearing cues; warning stacks hid interaction; subsequent fixes exposed adjacent overlaps. | Small-viewport screenshots and concrete overlap measurements, rather than a test count. |
| `OPUS-STAGE1-R2-DISPOSITION.md` | Permanent swim trap: a valid sweep was followed by a surface clamp into geometry. The actual trapped save could move zero metres across 72 tested input directions. | Experience review followed by a minimal real-call-site reproduction. This was a serious defect after technical acceptance. |
| `M2-A-R1.md` | Hunter could stall beside the fleet for 1,778 steps / 29.63 seconds; warm activation missed the stated budget. | Behavior and timing evidence exposed actual limitations. |
| `SPACE-1-SOL-XHIGH-RESUME-R1-DISPOSITION.md` | No implementation findings; accepted bounded renewal and migration. | A clean review can be useful. Its 79 payloads and 31,119 historical-validator comparisons should not become the minimum cost of every content addition. |

The old Astra/Sol pair was required by the then-current owner policy. It was not an unauthorized coordinator invention. Some second reviews found unique serious issues, so their historical value is demonstrable. The owner has now deliberately chosen one fresh Sol reviewer; `MODEL_POLICY.md` and the revised input already support that change.

The excess is the machinery surrounding useful work. `M2-A-AFFECTED-PLAY-INTEGRATION.md` verifies 437 payload files and 439 archive files. STATUS records 110 verified payloads for a CSS caption follow-up, 414 for a call-layout correction, and multiple separate source/report/composition checkpoints. Not every leaf task received its own independent gate; some correctly shared the complete batch gate. Nevertheless, leaf authors, integration receipts, reattribution and subsequent reconciliation became a substantial product of their own. In the sampled dispositions, the defect discoveries came from source inspection, focused reproductions and actual views, not bulk hash enumeration. This is a sampled attribution, not an exhaustive economic census or token-cost calculation.

The warm-region sequence is another example. The final `M2-A-SOL-XHIGH-R1-DISPOSITION.md` records a useful structural change: reattach retained owners, with 56 measured transitions at median/p95/max 0.25/1.2/3.0 ms. It also explicitly says the earlier outliers' cause was never established. Earlier timing loops and eleven later page sessions did not solve cold construction: roughly 272–387 ms cold entry and 300.2/64.6 ms synchronous idle preparation remained. Stop trying to retrospectively explain every noisy shared-host sample once the meaningful critical path has changed. Measure explicit warm, cold, menu and restoration budgets under declared conditions.

Recommended lean gate:

1. **One coherent player outcome.** Author owns the connected implementation, meaningful behavioral regressions, final build and one relevant ordinary-control sequence. A caption adjustment is a correction within that outcome.
2. **One concise handoff.** Source SHA, changed contracts, check commands/results, a few representative images, one reproducible failure/reload example and explicit limitations. Preserve original evidence without copying all ancestors into every new bundle.
3. **One fresh Sol review plus coordinator inspection.** Review full feature risks and affected source; reproduce important findings. After correction, use a fresh affected review with all original objections, rerunning changed risks rather than unchanged broad checks. Keep the owner-required milestone Opus experience audits.
4. **One composed milestone check.** Run broad integrated checks once when the combination changes. A new integration defect justifies another relevant check. Documentation-only receipts do not justify a full suite.
5. **One ordinary evidence index.** SHA/source attribution and a manifest for retained artifacts are sufficient. Reserve detailed integrity investigation for missing, contradictory or suspect evidence. A passing checksum is transport integrity, not gameplay quality.

## 2. Save and migration: keep safety, narrow compatibility

Accepted production writes **schema 4 / `expedition.5`**. These are different version numbers. B1 is evolving schema 4→5; its unaccepted domain must not be described as today's released schema.

`src/save/codec.ts:110` accepts foundation schema 1, schema 2 with `expedition.2`/`.3`, schema 3 with `expedition.4`, and current schema 4 / `expedition.5`. That compatibility pulls substantial historical gameplay definitions into the browser:

| Cost | Measured size |
| --- | ---: |
| `src/save/legacy/` — old registry, types, validator and carrier entry handling | 1,689 lines |
| `src/save/expedition4/` — another domain, types and validator | 1,056 lines |
| Combined frozen domains | **2,745 lines** |
| Current `validation.ts` | 763 lines |
| Four migration test files | 872 lines |
| `tests/legacy-fixture-support.ts` | 100 lines |

This is not just serialization overhead. Historical imports preserve old collision/layout behavior, exact rosters and text. Current `validation.ts:222` compares saved evidence provenance to current registry prose; `:501` requires the exact complete source roster. Recipe receipts, capacities and stock are also strongly bound to today's content. Editing geography, source stock or narrative wording can therefore require a historical-domain project. B1's brief explicitly requires freezing the previous exact domain again. There is no basis here for a numeric builder-hours estimate, but the repeated copied domains, tests and review rounds are visible recurring work.

Fixtures and regressions affected by a simplification:

- `migration.test.ts`, `carrier-migration.test.ts`, `m2-migration.test.ts` and `renewal-migration.test.ts` test historical versions explicitly.
- `legacy-fixture-support.ts` reconstructs old inputs from current state, and is also consumed by `rib-surface-trap.test.ts`, `recovery-occupancy.test.ts` and `expedition.test.ts` (as well as migration tests). That coupling makes ordinary behavior tests pay for old schemas.
- `tests/fixtures/reef-rib-trap-expedition3.json` is a real historical trap fixture, used by M2 migration/trap regressions. Preserve the original as archived evidence and convert it once to a current-schema fixture; keep the movement and successful-load safety regression.

**Recommendation: a middle ground.** Keep strict current-schema validation, bounded input parsing, future-version rejection, atomic journal/current-previous generations, export/import preservation, exclusive writers and immediate-command saveability. Those protect actual player progress and caught real defects. Do not replace them with permissive unchecked JSON.

Stop adding a permanent runtime migration for each internal checkpoint. Inventory the owner's and builders' named invested saves, preserve originals, convert them once at integration, and support at most the immediately previous accepted development schema for a declared transition window. Keep older converters offline or archived outside the browser import graph. Maintain a small current-schema fixture set for earned progression, failure, carrier occupancy and known geometry traps. Version stable facts and IDs rather than exact display prose. Adopt a durable compatibility promise at the first externally distributed save format.

This changes an explicit current brief requirement, so the coordinator should record the decision and revise future briefs; a builder should not silently drop supported saves while B1 is underway.

## 3. Tests and runtime memory

### What gives confidence

Keep tests of conservation/atomic refusal, current save corruption handling, immediate-command saveability, independent suit/hull pressure, all-advanced-hulls-disabled recovery, docking interruption/clearance, fixed-step interruption, target line of sight and food recovery from empty inventory. Representative files include `command-snapshot.test.ts`, `save.test.ts`, `session.test.ts`, `recovery-occupancy.test.ts`, `carrier-clearance.test.ts`, `input.test.ts`, `targeting.test.ts` and `m2-route-recovery.test.ts`.

The route/recovery tests exercise real domain operations and retained investments; they are useful even when their preparation is seeded. They do not prove that a new player can see the entrance, understand a cue or enjoy the hauling. `app.test.ts` uses a mocked browser/view/renderer via `app-browser-support.ts` and the loader: good for orchestration, insufficient for actual HTML layout, WebGL or audio.

Geometry-to-collision and render lifecycle tests are also valuable. The trap and stale-mesh findings explain why they exist. The problem is their cost, concurrency and failure representation, not the idea of testing ownership.

### Likely explanation of the Node memory incident

`package.json` runs `node --test .test-build/tests/*.test.js` with default file concurrency. Seven files directly import Babylon/NullEngine: `terrain-boundaries`, `renewal-render`, `m2-region-render`, `encounter-art`, `resource-surface`, `render-cache` and `render-lifecycle`. Their real factories build terrain and thousands of temporary procedural primitives; they are not cheap unit tests.

`docs/build/WORKER_RESOURCE_LIMITS.md` records `render-lifecycle` at **7,574,680 KiB RSS plus 3,935,200 KiB swap**, with a concurrent `m2-region-render` process at 1,634,212 KiB RSS. More VM memory or a GPU does not fix Node assertion formatting or NullEngine allocation.

The strongest specific static lead is `tests/render-lifecycle.test.ts:159` at the audited HEAD:

```ts
assert.equal(scene.getMeshByName(`${dart.id}.cockpit`), null,
  "same ID with a different hull cannot retain Dart children");
```

The test changes that same vehicle ID from Dart to Creel. In B1, `src/render/expedition.ts` dispatches to `creelArt`, and `src/render/fleetArt.ts:147` legitimately creates **the Creel's own** `${id}.cockpit`. The old assertion now fails with an actual Babylon Mesh versus null. Node's assertion diagnostics can inspect/diff the large cyclic Mesh→Scene→geometry graph. That is a credible mechanism for runaway failure reporting. Subsequent assertions also incorrectly assume that admitting the new Creel recipes leaves cache entry counts unchanged.

During this audit B1 changed this test to small boolean identity/disposal checks and adjusted cache expectations; its working diff is preserved at `direction-audit/b1-render-assertion-diff.txt`. I did not edit or run it. Thus this is a concrete stale-test diagnosis and a strong candidate for the allocation incident, **not a heap-profile-confirmed root cause or a claim that B1's revised suite passes**. Other direct Babylon-object comparisons deserve the same treatment. Preserve the behavior assertion: old Dart children disposed, new cockpit owned by the new hull, bounded cache admissions.

There are additional avoidable test costs. `render-cache.test.ts:24` hashes `JSON.stringify(Array.from(vertexData))`; its `dartIdentity` also retains full numeric vertex/index arrays. `m2-region-render.test.ts:49` traverses full real scenes five times and later reconstructs them. Move broad equivalence/terrain sweeps to the heavy tier; use compact deterministic digests or small representative geometry for routine assertions. Do not make “no new allocation ever” an invariant when a legitimate new hull is created.

### Proposed tiers

| Tier | Content and trigger | Resource rule |
| --- | --- | --- |
| Fast default | Typecheck; current simulation/inventory/progression/save/session/input tests and focused behavioral regressions. No full-world procedural art or exhaustive terrain grid. Run on each meaningful feature change. | Explicit small file-concurrency limit; 2 GiB scope. Set a time budget from a measured healthy run, rather than inventing one here. |
| Heavy opt-in / integration | Real NullEngine art/lifecycle, terrain/collider conformance, cache/context/disposal and multi-region/multi-hull stress. Run when relevant art/world/lifecycle changes and once on the composed milestone. | One project-wide heavy-job lease, `--test-concurrency=1`, bounded systemd scope; current project guidance is 5 GiB high / 6 GiB max / zero swap. Small assertion output. Investigate OOM/timeout before retrying. |
| Production browser smoke | New→opening→collect/pay/build→board/depart→return/store→save/reload; relevant failure recovery; narrow menus; several region returns and memory; actual console. A shorter focused smoke is appropriate for a correction. | Own isolated T3 tab and server, ordinary controls; record software/GPU renderer. One short source-attributed record, not hundreds of mandatory snapshots. |

The broader milestone playthrough must eventually reach the ending by each fleet strategy. That requirement cannot be replaced by a seeded fast test.

### Measured browser memory

T3 preview on `factory-worker`, Linux Chromium 154, 1280×800 CSS pixels, DPR 2, Rich quality, WebGL 2 / ANGLE Vulkan **SwiftShader**. Built game served on port 5193. The host browser is shared; my isolated incognito page used renderer PID **856066**, created when this audit opened its tab. Shared host PID 9679 and shared GPU PID 9702 predated the audit and are reported separately, not charged exclusively to the game.

`performance.measureUserAgentSpecificMemory` was unavailable. `preview_evaluate` could read `performance.memory`, but every read returned exactly **91,700,000 used / 97,400,000 total / 3,760,000,000 limit bytes**, including reload and traversal. Treat that as coarse/cached browser telemetry, not an exact proof of a flat live heap.

The production renderer exposes actual scene counts in `#ocean.dataset` (`renderer.ts:268–274`); no debug global scene was available. These are `scene.meshes/materials/textures/geometries.length` measurements, with an important limitation: suspended regions remove meshes/geometries from the scene while retaining their buffers. Scene counts underreport total retained art.

| Sample | Own renderer RSS, KiB | Active meshes / geometries | Materials / textures |
| --- | ---: | ---: | ---: |
| Warmed pause menu, 00:10:36 UTC | 320,716 | 92 / 92 | 21 / 16 |
| About two wall-clock minutes after resume, 00:13:33 | 328,016 | 92 / 92 | 21 / 16 |
| Canopy on post-reload outward route, 00:19:12 | 326,388 | 86 / 86 | 21 / 16 |
| Basin, 00:19:36 | 333,020 | 51 / 51 | 21 / 16 |
| First return to original Reef/island pair, 00:20:56 | 371,148 | 92 / 92 | 21 / 16 |
| Second Basin visit, 00:21:48 | 397,596 | 51 / 51 | 21 / 16 |
| Second return, 00:22:29 | 398,672 | 92 / 92 | 21 / 16 |
| Same returned location after three further minutes, 00:25:39 | 392,468 | 92 / 92 | 21 / 16 |
| Final pause menu, about 00:26:12 | 300,480 | 92 / 92 | 21 / 16 |

The first sample is a warmed menu after the opening, not untouched cold startup. The two-minute sample includes brief panel pauses. The first page later stopped advancing at tick 7202/frame 912 without a captured console error; reload/Continue restored progress. Timed-out long preview evaluations occurred in that earlier session, so I cannot attribute the stop to game code. The post-reload traversal has an independent error/rejection listener. Navigation used ordinary movement controls through synthetic key events, assisted by read-only HUD coordinates; it remained near the surface, not an earned deep expedition. Reload is a discontinuity: do not fit a single leak slope through the two sessions.

The two-second RSS series from 00:21:10–00:23:18 ranges **392,904–416,132 KiB**, ending at 398,240 KiB. The same returned location later reads 392,468 KiB; the final paused page drops to 300,480 KiB, below the initial warmed menu. Thus memory **reached a bounded plateau and was reclaimed in this sample; it did not keep climbing across the second traversal**. No forced garbage collection was used. RSS includes browser/native/transient work and these observations do not identify which allocation was reclaimed.

For completeness, the shared host/GPU RSS was 98,448 / 272,212 KiB at the two-minute sample, 98,764 / 265,380 KiB on the first return, and 100,112 / 270,336 KiB at the final menu. Do not sum these shared-process values as the page's exclusive memory cost.

**Conclusion:** the available evidence points primarily to test-harness failure amplification for the 9 GB incident. The runtime owner/cache code has explicit limits, actual region counts return, materials/textures remain constant, and browser RSS is reclaimed. I found no demonstrated browser retained-region leak. I cannot prove that the incident is *only* the harness without a capped isolated rerun or heap profile, and cannot rule out other runtime leaks from this short surface route. All four regions fit retention, so this says nothing conclusive about full-world eviction. The generic three-owner LRU test at `m2-region-render.test.ts:188` is useful logic coverage; it is not a production fifth-region memory trial.

`direction-audit/runtime-samples.json` retains the `preview_evaluate` results; `rss-traversal.csv` records two-second `ps`-equivalent `/proc` RSS samples for the identified PIDs. `browser-rss-*.txt` are actual `ps -o pid,ppid,rss,etimes` captures, with the earlier transition capture also retaining argv. The second route crosses the Basin threshold at about Z−210 and returns to the original Reef/island pair at Z−34, X113, without state injection. Scene counts come from the production DOM instrumentation, not mocked counters. The final surface observation has no recorded post-reload error or unhandled rejection.

The own tab closed through T3's normal lifecycle; own HTTP server PID 856639 stopped normally. `cleanup.json` confirms port 5193 is released and renderer PID 856066 and server PID 856639 are gone; shared browser/GPU processes 9679/9702 remain alive. No shared/user browser or B1 process was stopped.

## 4. Architecture against the full scope

**Keep the engine and domain separation; change the world-production structure.** `sim/step.ts`, plain saved state, typed commands/events, renderer handles and application lifetime provide useful seams. Fixed-step simulation, station-kept carrier movement, inventory transactions and shared physical datums are assets. A wholesale engine rewrite would discard solved problems without solving content production.

The current implementation cannot simply be filled with 34 times more terrain and the remaining registry rows:

| Structural issue | Evidence | Required change before mass production |
| --- | --- | --- |
| Global terrain plus whole-region construction | `renderer.ts:47` always creates `createEnvironment(..., "terrain")`; region factories are synchronous. `terrainSurface.ts:7` starts with a 190×178 historical grid and appends coordinate-specific refinement/cuts. | Stream terrain/art in bounded chunks, e.g. 64–128 m as an initial measured choice. Use offline/worker baking or time-sliced construction and bounded main-thread uploads. Keep physical queries available independently of render residency. |
| Four hardcoded horizontal regions | `regions.ts:5`, `:22–44`: literal union, neighbour lists and X/Z inequalities; two detailed owners and four total resident owners. | Registry-owned spatial descriptors/adjacency, vertical extents and visibility rules. Author several chunks per biome, not one giant biome mesh. Prove eviction with more owners than the limit. |
| No production LOD/instancing path | Searches of `src/render` for `thinInstance`, `createInstance`, `addLODLevel` find no use. `geometry.ts:220` merges temporary primitives into batches. Light quality mainly changes resolution/ecology density. | Shared immutable templates, instance transforms and coarse/fine representations; chunk-sized batching/culling. Merging reduces draw calls but does not supply LOD or fine culling. |
| Count-based rather than byte-based residency | `RESIDENT_REGION_LIMIT = 4`; `GeometryCache` separately caps 256 entries / 32 MiB numeric payload, excluding JS overhead and driver allocations. It copies CPU geometry on admission and reconstruction. | Track retained and active bytes, CPU recipes and GPU buffers separately; enforce a measured total budget with LRU eviction. Region count alone is not a memory budget when biomes differ radically in density. |
| Global numerical geography | `sim/world.ts:43` derives terrain from a frozen legacy source roster; new sources/pads add special cases. Render sampling preserves old exact cells. | Shared authored terrain/collision/chunk data and seam tests; preserve known safe landmarks and investments without making every old sample permanently immutable. Do not create independent render and physical terrain formulas. |
| Simulation/query scaling | `step.ts:373` clones the entire GameState every step; `world.ts` repeatedly scans global solids and samples movement; one authoritative hunter today. | Profile a full-sized representative workload. Add a spatial query index and bounded active-agent simulation. Avoid cloning future entire content populations at 60 Hz if measurements show it dominates. Do not preemptively rewrite every pure operation. |
| Central files and Dart assumptions | Registry about 850 lines; world/step/app each roughly 750; expedition art over 1,200. Craft/service/recovery and save rules contain Dart-specific branches. | Compose typed per-region/per-hull definitions and hull roles, access points, mount/capacity/service/refuge behavior. Keep one composed registry and its dependency validator. |
| Content changes tightly coupled to save history | Exact source roster/provenance/recipe receipts in validators, duplicated historical domains. | Stable persistent identifiers and explicit optional/new defaults; current validation plus the narrowed compatibility policy in section 2. |

`content/routes.ts` bounds are X −76..248 / Z −260..66: **324×326 m = 0.105624 km²**, versus **3.6 km²** planned, about **34.1×** the area. Vertical minimum is −240 m; the specification reaches 780 m. Seven `REGIONS` entries do not mean seven playable regions. A 450 m camera far plane is not itself a blocker: the whole two-kilometre world should not be drawn in full detail at once.

The current carrier is not entirely stubbed. `sim/carrier.ts` and the seeded fixture already implement walking/interior and berth/lock transitions with meaningful tests. What is absent from the accepted campaign is earned carrier construction, its complete services/customization and a reason to live aboard across authored missions. Walking while underway is explicitly optional; station keeping is the required baseline. Do not spend months solving an optional moving-interior extension before completing the campaign.

Create one representative scale slice before mass art: more than four resident candidates, dense vegetation with instances/LOD, three ordinary simultaneous hulls, a station-kept carrier interior, a deep vertical transition, repeated returns, context restoration and measured budgets. Then author the rest through that pipeline. This is a bounded architecture gate, not permission to start another open-ended framework project.

## 5. What the game actually offers today

### Build and bounded play

Pinned dependencies installed; `npm run typecheck` and `npm run build` passed under the requested systemd limit:

```sh
systemd-run --user --scope --quiet --unit=siltwake-audit-$$ \
  -p MemoryHigh=1536M -p MemoryMax=2G -p MemorySwapMax=0 \
  timeout --kill-after=10s 300s npm run typecheck
```

The build used the same wrapper with `npm run build`: 514 modules, 10.26 s Vite build, main JS 1,510.68 kB / 395.17 kB gzip, with a large-chunk warning. The initial checks could not resolve dependencies before `npm ci`; final logs distinguish that setup failure from the passing installed checkout. No test count in historical reports is presented as a test I ran.

I started a genuinely new expedition, advanced the four opening interactions, walked down the pod/ramp, dived, aimed and collected two glass, opened fabrication, surfaced and swam a bounded route. Later I used Continue from my own save and crossed the actual render regions twice and back for memory. Browser work spanned about 17 wall-clock minutes including menu/tool/reload gaps; the final fresh expedition tick was 32,922, about 9.1 simulated minutes. I did not inject inventory, teleport, seed a fleet or claim a complete earned Dart/Basin run. The memory section records the single earlier stopped session and recovery. This is an opening/interaction/visual sample plus surface residency exercise, not full-current-loop acceptance.

### Actual content, separate from roster promises

`src/content/registry.ts` defines seven regions, six hulls, seven places, sixteen items, one module, ten recipes, twenty-four resource sources, four renewing sources, six evidence entries C01–C06 and one optional record. Actual supported gameplay is much smaller than the complete roster:

- **Loop:** four-step opening → damaged pod → reef gathering/food → tools/personal pressure suit → island workshop/Dart → Canopy investigation and hunter/quiet choices → 350 m personal refit → Basin evidence/haul → return/save/recovery. The last discoveries currently award future fleet/service knowledge without a usable new campaign purchase. B1 is correctly addressing that missing payoff.
- **World:** Reef, one Splitspine island landmass with workshop, Canopy/lab and a shallow benchmark portion of Basin. Not three explorable islands or seven finished regions. Rift, Divide and District are registry/design promises.
- **Craft:** Dart is the only ordinarily earnable hull. Other IDs and generic/diagnostic representations do not constitute six campaign vehicles. The seeded Hearthline/Spindle/berth feasibility fixture is real technical progress, exposed through a development menu.
- **Ten recipes:** pod repair, scanner/service tool, 150 m suit, workshop restoration, salvage buoy, reserve cells, Bobbin kit, Dart, Dart acoustic trim and 350 m personal suit. There is no accepted Creel recipe or final repair chain. Five early material families have sources; ceramic/core/lattice are roster entries.
- **Wildlife:** one authoritative sound-hunter state machine and readable warning/stealth/contact mechanics. Schools, grazers, fans and shore plants supply animation/habitat cues and resource associations; do not count every animated species as an interacting ecology simulation.
- **Story/UI:** short opening, six physical records/leads, one optional note, notebook, cargo/fabrication, vitals, prompts, warnings/captions, settings and save/import/export. No implemented conclusion or full out-of-order late campaign. Two fleet strategies should reach the same authored resolution; loose “both endings” wording in build history must not create an accidental second narrative scope.
- **Sound:** `src/audio/sound.ts` contains real local WebAudio oscillators/noise, ambience and positional/priority cues. It is not silent placeholder code. It is also not evidence of a completed authored biome/vehicle/music library. This browser host is muted; I cannot assess the audible mix.

There is **no defensible measured fresh-player length for even the whole current slice** in this audit. The first collect/menu interactions fit within the bounded opening sample; I did not time a fresh complete C06 route. Existing assisted/replayed expeditions establish reachability, not human route-learning duration. The current content is an introductory expedition chain, with no ten-hour ending-to-ending measurement. Schedule a fresh-player timed test rather than inventing duration from ticks or multiplying travel distance.

### Visual and menu judgment

All following production images were captured with T3 `preview_snapshot` and `save=true`, then copied unchanged to the audit evidence directory.

![Fresh title menu and benchmark vista](/home/worker/.local/share/siltwake-evidence/direction-audit/menu.png)

The title has a coherent hierarchy and restrained controls, and the teal/ochre/shell palette works. The background immediately reveals a small, sparse benchmark environment. “Carrier feasibility fixture” is developer language in the player's front door; hide it from the final player menu when earned systems replace it.

![Actual opening reef collection and grazer silhouettes](/home/worker/.local/share/siltwake-evidence/direction-audit/reef.png)

The creatures, plants and mechanical detailing give this an original identity. It is more than primitive debug cubes. However, strong repetitive caustic bands flatten terrain/material distinctions and dominate the frame; authored composition and surface variety are still thin. I also inspected the published refined-cel reef capture attributed to art commit `20711d1` (reference URL and JSON retained locally). The game inherits its palette/silhouette vocabulary, but this near-field production view is less visually balanced and the sparse vista is not a rich finished biome. This comparison is qualitative and uses different gameplay/reference cameras, not a controlled visual-regression test.

![Fabrication immediately after collecting glass](/home/worker/.local/share/siltwake-evidence/direction-audit/fabrication.png)

This fails the spirit of concise routine menus. Only four starting options already fill more than the viewport: large disabled buttons, repeated bench guidance, prerequisite lines, costs, source disclosures and refusal explanations. Keep costs, accessibility and one actionable reason; put longer source/preparation detail behind selection/help, show the next useful recipes first, and compact completed/locked work. Do not remove essential warnings or narrative captions to meet a word count.

![Surface view of the island and above-water patterned slopes](/home/worker/.local/share/siltwake-evidence/direction-audit/surface.png)

Broad repeating bands remain conspicuous above water. The large slopes need authored geology, vegetation clusters and distinct approach compositions; shader patterning cannot carry that art workload. Prioritize one compelling vista, one rich resource habitat and one warm inhabited refuge per new area, then reuse a controlled kit.

## 6. Gap to done

My planning estimate is **roughly 75–90% of player-facing campaign production remains**, with substantial uncertainty. That is not a source-line percentage, an elapsed-time forecast or a claim that existing engineering has little value. Completed foundations make future features cheaper; world, art, mission and pacing work do not appear automatically because the registry names them.

| Area | Existing foundation | Remaining work / rough share of that area's production still ahead |
| --- | --- | --- |
| World/regions | Four compact connected benchmark habitats, one island, shared physical datums | Full envelope/depth, three later regions, two further islands, meaningful routes/shortcuts, research district and local rescue access. **80–95%**; largest content and integration risk. |
| Fleet/mobile homes | Earnable Dart; substantial seeded carrier/berth mechanics; B1 Creel in progress | Five earned craft, distinct useful missions/handling, pressure/refit choices, carrier services/customization, both viable fleet strategies. **65–85%**, reassess after B1 acceptance. |
| Survival/recovery | Food/air/pressure/power/damage, inventory, local Bobbin/tow/salvage, suit separation | Full fleet/site coverage, later hazards, comfort/cooking/crops, balancing and repeated-loss proof at all new endpoints. **35–60%**. |
| Ecology/encounters | One real hunter; animated habitat cues and sources | Regional behaviors, ecological interactions, legible defensive/evasion tools and different late encounters. **65–85%**. |
| Story/lore/campaign | Opening, six records, optional note, notebook framework | Remaining physical evidence C07–C15, corroboration/out-of-order interpretation, authored scenes, ending machinery and payoff, hints/comprehension tuning. **75–90%**. Canon/design already written is not playable content. |
| UI/accessibility | Working menus/HUD/settings, useful cues and save safeguards | Progressive disclosure, full fleet/home/notebook flows, marker/hint behavior as specified, keyboard/layout/audio-equivalent testing and concise copy. **45–65%**. |
| Audio | Functional bundled procedural system and event cues | Distinct regional atmosphere, comfortable refuge/vehicle layers, encounter mix, transitions, music/identity as appropriate and actual listening tests. **65–85%**. |
| Art/animation | Original editable cel kit, some detailed creatures/pod/Dart/structures | Most biome/island/interior/hull assets, set dressing, LOD/instances, lighting/composition and animation polish. **75–90%**. |
| Performance/runtime | Bounded current retention, fixed-step loop, measured warm improvement | Streaming/construction budgets, spatial scaling, eviction/context/multi-hull stress, dedicated-GPU profiling and load feedback. **60–80%** of qualification/scaling work. |
| Saves | Robust transactions/current validation; too many development migrations | Narrow compatibility, stable content evolution, full fleet/campaign state, final regression/export/recovery qualification. **25–45%** if simplified; repeated frozen-domain promises increase it. |

The immediate critical path is architecture seams → rough complete world/fleet/progression/finale → authored campaign → sustained polish and human/GPU qualification. An early rough ending must preserve the agreed final scope; it is an integration target, not a substitute short demo. Do not spend the next milestone proving hundreds more historical save comparisons while the next region and ending do not exist.

Calendar estimates would be false precision without a completed representative Opus region/hull loop and fresh-player timing. Re-estimate after B1 and one complete new-region production pass, including reviewer corrections. Track delivered playable outcomes, hauling friction, route decisions and observed player learning, not commits or passing test totals.

## 7. Parallel execution and contracts

The current B1 brief is substantially better than the historical micro-batches: coherent outcome, cross-module freedom, real acquisition/haul/refuge/service payoff and a single fresh feature review. Let it finish. Its broad ownership touches registry, types, step/survival/progression, saves, UI and expedition art. At the final read-only inspection, its checkout was clean at `0636ad3`; `git diff eb712f1 --name-only -- src tests package.json` also shows changes to **renderer, environment, terrain surface, world queries and package scripts**. Starting another builder in those same files today would recreate integration overhead. A clean commit is not evidence that its ownership has been released or the feature accepted.

Before accepting parallel production, the coordinator should commit a small shared contract baseline, reconciled with B1:

1. **World/content:** stable IDs, metre/Y-up frame, chunk/region descriptor shape, bounds/adjacency, shared collision/terrain/access/source data, and ownership of the composed registry. No second economic registry.
2. **Hull/home:** hull role, collider, control/boarding access, utility mounts/capacity, service/refuge provider, berth envelope and paid construction/refit outputs. Incorporate B1's final interfaces before other hulls depend on them.
3. **Streaming/art:** create/update/quality/dispose ownership, shared material/template rules, async readiness/cancellation, active/retained byte accounting, context-loss behavior and small diagnostics including detached owners.
4. **Campaign/UI/audio:** discoveries/unlocks and alternate evidence semantics; read-only presentation models, interaction actions and sound/caption events. Story owns text, UI owns display, simulation owns truth.
5. **Persistence/testing:** stable saved facts versus derived data, current compatibility decision, current fixtures, fast/heavy test lists and the single heavy-job lease.

These contracts should be concise types and a few invariants, not another ten-thousand-word approval layer. Builders may propose and implement coordinated changes; one named owner composes shared roots. The final table gives seven coherent streams, not seven simultaneous processes. With four agent slots, coordinator plus an active reviewer leave two builder slots; when review is idle another builder can work. Keep only **one heavy render/full-suite job** on the 16 GiB VM. Light editing, data authoring and bounded checks can proceed alongside it.

## 8. Documentation and agent briefs

Load-bearing documents are the revised prompt; settled owner decisions; `MODEL_POLICY`; browser rules; delivery gates; the five current integration/world/fleet/story/graphics specifications; a small current ownership/status record; and actual typed contracts/composed registry. Narrative implementation needs the protected canon under its existing spoiler rules; this audit neither read nor reproduced it. Keep current economy/progression verification, but identify historical proposals as such.

Historical evidence and dispositions are valuable audit history. They should be **archived behind an index**, not appended to every current resume document. Move old task rounds, source/artifact reconciliation receipts and superseded checkpoints out of the default load path. Preserve Git history and original defect fixtures. Do not destroy evidence or delete worktrees without checking live ownership/uncommitted work. Make active worktree/resource ownership explicit, then prune released worktrees in an operational cleanup task.

`STATUS.md` is 149 lines / 4,154 words; `PLAN.md` 4,511; `CONTRACTS.md` 9,818; `TASKS.md` 37,402. Together those four contain **55,885 words**. STATUS's current lines 11–13 coexist with old A2/A3, S2a and paired-review active checkpoints later in the file. `PLAYTEST.md` also retains an obsolete “pause for owner input” near its top. “Earlier labels are historical” does not make that a good resume interface. Missing spaces such as “a6 GiB”, “verifies437” and “approximately2.0×1.8km” make already dense text worse.

Suggested replacement STATUS, roughly one page:

```text
Current: accepted production SHA; integration SHA/branch; date.
Playable today: 3–5 concrete outcomes; current endpoint.
Active ownership: worker | branch/worktree | owned modules | next handoff.
Next: one integration action; next review; next playable milestone.
Blocking decisions/defects: severity, short reproduction/link, owner.
Checks: latest source SHA, fast/heavy/build/browser result + evidence link.
Unverified: human pacing/audio/GPU/full-world limits.
History: one archive index link.
```

A builder brief should fit about a page plus relevant links: player outcome and ending condition; accepted source and known gaps; owned modules and shared interfaces; freedom to change connected code; concrete acceptance behaviors including one adverse case; proportional checks/browser sequence; resource/port constraints; one handoff format. Link only necessary specifications. Do not paste every historical review prompt and payload list. Keep the complete owner's scope available so “bounded task” cannot silently become “finished game.”

The opening of `BUILD_GAME_REVISED.md` and several specification passages still describe a future construction run, while AGENTS correctly says construction was invoked. `MODEL_POLICY` names the current builder/reviewer policy, but the revised prompt still calls the coordinator Astra. The coordinator should make a small authoritative state correction, not ask every worker to reconcile stale role/status language independently.

## 9. Other direction judgments

**What the previous coordinator got right:** the platform choice; early carrier/docking feasibility; independent safety review; stable IDs and simulation/render separation; finite economy and recoverable-investment attention; explicit distinction between injected diagnostics, ordinary controls and human evidence; refusal to claim SwiftShader as dedicated-GPU proof; preserving scope when only the first expedition existed. The newest coherent Opus B1 brief and resource-limit note are good course corrections. Keep these.

**What it got wrong:** optimizing the auditability of each micro-delivery beyond its player value; making proof provenance and exact historical equality an expanding compatibility burden; letting current state become an append-only transcript; repeatedly polishing/proving the same opening while most campaign geography and payoffs remain absent; and closing warm timing for a four-region world by keeping all four resident without first establishing larger-world construction/memory budgets. Retention is a valid optimization, but it is not yet evidence for the planned full world.

There is no evidence here that a particular model is inherently incapable, or that 681 commits by themselves prove wasted effort. The evidence supports changing coordination incentives and module seams. Measure a builder by a new useful expedition and its defects; measure a reviewer by specific risks tested and defects found, not evidence volume. Obtain a fresh human play session early enough to change design, rather than saving all experience validation for release.

## Proposed parallel workstreams

Ownership below is the proposed **post-contract** layout; new directories are recommendations, not paths already implemented. No stream receives permission to edit B1-owned roots concurrently. One designated integration owner applies small registration/import changes after a handoff.

| Stream / coherent outcome | Disjoint owned paths/modules | Can start alongside live B1? | Dependency and reviewable result |
| --- | --- | --- | --- |
| **1. World runtime and streaming** — production-sized traversal within budgets | After B1: `src/render/regions.ts`, `renderer.ts`, `environment.ts`, `terrainSurface.ts`; new `src/world/` chunk/query infrastructure; world-runtime tests. Shared `sim/world.ts` adapter handed off explicitly. | **Only additive new chunk/query modules and descriptor design now.** Existing renderer/environment/terrain/world adapters wait for B1's explicit handoff; its live diff already changes them. | Agree descriptor/art handle first; compose B1 geography later. Deliver fifth-owner eviction, byte accounting, bounded construction and a dense multi-hull scene. Own the single heavy lease when profiling. |
| **2. Authored world and regional art** — remaining islands/deep habitats with useful routes | New `src/content/regions/*`, `src/render/biomes/*`, authored terrain/solid/source assets and region-specific tests. Does not own shared shaders or runtime roots. | **Yes: layout/data/art leaves now**, using agreed scale/access descriptors; integration waits for stream 1 and B1 boundary handoff. | Deliver linked region loops with sources, landmark/return/rescue routes and actual views. Do not multiply detailed assets until the streaming slice passes. Region additions are composed by the registry owner. |
| **3. Fleet and inhabited carrier** — remaining earned craft and mobile-home missions | After B1: hull-role modules under `src/sim/fleet/*`, `src/render/fleet/*`, hull-specific data, berths/interior/services. Named owner for current `carrier.ts` and expedition actor adapter. | **Limited:** independent hull art/interior kits can start now; **earned systems wait for B1**. | Adopt accepted Creel mount/refuge/service/save semantics; add remaining specialists/carrier coherently. One mission per role, two fleet strategies, blocked/interrupted launch and local recovery. |
| **4. Survival and ecology** — distinct learnable hazards and useful preparation | New `src/sim/ecology/*`, `src/sim/hazards/*`, `src/content/ecology/*`, render behavior leaves and focused rule tests. `survival.ts`/`step.ts` composition after B1 handoff. | **Yes for independent modules/data/behavior prototypes**; no concurrent root changes. | Consume world queries and sound/visibility contracts. Add bounded active agents, refuge/food comfort and hazards whose first materials are reachable beforehand. Deliver one linked encounter/preparation loop at a time. |
| **5. Campaign and notebook content** — rough complete mystery-to-resolution chain | New story/evidence/lead data and notebook interpretation modules under `src/content/story/*`, `src/sim/story/*`; campaign reachability fixtures. Protected canon remains with authorized lore owner. | **Yes:** physical placements/unlock graph and text leaves can proceed now; integration targets agreed world descriptors. | Story owner coordinates placement with stream 2, fleet needs with stream 3 and UI model with stream 6. First deliver a rough complete resolution by both fleet strategies, then authored density/out-of-order corroboration. Spoiler-free handoffs. |
| **6. Presentation, audio and accessibility** — concise preparation/return and coherent sensory feedback | `src/audio/*`, shared palette/material/atmosphere leaves under explicit ownership; after B1, `src/ui/*` and CSS. UI read models/adapters agreed first. | **Yes for audio and isolated shader/art-direction work**; **UI roots wait for B1**. | Review actual scenes/compact menus, warm refuge, meaningful warning priority, keyboard/narrow layouts and captions. Listen on an audible host. Does not rewrite simulation or narrative facts. |
| **7. Integration quality and save simplification** — inexpensive trustworthy gates and durable state | After B1: `package.json`, shared test config/helpers and `src/save/*`; new runner scripts, fixture inventory/conversion plan and concise build status/contracts. Coordinator owns registry/root adapter composition and integration branch. | **New runner scripts, ownership cleanup and fixture inventory can start now.** Existing package/test/assertion/save files wait for B1 release; its live diff already changes them. Do not duplicate its assertion correction. | Record compatibility decision, preserve named saves, fix failure diagnostics, serialize heavy jobs and run the composed smoke. One fresh Sol feature reviewer, milestone experience audits, no separate acceptance bureaucracy for each wiring edit. |
