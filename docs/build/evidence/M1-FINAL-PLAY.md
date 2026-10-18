# M1-FINAL-PLAY — contrast correction and focused ordinary play

2026-10-17, America/Chicago. **All assigned scenarios completed; independent acceptance remains root-owned.** This report supplies the bounded [M1-FINAL-PLAY task](../tasks/M1-FINAL-PLAY.md), not integrated-M1 acceptance. M0 remains the only accepted integrated milestone.

## Source, ownership and validation

- Actual injected runtime: **codex/gpt-6.1-sol, reasoningEffort=max**. Sole builder/validator, no children.
- T3-owned isolated worktree: `/home/worker/.t3/worktrees/subnautica-clone/t3-4bb73d2c`, branch `t3/m1-final-play`.
- Exact clean starting HEAD verified before work: **`fd5b90c5aa5e41bf192287607ea92ab77d795fa4`**.
- Source committed before final-source play: **`84fb7e86c9a6144bd4c1936b2451ea513f9fb010`**, direct child of that parent. Its sole changed path is `src/style.css`, 11 added lines. The evidence report is committed separately afterward; the handoff supplies that commit ID.
- All simulation, content, input, audio, save, geometry, render APIs, tests, config and scripts stayed frozen. No parent mutation, push, PR, merge or additional worker.

Read AGENTS/STATUS, PLAN/CONTRACTS, revised input and its relevant specification pointers, settled map, EXPEDITION_INTEGRATION, FLEET_AND_SURVIVAL and DELIVERY_AND_ACCEPTANCE. Read the M1-PLAY author/root evidence, both independent R1 reports and [paired dispositions](../reviews/M1-PLAY-R1.md), plus [combined recovery](M1-COMBINED-RECOVERY.md) and its [root integration](M1-COMBINED-RECOVERY-INTEGRATION.md). The previously accepted M1-PLAY batch at `07786449d6982994197e8e6dcf91a77c57e4c135`, production assembly `61e9a717d67f02ad0457b6389af5339afa6096c6`, remains separately attributed; its acceptance does not automatically cover this correction or integrated M1.

Final source checks passed once after the CSS settled: `npm run check` (typecheck, **210/210 tests**, production build) and `node scripts/check-m1-economy.mjs`. The existing >500 kB chunk warning remains. No implementation-mirroring test was added for the CSS tweak. `dist/`, the retained production copy and all 27 asset hashes still matched at the end of play.

| Build identity | SHA256 |
| --- | --- |
| `src/style.css` | `788b44252e20f29a18767c9bfcc99353f9de1512d15590ebf00ecf286933be94` |
| `index-DfpByBNx.js` | `378f5a61631e713fb02ee45d240a3106fb444262e7c4ddca82598ef3965be6e4` |
| `index-DkgOXgik.css` | `e4e1476503f3931a2009dbae1fcae57a46dcafdad79ba1e7e319b41afca39c97` |

The source tree hash, before/final CSS, asset identities and check-log hashes are retained in `source-build-identities.json`, `source/` and `diagnostics/source-verification.json` in the artifact bundle below.

## Input provenance and method

Earned preparation belongs to original author source **`0aaf60e619204aed2f9d51cd3d16e976cc4d33a9`**, documented in [M1-PLAY-PRESENTATION](M1-PLAY-PRESENTATION.md) and [M1-PLAY-INTEGRATION](M1-PLAY-INTEGRATION.md). These are continuations imported through normal file Import and confirmation, not fresh preparation from New. The CSS correction changes no simulation rules. Retained manifest hashes were checked before copying; originals and owned copies still match byte-for-byte.

