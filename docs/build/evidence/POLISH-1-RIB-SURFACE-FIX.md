# OS2-01 — swimmer/hull surface trap correction

2026-10-18. Bounded implementation return, **not independent acceptance or game acceptance**. Source/test commit: **`cc3f20df8de8e22ae7ad401e40240c6bb1109e98`**, direct parent **`1c942bd030f164be40f324f95d8f1d743d1d749e`**. The clean bound worktree was verified before editing; parent production matched **`d9aaf6356cb320f283887922abf97ed8bdc54f59`**. Actual implementation runtime was `gpt-6.1-sol`, effort `max`, on `factory-worker`. Receipts: `/tmp/siltwake-rib-surface-fix/baseline-runtime.json` and `final-source.json`.

The actual trapped export now escapes through ordinary runtime movement without decode relocation. A clear surface approach remains clear, and full `stepGame` replays cannot use the final surface clamp to deepen an existing rib overlap. Swimmer, Dart/other hull and fixed Spindle surface corrections use the same checked correction policy. Surface contact can still stop inward travel.

## Exact scope and helper contracts

Only these production paths changed: `src/sim/step.ts`, `src/sim/world.ts`, `src/sim/ribCollision.ts`. Tests are `tests/rib-surface-trap.test.ts`, the byte-identical `tests/fixtures/reef-rib-trap-expedition3.json`, and the documented overlap-policy assertion/directly related cases in `tests/rib-collision.test.ts`. This report is the sole additional tracked path. No shared type, `WorldQueries`/`Capsule` signature, codec/schema, content/registry, input, UI, art or private root record changed.

- `sweepBoxRib` retains its existing signature and 64-call limit. A canonical-rib overlap deeper than the existing 1 mm static tolerance may move along a straight non-closing direction only when its separating normal is defined. Convex distance under translation supplies the supporting-plane proof for that line. Closing travel becomes contact and can project to a tangent. Zero distance/normal, non-finite geometry, no progress and exhaustion remain conservative.
- `moveCapsule` rechecks the complete supplied solid roster at every slide, retaining the eight-slide cap. It records every starting canonical-rib gap below the static tolerance and rejects an accepted segment endpoint that deepens any such gap by more than `1e-9` m. This is a numerical backstop to the straight-line proof; newly encountered ribs and boxes still receive continuous sweeps. Actor extents include the full existing X/Z, height and bottom proxy.
- Private `verticalCorrection(world, position, y, shape, hull): Vec3 | null` verifies the straight vertical correction using `world.moveCapsule`. It requires no solid/boundary hit, the intended endpoint within `1e-10` m, and a finite endpoint above the existing actor floor. Hull floor uses the existing full-footprint `hullFloor + 0.05`; swimmer floor uses the existing ground/bottom tolerance. An unchanged Y requires no travel. There is no static thickness/displacement fast path, clearance-false bypass or accepted stopped/sideways correction.
- Private generic `surfaceMove(world, origin, delta, shape, attempt, targetY, hull)` chooses the ordinary move plus verified correction; if correction fails, it tries **one** move with requested rise capped to `targetY - origin.y`, verifies that correction, then retains the origin if both fail. It returns the chosen move, surface limitation and rollback flags. Every retry starts at the retained origin. Swimmer slices, hull movement and forced Spindle placement all use it.

Per-attempt measurement accumulators are local. Only the chosen branch contributes collision/forward/ascent measurements; correction probes add no propulsion, damage or power transaction. A rollback is contact. Final distance, actual ascent/thrust, impact origin and power/distance accounting use the chosen final pose. A rejected surface rise remains honestly attributed to the surface constraint. Steering, command precedence, damage formula, carrier bounds/children, obstruction eligibility and existing support/floor rules are retained.

The old “all overlaps freeze” assertion now permits its 2 mm defined-normal outward case and checks inward contact. Its zero-normal axis-point case still freezes. There is no general overlap bypass, always-on nudge, collider resize, terrain change or teleport.

## Red → green and required checks

Before production changes, `regressions-red.log` records five meaningful failures among six initial callsite tests: actual export escape, minimal swimmer overlap on **tick15**, baseline-produced Dart escape, a clear Dart approach overlapping on **tick50**, and fixed Spindle placement through an intervening shelf despite clear endpoints. The baseline composition invariant passes because the old sweep freezes overlaps; that alone did not supply escape.

