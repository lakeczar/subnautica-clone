# Asset pipeline: the Opus position

Research for the owner's asset-pipeline question and the structured debate. By Opus 5.5, 2026-10-24. I wrote it independently: I didn't read the Sol report (`research/asset-pipeline`) before committing this. It contains no spoilers. Probe scripts are in [`asset-pipeline-opus/probe/`](asset-pipeline-opus/probe/), and their raw output is on factory-worker in `/work/tmp/asset-research-opus/`, `/work/tmp/261024-223122-4faf/` and `/work/tmp/261024-231804-d229/` (alickers).

**Inputs read:** AGENTS, STATUS, DIRECTION, GAME-DIRECTION, OPENING-DESIGN, STARTING-ISLAND-DESIGN, 01-platform, WORKER_RESOURCE_LIMITS, the alickers handoff, and the render and world code (`materials.ts`, `kit/*`, `biomes/terrainCodec.ts`, `geometryCache.ts`, `lighting/*`, `creatures/kit.ts`, `fleet/*`, `world/residency.ts`). I looked at two current screenshots: ATM-1 reef at 10 m, and the M2 carrier helm.

## The answer in one paragraph

Use **Blender 5.2 LTS, driven by Opus through `bpy`**, in the owner's **Option A** setup:
- **Where Blender runs:** a long-lived Blender session inside the alickers Linux sandbox, holding a queue **session reservation** on the 4070. It gets a private virtual display when its UI is wanted.
- **GPU:** OpenGL on the 4070 through Mesa D3D12, and Cycles on CUDA. Both are probed and work.
- **How agents reach it:** agents stay on factory-worker and drive it over the existing SSH lane.
- **No TCP port anywhere:** the channel is **stdio over SSH**. An MCP facade is optional, and if used it speaks the same channel.

**The session is the sketchbook; a clean batch job is the print.**
- The scripts and a shared Siltwake kit library in the repo are the source of truth.
- Every committed asset is rebuilt from committed scripts by a fresh `blender -b --factory-startup` job.
- The rebuild must give an identical quantised pack. The probe found byte-identical GLBs on one machine, and differences across CPUs only in the last float bits, which quantisation removes.
- So no state that exists only in a session ever ships.

**Into the game:** Blender exports glTF. A **Node bake step**, which joins WK-1's bake, converts it into the game's **existing** quantised mesh-pack form (`MeshRecipe` and `TemplateRecipe`, as the terrain codec already does). So the game keeps one cel material, one residency system, and no runtime glTF loader or decoder.
- **Blender** is used for what TypeScript is bad at: hard-surface interiors and props, craft, creature bodies and lost-site machinery.
- **TypeScript stays** for terrain, caves, scatter and anything that must match simulation or collision.
- **Detail lives in geometry and baked vertex colour** (bevels, AO, curvature and gradients), not textures. A small optional texture layer for decals and signage is a second phase.
- **Compute:**
  - **Interactive authoring:** the alickers session.
  - **Batch rebuilds and bulk renders:** queued jobs. These are `--machine any` for CPU work, so they still run on factory-worker while the session holds alickers, and the 4070 only when a job needs it.
- **First proof:** one **ENV-1 interior room kit**, built as a **tier bake-off** (refined procedural versus Blender-scripted, plus a textured third tier on its hero wall only). The owner compares the tiers in game from fixed views, a short clip and a tier key.
- **Timing:** start the authoring side now, using new files only. Join the bake when WK-1 lands, and finish before content wave B and the atmosphere pass.

---

## 0. What the code dictates

These facts shape every option below, so they come first.

1. **One shader carries the look.** Almost every mesh draws with `siltwake.cel`, a `ShaderMaterial` (`src/render/materials.ts`). It has three attributes, `position`, `normal` and `color`, and **no UVs and no textures**.
   - **Colour alpha is a material class, not opacity:**
     - 0–0.5: ground, with procedural ripples, strata and grit;
     - 1: plain;
     - above 1: contour ink;
     - −0.3: faintly luminous;
     - −1: unlit, which `lighting/localLights.ts` also turns into local point lights.
   - **Most surface detail is world-space procedural noise in the fragment shader:** caustics, depth light, cave light and fog. Assets have to arrive in this form to be lit, fogged, cave-darkened and lamp-lit like everything else.
2. **Chunk art is built as plain typed arrays** (`kit/types.ts`, `MeshRecipe`), and these are Babylon-free and worker-safe. It's then uploaded in byte-bounded parts (`kit/loader.ts`) under a byte-budgeted residency (`world/residency.ts`; default 256 MiB CPU and 256 MiB GPU, 4 MiB and 4 ms of uploads per frame).
   - Shared templates have `fine` and `coarse` LODs and draw as thin instances with per-instance tint.
   - DIRECTION's performance convention 5 (the WK-1 worker boundary) requires exactly this shape.
3. **The terrain bake already ships a deterministic quantised codec** (`biomes/terrainCodec.ts`): uint16 positions, octahedral int8 normals, uint8 colour and an int8 cel class.
   - That's 12 bytes per vertex on the wire, against 40 for float32 position, normal and colour.
4. **The weakest art today is interiors and hard surfaces.** The M2 carrier helm screenshot shows flat untextured boxes. The reef environment already has a coherent cel style (the ATM-1 shot). So the lift is needed most for interiors, props, cockpits and machinery. Those are exactly what ENV-1 plans, and exactly where Blender beats TypeScript.
5. **Creatures are rigid part hierarchies** (`creatures/kit.ts`). Animation moves transforms, with no skinning, and warning displays rescale vertex colours.

**What follows:** an asset pipeline here must **produce cel-ready `MeshRecipe`s**, not PBR glTF scenes. That's the main reason I put glTF conversion in the bake rather than adding a runtime loader (§3).

---

## 1. How an Opus agent can author assets headlessly

### 1.1 Blender with an MCP server: keep the persistent session, drop the TCP socket

**Official Blender Lab MCP** (projects.blender.org/lab/blender_mcp, v1.0.3, GPL-3.0-or-later, Blender 5.1+) [1][2]. I read the add-on source.
- **Architecture:** the MCP client talks MCP/stdio to `blender-mcp`, which talks TCP to the Blender add-on. The default address is `localhost:9876`.
- **Background mode works:** `blender --background file.blend --command blender_mcp` serves requests synchronously (`addon/cli.py`). The tool list also includes `*_for_cli` tools that start a background Blender per call, `render_thumbnail_to_path`, and API and manual doc search [3].
- **Security:**
  - The socket has **no authentication**; I found no token or auth code in `mcp_to_blender_server.py`.
  - The "sandbox" describes itself as "isn't really a sandbox, more guidance".
  - blender.org warns that it "will execute LLM generated code in Blender without any guards in place" and recommends a VM [1].
  - On factory-worker, which many agents share, any local process could run Python as the Blender user through that port.
