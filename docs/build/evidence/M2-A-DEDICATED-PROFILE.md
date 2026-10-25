# M2-A dedicated Linux profiling — finite inconclusive result

**Useful public execution attribution demonstrated. Causal diagnosis: INCONCLUSIVE. Planned target coverage: 11/12.** The owned Chromium trace provides renderer/main-thread markers, correlated wall/thread clocks, sampled source stacks and GC events. None of the **31 completed warm activations** exceeded 50 ms; the maximum was **24.3 ms**. There is no slow warm interval with which to establish a causal correction. **Light reference cockpit9899 is UNRUN** because this worker's export wait incorrectly depended on RAF while the observer held RAF. The partial cycle was retained and never repeated. No production correction is proposed.

The unchanged **no warm activation above 50 ms** gate remains open, including ASTRA-M2A-R1-02 / SOL-M2A-R1-01. Current-lineage **51.8 / 78.0 / 65.6 ms**, earlier production **92.2 / 106.5 ms**, derivative **50.5 ms**, and historical **50.6 / 59.3 ms** failures remain attributed to their original sources. The 59.3 ms case belongs to **f3c5d79**, as corrected in the [regional report](M2-A-R1-REGION-PROFILE.md). A faster population in a different browser configuration does not explain or replace those failures.

**Identity and authority.** Clean initial full HEAD was **`32969eb7d7b0452330b5d79a4a72c61dc42aff76`**, branch `t3/m2-a-dedicated-profile`, checkout `/home/worker/.t3/worktrees/subnautica-clone/t3-71b3238f`. Production ancestor **`631918436001c2264aad3123329efeb0bb6e3ab4`** is unchanged. Root's **541/541** checks are retained prior evidence; this worker did not rerun that suite or any economy invocation. [Baseline receipt](/home/worker/.local/share/siltwake-evidence/m2-a-dedicated-profile/baseline.json).

Original session **01a1545c-41a0-7c43-aa5b-bb5b833f614b**, first `turn_context` at line **8**, **2026-10-19T13:31:35.099Z**, records actual **gpt-6.1-sol / max**, matching collaboration settings and exact cwd. The original record was checked directly, independently of catalog defaults. [Runtime receipt](/home/worker/.local/share/siltwake-evidence/m2-a-dedicated-profile/runtime.json). The one own-thread binding read confirms the branch/worktree, ordinal-1 Codex/Sol run and subagent relationship. Binding: `thread:delegated-task:command%3Amcp%3A2e1e5263-9a2f-46b6-b140-bd39eb7b7827%3Adelegate-task%3Asiltwake-m2-dedicated-profile-sol-max-32969eb`. [T3 receipt](/home/worker/.local/share/siltwake-evidence/m2-a-dedicated-profile/t3-self-binding.json).

Read AGENTS/STATUS first, PLAN/CONTRACTS, revised input and relevant specification pointers, settled map/tracker, delivery/integration/graphics requirements, complete original M2-A R1 brief/both reports/disposition, regional and Dart evidence, [composition](M2-A-PERFORMANCE-COMPOSITION.md), [Astra direction](../design/M2-A-WARM-ACTIVATION-DIRECTION.md), prior [shared-preview preflight](M2-A-WARM-ATTRIBUTION.md), and the complete [dedicated workflow](../tasks/M2-A-DEDICATED-PROFILE.md). [Authority receipt](/home/worker/.local/share/siltwake-evidence/m2-a-dedicated-profile/authority-inputs.json) hashes 22 inputs, including both browser rules. Applied the diagnosing-bugs measurement discipline within the explicit finite/report-only scope; no reproduction loop, speculative fix or new regression test followed nonreproduction. Historical evidence remained read-only. SPACE-1 code was not consumed.

**Owned browser and public APIs.** Both browser rules were read before launch. The specialized committed workflow authorizes the separately owned browser; the T3 shared preview was neither opened nor attached. One preview-status receipt is retained. Browser ownership is **factory-worker / Linux x86_64 / UID1000**, with private profiles and an exclusively owned HTTP listener on **127.0.0.1:5191**. Initial and final bind/close checks pass.

Private **playwright-core1.64.1** used `chromium.launchPersistentContext`, isolated `browser.newContext`, `browser.newBrowserCDPSession` and `context.newCDPSession`. Tracing/Profiler start, stop and export used their public CDP methods. Playwright owned its debugging pipe; no manual transport or shared debugging endpoint was used. Normal public session detach/context close and HTTP server close ran in cleanup.