`rejected-proto-red.log` separately proves the final composition regression is red on the rejected private prototype: actual pose `(-24.415625654848196,-0.5,-8.300421871420056)`, yaw0/pitch0, backwards, segment12 gap **`-0.01311010134142121 → -0.02646727175319885`** on tick1. Prototype files were compiled/adapted only under this task’s own temporary directory. No prototype production implementation was integrated.

Final source results:

| Check | Result / retained artifact under `/tmp/siltwake-rib-surface-fix/` |
| --- | --- |
| `npm run check` | **410/410 tests**, strict typecheck and production build pass; `check-final.log`, `check-final.exit` = 0 |
| `node scripts/check-m1-economy.mjs` | Pass, `economy-m1.log`, `.exit` = 0 |
| `node docs/build/design/check-economy.mjs` | Pass, `economy-design.log`, `.exit` = 0 |
| Root original actual-export/minimal approach reproduction | **2/2 green**, `root-repro-green.log`; red retained separately |
| Root full composition probe | **0 deeper / 0 newly overlapping sampled steps** across 72 × 60 steps; `overlap-composition.json`, `overlap-composition-green.log` |
| Original 595-case diagnostic | Baseline **99/595** trapped; final **0/595**; `original-595-{baseline,green}.json` |

The final ten-test addition includes the actual save’s unchanged decode/roundtrip, stationary pose, ordinary escape within60 ticks and movement after encode/decode. It conserves inventory, knowledge, fleet, resource reserves, facilities, recovery and migration. It checks all72 directional/look replays against **every** canonical rib after complete caller corrections. Two hull traps frozen from baseline runs whose initial poses passed **full `hullClearance`** receive the same directional invariant, successful runtime escape, and the pre-existing safe diver exit.

Other cases cover non-cardinal geometry/junctions, two simultaneous overlaps, a Dart proxy, a deeper defined-normal overlap, zero delta/normal, outward travel toward an added box while retaining all neighbouring ribs, finite input, and existing sweep/slide exhaustion tests. A reduced deterministic all-arch suite runs **288 swimmer / 144 full hull-clear starts**, with zero excluded hull seeds. Continuous-safety coverage includes the clear-endpoint Spindle shelf case and a long inherited Dart rise whose safe retry avoids charging the discarded branch’s impact. Existing carrier/berth/seal/tow/recovery/save suites remain intact.

An intermediate added test failed only on strict floating-point equality (`-0.900000000000002` versus `-0.9`); `additional-tests.log` is retained. Its final assertions use `1e-12` tolerance. Production did not change for that assertion. Earlier targeted green logs and the earlier409-test check remain separately labelled; `check-final.log` is authoritative.

## Broader deterministic diagnostics and safe ordinary results

The wider path script uses the original grid geometry/commands, extended to90 active ticks. It includes all36 canonical ribs, neighbouring boxes and production ground/support. These are seeded diagnostics, not ordinary play or player-incidence estimates. The historical Dart grid used `world.clearance` for its starts; this report preserves that denominator and separately identifies the full hull-clear subset.

| Group | Paths | Baseline paths producing rib overlap | Final paths producing rib overlap | Final physically invalid paths |
| --- | ---: | ---: | ---: | ---: |
| Swimmer, original clear-start grid | 20,736 | 1,562 | 0 | 0 |
| Dart, historical `world.clearance` denominator | 7,668 | 926 | 0 | 180 |
| Dart, actually full hull-clear starts | 7,488 | 923 | 0 | 0 |

The180 invalid historical runs are **five invalid starting poses ×36 command combinations**, excluded from the supported subset rather than counted as valid gameplay or silently removed. Their exact segment/fraction/ray/pose list remains in `wide-grid.json` and `floor-stall-all.json`. They begin below the full hull-footprint floor; no recovery claim is made for them.

`wide-grid.json` records zero surface excess after submersion and zero unsettled/beached cases after release. Its initial escape diagnostic found1,442 swimmer stalls and1,459 supported Dart stalls. Every swimmer stall left by at least3.074 m using the tested alternatives. The original six Dart escape probes omitted rise, and288 floor-contact cases moved less than0.3 m; **`wide-grid.exit` remains1**, with that failed probe retained. `floor-stall-all.mjs` independently replays the same7,668 historical /7,488 supported denominator, reproduces all288 misses, and adds ordinary rise. All288 leave by at least **4.5065 m**, with zero new overlap or invalid extension steps; `floor-stall-all.exit` = 0. This is a documented diagnostic coverage correction, not a production workaround.

