# POLISH-1C — resource surfaces and local rendered terrain

Implementation handoff, **provisional**. Root must inspect the complete 1A+1B+1C candidate and obtain fresh independent non-author Astra `xhigh` and Sol 6.1 `max` reviews under DELIVERY_AND_ACCEPTANCE. This record does not grant acceptance.

The app-bound worktree was clean at exact parent `3c6ed94f247941d38ee2560a2f09f954afcd2f10`. Source commit: `131079f9985a89ee969079f85c2e8e2cd18b289e`. Actual implementation runtime was `gpt-6.1-sol`, reasoning effort `max`; [runtime receipt](/tmp/siltwake-polish-1c/runtime.json). No children, peers, alternate checkout, rebinding, push, PR or merge were used. Only the five permitted source/test paths and this evidence document changed.

All artifacts below are under `/tmp/siltwake-polish-1c/` unless an original directory is explicitly named. Original evidence directories were preserved. [Artifact index](/tmp/siltwake-polish-1c/artifact-index.json) distinguishes final ordinary proof, seeded diagnostics, supplementary captures and retained failures. [Final seal](/tmp/siltwake-polish-1c/seal.json) records both commits, this document's hash and the exact manifests after the evidence commit; its outer artifact manifest excludes only itself and the seal to avoid recursive hashing.

The final production entry actually loaded in the isolated browser was `dist/assets/index-L7oBd6Sf.js`, 1,346,163 bytes, SHA256 `89d49a1c1037342f3d82f5481a8916993d559bf12aa08cdefb1b9410e3265065`. [Browser receipt](/tmp/siltwake-polish-1c/browser-final.json) identifies that URL and the production renderer.

## Findings and implementation

The five requested **actual** 1B author images were inspected before editing, rather than treating exposure percentages as visual proof:

| Original under `/tmp/siltwake-polish-1b/` | Observed problem | Final correction |
| --- | --- | --- |
| `final-headland-reachable-stock.png` | Most scrap remains buried. | Five individually supported bent, ribbed and tagged plates follow the steep physical surface. |
| `final-headland-empty-south.png` | Anchor inconclusive and obscured by the real buoy. | Pale steel/ochre slope-following runners and a surviving service tag remain after stock disappears; final ordinary buoy placement leaves them visible. |
| `final-west-glass-stock.png` | Only small nodules emerge. | Five supported faceted glass nodules have readable silhouettes and contrasting faces. |
| `final-west-glass-empty-anchor.png` | Plain terrain plus cue. | Low abraded mineral ridges and small grazing scars persist as geological relief. |
| `final-workshop-empty-anchor.png` | Dark frame against deck, with overlapping terrain fragments. | Pale supported frame/tag, upward-facing custom surfaces, and extraction of hidden terrain beneath the existing opaque deck. |

The [original input manifest](/tmp/siltwake-polish-1c/original-input-manifest.json) hashes those images and original saves/audit. [Inspection notes](/tmp/siltwake-polish-1c/visual-inspection.json) identify the final images and their limits. Initial custom faces had downward normals and produced dark images; they were corrected before the final production build, and final primary captures were retaken. Those preliminary images remain labelled as failures or preliminary evidence. Some early close frame geometry was mistakenly attributed to the buoy; the corrected final images are the basis for the visibility claims.

`src/render/environment.ts` now creates three separate persistent meshes named `source-host.island_workshop_scraps`, `source-host.island_headland_scraps`, and `source-host.island_glass_ledge_west`. The three old anchors were removed from `reef.geology`. Stock remains in the original `source.<id>` groups and uses the existing stock-driven visibility lifecycle. Other art/material formulas are retained. `src/render/expedition.ts` changes only the three stock branches and their private surface-authoring helpers; workshop deck/hull/carrier/glass/opening geometry is unchanged.

`src/render/terrainSurface.ts` is render-only and imports the unchanged physical `terrainHeight`. Its exact exported API is:

```ts
TERRAIN_GRID = { nx: 190, nz: 178, minX: -95, minZ: -202, sizeX: 300, sizeZ: 290 }
RESOURCE_TERRAIN_BOUNDS = { minX: -24, maxX: 40, minZ: -46, maxZ: -18 }
WORKSHOP_DECK = { minX: 3, maxX: 16, minZ: -40, maxZ: -31, top: 1.2 }
interface TerrainSurface { positions: number[]; indices: number[] }
function createTerrainSurface(): TerrainSurface
```