| Original file under `/tmp/siltwake-m1-play-presentation/saves/` | Use here | SHA256 |
| --- | --- | --- |
| `main-final-ui-export.json` | Separate A and C Import inputs | `53cdb39d08b4396eea1b31028a2f1a57cb66070c3636034c52f00f7ba8218989` |
| `earned-no-charge-ui-export.json` | B Import input | `8983f7d71c257b3d9ad72c6044178a07ec2664eecf416357e58124fef018c9e0` |
| `earned-charge-actually-zero.json` | Historical reference only | `b2766e01f0ff0c5f811a1d1daed62e1da8cdadae20e8a6ecece6325fca1c6317` |
| `paid-pulse-before.json` | Historical reference only | `65a13ac9ee4d19abc62c5396528a722aae09c1962ca2a66ff0cf0e3572baa19a` |
| `actual-reload-save.json` | Historical reference only | `f79caa7bbd0cbd75f5a84b91783fa935f9403c029dd9f3e5a535d777111a0bda` |

Historical route counts, recipes, fixture provenance and recovery remain attributed to those earlier reports. No seeded-zero file was substituted for A's movement exhaustion. The old helpers were inspected and copied immutably into `original/` before adapting owned helpers with owned output paths.

Play used the actual production build, normal keys, HUD reads and existing DOM controls. The temporary helper generates keyboard down/up edges and clicks the existing button matching a visible command; it does not call application command functions or simulation setters. Movement/navigation holds are bounded to at most 6 seconds with release/pause in `finally`. No cargo grants, charge/health edits, teleports, altered clocks/step rates, time acceleration or cheats. Every helper call flushes its control/UI ledger and exported/journal checkpoints before navigation/reload. Interim `saves/*.json` are unedited F5 journal envelopes; `*-ui-export.json` are byte-copied normal Export downloads.

## Pulse-hint correction and actual pixels

Addresses **ASTRA-M1-PLAY-R1-01, P3**. The existing hint text and pale color stay intact. A `#pulse-summary:not(:empty)` rule adds a compact dark backing, border, padding and 10 px/1.5 text; an empty hint paints no patch. There is no broad HUD redesign. Empty content was inspected as transparent with no padding/border.

The historical Astra crop was inspected before the change. Matched before/final views on final source use the same earned pose, text and paused tick. They explicitly stage only the old CSS for the before image and temporarily reveal the paused HUD by hiding the menu; this is **appearance staging**, not earned gameplay. Overrides were removed and the real menu restored after every comparison.

| Background / CSS viewport | Tick and pose | Selected matched PNGs under `media/` |
| --- | --- | --- |
| Bright Dart console, 1920×1080 | 25283; (53.019, −3.387, −6.807), yaw 2.55 | `pulse-bright-before-1080.png`, `pulse-bright-final-1080.png` |
| Bright Dart console, 1280×800 | 32061; (54.918, −1.609, −7.750), yaw 3.483185 | `pulse-bright-before-narrow-matched.png`, `pulse-bright-final-narrow-matched.png` |
| Dark water, both 1920×1080 and 1280×800 | 28215; (70.212, −69.900, −91.891), yaw 4.966371 | `pulse-dark-before-1080.png`, `pulse-dark-final-1080.png`; corresponding `*-narrow.png` pair |

All are DPR 2 and the ordinary **Light** quality setting. T3 snapshots downscale 1920×1080 CSS to 1280×720 PNG; narrow screenshots are 1280×800 PNG. `media/contrast-index.json` records CSS viewport, intrinsic PNG dimensions, pose, text, style and overflow separately. Actual final pixels and selected transition frames were reviewed directly: the backed hint is readable on console and water, compact and free of overlap/viewport overflow. Directional and critical warnings remain readable. Adjacent existing pale guidance still has weaker console contrast; it was outside this pulse-only assignment and remains unchanged.

## Focused ordinary-control scenarios

| Scenario | Durable runs | Status |
| --- | --- | --- |
| Native New/opening/pause/controls smoke | 001–004 | Complete |
| A: healthy Dart battery exhaustion and recovery | 005–125 | Complete |
| B: fresh warning without eligible pulse charge | 126–155 | Complete |
| C: installed-trim ordinary disable/tow/paid patch | 156–209 | Complete |
| Final input release | 210 | Complete |

### A — actual healthy battery exhaustion

From the earned main input, ordinary supported preflight service at tick 24447 restores battery 93.682935→100 and hull 99.929210→100. It is the supported site's normal no-material service action; maintenance stock stays 14 alloy/0 glass/7 membrane. Meal 13 is split to create hold meal 21; the remaining carried meal is eaten. Cell 11 is transferred from workshop into Dart hold. The original Dart `dart_17`, hold `dart_17_hold` and installed trim `item_20` remain.

