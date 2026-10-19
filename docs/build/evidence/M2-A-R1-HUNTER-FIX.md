# M2-A R1 hunter fallback — implementation handoff

Source **9473318bbd69aff4b8a9201a7ad7c44b6f892060** corrects the exact independently reproduced parked-Dart stall through bounded component-separated fallback selection. The final check passes **538/538 tests**, strict typecheck and production build; all economy modes pass. The full-duration motion, nearby contact and affected continuation checks pass. **The single required query trial misses the unchanged 2 ms warm-p95 bound and remains unresolved.** This is a provisional author handoff, without M2-A acceptance.

| Identity | Verified value |
| --- | --- |
| Clean exact parent | `57aacb0380c8990bc376841e261d651cbdfb2ac1` |
| Production parent | `35c2d22473ff17ed907c62362c25d17ed47cbcd0` |
| Source commit | `9473318bbd69aff4b8a9201a7ad7c44b6f892060` |
| Checkout / branch | `/home/worker/.t3/worktrees/subnautica-clone/t3-9c617916` / `t3/hunter-pursuit-fallback` |
| Actual original runtime | **gpt-6.1-sol / max** |
| Fresh artifact root | `/tmp/siltwake-m2-a-r1-hunter-fix/` |

The original session `01a153dc-1ba5-7093-9df7-e8846754b415`, first `turn_context` at `2026-10-19T11:11:36.760Z`, records the actual model, effort and assigned cwd. Its complete context record and location are retained in `identity/original-turn-context.json` and `identity/original-turn-context-location.txt`; `identity/final-t3-binding.json` independently confirms the attached isolated checkout. The initial Git status is empty. No catalog default was used as effort evidence.

Read AGENTS, STATUS first, PLAN/CONTRACTS, revised input and relevant integration/world/ecology/fleet/story/graphics/delivery contracts, M2 direction/contract, both complete R1 reports, root disposition, the full-batch review brief and current hunter author/root evidence. Both R1 reports are completed independent evidence, not inherited acceptance. The diagnosing-bugs skill guided the red/probe/fix loop. No children, peer communication/wait/poll, parent edits, push, PR or merge occurred. No cross-path source change was needed.

## Exact failure and bounded correction

Copied and retargeted root's `fleet-valid-state.mjs` into the fresh artifact root. Its input remains a byte-preserved real-diver12645 export; only its explicitly staged player/hunter derivative changes. The disabled Dart, cargo, investment, pose and current strict codec are retained. Actual `createWorldQueries()` is used throughout.

`baseline/raw/fleet-valid-state.json` equals the complete root result JSON (`baseline/exact-root-comparison.json`):

- Dart `(122.2388436138658, -102.78398623796338, -99.79702216882471)`, yaw `1.51659265358977`.
- Diver `(121.48036372348837, -102.78398623796338, -113.77646093638234)`.
- Hunter rises to `(124.23125314110811, -100.21731957129685, -105.45655432932651)`, then remains stationary for **1,778 consecutive updates / 29.6333 seconds**.
- Pursuit/interest 12 persist, cover is false, damage is zero, mouth gap is **4.877097661569204 m**; all 16 tested level escape steps pass the existing fleet/world checks.

Before changing production, the following actual commands went red:

```sh
node /tmp/siltwake-m2-a-r1-hunter-fix/scripts/assert-approach.mjs /tmp/siltwake-m2-a-r1-hunter-fix/baseline/raw/fleet-valid-state.json
node --test --test-name-pattern 'retained 1800-step stall|level fallback preserves' .test-build/tests/m2-hunter-reconciliation.test.js
```

The first reports `pursuit stalled for 1778 steps`; both new regression cases fail on unchanged production. Their logs are `baseline/approach-red.log` and `baseline/regression-red.log`. The archived added regression can also run against `baseline/compiled` without replacing its original six-case test file.

The focused `baseline/component-probe.json` distinguishes the cause: the direct proposal and four rotated proposals all retain a negative Y component and fail fleet sweep, while the same five level projections pass fleet sweep, world clearance and actor exclusion. World/target clearance is not the refusal source in this case.

Only `src/sim/hunter.ts` and `tests/m2-hunter-reconciliation.test.ts` change in the source commit. The clear-start branch preserves its existing four rotated alternatives, then, when a vertical component exists, tries level, four rotated-level, and vertical-only components through the same sweep and `safe` predicate. There are at most ten alternatives after the original direct request. Component lengths cannot exceed that request; no normalization increases speed. No geometry, overlap certificate, mouth/skin/LOS/contact, phase/withdrawal, rate, player/vessel physics, save/decoder, UI/camera, economy or public signature changes accompany it.

