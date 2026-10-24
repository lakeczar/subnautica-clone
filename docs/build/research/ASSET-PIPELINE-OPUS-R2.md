# Asset pipeline, round 2: Opus critique of the Sol report

Opus 5.5, 2026-10-24. This reviews `origin/research/asset-pipeline` `aad21cba` (`ASSET-PIPELINE.md`) against my report (`ASSET-PIPELINE-OPUS.md`, `38d4052c`).

## Where Sol is wrong, overstated or missing something
1. **Option A is absent.** The owner chose it as the working setup, yet Sol has no session reservation, no scratch checkout, no SSH channel and no viewer.
   - Sol's verdict ("evaluate MCP later… a wrapper would duplicate capabilities") argues against a decision that's already made.
   - Its MCP risks are real: live state, sockets, and timeouts on mutations. But a rule that **only clean batch prints ship** answers them, and that rule is compatible with Sol's own reproducibility section.
2. **"Blender MCP rejects `-b`" holds only for the community server.**
   - Sol didn't look at the **official Blender Lab MCP** (v1.0.3, Blender 5.1+). It serves background mode (`blender -b --command blender_mcp`) and has per-call `*_for_cli` background tools.
   - It's still unauthenticated TCP, so my position stands: stdio over SSH, with no listener anywhere.
3. **4.5 LTS is the wrong pin.** Blender **5.2.3 is the current LTS** (the binary reports it).
   - 5.2's exporter has built-in meshopt.
   - The official MCP needs 5.1 or later.
4. **Everything is untested, and some open questions are already answered.** Sol ran no probe. Mine, through the queue:
   - **Headless:** `-b` EEVEE runs on the 3090 through EGL.
   - **alickers OpenGL:** llvmpipe by default, and **4070 hardware GL only with `GALLIUM_DRIVER=d3d12`** plus the adapter named.
   - **Cycles:** CUDA works, about 8× faster than CPU; OptiX fails with error 7805.
   - **Integrated GPU:** Intel UHD is visible at GL 4.1.
   - **Libraries:** none missing; no owner install is needed except the viewer packages.
5. **Determinism is overstated.** "Repeated CPU builds should reproduce those bytes" holds only on one machine. Across the two CPUs, exported positions differed by up to 7.5×10⁻⁹ m. Its "verify the canonical runtime arrays" is right only if those arrays are **quantised** before comparison; Float32 recipes would carry the noise.
6. **The owner's tier bake-off is missing.** There's one matched procedural-versus-Blender comparison, but no 2–3 tiers in game, no tier switch, no clip, and no answer to "do tiers double as presets?".

## Where Sol is stronger, and what I adopt
- **Budgets.**
  - **What it adds:**
    - imported art takes a **declared sub-allocation inside the 256/256 MiB world-art budget** (32/32 MiB for the proof), charged before fetch and decode;
    - world-art accounting is kept apart from total browser memory;
    - instance costs (64 B for the matrix plus 16 B for the tint);
    - `TemplateLibrary`'s per-batch GPU duplication;
    - a compressed-transfer cap.
  - **Versus mine:** I had triangle counts only, and my "≤ 120k per room" was looser than its 10–30k per visible assembly.
  - **What I adopt:** its byte accounting and assembly budgets, keeping my per-category triangle table as the authoring guide.
- **Licences and provenance.**
  - **Manifest fields:** acquisition date, modifications and input rights. For AI candidates: provider, model, plan, terms date, prompts, seed and identifier obligations.
  - **Licence findings I missed:** Meshy's free-tier outputs are CC BY 4.0, which needs attribution, and paid outputs aren't a provenance guarantee. SDXL is under Open RAIL++-M. And CC0 says nothing about trademarks.
  - **I adopt all of it,** and add my Hunyuan3D territory exclusion and the US Copyright Office's note on prompts.
- **The WK-1 path.** I adopt its specifics:
  - extend the terrain bake's source and toolchain fingerprint, its immutable store and `--verify` rather than inventing a parallel one;
  - reject late results by generation;
  - detect missing or stale packs before travel reaches them;
  - keep ASSET-1 limited to sources, scripts, a narrow adapter and validation.
- **Articulated parts.** The kit loader freezes world matrices, so a pivoted lid needs a versioned local-transform descriptor and an actor binding. My "glTF nodes become `TransformNode`s" glossed over this.
- **Colour.** Use one explicit palette conversion convention, verified against in-game swatches, and never double-gamma.
- **The first proof's ordering.** A field-station **service cabinet** (one pivoted lid, ≤ 8k triangles) tests topology, pivots, sockets and palette without waiting on ENV-1's tone decision or COL-1 stage B.

## What I'd change in my recommendation
1. **Sequence the proof:**
   - **Stage 1:** Sol's cabinet as the **pipeline proof**, made as a member of the field-station and ENV-1 kit;
   - **Stage 2:** my ENV-1 room as the **taste bake-off** (T0 against T1 and T2; T3 on the hero wall only). It runs once ENV-1's tone is chosen, and uses COL-1's conservative cover until stage B.

   One cabinet alone can't show the owner a lift in the game.
2. **Budgets:** byte sub-allocations as Sol states them, plus my triangle table, with MEM-1 reconciling both.
3. **Manifest schema:** Sol's fields plus mine.

## Where I still disagree
- **The session is primary, not a later experiment.** Across an SSH lane, persistence avoids repeated cold starts and a 29 s first EEVEE compile. The print rule keeps it reproducible, and the owner has decided it.
- **Commit the printed GLB.** It's small, and with it the game build and gate never need Blender: they check only that the recorded script and kit hashes match. Sol leaves the GLB optional, which pushes Blender into every bake job on both workers.
- **AI generation:** I'd still leave it out unless a CC0- or MIT-clean model produces clean low-poly output. Sol's bounded later experiment is acceptable only under its full provenance record, and never on a free tier that requires attribution.
