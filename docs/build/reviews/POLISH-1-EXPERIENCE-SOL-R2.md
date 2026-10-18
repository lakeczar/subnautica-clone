# Complete experience correction — independent Sol R2

**REQUEST CHANGES.** Both original R1 reproductions are resolved, but two neighboring compositions still obscure actionable content. Criteria **1 and 6 request changes**; criteria **2, 3, 4, 5, 7 and 8 accept** the bounded requirements with the evidence limits below. This does not accept the batch, finish stage1, replace the fresh Opus gate, or complete the campaign.

## Identity, scope and verification

I am a fresh non-author reviewer. Actual original runtime is **gpt-6.1-sol / max**, verified from the original session `turn_context`, including its bound cwd; current runtime also reports that model/effort. Receipt: [checkout-runtime.json](/tmp/siltwake-polish-1-experience-sol-r2/checkout-runtime.json). No model substitution, child, peer contact/polling, author artifact write, source fix or parent-checkout switch occurred.

| Identity | Exact value |
| --- | --- |
| Cwd throughout | `/home/worker/.t3/worktrees/subnautica-clone/t3-75d1bd35` |
| Initial clean, frozen HEAD | `3e740a8876ccddb6d433558c0b91e4aba3fb31d9` |
| Review base | `c4de57928347c89ea7602a13d1e14a2849caf722` |
| Source tree | `4780e5b949c23dee3884dd4dfae0371f2a324f75` |
| Tests tree | `4e201e17ca20408006eab9aa5e3017ac23c682fb` |
| Combined correction source | `555ac20efd66962bb503a6e49276148f63a0e786` |
| Correction integration | `509086696b96d802bf76b0a72ac00ada648a28a6` |

Read STATUS first, PLAN/CONTRACTS, revised construction input and relevant specification/integration pointers, settled map/history, delivery gate, whole-batch reconciliation and S1/S2a/S2b/COMPOSE/caption/layout briefs, author reports/root inspections, both R1 reports/paired disposition, and Opus stage1 report/disposition/implementation advice. Reviewed the complete production diff and relevant test changes from the stated base, including shared simulation queries/events, runtime accumulation, cue rendering, HUD/panel semantics, CSS replacement and shared-test reconciliation. Used the code-review skill's standards/spec checklist without delegation, as this review explicitly prohibits children.

The final555ac20 correction itself changes only `hud.css`, private constructor grouping in `view.ts`, and eight assertions in an existing presentation test. Its public API, warning copy, notice lifetimes and focus/visibility semantics are unchanged. The blockers below concern the actual geometry of the combined UI, not a requested semantic change.

Independent checks on the frozen candidate:

| Check | Result / retained receipt |
| --- | --- |
| `npm ci` | Exit0; `npm-ci.log`. |
| `npm run check` | Exit0, **399/399**, zero fail/skip/cancel/todo; strict typecheck and production build pass; `check.log`. |
| `node scripts/check-m1-economy.mjs` | Exit0; `economy-m1.log`. Arithmetic/transactions only. |
| `node docs/build/design/check-economy.mjs` | Exit0; `economy-campaign.log`. Its ordinary-route/balance limits remain. |
| Base-to-candidate `git diff --check` | Pass. |
| Build comparison | All **27** rebuilt files byte-match author's `web/final`; `build-comparison.json`. Own browser served a copy of this rebuilt production. |
| Current-codec retained-state verifier | Pass; `verify-retained.mjs`, `retained-state-independent.json`, `severe-seed-independent.json`. |
| Prior archive verification | All **2,066 payloads** in eight archives pass path/size/hash checks and remain unchanged; `author-manifests-final.json`. |

Main JS `index-CgJzXPsR.js` SHA256 `f3580fa43f58cefa0b31801b79fd2248b73e9473779a881291f92e1acbd3aa39`; CSS `index-BhV6z4Hn.css` SHA256 `e082e3c45c0716bebd433f07fcdb21e23d5dfc687092f72f1aef648b84613a75`. The existing large-chunk build warning remains nonblocking. [Final identity/check receipt](/tmp/siltwake-polish-1-experience-sol-r2/source-checks-final.json).

