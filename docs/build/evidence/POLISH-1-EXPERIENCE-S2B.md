# POLISH-1 Experience S2b — Cargo and fabrication author handoff

Bounded implementation is complete. Root owns composition and acceptance. This leaf is **not accepted** by this report; fresh full-correction Astra/Sol review and Opus verification remain. No push, PR, merge, peer work or children were used.

## Identity and ownership

- Exact clean common parent, verified before implementation: **`8eecb7b4770230435f9c7002b4903bbe0477037b`**.
- Source/tests commit: **`39de51189d41d1cee28343d7f026fa615c02d59f`**. This report is committed separately afterward.
- Worktree: `/home/worker/.t3/worktrees/subnautica-clone/t3-a9016b5d`, branch `t3/cargo-fabrication-flow`.
- Actual runtime: **`gpt-6.1-sol` / `max`**, verified from session `turn_context`, not an inferred model label. Receipt: `/tmp/siltwake-polish-1-experience-s2b/runtime.json`; session `/home/worker/.codex/sessions/2026/10/18/rollout-2026-10-18T10-06-39-01a14f8c-f34e-7ed3-a2b8-a8ed218a67a4.jsonl`, line8. Receipt also retains initial full HEAD and empty status.
- Only source/test edits: `src/ui/panels.ts`, `src/ui/panels.css`, `tests/preparation-panels.test.ts`. The only other tracked edit is this report. No shared test helper or HUD-owned presentation test was edited.
- Read STATUS first, PLAN/CONTRACTS, revised build input and relevant specification pointers, settled map/historical tracker, reconciled experience assignment, root disposition, complete [Opus implementation advice](../design/OPUS-STAGE1-IMPLEMENTATION.md), and S1 author/root inspection. Dispatch supersedes the prepared/not-dispatched STATUS wording. [Reconciliation](../tasks/POLISH-1-EXPERIENCE.md) governs unavailable actions and validation/rebuild precedence.

`PanelView` constructor, public methods, panel IDs, `storage-from`/`storage-to`, semantic commands and `data-action` contract are preserved. Existing GameView listeners handle native disabled controls; Move uses native details and requires no added listener. Outer toolbar/navigation still says **Hold** on this disjoint checkout; root composes the HUD owner's Cargo rename.

## Implemented behavior

Cargo now orders compact status, **Here**, carried items, local holds, **Power**, then **Elsewhere**. Here is assembled from authoritative container/bench/service queries; it does not promise remote transfers or hull service from a bench alone.

| Context | Result |
| --- | --- |
| Field, no local container/craft | No empty Here block or Store command; carried items, Power/safety information and known Elsewhere remain. |
| Pod / restored workshop bench | Local Store controls lead. Fit and supported craft rows appear when relevant; local-cell recharge remains separate from hull service. |
| Locked workshop | Locker remains inaccessible, with restoration guidance; no fabricated Store access. Fabrication retains its exact prerequisite/site refusal. |
| Supported seated Dart | Seated Service/state leads before Fit/Store. The vessel says **Seated**, never a misleading zero-distance bearing. |
| Unsupported seated craft | Valid local reserve use is prominent. Routine Service is disabled with the exact authoritative reason. |
| Nearby disabled Dart | Patch/Tow/Salvage choices remain prominent before cargo, including occupied-hull explanation, Bobbin prerequisites, exact costs, stock, collar/staging rules, complete frame return/CU and capped patch-stock return. |

Service uses `serviceState`, `serviceRefusal` and `serviceWouldRestore`. A fully restored craft can show **Fully serviced** without a repeat button; the valid simulation command is unchanged. Local-cell recharge uses its own preview and does not imply health/emergency-air restoration. Recovery has no pure preview export, so PanelView validates recovery on a detached `structuredClone(state)` to preserve exact prerequisite/occupancy order without mutating state; reserve availability uses the same detached-validation approach. Owned tests assert presentation leaves the complete source state unchanged.

Store retains source/destination selection and distinguishes an implicit default from explicit intent. Same-site roster changes, pause, and bench/cradle movement preserve an accessible explicit choice; departure/reset clears it. An inaccessible/identical chosen destination explains its fallback. **Nothing to store** is native disabled with neutral adjacent guidance; routine empty-source amber prose is removed.

