# M1 combined RECOVERY — P4 and recovery P5

2026-10-17. Bounded Sol6.1 max evidence-author handoff under root Astra xhigh. **A new ordinary-play save blocker remains:** a pursuing hunter can damage an already disabled Dart below zero health, after which both Save and Export refuse the live state. The prior valid save survives. A separate retained continuation completes the corrected tow, paid patch, rendered cockpit departure, second loss, both cache retrievals, return/store/service and actual reload. This report is not independent acceptance or M1 completion.

**Frozen source and scope.** Started clean at exact parent **`e3ed566e0eb8951d7b492ba48005ab94f2129f94`**, branch `t3/validate-recovery-p4-p5`. Production source **`4d0a7f00e939f5535020ddf674fadee39f5e6bd4`** is unchanged. Its six later differences in the parent are coordinator/task documents only. The artifact `source/` is an archive of the exact parent; all **155 tracked files** byte-match their Git blobs (`source-inventory.json`). Production/test/config and coordinator records stayed read-only. This is the sole repository path changed; no children, peer polling, parent mutation, push, PR or merge.

Read AGENTS/STATUS first, then PLAN/CONTRACTS, revised input and relevant linked integration/fleet/delivery specifications, settled decisions/tracker, combined task/shared rules, original CORE/RECOVERY/RECOVERY-FIX reports and root integration records. No fresh EXPEDITION input was awaited or copied. This task did not repeat the root's137-test matrix. An isolated `npm ci` and production build, including TypeScript, passed; install/build logs retain the existing advisory/chunk warning.

Actual served/loaded production assets:

| Asset | SHA256 |
| --- | --- |
| `index-Ceft9taV.js` | `df8da0d4e639b792b4f27beec29fedaec1a6a2cc8c1a4ca406b9c45b922a63b2` |
| `index-DONjl4IF.css` | `14756146fd5523913bc59b8079703e86ae867d0250079c88ed57e6198ab0a797` |

**New blocker CR-1: negative disabled-hull health prevents persistence.** Ordinary piloting/collision and hunter pursuit reached `(110.701,-119.414,-111.320)` near the upper-Canopy rib. The attempted quiet upward retreat did not escape. The hunter kept applying damage after disablement; browser tick25111 displayed **Hull−17%**, later tick25151 **−25%**. F5 and actual **Export save** both returned: “Gameplay ownership, capacity, equipment, discovery, facility, recovery or berth data is invalid. Nothing was loaded.” Autosave switched off. The original disabled hull still displayed negative health after ordinary exit, diver injury/incapacity and workshop fallback (`traces/039`–045); refuge fallback did not repair it.

- Last valid actual save: **`saves/last-valid-before-negative-health.json`**, tick**24887**, hull**29.009484246247204%**, SHA256 **`1a41b5bf623473478b2e5c3346164eac51dd72ffbf82009fdc4db64ac6efbdc8`**. It is trace032's whole envelope, with the original session/identity/cargo.
- Exact subsequent generated input edges: **`traces/033-upper-rib-retreat.json`** and **`034-upper-rib-retreat.json`**; complete further failure observations/inputs remain035–045.035 retains the failed save observation and prior valid envelope;036 the Export refusal. Actual captures01/02 show the menu/refusal and negative-hull cockpit; capture02 reads−23% while the paused trace cuts separately retain−17%/−25%.
- Bounded reproduction: UI-import the last valid save on this exact bundle, then issue the recorded quiet turn/up/forward edges033/034. A targeted exact-source simulator reconstruction uses only that valid state and the30 recorded gameplay key edges. It reproduces the same rounded position, heading and **−17%** at25111; its first negative hull state is25029, health−0.2. The normal codec returns the identical refusal.
- `diagnostics/negative-health-derived-INVALID.json` is explicitly **derived simulator evidence**, not a browser-exported failing save. The production UI refused to export the actual invalid state; the retained valid input, complete edge schedule, HUD/camera observations and refusal are the reproducer. No browser state/damage/geometry was injected.

Read-only source inspection identifies [survival.ts](../../../src/sim/survival.ts:219): hunter pursuit subtracts `12 * DT` from the controlled hull even after `disabled`. Initial disable normalization in the same file only runs while `!v.disabled`. This task made no correction. CR-1 remains for root disposition and source-author follow-up; the successful alternate route does not clear it.

