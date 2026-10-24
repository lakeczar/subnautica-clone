# M1 completion batches — independent review round1

Both reviewers receive the **same frozen candidate SHA in their delegation**. Production is assembled at `83a577b6afe7f16c74bfe63322c4890fec8a9995` and matches final author source `20451a8dafd014012986e0c8aa1e60df0da7ff25`; subsequent candidate changes are records/this brief only. **Diff base: accepted M0 `a2cb19f1d4cd2d795b82642a2bd357f681d1c293`**. Review the whole M1 source/test/runtime delta since that base, not only the latest five-line correction. Root inspection is additional; no source/evidence author counts as an independent reviewer.

Review both named batches independently, with a separate explicit verdict for each:

1. **M1 core/physical-feasibility:** all delivered gameplay, registry/economy, shared physics/carrier, survival/recovery, state/save/migration and runtime integration.
2. **M1 first-expedition presentation:** all delivered richer-cel environments/assets/optics/camera, early narrative/notebook/UI, controls/focus/feedback and audio, including their interaction with gameplay.

This is **batch review**, not integrated M1 acceptance. Accepted `game/siltwake` remains M0-only; a separate integration/verification/fresh paired review follows if both batches pass. M2–M4/full campaign obligations remain. The later dedicated Astra game-design critic is separate and not being requested here.

## Roles, independence and read-only ownership

- Fresh **Astra `gpt-6-astra`, xhigh**: full scope, emphasizing dependencies, player-facing behavior/readability and cross-system correctness. Sole report path `docs/build/reviews/M1-BATCH-R1-ASTRA.md`; temporary artifacts `/tmp/siltwake-m1-batch-r1-astra/`; checked-free browser port5195.
- Fresh **Sol `gpt-6.1-sol`, max**: full scope, emphasizing implementation, persistence/invariants, executable/artifact consistency and tests. Sole report path `docs/build/reviews/M1-BATCH-R1-SOL.md`; temporary artifacts `/tmp/siltwake-m1-batch-r1-sol/`; checked-free browser port5196.

Each reviewer covers **both batches and all affected paths**; emphasis is not a scope split. Author only your report/evidence in your isolated worktree; no production/test/config/spec fixes, children/delegation, peer polling, shared-resource changes, push/PR/merge or parent mutation. Do not read the other reviewer's current findings before returning your independent initial verdict. Original author artifacts are immutable; copy/redirect any analyzer outputs before running them. Stop after bounded terminal handoff, closing only owned resources.

## Specification and accepted boundaries

Read AGENTS and STATUS first, then PLAN/CONTRACTS, `prompts/BUILD_GAME_REVISED.md` and its relevant linked specifications. `docs/build/tasks/M1-01.md` is the full M1 scope; M1-COORDINATION/M1-PARALLEL explain the approved split and core/physical versus presentation boundaries. EXPEDITION_INTEGRATION owns cross-system dependencies; FLEET_AND_SURVIVAL, WORLD_PROGRESSION, STORY_DESIGN and GRAPHICS_PIPELINE supply applicable details. DELIVERY_AND_ACCEPTANCE owns the independent gate. Research does not override the owner's decisions.

Evaluate early clue/lore consistency against the fixed canon if needed, but keep major spoilers out of your ordinary report/terminal summary. Any necessary spoiler detail belongs in a clearly labelled separate temporary appendix, referenced without revealing it. Do not silently reduce the requested ten-hour campaign/six-fleet scope or demand M2–M4 completion as a new M1 condition. Their deferred obligations must remain accurately recorded.

### Core/physical acceptance

- Coherent New/opening/pod→reef/island C01–C04 investigation→habitat-specific gather/craft→Dart sortie→useful cargo return/store/service→actual reload. Both early investigation orders work and the optional journal is not a gate. One registry connects sources, facilities, findings/blueprints, recipes and physical state.
- Quantities/prerequisites/container capacity/conservation agree with actual sources and recipe outputs. Guaranteed early preparation/recovery stock and conservative first-access reserves remain valid; no laundering protected maintenance into optional public purchases. Refusals are atomic, including full output and available blocked cases.
- Food/O2/personal pressure versus hull rating/power/damage are meaningful. Wildlife warns and supports quiet/cover/distraction/disengagement. Continued damage cannot corrupt disabled hull state; emergency air is finite and critical investments survive ordinary incapacity/repeated loss.
- Local physical Bobbin recovery/paid patch or salvage preserves original hull/hold/module/charge identities, persistent caches and knowledge. Every guided tow segment is checked, no unchecked final snap or free service. Ready/blocked/completed guidance is actionable/persistent where intended.
- Seeded production carrier feasibility: station keeping, actual compact/medium passages/vestibule, independent dry Spindle while another craft launches, surface-only release, supported empty reconfiguration, full capture/launch-path obstruction checks, exactly-once transactions, prepared/lock saves and interruption/rollback, labelled safe pod fallback. Fixtures are not campaign acquisition or registered mobile-home proof.
- Strict schema2/content expedition.2 and explicit actual-schema1 migration, ownership/capacity/provenance/geometry validation, atomic writer/session boundaries and interrupt-safe entry. No weakening to accept malformed states. Shared state/physical geometry/view transforms remain coherent.

