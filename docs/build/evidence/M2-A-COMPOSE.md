# M2-A-COMPOSE — earned Canopy–Basin expedition

**The new connected expedition and local Dart recovery completed on the corrected assembly. M2-A remains provisional.** Ordinary production inputs earned preparation, C01–C06, the paid personal refit, useful Basin cargo, refuge service and actual Continue. The recovery continuation retained the original ship and cargo through an active-operation reload. **OS2-06 remains open; OS3-03 reproduces an earned stall without its cue; the M2 economy checker fails on the completed export.** These findings are retained below, without production changes or acceptance.

## Source, author and method

- Clean initial parent: **49fffcd7aca7e4d15b2f5a6782018bd14573a800**. Corrected production: **b91cde9e2956ce36ec9e4e7901332f7ebf1257cc**. Their differences are records only.
- Original runtime turn context confirms **gpt-6.1-sol / max**, cwd **/home/worker/.t3/worktrees/subnautica-clone/t3-64ba2b7a**. The own-thread T3 receipt confirms the same model/effort, that worktree, branch **t3/m2a-expedition-verification**, and relationship **subagent**. No child was created and no peer was polled, messaged or awaited.
- [Source/build receipt](/tmp/siltwake-m2-a-compose/raw/source-build-receipt.json): **110 tracked source/test/config/economy inputs** match both commits, the assembly and the worktree byte-for-byte. All **27 dist files** are hashed. Main bundle **index-CNubbEhE.js**, SHA256 **6f493b992a5a7c6bf543acb65b8464ab813f8dca2fa6edb3599297fb3de3539b**. Node 24.21.0 / npm 11.19.0.
- STATUS, PLAN, CONTRACTS, revised construction input and its integration/world/fleet/story/delivery pointers, M2-A-CONTRACT, A1–A3 reports/root inspections, and performance/terrain/wall dispositions were read. The prepared brief's historical dispatch label was superseded by this assignment. The superseded short-game draft was not executed.

The browser loaded the unmodified production bundle through a small external HTML/input recorder. It injected recording and keyboard/UI helpers, controlled requestAnimationFrame timing, observed DOM/exported data and fsynced each input row to disk. It exposed no gameplay setter, spawned item, teleport or save-edit mechanism. The opening used four E interactions; recipes, gathering, boarding, notebook, transfers and recovery used production controls.

**Navigation was coordinate assisted throughout.** Helpers read DOM position/yaw and used known code coordinates to choose ordinary arrow/WASD/vertical inputs. This establishes an earned physical route, not fresh-human discovery or independent learning of landmarks. Controlled callbacks usually advanced 100 ms or 8 fixed steps; all timings and input interleavings remain in the trace. Menus pause simulation. Screens were inspected at level pitch and with deliberate looking, preserving unfavorable views.

The main route started New Game with empty isolated storage. Only the two separately labelled continuations imported saves, through the actual UI: recovery from this run's checkpoint 025, and muted injury feedback from checkpoint 012. Neither is presented as a second new game or an uninterrupted main route.

## Connected earned route and transactions

The chronological authority is [input-ledger.jsonl](/tmp/siltwake-m2-a-compose/raw/input-ledger.jsonl), retained outside page memory. [Chronological TSV](/tmp/siltwake-m2-a-compose/raw/chronological-ledger.tsv), [checkpoint index](/tmp/siltwake-m2-a-compose/raw/checkpoint-index.json), [collection quantities](/tmp/siltwake-m2-a-compose/raw/collection-quantity-ledger.json) and [paid recipes/transfers](/tmp/siltwake-m2-a-compose/raw/paid-recipes-and-transfers.json) make actions, menu openings, scrolls, payments and route decisions inspectable.

