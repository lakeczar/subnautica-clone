# M1-CORE — earned expedition and persistence handoff

Bounded implementation handoff, 2026-10-17. **M1 remains incomplete and unaccepted.** This worker completed the assigned earned-route batch and the presentation coordinator's transfer-feedback request. P4 physical recovery/repeated rescue and F0–F3 carrier work remain separate assignments. Root owns assembly, the combined final run and independent review dispatch.

## Source and ownership

- Checkout: `/home/worker/.t3/worktrees/subnautica-clone/t3-69b4750a`, branch `t3/earned-expedition-persistence`.
- Start was clean at resolved parent **`411fb1d355b85dcd876f4bc337e93c3fc2cfadba`**. Its provisionally checked implementation does not imply M1 acceptance.
- Final source: **`6b4f229a83a9903a07125a8646df9b943510e1cd`**, `fix: report committed cargo transfers in expedition feedback`. No source changed during the final route or after its checks.
- Source paths changed: `src/sim/step.ts`, `tests/expedition.test.ts`. This evidence file is the only additional repository path changed.
- Production: `dist/assets/index-BT_noHFY.js`, SHA256 **`97f8273e8f98e645ce3abd9b4fdedc10562921fe8434fe01b6b5efa52e239a94`**; 1,247.14 kB / 316.42 kB gzip. Browser network observations on the genuine fresh route and actual reload identify that bundle.
- No shared API, event schema, geometry, save schema/content version, recipe quantity, dependency, UI/CSS/audio or art-leaf change. No canon change, children, push, PR, parent merge/mutation or coordinator-document edit.

## Concrete fix and verification

Successful `transfer` previously returned the inventory operation without replacing `s.feedback`. `executeCommand` could consequently announce the preceding craft or collection. The handler now completes the existing transactional transfer, returns any refusal unchanged, then records its committed quantity, registry item label and readable destination. Vehicle holds use the registry hull label; for example, `Transferred 4 × Buoyant resin to Dart hold.` The existing originless `collect` cue remains centred on the body/equipment. No sound cue or interface was added.

Three regressions in the owned expedition tests cover stale prior craft feedback, partial then full transfers through immediate/fixed-step command paths, immutable input snapshots, item identity/provenance and saveability; refusal retaining the entire original state/feedback and emitting only the error notice; and a local Dart hold's registry label. The focused red run reproduced `Build Dart scout / 180 m complete.` where the transfer notice was required. Focused green and the complete check passed. Ordinary route UI also displayed the new notices for partial/full pod storage and the useful Canopy payload.

Checks on the exact source:

| Check | Actual result |
| --- | --- |
| Fresh `npm ci` | Passed |
| `npm run check` | Typecheck, **120/120 tests**, production build passed |
| `node scripts/check-m1-economy.mjs` | Passed; unchanged public preparation/Dart budget **16 alloy / 11 glass / 13 membrane**, 56 raw CU |
| `git diff --check` | Passed |
| Retained save decoding | 45 task-directory save envelopes decoded with the exact-source codec; this includes explicitly excluded exploratory files |
| Return/reload comparison | Entire state equals the earned return advanced by the observed no-input ticks |

Logs are `/tmp/siltwake-m1-core-{install,transfer-red,transfer-green,transfer-check}.log` and `/tmp/siltwake-m1-core-transfer-economy.json`. Existing Vite chunk-size warning and one low install advisory remain. No dependency change was attempted. Additional pure diagnostics are retained in `route-audit.json`, `reload-comparison.json`, `power-zero-diagnostic.json` and `old-earned-clearance-diagnostic.json` under the artifact directory below.

## Browser and evidence attribution

Both `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md` were read before browser work/tests. Host, process and page checks agreed on **factory-worker Linux**, Chromium154, WebGL2 ANGLE Vulkan **SwiftShader Subzero**, Rich quality, 1280×800 CSS viewport, DPR2. The host uses `--mute-audio`. These are guided developer controls on software rendering; there is no audible-mix, consumer-GPU performance, blind-player or human-enjoyment claim.

The main route used a genuine New session **`3fd3e4bf-fc31-49e3-b55e-bba0b10407a2`**, created `2026-10-17T19:16:53.046Z`, entirely on final source. A HUD-reading helper generated bounded ordinary WASD/Space/C/arrow/Z inputs; actions and panels used normal keyboard/UI commands. There were no teleports, inventory injections, simulation calls or edited saves in either fresh route. Menu pauses bounded operator/tool delays. Individual movement segments were at most 6.5 seconds. Selected short recordings and earned checkpoints are retained; there is no claim of one continuous full-run video.

`opening-paused.json`, `route-start.json`, `baseline-exploratory-inputs.json`, the two `cancelled-entry-retained-*` saves and the first three recordings in the manifest are **excluded** from final-route proof. One early New request was cancelled by an input issued while replacement was still pending; it retained the prior expedition. The genuine fresh session above began afterward. The successful opening recording and `final-*` saves establish its separate identity.

