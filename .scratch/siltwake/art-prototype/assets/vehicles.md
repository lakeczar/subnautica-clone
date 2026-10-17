# Original vehicle sculptures

`vehicles.js` exports **`createVehicles(ctx)`**. It builds two original procedural exterior assets, then returns `{ update(timeSeconds) }`. The update gives the scout a 10.5 cm idle bob and at most 0.01 radians of roll; the refuge stays fixed. No other named exports, dependencies, textures, imported meshes, or shared-helper changes are needed. Asset names below are working art labels, not proposed lore requirements.

`ctx.refined` selects the revision: **false (or omitted)** preserves the original study; **true** enables finer voxel sculpture and additional functional detail in both styles. The model positions, main shapes and animation remain the same. Original-mode geometry and transforms were compared against commit `3826db6`, including all position, normal, colour and index buffers, and match exactly.

The **Keelhouse refuge** is an octagonal pressure cabin held in a protective four-foot recovery cradle. A warm divided observation window sits above a protected manual hatch. The porch, handrails, descending ladder, pressure hoops, service cover, cable conduit, roof access and short beacon explain its use. One replaceable upper port shield is peeled back, with a dark damaged backing, exposed ribs and a loose cable; the pressure cabin and welcoming front remain intact. Broad adjustable feet meet the shared terrain. It is designed as a safe shelter with a visible accident history.

The **Cleft scout** has a swept, shallow pressure hull, a slightly offset faceted canopy and a single broad framed stern drive. Its silhouette comes from the long bow, angular shoulders and swept control surfaces. It has no spherical cabin or paired side-engine tubes. The stern opening contains a recessed dark throat, central hub and guide vanes. Small vertical trim thrusters sit within the shoulders. Skids, a tow eye, a forward survey sensor, bow light, hand grips and equipment covers suggest a practical craft for one seated pilot.

Both use porcelain pressure panels, petrol structural parts, ochre service/safety panels, dark blue glazing and restrained warm lamps. Geometry and silhouette were authored from scratch for this study.

## Scale and staging

Coordinates are metres; forward is local **−Z**, up is **+Y**. Root positions and rotations are applied only after the local geometry is built. Each asset has four merged meshes: hull, structural frame, glazing, and service/detail geometry. Roots carry identifying metadata.

| Asset | Root pivot / world position | Y rotation | Approximate local bounds |
| --- | --- | --- | --- |
| Refuge | Cabin centre, `(-13, -5, -1)` | `−0.16` radians | X `−5.05…5.05`, Y `−8.11…3.92`, Z `−5.83…3.60` |
| Scout | Central keel, `(9, -3, -4)` | `−0.50` radians | X `−3.38…3.38`, Y `−1.09…1.89`, Z `−4.17…3.18` |

The bounds cover both detail levels. Refuge bounds include its extended landing struts and ladder, not just the approximately 7.3 × 5 × 5.8 m pressure cabin. The four foot heights and ladder base query `ctx.height` at their yaw-correct world coordinates. Foot undersides sit on that terrain. Scout bounds exclude its small animation. Voxel and cel bounds differ by less than one coarse cell except for intentionally stepped appendages.

## Actual variant construction

The voxel pressure bodies and canopy are filled on a three-dimensional occupancy grid, then only exposed cell faces are emitted. Original hull cells are 0.32 m for the refuge, 0.235 m for the scout, and 0.20 m for the canopy. Convex fin/panel volumes are also rasterised, so the stepped forms affect silhouettes and shadows. Original small structural tubes are touching stair runs of cubes with internal faces retained, windows have shallow pixel-stepped contours, and the peeled shield uses explicit stepped strips.

Refined voxel cells are **0.1984 m / 0.1457 m / 0.124 m** for those same hulls/canopy: 62% of the original size. Fin and stabilizer grids are also reduced to 62%, revealing their taper more faithfully. Substantial pressure hoops, landing legs and skids use rasterised capsule unions with internal faces removed; the smaller cells now describe their circular sections as well as their path. The peeled shield has nine fine strips instead of five coarse ones. Windows, hatches, reflection planes and precision fittings use deliberately flat engineered polygons; small handrails, conduits and seams use square-section members. Finer detail therefore preserves readable handles and glass rather than covering them in tiny cubes.

The cel models use purpose-built cross-section lofts, chamfered polygon extrusions, angular control fins and six/seven-sided structural tubes. Selected flat normals retain the pressure facets instead of smoothing them into a sphere. The shared cel shader supplies light bands; only the primary hull meshes request restrained 0.018 m outlines. Dark frames and panel seams are actual geometry, with sparse opaque reflection shapes over the glazing.

Both refined styles receive the **same new functional details at the same positions**. On the refuge these include captive panel fasteners, hatch hinges, an analog pressure gauge with a needle, status lamps and manual release, roof seams and pressure-frame locks, a collared starboard service socket, restrained conduit clips, porch grip strips and a localized roof scar. On the scout they include conforming raised access covers, individual vent louvres, collared trim-thruster apertures, skid clamps, two authored canopy glints, a rear hatch edge/release, a survey-lens bezel and stern quick-disconnect fittings. These are tangible relief and recesses, not texture noise or subdivision of flat faces. They remain merged into the existing eight meshes.

## Measured geometry

Counts were obtained by constructing both variants with Babylon's `NullEngine` and summing each mesh's geometry. They exclude the rest of the scene and are not frame-rate measurements.

| Variant / detail | Refuge vertices / triangles | Scout vertices / triangles | Total vertices / triangles | Meshes |
| --- | --- | --- | --- | --- |
| Voxel / original | 27,232 / 13,616 | 15,240 / 7,620 | **42,472 / 21,236** | **8** |
| Voxel / refined | 47,178 / 23,704 | 30,612 / 15,348 | **77,790 / 39,052** | **8** |
| Cel / original | 3,102 / 1,596 | 2,056 / 1,056 | **5,158 / 2,652** | **8** |
| Cel / refined | 6,130 / 3,210 | 4,286 / 2,214 | **10,416 / 5,424** | **8** |

Validation: `node --check assets/vehicles.js`; all four variant/detail combinations construct successfully; positions, normals and vertex colours contain no non-finite values; every index is within its vertex buffer; the animation API executes at multiple times. SHA-256 comparisons of all original-mode geometry buffers and root transforms match `3826db6` in both variants. Refined counts are below the 120,000 voxel / 15,000 cel vertex and 12-mesh limits. Existing captures were inspected as local images; no browser was opened by this worker.

The supplied pod and scout cameras already face useful three-quarter views. An orbit towards local +Z reveals the scout's stern-drive internals. Keep the refuge's front window and central porch clear when staging ecology. No additional carrier was included so these two subjects remain the focus and the comparison stays below the vertex budget.

## Limits

These are exterior art sculptures: there are no traversable interiors, animations for doors/controls, collision, destruction, interaction or gameplay systems. Window warmth comes from opaque coloured surfaces under the shared lighting; there are no interior lights, transparent glass or light spill. Damage is a static replaceable-shield detail, not an opening in the refuge's pressure hull. The duct is visually recessed against an opaque backing. Small voxels and parts can intersect neighbouring panels. Precision glints and access-cover coamings sit slightly above the mathematical hull so they remain legible over the refined steps. The additional detail roughly doubles cel geometry and raises voxel geometry by 83%; it adds no draw meshes. Counts alone do not establish performance on the target browser or suitability for a full game.
