# M2-A complete batch — independent Astra review, round 1

**Overall: REQUEST CHANGES.** Criteria 5 and 7 need correction or further evidence as specified below. The other eight criteria are **ACCEPT** for this bounded Canopy–Basin benchmark. This is an independent initial review, not coordinator reconciliation or acceptance of full M2.

| Review identity | Verified value |
| --- | --- |
| Frozen candidate / exact initial HEAD | `d5c0694abc6ac4d38d95f5d2549a64645cae06f3` |
| Diff base, original A1 parent | `c1ddb0a00ca950fda0da6008e4083023873b3369` |
| Latest production source | `35c2d22473ff17ed907c62362c25d17ed47cbcd0` |
| Provisional assembly | `7c2db5d8468e1fca6c0e1e6bf25d4b3eef2b1784` |
| Actual original runtime | **gpt-6-astra / xhigh** |
| Isolated checkout | `/home/worker/.t3/worktrees/subnautica-clone/t3-a69922c4` |
| Exclusive tracked change | This report only |
| New artifact root | `/tmp/siltwake-m2-a-review-astra-r1/` |

Initial `git status --short` was empty and HEAD matched the entire supplied SHA. The original session `01a153bb-03f0-7150-9aaf-5d2cbae92ab3`, first `turn_context` at `2026-10-19T10:35:27.953Z`, records the model, effort and this cwd; `identity.json` retains the receipt. Live orchestration also identified inherited Astra; catalog defaults were not used as proof of effort. I did not author the candidate, delegate children, read the other new review, contact/wait/poll peers, alter another checkout, push, edit a PR or merge.

I applied the code-review skill's standards/spec lenses directly, with this review's explicit prohibition on child delegation taking precedence. The review covers the complete base-to-candidate A1–A3 change, migration/recovery, regional art/cache, terrain/wall movement, feedback and composed corrections, landmark and hunter reconciliation. It is not limited to the last hunter diff. Authority includes AGENTS, STATUS/PLAN/CONTRACTS, the full R1 brief, revised build input, integration/world/fleet/story/graphics/delivery specifications, M2 direction/contract and A1/A2/A3/COMPOSE tasks. Prior author/root records and Opus dispositions were assessed; narrative canon was consulted privately. Major story reveals are omitted here.

## Findings

### ASTRA-M2A-R1-01 — P2: pursuit can remain stationary beside a parked hull despite accepted escape steps

**Observed runtime rule defect; high confidence in the reproduction, ordinary-route incidence unmeasured.** In `src/sim/hunter.ts:241–250`, the clear-start fallback rotates the desired delta horizontally but retains its vertical component. After conservative fleet separation raises the animal above a nearby Dart, every attempted approach can descend back toward that envelope. The animal then stays in pursuit without translating, although level movement passes the existing safety queries. This is an excessive refusal, not a request to remove parked-hull collision or shrink the animal.

Reproduce after compiling the frozen candidate:

```sh
node /tmp/siltwake-m2-a-review-astra-r1/scripts/fleet-valid-state.mjs
```

The script reads a byte-preserved copy of author `inputs/real-diver-12645.json` and explicitly stages only the listed player/hunter fields. Its derivative `inputs/seeded-valid-fleet-refusal.json` passes current encode/decode with complete state equality. The disabled original `dart_17`, cargo, investment and pose are retained. It uses **actual `createWorldQueries()`**, not the initial empty-world screening fixture.

| Reproduction datum | Value |
| --- | --- |
| Parked Dart position / yaw | `(122.238843614, −102.783986238, −99.797022169)` / `1.516592654` |
| Diver position | `(121.480363723, −102.783986238, −113.776460936)` |
| Initial hunter position | `(124.231253141, −102.783986238, −105.456554329)` |
| Initial threat | pursue, interest 12, modeSeconds 0, no distraction; tick 12645 |
| Diagnostic input | 1,800 `tick++` / `updateThreat(state, 1, events, actualWorld)` iterations |
| Result | Hunter rises to `(124.231253141, −100.217319571, −105.456554329)`, then **1,778 consecutive steps / 29.63 seconds without translation** |
| Final contact | pursue, interest 12, cover false, penetrating false, clear true, mouth gap **4.8771 m**, zero damage |
| Available exits | All 16 tested 0.1 m horizontal directions pass `hunterFleetSweep` and world clearance; endpoint animal pieces are clear |

