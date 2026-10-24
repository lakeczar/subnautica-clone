# Asset authoring and delivery pipeline

2026-10-24 · Sol 6.1 xhigh · Independent research for Siltwake; **Opus 5.5 authors the assets**.

**Recommendation: introduce scripted Blender during the next foundation/content work, alongside the existing TypeScript procedural art.** Let Opus build selected reusable props and hero forms with `bpy`; export GLB as an interchange artifact, then compile rigid assets into Siltwake's existing mesh recipes and WK-1 packs. Keep terrain, caves, scatter and most vegetation procedural. Prove the path with one field-station service cabinet before content wave B, and use it for ENV-1 and selected later assets before the atmosphere pass. Blender MCP is an optional interactive authoring aid, not a prerequisite for this pipeline.

This is a proposal for the coordinator's stream briefs, not a change to scope, art direction or accepted budgets. No tool installation, external-code execution, browser, render, benchmark, heavy job, delegation or PR operation was performed. Online work retrieved primary documentation and source as data over HTTP. **No `docs/spoilers/*` was read. `research/asset-pipeline-opus` was not read before this report's initial commit**; the independent critique round follows that commit.

## 1. Evidence and the current seam

Repository baseline: `1a9509102b27e60084ccc9e7fdc53d4a4823f6bc`. Read AGENTS, STATUS, DIRECTION, GAME-DIRECTION, the revised build scope and its platform/integration pointers, OPENING-DESIGN, CORE-HELPERS, the platform recommendation, current renderer/world code and bake sources. STATUS's October 20 snapshot is older than STREAMS. On this baseline CW-1's merge and WK-1 remain dependencies; this report does not assert that their branch-only work has landed.

Relevant existing facts:

- [package.json](../../../package.json) pins only `@babylonjs/core@9.31.0`; there is no loader dependency. [ArtBatch](../../../src/render/geometry.ts) makes and merges Babylon primitives; [RecipeBuilder](../../../src/render/kit/recipe.ts) produces Babylon-free typed arrays. Improve/reuse the latter, following WK-1's consolidation, rather than introducing another geometry builder.
- [MeshRecipe and InstanceRecipe](../../../src/render/kit/types.ts) carry positions, normals, colours, indices, matrices and optional tints. [The kit loader](../../../src/render/kit/loader.ts) uploads bounded parts. [Residency](../../../src/world/residency.ts) already separates prepared, uploading, visible, retained and disposed art, including reservations and cancellation. These are the delivery interfaces for imported rigid art too.
- [bake-terrain.mjs](../../../scripts/bake-terrain.mjs) fingerprints source and toolchain, writes compressed chunks and a manifest, uses an immutable shared store, and has a `--verify` comparison with generated recipe bytes. [Large-cave bake](../../../src/world/caves/large/bake.ts) and [static-collision bake](../../../src/world/collision/bake.ts) already demonstrate offline geometry/collision representations. The asset work should extend WK-1's common pipeline, not duplicate these systems.
- [The cel shader](../../../src/render/materials.ts) reads position/normal/colour and supports instance transforms/tints. It has no ordinary base-texture, tangent, bone or morph-target inputs. Colour alpha means **0 ground, 1 ordinary, >1 contour, −1 unlit**; glass uses another specialised convention. [Scene lights](../../../src/render/lighting/sceneLights.ts) inspect cel geometry. A generic imported PBR material would bypass important cave, lamp, local-light, water/depth and air-volume behaviour.
- [DIRECTION](../DIRECTION.md) requires approximately 2 ms slices for potentially long main-thread work, transferable arrays at WK-1's worker boundary, content-addressed build-bound packs, bounded owned caches and pulled diagnostics. Existing code still has some 4 ms defaults and counted synchronous fallbacks; those are not permission to add another unsliced import path.
- **Numeric-cap clarification:** DIRECTION does not specify a numeric total tab-RAM or VRAM cap on this baseline. [WORLD_BUDGET](../../../src/render/renderer.ts) and residency defaults are **256 MiB CPU and 256 MiB GPU for accounted world art**, not total browser memory. Terrain's decoded cache defaults to 48 MiB; GeometryCache to 32 MiB/256 entries. These figures are different owners/scopes, not evidence that the complete game fits a laptop. MEM-1 must reconcile the whole ledger before bulk content.

Branch-only research was inspected without checking out or modifying those branches: recording-feedback Sol `60196347` and Opus `e5738b9b`, session-candidates `ebed4b78`, storage-envelope `06008be3`, and the access-onboarding, browser-hardware-encoding and NVIDIA-driver notes. The relevant conclusions are to keep evidence question-led, budget transient/whole-process memory, and avoid adding an unbudgeted persistent asset cache beside the recorder. Their proposals are not silently adopted as new requirements here.

## 2. Options for Opus doing the modelling and texturing

The comparisons below are engineering judgments about the workflow. They are not a measured competition between authoring models or asset tools.

| Option | What Opus actually authors headlessly | Strength for Siltwake | Main cost or limitation | Decision |
| --- | --- | --- | --- | --- |
| **A. Portable Blender + `bpy`** | Versioned Python using `bpy.data`, `bmesh`, modifiers, named parts, vertex colours, explicit pivots, UVs or rigs; batch export with Blender's Python interpreter. | Better control of connected forms, bevels, cut-outs, repeated mechanical assemblies and authored silhouettes; native editable `.blend` output. No human modelling session is necessary. | Opus must understand topology, transforms and exporter limits. Context-sensitive operators and unchecked modifiers can create plausible but broken geometry. Visual iteration remains necessary. | Adopt for selected assets, starting rigid and vertex-coloured. [B1–B4] |
| **B. Richer TypeScript procedures** | Existing RecipeBuilder factories, seeded variations, cross-sections/sweeps, hand-authored profiles, regional palette data and animation transforms. | Best fit for caves, terrain, kelp, reef forms, scalable scatter and simulation-linked poses. Small text diffs; no new runtime/toolchain. | Elaborate connected surfaces, UVs, rigging and repeated artistic editing become geometry-programming work. More primitive calls alone will not solve weak silhouettes. | Keep as the main world-production method; develop reusable forms rather than rewriting the renderer. |
| **C. Hybrid** | TS for systems/density; Blender scripts for a bounded hero/reusable library; one shared palette, recipe format, collision source and pack lifecycle. | Opus can choose the tool per shape while preserving existing streaming/material work. Blender is used early, and successful assets are usable across content streams. | Needs one tested conversion seam and explicit ownership; two competing art runtimes would erase the benefit. | **Recommended.** |
| **D. Optimisers, texture tools and synthesis** | A small, explicit build recipe with glTF-Transform; optional gltfpack; reproducible texture graphs or seeded texture-generation scripts; KTX2 encoding where textures earn their cost. | Removes waste and makes outputs inspectable. Useful for selected decals, worn surfaces and later texturing. | These tools do not supply artistic judgment. Default optimisation can remove sockets or damage facets; texture graphs may need graphics/display support. | Add only the operations the first assets require. [T1–T5] |
| **E. CC0 libraries** | Opus selects a specific source, records its licence, then scales, simplifies, recolours, remodels and re-exports it. | Fast base material/reference or a small conventional prop that need not carry the game's identity. | Downloaded does not mean game-ready. Style, scale, material count, collision, maps and silhouette still need work. | Curated ingredients, not wholesale region kits. [L1–L3] |
| **F. AI 3D / texture generation** | Opus supplies original references/prompts and then evaluates, cleans, retopologises, recolours, UVs, rigs and optimises the result. | Can explore unfamiliar organic forms or propose surface variation. More promising for concept/reference images and secondary texture inputs than precise interactive assemblies. | Hidden/back-side geometry, consistency, controllability, licensing and total cleanup cost are unproved here. Local generation competes with the GPU queue. | Optional, separately bounded experiment after the deterministic proof; no critical-path dependency. [A1–A3] |
| **Blender through community MCP** | Opus issues scene queries, Python operations and viewport requests to a running Blender. | Faster inspection of an exploratory live scene and potentially useful owner/agent collaboration. | Same Blender/Python skills are needed; persistent UI/display, socket state, timeouts and additional trust surface. Does not itself make reproducible assets. | Optional authoring interface; save the successful operations as scripts and rebuild through the same batch path. [M1–M4] |

