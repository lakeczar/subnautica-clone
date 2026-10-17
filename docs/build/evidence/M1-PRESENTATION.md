# M1 presentation author evidence

2026-10-17. Bounded implementation by GPT-6.1 Sol at MAX; provisional for coordinator assembly and fresh non-author Astra xhigh / Sol max review. This does not accept M1 or the production baseline.

## Source and ownership

- Started clean at `411fb1d355b85dcd876f4bc337e93c3fc2cfadba`, resolved from the requested parent `411fb1d`, on `t3/m1-presentation-clarity`.
- Initial presentation commit: `2ac55ef18169cfdd6cfef6c2f6195702fe2e11b2`.
- Final source: `6c994350d95d796e28a3fddaa4fd00dc01ec6faa` (small display corrections and recovery-presentation regression added after the first browser checks).
- Changed only `src/ui/view.ts`, `src/style.css`, `src/audio/sound.ts`, `tests/sound-origin.test.ts`, new `tests/presentation.test.ts`, and this evidence file. No dependency/config changes, other-owner edits, parent assembly, push, PR or children.
- Read the task/specification, story design and spoiler canon. Existing registry text and saved provenance remain unchanged. This report contains no major story reveal.

## Delivered behavior

Preparation uses the existing `craftingRefusal`, `fabricationContainers`, `available`, `containerAccessible` and registry definitions. Known recipes show reachable ingredient quantities, exact shortages, prerequisite recipe names, required bench, public versus maintenance inputs, authoritative refusal and readiness. Remote lockers and craft cargo do not count as reachable bench inputs. Installed recipes show quantities already used. Buttons dispatch the existing commands; the view never spends, moves or optimistically awards anything.

The hold identifies accessible destinations, quantities, capacities, retained equipment, nearby and distant storage, reserve-cell charge and compatible service actions. The buoy reports packed/deployed state, capacity and packing conditions while preserving its one existing identity. Disabled Dart actions explain local collar/staging requirements, patch cost, tow confirmation and empty-frame salvage. Healthy craft do not advertise disabled-hull recovery actions.

The notebook retains actual finding order and exact saved provenance, with observations, hypotheses and regional leads. Current questions adapt to C01–C04 without adding clue locks or requiring the optional personal note. Known source habitats come from already collected/scanned registry sources; undiscovered deposits and coordinates are not revealed. Known refuges show direction, distance, depth and their actual service differences. Visited cargo contents/loss transponders and active Bobbin phases have guidance without claiming a completed physical rescue.

Opening checks show their current action, progress and previous-check completion. Disabling opening captions retains the action/detail text. The setting is labelled **Opening captions**, matching its actual effect; hazard warnings, action results and notebook text remain readable. The HUD keeps concurrent oxygen, personal pressure, hull/power, health, food and hunter warnings instead of hiding every lower-priority condition behind one selected message.

Blocking panels focus Return on opening, wrap Tab/Shift+Tab within the dialog, identify the active navigation item and preserve focus after a command refresh. Validated results remain visible in a panel status area after the transient toast. Range inputs apply during movement of the control. Menus with expanded settings can scroll from the top; recipe/container layouts wrap and text is larger.

Audio remains original local oscillators plus deterministic filtered noise; no remote clips, model API or external assets. Sanctuary, surface and submerged ambience use different levels. A0 `origin?: Vec3` remains transient and unchanged: **only explicit origins pan**. Body/equipment cues remain centred, including when a hunter exists elsewhere. Repeated warnings collapse per centred/spatial category; a real threat and body warning can coexist. Higher-priority recovery/damage/warnings preempt action tones, active alarms duck ambience, and transient voice count is bounded. Active-to-paused transitions stop gameplay tails; inactive ambience fades to zero, while a deliberate paused-panel command may still have feedback. Disposal stops/disconnects the owned graph once and prevents reactivation.

## Checks on final source

`npm ci` succeeded. `npm run check` on `6c99435` passed strict typecheck, **124/124 tests**, and the production build. Full log: `/tmp/siltwake-m1-presentation/final-check.log`. The existing large-main-chunk warning remains. No economy/core requirements were changed; this worker did not repeat their unchanged arithmetic matrix.