### Presentation acceptance

- Original selected richer-cel art connects readable source habitats, refuge, island/workshop, Dart and wildlife; actual game camera supports navigation/interactions. Compare against the chosen reference and M1 expectations, not only mesh counts.
- Transparent observation panes have actual backing apertures with intact seals/collision, correct opaque depth/water ordering, dry-interior optical subtraction and deep attenuation; pilot cockpit/seat uses the actual hull transform. Non-cardinal yaw/pitch/berth alignment and lifecycle/disposal/quality/context recovery are supported by appropriate evidence.
- Early opening/discoveries/scans/notes and regional leads remain consistent, avoid premature reveal/undiscovered exact pins and handle the other early order. Notebook distinguishes observations/hypotheses and sources. No unimplemented ecosystem behavior should be asserted as operational.
- Preparation/ingredients/containers/service/recovery/exit warnings, local transfer notices, keyboard focus, pause/menus and corrected guidance remain understandable and truthful. Distinguish graphics quality/readability issues from diagnostic close-geometry captures; report real observed defects with context.
- Local original audio activation/settings/mute/captions/lifecycle and directional threat origins versus centred body/equipment cues are correct. Muted-host artifacts do not prove the audible mix. Render/UI/audio must not become simulation authorities.

## Evidence map and prior findings/dispositions

There is **no prior independent M1 batch round**. Earlier foundation/M0 and design-preparation reviews cover their own scopes, not M1. Main M1 staging/advisory findings and coordinator-directed fixes are included below; treat their acceptance assertions as provisional until your review.

| Evidence | Source and meaning |
| --- | --- |
| `M1-ASSEMBLY.md`, `M1-A0-INTEGRATION.md`, component reports | Underlying M1, immediate-command save coherence, full berth-path/geometry, sound-origin seam, first art/UI/core delivery. Include all in review scope |
| `M1-PRESENTATION-INTEGRATION.md` | P-FOCUS-1 semantic command focus corrected; transfer quantity/destination feedback joined in CORE |
| `M1-RENDER-INTEGRATION.md` / `M1-RENDER.md` | Source6ea44ce: real glass/backing apertures, optical air union/deep surface, actual Dart cockpit/seat, semantic yaw. Root verified source/archive/actual comparisons and geometry; all remain in final code |
| `M1-RECOVERY-FIX-INTEGRATION.md` / author | Source259b2d2: earlier R-1 tow-abort/final snap and R-2 missing notices corrected, assembled with render at4d0a7f0 |
| `M1-COMBINED-EXPEDITION[-INTEGRATION].md` | Fresh actual New→C01–C04→Dart/useful cargo→return/reload at4d0a7f0;25 collections/31 transfers/8 recipes; min75.972%O2/93.477%power before refill; no main loss. Separate fresh alternate/opening branches.39 full-state comparisons |
| `M1-COMBINED-RECOVERY[-INTEGRATION].md` |4d0a7f0 earned CORE-save replay: real losses, empty-hold food, complete tow/patch/cockpit, failed cache attempt, both caches, return/reload.18 full-state/17 command comparisons; source/branch provenance retained |
| `M1-COMBINED-CARRIER[-INTEGRATION].md` |4d0a7f0 seeded F0–F3 actual controls/final panes/yaw;17 assertions/14 full-state comparisons. Fresh fixture and old checkpoint imports distinguished |
| `M1-CR1-FIX[-INTEGRATION].md` | Final source20451a8: CR-1/EXP-1 disabled hunter-health save/export blocker fixed at all three existing damage sites.224 retained replay states differ only in negative health saturation. Final actual save/export/reload/exit;153m refusal/147m safe exit; EXP-2 launch south and upper-flank literal corrections |

