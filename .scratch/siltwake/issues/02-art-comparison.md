# Compare two feasible visual directions

Parent: ../map.md
Type: prototype
Label: wayfinder:prototype
Status: resolved
Assignee: lakeczar (with Astra coordinator)
Blocked by: none

## Question

Which of two visually distinct, implementable art directions best supports this exploration game? First obtain the user's chosen comparison pair; then render the same small scene with matching geometry, camera, representative island/reef/pod/creature/vehicle subjects, and readable interaction cues. Compare actual rendering and limitations, not concept imagery passed off as engine output. The two variants are throwaway visual studies, not two production games.

## Answer

The owner selected the **richer cel-shaded direction** after comparing the original and refined studies: "Richer cell is the way to go, maybe do iterations on desgins to as you build this". In the context of the questionnaire, this selects refined cel at [source commit 20711d1](https://github.com/lakeczar/subnautica-clone/tree/20711d1/.scratch/siltwake/art-prototype). It supersedes the earlier voxel preference recorded below.

Use vibrant color, atmospheric lighting, detailed environments, readable organic silhouettes and precise mechanical features as the visual baseline. The owner invites design iterations during the future build; individual assets are not frozen by this style decision. Review those iterations in representative playable scenes as ecology, interaction and vehicle roles become real. Keep original editable graphics authored by Sol 6.1 at max reasoning under Astra's shared art direction. This resolves the visual direction, not production performance or the remaining world/story decisions. Full game construction remains the later run after review of the revised final input.

The following sections preserve the comparison history and evidence; their pending-choice language describes the state before this answer.

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

## Owner feedback — finer voxel and richer cel study

The owner prefers the voxel version substantially: "I like the voxel a lot better and it adds more detail," while liking the precision of specific assets. They asked whether cel could become more vibrant/detailed, or voxel blocks could become smaller for smoother detail. This supersedes the coordinator's earlier cel recommendation as the leading preference, but does not yet select a final treatment.

A second bounded art pass is authorized: preserve the original viewer, add finer voxel geometry with precise technology details, and enrich the cel option with actual surface/colony detail and clearer local color. Three Sol max artists continue their owned environment, vehicle and ecology modules. Coordinator-owned lighting/integration will be compared with matching cameras; changes in lighting are part of this refinement, not presented as a geometry-only comparison. No game construction is authorized by this art request.

## Refinement comparison ready

The requested revisions are integrated at [art source commit 20711d1](https://github.com/lakeczar/subnautica-clone/tree/20711d1/.scratch/siltwake/art-prototype). The viewer defaults to refined voxel and offers `detail=original|refined` alongside the existing style switch. A fifth wildlife camera makes anatomy readable. Original module geometry and transforms are preserved against `3826db6`.

- [Download the original/refined comparison](https://github.com/lakeczar/subnautica-clone/blob/pr-assets/prototype-siltwake-art-directions/refinement-comparison.html?raw=true)
- [Twenty captures and structured evidence](https://github.com/lakeczar/subnautica-clone/blob/pr-assets/prototype-siltwake-art-directions/refinement-evidence.json)

Voxel terrain steps are halved from 2.3/.85 m to 1.15/.425 m. Vehicle contour cells are 62% of their original size, while precise windows, hatches, controls and rails retain engineered surfaces. Ecology uses finer cells, raised membrane ribs, richer anatomy and clustered funnel-coral nurseries. Both refined styles add geological detail and clearer color/lighting separation.

The coordinator found that the original cel sand had downward normals, which contributed to its flat/dark appearance. Refined cel corrects the winding; the original switch deliberately preserves that historical appearance for comparison. Earlier broad normal-audit wording has been corrected in the environment notes. Refined flat-sand samples have upward normals, and all 14,400 refined voxel terrain tops match the required grid/height quantum.

At `20711d1`, the production build passes and all twenty combinations render at 1280×800. The five four-way view groups have matching cameras and frozen animation state. The Original/Refined control preserves the camera; style, detail and wildlife-view selection update the URL. No console errors appeared in the inspected production scene.

| Study | Meshes | Vertices |
| --- | ---: | ---: |
| Original voxel | 45 | 149,931 |
| Refined voxel | 49 | 387,575 |
| Original cel | 45 | 51,855 |
| Refined cel | 49 | 122,973 |

The higher geometry costs are measured; FPS on consumer hardware, world streaming and production LOD remain unmeasured. These are visual assets and authored animation, not a gameplay system. An integrated questionnaire asks whether refined voxel achieves the desired balance, whether to keep the chunkier original, or whether the richer cel now appeals more. **Voxel is the stated preference; the final treatment is still awaiting the owner's response.**