### Blender without a desktop session

Blender publishes a Linux archive that can be extracted to a user-owned directory; root installation is not required. Choose an exact patch of a supported LTS line, with **4.5 LTS as the documented candidate**, then verify that binary's shared-library requirements on both workers. Portable does not mean statically linked or guaranteed to launch on these hosts. Blender's bundled Python avoids a separate matching `pip install bpy` environment. Modelling and GLB export do not require CUDA or a rendered viewport. CPU image baking/rendering and GPU rendering are separate, queued workloads. [B1–B3]

Opus should prefer the data API and `bmesh` for mesh construction, named IDs over selection state, and bounded operations with explicit failure checks. A build invocation uses `--background --factory-startup --disable-autoexec --python-exit-code 1 --threads <grant> --python <reviewed-script>`, followed by script arguments after `--`. This is an invocation pattern, not a tested installation or a command to run during the active exclusive job. Preserve argument order; set isolated user configuration paths as well as factory startup. [B2]

Blender can export meshes, supported Principled/unlit materials, vertex colours, custom properties and several animation types. It triangulates faces and may split vertices at flat normals or UV seams, so measure **exported** geometry, not the polygon counter in the authoring scene. Procedural Blender shaders and arbitrary Geometry Nodes setups are not portable game shaders: realise supported geometry and bake/translate the intended material result explicitly. Blender's GPL does not impose GPL on original artwork or exported data, though imported content and add-ons retain their own terms. [B3–B4]

### Blender MCP: what actually works on headless Linux

Inspected the community `ahujasid/blender-mcp` repository at **`febcd90ece59c3416d7c55fd3723cea46bcaa59d`**, dated 2026-10-24. Its package is now named **`mcp-for-blender`**, version 2.2.4 in that source; the familiar repository/older command name can otherwise cause installation ambiguity. This is community software, not Blender Foundation software. [M1–M2]

**Its current add-on explicitly does not support true Blender background mode.** `BlenderMCPServer.start()` checks `bpy.app.background` and refuses with: “cannot start server in background mode (blender -b) - commands would never execute”, suggesting `xvfb-run -a blender`. Auto-start also returns immediately in background mode. Therefore README references to headless credential injection do not establish `blender -b` support. [M2]

The actual arrangement is an MCP client → Python MCP process → local TCP JSON connection → add-on in a live Blender UI. The add-on drains queued commands on Blender's main thread using timers. Requirements are Blender, the matching add-on, Python ≥3.10, an isolated package environment (`uv`/`uvx` is the documented path), the agent's MCP configuration and a reachable task-owned socket. **On displayless Linux, its proposed path is GUI Blender on a virtual X display**, with appropriate graphics support. A physical monitor or the owner's desktop is unnecessary, but Xvfb, a functioning GL context and the exact Blender/display combination must be proved. Running just the MCP process in Docker does not supply a Blender session. [M1–M3]

| Concern | Plain batch `bpy`, authored by Opus | Community MCP, driven by Opus |
| --- | --- | --- |
| Headlessness | Documented `--background`; no interactive viewport required for geometry/export. | Current source rejects `-b`. Virtual-display GUI is suggested upstream; **not tested on factory-worker or alickers here**. |
| Feedback | Structured geometry stats and exported outputs; queued Blender reference renders or, preferably, the in-game view. | Scene/object queries and live viewport images. Current screenshot code uses `GPUOffScreen.draw_view3d`, with a window-grab fallback, but still requires a `VIEW_3D` screen/region and graphics context. Offscreen capture is not background-mode support. [M2] |
| Reproducibility | Fresh process, explicit source/seed/flags, known exit status; easy to rebuild and compare. | Live selection, scene history, preferences and earlier commands can affect results. Record/reify successful operations into the canonical script; a chat transcript is not a build recipe. |
| Robustness | One process can fail or time out without leaving the next build's scene half-edited. Data API avoids many UI-context errors. | Current source improves reliability with a main-thread queue, serialised send/receive, handshake and timeouts. A timed-out mutation may nevertheless have happened; inspect state before retrying. Each Opus session needs its own Blender, port, config and task identity. Never share one mutable scene among builders. [M2–M3] |
| Security | Reviewed script still has normal Python/file/process powers. `--disable-autoexec` limits embedded scripts, not the explicitly executed build script or parser vulnerabilities. [B2,B5] | Add-on executes supplied Python. TCP has **no authentication or encryption**; upstream says so. Loopback limits exposure but other local processes remain relevant. Safe mode is off by default and validates scripts in the MCP process; it is not an OS sandbox and does not authenticate direct add-on connections. [M1–M4] |
| Operational cost | Short queued job; no persistent GPU/display service. | Persistent UI/display and server lifetimes; viewport work needs a graphics lease. Do not leave it running outside the heavy queue while an exclusive job owns the GPU. |

For an MCP trial: pin/review the package and add-on together, use a private virtual environment and Blender config, loopback-only task port, `BLENDER_MCP_SAFE_MODE=1`, and `DISABLE_TELEMETRY=true`. Disable unused download/generation integrations. Upstream describes content telemetry as opt-in but **minimal usage telemetry is sent by default** unless entirely disabled. Do not run the README's `curl | sh` setup against the shared host or auto-edit shared agent configuration. Inspect any installer first. Network/file access, untrusted `.blend` input and third-party model retrieval remain explicit tool risks, not capabilities to assume safe because MCP wraps them. [M1–M4]

**Judgment:** MCP may help Opus iterate, but it adds no modelling capability unavailable through `bpy`. Start with batch scripts. Evaluate MCP later against the same proof asset: does live inspection reduce rework enough to justify a virtual-display session? Never make the game build depend on a live MCP connection. A custom MCP wrapper around one-shot batch scripts is possible, but building that wrapper now would duplicate capabilities the agents already have.

### Supporting tools: use a small subset