## Fresh reef-first route and reproducible controls

All coordinates below are simulation base positions used to describe the observed approach, not injected positions. `go` can stop before its requested target; interactions were checked against the visible prompt. Ship inertia persists through pause.

1. New → all four staged opening actions. Pause at phase2/tick392 froze tick, pose, health76, oxygen100 and food100 without items/rewards. Finish to phase4/C01 once; `final-opening-paused.json` and `final-start.json` preserve both states.
2. Leave by the pod's front ramp. Gather four two-glass bundles at the northern ledge and two four-membrane bundles at the northern ribbon catch. The resulting 8 glass + 8 membrane filled 16 CU. An extra bundle refused. Inspect the actual intake/C02, leave the optional personal record untouched, return via the ramp and transfer to the pod locker. The first glass transfer was split into 1 then 7, exercising both notices.
3. Gather two four-alloy bundles at the eastern intake scraps and return. Repair the pod, fabricate tools, 150 m suit, one buoy and Bobbin. Public ingredients and the separate protected Bobbin allocation retained their original provenance.
4. Deploy that buoy. Gather the remaining northern membrane4 and southern membrane12. Approach the southern catch around the west end of the ribs rather than pushing through them. Return with membrane16; preserve the pre-surface oxygen checkpoint. With that full hold, reserve-cell output refused even though accessible ingredients existed. The entire before/after states at tick7432 are identical. Transfer cargo to the buoy; loaded packing refuses. Fabricate both cells, store surplus membrane and take3 for the workshop.
5. Follow the island shore/apron, collect glass4, meals2 and alloy8, using the same deployed buoy for the extra stock. Walk around a shore rail end. Approach the physical C03 bench record near `(10,1.2,-37.7)`; the nearer generic service handle around z−36 does not discover it. Restore the workshop and fabricate **`dart_16` / `dart_16_hold`**. All eight required preparation recipes are recorded, with no optional journal.
6. Empty/pack the same buoy `item_7`, deliberately board the Dart, and move one meal and one charged cell into its hold. Depart north until fully clear of the cradle. The first attempted diagonal descent was too early over the shallow shelf: collision reduced hull health to **80.8024%**. This is retained honestly. Correct east to open water near `(50,-5,4)` before descending. A subsequent post-return departure using north→east→descent preserved hull100%, confirming a usable approach without geometry changes.
7. Descend toward the upper Canopy. Normal throttle produced the paired warning near `(93.53,-78.62,-75.01)`. Z quiet throttle reduced interest to0 and changed the hunter to disengage. Park above the upper fins near `(90.31,-85.71,-92.43)` and exit. Gather crust4 from the upper fins and resin4 from the upper lee pocket. Scanner activity produced another warning; quiet movement again disengaged it. G released the reusable directional distraction and redirected the hunter without expenditure or kills.
8. Swim quietly down the rib's western flank, then around its southern end. `canopy-cover-position.json` at approximately `(99.93,-111.83,-122.99)` has a genuinely blocked hunter sight line under the shared `behindCover` query, interest0 and no attack damage. Cross south of the rib, move above the lab roof and descend outside its front to `(115.66,-116.50,-121.16)`. Preserve air before entry. Enter through the front, inspect C04 from the actual bench, and use the existing physical air volume. There is no air-reward dependency on reading the record.
9. Exit the lab front, return north/up to the parked Dart, and transfer crust4/resin4 into its hold. The actual boarding-handle checkpoint is `canopy-board-handle.json`; earlier approach saves with similar names are farther away. Board, ascend away from the territory, cross the shallow shelf near the surface, approach the cradle from the north at quiet speed and stop near `(19.89,-1.68,-19.62)`.
10. Save before reserve/service. Use one cell to top up the missing **7.942944%** power, retaining cell ID `item_10` at **77.305873%** charge. A second use at full battery refuses with the entire state unchanged. Supported cradle service restores hull, power and both carried cells to100%, retaining all identities. Take crust/resin through the diver hold, leave around the cradle rail end, walk up the workshop apron and store both in its locker. Save at the real return and reload/Continue.

Preparation consumed the unchanged 16 alloy / 11 glass / 13 membrane recipe budget, leaving glass1 and membrane11 in the pod locker. Actual finite-source depletion was **alloy16, glass12, membrane24, meals2**, followed by **crust4/resin4**. That is **17 preparation collection actions + 4 Canopy actions = 21**. The sortie contains eight confirmed cargo transfers: the two initial meal/cell transfers and six payload transfers through diver→Dart→diver→workshop. Preparation storage/buoy transfers were exercised, but their complete successful-action count was not retained before reload; no exact total for those transfers is claimed. The helper's continuous pre-reload input array was lost on page navigation. Checkpoints, selected recordings and the above sequence remain; post-reload depth, alternate and old-save input logs are saved.

