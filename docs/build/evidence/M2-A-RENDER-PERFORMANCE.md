# M2-A render-performance correction

Implementation evidence for **ROOT-A2-PERF** and **ROOT-A2-MATERIAL**, on source **`6dbd9cab1ed17a6541417e6c75ffeaf1063c2001`**. Warm reconstruction meets the unchanged **50 ms** trial in the retained CPU and production WebGL samples. The pinned carrier retains all signs and uses **21 materials**, down from 27 against the original 24-material trial. This is a bounded implementation handoff; root owns composition and independent acceptance.

## Binding and scope

Required clean parent **`99137519ac7674c96036ac2fd8139cedf58926b2`** was verified before edits, including A2 `2d209a8` and A3 `222b805`. Branch `t3/region-render-cache`, worktree `/home/worker/.t3/worktrees/subnautica-clone/t3-5daaa259`, host `factory-worker`. The retained [original runtime turn_context](/tmp/siltwake-m2-a-render-performance/runtime/original-turn-context.json) verifies **gpt-6.1-sol / max** and the bound cwd. [Binding](/tmp/siltwake-m2-a-render-performance/runtime/binding.json).

Read STATUS, PLAN, CONTRACTS, revised input/specification pointers, M2-A-CONTRACT, A2 brief/author evidence/root integration, settled map, integration and browser records before implementation. Applied the diagnosing-bugs workflow to establish a failing regression and preserve baseline samples. No children, peer messages/waits, peer code consumption, parent-checkout mutations, push, PR or merge. No additional path proposal is needed.

Only seven owned render files and two owned test files changed: `geometry.ts`, new `geometryCache.ts`, `renderer.ts`, `ecology.ts`, `environment.ts`, `expedition.ts`, `landmarks.ts`, `m2-region-render.test.ts`, new `render-cache.test.ts`. This new report is the separate evidence change. TerrainSurface/resource-surface and UI/app ownership remain with their assigned workers.

## Change and lifetime

Each regional renderer owns one detached numeric recipe cache, capped at **256 entries /33,554,432 numeric bytes**. Explicit factory/region/full-generation namespaces prevent collisions between distinct seeded paths. A hit creates a new live mesh and detached vertex/index buffers, with the original name, attributes, colors and contour. Factory calls still execute their original seeded random sequence. Dynamic hulls, carrier lock shells, state-dependent geometry and animation poses are not label-keyed cached assets. Resource/actor handles and visibility still read current state.

Only two adjoining detailed regions stay resident. Coarse navigation and occupied/transfer/recovery actor pinning remain intact. Departed live geometry is disposed; the cache retains no GameState, live meshes, materials or textures. Cache admission is bounded without a global owner or asset framework. Renderer/scene terminal disposal clears all recipes. Reconstruction starts a new owner; quality changes cannot revive disposed handles.

Identical live sign text shares the unchanged raster and optical material settings through a renderer-owned reference-counted owner. Every plane remains; the final reference disposes its material and texture. The carrier saves six duplicate pairs: RESCUE ×1, PORT ×1, STARBOARD ×1 and DRY / ISOLATED ×3. Changing lock text releases obsolete ownership. All authored shapes/colors, shaders, pane ordering, source IDs, camera/FOV/seat, public renderer API, physics/input/save/content and simulation rules remain unchanged.

## Checks and regression evidence

Clean committed-source **`npm run check` passes 493/493 tests**, typecheck and production build. [Complete log](/tmp/siltwake-m2-a-render-performance/final/check-clean-committed.log). The existing Vite large-chunk warning remains. All three economies pass on committed source:

- `node scripts/check-m1-economy.mjs` — [log](/tmp/siltwake-m2-a-render-performance/economy/m1-committed.log).
- `node docs/build/design/check-economy.mjs` — [log](/tmp/siltwake-m2-a-render-performance/economy/design-committed.log).
- `node scripts/check-m2-a-economy.mjs --earned /tmp/siltwake-m2-a-render-performance/inputs/main-final-ui-export.json --out /tmp/siltwake-m2-a-render-performance/economy/m2-committed.json` — [log](/tmp/siltwake-m2-a-render-performance/economy/m2-committed.log), [result](/tmp/siltwake-m2-a-render-performance/economy/m2-committed.json).

