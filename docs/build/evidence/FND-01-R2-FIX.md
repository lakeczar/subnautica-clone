# FND-01 round-two correction: interruption intent and graphics readiness

Date: 2026-10-17. Author: implementation worker **gpt-6.1-sol / max**. This is author correction evidence for **FND-A4 / FND-SOL-R2-01**, not independent acceptance, M0 acceptance, campaign or performance evidence. Coordinator inspection and fresh separate Astra xhigh + Sol max reviews remain pending.

## Revision, ownership and scope

- Verified isolated worktree `/home/worker/.t3/worktrees/subnautica-clone/t3-65654059`, branch `t3/fnd01-interruption-lifecycle-fix`, clean starting HEAD **`6bd13d0b69f0d4e44db06475612e48638fa610e7`** before editing. Underlying reviewed source was integrated `417a7ec`, author `79423ec`, reviewed at `0a8ef04`.
- Correction source/tests/README commit: **`1e2c581c28d209a9a3263071a638d6652b7d60e1`**. This report is subsequent evidence bookkeeping; the production browser used exactly that source tree.
- Owned changed source: `src/runtime/app.ts`, `src/render/renderer.ts`; regression files: `tests/app.test.ts`, `tests/app-browser-support.ts`, `tests/app-loader.ts`; behavior wording: `README.md`. This report is the only changed build record.
- No session implementation/API, save schema/journal/writer protocol, dependency pin/lockfile, simulation/world/content, geometry/material/shader/asset or economy change. No earlier evidence was rewritten. No children, branch switches, parent-checkout edits, pushes, PRs or integration occurred.
- Read AGENTS, current STATUS/PLAN/CONTRACTS, the revised input, delivery/acceptance, the complete task, both full round-two independent reports and consolidated dispositions. Used the diagnosing-bugs skill's failing-loop discipline. Both original reports' three resolved findings remain preserved; ECO acceptance remains its previous provisional arithmetic/design scope.

## Cause and correction

The delayed replacement's `entered` event called generic Resume unconditionally. Current visibility/context flags could recover before that event and forget an interruption. The correction keeps one automatic-entry permission in the app for an accepted New/import/Continue request. It spans the file read, confirmations, write and any unsaved-fallback choice. The session's internal preparation pause preserves that permission; an external interruption or deliberate player pause revokes it for that request. Recovery does not restore it.

Completion consumes the permission. A revoked request installs its selected session **paused**, refreshes the menu and offers “Expedition ready. Resume when ready.” A fresh valid explicit Resume works after pending work/confirmation and graphics readiness permit it. Busy/blocked Resume returns immediately without queuing permission. Busy entry actions likewise cannot reauthorize a completion. A fresh New/import request after an earlier settled interruption is a new deliberate entry, so there is no permanently sticky pause. A mouse-lock release initiated by an internal pause is distinguished from an external release.

Cancellation/disposal remain owned by the existing session; the app does not roll back a completed disk write or change the existing disclosure. Continue, explicit fallback/export ownership, autosave deduplication and protected/conflict refusals retain their existing mechanisms.

For graphics, inspected installed Babylon **9.31.0**: `thinEngine.pure.js` forwards the native restored event into `_restoreEngineAfterContextLost`, whose `setTimeout` reconstructs effects/buffers/textures before `onContextRestoredObservable` fires. The earlier canvas event is therefore insufficient. The renderer now forwards loss from the engine, waits for the engine restored observable **and** `scene.executeWhenReady`, then notifies the app to request a real paused redraw. It refuses presentation while unavailable. Readiness never authorizes simulation resume. Own engine observers/readiness callback are removed on disposal; a generation/disposal guard rejects obsolete readiness work and the app also rejects late callbacks.

### Exact interface decision for coordinator reconciliation

`src/render/renderer.ts:25` changes the existing export to:

```ts
createRenderer(
  canvas: HTMLCanvasElement,
  availabilityChanged: (available: boolean) => void,
): GameRenderer
```

The callback is required: `false` on engine context loss; `true` only after engine reconstruction and scene readiness. It is not an initial-load promise or a resume command. `GameRenderer` itself is unchanged. `SiltwakeApp` is the only production caller. `canvas.dataset.graphics` exposes `lost`, `restoring`, `available` for diagnostics; existing `dataset.ready` still reports the result of a scene presentation. Neither dataset alone certifies visible recovery. No `ExpeditionSession`, `SessionEvents`, save or UI action export changed. The app now interprets the session's existing `pause` callback as preparation, separately from external/player pauses.

## Deterministic regression and checks

Before changing production code, ran `npm test`, then the focused `node --test .test-build/tests/app.test.js`. The focused loop had **17 cases: 10 passed, 7 failed**. New and import each failed after blur, visibility recovery and graphics recovery; native restoration also permitted Resume too early. The exact failed assertion was **`'playing' !== 'menu'`**, “entry must preserve the interruption pause.” Retained initial full-suite log: `/tmp/siltwake-fnd01-r2-fix/before-fix-tests.log`.

