# Platform and implementation recommendation

Research checked 2026-10-17 using official engine documentation, engine-maintained source documentation, and web platform documentation over HTTP. No browser was opened and no benchmarks were run. Recommendations below are engineering judgments, not measured engine rankings.

## Concrete default

**Use strict TypeScript + Vite + Babylon.js, targeting a desktop browser with WebGL 2.** Deliver a self-contained static production build, a reproducible local launch command, and a playable in-app preview. Use a bounded original underwater world, single-player simulation, and data-driven content. Pin dependency versions and commit the lockfile during implementation. Start with Babylon's native collision system and an explicit custom swimming controller; introduce a separate physics engine only if a demonstrated gameplay requirement needs rigid bodies.

This choice favors an autonomous team's delivery reliability: one language across simulation, rendering adapters, UI, tooling and tests; ordinary text files with clear agent ownership; direct browser delivery; and an engine with scene graph, picking, collisions, audio, particles and rendering features already available. Babylon officially lists WebGL/WebGPU, native collisions, Havok support, picking, audio and scene-graph capabilities [1]. This does not mean those features automatically make a polished game. The coordinator still has to design, integrate, playtest and tune it.

Prefer WebGL 2 as the required renderer and treat WebGPU as optional later work. The default should not hinge on WebGPU availability, custom browser flags, COOP/COEP headers, a backend, hosted AI APIs, external asset CDNs or an asset-generation service remaining online. Do not turn the project into an engine construction exercise.

## Alternatives and what changes the choice

| Stack | Established facts | Judgment for this task |
|---|---|---|
| TypeScript + Babylon.js | Engine includes collisions, audio, picking, particles and multiple rendering backends [1]. Camera collision movement can use a camera ellipsoid against meshes marked for collision [2]. | Best default for a browser-first one-shot build because it reduces integration work. Use custom simulation, not a camera-only demo. Learn and pin the installed API version rather than inventing calls. |
| TypeScript + Three.js | Three describes itself as a general-purpose JavaScript 3D library and provides WebGL/WebGPU renderers [3]. Its fog API includes exponential-squared fog [4]. Rapier separately offers character motion correction using ray/shape casts, sliding, slopes and optional ground snapping [5]. | Excellent if the team already has a proven Three/Rapier foundation. Otherwise it owns more integration: controller, collision adapter, audio, world lifecycle and asset management. It can achieve the same visual quality; there is no sourced basis here for declaring either renderer faster overall. |
| Godot 4 + GDScript, native | Godot supplies `CharacterBody3D`, `move_and_slide`, and `MOTION_MODE_FLOATING` [6]; its CLI supports headless execution and release export presets [7]. | Prefer this when native desktop distribution, editor-authored scenes, Godot expertise or substantial physics/game-engine workflows matter more than zero-install browser delivery. Split agents by scripts/resources/scenes and avoid concurrent edits to the same `.tscn`. Verify binary and export-template availability first. |
| Godot 4 + GDScript, web | Official 4.5 documentation requires WebAssembly and WebGL 2; Godot 4 C# projects cannot export to web in that documentation. Single-thread exports are supported since 4.3 and avoid the isolation/header requirement of multithreaded exports [8]. Web uses the Compatibility renderer [8]. | Viable if Godot is already installed and the exported game is tested immediately in the actual preview host. Use GDScript and single-thread export by default. Web output must be served correctly; a successful native run does not establish web compatibility or performance. |
| Unity/C#, Unreal/C++, custom WebGPU engine | Not investigated in sufficient depth to make version-specific export claims. | Do not select for this one-shot unless the workspace already contains a working template and the coordinator can prove the toolchain/export path. Toolchain downloads, editor automation and extra integration provide little benefit for the proposed bounded browser game. |

The exact Godot and package versions available in the eventual implementation environment are unknown. Documentation from `master` or `dev` can move; recheck selected-version documentation at implementation time. Godot 4.5 web source is specifically pinned as a compatibility reference, not asserted to be the newest installed release.

## Technical architecture suitable for parallel agents

Make a small composition root own the engine, scene, lifecycle, clock, services and adapters. Put simulation rules in ordinary TypeScript modules that do not import Babylon or the DOM. Rendering reads simulation state; UI invokes the same commands as player input. Avoid global mutable bags and one enormous scene file. Do not create an elaborate ECS solely to support a modest scene.

Suggested contracts, agreed before parallel implementation:

