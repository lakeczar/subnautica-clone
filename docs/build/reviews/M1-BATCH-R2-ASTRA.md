# M1 completion batches — independent Astra review, round 2

2026-10-17. Independent initial verdict on the frozen candidate; no current R2 peer findings or status were consulted.

| Named batch | Verdict | Blocking finding |
| --- | --- | --- |
| **M1 core/physical-feasibility** | **CHANGES REQUIRED** | **M1-ASTRA-R2-01, P2:** ordinary movement of the seeded carrier can put attached craft outside the world and prevent Save/Export. |
| **M1 first-expedition presentation** | **ACCEPT** | No remaining blocking presentation finding identified in this bounded review. The R1 cache lifecycle defect is resolved. |

All three distinct R1 findings are resolved on this candidate. The new core finding is an observed implementation defect, not an inference from missing evidence. These verdicts cover the two batches only. Accepted `game/siltwake` remains M0; separate integrated M1 verification and fresh paired review, M2–M4 and the later design critic remain required.

## Identity, authority and independence

Actual model **`gpt-6-astra`**, explicit **`xhigh`** reasoning, as identified by the T3 runtime. Fresh non-author T3-owned reviewer in `/home/worker/.t3/worktrees/subnautica-clone/t3-24e821a1`.

- Initial worktree was clean at exact candidate **`e0a7d0df81d1f29216a7b09daba70983381eb43a`**.
- Verified accepted-M0 base **`a2cb19f1d4cd2d795b82642a2bd357f681d1c293`** as the merge-base.
- All production bytes match combined source **`47d8872942e95120241af014e667084c75a54e39`**. The candidate differs only in seven documentation records. Verified again before writing this report.
- Read AGENTS/STATUS first, PLAN/CONTRACTS, authoritative `prompts/BUILD_GAME_REVISED.md`, M1-01/COORDINATION/PARALLEL, both complete batch briefs, settled map and historical tracker. Applied EXPEDITION_INTEGRATION, FLEET_AND_SURVIVAL, WORLD_PROGRESSION, STORY_DESIGN, GRAPHICS_PIPELINE and DELIVERY_AND_ACCEPTANCE. Checked early narrative against fixed canon without disclosing major spoilers.
- Read both original R1 reports, all dispositions, and boundary/cache and occupied-recovery author/root correction evidence. R2 controls the current candidate, scope interpretation and output. Historical R1 candidate/path/absence-of-prior-review statements are superseded.

No children/delegation, peer polling, production/test/config/spec edits, push, PR, merge or parent mutation. This report is the sole authored repository path. Original artifacts remained immutable; copied analyzers and inputs write only below `/tmp/siltwake-m1-batch-r2-astra/` and import this checkout's compiled modules.

## Checked scope and method

Reviewed the whole M1 delta since M0, including underlying M1/A0 assembly, focus/transfer, render/glass/cockpit, tow corrections, combined expedition/repeated-loss/carrier and CR1 saturation/guidance. Inspection was risk-weighted: all changed production subsystems, with focused test bodies and sampled decorative/CSS detail rather than an assertion that every line received equal scrutiny.

| Scope | Inspected paths and acceptance concerns |
| --- | --- |
| Content and gameplay | `src/content/registry.ts`; changed `src/sim/{types,state,step,inventory,progression,survival,vehicles,recovery,carrier,world}.ts`; economy checker. Both early orders, optional records, habitat sources, prerequisites/capacity/conservation, protected maintenance, finite survival resources, wildlife responses, physical recovery and carrier transactions/transforms. |
| Persistence and runtime | `src/save/{codec,foundation,validation}.ts`, existing repository/writer-lock authority, `src/runtime/{session,app,input}.ts`. Schema2/content expedition.2, actual-schema1 migration, ownership/geometry validation, immediate-command snapshots, interruption and atomic session/writer boundaries. |
| Presentation | Changed `src/render/{renderer,materials,atmosphere,ecology,environment,expedition,geometry,landmarks,palette}.ts`, `src/ui/view.ts`, `src/style.css`, `src/audio/sound.ts` and index. Shared apertures/collision, water/depth/air optics, hull-local camera, art lifecycle, narrative/source visibility, preparation/recovery guidance, focus/pause/feedback, audio origins and ownership. |
| Executable checks | App/session, command snapshot, expedition, carrier/clearance, hull, migration/save/simulation, presentation, sound-origin, occupied-recovery and actual render-factory lifecycle tests. Fresh focused production-rule and production-browser carrier checks; independent executions of copied correction analyzers. |

Initial pre-install check lacked `tsc`; after **`npm ci`**, independent **`npm run check` passed strict typecheck, 153/153 tests and production build**. Economy checker passed unchanged public spend **16 alloy / 11 glass / 13 membrane, 56 raw CU**. This arithmetic does not establish route balance. Built artifacts independently match coordinator hashes:

| Asset | SHA256 |
| --- | --- |
| `index-quvrvcD6.js` | `0ab8a47a1a93f03f122a648fdda7c10834a03e27b2575b52489b60fd464a4122` |
| `index-DONjl4IF.css` | `14756146fd5523913bc59b8079703e86ae867d0250079c88ed57e6198ab0a797` |

## M1-ASTRA-R2-01 — P2, blocking core: carrier movement can invalidate attached world poses

**Sources:** [world.ts:327](../../../src/sim/world.ts#L327), [step.ts:374](../../../src/sim/step.ts#L374), [carrier.ts:424](../../../src/sim/carrier.ts#L424), [validation.ts:29](../../../src/save/validation.ts#L29) and [validation.ts:316](../../../src/save/validation.ts#L316).

`moveCapsule` clamps the moving origin to WORLD_BOUNDS without reserving the hull extent. Piloted carrier movement uses this result; `updateBerth` then transforms attached local positions into world positions without constraining the resulting poses. Thus a legal carrier origin can produce illegal attached craft origins. Strict validation correctly rejects those vessel poses. This violates M1's explicitly included seeded carrier physical/persistence feasibility; it does not depend on campaign acquisition being implemented.

**Independent executable reproduction:** start the unmodified production `fixtureGame()`, take helm through `executeCommand`, ascend for 600 fixed steps, then use backward movement and level-look commands. No pose/inventory/damage/geometry injection is used. Tick 1680 is saveable; tick **1681** is the first rejected envelope. Carrier position is approximately `(65,-1.5,65.028571)`, while Dart is `(62,2.5,66.028571)` and Spindle `(68,2.5,66.028571)`. Both attached origins exceed **maxZ 66**. `carrier-boundary.mjs` asserts this transition and retains complete initial/last-valid/invalid states in `carrier-boundary-result.json`.

**Fresh actual production-browser confirmation:** opened the real menu's seeded carrier fixture, took helm, and used bounded keyboard events through production PlayerInput: Space to ascend, then S to back toward the southern edge. At **tick 2466**, carrier/player position is `(65,-0.9,66)` and the two attached craft are `(62,3.1,67)` and `(68,3.1,67)`. Actual manual **Save refuses and disables autosave; Export also refuses**, reporting invalid gameplay data. The previous valid journal at tick 1800 remains byte-identical. A temporary forwarding serialization observer captured the attempted envelope and was restored in `finally`; no game state or storage was assigned by the probe.

Moving inward with W for 160 active ticks and explicitly saving at **tick 2626** succeeds and re-enables autosave. The complete invalid browser state independently matches the actual tick 1800 journal plus 666 S steps; the complete recovered save independently matches 160 W steps from that invalid state. These comparisons use only JSON signed-zero normalization. The standalone and browser routes have different schedules; their states are not falsely equated.

**Player consequence:** routine carrier travel to an accessible boundary makes current progress unsaveable and unexportable. A good older journal is protected, but closing/reloading loses subsequent progress; automatic saving stays off until a successful explicit retry. There is no claim that invalid state overwrites the good journal.

**Recommended correction:** constrain carrier translation and orientation through the shared physical/world authority so attached craft and valid reachable interior positions remain within the saveable world. Preserve strict validation, identities, cargo and charge; do not clamp each attachment independently and break its local transform. Add regression coverage for loaded compact/medium configurations, edges/corners and non-cardinal headings, with immediate and moving-step persistence. The current passing path/obstruction tests do not cover this world-edge composition.

**Evidence:** `/tmp/siltwake-m1-batch-r2-astra/carrier-{boundary-result,browser-result,browser-recovered,browser-verification}.json`, `carrier-boundary.mjs`, `verify-browser-carrier.mjs` and actual [refusal screenshot](/tmp/siltwake-m1-batch-r2-astra/carrier-save-refusal.png). The browser run is fresh seeded feasibility testing, not an earned expedition. Its bounded evaluator timeout and premature-click timeout are recorded/excluded as automation events in the evidence README; subsequent paused snapshots, actual actions and complete-state replay establish the result.

## Disposition of every prior finding

| Prior finding | R2 disposition and evidence |
| --- | --- |
| **M1-ASTRA-R1-01, P1:** occupied tow separates pilot/hull; occupied salvage leaves dangling ownership | **RESOLVED.** Guards atomically refuse occupied tow/salvage. Valid legacy approach/ready/tow operations cancel once before movement/ready return. Paid patch/reserve, safe-exit checks, ordinary food/air drains and strict invalid-import rejection remain. Copied replay explicitly asserts **all 7** complete actual-export comparisons; independently passes **1237** swept/saveable tow steps and **1378** codec round trips, with identity/cargo/knowledge/protected-stock conservation and single legacy cancellation. Tests include exhausted emergency air and unsafe exit. Actual retained Hold/salvage media and focused UI tests support truthful availability/focus. The author's 113.816666666667 emergencyAir value is **seconds**, not percent. |
| **SOL-M1-01 / M1-ASTRA-R1-02, P2:** distraction target outside world blocks persistence | **RESOLVED.** Shared-bound ray clipping, numeric clamp and atomic zero-length outward refusal preserve validator strictness. All-edge command regressions pass. Independent copied harnesses reproduce valid boundary Save/Export/reload, half-expiry/expiry and unchanged interior 16 m / 12 s behavior; repeat refusal and warning/disengagement behavior remain. No unrelated threat reset. The retained east-edge evidence keeps its earlier source attribution; no fresh east route is claimed here. |
| **SOL-M1-02 / M1-ASTRA-R1-03, P2:** stale cache art survives New/import/null | **RESOLVED.** Absent IDs are disposed/deleted before current-cache updates, including null. Independently executed real-factory lifecycle probe removes the old earned cache on New/cache-free import/null. Production test covers reused/retained IDs, hidden empty caches, repeated replacement and shared material ownership without simulation mutation. Retained b201459 browser state/media corroborates actual lifecycle; its staged camera is diagnostic, not earned travel. |

These are independent checks of the assembled correction, not acceptance solely on the authors' assertions. `occupancy/` and `boundary-cache/` contain copied inputs/scripts and fresh outputs. Retained browser files remain attributed to their authors; rerunning their analyzers is not new browser play.

## Presentation assessment and retained full-batch evidence

Compared the selected richer-cel reef/scout study at 20711d1 with actual retained M1 art and gameplay images, and byte-verified the reference files against `origin/pr-assets`. Inspected render source 6ea44ce reef, laboratory, hunter and bay comparison; combined source 4d0a7f0 opening orientation, fabrication, cockpit warning, reloaded workshop and alternate island-first intake; combined seeded non-cardinal medium-berth view; correction occupancy and diagnostic cache views. Exact paths are in the evidence README.

The inspected views retain recognizable organic/mechanical silhouettes, distinct shallow/deep habitats, readable source/facility prompts and usable cockpit centre. Source and retained geometry/optical evidence support actual backing apertures, intact physical seals, opaque depth/water ordering, dry-volume subtraction and hull-local seat/yaw transforms. Render/session lifecycle and quality/context recovery were assessed with runtime source/tests and existing evidence, without claiming a newly repeated graphics matrix. Close collision captures and art-staging cameras were not treated as representative earned navigation or blanket art-quality proof.

Early records preserve both investigation orders, observation/hypothesis/source distinctions, regional leads and optional-note independence. No new premature reveal or canon contradiction was identified. Preparation quantities, accessible ingredients, transfer destinations, service/recovery/exit warnings and semantic command focus are supported by source and executable tests. The core carrier finding does not establish a separate renderer/UI defect: persistence refusal is surfaced, and the underlying invalid state must be prevented.

Local original audio activation/settings/mute/captions/pause/disposal and detached directional threat origins versus centred body/equipment cues are covered by source and passing lifecycle/origin tests. The muted host supplies no audible-mix verdict. No blocking presentation defect remains identified; further visual tuning is later polish, not an invented acceptance condition.

The retained full composed expedition, repeated-loss recovery and carrier runs remain **4d0a7f0** evidence. They support the New/opening→C01–C04→preparation→Dart/useful cargo→return/store/service/reload chain, alternate order, repeated caches/paid physical recovery and seeded F0–F3 transactions. CR1 source 20451a8 supplies the later damage-saturation/guidance correction. Boundary/cache source b201459 and occupancy source d99aa649 supply targeted corrections; fresh checks here use combined 47d8872 production at candidate e0a7d0d. No old full route is relabelled as fresh final-source play.

## Remaining proof limits and judgment

| Limit | Review judgment |
| --- | --- |
| Final combined source has focused correction replays, not another full preparation/repeated-loss/carrier matrix. | Source, current checks and focused exact comparisons support this bounded review. Separate integrated M1 run/review remains necessary. |
| One walking/boarding reconstruction is non-exact; an older pitch save is stale. | Both remain excluded from exact persistence proof. Separately retained actual camera/saves and exact egress/depth rows remain distinct. No arbitrary field omissions waive discrepancies. |
| Ordinary geometric blocked construction was preempted by the existing-hull guard; thin carrier throat blockers are diagnostics. | Detached production-world geometry and actual craft obstruction provide useful complementary coverage. No additional missing-proof blocker is inferred, and no unavailable player solid-placement tool is demanded. This does not waive the freshly observed boundary defect. |
| Ordinary healthy-battery depletion was not run to zero. | **OPEN for integrated M1.** Consumption tests and zero-power diagnostics do not satisfy ordinary depleted-power runtime proof. No failure is invented and no hours-long run is claimed. |
| Seeded carrier and pod fallback; bounded shallow recovery. | Not campaign carrier acquisition, registered mobile-refuge fallback or full advanced-fleet/deep recovery. Designated mobile refuge and M2–M4/six-fleet/campaign obligations remain. |
| Partial/excluded clips, close geometry and staged art cameras. | Only actually inspected artifacts support the stated claims. Filenames alone establish neither completed actions nor art quality. |
| SwiftShader/muted host and agent-guided inputs. | No consumer-GPU performance, audible mix, human learning/enjoyment or ten-hour duration proof. Large-bundle warning and existing low development-dependency advisory remain disclosed, nonblocking issues here. |

No additional missing-required-proof blocker is asserted beyond the explicit open integrated-M1 line. This is not integrated milestone, release or deployment acceptance.

## Evidence integrity and resource closure

Independently recomputed seven original archive hashes. For the two correction archives, also checked unique safe regular members, every archive/local byte and captured sources against their author Git commits: boundary/cache **77 files including manifest, 13 source snapshots** at b201459; occupancy **152 files including manifest, 56 source snapshots** at d99aa649. Older full-route archives were hash-checked this round; their every payload was not independently reverified again. Details: `artifact-verification.json` and its verifier.

| Original archive | SHA256 |
| --- | --- |
| `/tmp/siltwake-m1-batch-r1-sol-fix/artifacts.tar.gz` | `a3e125b45dedb2d50f097772b18b7c60b4d6414788711078221b27ccc9457ee6` |
| `/tmp/siltwake-m1-batch-r1-occupancy-fix/occupancy-fix-artifacts.tar.gz` | `19c21627446d9fcf0d9710bb6a66bad2a726ddf36a9f093711297cc6d18a9040` |
| `/tmp/siltwake-m1-combined-expedition-artifacts.tar.gz` | `a9f1c598f7dcf131a5133339439ad7c2d39b3c0605b42fd8707a755e341163f8` |
| `/tmp/siltwake-m1-combined-recovery-artifacts.tar.gz` | `af7503a802f1ba4159b25f6770cdef3c45f4363832b4786191e62685c2ac8abf` |
| `/tmp/siltwake-m1-combined-carrier/M1-COMBINED-CARRIER-artifacts.tar.gz` | `40967b3044db4017d6a9715b911e3520692337cad4fa357ea3fd29e7235a0819` |
| `/tmp/siltwake-m1-render-artifacts.tar.gz` | `81d8030fa27c801f2f35784b8abfae04e5ebf60a76f3bd9916bc9575179e6f4c` |
| `/tmp/siltwake-m1-cr1-fix-artifacts.tar.gz` | `335120dcea0818ed9000381c9602f32b3965886ac0acaadfd72516e2de49e2dd` |

Fresh evidence: [README](/tmp/siltwake-m1-batch-r2-astra/README.md), [portable archive](/tmp/siltwake-m1-batch-r2-astra/review-artifacts.tar.gz), **764111 bytes, 113 payloads plus manifest**, SHA256 **`0df5198d6fce446b7ece6f332d43eb3c1b733b057b297f93a9bb8b09e41689b9`**. Manifest SHA256 **`5a11b79dcf1755e12dae3814079b7588515e1b1425a07c545e4fa6dd5d499577`**. Refusal screenshot SHA256 **`a854eda0af5792b11d1af6f76451d635d20e51cee971ee759b825a80debe0b23`**. Complete browser comparison result SHA256 **`9a63f9a03235247f96ccf155ea8d039cb9b954aa6b2b7884cbd595e967ab4e94`**.

Both fleet and repository browser rules were read before browser use. Verified factory-worker Linux and actual Linux Chrome-headless-shell PID 827911 under T3 serve 811435, using the host's muted audio. T3 preview_status→preview_open, checked-free port **5195**, one task-owned incognito tab; WebGL2 ANGLE Vulkan SwiftShader Subzero, Chrome 154, Rich 1280×800 CSS / DPR 2. No Windows automation, desktop pointer capture or pointer lock.

Owned tab **`tab_28_0430977b-1ed3-45f2-ac72-3683f9fe8942`** closed normally through T3. Owned preview exec **56394** stopped with Ctrl-C, exit 130; **5195 verified free**. All keys released; no live controller, recording or owned browser/server remains. Historical tab 14 and human/peer/shared resources were preserved. `closure.json` records closure. This bounded independent review ends at report handoff; root owns reconciliation and any fresh paired round.
