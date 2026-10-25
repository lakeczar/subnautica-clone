# M2-A R1 regional profiling — bounded unresolved handoff

**ASTRA-M2A-R1-02 / SOL-M2A-R1-01 remain open.** The unchanged trial, **no warm activation above50ms**, is not met: current production warm setup replacements took **92.2ms and106.5ms**. All48 planned later production targets were below50ms. A separate instrumented replacement took50.5ms. These observations do not causally explain both historical misses, so this is not an evidence-only closure or M2-A acceptance. No production or test source changed.

## Identity and scope

Verified clean initial HEAD **57aacb0380c8990bc376841e261d651cbdfb2ac1**, production **35c2d22473ff17ed907c62362c25d17ed47cbcd0**, in the T3-owned isolated checkout `/home/worker/.t3/worktrees/subnautica-clone/t3-3170b96b`. T3 reports branch `t3/profile-region-cache-performance`; its initial label was `t3/3170b96b`. The [original turn_context](/tmp/siltwake-m2-a-r1-region-profile/runtime/original-turn-context.json), ordinal7 in session01a153dc-4c9b-7ee3-8345-9f2b0e2a0751, verifies actual **gpt-6.1-sol / max** and this cwd, independently of catalog defaults.

Read AGENTS and STATUS first, PLAN/CONTRACTS, revised input and its pointers, integration/delivery/render contracts, both complete R1 reports/reconciliation, review brief, prior render-performance and current hunter-reconcile evidence. Applied diagnosing-bugs to the retained-input replay and red-capable trial assertion, within the explicit finite/no-child brief. Both R1 reports are completed independent evidence, not acceptance. No children, peer contact/polling/waits, parent edits, shared-process changes, push, PR or merge.

The unmodified production bundle is **index-zkRMM1mQ.js**,1,486,893 bytes, SHA256 **183c50ff6e4ab8b13038a796037c85f4bdcd3ba769e8cc0c084ea279d4745463**. All27 served production files match the local build; all55 original source hashes still match. [Final source/check receipt](/tmp/siltwake-m2-a-r1-region-profile/runtime/final-source-checks.json).

## Historical cases and input fidelity

| Case | Exact historical attribution | Retained measurement | Current replay |
| --- | --- | --- | --- |
| A: same-session Reef return | b91cde9e2956ce36ec9e4e7901332f7ebf1257cc; COMPOSE sessionf9c6193c-f2e4-4dab-a093-92af0a071e9a,seq1566 |50.600ms activation /53.2ms callback; first Canopy seq1528 was338.3ms | Unchanged COMPOSE008 export seq1537,tick9899; exact recorded key/presentation suffix1546–1567, including its first deliberate-return presentation. Target tick10149. |
| B: imported warm replacement | **f3c5d79c26daf1a0baa338069f9d4552e257a526**; HUNTER-CONTACT session20791d4d-c22d-4621-8864-d89e07b0ebe4,seq358 |59.300ms activation /61.2ms callback | Unchanged refuge13845/seq347 → unchanged diver12645/seq100; one100ms presentation with no simulation advance. Target tick12645. |

Case B belongs to the earlier f3c5d79 bundle **index-BJ5TWisb.js**, SHA256 **e14995c2111ba58fbc25cb8005b00ea4c3e589fccd8b7b0dac24526af44f4c7e**. Final4583671b2df61bfb181a49813e9877d6921c2bf0 has a later, distinct session/marker. An earlier generic “FINAL-SOURCE-BEGIN” marker does not reattribute seq358 to4583671. All render files at f3c5d79 are byte-identical to current production; COMPOSE b91cde9 differs in expedition.ts. Neither fact establishes a latency cause. [Source attribution](/tmp/siltwake-m2-a-r1-region-profile/runtime/historical-source-attribution.json), [exact extracts/render hashes](/tmp/siltwake-m2-a-r1-region-profile/runtime/historical-extraction.json).

Save SHA256s: COMPOSE008 **3ab58eede555493d973995190012e6c21909244cbd4398e5068481bb686c500d**; refuge13845 **9ea6fc9940b7f740798ea43f4e0f4ea920e0f045c85ecedcea82278126e9d0a9**; diver12645 **3840cd165d507c32cee00cf4bb237b860ef451c1a0cb2fe6250e8b9474787ca7**. Original bytes, controls and receipts are retained under `inputs/`.

A reconstructs Reef while Canopy stays resident and Isles departs. Map insertion order varies after repeated imports; comparison uses the same sorted owner identities while retaining original strings. B changes `refuge_reef,island_chain` → `refuge_reef,suspended_garden` and also reconstructs the now-local parked Dart. These current runs use diagnostic imports and controlled DOM key input, not newly earned full-route play. Repeated stale activationMs strings are never counted as fresh activations.