- **glTF-Transform:** useful Node tooling/API for inspecting assets, pruning/deduplicating selected resources, palette conversion and controlled optimisation. Prefer an explicit recipe over the broad `optimize` default. Keep socket nodes, named transform parts, hard edges and application metadata. It can drive meshopt/Draco and KTX2 workflows, but those are separate format/runtime decisions. MIT-licensed tooling; record the selected release and dependencies. [T1]
- **gltfpack / meshoptimizer:** useful alternative optimiser and LOD/compression tool, with prebuilt executable options. It can merge meshes, quantise geometry, simplify and emit GPU instancing. Preserve required nodes/material semantics/extras (`-kn`, `-km`, `-ke` where relevant); verify behaviour rather than assuming a keep flag protects every game contract. Do not run gltfpack and glTF-Transform as two opaque “make it faster” stages. Choose one controlled optimisation path. Meshoptimizer is MIT-licensed. [T2]
- **KTX-Software / `toktx`, or `basisu`:** offline encoders for texture assets. `toktx` exists in the inspected KTX-Software 4.4.2 source; current upstream instead documents the `ktx` subcommands, including create/encode/validate. Pin the exact CLI and flags rather than assuming an unversioned tutorial matches the download. Basis Universal is Apache-2.0; KTX-Software has component-specific notices. For Babylon 9.31, begin with the standard ETC1S or UASTC-in-KTX2 paths, not every newer mode a current encoder may offer. [T3–T4,G2]
- **Material Maker:** MIT project, text-based `.ptex` graphs, shader/synthesis nodes and a documented batch `--export-material` command. Opus could author bounded graphs and export flattened maps. That is evidence of a CLI, **not proof of a working no-display renderer on our machines**. Probe its selected release's graphics/virtual-display needs before adopting it. It would add a second graphics toolchain; defer until a particular surface needs it. [T5]
- **Substance-like commercial tools:** evaluate Adobe's automation tooling only if an owner-provided entitlement and a supported Linux unattended installation are available. The Adobe documentation endpoints returned HTTP 403 in this research; unattended availability and licence details were **not verified**. Do not promise a working Linux Painter/Designer/automation seat, or make paid authoring a dependency. Opus cannot substitute for a missing unattended licence/setup. [T6]
- **Small texture-synthesis scripts:** a seeded script can create palette masks, broad corrosion/lichen patterns, trim sheets and decals from original or recorded source inputs. This is often simpler for Opus than a node graph. Treat texture dimensions, tiling, mipmaps and colour space as build inputs. Keep navigation labels, journal text and puzzles authored and legible; never bake hallucinated text into an essential prop.

### CC0 libraries: licences are suitable; default looks often are not

| Source | Verified licence | Fit and work Opus still owns |
| --- | --- | --- |
| **Poly Haven** | Asset licence page says CC0; commercial use, modification and redistribution allowed, attribution not required. Website/API terms are a separate matter. [L1] | Photographic materials, HDRIs and detailed scanned/constructed models are useful references or raw ingredients. Reduce texture sizes and detail, remove baked lighting and remap to our palettes. Do not drop a photographic rock beside faceted karst or replace regional lighting with a downloaded HDRI. |
| **ambientCG** | Downloadable assets and material preview renders are CC0 1.0 according to its licence page. [L2] | Useful source patterns for corrosion, limestone or wood, subsequently simplified/quantised into a shared treatment. Full-resolution PBR stacks would consume memory without matching the cel look. |
| **Kenney** | Game assets on asset pages are CC0; check the included licence. Credit is optional; the Kenney logo is reserved for its own projects. [L3] | Closest starting point for low-poly ordinary props. Still harmonise proportions, facet scale, edge treatment and colour; a ready-made space kit could make our stations look generic. |

CC0 is not a guarantee about trademarks, identifiable people or every third-party right. Preserve the actual downloaded asset's source and licence even when credit is optional; a search result or an MCP asset-search tool is not a licence record. The first proof should use original geometry so that library access is not another dependency.

### AI generation: specific possibilities, uncertain production value

**Hosted 3D generation:** Meshy's current terms distinguish free outputs (Meshy retains ownership and provides CC BY 4.0 rights, with attribution) from paid outputs (customer ownership as between the parties, to the extent the law permits). They also make the customer responsible for inputs/outputs and restrict tampering with supplied AI identifiers. A paid plan is therefore not a provenance guarantee, and an exporter that strips all metadata could conflict with provider terms. Record the plan, terms date, input rights and any metadata obligations for each candidate. [A1]

**Local 3D generation:** Microsoft's TRELLIS documents Linux, a GPU with at least 16 GB memory, CUDA build dependencies, GLB extraction and MIT licensing for its models and most code, with differently licensed components. That establishes a possible research route on the 3090, not a tested ready-to-use toolchain. Do not assume the 4070 Laptop's actual VRAM meets that requirement; query it before choosing a model. Do not assume all repositories called “open” have the same weight, component or output licence. [A2]

**Texture generation:** Opus can direct a separately licensed image model, then crop, de-light, remove seams, palette-limit and test the image at in-game scale. A generated colour image is not automatically a consistent normal/roughness set. As a concrete example, SDXL's Open RAIL++-M licence has use restrictions and says the training data are not licensed by it; it is not a blanket CC0 release. Review the exact checkpoint, adapters and source/reference images. [A3]

**Quality judgment, unmeasured here:** expect the weakest control where Siltwake needs it most: cockpit dimensions, readable controls, watertight interiors, collision clearances, threat poses and an entire family of related designs. Generated ornament may look impressive in one view while hidden surfaces and topology remain unsuitable. Opus still owns cleanup and the same acceptance tests as an original model. A 3D generator's demo image or marketing quality claim is not evidence that its mesh is usable.

Run at most a later bounded comparison of one nonessential organic prop or texture against a scripted original. Use owned references, save the generation inputs/output and terms, inspect all sides, and count **selection plus cleanup plus integration** cost. No live model API may be required by the shipped game. Avoid uploading spoiler-sensitive material or shared credentials to asset services. This report does not request a paid account or start a generation job.

## 3. Babylon integration and real runtime costs

### GLB interchange versus browser-loaded GLB

For the initial rigid library, **GLB is the interchange/export format, not a second runtime**:

1. Blender exports supported geometry, names, colours and extras to GLB.
2. A build-time importer using a maintained glTF library reads that GLB, validates it, applies Siltwake's semantic palette/material mapping, and produces ordinary MeshRecipe/InstanceRecipe data and collision inputs.
3. WK-1 packages these through the same manifest, build binding, fetch/decode and upload ownership as procedural recipes. Babylon receives the arrays it already understands.

This avoids a browser glTF loader, PBR-material population and mesh decoder for the first proof. It does not mean writing a bespoke full glTF parser. Validate the intermediate with the Khronos validator and reject unsupported primitives/extensions in the small conversion adapter. Export any required non-mesh metadata explicitly. [T1,G1,G3]

The existing recipe loader does **not** reconstruct a glTF scene graph: it uploads meshes and freezes their world matrices. Static parts can be compiled together, but an articulated lid requires a separate recipe plus a versioned local-transform/pivot descriptor and an actor-owned transform binding. Keep that binding small and explicit; it must preserve the shared material/residency lifetime and not retain a GameState reference. Prove the pivot round trip first, and exercise movement in the inspection view or through an existing content-owned state. The asset proof does not invent saved lid state or imply that arbitrary GLB animation now works.

