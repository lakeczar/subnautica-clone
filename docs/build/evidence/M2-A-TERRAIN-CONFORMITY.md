# M2-A — terrain conformity correction

2026-10-18 worker session; UTC receipts extend into 2026-10-19. **Bounded implementation return for root inspection, not feature or whole-batch acceptance.** Code **34fdbd79e8bcc3a81cc81507398ba8c6270bfeeb**, directly on the required clean parent **99137519ac7674c96036ac2fd8139cedf58926b2**.

Actual runtime is **gpt-6.1-sol / max**, bound to `/home/worker/.t3/worktrees/subnautica-clone/t3-d76f0eff`, branch `t3/terrain-conformity-fix`. [Original turn_context](/tmp/siltwake-m2-a-terrain-conformity/runtime-turn-context.original.json), SHA256 **4796fb7e3b2cea6fc62f3f220449bb84b2d0c81edab3fbb0fc952802d181c9b0**, and [binding](/tmp/siltwake-m2-a-terrain-conformity/binding.json) retain the original session path and empty initial status. Read STATUS first, then PLAN, CONTRACTS, revised input/specification pointers, settled map, historical tracker, M2-A-CONTRACT, A2 and A2 integration records before implementation. No children, peer messages/waits, uncommitted peer consumption, parent mutation, push, PR or merge.

## Correction and boundary semantics

Only `src/render/terrainSurface.ts`, the authorized ceiling assertion in `tests/resource-surface.test.ts`, and new `tests/terrain-boundaries.test.ts` change in the code commit. This new report is the separate documentation change. All 50 other production source files are byte-identical to the parent. Public `TerrainSurface` and `createTerrainSurface()` remain unchanged.

- The rescue bench rectangle X38–54 / Z−60–−48 and all three shared `BASIN_GEOMETRY.terrainPads` are explicit discontinuities. Their **closed, inclusive boundaries belong to the physical top**, exactly as `terrainHeight` specifies. The bench can lower natural ground; Basin pads use the unchanged physical max rule.
- Exterior vertices retain the same boundary XZ and evaluate the outward one-sided physical limit using a **1e−7 m sampling offset**. At corners both outward coordinates are evaluated. There is no shifted footprint or artificial ramp. Coincident XZ vertices carry separate heights, and opaque vertical triangles close the top/exterior join. Continuous endpoints weld only below 1e−5 m height difference. Bench/natural-ground crossings are split before forming walls so a quad cannot fold when the higher side changes.
- Smooth refinement uses actual **float32 submitted triangle interpolation error**, with a **0.095 m** generator criterion and quarter-lattice/centroid probes. It chooses an anisotropic split by measured error and rechecks after neighbouring edges change. The connected correction area is X36–250 / Z−262–−38, plus physical derivative breaks X42/X102, coarse extension cells and affected transition neighbours. These are geometric/route bounds, not a list of reproduction-camera coordinates. No whole-world uniform oversampling.
- Boundary triangulation retains every shared edge vertex. The old complete topology assertion passes **without exceptions for walls or interior edges**. Original grid coordinates, unaffected literal coarse triangles, island refinement and workshop deck extraction remain intact.
- Bounded source-centred 0.4 m work-face sampling retains stock/host exposure. No source/art filtering or source movement was introduced. A retained audit finds the existing south Basin stock bottoms up to 6.67 cm below the analytical floor; that authored inconsistency was not changed. All original support/visibility assertions still pass, including the −0.045 m stock tolerance and replacement/depletion checks.

Physics, terrain authority, colliders, targeting, camera/eye/near plane, save/state and content are unchanged. At a discontinuity a continuous-interpolation error criterion is impossible: correct closed-top and exterior limits **plus the closed vertical face** are the applicable semantics. Tests check exact boundaries, both sides, corners and the vertical face itself.

## Geometry evidence and budget

Copied the root probe before execution and changed only its output path; sealed root evidence was not overwritten. [Probe provenance/diff](/tmp/siltwake-m2-a-terrain-conformity/root-probe-provenance.json), [before](/tmp/siltwake-m2-a-terrain-conformity/terrain-route-probe-before.json), [after](/tmp/siltwake-m2-a-terrain-conformity/terrain-route-probe-after.json). It reproduces both error signs on the required parent.