**Inputs and honest branch lineage.** The main input was copied byte-for-byte from `/tmp/siltwake-m1-core/normal-return-saved.json`, earned on CORE source **`6b4f229a83a9903a07125a8646df9b943510e1cd`**. Retained `original/core-normal-return-saved.json` SHA256 **`ad9231e5fd54d3654aa4613a28e0b30c7947ab1f9e9103956eb69a50be4b6171`**. Real menu→file input→**Import & save** loaded it. Session **`3fd3e4bf-fc31-49e3-b55e-bba0b10407a2`**, created **`2026-10-17T19:16:53.046Z`**, original tick21068. This is earned-save replay on the combined source, not fresh preparation. Earlier CORE's missing full preparation transfer count and continuous pre-reload trace remain earlier-source limitations.

Common traces001–027 import, take4 earned crust into the carried hold, approach/board the Dart, clear the cradle north and travel to the upper flank.027 is this task's own earned checkpoint at24348, retained as `saves/retained-upper-flank.json`, SHA256 `d239178d62d9f5781bc16451951bc2942c183c959c23a1209c170cd535c226b0`.028–045 are CR-1.046–054 reimport027 and retain an abandoned ordinary steering trial that overshot the intended obstruction.055 reimports the same own027 again; **001–027 plus055–185** form the retained successful recovery lineage. No pre-completed peer recovery is imported into it. All branches remain in the archive and counts; this is not a continuous one-take run.

Browser inputs were normal WASD/arrows/Space/C/Shift/Z/E/Tab/Escape/F5 and actual rendered command buttons. Helpers read HUD/save data, generated bounded normal control edges, released keys and paused at each boundary. No teleports, injected inventory/damage, direct browser simulation calls or state setters were used. Every generated edge/command log was drained to disk before every navigation/reload. Each control segment was bounded to6seconds or less; no timed-out controller remained running.

**Successful combined gameplay.** The final route deliberately used ordinary upper-Canopy collision and injury to exercise recovery. Key cuts are whole saved envelopes, indexed by source JSON pointer in `save-index.json`:

| Cut / trace | Tick | Actual result |
| --- | ---: | --- |
| Collision disable /063 |25573|Original `dart_16` at `(95.64095062024008,-93.17029801392076,-96.15442953027973)`, health0, disabled, charge**95.71851851851861%**, original hold/modules/investment/berth retained. |
| Diver injury fallback /070 |26383|Workshop refuge, failures1; `cache_20` / `cache_20_hold` at `(127.20856804489995,-96.37424308603244,-103.74810213313931)`, meal1/crust4. Disabled Dart and its meal/cell hold remain. |
| Empty hold /071 |26383|Store the same buoy7/cell11, leaving the entire carried hold **0/16CU**. Eat refuses, emergency refuge portion is issued, eat changes food60→100. Same-tick cuts retain every stage.072 reclaims the same buoy/cell. |
| Physical shallow stage /079 |27766|Swam via shore/apron to player `(45.403432310357005,-11.595559391550523,-53.10202957198081)`. Actual Deploy Bobbin button starts approach; no passenger/hull teleport. |
| Ready /085,087 |28461,28483|Automatic “Bobbin reached the exterior collar…” notice; actual **Attach collar / confirm tow** button and reopened guidance. |
| Attach /088 |28483|Same-tick before/after actual button transaction; ready→tow, original disabled hull/cargo/charge retained. |
| Completion /096,098 |29442 observed;29481 saved|Tow reaches exact **`(51,-11,-54)`**, operationnull, rescues1. Visible completion notice and reopened Hold/Notebook text; damage0/charge95.7185185%/cargo unchanged. |
| Local paid patch /103 |29577|Actual nearby Field patch consumes maintenance**14/0/7→12/0/6** (2alloy/1membrane); hull0→**65**, disabledfalse, boundRepairs0→1; charge/cargo unchanged. |
| Board/depart /106–110 |29613→30116|E boards the original hull. Actual final cockpit/panes/instrument frame are visible with a clear forward view; ordinary ascent and departure retain65health.104 was a staging-point inspect, not a successful board. |
| Park same hull /116 |31126|Position `(133.0630673467194,-78.20125604863527,-103.11079380999948)`, yaw4.5331853,65health,92.9967593%charge. |
| Further failed cache attempt /123 |31764|Loud diver approach/injury causes second workshop fallback, failures2. First cache persists unchanged. New `cache_24` / `cache_24_hold` at `(158.72215760647126,-93.85652891271725,-106.70107144685565)` holds the carried original hull meal. Same Dart remains recoverable,65health/92.9967593%charge. |
| Return to both caches /140,145 |36099,37166|Surface route, descent and quiet approach retrieve first-cache meal21/crust22 and second-cache meal25 through actual Hold transfers. Both cache/container records persist, now empty. |
| Reboard /157 |39017→39025|Physical hull stopped stern approach; ordinary side route reaches board handle. **52.61111111113739% oxygen before boarding/refill**. E boards the same parked hull. |
| Return/service /173 |42386|Normal clear-flank ascent/return reaches restored workshop cradle. Before service **87.19941666665753%charge /65health**; actual supported service restores100/100 and carried cells. |
| Store /180 |43424|Recovered crust4 goes into workshop locker through actual transfer. |
| Final /185 |43487|Workshop on foot after actual reload; original Dart100health/100charge, boundRepairs1; two persistent empty caches, losses[], operationnull, failures2/rescues2/collections21. |