`raw/fleet-valid-state.json` retains the trace, transforms, current contact and accepted exits. `fleet-valid-state.log` retains the result. The earlier 64-position geometric screen found 17 refused proposals with clear endpoint pieces; that alone is **not** a collision bug because intermediate rotation can collide. Its separate long run motivated the valid-world reproduction above. The finding rests on sustained immobility with accepted alternatives, not on endpoint clearance alone.

**Player consequence:** a nearby abandoned hull can leave an actively pursuing animal hovering at a harmless distance in open water, weakening the approach/withdrawal behavior and readable danger. The rendered hovering consequence follows from the fixed simulated position; I did not capture a new browser video of this staged state. Sustained loudness 1 is a labelled rule diagnostic, not an ordinary-input or fresh-human playthrough. The original full route was not shown to encounter this exact state.

**Smallest compatible correction:** extend the bounded fleet-obstacle fallback to consider safe level/component-separated movement when the desired vertical component prevents all current alternatives. Keep the existing full-animation envelope, hull/LOS authority, speed bounds, non-deepening overlap rules, no-inside-bite condition and player physics. Do not add teleportation, enlarge bite reach or weaken collision assertions. Verify this retained diagnostic escapes the stall and resumes a valid approach, while preserving the parked/disabled/berthed sweep and contact tests; then inspect an affected ordinary exit/retreat continuation. A general pathfinding rewrite is unnecessary to address this reproduction.

### ASTRA-M2A-R1-02 — P2 acceptance/evidence gap: the warm regional activation trial remains unclosed

The retained browser evidence includes **50.6 ms** and **59.3 ms** warm activation samples against the unchanged **no warm activation stall >50 ms** engineering trial. I cannot mark criterion 5 accepted by substituting faster NullEngine timings. This is a recorded trial miss and unresolved attribution requirement, **not a claim of a newly reproduced dedicated-GPU frame-rate defect**.

The independently extracted source rows are in `raw/retained-browser-activation-extract.json`:

| Source / exact retained state or input path | Observation |
| --- | --- |
| Original COMPOSE source `b91cde9`, `raw/input-ledger.jsonl`, session `f9c6193c-f2e4-4dab-a093-92af0a071e9a`, seq 1566, following first Canopy activation at seq 1528 | Warm reconstruction of `suspended_garden,refuge_reef`: **50.600 ms**. The Reef was previously resident in this page. |
| HUNTER-CONTACT's retained earlier browser session `20791d4d-c22d-4621-8864-d89e07b0ebe4`, seq 358, imported diver tick 12645 at `(122.407, −102.584, −96.702)` after returning to Reef/Isles | Warm `refuge_reef,suspended_garden` activation: **59.300 ms**. This is a same-session imported replacement, not another ordinary earned return. |

Relevant production work occurs synchronously in `src/render/regions.ts:54–59` / `src/render/renderer.ts:69–71`, including fresh live meshes and detached buffer copies from `src/render/geometryCache.ts:30–38`. These are profiling locations, not a proven attribution of the two outliers to a particular allocation. Later hunter optimization did not establish a new browser pass of these regional paths. I did not perform a fresh browser timing run; whether these exact misses recur on this candidate under controlled competing load remains unresolved.

My retargeted exact-candidate `scripts/probe-region.mjs candidate` passes stable ownership/state/cache/disposal checks. Fourteen warmed updates span **2.935–10.308 ms**. Fresh static construction is **4,178.397 / 3,207.730 ms**; first Canopy activation is **386.796 / 297.895 ms**, first Basin **42.150 / 32.009 ms**, first Reef/Isles **68.331 / 67.334 ms**. These are NullEngine CPU diagnostics. Existing shared CPU/browser work was present in the environment; no shared process was stopped. I did not discard a slower run or treat these as hardware certification.