Compact item rows retain quantities, CU, cell charge, rescue provenance, retained status and installed-module identity. Keyed native **Move** disclosures contain the existing destination/all/one commands and exact CU reasons. Refresh preserves same-site open state, semantic focus and scroll. Semantic departure clears Move state even if an old closed-panel DOM still contains an open disclosure. If a source row disappears, focus selects the next visible logical Move summary, then carried anchor, then Return. Successful Store, full service and fitting have semantic result anchors instead of selecting an unrelated equal-label command.

Unavailable material transfers, Store, crafting, fitting/removal, recharge and recovery controls are native disabled with useful reasons. No `aria-disabled` control submits a command. Existing GameView suppresses disabled activation, and real simulation validation still rejects stale/racing commands atomically.

Trim has one tradeoff line: quiet3→4.2, boost11→9m/s, one socket and2CU. Fitting details retain unchanged cruise/noise/power/pressure facts and safe removal prerequisites without duplicate speed paragraphs. Notebook drops repeated helper framing while keeping regional leads, optional-record guidance, source habitat provenance, graduated hints, and safety/recovery information. No registry, recipe, economy, save schema, simulation mutation or lore was changed.

Fabrication consumes `craftingBlock.code` directly: **Ready here**, **Needs materials**, **Needs preparation / another bench**, **Current craft**, then collapsed completed once-recipes. Ready actions receive primary styling; blocked actions retain the current exact message. Live Dart ownership determines Current craft even when the original first refusal is a site/prerequisite refusal. No simulation checks were reordered. **In cradle** requires an enabled, unoccupied/unberthed hull, supported restored workshop, distance<1.5m from actual `DART_BUILD_POSE`, and speed<0.2m/s. Other states report piloting, disabled, occupied/berthed or an honest bearing. Salvage removes Current craft; `once:false` crafted history does not prevent another paid Dart.

## Checks and pending shared-test reconciliation

All logs below are under `/tmp/siltwake-polish-1-experience-s2b/checks/`.

| Check | Result |
| --- | --- |
| `npm run check` | **FAIL:384 tests,372 pass,12 fail**; all failures are in HUD-owned `tests/presentation.test.ts`. Full final log `npm-check.log` retained. Strict typecheck and test compilation pass. Its chained build does not run after test failure. |
| Owned preparation panel tests | **18/18 pass**, including real simulation commands, readiness/context, inaccessible/stale actions, selection/departure, charge/provenance, recovery, Current craft/first-refusal precedence and paid salvage/rebuild. `preparation-final.log`. |
| `npm run build` | **PASS**, including strict typecheck. `build-final.log`. Existing >500kB chunk warning remains. |
| `node scripts/check-m1-economy.mjs` | **PASS**, both staged M1 orderings and actual transaction checks. `m1-economy.log`. |
| `node docs/build/design/check-economy.mjs` | **PASS**, catalog/scenarios/conservation/rejection fixtures. `campaign-economy.log`. Arithmetic/staged scope retained. |
| `git diff --check` | **PASS** before source commit and report handoff. |

The12 failures are precise contract changes, not a claimed full-suite pass. Root must reconcile the shared tests after composition while retaining simulation/focus coverage. `pending-presentation-contracts.json` contains each full test name and disposition. Locations below refer to the unchanged TypeScript source; the full log also retains compiled locations/stacks.

