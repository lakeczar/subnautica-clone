# Asset pipeline: coordinator decision (2026-10-24)

**Sources:**
- Sol: `research/asset-pipeline` (`aad21cba` report, `5aea2a45` round-2 critique).
- Opus: `research/asset-pipeline-opus` (`38d4052c` report and probes, `e54d3d7d` round-2 critique).

**Owner inputs:**
- Opus 5.5 authors the assets.
- Option A is the working setup: agents on factory-worker drive Blender on the alickers sandbox.
- The asset debate decides the pipeline.
- The interior look is decided by the bake-off below.

## What both sides agreed, and what is decided

1. **The tool: Blender 5.2.3 LTS,** a portable checksum-verified build with no system install, driven by Opus-authored `bpy` scripts. The existing procedural TypeScript art stays wherever it serves.
   - **No paid tools.**
   - **No AI-generated models or textures.**
   - **CC0 libraries** are allowed only with licence records.
2. **The working session (Option A):**
   - **Where it runs:** a long-lived Blender session inside the alickers Linux sandbox, on the 4070, under a queue **session reservation**.
   - **How agents reach it:** agents on factory-worker drive it over stdin/stdout through the existing SSH lane. **No Blender RPC listener is exposed.**
   - **MCP:** optional and later. The official Blender Lab MCP's background mode is the candidate, never the unauthenticated community server.
   - **Viewer:** an optional view-only viewer for the owner.
3. **The session is a sketchbook; committed scripts are the source of truth.** Every shipped asset is rebuilt by a clean queued Blender job from committed scripts.
   - **The canonical builder is pinned:** one machine path, with AO baked on CPU. GPU-bake determinism has not been tested, so GPU AO bakes are not canonical.
   - **Reproducibility check:** the full canonical pack (positions, colours, normals, classes, indices, collision) must match byte for byte. Matching a single canister's positions is not enough.
4. **Offline conversion into the game; no runtime model loader.**
   - **Where:** the bake converts glTF into an **explicit, versioned extension** of the cel-recipe and pack format.
   - **What the extension adds:** asset-local quantisation (the terrain codec's 1/64 m Y steps are too coarse for small bevels), cel-class encoding (including fractional classes), and rigid-part bindings (pivots and sockets for lids, doors and other moving parts).
   - **What it reuses:** the existing delivery, residency and upload-slicing paths, with one authority.
   - **Rejected:** `@babylonjs/loaders` at runtime. Its defaults can be configured, but it provides neither residency accounting nor bounded uploads.
5. **Budgets:**
   - **Share:** imported art gets an explicit share inside the 256/256 MiB world-art budget (Sol's proposed 32/32 MiB), with per-instance byte costs.
   - **Parameters:** all budgets stay parameters, so they scale down for the later low preset.
6. **Provenance:** every asset's manifest records source script, tool version, inputs and licences, plus the builder machine and canonical pack hash (Sol's fields).
7. **Ownership:**
   - **AP-1, a new Opus stream:** the authoring scripts, the converter, the format extension and the asset manifests.
   - **WK-1:** the bake store, fingerprint and `--verify` integration (extend the terrain bake's, never a parallel one).
   - **The SCHED builder:** the session reservation, enforced *outside* Blender.
     - **Lease lifetime:** expiry and yield; a stuck scope is killed after a grace period and confirmed empty before admission is released.
     - **No duplicate runs:** the existing remote receipt and no-duplicate rules apply. SSH loss alone never authorises a fallback.
     - **Requests:** request IDs and retries; idle time is distinguished from an active long request.
     - **Defaults:** 20 min idle release, a 4 h cap, and preemption by the coordinator for pre-playtest checks.
   - **Security:** SSH removes exposure but not execution power, so the sandbox's real mounts, credentials and network boundary get audited before sessions start.

## The disagreement and my call

**What the first proof should be:**
- **Sol's view:** one reusable room module or prop.
- **Opus's view:** a whole ENV-1 room.
- **The call:** both, in order. First a single reusable module or prop goes end to end: conversion, cel lighting, collision, residency and eviction. That proves the pipeline. Then comes **the owner's tier bake-off** on one ENV-1 room at three tiers (refined TypeScript, scripted Blender, Blender plus a decal atlas), shown from fixed views with short clips, plus a tier key in a preview build. The owner picks the look, which also settles the interior-look question. The decal layer can double as a low-preset switch.

## Timing

- **The seam:** it lands after WK-1 and the accepted CW-1 baseline, and before content wave B and the atmosphere pass.
- **Session reservation:** scheduled as a SCHED item after SCHED-4.
- **What can start now:** the security audit and the reproducibility harness design. Optional MCP and viewer work never delays the seam.
- **Evidence:** question-led, per DIRECTION's evidence rules.

## What the owner is asked to approve

These are listed in STREAMS; each becomes a row in `ALICKERS-LEDGER.md` before anything is done.
