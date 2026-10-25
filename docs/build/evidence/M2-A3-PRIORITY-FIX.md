# ROOT-A3-01 — deferred bite onset priority correction

2026-10-18. Bounded Sol6.1/max implementation leaf under root Astra xhigh. Provisional for root inspection/composition and the complete A1–A3 independent pair; no feature/batch/M2 acceptance is claimed.

## Provenance and scope

- Required clean parent **`5a653810c1082d454093f91fb1971ea8d03b69a6`**, verified before edits. Source commit **`8ce6bd2b54e6c885c2f7a9747ac05d54e141a57a`** is directly on that parent. Branch `t3/m2-a3-priority-fix`; T3-bound isolated cwd `/home/worker/.t3/worktrees/subnautica-clone/t3-e9d93c96`. Initial Git status, T3 binding and selected configuration are retained.
- Actual original runtime **`gpt-6.1-sol` / `max`**, original session `/home/worker/.codex/sessions/2026/10/18/rollout-2026-10-18T22-00-29-01a1521a-7c74-7873-bb37-a6f7f54f948d.jsonl`, line8 `turn_context`, timestamp `2026-10-19T03:00:30.314Z`. Exact unmodified record: `/tmp/siltwake-m2-a3-priority-fix/original-turn-context.json`, SHA256 **`4908390e39a909abb66afd23f9e894c3e7455bbfd8dc97c136791d658388557a`**. It records this cwd/model/effort; `runtime-proof.json` locates it.
- Read AGENTS, current STATUS/PLAN/CONTRACTS, the [correction brief](../tasks/M2-A3-PRIORITY-FIX.md), [original A3 brief](../tasks/M2-A3.md), [root contract](../design/M2-A-CONTRACT.md), [original author evidence](M2-A3.md), [integration finding](M2-A3-INTEGRATION.md), revised input and applicable integration/delivery/presentation pointers, settled map/tracker and producer/reconciliation/terrain evidence. The diagnosing-bugs skill supplies the red/green loop; root's already isolated cause makes speculative diagnosis/instrumentation unnecessary.
- Only `src/ui/hud.ts`, `tests/app.test.ts` and `tests/presentation.test.ts` change in the source commit. This new report is the separate evidence commit. No app, simulation, camera, state/schema/save, CSS, audio engine, renderer, configuration or public-interface change. All pre-existing assertions remain. No children, peer waits/polling, unfinished A2 dependency, push/PR/merge or parent mutation.

## Change and priority ownership

`HudView.notify` now calls the existing private `cancelDamageAnnouncement()` when the arriving notice has `channel: hazard` and context `hull` or `recovery`. The outcome itself invalidates the timeout and advances its version, independently of another `threat-damage` event. A queued or already-dequeued obsolete callback cannot write afterward; any delivered onset text is cleared. No new queue, event classification by prose, health-delta inference or interface is introduced.

The existing recovery path still clears invalid damage. A disabled still-controlled hull retains its truthful raw bite episode/chip and independent collision total/flash. Ordinary positive onset, per-step identity/accumulation, active-time episode expiry and original audio arbitration stay unchanged. Hazard banners, ordered full exit refusals, action results and persistence errors keep their existing owners/channels. Non-hazard hull-context notices and unrelated hazards do not cancel ordinary onset.

The real app already forwards outcome notices before each step's `presentationStep`; no `app.ts` arbitration edit is needed. The new app regression delegates to actual production `HudView` for notification/damage/timing behavior, replacing only DOM/timer ports. Real app frames and simulation steps produce a bite at tick17, then a pressure-disable batch at tick18 after explicitly staging the same actor in deep water outside pursuit. That batch has no second bite. The double adds no cancellation logic.

## Checks and red/green evidence

Locked `npm ci` succeeds; Node24.21.0/npm11.19.0. Commands and exit codes are in `*-results.json`; complete logs remain unfiltered.

| Check | Exact result |
| --- | --- |
| Baseline `node_modules/.bin/tsc -p tsconfig.test.json`, then `node --test /tmp/siltwake-m2-a3-priority-fix/priority-probe-local.mjs` | Compile passes; root diagnostic **4/5 pass**, added priority assertion fails with obsolete `Bitten · hull −0.2%` after HULL DISABLED. The copied script changes only imports to this worktree. Original root script/log remain byte-identical. |
| New tests before source fix, compiled then run with name pattern `later hull outcome\|later recovery outcome\|other notices preserve\|later real pressure-disable` against the app/presentation files | **1/4 pass, 3 fail** at the actual obsolete-onset assertions; later recovery control already passes. `regression-red.log`. |
| Fresh test compilation, then `node --test .test-build/tests/presentation.test.js .test-build/tests/app.test.js .test-build/tests/encounter-presentation.test.js .test-build/tests/m2-route-presentation.test.js` | **181/181 pass**, zero skipped/todo/cancelled. Original timing, simultaneous disable/recovery, multi-step totals, one onset/no churn, actor/lifecycle/pause/panel/graphics and refusal/persistence paths remain covered. |
| Original copied root diagnostic after fix | **5/5 pass**; chip remains, hazard speaks, deferred onset is empty. `root-probe-green.log`. |
| Clean generated-output rebuild, full **`npm run check`** | **Exit1; 486/487 pass**, zero skipped/todo/cancelled. Production typecheck and all test compilation pass. Sole inherited failure: `resource-surface.test.ts`, `actual source and persistent-host triangles stay supported, visible and stock-driven through replacement`, **`basin_ridge_salvage_north: target ray above actual terrain`**. A2 owns it; no filtering/weakening. Chained build stops at this failure. |
| Standalone **`npm run build`** | **Exit0**, production typecheck/build pass; existing >500kB chunk warning remains. |
| Source/artifact audits and `git diff --check` | Pass; only assigned paths changed, all97 source/test/config inputs and27 build files retained, original root repro hashes unchanged, every archived payload verified. |

