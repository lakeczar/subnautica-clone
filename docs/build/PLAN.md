# Construction plan

The [delivery gates](../DELIVERY_AND_ACCEPTANCE.md) own acceptance. This plan sequences implementation and does not reduce the requested campaign. A batch and a milestone each need the dual review gate. Later batches become concrete after the preceding runnable interfaces are integrated.

| Milestone | Bounded work | Playable exit and dependency |
| --- | --- | --- |
| M0 — Foundation | FND-01 pinned scaffold, renderer-independent simulation/save contracts, local save boundary, launchable richer-cel scene and build checks | Clean install/build/launch, new/continue/save boundary, pause/focus/input smoke; contracts reconciled and committed before dependent worktrees |
| M1 — First expedition | Resource/recipe budget; pod/opening and first clues; reef/island route and habitat sources; first craft; readable wildlife; recovery; art/UI/audio integration | New Game through investigation, crafting, craft use, retreat, failure/recovery and save/reload via normal controls. Early collision and simplified carrier berth feasibility must pass before expansion |
| M2 — Fleet/world skeleton | Region streaming and routes, pressure tiers/suit refits, six hull roles, station-kept carrier interior/isolated berths, rescue topology and both completion strategies | All regions connected; both strategies reach a functional ending; dry Spindle plus another launch, blocked exits, interrupted transitions and all-advanced-hulls-disabled recovery tested |
| M3 — Authored campaign | All C01–C15 placements and out-of-order interpretation, distinctive optional expeditions, lore/scene/audio and cel asset iteration | Complete opening, middle and ending; all hulls have a useful mission; optional journals/hulls do not block finish; no placeholder interactions |
| M4 — Polish/release candidate | Dedicated Astra xhigh game-design critique after M3; fixes and focused re-review; controls, accessibility/settings, route/economy tuning, atmosphere, profiling, persistence resilience, start-to-ending and second-session evidence | Design findings dispositioned, applicable blocking findings resolved, existing dual acceptance gate passed; reviewable playable artifact and integration PR. Duration/enjoyment and dedicated-GPU evidence remain explicit exceptions if unavailable |

## FND-01 acceptance

1. Strict TypeScript, pinned Vite/Babylon.js and lockfile. Bundled runtime; documented clean install/dev/build/preview/check commands. WebGL 2 support failure is clear.
2. Renderer-independent typed IDs, state, commands/events, fixed-step update and versioned save boundary. Plain serializable state contains no Babylon objects. One content-ID authority reflects the accepted regions/materials/fleet; no competing lore registry.
3. Launchable original richer-cel shallow-ocean foundation with recognizable refuge, island landmark, waterline and player movement. It is visibly an early build. Menu/HUD/controls are usable, not a promise that later campaign content already works.
4. New Game/Continue, safe local save/load and import/export boundary, pause/focus behavior. Invalid/newer/corrupt saves fail without silently overwriting valid progress. Exact migration policy recorded.
5. Meaningful tests exercise save round-trip/invalid data and fixed-step/pause boundaries. Production build and actual browser smoke cover scene loading, ordinary controls, pause and reload if isolated Linux automation is available. Evidence states all gaps; simulation injection does not count as ordinary-input play.
6. Return commit, changed paths, actual checks, evidence locations, proposed contract changes and known gaps. No dependent implementation dispatch by worker. Both independent reviews follow coordinator inspection.

## Integration order

The owner requested an additional dedicated game-design critic near the end. [DESIGN-CRITIC](tasks/DESIGN-CRITIC.md) runs on the full playable campaign at the M3-to-M4 transition, with correction time reserved before release. Primary-source research has returned and is pending independent review; it is not a review of the current incomplete game. A fresh non-author Astra xhigh critic examines the actual game, and Sol max implements accepted fixes. Keep the separate Astra/Sol technical acceptance pair.

One main builder owns the first runnable baseline. After reconciliation, split along proven module seams: simulation/progression, renderer/assets/world presentation, and content/UI/audio as appropriate. Assign exclusive paths and one composition owner. Use T3 worktree delegation from a committed baseline for independent checkouts. Integrate small commits and test combined behavior before expanding scope.

Construction PRs target `game/siltwake`; the final integration PR targets the appropriate reviewed base/main and makes its planning dependency explicit. Main merge/public hosting are separate owner actions. Reviewed implementation can be integrated into the game branch without another confirmation.