Actual movement, mostly bounded W+Shift+ArrowRight circles in clear shallow water, drains the full battery. Service to actual-zero checkpoint spans 534.9 simulation seconds, with positioning/steering included and no idle padding. Branch A adds 4289.644 m of pilot travel. Hull stays 100 throughout exhaustion.

- Near-zero normal Export: **tick 56199, charge 0.9142222222744139, hull 100, air 120**. The rounded HUD 0% is not counted as actual zero.
- Actual-zero normal Export: **tick 56541, charge 0, hull 100, disabled=false, air 119.13333333333338** while occupied.
- W propulsion attempts: tick 56702 gives 0.237 m residual coast and air 116.45; tick 56871 gives only 0.000108 m further drift over 169 ticks and air 113.6333333333337. These establish propulsion loss and finite emergency air.
- E exits safely. E reboarding refuses with “Craft disabled or out of power. Its hold remains accessible…” in the live ledger. The same hold meal 21 is taken to the diver and returned locally. Unsupported open-water service refuses without change.
- At tick 56876 the real local reserve action consumes **carried cell 10 100→0** and adds **battery 0→35**. Hull 100 and air 113.633333 remain exactly unchanged; hold cell 11 remains 100. No free repair or air reset.

Ordinary return reaches the workshop cradle and the player exits safely. An actual first off-center approach clips the cradle rail, costing **0.58437548063586 hull points**. The trace retains this misstep; quiet realignment succeeds and there is no subsequent repair. Before reload, tick 57806: battery 33.63536111111047, hull 99.41562451936414, air 113.633333, same hold/trim 20/meal 21/cells. Actual Save/reload/Continue reaches 57850; the complete persisted state matches after 44 real elapsed ticks.

Selected evidence: `a-near-zero-ui-export.json`, `a-actual-zero-ui-export.json`, `a-local-reserve-payment.json`, `a-safe-return-ui-export.json`, both propulsion checkpoints, and `diagnostics/a-reload.json`. `media/a-power-depletion.mp4` captures the actual transition; `a-healthy-zero-power.png` is a labelled paused-HUD reveal and `a-paid-reserve-panel.png` is the actual preparation panel.

### B — natural reset, new warning, unpaid G refusal

Separately Import the earned no-charge input, initially hunter disengaging, **carried cell 10 zero / remote workshop cell 11 full**. The remote full cell is not treated as local. Quiet ordinary navigation enters the appropriate territory branch and lets the hunter return naturally to home (132,−112,−113).

- **Tick 33043: idle**, interest 0, modeSeconds 3.4, hunter home. Normal idle checkpoint Export retained.
- W then provokes a **new warning event**. The live notice at HUD tick 33085 is “Paired warning calls. The hunter turns toward you. Slow down or reach cover.” Saved tick 33116 has mode **warn**, interest 1.168, modeSeconds 0.533333.
- Ordinary G refuses. The live notice explains 25 points from one cell in the diver hold or controlled craft and quiet/cover/retreat alternatives. Saved tick 33122 remains warn, cells 0/100, no distraction or payment.
- Actual quiet retreat reaches **disengage at 33388**, interest 0, modeSeconds 2.05. The response does not pulse or recharge. Quiet travel then returns safely to the cradle at 35960 with hull 99.92920993717496 unchanged.

The saved `feedback` field still contains the original input's historical successful-pulse message. It is preserved as history, not claimed as this action's outcome: run 139's live refusal/tap, unchanged cell charges and absent distraction identify the new result. No pulse success, recharge, service, reserve, repair or transfer occurs anywhere in B.

Before reload battery 81.1744351851344; after actual Continue at 36007 it is 81.0873981480973. The occupied hull coasts and consumes power over 47 real ticks; the whole-state comparison includes those changes. Selected evidence: natural-idle Export, fresh-warning/G checkpoints, response Export, final-return Export, `diagnostics/b-reload.json`, `media/b-fresh-warning-response.mp4` and the labelled paused-HUD `b-fresh-no-charge-warning.png`.

