# Content and asset manifest

Foundation runtime identifiers and asset metadata live in `src/content/registry.ts`, authored by Sol 6.1 max at `8d72dd2` and awaiting independent acceptance. This file indexes ownership, provenance and acceptance; it does not duplicate recipe quantities or canon prose.

| Group | Authoritative source | Production status / evidence |
| --- | --- | --- |
| Regions, source habitats, eight materials | [World](../WORLD_PROGRESSION.md), [integration](../EXPEDITION_INTEGRATION.md) | Stable roster IDs seeded; only foundation pod/reef/island geometry is active. ECO-01 source/recipe proposal remains provisional |
| Six piloted hulls and Bobbin | [Fleet](../FLEET_AND_SURVIVAL.md) | Stable roster IDs seeded; functional assets/interiors/roles pending |
| C01–C15 and scene history | [Story](../STORY_DESIGN.md); labelled canon appendix for assigned workers | Design only; spoilers excluded from this index |
| Richer-cel reference assets | `20711d1:.scratch/siltwake/art-prototype/` on art branch | Original editable Sol geometry; reference, not production architecture |
| Production foundation environment/ecology/UI | [Graphics contract](../GRAPHICS_PIPELINE.md); `src/render/`, `src/ui/`, `public/siltwake.svg` | Original Sol procedural terrain, reef ribs, pod, decorative marine life, shaders and SVG identity. Metadata in `ASSETS`; FND-01 review pending. Island/reef density remains early art |
| Functional fleet, campaign assets and audio | [Graphics contract](../GRAPHICS_PIPELINE.md) | Pending original Sol 6.1 max construction and runtime review |

Each production entry must identify stable ID, source/generator, dimensions/pivot, material slots, semantic/interaction role, habitat/capability association, license/provenance and review batch. Bundle all required runtime content. Record generated local audio sources alongside geometry; no remote asset or live-model dependency.