| Phase | Earned result | Controlled simulation seconds |
| --- | --- | ---: |
| Reef/island preparation | Opening, C01–C03, food, tools, suit 150, two cells, Bobbin, buoy, restored workshop and paid Dart | 134.250 |
| Canopy outward | Shallow stall/detour, high approach, stop/look, warning and quiet retreat | 61.433 |
| Canopy site work | Real crust/resin hosts, C04 and laboratory air pocket | 98.883 |
| Canopy return | Reboard, return via connected approach, workshop/store and additional alloy | 49.100 |
| Basin preparation | Pod reserve/material pickup, paid in-place suit 350 refit, local ship service | 58.500 |
| Basin outward | Canopy descent/warnings and conservative Basin parking | 98.467 |
| Basin site work | Swim to salvage/fins and both flooded clue sites, then reboard | 69.600 |
| Basin return | Connected ascent/return, cradle service, useful cargo stored at workshop | 80.850 |

The main route ends at **tick 39125**: **713.807633 m swimming /1155.463724 m piloting**, **zero failures and zero rescues**. Its 652.083 simulation seconds comprise 472.583 seconds with travel input, 102.200 with look-only input and 77.300 idle/coasting/opening. Travel input includes stalls, detours and short approaches, so it is not a pure transit benchmark. All 22 gather commands and recipes apply without collection fixed steps in this source. Menu/panel simulation time is zero.

[Time attribution](/tmp/siltwake-m2-a-compose/raw/time-attribution.json) measures 618.618 seconds between recorded main-session rows attributed to menu/panel screens, and 527.282 in the combined continuations. These wall intervals include agent reading/planning, tools and recorder latency and exclude between-session recorder downtime. **Neither these intervals nor the controlled simulation duration are human playtime.**

The 22 collections yielded **2 meals, 12 glass, 24 alloy, 16 membrane, 6 crust and 4 resin**. Preparation supplied 14 actions; Canopy supplied 4; one additional alloy action occurred on return, one membrane action during Basin preparation, and 2 useful Basin actions. One meal was eaten; one remained. No optional personal journal was collected.

Nine paid recipe receipts:

| Recipe | Alloy / glass / membrane / crust / resin | Site / provenance |
| --- | --- | --- |
| Pod repair | 2 /1 /2 /0 /0 | Pod, public |
| Essential tools | 1 /3 /1 /0 /0 | Pod fabricator, public |
| Suit 150 | 1 /0 /3 /0 /0 | Pod fabricator, public |
| Two reserve cells | 2 /2 /2 /0 /0 | Pod fabricator, public |
| Bobbin kit | 2 /1 /3 /0 /0 | Pod fabricator, protected maintenance |
| Salvage buoy | 1 /1 /2 /0 /0 | Pod fabricator, public |
| Workshop restore | 3 /1 /0 /0 /0 | Workshop, public |
| Dart | 6 /3 /2 /0 /0 | Workshop, public |
| Personal suit 350 refit | 2 /0 /2 /4 /4 | Workshop, public |

Optional trim was not bought. The original fitted suit **item_7** became suit 350 in place; the earlier suit 150 receipt remained. **dart_17 / dart_17_hold** retained the paid 6 alloy/3 glass/2 membrane frame and **180 m hull limit**. The preparation UI explicitly distinguished personal 150→350 from Dart 180, displayed local have/needed ingredients and correctly refused the initial refit with alloy/membrane missing. A real pod/material detour resolved that shortage. The two cells had initially been left in the pod locker; they were carried to the Basin preparation, one in the diver hold and one in the Dart, both 100 charge. Neither was spent on a pulse or reserve refill.

The first Basin voyage piloted to a maximum reference depth **152.868121 m**, then exited in suit 350. Actual swimming reached 172 m. The run visited and gathered **4 alloy from basin_ridge_salvage_north** beside recognizable loose survey panels, and **2 crust from basin_survey_fins_east** on the mineral fin host. C05 and C06 were obtained by local interactions at their flooded sites, not by viewing a distant landmark. The notebook and known-place list were opened through normal UI; both flooded sites correctly lacked refuge air/service.

The useful return stored **17 CU** at the workshop: **6 alloy, 1 glass, 2 membrane, 2 crust**. Tools **item_6**, suit **item_7**, recovery kit **item_12**, buoy **item_13**, meal **item_14** and both cells remained. Basin panels/crust and new plans provide a concrete stock/knowledge payoff. The notebook's next regional lead names cool-flank research and pale open fans on the Rift shoulder; this run did not visit that later region or establish its eventual meaning.