### C — same installed trim through ordinary loss and paid recovery

Separate Import of the earned main input, with normal meal/cell transfers for local cargo. `dart_17`, `dart_17_hold`, installed trim 20, carried cell 10, hold cell 11 and split hold meal 21 are identified before loss. No preflight service or staged disabled state is used.

At tick 27699 near (69.434,−49.283,−88.890), hull 99.929210/charge 89.869787, actual C+Shift descent collides with terrain during bounded 6 s and 3 s holds. Hull drops to 41.263852 and then **0 at 28211**, disabled=true, charge 89.16941666663959, air 118.55000000000008, pose (69.433089,−70.099533,−88.890436). The visited loss record, hold, module and cargo are preserved. Player health/O2 remain 100; no player incapacity. Actual disable recording and normal disabled-state Export are retained.

E exits safely at 70 m with suit 150. At tick 28215 the equipped reusable Bobbin's normal local tow button attaches directly. The diver swims the supported flank. Actual tow completion notice appears at HUD tick 28966; the hull is moored at (51,−11,−54). Before patch at 30863 it remains **hull 0, same charge 89.169417 and air 118.55**, operation=null, visited loss present. Tow consumes no stock and restores no damage, charge or air. The complete inventory is exactly equal from loss through tow.

At the actual local collar, normal **Patch here** at 30863 consumes **2 alloy +1 membrane**: maintenance 14/0/7→12/0/6. Hull 0→65, disabled=false, boundRepairs 0→1, loss removed, emergency air 118.55→120 from the **paid patch**. Charge/cells/inventory remain unchanged. Tow and patch each increment rescues; this is two recovery actions, zero new player failures.

Board the same recovered hull and use quiet W+Z controls. At 31232 the same installed trim 20 supports velocity magnitude **4.1994985000341485 m/s**. No module removal, transfer or salvage is needed. Personal oxygen reaches its 75.444444% minimum while swimming, then normal breathing aboard replenishes it (78.111111 after 8 ticks, 100 during subsequent movement). Both cells stay 100; no cell debit or recharge was needed in C.

Quiet return reaches the workshop cradle without new damage and exits safely. Before actual reload at 32855: hull 65, charge 86.78083333329607, air 120, maintenance 12/0/6, same vessel/hold/module and complete inventory. Actual Save/reload/Continue reaches 32884 and matches every persisted state field after 29 real ticks.

Selected evidence: before-loss and actual-disabled normal Exports, `c-safe-exit-disabled.json`, `c-local-tow-start.json`, `c-before-paid-patch.json`, `c-after-paid-patch.json`, trim propulsion, final-return/reload Exports, `diagnostics/c-reload.json`. Media includes actual `c-ordinary-disable.mp4`, `c-local-tow-paid-patch.mp4` and actual unrepaired/paid-patch panels.

## Persistence, minima, failures and limits

The actual native New button, Escape pause/resume and four native E opening steps completed on final source; short W/arrow controls followed. This is a short opening smoke, not another New→C04 route. Paused synthetic blur/focus at 272 leaves exact state unchanged. In C, synthetic window blur from live play pauses at 32061; later focus neither resumes nor advances the tick. These are labelled synthetic events, not a native OS-focus test.

All three real Save/reload/Continue checks flush durable inputs and checkpoints **before** navigation. The offline diagnostic uses the current compiled rules only to compare the actual elapsed no-input ticks: **A 44 / B 47 / C 29**. It compares the **entire persisted state, with no excluded fields**, including pose/velocity, vitals, inventory instances, modules, charge/hull/air, recovery, metrics, threat timers and historical feedback. Only normal JSON signed-zero serialization is applied. Session/created metadata match; changed savedAt values are explicitly recorded. This offline replay is validation, not earned browser movement or time acceleration.

