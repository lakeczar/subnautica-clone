# Revision two — finer voxels and richer illustrated detail

The owner prefers voxel strongly because it appears more detailed, while liking the precision of individual cel assets. They ask for smaller voxel blocks/smoother detail and/or a more vibrant, detailed cel version. Do not treat our earlier cel recommendation as their decision. Keep these original 3D studies small; no game construction.

Existing source is safely committed at 3826db6. Add a `ctx.refined` boolean to your module's behavior. `false` MUST preserve the previous study; `true` enables this revision for BOTH voxel and cel. Coordinator owns URL `detail=original|refined`, shaders, lighting, cameras, viewer UI and evidence. No worker edits outside its existing assigned assets/*.js + *.md files; no commits, branch switches or installs.

## Shared art intent

Keep recognizable stepped voxel sculpture but use roughly half-size cells at prominent silhouettes. Preserve precise flat surfaces on technology: hatches, glazing, rails and instruments may stay deliberately engineered. Smaller blocks must reveal actual shape information, not merely subdivide identical flat faces. Use authored smaller-scale details that survive a nearby camera. Do not make a muddy noisy texture.

Cel needs tangible surface/life detail as well as color: layered terrain microrelief, local coral/plant colonies, purposeful structural detailing. All new scene content has the same position and scale in both refined variants. Use stronger local coral/amber/lime accents against petrol basalt, pale sand and teal distance. Coordinator will reduce the uniform cyan wash, strengthen local color/lighting separation and add gentle material highlights. Keep open water and hero silhouettes readable. The scene remains a shallow refuge: wonder first, with warm safety.

## Module instructions

Environment: refined voxel terrain grid EXACTLY 1.15 m horizontal, .425 m height quantum (original 2.3/.85), same bounds and height function; coordinator's contact shades use this. Halve prominent arch/outcrop cell steps where feasible. Refined cel needs layered surface relief, patchy sand/rock distinctions, smaller ledges/pebbles/mineral structure rather than an empty smooth sheet. Improve the bland island surface too, preserve station/route. Aim <230k vertices voxel and <65k cel; <=16 meshes. Keep decorative minerals honest.

Vehicles: refine voxel shell/curved element steps to ~.55–.65 original size without quantizing away precise seams and handles. Add a small number of useful close-up details shared with refined cel (pressure seam rhythm, hatch controls, service ports, canopy reflection planes, vents). Preserve strong hull silhouette and current shapes/positions. Aim <120k voxel vertices / <15k cel, <=12 meshes.

Ecology: refine occupied-grid steps to ~.6 original, especially larger swimmer and readable plant membranes. Add carefully clustered small life around existing colony bases, ridges/spines/vein detail with a few brighter species accents. Refined cel should feel much richer than empty sand and sparse thin stems; new density should form habitat patches, not evenly sprinkled clutter. Aim <120k voxel vertices / <70k cel, <=23 meshes. Preserve clear front pod/scout silhouettes.

Use custom merged geometry and cull internal voxel faces as before. Existing outlines/animation remain modest. Syntax and finite geometry/count checks for original+refined / voxel+cel. Report actual costs and compromises, not FPS guesses. Send first pass when ready for coordinator screenshots. No browser work; if needed, first read /work/repos/fleet/BROWSER_RULES.md and docs/BROWSER_RULES.md, isolated Linux only with verified browser process host, T3 preview preferred, preserve user/shared resources and cursor, close owned resources only.
