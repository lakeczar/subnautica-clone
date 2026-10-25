# POLISH-1A implementation evidence

2026-10-18. Author: actual runtime `gpt-6.1-sol`, reasoning effort `max`, confirmed in the session `turn_context` and T3 runtime information. Session receipt: `/home/worker/.codex/sessions/2026/10/18/rollout-2026-10-18T00-04-34-01a14d65-b6fc-75a3-a478-728f022f7378.jsonl`. No model/effort substitution occurred.

The assigned T3 worktree began clean at exact `61fcc3033292f9412a795a2388616a4f926ece22` and remained `/home/worker/.t3/worktrees/subnautica-clone/t3-759c1a06`, branch `t3/validated-aim-prompt`. Required repository/build/specification/consultation/disposition documents were read before implementation. Root's reconciliation controls this implementation.

**Source commits and scope.** `74357dfc1f61eaca0dc84f0f35c7ee98bef10235` contains the separate source alignment correction and shared registry datums. `b92188be0d31f217034eedf862260b8ff176676f` contains the simulation, minimal prompt and regression tests. Together they are the final tested source. Root explicitly extended ownership to the three stock-group translations in `src/render/expedition.ts`, then only the existing headland frame translation in `src/render/environment.ts`, and the single fixed-coordinate trim fixture in `tests/modules.test.ts`. All other edits stay in the original assigned production/test paths. This document is the sole documentation edit.

This is the terminal bounded 1A author deliverable. Combined slice acceptance, independent reviews and actual production presentation/input evidence remain with root and 1B.

**Implemented interfaces and behavior.** `src/sim/targeting.ts` exports `AimRay`, `InteractionHost`, `InteractionVerb`, `AimedTarget`, `aimRay(s)`, `interactionHost(s,t)` and `aimedInteraction(s,world)`. The target extends the existing interaction with detached `host`, `verb` and `known` values. All eleven frozen verbs are present. Selection reads the current state on every call, including mutable command drafts; it has no target cache.

The ray uses semantic yaw/pitch and instantaneous `eyeHeight(state)`. Opening, piloting and carrier interior disable targeting; piloting E retains exit behavior. Reach remains the existing strict `<4 m` body-to-interaction-datum check. Positive forward projection, actual perpendicular miss, a 30-degree cone and LOS are always required, including inside a host sphere. Trial constants are 0.18 m aim slack, 0.003 rad ambiguous tie tolerance and 0.000001 rad centered tolerance. Deliberately centered known evidence wins over nearby new stock; fresh stock/evidence preference applies only within a small angular tie.

`WorldQueries.lineOfSight(a,b,ignore?)` is required. The implementation intersects supplied solid boxes and actual registered `RIB_SEGMENTS`; it recognizes a detached registered rib only when its ID and canonical bounds match. A renamed diagnostic box remains a box. Supplied local/empty worlds inherit no global solids or ribs. Terrain checks use the supplied `floorHeight`, at intervals at most 0.15 m with 0.02 m tolerance. Invalid/nonfinite data fails closed. Water is transparent. Movement, clearance, `SOLIDS` and rib movement collision remain unchanged.

The new detached transient events are `impact { speed, hullLoss, origin }` and `interaction-panel { panel: 'inventory'|'craft'|'notebook', targetId }`. They are outside saved state. Sim-validated known-evidence E emits notebook intent and informative repeat feedback while preserving discovery, provenance and saved recovery feedback. Scanner Q uses the same target, retains equipment requirements and the existing +2 capped threat-interest rule, and emits no panel shortcut. Cache, disabled/empty-power craft and service interactions emit validated panel intent. Explicit board and panel commands keep their existing rules. A mismatched direct `interact.target` refuses atomically and emits no panel event.

Depleted sources choose their existing finite sorting, food tending or protected shallow maintenance action. Exhausted hosts with no useful action say Empty. Known scans give repeat feedback without replaying saved recovery feedback. The minimal view prompt calls the same pure target function and names Collect, Gather, Sort/Tend (20 s), Inspect, Notebook, Read, Board, Recover, Open, Use or Empty. Empty omits E; Q scan appears only with the scanner and an unknown eligible target. No renderer cue, panel redesign or runtime interception was added.