The final suite retains all **35 original meaningful tests unchanged** and adds **30 app composition cases**. Node's module loader substitutes only the app's browser view/input/renderer ports. Tests run the **real SiltwakeApp, session, native-lock adapter, repository, codec, fixed clock and simulation**, use UI action callbacks and window/document events, and assert presented screen/state, advancing or frozen simulation ticks, journal/backup state and cancellation outcomes. They do not merely count session events. Gates, bounded microtask flushing and a controlled RAF scheduler replace arbitrary sleeps. No production testing hooks or dependencies were added.

Coverage includes both delayed New and validated import: uninterrupted automatic entry; intervening blur/focus, hidden/visible and loss/reconstruction recovery; ongoing hidden/lost state; explicit player pause; ignored busy Resume/New/import/Continue; valid later Resume; prior settled interruption; unsaved fallback with and without interruption; queued Escape/disposal; slow-file interruption and cancellation; internal mouse release; native restored versus engine readiness; paused redraw and late readiness after disposal. Existing snapshot, deduplication, refusal/fallback/export and writer-exclusion tests still pass.

Actual checks in this isolated worktree, Node **24.21.0**, npm **11.19.0**:

| Check | Result |
| --- | --- |
| Fresh `npm ci --no-fund` | Pass, 18 packages installed. Existing esbuild install-script allowScripts notice retained. |
| `npm run check` | Pass: strict typecheck, **65/65 tests**, production build. `/tmp/siltwake-fnd01-r2-fix/check.log`. |
| `git diff --check` and staged whitespace check | Pass. Final report whitespace also checked before its commit. |
| Unowned save/session/sim/content/dependency/build-contract diff | Empty. |
| Production entry artifact | `dist/assets/index-DLXkZ6jy.js`, **1,134.38 kB / 280.16 kB gzip**. The >500 kB chunk warning remains. |
| Entry SHA-256 | **`a3be0c5477cce93887ddf7626c34349061b951591f11afc25e182674d047a92b`**. |

No dependency change or new clean-audit claim: `npm ci` still reports one low vulnerability. Retain the disclosed **esbuild 0.27.7 GHSA-g7r4-m6w7-qqqr Windows development-server advisory**, as documented in the preceding reviews. No separate audit, economy checker or unrelated art matrix was rerun for this lifecycle correction.

## Final production browser

Read `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md` before any preview work. Verified **factory-worker Linux**, locally owned T3 `chrome-headless-shell` processes; actual page UA **Linux Chromium 154**. Used `preview_status`, then one task-owned **incognito** tab at `http://localhost:5184/`, serving this checkout's final `dist/` through `npm run preview -- --host 127.0.0.1 --port 5184 --strictPort`. An initial `about:blank` URL argument was rejected by preview validation; opening the valid production URL succeeded. No alternative browser or Windows desktop was used.

Actual renderer: **ANGLE / Vulkan SwiftShader Device (Subzero)**, WebGL 2, Babylon 9.31.0. Viewport **1280×800 CSS pixels**, DPR **2**, Rich canvas **1280×800**; **12 meshes / 79,005 vertices**. No dedicated-GPU performance inference.

### Ordinary controls

Used actual New expedition, **R** cruise, **Escape**, **F5**, navigation/reload and Continue. Moved from the pod into swimming and saved at **tick 941**, pose **`(0, -1.3100560138343342, -8.376625009200703)`**, yaw **0**, pitch **-0.05**. Separate paused observations retained tick **941** and presented frame **176**. Reload → Continue → immediate Escape retained tick **941** and the same displayed pose; complete saved state is retained in `ordinary-save.json`. No teleports, gameplay state setters or direct simulation commands established movement.

### Controlled interruption / native-lock diagnostics

These are explicitly **synthetic blur/focus** and **induced `WEBGL_lose_context` loss/restoration** diagnostics, not real OS focus transitions or physical GPU faults. Each delayed case held the **genuine native exclusive writer Web Lock**, used ordinary New/confirmation or real file upload/Import & save controls, and observed one held plus one pending native request before release. The import fixture is the ordinary saved expedition above. The holder is a controlled same-page queue fixture, not a new multi-tab writer-proof claim.

| Production case | Result before any accepted Resume |
| --- | --- |
| Delayed New, uninterrupted | Automatic play after release, observed tick **160**; saved tick **0**, previous **941**. |
| Delayed validated import, uninterrupted | Automatic play after release, observed tick **998**; saved tick **941**. |
| Delayed New, synthetic blur then focus before release | Completed in menu at **tick 0 / frame 45**, unchanged across a further 60 RAF observations (~1 second). Explicit Resume then reached tick **85**. |
| Delayed import, synthetic blur then focus before release | Completed in menu at **tick 941 / frame 112**, unchanged across a further 60 RAF observations (~1 second). Explicit Resume then reached tick **1001**. |
| Delayed New, induced loss and ready reconstruction before release | Old session remained **tick 99 / frame 66** while still queued and visibly redrawn. Completion remained menu at **tick 0 / frame 67**, unchanged for 120 RAF observations (~2.1 seconds). Explicit Resume then reached tick **122**. |
| Delayed import, induced loss and ready reconstruction before release | Old session remained **tick 1008 / frame 135** while still queued. Completion remained menu at **tick 941 / frame 136**, unchanged across the next 60 RAF observations (~1 second). Explicit Resume then reached tick **998**. Entire saved envelope exactly matched the validated fixture; `gl.getError()` returned **0** after recovery. |
| Native queued New, import and manual Save + Escape | Each cleared busy and the pending native request before holder release, stayed at active **tick 1008**, preserved the entire journal bytes, and never re-entered after release. Native queues empty afterward. |
| Separate idle graphics-readiness diagnostic | At the native restored event, `graphics=lost`, `ready=false`, frame **162**. A diagnostic click on Resume at that early event was ignored. After readiness/redraw the app stayed menu at **tick 1008 / frame 163** across 120 RAF observations; no queued resume. |