The earned input is a byte-identical read-only copy of `/tmp/siltwake-m2-a2/inputs/main-final-ui-export.json`, SHA256 **`53cdb39d08b4396eea1b31028a2f1a57cb66070c3636034c52f00f7ba8218989`**. Economy checks are arithmetic/staged production transactions, without a new earned-route claim.

The corrected synchronous mesh-construction regression failed on the parent with **5,028 creations** on a refuge revisit and **27 carrier materials**; both pass after the change. The earlier deferred-observer instrumentation attempt is retained separately, with its corrected failing probe. Tests assert construction counts and lifetime/state behavior, without timing-flaky CI thresholds. They cover detached live-buffer mutation, entry/byte admission refusal, terminal disposal, seeded full/regional identities, animation poses, both qualities, five returns, exact live-count stability, source depletion/replacement, carrier lock reconstruction, and actual submitted remote pinned assemblies.

## CPU measurements

[Profiling script](/tmp/siltwake-m2-a-render-performance/scripts/profile.mjs) loads frozen parent and final production factory modules **in the same Node24.21.0 process**, using Babylon9.31.0 NullEngine. Each run uses the same initial eight-stop circuit plus **five complete return traversals**. Construction and disposal are outside the update populations and reported separately; stable updates and cold first-use are also retained. Median is conventional; p95 is nearest rank. Every sample, including the worst, remains in [baseline](/tmp/siltwake-m2-a-render-performance/baseline/cpu.json) and [final](/tmp/siltwake-m2-a-render-performance/final/cpu.json).

| CPU phase, milliseconds | n | Parent median | Parent p95 /max | Final median | Final p95 /max |
| --- | ---: | ---: | ---: | ---: | ---: |
| Static construction | 1 | 701.343224 | 701.343224 | 561.078047 | 561.078047 |
| Cold regional activation | 3 | 165.595116 | 360.111370 /360.111370 | 156.340362 | 196.018753 /196.018753 |
| Warm regional activation | 22 | 104.1424975 | 148.966214 /185.200350 | **4.7396945** | **7.603474 /10.020145** |
| Stable update | 23 | 0.047523 | 0.176045 /0.184392 | 0.036030 | 0.179953 /0.227947 |
| Terminal art disposal | 1 | 0.666963 | 0.666963 | 0.928579 | 0.928579 |

Warm creation falls from **1,285–3,629 meshes /1,270–3,579 temporary primitives** to **15–56 meshes /0–6 temporary panes**. A complete warmed circuit stabilizes at **81 entries /22,709,776 numeric bytes**, including all original attribute/index precisions. This excludes JS array/descriptor overhead and GPU/driver allocations; it is not a total-memory claim. After disposal: zero meshes/geometries/textures, cache 0 entries/bytes and terminal, with only the two scene-owned cel/glass materials until scene disposal. Live counts do not grow across returns.

The earlier independent baseline is also retained: warm median 99.632177/p95 150.698601/max 155.705655 ms in `baseline/initial-cpu.json`. It was not substituted for the paired run. [Complete performance summary](/tmp/siltwake-m2-a-render-performance/final/performance-summary.json).

## Actual production WebGL and visuals

Both browser-rule files were followed. T3 status/open established one owned incognito tab, isolated storage and free 5191 on **factory-worker Linux headless Chrome154**, six reported cores, DPR2, **ANGLE Vulkan SwiftShader**. No desktop pointer lock or Windows automation. An external `audit.html` stages strict-codec saves, controls RAF and captures existing export Blobs while importing the **unmodified production bundle**. No gameplay setters are exposed.

Parent/final production runs use the same browser process and same live renderer within each run: initial Canopy plus six Basin/refuge/Canopy import circuits, giving five complete returns. These are diagnostic state replacements, not earned travel. [Raw parent](/tmp/siltwake-m2-a-render-performance/baseline/browser-returns.json), [raw final](/tmp/siltwake-m2-a-render-performance/final/browser-returns.json).