## Measured margins before replenishment

No intentional incapacity, recovery or failed-rescue state precedes these measurements; main-session failures/rescues are both0. The cumulative minimum is therefore usable evidence for all preceding first-access legs. Snapshot air is distinguished from the slightly lower minimum immediately before the following air boundary.

| Stage / retained checkpoint | Air before replenishment | Dart power before replenishment | Useful cargo / timing |
| --- | --- | --- | --- |
| First reef return, `first-reef-return.json` | Leg minimum **90.490741%**; return snapshot already breathing | — | glass8 + membrane8, 16 CU; tick2500 |
| Southern catch return, `southern-return-before-air.json` | Snapshot **78.851852%**; full preparation minimum **78.805556%** | — | membrane16, 16 CU; snapshot tick6502 |
| Built/clear Dart, `dart-built.json`, `departure-clear-cradle.json` | Preparation minimum remains **78.805556%** | **99.736120%** after clearing cradle | Required tools/suit/buoy/Bobbin/cells/meals; build tick9978 |
| Lab approach, `canopy-lab-before-air.json`, `c04-earned.json` | Doorway **78.388889%**; minimum before lab air **77.240741%** | **95.825370%** | crust4 + resin4; C04 acquired tick15897 |
| Lab→Dart, `canopy-board-handle.json` | **83.518519%** immediately before boarding | **95.825370%** | Same useful cargo now in Dart hold; tick17977 |
| Workshop cradle, `return-before-service.json` | Piloted air100%; prior minima retained | **92.057056%** before any cell/service | Same Dart/cargo; tick20220 |

All observed first-access air/power margins exceed25%. No material tuning was needed. Main return at tick21068 represents **351.13 simulation seconds** (operator wall time includes pauses); swim495.794 m, pilot389.678 m, power spent7.942944%. These are model-driven route measurements, not expected human play length.

## Return persistence and bounded edges

`normal-return-saved.json` at tick21068 contains C01→C02→C03→C04 with provenance, five blueprint entries, all eight preparation recipes, four repaired facilities, no optional journal, unchanged source depletion, the same fitted equipment/buoy/cell/meal identities and all container capacities. Crust `item_18`4 and resin `item_19`4 are in `workshop_locker`; public glass1/membrane11 remain in the pod locker. `dart_16` is stationary at its returned pose, health/charge100, emergencyAir120, with its original cargo ID, one meal and one charged reserve. The other meal/cell and packed buoy remain with the diver.

Actual page reload → **Continue** reconstructed that expedition. The operator paused at tick21747: 679 no-input ticks/11.3167 simulation seconds elapsed during entry and helper reinstallation. Pose, knowledge, inventory, world and Dart remained intact; food advanced normally. Replaying exactly those679 empty-input steps from the saved return with the exact-source simulator gives **deep equality of the entire loaded state**, not just a selected-field comparison. Session ID and creation timestamp were retained. `reload-comparison.json` records zero differences. A wrong Continue locator first timed out in the menu; corrected visible `Continue ↗` worked. A helper evaluation initially included trailing whitespace and was rejected, then was corrected; this accounts for some of the elapsed safe-refuge ticks.

After preserving this return, a separate normal-input extension piloted the same earned Dart to clear water near `(177,-154,-171)`. The HUD explained the 150 m personal / 180 m hull distinction; E refused a roughly154 m exit. `depth-exit-before.json` and `depth-exit-after-refusal.json` differ only by27 ordinary no-input ticks, verified against the simulator. Cargo, control and protection were retained. Ascending to145 m allowed exit and reboarding; `depth-exit-safe.json` and the short depth recording retain it. On this extension the hunter also reached investigation/pursuit, and G immediately produced disengagement without hull injury. These extension states do not replace the earlier conservative return measurements.

Zero battery was checked only in an explicitly **seeded detached diagnostic** copied from the earned return: charge/velocity were set to0 outside the browser; movement held, exit worked, boarding refused, a retained cell restored35% and became empty without changing identities/quantities, and the result remained saveable. This is not ordinary depleted-power gameplay or a rescue pass.

## Alternate order and prior earned placement

The separate fresh New session **`8c657319-a493-45d4-89c3-3c0dfb38f2e5`** replayed the opening entrance and used its normal skip. It had C01 once and no awarded items. A tools-before-service action refused with its whole tick88 state unchanged (`island-first-start.json` / `wrong-prerequisite-after.json`). It then walked the shore, read C03, gathered alloy8, investigated C02 and returned/stored the full16 CU cargo. Knowledge order **C01→C03→C02** and both unlock families survived, without an optional record. A food attempt while full did not collect; after storage, hand gathering at the shallow reef cups produced meals2 with **no crafted/fitted equipment**. `island-first-end.json` finishes safely in the pod, tick5245, minimum air **91.824074%**, three successful collections, no failures. This is the bounded alternate-order segment, not a second complete Dart route.

