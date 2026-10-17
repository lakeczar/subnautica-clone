# M1-RECOVERY-FIX — swept mooring and visible transitions

2026-10-17. Bounded Sol 6.1 max implementation under the Astra xhigh coordinator. **Author handoff only; no independent acceptance or M1 completion claim.** R-1/R-2 from [recovery disposition](M1-RECOVERY-INTEGRATION.md) are corrected on the frozen source below. The unmodified earned attached save now reaches the intended mooring, retains its original hull/cargo/power/damage, and permits ordinary local patch, boarding and safe departure. Ready, blocked and completed transitions publish notices and leave useful reopened-panel guidance.

## Frozen source and ownership

- Clean exact parent **`124ff713fa23c8b69690809a0dda3c34f197eba9`**, worktree `/home/worker/.t3/worktrees/subnautica-clone/t3-a28a2bc3`, branch `t3/m1-recovery-fix`.
- Source/test commit **`259b2d27c18012e2825a155ed6115b4d69a33d8e`**, tree **`9dc1a60bea77c22a6bd915ace50f036ca549f70a`**. Only source changes: `src/sim/recovery.ts`, `src/sim/step.ts`, `src/ui/view.ts` (recovery report only), `tests/expedition.test.ts`, `tests/presentation.test.ts`. This evidence file is a separate documentation commit.
- Read AGENTS/STATUS first, PLAN/CONTRACTS, revised authoritative input/specification pointers, settled decisions/tracker, integration/fleet/delivery contracts, bounded assignment and both prior recovery records. Applied the diagnosing-bugs skill: exact red replay, targeted red tests, production-query survey, correction and original replay.
- All world/collision, registry, save/types/runtime/config and render paths remained read-only. No moving RENDER source copied. No cross-path mutation was needed. No children, peer polling, parent mutation, push, PR or merge.
- `source/` in the artifact directory is a Git archive of the source commit. **All150 tracked files** byte-match their committed blobs (`source-inventory.json`). It was independently installed and built after committing. Its JS/CSS also byte-match the full-check build in the worktree.
- Production JS **`index-569ZyUjo.js`**, SHA256 **`4b9bc7185396ecf689a503b1e3cff27c38c7c331032380f794160cbbc9ef6fda`**; CSS **`index-DONjl4IF.css`**, SHA256 **`14756146fd5523913bc59b8079703e86ae867d0250079c88ed57e6198ab0a797`**. Browser resource/network observations identify these exact assets.

Source SHA256s:

| Path | SHA256 |
| --- | --- |
| `src/sim/recovery.ts` | `3c62f01e550c8152f746cca72e1224bba60384f4c85d190e8a7bd8c221262059` |
| `src/sim/step.ts` | `9ad93c9e8d0511bbc7b02acdfb676a60ac119a27827fd0b5331c076cc7387033` |
| `src/ui/view.ts` | `27a4d9bc8e71b6451a948be8a9d2b6fef7c865d3c10cbfde3f68a2f31fefd7b4` |
| `tests/expedition.test.ts` | `47c7ac8e2914357c5a3877d96aaeab1d747a6c8660ecfd3a629fcedcdc10457a` |
| `tests/presentation.test.ts` | `9cc9c0e8b8b59ce0a4e03d98fb316bae3a7dd3a26299a10f4a663f8c7bb2a714` |

## Corrections and exact interfaces for root reconciliation

**R-1:** The old route aimed the Bobbin guide at the diver stage `(46,-12,-54)` while the attached keel was1m below it. This descended into the production floor before an unchecked final assignment. Tow now follows **keel-space** waypoints from the actual hull pose, with every movement, including the last partial step, passed to unchanged production `moveHull`. The final pose is its validated result; there is no final position assignment or repair/charge grant.

- `export const RECOVERY_MOORING = { x: RECOVERY_STAGE.x + 5, y: -11, z: RECOVERY_STAGE.z } as const`, numerically **`(51,-11,-54)`**. The intended mooring is preserved; no endpoint/world adjustment was needed.
- Internal `TOW_KEEL_WAYPOINTS: readonly Vec3[]`, indexed in saved reverse order: index0 mooring, index1 **`(57,-10,-65)`**, index2 **`(80,-48,-89)`**. Tow index3 means the current attachment pose, then index2; the validator's existing0–3 range stays supported.
- `DT = 1/60`; approach speed10m/s and tow speed7m/s remain. Maximum tow step is7/60m. A collision, boundary hit or requested/result endpoint discrepancy greater than0.001m ends the operation **without committing that step's partial movement**. The previous hull pose, loss, identity, contents, power and damage remain. Local repair/salvage guidance is published.
- `rescueWaypoints(s: GameState, vehicleId: string): Vec3[]` remains the unchanged **Bobbin approach-guide route**. It is no longer a description of tow keel targets. `recoveryCommand(...)` retains its signature and immediate transaction semantics.
- Existing approach/ready saves retain their guide position and waypoint semantics. Tow targets use the actual keel and add the same displacement to the stored guide, preserving both legacy+1m attachment and local-start0m offsets. No schema/content migration, save validator change or tick-on-save workaround.