## R1 closure and new blockers

Required context is [Astra R1](POLISH-1-EXPERIENCE-ASTRA-R1.md), [Sol R1](POLISH-1-EXPERIENCE-SOL-R1.md) and [paired reconciliation](POLISH-1-EXPERIENCE-R1.md), not a predetermined R2 verdict.

- **ASTRA-EXP-R1-01:** original save-disabled banner hid the call instrument on e81bb6f. The new notices column begins below the fixed call instrument during play. Current final production call/save images and own current native full-notice measurements at960/1280 support closure of that exact trigger. Original R1 production960 and fixture1280 retain their distinct provenance.
- **SOL-EXP-01:** original five-warning stack hid E/target at960. Current prompt-sensitive left lane separates all five warnings, E/target, full capacity refusal and look action. Own `r1-fixes-final-{960,1280}.json`, inspected960 PNG, and author's separately retained final production five-warning proof support closure of that exact trigger. The original Sol production follow-up remains inconclusive/excluded; its original native GameView/current-style refusal proof remains valid.

Neither closure establishes every adjacent composition. The following findings are independently reproduced on the actual frozen production app, with native counterparts. No author's timer, warning text, API or saved state was changed to create a layout result.

### SOL-EXP-R2-01 — P2: save failure overlays an enabled fabrication action

**Affected lines:** `src/ui/hud.css:161–169`, particularly the high-layer `.session-notices` column and panel `top:72px`; compact notification width at204. The grouping introduced at `src/ui/view.ts:90` places the full notification outside the HUD without reserving panel-content space.

**Trigger:** at CSS960×600, import the unchanged original earned `final-before-paid-fabrication.json` (SHA256 `b673cb90fc81b53cbdcbf0ee234582ae64141651e43319eceb3eae96caf0c50f`), cause a real local-journal save refusal, then open Fabricate while its12-second full error is present. Only autosave-off plus the real full save error is needed; a graphics/status chip is unnecessary. The bench has real materials and **Build Dart is enabled**.

**Observed actual production:** error rectangle `(742,128,194,130)` overlaps enabled `Fabricate · Build Dart scout / 180 m` rectangle `(673,219.539,230.414,36.195)` by **161.414×36.195px, 70.0539% of the button**. The notice covers its entire height and hides the build name. Native diagnostics independently reproduce this; with all three notices at1280 the overlap is197.414×26.461px (62.64%). The enabled control remains in the DOM and `checkVisibility()` reports true. The notice inherits `pointer-events:none`, leaving the obscured paid action dispatchable beneath it; I did not activate the obscured purchase.

**Player consequence:** immediately after a save failure, the player cannot read the complete enabled transaction control. Keyboard visibility checks do not establish readable content, and the overlay can permit a click through its opaque text area to the action underneath.

**Evidence:** [production JSON](/tmp/siltwake-polish-1-experience-sol-r2/production-earned-fabricate-save-error-final-960.json), [production PNG](/tmp/siltwake-polish-1-experience-sol-r2/production-earned-fabricate-save-error-final-960.png), `earned-fabricate-save-error-only-960.{json,png}`, `earned-fabricate-full-notices-{960,1280}.json`, complete `production-trace.json`. Production exercised the actual session/repository refusal through a temporary **journal-key-only** quota diagnostic. The original setter was restored before opening the panel, and the journal was byte-unchanged. This is an earned-input composition diagnostic, not a new earned expedition.

**Required correction/check:** reserve or reflow enough space for full notifications while menu/panel content is interactive. Verify actual enabled/disabled button labels and relevant content against full save/error/status combinations at960 and1280, including ready Fabricate, Cargo, disclosures and expanded menu. Preserve the complete warnings/copy, export availability, focus, IDs/action attributes, and existing lifetimes; visibility assertions alone are insufficient. Tracked under criterion6; criterion3's mechanical/preparation acceptance does not waive this composition blocker.