- **Screenshot tools need a GUI window.** Under Option A that's Blender's UI on Xvfb, where the probe's window capture came back black (§5.3).

**Community `blender-mcp`** (ahujasid, renamed `mcp-for-blender` in September 2026, MIT, about 32k stars).
- **Same model:** a TCP socket on 9876 with arbitrary code execution.
- **Commands run on bpy timers,** which don't fire in `blender -b`, so it can't run truly headless without a patched driver loop [4].
- **It has a published advisory:** GHSA-4h8q-hh2j-755w / CVE-2026-66004, a path traversal in `download_polyhaven_asset` that allows arbitrary file writes [5].
- **It bundles asset-store and AI-generation integrations** (Sketchfab, Hyper3D) that we wouldn't want in the loop.

**Verdict, given the owner's Option A:** what an MCP really offers is a **persistent session**: scene state kept between commands, EEVEE shaders compiled once, and a viewport to capture. My first view was that a headless agent on the same host gets little from it, because Blender starts in about 1–3 s. **Across an SSH lane to another machine, persistence does pay:**
- every cold start repeats the tunnel round trip and Blender's start-up;
- EEVEE's first-frame shader compile cost 29 s in the probe (§1.2);
- the agent can poke at a scene ("which faces are over budget?") without rebuilding it.

The flip side is session-only state, so a clean batch "print" from committed scripts is the only thing that ships (§4).

So keep the session and **replace the transport:**
- **No TCP listener on factory-worker.** Factory-worker is shared by many agents, and any local process could reach a forwarded port. Neither MCP server authenticates.
- **The channel is stdio over SSH** (§5.2): the client runs `ssh siltwake-alickers …`, and Blender's driver reads requests on stdin.
- **If an agent harness prefers MCP tools,** a thin MCP facade on factory-worker speaks MCP/stdio to the agent and forwards over the same SSH channel.
- **The official Lab add-on is the fallback** if we'd rather reuse it than write a ~200-line driver. Bind it to `127.0.0.1` inside the sandbox and run its `blender-mcp` server *on the sandbox*, launched through `ssh` as the MCP stdio command. Then its socket never leaves the single-tenant sandbox.
- **Avoid the community server** (the advisory, and the asset-store and AI integrations).
- **The official server's doc-search tools** (`search_api_docs`) help with the `bpy` API either way.

### 1.2 Headless Blender `bpy` (probed): the engine under both the session and the prints

I downloaded the portable **Blender 5.2.3 LTS** tarball (sha256 checked against blender.org) into `/work/tmp/asset-research-opus/` and ran the probe through `heavy-check` (`--review`). The probe is `probe/probe_bpy.py`:
- It builds a sealed instrument canister from code: a lathed body, banded seams, a handle and bolts.
- It applies bevel and weighted normals, keeps flat shading, and writes per-face palette colour plus a `_siltwake_class` attribute.
- It bakes Cycles AO into a colour attribute.
- It decimates a coarse LOD.
- It exports GLB, plain and Draco.
- It renders a four-angle line-up (a turntable in one frame).

| Result (factory-worker, through the queue) | Value |
| --- | --- |
| Headless, no display | Cycles, **EEVEE** and Workbench all rendered under `blender -b` |
| Script wall time, warm | Cycles 2 s (768×320, 24 samples, AO bake included), Workbench 2 s, EEVEE 30 s (29 s of it the first-run shader compile) |
| Queue cost | 24 CPU-s and a 1.4 GiB peak (cold, with tar extraction); 55 CPU-s and 850 MiB for all three engines |
| Geometry | 2,480 triangles fine and 620 coarse |
| GLB size | 307 KB plain, 80 KB Draco (float32, UV and two colour sets; 5 primitives per mesh) |
| Determinism | **Byte-identical GLB** (plain and Draco) from two separate Blender processes on the same machine. Across machines, positions differ only in the last float bits (§5.3), and match after quantisation |
| `COLOR_0` | Exported as normalised `UNSIGNED_SHORT`, **clamped to 0–1**, so cel classes (>1, <0) can't travel in it |
| Custom attributes | Exported only when the name starts with `_` (exporter option text: "when starting with underscore") [6]. The first run used a plain name and lost it; the second exported `_SILTWAKE_CLASS` |
| Meshopt | The 5.2 exporter has `export_meshopt_compression_enable` (EXT or KHR) and ships a meshopt bridge library |

**What the first render taught (the loop working):**
- I'd assigned palette slots by face height, but the lathe made the whole body one face band, so it came out ochre instead of porcelain.
- The AO bake is blotchy on long faces, because vertex AO needs enough tessellation.

An agent sees both at once in the line-up and fixes them in the script. That's the authoring loop in miniature.

**Why `bpy` scripts, and what Blender adds that TypeScript lacks:**
- robust bevels (`Bevel` with angle limits), booleans, curves and sweeps, arrays, mirror, solidify;
- Geometry Nodes for parametric kits;
- weighted normals, remesh and decimate;
- AO, curvature and cavity bakes to vertex colour;
- proper UV unwrapping if textures arrive.

Re-implementing those in TypeScript would turn us into a modelling-tool project, which 01-platform warns against. Blender's licence page says "What you create with Blender is your sole property" [7]. Scripts that use the `bpy` API should be treated as GPL if ever published. The repo is private and the game never imports them, but keep them in their own directory (`tools/blender/`) with an SPDX header.

### 1.3 Richer procedural TypeScript, and the hybrid

TypeScript generators remain the right tool wherever art is **derived from world data or must match simulation exactly**:
- terrain and the shared floor;
- W1 caves (rock and shell from one source, plus the light field);
- scatter and vegetation instancing;
- currents;
- hull colliders and contact parts.

**The hybrid** treats Blender assets as **templates** that existing TypeScript factories place. That's the role `TemplateLibrary` plays now. A chunk factory for an ENV-1 interior would then compose `env.wall.bay.a@fine` modules from a layout, just as the cave kit composes pieces.
- **Refined procedural TypeScript is still worth a small pass:** a shared bevel helper, vertex AO at build time, and better facet density rules. It's one tier of the bake-off in §6. But it can't economically reach bevelled, bolted, cabled hard-surface detail.

