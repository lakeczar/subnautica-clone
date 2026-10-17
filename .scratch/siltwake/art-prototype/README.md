# Siltwake — original graphics study

A throwaway scene answering **which visual construction best supports this ocean adventure: voxel or cel-shaded?** Both styles use the same geography, subjects, camera presets and deterministic animation. The Original/Refined control preserves the first study and compares it with the owner-requested finer-voxel / richer-cel revision. Refinement changes geometry, surface detail and lighting together; it is not a geometry-only comparison. All scene art is original procedural geometry/materials, authored by three GPT-6.1 Sol agents at max reasoning and integrated by Astra. No external art assets are used.

This is a visual prototype. It has no survival, scanning, gathering, economy, collisions, traversable interiors or story implementation. It is not the approved foundation for the full game.

## Run

Requires Node 20.19+ or 22.12+; verified with Node 24.21.0.

```bash
git switch prototype/siltwake-art-directions
cd .scratch/siltwake/art-prototype
npm ci
npm run dev
```

Open `http://localhost:5186`. Drag to orbit and scroll to zoom. The floating bar switches art directions; the right panel selects a viewpoint. Daylight/blue-hour, Original/Refined, and pause controls are shared by both styles. The default is refined voxel, reflecting the owner’s stated preference; the final treatment remains open. Pausing also stops idle rendering; interacting with the camera redraws the scene.

Build with `npm run build`, then `npm run preview`. The prototype switcher deliberately stays in this separate study build so the owner can compare styles; it must not be promoted into a game release.

## Reproducible views

- `/?variant=voxel&view=reef`
- `/?variant=cel&view=reef`
- `view=pod`, `view=scout`, `view=island`, `view=life`
- `detail=original` restores the first study; `detail=refined` is the default
- `light=dusk` for blue hour
- `still=1` starts with animation frozen at time zero
- `clean=1` hides the study controls for screenshots

`window.artStudy.getState()` exposes read-only readiness, camera, counts and frame timing diagnostics. A CPU render-submission time is not a GPU/frame time. Frozen screenshots have no useful frame-rate sample. Software SwiftShader timings are not claims about consumer GPUs.

## What refinement changes

Voxel terrain steps shrink from 2.3 m horizontally / 0.85 m vertically to 1.15 m / 0.425 m. Prominent asset contours use smaller cells while intentional flat engineering surfaces keep their precision. This retains stepped sculpture; it does not turn the world into smooth continuous geometry. Both refined styles gain authored habitat/surface details and stronger separation between local material colors and water haze. The original modes preserve the earlier geometry for direct comparison.

More detail increases geometry and scene-generation cost. Production LOD, chunking, visibility management and hardware measurements remain future work. See the per-module notes for measured source counts.

## Source ownership

- `assets/environment.js`: terrain, arch, island shelves, mineral seams and research architecture. [Asset notes](assets/environment.md).
- `assets/vehicles.js`: refuge pod and scout. [Asset notes](assets/vehicles.md).
- `assets/ecology.js`: habitat plants and original swimmers. [Asset notes](assets/ecology.md).
- `main.js`: integration viewer, camera, atmosphere, materials and shared helper.
- [Shared art brief](ART_BRIEF.md): common interface, scale, palette and composition.

Source generators are the editable assets. Production mesh export, collision proxies, LOD, rigs, attachment slots and interaction definitions remain future work, subject to the selected art direction. The current world is a small staged scene, not a ten-hour map.