| `tests/presentation.test.ts` | Failing expectation and required reconciliation |
| --- | --- |
| 308 — bench cell recharge | Expects old **Bench cell recharge** heading and contiguous old helper sentence. Here now labels **Local cells**, with distinct hull-service guidance. |
| 326 — bulk storage | Expects quantities followed by **7 CU · whole stacks** and a focusable refused/full/empty Store. CU is on **Store ·7CU**; native disabled/reason and storage-anchor focus replace activation of a known refusal. Operands remain explicit. |
| 356 — trim UI | Expects the old full speed paragraph and duplicated **Now:** paragraph. Reconciled contract is one tradeoff line and optional fitting details. |
| 715 — completed all-items transfer | First fails on **Take to diver ·3** versus **Take to diver ·all(3)**. It also expects Return after row removal; the new contract is next visible Move summary, carried anchor, then Return. Closed disclosures must be opened when testing native actions. |
| 731 — refused transfer focus | Full destination is now disabled with adjacent CU reason; helper excludes disabled buttons and finds0 instead of1. Stale-enabled refusal is checked separately in the actual browser. |
| 755 — same-label service | Fully serviced second hull now shows state and focuses its semantic vessel anchor; old expectation requires the active service command to remain. Valid service mutation is unchanged. |
| 826 — occupied recovery | Fixture lacks Bobbin yet expects active Patch, and expects active unsupported Service. Exact prerequisite/support refusals now disable those. Available reserve remains active; occupancy and recovery explanations remain prominent. |
| 858 — recovery focus | Fixture lacks Bobbin but attempts to focus enabled Tow/Patch. Use an eligible equipped fixture for active-command focus, and assert disabled reasons separately. |
| 887 — salvage refusal | Missing-Bobbin salvage was expected enabled for refusal-on-click. Now disabled with exact prerequisite; valid frame/cap returns and paid rebuild have independent evidence. |
| 990 — recipe focus | Shortage `pod_repair` was expected enabled/focusable. Now disabled with `craftingBlock.message`; a ready recipe remains actionable. |
| 1016 — closed-panel travel | Selects empty workshop locker as Store source, then looks up an enabled Store. **Nothing to store** is disabled. Departure/selection semantics are covered independently. |
| 1046 — same-site storage | Empty diver source likewise expects an enabled Store. Disabled control retains exact operands; owned tests/native browser verify same-site intent and reset. |

The owned lightweight port tests cover construction/state/commands, not native browser geometry or keyboard semantics. Those are verified separately below. No unresolved regression was found in the owned checks; composed HUD/shared-test behavior still needs root verification.

## Earned production P4 — refit and depart

Original input: `/tmp/siltwake-opus-stage1-r1/saves/first-return-before-service.json`, SHA256 **`edb24efec61cfcd890cfa6c0b3c29286d0d7bd71f533da6673d4c5902f0c0a91`**. Imported unchanged through production UI. `p4-final-start.json` contains the exact original parsed save. No pose/inventory mutation was used in this run.

At CSS960×600, Service is visible from the supported seat at scrollTop0, y210.49–246.69. After normal exit/swim to the workshop and paid trim fabrication, Cargo exposes **Store** at y188.74–224.94 and **Fit** at y376.69–412.88, both enabled at scrollTop0. Store moves2 resin+2 crust/4CU to workshop locker; fitting installs earned `item_20` into Dart hold/socket. Stills `p4-seat-960.png`, `p4-store-fit-960.png`, `p4-fitted-1280.png` were inspected.

| Scope | Navigation | Scrolls | Gameplay commands | Refusals | Destination changes | Travel legs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Prior Opus OS1-03 preparation observation | 4 | 3 | 5 | 0 | 0 | 1 |
| S2b earned preparation through fit | **4** | **0** | **5** | **0** | **0** | **1** |
| S2b through return, boarding, quiet departure and final inspection pause | 6 | 0 | 6 | 0 | 0 | 2 |

The manual tally is retained at each checkpoint. Navigation counts panel open/close/switch; commands are Service, exit, fabricate, Store, Fit, then board for the extended scope. Continuous travel/look inputs are not counted as gameplay transactions. The prior report did not execute the return/boarding leg, so that larger scope has no matched baseline. See [prior observation](../reviews/OPUS-STAGE1-R1.md) OS1-03 and `workflow-comparison.json` for exact checkpoint counts.

After fitting, Return and normal movement lead back to the original Dart; arrow-key aim and E board succeed. Quiet reverse travel departs roughly16m from the prior stop, ending at x17.76047/y−1.79285/z−1.70443, speed4.19997m/s, hull100%, charge99.65346%, module`item_20`. This proves departure for the next outing, not completion of another expedition. Earned save: `saves/p4-earned-after-refit-outing.json`. Relevant receipts: `probes/p4-final-*`, `p4-next-outing-*`; inspected still `media/p4-next-outing.png`.

