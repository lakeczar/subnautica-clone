# M2-A complete batch — independent Sol review, round 1

**Overall: REQUEST CHANGES.** Nine criteria ACCEPT. Criterion 5 REQUEST CHANGES for one P2 engineering-evidence issue: the retained 50.6 ms and 59.3 ms warm browser activations exceed the 50 ms trial and have no bounded current-candidate reproduction/profile resolving them. This is not a newly established simulation defect or a demand for dedicated-GPU certification at M2-A.

| Review identity | Exact value |
| --- | --- |
| Frozen candidate / initial HEAD | `d5c0694abc6ac4d38d95f5d2549a64645cae06f3` |
| Diff base, original A1 parent | `c1ddb0a00ca950fda0da6008e4083023873b3369` |
| Latest functional source | `35c2d22473ff17ed907c62362c25d17ed47cbcd0` |
| Provisional assembly | `7c2db5d8468e1fca6c0e1e6bf25d4b3eef2b1784` |
| Reviewer | Fresh non-author `gpt-6.1-sol`, **max** reasoning |
| Isolated checkout / branch | `/home/worker/.t3/worktrees/subnautica-clone/t3-9ff9adb5` / `t3/review-m2-a-round1` |
| Own evidence | `/tmp/siltwake-m2-a-review-sol-r1/` |

The original runtime receipt is the session `rollout-2026-10-19T05-35-37-01a153bb-28a3-7fa1-9bdf-9a497bbb1272.jsonl`, turn context ordinal 7 at `2026-10-19T10:35:37.342Z`: the model, effort and cwd above. The actual runtime injection corroborates it. A small extracted receipt is in `raw/runtime-baseline.json`; the full private session is not bundled. Initial git status was clean at the exact candidate, independently recovered in `raw/initial-git-check.json`. The later `?? node_modules` capture was dependency setup, not the initial baseline. That temporary worktree symlink is removed for handoff. Functional source/tests/config equal 35c2d22; this report does not change them.

I reviewed the full A1–A3 change from the original base, including terrain, wall/movement, cache/material, presentation/priority, earned composition/correctness, landmark and both hunter corrections. I did not author implementation, change tests/fixtures, delegate children, access the other fresh review, communicate with peers, edit another checkout, push, edit a PR or merge. Only this report is a tracked change.

## Authority and bounded scope

Read AGENTS, STATUS, PLAN and CONTRACTS; the complete committed [round-one brief](../tasks/M2-A-REVIEW-R1.md); [revised input](../../../prompts/BUILD_GAME_REVISED.md); [delivery gates](../../DELIVERY_AND_ACCEPTANCE.md); [integration](../../EXPEDITION_INTEGRATION.md), [world](../../WORLD_PROGRESSION.md), [fleet/survival](../../FLEET_AND_SURVIVAL.md), [story](../../STORY_DESIGN.md) and [graphics](../../GRAPHICS_PIPELINE.md) specifications; the settled map, glossary and historical issue tracker. The protected canon was considered internally; no major reveal is reproduced here.

The batch contract is [M2 direction](../design/M2-DIRECTION-PROPOSAL.md), [M2-A contract](../design/M2-A-CONTRACT.md), tasks A1/A2/A3/COMPOSE and their correction briefs. I read the author and coordinator records mapped by the review brief, starting with [hunter reconciliation integration](../evidence/M2-A-HUNTER-RECONCILE-INTEGRATION.md), and the earlier Opus R3 advice/disposition. Those records are evidence, not inherited acceptance.

This gate covers the earned Canopy–Basin benchmark. M2-B's six-craft acquisition/mobile homes, M2-C's deep routes/both functional endings, integrated M2 and its Opus review, M3's authored campaign, and M4's additional critique/polish remain required. Their absence is not a new M2-A defect or a scope deletion. No complete-game, ten-hour, enjoyment or final hardware claim follows.

## All ten criteria

