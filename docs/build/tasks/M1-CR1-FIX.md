# M1 CR-1 — keep disabled-hull damage saveable

Bounded Sol 6.1 max implementation under root Astra xhigh. This corrects a reproduced ordinary-gameplay save blocker, not a new fleet feature. Only root dispatches. No children, peer polling/waiting, parent mutation, push, PR or merge.

## Baseline, ownership and constraints

Start from the committed parent in the delegation, which preserves combined production `4d0a7f00e939f5535020ddf674fadee39f5e6bd4` and the completed combined RECOVERY/CARRIER evidence. Verify clean HEAD and exact parent before editing. Read AGENTS/STATUS first, PLAN/CONTRACTS, `prompts/BUILD_GAME_REVISED.md`, relevant survival/recovery/persistence requirements in EXPEDITION_INTEGRATION, FLEET_AND_SURVIVAL and DELIVERY_AND_ACCEPTANCE, plus the combined recovery report and root disposition. Other specifications remain unchanged.

Exclusive write ownership: **`src/sim/survival.ts`, `tests/expedition.test.ts`, and `docs/build/evidence/M1-CR1-FIX.md`**. Root's EXP-2 addendum below additionally grants only two narrow direction-copy edits in `src/ui/view.ts` and `src/sim/progression.ts`; every other part of those files stays read-only. Inspect other source read-only. If a necessary correction crosses this boundary, send root the exact path/change/reason before editing it. Root owns all contracts/records and integration. No codec/schema migration, runtime/UI/render, geometry/content/economy or unrelated refactor. Preserve strict validation; do not make negative hull health acceptable or silently repair imported state.

EXPEDITION continues read-only validation of its original `e3ed566`/`4d0a7f0` baseline. Do not copy moving peer source or wait for its output. Your browser port is **5193**, after checking it is free. Use `/tmp/siltwake-m1-cr1-fix/` for new artifacts, preserving every earlier archive/save.

## Reproduced defect

[Combined recovery report](../evidence/M1-COMBINED-RECOVERY.md) records ordinary upper-Canopy piloting/collision and hunter pursuit. `updateThreat` subtracts hull health even after the hull is disabled; `updateSurvival` only invokes zero-health normalization on the first disable. Continued damage makes the live state invalid. Save/Export refuse it and autosave stops, although the prior valid journal survives. Pressure/Spindle depth damage in the same file also subtracts from an already disabled controlled hull; cover this same invariant rather than patching only the observed hunter line.

Actual reproducer:

- `/tmp/siltwake-m1-combined-recovery/saves/last-valid-before-negative-health.json`, tick24887, Dart29.009484246247204 health, SHA256 `1a41b5bf623473478b2e5c3346164eac51dd72ffbf82009fdc4db64ac6efbdc8`.
- Recorded ordinary inputs: `traces/033-upper-rib-retreat.json` and `034-upper-rib-retreat.json` in that directory. Thirty gameplay key edges, quiet turn/up/forward; author `analyze.ts` reconstructs them with real `stepGame` and current world queries.
- Root repeated the complete analyzer against current combined compiled modules: first invalid tick25029, health−0.2; tick25111 health−16.599999999999973, matching the reported rounded−17% HUD and identical codec refusal. Root results `/tmp/siltwake-m1-combined-recovery-root/analysis.json` and `analysis-current.log`.
- Actual invalid state could not be exported. `diagnostics/negative-health-derived-INVALID.json` is explicitly a simulator-derived diagnostic, never an actual browser export. Use the unmodified valid save for gameplay reproduction.
- Author capture02 shows−23%/disabled cockpit and refusal; trace035/036 preserve Save/Export failures. Capture01 shows autosave-off menu rather than the complete refusal text. Preserve this distinction in evidence.

The successfully completed alternate route does not clear CR-1. Its tow, patch, departure, repeated caches and final service/reload remain useful attributed evidence.

## Required correction and checks