| Branch | Recorded min personal O2 / health / food | Min hull / battery / emergency air | New player failures / rescue actions |
| --- | --- | --- | --- |
| A | 99.527778 / 100 / 81.442778 | 99.415625 / 0 / 113.633333 | 0 / 0 |
| B | 100 / 100 / 86.031111 | 99.929210 / 81.087398 / 120 | 0 / 0 |
| C | 75.444444 / 100 / 87.766111 | 0 / 86.780833 / 118.55 | 0 / 2 |

These are durable-checkpoint minima, with supporting HUD samples. Imported global minOxygen 77.583333 belongs to the old route, not new A/B play; C lowers it naturally. No player incapacities, new caches, erased losses or discarded cargo occurred. C's intentional gameplay hull loss and A's rail collision are retained.

Artifact audit validates **192 save envelopes without migration** and 420 journal current/previous copies. All 210 flushed runs have empty logical held sets. The raw ledger has 1100 keydowns/1103 keyups: three extra safety releases (W/Shift/ArrowRight) in run 016 are explicitly classified, not repaired with invented keydowns. Two early overlong evaluator calls reported `Preview automation evaluate timed out after 15000ms.` Their partial real movement is preserved in runs 016/018. Subsequent input calls use one bounded hold/navigation plus a fresh journal save; the stale-HUD save wait was corrected only in the temporary helper. No alternative browser-system tool was exposed; corrected short T3 calls succeeded. Raw errors remain in `logs/browser-helper-errors.txt`.

No cross-path source bug blocked an assigned check. Remaining limits: helper-driven imported continuations; no fresh-human enjoyment/duration, full-campaign route, carrier/optical/repeated-cache matrix, consumer-GPU or audible-listening claim. Four actual stopped MP4 recordings are 2560×1600 with no audio stream (6.7884 s / 9.375 s / 10.3146 s / 86.722033 s); selected derived frames and originals are retained. Pauses are not edited out.

## Durable artifacts and cleanup

Start at **`/tmp/siltwake-m1-final-play/README.md`**, then `scenario-index.json`, `input-action-ledger.ndjson`, `save-index.json`, `checkpoint-index.json`, `diagnostics/audit.json`, `media/contrast-index.json` and `media/recording-index.json`. Reproducible comparison/audit/manifest scripts, immutable original inputs/helpers, actual exports, per-call logs, selected media, check logs and exact production assets are included.

| Sealed artifact | SHA256 / size |
| --- | --- |
| `/tmp/siltwake-m1-final-play/manifest.json` | **`cdd0a72c716e80ef8252f2218a0b70fea85c01d443304f6b988007b46f7de77f`**; 576 payload files |
| `/tmp/siltwake-m1-final-play/artifacts.tar.gz` | **`e3ec34c8a929d7af60a68a2550df68f7856076dc964ad87f78bf31de443112e1`**; 17, 028, 308 bytes; 577 members including manifest |

`receipt.json` is outside the archive; archive/receipt/manifest exclude themselves from payload hashing as documented, avoiding self-reference. All 576 payload hashes were verified after sealing. The committed evidence report and its commit ID are the separate repository handoff.

Read both `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md` before browser use. T3 status/open owned one incognito tab on the verified **factory-worker Linux** browser process (T3 serve PID 811435, Chromium 154, SwiftShader, host muted), not merely a remote terminal hostname. Port 5190 was checked free before use. No Windows automation, shared-host termination, peer tab cleanup or relaunch loop.

At completion all recordings stopped and were copied, all controls released, pointer lock absent and appearance overrides removed. Closed only own `tab_2i_0430977b-1ed3-45f2-ac72-3683f9fe8942` through normal T3 lifecycle, and stopped own preview server session 10400 normally with Ctrl-C. Its terminal reported exit 1/`^C`; no preview process/listener remained. Immediate exclusive binds saw TCP TIME-WAIT; a later ordinary exclusive bind confirmed **port 5190 free** at `2026-10-18T02:58:27Z`. Full cleanup receipt is retained. Historical/shared tabs and hosts were preserved.

Root now inspects and assembles. A fresh non-author Astra xhigh/Sol 6.1 max pair must give separate explicit verdicts for this correction/evidence batch and integrated M1 on one final frozen candidate. No acceptance is claimed here. **M2–M4 and the dedicated post-M3 design critique remain required.**