Main executed commands included 10 individual transfers, 8 store-materials commands, 9 recipes, 2 services, 4 exits and one eat. There were 15 inventory, 8 fabrication and 4 notebook panel openings, plus 22 recorded panel-scroll events, including scrollIntoView effects. Full item quantities/container changes and refused attempts remain in the ledger rather than being reduced to only successful actions.

## Air, power, service and actual reload

[Complete refill/service/entry audit](/tmp/siltwake-m2-a-compose/raw/refill-service-entry-complete-audit.json) records every actual oxygen-increase onset, all 3 services and all 5 boardings across the labelled branches. It includes immediately preceding oxygen, available Dart charge even while unpiloted, and preceding minima. Power minima reset at actual service/import boundaries; oxygen minima reset at full air. The final incapacity reset is explicitly distinguished from a voluntary refill.

Main oxygen immediately before all 11 refill onsets, in tick order:

| Tick | Oxygen % | Tick | Oxygen % |
| ---: | ---: | ---: | ---: |
| 1701 | 91.528 | 2981 | 91.500 |
| 5669 | 79.657 | 7970 | 94.843 |
| 8497 | 98.639 | 15491 | 65.833 |
| 17728 | 83.583 | 20339 | 99.463 |
| 22808 | 82.611 | 34268 | **61.630** |
| 38800 | 99.222 | | |

Each listed oxygen value is also that interval's preceding minimum. The minimum across the complete main route is **61.629629629656165% oxygen /83.96676851849375% power**. Before services at 24190 and 38716, power was 91.353815% and 83.966769%, respectively; oxygen was 100%. The four main boardings retained 98.639/83.583/100/61.630% oxygen and 100/95.190/100/91.807% charge. **All conservative main-route entry/refill/service margins, including their preceding minima, exceed 25%.**

A real local save was made at the returned workshop. The page was reloaded and **Continue** selected without reseeding. Complete gameplay state is identical at **tick 39125**, including equipment IDs, paid recipes, stock, knowledge, hull/charge/cargo and refuge/recovery identities. Then 37 ordinary idle fixed steps match production exactly. [Reload receipt](/tmp/siltwake-m2-a-compose/raw/actual-Continue-fixed-step-equality.json) compares every serialized state field; savedAt wall-clock metadata changes normally.

All **43 complete exported states** were compared against production createGame/executeCommand/stepGame and the fixed-step clock using the durable input trace: **62,833 fixed steps, 1,229 frame batches and 87 executed commands** across the labelled segments. **31 match strictly after JSON serialization; 12 retain only numeric last-bit differences**, maximum **2.842170943040401e-14**: 8 swim-distance metric differences and 4 pairs of player/ship Z values. No field is excluded and the differences are enumerated in [replay-summary.json](/tmp/siltwake-m2-a-compose/raw/replay-summary.json). The main return, Continue+37 idle steps, actual imported continuation checkpoints, recovery reload/completion and final injury recovery are strict matches. This is not a claim of 43 exact replays.

[Save verification](/tmp/siltwake-m2-a-compose/raw/save-identity-verification.json) decodes all **54 retained export files/aliases** with complete-envelope equality. The final 20 native downloads match recorder bytes; an additional earlier native010 was preserved separately. Earlier native downloads rolled out of the browser's20-file retention window, while all 43 Blob exports survive externally. No 43-native-download verification claim.

One infrastructure interruption is preserved: the owned server exited SIGTERM 143, the durable queue rejected before further gameplay advancement, and native menu/save/export plus a server restart allowed an exact Continue at 10608. That native menu gap is outside the initial recorder, with no extra gameplay steps. Initial strict comparison failed on JavaScript -0 versus JSON 0; the retained final comparator canonicalizes save JSON only. Three overlapping early frame batches caused by tool timeouts are replayed using actual monotonic recorder timestamps; failed sequential replay attempts remain. HUD ticks can lag the 90 ms presentation refresh and are not the state authority. Checkpoint 022's Blob arrived after its checkpoint note; the index pairs its export click to the actual **tick 30098** Basin parking export.