### SOL-EXP-R2-02 — P2: no-target pilot warning stack hides the independent exit refusal

**Affected lines:** `src/ui/hud.css:196–203`, especially centered `.alert-stack { top:212px }` and the side-lane rule conditioned only on a nonempty interaction prompt. The independent result/look stack still occupies the center when there is no target.

**Trigger:** at CSS960×600, pilot a depleted Dart with low oxygen/hull/health, personal suit150m, hull at155m, starvation beyond grace, and current pursuit. With no aimed target, leave the supported look/fallback button visible and attempt E exit. The seven current full warnings include long emergency-air, pursuit and starvation text. No save-disabled banner/error is necessary.

The exact staged severe state is retained as [seven-warning-valid.json](/tmp/siltwake-polish-1-experience-sol-r2/web/seven-warning-valid.json), SHA256 `4cc02ec7f689bef4e9a369edd2b3622f30bed70999fcc682e05e00c97e07ac57`. It derives from the original earned return but deliberately changes danger/location values: **this severe route was not earned**. Current codec accepts it, real hull clearance is true at `(110,-155,-105)` above ground−163.3977m, a real fixed step retains pursuit/clearance, and actual exit refusal preserves the entire state. [Independent validity/atomicity receipt](/tmp/siltwake-polish-1-experience-sol-r2/severe-seed-independent.json).

**Observed actual production:** import that seed through the app's file/confirmation flow and dispatch E down/up through its actual input/command path while captured mode has no pointer lock. At tick16587 the seven-warning rectangle is `(230.602,212,498.797,180)`; full result rectangle is `(240,371,480,59)`. The hazard layer covers **480×21px** of the independent result, hiding its first line: “Exit exposure 154 m exceeds your 150 m personal suit…” The result is present and `checkVisibility()` is true. The look button is visible, pointer lock false. A pointer-locked control with look hidden has zero vertical intersection, and the same valid native state at1280 is disjoint. Those are material trigger conditions.

**Player consequence:** the promised independent full refusal is visually truncated during danger. The left pilot guidance **does repeat the complete reason and remains readable**; this is not a claim that every explanation is lost or that an unsafe exit succeeds. It still violates the explicit independent-result and composed960 layout requirements.

**Evidence:** [verified production JSON](/tmp/siltwake-polish-1-experience-sol-r2/production-seven-warning-look-refusal-verified-960.json), [verified production PNG](/tmp/siltwake-polish-1-experience-sol-r2/production-seven-warning-look-refusal-verified-960.png), `physical-seven-warning-refusal-960.{json,png}`, `physical-seven-refusal-final-1280.json`, `production-trace.json`. Synthetic diagnostic key events are marked untrusted in the raw trace; no ordinary-input severe expedition is claimed. The production seed's import success chip does not cause the intersection; the native counterpart reproduces it with all session notices absent.

**Required correction/check:** compose actual warning content with independent results/look controls for no-prompt and pilot transitions, including all seven current rows and long copy at960/1280. Keep the secondary pilot explanation, every full warning/refusal, and the2.5/4 active-second/result reset contracts. Do not resolve this by trimming refusal text, dropping danger rows or changing their lifetimes. This blocks criteria1 and6.

## Eight-criterion assessment