`DART_BUILD_YAW = Math.PI` is assigned only by Dart fabrication. `makeVehicle`, decoding, saved pitch/headings and hull shapes stay unchanged. Board feedback accurately names mouse/arrows steering, W/S thrust and A/D slide. Damaging contact emits only positive clipped actual before-minus-after hull loss, with a detached origin; damage, velocity, air and power formulas are unchanged. Audio consumption belongs to 1B.

**Registry metadata.** `InteractionHostDefinition` has optional `offset: {x,y,z}`, `radius: number`, `solidIds: readonly string[]`, `renderOffsetY: number` and `persistentOffsetY: number`. Only the three authorized stock groups define `renderOffsetY`; only the headland entry defines `persistentOffsetY`. The same registry entries drive art translation and target datums. `solidIds` default to an empty list and exempt only mapped host furniture.

Defaults: source offset `(0,-0.2,0)` / radius 1.15; evidence radius 0.7; record 0.6; vehicle 2.2; cache offset `(0,0.3,0)` / radius 0.65; service 0.85. Other default offsets are zero. Vehicle interaction datums already include +0.6 m Y. Source target Y includes its registry `renderOffsetY` in addition to the ordinary offset.

| ID | Offset override | Radius override | Ignored own geometry | Stock Y translation | Persistent Y translation |
| --- | --- | --- | --- | --- | --- |
| C01 | (-1.25, 0.75, -0.3) | 0.7 | none | 0 | 0 |
| C02 | (0, -0.7, 0) | 1.05 | none | 0 | 0 |
| C03 | default | 0.55 | none | 0 | 0 |
| C04 | (0, -0.025, 0) | 0.5 | none | 0 | 0 |
| pod_services | (0.34, 1.2, 0.9) | 0.45 | pod.bench | 0 | 0 |
| workshop_services | (0.8, 0.85, -4.15) | 0.65 | workshop.bench | 0 | 0 |
| rescue_staging | (0, -0.3, 0) | 0.85 | none | 0 | 0 |
| reef_ribbon_catch_north / south | (0.35, -0.25, 0.1) | 1.3 | none | 0 | 0 |
| island_workshop_scraps | default | default | none | 0.25 | 0 |
| island_headland_scraps | (-0.65, 0.1, -0.35) | default | none | 2 | 0.5 |
| island_glass_ledge_west | (0, 0.45, -0.5) | default | none | 1.25 | 0 |
| island_shore_crop_east / west | (0, 0.18, -0.35) | default | none | 0 | 0 |

**Geometry correction and provenance.** Initial analytic-height probes found five unreachable default datums: the three authorized stock groups and two shore foods. Food metadata now addresses existing upper cup rims at Y 1.38; its meshes remain unchanged, spanning Y 0.620000–1.380000 above the 1.2 m platform. Both retain hand gathering and depleted-host tending.

The first translation trial used +0.25 / +1.5 / +0.65 m and compared actual stock vertices to the analytic height field. A subsequent audit against the actual rendered terrain triangles found headland/west stock still wholly buried (maximum sampled gaps -0.329889 / -0.271095 m), and zero exposed headland-frame samples. Those intermediate results remain in `geometry-before-triangle-correction.{json,log}` and earlier `source-geometry-*.json`; they are superseded by the final geometry receipt. Root inspected the triangle construction and authorized the narrow existing-frame correction.

Final [geometry diagnostic](/tmp/siltwake-polish-1a/geometry-final.mjs) / [JSON receipt](/tmp/siltwake-polish-1a/geometry-final.json) instantiate production art in Babylon NullEngine. It measures transformed vertices, 36 equal-area samples per triangle and a 33×33 footprint grid against both analytic terrain and the actual 190×178-cell rendered terrain. It also intersects each recorded eye-to-host/geometry segment against the actual terrain triangles. This is geometry-only evidence; it contains no raster or ordinary-control claim.