Original coarse cells remain outside the bounded patch, snapped cell coverage and one transition ring. Affected cells use eight subdivisions per original edge. Adjacent coarse cells fan to the same fine edge vertices. Exact deck edges and the `z=-31` ramp derivative break are inserted into the triangulation. Faces under X3..16/Z−40..−31 are omitted because the unchanged existing deck covers them at Y1.2; ramp and perimeter terrain remain. Final topology tests permit boundary edges only at the world extent or extracted deck: no interior cracks, T-junctions or nonmanifold faces. Two remote control cells retain their original two triangles. The renderer's normal/color formulas and geographic extent are unchanged.

Only these `INTERACTION_HOSTS` entries changed:

| ID | `renderOffsetY` | `offset` X/Y/Z |
| --- | ---: | --- |
| `island_workshop_scraps` | 0.25 | −0.32 / −0.10 / −0.35 |
| `island_headland_scraps` | 1.50 | −0.50 / 0.10 / −0.40 |
| `island_glass_ledge_west` | 1.00 | −0.30 / 0.20 / −0.25 |

The optional unused `persistentOffsetY` field was removed from exported `InteractionHostDefinition`; `offset?`, `radius?`, `solidIds?` and `renderOffsetY?` retain their types. No other exported interface changed. Shared registry metadata still determines the selected host; these three retain default radius 1.15 m and 4 m reach. [Frozen registry audit](/tmp/siltwake-polish-1c/frozen-registry.json) deep-compares every other runtime export and other host with the parent. Source datums, yields, provenance, recipes, clues, hulls, simulation, physics, saves, targeting and input remain unchanged.

## Final triangle, support and cost checks

[Terrain audit](/tmp/siltwake-polish-1c/terrain-final-audit.json) interpolates the actual float32 triangle positions submitted by the production mesh. It samples 339,296 positions at 0.07 m spacing over X−23.9..39.9/Z−45.9..−18.1, excluding the opaque deck footprint. Maximum absolute error against `terrainHeight` is **0.0259067011 m**; signed range −0.0244992406..+0.0259067011 m. This is a sampled bound over that domain, **not a continuous or global guarantee**. Original remote coarse terrain and remote discontinuities remain.

At the reported failure coordinate X−14.197/Z−41.736:

| Quantity | Height / clearance (m) |
| --- | ---: |
| Unchanged physical field | −21.8799068744 |
| Parent rendered triangle | −21.0708334134 |
| Recorded ordinary eye | −21.2300000000 |
| Parent eye clearance | **−0.1591665866** |
| Final rendered triangle | −21.8699536032 |
| Final same-eye clearance | **+0.6399536032** |

This corrects the approximation rather than lifting the camera or changing physical motion. [Refinement comparison](/tmp/siltwake-polish-1c/refinement-choice.json) tested the same sampled domain using 2/4/8 subdivisions: 72,624/90,332/159,882 triangles and maximum errors 0.353677/0.106468/0.025907 m. Eight local subdivisions met the requested initial 0.05 m target; lower sampled variants did not. Those variants are offline diagnostics, not alternative runtime proof.

[Transformed stock/host audit](/tmp/siltwake-polish-1c/source-support-final.json) samples actual world-transformed triangles against the final rendered terrain/deck. The table reports sampled area exposure and min/max vertical surface gaps, rather than implying that exposure alone proves useful art.

| Mesh | Vertices / triangles | Exposed area | Min / max gap (m) |
| --- | ---: | ---: | ---: |
| Workshop stock | 630 / 420 | 100% | +0.01619 / +0.20250 |
| Workshop host | 520 / 788 | 100% | +0.01476 / +0.14873 |
| Headland stock | 630 / 420 | 100% | +0.00374 / +0.23225 |
| Headland host | 520 / 788 | 100% | +0.00376 / +0.36342 |
| West glass stock | 240 / 230 | 100% | +0.01712 / +0.46419 |
| West glass host | 843 / 612 | 99.9010% | −0.00197 / +0.16284 |

Headland's host world bounding box is 3.47 m tall because it follows steep terrain across a 2.21×1.72 m footprint; its maximum local relief is 0.363 m. It is a supported frame, not a new platform or collision-free wall. The west host's sampled 1.97 mm intersection is documented above. Stock/hosts use existing cel materials and restrained hardware/mineral colors.

