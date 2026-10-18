# POLISH-1 slice1 — Astra independent review R2

**Verdict: ACCEPT** on frozen candidate **`d031803730fb44b9208e52fdfb91a88e9ddf8a41`**, for the entire composed 1A+1B+1C controls/action slice and keyboard correction. All nine reconciled criteria pass within the evidence limits below. **SOL-P1-1 (P2) is closed.** No new blocking correctness or scope finding. This is one independent verdict; root must reconcile both current-round reports before accepting the batch. It does not accept slice2, the complete game, or the outstanding stage-end Opus gate.

Reviewed 2026-10-18. Whole-slice base: `61fcc3033292f9412a795a2388616a4f926ece22`. Production assembly: `5f25810a7f7d9974ffd2fb2b3379d812d206b0f9`; production/tests/config are identical to author `da1a9dc`. The correction comparison is against `88f1f71`, not a replacement for reviewing the original slice.

## Independence, identity and scope

I began with a clean worktree at the exact candidate in `/home/worker/.t3/worktrees/subnautica-clone/t3-eece926c`. The actual Codex session `01a14e37-0f16-7321-8386-06fb0375e02e` records **`gpt-6-astra` / `xhigh`**, with this cwd, in its `turn_context`; this agrees with the effective T3 runtime declaration. Receipt: `/tmp/siltwake-polish-1-slice1-astra-r2/runtime.json`. This was a fresh non-author review, not the earlier Astra review or an author continuation. No children, current-round peer report, peer discussion, parent-worktree edits, production/test edits, push, PR or merge were used.

Read the repository instructions and current checkpoint, PLAN/CONTRACTS, authoritative revised build input and relevant integration/world/fleet/story/graphics/acceptance specifications, settled map and historical tracker. Reviewed POLISH-1/1B/1C, the full original R1 brief, both complete R1 reports and root reconciliation, R1-FIX and R2 briefs, A/B/C author/integration evidence, fix author/integration records, and the relevant Opus audit/disposition/consultation. The reconciled tasks govern the former same-panel Tab allowance and the narrowed optical/camera/scanning proposals. The code-review skill's standards/spec lens was used without its delegated workers, as this assignment expressly forbids children.

I inspected the original production diff and dependent targeting, simulation, presentation, input, capture/session, rendering, geometry and save boundaries, plus relevant tests. Prior ACCEPT and root verification were evidence to assess, not substitutes for this review.

## Current checks and attribution

All new receipts are under **`/tmp/siltwake-polish-1-slice1-astra-r2/`**. Original author/root evidence was read-only.

| Independent check | Result |
| --- | --- |
| `npm ci` | Pass; `install.log`. |
| `npm run check` | Strict typecheck, **275 tests / 275 pass / 0 fail**, and production build pass; `check.log`. Existing large-chunk warning remains. |
| `node scripts/check-m1-economy.mjs` | Pass; `economy.log`. Staged economy transactions are not ordinary-route evidence. |
| Current source/test/build identity | All **37 source, 25 test and 27 build** hashes match final fix identity. Main JS is `index-CqYw5oJu.js`, SHA256 `5dc12ca6271db4a51da767b746a70e90fd7c1f20007fcc3c8228610b0a937f6b`. |
| Original evidence bytes | All **47 fix, 200 1C and 160 1B** manifest payloads match their hashes and recorded sizes; `verify.py`, `verify.log`, `artifact-verification.json`. |
| Production equivalence | Candidate equals assembly `5f25810` and author `da1a9dc`. Since `88f1f71`/`131079f`, only app/view and their two tests differ. `source-equivalence.json`; the full candidate-versus-author diff contains documentation only. |
| Actual complete-state reload replay | Current production reproduces **8157→8237** from 1B and **9266→9346** from 1C with 80 neutral steps each, including sorting in the latter. Entire states compare equal after production-codec normalization, without field omissions or rounding. |
| Paid fabrication and older saves | Executing current `craft(dart_base)` on the actual tick7551 before-export exactly reproduces the entire after-state and yawπ. Five original earned saves decode/re-encode unchanged, including old Dart yaw0 and later yaw/pitch values. |
| Rib diagnostic replay | Current aimed selection/action refuses the seeded blocked cache and opens inventory for the separately seeded clear cache. This is diagnostic geometry evidence, not earned discovery. |

