# Compare two feasible visual directions

Parent: ../map.md
Type: prototype
Label: wayfinder:prototype
Status: claimed
Assignee: lakeczar (with Astra coordinator)
Blocked by: none

## Question

Which of two visually distinct, implementable art directions best supports this exploration game? First obtain the user's chosen comparison pair; then render the same small scene with matching geometry, camera, representative island/reef/pod/creature/vehicle subjects, and readable interaction cues. Compare actual rendering and limitations, not concept imagery passed off as engine output. The two variants are throwaway visual studies, not two production games.

## Comments

The user asked to compare voxel and cel-shaded approaches, while retaining the atmosphere of vibrant naturalism. Build those two variants with rich underwater lighting, matching scene subjects and camera presets. This chooses the comparison pair, not the winning art direction. Read the prototype skill and UI guidance before working this ticket; obey the repository browser rules.

## Original graphics pass in progress

The owner explicitly requested original graphics created by GPT-6.1 Sol at maximum reasoning, with delegated artists steered by the coordinator. Three workers now own environment/ruins, vehicles/pod, and ecology respectively. A shared art brief fixes palette, scale, geography, module interfaces and budgets; the coordinator owns integration, atmosphere, cameras and review. These graphics studies are authorized now; the complete game remains deferred.

Source is preserved on the separate `prototype/siltwake-art-directions` branch. Baseline commit: `d362ded`. Worktree: `/tmp/siltwake-art-prototype`; package: `.scratch/siltwake/art-prototype`. This is throwaway code answering the art question, not production architecture. Current graphics are generated as actual 3D meshes/materials without external art assets. Both variants share subjects and camera presets. The selection remains pending the owner's reaction to the rendered comparison.

The verification environment uses Linux Chromium with software SwiftShader. Frame times there do not establish consumer GPU or large-world performance. Earlier primitive-scene captures are baseline evidence only; the original-assets pass will replace them for this decision.

## Rendered comparison ready for the owner

The three Sol max graphics passes are integrated and published at [source commit 3826db6](https://github.com/lakeczar/subnautica-clone/tree/3826db6/.scratch/siltwake/art-prototype). The separate [prototype branch](https://github.com/lakeczar/subnautica-clone/tree/prototype/siltwake-art-directions) preserves editable generators and a runnable viewer. The coordinator reviewed actual renders, requested a less regular arch and subtler geological bands, and integrated the corrected environment with the original refuge, scout and six species.

- [Downloadable self-contained comparison](https://github.com/lakeczar/subnautica-clone/blob/pr-assets/prototype-siltwake-art-directions/art-comparison.html?raw=true)
- [Eight captures and verification data](https://github.com/lakeczar/subnautica-clone/tree/pr-assets/prototype-siltwake-art-directions)
- [Structured capture evidence](https://github.com/lakeczar/subnautica-clone/blob/pr-assets/prototype-siltwake-art-directions/capture-evidence.json)

At `3826db6`, `npm run build` passes. Production browser checks cover both styles and all four views at 1280×800, with matching cameras, daylight, and animation frozen at time zero. Style/view/light controls and pause/resume worked; paused idle rendering stopped. No console errors appeared in the inspected production scene. Geometry totals are 45 meshes in each style, 149,931 vertices for voxel and 51,855 for cel. Vertex counts are not performance measurements. The build still has a large Babylon bundle (main chunk approximately 6.79 MB, 1.49 MB gzip), and consumer GPU/full-world performance has not been tested.

The original asset pack is a shallow-refuge art study. Resource seams are decorative, biology animations are authored motion, vehicle windows are opaque, and interiors/collisions/gameplay are absent. These limitations must remain visible when judging production feasibility.

The integrated questionnaire asks the owner to choose voxel, cel developed toward vibrant naturalism, or another naturalism pass before deciding. The coordinator recommends the cel direction for readable creature and vehicle silhouettes. **No selection is recorded yet.** Preserve both variants and keep this ticket claimed until the owner's response; a recommendation is not their decision.