| # | Criterion | Verdict | Basis and material limit |
| --- | --- | --- | --- |
| 1 | Earned connected progression | **ACCEPT** | Original b91cde9 ordinary assisted route earns C01–C06, refit, Basin stock and useful return; current affected suffixes reproduce. Optional trim and recovery reserves pass staged economy checks. This is not unaided human play. |
| 2 | Persistence and migration | **ACCEPT** | Frozen historical domains precede explicit migration; identities/investment and active route survive. Own 50 Blob decodes, 13 actual Continue pairs and matched 120-step complete-state replay pass. |
| 3 | Local recoverable setback | **ACCEPT** | Same-Dart earned tow/paid patch/retrieval and actual active-operation Continue are retained; own recovery suffix completes with conserved identity. Alternate salvage/repeated edges remain rule/seeded diagnostics. |
| 4 | World and source geometry | **ACCEPT** | Current source/work-view and terrain/wall regressions pass; inspected actual floor/work-face captures support corrected geometry. Historical static placement footprint limits remain disclosed. |
| 5 | Region lifecycle and cost | **REQUEST CHANGES** | Purity, bounded caches/resources and disposal pass. The two retained browser warm CPU misses still need a focused current-candidate disposition; see SOL-M2A-R1-01. |
| 6 | Readable shelter and counterplay | **ACCEPT** | Level-view living fork and descent attachment are visible; assisted actual warning/investigation/true-cover and separate quiet open-water escape support advancing the bounded batch. Fresh-player recognition remains unverified. |
| 7 | Hunter contact and withdrawal | **ACCEPT** | Exterior contact/LOS/identity, parked hull obstruction, separation, withdrawal and meaningful damage are supported by code, tests, current media and replay. Own warm query p95 meets 2 ms. Conservative refusals are substantial and explicitly assessed below. |
| 8 | Truthful feedback and controls | **ACCEPT** | Per-step event identity, distinct collision/bite accounting, resets and outcome priorities are coherent; actual muted feedback and floor-warning evidence agree. Audio/AT speech and physical-mouse comfort remain unverified. |
| 9 | Concise integrated presentation | **ACCEPT** | Inspected preparation/source/return/recovery/dense layouts at 960×600 and 1280×800 retain actions and meaningful warnings. Labels/costs are compact; no repeated routine helper paragraphs are required. |
| 10 | Reproducible complete candidate | **ACCEPT** | Own 536/536 check/typecheck/build and all economy modes pass; sealed evidence/source/build identities verify. Whole-route and later affected evidence retain their distinct sources and limits. |

## Required change

### SOL-M2A-R1-01 — P2: resolve the warm activation CPU trial before closing criterion 5

**Observed evidence, not a fresh final-source browser reproduction.** In `/tmp/siltwake-m2-a-compose/raw/route-performance.json`, source b91cde9, renderer session `f9c6193c-f2e4-4dab-a093-92af0a071e9a` first activates Canopy at seq1528 (338.3 ms), then changes to `suspended_garden,refuge_reef` at seq1566: **50.6 ms** activation, **53.2 ms** largest callback. This is a same-session revisit to already used regional content, not the first Canopy construction.

The later source4583671 hunter-contact ledger has a second concrete case: session `20791d4d-c22d-4621-8864-d89e07b0ebe4`, seq350–358. After refuge recovery, import the unchanged earned diver12645 checkpoint and present one controlled 100 ms callback (no simulation advance at that presentation). The renderer changes `refuge_reef,island_chain` → `refuge_reef,suspended_garden`: **59.300 ms** activation and **61.2 ms** callback at seq358. This is an imported-checkpoint warm-cache reactivation, not ordinary powered travel. Later repeated `59.300` strings are the retained last-activation counter, not dozens of further misses.

Own `raw/retained-warm-activation-receipts.json` preserves the original timing summary and narrow ledger rows, source paths/hashes, poses and region transitions. The measured scope is synchronous `art.update(state)` inside `src/render/renderer.ts:180`, with regional disposal/create/update in `src/render/regions.ts` and geometry/sign reconstruction in the render cache/expedition modules. No unique slow suboperation or code root cause is established by these measurements.

**Consequence and certainty.** A >50 ms synchronous presentation activation can interrupt the route and input presentation. Both observations exceed the direction's explicitly provisional “no warm activation stall >50 ms” engineering trial. They do not prove a user-visible hitch on a dedicated GPU, frequency on a quiet host, a memory leak, or a particular algorithmic regression. Software rendering, recording, GC or host scheduling may contribute. Those alternatives need evidence; neither the final hunter-query optimization nor my faster NullEngine samples resolves them. The brief expressly brings these two open samples into this batch. I treat their unresolved disposition as a P2 acceptance-evidence gap, not a newly confirmed correctness bug.