| Reproduction X,Z | Parent render minus physical | Final render minus physical |
| --- | ---: | ---: |
| Rescue top 53.325,−60 | −20.780265 m | 0 m |
| Rescue exterior 54.15,−59.5 | +11.467741 m | −0.000329 m |
| Basin approach 173.125,−211.75 | +7.177676 m | −0.009694 m |
| Canopy steep 96.8965517,−98.2241379 | +2.294883 m | +0.022700 m |
| Canopy opposite sign 101.4193548,−101.9516129 | −4.021974 m | −0.038416 m |

[Independent geometry audit](/tmp/siltwake-m2-a-terrain-conformity/geometry-audit.json) compares actual submitted float32 triangle identities with the parent and uses **45 interior samples per nonvertical triangle**, at different locations from the generator probes:

| Classification | Triangles / samples | Most negative error | Most positive error |
| --- | ---: | --- | --- |
| Changed, centroid inside physical world bounds | 23,600 / 1,062,000 | **−0.097439184 m** at (137.7192999,−139.0640824) | **+0.095763916 m** at (144.0643265,−136.5750167) |
| Changed outside those bounds | 1,560 / 70,200 | −0.092544153 m at (246.2280703,−261.1344096) | +0.073830048 m at (224.5906406,−279.2367814) |
| Identical retained triangles | 159,062 / 7,157,790 | **−0.308748954 m** at (19.4444445,−64.3616296) | +0.288468545 m at (−35.8187143,−18.7436535) |

Changed smooth samples meet the **≤0.1 m correction target**. These are measured extrema, not an analytic supremum between all samples. Unchanged regions remain approximate; this report does not claim world-wide 0.1 m conformity. Dense regression sampling also covers the complete connected correction area, crease strips, every discontinuity side/corner at offsets down to 0.0001 m, exact boundaries and opaque wall interiors.

Upper/quiet/Basin/return lanes have **12,474 / 15,876 / 14,742 / 29,079** terrain samples: **81 offsets across ±4.5 m**, zero missing surfaces, maximum signed ranges respectively −0.09048/+0.09043, −0.08343/+0.09014, −0.09085/+0.09377 and −0.05180/+0.08563 m. Unchanged production Dart sweeps pass along all four centre paths. The offset sampling is terrain evidence; it does not assert a Dart can occupy every square offset.

Final terrain: **92,720 vertices / 184,438 triangles**, including **216 vertical wall triangles**. Parent A2 had 169,784 triangles, leaving only 216 below its old ceiling. A uniform-refinement experiment reached roughly268k and was rejected. [Budget trials](/tmp/siltwake-m2-a-terrain-conformity/budget-trial.log) reducing local work grids to0.6/0.8 m still produced181,738/180,746 triangles; those trials are count experiments, not verified stock replacements. The final0.4 m grid preserves all existing source assertions. These measured variants justify using the root-authorized **220k ceiling**; they do not prove a global minimum mesh. The sole changed existing assertion raises170k→220k; no correctness sample or assertion was removed.

## Checks, source and input identity

Final clean **`npm run check` passes493/493, zero failed/skipped**, typecheck and production build after deleting generated `.test-build`. [Log](/tmp/siltwake-m2-a-terrain-conformity/check-final-clean.log), [original command/exit receipts](/tmp/siltwake-m2-a-terrain-conformity/validation-command-receipts.json). This run used the exact bytes subsequently committed as34fdbd7; source identity is verified. [Focused final log](/tmp/siltwake-m2-a-terrain-conformity/geometry-final.log) passes all eight surface/boundary tests. Full coverage retains all **35 normal views / 34 stable hosts**, source stock/replacement/depletion, actual transformed triangles, island/deck and rib regressions. Existing Vite large-chunk warning remains.

All three final economy commands exit0:

- `node scripts/check-m1-economy.mjs` — [final log](/tmp/siltwake-m2-a-terrain-conformity/economy-m1-final.log).
- `node docs/build/design/check-economy.mjs` — [final log](/tmp/siltwake-m2-a-terrain-conformity/economy-design-final.log).
- `node scripts/check-m2-a-economy.mjs --earned /tmp/siltwake-m2-a2/inputs/main-final-ui-export.json --out /tmp/siltwake-m2-a-terrain-conformity/economy-m2-final.json` — [final log/result](/tmp/siltwake-m2-a-terrain-conformity/economy-m2-final.json).