| Criterion | Verdict | Independent evidence and boundary |
| --- | --- | --- |
| **1. Action outcomes** | **REQUEST CHANGES** | Transaction implementation and `experience-signals.test.ts:61–185` verify actual amounts/destination/capacity, consecutive identical pickup receipts/audio, no refusal collect sound, notebook-only source context, and panel-open suppression without saved-feedback mutation. Encounter tests18–208 and presentation tests1182–1324 retain independent full DOM results,2.5/4 active-second lifetimes, wall-time errors, cancellation/reset and panel-local feedback. Retained COMPOSE P2 shows two actual520Hz collect starts and exact8/16→16/16 receipts, separate from audible-mix proof. However SOL-EXP-R2-02 obscures the full independent refusal in actual production danger. |
| **2. Approach preview** | **ACCEPT** | Shared selection preserves executable reach<4 and presentation-only4≤distance<8; preview returns null when a reachable target wins and never feeds E/Q authority. `experience-signals.test.ts:186–260` covers exact boundaries, no discovery/mutation, LOS/own-host ignore, tie/opening/pilot/interior gates, unknown evidence/record labels. Renderer/targetCue retain one fogged, depth-tested light-core/dark-edge mesh, quiet preview emphasis and bounded disposal; lifecycle test154 exercises thousands of targets. Inspected historical COMPOSE P1 unknown-preview image/raw knowledge checkpoint has only prior C01, no C02/scans; it retains5005095 attribution. No new preview regression found. |
| **3. Cargo and fabrication** | **ACCEPT** | Current panels put Here before carried/native keyed Move, preserve one trim tradeoff, live-ownership Current craft grouping independently of first refusal, and truthful occupied/disabled/location/shortage reasons. Preparation tests73–421 plus presentation tests390–470,747–1063,1094–1206 preserve command/item/vessel identity, safe focus fallback, native disabled activation suppression, stale-enabled atomic refusal, explicit storage intent/departure/reset and paid salvage/rebuild. Inspected earned COMPOSE Store/Fit960 and paid-current-cradle images; raw P4 scope retains4 navigation/0 scrolls/5 commands/0 refusals/1 travel leg. Own current native full-notice Cargo audit and actual production Fabricate confirm real controls; the concurrent-save notice's visual obstruction is explicitly blocked under6, not accepted by this mechanical verdict. |
| **4. Hazards and calls** | **ACCEPT** | `EncounterPresentation` consumes explicitly supplied current rendered typed coverage; no prose classification or stale coverage cache. Tests verify uncovered recovery/release/persistence remain, real local write clears only obsolete persistence error, percentages do not cause accessibility chatter, copied emission origin and horizontal bearing/separate elevation,3-active-second call lifetime, actor/refuge/warning/release resets. Pulse cost remains25 and available contextually. Current555ac20 production call/save proof and own native full-notice960/1280 close ASTRA-EXP-R1-01. The new no-target overlap covers the result, not a dropped/deduplicated hazard; see1/6. |
| **5. Service and measured movement** | **ACCEPT** | `checkService` is read-only authoritative access in original precedence; fully serviced support remains visible independently of deficits. Current `observeThrust` requires active eligible powered Dart, current same-actor sample, requested>1e−5m, actual≤10% requested and solid loss≥80% deficit, with0.5 active seconds. Release/missing/invalid/progress/boundary/pause/session/actor resets and ascent precedence remain. Experience tests261–303,363–449, app864 onward and presentation1359–1382 distinguish real forward solid contact from tangent/coast/terrain/floor stops and require real rail context. Inspected actual P7 contact image, retained raw inputs and648/1128 replay results: aligned160 floor stops produce0 contact; separate off-centre194 qualifying steps reach threshold8856, DOM cue8860. I did not rerun those unchanged historical replays or claim a final off-centre active export. No physics/velocity/docking change found. |
| **6. Readable composed UI** | **REQUEST CHANGES** | Fonts retain≥12px actionable keys/secondary text and11px compact uppercase caption; the caption selector at hud.css56 closes the9px issue. Current tests/source preserve stable toolbar/capture, deliberate Resume, native navigation and persistence/graphics availability outside hidden HUD. Own actual native expanded-menu and panel-control rectangle audits go beyond checkVisibility; own trusted native Tab moves Return→Cargo without leaving the panel. Both exact R1 examples are clear. Nevertheless SOL-EXP-R2-01 and02 reproduce obscured actionable content in actual final production. Font sizes and checkVisibility cannot establish nonocclusion. Useful warnings/captions/helper restraint must survive the correction. |
| **7. Compatibility and invariants** | **ACCEPT** | Complete production diff adds transient notice summaries/preview/thrust observations and read-only query structure, with authorized feedback/copy changes. No saved schema/state field, recipe price, source yield, stock, handling parameter, collision rule or service mutation changed. Shared crafting block reasons retain command precedence; output/recovery/command previews clone before mutation. Current399 checks retain paid frame/capped-stock salvage/rebuild, full refusal atomicity, saved-feedback, save retry, air authority and panel/refuge/input/storage boundaries. ROOT-EXP-01 is closed by shared authoritative air labels with separate unlimited surface/refuge versus finite suit/emergency tests219–265; powered-craft precedence remains. The12 shared-test reconciliations preserve real behavior and valid prerequisites rather than merely revising markup assertions. |
| **8. Current evidence** | **ACCEPT** | Independently passed full checks/build/economies and27-file equality, verified original runtime/cwd/trees and all eight immutable archives. Own current-codec comparison of actual retained active exports002/003 proves complete state equality at18457,0 elapsed ticks, state SHA256 `251cbb4d5f18651e2e5bb23b1868bf1d70dc0c6146105809776b33fe268de5e7`. Independently recounted retained paid Dart6/3/2 with exact frame investment and pulse item_10 100→75, second cell unchanged100. Native focus/disabled/stale-command evidence is source-attributed and supplemented by current behavioral tests and focused actual production probes. Current failures are disclosed rather than concealed by those passing checks. Historical full-route/missing-stream/stale-journal limitations below are not promoted to new current play proof. |