**Consequence and correction:** the existing evidence does not establish the agreed warm transition bound, and first visits still perform substantial synchronous work. Run a bounded current-source production-browser profile of the same warmed transition/replacement paths, keeping cold/page-reload versus warmed attribution, input, source, viewport, recorder overhead and competing CPU work explicit. Attribute the recorded misses; if production work still exceeds the trial, reduce or schedule the identified synchronous work while retaining two-region ownership, interaction geometry and current-state reconstruction. Repeat the affected transitions and resource-count checks. Do not silently raise the trial or demand a full renderer rewrite. Cold construction remains a separate disclosed loading concern; I do not apply the warm 50 ms threshold to cold startup. Representative-GPU pacing remains a later unverified hardware criterion.

## Explicit verdicts for all ten criteria

| # | Criterion | Verdict | Independent assessment |
| --- | --- | --- | --- |
| 1 | Earned connected progression | **ACCEPT** | Original New Game route earns C01–C06, reachable Canopy ingredients, the paid in-place suit350 and useful Basin stock with Dart180. No optional personal log is required; future plans are labelled research, not fabricated hulls. Original minima 61.62963% oxygen / 83.96677% power exceed the 25% trial. Main run did not buy trim; the separate economy diagnostics cover optional trim and protected recovery reserves. My current-source return suffix preserves the useful cargo and service/storage result. |
| 2 | Persistence and migration | **ACCEPT** | Current schema3/expedition.4 and frozen historical closed-domain validation remain distinct. Migration initializes new content once while retaining old identifiers, stock, fitted item/investment, knowledge, poses and recovery meaning. Current tests cover genuine historical data, invalid injections, atomic refusals and immediately saveable commands. Retained actual Continue pairs and my 45 candidate codec/future equalities support persistence. No decode relocation of the hunter is asserted; separation happens on active steps. |
| 3 | Local recoverable setback | **ACCEPT** | Starter-accessible surface operator and submerged bench, named Basin route, overhead lift, tow, paid patch and local cargo retrieval retain the same Dart and discoveries. Route identity survives interruption/reload; repair/salvage costs and cargo/module restrictions remain enforced. My 8,844-step recovery suffix / nine commands matches the retained result. The 036 numeric window has zero steps; the separately retained actual 120-step browser continuation is the moving Bobbin proof. Seeded route-edge/salvage tests are not an earned second route. |
| 4 | World and source geometry | **ACCEPT** | The current suite retains all 35 normal work/source views and four Basin endpoints, actual submitted triangles, old coarse controls, deck extraction, discontinuity joins, radius-aware movement and retained-contact escape. Reviewed source uses physical terrain/solid datums, without camera lifts or source relocation. Wall-contact images can fill the view with a nearby face; looking down/backing away restores textured relief. Historical placement clearance remains centre-floor limited and is not certified universally footprint-safe. No concrete remaining affected source/work route defect was found. |
| 5 | Region lifecycle and cost | **REQUEST CHANGES** | Lifecycle/state separation, immutable bounded cache, shared materials and disposal pass. Cost acceptance is withheld for ASTRA-M2A-R1-02. Fast diagnostic warm samples do not close the retained browser misses or certify a GPU. |
| 6 | Readable shelter and counterplay | **ACCEPT** | The actual level approach now exposes an asymmetric fork above the console; descent samples connect its strands/holdfast to the unchanged physical rock. Latest ordinary-control assisted 012 response reaches true cover/disengage at11158 without damage or a cell. Separate quiet open-water retreat stays cover=false. This supports advancing the bounded art/counterplay correction, while unaided recognition/learning remains unverified. The crown itself grants no cover. |
| 7 | Hunter contact and withdrawal | **REQUEST CHANGES** | Actual skin/LOS/identity, parked hulls, overlap separation, meaningful open-water danger and withdrawal are substantially corrected. The query p95 trial passes independently. The new excessive-refusal reproduction ASTRA-M2A-R1-01 prevents full acceptance. Full-animation envelope safety is deliberately conservative, not exact instantaneous animated triangle collision. |
| 8 | Truthful feedback and controls | **ACCEPT** | Positive actual bite events remain distinct from collision/pressure; app processing uses each installed fixed-step state. Injury accumulation, disable/recovery priority including queued onset cancellation without another bite, muted/captions-off feedback and reset/focus contracts are covered by current tests and source-attributed runtime evidence. The support-limited grounded-Dart signal fixes the earned stall without changing motion or thresholds. No saved presentation state or per-tick live-region stream was introduced. |
| 9 | Concise integrated presentation | **ACCEPT** | Inspected actual refit, source/notebook, return/cargo, recovery and dense hazard layouts at declared 960×600 and1280×800. Suit versus Dart limits, local stock/costs, container intent and disabled reasons remain actionable. Notebook narrative and real hazard/persistence warnings justify their copy; routine help is grouped/collapsible. Focus/Return/Escape behavior passes the existing tests. Cockpit materials reduce console dominance while preserving fixed seat/FOV and gauges. Richer-cel source hosts and landmarks remain coherent. |
| 10 | Reproducible complete candidate | **ACCEPT** | Independent clean-install check passes536/536, typecheck/build and all economy families, including fresh and completed-earned M2. Original full earned evidence and affected candidate continuations are source-attributed; primary manifests/archives verify. This accepts the reproducibility/evidence accounting criterion, not the unresolved performance or hunter behavior above, and not full-game completion. |

