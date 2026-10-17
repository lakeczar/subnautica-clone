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