All paths above are under `docs/build/evidence/`. Root's final assembled `npm run check` passes **140/140 tests/typecheck/build**; `/tmp/siltwake-m1-cr1-fix-root/check.log`. Production JS `index-fUae0k5W.js`, SHA256 `8993d62a8c97f8dea5749cf7943e0fd3d169da57ad3dc7ded83fa58d49e80e8b`. CSS index-DONjl4IF.css unchanged. Final correction archive `/tmp/siltwake-m1-cr1-fix-artifacts.tar.gz`; combined archives `/tmp/siltwake-m1-combined-{expedition,recovery}-artifacts.tar.gz` and `/tmp/siltwake-m1-combined-carrier/M1-COMBINED-CARRIER-artifacts.tar.gz`. Their reports give exact hashes/payload indexes, source copies and retained actual camera/input/save evidence. Earlier render/other artifacts are linked in corresponding reports. Do not claim every historic source was final; the only post-combined production changes are the three damage saturations and two text literals.

### Explicit evidence limits requiring review judgment

- The final source has targeted ordinary replay, not another fresh full preparation/multi-loss/carrier matrix. Earlier complete composed runs are4d0a7f0 and retain their provenance; root reproduced224 affected replay steps plus final targeted persistence/depth evidence under final modules.
- Final correction has13 exact state comparisons plus2 real-export comparisons; one additional walking/boarding reconstruction is **non-exact**, retained/excluded because throttled HUD ticks lag edge consumption. Actual saved/camera boarding/launch and exact egress/depth routes remain separate. Signed-zero JSON normalization is disclosed; no arbitrary field omission.
- Ordinary geometric blocked construction was not achieved; the existing-hull guard runs first. Detached synthetic-solid/production-world rules establish that refusal/conservation. Thin carrier throat solids likewise use labelled rules; actual craft obstruction and fixture rollback have ordinary/seeded controls respectively. Decide if any gap prevents bounded batch acceptance; do not silently waive it or manufacture a player solid-placement tool.
- Ordinary healthy-battery exhaustion was not awaited for hours. Prior zero-power diagnostics remain supplemental. Full advanced-fleet/deep rescue and registered-mobile-refuge fallback are explicit M2 obligations; seeded M1 pod fallback does not satisfy them.
- Partial clips/misleading attempted-cut filenames and source imports are individually excluded/labelled by reports. Inspect actual artifacts instead of relying on filenames or terminal summaries. Close collision/failure views can be heavily occluded; they are not blanket art-quality proof.
- SwiftShader/muted hosts provide no representative GPU/audible mix/human duration/enjoyment proof. Large bundle warning and existing low Windows-development dependency advisory remain disclosed. Do not claim complete campaign/release readiness.

## Review method and required return

Verify clean candidate SHA and base first. Inspect whole changed source and applicable spec, tests and actual evidence. Select focused fresh executable/production checks for risks you identify; an independent build/check is useful, but avoid rerunning every historic browser/geometry matrix without a reason. Runtime claims need executable or actual rendered evidence; distinguish fresh review play from inspected author play. You may use unchanged earned checkpoints with honest provenance; no seeded state may establish a claimed earned route.

Before browser work read `/work/repos/fleet/BROWSER_RULES.md` when available and `docs/BROWSER_RULES.md`. Prefer existing artifacts/APIs when adequate; otherwise verify factory-worker/isolated Linux actual process, T3 preview_status then preview_open, task-owned incognito storage and assigned checked-free port. No owner Windows automation or desktop pointer/cursor capture; preserve historical tab14 and all shared/user/peer resources. Keep scripts/recordings bounded; no abandoned controller or process-name kills. Close only owned resources normally. State renderer/audio limits.

Report candidate/base/spec, actual model/effort, checked paths/scopes and methods, findings with stable ID/severity/exact source or artifact/reproduction/player consequence/recommended correction, unresolved evidence gaps and explicit **ACCEPT** or **CHANGES REQUIRED** for **each named batch**. Distinguish implementation defect, missing required proof and nonblocking later polish. Include artifact hashes/paths and resource closure; commit only your assigned report. If no blocking findings, explicitly say so with limits. Return an independent initial verdict; do not integrate or negotiate with the peer. Root reconciles both, assigns real fixes and starts fresh delegated review tasks for any next round with both prior reports/dispositions.