## Geography, warning and contact findings

The regional lead, upper crowns and later laboratory silhouette were visible during deliberate looking. At the first **53 m level view**, water occupies most of the view above the console and useful ribs lie substantially below it. The [level view](/tmp/siltwake-m2-a-compose/frames/007-earned-high-canopy-level-rich1280.png), [downward look](/tmp/siltwake-m2-a-compose/frames/008-earned-high-canopy-look-rich1280.png), earned pre-warning save and motion 01/02 are preserved.

First warning began at **10840**. Ordinary slow/quiet retreat changed the hunter to **disengage at 11021**, with no cell expenditure or damage. The visual warning changed/cleared and a real retreat route existed. **behindCover was false throughout that warning/retreat: this was open-water quiet escape, not shelter.** Later true-cover intervals 13062–13530 and 27022–27356 occurred with an idle hunter or after disengagement had already begun. They do not prove first-approach shelter recognition. The separate loud threat continuation establishes warning→investigate→pursue rather than treating quiet disengagement as pursuit/cover evidence.

**OS2-06 stays open.** Minimal proposed root scope: make the tall-rib shelter silhouette/entrance discoverable from this actual high approach while retaining a useful level water view. This author changed no camera, geometry or HUD copy. Navigation assistance means even successful later rib traversal would not establish fresh-player learning.

Ordinary floor/boarding work included the pod underside, Canopy return rail, C05/C06 pads, shallow rescue bench, shoreline detour and recovered-Dart cradle return. [Contact summary](/tmp/siltwake-m2-a-compose/raw/contact-summary.json) links separate full-step diagnostics with requested/actual movement, raw sweep, full-footprint support/floor, boundary/surface result, AI/cover and presentation/reset reasons. Observer methods are extracted verbatim from production app.ts and transpiled externally; their hashes are retained. No cue threshold changed.

- The under-pod ascent produced 150 replayed visible Blocked above steps; lateral retreat and the correct ramp approach escaped. A contact/return-rail detour remains in the travel record.
- C05/C06 floor-contact windows retain minimum eye-to-physical-ground gaps 1.05 m. The recovery bench retains 0.65 m and actual local E use. Level/downward views show physically reachable staging; the very close downward bench view is sparse and is preserved beside the clearer level view. These bounded eye-gap samples do not prove every near-plane/placement case.
- Recovery cradle return produced 31 qualifying stalled-thrust samples and 2 replayed visible Blocked ahead steps. That does not close OS3-03.

**OS3-03 has a new earned failing reproduction.** During outbound Canopy travel at about **(43.8968, -7.69755, -34.96197)**, 215 stalled-thrust samples in 9000–9370 produced zero Blocked ahead steps. The unchanged 9370 export plus 60 held W steps reproduces positive requested horizontal motion, actual=0, solidLimited=0 and the production observer resetting every step.

At9352 the capsule sweep is clear, but moveHull rejects its proposed full-footprint terrain-floor result: proposedY **-7.705544928**, floor **-7.746440491**, requiredY **-7.696440491**. Final movement stays at the origin with hitSolid=true, while the measured solidLimited remains 0. This is below the surface cap and is not a sequence of intermittent qualifying samples. Minimal proposed scope: account for rejected footprint-floor forward travel in thrust measurement, keeping support distinct from a ceiling and preserving movement, historical placement, camera, schema and thresholds. [Red reproduction](/tmp/siltwake-m2-a-compose/raw/earned-stall-minimal-reproduction.json) and original trace remain; no seeded stall is substituted.