### 1.4 Textures: later, small, and optional

- **Phase 1 (recommended): no textures.**
  - **Detail comes from:** geometry (bevels, insets, bolts, cable runs), plus vertex colour **baked in Blender**: AO, curvature edge-lightening and cavity darkening, and gradient ramps, multiplied into palette colours.
  - **Cost:** zero shader change, zero texture memory, and it works on the integrated preset as-is.
  - **Fit:** the cel shader's world-space noise already supplies surface grain.
- **Phase 2 (only if the bake-off shows it's needed): one shared detail atlas.**
  - **What it holds:** stencils, signage, labels, panel lines, grime masks, and log text on walls. ENV-1's "the room tells you before the log does" will want readable marks.
  - **How it's sampled:** a second UV set, only on faces whose class flag says "decal", inside the cel shader. That's one shader change and one sampler.
  - **Format:** KTX2/Basis. UASTC suits crisp decals and ETC1S suits large masks. Both transcode at load to a GPU block format [8].
  - **Self-host the decoders:** Babylon's KTX2 decoder URL defaults to `cdn.babylonjs.com` (`Misc/khronosTextureContainer2.js`), so it must be self-hosted to keep 01-platform's "no external CDN" rule.
  - **Presets:** the layer is additive, so the low preset can drop it and still look like phase 1.
- **Material Maker** (procedural texture graphs) is weak headless:
  - its CLI `--export-material` needs a real rendering device;
  - Linux batch export segfaults in 1.7 (issue #1506) [9].

  Blender's own shader-node bake does the same job headlessly, as proven above, so don't add Material Maker.

### 1.5 CC0 libraries: references and occasional bases

The licences fit:
- **Kenney:** CC0, "free to use them, even in commercial projects" [10];
- **Quaternius:** CC0, no attribution needed [11];
- **Poly Haven:** CC0 assets, though site renders and logos aren't [12].

The style mostly doesn't fit:
- Kenney and Quaternius are generic low-poly;
- Poly Haven is photoreal PBR, which fights the cel look.

Use them **as proportion references or as bases for generic props** (tools, crates), re-run through our kit (re-palette, re-bevel, re-class). Record each one in the provenance manifest (§4). Expect a small share of shipped assets to come from them.

### 1.6 AI 3D and texture generation: not for shipped assets now

- **Quality:** image-to-3D output is dense triangle soup with lighting baked into textures. Our look needs clean facets, palette vertex colour and authored LODs. Every result would need retopology and re-colouring, which is more work than scripting the asset.
- **Consistency:** each generation drifts; a shared kit library doesn't.
- **Licence:**
  - **Hunyuan3D 2.x "does not apply in the European Union, United Kingdom and South Korea"**, and it restricts use of outputs outside its territory [13];
  - **TRELLIS.2 is MIT,** but it notes that some dependencies carry separate terms. It also needs a CUDA GPU with large memory: the 3090 is reserved for exclusive measurements, and the 4070 laptop has 8 GiB [14].
- **Provenance:** training data is opaque. The US Copyright Office says prompts alone don't give enough human control for authorship [15]. Code-authored geometry and human-directed arrangement are on firmer ground.
- **Concept images:** Opus can't make images itself, and an external image service would be a new paid dependency with weak value.

**Verdict:** no. Revisit if a CC0- or MIT-clean generator produces clean low-poly output; the pipeline's provenance field already allows a `generator` source.

---

## 2. The authoring loop for an AI artist

**Seeing (cheapest first):**
1. **Metrics, no image.** The bake prints a JSON report per asset:
   - triangles, vertices and bytes per LOD, against the category budget;
   - bounding box against the spec size (scale errors), and pivot at the base;
   - non-manifold edges and flipped normals;
   - colours outside the palette, and unknown cel classes;
   - the collider proxy present and covering the art (the same idea as `fleet/fit.ts` `hullFit`);
   - glTF validator clean.

   Most iterations end here.
2. **A Blender contact sheet:** one image per iteration, a 4-angle line-up plus a wireframe strip, with a 1.8 m diver silhouette for scale. Cycles at small size takes about 2 s. It judges silhouette, proportion and form.
3. **An in-engine asset viewer:** a Vite dev page modelled on `tools/fleet-viewer.html`, whose query parameters make every view reproducible. For example: `asset-viewer.html?asset=env.wall.bay.a&view=three-quarter&depth=reef10|basin240|cave-lamp&overlay=collider|lod`.
   - It uses the production cel material, depth light, lamp and local lights.
   - It's the truth for colour and value. Blender renders are only a proxy for form.
   - Capture runs through the `gpu` class or the software preview (looks only).
4. **In the world:** REC-1's fixed views, tagged by region and system, compared against the accepted baseline.

**Iterating:** edit script → send it to the session → metrics → contact sheet → (every few iterations) viewer capture. Over the lane, **batch work per round trip**: one request rebuilds, measures and renders, and returns JSON plus one PNG. Don't drive Blender one call at a time. Budget about **one image per iteration and at most 8 per asset** before handoff. This keeps to DIRECTION's question-led evidence rule: metrics answer most questions in text.

**Consistency comes by construction, not by review:**
- **A kit library** (`tools/blender/siltwake_kit/`): shared primitives with Siltwake's form language, such as:
  - `pressure_band`, `bolt_ring`, `porthole`, `hatch`;
  - `cable_run`, `pipe_elbow`;
  - `seam_inset` (blue recessed seams, as the palette comment describes);
  - `grab_rail`, `stencil_plate`.

  Every asset uses them, so bevel widths, bolt pitch and seam depth match everywhere.
- **One palette source:** `palette.ts` and the region palettes exported as JSON. Blender preview materials and the bake both read it, and the bake **rejects** off-palette colour.
- **A style guide** (`docs/art/STYLE.md`, one page), covering:
  - the three-value read;
  - facet density by size class (for example, sides per metre of diameter);
  - minimum feature size by viewing distance;
  - bevel width by scale;
  - contour-ink rules;
  - where bright accents go (grips, air thresholds, living edges);
  - era and faction language (porcelain pressure gear versus older lost-site work, with the tone growing eerier deeper in, per GAME-DIRECTION).
- **LODs:** authored or decimated in Blender, checked by the ratio in the metrics. The coarse LOD must keep the silhouette.
- **Consistency test:** a fresh agent given only the style guide and the kit adds one prop. If it doesn't match, the style isn't encoded yet.

**Review under the image budgets:**
- **Builder handoff:** 2–4 images (it's a visual change). One must be a before/after pair at a fixed view, and one must show the asset next to existing art.
- **Sol review:** code, scripts, metrics and budgets, with no taste verdict (MODEL_POLICY).
- **Taste:** the per-wave Opus taste review reads the contact sheet. **The owner's comparison (§6) is the judge** for the proof.

---

## 3. Engine fit

**Convert glTF in the bake; don't load it at runtime.** I checked `@babylonjs/loaders` 9.31.0:
- **It loads only the standard attributes** (`POSITION`, `NORMAL`, `TANGENT`, `TEXCOORD_0..5`, `JOINTS`, `WEIGHTS`, `COLOR_0`; `glTFLoader.pure.js`). A `_SILTWAKE_CLASS` attribute would be dropped.
- **It builds PBR materials** that we'd have to replace with the cel material.
- **Its decoders default to the Babylon CDN:** meshopt at `cdn.babylonjs.com/meshopt_decoder.js`, Draco wasm and KTX2 likewise.
- **It creates Babylon objects on the main thread,** outside the residency ledger and the WK-1 worker boundary.

All four are solvable, but each is a fork of something the kit already does. A bake-time converter (Node, glTF-Transform [16] for reading, welding, simplifying and validating) emits the **existing quantised recipe form**:
- palette colour × baked AO and gradient from `COLOR_0`;
- the cel class from the material-name convention (for example `pal:porcelain`, `pal:seam:ink=0.5`, `pal:lamp:unlit`, `glass`);
- emissive clusters precomputed with `clusterEmissive`;
- collider proxies (`COL_*` objects) converted to COL-1 shapes.

**The runtime gains no new dependency.**

- **Compression:**
  - **Wire size:** the quantised codec is about 12 bytes per vertex before HTTP compression.
  - **Meshopt** decodes at 3–6 GB/s [17] and is in Blender 5.2's exporter, but it would only shave download size further. Add it later inside the pack if the download budget (about 30 MB initial in 01-platform) needs it.
  - **Draco:** don't ship it. It needs a wasm decoder plus worker, decodes far slower than meshopt, and reorders vertices [17].
- **GPU memory:**
  - **Today:** uploads decode to float32 (40 bytes per flat-shaded vertex).
  - **Root fix (filed for WK-1 and render):** upload normalised int16 position and int8 normal and colour attributes. That's about 3× less vertex memory, which matters most for the integrated preset. Babylon `VertexBuffer` supports normalised types, and the cel shader would decode the class from a separate byte.
  - **Not needed for the proof,** but it's the scaling lever.
- **Instancing:** repeated props and kit modules become templates drawn as thin instances, with per-instance tint already supported. Thin instances are culled as an aggregate [18], so group them spatially per chunk (as the kit already does).
- **Draw calls and memory:** per-category budgets are in §4. Interiors should merge static shells per room (one draw) and instance props by template (one draw per template per room).
- **Streaming:**
  - assets enter residency as chunk recipes, with `gpuBytes` accounted before upload;
  - built interiors stream behind GAME-DIRECTION's two-door airlocks;
  - landmark silhouettes get a far-layer coarse LOD that is always resident.

  Nothing bypasses the arbiter.
- **Lighting:** because assets arrive as cel vertex data, they get the following unchanged:
  - depth light, god rays, caustics on up-facing surfaces;
  - cave light (the W1 splice), the diver lamp cone, local lights from unlit classes;
  - contour ink, and air-room optics.

  Glass panes stay on the existing glass material (`createObservationPane`).
- **Creatures:** export rigid part hierarchies (glTF nodes, which become `TransformNode`s), as today. For schools, bake a `_SWIM` attribute (spine coordinate 0–1) and animate in the vertex shader. That's the ABZÛ approach to thousands of fish [19], and it keeps one draw per species. Avoid skinning until a creature needs it.

---

## 4. Pipeline design

**Source of truth: scripts, not `.blend`.** The authors are agents, and agents edit text: diffs review, merges work, and the probe proved byte-identical rebuilds. `.blend` files are binary, unmergeable and opaque to review, so they're build output (kept in `/work/tmp` for debugging, never committed).

```
tools/blender/                     authoring (GPL-headed bpy), run only by the asset job
  siltwake_kit/                    shared primitives = the style
  assets/<category>/<id>.py        one script per asset or kit, deterministic, seeded
  run.sh                           pinned Blender (version + sha256), --factory-startup
content/assets/manifest.json       id, category, budget class, source, licence, provenance
assets/gltf/<id>.glb               Blender output, committed (small), with <id>.prov.json
scripts/assets/                    Node bake: glTF → quantised recipe packs + metrics
```

- **Two stages, so the game build never needs Blender:**
  1. **Author:** iterate in the alickers session, then **print** with a queued batch job (`blender -b --factory-startup`, `--machine any`) from the commit. Only the print's GLB is committed. It produces script to GLB plus `prov.json`, which records:
     - the script hash and kit-library hash;
     - the Blender version and sha256;
     - the exporter version;
     - the source licence and inputs (CC0 URL and hash, if any).
  2. **Bake** (Node, in WK-1's bake): GLB to content-addressed packs, plus metrics and budget checks.
- **The gate stays cheap:** it checks that each committed GLB's recorded script and kit hashes match the files in the tree. That's a staleness check with no Blender, so `npm run gate` is unchanged in cost. A periodic queued job rebuilds every asset in Blender and requires **identical quantised packs**. GLBs are byte-identical only on the same machine (§5.3).
- **Licence:** every manifest entry has `licence` (`original`, `CC0-1.0`, …) and `source`. The bake refuses entries without them, and `docs/CREDITS.md` is generated from the manifest.
- **Per-category budgets:** **proposals, to be set by MEM-1's measurements.** Triangles are listed; vertices are about 3× triangles for flat shading.

  | Category | Fine | Coarse | Draws |
  | --- | --- | --- | --- |
  | Hand prop (seen within 3 m) | ≤ 1.5k | ≤ 300 | instanced |
  | Furniture or machine (1–3 m) | ≤ 5k | ≤ 1k | instanced |
  | Interior room shell (per 4 m bay) | ≤ 8k | ≤ 1.5k | merged per room |
  | Whole dressed interior room | ≤ 120k visible | — | ≤ 30 draws |
  | Lost-site centrepiece or hero machine | ≤ 30k | ≤ 5k | 1–3 |
  | Craft exterior | ≤ 30k | ≤ 6k | 2–6 |
  | Cockpit interior (always near) | ≤ 40k | none | ≤ 8 |
  | Creature: school fish, medium, large | ≤ 400 / 3k / 12k | — / 800 / 3k | 1 per species |
  | Far-layer landmark silhouette | — | ≤ 2k | always resident |

  These are parameters in the manifest, so the integrated preset can choose coarse earlier, not a separate art set.
- **Ownership:**
  - **WK-1 keeps the bake pipeline:** pack format, content addressing, the worker upload and the ledger.
  - **A new stream, AP-1,** owns `tools/blender/`, `scripts/assets/` (the converter, metrics and validators), the asset viewer, the manifest schema and the style guide. It delivers a converter that emits WK-1's pack inputs, plus an interface note.
  - **Asset authors use it:** ENV-1, creature streams, fleet, lost sites.
  - **The coordinator composes** `package.json` and the gate entries.

---

## 5. Compute: Option A on alickers (owner decision)

### 5.1 The setup

| Piece | Where | What |
| --- | --- | --- |
| Agents, coordinator, logins, git commits | factory-worker | Unchanged. Agents never log in to alickers interactively |
| Session client (`tools/assets/session.mjs`, plus an optional MCP facade) | factory-worker | Opens the lease, then speaks one stdio channel over the existing SSH lane (`~/.ssh/siltwake.conf`, ControlMaster), and fetches result files back into the worktree |
| Session driver (`tools/blender/session/driver.py`) | alickers, inside one `siltwake-job` scope | A long-lived Blender reading line-delimited JSON requests on stdin: `exec` (script text), `build <asset>`, `render <preset>`, `summary`, `screenshot`, `export`. It replies with JSON and paths. No socket |
| Virtual display | alickers, same scope | A private `Xvfb -displayfd -nolisten tcp -auth <file>`, only when Blender runs with its UI (viewport work, owner viewing). Pure background mode needs no display. OpenGL reaches the 4070 only with `GALLIUM_DRIVER=d3d12` and the adapter named (§5.3, [24]) |
| Scratch checkout | alickers `/work/scratch/asset-sessions/<lease>/` | Built from a git bundle of the agent's commit, the same transport `alickers-job.sh` uses. **The shared test checkout `/work/repos/subnautica-clone` is never touched.** Removed when the lease closes, except the last 3 sessions' logs |
| Owner viewer (optional) | alickers, same scope | `x11vnc -viewonly -localhost -rfbauth` on the session's display, plus `websockify`/noVNC on localhost. The owner opens it through an SSH tunnel, or from Windows via WSL's localhost forwarding if that is enabled. View-only; agents never use it |

**What agents see:** the same as locally, with transfer latency:
- JSON metrics and scene summaries arrive in the reply;
- PNGs (renders, contact sheets, and viewport screenshots once §5.3's gap is closed) are copied back into `/work/tmp/asset-session/<lease>/`, or into the worktree when they're evidence.

**Uncommitted script edits travel inside the request** (the `exec`/`build` payload carries the script text). The scratch checkout only supplies the kit library and palette at the lease's base commit, and a `sync` request refreshes them from a new bundle.

### 5.2 The session reservation (a heavy-check addition, SCHED-owned)

- **Opening:** `heavy-check session open --machine 4070 --purpose asset --idle 20m --max 4h [--cpus 6 --mem 8G]` queues like a `4070` job. It never preempts a running job.
  - When alickers' slot is free, the lane starts the driver in a `siltwake-job` scope and the lease starts.
  - It prints a lease ID; `session.mjs` uses that ID for every request.
- **While a lease is held:**
  - **status:** `status` shows alickers as `reserved:<lease>`;
  - **`any` and `soak` jobs:** they already never wait for alickers, so they run on factory-worker at once (the owner's "test jobs go elsewhere");
  - **`4070` jobs:** they wait.
  - **Asset batch prints:** `--machine any` sends them to factory-worker CPU (Cycles, about 2 s per contact sheet in the probe), so they run in parallel with the session.
- **Liveness:**
  - each request is a heartbeat;
  - with **no request for `--idle`** (default 20 min), the lease ends;
  - `--max` caps it (default 4 h), with stall detection as for jobs;
  - closing the lease kills the scope, which takes Blender, Xvfb and the viewer with it;
  - `session close` ends it early, and `session.mjs` closes on exit.
- **Pre-emption, for the owner's priorities:**
  - a `4070` job submitted with `--preempt-session` (coordinator only; for example, the 4070 check before a playtest) sends the driver a **yield** (the soak's `$SILTWAKE_JOB_YIELD` pattern);
  - the driver writes a scratch autosave and ends within 5 minutes, then the job runs;
  - the client reports `session yielded`. The agent reopens later and rebuilds its scene from scripts, which is cheap because scripts are the source.
- **Owner pause or outage:**
  - the lease ends with exit 75 or 255, as for jobs;
  - nothing is lost but the session itself, because nothing authoritative lives there;
  - the agent carries on with factory-worker batch jobs (Cycles CPU, EEVEE on the 3090's EGL path through the `gpu` class), or waits.
- **One lease at a time,** since alickers has one slot. A second asset agent works by batch jobs meanwhile, or queues its lease.
- **Ledger:** start, end, reason, request count, CPU-s, peak memory and GPU used, recorded like a job.
- **Security:**
  - there's no listening port anywhere: the channel is the SSH session's stdio;
  - the session runs as the sandbox's unprivileged user inside the job scope;
  - downloads (Blender, CC0 inputs) live in their own directories and are sha256-pinned;
  - `exec` runs agent-written Python, so the boundary is the sandbox itself, which is what blender.org recommends [1].

### 5.3 Probe of the GPU paths (both machines)

`probe/gpu_matrix.sh` was sent to alickers through `heavy-check` (`--class gpu --machine 4070 --review`), committed at `718a6342`.

The factory-worker column comes from three sources:
- the first two probe jobs (`261024-221738-fb21` and `261024-221852-4870`);
- the matrix's GPU-context step, which finished before that job hit its 3 GiB cap. The cap was hit because Blender was unpacked into tmpfs `/tmp`, which counts as job memory. Future jobs unpack to disk;
- one direct check: `ldconfig -p` shows no `libcuda`.

I cancelled the full 3090 rerun to spare a queue that was 12 jobs deep.
- **Environment:** it records the GPU devices, the WSL libraries, tools, the relevant packages and `ldd` gaps.
- **Display:** it starts a private Xvfb (`-nolisten tcp`) and runs `glxinfo -B` under Mesa's D3D12 adapter selector for NVIDIA, Intel and AMD [21].
- **Blender:** it downloads Blender 5.2.3 (sha256-checked) into a private temporary directory that it deletes afterwards. It then runs:
  - the GPU-context probe in background mode and under Xvfb (NVIDIA and Intel);
  - Cycles CPU, CUDA and OptiX at 1536×640 with 128 samples;
  - EEVEE in background mode and under Xvfb;
  - Workbench.

**Results.** factory-worker is Debian 13 with an RTX 3090 (driver 550) and an i5-12400 VM. alickers is WSL2 with an RTX 4070 Laptop (projected driver 595.58) and an i9-14900HX, on ticket `261024-223122-4faf` at `718a6342`. Artifacts: `/work/tmp/261024-223122-4faf/asset-probe-4070/`.

| Path | factory-worker (3090) | alickers (4070, WSL2) |
| --- | --- | --- |
| Blender runtime libraries (`ldd`) | none missing | none missing |
| EEVEE in `-b`, no display | **Hardware:** EGL on `NVIDIA GeForce RTX 3090`, GL 4.6 | **Software:** `llvmpipe` (Mesa's default Gallium choice), GL 4.5 |
| Under private Xvfb (`GALLIUM_DRIVER` unset) | not run (the job was cancelled for queue load) | `llvmpipe` for every adapter name: NVIDIA, Intel and AMD |
| Small renders on the software path (768×320) | — | EEVEE 4.1 s, Workbench 0.4 s per line-up: fine for contact sheets, too slow for heavy scenes |
| Cycles CUDA | **None:** factory-worker has no `libcuda.so` userspace library, only the GL driver | **Works:** `NVIDIA GeForce RTX 4070 Laptop GPU` |
| Cycles at 1536×640, 128 samples | — | CPU (6 threads) 10.2 s; **CUDA 1.3 s** (about 8×) |
| Cycles OptiX | none | **none listed,** although `libnvoptix.so.1` is projected under `/usr/lib/wsl/lib` |
| GLB determinism | identical across processes and engines | identical across processes, engines and CPU, CUDA and OptiX runs |
| Across machines | GLB float positions differ by ≤ 7.5×10⁻⁹ m (last-bit CPU math); identical after 1 mm quantisation | ← |
| Already installed | Xvfb, Mesa 25.0, X libraries | Xvfb, `mesa-utils` (`glxinfo`, `eglinfo`), `vulkaninfo`, Mesa 25.2.8, X libraries |

**Follow-up with Mesa's D3D12 driver selected** (`GALLIUM_DRIVER=d3d12`; ticket `261024-231804-d229` at `be807b34`; artifacts `/work/tmp/261024-231804-d229/asset-probe-4070-gl/`):

| Path | Result on alickers |
| --- | --- |
| `glxinfo` under Xvfb, adapter `NVIDIA` | **`D3D12 (NVIDIA GeForce RTX 4070 Laptop GPU)`, accelerated, GL 4.6** |
| `eglinfo` surfaceless (no display), adapter `NVIDIA` | the same 4070 renderer for GL core, compat and ES |
| Blender `-b` (no display) and under Xvfb | GPU context on the 4070, GL 4.6. Blender labels the vendor "Microsoft Corporation" and the device type "SOFTWARE", but the renderer string is the 4070 |
| EEVEE line-up under Xvfb on D3D12 | 6.2 s, then 5.9 s. That's *slower* than llvmpipe's 2.7 s on this tiny scene: translation overhead and compile dominate. Hardware pays off for heavy scenes and UI interactivity, not 2.5k-triangle contact sheets |
| Blender **with its UI** on Xvfb, D3D12 | starts on the 4070 and runs Python timers. **But its own window screenshot (`screen.screenshot`) came back black** (open gap, below) |
| Cycles OptiX | `OptiX initialization failed with error code 7805` = `OPTIX_ERROR_ENTRY_SYMBOL_NOT_FOUND` [23]: the projected WSL OptiX library lacks an entry point Blender needs. CUDA works, so OptiX isn't needed |
| **Integrated GPU** | **Visible:** `D3D12 (Intel(R) UHD Graphics)`, accelerated, but **only GL 4.1.** Blender (which needs 4.3) segfaulted on it. Unmatched adapter names (`AMD`, `Microsoft`) silently fell back to the Intel adapter, which confirms the handoff's warning: always name the adapter and check the renderer string |
| Vulkan | `llvmpipe` only (no Dozen): irrelevant to Blender's GL backend |

**Open gap: UI screenshots.**
- **Two candidate causes:**
  - the capture ran before the window's first redraw;
  - front-buffer readback doesn't work on the D3D12-on-Xvfb presentation path.
- **The first driver build must test** a later capture, Blender's viewport render (`render.opengl`), and an X-level grab (`xwd`, or what the x11vnc viewer shows).
- **Until then, agents' images come from renders** (Cycles CUDA, EEVEE, Workbench) and offscreen GPU draws, which all work. Option A does not depend on window screenshots.

**What this means for Option A:**
- **Cycles on CUDA works on the 4070 today,** about 8× faster than 6 CPU threads. It's the engine for contact sheets, AO bakes and turntables.
- **EEVEE, Workbench and the Blender UI** run on the 4070 once the session's environment sets `GALLIUM_DRIVER=d3d12` and `MESA_D3D12_DEFAULT_ADAPTER_NAME="NVIDIA GeForce RTX 4070 Laptop GPU"`. The driver must also check that the renderer string names the 4070, and refuse to start otherwise.
- **The virtual display is optional.** Surfaceless EGL reaches the 4070 too, so Xvfb is needed only for Blender's UI (owner viewing, viewport work).
- **Nothing extra to install for rendering:** Xvfb, `mesa-utils`, Mesa 25.2.8 and the X libraries are already there.
- **For the later integrated preset:** the laptop's **Intel UHD Graphics is reachable inside WSL** through D3D12 (GL 4.1). Whether Chrome's ANGLE gives WebGL2 on it is untested; that's one GPU-probe run with the adapter name changed. If it does, it's a free, low-end integrated stand-in.
- **Determinism, refined:**
  - prints are byte-identical on one machine;
  - across machines, the bake's **quantised pack** is the canonical artefact, and the staleness or rebuild check compares packs, not GLBs;
  - a vertex sitting exactly on a 1 mm rounding boundary could still flip. The check reports any difference over one quantum as a failure, and one quantum as noise.
- **The 3090** is a good batch-render fallback for EEVEE (hardware EGL), but not for GPU Cycles unless fleet adds the CUDA userspace library. That isn't needed: Cycles CPU is seconds at contact-sheet size.

---

## 6. Quality-tier bake-off (owner idea)

**Meaningful tiers.** They share one layout, one palette, one collider and one budget class:

| Tier | What it is | Cost to make | Runtime cost |
| --- | --- | --- | --- |
| **T1 · refined procedural** | Today's TypeScript generators plus a shared bevel helper, build-time vertex AO and stricter facet rules | TypeScript work; no new tool | Same as today |
| **T2 · scripted Blender** | `bpy` kit modules: bevels, bolts, cable runs, insets, baked AO, curvature and gradients in vertex colour, authored LODs | The pipeline in this report | Within the same budgets; more triangles where it counts |
| **T3 · T2 + detail layer** | T2 plus UVs and the shared KTX2 decal and trim atlas (stencils, signage, grime masks) | T2 plus one cel-shader change and an atlas | One extra sampler and texture memory |

**T0 (today's art) is the control** in every comparison.

**How the game switches** (a development feature, not a player option):
- **Variants:** each proof asset ID has variants: `env.room.a#t1`, `#t2`, `#t3`. The template library resolves `id@lod` through a **tier map** read from a URL parameter (`?assetTier=t2`) or a dev key that cycles tiers.
- **Live switch:** switching evicts the affected chunks through the residency and rebuilds them. That's the same path as an LOD change, so it needs no new mechanism and runs within the upload budget.
- **Consistent lighting:** the cel material and lighting are identical across T1 and T2, so the comparison is about form. T3 adds the atlas only on its variant.

**What the owner sees:**
1. **A fixed-view contact sheet:** 4 views (the doorway reveal, the work corner, lamp-only in the dark, and through a window from outside) × T0, T1, T2, T3 at matched camera, time and depth. That's one 4×4 sheet, captured on the 4070 so it's the player-class picture.
2. **A short clip,** 20–30 s per tier: the same scripted swim through the airlock and around the room, recorded inside Linux on alickers (createImageBitmap capture, never 2D readback of the canvas). It's a `4070` job, so it runs between Blender sessions, or pre-empts one at the coordinator's call (§5.2).
3. **Hands on:** a preview build where the owner presses the tier key while playing in their own browser. **Feel** is best judged this way.
4. **Questions:** three only. Which tier reads best at a glance? Which feels most like Siltwake? Is T3's extra worth a shader change?

**Do the tiers double as graphics presets?** Mostly **no, and they shouldn't.**
- **Presets must scale cost, not change art direction.** A low-preset player should see the same Siltwake, just coarser, closer and lower-resolution.
- **T1 versus T2 is a one-time authoring decision per category.** Keep one path per category afterwards, and don't maintain three versions of every asset.
- **The parts that do become presets:**
  - **T3's detail layer is additive,** so "detail textures off" is a legitimate low-preset switch that falls back to T2;
  - **T2's authored coarse LOD and its budget parameters** are what the integrated preset uses (earlier coarse, shorter draw distance).

---

## 7. Resources to ask the owner for

| Ask | Why | Priority |
| --- | --- | --- |
| **Run one install command on alickers** (below) | Option A's scratch and tools roots, the display cookie tool and the optional viewer. Xvfb and Mesa are already there, and the sandbox has no sudo | **Essential** (the viewer packages are optional) |
| **Approve a pinned portable Blender** (5.2.3 LTS, sha256 `78486c01…a918eec`), unpacked once into a user-owned tools directory on each worker (`/work/tools/blender-5.2.3/`), never system-wide | Every option needs it; the probe already ran it on both workers with no missing libraries | **Essential** |
| **Session reservation terms:** a session may hold alickers for up to 4 h, released after 20 min idle. `any` jobs go to factory-worker meanwhile, `4070` jobs wait, and the coordinator may pre-empt a session for pre-playtest 4070 checks | Option A's long sessions versus the 4070 player-floor checks | **Essential** (a decision, not a purchase) |
| **Judge the proof bake-off:** a 4×4 contact sheet, three short clips, a tier key in a preview build, three questions, about 15 minutes | Taste is the owner's call; it decides T1, T2 or T3 per category | **Essential** |
| **A style reference board:** 8–15 images of "this is the lift I want", or approval of one I assemble from cited sources | Makes "above today's look" concrete before agents encode it | Nice-to-have (high value) |
| **Opening the view-only viewer** when curious (noVNC in a browser through an SSH tunnel or WSL localhost forwarding) | Watching an agent's Blender session live | Nice-to-have |
| **Keep the laptop in its hybrid GPU mode** (don't switch the MUX to discrete-only), so the Intel UHD stays visible in WSL | The probe found it exposed through D3D12 (GL 4.1): a free stand-in device for the later integrated-graphics preset, once a WebGL2 check passes | Nice-to-have |
| Paid tools or AI services | **None requested** (§1.6) | — |

**The install command** (run once by the owner, inside the alickers Ubuntu sandbox, from an admin shell):

```sh
sudo apt-get update && sudo apt-get install -y --no-install-recommends \
  x11vnc novnc websockify xauth && \
  sudo install -d -o worker -g worker /work/scratch /work/tools
```

- **Already installed** per the probe (`xvfb`, `mesa-utils`, Mesa 25.2.8 with D3D12, the X client libraries): the command doesn't touch them.
- **Blender runs with nothing extra:** it ran in background mode, under Xvfb and with its UI, with no missing libraries. `xauth` is only for the display's cookie file.
- **Viewer packages:** `x11vnc`, `novnc` and `websockify` serve only the owner's view-only viewer. Drop them if it isn't wanted.
- **No NVIDIA Linux driver or CUDA toolkit:** the Windows driver projects `libcuda` and `libnvoptix` into `/usr/lib/wsl/lib`, and NVIDIA says not to install a Linux display driver in WSL [20].

---

## 8. Recommendation, timing and the first proof

**Recommendation:**
- **Authoring:** Opus drives Blender 5.2 LTS through `bpy`:
  - **interactively** in an Option A session on alickers (stdio over SSH, with an optional MCP facade and no TCP port);
  - every shipped asset is **printed** by a clean batch job from committed scripts.
- **Into the game:** the glTF output is converted in the bake into the existing cel recipe form, with no runtime loader.
- **TypeScript stays** for world-derived art.
- **Textures:** none in phase 1; one optional decal atlas later, if the bake-off earns it.
- **GPU paths on alickers:**
  - Cycles on CUDA (works today);
  - EEVEE, Workbench and the UI on Mesa D3D12 with `GALLIUM_DRIVER=d3d12` (§5.3);
  - llvmpipe only as the fallback.
- **No AI generation.**

**Timing:**
1. **Now (alongside WK-1, new files only):**
   - **AP-1 stage A:** the pinned Blender runner, kit library v0, style guide v0, the glTF-to-recipe converter with metrics, and the asset viewer;
   - **in parallel:** the session driver and client (`tools/blender/session/`, `tools/assets/session.mjs`);
   - **SCHED:** a small change adding `heavy-check session open/close` with lease, idle, max-duration, yield and ledger (§5.2).

   None of these touch the game's shared roots. The owner's install command and Blender approval go first, and take minutes.
2. **The proof bake-off,** as soon as stage A works (in the viewer, then in a sandbox interior). The owner judges it.
3. **AP-1 stage B, after WK-1 merges:** the converter joins WK-1's bake (content-addressed packs and residency), collider proxies go to COL-1 stage B shapes, and the gate gets the pack staleness check.
4. **Content wave B** (ENV-1 interiors, lost sites, creatures) authors through the pipeline, at the tier the owner chose per category.
5. **The atmosphere pass** then lights finished assets rather than prototypes.

**The first proof:** one ENV-1 interior room, built as a kit.
- **The room:** a station module about 8 × 6 × 3 m, entered through a two-door airlock (the load buffer). It has about 6 shell modules (wall bay, corner, doorway, window bay, ceiling, floor grate) and about 8 props (work bench, locker, chart table, cable runs, a fallen chair, wall stencils, a lamp, a log terminal).
- **Why this over the Dart cockpit:**
  - it's greenfield (no rewrite of accepted, B1-owned fleet art);
  - it's where today's art is weakest;
  - it exercises the kit, interior lighting, local lights, collision and streaming at once;
  - it becomes ENV-1's real kit.

  The **Dart cockpit** is the second asset, because the player sees it more than any other.

**Success criteria:**
1. **Taste (the gate):** in the bake-off, the owner judges the chosen tier clearly above T0 and coherent with existing Siltwake art. One view shows it beside existing art.
2. **Same engine:** it renders with the production cel material, depth light, the lamp in the dark, local lights from its lamp, and contour ink, with no new material (T3 adds one reviewed sampler only).
3. **Budgets:** within §4's room budget (≤ 120k visible triangles, ≤ 30 draws). GPU bytes are in the residency ledger. On the 3090 at 1080p (exclusive), the room view holds 60 fps with the measured delta reported. A 4070 check is attached.
4. **Reproducible:** from a clean checkout, a batch print (not the session) rebuilds the GLBs, and the bake rebuilds identical packs on either worker. The build needs no Blender. Provenance and licence are complete.
5. **Collision:** authored proxies give a conservative cover that blocks no route (COL-1 rules). The fit report has no issues.
6. **Loop speed:** in an alickers session, one script-to-contact-sheet round trip takes under about 15 s, including the SSH transfer. As a batch job on either worker it takes under about 30 s.
7. **Style is encoded:** a second, fresh Opus agent adds one new prop from the style guide and kit alone, and the taste reviewer can't pick it out as foreign.

---

## Sources

1. Blender Lab, MCP server: https://www.blender.org/lab/mcp-server/ (accessed 2026-10-24)
2. Blender Lab MCP repository (readme, addon `cli.py`, `mcp_to_blender_server.py`, `weak_sandbox.py`, manifest): https://projects.blender.org/lab/blender_mcp
3. Blender Lab MCP tool list: https://projects.blender.org/lab/blender_mcp/src/branch/main/readme_tools.rst
4. ahujasid/mcp-for-blender (formerly blender-mcp): https://github.com/ahujasid/mcp-for-blender. The timer note is from djeada/blender-mcp-server's documentation: https://pypi.org/project/blender-mcp-server/
5. GitHub Advisory GHSA-4h8q-hh2j-755w / CVE-2026-66004: https://github.com/advisories/GHSA-4h8q-hh2j-755w
6. Blender 5.2.3 bundled glTF exporter `io_scene_gltf2` 5.2.41, `__init__.py` (inspected locally; option texts quoted)
7. Blender licence, "Your Artwork": https://www.blender.org/about/license/
8. Khronos KTX 2.0 specification: https://github.khronos.org/KTX-Specification/ktxspec.v2.html
9. Material Maker issue #1506 (Linux CLI export segfault): https://github.com/RodZill4/material-maker/issues/1506; 1.5 devlog: https://rodzilla.itch.io/material-maker/devlog/1312764/material-maker-15
10. Kenney support/licence: https://kenney.nl/support
11. Quaternius FAQ: https://quaternius.com/faq.html
12. Poly Haven licence: https://polyhaven.com/license
13. Tencent Hunyuan3D 2.1 licence: https://huggingface.co/tencent/Hunyuan3D-2.1/blob/main/LICENSE
14. Microsoft TRELLIS.2 README (MIT, dependency note): https://github.com/microsoft/TRELLIS.2
15. US Copyright Office, Copyright and AI Part 2: Copyrightability (Jan 2025): https://www.copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-2-Copyrightability-Report.pdf
16. glTF Transform CLI: https://gltf-transform.dev/cli
17. meshoptimizer README (decoder 3–6 GB/s; on compressors that reorder vertices): https://github.com/zeux/meshoptimizer
18. Babylon.js thin instances: https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances
19. Matt Nava, "Creating the Art of ABZÛ", GDC 2017: https://www.gdcvault.com/play/1024409/Creating-the-Art-of-ABZU
20. NVIDIA CUDA on WSL user guide: https://docs.nvidia.com/cuda/wsl-user-guide/index.html
21. Microsoft WSLg, GPU selection: https://github.com/microsoft/wslg/wiki/GPU-selection-in-WSLg
22. `@babylonjs/loaders` 9.31.0 and `@babylonjs/core` 9.31.0 package sources (inspected locally: `glTF/2.0/glTFLoader.pure.js`, `Meshes/Compression/*`, `Misc/khronosTextureContainer2.js`)
23. NVIDIA OptiX `optix_types.h` error codes: https://github.com/NVIDIA/optix-dev/blob/main/include/optix_types.h
24. alickers sandbox handoff and WSL2 GPU research (factory-worker: `/work/tmp/siltwake-alickers-handoff/SANDBOX-HANDOFF.md`, `research/wsl2-gpu.md`)