Required earned input remains unchanged, SHA256 **53cdb39d08b4396eea1b31028a2f1a57cb66070c3636034c52f00f7ba8218989**. A byte-identical0444 copy is retained in `inputs/`. These checks use staged production transactions/arithmetic, not an earned Basin expedition. Earlier `economy-m1.log` records a setup-order missing-module error before compilation completed; the successful final log supersedes it without deleting it.

[Source/build identity](/tmp/siltwake-m2-a-terrain-conformity/source-build-identity.json) hashes **105 source/test/config/public inputs**, all51 production source files,178 compiled outputs and all27 final build files. Inputs and production compiled modules are retained. `dist`, `final-dist` and `web/after` production bytes match. Final main **assets/index-8XIjNHAC.js**, SHA256 **e633e844768f198bb9379c98483b9829bc611d78c66dacc1f908a56759f23285**. Parent build main **assets/index-DZ87lE4H.js**, SHA256 **e7568829a60fcb8aae52c9fb7ec8bcaf92cca7e0a7e8e965bb64bf16fa6b20e7**; retained baseline terrain source matches9913751 exactly.

## Actual production views and contact smoke

Read both browser-rule files before browser use and verified isolated **factory-worker Linux**, worker-owned headless Chrome154. Used one owned incognito T3 tab on initially free port5190. Hardware: six logical CPUs, deviceMemory8, DPR2, ANGLE Vulkan **SwiftShader Device (Subzero)**. Shared hosts827911/847778 and all other tabs were preserved. No Windows/desktop pointer lock.

[Frame index](/tmp/siltwake-m2-a-terrain-conformity/frame-index.json) records **ten matched before/after pairs**, plus the smoke start. All ten pairs have **identical complete exported production states**, tick24423, pose, quality, viewport and buffer. [Visual audit](/tmp/siltwake-m2-a-terrain-conformity/visual-audit.json) records inspections and exact counts. The separate harness controls storage/frame timestamps, then imports unchanged production entry bytes; it installs no gameplay setter.

Matched views cover rescue top/exterior, both Canopy error signs, Basin pad exterior, both Basin piloted approaches and both diver facade seams, plus steep Canopy Light960. Rich CSS1280×800 uses buffer1280×800. Light CSS960×600 uses buffer640×400; **T3 normalizes saved PNGs to1280×800**, so there is no native960 PNG claim. Frame metadata retains pose/tick/quality/viewport/buffer/hardware/request/console data. All ordinary capture/smoke warning/error arrays are empty; recorded local production requests complete successfully.

These are **strict staged diagnostics**, based on sealed A2 `canopyFloor.json` (SHA256 **4761111a861ef64982e02f28ab3bbc742716e7b18049e9bf34dc870e7c9f11c2**). Its suit350 was purchased using diagnostic materials. [Staging/provenance](/tmp/siltwake-m2-a-terrain-conformity/stage-manifest.json) retains exact poses and unchanged ancestor input. Physical clearance is checked, but a seeded contact is not presented as an earned or ordinarily reached play position.

The five diagnostic reproduction contacts have positive eye/floor gaps **0.7500 /0.7503 /0.7273 /0.7884 /0.7597 m** (rescue top/exterior, Canopy steep/opposite, Basin). Minimum submitted near-plane corner gap is **0.30812 m**, with physical minimum0.30215 m. At the formerly buried exterior and Basin contacts the final images show real textured floor rather than uniform blue. Rescue top has its actual cliff edge. Canopy vegetation can still occupy much of the close steep view. Both facility signs, work decks and salvage remain visible from the approaches; inspected facade edges have no bright slit or new terrain sheet through the deck. The exact pad joins now read as textured vertical faces rather than sloping aprons. These observations are bounded to the retained views.

Actual DOM-input smoke starts from the staged rescue approach at tick24423, **(55,−40.6129062,−59.5), yaw270°, pitch−0.7**. Synthetic keyboard events pass through the real input controller; each100 ms pumped frame advances six production steps, with menu/export pauses between phases:

| Input | Actual exported result |
| --- | --- |
| W,4×100 ms /24 ticks | Tick24447, (54.0031557,−39.1973930,−59.5), supported floor contact |
| C,8×100 ms /48 ticks | Tick24495, same contact; downward movement correctly stops |
| S+Space,10×100 ms;18 idle ticks | Tick24573, (55.5743638,−36.1822139,−59.5), retreats clear |

[Original recording](/tmp/siltwake-m2-a-terrain-conformity/smoke-original.mp4), [trace](/tmp/siltwake-m2-a-terrain-conformity/smoke-trace.json), [complete-state replay](/tmp/siltwake-m2-a-terrain-conformity/smoke-audit.json). All three full exported states reproduce **exactly, zero difference**, through production `stepGame`. Total150 ticks /2.5 simulated seconds, zero clearance-false steps, zero health loss/new failures; oxygen99.925926→98.537037%. No service/refill command. The112.635 s uncut recording includes a long stationary agent-context interval; extracted motion/pause/contact/retreat frames were inspected. Pumped timing and synthetic keys do not prove human feel or real-time pacing.

**A real wall-contact near-plane limit remains.** Ordinary W allows the unchanged heightfield controller's centre to stop only **3.1557 mm outside X54**. The eye remains outside the wall and0.65 m above the local physical floor, but all four0.07 m near-plane corners cross the closed face; approach/contact images become uniform blue. Retreat restores visible terrain. The replay records55 affected steps and minimum physical near-plane floor gap−25.67655 m. This is not a passed contact-visibility result. Hiding/moving the wall, eye lift or physics changes would violate this leaf's scope, so none was applied.

Concrete additional scope for root: investigate radius-aware heightfield-discontinuity clearance in **`src/sim/world.ts` / `src/sim/step.ts` and movement regressions**, retaining the physical field and current camera datum. This is a separate controller/clearance correction; exact submitted terrain geometry alone cannot prevent an allowed camera near plane crossing a real wall. No extra path was edited here.

| Final captured scene | Vertices / triangles | Draws | Materials |
| --- | ---: | ---: | ---: |
| Rescue diver | 243,661 /414,215 | 3–23 | 13 |
| Canopy diver | 285,288 /467,079 | 7–9 | 15 |
| Basin pilot | 222,540 /377,360 | 17–22 | 12 |
| Basin diver | 219,564 /374,134 | 4–7 | 12 |

All measured final scenes remain below **400k vertices /650k triangles /160 draws**. These are actual Babylon counters, not mesh-count estimates. One cold Node terrain construction measures **3.200 s**; coarser-grid trials are3.08–3.19 s. Adaptive construction adds CPU cost, and this is disclosed for root/performance composition. It does not claim to close warm activation or provide consumer-GPU performance evidence.

## Archive, release and limits

[Archive](/tmp/siltwake-m2-a-terrain-conformity/evidence.tar.gz): **14,588,546 bytes**, SHA256 **7586673fd435ee34285c52efdce8f6830fcf720b5fc5bc028770866862caba70**. [Manifest](/tmp/siltwake-m2-a-terrain-conformity/manifest.json): SHA256 **8d844eb4d2588f19bf75e4ed27a37c224575646da1f127386544a36be0a64f62**. All **422 payloads /36,062,610 bytes** rehashed from423 archive entries, including the manifest. [Receipt](/tmp/siltwake-m2-a-terrain-conformity/archive-receipt.json). Archive/self receipt are excluded from the payload manifest; this tracked report is outside the archive. Rejected iterations and initial failures remain explicitly labelled in the artifact README.

[Cleanup](/tmp/siltwake-m2-a-terrain-conformity/cleanup.json): recording stopped, owned tab closed through `t3_preview_close`, owned server37153 stopped normally with Ctrl-C, port5190 closed; shared Linux hosts remain running. No owned browser/server/recording/check process remains. All assigned paths/resources are released; the worktree is clean after the separate report commit.

**Inherited level53 counterplay/OS2-06, warm regional activation, A3 priority findings and seeded carrier material excess remain open/inherited.** Retained-region approximation and the newly measured wall-contact near-plane limitation are explicit. No fresh earned Basin route, recovery/reload composition, pre-refill return margins, human feel, consumer-GPU result or acceptance is claimed. Root still composes the disjoint corrections, resolves required integration limits, performs the earned route/recovery/reload and commissions fresh complete-batch non-author Astra xhigh / Sol6.1 max reviews.