**Smallest compatible correction.** On the exact candidate (or a clearly identified correction), profile only these reactivation paths in an isolated production browser: retain cold/first-use costs separately, exercise repeated warm returns with unchanged saved state, and record every activation, CPU profile, renderer/settings and competing host work. Determine whether the misses are actual reconstruction work, first-use work misclassified as warm, GC or external scheduling. If the production critical path reproduces the failure, reduce/schedule that measured work while preserving source/cover geometry, cache bounds, simulation purity and ownership. If a defensible measurement explanation resolves it without a code change, record the raw evidence and explicit trial disposition. Do not silently raise the threshold or report only faster samples. A dedicated-GPU certification or a new whole campaign playthrough is not required for this bounded follow-up.

**Pass condition.** Source-attributed current-browser repetitions/profiling resolve both cited cases against the unchanged trial, with retained outliers and stable resources. Cold costs and representative-GPU pacing can remain separately open under the documented delivery exception. No unrelated historical matrix needs repeating.

## Progression, persistence and recovery assessment

The original full earned run remains **b91cde9e2956ce36ec9e4e7901332f7ebf1257cc**, `/tmp/siltwake-m2-a-compose/`. It begins with New Game, not imported stock; its later failure branches import unchanged checkpoints from that run. Coordinate-assisted ordinary keyboard inputs and controlled frame scheduling earn C01–C04, use the existing ≤150 m Canopy stock for the paid in-place suit350, approach initial Basin stock in Dart180, obtain C05/C06, and return/store/service. Suit `item_7` retains its identity and earlier receipt; Dart `dart_17` retains its 6 alloy / 3 glass / 2 membrane frame investment. Main-route minimum oxygen **61.62963%**, power **83.966769%**; audited pre-refill intervals exceed 25%. The final tick39125 return stores **17 CU** of useful stock. Optional personal journals and acoustic trim are absent from this main route, not secret prerequisites.

The economy diagnostics separately buy optional trim, account for the refit's 2 alloy / 2 membrane / 4 crust / 4 resin, preserve maintenance-only rescue stock, and complete recovery without a duplicate advanced craft or inaccessible materials. Fresh-order C05/C06 and C06/C05 diagnostics do not rewrite the completed earned save's existing knowledge order. I passed the checker both fresh and with the completed earned input. These staged arithmetic/command checks establish solvency and conservation; they do not supply ordinary travel margins. Earlier Reef/Isles still supply required stock, fabrication/service and rescue preparation; later blueprints are presented as plans rather than fabricable ships.

Own exact-candidate continuation of earned025 reproduces **4,851 steps / 4 commands**, minimum **63.962963% O2 / 83.966769% power**, and **16** codec/future comparisons. Own earned037 recovery continuation reproduces **8,844 steps / 9 commands**, minimum **88.814815% / 87.912546%**, and **29** comparisons. Both complete with the original Dart and matching retained final hashes. The original036 numerical window contains **zero steps**; I do not count it as an independent active-operation run. Separate latest actual browser036 Continue/future evidence and its full-state pair cover that operation.

The recovery sequence's ordinary overdescent disables the same Dart; protected exit/return reaches the starter-accessible local bench, initiates Bobbin's basin route and tow, pays **2 protected alloy / 1 membrane** for a patch, retrieves cargo and returns to refuge. Actual Continue at tick47528 preserves `basin / approach / waypoint4`. Surface initiation and submerged work are two physical faces of the same station, not remote container access. Route identity is explicit and stable during interruption; legacy active operations map to `canopy` without reinterpreting waypoint numbers. Paid repair and salvage/reserve branches are covered by current tests/economy diagnostics, while only this one earned tow/repair branch has ordinary route evidence. Broader deep/advanced-fleet rescue belongs to subsequent work.

Save review found no decode teleport or widened arbitrary-ID acceptance. Schema1/2 are checked against the frozen old validator/registry/types before conversion to schema3/expedition.4, then current strict validation applies. My byte comparison finds the frozen validator body exact to the base; AST comparison verifies every copied registry declaration (**27**) and persisted type declaration (**15**). Omitted art-only exports and transient event/command types are intentional, not narrowed persisted domains. New stock/content initialize once; old IDs, poses, investments, depletion, knowledge and recovery state remain authoritative. Immediate-save command tests pass.