The last three rows are independently written `replay.mjs`, with `replay.log` and `replay-results.json`. The older saves are `alloy-first`, `island-glass-east-bundles`, `dart-fabrication`, `canopy-pre-warning` and `first-return-before-service` from the original M1 presentation evidence.

Reuse is bounded by source equivalence: final 1B `8c15277` media establishes its unchanged targeting/control/vehicle behavior, not the later terrain appearance; final 1C `131079f` media establishes the corrected resource/terrain appearance. R2 changes keyboard dispatch/focus wrapping only. Neither older media nor offline replay becomes a fresh R2 campaign.

## SOL-P1-1 and independent native keyboard trial

The accepted R1 failure was material: Tab on Hold SELECT/BUTTON could close the panel, resume simulation and request capture, and Hold lacked forward wrapping. `src/runtime/app.ts:240` now treats Tab as a gameplay shortcut only while active, outside a panel and outside controls, and respects `defaultPrevented`. Eligible letter shortcuts retain their separate text-entry guard. `src/ui/view.ts:296` wraps both directions for every modal, including Hold, while leaving ordinary interior traversal to the browser. `checkVisibility()` excludes descendants of collapsed details from the boundary list.

I checked the actual UI's focus assumptions: its current ordered controls, disabled exclusions, explicit non-tabbable focused articles and closed-details descendants. There is no current positive-tabindex ordering, hidden-boundary or unrelated focus-list defect requiring correction. The view fixture models visibility rather than implementing Chromium layout, so its passing test alone would be insufficient; native evidence below directly covers the previously failed boundary.

Read both fleet and repository browser rules before browser work. Used one owned incognito T3 preview at checked-free **5193**, with initially empty origin storage, serving the exact built JS above. Verified the actual Linux factory-worker Chromium154 headless-shell renderer **PID1790341**, not only the shell hostname. The observer delegates the original pointer-lock API and records requests/events; it does not grant game state. Native T3 key presses drive the trial; DOM focus only places starting focus on existing controls. One fresh New expedition, no import, state grant or carrier-fixture start.

Own raw evidence: `observer.js`, **`native.json` (137 events, 36 marks)**, `native-inspection.json`, `browser-host-before.json` and `browser-process.json`.

| Native action | Observed result |
| --- | --- |
| Opening Tab → Act → Skip, then Enter | Existing opening navigation works; focused Skip activates immediately. |
| Gameplay Tab | Opens Hold at tick96, with one earlier capture request and lock released. |
| Hold first/interior tabs; From SELECT → To and reverse; last Store button ↔ Return | Focus moves/wraps; panel stays open, tick96, requests1, unlocked. |
| K to Fabricate, initial/interior tabs and both boundaries | Same paused tick/capture invariants; Tab does not switch panels. |
| J to Notebook, existing C01 article → Return, reverse to Hint and forward to Return | Non-control entry and boundaries work without resuming or capture. |
| V information panel, reverse to Notebook navigation and forward to Return | Same invariants; no carrier scenario started. |
| Enter on Return, then Escape | Return requests capture2 and achieves native lock; Escape pauses/releases, with no extra capture. |
| All menu details closed: Return Shift+Tab, then Tab | Focus reaches **Save safety summary**, then Return. It does not target a hidden descendant. |
| Native Enter expands Controls; Tab through Rendering/Sensitivity and reverse | Normal settings traversal, paused at tick112, requests2. |
| Explicit Resume, I to Hold, same-panel I, final Escape | Deliberate Resume and letter return produce requests3/4; final state is paused at tick128, requests4, unlocked. |

All **15 own native panel Tab actions** retain the appropriate panel, tick96, requests1 and unlocked state. The author independently supplied **19** panel Tab actions, in paused segments tick176/requests1 and tick528/requests2. I inspected all **183 raw author events**, markers, observer and all eight final screenshots, rather than accepting marker names alone. In that trace, article→Return is focusin103 before deliberate refocus104/late callback105; carrier reverse destination is focusin124 before next forward126/late128. Return request132 achieves lock observed by Escape133; callbacks136/138 both observe the subsequent release, not two captures. The retained earlier failed `7c1cbfd` menu trial is not final passing evidence.

