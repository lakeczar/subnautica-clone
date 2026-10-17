# Original Siltwake environment study

This module is a throwaway rendered art comparison, created procedurally from scratch. It is not production world generation or a playable-game implementation. No downloaded models, textures, or third-party geometry are used.

Exports: `terrainHeight(x, z)` and `createEnvironment(ctx)`. The latter returns `{}` because these assets are static. It uses the existing Babylon dependency and the shared `scene`, `variant`, `refined`, `C`, `toon`, and `voxelMaterial` context fields. `ctx.refined` defaults to false when omitted. No helper additions are required.

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

## Optional refinement

`ctx.refined: false` reproduces the first study's positions, normals, vertex colors, indices, mesh names and counts exactly. `true` adds the second art pass to either style at the same world positions:

- Voxel terrain uses exactly **1.15 metre plan cells / 0.425 metre height quantum**, with cell centres sampled from the unchanged shared height field. The arch uses 0.39 metre external cells; outcrops use 0.45 metre cells / 0.325 metre height steps. Smaller cells reveal the existing authored curvature and undercuts. The folded station roof and inclined structure also have finer steps.
- Refined cel terrain uses a 120 by 120 grid and distinct sand/gravel/basalt pigment pockets. Its outcrops gain two smaller resistant ledges. The arch has 48 profile segments and eight bevel bands.
- Both refined styles gain six low sediment lenses with 42 small authored talus stones, shallow physical sand ripple relief, six narrow runoff ribs and four short resistant beds on the island, four patches of raised arch bedding with two fissures, and stronger but sparse mineral accents. These additions are concentrated beside the existing habitats and leave the vehicle pads clear.
- The archive gains lower panel seams and fasteners, a side service vent, airlock controls, roof vent rhythm and two restrained glass reflection planes. Precise engineered rails and flat panels remain precise.

The refined ripple crests rise about 7 centimetres above their supporting surface; they use close sand values. The geology remains decorative. Refinement adds three merged meshes and no material or dependency.

## Verification and limits

`node --check assets/environment.js` passed. All four variant/refinement combinations were instantiated with Babylon `NullEngine`; position buffers are finite, normal buffers are nonzero, and triangle indices agree with their stored normals. Exact totals are summed over mesh vertex buffers:

| Variant | Detail | Merged meshes | Vertices | Triangles |
| --- | --- | ---: | ---: | ---: |
| Voxel | Original | 10 | 55,477 | 27,650 |
| Cel | Original | 10 | 16,727 | 16,066 |
| Voxel | Refined | 13 | 186,051 | 92,836 |
| Cel | Refined | 13 | 39,683 | 41,308 |

**Correction to the first audit:** its broad “no reversed vertex normals” statement checked agreement with triangle indices, which missed the direct cel terrain grid's downward orientation. That historical cel lighting error is deliberately retained in original mode for the requested unchanged comparison. Refined cel reverses the grid winding. Three representative sand samples now have positive normal Y values of `0.9740`, `0.9903`, and `0.9702`; near `(0,-11.67,0.3)` the normal is `(-0.2253,+0.9740,-0.0223)`. This fixes how sunlight reaches the sand and island as well as revealing the added detail.

The original geometry/color/index buffer SHA-256 hashes match the pre-refinement baseline: voxel `0ee4de27b5838d3d73a9290845e2581de03af76fea88720aee6af204a72a95ba`; cel `8df60b8cc6ca2e939f67a3ff8e19ecd607b0355f197cb997e9495a5200e22197`.

Measured bounds are `[-69,-20,-48]..[69,36.60,90]` for original voxel, `[-69,-20,-48]..[69,36.49,90]` for refined voxel, and `[-69,-16.49,-48]..[69,36.49,90]` for both cel modes. Browser visual verification remains with the coordinator. These geometry costs are not frame-rate claims.

The terrain is an art-directed small scene, not streamed terrain, a collision model, resource generation, or a performance proof for the eventual game. Mineral seams are decorative cues; there are no resource interactions. The visual shelves and outcrops sit above the common height field, so collision and ecology attachment would require a richer surface query in a production implementation. The research stair and ruined interior establish silhouette and story cues; they are not walkable facilities.