All **50** current application Blob strings match their durable files byte-for-byte and strict current decode preserves the complete state. All **13** actual Continue state/future pairs are independently equal. I independently replayed the matched original13311→current13431 **120 steps** with current compiled modules: complete **JSON save state exact**, health34.666667. JSON normalizes signed zero in velocity; the initial Object.is-style signed-zero diagnostic was an audit comparison issue, not altered gameplay. Root's broader42-export/6,498-step result and8,512 exact compatibility comparisons were inspected and their seals checked; I did not rerun those unchanged matrices or claim them as my independent counts.

## Geometry, lifecycle and hunter assessment

Terrain generation now closes authored rescue/Basin discontinuities and preserves legacy-heightfield/source ordering. Current source-surface tests cover the 35 normal source/work views and four Basin endpoints; wall/terrain tests cover cliff boundaries, supported near-plane contacts, both crossing directions, tangential travel and escape from retained old overlap. The missing Basin triangles, prior20.78 m render/physical discrepancy and concrete22-step wall penetration are resolved by the composed changes. Actual work-face, floor-look and rescue-top captures show the corrected surfaces. Close views can still fill with a real wall/deck; that is not itself mesh penetration or a promise of a horizon at every pitch.

The movement sweep and footprint support checks are separate from historical static `clearance`. Its old centre-floor placement policy remains, including saved/seeded pose limits. I reviewed the affected vehicle/carrier/recovery/module/codec call paths rather than assuming it guarantees all possible future placements. No concrete affected earned exit, source or recovery softlock remained. The accepted player/vessel movement/default query behavior and sixth optional movement callback remain; the floor-stall correction reports support refusal without changing movement.

Region activation is presentation-only: current handles read the replacement state, while persistent depletion, pursuit and recovery keep simulating independently. The bounded geometry cache copies recipes' numeric data; it does not retain mutable GameState or old scene handles. Sign texture reuse has explicit reference ownership; materials remain scene-owned. Pinning follows controlled/interior/recovery/berth identities rather than freezing remote state. Save replacement, quality changes, resize/context restoration and disposal have regression coverage. Context readiness is not inferred merely from the restored event.

My copied regional probe uses two fresh NullEngine owners and ten stops each. Construction costs **3,693.179 / 3,689.210 ms**; first Canopy **424.669 / 338.824 ms**; other first activations **52.423 / 86.086 / 36.959 / 76.675 ms**. Fourteen warm reentries range **3.267945–14.625992 ms**. State stays unchanged, repeated live counts stabilize, cache limits hold, and double disposal leaves **0 meshes/geometries/textures/cache entries/labels**; two caller-owned materials survive until scene disposal. These results support lifecycle correctness, not WebGL or GPU pacing. Large cold costs remain open separately from SOL-M2A-R1-01. The earlier material proliferation is corrected; the retained carrier diagnostic's21 materials is not earned M2-B performance proof.

Hunter art/contact dimensions share the authored geometry. Contact uses post-movement mouth/skin proximity and LOS against the real diver or hull identity; inside-actor origins do not earn bites. Withdrawal ends contact rather than deriving safety from a final-health guess. Parked, disabled and berth-relevant hulls remain obstacles and mouth-LOS occluders after exit, with actual shell/lock/berth transforms. Continuous hunter-only sweeping and retained-overlap separation address the parked-Dart failure without making broad carrier bounds into solid player walls. Immutable query geometry/bounds/axes are cached; per-evaluation transforms and results do not persist mutable state. Actual noisy hull disable, open-water diver damage/withdrawal/incapacity and recovered refuge outcome preserve meaningful danger.

The fleet sweep deliberately encloses the **full animation**, not the instantaneous animal triangles. My geometry-only diagnostic samples289 XZ positions at the parked Dart's origin Y. Of162 clear of the conservative current-pose pieces, **93 refuse a stationary +0.001-radian yaw request** under the full-animation sweep. Some refused samples have a positive current-piece gap. This is substantial extra refusal, not exact-triangle proof or ordinary gameplay. I accept the bounded tradeoff here because actual affected sequences show separation from the parked craft, successful movement away, renewed contact and damage rather than a trapped overlapping animal or demonstrated permanent invulnerability. It can leave more visible room around a hull and deserves attention when M2-B adds practical multi-hull routes. That later work must not cite this grid as proof of precise animated collision or universal navigation.

