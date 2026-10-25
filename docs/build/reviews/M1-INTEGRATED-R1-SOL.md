# M1 final correction and integrated milestone — independent Sol review R1

**M1-FINAL-PLAY correction/evidence batch: ACCEPT.**

**Integrated M1 first complete expedition: ACCEPT.**

Both verdicts apply to frozen candidate **`1caa05f1e790a18edacbd3fce236763e48725c2f`**. No blocking implementation, composition, required-evidence or scope defect was found. The integrated verdict follows the complete M1-01 scope and the checks below; it is not inferred from the earlier component passes. This is one independent reviewer’s decision. Root must reconcile the fresh pair before recording milestone acceptance. M2–M4 and the documented human/hardware limits remain open.

## Identity, authority and independence

| Item | Verified value |
| --- | --- |
| Initial HEAD / report parent | `1caa05f1e790a18edacbd3fce236763e48725c2f`, full clean worktree before review |
| Production assembly | `a5821aa8f3d88045669190a720ccb5765c1acef2` |
| Final source / evidence | `84fb7e86c9a6144bd4c1936b2451ea513f9fb010` / `5e67fdf0b24056249a039f3ce446f0363db6e86d` |
| Integrated diff base / merge-base | `a2cb19f1d4cd2d795b82642a2bd357f681d1c293` |
| Correction diff base / merge-base | `fd5b90c5aa5e41bf192287607ea92ab77d795fa4` |
| Runtime | **codex / gpt-6.1-sol / max**, verified in this review’s own Codex `turn_context`; also confirmed by the injected T3 runtime information |
| Own checkout / branch | `/home/worker/.t3/worktrees/subnautica-clone/t3-6ae401bc` / `t3/review-m1-integrated-sol` |
| Authoritative input | `prompts/BUILD_GAME_REVISED.md`, Git blob `0f8a548bc5a563c511ea46bfb7020a5493c3391b`, SHA256 `c939fa258807c17c710b627afabf96ada833f679dcb15630193e4a9933b717ba` |
| Review artifacts | `/tmp/siltwake-m1-integrated-r1-sol/` |

Candidate production, tests, scripts and package/configuration bytes agree with the production assembly. Since the correction base, the only production change is eleven CSS additions to `#pulse-summary:not(:empty)`; the other changes are build/evidence records. The complete integrated diff, including shared dependencies, was assessed separately.

Read AGENTS/STATUS first, then PLAN/CONTRACTS/PLAYTEST, revised input and specification pointers, settled map/tracker, EXPEDITION_INTEGRATION, WORLD_PROGRESSION, FLEET_AND_SURVIVAL, STORY_DESIGN, GRAPHICS_PIPELINE and DELIVERY_AND_ACCEPTANCE. Read protected NARRATIVE_CANON before judging the early mystery. Read M1-01, the supplied final-play assignment, M1-PLAY direction/core/presentation and review briefs, R4 brief, corresponding paired records/full reports, relevant earlier findings/dispositions and author/root evidence. Historical ownership labels were not treated as current assignments. No spoiler appendix was needed.

This was a fresh non-author review. No current-peer report was read, no peer was contacted or polled, and no children were delegated. The code-review skill’s standards/spec lenses were applied within this review; the task’s explicit prohibition on children overrides its delegation workflow. No candidate source/test/config/spec was edited. The catalog’s composer option default was not mistaken for actual reasoning effort; the own-turn runtime record is retained in `runtime-check.json`.

## Fresh checks and independent executable inspection

Fresh `npm ci`, `npm run check` and `node scripts/check-m1-economy.mjs` pass: **210 tests, strict typecheck and production build**. The checker reconciles the runtime registry with the declared economy changes and exercises staged transactions/capacities; its coordinate staging is not ordinary route evidence. Existing large-chunk warning and low dependency advisory remain disclosed.

The freshly built, actually played final artifacts match:

- `index-DfpByBNx.js`: `378f5a61631e713fb02ee45d240a3106fb444262e7c4ddca82598ef3965be6e4`.
- `index-DkgOXgik.css`: `e4e1476503f3931a2009dbae1fcae57a46dcafdad79ba1e7e319b41afca39c97`.

Own probes import the freshly compiled current production modules and read immutable actual exports/logs. No retained output-writing analyzer was executed in place.