A separate diagnostic click on the disabled Resume button during the busy New/blur case was ignored; no accepted Resume occurred until the completed paused state was observed. All later explicit Resume actions above used the ordinary focused browser control. A repeated import can produce identical journal bytes when both retained generations already equal that file; the successful import state/entry assertions are not inferred from a changed-byte count.

The native-event ordering was directly observed. For delayed New, native restoration at page time **67195.5 ms** still reported `graphics=lost`, `ready=false`, frame **65**; a later ready/drawn observation at **67226.4 ms** reported frame **66**. Import likewise reported native restoration with frame **134** still unavailable, then a ready/drawn frame **135**. The app did not present stale resources on the native event.

### Actual images and console

Captured and inspected real production images. The restored paused New view contains the island silhouette/foliage, water treatment, stones and amber pod ramp; the restored import view contains the underwater waterline/shore scene. They are visibly populated scenes after stable readiness, rather than a blank background or an inference from a frame counter. The completed replacement captures retain the menu. Worker-local artifacts:

| Image | Path |
| --- | --- |
| Reference paused New before graphics diagnostic | `/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcm22o8-4a7967d1.png` |
| Engine-ready paused New, write still queued | `/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcm2bp4-c5863da4.png` |
| Completed New still paused | `/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcm2luj-ac73049d.png` |
| Engine-ready paused import, write still queued | `/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcm45ed-52699856.png` |
| Completed import still paused | `/home/worker/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvcm476n-c20cd053.png` |

Across **three induced loss/restoration cycles**, console collection contains Babylon's expected three “WebGL context lost” / “WebGL context successfully restored” warning pairs and the startup logs. **No invalid-context/program/VAO warnings, console errors or failed production requests were observed.** The captured production resources returned HTTP 200. The canvas may clear while actually lost/rebuilding; intermediate visual frames were not exhaustively sampled. This establishes stable paused recovery on this renderer, not a guarantee of zero transient blank frames or compatibility with a real GPU-driver fault.

### Retained evidence and cleanup

- `/tmp/siltwake-fnd01-r2-fix/browser-observations.json`: exact ordinary state, **41** subsequent labelled observations, native event timings, renderer, full collected console/network/action records and screenshot index.
- `/tmp/siltwake-fnd01-r2-fix/browser-fixture.js`: bounded task-only read/lock/event diagnostic helper; no game-state setter. No fixture was added to the served production artifact.
- `/tmp/siltwake-fnd01-r2-fix/ordinary-save.json`: validated import fixture from ordinary movement; whole-envelope equality was observed after import.
- `/tmp/siltwake-fnd01-r2-fix/{before-fix-tests.log,check.log,source.patch,cleanup.json}`: failing loop, final check, exact source change and resource cleanup records.

Owned tab **`tab_1f_0430977b-1ed3-45f2-ac72-3683f9fe8942`** closed through `t3_preview_close`. Held/pending native lock lists were empty; no iframe was created. Cleared the file input and restored the initially empty task-origin storage, then removed the page helper; closing the owned page removed its remaining diagnostic event listeners/context. Stopped only the owned production server session **80836** with SIGINT (exit 130); port **5184** verified free. Preserved shared/human tabs, including coordinator tab14, and all shared browser hosts. No real pointer lock was requested.

## Remaining limits / coordinator handoff

Real OS focus switching, real hidden-tab transitions, physical GPU faults, unsupported-WebGL startup and other browsers remain unverified. Unit events are adapters; the browser blur/focus and graphics fixtures retain their diagnostic labels. Renderer observer cleanup was inspected and late-callback no-resurrection was tested at the real app boundary; native engine disposal at every internal reconstruction instruction was not exhaustively exercised.

No browser quota/fallback/export or cross-context competition matrix was repeated: those implementations are unchanged, their original regression tests all pass, and the new composition tests additionally cover fallback entry with/without interruption. Earlier reports remain the evidence for their previous actual-browser runs. The low esbuild advisory, large chunk, sparse early art, dedicated-GPU and human duration/enjoyment gaps remain disclosed. No independent acceptance, M0, M1, campaign, public deployment or performance claim follows from this correction. Coordinator should reconcile the renderer readiness callback/preparation-pause semantics, inspect/cherry-pick the exact source and evidence commits, freeze the next candidate and request the fresh paired reviews.