If a later animated hero asset justifies runtime GLB loading, add **`@babylonjs/loaders@9.31.0`** alongside the exactly matching core package. Register the glTF loader deliberately; the published `glTF/index.js` module is one verified entry, though it includes more registrations than a narrowly selected setup. Use the module-level `LoadAssetContainerAsync` to manage the loaded resources as an owned group, and dispose materials/textures/animations that are superseded. Async loading does not guarantee that every parse, mesh construction, shader compile or GPU upload respects the 2 ms slice rule. Measure admission and extend the loading boundary if necessary before accepting production content. [J1]

### Decoder and texture choices

| Browser format | What it adds | Recommendation |
| --- | --- | --- |
| Baked recipe, existing compression | Fetch/decompression plus typed-array admission and bounded upload; no glTF runtime material conversion. | First rigid proof and repeated props. Charge fetched buffers, decoded arrays and overlap. |
| Plain GLB | glTF parser, scene graph creation, material/shader work and uploads. File compression and mesh sharing can help transfer without extra geometry codecs. | First runtime-GLB experiment, if needed. A small hero asset may not justify codec startup at all. |
| Meshopt GLB | `EXT_meshopt_compression`, decoder script/Wasm initialisation, worker and decoded output buffers. Babylon 9.31's wrapper uses `decodeGltfBufferAsync`, starts one worker and schedules worker retirement after inactivity. | Preferred geometry-codec candidate if measured transfer/parse costs justify it. This is not a measured speed ranking against Draco. [J2,T2] |
| Draco GLB | `KHR_draco_mesh_compression`, decoder wrapper/Wasm or fallback JS, worker state, reconstructed attributes and buffers. Babylon's documented default worker count is half the logical processors capped at four. | Accept existing Draco assets only through a measured path; do not add a second codec just for small low-poly meshes. Build-time decode is another option. [J3] |
| KTX2 / Basis | Texture-loader registration, decoder/transcoder JS/Wasm, sometimes Zstd, worker pool, output blocks and upload. Babylon 9.31 contains KTX2 support in core; glTF's `KHR_texture_basisu` extension connects KTX2 images to loader materials. Its default worker count is half the logical processors capped at four. | Introduce when the material actually samples useful textures. KTX2 support alone adds no base-texture capability to Siltwake's cel shader. [J4,G2] |

All enabled decoder/transcoder URLs must resolve to **versioned files bundled with the production build**, configured before first use. The published Babylon wrappers otherwise reference Babylon CDN locations. Record tool/decoder notices and test with outside network access denied. Include every relevant KTX2 transcode path, not just its first JS file. Bound concurrency, beginning with one decode/transcode job for the proof; more workers multiply memory and contend with simulation even when they avoid some main-thread work. No decoder timing, startup-size or throughput advantage was measured here. [J2–J4]

Use ETC1S for suitable broad colour surfaces when its artifacts are acceptable; consider UASTC for finer masks/normal detail. Export mipmaps and correct colour-space metadata: colour/emissive maps versus linear masks/normal data. A KTX2 container is not itself a compression guarantee; actual transcoded target format depends on device capabilities and decoder options. UASTC can fall back to uncompressed RGBA. Budget the realised format or a safe admitted fallback, and offer smaller renditions when necessary. JPEG/WebP reducing downloads does not make an RGBA GPU texture small. [G2,T3–T4,J4]

### Draw calls, instances and culling

- One GLB file is not one draw call. Primitive/material boundaries, visible parts, render passes and transparency matter. Use the existing shared opaque cel material with vertex-colour variation; keep moving lids, controls or fins separate only when their behaviour requires it. Merge static pieces within sensible spatial/semantic units, not across an entire region.
- Share one template for repeated assets. Regular instances remain appropriate where each object needs its own transform/visibility handling; thin instances reduce JavaScript-object overhead for dense static scatter. Thin-instance visibility is grouped: spatial batches/chunks are necessary to avoid rendering a whole forest when one corner is visible. Transparency and skinning complicate batching. [J5]
- Reuse the kit's instance path. Its current TemplateLibrary deliberately gives batches their own Babylon Geometry because instance buffers live there; CPU template arrays can be shared while GPU template data may repeat per batch. Include that duplication, matrices (**64 B per instance**) and optional float RGBA tint (**16 B**) in the budget. Do not promise one GPU copy for every occurrence in the world.
- Prebuild LODs offline. Preserve landmarks, exits, handholds, threat warning poses and colour grouping at coarse distance. Dense foliage needs a view/overdraw budget as well as a triangle budget; many intersecting transparent cards are not automatically cheaper than faceted opaque leaves.

### Memory: accounting before more detail

For current untextured recipes, a useful lower-level cost is **40 B per vertex**: position 12, normal 12 and colour 16; add 2 or 4 B per index. UV adds 8 B/vertex and tangents 16, before bone weights/indices or morph data. Flat shading can approach three distinct vertices per triangle. Quantised GLB transfer bytes are not the Float32 arrays finally held by this recipe path. Count the exported/split vertices and the buffers actually uploaded, CPU restoration copies, retained LODs and simultaneous old/new assets.

Illustrative arithmetic, **not measurements**, for one square texture with a full mip chain (approximately 4/3 of the base level):

| Size | RGBA8, 32 bits/pixel | Example 8-bit/pixel GPU blocks | Example 4-bit/pixel GPU blocks |
| --- | ---: | ---: | ---: |
| 1024² | 5.33 MiB | 1.33 MiB | 0.67 MiB |
| 2048² | 21.33 MiB | 5.33 MiB | 2.67 MiB |

Three 2K RGBA8 maps already total about **64 MiB**, before geometry, render targets and decoder workspaces. The table excludes driver overhead and small block-alignment differences. Actual formats/channel use vary. Shared atlases or trims can be useful, but an atlas that pins every region's images into memory is a streaming regression.

The imported library must consume a declared share of the **existing** world-art budget, not create an additional unbounded allowance. For the first proof, propose **32 MiB CPU and 32 MiB GPU maximum for all admitted imported art**, with at most 24 MiB retained/resident CPU and 8 MiB CPU staging. This is a provisional sub-allocation inside 256/256, not 32/32 on top, and not a promise of available headroom. Charge reservations before fetch/decode; block or evict before the global budget would be exceeded. Once textures or other owners enter, WK-1/MEM-1 must reconcile what the current mesh-only accounting omits.

Total browser usage additionally includes collision/BVH/occupancy and light fields, decoded terrain/cave caches, fixed/far geometry, actors, labels, image decode/transcode staging, shader programs, framebuffer/depth/postprocess targets, audio, saves, REC capture and runtime/driver overhead. Deduplicate shared-buffer accounting by ownership; do not double-count views, and do not forget retained allocations. WebGL exposes no portable free-VRAM query: the ledger plus target-machine observations are needed. Process/GPU RSS is useful context, not a precise per-asset VRAM meter. [W1]