The [wall inspection's exact placement disposition](M2-A-WALL-INTEGRATION.md#contracts-and-placement-limit) is unchanged. Historical centre-floor placement clearance can still admit footprint overlaps; safe-hull exit containment is a bounded source argument. Successful ordinary contacts here do not establish universal construction/launch/migration placement safety.

## Earned recovery continuation

After finishing the main return/reload, the actual UI imported unchanged **checkpoint 025 at 34274**. This deliberate failure branch used pressure overdescent with ordinary controls; it did not alter charge or health directly. Dart disabled at 36879. The retained 36929 export places the loss at **(216.542591, -188.255743, -251.929182)** with hull 0, charge 89.390833% and 119.166667 seconds emergency air. Suit 350 permitted protected exit. The diver swam to the surface and returned to the workshop on foot; the north ascent briefly hit the Z=-260 boundary and a direct surface line later met shoreline geometry. Both the boundary/detour and their real input time remain.

The player then physically reached the authored local station, initiated **Bobbin at 46346**, completed its Basin tether approach, confirmed tow at 49208, waited through tow completion at 53247, reached the shallow bench, paid for the local patch at 53715, retrieved the actual cargo, boarded the same ship and returned it to the supported workshop cradle for service/storage at 56372. No duplicate advanced ship or public-material grant was used.

**Actual mid-operation Save/reload/Continue at 47528 is complete-state equal.** It retains vehicle dart_17, routeId **basin**, method tow, phase approach, waypoint 4 and guide position **(131.360952, -3, -213.973849)**. The route then completed. [Mid-operation equality](/tmp/siltwake-m2-a-compose/raw/recovery-mid-operation-reload-equality.json) and motion 07 retain the visible operation and actual Continue.

| Recovery measure | Result |
| --- | --- |
| Bobbin initiation→collar ready | 47.466667 simulation seconds |
| Confirm tow→tow complete | 67.316667 simulation seconds |
| Disable→returned/service/stored completion | 324.883333 simulation seconds |
| Travel since earned fork | 641.048639 m swim /186.392718 m pilot |
| Protected stock | 14 alloy/7 membrane →12 alloy/6 membrane |
| Local patch | Same Dart, hull 65, boundRepairs 0→1; charge/cargo retained |
| Pre-refuge-service | Hull 64.332124 /power 87.912546%; minor real return contact loss retained |
| Final ship | Hull 100, charge 99.970370% after post-service exit idle |
| Loss | No irretrievably lost items; rescue stock, charge, food and time/travel were spent |

The knowledge object, blueprints, immutable clue records, public source stock, facilities, containers, refuge and all item identities/quantities survive. Tools item_6 /suit item_7 /Bobbin item_12 remain fitted. Cell item_11 remains in dart_17_hold; actual Basin cargo items item_22/item_23 end in workshop_locker. The frame investment and ship/hold IDs remain. Food decreases 92.426111→80.149444. The recovery metric increases 2 for tow+patch while incapacity failures remain 0. This is one ordinary recovery path; repeated-loss/alternate salvage transactions in the economy script are separately staged rule diagnostics.

## Separate muted bite continuation

The UI imported unchanged earned checkpoint 012 at 10904, then set **Mute on /opening captions off**. Ordinary loud travel escalated through warning/investigate/pursuit. Visible hull-bite feedback accumulated 14.8, 78.4 and 99.3 points; the motion-derived [correct vitals detail](/tmp/siltwake-m2-a-compose/frames/047-THREAT-onset-vitals-normalized-detail.png) positively shows the brown/gold onset flash. At hull disable, the controlled Dart remained the bite target and emergency-air/exit guidance had priority. Protected exit cleared the hull episode; diver feedback then accumulated 15 and 75 points. Actual injury incapacity at 12465 returned the player to the workshop, cleared the chip and showed recovery priority.

Knowledge/essential tools survive. Ordinary carried cargo enters the visited cache and the disabled Dart hold remains. Full before/after exports and motion 08 retain that outcome. **Close hunter-body geometry heavily occludes several attack views**, including honest unfavorable captures 040–043; source tracking can converge to the player position. Proposed root investigation is bounded to visible separation/occlusion at these earned pursuit poses, without inferring an independently authorized AI/camera change. Flash/chip/priority evidence does not waive that visual concern. The initial wrongly cropped contact sheet 046 remains labelled as a failed crop; 045/047 are the useful derived sheets.

## Checks, visual scope and open work

One assembled **npm run check** passes **516/516**, typecheck and production build. The >500 kB chunk warning remains. All three economy commands were executed; they do **not** all pass on the completed earned output:

| Check / criterion | Disposition |
| --- | --- |
| New Game→Canopy→paid refit→Basin→useful return | Completed with ordinary inputs and disclosed coordinate assistance |
| Main conservative resource margins | All actual audited points/minima exceed 25% |
| Actual main Continue and 37 idle steps | Exact complete serialized-state replay |
| Earned disabled-Dart local recovery /active Continue | Completed; exact identity/state comparisons |
| M1 economy /design economy | Pass assembled arithmetic; these scripts accept no earned-input argument |
| M2 economy, completed new earned return | **Fails** at check-m2-a-economy.mjs:98–100: existing C05/C06 order is immutable |
| M2 economy, same run's unchanged pre-Basin checkpoint 021 | Pass; explicitly staged positions/discoveries/recovery rules, not another played route |
| OS2-06 first shelter recognition | **Open**, earned unfavorable level view retained |
| OS3-03 blocked-thrust presentation | **Unproven**, earned missing-cue reproduction retained |
| Muted/captions off injury feedback | Visible flash/chip and disable/recovery priority observed; close-body occlusion remains |
| Historical placement clearance | Existing bounded limit unchanged |
| Complete-batch independent acceptance | **Pending root inspection and fresh non-author Astra xhigh /Sol6.1 max reviews** |

The M2 checker successfully decodes the completed save, then its second clue-order branch expects C06,C05 after both are already collected C05,C06. discover intentionally preserves existing immutable records. [Original failure log](/tmp/siltwake-m2-a-compose/logs/economy-m2.log) is retained. Minimal proposed checker scope: isolate that order diagnostic in a deliberate clue-free branch or account for existing records while retaining validation of the completed earned input. Do not edit the earned save or call the pre-Basin follow-up a completed-save pass.

Actual captures cover Rich at 1280×800 preparation, sources, clues, warning/escape, Basin/floors, return, Continue and injury; relevant Light at 960×600 captures cover refit, notebook/known places, local recovery and bench. T3 normalizes those PNGs to 1280×800; the names and DOM viewport receipts retain the actual CSS size. Compact labels/costs and essential capability/refuge warnings were readable in the inspected panels, though material/refit preparation required real scrolling. No new subtitles/HUD paragraphs were added. Motion 01–05 cover the main controls/route; 06–07 cover recovery; 08 covers injury.

Hardware attribution: **factory-worker Linux/Debian, Chrome 154 Linux, 6 cores, 8 GiB deviceMemory report, DPR 2, SwiftShader Vulkan software rendering**. Actual first-scene activation 487.4 ms, first Canopy 338.3 ms, Canopy page reload 761.1 ms (callback 819 ms), first Basin 90.5 ms; later recorded transitions included 10.6–27.3 ms and a 138.7 ms return activation. Cold/new page work is visibly nonzero. Across 9462 controlled callbacks CPU median 2.2 ms/p95 4.3/max 819; [performance receipt](/tmp/siltwake-m2-a-compose/raw/route-performance.json) retains every batch. These measurements include software rendering/T3 recording and deterministic rAF; they do not establish continuous GPU frame pacing or dedicated-GPU performance. No audible-quality, physical-mouse-comfort, fresh-human enjoyment or ten-hour-duration claim.

## Reproduction and sealed artifacts

Artifacts: **/tmp/siltwake-m2-a-compose/**. [README](/tmp/siltwake-m2-a-compose/README.md) gives provenance, capture labels and reproduction order. The manifest includes scripts, original failures, exact exports, durable trace, logs, all relevant images/videos, selected source/config/tests, compiled production modules and all 27 built files. node_modules and unrelated historical evidence are excluded.

- Payload count /bytes: **541 /172,367,878**.
- [PAYLOAD-MANIFEST.json](/tmp/siltwake-m2-a-compose/PAYLOAD-MANIFEST.json), SHA256 **d559693498a29dc911756ae5cfc592b80052589eb8ea00db87e4a97c293a4f72**.
- [m2-a-compose-evidence.tar.gz](/tmp/siltwake-m2-a-compose/m2-a-compose-evidence.tar.gz), SHA256 **a03e0b322a6acdada090230a1b2fce010b64922aa9a2ca797a0c54ba8db41e96**.
- [SEAL.json](/tmp/siltwake-m2-a-compose/SEAL.json) verifies each selected archive member against the manifest. The seal receipt, archive and this separately committed report are excluded from their own hash cycle.

Important exact save identities (all 54 hashes are in the save receipt):

| Export | SHA256 |
| --- | --- |
| Main returned /before reload | 289e4485cc5acf13e2668238720597e2182b4011c1bcf67af7da25624a6301d3 |
| Main actual Continue | 45840e6659e9aed6a98d0c0eed67761f5af8dfaab8d9c32ea051f48d652b4e44 |
| Earned recovery fork 025 | 477dc0d76eba48c860a64f904a83dd52bc91e340e42c1969e593e9c6ade516f4 |
| Recovery mid-operation /before reload | df66c7ca9e612438dbde5e1bdb9cc04ed41f892fa58c201dbf3bdf21a081c25d |
| Recovery actual Continue | 4b936c8ee68c35f703045f68b404b0934bc59adf76eb128cb5fc59b39445d701 |
| Recovery complete | 34ea31550546dfdc54ce2013fc88542b7032c5780e29ea4b1d1b06e66b95587d |
| Earned stall 007 | 8165e44fc4a8b991e727a579c24903a95d4f21b4ff62960f4f8292193095c646 |
| Earned pre-warning level 009 | f27940f7e4ca0441e11ce2e49abce0fb4644deded0453b8513b723e8940bf2fa |

Offline commands from the artifact directory, after npm ci in assembly:

~~~sh
node scripts/replay-input.mjs
node scripts/check-reload.mjs
node scripts/verify-artifacts.mjs
node scripts/contact-diagnostics.mjs
python3 scripts/analyze-ledger.py
node scripts/transaction-audit.mjs
python3 scripts/time-attribution.py
node scripts/reproduce-earned-stall.mjs --assert-cue
~~~

The last command is intentionally red (exit 1). To reproduce the checker defect, from assembly:

~~~sh
node scripts/check-m2-a-economy.mjs --earned ../saves/earned-return-after-Continue.json --out ../raw/economy-m2-new-earned.json
~~~

That command is also expected to exit 1. The separately labelled passing rule diagnostic substitutes **earned-pre-Basin-economy-input.json**, SHA256 **a53988b2d052ded2f47fc77a9012567d63a99cf2bfa773e3b9a837c1a55aa68a**, without modifying it. README also lists the single check/build and both other economy commands. Reproductions write derivative outputs; verify the archive first and run in an extracted working copy.

## Resource release and handoff

Both browser rule files were read before browser actions. T3 preview_status then preview_open established the isolated factory-worker/Linux browser. This author owned one incognito/storage-isolated tab and port 5192, used no physical desktop pointer lock or Windows automation, and preserved human/peer hosts/tabs.

All 8 owned recordings were stopped/copied. Only the owned tab **tab_3w_0430977b-1ed3-45f2-ac72-3683f9fe8942** was closed through normal T3 preview lifecycle; own preview list returned no sessions. The [original lifecycle receipt](/tmp/siltwake-m2-a-compose/raw/browser-lifecycle-release.original.json) retains both results; final-preview-status.json is the last pre-close snapshot. Owned server PID 2452612 was stopped. [Release receipt](/tmp/siltwake-m2-a-compose/raw/resource-release.json) confirms process gone, connect refused and 5192 reusable with SO_REUSEADDR; an initial plain bind encountered TCP TIME_WAIT and is disclosed. Shared browser hosts 827911/847778 remain alive and untouched. No recording, server, browser tab or watcher is left owned by this task.

Only this new report is committed in the child worktree; production/tests/prior evidence/saves remain unchanged. No push, PR, merge, parent mutation or independent acceptance. Root retains interface/tuning/production-fix decisions and must inspect this evidence together with A1–A3 and corrections before the fresh complete-batch review pair.