Preliminary automation mistakes and an overshot route trial are preserved, not counted as the final run. `p4-r1-*`, `p4-route-preflight-end`, `p4-serviced`, `p4-after-exit`, `p4-service-confirmed` are diagnostic attempts. The last three carry explicit diagnostic classification. `p4-seat-before-service` is a valid initial layout-only receipt. The final measured run begins at epoch1792337196180 and ends1792337344931; its `p4-final-*`/`p4-next-outing-*` receipts govern the tally. Recording `media/p4-full-with-labelled-preflight.mp4` includes preliminary and final input,1920×1200,358.075s, video only. Critical stills were inspected; no continuous-video viewing claim.

### Actual reload

Executed real `location.reload()`, then Continue through production UI. `p4-before-actual-reload.json`, `p4-after-actual-reload.json` and `p4-reload-comparison.json` retain exact journal bytes before/after; **all stored state and metadata match**, including quantities, installed module and normal public/maintenance provenance. The production app remains usable after Continue (`media/p4-actual-reload-continued.png`). This checks actual persistence, not a fixture serialization round trip.

## Earned production P5 and labelled rebuild proof

Original pre-build input: `/tmp/siltwake-opus-stage1-r1/saves/final-before-paid-fabrication.json`, SHA256 **`b673cb90fc81b53cbdcbf0ee234582ae64141651e43319eceb3eae96caf0c50f`**. Imported unchanged; `p5-before-paid-build.json` exactly matches the original parsed save.

Ready here provides the primary Dart button. Actual activation pays **6 alloy,3 glass,2 membrane**, leaving1 glass; no grant/fixture mutation is involved in this P5 build. Current craft then shows **Dart owned — in cradle**, with the current exact duplicate-hull refusal beside its disabled button and the cockpit-side build feedback. See `probes/p5-paid-build-current-cradle.json`, `saves/p5-earned-built-dart.json`, inspected `media/p5-current-cradle-960.png`. Recording `media/p5-paid-build.mp4` is1920×1200,35.491s, video only.

Rebuild proof is explicitly **earned-P5-derived DISABLE + LOCAL STAGING fixture**, never ordinary recovery evidence. It disables the earned Dart and stages the diver at the collar; earned inventory is not increased. Actual UI deploys the earned buoy and salvages the empty Dart, returning its real6/3/2 ingredients/17CU to buoy. The fixture then stages diver+buoy at the workshop. Current craft disappears; the paid Dart returns to Ready despite historical `dart_base` crafting. Actual UI rebuild consumes6/3/2 and restores truthful Current craft. Receipts `probes/rebuild-fixture-{before-salvage,salvaged,paid-rebuild-ready,paid-rebuilt}.json` retain complete states/commands/events. Inspected stills show recovery costs and paid rebuilt Current craft. No ordinary-input salvage route is claimed.

## Labelled browser/native coverage

`production/fixtures/` is an untracked, visibly labelled diagnostic harness using compiled unchanged GameView, the owned PanelView and real `executeCommand`. It is separate from the byte-identical production build. Staging/grants in base context fixtures are diagnostic only; their results are not earned gameplay.

Twelve cases at both **960×600** and **1280×800**: field, pod, locked workshop, workshop, unsupported seat, disabled seated/local Dart, and Current craft cradle/moving/disabled/piloting/unrestored workshop. Every measured visible actionable control/summary/select/small/key is at least **12px**; zero horizontal overflow cases. Both P4 viewport audits also meet12px/no-overflow. Receipts: `fixture-matrix-960.json`, `fixture-matrix-1280.json`, `p4-fonts-{960,1280}.json`. Disabled recovery and unrestored-workshop captures were inspected; the DOM matrix also verifies that moving/occupied craft are not falsely labelled in cradle.

Native T3 Enter opens Move, Tab reaches its first transfer and Enter transfers. Receipts show:

- `native-disclosure-refresh`: same keyed disclosure, focus and scroll retained on refresh.
- `native-row-disappears-next-summary`: focus advances to **Move Silica glass**, not an equal-label command.
- `native-last-row-carried-fallback`: focus reaches `container-diver`/carried anchor.
- `native-closed-panel-departure`: same-site open state survives; depart/return clears stale rendered expansion.
- `native-explicit-storage-selection`: native destination select/focus remains Dart after refresh.
- `native-fit-success-focus`, `native-service-success-focus`: semantic fitting/vessel outcome anchors.
- `native-disabled-does-not-dispatch`: native and synthetic click attempts dispatch zero commands and leave exact state unchanged.
- `native-stale-transfer-refused`: previously enabled DOM is stale after departure; real simulation refuses without mutation.

