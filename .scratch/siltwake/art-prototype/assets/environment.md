# Original Siltwake environment study

This module is a throwaway rendered art comparison, created procedurally from scratch. It is not production world generation or a playable-game implementation. No downloaded models, textures, or third-party geometry are used.

Exports: `terrainHeight(x, z)` and `createEnvironment(ctx)`. The latter returns `{}` because these assets are static. It uses the existing Babylon dependency and the shared `scene`, `variant`, `C`, `toon`, and `voxelMaterial` context fields. No helper additions are required.

## Assets and cues

- An open pale sand basin with three restrained ripple pockets. The clear foreground supports vehicle and animal silhouettes.
- A single eroded basalt arch centered near `(6, -6, 18)`. Separate authored outer/inner profiles give it an undercut western pillar, lower eastern shoulder, and shifted crown around an actual passage. Closely related basalt colors suggest strata without high-contrast stripes.
- Six bedded basalt outcrops, including the two arch buttresses and a tall island ridge fin. Only three exposed seams carry mineral color, so resources have a learnable geological context.
- Six contour-following island shelves, including a broad pale intertidal bench at `y=10.25`, broken by four erosion gaps and several exposed basalt patches. The higher shelves are dark resistant beds with small eroded gaps. They break up the smooth shared hill without moving the height field used by ecology.
- An original stilted research archive at `(-27, terrainHeight(-27,35)+4.35, 35)`. It has an asymmetric folded shell, a forward research window, open damaged airlock, exposed braces, exterior stair, ochre hazard marks, a broken collecting dish, and a dropped wall panel on the shoreward slope. The main room is approximately 10 by 6.6 metres; its central floor is about 27 metres above scene zero. Doorways and rails use human scale.

All meshes use world coordinates and identity pivots. Terrain bounds are `x=-69..69, z=-48..90`; the tallest detail is the survey mast, approximately `y=36.4`. The underwater arch spans roughly `x=-5..17, y=-13..1.4, z=15.3..20.7`. There are no transform roots to reposition independently.

## Variant construction

Voxel terrain and outcrops emit only exposed height-column faces. The arch uses an occupied grid and emits external cell faces, preserving its opening without internal box faces. Terrain steps are 2.3 metres in plan and 0.85 vertically; hero-rock cells are 0.78 metres. The station roof and inclined braces are stepped in the voxel version.

Cel terrain uses smooth normals over a 72 by 72 grid. The arch is a purpose-built bevelled arched extrusion with 30 segments and six front/back bands. Outcrops have irregular seven-sided footprints with authored ledges and tilted crowns. Only the arch and station shell receive restrained outlines. Colors are stored on vertices for both materials; there is no shader-only substitution for the geometry difference.

## Verification and limits

`node --check assets/environment.js` passed. A Babylon `NullEngine` instantiation of both variants found finite position buffers, no zero/reversed vertex normals, and these exact geometry totals (summed over mesh vertex buffers):

| Variant | Merged meshes | Vertices | Triangles |
| --- | ---: | ---: | ---: |
| Voxel | 10 | 55,477 | 27,650 |
| Cel | 10 | 16,727 | 16,066 |

Measured bounds were `[-69,-20,-48]..[69,36.60,90]` for voxel and `[-69,-16.49,-48]..[69,36.49,90]` for cel. Browser visual verification remains with the coordinator.

The terrain is an art-directed small scene, not streamed terrain, a collision model, resource generation, or a performance proof for the eventual game. Mineral seams are decorative cues; there are no resource interactions. The visual shelves and outcrops sit above the common height field, so collision and ecology attachment would require a richer surface query in a production implementation. The research stair and ruined interior establish silhouette and story cues; they are not walkable facilities.