| Group | Unchanged saved source datum | Final world bounds min → max | Exposed triangle area against rendered terrain (sampled) | Maximum sampled surface gap |
| --- | --- | --- | --- | --- |
| island_workshop_scraps | (8, 1.2, -35) | (6.875863, 1.112846, -35.829266) → (9.131753, 1.302500, -34.244445) | 52.37% | 0.102500 m |
| island_headland_scraps | (32, -20, -36) | (30.875864, -18.337154, -36.829266) → (33.131754, -18.147500, -35.244445) | 4.80% | 0.170111 m |
| island_glass_ledge_west | (-15, -25, -40) | (-15.930000, -24.320000, -40.609808) → (-14.070000, -23.545097, -39.390192) | 7.96% | 0.328905 m |

Minimum group Y minus rendered supporting terrain across each footprint ranges respectively `[-0.087154,-0.087154]`, `[-3.040976,-0.001812]` and `[-1.652090,-0.035974]` m. The translations retain embedded bases; they do not lift the full clusters above the sloping support. Most of the headland cluster remains embedded. Production readability of its exposed tagged portion remains a 1B visual check.

| Group | Collision-valid approach base | Eye | Eye above rendered terrain | Body reach | Aim at exposed stock point |
| --- | --- | --- | --- | --- | --- |
| workshop scraps | (8, 1.2, -32.5) | (8, 2.82, -32.5) | 1.621406 m | 2.500 m | (7.975621, 1.244448, -35.001916) |
| headland scraps | (32, -17, -37.5) | (32, -16.35, -37.5) | 1.215226 m | 3.354 m | (31.330556, -18.147500, -36.352221) |
| west glass | (-14, -22.5, -40) | (-14, -21.85, -40) | 1.040425 m | 2.693 m | (-14.910895, -23.547821, -40.363888) |

All three approaches pass unchanged world body clearance, analytic LOS, exact rendered-terrain segment intersection, pure selection and production E collection. Aiming at each exposed stock point selects the same host. Their bases are also above the rendered terrain at the recorded X/Z.

After depletion, all three stock meshes disable while `reef.geology` remains enabled. Aiming at exposed persistent geometry selects the same host and permits the existing sort action. Recorded anchors are `(7.855556,1.248889,-33.960002)`, `(31.277778,-17.787208,-37.039998)` and `(-16.001431,-23.316206,-40.661372)`, respectively 1.049982 / 0.702877 / 1.014479 m from their target centers. All lie inside the unchanged 1.15 m sphere and pass both analytic and exact rendered-terrain LOS. West glass uses its existing exposed bands without a sphere expansion or persistent art change.

The headland frame moves only +0.5 m Y. Its bounds change from `(30.640001,-18.292764,-37.159998)`–`(33.359999,-18.192764,-34.840002)` to the same X/Z at Y `[-17.792764,-17.692764]`. Dimensions remain `(2.719998,0.100000,2.319997)` m. A baseline module reconstructed from exact `61fcc303...:src/render/environment.ts` proves exactly 96 existing frame vertices translate; every other environment vertex position is unchanged. All indices, normals and vertex colors are equal. The 34,189 terrain vertices and topology, other persistent hosts and edge buoys match the baseline. No mesh variant, support platform, collision or terrain height/topology change was made.

**Normal host/action coverage.** [Production-code receipt](/tmp/siltwake-polish-1a/final-receipts.json) contains exact source definitions, detached hosts, poses/yaw/pitch, LOS/action events, depleted actions and immediate-save results. All 28 static hosts pass collision-valid view, matching aimed E action and immediate codec roundtrip tests. All 20 source views additionally pass the geometry diagnostic's actual terrain-triangle LOS check. Geometry bounds for every source, including ordinary reef/Canopy/food controls, are retained in `geometry-final.json`.