**Graphics first, integrated graphics later:** keep 1080p/60 on the 3090 and the required 4070 checks. Do not reduce the intended art now to claim an unchosen integrated-GPU target. Make fine/coarse assets, texture resolution, draw distance, effects and budgets configurable. The later low preset aims for steady 30 fps at reduced internal resolution while preserving cues; memory caps need actual device measurements. Do not invent a “128 MiB iGPU budget”, frame-cap setting or battery mode. Reduced resolution reduces render-target cost, not a fixed 4K texture library. [DIRECTION,W1]

### Streaming, materials and collision

Each pack descriptor needs a stable asset ID, build fingerprint, fine/coarse variants, bounds, estimated and exact bytes, material-profile IDs, named parts/sockets, and collision dependencies. Group detail by residency cell/interior, not one giant building/region GLB. Prefetch by proximity and heading on the same path as other world assets; use GAME-DIRECTION's 300–400 m cave-approach example as design guidance, tuned for each object's travel speed/size. Keep landmark silhouettes/lights in the far layer. Save reloads finish required admission during the existing load screen. An airlock/bend helps visibility but is not permission to stall ordinary play.

WK-1 owns worker fetch/decode/conversion and transferable buffers; Babylon scene objects stay on the main thread. Reuse `PreparedArt`/incremental upload/residency, cancellation and context-restoration ownership. Late results must be rejected by generation/build identity; cancelled uploads and texture/decoder allocations need disposal too. No new runtime Blender invocation, giant `Append` on arrival, unbounded GLB promise cache or synchronous procedural “rescue” path. Missing/stale production packs must be detected before ordinary travel reaches them; any temporary fallback is counted and filed with its root fix and owner.

Material conversion must explicitly handle these differences:

1. **Coordinates:** project descriptors and the production Babylon scene are already right-handed, Y-up, metres. Blender is Z-up; glTF is right-handed Y-up. Apply the exporter/converter transform exactly once. Bake problematic negative/nonuniform scale, transform normals correctly and test an asymmetric part/socket. Do not add a habitual Babylon left-handed root flip. [G1]
2. **Colour/semantics:** glTF `COLOR_0` is linear and constrained to [0,1], including alpha. It cannot legally carry our −1/>1 flags. Export semantic slots in primitive/material extras or a sidecar; reconstruct cel alpha in the compiler. Use one explicit palette conversion convention and compare accepted in-game swatches: current procedural hex values are not evidence that a generic linear-colour transform will match them. Never double gamma-convert. [G1]
3. **Lighting:** first proof uses the shared cel/glass authority, cave samplers and local-light registration. Translate emissive regions deliberately; do not import Blender lights or baked highlights as a competing lighting system. Verify darkness with lamp off, lamp-on surface response and dry/wet transitions. Do not compress cave occupancy/light-data textures like decorative colour maps.
4. **Textures and rigs:** a texture-capable cel variant needs UVs/samplers and the same fog/cave/light stages, not an unrelated PBR island. Skeletal/morph animation needs shader deformation support and actor lifecycle/pose binding; replacing a skinned PBR material with the present cel material is insufficient. Prefer rigid named parts/procedural poses for early creatures, and treat actual skinning as a separate BIO/asset integration decision.
5. **Collision:** derive walkable/solid surfaces from the same authored shape and transforms through COL-1. Cosmetic LOD simplification must not redefine doors, stairs, cave mouths or hull clearance. Preserve intended forms; until COL-1 B, use the authorised conservative non-route-blocking cover and record the debt. Accurate player-facing interior acceptance waits for the integrated collision path. No new box-only subsystem.

## 4. Source, build and provenance design

Suggested locations are proposals for WK-1's brief, not files created by this research:

| Source/output | Version-control and ownership rule |
| --- | --- |
| `assets/source/<family>/<id>/build.py`, palette/shape data | Canonical Opus-authored source for generated assets; ordinary Git. Shared export helpers belong to the asset stream; use existing geometry authorities when compiling recipes. |
| Hand-edited `.blend`, where justified | Version the actual master and its dependencies, including export script/settings. If a script creates the scene, label the `.blend` as generated/editable output rather than a second competing master. Never claim an untracked local `.blend` can be rebuilt. Large manual masters may later justify Git LFS; introducing LFS is not required for one small scripted proof. |
| Texture sources | Version original lossless maps or reproducible original graphs/scripts and their exact external inputs. Final KTX2/JPEG alone is not an editable source. Avoid stockpiling 8K scans in ordinary Git. |
| Asset manifest and licence text | Version stable ID, family/style/region, author/source URL and source version, acquisition date, licence text/attribution, modifications, input rights, palette/material slots, units, pivots, collision role, LODs and budgets. AI candidates additionally record provider/model/plan/terms, prompts/seed/reference rights and required identifiers. |
| GLB intermediate | Reproducible interchange/inspection artifact, or a versioned external master when that is the actual source. Do not commit a regenerated GLB and `.blend` on every build unless the chosen source policy needs them. |
| Packed runtime files and tool lock | Build outputs follow WK-1's accepted distribution/cache policy. Version tool URLs/versions/checksums, export/conversion schema and build scripts; avoid committing tool executables to the game repository. |

### A reproducible bake, not a chat-operated build

1. **Input identity:** asset source and transitive inputs, exact Blender patch/exporter, Python/helper code, optimisation/texture tools, options, palette/schema, seeds, coordinate convention and target LODs form the build key. Follow the terrain store's source/toolchain fingerprint and immutable publication, with the manifest published only after all required outputs validate.
2. **Clean build:** run without user startup state, automatic embedded scripts or live asset downloads. Prefer CPU mesh operations whose outputs can be compared in a pinned environment. Sort stable objects/parts, set seeds, realise modifiers, apply agreed transforms, triangulate and check degenerate triangles, normals, bounds, names, sockets and material count. Avoid baking wall-clock or absolute-path noise into published output.
3. **Convert/verify:** validate GLB, compile through the one asset adapter into WK-1's recipe/pack format, and derive collision inputs. Fail on missing textures, unsupported extensions, invalid semantics or absent required sockets. Verify the canonical runtime arrays and meaningful metadata, not binary `.blend` file equality. Repeated CPU builds should reproduce those bytes under the pinned toolchain.
4. **Do not overpromise determinism:** GPU texture bakes, renderers and evolving model services need not be byte-identical across drivers/hardware. Pin/freeze accepted source images where required; keep reproducible deterministic compression/conversion from those inputs. A visual tolerance is a declared, reviewed exception, not a hash dressed up as a quality judgment.
5. **Scheduling:** no modelling export, optimiser sweep, texture bake, build or render bypasses the heavy queue. Research/review probes use `scripts/heavy-check.sh` with `--review --machine any` and an appropriate class/resource grant; formal 3090 acceptance follows the exclusive lane. A portable tool must exist on the machine that receives the job. A factory-worker-only `/work/tmp` executable cannot simply be passed as an alickers job: use a committed wrapper and pinned provisioning on each worker through the supported queue/transport. Investigative 4070 numbers remain indicative.
6. **Untrusted inputs:** any tool trial downloads into its own new directory under `/work/tmp/asset-research/`; verify the release identity, inspect archives before extraction and do not run downloaded project scripts/add-ons automatically. No system installation or shared Blender/MCP configuration changes are implied. Ship local runtime assets and required notices; neither a live authoring service nor a third-party CDN is part of gameplay.