**R-2:** `updateRecovery(s: GameState, world: WorldQueries): GameEvent | null` now returns an existing `notice` event exactly on ready/blocked/completed transitions, otherwise `null`. `stepGame` pushes that returned event once. Blockage uses `error: true`. No public event variant or saved field was added; no indiscriminate saved-feedback broadcast or per-tick notice.

`RECOVERY_NOTICES` is an exported readonly object with `ready`, `blocked`, `completed` strings, retaining the existing wording. Hold/Notebook's Return & recovery article displays matching saved feedback as **Last recovery report**. It survives toast expiry, refresh, reopening and reload. A newer gameplay feedback result supersedes that report; current operation/loss/collar guidance still derives from actual state. Unrelated saved/transient feedback is not presented as a recovery report. Existing refusal display and semantic command/target focus code are unchanged.

## Red/green and physical/save regressions

`node /tmp/siltwake-m1-recovery-fix/repro.mjs` against the compiled parent reproduced the exact earned failure: tick28427→**29398**,971steps, pose `(46.22656352979209,-12.938209946420303,-54.22656352979209)`, rescues0, events`[]`. It failed the new successful-rescue assertion (`red-repro.log`). Three focused tests then failed on the parent: nominal tow success, automatic ready notice, and reopened-panel report (`red-regressions.log`). The previous shallow-Y/null-operation assertion is replaced by exact mooring **and rescue increment** assertions.

On source259b2d2 the same unchanged attached save completes at tick**29372**, exactly**945steps**, keel**`(51,-11,-54)`**, one rescue and one completion notice (`green-repro.log`). Production survey checks all three full legs, endpoints and mooring clearance. Its sampled keel floor is-13m, leaving2m beneath the mooring datum. `earned-simulator-verification.json` separately replays the unchanged **approach**, **ready** and **attached** envelopes through production `stepGame`, verifies every per-step swept segment, maximum movement **0.1166666666666766m**, phase saves and whole-hull/inventory/knowledge/stock/maintenance/facility conservation.

Meaningful tests cover:

- 13 seeded legacy operation cuts: approach indices0–3, ready3, tow0–3 with0m/1m attachment offsets. These are labelled simulator diagnostics, not earned browser play. Immediate save round-trips occur before/after attachment and at route transitions/cuts.
- A real geometric test blocker on the **last mooring segment**: stop at the last clear hull pose, no final snap/rescue/loss deletion, one blocked notice, valid immediate save and accessible local patch. The test's added solid is diagnostic; production colliders are unchanged.
- Ready and blocked events through `stepGame`, no repeat on the next tick, one completion event/rescue, no unchecked movement above7/60m, original hull/container/cargo/power/damage/investment retained.
- Local collar attachment uses its actual0m offset and reaches the same mooring. Paused attachment/patch remain immediately valid without advancing time.
- Reopened/refreshed Hold and Notebook show all three saved reports; unrelated feedback is excluded. Existing focus/refusal tests pass.

`npm run check` passed **137/137 tests**, strict typecheck and production build (`check.log`). The focused expedition/presentation run passed33/33. `npm ci` and an independent committed-source build passed in `source/`. Existing one low install advisory and Vite large-chunk warning remain; no dependency/config changes were assigned. No later source changes required another broad check.

## Exact production browser replay

Both browser-rules files were read before preview work. Verified **factory-worker / isolated Linux** browser ownership: T3 serve PID811435 and Linux headless Chromium children; browser UA/platform confirm Linux. T3 `preview_status` preceded `preview_open`. Owned incognito tab **`tab_1z_0430977b-1ed3-45f2-ac72-3683f9fe8942`**, checked-free **port5193**, exact committed production build. Six exposed i5-12400/KVM CPUs, host RAM12,542,808,064bytes; browser6cores/deviceMemory8, Chromium154, Rich1280×800 CSS, DPR2, WebGL2 ANGLE Vulkan **SwiftShader Subzero**, host `--mute-audio`.

The main input was copied byte-for-byte from `/tmp/siltwake-m1-recovery/saves/attach-tow-command--attached.json`: **SHA256 `2eedfc7a9391c85696253759ab5bd95fad97fe9126819cf317c19b74c1a69855`**. Real file input→**Import & save** retained the entire initial state at tick28427. Ordinary waiting advanced the existing attached tow. During it, manual save→actual page reload→Continue preserved the operation. Completion appeared through the actual HUD notice and ended at the validated mooring; the notice sample occurs once. Capture09, an unmodified12.0s frame of recording02, visibly shows the Dart and completion toast.

After the toast, reopened Hold and Notebook both showed the saved completion report. Actual reload/Continue after completion retained it. Normal WASD/Space/C/arrows approached the hull collar from the earned stage to player `(48.529,-10.871,-54.179)`. The real **Field patch** button at tick**29543** consumed maintenance2alloy/1membrane (14/0/7→**12/0/6**), health0→**65**, disabledfalse, boundRepairs0→1; charge/cargo/investment unchanged. No intervening tick was needed to save before/after the command. **E** boarded the same `dart_16`. Ordinary piloting reached clear water near `(76.788,-6.159,-65.069)` at tick**29873**, health**65**, charge**95.93512037037084%**, no additional failure. Main cumulative oxygen minimum**73.08333333335322%**; inherited power minimum92.05705555554678% belongs to the earlier earned preparation, not this branch's battery drain.