[Adjacent support audit](/tmp/siltwake-polish-1c/adjacent-host-support.json) shows unchanged east glass stock exposure improves 86.67%→100%, nearby persistent geology 45.86%→64.82%, west resin 75.38%→95.99%, and east resin remains 100%. Both original shore-cup base exposures remain 42.40%; their unchanged buried bases were not redesigned. No resin-specific persistent geometry was present in the local geology sample. The terrain refinement does not newly bury these adjacent assets.

[Full scene roster](/tmp/siltwake-polish-1c/scene-mesh-roster-final.json) compares the full production scene with parent modules read using `git show` and transpiled into temporary files, without a separate checkout:

| Cost | Parent | Final |
| --- | ---: | ---: |
| Terrain vertices / triangles | 34,189 / 67,640 | 80,421 / 159,882 |
| Scene meshes / materials / geometries | 99 / 18 / 99 | 102 / 18 / 102 |
| Scene vertices / triangles | 253,559 / 391,011 | 301,707 / 485,460 |
| Scene attribute / index buffer bytes | 10,134,976 / 3,186,306 | 12,060,896 / 4,712,292 |
| Terrain total buffer bytes | 1,773,400 | 5,135,424 |
| One-run NullEngine scene creation (ms) | 577.07 | 822.90 |
| One-run environment creation (ms) | 176.11 | 466.88 |

The final terrain uses 32-bit indices. Exactly 94 pre-existing meshes hash-identically; changed meshes are terrain, `reef.geology` and the three stock groups, and the only added meshes are the three hosts. No materials were added. These CPU observations and buffer estimates are not consumer-GPU benchmarks. [Software frame sample](/tmp/siltwake-polish-1c/software-frame-sample.json) observes 18 actual SwiftShader frames at roughly 137–181 ms intervals, with no speed claim. [Disposal audit](/tmp/siltwake-polish-1c/disposal-final.json) keeps 102 meshes/18 materials/102 geometries stable across 100 stock/snapshot replacement cycles, verifies state purity, and leaves 0/0/0 after disposal.

The two new tests in `tests/resource-surface.test.ts` cover actual float32 approximation/topology/deck extraction/bounded triangle cost, transformed support and tags facing upward, all 20 unchanged source target fixtures, stock and persistent lifecycle, replacement/disposal and state purity. No existing tests or `tests/targeting-support.ts` fixtures changed. The [exact all 20-view audit](/tmp/siltwake-polish-1c/target-views-final.json) also finds zero rendered-terrain triangle intersections on their host segments.

## Actual final production play

Ordinary proof used normal import of byte-identical earned `/tmp/siltwake-polish-1b/afterFabricationStorage.json` (SHA256 `8b8970ceeceb1861e6f6da5f41c94e8ebf99a19038733045d4604e70e0ca6476`), and normal re-import of its own earned intermediate exports. The headland final branch resumes `headland-stock-earned-before.json`, reached from that original through recorded ordinary travel/storage before the final normal correction; source stock was never granted/reset. Workshop/west and headland are separate earned branches, not a claim of one continuous whole-campaign run. Original reef/Canopy earned saves were used only for bounded appearance controls. Original saved poses, registries and codec semantics remain valid; [compatibility audit](/tmp/siltwake-polish-1c/original-save-compatibility.json).

The page received existing DOM controls, WASD/Space/C/B/E/Tab/menu inputs and synthetic relative look events. It did not load simulation helpers, state setters, inventory grants or teleport/reset code. Offline audits/tests use simulation imports separately and make no ordinary-play claim. [Ordinary proof summary](/tmp/siltwake-polish-1c/ordinary-proof-summary.json), full exports and the twelve hashed traces retain input commands, ticks, positions, prompts and outcomes. Default final viewport was 1280×800 CSS pixels, DPR 2, Rich mode; recordings are 2560×1600 H.264. [Media metadata](/tmp/siltwake-polish-1c/media-metadata.json) records each duration and size.

Each site has two useful final ordinary stock/empty approaches:

| Site / approach | Stock | Empty |
| --- | --- | --- |
| Workshop east | [image](/tmp/siltwake-polish-1c/final-workshop-stock-east.png) | [image](/tmp/siltwake-polish-1c/final-workshop-empty-east.png) |
| Workshop north | [image](/tmp/siltwake-polish-1c/final-workshop-stock-north.png) | [image](/tmp/siltwake-polish-1c/final-workshop-empty-north.png) |
| Headland north | [image](/tmp/siltwake-polish-1c/final-headland-stock-north.png) | [image](/tmp/siltwake-polish-1c/final-headland-empty-north.png) |
| Headland west | [image](/tmp/siltwake-polish-1c/final-headland-stock-west.png) | [image](/tmp/siltwake-polish-1c/final-headland-empty-west.png) |
| West glass north | [image](/tmp/siltwake-polish-1c/final-west-glass-stock-north.png) | [image](/tmp/siltwake-polish-1c/final-west-glass-empty-north.png) |
| West glass east | [image](/tmp/siltwake-polish-1c/final-west-glass-stock-east.png) | [image](/tmp/siltwake-polish-1c/final-west-glass-empty-east.png) |