## Evidence attribution, limits and nonblocking observations

All new reviewer outputs are [here](/tmp/siltwake-polish-1-experience-sol-r2/EVIDENCE-INDEX.md). Own immutable manifest [manifest.json](/tmp/siltwake-polish-1-experience-sol-r2/manifest.json) covers **173 payloads /19,159,333 bytes**, zero verification failures; SHA256 **`db822100be4a82dcc29ded57991368ac66e1e5df0606da8b4eaef9f66e94d764`**. It excludes itself/sidecar and this tracked report to avoid self-reference. Raw native/production traces, original-session tool snapshot, screenshots, seed, downloads, checks/build bytes, verifier and cleanup receipts are retained. T3 normalizes PNG output to1280×800 even for CSS960×600; viewport/rectangle JSON determines actual layout size.

Original immutable archives were read, never executed in place or modified:

| Archive | Payloads | Manifest SHA256 |
| --- | ---: | --- |
| S1 |444|`1e1c748a296e83b890ff30022455226b01f8411f27a438c8203be62e30bf9778`|
| S2a |198|`7970af6fbdd2c5172b83dcc267cd6af528dd47a2e08bb16a6cac76d0d29735ac`|
| S2b |220|`1ceecb6cb64225a2b0d0be57826a8f50da07d308d1b72d94996a9b010e4e0163`|
| COMPOSE |368|`42334db877ec81cd3d07cfa5ee6df50dbd95725965063ada4e626a608846d50c`|
| Caption |110|`e66c1d0fa7a6eab7d58e2351fbdcd172cf7c30d572d4c45e9dac2df17e2dc47d`|
| Call/layout |414|`bdc70f928d61646e499b1d361c0aafc1884bd87028d65764e273e11f8fb4a2a8`|
| Astra R1 |145|`ef5db6d6ac8349ec2ef642091477fab6e9ee3e3d9fb137d32a4c60fa1840abcd`|
| Sol R1 |167|`899ccb284c26a3178122187c5fbe5e9eeafffb62108a83d8c442d93d4bf84a93`|

S1 uses uppercase `MANIFEST.sha256`; initial JSON-manifest discovery did not find it, then the actual444-entry manifest was verified. No missing-evidence finding is based on that discovery mistake.