Second refuge food was also issued/eaten through actual UI at31764. Final tools5/suit6/Bobbin8, buoy7, cells10/11 and original vessel/hold identity remain. Public item totals/provenance exactly equal CORE's original totals: recovered meal14→cache item21, crust18→cache item22, hull meal17→cache item25 are explicit loss/retrieval identities, not duplicate rewards. Emergency portions were consumed. Every original equipment item, knowledge record, blueprint/marker, source stock/reserve and facility record is deeply equal at retained main cuts. Bobbin8 remains maintenance-provenance equipment; public materials were not spent on the bound patch. No new collection, craft or hull was used.

The targeted exact-source replay of **this run's** attached088 state completes at tick**29439**,956steps, with every step checked by production swept-hull clearance. Maximum movement **0.11666666666667509m**, all956 segments clear, mooring floor−13m, exact endpoint `(51,-11,-54)`, one completion notice/rescue. Entire hull except position, inventory and knowledge are equal. This supplements the actual browser route; it does not substitute simulator output for gameplay. No unchanged legacy/art/GLSL matrix was repeated.

**Compatibility and labelled obstruction.** After preserving main final185, one byte-identical old RECOVERY attached save from source **`2ce5e14ca1e2a86c06cc3a9a35718e6300794b99`** was UI-imported: `original/old-earned-attached.json`, SHA256 **`2eedfc7a9391c85696253759ab5bd95fad97fe9126819cf317c19b74c1a69855`**, copied from `/tmp/siltwake-m1-recovery/saves/attach-tow-command--attached.json`.186–194 are solely compatibility/synthetic-focus evidence, not new main progress. Ordinary waiting completes the old tow at the corrected mooring; saved29520 retains its original full hull except position, original inventory and one rescue. Actual completion toast and visibly reopened report are captures12/13 and recording09. A labelled synthetic blur/focus while already panel-paused leaves the entire saved state/tick29520 unchanged after1.8seconds; focus does not resume play.

One existing-world obstruction diagnostic uses `original/seeded-blocked.json`, SHA256 **`4ffb81591ea3fc8b0a1c56e736c60f7d3e5ec5f57e9d038ba96134fe2a88fa8c`**, copied from RECOVERY-FIX source **`259b2d27c18012e2825a155ed6115b4d69a33d8e`**'s exact diagnostic input. Its provenance lists the outside-browser seeded hull/guide/loss pose `(130,-105,-135)`; no production geometry/query/bundle was changed. Actual UI import and ordinary wait stop at last clear hull pose `(112.63513715751051,-85.20405635956297,-119.02432618490889)`, rescues0, original charge/damage/cargo/loss retained. The blocked toast explicitly says to approach for in-place repair/salvage. Capture15 visibly retains **Last recovery report** in reopened Hold; actual reload retains the saved report.195–202 remain diagnostic-only. The main final was restored by real file import at205; whole state is equal at43487, session/creation retained, later savedAt only.