[Headland before selection](/tmp/siltwake-polish-1c/final-headland-stock-before-selection.png) and [west glass before selection](/tmp/siltwake-polish-1c/west-glass-stock-before-selection.png) show recognizable stock without a cue; the headland supplementary pose is outside interaction reach and is not an E-action pass. The twelve table images supply the valid approach comparisons. Final workshop north empty was retaken after normal bulk storage and packing the real buoy, rather than accepting an obscured frame.

| Ordinary cycle | Complete exported receipts | Bounded final recordings / restocked view |
| --- | --- | --- |
| Workshop 10 alloy, three E collections 4+4+2; stock 0/reserve 8; normal sort → stock 2/reserve 6 | `final-reload-before.json` tick 9266, `final-workshop-empty-clean.json` tick9610, `final-workshop-restocked.json` tick10578 | [Deck/travel/depletion](/tmp/siltwake-polish-1c/final-workshop-deck-stock-depletion.mp4), [storage/restock](/tmp/siltwake-polish-1c/final-workshop-storage-restock.mp4), [buoy packed / clear empty frame](/tmp/siltwake-polish-1c/final-workshop-buoy-pack-empty.mp4), [restocked](/tmp/siltwake-polish-1c/final-workshop-restocked-east.png) |
| Headland 18 alloy, five E collections 4+4+4+4+2 using normal diver/buoy storage; stock 0/reserve 8; sort → 2/6 | `final-headland-depletion-attempt.json` tick17360 **is successful depletion despite its filename**; `final-headland-active-sort.json` tick18293; `final-headland-restocked.json` tick19443 | [Two approaches/deplete/sort/restock](/tmp/siltwake-polish-1c/final-headland-stock-deplete-sort-restock.mp4), [restocked](/tmp/siltwake-polish-1c/final-headland-restocked-north.png) |
| West 10 glass, five E collections 2 each; stock 0/reserve 8; sort → 2/6 | `final-west-glass-depleted.json` tick13642; `final-west-glass-active-sort.json` tick14076; `final-west-glass-restocked.json` tick15235 | [Terrain approach / depletion](/tmp/siltwake-polish-1c/final-west-terrain-approach-stock-depletion.mp4), [empty/sort/restock](/tmp/siltwake-polish-1c/final-west-empty-sort-restock.mp4), [restocked](/tmp/siltwake-polish-1c/final-west-glass-restocked-north.png) |

The final deck recording includes changing walking/look views. Inspected 40/42/44/46-second extracted frames show stable planking at different headings; extracted frames are retained as supplementary samples, not a claim to have tested every video frame. Final stills show the clear empty frame, and the actual mesh has no underlying coplanar terrain faces. Some arbitrary headland/west extracted frames show menus or close ground; those are not standalone pass evidence.

[Final route audit](/tmp/siltwake-polish-1c/terrain-route-final.json) checks actual recorded ordinary camera/body coordinates against final float32 triangles, with exact segment/triangle intersections for selected hosts:

| Final trace | Valid affected records | Minimum eye clearance (m) | Selected rays / terrain intersections |
| --- | ---: | ---: | ---: |
| `trace-final-workshop-pre-reload.json` | 133 | 1.620000 | 67 / 0 |
| `trace-final-headland.json` | 427 | 0.642369 | 125 / 0 |
| `trace-final-west-and-controls.json` | 887 | 0.640278 | 154 / 0 |
| `trace-original-west-rim-replay.json` | 34 | 0.644456 | 13 / 0 |
| `trace-workshop-clean-empty.json` | 43 | 1.620000 | 11 / 0 |

Minimum sampled body-to-render gap is −0.009722 m: a small honest render approximation, with unchanged collision. The camera remains the ordinary sim eye, 0.65 m above swimming body or 1.62 m above walking feet. One HUD/renderer transition record in each headland and west trace contains the startup camera `(25,13,44)` against a different body pose; those records remain reported, and are excluded only from same-frame presentation assertions. Other listed traces have no eye mismatch. No selected-host segment in the audited final routes crosses a terrain triangle.