| Production CPU activation, milliseconds | n | Parent median | Parent p95 /max | Final median | Final p95 /max |
| --- | ---: | ---: | ---: | ---: | ---: |
| Cold first-use | 3 | 331.6 | 488.3 /488.3 | 131.8 | **633.7 /633.7** |
| Warm revisit | 16 | 218.55 | 294.8 /294.8 | **14.35** | **23.0 /23.0** |

Final warm Basin median 12.6/max 14.3, refuge 21.7/23.0, Canopy 13.8/15.5 ms. All 16 warm final samples meet 50 ms. Additional New 13.6 ms, warning import 36.7 ms and cold Continue 679.4 ms remain separately retained. The earlier baseline Canopy 878.3 ms outlier and every cold visual-matrix sample remain archived. Cold startup is still expensive; the higher retained final cold maximum is not hidden by the warm result.

These timings measure synchronous CPU activation. RAF wall times include CPU rendering/submission and worker scheduling, without a GPU fence or GPU-completion measurement. SwiftShader is not a dedicated-GPU pass; construction timing alone does not establish frame pacing.

| Final production scene, Rich | Meshes /geometries | Vertices | Triangles | Actual draws | Materials | Textures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Basin crest | 61 /61 | 215,201 | 362,706 | 24 | 12 | 7 |
| Canopy90 | 96 /96 | 277,949 | 452,425 | 25 | 14 | 9 |
| Carrier interior | 133 /133 | 210,948 | 334,265 | 24 | **21** | **16** |

The carrier previously used 27 materials/22 textures with identical geometry/draw counts. Canopy previously used 15/10; Basin 12/7 is unchanged. Both qualities preserve required signs/gauges.

**All six parent/final PNG pairs are byte-identical**: Canopy90, Basin crest, carrier interior, each at Rich 1280×800 and Light 960×600. The final warmed Canopy frame is also identical to its cold/baseline frame. [Pair hashes and viewport/buffer metadata](/tmp/siltwake-m2-a-render-performance/final/visual-comparison.json); [inspected scene contact sheet](/tmp/siltwake-m2-a-render-performance/captures/final-scenes-contact.png). T3 normalizes PNG output to1280×800 for the smaller CSS viewport; actual buffer and CSS dimensions are retained. All 16 NullEngine before/after scene snapshots match exactly in attributes, indices, transforms, enabled state, names and metadata: [comparison](/tmp/siltwake-m2-a-render-performance/final/geometry-comparison.json).

## State, input and lifecycle evidence

Actual production DOM key input from retained diagnostic `warningApproach.json` exercises W7×100 ms, Z33×100 ms, then S+Space20×100 ms and5 coast frames. The resulting fixed-step sequence is idle1, approach42, quiet198, retreat120, coast30. Exports show tick 24424 start →24466 warning →24664 disengage →24814 retreat. [Input trace](/tmp/siltwake-m2-a-render-performance/final/input-trace.json), [inspected warning](/tmp/siltwake-m2-a-render-performance/captures/final-input-warning.png), [recording](/tmp/siltwake-m2-a-render-performance/captures/input-warning-quiet-retreat.mp4), [motion extracts](/tmp/siltwake-m2-a-render-performance/captures/input-motion-contact.png). Recording contains controlled-frame/wall-time gaps; it establishes bounded behavior rather than human feel or real-time frame pacing.

[Complete-state replay](/tmp/siltwake-m2-a-render-performance/final/input-state-audit.json) compares all exported state fields against production `stepGame`: **all ten comparisons pass with maximum numeric delta0**, including paused loss/restoration, deliberate resume and Continue/journal. Threat positions are authoritative; no threat or resource stock is frozen by the cache.