**Full-state persistence and command checks.** `analyze.ts` / bundled portable `analyze.mjs` use exact-source `stepGame`, codec and production queries. They compare the **entire persisted state**, with exact observed ordinary no-input tick deltas, and session/creation metadata. All18 rows pass serialized deep equality:

| Boundary / interval | Before→after tick | Delta |
| --- | --- | ---: |
| Original CORE UI import |21068→21100|32|
| Own027 UI import at046 |24348→24348|0|
| Own027 UI import at055 |24348→24348|0|
| Active approach reload |28082→28105|23|
| Active tow reload |28635→28659|24|
| Main approach→ready saved |27766→28461|695|
| Ready camera/reopen interval |28461→28483|22|
| Main attached→completed saved |28483→29481|998|
| Completed actual reload |29481→29481|0|
| Final earned actual reload |43424→43432|8|
| Final actual camera interval |43432→43487|55|
| Unmodified old attached UI import |28427→28436|9|
| Old attached→completed saved |28427→29520|1093|
| Seeded obstruction UI import |28427→28450|23|
| Seeded→blocked saved |28427→28808|381|
| Blocked actual reload |28808→28830|22|
| Restore main final via UI |43487→43487|0|
| Already paused panel / synthetic focus |29520→29520|0|

Three rows (CORE import, final reload, final camera interval) have only the raw JavaScript **`player.velocity.z: -0` versus JSON `0`** difference. No other normalization or tolerance is applied; every other row is raw deep-equal. Ready was saved/round-tripped; actual reloads were approach, tow, completion, final return and seeded blocked. Seventeen immediate command boundaries replay the actual button commands and match the whole saved state without a tick: transfers, eat refusal/issue/eat, deploy/attach, paid patch and supported service. All **80 valid envelope occurrences** decode→encode→decode with the entire envelope unchanged. The additional explicitly invalid derived failure file is intentionally excluded from that valid-save count.

`main-earned-final.json` is trace185's exact envelope: **11630bytes**, SHA256 **`ab6b306e901df011e554b81d2a115b498db93c3b26146c0f1a070e21c32bc58e`**. `restored-earned-final.json` has the same full state after UI restoration, **11627bytes**, SHA256 **`4dc45ba1e270867b37b9f83f3eac21cd416432c55cbb666fc48b99b63b35f5ba`**. Main cumulative minima are oxygen**52.61111111113739%**, power**87.19941666665753%**, both observed before replenishment. This run does not requalify the earlier CORE preparation margins.

**Exact generated action accounting.** `counts.json` includes every gameplay button's parsed command/target/tick, all edge-code totals, complete file ranges and the external T3 click/upload/navigation timeline. Logs are drained, not overlapping samples. “E” below counts attempts, including failed/staging interactions; it is not a successful-board count.

| Branch | Key edges | Gameplay buttons | E taps | Go segments | Hold segments | F5 attempts / save-read records |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Common001–027 |462|1|2|20|0|7 /7|
| Negative-health028–045 |138|0|1|6|4|2 /1|
| Abandoned trial046–054 |68|0|0|2|3|3 /3|
| Main continuation055–185 |2004|18|6|71|12|51 /51|
| Old compatibility/focus186–194 |32|0|0|0|4|5 /5|
| Seeded diagnostic195–202 |20|0|0|0|1|4 /4|
| Restore203–206 |4|0|0|0|0|1 /1|
| **All retained branches** |**2728**|**19**|**9**|**99**|**24**|**73 /72**|

Successful lineage001–027 +055–185 has **2466edges** (1233keydown/1233keyup),19gameplay buttons,8E attempts,91go/12hold segments,58F5 attempts/58save-read records and28total button clicks. The19 gameplay buttons are10transfers,2tow commands,1paid patch,1supported service,2emergency portions and3eat attempts (one empty-hold refusal). All branches total1364keydown/1364keyup,37button clicks,6UI import confirmations and one actual refused Export.