The actual executable, verified through only owned `/proc` records, was `/home/worker/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell`, SHA256 **`4fa61f0ba0b4f89b7bec242c32ca16d3bccf69dbfef0651924a9ba8fede5f9d6`**. The preliminary expected full-Chromium path was not the actual headless executable. Browser reports **HeadlessChrome156.0.8078.4**, revision `f842f52ef39fd97b449eb27cff414bf05a98ddce`, V8 **15.6.75**. This differs from the earlier shared Chrome154 environment. `chromiumSandbox:true` was requested; actual root command lines contain no `--no-sandbox`. No custom sandbox-removing flags, kernel permission changes, process suspension or peer-process inspection were used. Full actual flags/UID/profile receipts are in [process validation](/home/worker/.local/share/siltwake-evidence/m2-a-dedicated-profile/process-validation.json).

Official [Playwright launch](https://playwright.dev/docs/api/class-browsertype), [browser](https://playwright.dev/docs/api/class-browser), [CDPSession](https://playwright.dev/docs/api/class-cdpsession), [CDP Tracing](https://chromedevtools.github.io/devtools-protocol/tot/Tracing/) and [Profiler](https://chromedevtools.github.io/devtools-protocol/tot/Profiler/) documentation and protocol schemas were read before harness implementation; downloaded versions/hashes are retained in `official-docs/`. No browser recorder or physical pointer lock was used. WebGL2 reports **ANGLE Vulkan SwiftShader**, which supplies no dedicated-GPU performance evidence.

**Synthetic capability gate, before game timing.** Named synthetic markers map to renderer **PID2768418**, logical trace **TID1 / CrRendererMain**, matching the sole owned page/renderer, frame/loader receipt and exact parsed synthetic script. This is not a kernel-TID mapping. Script SHA256 is `a90bc20067cf0166ab3918b3f4e4c7725bdd6d6139a0e873654e5d643e3c0a08`.

| Synthetic interval | Trace wall ms | Main-thread CPU ms | Signed wall−CPU ms | Samples |
| --- | ---: | ---: | ---: | ---: |
| Busy short | 12.029 | 11.915 | 0.114 | 84 |
| Idle timer | 80.175 | 2.900 | 77.275 | 258 |
| Busy medium | 44.987 | 44.991 | −0.004 | 148 |
| Fixed allocation work | 16.484 | 14.503 | 1.981 | 54 |
| Busy long | 80.003 | 80.926 | −0.923 | 262 |

The busy stacks resolve to `siltwakeSyntheticBusy`; idle has 252 idle samples, and allocation has 20 GC samples. The trace contains **19 MinorGC events** and **87 compile/optimization-related events**, with matching source stacks. JIT event arguments are empty, so function-specific JIT attribution is unavailable. GC events identify VM activity, not the originating allocation source. [Capability receipt](/home/worker/.local/share/siltwake-evidence/m2-a-dedicated-profile/capability.json).

Measured nonzero page-clock increments are approximately **0.1 ms**; trace/page offset spread is **168 µs**. The **0.923 ms** busy CPU/wall discrepancy is observed uncertainty, not a guaranteed error bound. At a requested250 µs profiler interval,846 samples have median307 µs, minimum−285 µs, maximum1,880 µs and seven negative deltas. Signed jitter is retained. Samples are statistical source evidence, not exact CPU accounting or scheduler intervals. No profiler dropped-sample counter is exposed. Trace completion reports `dataLossOccurred:false`.

One sequential fixed-work allocation pair measures **13.5 ms reference /16.5 ms traced**. Its3 ms difference confounds observer cost, VM warming and order; wall-targeted busy loops cannot estimate throughput overhead. `Tracing.getCategories` returned an empty enumeration, but explicit public category filters produced useful events. No kernel scheduler/runqueue capture was obtained. Unexplained off-CPU time cannot distinguish scheduling from native/driver blocking and is never labelled host noise.

**Temporary derivative and checks.** Instrumentation changed only `src/render/{renderer,geometryCache,expedition,landmarks}.ts`. It retains the original outer activation measurement, adds bounded nested phase/counter records in a fixed **32,768×6-number** buffer, and places user-timing markers around activation/callback/render boundaries. Nested spans cover region/actor update, factory/disposal, cache reads, detached copies, buffer application, label acquisition, Dart construction and `scene.render`. No hot-path console/network/screenshot work was added. The common external observer posts durable records after callbacks; it also adds measurement overhead to the reference.

All four source files were restored **byte-exact before game capture**, with the derivative served only from its separately retained private build. Exact original/derivative hashes, the temporary patch and restoration receipt are retained. No geometry, quality, camera, physics, input, simulation, synchronous presentation, cache ownership, live-state reconstruction or ready/Resume contract was changed.

| Served artifact | SHA256 |
| --- | --- |
| Reference `index-kTTrtuXt.js` | `7877db8834baea5e8860a711ef1634d46198e5356208f1c43127c41ad6d5b2d5` |
| Diagnostic `index-lB0wKWnj.js` | `8077d75896b7fa3d2cd6bc7777074fd4ff35e9d1263c7a2d1747f3e1d66bffad` |
| Diagnostic main sourcemap | `b5e03c2cef96f747ba87cec2c4d45241c602ad7d8dc25dd4cbb802f49280896d` |

All **27 reference production files** match root's exact6319184 build receipt. All **51 diagnostic files**, including CLI-only sourcemaps, pass their own byte/hash verification. The actual parsed main script hash matches the diagnostic build in both traced pages. Sourcemap embedded contents match all four instrumented source hashes. Mapped profiler locations are **function-definition locations**, not exact sampled instruction or allocation sites. [Post-analysis](/home/worker/.local/share/siltwake-evidence/m2-a-dedicated-profile/postanalysis.json).

Reference strict typecheck/build pass. Final derivative strict typecheck, test compilation, **12/12 existing region/cache/lifecycle tests**, and diagnostic production build pass. Exact invocations/results are in [checks.json](/home/worker/.local/share/siltwake-evidence/m2-a-dedicated-profile/checks.json) and `logs/`. An earlier unused partial-instrumentation derivative and its successful checks are retained separately; they were not served or timed. All checks finished before capture. No full-suite or economy run occurred.

**Finite capture and input fidelity.** [Predeclared plan](/home/worker/.local/share/siltwake-evidence/m2-a-dedicated-profile/GAME-PLAN.json): Rich reference → Rich traced → Light reference → Light traced, each with startup, A0/B0 setup, then A1 return10149, B1 refuge13845→diver12645 replacement and cockpit9899. CSS **1280×800 /DPR2**, original presets, muted audio, drag controls, no recorder. Each cycle has isolated storage/page identity. Trace capture starts before navigation and includes setup; requested profiler interval250 µs,64MiB trace buffer. No checks ran during timing and no favorable or replacement game cycle ran.

Original save/control bytes match both retained Dart and regional-profile inputs, verified read-only:

| Input | SHA256 |
| --- | --- |
| `compose008.json` | `3ab58eede555493d973995190012e6c21909244cbd4398e5068481bb686c500d` |
| `refuge13845.json` | `9ea6fc9940b7f740798ea43f4e0f4ea920e0f045c85ecedcea82278126e9d0a9` |
| `diver12645.json` | `3840cd165d507c32cee00cf4bb237b860ef451c1a0cb2fe6250e8b9474787ca7` |
| `compose008-controls.json` | `7e31ea23d0ab31465bac8dcb95f8f6ae94f326354dd9500af43052440455bed2` |

A retains the original1546–1567 controls and finishes at10287 after its10149 target. B and cockpit are paused imported presentations without simulation advance, followed by an exported state, one subsequent callback and another export. These are diagnostic imported continuations, not newly earned ordinary gameplay. Original owner strings/order, inputs, ticks and callbacks are retained in **383 contiguous ledger rows** across four sessions, with no missing/duplicate sequence or application error.

| Cycle / session | Frames | A1 / B1 / cockpit activation ms | Coverage |
| --- | ---: | --- | --- |
| Rich reference / `882553f7-8c47-47d9-b4d7-77665857f620` | 142 | **16.9 /12.7 /9.8** | 3/3 |
| Rich traced / `21fa2e11-97e6-4840-a808-5876c5fb9387` | 142 | **18.2 /24.3 /9.7** | 3/3 |
| Light reference / `de682da2-cb63-4db6-962c-e521d26bcef7` | 140 | **11.5 /10.9 /UNRUN** | 2/3; partial failure |
| Light traced / `391b9147-b9eb-47df-bab7-bbfc36cc43f9` | 142 | **17.3 /12.7 /8.7** | 3/3 |

Every completed setup/intermediate activation follows below, chronologically within each cycle. Cells are **original activation /whole callback ms**. Isles=`island_chain`, Reef=`refuge_reef`, Canopy=`suspended_garden`. “Cold” means an entering owner was not previously resident in that page; setup reconstructions of previously visited owners remain warm.

| Transition /tick /owners after | Rich reference | Rich traced | Light reference | Light traced |
| --- | ---: | ---: | ---: | ---: |
| Startup /13845 /Isles,Reef — cold | 332.2 /396.4 | 587.5 /681.3 | 345.8 /411.0 | 440.7 /514.7 |
| A0 initial /9899 /Isles,Canopy — cold | 298.8 /301.6 | 340.1 /344.8 | 279.6 /282.6 | 339.4 /343.4 |
| A0 return /10149 /Canopy,Reef — warm | 14.1 /20.9 | 19.0 /36.9 | 14.9 /24.8 | 16.9 /26.8 |
| B0 refuge /13845 /Reef,Isles — warm | 10.1 /12.0 | 11.2 /13.7 | 9.9 /11.7 | 10.1 /12.4 |
| B0 diver /12645 /Reef,Canopy — warm | 16.1 /17.6 | 12.9 /14.5 | 12.7 /13.8 | 13.8 /15.4 |
| A1 initial /9899 /Canopy,Isles — warm | 8.4 /9.8 | 9.2 /10.9 | 8.9 /10.4 | 8.5 /10.2 |
| A1 return /10149 /Canopy,Reef — warm | 16.9 /24.9 | 18.2 /27.3 | 11.5 /18.2 | 17.3 /29.0 |
| B1 refuge /13845 /Reef,Isles — warm | 8.7 /9.9 | 10.6 /12.5 | 8.1 /9.4 | 9.1 /10.6 |
| B1 diver /12645 /Reef,Canopy — warm | 12.7 /13.9 | 24.3 /27.0 | 10.9 /12.1 | 12.7 /14.6 |
| Cockpit /9899 /Canopy,Isles — warm | 9.8 /10.9 | 9.7 /11.3 | UNRUN | 8.7 /10.2 |

First subsequent callbacks are retained below. Traced cells additionally show the nested **scene.render** wall span after `/`; reference scene spans were not instrumented. An asterisk means the immediately next callback is another planned import/owner transition, rather than a stationary render. Its activation is retained in the preceding table.

| After transition | Rich reference callback | Rich traced callback /scene | Light reference callback | Light traced callback /scene |
| --- | ---: | ---: | ---: | ---: |
| Startup | 37.3 | 50.8 /3.5 | 30.7 | 53.5 /5.6 |
| A0 initial | 10.8 | 15.5 /4.7 | 12.5 | 14.9 /4.5 |
| A0 return | 8.4 | 8.7 /1.2 | 7.5 | 8.0 /0.9 |
| B0 refuge | 17.6* | 14.5* /0.3 | 13.8* | 15.4* /0.4 |
| B0 diver | 9.8* | 10.9* /0.5 | 10.4* | 10.2* /0.4 |
| A1 initial | 8.7 | 10.9 /0.9 | 8.1 | 10.0 /0.8 |
| A1 return | 11.5 | 12.1 /0.4 | 7.8 | 10.3 /0.6 |
| B1 refuge | 13.9* | 27.0* /0.6 | 12.1* | 14.6* /0.4 |
| B1 diver | 1.0 | 1.1 /0.2 | 0.6 | 1.0 /0.3 |
| Cockpit | 0.9 | 1.2 /0.4 | UNRUN | 1.0 /0.2 |

All **31 warm** observations: min **8.1**, median **11.2**, nearest-rank p95 **19.0**, max **24.3 ms**, zero above50. All **eight cold** observations remain separate: **279.6–587.5 ms**. The50.8/53.5 ms subsequent startup callbacks are also retained; they are whole callbacks after cold startup, not warm owner-activation samples. No additional cycle followed nonreproduction or the partial failure. Raw captures, target receipts, complete transition classification and first-subsequent spans are in `raw/`, [summary.json](/home/worker/.local/share/siltwake-evidence/m2-a-dedicated-profile/summary.json) and `postanalysis.json`.

**Execution attribution and its limit.** Rich traced maps to **PID2776511 /logical TID1**, Light traced to **PID2779312 /logical TID1**, both `CrRendererMain`. Target/frame/loader, owned-process and parsed-script receipts identify the pages; activation/callback markers correlate with their numeric phase buffers.

| Named traced target | Trace wall ms | Thread CPU ms | Signed wall−CPU ms | Intersecting GC wall /CPU ms |
| --- | ---: | ---: | ---: | ---: |
| Rich A1 | 18.144 | 17.392 | 0.752 | 1.808 /1.286 |
| Rich B1 | 24.384 | 23.482 | 0.902 | 4.530 /3.992 |
| Rich cockpit | 9.757 | 9.643 | 0.114 | 0 /0 |
| Light A1 | 17.325 | 16.080 | 1.245 | 0 /0 |
| Light B1 | 12.781 | 12.748 | 0.033 | 0 /0 |
| Light cockpit | 8.800 | 8.772 | 0.028 | 0 /0 |

Trace brackets include diagnostic markers/storage around the original measurement, so they need not equal the original rounded activation field. Clock uncertainty remains material: game trace/page offset spreads are **177 µs Rich /188 µs Light**, and the Light cold A0 span has **−1.017 ms** signed wall−CPU. Residuals are preserved rather than clamped or treated as precise scheduler time.

The largest warm case, Rich B1, contains **16.6 ms region update /7.7 ms actor update**. Nested cache reads take12.3 ms, including3.6 ms detached copying and8.4 ms buffer application; label acquisition is1.8 ms and the Dart factory7.4 ms. These spans overlap their parents and must not be added to them. One MinorGC plus one MajorGC occupies4.530 ms wall/3.992 ms thread CPU. Algebraically, the trace is **19.490 ms other thread CPU +3.992 ms GC CPU +0.902 ms signed residual =24.384 ms**, subject to the measured clock uncertainty. This partition does not assign the other CPU time exactly among sampled functions.

Of74 intersecting profiler samples,15 are GC,11 map to Babylon `thinEngine.pure.js:1075` `_createVertexBuffer`, eight to diagnostic `src/render/geometryCache.ts:41` `read`, and eight to Babylon `math.functions.js:21` `extractMinAndMax`. Other samples include native/unmapped frames. Rich B0 is the same replacement path at12.992 ms trace wall/12.852 ms CPU with no intersecting GC. These observations distinguish real buffer/VM work in subthreshold captures; they do **not** provide the required slow-warm/normal comparison or explain an old miss. No new cache, hull or GC correction is justified.

The cold Rich startup has **587.537 ms wall /524.932 ms CPU /62.605 ms residual**. That substantial unexplained off-CPU component remains inconclusive; neither scheduler waiting nor driver blocking can be chosen from this trace. It is not assigned to host noise. JIT events remain observable without reliable function-specific event arguments. No historical failure receives a new causal label.

Rich/Light traces contain **287,365 /246,101 events** and report `dataLossOccurred:false`; maximum reported buffer occupancy is **44.443% /39.111%**. Each numeric probe stores **2,403 records**, drops **zero**. Profiler samples total **154,957 /116,414**, median deltas **316 /315 µs**, maximum gaps **11,479 /7,609 µs**, minimum deltas **−2,385 /−3,828 µs**, with **1,147 /1,201 negative deltas** retained. Trace completeness does not establish profiler sample completeness or exact per-function CPU percentages. Full signed residuals, nested phases, VM events and mapped samples remain in `game-traces/` and `raw/*-trace-analysis.json`.

**Preservation and coverage limits.** All **566 completed frames** retain two detailed owners. Rich's142 paired frames and Light's140 paired-prefix frames have **zero differences** in before/after HUD, camera, resource counts, readiness, graphics, owner strings and other canvas fields after excluding activation timing. Ready=false at initial loading is retained equally; no ready or deliberate-Resume change was introduced. Available target counters match:

| Pose | Meshes /geometries | Vertices /triangles | Draws /materials /textures |
| --- | ---: | ---: | ---: |
| A10149 | 96 /96 | 286,363 /468,635 | 36 /14 /9 |
| Diver12645 | 96 /96 | 286,363 /468,635 | 10 /14 /9 |
| Cockpit9899, three completed cycles | 70 /70 | 247,712 /418,997 | 18 /13 /8 |

Both traced cycles finish at **73 cache entries /22,310,040 numeric bytes**, below the unchanged **256 /33,554,432** limits, with186 hits/90 misses and eight live labels/eight references. No admission budget or geometry/state ownership rule changed. Numeric accounting excludes GPU/native/object overhead.

Complete exported B input state and the paused subsequent render are equal in **all four cycles**. Cockpit input/subsequent state equality passes in the **three completed cockpit cycles**. A final states at10287 match reference/traced for both qualities; complete B states match at both qualities; Rich cockpit states match. The two Rich PNG pairs, diver and cockpit, are **byte-identical**. Their SHA256s are respectively `7a68f2fdd5fdafb975e112a7a9fae58761160daa0150ff79506d071f71f203b9` and `0e5e02815a5a3030ad3eb623bd2617c83dfffff5ba6bbcd738744ed674d84bf1`.

Both Rich final WebGL buffers are1280×800; Light traced is853×533 at the same CSS/DPR geometry. **Light reference final WebGL query and both PNG captures were not reached.** Its Light setting and per-frame metadata are retained, but there is no final buffer-query receipt or Light visual pair. No missing cockpit, image or query is inferred from another cycle. No new context-loss/focus/ordinary gameplay acceptance is claimed from these controlled captures.

**Setup incidents, all retained.** There were three individually documented preflight launches and three game-harness launches, each closed normally; no automatic relaunch or timing-search loop was used. The first optional `Browser.getBrowserCommandLine` query failed because `--enable-automation` was absent; the query was omitted and actual owned `/proc` flags were used without changing launch flags. A second attempt mistakenly filtered an empty category enumeration into a metadata-only trace; explicit documented categories corrected that harness mistake. Both initial attempts remain in `setup-1/` and `setup-2/`, with no game targets.

The instrumentation script's first Dart anchor matched twice and stopped after two files. Its unused partial derivative/checks are preserved in `unused-partial-derivative/`; originals were restored and a unique anchor applied before the final derivative. A first game startup wait used Playwright's default RAF polling while the observer held RAF and timed out with **zero callbacks/transitions/targets**. Its separate receipts remain in `unstarted-game-setup/`; startup was corrected to the original element-existence protocol.

The measured Light reference cycle completed A/B and B's subsequent render. Its second export was durably delivered at **ledger seq86**, but another default RAF-polled export wait timed out. That process segment closed. The partial capture and export were reconstructed only from already recorded data, with recovery provenance retained; **no game replay occurred**. Timer polling was used solely for the last originally unstarted Light traced cycle in a new owned process. Light reference cockpit remained unrun. `game-segment-1/`, `game-outcomes.json`, the original failure receipt and [setup-incidents.json](/home/worker/.local/share/siltwake-evidence/m2-a-dedicated-profile/setup-incidents.json) retain these harness mistakes. They are incomplete protocol coverage, not missing Chromium tracing capability.

**Verification, seal and release.** [Receipt verification](/home/worker/.local/share/siltwake-evidence/m2-a-dedicated-profile/verification.json) passes original runtime/binding/ancestry, original-input identity, all27 root reference files/all51 diagnostic files, restored sources, finite outcomes/ledger continuity, available state/resource/output pairs, trace-loss/numeric-drop checks and known owned-process cleanup. This is artifact verification, not another timing or full-suite run.

Private artifacts are exclusively **`/home/worker/.local/share/siltwake-evidence/m2-a-dedicated-profile/`**. The selected immutable payload contains **473 regular files /282,217,043 bytes**. The **22,119,795-byte** archive contains those files plus its manifest; all **474 entries** and disk payloads are SHA256-verified by streaming without extraction or symlink dereference. Dependencies/npm cache/browser profiles and the tracked report are excluded. [Seal](/home/worker/.local/share/siltwake-evidence/m2-a-dedicated-profile/SEAL.json):

- [MANIFEST.json](/home/worker/.local/share/siltwake-evidence/m2-a-dedicated-profile/MANIFEST.json), SHA256 `ac1f31a828dcd1604365e89119937ae71347b2f676269d6cefbb800fb2fa5121`.
- [payload.tar.gz](/home/worker/.local/share/siltwake-evidence/m2-a-dedicated-profile/payload.tar.gz), SHA256 `e86a6015322e9017731c2923f7b237cafda8d471b8c88a27e1c88663af274fe6`.

Public API cleanup completed for every owned browser/context/session; each listener closed. Final verification finds all **34 known owned PIDs absent**, **5191 bind/close succeeds**, the temporary worktree dependency symlink is removed, and the task's compiled test output is moved into private artifacts. Four source hashes are byte-exact; all production/test/config inputs remain identical to6319184. [Cleanup receipt](/home/worker/.local/share/siltwake-evidence/m2-a-dedicated-profile/final-cleanup.json).

Only this report is committed. No children, peer contact/polling/waits, parent edits, push, PR or merge occurred. All assigned paths/resources are released. Root retains production decisions, actual affected ordinary gameplay and a fresh complete M2-A Astra/Sol acceptance pair. This incomplete, nonreproducing finite capture **does not accept M2-A or waive50 ms**; representative-GPU performance and human experience remain unverified.