- `GameState` with schema version, world seed, elapsed game time, player, inventory, discovered content, progression and persistent world mutations.
- `GameCommand` and typed domain events for interaction, consumption, crafting, construction, discovery, death and victory. Commands validate preconditions and resource costs atomically.
- `WorldQuery` for collision, interactable ray casts, water volumes, oxygen-safe volumes and biome/depth sampling; rendering meshes are not the save format.
- `ContentRegistry` with stable IDs for items, recipes, blueprints, fauna, biomes and objectives. No prose strings used as IDs.
- A renderer adapter with explicit `create`, `update`, and `dispose`; an audio adapter; an input action map; and an asynchronous `SaveStore`.

Give agents separate file ownership: simulation/progression, world/ecology, presentation/UI/audio, with the coordinator owning integration and build configuration. If the final coordinator may use more agents, split review/testing rather than allowing multiple writers in the same movement or state module. Require each producer to provide a runnable integration checkpoint, contract examples and known limitations. Set milestone builds: controllable swim scene; complete ugly end-to-end loop; content and visual pass; stability and playthrough. Do not integrate independent giant subsystems only at the end.

### Movement and world

Use a 60 Hz fixed simulation step with render interpolation, bounded catch-up after a suspended tab, and pause on lost focus/menu. Swimming needs camera-relative forward/strafe, explicit ascend/descend, speed/acceleration/drag, normalized diagonal input, sprint cost, configurable mouse sensitivity and clamped pitch. Start with pitch/yaw and no roll. Avoid movement based on render-frame count.

Player collision must cover the full three-dimensional path, not just clamp height against a heightfield. Use a capsule or ellipsoid against simplified collision meshes for seabed, cave walls, wrecks and constructed rooms. Babylon documents camera ellipsoid collision movement [2]; test its actual high-speed behavior before relying on it. Separate render and collision geometry. Substep rapid travel or use swept queries when required; do not assume discrete end-position overlap prevents tunneling. Test corners, cave ceilings, slopes, narrow doors, surfacing and starting inside invalid geometry. If Rapier is selected, its character controller corrects user-requested movement; buoyancy, swimming acceleration and game rules remain application responsibilities [5]. Disable walking-oriented snapping/autostep underwater unless explicitly desired.

Choose a compact world with deliberate landmark routes, caves and danger transitions. Use seeded generation for terrain dressing and authored constraints for navigable caverns, critical resources and objectives. Chunking should manage visibility, activation and disposal, not imply an infinite ocean. Use stable IDs and store mutations rather than serializing engine meshes. A small carefully composed world can support a real expedition loop without procedural repetition.

### Underwater presentation and sound

Use depth/biome-driven fog and color absorption, restrained bloom, sun shafts or inexpensive light-cone geometry, projected/animated caustic patterns, suspended particles, readable silhouettes and a clear waterline transition. These are implementation techniques, not a promise of physically accurate volumetrics. Keep visibility sufficient for navigation. Do not apply full-scene costly postprocessing until the representative scene is profiled.

Build a coherent original art language: intentional low-poly silhouettes, consistent materials, scale cues, swimming animation and distinct biome palettes. Procedural meshes are appropriate for rocks, kelp, modular wreck/habitat parts and stylized fauna, but random primitives alone are not a finished asset pipeline. Maintain an asset/license manifest; bundle every required asset. Generated or external art should enhance a working fallback, not block game completion. Use instancing for repeated vegetation/debris; Babylon thin instances reduce per-object JavaScript work but are culled as an aggregate, making spatial grouping important [9].

Audio should communicate pressure, breathing, equipment state, fauna direction and danger, with separate music/effects controls. Start/resume the audio context through the explicit Start action: browser autoplay policies generally require user interaction [10]. Provide subtitles or visual equivalents for critical cues. The Start action should also initiate pointer lock where supported; pointer lock has a user-engagement requirement [11]. Escape must release control and pause; reopening inventory must not leave movement keys stuck. Include a functional drag-to-look fallback for constrained embedded previews without weakening the real desktop control path.

### Persistence and delivery

Use IndexedDB for versioned saves, atomic snapshot transactions, validation on load, and explicit New Game/Continue. Include export/import JSON as a recovery mechanism. Save the seed and mutations, unlocks, inventory, player location, vitals and progression; normalize invalid coordinates and missing content IDs safely. Autosave after meaningful safe transitions and periodically; do not save a corrupted half-applied craft/death transition. Test reload after resource collection, crafting, construction, death and victory. Browser storage is per-origin and best-effort by default and can be cleared/evicted [12]; do not market it as cloud or permanent persistence.

A Vite production build normally writes `dist`; `vite preview` is a local build preview, not a production server [13]. Supply `npm ci`, typecheck, test, build and launch instructions, with a pinned runtime requirement. Verify static serving, relative/base paths, asset URLs and refresh on the actual host. Use HTTPS for public hosting and no runtime secrets. Packaging output is not authorization to publish to an external service.

## Verification and performance acceptance