An additional normal import of original `/tmp/siltwake-polish-1b/ordinary-west-glass.json` moved through the reported rim using ordinary controls. It reached body `(−14.20010854,−21.88004292,−41.73606136)`, within3 mm of the old failure, with sim eye Y−21.230 and positive 0.644456 m rendered clearance. [Replay image](/tmp/siltwake-polish-1c/original-west-rim-replay.png), [video](/tmp/siltwake-polish-1c/original-west-rim-replay.mp4), [full export](/tmp/siltwake-polish-1c/original-west-rim-replay.json) and its trace preserve the actual result. This close rim framing is a clearance comparison; the two glass approaches in the table establish the art's readability.

Actual unaffected local controls: [east shore food](/tmp/siltwake-polish-1c/final-control-shore-east.png) gathered 2 meals at tick 10658; [west shore food](/tmp/siltwake-polish-1c/final-control-shore-west.png) gathered 2 at tick 10906; [C03](/tmp/siltwake-polish-1c/final-control-C03.png) opened notebook `finding-C03`; [services](/tmp/siltwake-polish-1c/final-control-services.png) opened Fabrication & services through E. The shore/C03 recording retains initially mis-aimed service attempts; successful service opening is at the beginning of the final west approach recording and in the final trace. [Reef control](/tmp/siltwake-polish-1c/final-control-reef.png) uses original earned `alloy-first.json`; [Canopy control](/tmp/siltwake-polish-1c/final-control-Canopy.png) uses original earned `crust-four.json`. Their bounded videos/traces are retained. The supplementary Canopy source close-up is too close to the unchanged fin to establish broad source readability. No unrelated expedition/recovery/carrier campaign was replayed.

## Actual reload

`final-reload-before.json` at tick 9266 contains workshop stock 0/reserve 8 and active sort 19.7333333333 s. Actual final-build page reload and 80 no-input ticks produce `final-reload-after.json` at tick 9346, stock 0/reserve 8 and active sort 18.4000000000 s. [Comparison](/tmp/siltwake-polish-1c/final-reload-comparison.json), [comparison script](/tmp/siltwake-polish-1c/compare-final-reload.mjs), [recording](/tmp/siltwake-polish-1c/final-reload.mp4) and `trace-final-reload.json` retain the proof.

The **entire expected state equals the entire actual state** after replaying those 80 ticks offline through production update/codec. No field filtering, rounding or ignored state fields; actual encode/decode normalizes JavaScript signed zero. Expected commands are zero look/movement. Normal settings selected Drag before reload to avoid late native captured-pointer deltas, and Captured was restored afterward. Preliminary reload captures with a native capture delta or signed-zero-only comparison are retained separately and are not the final equality claim.

Before-save SHA256: `db0200cce0fdcc616f02d5b6594e1c0a07e87e6840842107cefa4ca57a9cfe2a`.
After-save SHA256: `269f299122cdb8d6106ec0c3477226933a38ec45b69b24e91ce3b66e5cf1b64f`.

## Separate seeded rib diagnostic

This is **labelled seeded production optical evidence, never ordinary earned play**. No natural current source was moved or added. `rib-diagnostic.mjs` used the production codec to create `SEEDED-rib-optical-cache.json` from original `alloy-first.json`, changing pose/mode/velocity, sequence and one cache/container/one-glass item, with labelled feedback. Production source/sim files were not changed. Initial offline candidates failed body-clearance checks; the retained final fixture has a capsule-clear planned route and 56 actual route records checked against production solid geometry.

[Actual runtime audit](/tmp/siltwake-polish-1c/SEEDED-rib-runtime-audit.json): blocked body `(−6,−8.3,−10)`, eyeY−7.65, cache `(−6,−7.95,−6.4)`, hostY−7.65. Target is within 4 m; actual production rib mesh ray hit distance 0.934855 m, world LOS=false, selected target=null, no cue/prompt, and E says Nothing within reach. Ordinary keys move around the rib to body `(−2.8310027073,−8.3,−7.2749494311)`: rib hit=false, LOS=true, matching cue/prompt for `rib_optical_cache_900`, and E opens `container-rib_optical_hold`.