One instrumentation error is retained explicitly: the original250ms save-read helper returned the **stale**21919 journal after boarding at22189 in013.014 waited for the actual commit and saved22189.013 is excluded as current-state proof. The corrected `save-patch.js` waits for the journal to change within4seconds and was applied after each reload. The negative-health F5 failure has no save-read record. A hidden-menu import click timed out once (`locator.scrollIntoViewIfNeeded: Timeout14987.458999991417ms exceeded.`); a same-file upload also needed the real Import control to reset selection. Both were corrected through visible menu controls; no controller remained abandoned.

**Actual rendering, guidance and limits.** Inspected actual camera evidence includes empty0/16hold, recovered final cockpit/panes/clear forward view, nonzero-heading external Dart, successful/blocked notices and reopened reports. Hunter warning/pursuit/disengagement captions were readable. Collision and loud pursuit caused the deliberate retreats/losses; the later quiet route and physical side approach recovered both caches and the original hull. The UI reports local sockets, personal150m versus hull180m limits, recipe/maintenance cost, cache contents and meaningful recovery next actions. Normal return transfers publish their actual destination feedback; no new focus defect was observed in these transitions. No acoustic quality is inferred from muted captions.

Capture04's historical filename says ready-toast but the image has a later Saved notice; **recording03 at2seconds** / `media-frames/03-ready-2s.png` visibly shows the automatic ready notice. Capture06 shows the top of Notebook; its recovery report is below the viewport and is retained in full text, not claimed visible in that PNG. Capture13 visibly shows the completed report in the compatibility branch. Capture11/recording08 precede compatibility completion despite the attempted action's initial name; capture12/recording09 are the completion proof. Capture02 is pressed into collision geometry; capture07 is the successful recovered cockpit. These media distinctions are indexed in the artifact README.

Both browser-rules files were read before browser use. Verified **factory-worker / isolated Linux** ownership (T3 serve PID811435, headless Linux Chromium154), never the owner's Windows desktop. T3 preview_status preceded preview_open. Task incognito tab **`tab_21_0430977b-1ed3-45f2-ac72-3683f9fe8942`**, checked-free **5193**,1280×800CSS/DPR2/Rich,6vCPUs/browser deviceMemory8/host RAM12542808064bytes. Renderer ANGLE Vulkan **SwiftShader Subzero**; host `--mute-audio`. Final diagnostics retain six Babylon startup logs, no captured console warning/error and40retained network entries all200/nonfailed (T3 omitted2 older entries). Asset resource observations identify the exact JS/CSS above.

**Artifacts and closure.** Directory **`/tmp/siltwake-m1-combined-recovery/`**. Portable archive **`/tmp/siltwake-m1-combined-recovery-artifacts.tar.gz`**, **12398207bytes**, SHA256 **`af7503a802f1ba4159b25f6770cdef3c45f4363832b4786191e62685c2ac8abf`**. `artifact-manifest.json` indexes **554files** plus itself; `verify-artifacts.py --archive ...` verified all554 both locally and inside the tar, all155 source files, and no unsafe/duplicate/link/extra members. Dependencies/generated test output are excluded. README, provenance, source/dist inventories,80indexed valid save cuts, all206trace records, targeted analysis/derived-invalid reproducer,15actual PNG captures, ten stopped clips (2.25–13.38s), extracted actual frames/origins, logs and cleanup are portable. Archive receipt is adjacent, outside the archive to avoid a circular hash. The report is this separate Git artifact.

All ten recordings stopped through T3 lifecycle. Own tab closed with `t3_preview_close`; own Vite exec session**22863** stopped by Ctrl-C, exit**130**;5193 verified free and its exact server/esbuild PIDs absent. `cleanup.json` records results. Historical tab14 and all peer/user tabs/servers/artifacts were preserved; no process-name kills or owned live resources remain.

CR-1 is unresolved. **Ordinary battery exhaustion remains unexecuted/open:** no naturally near-empty earned case arose and no hours-long healthy drain was attempted. No deep/all-fleet/mobile-refuge recovery, fresh preparation, dedicated-GPU performance, audible mix, human enjoyment or campaign-duration claim. Fresh non-author Astra xhigh/Sol6.1max batch review and separate integrated M1 acceptance remain with root after disposition. This bounded evidence-author task stops at handoff.
