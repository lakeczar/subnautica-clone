# Original ecology graphics

Throwaway art study for Siltwake, with original procedural meshes and no downloaded assets. `ecology.js` exports `createEcology(ctx)`, returning `{ update(timeSeconds) }`. It uses the supplied scene, variant, terrain height, `V`, `C`, and shared materials. There are no helper changes or new dependencies.

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

First-pass NullEngine measurements: **16 meshes** in either variant, approximately **25.7k cel vertices** and **49k voxel vertices**, below the 60k/25-mesh module targets. Geometry spans approximately `x=-42..39`, `y=-15..25`, `z=-9..50`, plus the small documented sway/drift. No postprocessing, alpha membranes, instances, custom animation shader or per-frame vertex upload is required. The module uses the coordinator's materials, and the original art has no separate material cost.

Checked with `node --check` and a Babylon NullEngine construction pass for both variants, including update calls and finite-position checks. These are geometry checks, not browser rendering or full-game performance evidence. Some of the fine jaw bars, eye highlights and leaf spines deliberately simplify at voxel resolution. The animation suggests motion; it is not an ecological simulation, locomotion system or implemented gameplay requirement.