**Disposition: SOL-P1-1 closed, including root's Hold-wrap and collapsed-details extensions.** Current deterministic checks cover handled events/modifiers, controls/text entry, gestures and capture permutations; this native trial resolves the material browser-layout/navigation question independently.

## Complete acceptance coverage

| Criterion | Assessment and evidence |
| --- | --- |
| **1. Shared aimed action/prompt/cue** | **Pass.** Pure selection uses body reach, forward aim and visibility for the same host consumed by prompt/action/cue. Being inside a host does not bypass LOS. Reviewed ahead/behind/adjacent and known-record precedence, depleted sort/tend/reserve behavior, disabled craft/cache/services and direct refusals. Current target/presentation/command tests and inspected regulator/intake/service evidence agree. Q still pays/validates scanner and noise requirements; panel focus does not grant knowledge or remote interaction. |
| **2. Optical geometry and local world** | **Pass.** Solid intersections and actual canonical rib optical geometry use the supplied query/heightfield; finite-input checks fail closed. Only mapped own furniture is exempt, so an unrelated obstruction still blocks. Reviewed local-query tests and unchanged physical collision boundary. Ordinary pod-wall evidence, current tests and separately labelled seeded rib replay support the result; the seeded cache is not an ordinary production rib encounter. |
| **3. New versus legacy Dart** | **Pass.** Only paid new Dart creation gets yawπ. The exact paid replay preserves charged costs/inventory/metrics, and older save poses roundtrip intact. Inspected separate new launch and legacy departure footage/trace: new boards at tick7917 with yawπ and departs to z−0.190 at8157; legacy boards yaw0 at6688 and turns before departing. Other hull geometry/handling and guarded save/recovery relationships remain unchanged. |
| **4. Transient feedback, validated panels and camera/cue** | **Pass.** Actual positive hull loss is clipped to committed damage and emitted transiently; centered/coalesced feedback does not treat slow contact as damaging impact. Cue uses retained fogged, depth-tested geometry and bounded placement, with disposal coverage. Panel events are validated against existing record/container/service content. Nonpilot eye/target origin agree; pilot/opening contracts stay separate. Inspected actual Hull−1.5% footage and later absence, regulator/intake cues, C03/services and partly occluded C02 bracket. |
| **5. Capture/preferences and keyboard accessibility** | **Pass after correction.** Fresh native evidence above establishes Tab navigation/wrapping, no paused tick/capture changes, opening/menu boundaries and distinct deliberate capture versus Escape release. Source/current tests cover remembered Drag/keyboard preferences, denial, focus/pause, stale promise/event ordering, replacement and disposal. Prior native lock/context events and injected fallback/relative-motion evidence retain their separate classifications. No automatic recapture or stale-held-input defect found. |
| **6. Exit and opening gestures** | **Pass.** Presentation owns the cancellable 0.35s moving-exit gesture and exactly-once command; simulation retains authoritative depth/clearance refusal. Disabled/empty-charge/low-hull/emergency-air/pursuit bypasses remain immediate. Current tests and original raw controls trace show tap/release, panel/blur/Escape cancellation and no deferred exit; a later continuous hold produces one safe swimming transition. Deep-clear and emergency fixtures remain seeded diagnostics. Canvas opening hold and native immediate focused Skip activation coexist. No movement/physics or save-schema tuning. |
| **7. Resource art and local terrain** | **Pass within sampled limits.** Inspected all twelve final full/depleted views from two approaches for each corrected source. Plates/nodules and persistent pale frames/tags/mineral ridges remain identifiable; workshop east's real buoy occlusion is resolved by the separately shown north view. Sampled deck motion shows stable exposed planking; source removes hidden coplanar terrain. Current float32 topology/support tests cover bounded refinement, crack-free transitions, deck/ramp, all twenty unchanged source target fixtures and replacement/disposal. Ordinary imported branches retain collect/deplete/sort/restock and food/C03/services. Costs and local-only accuracy are explicit below. P1-VIS-1/2/3 remain closed at this bounded scope. |
| **8. Checks, saves, attribution and protected boundaries** | **Pass.** Fresh full checks, independently exact complete-state reload/fabrication replays, older-save roundtrips and manifest/build verification pass. Original full-slice diff preserves source datums/yields, recipes, hull shapes, protected provenance, schema2/content `expedition.3` and writer/recovery policy. Session change is grammar only. Native keys, synthetic holds/look, earned imports and seeded fixtures are distinguished. |
| **9. Copy, dependencies and unresolved defects** | **Pass for this slice.** Added prompt, capture, exit and impact copy is concise and player-facing. Essential captions, warnings, persistence errors and protected narrative records remain. No new blocking dependency/lifecycle or scope defect found. Broader existing menu density/hierarchy and notice/air/encounter/rib-collision work remain slice2; this acceptance does not certify that future work complete. |