Separately imported **unmodified** `/tmp/siltwake-m1-01/normal-dart-built.json` through the actual Import & save UI. Provenance is the earlier M1-01 earned route, bundle `index-DUS1lGxc.js`, before final `5fd6338` refinements. A bounded historical build of committed **`9c537a7ffcd603b1ee2ffbc05a6d5ad2eb027563`** from a Git archive reproduced that exact bundle filename; its origin is therefore resolved to that source rather than attributed to `5fd6338` or the current fresh route. `prior-source-provenance.json` records the build and hashes. Its original session is `cedc4843-9c6d-42ed-b482-a7b0482460db`. On the current bundle, ordinary approach/boarding/departure moved **`dart_15` from `(20,-1.6,-24)` to `(19.959,-1.6,-12.986)`**, past the cradle rails, with health100%, charge99.654241% and the same cargo/equipment/cell identities. `old-earned-dart-departure.json` and its input log/recording preserve the actual replay. Static clearance also passes for that old built pose and the old `normal-end.json` pose; that static diagnostic alone is not the physical proof. The imported branch's historical20.824% oxygen minimum is explicitly excluded from current reserve proof. Original prior handoff files/archives were preserved. The historical build ran only in `/tmp/siltwake-m1-core-prior-source/`, did not launch a server/browser or change either checkout, and finished successfully.

## Captures, artifacts and remaining obligations

Task artifacts: **`/tmp/siltwake-m1-core/`**; archive **`/tmp/siltwake-m1-core-artifacts.tar.gz`**. `artifact-manifest.json` records original paths, copies, classifications, sizes and SHA256 hashes. Media copies and check logs are included for portable review. Existing `/tmp/siltwake-m1-builder-handoff.md`, both prior handoff archives and `/tmp/siltwake-m1-01/` remain untouched.

Selected actual-camera screenshots (originals under `/home/worker/.t3/userdata/browser-artifacts/`):

| File | Observation |
| --- | --- |
| `browser-screenshot-localhost-mvcsgd3s-19ac9d5a.png` | Canopy warning during piloting; visible rib/crowns and conspicuous bright overhead water |
| `browser-screenshot-localhost-mvcsjdxz-987734f2.png` | Physical lab bench/C04, on-foot air and prompt |
| `browser-screenshot-localhost-mvcso8y7-bb481006.png` | Return storage panel after payload committed |
| `browser-screenshot-localhost-mvcspiro-ecfab663.png` | Restored workshop after actual reload/Continue |
| `browser-screenshot-localhost-mvcsspi6-fb996edb.png` | Suit-depth exit refusal in the piloted Dart |
| `browser-screenshot-localhost-mvcstxze-3b83028f.png` | Wrong-prerequisite refusal in the alternate fresh run |
| `browser-screenshot-localhost-mvcszdlg-57290591.png` | Imported old Dart boarding prompt; very close approach is visually occluded by the hull |

Recordings in the manifest include genuine final opening/pause, reef collection/C02, island approach/workshop, boarding/loading/departure, Canopy warning/quiet response, gathering/distraction, lab entry/C04, return, service/reserve behavior, actual reload, depth exit, alternate opening/order/hand food and the old earned Dart replay. Baseline/cancelled recordings are labelled excluded. The lab/source/ship routes were navigable using the visible prompts and HUD, but this is not a final art/readability pass. Opaque glazing, bright overhead water and the hidden-Dart pilot view remain root's reserved render-integration work after assembly. No shader/camera fix was absorbed here. Route corrections at the reef ribs, ramp front and cradle rail ends are described above; no frozen geometry change is requested.

Open criteria/limits: ordinary zero-power depletion and ensuing physical recovery are not established here; **P4 repeated gameplay rescue and F0–F3 carrier remain open by assignment**. Full preparation transfer counting/continuous input trace was not retained. No audible mix, consumer-GPU performance, blind-user navigation or enjoyment evaluation occurred. Combined visual/presentation-source route/reload verification remains root's next integration gate. This batch and the eventual integrated M1 need fresh **non-author Astra xhigh + Sol 6.1 max** reviews in addition to coordinator review; the author did not dispatch or perform those acceptance reviews.

Resources are closed: owned incognito tab `tab_1t_0430977b-1ed3-45f2-ac72-3683f9fe8942` closed through T3 lifecycle; all owned recordings stopped; preview server exec session4513 stopped with Ctrl-C (exit130), and port5190 had no listener afterward. Historical/shared human tab14, peer tabs, servers and processes were not touched. No polling/waiting for peers remains.