| Independent check | Result and practical limit |
| --- | --- |
| Final artifact integrity | All **576 payloads**, **577 safe unique regular archive members**, all 27 production files and 32 compiled modules match. Archive SHA256 `e3ec34c8a929d7af60a68a2550df68f7856076dc964ad87f78bf31de443112e1`; manifest SHA256 `cdd0a72c716e80ef8252f2218a0b70fea85c01d443304f6b988007b46f7de77f`. Original input copies also match their sources. |
| Final controls and persistence | **210 runs / 3,481 events**, raw events equal durable ledger, every flush releases held inputs. 1,100 downs / 1,103 ups include exactly three redundant safety releases in run016. All **192 saves / 420 journal copies** decode and round-trip unchanged. |
| Final complete reloads | Actual A/B/C endpoints equal current `stepGame` after **44 / 47 / 29** elapsed ticks. Complete persisted state is compared, with no fields omitted; only normal JSON signed-zero serialization is normalized. Session/creation identity is retained. |
| Final payments/recovery | Six actual full-state transactions reproduce, including reserve, cargo take/return, tow initiation and paid patch. Current tow completes after 751 update steps, remains valid throughout and emits one completion. |
| Command boundaries | **12,459** command attempts over actual current checkpoints: 1,324 successes remain immediately saveable; 11,135 refusals preserve the full input. This is a targeted invariant sweep, not exhaustive state-space coverage. |
| Current full-route evidence | Verified 539 indexed manifest payloads, all 32 compiled modules equal current modules, **303 runs / 2,988 events**, balanced 1,308 down/up pairs and released flushes. All 54 saves remain unchanged/current-valid; actual second-session state equals **64** no-input ticks with no omitted fields. Actual warning-pulse payment also reproduces exactly. |
| Retained recovery/carrier | Verified 554 recovery and 327 carrier manifest payloads. Current modules reproduce **11 recovery and 13 carrier complete-state elapsed intervals**, including the second actual player incapacity, lock reloads and exactly-once detachment. All 79 named carrier saves validate. Seventeen historical recovery transactions match gameplay state: 15 are wholly unchanged; patch/service require the two explicitly recorded authorized feedback-text substitutions. These are not claimed as byte-identical historical command results. |

The retained-check harness performs 233 envelope validations without state relocation/normalization. Its historical text adjustments are explicit in `integrated-retained.json`; all actual current reload comparisons remain complete. Initial reviewer setup errors (the old probe’s residual-velocity assumption, a misnamed notebook field and the two cross-version text expectations) remain in own logs. The initial economy invocation preceded compilation and was rerun after its prerequisite; none is presented as a candidate failure.

## Correction/evidence verdict basis

**Contrast:** personally inspected all eight matched bright-cockpit/dark-water before/final images and staging metadata. The compact dark backing makes the pulse-cost hint readable at 1920×1080 CSS and 1280×800 narrow desktop, without visible overlap. `:not(:empty)` avoids an empty backed patch; UI still supplies the original text. These are paused appearance comparisons with old CSS/menu visibility staged, not additional gameplay. DPR2/Light and T3’s downscaled 1280×720 output for 1080 CSS are retained accurately. The adjacent guidance limitation below is not claimed fixed.

**A, healthy exhaustion:** imported byte-identical earned source-0aaf60e progress, ordinary local preflight service and about 534.9 simulation seconds of actual movement produce charge **0**, hull **100**, `disabled=false`. Actual occupied emergency air falls 119.1333→116.45→113.6333 seconds. Replayed W attempts yield residual coast of 0.237193 m then 0.000108 m, not powered propulsion. Safe exit, empty reboard refusal, local cargo access and original hull/hold/module/item identities survive. Cell `item_10` pays 100→0 for 35 hull-power points; cell11 remains full, with no health/air reset. The small later rail collision is retained. Safe return and actual reload pass.

**B, fresh no-charge warning:** original input begins disengaging; ordinary navigation/time reaches natural idle at33043, **new warn at33116**, live G refusal at33122, quiet disengagement at33388 and safe return at35960. Carried cell10 remains0; full workshop cell11 is remote and never pays. Run139’s live error and command replay establish refusal; the saved historical pulse-success feedback does not. No pulse/recharge/service/reserve/repair/transfer is smuggled into the response. Actual elapsed reload, including coast/power drain, passes.

**C, installed trim:** actual collision disables the earned Dart at28211 near70 m, charge89.1694 and finite air; this is **not player incapacity**. Safe exit, local Bobbin tow and paid patch retain `dart_17`, its hold, installed `item_20`, cargo and investment. Tow gives no health/power/air/stock gift and retains the loss until recovery. Patch spends two alloy/one membrane (14/0/7→12/0/6), restores65 hull and increments boundRepairs once; inventory and battery remain unchanged. The same trim reaches4.1994985 m/s quiet propulsion, returns and survives actual reload. Zero player failures and two rescue actions are reported honestly.

