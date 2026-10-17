# Original ecology graphics

Throwaway art study for Siltwake, with original procedural meshes and no downloaded assets. `ecology.js` exports `createEcology(ctx)`, returning `{ update(timeSeconds) }`. It uses the supplied scene, variant, optional `refined` boolean, terrain height, `V`, `C`, and shared materials. There are no helper changes or new dependencies. Omitting `refined`, or setting it to `false`, preserves the first study.

Both variants use the same habitats, poses, dimensions, palette, and animation. Cel meshes use closed, ridged membranes, elliptical section bodies, six-sided stems, authored pigment bands and selective ink. Voxel meshes rasterize those same forms into occupied cells, remove internal faces and merge coplanar faces of one pigment. These are real stepped volumes, rather than smooth models carrying a pixel texture. Membranes are opaque in both variants.

| Species | Form and habitat | Intended cue |
| --- | --- | --- |
| Compass rosette | Low, five-bladed sand plant, approximately 1.5–2.8 m tall. Bounded groups at the outer sand fringe. | Safe sandy footing and gradual reef edge; mint and warm yellow tips catch light. |
| Tuning fan | Coral-colored forked fans on a plum structural stalk, approximately 2.7–5 m tall. Attached to the arch feet and a few outer basalt outcrops. | Mineral-attached colony, with readable gaps between the fan fingers; recruits grow asymmetrically from the base. |
| Current sail | Two unequal stipes per garden, approximately 7–13 m tall, bearing broad lateral ribbon membranes. Six gardens along the outer current margins. | Current direction and shelter boundary; very small rooted sway keeps the scene alive. |
| Wind crown | Root braces, a leaning single stem and five ridged, pointed crown blades. Approximately 4–7 m tall on the exposed island. | Prevailing wind, land ecology and a soft silhouette beside the research outpost. The outpost footprint and approach remain clear. |
| Signal dart | Slender amber schooling fish with a swept dorsal sail, cream shoulder marks and a forked teal tail. Approximately 1.6–2 m long. Thirteen individuals in three merged shoals. | Sheltered schools collect beside the reef and vegetation instead of filling every open space. |
| Veiljaw | One narrow-bodied filter feeder, approximately 8 m from rostrum to tail, with three sail crests, paired swept pectorals and a deeply divided tail. | An open underslung jaw, spaced cream rakers and a sparse feeding plume suggest filtering rather than predation. Coral is concentrated on the jaw and gill slits; amber rims identify the leading fin edges. |

Coordinates are metres. The seafloor is usually around `y=-13`, the waterline is `y=10`, and every rooted colony queries `ctx.height`. The Veiljaw's root begins around `(16,1.25,10.5)`, in the reef camera's midground, and drifts less than two metres. Pectoral hinges sit at local `(0.65,-0.15,±0.46)` and the tail hinge at `(-2.30,0,0)`. The body faces local `+x`. Each current garden uses a seafloor pivot. Fish shoals use three separate pivots, so all moving geometry remains rigid and inexpensive in both constructions.

Original-study NullEngine measurements: **16 meshes** in either variant, **25,672 cel vertices** and **48,932 voxel vertices**. Geometry spans approximately `x=-42..39`, `y=-15..25`, `z=-9..50`, plus the small documented sway/drift. No postprocessing, alpha membranes, instances, custom animation shader or per-frame vertex upload is required. The module uses the coordinator's materials, and the original art has no separate material cost.

Checked with `node --check` and a Babylon NullEngine construction pass for both variants, including update calls and finite-position checks. These are geometry checks, not browser rendering or full-game performance evidence. Some of the fine jaw bars, eye highlights and leaf spines deliberately simplify at voxel resolution. The animation suggests motion; it is not an ecological simulation, locomotion system or implemented gameplay requirement.

## Refined study

`ctx.refined = true` adds smaller occupied-grid cells, curved membrane profiles, raised leaf ribs, attached amber buoyancy bladders on the current sails, more expressive local pigments, and anatomical detail on the Veiljaw. Its cheek ridge follows the open filtering basket; gill membranes and long pectoral rays distinguish the living body from a smooth shell. The refinement preserves the original layout and animation, with the same additional subjects at the same positions and scales in both styles.

Eighteen **rimmed funnels** form six small nursery patches around existing reef and kelp bases: `(-24,6)`, `(-26,12)`, `(-7.4,14)`, `(19.2,15.5)`, `(25,22)` and `(29,1.8)` in `x,z`. Each colony has three unequal, lobed, opaque cups with real recessed mouths, warm lip pigment and low shelter leaves on one flank. Larger cups stand approximately 1.55 m tall and 1.34 m across. The patches preserve the central arch opening and the pod/scout foreground. Plum pigment belongs to selected funnel colonies, coral to the others; the additional color does not come from randomly scattered objects.

| Occupied-grid subject | Original cell | Refined cell |
| --- | ---: | ---: |
| Compass rosette | 0.290 m | 0.186 m |
| Tuning fan | 0.310 m | 0.192 m |
| Current sail | 0.340 m | 0.211 m |
| Wind crown | 0.460 m | 0.304 m |
| Signal dart | 0.205 m | 0.127 m |
| Veiljaw body, fins and tail | 0.285 m | 0.165 m |
| New rimmed funnel | — | 0.211 m |

The finest treatment goes to the prominent animal and membrane silhouettes. Peripheral sand plants and island crowns use slightly larger cells to stay within the revised budget. Small schooling fish keep their economical original body sections; their finer grid, curved fins and flank marks provide the additional close detail.

| Construction | Meshes | Vertices | Triangles |
| --- | ---: | ---: | ---: |
| Original cel | 16 | 25,672 | 12,984 |
| Original voxel | 16 | 48,932 | 24,466 |
| Refined cel | 17 | 68,576 | 35,696 |
| Refined voxel | 17 | 119,576 | 59,788 |

All four combinations pass syntax, finite position/normal/color, finite world-transform and update checks at 0, 1, 10, 60 and 600 seconds. The original paths match the committed `3826db6` geometry, colors, indices and sampled transforms by SHA-256 comparison. The refined pass remains below the requested 70k cel / 120k voxel vertex limits and 23 meshes, but the voxel margin is small. These counts describe this study; the coordinator's browser review owns visual validation and scene performance evidence.