## Independent checks and evidence integrity

The initial check failed because dependencies were absent (`tsc: not found`), retained in `check.log`. `npm ci` succeeded; subsequent `npm run check` passed **536 tests, zero failures**, strict typecheck and production build (`check-installed.log`). The existing large-chunk warning remains. `node scripts/check-m1-economy.mjs`, `node docs/build/design/check-economy.mjs`, and `node scripts/check-m2-a-economy.mjs` for both no-earned and the copied completed-earned input all exited0. The scripts remain staged arithmetic/transaction diagnostics, not playthroughs.

Production/test/script/package inputs have no difference from source35c2d22. My built `assets/index-zkRMM1mQ.js` has SHA256 `183c50ff6e4ab8b13038a796037c85f4bdcd3ba769e8cc0c084ea279d4745463`, matching the retained production bundle. Source inputs and full review diff are retained. No implementation or test was changed to obtain these results.

Copied, inspected and retargeted author query/lifecycle/continuation scripts use **my compiled candidate modules** and write only in my artifact root. The independent query trial's warm p95 values in ms are idle **0.0557**, investigate **1.2849**, pursue **1.4341**, earned043 overlap **0.8448**, two nearby hulls **1.1001**, fleet screen **0.9707**. All meet the ≤2 ms trial. First-use costs include7.238 ms nearby /5.635 ms investigate. Root's separately recorded maximum p951.476 ms and first-use8.135 ms retain their own attribution. No total-frame or hardware claim follows.

The two region passes retain81 immutable cache entries /22,807,896 numeric bytes, below256 entries/32MiB. Equivalent positions have stable live counts; updating does not mutate state. Double disposal leaves zero meshes/geometries/textures/cache/label references, with the two caller-owned materials until scene disposal. Counts are not total JS/driver memory measurements.

Current-source bounded continuations independently reproduce:

| Input | Steps / commands | Min oxygen / power | Codec and next-step equalities |
| --- | --- | --- | --- |
| earned025, ticks34274→39125 |4,851 /4 |63.96296% /83.96677% |16 |
| earned037, ticks47528→56372 |8,844 /9 |88.81481% /87.91255% |29 |
| earned036 |0 /0 |No interval; minima are initializer values, not measurements |0 |

Checkpoint comparison explicitly separates the intentionally changed `world.threat`; it does not exclude inventory, progression, recovery, hull or vitals. Complete candidate results, including final state hashes, exactly match the author's retained current-source result JSON. These are imported continuation replays, not a new reviewer New Game run. I did not rerun unrelated historical matrices merely to add counts.

I independently rehashed all **1,476 latest regular payloads /100,585,110 bytes**, retaining its one dependency symlink without dereferencing, and all **541 original COMPOSE payloads /172,367,878 bytes**. No errors. Latest manifest/archive hashes are respectively `1794b987b7dfba31eb282b03d8dd0fe197ec29f2c5363ad1f419711b65bbd229` / `8ec9dd801d6b229c720d0502e4aec3f710f7637ee684a341bba66812304a3a8d`; original COMPOSE hashes are `d559693498a29dc911756ae5cfc592b80052589eb8ea00db87e4a97c293a4f72` / `a03e0b322a6acdada090230a1b2fce010b64922aa9a2ca797a0c54ba8db41e96`. `raw/integrity-verification.json` records the check. No sealed generator was executed in place.