Inspected actual warning, zero-power, disable/tow/recovered-trim frames and native opening/pause pixels. The helper/wrapper emits existing keys/DOM controls and reads HUD/journal state; earned runs contain no simulation setters, cargo/charge grants, teleport or time scaling. A/B/C close the previously open focused ordinary-play gaps.

## Integrated M1 verdict basis

| Required composed behavior | Assessment |
| --- | --- |
| Opening, investigation, expedition and second session | Actual current source-0aaf60e New→four-step opening→C01–C04→habitat gathering/fabrication→Dart/Canopy→4 crust +4 resin→workshop storage/trim→second quiet approach→return/reload is supported by inspected controls, actual saves/media and the current-module comparisons. Skip/pause and alternate early preparation are separately evidenced. Early text retains observation/hypothesis/provenance and ambiguity; optional note is absent without locking facilities/crafting. Notebook/menu truthfully call Basin/further campaign unfinished. |
| Both early orders | Current main is reef-first. The current bounded early branch ends with **C01/C03 only**, hand food and pre-vehicle recharge; it must not be described as having subsequently collected C02. The completed alternate C03→C02 proof is the retained **4d0a7f0** island branch: C03 tick1254, C02 tick2198, endpoint2204, no optional note. Checked actual files/hashes and current decode validity, plus current order-independence rules/tests. |
| Stock, capacities, preparation and return value | One typed runtime registry is authoritative; proposal JSON is checker reference. Actual source bundles/stock, guarded local bench/cradle inputs and explicit bulk/individual transfers compose with the recipe graph. First conservative return minima **85.083333% oxygen /92.482269% power**, hull100, exceed25%. The earlier shelf collision/preflight service and later missed boarding/77.583333% whole-main oxygen are retained; the whole run was not damage-free. Trim has a useful quiet-speed benefit and explicit boost/socket/2 CU cost. Remote spending, duplication and silent old-save rebilling are guarded. |
| Survival, ecology and loss | Personal pressure/airway and hull-depth references remain simulation authority, distinct from interpolated camera height;150 m suit versus180 m Dart and safe egress remain enforced. Earlier actual deep-exit extension is attributed to CORE, not the failed combined extension. Food has no thirst/decay, hand food and emergency empty-hold recovery remain available, and blocking UI freezes drains. Visible source/ecology relations and actual hunter warning/pulse/quiet retreat support implemented behavior without claiming responsive ecosystem simulation. |
| Actual player failure and repeated recovery | The retained ordinary source4d0a7f0 recovery continuation has **two player incapacities**, two persistent identified caches, return to a valid fed refuge, retained knowledge/tools/hull/cargo, local tow/paid patch, retrieval of both caches and reload. Personally inspected the incapacity/cache/refuge media; current replay exactly reproduces the second48-tick failure/refuge interval and relevant transactions. Subsequent health/occupancy/cache/tow corrections remain verified. New C adds installed-trim recovery; it does not replace that repeated-player-failure evidence. |
| Physics and carrier feasibility | Shared geometry/sweeps, narrow collisions, waterline/ramp transitions, boarding/clearance and old placement are covered by actual retained routes plus current regressions/source inspection. The explicitly seeded production-state compact/medium carrier demonstrates stationary walking, independent dry Spindle while Dart launches, surface-only Spindle, empty supported reconfiguration, capture/launch locks, real craft obstruction/atomic refusal, interruption/reload and M1 pod fallback. Personally inspected passage/panes/prepared-panel media and reproduced current transition states. Seeded fallback is not earned carrier acquisition or registered mobile-home refuge proof. Geometric construction/thin-throat fixtures remain labelled diagnostics. |
| Presentation/runtime composition | Inspected actual composed opening/helm/Canopy/lab at06927d5, source-attributed4d0a7f0 expedition/recovery/carrier views, current0aaf60e notebook/storage/trim/narrow views and final84fb7e8 contrast/transitions. Richer-cel landmarks, original habitat/craft silhouettes, clear apertures and actual cockpit support interaction scale/navigation. Source/test sampling covers optical/air authority, cache/hull lifecycle, command focus, simultaneous warnings/captions-off, unsaved Export, audio activation/settings/origins and graphics recovery. No new blocker was visible. |
| Persistent shared state | Current schema2 / expedition.3 validation, validated foundation.1/expedition.2 reads, safe checked legacy landing or atomic refusal, exact metadata/journal preservation, stable inventory/fleet/berth/operation IDs and installed items compose with session replacement/pause/save authority. Current actual exports and complete reloads support this beyond isolated rule fixtures. UI previews reuse command eligibility; module references retain ordinary item/container ownership. |

