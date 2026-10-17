# Runtime and playtest evidence

Foundation production checks exist; no complete expedition or campaign has been played. This log records actual observations, not planned tests as passes. The [acceptance contract](../DELIVERY_AND_ACCEPTANCE.md) defines required coverage.

For each run record candidate SHA, build/command, environment and renderer, input method, scenario, observed result, artifact, defect and retest. Label ordinary inputs, automated rule tests and diagnostic state injection separately. Record p50/p95/loading/memory only when measured and state the route/sample.

| Evidence | Candidate | Result | Limits |
| --- | --- | --- | --- |
| Historical richer-cel study | `20711d1` (art branch) | Visual direction accepted by owner; see art ticket | Disposable viewer; Linux SwiftShader, no production gameplay/GPU inference |
| Browser preflight, 2026-10-17 | Build tooling only; no game candidate | T3 `preview_status` then new incognito `preview_open` succeeded. Host `factory-worker`/Linux; local T3 chrome-headless-shell process and page UA agree on Linux, Chromium 154. WebGL 2 available. | Renderer: ANGLE Vulkan SwiftShader Device (Subzero), software rendering. This is browser availability, not gameplay or performance evidence. Root owned tab `tab_14_0430977b-1ed3-45f2-ac72-3683f9fe8942`; preserve others. |
| FND-01 author production smoke | `8d72dd2` | Ordinary controls reached reef, returned via pod ramp and walked on dry island. Save/reload retained exact pose/tick; corrupt/future imports preserved the entire journal; Esc pause stopped ticks and presented frames. See [full evidence and actual artifacts](evidence/FND-01.md). | Linux Chromium 154 / SwiftShader; no dedicated-GPU qualification. Real host focus switching was not induced; synthetic blur is labelled diagnostic. Context-loss/hidden-tab/storage-quota browser coverage remains incomplete. |
| Coordinator source/check inspection | `8d72dd2` | Source and actual rendered captures inspected; `npm run check` passed with 18/18 tests and production build. Economy checker passed eight scenarios and six rejection fixtures. | Vite main-chunk warning remains. Arithmetic is not physical recovery or route evidence; independent acceptance pending. |
| Round-one independent reviews | `2eb0244` | Both reproduced quota/competing-writer defects; Astra identified the exposed Vite advisory. Sol also induced WebGL context loss/restoration: paused while lost, explicit resume after recovery. Both accepted ECO proposal only. | FND rejected at this SHA. Induced context loss is diagnostic, not a real GPU-driver fault. Reports under `reviews/`. |
| Correction author checks | Author `79423ec`, integrated source `417a7ec` | 35/35 tests/build; ordinary movement/save/reload retained tick 288/pose; real quota fallback/cancel/export and malformed/future import preservation; native same-origin exclusion and queued-save cancellation diagnostics. [Full evidence/artifacts](evidence/FND-01-R1-FIX.md). | Browser fixtures are labelled; SwiftShader only. No later gameplay or independent correction acceptance. |
| Correction coordinator inspection/checks | `fbb4b5e` (source `417a7ec`) | Source/export/diff inspection; actual fallback and unsaved-HUD captures inspected. Fresh `npm ci`, 35/35 tests and Vite 7.3.7 build passed, matching `index-BMj4o6i9.js`. Audit has no Vite/high/moderate/critical entries. | One low Windows esbuild-server advisory and main-chunk warning remain. No fresh coordinator browser run; author ordinary/diagnostic evidence is explicitly attributed. |

Open: independent FND-01 review and remaining browser adapters; first expedition; carrier/collision gates; both complete strategies; all hull niches; full gameplay save resilience; repeated recovery; fresh-human route learning/story comprehension/duration; representative dedicated-GPU performance.

## First expedition run sheet (not yet executed)

Use normal game inputs and retain the start save, final save and recording/checkpoint captures. Complete an initial blind-route attempt before following an instrumented reproduction. Debug coordinates/inventory/state setters can diagnose failures but cannot establish completion.

1. New Game, opening, ordinary control. Identify the pod's storage/crafting/healing affordances and find a visible regional landmark from the refuge.
2. Leave, learn the reef source context, gather supplies and inspect the first evidence. Follow a regional lead to the island workshop without an exact pin for an undiscovered clue. Record actual route/time and places of confusion.
3. Unlock and craft the first equipment/hull using gathered stock. Check crafting consumes exactly the declared quantities and full inventory/blocked construction preserves stock.
4. Make a craft expedition with a readable wildlife warning, an evasion or deterrence response and a return with reserve power/air. Inspect both vehicle and personal suit limits.
5. Unload/store/craft or refit at refuge; manual save, close/reload, Continue. Check pose, craft/cargo/charge, resource depletion and discoveries. Pause/blur while moving and confirm no continued movement or resource drain.
6. Trigger a real failure through gameplay in a separate saved run. Return fed to a valid refuge, preserve knowledge/tools, find the identified cargo/disabled craft, recover or salvage it using reachable stock. Retry a failed rescue.
7. Repeat a representative route with selected cel art, sound and HUD; record visual/readability problems, empty travel and repeat harvesting. Reserve frame-time claims for an explicit measured sample and hardware record.

Carrier feasibility has a separate fixture and later a campaign run: station keeping, entry/exit, two compact craft including dry Spindle, blocked launch, safe release of the other craft, medium-berth reconfiguration only when empty, save/interruption at transition boundaries and death inside. A fixture pass proves the local mechanic only; later integrated routes must validate its campaign use.