Nine traces captured before edits remain **bit-identical**, including pose/velocity/mode and ascent/thrust/impact/boundary events: open-water surfacing, pod float approach, ramp, shore, supported floor, Dart surface/reverse, Spindle surface and carrier travel. The fixed hashes in the test came from `baseline-goldens.json`, not from the corrected implementation.

The wider grid also exposes a deliberately conservative safety delta:22 swimmer and3 supported Dart paths whose baseline endpoints stayed within static clearance change pose. Endpoint clearance alone does not establish the correction’s swept safety. `safety-deltas.json` retains eight first-divergence examples; the complete `correction-delta-audit.json` independently reproduces all25 changed paths and finds a blocked vertical correction in every one (`correction-delta-audit.exit` = 0). Capped retry/rollback preserves the surface constraint instead of accepting that contact path. These changed surface-contact paths are disclosed, not added as replacement goldens.

`support-audit.json` samples20,816 swimmer and3,988 Dart baseline steps and finds no sampled new upward support/floor producer. It counted **zero post-sweep upward snaps**, so this is not proof of all possible support geometry. No targeted counterexample justified changing those retained rules.

## Final production browser continuation

Both `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md` were read before browser actions. T3 `preview_status`/`preview_open` supplied one owned incognito tab. A first `about:blank` open argument failed URL validation and was corrected by omitting the URL; no alternative browser, relaunch loop or global browser substitution was used.

Page-to-process ownership was verified on Linux `factory-worker`: a page-local1.2 s CPU pulse advanced renderer PID2202936 from1 to121 CPU ticks. Its ancestry was **2202936 →827917 →827915 →827911 → T3 host811435**. The owned tab was `tab_3l_0430977b-1ed3-45f2-ac72-3683f9fe8942`, one isolated incognito/storage context. See `browser-ownership-{before,after}.json`.

Port5190 was checked free before starting the owned production Vite server; the listener was PID2203348. Production source and built bundle hashes below stayed unchanged throughout all three continuations. Controls were page-local keyboard events through the existing input handlers (WASD, arrows, Space/C), plus native preview UI/file controls. No grants, pose/velocity injection, inventory/resource edits or simulation API mutations were used. The retained observer only records DOM input/time/HUD, native JSON export Blobs and journal writes.

1. **Fresh New:** used all four opening actions, walked the ramp, swam to reef ribs and waited for the actual **LOW OXYGEN34%** warning. Forward+rise approached and surfaced under the arch at swimmer Y−0.5. A turn followed by reverse+dive left it. Saved/exported at tick11130, actually navigated/reloaded, continued, exported a stationary comparison at tick11210, then moved again and exported at tick11473. Post-reload movement was **5.3833 m**. `browser/fresh-before-reload-trace.json`, `fresh-reload-data.json`, unedited raw exports, five route/contact captures, `fresh-lowair-surface-escape.mp4` and `fresh-reload-move.mp4` retain the run.
2. **Legacy trapped export continuation:** imported the exact assigned fixture through File input and “Import & save”. Fixture SHA256 remains **`012982eae770e9c7cce3ba8df06bf567db32c57afa51261d87e4db289f236d55`**. Its position stayed exactly unchanged through750 no-input ticks (22258→23008). Ordinary arrow look and left strafe escaped **6.5167 m**, saved at tick24093. Actual reload/Continue produced the comparison at tick24174; left strafe+dive then moved another **5.3833 m** and saved at tick24401. No migration, grants or non-movement-state changes occurred. See `browser/actual-before-reload-data.json`, `actual-reload-data.json`, `actual-{before,after}.png`, `actual-escape.mp4`, `actual-reload-move.mp4` and their raw exports.
3. **Earned Dart continuation:** imported unchanged `/tmp/siltwake-m1-play-presentation/saves/first-return-before-service.json`, tick16585, SHA256 **`edb24efec61cfcd890cfa6c0b3c29286d0d7bd71f533da6673d4c5902f0c0a91`**. Its historical earned-route provenance is retained in [M1 final play](M1-FINAL-PLAY.md). Turned out of the workshop cradle, strafed to its open lane and drove normally to the reef at the surface. Forward+rise stopped at `(-10.406727546924479,-0.9,-13.831770507167908)`, tick20001: full hull clearance true, nearest rib22 gap `-6.27e-13` m (numerical contact). Reverse while turning left left it by **9.4452 m**, saving at tick20317 with full hull clearance. Charge decreased92.4823→90.6506%; hull health100→93.5303 from ordinary cradle/rib contacts, with no further loss while reversing. Inventory, knowledge, resources, facilities, recovery and migration are conserved. `browser/earned-dart-{exports,trace}-data.json`, raw exports, contact/escape captures and `earned-dart-route-contact-escape.mp4` retain the route. The initial `earned-dart-import-pending-data.json` sampled the previous paused state before asynchronous import completed; it is not used as accepted-import state proof.

