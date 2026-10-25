# POLISH-1A provisional integration

2026-10-18, Astra xhigh coordinator. Source assembly **0b071354a629fd84235eecf3eb2f72403c7e4204** merges author commits **74357dfc1f61eaca0dc84f0f35c7ee98bef10235**, **b92188be0d31f217034eedf862260b8ff176676f** and evidence **49c9454** into the clean feature checkout at56204aa. The Sol6.1/max author started from61fcc3033292f9412a795a2388616a4f926ece22 and returned a clean worktree, no children/questions/browser/server. Its terminal task result was acknowledged. [Author evidence](POLISH-1A.md) retains complete interfaces, metadata, diagnostics and limits.

Root inspected production changes and tests against the original assignment and three recorded ownership amendments. The16 changed paths remain within that scope:15 source/test paths and the sole author evidence document. No save schema, source position/yield/provenance, recipe, hull, movement or damage-formula change. The modules test correction gives its fixed-negative-Z speed fixture an explicit yaw0; all speed/drain/precedence assertions remain.

## Reconciled interfaces

- `targeting.ts` exports pure current-state `aimRay`, `interactionHost`, `aimedInteraction` and the frozen `AimRay`, `InteractionHost`, `InteractionVerb`, `AimedTarget` types. Original strict body reach, forward cone and LOS apply even inside host spheres. Centered known evidence wins; no stale target cache.
- `WorldQueries.lineOfSight(a,b,ignore?)` uses supplied solid boxes, canonical rib geometry only for matching registered bounds, and supplied terrain. Local query worlds do not inherit global geometry. Movement collision is unchanged; its separate rib refinement remains slice2.
- Transient `interaction-panel` carries validated panel/target intent; `impact` carries positive actual clipped hull loss/speed/detached origin. Both remain unsaved. Runtime consumption belongs to1B and is not yet present.
- `DART_BUILD_YAW=Math.PI` applies only in new fabrication; decoding, `makeVehicle` and legacy headings remain unchanged. Minimal prompt adoption shares the same selected target/action.
- Shared `INTERACTION_HOSTS` metadata drives the three stock translations (workshop+.25m, headland+2m, west glass+1.25m), headland persistent frame+.5m and visible target datums. Only96 existing headland frame vertices move; other environment geometry and all34,189 terrain vertices/topology match the original. Shore-food meshes are unchanged.

## Root verification

`npm run check` passes **231/231 tests**, typecheck and production build. `scripts/check-m1-economy.mjs` passes unchanged. Diff whitespace checks pass. Main JS **index-DsUTodfi.js**, SHA256 **f1cf5f99bed1c9cc92c72d4ec96ddfe39cdcf025ad2e9ff86cb614de3084f68b**; index HTML SHA256 **d8150446cbabc4603678c30340249989f6d7c425d0ec619e2c53f00000658b09**. All27 author build hashes match root output. The existing large-chunk warning remains; this is no GPU benchmark.

Root verified15 source/test hashes against committed author blobs and its clean worktree,27 build hashes,17 receipt hashes/byte counts, and five original earned save hashes. No author artifact or original save was modified. Root-source copies of the author geometry and action/save scripts reproduce identical JSON receipts:28 static hosts,20 actual rendered-terrain source rays, three depleted anchors, six unchanged definition groups and five exact earned-save roundtrips. Geometry JSON SHA256 **3699c44004b986f163044158aefb948bfc5030940d201a921c764710c8dc235b**; action/save receipt **62731d7b5b675d48ae140e4eb991659a81d5d6a2de640a136e58d9c930edea89**. These are inspected author diagnostics rerun by root, not independent playtests.

Root additionally wrote an independent optical diagnostic using convex minimization of point-to-rib-axis distance along each sight segment, rather than the production segment-distance algorithm. **2,304 segments across36 ribs**, including degenerate points, and all2,304 reversed rays agree with production:196 blocked and2,108 clear. Receipt SHA256 **0956d09aaabe28f0ef33ac7c2bbdab52ac0969d60c8bf9b6f65b3ce3be721d8c**. It is bounded numerical validation, not browser/visual proof.

Root artifacts/scripts/logs and hashes: `/tmp/siltwake-polish-1a-integration/`. Author originals: `/tmp/siltwake-polish-1a/`. The staged earned-save fabrication/boarding/180-tick departure remains a **diagnostic copy**, with paid recipe,21.27669m travel,100 hull and no impacts. It does not satisfy ordinary new-fabrication/launch proof.

## Handoff and remaining proof

Release1A ownership and dispatch [POLISH-1B](../tasks/POLISH-1B.md) from the next committed contract baseline. It receives the real interfaces above, not speculative stubs. Original `island-glass-east-bundles.json` (tick5944, before fabrication) is required for ordinary new-Dart proof; the separate old yaw0 `dart-fabrication.json` verifies legacy departure.

Only4.80% of sampled headland stock area and7.96% of western glass stock area is exposed. The geometry is reachable, but actual richer-cel visibility/readability is still unproven.1B must inspect supported stock, cue placement, ordinary collection, depleted anchors and food tending. It does not inherit either art path; concrete failures return to root for bounded correction. Nonpilot camera origin, capture/lifecycle, panel consumption and impacts also remain1B work.

**This is provisional assembly, not acceptance.** Root has no browser/server or actual new input/motion evidence. Combine1A+1B, inspect/check/play the candidate, then obtain fresh non-author Astra xhigh and Sol6.1 max reviews of the same frozen revision. Stage1 continues through slice2 and the required fresh Opus review/fix loop; M2–M4 remain open. Accepted M1 stays1caa05f/productiona5821aa and the game branch staysM0a2cb19f until authorized accepted integration. No main merge or deployment.