## Finite production trial

Both browser-rule files were followed. T3 status/open verified one incognito/storage-isolated tab on **factory-worker Linux Chrome154**, six reported cores, DPR2, WebGL2 **ANGLE Vulkan SwiftShader**. Original primary CSS viewport1280×800, muted audio, drag controls. Rich and Light retain their original presets. No Windows automation or physical pointer lock. Production `audit.html` seeds unchanged saves/settings and imports the unchanged bundle; an external observer controls RAF, records input/imports and existing renderer counters, and durably posts rows. These are CPU activation measurements, not real-time or GPU-completion timings.

[Predeclared plan and amendments](/tmp/siltwake-m2-a-r1-region-profile/PLAN.md):48 production targets, in order Rich/off6A6B → Rich/on6A6B → Light/on6A6B → Light/off6A6B. On/off means T3 video recording. Each fresh page first presents the retained refuge save, then runs one A/B setup pair. Twelve separate profile targets follow:3A3B per quality, recorder off. Installation/build/focused checks finish outside timing. No source correction or second48+12 plan was run.

Initial plan wording called setup targets cold/first-use. This was corrected: a setup reconstruction of a previously visited owner is warm and remains in the trial disposition. No setup miss is exempted. Failed/incomplete setup attempts and their completed observations are retained in addition to the planned populations.

| Production target | n | Median ms | p95 /max ms | Above50ms |
| --- | ---: | ---: | ---: | ---: |
| Rich/off A |6|23.40|44.5 /44.5|0|
| Rich/off B |6|27.70|31.6 /31.6|0|
| Rich/on A |6|17.95|21.3 /21.3|0|
| Rich/on B |6|29.15|34.6 /34.6|0|
| Light/on A |6|19.75|28.5 /28.5|0|
| Light/on B |6|31.45|40.0 /40.0|0|
| Light/off A |6|18.25|23.2 /23.2|0|
| Light/off B |6|27.50|29.2 /29.2|0|

p95 uses nearest rank; at n6 it equals the maximum. All samples and chronological frames, including callback durations and regions/state counters, remain in the [ledger](/tmp/siltwake-m2-a-r1-region-profile/raw/input-ledger.jsonl) and [target summary](/tmp/siltwake-m2-a-r1-region-profile/raw/sample-summary.json).

Additional completed warm setup targets, milliseconds:

| Population | A | B |
| --- | --- | --- |
| Rich/off, including completed earlier setup |14.8,35.0|43.8,**92.2**|
| Rich/on |17.7|**106.5**|
| Light/on |22.6|31.1|
| Light/off |17.7|23.7|

The92.2ms miss is session1c4ddd34-d3d9-4077-83b5-72c00aa6ab17,frame row38/sample-end39,callback95.8ms. The106.5ms miss is sessionbabdb4fe-310d-40a6-b6f2-0f3bbb9e322b,frame row38/sample-end39,callback108.2ms. Both are warm B replacements, tick12645, with the same96 meshes/286,363 vertices/468,635 triangles as later faster replacements.

Across **every** fresh production region transition, including incomplete/recovered setup: **111 warm reconstructions**, median19.2/p95 37.1/max106.5ms, two above50ms; **13 cold first-region activations**, median379.9/max520.2ms. Cold remains separate and expensive. [Complete transition classification](/tmp/siltwake-m2-a-r1-region-profile/raw/transition-summary.json).

**A disposition:**29 current warm target observations, max44.5ms; the original50.6ms miss remains unexplained and open. **B disposition:**29 current warm target observations, two production misses; the original59.3ms cause is not resolved. The command `python3 scripts/analyse-samples.py --assert-trial` was run against these artifacts and correctly exits1; [final output](/tmp/siltwake-m2-a-r1-region-profile/logs/final-trial.json). Nonreproduction of A or faster later B samples is not a causal explanation.

## Separate profiling and measured limits

A diagnostic derivative in `profile-source/` adds nested wall spans only in assigned renderer.ts, geometryCache.ts and expedition.ts: actual regional factories/disposal, actor hull creation, labels, cache copy/buffer application and cache/heap receipts. No scheduling, geometry, state or lifetime changes. Exact diffs are under `profiles/`. Bundle **index-JUeoBrtj.js**, SHA256 **f06040d700780d09b7e58ea85ff563b3d148365b3f3f7ffa038f6a74acf3244f**, has its own exact source map. [Derivative identity](/tmp/siltwake-m2-a-r1-region-profile/runtime/profile-build-identity.json).

Native JS Self-Profiling was available via Document-Policy; requested1ms, actual reported interval10ms. It started before startup/setup to include the first warm replacement. Rich retained8,758 samples; Light6,298. Timestamps include clusters, and many samples have no stack. They support qualitative execution attribution, not exact CPU-duration percentages, scheduler accounting or GC identification. Full native/phase traces and source locations are retained in [profile summary](/tmp/siltwake-m2-a-r1-region-profile/raw/profile-summary.json).