Eight focused presentation/audio tests cover reachable bench quantities and excluded cargo; command dispatch without state mutation; both early clue orders/missing optional record/unknown-source concealment; captions-independent concurrent warnings; buoy identity/local transfers/persistent refusal; visited recovery information; detached origins and listener yaw; warning overlap/priority, activation, mute/volume, pause and disposal. The small DOM port tests output and wiring, not browser layout or an earned route. Recovery and hazard states in unit tests are explicitly diagnostic fixtures.

Final production artifacts:

- `dist/assets/index-BGT_D_6j.js`, SHA-256 `39faf8ff647e53ba4bc4e2b52b305b469e9b5b0e19338aa3ea54b2441c19a772`.
- `dist/assets/index-DONjl4IF.css`, SHA-256 `14756146fd5523913bc59b8079703e86ae867d0250079c88ed57e6198ab0a797`.
- The browser loaded that exact final JS filename after reload. The archive includes the complete final `dist` and observation JSON.

## Focused production-browser checks

Read `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md` before browser work. Verified `factory-worker`, Linux x86_64 and local Chromium processes. Used T3 `preview_status` then `preview_open`, own incognito tab `tab_1u_0430977b-1ed3-45f2-ac72-3683f9fe8942`, and strict free port **5192**. No other tab/server was operated or killed.

Hardware/browser: Linux Chromium 154, WebGL 2, ANGLE Vulkan **SwiftShader Device (Subzero)**, DPR 2; host reports i5-12400, six exposed CPUs and 12,248,836 KiB RAM. Browser command line includes `--mute-audio`. Tested 1280×800, 1366×768 and 960×640 CSS viewports. This establishes neither dedicated-GPU frame rate nor an audible listening pass.

Inputs were T3 mouse/key controls, file-input imports and short DOM keydown/keyup segments through the real `PlayerInput` for movement/panel leakage. No direct simulation commands, pose setters, teleports, seeded inventory or modified save data were used in the browser. Audio instrumentation wrapped native node creation to observe actual contexts/gains without substituting audio nodes. Reading local journal snapshots was observational.

Final-source observations (details in `browser-observations.json`):

1. Actual reload/Continue restored quality Light, sensitivity 1.8, inverted mouse checkbox, volume 0.25 and opening captions off. No AudioContext existed before deliberate Continue; one running context existed afterward. Light rendered 853×533 at the 1280×800 viewport; Rich rendered 1366×768 at that viewport size. Expanded menu remained scrollable from positive top offsets without horizontal overflow.
2. Unmodified reef-first earned save displayed C01 → C02 → C03 → C04, all four provenance strings and the updated C04 question. Unmodified island-first earned save displayed C01 → C03 → C02 and the combined early interpretation. Both lacked the optional personal note; unknown Canopy source habitats stayed absent from the island-first notebook. Known refuges correctly distinguished restored workshop service from the laboratory air pocket.
3. At the island-first pod, reserve-cell recipe showed alloy **2/2**, glass **3/2**, membrane **0/2, need 2**. Clicking Fabricate produced the authoritative refusal. Holding W for 400 ms while the panel was open left tick **4313**, pose **(-0.253, 0.180, 20.149)** and yaw/pitch unchanged. Panel feedback persisted and focus remained on the command.
4. Deployed the existing buoy, moved three glass into its separate hold, and attempted packing. UI reported **3/24 CU** and the core refusal to empty/approach it. After taking the glass and packing, manual save recorded exactly one buoy item `item_6`, packed in the diver hold, with the same `inventory.buoy.itemId`. No duplicate identity or cargo appeared. Tab from the last panel control wrapped to `panel-return`; Shift+Tab returned to the last control.
5. At 960×640 the fabrication panel was 960 px wide, no article/button crossed the horizontal viewport, and body text was 14 px. At 1366×768 inventory also had no horizontal overflow. Actual final notebook, inventory and recipe captures were inspected.
6. On final source, mute settled the real master gain to **0**, with all three ambience gains **0** during pause. Unmuted volume 0.25 gave master **0.25**. One running context was retained for paused-panel feedback. These are native AudioContext/control observations, not audible mix validation.
7. New Game with captions off showed `POD CHECK 1 / 4`, `Release restraint · E`, and the essential action details. Four ordinary E presses completed the opening and J displayed C01. A short recording and its extracted actual frame were inspected.