Checksums here bind builds and cache integrity; they do not replace visual/collision acceptance. DIRECTION rejects handoff payload-hash inventories and redundant receipts. The handoff remains one short page with source SHA, outcome, relevant checks, adverse case, a few inspected images and known compromises/root fixes.

### Proposed category budgets for the proof library

These are **initial authoring allowances to test**, not owner-approved world limits or a reason to amputate a silhouette. Counts are exported triangles after realising modifiers, per unique asset at the highest listed LOD. Resident bytes include admitted fine/coarse overlap and required data for that asset/template; stage buffers and shared resources are additionally charged to their actual owner. Draw figures are visible opaque draws in the ordinary pass before spatial batching, not a whole-scene promise.

| Category | Fine / coarse geometry | Proposed opaque draws | Texture policy | CPU / GPU allowance per unique resident item |
| --- | --- | ---: | --- | ---: |
| Repeated rock/plant/debris template | 100–800 / 30–200 triangles | 1 per spatial template batch | Vertex colours first; shared small mask only if justified | 0.25 / 0.25 MiB plus instance buffers/batch geometry |
| Ordinary interior/lost-site prop | 500–3,000 / 100–600 | 1–2 | Usually none; shared 512² trim/decals if needed | 1 / 1 MiB, with shared texture cost counted once separately |
| **First service cabinet** | ≤8,000 / ≤2,000; distant silhouette ≤256 | ≤3, including gauge/hinged panel | None | 2 / 2 MiB |
| Modular interior assembly/cell | 10,000–30,000 / 2,000–8,000 | 4–8 for the visible assembly | At most a measured shared 1K set initially | 8 / 8 MiB, including its texture share |
| Hero cockpit or larger creature | 15,000–40,000 / 3,000–10,000 | 3–6 before special passes | 1K default; 2K needs a demonstrated close-up gain | 12 / 12 MiB including texture share; animation buffers extra and declared |

Propose ≤1 MiB compressed transfer for the cabinet including variants/metadata, and ≤4 MiB for a later complete proof library. Neither is a new whole-game download target. Limit the **increment in the representative view**, including instance count and overdraw; an allowed template copied ten thousand times still costs geometry/fill work. If an asset needs more, identify the visual gain and change the category allocation together with LODs/streaming instead of silently raising the global cap or degrading intended art.

## 5. Keep one art direction

The target is a coherent authored world with richer forms, not preservation of prototype crudeness. GAME-DIRECTION's priority remains light/depth, life, sound, landmarks, then environmental storytelling. Asset complexity is useful when it improves those experiences.

Use the accepted [Lifted Reef direction](../../research/STARTING-ISLAND-DESIGN.md): pale coral-limestone domes, a black waterline notch, fluted tops and inviting holes; saffron lichen on windward crowns, deep-green vegetation in pockets, whitewashed field-station details and restrained coral accents. Maintain the bright-cap/mid-flank/dark-notch value hierarchy. Do not turn it into the dark columnar basalt of Splitspine Isles. The island's palette and geological silhouette are source constraints, not options reopened by a downloaded model.

For built equipment, start from [PALETTE](../../../src/render/palette.ts): porcelain/cream pressure plates, petrol recessed structure, metal fittings, and warm accents reserved for grips, air thresholds and important living edges. Keep a common scale for bevels, facets, seams, gauges, fasteners and weathering. Colour/material roles should be semantic so one family can be adjusted consistently without one bespoke material per asset.

Before making dozens of items, establish **one accepted reference asset and a short style sheet**: silhouette at swimming distance, medium-scale structure, close detail frequency, edge/facet treatment, palette slots, wet/dry response, wear placement and allowed transparency. Opus authors to that reference whether using TS, Blender, CC0 or AI-derived input. Do not flatten every region into one palette: use the existing biome/optics authority for regional light and colour families. Imported library textures should be recoloured/simplified to those roles, not allowed to set their own art direction.

Judge assets **in the game under regional lighting**, beside accepted procedural art, from normal camera heights and approach distances. Blender's beauty render is useful for topology inspection, not proof of cave visibility or mood. A prop should communicate use and history through arrangement, damage and connections; extra bolts do not supply environmental storytelling. Respect ENV-1's unresolved owner tone choice rather than deciding it in an asset pipeline report.

## 6. Ownership, timing and the first proof

### Proposed assignment

**WK-1 owns the bake/runtime contract.** Add asset conversion/pack support as a coherent part of that foundation, not a separate scheduler, cache or loader architecture. If another builder is useful, propose an **ASSET-1 Opus 5.5 stream** owning only source assets, Blender scripts, a narrow offline GLB-to-recipe adapter and asset validation; agree its interface with WK-1 before implementation. WK-1 owns common packing, identity/cache/publication, worker boundary and streaming. The coordinator retains renderer/package/registry composition. These are proposed stream boundaries; this research assigns no agent and changes no shared root.

| Owner/stream | Connected responsibility |
| --- | --- |
| ASSET-1 / asset author | Opus authors the first cabinet, editable source, palette/extras/pivot schema, GLB export and source/provenance records; demonstrates its visual benefit. Optional MCP experiment belongs here later. |
| WK-1 | Accepts the small asset frontend into the common bake, validates/loads arrays, reserves all bytes, handles cancellation and bounds uploads. No parallel GLB/asset-residency subsystem. |
| COL-1 B | Integrates shared-source collision, clearances and any dynamic rigid-part collision contract. Do not defer collision fixes by reshaping the intended prop. |
| ENV-1 / LS-1 / OP-1 | Choose placements and interaction/story purpose; reuse accepted kit/palette and name required sockets. ENV-1 waits for its tone decision and COL-1 B/WK-1 as already planned. OP-1 is not blocked on a whole new interior kit. |
| BIO streams | Choose whether a creature benefits from Blender topology/rigging versus procedural rigid parts; own readable poses and simulation/animation mapping. |
| MEM-1 / coordinator | Derive full memory/quality allocations, compose the source SHA and acceptance checks, and decide whether another asset merits the pipeline. Fresh non-author Sol 6.1 xhigh reviews the eventual implementation; coordinator inspects it. |

### The smallest proof with player value

Build **one original pressure/service cabinet for the Lifted Reef field station**, reusable in ENV-1 later: a porcelain shell with intentional rounded/chamfered forms, a recessed gauge, cable sockets and one separately pivoted access lid. Show one connected, readable assembly with damage/wear placed to explain its use. The existing content owner chooses any interaction; this proof adds no new lock, reward or narrative requirement. Start opaque, vertex-coloured and rigid, with no skin, normal-map stack or glass.

Why this instead of a full cockpit or creature: it proves connected topology, bevels, holes, pivot/socket preservation, faceted palette conversion and optional reuse without first changing vehicle envelopes, special cockpit glass, creature rigs or warning-pose animation. A complete ENV-1 interior kit is the next useful expansion, after tone/collision dependencies; an entire building is too large a first test.