Latest retained browser evidence accounts for42 exports /6,498 replayed steps:40 exact and two hunter-coordinate differences ≤2.842e−14;13 exact actual Continue pairs and1,403 validated damage steps. The inherited442 fixture assertions and8,512 exact compatibility outputs are retained author/root evidence, assessed alongside my current full suite rather than relabelled as new reviewer runs. **All50 Blob exports survive; only24 native downloads survive, with26 native files evicted.** Disabled reboarding is refused; the separate healthy run's actual ledger/export records piloting the same Dart at11365. Misleading older filename labels do not override these states.

## Actual visual and motion inspection

Both browser-rule files were read. I used retained filesystem media and ffmpeg samples; **no browser, preview, tab, server, recording or port was opened**. No new browser performance, pointer-lock or human-feel evidence is claimed. Sampling receipts are in `media-index.json`, `raw/dense-media-index.json` and `raw/still-inspection-index.json`. This was chronological frame inspection, not continuous video/audio playback.

| Source and inspected evidence | Assessment / limit |
| --- | --- |
| COMPOSE `b91cde9`: actual frames017,021,027,030,035,038 | Paid personal refit versus unchanged Dart depth, recognisable tagged Basin stock, notebook interpretation,17CU useful return, local recovery choices/disabled reasons and cargo remain readable. Earlier full earned route has22 collections/nine recipe payments and no required optional log. These frames retain original source attribution. |
| A3 `222b805`: `dense-error-exit-call-{960,1280}.png` | Dense hazards, call cue, save error and immediate exit refusal remain disjoint/actionable. The narrow layout is necessarily busy; this is genuine warning content, not decorative repeated subtitles. These are diagnostic stress states. |
| WALL `f039e37`: contact, contact-floor-look, Basin-corner-contact frames | Close wall fills the view, but floor-looking reveals real relief. Numerical sweep/near-plane evidence is needed to distinguish an opaque nearby wall from entering it; images alone cannot certify collision. |
| LANDMARK `dc5d67c`: `final-009-1280-rich.png`, with latest cover motion | Fork is visible above the console at the original level53m pose; attachment/rock become readable while descending. Original011 can still hide part of the strands behind foliage/HUD. No claim of universal visibility or human recognition. |
| Latest source35c2d22: `matched-old-current-comparison.png`; `matched-old13311-current-active120.mp4` | Initial retained overlap separates on active movement and exposes the parked Dart/world. Decode itself remains unchanged. |
| Same source: `actual-disable-exit-open-water.mp4`; `current-open-water-damage-withdrawal-incapacity.mp4` | Exit from the disabled hull, separated approaches, repeated withdrawals, injury and subsequent refuge recovery are visible in ordered samples. The long recording was also sampled every4s and every0.5s near its ending. Meaningful danger survives the lower contact duty cycle; this does not measure human response time. |
| Same source: `drag-cover012-ordinary.mp4`; `quiet012-open-water.mp4` | First sequence descends along the attachment/real rock before calls fade; numeric replay establishes true cover11158. Quiet reverse/up escape is a separate cover=false run. Coordinate assistance supplies navigation knowledge. |
| Same source: `healthy-ordinary-exit-retreat-reboard.mp4`; `original036-Bobbin-continuation.mp4` | Healthy exit/return motion and active local recovery are separate from disabled reboarding. Healthy video samples contain long menu intervals; ledger/export evidence, not a guessed final image, establishes successful reboarding. Bobbin motion is paired with actual reload evidence. |

The normalized1280×800 PNG raster does not turn a declared CSS960×600 capture into a native1280 layout. Rich/Light and viewport metadata retain their original meaning. Source-attributed screenshots plus runtime replays support bounded appearance/behavior; they do not establish screen-reader speech, audible mix, mouse comfort, continuous frame pacing, unaided route learning, enjoyment or duration.

## Prior-finding dispositions and remaining scope