Measured derivative targets, ms: Rich A15.5/19.1/20.9, B24.0/31.1/47.3; Light A17.6/21.3/21.6, B28.1/28.8/**50.5**. Setup A/B: Rich16.1/23.4, Light15.1/24.2. These are not production passes. Including setup and other transitions, the derivative contains30 warm reconstructions, max50.5ms, and four cold activations, max368.6ms.

Across the eight profiled A targets including setup, inner art.update spans15.0–21.5ms. Regions take14.8–21.4ms, cached reconstruction reads7.5–12.9ms, detached copies1.9–4.1ms, buffer application4.4–8.6ms and label acquisition3.1–4.7ms. Dart creation is absent on these return targets. Disposal is0.2–1.0ms.

Profiled B art.update spans23.3–50.4ms: regions12.7–19.5ms and actor update10.6–31.7ms, including fresh Dart construction10.1–31.5ms. For the50.5ms Light B1 miss (session6b72aa17-42b8-45a3-a595-29e0d8408a65,frame row124), art.update is50.4ms: regions18.7ms, Dart31.5ms, disposal0.3ms, labels2.6ms, cache reads13.6ms, copies4.9ms and buffer application8.4ms. Five native samples intersect that span; four have stacks, including text measurement and Babylon ribbon/box/vector work. **Nested subspans overlap their parents and must not be added together.**

The cache stabilizes at **69 entries /21,997,064 numeric bytes**, within unchanged256-entry/33,554,432-byte limits. A targets add38 hits/one miss; B adds11 hits/three misses, without entry/byte growth. This does not show admission exhaustion or establish a cache root cause. Labels and disposal do not dominate the profiled misses. B's ordinary reconstruction also includes fresh hull work; it cannot be described as regional cache copies alone.

No production miss of92.2/106.5ms was captured with the internal profiler active. The derivative's first B setup is23.4/24.2ms, while one later B reaches50.5ms. Phase-array allocation, wrappers, profiler and observer overhead can change VM behavior. Heap receipts do not identify a collection or JIT event. The native API and supported PerformanceObserver entries supply no collected GC-event trace. These traces do not establish whether allocation/GC, JIT, native buffer work or descheduling caused either historical miss.

Consequently no production optimization was selected. A narrower follow-up candidate is immutable Dart-local construction in expedition.ts with fresh current-state transforms/gauges and exact geometry proof; these measurements do **not** establish that caching it would resolve both retained cases. A conclusive follow-up needs a slow current-production activation with coincident execution/GC/scheduler attribution and exact tab/main-thread mapping. No public readiness or simulation scheduling change is proposed here.

## Recorder, host and interrupted setup

[Raw host samples and callback-bracket analysis](/tmp/siltwake-m2-a-r1-region-profile/raw/host-summary.json) retain competing Chrome, Node/MainThread and own observer/server CPU. No process was suspended, reprioritized or killed to obtain quiet samples. Four sequential populations are not randomized causal recorder/quality comparisons; their differing medians do not isolate recorder cost.

At92.2ms, the111.37ms callback bracket has CPU pressure avg10=71.14%; candidate renderer2673483 consumes150ms across all threads and own monitor30ms. V1 has no main-thread schedstat there. At106.5ms, the124.15ms bracket contains candidate renderer main-thread runtime68.11ms/runqueue wait54.29ms, and T3 Node811435 consumes380ms across all threads. This is evidence of contention, not permission to subtract wait from the unchanged bound. At the derivative50.5ms miss, a71.02ms bracket has candidate main-thread runtime55.24ms/wait0.29ms: different samples need not share one cause.

Brackets include the whole callback and up to roughly15ms endpoint uncertainty; the pressure context refreshes at1s. The exact per-tab renderer mapping is not definitive. Short-lived MainThread processes exited before command/cwd capture; their ownership, including the parallel hunter worker's precise CPU share, is unverified. No peer was contacted. V1 scans `/proc` every20ms and omits some MainThread comm names; V2/V3 retain a1s PID refresh and10ms schedstat sampling. V3 itself used101.95 CPU seconds over837.97 observed seconds, about12.17% of one core. Monitor revisions/overlap and all samples remain retained. Current host evidence cannot reconstruct past historical scheduling or prove it caused either old miss.

Shared `/tmp` reached100% during initial Rich/on setup. Only this task's58MiB root moved to private disk; `/tmp/siltwake-m2-a-r1-region-profile` is now a symlink to `/home/worker/.local/share/siltwake-evidence/m2-a-r1-region-profile`. No shared/historical/peer data was removed. The interrupted observer chained failed HTTP recording into its unhandled-rejection logger, accumulating **1,329,363 repeated fetch errors**. Its36 complete in-page frames, full repeated error list, partial trailing JSONL bytes and stopped video are preserved. It completed no planned measured target. This is a harness/storage failure, not a game-error claim; the page was discarded before the final Rich/on block. [Relocation](/tmp/siltwake-m2-a-r1-region-profile/runtime/storage-relocation.json), [observer/monitor limits](/tmp/siltwake-m2-a-r1-region-profile/runtime/observer-and-host-limits.json).

Other setup corrections retain an import-confirmation race, sorted owner comparison and a job-end `ReferenceError: put is not defined`; no slow completed target was replaced as a pass. Successful final blocks finish without a job error. No repeated-quiet sampling or increase to the trial bound occurred.

## Verification, visuals and release

Unchanged source: `npm ci` and `npm run build` pass before target timing; test compilation and **11/11 tests** in m2-region-render, render-cache and render-lifecycle pass before profiling. The derivative typecheck/build also pass. [Focused log](/tmp/siltwake-m2-a-r1-region-profile/logs/focused-tests.log), [build log](/tmp/siltwake-m2-a-r1-region-profile/logs/baseline-build.log). The existing large-chunk warning remains. No unrelated whole-suite/economy rerun and no new claim for those checks.

The focused production-factory tests cover five returns, two-owner bounds, immutable detached/cache admission/terminal disposal, scene material ownership, current-state resource and same-ID actor replacement, quality changes, strict codec/state purity and reconstruction. Production source/API,50ms trial, cache bounds, geometry and menus are unchanged. This leaf did not repeat browser context-loss/restoration/deliberate-resume or a full-game playthrough; it does not reattribute older evidence as a new run.

Matched production/derivative PNGs at the actual imported diver12645 pose are **byte-identical for both qualities**. [Comparison/hashes](/tmp/siltwake-m2-a-r1-region-profile/raw/visual-comparison.json); [Rich](/tmp/siltwake-m2-a-r1-region-profile/captures/production-rich-diver12645.png), [Light](/tmp/siltwake-m2-a-r1-region-profile/captures/production-light-diver12645.png). Inspected captures retain the same fogged pose/HUD and limited view; this is not a broad art assessment. Both have96 meshes/geometries,286,363 vertices,468,635 triangles,10 draws,14 materials,9 textures. Rich buffer1280×800; Light853×533 at unchanged1280×800 CSS. Profile labels finish at9 entries/10 references. Full recordings are retained, including the interrupted attempt, and were normally stopped.

Own incognito tab43 was normally closed after profiler stop and durable flush; T3 lists no thread tabs. Only verified own server2681353 and monitor2681363 were stopped. Both are absent;5191 has no listener, refuses connections and permits reusable bind. An immediate non-reuse bind encountered recent TCP connection state, retained in cleanup. Shared browser host827911 remains. No owned browser/server/recording/check process remains. [Cleanup](/tmp/siltwake-m2-a-r1-region-profile/runtime/cleanup.json).

## Sealed handoff

Artifact root: `/tmp/siltwake-m2-a-r1-region-profile/` (private-disk backing symlink disclosed above). [Manifest](/tmp/siltwake-m2-a-r1-region-profile/MANIFEST.json), [archive](/tmp/siltwake-m2-a-r1-region-profile/evidence.tar.gz), [verification](/tmp/siltwake-m2-a-r1-region-profile/archive-verification.json). Seal details are recorded below after payload verification. The dependency symlink `profile-source/node_modules` is retained as a link, never dereferenced. The root symlink's exact target is metadata. Archive/checksum/verification/handoff outputs and this tracked report are outside the payload hash cycle. Copy and retarget writer scripts before reproduction; do not execute them inside sealed evidence.

Verified **362 regular payloads /460,035,537 bytes and one undereferenced dependency symlink**;364 archive entries including the manifest. Archive25,520,570 bytes, SHA256 **0d46f7c7e5cd7347cbc930e76a0f40cb4a0cc1d39d14a6230610fba03b73253b**. Manifest SHA256 **cf4eff2498248878d63d98914f6591ca6852fa920a8ae54dceeb0be6a2e4d505**. Every regular disk/archive size/hash, symlink target and archived manifest was verified. [SHA256SUMS](/tmp/siltwake-m2-a-r1-region-profile/SHA256SUMS).

This is a report-only return from the fixed parent, with all assigned paths/resources released. Both findings remain open for root; the complete R1 reports remain independent evidence requiring fresh complete-batch Astra/Sol review after any integration. Cold loading, representative consumer-GPU performance, human pacing/control feel, audible mix and full-game acceptance remain outside this bounded run.