`media/native-move-keyboard-960.png` and `fixture-disabled-seat-1280.png` were inspected. This is native keyboard/DOM coverage, not a substitute for independent accessibility review.

## Build, artifact manifest and preserved inputs

Artifact root: **`/tmp/siltwake-polish-1-experience-s2b/`**. `README.md`, `identity.json`, `validation-summary.json`, `workflow-comparison.json` and `pending-presentation-contracts.json` index the evidence. `summarize.py` retains the identity/comparison assertions.

All **27** final dist files byte-match the actual served production copy. Main artifacts:

| Artifact | SHA256 |
| --- | --- |
| `assets/index-DweItaR0.js` | `8241f7555ef19c9008b3b72ee2072f7fbcdfb17413d7c9b477ee2bc13c4b340f` |
| `assets/index-B5CLPKN9.css` | `d4daf0b55ac8582fa8bf7ef181505138abf4cc20b1a9f3f60803b337a639db3b` |
| `src/ui/panels.ts` | `ba5f50eaeb488c5b4524a882de7e4c0bb71a6e14cefe60cee93a787d4641aa6c` |
| `src/ui/panels.css` | `b14c77adacf949936a52027d59a86401a7a8d36c3b4ad68a13f54c54043c067b` |
| `tests/preparation-panels.test.ts` | `b33f4b5bc2b3b12e3f148dfc6e02e8a040444f998610b61e6f1b95478670f993` |

`production/index.html`/assets are unchanged build output; `observer.js` is injected only as a control/receipt helper and never mutates earned state. `fixtures/` and `inputs/` are additional served diagnostic/input paths. The three original Opus saves and served copies retain original hashes; third input `canopy-pre-warning.json` remains `3df46ef510e589675a422ebfbc62aaafcb626ecf3c89276c42cd5c03c219d305`. Historical artifacts and original saves were preserved.

**`manifest.json`** hashes every regular payload under this artifact root, **excluding itself**, with no symlink/external traversal: **220 payloads,12,365,622 bytes**. Manifest SHA256: **`1ceecb6cb64225a2b0d0be57826a8f50da07d308d1b72d94996a9b010e4e0163`**. Manifest size38,306 bytes is not included in payload bytes.

## Browser/process ownership and cleanup

Read `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md` before browser work. Used T3 preview status/open and one owned isolated/incognito tab/context/storage: **`tab_38_0430977b-1ed3-45f2-ac72-3683f9fe8942`**, loopback port**5192** after a free-port check (`port-before.json`). Gameplay used Drag mode and keyboard; no physical cursor capture or unattended Windows browser.

Ownership evidence is actual Linux `/proc`, beyond UA/loopback: `browser-process-open.json`, `browser-production-renderer.json`, `browser-renderers-before-close.json` identify **factory-worker**, Linux chrome-headless-shell executable, worker UID1000 and owned renderer **PID1991810** (renderer-client-id324), ancestry through827917 to shared browser**827911**. Renderer stayed identifiable through production/fixture work. The shared browser host was not killed or restarted.

Closed only the owned tab through normal lifecycle; renderer1991810 disappeared, while shared renderer**1992115** and browser827911 were preserved. Both recordings stopped. Owned Python preview server **PID1994578** terminated normally via its owned exec session; no listener remains on5192. `cleanup.json` records lifecycle/process/recording checks and no pointer lock; immediate plain bind in `cleanup-initial.json` was briefly affected by TIME_WAIT. `cleanup-final-verification.json` confirms **plain bind5192 succeeds**, owned renderer/server absent and shared renderer/browser present. Final preview status reported no owned tab/preview. No owned browser, server, recording or check process remains.

## Limits and root handoff

The12 shared-test failures remain explicit pending root/HUD reconciliation. No full-suite pass, integrated HUD acceptance, whole campaign, full next expedition, fresh-player duration/discoverability/enjoyment, audible-mix or representative-GPU claim is made. The headless/software-rendered captures establish bounded presentation/command evidence only. Large-bundle warning remains. Root must compose S2a/S2b, reconcile shared tests, inspect P1–P8 and obtain the independent acceptance pair and Opus verification before treating this leaf as accepted.