Actual New confirmation reconstructs refuge/island at tick0; actual file import replaces actors with the warning state. Quality switching Rich→Light→Rich→Light and resize 960→1280 preserves live geometry/material/texture counts. Light buffers are 640×400 and 853×533; Rich 1280×800. Save locally retains journal tick 24814. WEBGL_lose_context holds state/journal unchanged through ten100 ms frames lost and ten after restoration, stays paused, and restores the same counts. Only deliberate Return advances to 24815. An actual page reload without reseeding pose, followed by Continue, restores the same complete state/camera/counts and tick 24815; zero console errors. Loss/restoration emit only their expected warnings. Files: `final/{new-session,import-warning,quality-resize,before-loss,graphics-lost,graphics-restored-paused,graphics-deliberate-resume,continue}.json`.

[Rule-backed state diagnostic](/tmp/siltwake-m2-a-render-performance/final/rule-state-audit.json) additionally uses production aimed interaction for seven pickups, depleting Basin fin stock 14→0. Its host remains visible, departed mesh is disposed, warm reconstruction creates a fresh hidden source, and same-ID replacement follows actual stock in both qualities. A real paid Bobbin craft, disable/tow/step/repair sequence creates a remote recovery operation, submits the hull at its true position outside the two resident regions, progresses simulation identically to an unrendered control, and releases the pin after repair. All staged states pass the strict codec. Initial missing-investment staging rejection and the opening-grace observation remain in separate logs; the corrected diagnostic explicitly stages a valid investment and expired grace. This is funded/staged evidence, not earned acquisition or travel.

## Provenance, archive and release

[Provenance inventory](/tmp/siltwake-m2-a-render-performance/runtime/provenance.json) retains 103 parent/105 final source/test/config/script inputs, 24 diagnostic fixtures, compiled modules and 27 files per production build. Committed-source `dist`, retained final build and served production files all match byte-for-byte. Baseline build and served files also match.

- Parent bundle `assets/index-DZ87lE4H.js`: SHA256 `e7568829a60fcb8aae52c9fb7ec8bcaf92cca7e0a7e8e965bb64bf16fa6b20e7`.
- Final bundle `assets/index-Cmkz47oC.js`: SHA256 **`4544eaf87cc0b11fd281ba11ea6e305090d1cbb7d9a08d19d41406b7592be6d0`**.
- [Archive](/tmp/siltwake-m2-a-render-performance/evidence.tar.gz): **826 payloads**,828 archive entries,9,979,942 compressed bytes; SHA256 **`1d8189cb5c1123a585b1d57b039a6eaaeffca7e1d0dc789e467d9f5f508d4f64`**.
- [Manifest](/tmp/siltwake-m2-a-render-performance/MANIFEST.json): SHA256 **`a27866049a464e44fd0450b56eb4fb06088cb2a78c1a58ca805b6b902f8a42df`**. [SHA256SUMS](/tmp/siltwake-m2-a-render-performance/SHA256SUMS), [verification receipt](/tmp/siltwake-m2-a-render-performance/archive-verification.json).

Every archived payload hash/size was verified against the manifest and retained disk copy; no node_modules or symlinks are archived. Archive/checksum/verification/handoff outputs and this Git report are outside the payload manifest to avoid recursive identities. Reproduction scripts, complete raw samples, first attempts, screenshots/video, source snapshots and build modules are included.

Owned recording stopped, T3 tab closed through normal lifecycle, own server session 58823 stopped normally, port5191 refuses connection, tab list empty, shared browser hosts 827911/847778 preserved. No check/server/recording/child process remains owned. [Cleanup receipt](/tmp/siltwake-m2-a-render-performance/runtime/cleanup.json). Source was clean before this report; all assigned paths/resources are released on the separate evidence commit.

**Inherited limits remain:** ROOT-A2-FLOOR, ROOT-A3-01, OS2-06 high-approach/natural-cover learning and full earned Canopy–Basin return/recovery/reload composition. Cold startup, total process/GPU memory, representative dedicated-GPU performance, audible mix and human feel remain unaccepted. Root integrates terrain and priority corrections before ordinary composition and a fresh complete-batch non-author Astra xhigh/Sol6.1 max pair. This leaf does not waive any of those requirements or claim milestone acceptance.
