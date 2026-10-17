# Original vehicle sculptures

`vehicles.js` exports **`createVehicles(ctx)`**. It builds two original procedural exterior assets, then returns `{ update(timeSeconds) }`. The update gives the scout a 10.5 cm idle bob and at most 0.01 radians of roll; the refuge stays fixed. No other named exports, dependencies, textures, imported meshes, or shared-helper changes are needed. Asset names below are working art labels, not proposed lore requirements.

The **Keelhouse refuge** is an octagonal pressure cabin held in a protective four-foot recovery cradle. A warm divided observation window sits above a protected manual hatch. The porch, handrails, descending ladder, pressure hoops, service cover, cable conduit, roof access and short beacon explain its use. One replaceable upper port shield is peeled back, with a dark damaged backing, exposed ribs and a loose cable; the pressure cabin and welcoming front remain intact. Broad adjustable feet meet the shared terrain. It is designed as a safe shelter with a visible accident history.

The **Cleft scout** has a swept, shallow pressure hull, a slightly offset faceted canopy and a single broad framed stern drive. Its silhouette comes from the long bow, angular shoulders and swept control surfaces. It has no spherical cabin or paired side-engine tubes. The stern opening contains a recessed dark throat, central hub and guide vanes. Small vertical trim thrusters sit within the shoulders. Skids, a tow eye, a forward survey sensor, bow light, hand grips and equipment covers suggest a practical craft for one seated pilot.

Both use porcelain pressure panels, petrol structural parts, ochre service/safety panels, dark blue glazing and restrained warm lamps. Geometry and silhouette were authored from scratch for this study.

## Scale and staging

Coordinates are metres; forward is local **−Z**, up is **+Y**. Root positions and rotations are applied only after the local geometry is built. Each asset has four merged meshes: hull, structural frame, glazing, and service/detail geometry. Roots carry identifying metadata.

| Asset | Root pivot / world position | Y rotation | Approximate local bounds |
| --- | --- | --- | --- |
| Refuge | Cabin centre, `(-13, -5, -1)` | `−0.16` radians | X `−5.05…5.05`, Y `−8.10…3.92`, Z `−5.83…3.60` |
| Scout | Central keel, `(9, -3, -4)` | `−0.50` radians | X `−3.33…3.33`, Y `−1.06…1.89`, Z `−4.17…3.15` |

Refuge bounds include its extended landing struts and ladder, not just the approximately 7.3 × 5 × 5.8 m pressure cabin. The four foot heights and ladder base query `ctx.height` at their yaw-correct world coordinates. Foot undersides sit on that terrain. Scout bounds exclude its small animation. Voxel and cel bounds differ by less than one coarse cell except for intentionally stepped appendages.

## Actual variant construction

The voxel pressure bodies and canopy are filled on a three-dimensional occupancy grid, then only exposed cell faces are emitted. The refuge hull uses a 0.32 m grid and scout hull a 0.235 m grid. Convex fin/panel volumes are also rasterised, so the stepped forms affect silhouettes and shadows. Small structural tubes become touching stair runs of cubes; their internal faces are retained for this bounded study. Thin windows preserve a shallow extrusion with pixel-stepped contours. The peeled shield uses explicit stepped strips.

The cel models use purpose-built cross-section lofts, chamfered polygon extrusions, angular control fins and six/seven-sided structural tubes. Selected flat normals retain the pressure facets instead of smoothing them into a sphere. The shared cel shader supplies light bands; only the primary hull meshes request restrained 0.018 m outlines. Dark frames and panel seams are actual geometry, with sparse opaque reflection shapes over the glazing.

## Measured geometry

Counts were obtained by constructing both variants with Babylon's `NullEngine` and summing each mesh's geometry. They exclude the rest of the scene and are not frame-rate measurements.

| Variant | Refuge vertices / triangles | Scout vertices / triangles | Total vertices / triangles | Meshes |
| --- | --- | --- | --- | --- |
| Voxel | 27,232 / 13,616 | 15,240 / 7,620 | **42,472 / 21,236** | **8** |
| Cel | 3,102 / 1,596 | 2,056 / 1,056 | **5,158 / 2,652** | **8** |

Validation: `node --check assets/vehicles.js`; both variants construct successfully; positions, normals and vertex colours contain no non-finite values; the animation API executes. No browser was opened by this worker.

The supplied pod and scout cameras already face useful three-quarter views. An orbit towards local +Z reveals the scout's stern-drive internals. Keep the refuge's front window and central porch clear when staging ecology. No additional carrier was included so these two subjects remain the focus and the comparison stays below the vertex budget.

## Limits

These are exterior art sculptures: there are no traversable interiors, animations for doors/controls, collision, destruction, interaction or gameplay systems. Window warmth comes from opaque coloured surfaces under the shared lighting; there are no interior lights, transparent glass or light spill. Damage is a static replaceable-shield detail, not an opening in the refuge's pressure hull. The duct is visually recessed against an opaque backing. Small voxels and parts can intersect neighbouring panels. Counts alone do not establish performance on the target browser or suitability for a full game.
