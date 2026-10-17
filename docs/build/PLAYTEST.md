# Runtime and playtest evidence

No production game check has run yet. This log records actual observations, not planned tests as passes. The [acceptance contract](../DELIVERY_AND_ACCEPTANCE.md) defines required coverage.

For each run record candidate SHA, build/command, environment and renderer, input method, scenario, observed result, artifact, defect and retest. Label ordinary inputs, automated rule tests and diagnostic state injection separately. Record p50/p95/loading/memory only when measured and state the route/sample.

| Evidence | Candidate | Result | Limits |
| --- | --- | --- | --- |
| Historical richer-cel study | `20711d1` (art branch) | Visual direction accepted by owner; see art ticket | Disposable viewer; Linux SwiftShader, no production gameplay/GPU inference |
| Browser preflight, 2026-10-17 | Build tooling only; no game candidate | T3 `preview_status` then new incognito `preview_open` succeeded. Host `factory-worker`/Linux; local T3 chrome-headless-shell process and page UA agree on Linux, Chromium 154. WebGL 2 available. | Renderer: ANGLE Vulkan SwiftShader Device (Subzero), software rendering. This is browser availability, not gameplay or performance evidence. Root owned tab `tab_14_0430977b-1ed3-45f2-ac72-3683f9fe8942`; preserve others. |

Open: FND-01 production/browser smoke; first expedition; carrier/collision gates; both complete strategies; all hull niches; save resilience; repeated recovery; fresh-human route learning/story comprehension/duration; representative dedicated-GPU performance.

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