## Inspected imagery, motion and limits

`media/index.json` lists exact original paths, extracted frames and seek times. I inspected the generated contact sheets and frames, not just exposure numbers or filenames:

- Twelve final 1C workshop/headland/west-glass stock/depleted PNGs; eight final keyboard-fix PNGs; regulator/intake cues, separate seeded rib blocked/clear views and C03/services.
- 1C deck movie at 40/42/44/46s and headland stock/depletion movie at 49/55/75/90s. The 49s headland frame is a menu; it is not source visibility proof.
- Final 1B paid-new-Dart movie at 55/61/64/67s and separate legacy-departure movie at 5/15/24/30s; panels/impact movie at 7/11/13.2/19s; exit/cancellation movie at 4/9/20/30s. Exit samples show cockpit/hold guidance and the blur pause; the eventual safe-exit result comes from its raw trace/export, not those four frames.

This is sampled motion inspection, not continuous viewing of every frame or a fresh campaign. Local sheet names `legacy-impact` and `impact-exit` refer respectively to **legacy-departure** and **panels-impact** movies, as the index explicitly records; names do not expand their evidentiary scope. Original raw controls/new-Dart/legacy/capture-context traces were also inspected, including trusted flags. Automated held movement and relative look in those routes are not asserted to be native physical mouse motion.

The 1C author audit samples **339,296** local positions, with maximum error **0.0259067011m**. The recorded west-rim coordinate changes from eye clearance −0.15917m to +0.63995m; current geometry tests cover that failure location. The route audit's minimum is +0.640278m, with two startup menu→game camera records explicitly excluded from same-frame matching. These are sampled/local bounds; remote coarse geometry and discontinuities remain. Original positions and physical field are unchanged.

Full-scene cost grows **391,011→485,460 triangles**, **99→102 meshes**, with **18 materials unchanged** and about **3,451,906 extra buffer bytes**. One author NullEngine creation observation grows **577→823ms**; it is not a consumer-GPU benchmark. Current lifecycle tests and the author 100-cycle audit support bounded retained/disposed resources, not a claim that the additional cost is free. Carry this cost into M2 profiling/streaming.

Native drag tooling timeouts remain unresolved; prior relative mouse motion, selected holds, blur and denial paths were synthetic/injected. Fresh R2 native key/lock events do not erase those limits. No speculative mouse-warp suppression is required by the earlier automation cursor delta. Browser evidence uses **SwiftShader and muted audio**: no dedicated-GPU, audio-mix, human comfort/enjoyment/duration or complete-campaign claim. M2–M4, slice2 and the end-stage1 Opus review remain open.

## Resource closure and return

Removed the temporary observer and cleared only this owned origin's storage. Closed owned tab **`tab_2s_0430977b-1ed3-45f2-ac72-3683f9fe8942`** normally. Stopped only owned preview server session **64596** with Ctrl-C (exit130); bind check confirms **5193 free**, renderer1790341 gone, and shared hosts827911/847778 alive. No recording was created. Historical/user tab14 and peer resources were untouched. Receipt: `browser-cleanup.json`.

Only this report is committed on top of the frozen candidate; review receipts remain in the assigned new temp directory. No production/test change is requested. Root alone integrates this verdict with the separate Sol R2 result.