The main branch preserves `dart_16` / `dart_16_hold`, original module list/frame investment/berth, every cargo/item/container record, knowledge, source/facility state and prior cache. Entire hull state except position equals the imported hull at tow completion, including charge**96.54623148148244%**, health0 and emergency air. Tow adds one rescue; the later paid patch adds another (final rescues2). No new collections, craft or hull. Main retained logs contain **one patch command, one E board, two movement segments, three bounded wait segments,44 held-key transitions and10 manual-save records**. Duplicate initial log copies are deduplicated in `analysis.json`. Navigation logs were flushed to disk before every reload; no continuous whole-run recording is claimed.

Separate **unchanged earned approach** replay used `approach-before-reload--save.json`, SHA256 **`2660ac4e52b8b4c313af5ea6e5e9c2e44919938efb3646d67a352955256e539e`**. Normal waiting produced the automatic ready notice and actual Attach collar control. Reopened Notebook retained guidance after toast expiry; actual ready-state reload/Continue also retained it. The original ready envelope is preserved as well (SHA256 `381ce548bb2dfea58051940bb5ec0e0c3ecdd203bd91ed6464871191f00b2bea`).

### Labelled blockage diagnostic

`diagnostic-blocked-import.json` is **seeded, not an unmodified earned save**. Outside the browser, a copy changes only hull pose, operation guide/waypoint and historical loss pose to start behind existing production Canopy cover at `(130,-105,-135)`. `diagnostic-blocked-provenance.json` lists exact changes. There is no modified bundle, query or world geometry. Import & save plus normal waiting reproduces blockage after265steps at `(112.63513715751051,-85.20405635956297,-119.02432618490889)`. This is the last clear pose; full hull state except movement, inventory, knowledge, maintenance and loss remain, rescues0. Actual blocked toast, reopened Hold/Notebook after12.3s paused expiry, and reload guidance are captured. The main earned departure slot was restored through real Import & save afterward.

## Whole-state reload comparisons

`analyze.mjs` advances each retained before-state with exact-source production `stepGame` for the observed no-input ticks and compares **the entire state**, not selected fields. All rows have raw deep equality, serialized equality and retained session ID/creation time:

| Boundary | Before→after ticks | Ordinary elapsed ticks |
| --- | --- | ---: |
| Unchanged attached import |28427→28427|0|
| Active tow reload/Continue |28696→28700|4|
| Completed tow reload/Continue |29407→29415|8|
| Ready reload/Continue |28385→28388|3|
| Blocked diagnostic reload/Continue |28735→28742|7|
| Restore main earned departure after diagnostic |29873→29876|3|

All16 retained envelope occurrences decode/encode/decode with the whole envelope unchanged (`analysis.json/audit`, `save-index.json`). Original approach/ready/attached validation and phase cuts are additionally checked by `verify-earned.mjs`. No schema weakening, imported pose migration or hidden tick was introduced.

## Artifacts, closure and limits

Directory **`/tmp/siltwake-m1-recovery-fix/`**. Archive **`/tmp/siltwake-m1-recovery-fix-artifacts.tar.gz`**, **8,513,875bytes**, SHA256 **`87289d78cf41c92faedd8ae3643c32f1ce3011fd8f4ea925da65f5b18805fbff`**. `artifact-manifest.json` indexes **268files**; `verify-artifacts.py --archive /tmp/siltwake-m1-recovery-fix-artifacts.tar.gz` verified every file both locally and inside the archive. README indexes red/green logs, scripts, exact source/dist, original saves,16 standalone cuts, input/notice traces, screenshots, host/network/console evidence and six bounded recordings (2.47–12.48s). Dependencies/generated test output are excluded and reproducible.

Actual inspected renders include completion toast/Dart, completed/ready/blocked reports, reopened Notebook and safe departure. Retained browser diagnostics show five Babylon WebGL2 startup messages and no console warning/error or failed network entries. Existing art remains this branch's baseline: the water/sky presentation and absent cockpit belong to concurrent RENDER, whose moving changes were not imported or retested here.

All six recordings stopped through T3 lifecycle. Owned tab closed with `t3_preview_close`; own Vite session82977 stopped with Ctrl-C (exit130),5193 verified free. `cleanup.json` records closure. Historical tab14, user/peer resources, all previous artifacts and source remained untouched. No owned running resources or children remain.

Prior repeated-loss/cache/food evidence stays attributed to [M1-RECOVERY](M1-RECOVERY.md). No fresh preparation repetition, ordinary healthy-battery depletion, deep/all-advanced-disabled/mobile-refuge recovery or combined RENDER play is claimed. SwiftShader/muted agent input does not establish dedicated-GPU performance, audible mix, human enjoyment or campaign duration. Coordinator inspection, fresh non-author Astra xhigh/Sol6.1max batch reviews and separate integrated M1 acceptance remain pending.