Root's actual parked-hull screens use rendered hull triangles and conservative animal pieces with the candidate SAT kernel; they are not independent exact animal/hull triangle intersection. Their retained overlaps clear after active steps, rather than being silently normalized during load. My matched120-step replay independently supports the current affected trajectory. Disabled reboarding is correctly refused; healthy exit/return/reboard has a separate actual export at tick11365. The healthy recording's inspected endpoint still shows swimming with the Board prompt, so that video frame alone does not prove the completed board action.

One own uninstrumented Node24.21.0 query trial, after the full check and without my other heavy probes running, meets the unchanged warm p95 ≤2 ms CPU trial:

| Scenario | First call ms | Warm p95 ms |
| --- | ---: | ---: |
| Idle | 1.702 | 0.069 |
| Investigate → pursue | 6.469 | **1.380** |
| Pursue | 0.153 | 1.044 |
| Earned043 overlap | 1.254 | 0.799 |
| Two nearby hulls | 7.273 | 1.020 |
| 48-hull screen | 3.120 | 0.807 |

Each retains the first call,60 setup steps and360 warm samples. Shared Chrome CPU activity is disclosed in the own CPU snapshots; I did not cherry-pick a rerun. Root's independent highest p95 is1.476 ms, first-use8.135 ms. These are simulation CPU trials, not total frame or hardware certification. First-use and isolated warm maxima remain distinct from p95.

## Actual presentation and counterplay inspection

I read both browser-rule files. I used retained evidence and nonbrowser APIs; I did not open/drive a browser, acquire port5191, start a server or recording, or manipulate shared tabs/processes. No unavailable-browser claim is made. Actual inspection used `view_image` on **35** full-size captures or reviewer derivatives. `raw/visual-inspection.json` records every viewed path, source, copied image/hash and limit. `raw/media-index.json` hashes the **15** source recordings; `raw/media-sampling.json` records chronological8-frame sampling. This is sampled motion evidence, not full-speed human play or an audio audition.

| Source | Actual inspected sequences / captures | What they establish |
| --- | --- | --- |
| b91cde9, original composition | All8 recordings: descent/look; warning/quiet retreat; Canopy sources/lab; Basin work/C05 floor; useful return/store/service/actual Continue; pressure disable; local recovery/Continue/tow/patch/retrieval; older injury/recovery. Also full-size preparation/refit,17-CU return,C05/C06 floor and bench views. | Connected earned interactions and spatial/UI state. Older intersecting hunter art is superseded, not current proof. |
| dc5d67c, landmark | Level009 Light960 and Rich1280; centered attachment; west-lane descent. | Living fork rises above the console at the actual53 m approach; organic attachment leads down to the physical rock shelter. No camera or cover-classification shortcut. |
| 35c2d22, hunter reconciliation | All7 required recordings: matched old13311/current120, actual disabled exit/open water, current damage/withdrawal/incapacity, drag-cover012, healthy exit/retreat/reboard, quiet012 open water, original036 Bobbin continuation; matched old/current comparison; supplemental endpoints/dense samples. | Current visible separation and outcomes, approach→withdrawal→renewed danger, separate cover and quiet responses. Numeric ledger/state evidence supplies modes/true-cover and board completion. |
| 222b805, A3 | Dense error/exit/call at both960 and1280, submerged recovery960 and notebook C06-first960. | Seeded/staged layout density, concise actionable controls and warning hierarchy; later onset priority is checked separately. |
| 34fdbd7 / f039e37 | Corrected rescue-top terrain and wall contact-floor-look. | Actual corrected geometry at staged matched contacts, not new ordinary route proof. |

The source24–36 s dense current-damage derivative contains repeated paused frames; it cannot establish uninterrupted animated motion. Broader chronological samples show a visible approach, smaller withdrawn silhouette and renewed contact; deterministic logs constrain damage/withdrawal intervals. All video wall time includes tool pauses and controlled callbacks.

