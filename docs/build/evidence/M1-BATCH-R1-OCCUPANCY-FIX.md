# M1-ASTRA-R1-01 occupied-Dart recovery correction

2026-10-17. Bounded **Sol 6.1 / max author implementation**, under root Astra xhigh. **Ready for coordinator integration and fresh independent paired review; no acceptance claim.** The parallel boundary-distraction/cache-lifecycle correction is absent from this checkout and these results.

## Exact source and scope

- Verified clean HEAD **`b2e91ef6b5e6f9fb50106dc3602d11d776f9853e`** before edits. Its production/tests/config/scripts byte-match `20451a8dafd014012986e0c8aa1e60df0da7ff25`; retained empty diff in `checks/parent-production-identity.diff`.
- Source commit **`d99aa649eec097370a6b38b107f5ec358c8d1945`** on `t3/occupied-dart-recovery` changes exactly `src/sim/recovery.ts`, narrow recovery-action presentation in `src/ui/view.ts`, new `tests/recovery-occupancy.test.ts`, and recovery cases in `tests/presentation.test.ts`. This report is the separate evidence commit.
- Read AGENTS/STATUS first, PLAN/CONTRACTS, revised build input, settled map/tracker/glossary, applicable EXPEDITION_INTEGRATION/FLEET_AND_SURVIVAL/DELIVERY_AND_ACCEPTANCE, both initial review reports, paired dispositions and the committed occupancy brief. The established root reproduction fixed the diagnosis and behavior direction; fresh red tests verify it at the real command/step/codec seam. No extra exploratory diagnosis or delegation was needed.
- No changes to step.ts, renderer, peer tests, schemas/validation, state, world, vehicles, geometry, materials, camera, economy or public commands. No moving peer source was read/copied, and no parent mutation, peer polling, children, push, PR or merge occurred.

## Behavior and exact seams for root reconciliation

`recoveryCommand` refuses tow and salvage of the occupied target before checking gear/locality or mutating any operation, hull, stock or inventory. Existing ready attachment is guarded as well. `executeCommand` returns the unchanged original state and one normal error notice. Repair remains under its existing eligibility and paid stock rules; reserve/service behavior is unchanged.

The one new small exported seam is **`recoveryOccupancyRefusal(s: GameState, vehicleId: string): string | null`**, at `src/sim/recovery.ts:22`. It reads only `s.player.controlledVehicleId` and `s.player.interiorId`; matching ownership yields shared safe-exit/local-collar/eligible-patch guidance, otherwise null. It has no mutation or new dependency. The existing readonly **`RECOVERY_NOTICES` adds `.occupied`** for the automatic cancellation report. No existing function signature changes, including `updateRecovery(s: GameState, world: WorldQueries): GameEvent | null`.

`updateRecovery` cancels a valid old occupied operation before any recovery guide/hull movement and before the ready-phase return. It clears only the operation and sets feedback, returning one existing error-notice event through the unchanged step caller. Subsequent updates emit no repeat. Normal simulation survival still runs: the correction grants no air, power, repair or teleport. Invalid imports still fail strict codec validation.

Hold consumes the shared refusal for disabled tow/salvage controls and explanatory text. The text conditions safe exit on depth and clearance and points to an eligible paid patch. Patch, reserve cells, supported service information, other commands and semantic command-focus handling remain available under their original rules. Cancelling a loaded operation is deferred to update; a refused command does not erase it.

## Red, green and production checks

Applied the diagnosing-bugs skill's real-seam regression loop to the already reproduced cause. Before production edits, compiled new regressions and ran:

```text
npx tsc -p tsconfig.test.json
node --test .test-build/tests/recovery-occupancy.test.js .test-build/tests/presentation.test.js
14 pass / 7 fail (21 total), 785.592315 ms
```

`checks/red-pristine-source.diff` is empty, and `red-source-hashes.txt` records source/test hashes. Failures cover occupied initiation/salvage, old-operation cancellation/exhausted air, Hold availability/focus and retained cancellation presentation. Existing paid repair, exit safety and unoccupied tow/salvage checks already pass. After the narrow fix, the same focused invocation passes **21/21** (`green-focused.log`). The new occupancy test file has eight substantive cases and uses labelled synthetic valid minimal fixtures, production commands/step/codec and shared physical queries, without importing/copying the expedition suite or mirroring the occupancy predicate.

After source settled and was committed, ran **one final `npm run check`: 150/150 tests, strict typecheck and production build pass** (`checks/final-check.log`). No later source/test edit or broad suite rerun. The existing large main-chunk warning remains. An npm clean install is retained in `checks/install.log`.