Compare it with the **best reasonable procedural version**, under the same view and material. The point is visible value or easier coherent revision, not an assumption that Blender must win. Prove one local template reused several times with correct grouped instancing and one named moving part. Test its close/far LOD read and an eviction/return, using the accepted runtime boundaries. Do not replace good existing art wholesale just because the importer exists.

### Sequence and deadline

1. **Now, while CW-1 is finishing:** agree the source/palette/metadata contract with WK-1, prepare the script and provenance scheme on the asset branch, and provision/probe tools only as queued jobs allow. This work can be disjoint from CW-1's roots. It does not delay its acceptance series or the opening playtest work.
2. **After CW-1 merges, alongside WK-1:** land the common rigid-asset frontend, one cabinet and an in-world placement. Build fingerprint, byte accounting, bounded upload, local-only deployment and basic material/collision correctness must work together. GPU-dependent exploratory work goes to `--machine any` where possible; a viewer alone is not acceptance.
3. **Before bulk content wave B is accepted or multiplied:** complete the cabinet comparison, fresh Sol review/coordinator inspection, required 4070 check and the representative scale/memory gate. By this point either the hybrid path is proven and usable by ENV-1/BIO/lost-site work, or a specific root fix and its owner/cost is scheduled. Do not ship a speculative tool pipeline to every content builder.
4. **During wave B:** expand selectively into an ENV-1 module kit or one hero asset family. Add texture support, KTX2 or actual skinning only when that asset's visible outcome needs them, with its measured cost and shared material treatment.
5. **Before the atmosphere pass:** the authoring/delivery path is already accepted and producing content. The pass tunes shared light, depth, surfaces and sound against real assets; it is not the first time anyone imports a model. Final polish fixes results rather than introducing the toolchain.

“Wave B” here names the requested next mass-content boundary; the coordinator must bind it to the current roadmap rather than treating this as a new independent schedule. WK-1 owns the integration dependency; CW-1 owns the prior shared-root boundary. If WK-1 is delayed, keep authoring/export preparation disjoint and small, then resolve the dependency before multiplying assets—do not create a competing runtime as a shortcut.

### Acceptance and economical art evidence

Start with at most **three questions**: does this improve a recognisable form beside existing art; does it retain readable interaction/silhouette in the intended lighting; and does streaming/reuse stay within the admitted budget?

The future implementation handoff follows DIRECTION: read `summary.json`, then the play debrief/story, then **2–4 relevant images** for this visual change. Suitable views are the matched procedural/Blender comparison, in-world approach, close interaction and one cave/darkness/adverse case. Use 6–10 only for a named broader risk or stage exit. Builder and reviewer actually inspect the selected frames and report at most five findings as observed/inferred/owner question. Do not send the coordinator an indiscriminate gallery. Capture the affected fixed-view subset at handoff and the full set at rendering/content root merges and wave ends; new baselines require deliberate acceptance.

Functional checks need successful export/conversion, preserved scale/pivot/palette, correct collision/clearances, visible lighting response, reuse/LOD transition, cancellation/eviction/return and an intentionally missing or stale pack. No ordinary-control approach may show a loading hold or a streaming-caused frame over about 33 ms. Respect the approximately 2 ms main-thread work convention and count any forced finish. Use the existing recorder/browser harness; read all applicable browser rules before future browser work. Do not add new browser plumbing.

Performance/memory acceptance must include DIRECTION's representative composition: more than four regions resident/evicted, dense instances, three hulls plus carrier, with declared bytes and render costs. Use 3090 exclusive numbers for acceptance and the required 4070 check; shared/4070 investigation numbers are labelled indicative. Follow the canonical merge gate and existing soak requirements, not a second asset-only gate inventory. No such evidence was produced in this research.

## 7. Resources to request from the owner

No new paid purchase, administrator access or owner-side Blender modelling is essential to start. The table distinguishes resources needed to implement/accept the recommendation from optional authoring conveniences; it is **not a request to interrupt current GPU work**.

| Resource | Essential or nice to have | Concrete reason / scope |
| --- | --- | --- |
| Pinned official portable Blender archive and user-owned disk space on the worker(s) that run asset jobs | **Essential for the Blender proof** | Agent can download/provision without sudo, under the required new tool-trial directory. If a launch probe finds missing OS libraries, ask for those exact prerequisites rather than a general workstation installation. |
| Admitted CPU/export/build jobs and storage for source/intermediate packs | **Essential** | Use existing heavy-check queue; no concurrent local bake during the exclusive series. Exact grant is chosen from the probe, not assumed unlimited. |
| Existing 3090 acceptance slot and **one queued 4070 rendering check** at implementation handoff | **Essential for acceptance** | Already required by DIRECTION. The 4070 work uses alickers, never an unsolicited native process on the owner's desktop. If unavailable, report missing evidence and retain the check. |
| Extra **4070 time for authoring renders or texture bakes** | **Nice to have** | Speeds iteration while the 3090 queue is busy. CPU geometry/export does not require it. Use the existing lease/queue and respect owner sandbox pauses. |
| First-asset taste judgment / ordinary owner playtest feedback | **Essential before scaling that art family** | Reuse the planned small image/taste review and playtest notes. No new broad design interview; established Lifted Reef direction is sufficient to begin. ENV-1 still needs its own unresolved tone decision. |
| MCP configuration for Opus, pinned bridge/add-on, isolated Python environment, virtual display/GL prerequisites if missing | **Nice to have** | Only for the optional MCP trial. True background `bpy` needs no live MCP or GUI. Owner installs are needed only for verified missing system prerequisites, not for an untested blanket setup. |
| Owner opens the exported `.blend` in a personal Blender GUI | **Nice to have** | Helpful for direct art feedback if desired; Opus can produce the asset and in-game evidence without this. |
| Git LFS / larger artifact hosting | **Nice to have initially** | Reconsider if manual `.blend`/texture masters become large; a small script-based proof fits ordinary Git plus current derived-artifact storage. |
| Commercial Substance entitlement / hosted Meshy or similar credits | **Nice to have, not recommended as a prerequisite** | Requires verified unattended workflow, terms and an explicit spending choice. If later selected, obtain credentials privately through the environment's secret mechanism, never chat or committed files. |
| Dedicated local AI-generation environment and a ≥16 GB GPU job for the cited TRELLIS setup | **Nice to have** | Separate high-cost experiment; verify dependencies/component licences and actual VRAM. Do not assume the owner's 4070 can run it or displace current game acceptance work. |

## 8. Main risks and the decision after the proof

| Risk | Smallest discriminating check / root fix |
| --- | --- |
| Blender gives more detail but no stronger art | Matched in-game comparison and one realistic revision by Opus. Keep the useful tool/shape subset; fix the style reference and authoring method before expanding. |
| Import breaks cel/cave/light semantics | Swatches, asymmetric transform and dark/lamp views through the real shader; correct semantic mapping and shared material path. Do not mask it with a bespoke bright material. |
| GLB/texture admission hitches or exceeds memory | Trace the cold approach plus eviction/return, with actual temporary allocations; bake/worker-decode/split uploads at WK-1's boundary. Do not conceal the hitch with an ordinary loading hold. |
| Optimiser removes a socket or changes a traversable surface | Validate named parts and clearances against the exported source after each chosen transform. Preserve essential topology and derive collision from the shared source. |
| MCP or commercial/AI tooling becomes the critical path | Keep batch `bpy` and original rigid geometry as the baseline. Test the exact optional prerequisite in isolation, bound to a version and queue lease; no promise based on a demo. |
| Mixed libraries erode regional identity | One reference family, semantic palette roles and in-world taste review before broad reuse. Licence acceptance alone never accepts the art. |