The level Canopy composition now supplies a visible destination/return reference and a connected descent cue. The actual assisted warning→investigate→physical-cover response, plus a separate quiet escape without cover, supports criterion6 at this batch boundary. Coordinate assistance and source-specific familiarity do **not** demonstrate a fresh player's recognition of that fork or choice of escape. The delivery exception leaves human route learning open; no tutorial subtitle or misleading cover flag is needed to claim it closed.

Injury presentation consumes actual per-installed-step damage events, keeps raw collision and bite accumulators distinct, and uses target identity rather than hunter trajectory/final health. Actor/outcome transitions clear or supersede feedback; later disable cancels a queued onset even without another bite. Pause/panel/menu/import/Continue/context/recovery resets, mute/captions-off feedback and bounded announcement writes have current tests. Native mutation evidence supports delivered markup, not real screen-reader speech. The earned tick9370 floor refusal now warns after W30 at tick9400 and supports retreat/rise; the sixth callback observes support, not a movement rewrite.

Inspected compact preparation/refit, notebook/source, local containers, useful return and recovery layouts distinguish the suit350 purchase from Dart180 and preserve action costs/disabled reasons. The two preparation stills are pre-purchase views still showing150 m; earned receipt/state evidence supplies the completed350 m refit, not the filename “paid-refit-ready.” Return/Escape/focus behavior and native disabled semantics have current coverage. Dense errors, direction cues, injury/recovery outcomes and immediate actions remain visible at the requested sizes. The cockpit still occupies screen area, but the landmark and useful route remain visible in the corrected matched level view. The richer cel silhouettes, terrain and mechanical work faces are coherent enough for this benchmark, not a final art-polish pass. Routine helper/subtitle repetition is reduced while meaningful dialogue/captions and essential errors survive. The withdrawn meal criticism is not reinstated.

## Prior findings and dispositions

| Prior issue | Independent disposition / remaining boundary |
| --- | --- |
| A1's12 compile errors /27 old-fixture failures | **Closed for this candidate.** Own full check passes. Historical migration fixtures are explicit; no weakened coverage is inferred from changed content version alone. |
| Missing four Basin terrain triangles | **Closed.** Current source/work-view checks and corrected topology pass. |
| Terrain render/physical20.78 m discontinuity | **Closed.** Shared surfaces/closed joins, current regressions and actual corrected rescue/Basin imagery support it. Cold terrain build cost remains open. |
| Wall22-step near-plane penetration / old-overlap escape | **Closed within its movement contract.** Actual wall imagery/current sweep tests support it. Static placement footprint limits remain. |
| ROOT-A2-PERF / MATERIAL | **Original regression corrected.** Bounded recipes/signs and scene material ownership pass; stable live resources reproduce. **Later warm trial misses remain open as SOL-M2A-R1-01.** |
| ROOT-A3-01 queued onset after later disable | **Closed.** Later hull/recovery outcome cancels onset without requiring another bite; priorities/reset tests pass. |
| OS3-01 missing injury feedback | **Closed for functional presentation.** Actual current muted injury/outcome sequence and event/reset tests support it; audible quality/AT speech remain unverified. |
| OS3-02 concise copy / meal criticism | **Copy accepted; criticism remains withdrawn.** Actual threshold/meal behavior is not reopened. |
| OS3-03 earned floor stall warning | **Closed.** Earned pose regression, support observer and actual warning/retreat evidence; physical motion preserved. |
| Completed-earned economy clue-order failure | **Closed.** Own completed-earned checker passes while preserving original knowledge; fresh order diagnostics stay separate. |
| OS2-04 floor readability | **Accept corrected batch.** Actual floor/work-face views improve spatial evidence; a close real wall/deck can still fill the view. |
| OS2-06 shelter / cockpit | **Accept bounded correction.** Actual level fork/descent and separate ordinary assisted counterplay support it; fresh-player recognition/comfort remains open. |
| ROOT-COMPOSE-HUNTER / ROOT-HUNTER-01 inside contact fixtures | **Closed.** Current exterior contact/withdrawal addresses the composition concern. Own AST comparison against hunter parent150e334 confirms all235 app +207 expedition assertion expressions unchanged (**442**); new regressions and inside-actor refusal pass. |
| ROOT-HUNTER-02 query cost | **Closed against the2 ms warm trial.** Own highest p95=1.380 ms; immutable bounded query caches and compatibility evidence inspected. First-use costs remain explicit. |
| ROOT-HUNTER-03 parked/disabled/berthed obstruction | **Closed for M2-A.** Actual post-exit fleet obstruction/separation and current tests support it. Full-animation conservative refusals and shared-SAT evidence limitations remain explicit above. |