| Final asset | SHA256 |
| --- | --- |
| `index-DSQD3DM0.js` | `a2c08e56c3ffb630c3966e49a8f1be99b4a38d7ecda5170b68d7004ffd30e812` |
| `index-DONjl4IF.css` | `14756146fd5523913bc59b8079703e86ae867d0250079c88ed57e6198ab0a797` |

`checks/source-inventory.json` matches all 56 retained source/config/test files against Git at the full source SHA. `dist-inventory.json` hashes every final build file; `production-dist/` retains that build. Browser network evidence loads these exact main assets.

## Inputs, production UI and exact retained-state comparisons

Artifacts live at **`/tmp/siltwake-m1-batch-r1-occupancy-fix/`**. Original author/reviewer/root artifacts were preserved; only copied inputs and new scripts/outputs were used.

| Input | Exact provenance |
| --- | --- |
| `inputs/disabled-earned-actual-export.json` | Unchanged actual author-earned `/tmp/siltwake-m1-cr1-fix/saves/disabled-actual-export.json`; tick25277, still piloting disabled `dart_16`; SHA256 **`6f08bd12b84ff37791debb1be3f3623bf759e6c3d5ab954a2c375d30d3114db4`**. Original and copy hashes rechecked after testing. |
| `inputs/derived-legacy-occupied-tow.json` | Root's `/tmp/siltwake-m1-batch-r1-astra-root/derived-occupied-tow-before-first-step.json`; codec-valid old accepted tow before movement; SHA256 **`4ade6d8b68f5c78a3e4974d3e4e3b04307245ae9d78acb182894a1ed55161314`**. Explicitly derived diagnostic, not an actual UI export. |

The final production browser used real Import/confirmation, Hold actions, page-local balanced keys, settled Save and actual downloaded Export. No pose, inventory, damage, simulation call or storage assignment was injected. Actual exports, semantic/control traces and snapshots were retained before reload. Files06/08/11/14/18/20/24 in `browser/` are actual downloads, with per-download provenance in adjacent status files.

1. Unchanged earned input: tow and salvage visibly disabled while occupied, with conditional safe-exit guidance. Patch/reserve/service remain enabled. Settled Save and Export succeed at tick25277, with the **entire state exactly unchanged**, including hull, hold, player, cargo, knowledge and stock. No disabled-button click is claimed as an executed recovery command; command-boundary refusals are covered by regressions and the earned-rule replay.
2. Actual reload/Continue: coherent occupied hull retained. The first pause helper ran before the DOM screen attribute existed; paused after1189 no-input ticks at26466 and retained actual Export. Full production-rule replay matches every state field, including expected finite air and food drains. No immediate/zero-tick reload claim.
3. Reimport the retained occupied export; deploy buoy and transfer reserve `item_10` plus meal `item_17` from the hold to diver through ordinary controls. Hold is now empty, but occupied salvage/tow remain disabled. Save/Export succeed at25277. Hull/hold/player remain coherent; only the three intended inventory transactions changed.
4. Resume and use E: legitimate safe exit to `(107.7400797931586,-119.51223958036046,-111.91405176303472)`, seven normal ticks to25284. Tow/salvage now enabled. Actual salvage returns the complete **6 alloy / 3 glass / 2 membrane = 17 CU** to the buoy, removes the empty hull/hold, retains swimming/null ownership, knowledge and other inventory, and immediately Saves/Exports successfully. Semantic focus falls back to Return when the selected hull action disappears.
5. Actual salvage reload/Continue: exported at27185 after1901 normal no-input ticks. Complete state exactly matches replay from the saved salvage state. Normal food/oxygen/health/threat behavior remains; no recovery failure or ownership dangling reference.
6. Fresh immutable-input branch: occupied field patch succeeds at25277, spends exactly 2 maintenance alloy/1 membrane, restores hull 65/emergency air 120 under the existing paid rule, preserves charge/cargo/player, and Saves/Exports. Actual UI shows restored hull and removes its disabled-only actions; focus returns to Return.

`scripts/replay.mjs`, `checks/replay-final.log` and `checks/replay-results.json` assert **seven complete actual-export state comparisons** without omitted fields or floating tolerances (only normal JSON signed-zero normalization). There are 1378 codec round-trip validations in that diagnostic. The raw helper errors, excluded early cancelled-import setup and reload timing limits are retained in `browser/setup-exclusions.json`; they are not production-recovery failures. Temporary helper was corrected to resolve screen dynamically. Complete gameplay-command traces before replacement/reload are retained, but no claim is made that the failed helper logged the no-input reload intervals; exact resulting exports and tick-for-tick replay cover those intervals.