The first decision is whether a small scripted Blender library produces visibly better or more easily revised forms **through the existing engine pipeline**. That can be answered early with one usable prop. It does not require a new material engine, all six craft, a creature rig, paid software or a generative-asset service.

## Primary sources

Accessed 2026-10-24 over HTTP. Babylon citations use the published **9.31.0** distribution rather than unpinned engine documentation for implementation-specific statements. Moving upstream documentation is research evidence, not a build lock. Adobe's blocked pages are explicitly an evidence gap, not support for an unattended-tool claim.

- **[B1] Blender 4.5 LTS manual, Linux/portable installation:** https://docs.blender.org/manual/en/4.5/getting_started/installing/linux.html
- **[B2] Blender 4.5 LTS manual, command-line arguments:** https://docs.blender.org/manual/en/4.5/advanced/command_line/arguments.html
- **[B3] Blender 4.5 LTS manual, glTF importer/exporter:** https://docs.blender.org/manual/en/4.5/addons/import_export/scene_gltf2.html
- **[B4] Blender Foundation, software and artwork licensing:** https://www.blender.org/about/license/
- **[B5] Blender 4.5 LTS manual, scripting/security:** https://docs.blender.org/manual/en/4.5/advanced/scripting/security.html
- **[M1] Community Blender MCP README, pinned revision:** https://github.com/ahujasid/blender-mcp/blob/febcd90ece59c3416d7c55fd3723cea46bcaa59d/README.md — architecture, installation, Linux display advice, safe mode, unauthenticated socket and telemetry.
- **[M2] Same revision, Blender add-on:** https://github.com/ahujasid/blender-mcp/blob/febcd90ece59c3416d7c55fd3723cea46bcaa59d/addon.py — `start`, auto-start, queue, arbitrary-code execution and viewport capture. Package identity: https://github.com/ahujasid/blender-mcp/blob/febcd90ece59c3416d7c55fd3723cea46bcaa59d/pyproject.toml
- **[M3] Same revision, MCP server:** https://github.com/ahujasid/blender-mcp/blob/febcd90ece59c3416d7c55fd3723cea46bcaa59d/src/blender_mcp/server.py — connection/serialisation, timeouts, handshake and safe-mode validation call.
- **[M4] Same revision, telemetry implementation:** https://github.com/ahujasid/blender-mcp/blob/febcd90ece59c3416d7c55fd3723cea46bcaa59d/src/blender_mcp/telemetry.py — disable variables and consent handling; safe-mode behaviour is also documented in M1 and invoked in M3.
- **[T1] glTF-Transform maintained CLI documentation and licence:** https://github.com/donmccurdy/glTF-Transform/blob/main/packages/cli/README.md · https://github.com/donmccurdy/glTF-Transform/blob/main/LICENSE.md
- **[T2] Meshoptimizer, gltfpack documentation and licence:** https://github.com/zeux/meshoptimizer/blob/master/gltf/README.md · https://github.com/zeux/meshoptimizer/blob/master/LICENSE.md
- **[T3] Khronos KTX-Software, current tool inventory and notices; versioned `toktx` source/options:** https://github.com/KhronosGroup/KTX-Software/blob/main/README.md · https://github.com/KhronosGroup/KTX-Software/blob/main/LICENSE.md · https://github.com/KhronosGroup/KTX-Software/blob/v4.4.2/tools/toktx/toktx.cc
- **[T4] Basis Universal maintained documentation and licence:** https://github.com/BinomialLLC/basis_universal/blob/master/README.md · https://github.com/BinomialLLC/basis_universal/blob/master/LICENSE
- **[T5] Material Maker documentation, command-line export and licence statement:** https://github.com/RodZill4/material-maker/blob/master/README.md · https://github.com/RodZill4/material-maker/blob/master/material_maker/doc/command_line.rst
- **[T6] Adobe official endpoints attempted, both HTTP 403; not verified evidence of licence/host support:** https://helpx.adobe.com/substance-3d-sat.html · https://helpx.adobe.com/substance-3d-sat/pysbs-python-api/getting-started/command-line-tools.html
- **[L1] Poly Haven asset licence:** https://polyhaven.com/license
- **[L2] ambientCG licence:** https://docs.ambientcg.com/license/
- **[L3] Kenney support/licence FAQ:** https://kenney.nl/support
- **[A1] Meshy terms, especially §§2–3:** https://www.meshy.ai/terms-of-use
- **[A2] Microsoft TRELLIS, prerequisites, export and component-licence distinctions:** https://github.com/microsoft/TRELLIS/blob/main/README.md · https://github.com/microsoft/TRELLIS/blob/main/LICENSE
- **[A3] SDXL base model's published Open RAIL++-M licence:** https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/LICENSE.md
- **[G1] Khronos glTF 2.0 specification, coordinates, attributes, material/colour semantics:** https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc
- **[G2] Khronos `KHR_texture_basisu` specification:** https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_texture_basisu/README.md
- **[G3] Khronos glTF validator:** https://github.com/KhronosGroup/glTF-Validator/blob/main/README.md
- **[J1] Babylon 9.31.0, glTF module and module-level asset-container loading:** https://unpkg.com/@babylonjs/loaders@9.31.0/glTF/index.js · https://unpkg.com/@babylonjs/core@9.31.0/Loading/sceneLoader.js
- **[J2] Babylon 9.31.0, meshopt decoder and loader extension:** https://unpkg.com/@babylonjs/core@9.31.0/Meshes/Compression/meshoptCompression.js · https://unpkg.com/@babylonjs/loaders@9.31.0/glTF/2.0/Extensions/EXT_meshopt_compression.pure.js
- **[J3] Babylon 9.31.0, Draco decoder and loader extension:** https://unpkg.com/@babylonjs/core@9.31.0/Meshes/Compression/dracoDecoder.js · https://unpkg.com/@babylonjs/loaders@9.31.0/glTF/2.0/Extensions/KHR_draco_mesh_compression.pure.js
- **[J4] Babylon 9.31.0, KTX2 configuration/transcoding and glTF registration:** https://unpkg.com/@babylonjs/core@9.31.0/Misc/khronosTextureContainer2.js · https://unpkg.com/@babylonjs/loaders@9.31.0/glTF/2.0/Extensions/KHR_texture_basisu.js
- **[J5] Babylon thin-instance documentation:** https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances
- **[W1] MDN, WebGL best practices, VRAM budgets/compressed textures/batching:** https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
- **[DIRECTION] Owner policy and accepted island direction:** [DIRECTION](../DIRECTION.md), [GAME-DIRECTION](../GAME-DIRECTION.md), [OPENING-DESIGN](../OPENING-DESIGN.md) and [starting-island research](../../research/STARTING-ISLAND-DESIGN.md). These project sources govern over external examples.