This assessment includes current registry, inventory/progression/modules, movement/world/vehicles, survival/recovery/carrier, codec/validation and app/session/input boundaries, with UI/render/audio and relevant regression sampling. The fresh suite contains real app/session composition and production render-factory lifecycle tests as well as labelled rule fixtures. It is not an assertion that every possible save/input sequence was exhaustively tested.

## Prior findings and residual finding

| Prior finding | Current disposition |
| --- | --- |
| SOL-M1-01 / M1-ASTRA-R1-02 pulse bounds | **Closed.** Clipped in-world target and atomic outward/active refusals retained; current boundary/repeat tests pass. Payment happens only after eligibility. |
| SOL-M1-02 / M1-ASTRA-R1-03 stale cache art | **Closed.** Actual factory reconciles/disposes absent IDs and preserves shared material; fresh lifecycle test passes, alongside retained actual replacement evidence. |
| M1-ASTRA-R1-01 occupied recovery | **Closed.** New occupied tow/salvage refuse before mutation; legacy operations cancel before movement. Current occupied checkpoint probes and regressions pass without free service or forced unsafe exit. |
| M1-ASTRA-R2-01 carrier travel / ROOT-CB-01 exact yaw | **Closed.** Strict origin/proxy bounds and exact endpoint/arc checks remain; retained transition replays and current edge/corner/yaw regressions pass. No bounds relaxation. |
| M1-ASTRA-R3-01 / SOL-M1-R3-01 legacy landing | **Closed.** Decoder reuses checked dry entry, validates result or refuses; current exact-case migration/session regressions pass. The expedition.3 guard retains the correction. |
| SOL-M1-R4-01 backup notice | **Closed.** New/exactly known old messages are truthful; arbitrary feedback and repository generation policy remain unchanged. |
| ASTRA-M1-PLAY-R1-01 pulse-hint contrast | **Closed for its assigned hint.** Actual matched pixels, metadata and bounded CSS support closure. Adjacent guidance is assessed below. |
| Negative disabled health, tow completion and semantic focus | **Remain corrected.** Current damage saturation/saveability, one-shot completion and stable command-focus tests pass; final actual disable/recovery snapshots stay valid. |

**SOL-M1-INTEGRATED-R1-01 — P3, high confidence, nonblocking: secondary guidance still loses contrast over the bright cockpit.** Source: `src/style.css:516`/`:521`, routine `.explore-note` text; actual final `media/pulse-bright-final-1080.png`, `pulse-bright-final-narrow-matched.png` and `b-fresh-no-charge-warning.png`. Reproduce at the indexed bright earned Dart pose in1920×1080 CSS or1280×800: the pale context/movement lines blend with the console while the newly backed pulse remains readable. This can make secondary reminders harder to read. Critical hazard/exit/pulse layers and paused controls/preparation remain readable and the route is supported, so it does not block either scope. Recommendation: a later bounded contrast pass for these routine lines, checking both bright console and dark water without overlap. This is the explicitly disclosed adjacent limitation, not a claim that the old pulse finding remains open.

No other new actionable defect was established. Small distant roof stippling and broader art/learning/route-friction questions retain their previously disclosed polish or human-test status.

## Evidence limits and cleanup

No fresh reviewer browser route, blind human play, audible-mix judgment, dedicated-GPU performance, human learning/enjoyment/surprise or duration pass is claimed. The ordinary route/media are author observations with explicit sources; my fresh work is source/check/artifact inspection and independent current-module execution. SwiftShader, muted/no-audio recordings and guided controls do not establish those external criteria. No repeated unchanged eleven-scene/optics/carrier matrix was necessary for an identified risk. Existing views and regression coverage do not waive later performance or campaign gates.

Both browser-rule files were read. No browser, preview, tab, storage, pointer lock, controller, recording or server was opened by this reviewer; retained pixels were viewed as local files. Historical tab14 and all human/peer/shared resources were untouched. **Port5196 exclusive bind passed** and the socket was closed; `cleanup.json` records it. Own command sessions have completed. Only this assigned report is committed; no production/test/config/spec edits, children, peer waiters, push, PR or merge. Root owns reconciliation and any subsequent corrections.

Reproduction files under the own temp directory: `verify-artifacts.py`/`artifact-verification.json`, `independent-state.mjs`/`.json`, `verify-retained.py`/`retained-artifact-verification.json`, `integrated-retained.mjs`/`.json`, `check.log`, `economy.log`, preserved initial diagnostic logs and `runtime-check.json`. Run Node probes from this checkout after `npm test`; they import `.test-build/src` and write only the own temp directory. Originals remain immutable.