Earlier checks on `2ac55ef` (before the final small display fixes) additionally completed the same opening with captions on, fresh-empty crafting refusal, 600 ms panel movement freeze at tick463, settings changes, inventory transfers, and ordinary local movement from the imported workshop save to board its Dart. The actual boarding prompt showed **suit150 m / hull180 m** and personal exposure outside. Do not attribute that boarding check to a full final-source expedition or a blocked deep exit.

One preview click timed out (`Preview automation click timed out after 15000ms.`) because the notebook shortcut was issued before async import entry settled and the panel was still closed. A fresh snapshot/key press corrected it; subsequent imports explicitly waited for the visible HUD before opening a panel. Final snapshot console contained only Babylon WebGL2 startup messages; no browser console errors or failed network entries were observed.

## Earned-save provenance and artifacts

Original files under `/tmp/siltwake-m1-01/` were preserved unchanged; archive copies are byte-identical:

- `island-first-handoff.json`: original author `5fd6338` / `index-C0WmyEai.js`, session `943e7dd1-aeba-4a93-be2d-18c28fe56e8d`, saved `2026-10-17T18:20:32.297Z`; C03 before C02. SHA-256 `e1700a64bbb87180ad9f11e599376fe7e2a4acf3bf4885d79ad6564d53448c01`.
- `normal-end.json`: earlier implementation route / `index-DUS1lGxc.js`, **predates final `5fd6338`**; session `cedc4843-9c6d-42ed-b482-a7b0482460db`, saved `2026-10-17T18:04:12.053Z`; C02 before C03 and C04. SHA-256 `2db21f77be2bbfbccc74923a35738aa1ab39ccdbbcb3f2e48b85315515c1c567`.

These targeted replay origins come from `M1-01.md`; they do not prove a newly earned final-source route or repair that earlier route’s failed preparation reserve. CORE owns the complete new route.

Artifact directory: `/tmp/siltwake-m1-presentation/`. Handoff archive: `/tmp/siltwake-m1-presentation-artifacts.tar.gz`. `artifact-sources.json` maps copied names to original T3 artifacts. `browser-observations.json` retains exact measured values. Useful final-source files:

- `finalReefShot.png`, `finalIslandShot.png`: notebook/order views.
- `finalCraftShot.png`, `finalNarrowShot.png`: quantities, refusal and smaller viewport.
- `finalBuoyShot.png`: loaded buoy and packing refusal.
- `finalOpeningShot.png`, `opening-recording-frame.png`: captions-off actions in the actual game camera.
- `finalRecording.mp4`: short notebook/crafting interaction, about two seconds.
- `finalOpeningRecording.mp4`: four-second opening interaction; H.264 video only, 2732×1536 capture pixels. No recorded audio/listening claim.

## Exact integration dependency, proposals and limits

**Pending CORE dependency:** baseline `src/sim/step.ts` successful transfer calls `transfer(...)` without changing `draft.feedback`. The actual UI correctly moves cargo but repeats an older collect/craft notice (reproduced: transferring three glass to the pod repeated the older two-glass collection message). Requested core result: set successful transfer feedback from the committed quantity, item and destination while preserving all refusal/conservation/provenance semantics. Coordinator confirmed steering CORE to fix and regress this. This branch intentionally contains no optimistic UI workaround or copied core file. Combined source must recheck the resulting message.

No registry/provenance, command/event API, geometry or save-schema change is requested. The UI consumes all frozen interfaces unchanged. No new campaign scope, marker system, registry or recovery mechanism was added.

Not executed/established here: full final-source earned expedition/return margins; gameplay-triggered and repeated physical loss/recovery; seeded carrier/launch matrix; blocked deep exit through ordinary inputs; an audible warning/ambience mix or consumer-GPU performance; fresh human comprehension/enjoyment or campaign duration. Hazard combinations, loss/cache presentation and alarm origin/priority have meaningful diagnostic tests, not a browser-earned hazard/recovery pass. Combined final play and independent batch/M1 reviews remain coordinator work.

## Closed resources

Both recordings stopped and transferred normally. Closed only the owned T3 tab through `t3_preview_close`; the task’s subsequent preview list was empty. Stopped only the owned Vite preview via its session’s Ctrl-C (exit130); a fresh bind confirmed port5192 free. No children, push, PR, parent mutation or shared/human tab changes. Source worktree was clean before this evidence-only addition.