The six inherited owned test bodies are AST-identical. All other test/fixture files, including app/expedition and historical validation, are byte-identical to the parent. The two added tests use the actual world and preserve parked/disabled obstruction, continuous fleet safety, world clearance, no-inside-bite, contact and rate assertions. Existing berth/shell/LOS/turn/overlap and contact tests also pass; no unrelated geometry matrix was repeated.

## Resumed approach and safety

The unchanged original diagnostic succeeds on the source: maximum stationary run **one update**, valid contact, and **83.8333333333337** actual damage applied before its helper-only loop stops on health exhaustion at tick 13606, after 961 updates. This is staged `updateThreat` evidence, not an ordinary incapacitation playthrough.

`final/raw/motion-audit.json` and its complete compressed step trace retain a separate **1,800-update motion-only audit**, advancing the saved phase clock without applying injury so the complete 30-second movement interval remains observable:

| Metric | Result |
| --- | --- |
| First contact | Zero-based step 61: the 62nd active update, approximately 1.0333 seconds |
| Translation / longest stationary run | **75.493278 m** / **1 update** |
| Contact |888 valid contact steps, 10 separate contact runs |
| Subsequent 3-second cycle travel |6.8840–7.1177 m |
| Subsequent cycle spatial extent |Approximately 3.5000 m; mouth gap reaches 4 m during withdrawal |
| Speed |Maximum 7.000000000000553 m/s, floating-point error around the unchanged 7 m/s limit |
| Codec / next-step future |15 complete equalities |

The displacement extents and repeated withdrawal gap distinguish real approach/withdrawal from tiny cyclic motion. Every accepted path passes the unchanged continuous fleet query, actual-world clearance and movement bound; every bite is clear, exterior, within reach and outside withdrawal. Player and vessel remain unchanged in the motion-only audit. This is conservative full-animation-envelope evidence, not new exact animated triangle/triangle collision proof.

Separate 600-update live `updateThreat` audits retain actual 10/60 maximum diver loss per update, fixed diagnostic loudness 1 and no health reset:

| Case | First contact, zero-based step | Damage | Translation |
| --- | ---: | ---: | ---: |
| Exact disabled-Dart derivative |61 |46.0000 |29.9875 m |
| Healthy parked Dart, yaw−0.1 / diver height+0.25 m |55 |47.0000 |28.4898 m |
| Disabled Dart, yaw+0.1 / diver height−0.25 m |66 |47.1667 |34.3203 m |

These add 15 codec/future equalities. The healthy staged derivative explicitly restores hull health and removes its matching old loss record; an earlier incomplete conversion was correctly rejected by the unchanged strict codec and remains in `final/motion-audit-first.log`. The corrected diagnostic, original exact derivative and source tests pass. `checks/harness-incidents.json` records this and setup/capacity incidents without converting them into product defects.

## Checks, build and affected continuations

`npm run check` exits 0: **538 tests, zero failures/skips/cancellations**, typecheck, test compilation and production build. The existing main-chunk warning remains. All four economy invocations exit 0: M1 runtime, design arithmetic, M2 fresh and M2 with copied completed-earned tick 39125 input. `checks/results.json`, full logs and `checks/economies.json` record exact commands/results. These are rules/arithmetic checks.

`identity/source-build-verification.json` pins **108 source/test/config inputs**, with exactly the two authorized changes; **27 production files** and **196 compiled files** match the retained final snapshots. Main `assets/index-40qTc9Ok.js` is **1,487,011 bytes**, SHA256 **`0acc38970583cc4c3579c7424e263470b71d8df3550729277341717193246af5`**. Source was clean after its separate commit; report-only work does not relabel the checked production.

Copied/retargeted continuations run current compiled modules, write only fresh artifacts and compare to preserved original/parent state. The large original input is losslessly compressed, not filtered. Return/recovery preserve complete parent final states, including hunter:

| Retained suffix | Steps / commands | Minimum O2 / power | Codec/future equalities |
| --- | ---: | --- | ---: |
| Useful Basin return,34274→39125 |4,851 /4 |63.962963% /83.966769% |16 |
| Same-Dart recovery/return,47528→56372 |8,844 /9 |88.814815% /87.912546% |29 |

The 036 numerical window has zero updates and contributes no active-run or minimum-margin claim. Original full earned route remains source b91cde9; these 13,695 updates are retained-control continuations.

Additional focused baseline/current replays use controls and exports retained from source 35c2d22, with **1,806 candidate updates / two commands / 28 candidate codec/future equalities**:

- Healthy exit/retreat/reboard, 11215→11365: 150 updates, one command; complete state exact to parent and both retained exports, same healthy Dart piloted at 11365.
- Disabled exit/open-water/recovery, 13305→14871: 1,566 updates, one command; all eight retained exports and complete parent state exact. First damage 13599, incapacity 14728, refuge recovery retained. Damage contact/LOS/identity/rate checks pass, including inspection at the actual cache position before same-step incapacity.
- Original overlapping real-diver12645→12735: 90 updates, no command. First expected hunter trajectory difference at 12663. Final changes are only hunter X **+0.002833 m** and Z **−0.499678 m**; Y, mode/interest/timers, health and every other field match. Both have zero damage. Decode preserves the imported pose; active fallback movement causes the difference.

Full differences, states and step traces are in `continuations/raw/affected-replay-summary.json` and `.jsonl.gz`. These deterministic replays do not close root's reserved actual browser continuation.

## Required query trial — bound missed

After the full check and before other owned heavy audits, ran the existing uninstrumented query benchmark **once** on Node 24.21.0/Linux. Each scenario retains its first call, 60 setup updates and 360 warm samples; all 2,520 post-first samples survive. The benchmark exits 0, while the explicit 2 ms bound predicate exits 1. No faster rerun was selected.

| Scenario | First call ms | Warm p95 ms | Warm maximum ms |
| --- | ---: | ---: | ---: |
| Idle |1.613 |0.172 |8.266 |
| Investigate→pursue |19.271 |**5.165** |14.497 |
| Pursue |0.277 |**5.670** |13.416 |
| Earned043 overlap |4.447 |**2.766** |5.603 |
| Two nearby hulls |17.952 |**10.328** |20.012 |
|48-hull screen |4.487 |**3.870** |12.893 |

`timing/host-activity.json` retains half-second process/CPU/memory/pressure snapshots without process arguments or environment. This six-CPU host has load averages 6.26→6.72 during the 4.687-second interval; one concurrent Chrome process consumes 19.38 CPU seconds, approximately 413% of one core. Other Chrome/Python activity is also retained. No shared process was stopped, contacted or waited for.

Competing load is material context, not a proven attribution of every outlier. First four scenarios have exactly the earlier root trial's final threat and world-call counts. The two fleet scenarios change trajectory and increase aggregate `moveCapsule` calls across 420 updates from 1,734 to 3,426. That extra work must also be assessed; the misses cannot all be assigned to scheduling. `timing/outliers-and-parent-comparison.json` retains every warm sample over 2 ms and those comparisons.

**Root proposal:** keep the 2 ms gate open; assess the composed source's query cost and added fallback work under recorded host conditions, then authorize a bounded selection-cost follow-up if needed. Do not change geometry/rates or raise the threshold. This leaf has not established the required warm-p95 pass, total-frame pacing, GPU performance or first-use loading closure.

## Seal and release

The manifest inventories **546 regular payloads / 13,092,786 bytes**, plus one undereferenced dependency symlink. Archive **4,120,173 bytes**; every regular member, symlink target and included manifest verifies. No dependency link was followed.

- Manifest: `/tmp/siltwake-m2-a-r1-hunter-fix/manifest.json`, SHA256 **`a5fdb5b78faf21da28a29c19c38b9d1cf4e1365381b616382acf3d76c9bc7471`**.
- Archive: `/tmp/siltwake-m2-a-r1-hunter-fix/artifacts.tar.gz`, SHA256 **`537bf5bd84c5943d4d603cbeb20440cf4aa4764d3daa31b58cd4ce6840257b9f`**.
- Verification: `seal.json`; final source/report commits, report hash and clean status: external `handoff.json`. The report is outside the archive to avoid a hash cycle.

The `/tmp` tmpfs briefly filled before timing setup could complete. Only a complete owned 24,644,490-byte input copy was replaced with lossless gzip; its decompressed hash remains exact. No shared evidence, dependencies, parent/peer paths or historical fixtures were removed. The timing setup failure preceded the single real measurement. All harness incidents and successful corrections remain disclosed.

All owned checks/probes finished. No preview, browser tab, server, recording or port was acquired. Assigned paths/resources are released with the separate source/report commits and clean isolated checkout; no peer wait is needed. Root retains actual affected healthy exit/retreat/reboard and disabled/open-water continuation after both leaves are assembled, followed by a fresh complete-batch Astra xhigh/Sol6.1 max review of all ten criteria and both R1 dispositions. The query bound remains unresolved alongside that work. Human experience/hardware limits remain open; M2-B/C, integrated M2/Opus, M3 and M4 remain required.