| ID | Player base | Host center | Body reach (m) | Initial verb |
| --- | --- | --- | --- | --- |
| reef_service_scraps_east | (-7.232233, -11.5, -7.767767) | (-9, -12.2, -6) | 2.550 | collect |
| reef_service_scraps_west | (-30.232233, -27.5, -18.767767) | (-32, -28.2, -17) | 2.550 | collect |
| reef_glass_ridge_north | (-6, -8, 2.5) | (-6, -8.2, 0) | 2.500 | collect |
| reef_glass_ridge_south | (-25, -22, -19.5) | (-25, -22.2, -22) | 2.500 | collect |
| reef_ribbon_catch_north | (-15, -10, 3.5) | (-14.65, -10.25, 1.1) | 2.500 | collect |
| reef_ribbon_catch_south | (-33, -25, -21.5) | (-32.65, -25.25, -23.9) | 2.500 | collect |
| island_workshop_scraps | (8, 1.2, -32.5) | (8, 1.25, -35) | 2.500 | collect |
| island_headland_scraps | (32, -17, -37.5) | (31.35, -17.9, -36.35) | 3.354 | collect |
| island_glass_ledge_east | (28, -9.5, -22.5) | (28, -10.2, -25) | 2.550 | collect |
| island_glass_ledge_west | (-14, -22.5, -40) | (-15, -23.3, -40.5) | 2.693 | collect |
| island_resin_cove_east | (35, -10, -29.5) | (35, -10.2, -32) | 2.500 | collect |
| island_resin_cove_west | (-15.834936, -20, -37.25) | (-18, -20.2, -36) | 2.500 | collect |
| canopy_grounding_fins_upper | (93, -90, -93.5) | (93, -90.2, -96) | 2.500 | collect |
| canopy_grounding_fins_lower | (136, -130, -132.5) | (136, -130.2, -135) | 2.500 | collect |
| canopy_resin_lee_upper | (101, -100, -99.5) | (101, -100.2, -102) | 2.500 | collect |
| canopy_resin_lee_lower | (144, -140, -140.5) | (144, -140.2, -143) | 2.500 | collect |
| reef_edible_school_north | (4, -2, 5.5) | (4, -2.2, 3) | 2.500 | gather |
| reef_edible_school_south | (-4, -3, 8.5) | (-4, -3.2, 6) | 2.500 | gather |
| island_shore_crop_east | (13, 1.2, -32.5) | (13, 1.38, -35.35) | 2.500 | gather |
| island_shore_crop_west | (5, 1.2, -35.5) | (5, 1.38, -38.35) | 2.500 | gather |
| C01 | (0, 0.18, 21.2) | (-2.65, 1.85, 20.9) | 1.675 | review |
| C02 | (-17, -7, -5.5) | (-17, -7.7, -8) | 2.500 | inspect |
| C03 | (10, 1.2, -36.3) | (10, 2.45, -38.8) | 2.795 | inspect |
| C04 | (116, -118, -125.3) | (116, -116.825, -127.8) | 2.773 | inspect |
| mara_reef_note | (-24, -8, -6.5) | (-24, -8, -9) | 2.500 | read |
| pod_services | (1.5, 0.18, 23) | (1.84, 2.2, 21.4) | 2.631 | use |
| workshop_services | (11, 1.2, -36.5) | (11.8, 2.85, -39.15) | 1.700 | use |
| rescue_staging | (46, -12, -51.5) | (46, -12.3, -54) | 2.500 | use |

Tests also cover ahead/side/behind/inside/zero-distance, narrow adjacent hosts and roster order, intake scrap versus evidence, deliberate known ledger aim, own-bench versus unrelated furniture/walls, origin containment, rib-through refusal and an actual gap inside the legacy rib movement box, island terrain and supplied empty/local worlds. Repeat evidence/scans, protected recovery feedback, source sorting/food tending/maintenance restrictions, disabled craft, explicit target bypass, event detachment and same-state/replaced-state/multi-command recomputation are exercised. Existing DOM-harness tests verify prompt/action agreement and every verb; no browser is involved.