Four new regressions cover later hull cancellation without a second bite, real app event delivery to actual HUD, later recovery, non-qualifying notices and renewed ordinary onset. They additionally check collision/bite separation, no transient damage-live-region write, ordered repeated full exit refusals, persistence precedence and callback invalidation after cancellation/reset. No unchanged historical, migration, economy or whole-route matrices were rerun.

Final production entry **`assets/index-Dwgj2BH-.js`**, **1,431,385 bytes**, SHA256 **`249bb2b8af5f328e92994486fccb4329f88031f7a033a90850045f21432fddfe`**. Source/build manifests bind these bytes to the source commit above.

## Native production DOM diagnostic

Read both fleet and repository browser rules before browser operations. T3 status/open created one owned incognito tab on verified **factory-worker Linux**, Chrome154, WebGL2 **SwiftShader**, Rich, CSS**1280×800**, DPR2, own initially free port5192. No Windows automation or physical desktop capture. No recording/screenshot/layout/performance claim.

`make-native-seed.mjs` uses real paid prerequisites/fabrication and strict codec validation, then explicitly stages an already moving Dart with0.3 hull beside the Canopy laboratory. It is **seeded mechanics evidence**, not earned progression. Its two-step actual-module oracle emits one0.2 bite at tick17; collision removes the remaining0.1 at tick18 and produces hazard/hull disable, with no second threat-damage event.

The unchanged final production bundle imports that save through normal UI. A temporary page-only RAF wrapper runs the existing app callbacks at fixed-step-spaced timestamps within one scheduling turn; native zero-delay timers then flush normally. No source/bundle/app-state injection occurs after import. Exact executed browser tool expressions are retained in `native-tool-calls.json`.

`native-result.json` records before steps, after bite, after later disable and after native timer flush. Its MutationObserver captures **3 text mutations: 2 chip updates, 1 HULL DISABLED update, 0 bite-onset updates**. Final chip is `Bitten · hull −0.2% · impact −0.1%`; the separate assertive damage region stays empty. `native-before.json` proves the original empty region. The observer's added text nodes retain intermediate values even though callback-time text reflects the final DOM.

The exact8,801-byte production export in `native-final-export.json` retains tick**18**, disabled still-controlled **dart_20**, position **(116,-116,-133.60001211792593)**. Its actual yaw2.4940926535897923/pitch0.8 differ from the neutral-input oracle because synthetic captured-mode pointer movement on import contributes look input. Only the four linked player/hull yaw/pitch fields differ; **all other state fields match**. `native-verification.json` records this distinction, actual pose, seed/export hashes and strict-codec readback. No full-state equality or ordinary-input claim. The tool receipt retains exact Blob text; after tab cleanup removed its temporary download, those original bytes were recovered from the receipt without serialization.

This proves native DOM delivery/cancellation, not human screen-reader speech, audible mix, natural timing, consumer-GPU performance or the fresh earned Canopy–Basin route. A2 art/terrain is absent. Root composition and fresh whole-batch Astra xhigh/Sol6.1 max review remain required.

## Artifacts and cleanup

All new retained artifacts: **`/tmp/siltwake-m2-a3-priority-fix/`**. Start with `HANDOFF.md`, `verification.json`, `native-verification.json`, the raw red/green/check/build logs and source/build manifests. **180 payloads / 3,572,235 bytes** are retained with exact source/build copies and the original runtime context.

- `manifest.sha256`: **`f6160183998bdecfc80b031dd2977438d2a776ceafa62009c8b1c0341b3d985c`**.
- `artifacts.tar.gz`: **909,964 bytes**, SHA256 **`d49380283f44dd56e15849d3d803fd1ecd6a0ca93189dca9862477c0fcf115df`**. All payloads and the manifest were verified against archived bytes. Terminal `archive.json`/`handoff.json` stay outside the archive to avoid circular hashes.

Page observer/RAF/URL wrappers were restored while paused; pointer lock was released. The owned tab closed through normal T3 lifecycle; `browser-after-close.json` shows no tab. No recording was started. Owned5192 preview server stopped via its exec session Ctrl-C (exit130); `port-after-stop.txt` has no listener. Shared/human/A2 tabs, browser hosts, storage and servers were preserved. All check commands are terminal. Source checkout was clean at the source commit; final handoff records the separate report commit and clean status. Owned paths/resources are released to root. Stop this bounded task; no acceptance or further dispatch is performed here.