| Prior finding | Independent disposition |
| --- | --- |
| A1 compilation/27 fixture failures and strict migration | **Closed for current candidate.** Current genuine legacy fixtures and full suite pass; old failures remain in their archives. No arbitrary-ID widening or old-stock refill found. |
| Missing four Basin terrain endpoints; ROOT-A2-FLOOR | **Closed within corrected route geometry.** Actual terrain support, connected refinement and discontinuity faces are covered without moving sources or dropping35 views. Global ≤0.1m accuracy is not claimed for unchanged terrain. |
| ROOT-A2-WALL | **Closed within movement/old-contact scope.** Radius-aware discontinuity/cut-face sweeps and retained-contact escape pass. Historical centre-floor placement remains a disclosed separate limit. |
| ROOT-A2-PERF / MATERIAL | **Material ownership and cache regression corrected; performance not fully closed.** Shared labels/cache bounds and disposal pass; warm-browser trial remains ASTRA-M2A-R1-02. Cold stalls are separately disclosed. |
| ROOT-A3-01 | **Closed.** Later real disable cancels queued bite onset without requiring a second bite; current regression assertions and event precedence remain meaningful. |
| OS3-01 injury feedback | **Closed for this bounded producer/consumer work.** Actual target-specific loss and priority are preserved; audio/screen-reader human proof remains unavailable. |
| OS3-03 grounded Dart | **Closed.** Earned tick9370 support refusal now contributes to the existing30-step cue; motion, actual progress and selected-attempt accounting remain separate. |
| ROOT-COMPOSE-ECONOMY | **Closed.** My completed-earned checker passes while preserving original clue order/provenance; fresh arrival-order diagnostics are separate. |
| OS2-04 / cockpit | **Closed for inspected route/contact views.** Actual relief, source support and material contrast improve orientation without moving the camera. No universal placement/visibility claim. |
| OS2-06 | **Bounded visual/counterplay obligation accepted.** Fork-to-rock descent and real cover response now exist; quiet open-water escape is separately truthful. Fresh-player recognition remains explicitly unverified. |
| ROOT-HUNTER-01 | **Closed.** Exterior contact fixtures preserve the inherited assertions, while inside-actor no-bite coverage remains. |
| ROOT-HUNTER-02 | **Closed for ≤2ms warm query trial.** Independent highest p951.4341ms; first-call/max costs remain disclosed. |
| ROOT-HUNTER-03 / ROOT-COMPOSE-HUNTER | **Original missing parked-hull obstacle and sustained inside-contact issues corrected; criterion7 remains open for ASTRA-M2A-R1-01.** Conservative full-animation safety introduces real refusal tradeoffs and must not be described as exact animated triangle/triangle contact. |
| Withdrawn OS3-02 meal criticism | **Remains withdrawn.** No consumption-rule change requested. |

No further independently substantiated progression, recovery, save, narrative or UI blocker was found. Lack of a fresh human or representative GPU is disclosed, not converted into an invented defect. Source-specific coordinate-assisted navigation proves reachability and response, not novice recognition. Seeded geometry/rule cases, imported earned continuations and the original earned New Game route remain distinct throughout this report.

M2-A is only the first earned Canopy–Basin benchmark. **M2-B working fleet/mobile homes, M2-C deep routes and both endings, integrated M2 with its Opus stage review, M3 authored campaign and M4 remain required.** This review neither demands them inside M2-A nor removes them. No placeholder-free full campaign, ten-hour duration, human satisfaction or dedicated-GPU60fps acceptance follows.

## Artifact seal and release

Own artifacts: [manifest](/tmp/siltwake-m2-a-review-astra-r1/manifest.json), [archive](/tmp/siltwake-m2-a-review-astra-r1/artifacts.tar.gz), [seal receipt](/tmp/siltwake-m2-a-review-astra-r1/seal.json). The archive includes66 regular payloads /45,273,916 bytes and one undereferenced dependency symlink; archive size3,695,880 bytes. Every archive payload was rehashed against the manifest. The tracked report is outside the archive to avoid a self-hash cycle.

- Manifest SHA256: `92f507be4abee5e188bc52d74f1a1b1d432a9e512aa4c2fcf9a0c4558209022a`.
- Archive SHA256: `f4d33efc256dea82e3d7622b9d13e99b319a62b015654265d9824a8197add8c2`.

All owned checks/probes finished. No browser/server/recording resource was acquired; port5190 was unused. Shared hosts, tabs, evidence and other checkouts were preserved. Only this report is committed; the clean report-only commit is identified in the terminal handoff. Root must reconcile these initial findings and obtain both reviewers' acceptance of the relevant corrected frozen candidate before accepting M2-A. No peer wait is required for this independent return.