**Dart, impacts and saved data.** A paid recipe test fixture fabricates a new yaw-π Dart, approaches from a world-clear swimming pose, boards through aimed E and runs 180 W-only simulation ticks through the actual world. A separate diagnostic copy of earned `island-glass-east-bundles.json` (tick 5944, no Dart) pays the real recipe without adding inventory. Only its bench and approach poses are staged. Its new Dart starts `(20,-1.6,-22)`, yaw π, pitch 0; after 3 s it is `(20,-1.6,-0.723309216500297)`, with 21.276690783499706 pilot metres, health 100, charge 99.6666666666664 and zero impacts. The legacy direction's first collision and new lane's swept 25 m clearance are separately tested. This staged simulation probe does not replace 1B's ordinary imported-prefab fabrication/boarding/departure.

Impact tests use actual world cradle-rail contacts at speed 11 and initial health 100, 0.01 and 0. The emitted loss equals the actual clipped state delta (about 1.1666667, 0.01 and no event, respectively), with detached origins and saveable resulting states. Low-speed contact and fast unobstructed travel emit no impact. Legacy yaw 0/pitch 0.2 survives encoding/decoding and aimed boarding; neutral `makeVehicle` headings for Dart/other hull creation remain zero.

All five original ordinary save files were read without modification, decode exactly to their recorded state and immediately encode/decode exactly again. Existing Dart yaw/pitch values are retained. Byte hashes are before/after verified:

| Original file under `/tmp/siltwake-m1-play-presentation/saves/` | Tick | SHA256 | Existing Dart yaw |
| --- | --- | --- | --- |
| alloy-first.json | 1225 | `b44c0e945cad3c17f4729e16a0da7b98144a51da773db6f7d7a291ae4777ef1a` | no Dart |
| island-glass-east-bundles.json | 5944 | `6f68024561653b6ebd139078ee9526ee0ab1d9801d745f9fb94fefd64937868f` | no Dart |
| dart-fabrication.json | 6269 | `5e18d3ffe71d51887bdb6586591b1dab8605d2f814fd23e56c7b696058d1c134` | 0 |
| canopy-pre-warning.json | 9304 | `3df46ef510e589675a422ebfbc62aaafcb626ecf3c89276c42cd5c03c219d305` | 0.45818530717950345 |
| first-return-before-service.json | 16585 | `edb24efec61cfcd890cfa6c0b3c29286d0d7bd71f533da6673d4c5902f0c0a91` | 0.15000000000000213 |

Exact baseline-versus-final registry comparisons pass for `SOURCES`, `EVIDENCE`, `RECIPES`, `HULL_COLLIDERS`, `OPTIONAL_RECORD` and `DART_BUILD_POSE`, including source positions, stock/yields, provenance and hull shapes. Canon, protected recovery strings, save schema/content and save implementation are unchanged. Definition hashes are retained in `final-receipts.json`; the unchanged full `SOURCES` object hashes to `2e4026afc46803ecc44b28d457dea87057ae64709a1241a23b66a4069d74cb18` under JSON serialization.

**Commands, failures and final artifact.** Runtime Node `v24.21.0`, npm `11.19.0`; `npm ci` completed without tracked dependency changes. Exact logs and scripts are under `/tmp/siltwake-polish-1a/`.