Use unit/integration tests for meaningful rules: oxygen/refill/death, inventory capacity, transactional crafting, unlock prerequisites, resource regeneration/persistence, save schema validation, progression and win conditions. A deterministic seed and clock make these cheap. Include a bounded simulation harness that can complete the progression graph without render dependencies; it checks reachability, not fun.

Use automated browser input for Start, menus, movement, interaction, inventory/crafting, save/reload, death/recovery and the ending. Playwright supports keyboard and mouse interactions [14], but do not infer that dispatching synthetic pointer events proves actual pointer lock or enjoyable swimming. Test real user input in an authorized isolated browser environment, including pointer-lock entry/exit, diagonal/vertical swimming, collision, tool targeting and completing an ordinary unassisted expedition. Follow `/work/repos/fleet/BROWSER_RULES.md` before any browser work, including delegated tests. Screenshots and console checks alone do not establish playability. A diagnostic state API may support assertions but must not replace the normal-input playthrough.

Proposed budgets are **targets to validate**, not benchmark claims: 60 fps at 1920×1080 medium on the documented desktop test GPU/browser; a 30 fps low-quality fallback; cap device pixel ratio around 1.5–2; no repeated long freezes during normal traversal; bounded active fauna and vegetation by distance; and a compressed initial download target under roughly 30 MB. Record actual renderer, GPU, CPU, browser, resolution, DPR, quality preset and scene/route. Measure p50/p95 frame times and visible stalls during a 3–5 minute representative route after warm-up, then a longer traversal for memory/resource growth. Separate loading/compilation spikes from steady play. Headless software-rendered timings cannot substantiate consumer GPU performance. If the environment lacks a representative GPU, state that limit, provide measured software results separately, and retain budgets as unverified targets. Do not fake performance evidence or keep reducing world quality merely to pass an arbitrary CI threshold.

## Exact language for the build prompt

> Default to strict TypeScript, Vite and Babylon.js with a WebGL 2 renderer and a self-contained static desktop-browser build. Pin dependencies. Build an original, bounded, single-player underwater survival adventure with a coherent art direction. Keep simulation/progression and save data independent of rendering. Agree typed subsystem contracts and file ownership before parallel work; the coordinator owns integration and a continuously playable build. Use real three-dimensional collision and a tuned swimming controller. Bundle all necessary assets, make audio and pointer-lock entry user-initiated, support pause and save/continue, and finish one complete progression path before expanding scope. Do not require a backend, paid service, external asset CDN, WebGPU or editor-only tooling to play. You may choose Godot/GDScript only after proving that the installed toolchain exports and runs in the actual delivery environment; document that decision briefly.
>
> Done means a fresh player can start, learn controls, explore distinct spaces, gather, craft, survive escalating hazards, achieve a meaningful final objective, and see a proper ending through normal inputs; death/recovery and save/reload also work. Provide a production build and reproducible commands, meaningful rules tests, an automated interaction smoke test, evidence from an actual input-driven playthrough, and honest performance measurements with machine/browser settings. Eliminate blocking bugs, console errors, dead controls, placeholder copy and required missing assets. Do not report success from screenshots, debug-state manipulation, compilation alone or an attractive opening scene.

Largest unresolved risks: achievable content scope in the execution budget; shader/asset consistency; integration ownership; collision edge cases in caves and habitat transitions; actual preview pointer-lock permissions; and unavailable representative GPU testing. None is solved by selecting a larger engine. The strongest mitigation is an early complete game loop and successive verified polish passes.

## Sources

1. Babylon.js, engine specifications: https://www.babylonjs.com/specifications/
2. Babylon.js, camera collisions: https://doc.babylonjs.com/features/featuresDeepDive/cameras/camera_collisions
3. Three.js, project-maintained README: https://github.com/mrdoob/three.js/blob/dev/README.md
4. Three.js, `FogExp2`: https://threejs.org/docs/pages/FogExp2.html
5. Rapier, JavaScript character controller: https://rapier.rs/docs/user_guides/javascript/character_controller/
6. Godot, `CharacterBody3D` source documentation: https://github.com/godotengine/godot/blob/master/doc/classes/CharacterBody3D.xml
7. Godot, command-line documentation source: https://github.com/godotengine/godot-docs/blob/master/tutorials/editor/command_line_tutorial.rst
8. Godot 4.5, web export documentation source: https://github.com/godotengine/godot-docs/blob/4.5/tutorials/export/exporting_for_web.rst
9. Babylon.js, thin instances: https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances
10. MDN, Web Audio best practices: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
11. MDN, Pointer Lock API (including W3C specification reference): https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API
12. MDN, storage quotas and eviction: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
13. Vite, static deployment: https://vite.dev/guide/static-deploy.html
14. Playwright, input: https://playwright.dev/docs/input