Historical COMPOSE P1–P8/export/replay proof retains **5005095** attribution, caption **f2e634a**. Current call/layout production is **555ac20**, byte-identical to candidate. Native transition/menu/panel focus receipts from **58cafc5** retain that intermediate attribution; inspecting its diff shows identical applicable grouping/menu rules, with final changes confined to playing hazard placement/width. Final production separately supplies pause/resume/export, and own final production probes exercise actual panel/input composition. Correction exports003/004 occur after call disengagement/severe recovery; they are not capture-time equality. My later screenshots likewise are not substituted for measured capture-time state.

The original gaps remain: S2a four lost final streams are not recreated; the quiet P6 release has live raw DOM/input proof but its stored journal remains9304; the off-centre P7 branch lacks a complete final active export, while its86 HUD samples/replay remain bounded proof. The aligned branch does have full export/replay equality across648 steps/47 samples,0 solid limitation and160 distinct floor stops. The extended P4 departure includes a mis-aimed E and ordinary reverse cruise; no quiet or fresh full-route claim. Earlier preflight/paused/invalid or wrongly timed captures remain excluded. No unchanged historical full route/recovery matrix was repeated.

Reviewer setup/preliminary probes also remain raw and explicitly excluded: initial blank-page404, wrong toolbar selector, repeated same-file selection without clearing input, wrong codec API invocation, and x100 severe staging that failed physical clearance. The verified x110 severe seed and `production-seven-warning-look-refusal-verified-960.*` are the positive proof; the earlier `...final-960.*` import attempt has no new result and is excluded. The initially pointer-locked seven-warning measurement is a zero-overlap negative control; its later evolving screenshot is not seven-warning capture proof. These are not additional game defects. The artifact index identifies preferred files unambiguously.

**Nonblocking:** broader menu/button audit did not show a general control overlap in the expanded960 menu; the ready-fabrication action is the specific proven failure. Native/automated focus, disabled-command suppression, storage intent and lifetime behavior remain sound in the reviewed cases. There is no request to expand the save/input API or alter warning copy to solve these layout defects. The existing bundle-size warning is unchanged.

**Human-test hypotheses/limits, not extra findings:** enjoyable preparation pacing, mouse feel, audible mix/localization, human play duration and representative dedicated-GPU performance still require their planned evidence. Oscillator/event counts do not establish audio quality, and software-rendered worker captures do not establish consumer performance. No new claim is made about ordinary severe-danger route frequency. Owner-required M2–M4 game content and fresh Opus review remain outstanding; this is the bounded stage1 correction gate.

## Resource cleanup and ownership

Read both `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md` before browser work. Used T3 preview status/open and **one owned incognito tab** `tab_3g_0430977b-1ed3-45f2-ac72-3683f9fe8942`, isolated storage and owned HTTP5192. A900ms page pulse maps to90 Linux CPU ticks in renderer **2085082**, UID1000 on **factory-worker**, with executable and Chrome/T3 ancestry retained in `browser-process-proof.json`. Ownership is not inferred from UA/loopback. Native pointer lock briefly succeeded in an isolated Linux negative control; no Windows/physical desktop cursor work occurred.

Before normal app-owned tab closure, retained/downloaded the2,079,999-byte production trace and verified exact bytes/hash/JSON (`preclosure-retention.json`); native trace and screenshots were already copied. Released all key down/up pairs and pointer lock, restored `Storage.prototype.setItem`, disconnected diagnostic observers and revoked the trace Blob URL. No pointer API was patched. `t3_preview_close` closed only the owned tab; final status has none. Owned server exec57412 stopped normally via Ctrl-C, exit0. [Cleanup receipt](/tmp/siltwake-polish-1-experience-sol-r2/cleanup-process-port.json) shows renderer gone, no5192 listener and successful exclusive plain bind/listen, while shared Chrome827911/T3 host811435 remain alive. No peer tab/host was acted on; no recording, watcher, child, relaunch/kill loop or running review check remains.

Only this assigned report is a tracked change; source/tests/config/evidence and original artifacts remain unchanged. This bounded review ends with the two P2 findings above for root reconciliation; no waiting for or sharing with the other R2 reviewer.