1. Keep finite hull health within its valid range during continued hunter/pressure damage, including after disablement. Preserve meaningful damage before disablement, exactly one retained loss identity and sensible disable notice behavior. Do not grant repair, power, extra emergency air, invulnerability before disablement, or change pursuit/cover/distraction tuning.
2. Add meaningful regression coverage through production `stepGame`/codec: first disable followed by repeated hostile damage; already-disabled pressure exposure including the surface-only hull; save round-trip while disabled; retained hull/hold/modules/loss/cargo/knowledge; emergency-air countdown still progresses. Establish the failing baseline before correction. Prefer focused production-boundary cases over tests of a clamp implementation. Keep fixtures minimal; the retained ordinary input replay can remain an external artifact.
3. Replay the exact retained valid save/key schedule on corrected source, check every resulting state is saveable and loss/disable behavior does not repeat incorrectly. Confirm the same damage failure remains recoverable. Keep original and corrected outputs separately attributable.
4. Run appropriate focused tests, then **one `npm run check`** on final source. Record exact source SHA, JS/CSS hashes and source/build provenance. No unchanged broad carrier/GLSL/geometry matrix or fresh long preparation rerun.
5. In actual final production, import the unmodified valid checkpoint using UI, repeat the bounded ordinary damage situation, and retain captures/logged inputs. Confirm the hull remains disabled at0 while emergency air declines; manually Save and Export successfully, then actual reload/Continue preserves the full state (account for exact elapsed no-input ticks). Perform ordinary protected exit and confirm the same disabled hull/loss remains available; retain saveability after exit. Use the prior guidance for local recovery; a bounded existing earned tow/paid-patch/board replay may corroborate compatibility, but do not repeat the entire multi-loss route unless the change creates a specific concern. No browser state setter or importing the derived invalid state as gameplay proof.

The final browser result must identify transient save status versus settled commit/export; do not use the earlier250ms stale-journal helper. Flush complete input/button records before reload. Distinguish actual gameplay, original earned preparation and diagnostics. The previous 18 full-state/17 command comparisons are attributed to `4d0a7f0`; a changed script should intentionally separate the now-fixed negative-health assertion, never silently discard it.

## Browser isolation and handoff

Before any browser/preview/screenshot/test read `/work/repos/fleet/BROWSER_RULES.md` when available and `docs/BROWSER_RULES.md`. Use existing artifacts/APIs when sufficient. Verify factory-worker/isolated Linux owns the actual browser process; never automate the owner's Windows desktop or silently switch to it. Prefer T3 preview_status then preview_open, one task-owned incognito context and isolated storage on checked-free5193. Preserve historical tab14 and all shared/user/peer tabs, hosts, servers and artifacts. No process-name kills or desktop cursor capture. Keep controllers/recordings bounded below tool timeouts; stop and identify any trapped/excessive resource rather than relaunching blindly. Close only owned resources via their normal lifecycle. Record SwiftShader/muted-audio limits honestly.

Return source and evidence commits, exact changed paths, checks, before/after defect result, immutable artifact manifest/archive, actual screenshots/recordings, retained valid saves, complete action logs, conservation/save comparisons and closed-resource record. Stop after bounded handoff. No acceptance claim: root will inspect/assemble, reconcile any approved interface change, freeze complete evidence, and send both named batches to fresh non-author Astra xhigh and Sol max before separate integrated M1 review.


## Root addendum: completed EXPEDITION and EXP-2

EXPEDITION has now completed; no other source/validation worker remains active. Read its [root disposition](../evidence/M1-COMBINED-EXPEDITION-INTEGRATION.md) and author report (also available in `/home/worker/.t3/worktrees/subnautica-clone/t3-976b170f/docs/build/evidence/`). Keep your original committed source baseline; no production changes need copying. EXP-1 is another actual hunter-damage failure during a depth-test extension, stopped before150m. Its valid imported checkpoint/raw observed rejected-export clone and complete inputs are in `/tmp/siltwake-m1-combined-expedition/`. Use it as supplemental evidence; do not repeat full preparation. A bounded corrected-source deep suit-exit refusal/safe-exit replay is useful if practical.

Root explicitly expands ownership for **EXP-2 only**: in `src/ui/view.ts`, change the launch-cradle hint's north to south, matching successful+Z departure and the existing compass. In `src/sim/progression.ts`, change only the voluntary Canopy return hint's “clear north flank” to “clear upper flank”; island/homeward is+Z under the current convention. No compass math, hint gating, content registry/provenance, controls, source geometry or other UI/progression changes. These paths have no active owner. Check actual visible cradle guidance and ordinary egress using an unmodified earned built-Dart checkpoint; preserve attribution and exact camera/control observations. This low-impact copy correction does not need string-mirroring tests or a second broad suite. Include its two changed literals and verification in your existing evidence and final check.