[Blocked](/tmp/siltwake-polish-1c/SEEDED-rib-blocked.png), [clear](/tmp/siltwake-polish-1c/SEEDED-rib-clear.png), [opened cache](/tmp/siltwake-polish-1c/SEEDED-rib-opened-cache.png), [bounded recording](/tmp/siltwake-polish-1c/SEEDED-rib-blocked-clear.mp4), both full exports and `trace-SEEDED-rib.json` retain the diagnostic. This isolates actual rib optical obstruction using a body-clear approach; it does not invent an ordinary source or establish a new gameplay route. The ordinary earned branch was restored afterward.

## Validation, hashes and closure

Final `npm run check` passes typecheck, **265/265 tests**, and production build; [complete log](/tmp/siltwake-polish-1c/check-final.log). Final `node scripts/check-m1-economy.mjs` passes; [economy log](/tmp/siltwake-polish-1c/economy-final.log). Its staged arithmetic/transactions are not new ordinary-campaign acceptance. The existing large-bundle build warning remains. `git diff --check` passed. No source changes followed those final checks.

| Manifest | Count / scope | SHA256 |
| --- | --- | --- |
| [Source](/tmp/siltwake-polish-1c/source-manifest.json) | All 37 `src` files, parent/current hashes | `615deab08eadaab301d53c9250da0d6a316e4d361b0983a9c53e2e153d9c50fe` |
| [Tests](/tmp/siltwake-polish-1c/test-manifest.json) | All 25 test files, parent/current hashes | `8a54139c7dfbb9ef52ad5848e05cde60f0933602b396dd1370c10d8bbca51c90` |
| [Build](/tmp/siltwake-polish-1c/build-manifest.json) | All 27 `dist` files | `bedbc50b2aa3bbf610719f82a21bcf894da72821375dddadf1dfb4f5b54907e7` |
| [Original inputs](/tmp/siltwake-polish-1c/original-input-manifest.json) | Original five images, six saves, root terrain audit | `456aa30e0721c3e9344991b77aa7f3567e43e29c917a0b2b2118ee6c81321adb` |
| [New saves](/tmp/siltwake-polish-1c/new-save-manifest.json) | All 28 codec save files, labelled ordinary/seeded/preliminary | `d6287123a92e450c66f3674b2010065245c572577f18af7203a46536d56bf3ad` |
| [Traces](/tmp/siltwake-polish-1c/trace-manifest.json) | All 12 actual trace files | `98e74055769d48b7f8eeb569a75618689ccd7c19b4e45150b3a79de661ee1841` |
| [Media](/tmp/siltwake-polish-1c/media-manifest.json) | All 90 PNG/MP4 files, including retained failures | `e7468aba2bce496befd5e639581d84891bfd149890296f4889a50eff7fd8f0fc` |

[Final artifact manifest](/tmp/siltwake-polish-1c/artifact-manifest.json) covers all other temporary files, tools, complete audits and logs as exact bytes; [seal](/tmp/siltwake-polish-1c/seal.json) hashes the manifests and final committed evidence. No final media/trace/save is substituted with a selected screenshot hash alone.

Both browser rule files were read before browser work. Actual browser processes were verified on isolated **factory-worker Linux Chromium headless 154**, SwiftShader, muted, rather than inferred from shell location; [machine receipt](/tmp/siltwake-polish-1c/browser-machine.json). Own incognito tab/storage and checked-free port 5191 were used through T3. The bounded final diagnostic snapshot reports only Babylon log messages and requested production assets HTTP200; [diagnostics](/tmp/siltwake-polish-1c/browser-diagnostics-final.json). Synthetic keys/relative motion do not establish native-relative-motion, human feel, consumer-GPU performance or audible output. The inherited native drag tooling timeout remains an honest prior limit, not a newly fixed art behavior.

[Cleanup receipt](/tmp/siltwake-polish-1c/cleanup.json): all own recordings stopped; own tab `tab_2o_0430977b-1ed3-45f2-ac72-3683f9fe8942` closed through normal T3 lifecycle; own server session 28330 stopped by Ctrl-C; a successful bind/close on 0.0.0.0:5191 confirms the port free. Shared browser host, historical tab 14, user and peer sessions were preserved. No process-name kills or browser relaunch/poll loops were used.

No cross-path implementation need remains. The submitted corrections address P1-VIS-1/2/3 within the owned render/metadata scope; art judgment, the complete candidate's acceptance and independent review remain root's responsibility. The sampled local terrain limit, small residual body/render difference, increased mesh/buffer/CPU cost and platform/input/audio limits above remain explicit.