`browser/reload-check.json` deep-compares **complete actual exported states** against the same starting decode advanced through the measured80 fresh /81 legacy no-input ticks; both are exact. It also matches the750 stationary import ticks exactly. These comparisons account for survival/metrics/ticks and do not infer equality from a stored journal alone. `browser/state-check.json` verifies movement distances, full hull clearance and conserved non-movement state.

All input events, `isTrusted` provenance, wall/performance times and available HUD tick samples are retained; HUD ticks can lag a render/update and are not asserted to be individual input-sampling ticks. Fresh and continuation traces remain distinct. Native export Blob texts are retained unedited as UTF-8, together with raw journal strings. Native download paths were unavailable after incognito cleanup, so no independent disk-download comparison is claimed; production creates these exports as JSON string Blobs (`src/runtime/app.ts`).

Final console capture contains Babylon startup logs only, with **zero console errors, captured page errors or failed network requests**. CSS viewport960×600, DPR2, Light mode and Drag input were used. The game canvas rendered640×400; T3 saved screenshots are1280×800. The Linux headless browser ran with `--disable-gpu --enable-unsafe-swiftshader --mute-audio`, using WebGL2. This is software-rendered functional evidence, not consumer-GPU performance, audible mix, human feel, enjoyment or expedition-duration evidence. No real pointer lock or OS cursor/focus action was used.

All five recordings stopped. Held keys were released; only the owned tab/context was closed through `t3_preview_close`, and only the owned Vite server was stopped through its terminal lifecycle. `browser/cleanup.json` verifies renderer2202936 gone, port5190 closed, shared browser827911 and T3 host811435 preserved; `cleanup-preview-status.json` reports no remaining owned preview. No browser/server resource is retained.

## Identity, artifacts and handoff limits

| Final artifact | SHA256 |
| --- | --- |
| `src/sim/step.ts` | `90a1c037bee8e0030bb99cbd9df39a776392c6b54eb52d8d411c48f984faf339` |
| `src/sim/world.ts` | `ce55e2250741990d3a488dab6c5209afb3a8f602ae4394272baa00e8c8b3ab2a` |
| `src/sim/ribCollision.ts` | `a9738bef37f469c3d5ffdcb5227a0c5310cab72e30464cb9e9f4d5586a732156` |
| `dist/assets/index-DBZ5dmh1.js` | `ece9dbe372ca4bcc25d96421175193a44dbce28088373000284186a37a8713eb` |
| `dist/assets/index-CHzXt-7W.css` | `ec97b5d97f29dfda288959b2341ac6a6b825f8eddadca1a2fe55b9d8ee3209dd` |

Finite archive: **`/tmp/siltwake-rib-surface-fix/`**. `production-build-files.json` hashes every built file; `final/` retains the exact delivered source/tests/fixture. `SHA256SUMS.txt` hashes all payloads, including hidden compiled diagnostic baselines, copied/adapted scripts, red/green logs, raw exports, complete bounded input traces, captures/recordings, source/build identities and cleanup receipts. Original `/tmp` evidence archives were read only.

Final manifest: **406 payloads /18,720,393 bytes**, SHA256 **`18c5e7b87df8cd36096a0482211e9b21e142ed16f767fdedbc406e0b26ca0714`**. The manifest excludes itself and its summary. All diagnostics finished and owned resources were released before freezing it.

No children, peer messages/waits, push, PR, merge, parent-checkout mutation or adjacent tracked-path change occurred. No adjacent-path change is requested. Zero-normal interior/degenerate seeded states remain fail closed; no legitimate producer requiring an extension was found. Invalid full-footprint hull seeds above are explicitly unsupported diagnostics, not silently recovered saves. Box-overlap leniency and existing support rules are unchanged.

Paths and resources are released after this return. Root owns provisional inspection, the subsequent presentation leaf and fresh non-author Astra/Sol plus Opus verification; none is claimed here.