## Full tow, legacy compatibility and conservation

The real-factory rule replay starts from the unchanged earned input, executes the ordinary safe exit and local tow commands, then **all 1237 fixed steps** through final mooring `(51,-11,-54)`, tick26514. Every step is swept clear, bounded by7/60m and encode/decode valid. It retains the original disabled hull, cargo/modules, charge, emergency air, damage, maintenance and knowledge; updates the existing loss to the mooring and increments rescue exactly once. Player oxygen ends88.5462962963%, health63.8333333333%; normal hazards apply, with **zero failures**. Retained `earned-tow-steps.json` plus final derived envelope are rules evidence, not a new full browser tow or preparation run.

The exact root-derived legacy snapshot decodes before update, then cancels on its first step. That step exactly matches the same normal survival step with no operation, except cancellation feedback. All 120 sampled steps remain valid, only one occupied cancellation notice is emitted, and emergency air drains normally to113.816666666667%. The new tests separately cover approach, ready and tow; exhausted cabin air/zero charge continue to drain diver oxygen, with no free service. Already-invalid0.1166667m pose separation remains rejected on encode and decode.

Tests also retain existing operations/stock/cargo on refusal, require normal paid occupied patch/reserve costs, preserve depth/blocked-exit refusal, perform a full safe-exit tow with every step saveable, keep unoccupied staged ready attachment, return full salvage investment/bound stock exactly once and reject duplicate salvage. No new arbitrary route, pressure, economy or passenger-tow behavior is introduced.

## Actual media, isolation and closure

Six actual production captures in `media/`, inspected after capture:

- `01-occupied-hold-disabled.png`: disabled tow/salvage and truthful guidance; useful patch/reserve/service controls.
- `02-reloaded-continued-menu.png`: actual occupied Continue state paused coherently.
- `03-empty-hold-still-occupied.png`: prior salvage failure preconditions cleared, occupancy still prevents unsafe action.
- `04-safe-exit-recovery-available.png`: legitimate exterior access enables recovery.
- `05-unoccupied-salvage-return.png`:17CU frame return in the deployed buoy and successful feedback.
- `06-paid-occupied-patch.png`:65% hull, original power/cargo and successful patch feedback.

Read current fleet and repository browser rules before opening. T3 preview_status → preview_open, task-owned **incognito tab `tab_27_0430977b-1ed3-45f2-ac72-3683f9fe8942`**, checked-free **5194**. Verified actual browser process827911 is Linux Chrome-headless-shell under T3 serve811435 on **factory-worker**. Final metadata: Chrome154, WebGL2 ANGLE Vulkan **SwiftShader Subzero**, Rich1280×800 CSS/DPR2, host muted. No Windows automation, physical cursor or real pointer lock; no recording/controller or held keys remain. No network/console error in final production snapshot.

Closed only owned tab normally through `t3_preview_close`; stopped only own preview session54930 by Ctrl-C, exit130;5194 confirmed free. `browser/closure.json` records cleanup. Historical tab14, shared hosts, user/peer tabs/servers and all old artifacts preserved.

## Retention and limits

Verified **151 payloads** locally and inside the archive, **152 unique safe regular archive members** including the exact manifest. The tracked report is a separate Git artifact, excluded from the archive to avoid a circular report/archive digest.

- Manifest: `/tmp/siltwake-m1-batch-r1-occupancy-fix/SHA256SUMS`, SHA256 **`7ffe1f796da113666fb6558b6c4209aea034a8887e64fa5c47759a3f78921e52`**.
- Archive: `/tmp/siltwake-m1-batch-r1-occupancy-fix/occupancy-fix-artifacts.tar.gz`, **2093967 bytes**, SHA256 **`19c21627446d9fcf0d9710bb6a66bad2a726ddf36a9f093711297cc6d18a9040`**.
- `archive-info.json` is the external digest/verification receipt. The archive, its receipt and the manifest's own digest are excluded from the payload manifest; the manifest itself is included byte-for-byte in the archive.

This is author evidence for M1-ASTRA-R1-01 only. Root must reconcile the small seam, assemble both disjoint corrections, run affected combined checks and commission fresh paired reviews with the prior reports/dispositions. No combined pass, independent acceptance, M1 integration or deployment is claimed. Full preparation/multiple-loss/carrier matrices were deliberately not repeated. Natural ordinary depleted-power runtime proof remains open for integrated M1; M2–M4/full advanced-fleet recovery, human learning/duration/enjoyment, audible mix and representative dedicated-GPU performance remain outside this correction.