| Command / receipt | Result and attribution |
| --- | --- |
| Initial `npm run check` → `check.log` | Typecheck passed, 230/231 tests passed; build did not run. The trim-speed fixture inherited new fabrication yaw π while its velocity/assertions used fixed -Z coordinates. |
| `npx tsc -p tsconfig.test.json && node --test --test-name-pattern='trim changes only piloted Dart quiet/boost targets' .test-build/tests/modules.test.js` → `modules-yaw-fixture.log` | 1/1 passed after root-authorized `v.pose.yaw=0` before board. All existing assertions, costs, shared helpers and handling remain unchanged. |
| Pre-final-art `npm run check` → `check-pre-final-art.log` (also retained as `check-final.log`) | 231/231, typecheck and build passed before actual terrain-triangle correction. Bundle `index-D4vv8g-5.js`, SHA256 `189b0b9e2e09670b9813c8e250acdd413df7963ba496a91524046ef5a929916b`. Superseded. |
| `node --test .test-build/tests/targeting.test.js .test-build/tests/presentation.test.js` → `alignment-targets-final.log` | Final alignment source: 41/41 passed. |
| `node /tmp/siltwake-polish-1a/prepare-baseline-render.mjs` and `node /tmp/siltwake-polish-1a/geometry-final.mjs` | Final transformed geometry, unchanged environment comparison, exposed stock/persistent aim and exact terrain-triangle LOS passed. Scenes/engine disposed in `finally`. |
| `node /tmp/siltwake-polish-1a/final-receipts.mjs` | Six unchanged definition groups, five original-save exact roundtrips, 28 matching reachable actions/immediate saves and earned-save diagnostic departure passed. |
| Final `npm run check` on `b92188be0d31f217034eedf862260b8ff176676f` → `check-final-art.log` | **231/231 tests, typecheck and production build passed**, exit 0. Tests 12.464 s; Vite build 8.88 s. Existing >500 kB chunk warning remains. |
| `node scripts/check-m1-economy.mjs` → `economy-final.log` | Passed nine executable recipes and both staged scenarios. Starter spend 16 alloy / 11 glass / 12 membrane; optional trim 2 crust / 2 resin. Arithmetic/staged transactions only; no route/balance/ordinary-input acceptance. Earlier `economy.log` is retained. |
| `git diff --check` | Passed for source and final evidence. |

Earlier focused physics fixture failures are retained in `targeted-physics.log`: a floating-point equality assertion and a manually zeroed hull without a valid loss record were corrected in test setup/assertion precision. Production damage/state rules were preserved. The temporary geometry script initially called an unavailable Babylon helper, then its first persistent-aim assertion exposed an unsuitable close diagnostic view; logs are retained as `geometry-triangle-probe-api-error.log` and `geometry-persistent-aim-trial-failure.log`. The final script uses explicit vectors, denser surface samples and the recorded above-terrain approach. These are probe/test iterations, separately attributed from final passing source checks.

Final production bundle: `dist/assets/index-DsUTodfi.js`, SHA256 **`f1cf5f99bed1c9cc92c72d4ec96ddfe39cdcf025ad2e9ff86cb614de3084f68b`**. `dist/index.html` SHA256 `d8150446cbabc4603678c30340249989f6d7c425d0ec619e2c53f00000658b09`. [Artifact manifest](/tmp/siltwake-polish-1a/artifact-hashes.json) records every changed source/test hash and every final build artifact against exact source `b92188be...`.

Final receipt hashes: `check-final-art.log` = `9b95e6d893f7fb00a1bd54c0f13b4f3b672d0b14cf1c119c71f4767339319678`; `geometry-final.json` = `3699c44004b986f163044158aefb948bfc5030940d201a921c764710c8dc235b`; `final-receipts.json` = `62731d7b5b675d48ae140e4eb991659a81d5d6a2de640a136e58d9c930edea89`. [Receipt manifest](/tmp/siltwake-polish-1a/receipt-hashes.json) includes scripts, final logs and intermediate evidence.

**Limits and closure.** No browser/preview/tab, server, recording, pointer capture, child agent or persistent background worker was started. All owned command sessions completed; NullEngine resources close in `finally`, including failed probes. Temporary diagnostic files remain for root inspection. No pushes, PRs, merges, parent mutations or worktree changes occurred. The returned worktree is clean after source/evidence commits.

1B still owns actual production aim/cue and instantaneous non-pilot camera alignment, panel-event consumption, new/legacy launch play/captures, impact audio/presentation, deliberate exit, captured/drag mouse settings and S1–S6 evidence. This leaf makes no native locked-movement, visual feel, audible-mix, hardware performance or full slice-acceptance claim. Slice2 work and movement/rib collision changes were not implemented.