## Verification and evidence integrity

Own commands ran once as appropriate; no generator executed inside sealed author/root evidence. Copied probes write only the fresh reviewer artifact root and load my exact compiled candidate. Full logs, exact invocation/exit index and raw outputs are retained. Initial audit harness errors (archive prefix; intentionally omitted art/transient declarations; export/checkpoint order; JSON signed zero; result/reporter prefixes) and successful corrections remain in logs. They caused no product/test edits and are not product findings.

| Own command / probe | Result |
| --- | --- |
| `npm run check` | Exit0; **536/536**,0 failed/cancelled/skipped, strict typecheck/test compilation and Vite build pass. Main-chunk >500 kB warning remains. |
| `node scripts/check-m1-economy.mjs` | Exit0. |
| `node docs/build/design/check-economy.mjs` | Exit0. |
| M2 economy fresh and `--earned .../earned-return-after-Continue.json` | Both exit0, separate retained outputs. Staged rule evidence. |
| Copied/retargeted query, region, continuation and export probes | Exit0; results/counts above. No whole historical matrix repetition. |
| Own seal/source inspection | Latest author1,476 regular payloads +1 symlink; original composition541 regular payloads; root180 regular payloads +13 symlinks verified against manifests. Both author archives' member bytes and included manifests verified exactly. No dependency link followed. |
| Source/build identity |111 exact tracked source/test/config inputs compared to35c2d22; own compiled modules/dist retained. No functional diff source→candidate. |

Own production bundle `index-zkRMM1mQ.js`: **1,486,893 bytes**, SHA256 **`183c50ff6e4ab8b13038a796037c85f4bdcd3ba769e8cc0c084ea279d4745463`**, matching current served author/root identity. This does not relabel older captured builds.

Root's retained42 browser export replays cover6,498 steps:40 complete states exact, two with hunter-coordinate differences ≤2.84218e−14 m. I inspected and verified the retained artifact integrity and independently reproduced a targeted120-step complete JSON state match, all50 durable Blob decodes and13 actual Continue pairs. Only **24 native downloads survive**; all50 Blob exports survive. Those are separate claims. The original b91cde9 full route and subsequent source-attributed affected continuations support composition; they are not a new final-source full New Game browser run.

## Artifact seal and handoff

Artifact root: `/tmp/siltwake-m2-a-review-sol-r1/`. `README.md` gives reproduction constraints; `MANIFEST.json` lists payload sizes/hashes and non-dereferenced dependency links. `artifacts.tar.gz` includes the manifest and its payloads. `SEAL.json` and later `HANDOFF.json` are external to avoid a hash cycle; the latter records this report-only commit and final clean checkout. The tracked report is external to the artifact archive.

| Sealed artifact | Value |
| --- | --- |
| Payload |432 regular files /73,115,471 bytes;1 dependency symlink, not followed |
| Manifest SHA256 | `b2a654688953b20b4984736f68134df048e3f4631e81f7ccdc9652c7fd3def3c` |
| Archive | `/tmp/siltwake-m2-a-review-sol-r1/artifacts.tar.gz`,25,905,855 bytes |
| Archive SHA256 | `50a7a8c54cb7d891d7cd705daa1dac481a78e5dd5ab0c43cac0b6300b68ce548` |
| Verification | Every payload's disk/archive bytes or symlink target and the included manifest match. |

No owned browser tab, server, recording or port was acquired; all check/probe commands completed. Shared/human/peer resources were preserved. The own artifact dependency symlink remains recorded without bundling dependencies; the temporary worktree symlink is removed. Only `docs/build/reviews/M2-A-SOL-R1.md` is committed on top of the frozen candidate, and tracked/untracked status is clean at return.

Human recognition/route learning, physical-mouse comfort, continuous motion feel, audible mix, actual screen-reader speech, enjoyment/duration, representative dedicated-GPU pacing, cold/first-use loading and the specifically requested warm-CPU disposition remain unverified/open as described. The documented human/GPU exceptions do not erase the observed CPU trial issue. Root can reconcile this initial report with the separate reviewer after both have returned; no peer wait is needed.
