# Siltwake original graphics study — shared contract

This is an explicitly authorized throwaway visual study, not game construction. Create original, usable procedural 3D graphics for an alien-ocean discovery adventure. Compare two genuinely different constructions of the SAME subjects: `voxel` (intentional stepped sculpture) and `cel` (authored curved/faceted silhouettes, banded color and restrained ink). Both retain vibrant naturalism, rich teal distance, warm sanctuary light, and believable biology/engineering. Avoid copying Subnautica models or creature silhouettes. No downloaded assets, no dependencies, no raster mockup substituted for engine rendering.

## Ownership

Worktree: `/tmp/siltwake-art-prototype`; package: `.scratch/siltwake/art-prototype`.
Coordinator owns main.js, dependencies, scene cameras, lights, water, shared helper, UI, browser, commits and integration.
Environment worker: `assets/environment.js` and `assets/environment.md` only.
Vehicles worker: `assets/vehicles.js` and `assets/vehicles.md` only.
Ecology worker: `assets/ecology.js` and `assets/ecology.md` only.
No branch switching, commits, package installs, or editing another worker's files. Shared working tree; use absolute workdir. Read the existing main.js to understand helper semantics. No browser work by workers; coordinator does screenshots. If browser becomes necessary first read /work/repos/fleet/BROWSER_RULES.md and docs/BROWSER_RULES.md: isolated Linux only, verify actual process host, prefer T3 preview, preserve user tabs/cursor, close only owned resources.

## Module interface

ES modules; named exports `createEnvironment(ctx)`, `createVehicles(ctx)`, `createEcology(ctx)` respectively. Environment also exports `terrainHeight(x,z)` matching the shared geography below. Each create returns `{update(timeSeconds)}` if animated, otherwise `{}`. Functions may import Babylon symbols from already installed @babylonjs/core. No top-level scene instances. Each creation receives:

`{scene, variant, Sculpture, colors, V, C, seeded, height, paint, toon, voxelMaterial}`.

`V(x,y,z)` is Vector3, `C(hex)` is Color3, `seeded(seed)` returns deterministic random function. `height` references terrainHeight. `paint(mesh,hex,outline=true)` gives cel shader + vertex colors; voxel calls must set vertex colors themselves or use Sculpture. `Sculpture(name,step)` exposes `.box([x,y,z],[w,h,d],hex)`, `.cube(...)`, `.ellipsoid(position,radii,hex,step?)`, `.branch(points,radius,hex)`, `.finish(outline=true)` returning TransformNode. IMPORTANT: set the returned root transforms AFTER finish; geometry is local. Helper merges by sculpture; use separate sculptures for articulated groups. Arrays are coordinates; all dimensions world units/metres (human approximately 1.8). You may make purpose-built vertex meshes for designed silhouettes; do not settle for a stack of spheres. Any additions needed to shared helper: message coordinator.

## Geography and staging

Waterline y=10; seabed around y=-13. Hero reef arch near (6,-10,18), width 18 and height 11. Pod center (-13,-5,-1), scout center (9,-3,-4). Keep front z=-25..0 and central sight line open. Island rises at x=-29,z=36 to y=20..30; research outpost near (-27,height(-27,35),35). Scene bounds x=-69..69, z=-48..90. Shared height field:

`-13 + sin(x*.16)*1.2 + cos(z*.15)*1.1 + 34*exp(-((x+29)**2/170+(z-36)**2/280)) + 17*exp(-((x+39)**2/80+(z-46)**2/110)) + 3*exp(-((x-20)**2/220+(z-12)**2/180))`

Cameras: reef from [29,3,-45] at [-1,-3,9]; pod from [4,0,-22] at [-13,-4.5,-1]; scout from [29,2,0] at [9,-3,-3]; island from [35,45,-42] at [-19,6,24]. Coordinator may adjust views after integration, equally for both variants.

## Common visual language

Environment: blue basalt, mineral seams, pale rippled sand, eroded shelves and island strata; visible geological logic. Technology: porcelain/off-white pressure hulls, petrol structural metal, burnt orange/ochre safety panels, warm cream lights, deep blue glass. Ecology: asymmetrical/branching and ribbon forms, a few coral/amber/green accents against teal; bounded species niches, clear empty water between clusters. Strong silhouette at 100px, material hierarchy at close range. Three detail scales: primary mass, functional structure, sparse small details. The pod must read as a safe damaged shelter; scout as compact maneuverability; a utility vessel if included as carrying capacity.

## Practical limits and deliverables

Aim under 90,000 vertices/environment, 65,000 vehicles and 60,000 ecology in either variant, and fewer than 25 merged meshes per module. Minimize transparent surfaces and outlines; no postprocess. This viewer is verified on slow software SwiftShader, so avoid dense repeated primitives and internal voxel faces where practical. Do not overinvest in optimization beyond achieving a useful comparison. Add module README describing original assets, scale/pivots, variants, intended gameplay cues, and honest limits. Return exact exports, bounds, mesh/vertex estimates, any helper needs and integration advice. Syntax-check your file. Work in a bounded first pass, then wait for coordinator art direction.
